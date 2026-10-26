import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { DB_VERSION, prepareInvoiceForSave, validateImportData, checkConversionSourceState, checkCatalogSaveState } from '../js/db.js';
import { normalizeCatalogItem } from '../js/catalog.js';

test('IndexedDB schema version is 4', () => {
  assert.equal(DB_VERSION, 4);
});

test('prepareInvoiceForSave stamps report fields and frozen totals', () => {
  const invoice = {
    meta: {
      docType: 'quotation',
      date: '2026-10-26',
      status: 'sent',
      currency: '$',
      number: 'QT/2026/0253'
    },
    items: [
      { id: 'item_1', description: 'Work', qty: 2, rate: 100, discount: 0, taxRate: 18 }
    ],
    taxes: [
      { id: 'tax_1', name: 'CGST', ratio: 50 },
      { id: 'tax_2', name: 'SGST', ratio: 50 }
    ]
  };

  prepareInvoiceForSave(invoice);

  assert.match(invoice.id, /^inv_/);
  assert.equal(invoice.docType, 'quotation');
  assert.equal(invoice.status, 'sent');
  assert.equal(invoice.issueDate, '2026-10-26');
  assert.ok(invoice.currencyKey);
  assert.equal(invoice.subtotal, 200);
  assert.equal(invoice.taxTotal, 36);
  assert.equal(invoice.total, 236);
  assert.ok(invoice.updatedAt > 0);
  assert.deepEqual(invoice.items[0], {
    id: 'item_1',
    description: 'Work',
    hsn: '',
    qty: 2,
    rate: 100,
    discount: 0,
    taxRate: 18
  });
});

test('prepareInvoiceForSave syncs edited date, status and doc type from meta', () => {
  const invoice = {
    id: 'inv_existing',
    docType: 'invoice',
    status: 'pending',
    issueDate: '2026-01-01',
    meta: {
      docType: 'quotation',
      date: '2026-11-15',
      status: 'paid',
      currency: '€',
      number: 'QT/2026/9999'
    },
    items: [],
    taxes: []
  };

  prepareInvoiceForSave(invoice);

  assert.equal(invoice.docType, 'quotation');
  assert.equal(invoice.meta.docType, 'quotation');
  assert.equal(invoice.status, 'paid');
  assert.equal(invoice.meta.status, 'paid');
  assert.equal(invoice.issueDate, '2026-11-15');
  assert.equal(invoice.meta.date, '2026-11-15');
  assert.equal(invoice.currencyKey, 'EUR');
});

test('prepareInvoiceForSave keeps durable conversion links', () => {
  const invoice = {
    id: 'inv_linked',
    meta: { docType: 'invoice', date: '2026-10-26', status: 'pending', currency: '$' },
    items: [],
    taxes: [],
    sourceDocId: 'doc_source',
    sourceDocNumber: 'QT/2026/0253',
    convertedToId: 'inv_next',
    convertedToNumber: 'INV/2026/0231',
    convertedAt: 123456789,
    duplicatedFromId: 'inv_original'
  };

  prepareInvoiceForSave(invoice);

  assert.equal(invoice.sourceDocId, 'doc_source');
  assert.equal(invoice.sourceDocNumber, 'QT/2026/0253');
  assert.equal(invoice.convertedToId, 'inv_next');
  assert.equal(invoice.convertedToNumber, 'INV/2026/0231');
  assert.equal(invoice.convertedAt, 123456789);
  assert.equal(invoice.duplicatedFromId, 'inv_original');
});

// ---------------------------------------------------------------------------
// L2 — blank/invalid tax rate normalizes to 18
// ---------------------------------------------------------------------------
test('normalizeItems defaults blank/invalid taxRate to 18 (L2)', () => {
  const invoice = {
    id: 'inv_l2',
    meta: { docType: 'invoice', date: '2026-10-26', status: 'pending', currency: '$' },
    items: [
      { id: 'i1', description: 'A', qty: 1, rate: 100, taxRate: '' },
      { id: 'i2', description: 'B', qty: 1, rate: 100, taxRate: 'abc' }
    ],
    taxes: []
  };

  prepareInvoiceForSave(invoice);

  assert.equal(invoice.items[0].taxRate, 18);
  assert.equal(invoice.items[1].taxRate, 18);
  assert.equal(invoice.subtotal, 200);
  assert.equal(invoice.taxTotal, 36);
  assert.equal(invoice.total, 236);
});

// ---------------------------------------------------------------------------
// M5 — preserveFinancials keeps the source's frozen financials
// ---------------------------------------------------------------------------
test('prepareInvoiceForSave preserveFinancials keeps frozen totals and raw items (M5)', () => {
  const source = {
    id: 'inv_src',
    meta: { docType: 'quotation', number: 'QT/2026/0253', date: '2026-10-01', status: 'sent', currency: '$' },
    items: [{ id: 'i1', description: 'Work', qty: 1, rate: 100 }], // no taxRate; would recompute to 118
    taxes: [{ id: 't1', name: 'CGST', ratio: 50 }],
    subtotal: 500,
    taxTotal: 90,
    total: 590,
    convertedToId: 'inv_child',
    convertedToNumber: 'INV/2026/0230',
    convertedAt: '2026-10-02T00:00:00.000Z'
  };
  const rawItems = source.items;

  prepareInvoiceForSave(source, {}, { preserveFinancials: true });

  // Frozen financials untouched — not recomputed from items.
  assert.equal(source.subtotal, 500);
  assert.equal(source.taxTotal, 90);
  assert.equal(source.total, 590);
  // Items/taxes not re-normalized.
  assert.strictEqual(source.items, rawItems);
  assert.equal(source.items[0].taxRate, undefined);
  assert.equal(source.items[0].hsn, undefined);
  // Identity/status/links still stamped.
  assert.equal(source.docType, 'quotation');
  assert.equal(source.status, 'sent');
  assert.equal(source.issueDate, '2026-10-01');
  assert.equal(source.currencyKey, 'USD');
  assert.ok(source.updatedAt > 0);
  assert.equal(source.convertedToId, 'inv_child');
  assert.equal(source.convertedToNumber, 'INV/2026/0230');
  assert.equal(source.convertedAt, '2026-10-02T00:00:00.000Z');
});

// ---------------------------------------------------------------------------
// H8 — import validation is pure and rejects bad payloads
// ---------------------------------------------------------------------------
test('validateImportData rejects invalid invoices, clients and companies (H8)', () => {
  assert.throws(() => validateImportData(null), /Invalid backup format/i);
  assert.throws(() => validateImportData({}), /no invoices|Invalid backup/i);
  assert.throws(() => validateImportData({ invoices: [{ meta: {} }] }), /invoice/i);
  assert.throws(() => validateImportData({ invoices: [{ id: 7 }] }), /invoice/i);
  assert.throws(() => validateImportData({ clients: [{ name: 'No Id' }] }), /client/i);
  assert.throws(() => validateImportData({ companies: [{ id: '' }] }), /company/i);
  assert.throws(() => validateImportData({ numberingConfig: 'nope' }), /numberingConfig/i);
});

test('validateImportData prepares a plain backup payload without IndexedDB (H8)', () => {
  const data = {
    version: 3,
    invoices: [{
      id: 'inv_1',
      meta: { docType: 'invoice', date: '2026-10-26', status: 'pending', currency: '$' },
      items: [{ id: 'i1', description: 'A', qty: 2, rate: 100, taxRate: 18 }],
      taxes: [{ id: 't1', name: 'CGST', ratio: 50 }, { id: 't2', name: 'SGST', ratio: 50 }]
    }],
    clients: [{ id: 'client_1', name: 'Starlight' }],
    companies: [
      { id: 'comp_a', name: 'A', isDefault: true },
      { id: 'comp_a', name: 'A duplicate' }, // deduped by id
      { id: 'comp_b', name: 'B' }
    ],
    profile: { id: 'comp_p', name: 'P Co', email: 'p@x.io' },
    numberingConfig: { mode: 'auto', padding: 5, counter: 12 },
    activeDraft: { data: { meta: { number: 'INV/1' } }, updatedAt: 12345, edited: true }
  };

  const prepared = validateImportData(data);

  // Invoices prepared (items/taxes normalized, frozen totals backfilled).
  assert.equal(prepared.invoices.length, 1);
  assert.equal(prepared.invoices[0].id, 'inv_1');
  assert.equal(prepared.invoices[0].items[0].hsn, '');
  assert.equal(prepared.invoices[0].taxTotal, 36);
  // Clients pass through.
  assert.deepEqual(prepared.clients, [{ id: 'client_1', name: 'Starlight' }]);
  // Companies deduped by id; profile becomes an extra company.
  assert.equal(prepared.companies.length, 2);
  assert.deepEqual(prepared.companies.map(c => c.id).sort(), ['comp_a', 'comp_b']);
  assert.equal(prepared.profileCompany.id, 'comp_p');
  assert.equal(prepared.profileCompany.isDefault, true);
  // Exactly one default across the merged company set, and it is the profile.
  const all = [...prepared.companies, prepared.profileCompany];
  assert.equal(all.filter(c => c.isDefault).length, 1);
  assert.equal(all.find(c => c.isDefault).id, 'comp_p');
  // Legacy companyProfile settings mirror + numbering + draft record.
  assert.equal(prepared.companyProfileSettings.key, 'companyProfile');
  assert.equal(prepared.companyProfileSettings.data.id, 'comp_p');
  assert.equal(prepared.numberingConfig.padding, 5);
  assert.equal(prepared.numberingConfig.counters.invoice, 12);
  assert.equal(prepared.activeDraftRecord.key, 'activeDraft');
  assert.equal(prepared.activeDraftRecord.updatedAt, 12345);
  assert.equal(prepared.activeDraftRecord.edited, true);
});

test('validateImportData keeps exactly one default when no profile is present (H8)', () => {
  const data = {
    version: 3,
    companies: [
      { id: 'comp_a', name: 'A' },
      { id: 'comp_b', name: 'B', isDefault: true },
      { id: 'comp_c', name: 'C', isDefault: true }
    ]
  };
  const prepared = validateImportData(data);
  assert.equal(prepared.companies.length, 3);
  assert.equal(prepared.profileCompany, null);
  assert.equal(prepared.companyProfileSettings, null);
  const defaults = prepared.companies.filter(c => c.isDefault);
  assert.equal(defaults.length, 1);
  assert.equal(defaults[0].id, 'comp_b'); // first default wins
});

test('validateImportData accepts v2 backups without companies (H8)', () => {
  const data = {
    version: 2,
    invoices: [{ id: 'inv_v2', meta: { date: '2026-01-05', status: 'paid', currency: '$' }, items: [], taxes: [] }],
    profile: { name: 'Legacy Co' } // no id -> becomes a fresh default company
  };
  const prepared = validateImportData(data);
  assert.equal(prepared.invoices.length, 1);
  assert.equal(prepared.invoices[0].status, 'paid');
  assert.equal(prepared.profileCompany.name, 'Legacy Co');
  assert.ok(typeof prepared.profileCompany.id === 'string' && prepared.profileCompany.id.startsWith('comp_'));
  assert.equal(prepared.companyProfileSettings.data.name, 'Legacy Co');
});

// ---------------------------------------------------------------------------
// v4 — catalog items + item library config in backup import
// ---------------------------------------------------------------------------
test('validateImportData accepts v4 backups with catalogItems and itemLibraryConfig', () => {
  const data = {
    version: 4,
    catalogItems: [
      {
        id: 'cat_1',
        description: 'Paper A4',
        rate: 12.5,
        taxRate: 18,
        currency: '$',
        scope: 'global'
      },
      {
        id: 'cat_2',
        description: 'Logo print',
        rate: 500,
        taxRate: 0,
        currency: '₹',
        scope: 'company',
        companyId: 'comp_1',
        usageCount: 3,
        lastUsedAt: 999,
        createdAt: 111,
        updatedAt: 222
      }
    ],
    itemLibraryConfig: { scope: 'company', updatedAt: 333 }
  };

  const prepared = validateImportData(data);

  assert.equal(prepared.catalogItems.length, 2);
  const first = prepared.catalogItems[0];
  assert.equal(first.id, 'cat_1');
  assert.equal(first.description, 'Paper A4');
  assert.equal(first.descriptionKey, 'paper a4');
  assert.equal(first.hsn, '');
  assert.equal(first.rate, 12.5);
  assert.equal(first.currencyKey, 'USD');
  assert.equal(first.scope, 'global');
  assert.equal(first.companyId, null);
  assert.equal(first.usageCount, 0);
  assert.ok(first.createdAt > 0);
  assert.ok(first.updatedAt > 0);

  const second = prepared.catalogItems[1];
  assert.equal(second.id, 'cat_2');
  assert.equal(second.currencyKey, 'INR');
  assert.equal(second.scope, 'company');
  assert.equal(second.companyId, 'comp_1');
  assert.equal(second.usageCount, 3); // preserved
  assert.equal(second.lastUsedAt, 999); // preserved
  assert.equal(second.createdAt, 111); // preserved
  assert.equal(second.updatedAt, 222); // preserved through restore

  assert.equal(prepared.itemLibraryConfig.key, 'itemLibraryConfig');
  assert.equal(prepared.itemLibraryConfig.data.scope, 'company');
  assert.equal(prepared.itemLibraryConfig.data.updatedAt, 333);
});

test('validateImportData normalizes and stamps missing catalog timestamps', () => {
  const data = {
    version: 4,
    catalogItems: [
      { id: 'cat_3', description: 'Bare item', scope: 'bogus', taxRate: '', currency: 'usd' }
    ],
    itemLibraryConfig: { scope: 'weird' }
  };
  const prepared = validateImportData(data);

  const item = prepared.catalogItems[0];
  assert.equal(item.descriptionKey, 'bare item');
  assert.equal(item.scope, 'global');
  assert.equal(item.companyId, null);
  assert.equal(item.taxRate, 18); // blank taxRate defaults like line items
  assert.equal(item.currencyKey, 'USD');
  assert.equal(item.usageCount, 0);
  assert.ok(Number.isFinite(item.createdAt) && item.createdAt > 0);
  assert.ok(Number.isFinite(item.updatedAt) && item.updatedAt > 0);

  assert.equal(prepared.itemLibraryConfig.data.scope, 'global');
  assert.ok(Number.isFinite(prepared.itemLibraryConfig.data.updatedAt));
});

test('validateImportData rejects invalid catalog item records', () => {
  assert.throws(() => validateImportData({ catalogItems: [{ id: 'cat_1', description: '   ' }] }), /catalog/i);
  assert.throws(() => validateImportData({ catalogItems: [{ description: 'No id' }] }), /catalog/i);
  assert.throws(() => validateImportData({ catalogItems: [{ id: 7, description: 'x' }] }), /catalog/i);
  assert.throws(() => validateImportData({ catalogItems: [{ id: 'cat_1', description: 'ok' }, 'junk'] }), /catalog/i);
  assert.throws(() => validateImportData({ catalogItems: [{ id: 'cat_1', description: 'ok' }], itemLibraryConfig: 'nope' }), /itemLibraryConfig/i);
});

test('validateImportData accepts catalog-only v4 payloads', () => {
  const data = {
    version: 4,
    catalogItems: [{ id: 'cat_1', description: 'Paper A4', scope: 'global', currency: '$' }]
  };
  const prepared = validateImportData(data);
  assert.equal(prepared.catalogItems.length, 1);
  assert.equal(prepared.invoices.length, 0);
  assert.equal(prepared.itemLibraryConfig, null);
});

test('validateImportData keeps v2/v3 imports free of catalog data', () => {
  const v3 = validateImportData({
    version: 3,
    companies: [{ id: 'comp_a', name: 'A' }]
  });
  assert.deepEqual(v3.catalogItems, []);
  assert.equal(v3.itemLibraryConfig, null);

  const v2 = validateImportData({
    version: 2,
    invoices: [{ id: 'inv_v2', meta: { date: '2026-01-05', status: 'paid', currency: '$' }, items: [], taxes: [] }]
  });
  assert.deepEqual(v2.catalogItems, []);
  assert.equal(v2.itemLibraryConfig, null);
});

// ---------------------------------------------------------------------------
// Catalog save contract — dedupe decided inside the save transaction
// ---------------------------------------------------------------------------
test('checkCatalogSaveState allows a fresh item with no matchKey collision', () => {
  const stored = [
    normalizeCatalogItem({ description: 'Paper A4', scope: 'global', currency: '$' }, { id: 'cat_1', now: 1 })
  ];
  const record = normalizeCatalogItem(
    { description: 'Sticker sheet', scope: 'global', currency: '$' },
    { id: 'cat_2', now: 2 }
  );

  const verdict = checkCatalogSaveState(stored, record);

  assert.equal(verdict.ok, true);
  assert.equal(verdict.match, null);
  assert.equal(verdict.record, record); // untouched on the insert path
});

test('checkCatalogSaveState updates in place and never rewinds stored history', () => {
  const stored = [
    normalizeCatalogItem(
      { description: 'Paper A4', scope: 'global', currency: '$', usageCount: 9, lastUsedAt: 700, createdAt: 100 },
      { id: 'cat_1', now: 1 }
    )
  ];
  // Caller re-saves a stale copy: no usage counters, changed price.
  const stale = { id: 'cat_1', description: 'Paper A4', rate: 99, currency: '$', scope: 'global' };
  const record = normalizeCatalogItem(stale, { now: 2000 });
  assert.equal(record.usageCount, 0); // incoming copy would have reset it

  const verdict = checkCatalogSaveState(stored, record);

  assert.equal(verdict.ok, true);
  assert.equal(verdict.match.id, 'cat_1');
  assert.equal(verdict.record.usageCount, 9); // stored history wins — no rewind
  assert.equal(verdict.record.lastUsedAt, 700); // preserved
  assert.equal(verdict.record.createdAt, 100); // preserved
  assert.equal(verdict.record.updatedAt, 2000); // re-stamped
  assert.equal(verdict.record.rate, 99); // caller's content still wins
  assert.equal(verdict.record.id, 'cat_1');
  // The check is pure: the input record object is never mutated.
  assert.equal(record.usageCount, 0);
  assert.equal(record.lastUsedAt, null);
  assert.equal(record.createdAt, 2000);
});

test('checkCatalogSaveState refuses a different-id collision (duplicate rule)', () => {
  const stored = [
    normalizeCatalogItem({ description: 'Paper A4', scope: 'global', currency: '$' }, { id: 'cat_1', now: 1 })
  ];
  const message = 'An item with this description already exists in this scope and currency. Edit that item instead.';

  // Editing record cat_2 into a colliding shape: refused, never merged.
  const editor = normalizeCatalogItem(
    { id: 'cat_2', description: 'Paper A4', scope: 'global', currency: '$' },
    { now: 2 }
  );
  const verdict = checkCatalogSaveState(stored, editor);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.error.message, message);
  assert.equal(verdict.match.id, 'cat_1');

  // Two Add saves (fresh generated ids) collide too: the second save is
  // refused, so two tabs can never create two records with one matchKey.
  const fresh = normalizeCatalogItem(
    { description: 'PAPER A4', scope: 'global', currency: 'usd' },
    { id: 'cat_fresh', now: 3 }
  );
  const verdictFresh = checkCatalogSaveState(stored, fresh);
  assert.equal(verdictFresh.ok, false);
  assert.equal(verdictFresh.error.message, message);

  // Same description in another scope/currency is NOT a collision.
  const other = normalizeCatalogItem(
    { description: 'Paper A4', scope: 'company', companyId: 'comp_1', currency: '₹' },
    { id: 'cat_9', now: 4 }
  );
  assert.equal(checkCatalogSaveState(stored, other).ok, true);
});

test('checkCatalogSaveState tolerates missing store contents or record', () => {
  const record = normalizeCatalogItem({ description: 'X', scope: 'global', currency: '$' }, { id: 'cat_x', now: 1 });
  assert.equal(checkCatalogSaveState(null, record).ok, true);
  assert.equal(checkCatalogSaveState(undefined, record).ok, true);

  const bad = checkCatalogSaveState([], null);
  assert.equal(bad.ok, false);
  assert.match(bad.error.message, /invalid catalog item/i);
});

// ---------------------------------------------------------------------------
// Source contract — export reads fail loudly; catalog writes stay atomic
// ---------------------------------------------------------------------------
test('source contract: export reads propagate failures and catalog writes stay atomic', () => {
  const src = readFileSync(new URL('../js/db.js', import.meta.url), 'utf8');

  // exportAllData: catalog/config reads must propagate failures (no silent
  // empty fallbacks), while the pre-existing activeDraft fallback stays.
  const exportStart = src.indexOf('export async function exportAllData');
  const validateStart = src.indexOf('export function validateImportData');
  assert.ok(exportStart !== -1 && validateStart > exportStart, 'export section found');
  const exportSrc = src.slice(exportStart, validateStart);
  assert.ok(exportSrc.includes('await getAllCatalogItems()'), 'export reads the catalog directly');
  assert.ok(exportSrc.includes('await getItemLibraryConfig()'), 'export reads the config directly');
  assert.ok(!exportSrc.includes('let catalogItems = []'), 'no silent empty catalog fallback in export');
  assert.ok(!exportSrc.includes('let itemLibraryConfig = null'), 'no silent null config fallback in export');
  assert.ok(exportSrc.includes('try {'), 'intentional activeDraft fallback kept');

  // saveCatalogItem: dedupe check + put inside ONE readwrite transaction,
  // with the intended rejection raised before the transaction aborts.
  const saveStart = src.indexOf('export async function saveCatalogItem');
  const saveEnd = src.indexOf('export async function deleteCatalogItem');
  assert.ok(saveStart !== -1 && saveEnd > saveStart, 'saveCatalogItem section found');
  const saveSrc = src.slice(saveStart, saveEnd);
  assert.ok(saveSrc.includes("db.transaction(['catalogItems'], 'readwrite')"), 'single catalogItems readwrite transaction');
  assert.ok(saveSrc.includes('.getAll()'), 'dedupe re-read happens inside the transaction');
  assert.ok(saveSrc.includes('checkCatalogSaveState'), 'the dedupe verdict decides the put');
  assert.ok(saveSrc.indexOf('.getAll()') < saveSrc.indexOf('store.put('), 'put happens after the dedupe verdict');
  assert.ok(saveSrc.includes('finishReject(verdict.error)'), 'collision rejection wins before abort');

  // importAllData: the single import transaction includes catalogItems.
  assert.ok(
    src.includes("tx = db.transaction(['invoices', 'clients', 'companies', 'settings', 'catalogItems'], 'readwrite')"),
    'import transaction covers catalogItems'
  );
});

// ---------------------------------------------------------------------------
// Cross-tab double conversion — pure source-contract check
// ---------------------------------------------------------------------------
test('conversion source contract refuses missing and already-converted sources', () => {
  // Stored source missing (deleted in another tab / never persisted).
  const missing = checkConversionSourceState(null, 'inv_new');
  assert.equal(missing.ok, false);
  assert.match(missing.error.message, /no longer exists/i);

  // Stored source already converted to a DIFFERENT invoice.
  const done = checkConversionSourceState({ id: 'inv_src', convertedToId: 'inv_other' }, 'inv_new');
  assert.equal(done.ok, false);
  assert.match(done.error.message, /already been converted/i);

  // Same conversion id: idempotent retry of this exact conversion is allowed.
  const same = checkConversionSourceState({ id: 'inv_src', convertedToId: 'inv_new', convertedToNumber: 'INV/1' }, 'inv_new');
  assert.equal(same.ok, true);

  // Clean stored source is allowed.
  assert.equal(checkConversionSourceState({ id: 'inv_src' }, 'inv_new').ok, true);
});
