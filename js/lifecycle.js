/**
 * InvoiceCraft — document lifecycle record builders (pure).
 *
 * Pure factories for the two structural lifecycle operations:
 *  - conversion: quotation/estimate/proforma -> invoice, preserving the
 *    source record and writing durable links on both sides.
 *  - duplication: a fresh same-type record with fresh number/status and
 *    cleared links.
 *
 * No IndexedDB, no DOM: the shell/db layer writes the returned records in a
 * single transaction.
 */

/** Type-default statuses (mirrors the editor's document type registry). */
const TYPE_DEFAULT_STATUS = {
  invoice: 'pending',
  quotation: 'sent',
  estimate: 'draft',
  proforma: 'pending'
};

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function clone(value) {
  if (Array.isArray(value)) return value.map(item => clone(item));
  if (isPlainObject(value)) {
    const out = {};
    for (const key of Object.keys(value)) out[key] = clone(value[key]);
    return out;
  }
  return value;
}

function localDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function normalizeNow(now) {
  const ms = (now instanceof Date) ? now.getTime() : Number(now);
  const date = Number.isFinite(ms) ? new Date(ms) : new Date();
  return isNaN(date.getTime()) ? new Date() : date;
}

function readDocType(source) {
  const t = source && source.meta && source.meta.docType;
  return (typeof t === 'string' && TYPE_DEFAULT_STATUS[t]) ? t : 'invoice';
}

// ============================================================================
// 1. CONVERSION (quotation / estimate / proforma -> invoice)
// ============================================================================
/**
 * Builds the record pair for converting a saved document into an invoice.
 *
 * Returns { sourceUpdate, invoice }:
 *  - `invoice` is a brand-new record: caller-supplied `inv_` id and invoice
 *    number, docType invoice, today's issue date, +14 day due date, status
 *    pending, durable source links, preserved currency/template/logo/items/
 *    taxes/client/payment/notes, signature cleared.
 *  - `sourceUpdate` is a shallow-preserved copy of the source with only the
 *    conversion fields changed (convertedToId/Number/At) plus a status bump
 *    to 'accepted' when it was draft/sent. Financial fields are untouched.
 *
 * Throws when the source is already converted or when id/number are missing.
 */
export function buildConversionRecords({ source, invoiceId, invoiceNumber, now, company } = {}) {
  if (!isPlainObject(source)) throw new Error('Conversion requires a persisted source document.');
  if (!invoiceId || typeof invoiceId !== 'string') throw new Error('Conversion requires a new invoice id.');
  if (!invoiceNumber || typeof invoiceNumber !== 'string') throw new Error('Conversion requires a new invoice number.');
  if (source.convertedToId) {
    throw new Error('This document has already been converted; refusing to convert it again.');
  }

  const at = normalizeNow(now);
  const sourceMeta = isPlainObject(source.meta) ? source.meta : {};
  const docType = readDocType(source);
  const oldStatus = sourceMeta.status || source.status;
  const bumpedStatus = (oldStatus === 'draft' || oldStatus === 'sent') ? 'accepted' : (oldStatus || TYPE_DEFAULT_STATUS[docType]);

  // ---- Source update: only conversion fields + status bump -------------
  const sourceUpdate = Object.assign({}, source);
  sourceUpdate.meta = Object.assign({}, sourceMeta, { status: bumpedStatus });
  sourceUpdate.convertedToId = invoiceId;
  sourceUpdate.convertedToNumber = invoiceNumber;
  sourceUpdate.convertedAt = at.toISOString();
  if (bumpedStatus !== oldStatus || !source.status) {
    // Mirror canonical status at top level when db v3 stamps it; keep the
    // source's stored status otherwise.
    sourceUpdate.status = bumpedStatus;
  } else if (isPlainObject(source) && source.status === undefined) {
    delete sourceUpdate.status;
  }

  // ---- New invoice record ----------------------------------------------
  const invoiceDate = localDateString(at);
  const dueDate = localDateString(new Date(at.getTime() + 14 * 24 * 60 * 60 * 1000));

  const invoice = {
    id: invoiceId,
    template: clone(source.template !== undefined ? source.template : 'modern-swiss'),
    font: clone(source.font !== undefined ? source.font : "'Inter', sans-serif"),
    accentColor: clone(source.accentColor !== undefined ? source.accentColor : '#2563eb'),
    logo: clone(isPlainObject(source.logo) ? source.logo : { dataUri: null, width: 180, align: 'left', layout: 'left' }),
    meta: Object.assign({}, clone(sourceMeta), {
      docType: 'invoice',
      title: 'INVOICE',
      number: invoiceNumber,
      date: invoiceDate,
      dueDate: dueDate,
      status: 'pending',
      showSignature: false
    }),
    sender: clone(isPlainObject(source.sender) ? source.sender : {}),
    client: clone(isPlainObject(source.client) ? source.client : {}),
    items: Array.isArray(source.items) ? clone(source.items) : [],
    taxes: Array.isArray(source.taxes) ? clone(source.taxes) : [],
    payment: clone(source.payment !== undefined ? source.payment : ''),
    notes: clone(source.notes !== undefined ? source.notes : ''),
    issueDate: invoiceDate,
    dueDate: dueDate,
    status: 'pending',
    sourceDocId: source.id,
    sourceDocNumber: sourceMeta.number || ''
  };

  // Durable link back is part of the conversion contract; cleared signature
  // is restated explicitly in case the key was absent on the source.
  invoice.meta.showSignature = false;

  if (isPlainObject(company) && company.id) {
    invoice.companyId = company.id;
    const senderSnapshot = {};
    for (const field of ['name', 'email', 'phone', 'address', 'taxId']) {
      if (typeof company[field] === 'string') senderSnapshot[field] = company[field];
    }
    if (Object.keys(senderSnapshot).length > 0) {
      invoice.sender = Object.assign({}, invoice.sender, senderSnapshot);
    }
    if (typeof company.payment === 'string' && !invoice.payment) {
      invoice.payment = company.payment;
    }
  }

  return { sourceUpdate, invoice };
}

// ============================================================================
// 2. DUPLICATION
// ============================================================================
/**
 * Builds a fresh duplicate of any saved document.
 * Fresh id/number, status reset to the type default, conversion/source links
 * cleared, `duplicatedFromId` set, and never a '-COPY' suffix on the number.
 * Dates are restamped from `now` (same normalization as conversion): issue
 * date is today's local calendar date and the due date is now + 14 days, so
 * the duplicate never inherits the source's stale dates.
 */
export function buildDuplicateRecord({ source, id, number, now } = {}) {
  if (!isPlainObject(source)) throw new Error('Duplicate requires a persisted source document.');
  if (!id || typeof id !== 'string') throw new Error('Duplicate requires a new document id.');
  if (!number || typeof number !== 'string') throw new Error('Duplicate requires a new document number.');

  const at = normalizeNow(now);
  const invoiceDate = localDateString(at);
  const dueDate = localDateString(new Date(at.getTime() + 14 * 24 * 60 * 60 * 1000));
  const sourceMeta = isPlainObject(source.meta) ? source.meta : {};
  const docType = readDocType(source);
  const defaultStatus = TYPE_DEFAULT_STATUS[docType];

  const duplicate = {
    id,
    template: clone(source.template !== undefined ? source.template : 'modern-swiss'),
    font: clone(source.font !== undefined ? source.font : "'Inter', sans-serif"),
    accentColor: clone(source.accentColor !== undefined ? source.accentColor : '#2563eb'),
    logo: clone(isPlainObject(source.logo) ? source.logo : { dataUri: null, width: 180, align: 'left', layout: 'left' }),
    meta: Object.assign({}, clone(sourceMeta), {
      docType,
      status: defaultStatus,
      number,
      date: invoiceDate,
      dueDate: dueDate
    }),
    sender: clone(isPlainObject(source.sender) ? source.sender : {}),
    client: clone(isPlainObject(source.client) ? source.client : {}),
    items: Array.isArray(source.items) ? clone(source.items) : [],
    taxes: Array.isArray(source.taxes) ? clone(source.taxes) : [],
    payment: clone(source.payment !== undefined ? source.payment : ''),
    notes: clone(source.notes !== undefined ? source.notes : ''),
    issueDate: invoiceDate,
    dueDate: dueDate,
    status: defaultStatus,
    duplicatedFromId: source.id
  };

  // Explicitly clear conversion/source links: a duplicate is a standalone
  // fresh record in both directions of the lifecycle graph.
  for (const key of ['convertedToId', 'convertedToNumber', 'convertedAt', 'sourceDocId', 'sourceDocNumber', 'duplicatedFrom']) {
    delete duplicate[key];
  }

  return duplicate;
}
