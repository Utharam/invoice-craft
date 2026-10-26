/**
 * InvoiceCraft — pure reporting engine.
 *
 * Normalization of saved documents into report rows, in-memory filtering and
 * aggregation, per-home stats, and CSV export.
 *
 * Iron rules:
 * - Reports NEVER sum across currencies: every money aggregation lives inside
 *   a per-currency bucket keyed by canonical currencyKey.
 * - Revenue = invoices only; drafts are excluded from all financial totals
 *   (but still counted in the document inventory).
 * - Quotes / estimates / proformas are pipeline, not revenue; paid proformas
 *   are reported separately.
 * - Conversion counts come from durable links (convertedToId / sourceDocId),
 *   never from PO text.
 * - Tax uses the shared calculator (js/calc.js) so the report and the sheet
 *   always agree.
 */

import { normalizeCurrency, calculateTotals, splitTaxLegs } from './calc.js';

// ============================================================================
// 1. STATUS / DOC LABELS
// ============================================================================
const STATUS_LABELS = {
  draft: 'Draft',
  pending: 'Payment Pending',
  paid: 'Paid',
  sent: 'Sent to Client',
  accepted: 'Accepted',
  declined: 'Declined',
  expired: 'Expired'
};

/** Open-pipeline statuses per document type ('paid' proforma excluded). */
const PIPELINE_STATUSES = new Set(['sent', 'accepted', 'pending']);

function statusLabel(docType, status) {
  if (status === 'paid' && docType === 'proforma') return 'Paid / Advanced';
  if (Object.prototype.hasOwnProperty.call(STATUS_LABELS, status)) {
    return STATUS_LABELS[status];
  }
  return String(status).replace(/(^|[\s-])([a-z])/g, (m, p, ch) => (p ? ' ' : '') + ch.toUpperCase()).trim() || 'Unknown';
}

const DOC_TYPE_LABELS = {
  invoice: 'Invoice',
  quotation: 'Quotation',
  estimate: 'Estimate',
  proforma: 'Proforma'
};

// ============================================================================
// 2. HELPERS
// ============================================================================
function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function str(v) {
  if (v === null || v === undefined) return '';
  return String(v);
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normalizeNowMs(now) {
  if (now instanceof Date) return now.getTime();
  const n = Number(now);
  return Number.isFinite(n) ? n : Date.now();
}

function cloneBuckets() {
  return {
    documents: 0,
    invoices: 0,
    drafts: 0,
    revenue: 0,
    subtotal: 0,
    taxTotal: 0,
    paid: 0,
    outstanding: 0,
    pipeline: 0,
    pipelineCount: 0,
    pipelineDocuments: []
  };
}

function addToBucket(map, row, fields) {
  const key = row.currencyKey || '';
  const symbol = row.currencySymbol || '';
  const numberFormat = row.numberFormat || 'international';
  let bucket = map.get(key);
  if (!bucket) {
    bucket = { currencyKey: key, symbol, numberFormat, ...cloneBuckets() };
    map.set(key, bucket);
  }
  if (fields) fields(bucket, row);
}

function sortByIssueDateDesc(rows) {
  return [...rows].sort((a, b) => {
    const d = str(b.issueDate).localeCompare(str(a.issueDate));
    if (d !== 0) return d;
    const u = num(b.updatedAt) - num(a.updatedAt);
    if (u !== 0) return u;
    const n = str(b.number).localeCompare(str(a.number));
    if (n !== 0) return n;
    return str(b.id).localeCompare(str(a.id));
  });
}

/** Reads a scalar from the record, preferring top-level then meta. */
function pick(inv, field) {
  if (!isPlainObject(inv)) return '';
  if (inv[field] !== undefined && inv[field] !== null) return inv[field];
  if (isPlainObject(inv.meta)) {
    const v = inv.meta[field];
    if (v !== undefined && v !== null) return v;
  }
  return '';
}

/** Rounds at the currency's minor-unit precision (half-up on the decimals). */
function roundAt(value, decimals) {
  const f = Math.pow(10, decimals);
  return Math.round(value * f) / f;
}

/**
 * Reconciles the per-rate tax breakdown against a frozen taxTotal (H6):
 * per-rate tax is scaled proportionally onto the computed taxable values and
 * the rounding residual lands on the largest rate, so sum(taxRates[].tax)
 * always equals the frozen tax the Dashboard shows. When the computed tax is
 * zero but the frozen tax is positive, a single 0-rate row carries it.
 */
function reconcileFrozenTaxRates(rateBreakdown, frozenTaxTotal, frozenSubtotal, decimals) {
  const computedTaxSum = rateBreakdown.reduce((s, r) => s + r.tax, 0);
  if (!(computedTaxSum > 0)) {
    if (frozenTaxTotal > 0) {
      return [{ rate: 0, taxable: frozenSubtotal, tax: frozenTaxTotal }];
    }
    return rateBreakdown.map(r => ({ rate: r.rate, taxable: r.taxable, tax: 0 }));
  }
  const scale = frozenTaxTotal / computedTaxSum;
  const scaled = rateBreakdown.map(r => ({
    rate: r.rate,
    taxable: r.taxable,
    tax: roundAt(r.tax * scale, decimals)
  }));
  const scaledSum = scaled.reduce((s, r) => s + r.tax, 0);
  const residual = frozenTaxTotal - scaledSum;
  if (residual !== 0 && scaled.length > 0) {
    let maxIdx = 0;
    for (let i = 1; i < scaled.length; i++) {
      if (scaled[i].rate > scaled[maxIdx].rate) maxIdx = i;
    }
    scaled[maxIdx].tax += residual;
  }
  return scaled;
}

// ============================================================================
// 3. ROW NORMALIZATION
// ============================================================================
/**
 * Converts one saved document into a stable ReportRow. Money comes from the
 * frozen totals when present, otherwise it is recomputed with the shared
 * calculator. Company/client names fall back to the denormalized snapshots
 * with linked:false markers; buildReportModel upgrades them to real links.
 */
export function normalizeReportInvoice(invoice) {
  const inv = isPlainObject(invoice) ? invoice : {};
  const meta = isPlainObject(inv.meta) ? inv.meta : {};
  const docTypeRaw = str(meta.docType || 'invoice');
  const docType = Object.prototype.hasOwnProperty.call(DOC_TYPE_LABELS, docTypeRaw) ? docTypeRaw : 'invoice';
  const status = str(meta.status || 'pending');
  const currencyMeta = normalizeCurrency(meta.currency);

  // Frozen totals (db v3) take precedence only when the full triple is a
  // finite number set; partial/legacy shapes recompute all three from the
  // shared calculator so the breakdowns can never disagree with the totals.
  let subtotal;
  let taxTotal;
  let total;
  let taxRates;
  let taxLegs;
  const hasFrozen = Number.isFinite(inv.subtotal) && Number.isFinite(inv.taxTotal) && Number.isFinite(inv.total);
  const computed = calculateTotals(inv);
  if (hasFrozen) {
    subtotal = inv.subtotal;
    taxTotal = inv.taxTotal;
    total = inv.total;
    // The frozen tax is authoritative: reconcile the per-rate breakdown onto
    // it and carve the legs out of the frozen tax at currency precision, so
    // Dashboard tax, Tax-tab rates and legs always agree.
    taxRates = reconcileFrozenTaxRates(computed.rateBreakdown, taxTotal, subtotal, currencyMeta.decimals);
    taxLegs = splitTaxLegs(inv.taxes, taxTotal, currencyMeta.decimals);
  } else {
    subtotal = computed.subtotal;
    taxTotal = computed.taxTotal;
    total = computed.total;
    taxRates = computed.rateBreakdown;
    taxLegs = computed.taxLegs;
  }

  const isDraft = status === 'draft';
  const isPaid = status === 'paid';
  // Outstanding = unpaid, undrafted, pending INVOICES. Pending proformas are
  // pipeline, never outstanding (M1).
  const isOutstanding = !isDraft && !isPaid && status === 'pending' && docType === 'invoice';

  const senderName = isPlainObject(inv.sender) ? str(inv.sender.name).trim() : '';
  const clientName = isPlainObject(inv.client) ? str(inv.client.name).trim() : '';
  const companyId = str(pick(inv, 'companyId'));
  const clientId = str(pick(inv, 'clientId'));

  return {
    id: str(inv.id),
    updatedAt: num(inv.updatedAt),
    number: str(meta.number || ''),
    docType,
    docTypeLabel: DOC_TYPE_LABELS[docType],
    status,
    statusLabel: statusLabel(docType, status),
    issueDate: str(pick(inv, 'issueDate') || meta.date || ''),
    dueDate: str(pick(inv, 'dueDate') || meta.dueDate || ''),
    companyId,
    companyName: senderName,
    companyLinked: false,
    clientId,
    clientName,
    clientLinked: false,
    currencyKey: currencyMeta.key,
    currencySymbol: currencyMeta.symbol,
    numberFormat: (meta.numberFormat === 'indian' || meta.numberFormat === 'international')
      ? meta.numberFormat
      : (currencyMeta.key === 'INR' ? 'indian' : 'international'),
    subtotal,
    taxTotal,
    total,
    sourceDocId: str(pick(inv, 'sourceDocId')),
    sourceDocNumber: str(pick(inv, 'sourceDocNumber')),
    convertedToId: str(pick(inv, 'convertedToId')),
    convertedToNumber: str(pick(inv, 'convertedToNumber')),
    convertedAt: str(pick(inv, 'convertedAt')),
    isDraft,
    isInvoice: docType === 'invoice',
    isPaid,
    isOutstanding,
    isConvertedSource: Boolean(pick(inv, 'convertedToId')),
    isConvertedChild: Boolean(pick(inv, 'sourceDocId')),
    taxRates,
    taxLegs
  };
}

// ============================================================================
// 4. FILTERING
// ============================================================================
/**
 * Filters rows in memory. Filters: { dateFrom, dateTo, docType, status,
 * company, client, currency } — 'all'/'' means unfiltered. Date bounds are
 * inclusive YYYY-MM-DD strings compared against the issue date.
 * Company/client filters match durable ids, falling back to snapshot names.
 */
export function filterReportRows(rows, filters = {}) {
  const f = filters || {};
  const docType = f.docType && f.docType !== 'all' ? f.docType : '';
  const status = f.status && f.status !== 'all' ? f.status : '';
  const currency = f.currency && f.currency !== 'all' ? str(f.currency).trim().toUpperCase() : '';
  const company = f.company && f.company !== 'all' ? f.company : '';
  const client = f.client && f.client !== 'all' ? f.client : '';
  const dateFrom = f.dateFrom ? str(f.dateFrom) : '';
  const dateTo = f.dateTo ? str(f.dateTo) : '';

  return rows.filter(row => {
    if (docType && row.docType !== docType) return false;
    if (status && row.status !== status) return false;
    if (currency && String(row.currencyKey).toUpperCase() !== currency) return false;
    if (company && str(row.companyId) !== company && str(row.companyName) !== company) return false;
    if (client && str(row.clientId) !== client && str(row.clientName) !== client) return false;
    if (dateFrom && (!row.issueDate || row.issueDate < dateFrom)) return false;
    if (dateTo && (!row.issueDate || row.issueDate > dateTo)) return false;
    return true;
  });
}

// ============================================================================
// 5. MODEL BUILDER
// ============================================================================
function buildCompanySummary(id, name, linked) {
  return {
    id: id || '',
    name: name || 'Unlinked',
    linked: Boolean(id && linked),
    count: 0,
    currencyBuckets: []
  };
}

function groupRowsBy(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const entry = keyFn(row);
    if (!entry) continue;
    let summary = map.get(entry.key);
    if (!summary) {
      summary = buildCompanySummary(entry.id, entry.name, entry.linked);
      map.set(entry.key, summary);
    }
    summary.count += 1;
    // Money buckets only for revenue-eligible, non-converted-source rows.
    if (row.isDraft || !row.isInvoice) continue;
    if (row.isConvertedSource) continue;
    let bucket = summary.currencyBuckets.find(b => b.currencyKey === row.currencyKey);
    if (!bucket) {
      bucket = { currencyKey: row.currencyKey, symbol: row.currencySymbol, ...cloneBuckets() };
      summary.currencyBuckets.push(bucket);
    }
    bucket.revenue += row.total;
    bucket.subtotal += row.subtotal;
    bucket.taxTotal += row.taxTotal;
    if (row.isPaid) bucket.paid += row.total;
    else if (row.isOutstanding) bucket.outstanding += row.total;
  }
  return [...map.values()];
}

/**
 * Builds the full report model.
 * in: { invoices, clients?, companies?, filters?, now }
 * out ReportModel: { generatedAt, rows, filteredRows, totals,
 *   currencySummaries, companySummaries, clientSummaries, conversionSummary,
 *   paidProformaSummary, recentDocuments }
 */
export function buildReportModel({ invoices, clients, companies, filters, now } = {}) {
  const generatedAt = new Date(normalizeNowMs(now)).toISOString();
  const sourceInvoices = Array.isArray(invoices) ? invoices : [];
  const clientList = Array.isArray(clients) ? clients : [];
  const companyList = Array.isArray(companies) ? companies : [];

  // 1. Normalize every saved document.
  const rows = sourceInvoices.map(normalizeReportInvoice);

  // 2. Upgrade company/client links; fall back to snapshot names, unlinked.
  const companyById = new Map();
  for (const c of companyList) {
    if (isPlainObject(c) && c.id) companyById.set(str(c.id), c);
  }
  const clientById = new Map();
  for (const c of clientList) {
    if (isPlainObject(c) && c.id) clientById.set(str(c.id), c);
  }
  for (const row of rows) {
    const comp = row.companyId ? companyById.get(row.companyId) : null;
    if (comp && str(comp.name).trim()) {
      row.companyName = str(comp.name).trim();
      row.companyLinked = true;
    }
    const cl = row.clientId ? clientById.get(row.clientId) : null;
    if (cl && str(cl.name).trim()) {
      row.clientName = str(cl.name).trim();
      row.clientLinked = true;
    }
  }

  // 3. Filtered view.
  const filteredRows = filterReportRows(rows, filters || {});

  // 4. Document-level counts.
  const byType = { invoice: 0, quotation: 0, estimate: 0, proforma: 0 };
  const byStatus = {};
  let invoicesCount = 0;
  let draftsCount = 0;
  let revenueDocs = 0; // invoices excluding drafts (revenue eligible)
  let paidDocs = 0;
  let outstandingDocs = 0;
  let pipelineDocs = 0;
  let convertedSources = 0;
  let invoicesFromConversion = 0;
  const links = [];

  for (const row of rows) {
    byType[row.docType] = (byType[row.docType] || 0) + 1;
    byStatus[row.status] = (byStatus[row.status] || 0) + 1;
    if (row.docType === 'invoice') invoicesCount += 1;
    if (row.isDraft) draftsCount += 1;
    if (!row.isDraft && row.isInvoice) revenueDocs += 1;
    if (row.isPaid) paidDocs += 1;
    if (row.isOutstanding) outstandingDocs += 1;
    if (row.isConvertedSource) convertedSources += 1;
    if (row.isConvertedChild) invoicesFromConversion += 1;
    if (row.isConvertedChild && row.sourceDocId) {
      links.push({
        sourceId: row.sourceDocId,
        sourceNumber: row.sourceDocNumber,
        invoiceId: row.id,
        invoiceNumber: row.number
      });
    }
    const isPipeline = !row.isDraft && row.docType !== 'invoice' && !row.isConvertedSource && PIPELINE_STATUSES.has(row.status) && !(!row.isDraft && row.docType === 'proforma' && row.isPaid);
    if (isPipeline) pipelineDocs += 1;
  }

  // 5. Currency buckets (never summed across currencies).
  const currencyMap = new Map();
  for (const row of rows) {
    addToBucket(currencyMap, row, (bucket, row2) => {
      bucket.documents += 1;
      if (row2.docType === 'invoice') bucket.invoices += 1;
      if (row2.isDraft) { bucket.drafts += 1; return; }
      if (row2.isInvoice && !row2.isConvertedSource) {
        bucket.revenue += row2.total;
        bucket.subtotal += row2.subtotal;
        bucket.taxTotal += row2.taxTotal;
        if (row2.isPaid) bucket.paid += row2.total;
        else if (row2.isOutstanding) bucket.outstanding += row2.total;
      }
      const proformaPaid = row2.docType === 'proforma' && row2.isPaid;
      const openPipeline = row2.docType !== 'invoice' && !row2.isConvertedSource && PIPELINE_STATUSES.has(row2.status);
      if (openPipeline && !proformaPaid) {
        bucket.pipeline += row2.total;
        bucket.pipelineCount += 1;
        bucket.pipelineDocuments.push(row2.id);
      }
    });
  }
  const currencySummaries = [...currencyMap.values()].sort((a, b) => a.currencyKey.localeCompare(b.currencyKey));

  // 6. Company & client summaries (legacy snapshots group unlinked).
  const companySummaries = groupRowsBy(rows, row => ({
    key: row.companyId ? 'id:' + row.companyId : 'name:' + row.companyName,
    id: row.companyId,
    name: row.companyName || 'Unlinked',
    linked: row.companyLinked
  }), 'company').sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const clientSummaries = groupRowsBy(rows, row => ({
    key: row.clientId ? 'id:' + row.clientId : 'name:' + row.clientName,
    id: row.clientId,
    name: row.clientName || 'Unlinked',
    linked: row.clientLinked
  }), 'client').sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  // 7. Conversion + paid proforma summaries.
  const paidProformaBuckets = new Map();
  for (const row of rows) {
    if (row.docType === 'proforma' && row.isPaid && !row.isDraft) {
      addToBucket(paidProformaBuckets, row, (bucket, row2) => {
        bucket.documents += 1;
        bucket.paid += row2.total;
      });
    }
  }
  const conversionSummary = {
    convertedSources,
    invoicesFromConversion,
    links: links.sort((a, b) => str(a.invoiceNumber).localeCompare(str(b.invoiceNumber)))
  };

  const paidProformaSummary = {
    count: num([...paidProformaBuckets.values()].reduce((s, b) => s + b.documents, 0)),
    currencyBuckets: [...paidProformaBuckets.values()]
      .map(b => ({ currencyKey: b.currencyKey, symbol: b.symbol, count: b.documents, total: b.paid }))
      .sort((a, b) => a.currencyKey.localeCompare(b.currencyKey))
  };

  return {
    generatedAt,
    rows,
    filteredRows,
    totals: {
      documents: rows.length,
      filtered: filteredRows.length,
      invoices: invoicesCount,
      drafts: draftsCount,
      revenueDocs,
      paidDocs,
      outstandingDocs,
      pipelineDocs,
      convertedSources,
      byType,
      byStatus
    },
    currencySummaries,
    companySummaries,
    clientSummaries,
    conversionSummary,
    paidProformaSummary,
    recentDocuments: sortByIssueDateDesc(rows).slice(0, 5)
  };
}

// ============================================================================
// 6. HOME SUMMARY
// ============================================================================
/**
 * Compact stats for the Home view. Money always stays per currency.
 */
export function summarizeHome({ invoices, clients, companies, now } = {}) {
  const at = new Date(normalizeNowMs(now));
  const monthFrom = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-01`;
  const monthTo = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-31`;

  const list = Array.isArray(invoices) ? invoices : [];
  const model = buildReportModel({ invoices: list, clients, companies, now: at });

  let invoiceCount = 0;
  let draftCount = 0;
  let unpaidInvoices = 0;
  let openQuotes = 0;
  const perCurrency = new Map();

  for (const row of model.rows) {
    if (row.docType === 'invoice') invoiceCount += 1;
    if (row.isDraft) draftCount += 1;
    if (!row.isDraft && row.isInvoice && row.isOutstanding) unpaidInvoices += 1;
    if (row.docType === 'quotation' && !row.isDraft && !row.isConvertedSource && PIPELINE_STATUSES.has(row.status)) openQuotes += 1;

    // Per-currency revenue/paid/outstanding are all-time for every non-draft
    // invoice (M4); only the tax figure is scoped to the current calendar
    // month. An empty current month means tax 0 — never an all-time fallback.
    if (!row.isDraft && row.isInvoice && !row.isConvertedSource) {
      addToBucket(perCurrency, row, (bucket, row2) => {
        bucket.revenue = (bucket.revenue || 0) + row2.total;
        if (row2.isPaid) bucket.paid = (bucket.paid || 0) + row2.total;
        if (row2.isOutstanding) bucket.outstanding = (bucket.outstanding || 0) + row2.total;
        if (row2.issueDate >= monthFrom && row2.issueDate <= monthTo) {
          bucket.taxCurrentPeriod = (bucket.taxCurrentPeriod || 0) + row2.taxTotal;
        }
      });
    }
  }

  return {
    generatedAt: model.generatedAt,
    documentCount: model.rows.length,
    invoiceCount,
    draftCount,
    openQuotes,
    unpaidInvoices,
    perCurrency: [...perCurrency.values()]
      .map(b => ({
        currencyKey: b.currencyKey,
        symbol: b.symbol,
        // Row-derived grouping format (first matching invoice wins), so Home
        // currency cards format INR and friends consistently.
        numberFormat: b.numberFormat || 'international',
        taxCurrentPeriod: b.taxCurrentPeriod || 0,
        revenue: b.revenue || 0,
        paid: b.paid || 0,
        outstanding: b.outstanding || 0
      }))
      .sort((a, b) => a.currencyKey.localeCompare(b.currencyKey)),
    recent: model.recentDocuments
  };
}

// ============================================================================
// 7. CSV EXPORT
// ============================================================================
function csvCell(value) {
  let s = (value === null || value === undefined) ? '' : String(value);
  // Guard spreadsheet formula injection FIRST.
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  // Then wrap/escape only when needed.
  if (/["\n\r,]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/**
 * Serializes rows (array of arrays) to CSV text with LF endings.
 * Quotes/commas/newlines are escaped; cells beginning with = + - @ are
 * prefixed with an apostrophe so spreadsheets treat them as text.
 */
export function toCsv(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return '';
  return rows.map(cells => (Array.isArray(cells) ? cells : [cells]).map(csvCell).join(',')).join('\n');
}
