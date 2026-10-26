/**
 * InvoiceCraftDB - IndexedDB Storage Layer (v4)
 * Privacy-first, local-only client-side database for documents, clients, and assets.
 *
 * v3 adds report indexes, frozen totals, durable document links, and atomic
 * invoice + numbering writes. v4 adds the `catalogItems` store (saved item
 * library) plus the `itemLibraryConfig` setting. v2 backups remain importable.
 */

import { calculateTotals, normalizeCurrency, clampNum } from './calc.js';
import {
  DEFAULT_NUMBERING_CONFIG,
  normalizeNumberingConfig
} from './numbering.js';
import {
  findCatalogMatch,
  normalizeCatalogItem,
  normalizeCatalogScope
} from './catalog.js';

export { DEFAULT_NUMBERING_CONFIG };

const DB_NAME = 'InvoiceCraftDB';
export const DB_VERSION = 4;

let dbInstance = null;

function makeRetryableError(message, cause) {
  const err = new Error(message);
  err.name = 'InvoiceCraftDatabaseError';
  err.retryable = true;
  if (cause) err.cause = cause;
  return err;
}

export async function openDB() {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    let request;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (e) {
      reject(makeRetryableError('Could not open the local database. Reload and try again.', e));
      return;
    }

    let settled = false;

    request.onblocked = () => {
      if (settled) return;
      settled = true;
      reject(makeRetryableError('The local database upgrade is blocked by another tab. Close other InvoiceCraft tabs and reload.'));
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      const tx = event.target.transaction;

      // Invoices store
      let invStore;
      if (!db.objectStoreNames.contains('invoices')) {
        invStore = db.createObjectStore('invoices', { keyPath: 'id' });
        invStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        invStore.createIndex('invoiceNumber', 'invoiceNumber', { unique: false });
      } else {
        invStore = tx.objectStore('invoices');
      }
      // Report/history indexes are added in-place so existing records survive.
      createIndexIfMissing(invStore, 'issueDate', 'issueDate');
      createIndexIfMissing(invStore, 'docType', 'docType');
      createIndexIfMissing(invStore, 'status', 'status');
      createIndexIfMissing(invStore, 'companyId', 'companyId');
      createIndexIfMissing(invStore, 'clientId', 'clientId');
      createIndexIfMissing(invStore, 'currencyKey', 'currencyKey');

      // Clients store for quick auto-fill
      if (!db.objectStoreNames.contains('clients')) {
        const clientStore = db.createObjectStore('clients', { keyPath: 'id' });
        clientStore.createIndex('name', 'name', { unique: false });
      }

      // Multiple Companies store
      if (!db.objectStoreNames.contains('companies')) {
        const compStore = db.createObjectStore('companies', { keyPath: 'id' });
        compStore.createIndex('name', 'name', { unique: false });
        compStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }

      // Settings and drafts store
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }

      // Catalog items store (v4): reusable saved line items, global and
      // company scope. Created in-place so existing v2/v3 databases upgrade
      // without losing any records.
      if (!db.objectStoreNames.contains('catalogItems')) {
        const catalogStore = db.createObjectStore('catalogItems', { keyPath: 'id' });
        catalogStore.createIndex('scope', 'scope', { unique: false });
        catalogStore.createIndex('companyId', 'companyId', { unique: false });
        catalogStore.createIndex('currencyKey', 'currencyKey', { unique: false });
        catalogStore.createIndex('descriptionKey', 'descriptionKey', { unique: false });
        catalogStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      } else {
        const catalogStore = tx.objectStore('catalogItems');
        createIndexIfMissing(catalogStore, 'scope', 'scope');
        createIndexIfMissing(catalogStore, 'companyId', 'companyId');
        createIndexIfMissing(catalogStore, 'currencyKey', 'currencyKey');
        createIndexIfMissing(catalogStore, 'descriptionKey', 'descriptionKey');
        createIndexIfMissing(catalogStore, 'updatedAt', 'updatedAt');
      }
    };

    request.onsuccess = (event) => {
      const db = event.target.result;
      if (settled) {
        try { db.close(); } catch (e) {}
        return;
      }
      settled = true;
      dbInstance = db;
      dbInstance.onversionchange = () => {
        try { dbInstance.close(); } catch (e) {}
        dbInstance = null;
      };
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      if (settled) return;
      settled = true;
      console.error('IndexedDB open error:', event.target.error);
      reject(makeRetryableError('Could not open the local database. Reload and try again.', event.target.error));
    };
  });
}

function createIndexIfMissing(store, name, keyPath) {
  if (!store.indexNames.contains(name)) {
    store.createIndex(name, keyPath, { unique: false });
  }
}

function makeDBId(prefix) {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return prefix + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    }
  } catch (e) {}
  return prefix + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
}

function dbLocalDateString(date = new Date()) {
  const d = (date instanceof Date && !isNaN(date.getTime())) ? date : new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function normalizeItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .filter(item => item && typeof item === 'object')
    .map(item => {
      const qty = (item.qty === undefined || item.qty === null)
        ? 0
        : clampNum(item.qty, 0, 1000000, 0);
      const rate = (item.rate === undefined || item.rate === null)
        ? 0
        : clampNum(item.rate, 0, 1000000000, 0);
      const discount = (item.discount === undefined || item.discount === null)
        ? 0
        : clampNum(item.discount, 0, 100, 0);
      // Missing/null/blank/non-finite taxRate defaults to 18, matching
      // calculateTotals (L2).
      const rawTaxRate = (item.taxRate === undefined || item.taxRate === null || item.taxRate === '')
        ? 18
        : parseFloat(item.taxRate);
      const taxRate = Number.isFinite(rawTaxRate) ? clampNum(rawTaxRate, 0, 100, 18) : 18;
      return Object.assign({}, item, {
        description: typeof item.description === 'string' ? item.description : '',
        hsn: item.hsn === undefined || item.hsn === null ? '' : String(item.hsn),
        qty,
        rate,
        discount,
        taxRate
      });
    });
}

function normalizeTaxes(taxes) {
  if (!Array.isArray(taxes)) {
    return [
      { id: 'tax_1', name: 'CGST', ratio: 50 },
      { id: 'tax_2', name: 'SGST', ratio: 50 }
    ];
  }
  return taxes
    .filter(t => t && typeof t === 'object')
    .map(t => {
      const rawRatio = (t.ratio === undefined && t.rate !== undefined) ? t.rate : t.ratio;
      return Object.assign({}, t, {
        name: typeof t.name === 'string' ? t.name : '',
        ratio: rawRatio === undefined ? 50 : clampNum(rawRatio, 0, 100, 50)
      });
    });
}

function normalizeDocumentMetadata(invoice, preserveFinancials = false) {
  if (!invoice.meta || typeof invoice.meta !== 'object') invoice.meta = {};
  if (!invoice.meta.docType && invoice.docType) invoice.meta.docType = invoice.docType;
  if (!invoice.meta.docType) invoice.meta.docType = 'invoice';
  invoice.docType = invoice.meta.docType;
  if (!invoice.meta.status && invoice.status) invoice.meta.status = invoice.status;
  if (!invoice.meta.status) invoice.meta.status = 'pending';
  invoice.status = invoice.meta.status;
  // meta.date is the editable source of truth; top-level issueDate is frozen
  // from it on every save so date edits immediately reach reports.
  if (invoice.meta.date) {
    invoice.issueDate = invoice.meta.date;
  } else if (invoice.issueDate) {
    invoice.meta.date = invoice.issueDate;
  } else {
    invoice.issueDate = dbLocalDateString();
    invoice.meta.date = invoice.issueDate;
  }
  if (!invoice.meta.currency) invoice.meta.currency = '$';
  invoice.currencyKey = normalizeCurrency(invoice.meta.currency).key;
  // preserveFinancials (M5): leave items/taxes exactly as stored so the
  // frozen totals of a persisted record stay authoritative (conversion
  // source updates must never rewrite its financials).
  if (!preserveFinancials) {
    invoice.items = normalizeItems(invoice.items || []);
    invoice.taxes = normalizeTaxes(invoice.taxes);
  }
}

/**
 * Stamps a document with everything reports/history need and freezes totals.
 * Mutates and returns the invoice for compatibility with existing call sites.
 *
 * Options (M5): `{ preserveFinancials: true }` stamps identity fields only —
 * updatedAt, docType/status/issueDate, currencyKey and durable links — while
 * keeping the stored items/taxes and frozen subtotal/taxTotal/total untouched
 * (no normalization, no recomputation). Used for conversion source updates.
 */
export function prepareInvoiceForSave(invoice, extras = {}, options = {}) {
  if (!invoice || typeof invoice !== 'object') {
    throw new Error('Cannot save an invalid document.');
  }
  const preserveFinancials = Boolean(options && options.preserveFinancials);
  if (!invoice.id) invoice.id = makeDBId('inv_');
  normalizeDocumentMetadata(invoice, preserveFinancials);
  Object.assign(invoice, extras);

  // Re-apply required identity fields after extras.
  if (!invoice.docType) invoice.docType = invoice.meta.docType || 'invoice';
  if (!invoice.status) invoice.status = invoice.meta.status || 'pending';
  if (!invoice.issueDate) invoice.issueDate = invoice.meta.date || dbLocalDateString();

  invoice.updatedAt = extras.updatedAt !== undefined ? extras.updatedAt : Date.now();
  invoice.currencyKey = normalizeCurrency(invoice.meta.currency || invoice.currency || '$').key;

  if (!preserveFinancials) {
    const totals = calculateTotals(invoice);
    invoice.subtotal = totals.subtotal;
    invoice.taxTotal = totals.taxTotal;
    invoice.total = totals.total;
  }

  // Durable links live at the top level. Preserve them if present; allow the
  // builder to place them in meta for compatibility.
  const linkKeys = [
    'sourceDocId', 'sourceDocNumber',
    'convertedToId', 'convertedToNumber', 'convertedAt',
    'duplicatedFromId'
  ];
  linkKeys.forEach(key => {
    if (invoice[key] === undefined && invoice.meta && invoice.meta[key] !== undefined) {
      invoice[key] = invoice.meta[key];
    }
  });

  return invoice;
}

function prepareImportedInvoice(invoice) {
  if (!invoice || typeof invoice !== 'object') return invoice;
  if (!invoice.id) invoice.id = makeDBId('inv_');
  normalizeDocumentMetadata(invoice);

  if (!invoice.updatedAt) {
    const parsedIssue = Date.parse(invoice.issueDate);
    invoice.updatedAt = Number.isFinite(parsedIssue) ? parsedIssue : Date.now();
  }
  invoice.currencyKey = normalizeCurrency(invoice.meta.currency || '$').key;

  const totals = calculateTotals(invoice);
  if (invoice.subtotal === undefined || invoice.subtotal === null) invoice.subtotal = totals.subtotal;
  if (invoice.taxTotal === undefined || invoice.taxTotal === null) invoice.taxTotal = totals.taxTotal;
  if (invoice.total === undefined || invoice.total === null) invoice.total = totals.total;

  const linkKeys = [
    'sourceDocId', 'sourceDocNumber',
    'convertedToId', 'convertedToNumber', 'convertedAt',
    'duplicatedFromId'
  ];
  linkKeys.forEach(key => {
    if (invoice[key] === undefined && invoice.meta && invoice.meta[key] !== undefined) {
      invoice[key] = invoice.meta[key];
    }
  });
  return invoice;
}

// Invoices CRUD
export async function saveInvoice(invoice) {
  const db = await openDB();
  prepareInvoiceForSave(invoice);
  return new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(['invoices'], 'readwrite');
    } catch (e) {
      reject(e);
      return;
    }
    const store = tx.objectStore('invoices');
    const req = store.put(invoice);
    req.onsuccess = () => resolve(invoice.id);
    req.onerror = () => reject(req.error);
    tx.onerror = () => reject(tx.error || req.error);
    tx.onabort = () => reject(tx.error || new Error('Save aborted (quota exceeded?)'));
  });
}

/**
 * Atomic document save + numbering config write. Used by Save, duplicate,
 * conversion, and Save & Start Fresh so a counter is never consumed without
 * its document being stored.
 */
export async function saveInvoiceAndNumbering(invoice, numberingConfig) {
  const db = await openDB();
  prepareInvoiceForSave(invoice);
  return new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(['invoices', 'settings'], 'readwrite');
    } catch (e) {
      reject(e);
      return;
    }
    const invoiceStore = tx.objectStore('invoices');
    const settingsStore = tx.objectStore('settings');
    invoiceStore.put(invoice);
    if (numberingConfig && typeof numberingConfig === 'object') {
      settingsStore.put({ key: 'numberingConfig', data: normalizeNumberingConfig(numberingConfig) });
    }
    tx.oncomplete = () => resolve(invoice.id);
    tx.onerror = () => reject(tx.error || new Error('Could not save the document and numbering settings.'));
    tx.onabort = () => reject(tx.error || new Error('Save aborted (quota exceeded?)'));
  });
}

/**
 * Pure source-contract check for conversions (cross-tab double-conversion
 * guard): decides whether the STORED source record may be converted into the
 * new invoice `invoiceId`. Returns { ok: true } or { ok: false, error }.
 *  - stored record missing -> refused (deleted in another tab / never saved)
 *  - stored record already carries convertedToId for a DIFFERENT invoice ->
 *    refused ("already converted")
 *  - convertedToId equal to the same invoice id (retry of this exact
 *    conversion) or absent -> allowed
 */
export function checkConversionSourceState(storedSource, invoiceId) {
  if (!storedSource || typeof storedSource !== 'object') {
    return {
      ok: false,
      error: new Error('The source document no longer exists in the local database. Refresh and try again.')
    };
  }
  if (storedSource.convertedToId && storedSource.convertedToId !== invoiceId) {
    return {
      ok: false,
      error: new Error('This document has already been converted; refusing to convert it again.')
    };
  }
  return { ok: true };
}

/**
 * Atomic conversion: source update + new invoice + numbering config in one
 * transaction. The stored source is RE-READ inside the transaction so two
 * tabs can never convert the same quote twice; the source quote can never be
 * lost while the invoice is written.
 */
export async function saveConversion({ source, invoice, numberingConfig }) {
  const db = await openDB();
  if (!source || !source.id) throw new Error('Conversion source must be saved first.');
  if (!invoice || !invoice.id) throw new Error('Conversion invoice is missing.');
  // The source is a persisted record: stamp identity/links only (M5) so its
  // frozen financials and raw items/taxes survive conversion untouched.
  prepareInvoiceForSave(source, {}, { preserveFinancials: true });
  prepareInvoiceForSave(invoice);
  return new Promise((resolve, reject) => {
    // Settled flag: the intended rejection must win even when aborting the
    // transaction fires tx.onabort (never resolve after rejection).
    let settled = false;
    const finishResolve = (value) => {
      if (!settled) { settled = true; resolve(value); }
    };
    const finishReject = (err) => {
      if (!settled) { settled = true; reject(err); }
    };
    const abortTx = () => {
      try { tx.abort(); } catch (e) { /* already aborting/aborted */ }
    };

    let tx;
    try {
      tx = db.transaction(['invoices', 'settings'], 'readwrite');
    } catch (e) {
      finishReject(e);
      return;
    }
    const invoiceStore = tx.objectStore('invoices');
    const settingsStore = tx.objectStore('settings');

    // Re-read the stored source INSIDE the transaction: the in-memory `source`
    // may be stale if another tab converted the same quote in the meantime.
    let getReq;
    try {
      getReq = invoiceStore.get(source.id);
    } catch (e) {
      finishReject(e);
      return;
    }
    getReq.onsuccess = () => {
      const verdict = checkConversionSourceState(getReq.result, invoice.id);
      if (!verdict.ok) {
        // Reject with the intended error BEFORE aborting, so tx.onabort's
        // generic abort rejection can never mask it.
        finishReject(verdict.error);
        abortTx();
        return;
      }
      try {
        invoiceStore.put(source);
        invoiceStore.put(invoice);
        if (numberingConfig && typeof numberingConfig === 'object') {
          settingsStore.put({ key: 'numberingConfig', data: normalizeNumberingConfig(numberingConfig) });
        }
      } catch (e) {
        finishReject(e);
        abortTx();
      }
    };
    getReq.onerror = () => {
      finishReject(getReq.error || new Error('Could not verify the source document before conversion.'));
      abortTx();
    };

    tx.oncomplete = () => finishResolve({ sourceId: source.id, invoiceId: invoice.id });
    tx.onerror = () => finishReject(tx.error || new Error('Could not complete the conversion.'));
    tx.onabort = () => finishReject(tx.error || new Error('Conversion aborted.'));
  });
}

export async function getInvoice(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['invoices'], 'readonly');
    const store = tx.objectStore('invoices');
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

function sortTimestamp(invoice) {
  if (!invoice) return 0;
  if (invoice.updatedAt !== undefined && invoice.updatedAt !== null) {
    const n = Number(invoice.updatedAt);
    if (Number.isFinite(n) && n > 0) return n;
  }
  if (invoice.issueDate) {
    const parsed = Date.parse(invoice.issueDate);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

export async function getAllInvoices() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['invoices'], 'readonly');
    const store = tx.objectStore('invoices');
    // Read the whole store: using the updatedAt index would silently drop
    // legacy records that do not have an updatedAt field yet.
    const req = store.getAll();
    req.onsuccess = () => {
      const results = (req.result || []).slice();
      results.sort((a, b) => sortTimestamp(b) - sortTimestamp(a));
      resolve(results);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteInvoice(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['invoices'], 'readwrite');
    const store = tx.objectStore('invoices');
    const req = store.delete(id);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

// Auto-saved Draft State
export async function saveActiveDraft(draft, extras = {}) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['settings'], 'readwrite');
    const store = tx.objectStore('settings');
    const record = {
      key: 'activeDraft',
      data: draft,
      updatedAt: Date.now(),
      edited: Boolean(extras && extras.documentEdited)
    };
    if (extras && extras.activeCompanyProfileId !== undefined) {
      record.activeCompanyProfileId = extras.activeCompanyProfileId;
    } else if (draft && draft.activeCompanyProfileId) {
      record.activeCompanyProfileId = draft.activeCompanyProfileId;
    }
    const req = store.put(record);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

export async function getActiveDraftRecord() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['settings'], 'readonly');
    const store = tx.objectStore('settings');
    const req = store.get('activeDraft');
    req.onsuccess = () => {
      const result = req.result;
      if (!result) {
        resolve(null);
        return;
      }
      resolve({
        data: result.data || null,
        updatedAt: result.updatedAt || null,
        activeCompanyProfileId: result.activeCompanyProfileId || null,
        // Legacy v1.1 drafts carry no `edited` flag: null means "legacy /
        // unknown" and callers must treat it as EDITED so dirty-draft
        // protection is never lost on upgrade. true/false are as saved.
        edited: result.edited === undefined ? null : Boolean(result.edited)
      });
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getActiveDraft() {
  const record = await getActiveDraftRecord();
  return record ? record.data : null;
}

// Multiple Company Profiles CRUD
export async function saveCompany(company) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['companies'], 'readwrite');
    const store = tx.objectStore('companies');
    if (!company.id) company.id = makeDBId('comp_');
    company.updatedAt = Date.now();
    if (!company.createdAt) company.createdAt = Date.now();
    const req = store.put(company);
    req.onsuccess = () => resolve(company);
    req.onerror = () => reject(req.error);
  });
}

export async function getCompany(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['companies'], 'readonly');
    const store = tx.objectStore('companies');
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllCompanies() {
  const db = await openDB();
  return new Promise(async (resolve, reject) => {
    try {
      const tx = db.transaction(['companies'], 'readonly');
      const store = tx.objectStore('companies');
      const req = store.getAll();
      req.onsuccess = async () => {
        let list = req.result || [];
        // If no companies found in companies store yet, check legacy settings
        if (list.length === 0) {
          const legacy = await getLegacyProfile();
          if (legacy && legacy.name) {
            const migrated = {
              id: 'comp_default',
              name: legacy.name,
              email: legacy.email || '',
              phone: legacy.phone || '',
              address: legacy.address || '',
              taxId: legacy.taxId || '',
              payment: '',
              defaultCurrency: '$',
              defaultNumberFormat: 'international',
              isDefault: true,
              createdAt: Date.now(),
              updatedAt: Date.now()
            };
            await saveCompany(migrated);
            list = [migrated];
          }
        }
        // Sort default first, then newest
        list.sort((a, b) => {
          if (a.isDefault && !b.isDefault) return -1;
          if (!a.isDefault && b.isDefault) return 1;
          return (b.updatedAt || 0) - (a.updatedAt || 0);
        });
        resolve(list);
      };
      req.onerror = () => reject(req.error);
    } catch (e) {
      reject(e);
    }
  });
}

export async function deleteCompany(id) {
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(['companies'], 'readwrite');
    const store = tx.objectStore('companies');
    const req = store.delete(id);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
  await ensureOneDefaultCompany();
  return true;
}

async function ensureOneDefaultCompany() {
  const db = await openDB();
  const companies = await new Promise((resolve, reject) => {
    const tx = db.transaction(['companies'], 'readonly');
    const req = tx.objectStore('companies').getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
  if (companies.length === 0) return false;
  const defaults = companies.filter(c => c.isDefault);
  const targetId = defaults.length > 0 ? defaults[0].id : companies[0].id;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['companies'], 'readwrite');
    const store = tx.objectStore('companies');
    companies.forEach(c => {
      store.put(Object.assign({}, c, { isDefault: c.id === targetId }));
    });
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function setDefaultCompany(id) {
  const db = await openDB();
  const companies = await getAllCompanies();
  if (companies.length === 0) return false;
  let targetId = companies.some(c => c.id === id) ? id : null;
  if (!targetId) {
    const existingDefault = companies.find(c => c.isDefault);
    targetId = existingDefault ? existingDefault.id : companies[0].id;
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['companies'], 'readwrite');
    const store = tx.objectStore('companies');
    companies.forEach(c => {
      c.isDefault = (c.id === targetId);
      c.updatedAt = Date.now();
      store.put(c);
    });
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function getDefaultCompany() {
  const companies = await getAllCompanies();
  if (companies.length > 0) {
    const def = companies.find(c => c.isDefault);
    return def || companies[0];
  }
  return null;
}

async function getLegacyProfile() {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(['settings'], 'readonly');
      const store = tx.objectStore('settings');
      const req = store.get('companyProfile');
      req.onsuccess = () => resolve(req.result ? req.result.data : null);
      req.onerror = () => resolve(null);
    });
  } catch (e) {
    return null;
  }
}

// Company Profile (Sender Defaults backward compatibility)
export async function saveCompanyProfile(profile) {
  const db = await openDB();
  if (profile && profile.name) {
    const existing = profile.id ? await getCompany(profile.id) : null;
    const comp = Object.assign({}, existing || {}, {
      id: profile.id || makeDBId('comp_'),
      name: profile.name,
      email: profile.email || '',
      phone: profile.phone || '',
      address: profile.address || '',
      taxId: profile.taxId || '',
      payment: profile.payment || '',
      isDefault: true,
      updatedAt: Date.now()
    });
    if (!comp.createdAt) comp.createdAt = Date.now();
    await saveCompany(comp);
    await setDefaultCompany(comp.id);
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['settings'], 'readwrite');
    const store = tx.objectStore('settings');
    const req = store.put({ key: 'companyProfile', data: profile });
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

export async function getCompanyProfile() {
  const def = await getDefaultCompany();
  if (def) return def;
  return await getLegacyProfile();
}

// Clients Directory
export async function saveClient(client) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['clients'], 'readwrite');
    const store = tx.objectStore('clients');
    if (!client.id) client.id = makeDBId('client_');
    client.updatedAt = Date.now();
    if (!client.createdAt) client.createdAt = Date.now();
    const req = store.put(client);
    req.onsuccess = () => resolve(client);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllClients() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['clients'], 'readonly');
    const store = tx.objectStore('clients');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteClient(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['clients'], 'readwrite');
    const store = tx.objectStore('clients');
    const req = store.delete(id);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

// Numbering Engine Settings
export async function saveNumberingConfig(config) {
  const db = await openDB();
  const normalized = normalizeNumberingConfig(config);
  normalized.updatedAt = Date.now();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['settings'], 'readwrite');
    const store = tx.objectStore('settings');
    const req = store.put({ key: 'numberingConfig', data: normalized });
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

export async function getNumberingConfig() {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(['settings'], 'readonly');
      const store = tx.objectStore('settings');
      const req = store.get('numberingConfig');
      req.onsuccess = () => {
        if (req.result && req.result.data) {
          resolve(normalizeNumberingConfig(req.result.data));
        } else {
          resolve(normalizeNumberingConfig(DEFAULT_NUMBERING_CONFIG));
        }
      };
      req.onerror = () => resolve(normalizeNumberingConfig(DEFAULT_NUMBERING_CONFIG));
    });
  } catch (e) {
    return normalizeNumberingConfig(DEFAULT_NUMBERING_CONFIG);
  }
}

// Saved Item Catalog CRUD (v4)
export async function getAllCatalogItems() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(['catalogItems'], 'readonly');
    } catch (e) {
      reject(e);
      return;
    }
    // Read the whole store and sort here: the updatedAt index would silently
    // drop legacy/manual rows that lack the field, mirroring getAllInvoices.
    const req = tx.objectStore('catalogItems').getAll();
    req.onsuccess = () => {
      const results = (req.result || []).slice();
      results.sort((a, b) => sortTimestamp(b) - sortTimestamp(a));
      resolve(results);
    };
    req.onerror = () => reject(req.error);
  });
}

function storedNumber(value) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Pure save-contract check for catalog dedupe (same pattern as
 * checkConversionSourceState): decides whether `record` may be put given the
 * CURRENT store contents, and produces the record to store.
 *  - no matchKey collision -> { ok: true, record } (fresh insert)
 *  - collision with the SAME id -> update in place; the stored item's
 *    createdAt/usageCount/lastUsedAt win over the caller's possibly stale
 *    copy, so usage history can never rewind and creation is never reset
 *  - collision with a DIFFERENT id -> refused: two Add saves (or two tabs)
 *    can never create two records with the same
 *    scope + companyId + currencyKey + descriptionKey
 */
export function checkCatalogSaveState(storedItems, record) {
  if (!record || typeof record !== 'object') {
    return {
      ok: false,
      match: null,
      record: null,
      error: new Error('Cannot save an invalid catalog item.')
    };
  }
  const match = findCatalogMatch(Array.isArray(storedItems) ? storedItems : [], record);
  if (!match) return { ok: true, match: null, record };
  if (match.id !== record.id) {
    return {
      ok: false,
      match,
      error: new Error('An item with this description already exists in this scope and currency. Edit that item instead.')
    };
  }
  const storedCreated = storedNumber(match.createdAt);
  const storedUsage = storedNumber(match.usageCount);
  const storedLastUsed = storedNumber(match.lastUsedAt);
  return {
    ok: true,
    match,
    record: Object.assign({}, record, {
      createdAt: (storedCreated !== null && storedCreated > 0) ? storedCreated : record.createdAt,
      usageCount: (storedUsage !== null && storedUsage >= 0) ? Math.max(0, Math.floor(storedUsage)) : record.usageCount,
      lastUsedAt: storedLastUsed !== null ? storedLastUsed : record.lastUsedAt
    })
  };
}

/**
 * Normalize (via catalog.js) and persist one catalog item. Generates an id
 * when missing and stamps updatedAt. Dedupe is decided INSIDE the single
 * readwrite transaction (getAll + verdict + put are atomic), so two tabs —
 * or two Add saves — can never create records with the same catalog match
 * key; a different-id collision is rejected so the caller can edit the
 * existing item instead. Returns the stored (merged) record.
 */
export async function saveCatalogItem(item) {
  if (!item || typeof item !== 'object') {
    throw new Error('Cannot save an invalid catalog item.');
  }
  const db = await openDB();
  const options = {};
  if (!item.id) options.id = makeDBId('cat_');
  const record = normalizeCatalogItem(item, options);
  return new Promise((resolve, reject) => {
    // Settled flag (saveConversion pattern): the intended rejection must win
    // even when aborting the transaction fires tx.onabort — never resolve
    // after rejection.
    let settled = false;
    const finishResolve = (value) => {
      if (!settled) { settled = true; resolve(value); }
    };
    const finishReject = (err) => {
      if (!settled) { settled = true; reject(err); }
    };
    const abortTx = () => {
      try { tx.abort(); } catch (e) { /* already aborting/aborted */ }
    };

    // ONE readwrite transaction: the dedupe re-read and the put land in the
    // same transaction, so concurrent saves serialize instead of duplicating.
    let tx;
    try {
      tx = db.transaction(['catalogItems'], 'readwrite');
    } catch (e) {
      finishReject(e);
      return;
    }
    const store = tx.objectStore('catalogItems');

    let toStore = null;
    let getAllReq;
    try {
      getAllReq = store.getAll();
    } catch (e) {
      finishReject(e);
      abortTx();
      return;
    }
    getAllReq.onsuccess = () => {
      const verdict = checkCatalogSaveState(getAllReq.result || [], record);
      if (!verdict.ok) {
        // Reject with the intended error BEFORE aborting, so tx.onabort's
        // generic abort rejection can never mask it.
        finishReject(verdict.error);
        abortTx();
        return;
      }
      toStore = verdict.record;
      try {
        store.put(toStore);
      } catch (e) {
        finishReject(e);
        abortTx();
      }
    };
    getAllReq.onerror = () => {
      finishReject(getAllReq.error || new Error('Could not verify the saved item before saving.'));
      abortTx();
    };

    tx.oncomplete = () => finishResolve(toStore || record);
    tx.onerror = () => finishReject(tx.error || new Error('Could not save the catalog item.'));
    tx.onabort = () => finishReject(tx.error || new Error('Save aborted (quota exceeded?)'));
  });
}

export async function deleteCatalogItem(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(['catalogItems'], 'readwrite');
    } catch (e) {
      reject(e);
      return;
    }
    const req = tx.objectStore('catalogItems').delete(id);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

function shapeItemLibraryConfigData(data) {
  const src = (data && typeof data === 'object') ? data : {};
  const rawUpdatedAt = src.updatedAt;
  const updatedAt = (typeof rawUpdatedAt === 'number' && Number.isFinite(rawUpdatedAt) && rawUpdatedAt > 0)
    ? rawUpdatedAt
    : null;
  return {
    scope: normalizeCatalogScope(src.scope),
    updatedAt
  };
}

/**
 * Default-scope setting for catalog saves: { scope: 'global'|'company',
 * updatedAt }. A missing record yields the default; a FAILED read rejects so
 * callers (Backup export, picker) can surface the error instead of silently
 * treating the library as unset.
 */
export async function getItemLibraryConfig() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(['settings'], 'readonly');
    } catch (e) {
      reject(e);
      return;
    }
    const req = tx.objectStore('settings').get('itemLibraryConfig');
    req.onsuccess = () => {
      const result = req.result;
      if (!result || !result.data || typeof result.data !== 'object') {
        resolve({ scope: 'global', updatedAt: null });
        return;
      }
      resolve(shapeItemLibraryConfigData(result.data));
    };
    req.onerror = () => reject(req.error);
  });
}

export async function saveItemLibraryConfig(config) {
  const db = await openDB();
  const src = (config && typeof config === 'object') ? config : {};
  const rawUpdatedAt = src.updatedAt;
  const data = {
    scope: normalizeCatalogScope(src.scope),
    updatedAt: (typeof rawUpdatedAt === 'number' && Number.isFinite(rawUpdatedAt) && rawUpdatedAt > 0)
      ? rawUpdatedAt
      : Date.now()
  };
  return new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(['settings'], 'readwrite');
    } catch (e) {
      reject(e);
      return;
    }
    const req = tx.objectStore('settings').put({ key: 'itemLibraryConfig', data });
    req.onsuccess = () => resolve(data);
    req.onerror = () => reject(req.error);
    tx.onerror = () => reject(tx.error || req.error);
    tx.onabort = () => reject(tx.error || new Error('Save aborted (quota exceeded?)'));
  });
}

// Full Backup Export / Import
export async function exportAllData() {
  const db = await openDB();
  const invoices = await getAllInvoices();
  const clients = await getAllClients();
  const companies = await getAllCompanies();
  const profile = await getCompanyProfile();
  const numberingConfig = await getNumberingConfig();
  let activeDraft = null;
  try {
    activeDraft = await getActiveDraftRecord();
  } catch (e) {
    activeDraft = null;
  }
  // v4 sections: catalog items and the item library's default scope. Read
  // failures propagate so the Backup UI reports an export error instead of
  // writing a misleading v4 backup with empty catalog data.
  const catalogItems = await getAllCatalogItems();
  const itemLibraryConfig = await getItemLibraryConfig();

  return {
    version: 4,
    exportedAt: new Date().toISOString(),
    invoices,
    clients,
    companies,
    profile,
    numberingConfig,
    activeDraft,
    catalogItems,
    itemLibraryConfig
  };
}

/**
 * Pure import validation + preparation (H8). Validates every section of a
 * backup payload and returns the records ready to be written in ONE atomic
 * transaction — no IndexedDB required, so tests can exercise it directly.
 * Throws on any invalid record BEFORE anything is written.
 *
 * Output shape:
 * {
 *   invoices, clients, companies,  // direct store puts (validated/prepared)
 *   profileCompany,                // company built from `profile` (may still need a by-id merge with an existing row)
 *   companyProfileSettings,        // legacy settings.companyProfile mirror
 *   numberingConfig,               // normalized numbering config or null
 *   activeDraftRecord,             // shaped activeDraft settings record or null
 *   catalogItems,                  // normalized catalog item records (v4)
 *   itemLibraryConfig              // shaped itemLibraryConfig settings record or null (v4)
 * }
 */
export function validateImportData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid backup format');

  const hasAnyPayload = Array.isArray(data.invoices) || Array.isArray(data.clients) ||
    Array.isArray(data.companies) || data.profile || data.numberingConfig || data.activeDraft ||
    Array.isArray(data.catalogItems) || data.itemLibraryConfig;
  if (!hasAnyPayload) throw new Error('Backup contains no invoices, clients, companies, catalog items, or settings');

  if (data.version !== undefined && data.version !== 2 && data.version !== 3 && data.version !== 4) {
    console.warn('Backup version mismatch (expected 2, 3, or 4, got ' + data.version + '). Attempting best-effort import.');
  }

  const prepared = {
    invoices: [],
    clients: [],
    companies: [],
    profileCompany: null,
    companyProfileSettings: null,
    numberingConfig: null,
    activeDraftRecord: null,
    catalogItems: [],
    itemLibraryConfig: null,
    hasCompaniesSection: false
  };

  if (Array.isArray(data.invoices)) {
    for (const inv of data.invoices) {
      if (!inv || typeof inv.id !== 'string' || !inv.id) {
        throw new Error('Invalid invoice record in backup (missing string id)');
      }
    }
    prepared.invoices = data.invoices.map(inv => prepareImportedInvoice(inv));
  }

  if (Array.isArray(data.clients)) {
    for (const c of data.clients) {
      if (!c || typeof c.id !== 'string' || !c.id) {
        throw new Error('Invalid client record in backup (missing string id)');
      }
    }
    prepared.clients = data.clients.slice();
  }

  // Companies: validate, dedupe by id (merge-by-id semantics).
  const companiesList = [];
  if (Array.isArray(data.companies)) {
    prepared.hasCompaniesSection = true;
    const seen = new Set();
    for (const comp of data.companies) {
      if (!comp || typeof comp.id !== 'string' || !comp.id) {
        throw new Error('Invalid company record in backup (missing string id)');
      }
      if (!seen.has(comp.id)) {
        seen.add(comp.id);
        companiesList.push(Object.assign({}, comp));
      }
    }
  }

  // Profile: handled as a company + default inside the same import
  // transaction (mirrors saveCompanyProfile + setDefaultCompany).
  let defaultTargetId = null;
  const profile = (data.profile && typeof data.profile === 'object') ? data.profile : null;
  if (profile) {
    const profileId = profile.id;
    const alreadyImported = Boolean(profileId && companiesList.some(c => c.id === profileId));
    if (!alreadyImported) {
      prepared.companyProfileSettings = { key: 'companyProfile', data: profile };
      if (profile.name) {
        prepared.profileCompany = {
          id: profileId || makeDBId('comp_'),
          name: profile.name,
          email: profile.email || '',
          phone: profile.phone || '',
          address: profile.address || '',
          taxId: profile.taxId || '',
          payment: profile.payment || '',
          isDefault: true,
          createdAt: profile.createdAt || Date.now(),
          updatedAt: Date.now()
        };
        defaultTargetId = prepared.profileCompany.id;
      }
    } else {
      // The profile row arrives via the companies array; make it the default.
      defaultTargetId = profileId;
    }
  }

  // Exactly-one-default invariant over the merged company set.
  if (prepared.hasCompaniesSection || prepared.profileCompany) {
    const all = prepared.profileCompany ? companiesList.concat([prepared.profileCompany]) : companiesList;
    if (!defaultTargetId) {
      const defaults = all.filter(c => c.isDefault);
      defaultTargetId = (defaults.length > 0 ? defaults[0] : all[0]).id;
    }
    prepared.companies = companiesList.map(c => Object.assign({}, c, { isDefault: c.id === defaultTargetId }));
    if (prepared.profileCompany) {
      prepared.profileCompany = Object.assign({}, prepared.profileCompany, { isDefault: prepared.profileCompany.id === defaultTargetId });
    }
  }

  if (data.numberingConfig) {
    if (typeof data.numberingConfig !== 'object') throw new Error('Invalid numberingConfig in backup');
    prepared.numberingConfig = normalizeNumberingConfig(data.numberingConfig);
    prepared.numberingConfig.updatedAt = Date.now();
  }

  if (data.activeDraft) {
    const draftRecord = (data.activeDraft && data.activeDraft.data !== undefined)
      ? data.activeDraft
      : { data: data.activeDraft, updatedAt: null, activeCompanyProfileId: null };
    const record = {
      key: 'activeDraft',
      data: draftRecord.data,
      updatedAt: draftRecord.updatedAt || Date.now(),
      edited: Boolean(draftRecord.edited)
    };
    if (draftRecord.activeCompanyProfileId) {
      record.activeCompanyProfileId = draftRecord.activeCompanyProfileId;
    }
    prepared.activeDraftRecord = record;
  }

  // Catalog items (v4): every record needs a string id and a non-empty
  // description; everything else is normalized via catalog.js. Source
  // timestamps ride through the `now` option so a restore keeps the saved
  // updatedAt/createdAt/usageCount instead of resetting them.
  if (Array.isArray(data.catalogItems)) {
    const importNow = Date.now();
    const seenIds = new Set();
    for (const raw of data.catalogItems) {
      if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !raw.id.trim()) {
        throw new Error('Invalid catalog item record in backup (missing string id)');
      }
      const description = (typeof raw.description === 'string') ? raw.description.trim() : '';
      if (!description) {
        throw new Error('Invalid catalog item record in backup (missing description)');
      }
      if (seenIds.has(raw.id)) continue; // duplicate id: first record wins
      seenIds.add(raw.id);
      const srcUpdatedAt = Number(raw.updatedAt);
      prepared.catalogItems.push(normalizeCatalogItem(raw, {
        id: raw.id,
        now: (Number.isFinite(srcUpdatedAt) && srcUpdatedAt > 0) ? srcUpdatedAt : importNow
      }));
    }
  }

  if (data.itemLibraryConfig) {
    if (typeof data.itemLibraryConfig !== 'object' || Array.isArray(data.itemLibraryConfig)) {
      throw new Error('Invalid itemLibraryConfig in backup');
    }
    const rawUpdatedAt = Number(data.itemLibraryConfig.updatedAt);
    prepared.itemLibraryConfig = {
      key: 'itemLibraryConfig',
      data: {
        scope: normalizeCatalogScope(data.itemLibraryConfig.scope),
        updatedAt: (Number.isFinite(rawUpdatedAt) && rawUpdatedAt > 0) ? rawUpdatedAt : Date.now()
      }
    };
  }

  return prepared;
}

/**
 * Full backup import (H8): everything is validated and prepared up front,
 * then written in ONE readwrite transaction over invoices, clients,
 * companies, settings and catalogItems. A rejected backup can never land
 * partially.
 */
export async function importAllData(data) {
  const db = await openDB();
  const prepared = validateImportData(data);

  const hasWrites = prepared.invoices.length > 0 || prepared.clients.length > 0 ||
    prepared.companies.length > 0 || prepared.profileCompany !== null ||
    prepared.companyProfileSettings !== null || prepared.numberingConfig !== null ||
    prepared.activeDraftRecord !== null || prepared.catalogItems.length > 0 ||
    prepared.itemLibraryConfig !== null;
  if (!hasWrites) return true;

  return new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(['invoices', 'clients', 'companies', 'settings', 'catalogItems'], 'readwrite');
    } catch (e) {
      reject(e);
      return;
    }
    const invStore = tx.objectStore('invoices');
    const clientStore = tx.objectStore('clients');
    const compStore = tx.objectStore('companies');
    const settingsStore = tx.objectStore('settings');
    const catalogStore = tx.objectStore('catalogItems');

    // Any failure inside the transaction must roll the whole import back:
    // abort BEFORE rejecting so already-queued puts can never commit.
    const abortTx = () => {
      try { tx.abort(); } catch (e) { /* already aborting/aborted */ }
    };

    try {
      for (const inv of prepared.invoices) invStore.put(inv);
      for (const c of prepared.clients) clientStore.put(c);
      for (const c of prepared.companies) compStore.put(c);
      if (prepared.companyProfileSettings) settingsStore.put(prepared.companyProfileSettings);
      if (prepared.numberingConfig) settingsStore.put({ key: 'numberingConfig', data: prepared.numberingConfig });
      if (prepared.activeDraftRecord) settingsStore.put(prepared.activeDraftRecord);
      // Catalog restore lands in the same atomic transaction as everything
      // else: a failed import must never leave half a catalog behind.
      for (const item of prepared.catalogItems) catalogStore.put(item);
      if (prepared.itemLibraryConfig) settingsStore.put(prepared.itemLibraryConfig);
    } catch (e) {
      abortTx();
      reject(e);
      return;
    }

    // Company default invariant across the WHOLE store (backup rows plus any
    // pre-existing rows): the profile company wins the default; otherwise the
    // first default from the merged set is kept. The profile row is also
    // merged with an existing record by id, all inside this transaction.
    if (prepared.hasCompaniesSection || prepared.profileCompany) {
      const getAllReq = compStore.getAll();
      getAllReq.onsuccess = () => {
        try {
          const allCompanies = (getAllReq.result || []).filter(c => c && c.id);
          if (allCompanies.length === 0) {
            // Empty store: just write the prepared profile company, if any.
            if (prepared.profileCompany) compStore.put(prepared.profileCompany);
            return;
          }
          let targetId = prepared.profileCompany ? prepared.profileCompany.id : null;
          if (!targetId) {
            const defaults = allCompanies.filter(c => c.isDefault);
            targetId = (defaults.length > 0 ? defaults[0] : allCompanies[0]).id;
          }
          let profileSeen = !prepared.profileCompany;
          for (const c of allCompanies) {
            const isProfileRow = Boolean(prepared.profileCompany && prepared.profileCompany.id === c.id);
            if (isProfileRow) profileSeen = true;
            const merged = isProfileRow ? Object.assign({}, c, prepared.profileCompany) : c;
            const wantDefault = merged.id === targetId;
            if (isProfileRow || Boolean(merged.isDefault) !== wantDefault) {
              if (!merged.createdAt) merged.createdAt = Date.now();
              compStore.put(Object.assign({}, merged, { isDefault: wantDefault }));
            }
          }
          if (!profileSeen && prepared.profileCompany) {
            compStore.put(prepared.profileCompany);
          }
        } catch (e) {
          abortTx();
          reject(e);
        }
      };
      getAllReq.onerror = () => {
        abortTx();
        reject(getAllReq.error || new Error('Import transaction failed'));
      };
    }

    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error || new Error('Import transaction failed'));
    tx.onabort = () => reject(tx.error || new Error('Import transaction aborted'));
  });
}
