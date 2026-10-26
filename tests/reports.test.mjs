/**
 * Stream A — reports engine tests.
 * Interface under test: ../js/reports.js
 *   normalizeReportInvoice, filterReportRows, buildReportModel,
 *   summarizeHome, toCsv
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeReportInvoice,
  filterReportRows,
  buildReportModel,
  summarizeHome,
  toCsv
} from '../js/reports.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
function makeInvoice(overrides = {}) {
  return Object.assign({
    id: 'inv_1',
    updatedAt: 1000,
    meta: {
      docType: 'invoice',
      number: 'INV/2026-27/0230',
      date: '2026-10-10',
      dueDate: '2026-10-24',
      currency: '$',
      numberFormat: 'international',
      status: 'pending'
    },
    sender: { name: 'Apex Design', email: '', phone: '', address: '', taxId: '' },
    client: { name: 'Starlight', email: '', phone: '', address: '', taxId: '' },
    items: [
      { id: 'i1', description: 'A', hsn: '', qty: 1, rate: 100, discount: 0, taxRate: 18 },
      { id: 'i2', description: 'B', hsn: '', qty: 2, rate: 100, discount: 0, taxRate: 5 }
    ],
    taxes: [
      { id: 't1', name: 'CGST', ratio: 50 },
      { id: 't2', name: 'SGST', ratio: 50 }
    ]
  }, overrides);
}

const COMPANIES = [
  { id: 'comp_apex', name: 'Apex Design Co', isDefault: true },
  { id: 'comp_other', name: 'Other Studio' }
];
const CLIENTS = [
  { id: 'client_star', name: 'Starlight Inc' },
  { id: 'client_foxtrot', name: 'Foxtrot LLC' }
];

// ---------------------------------------------------------------------------
// normalizeReportInvoice
// ---------------------------------------------------------------------------
test('rows carry canonical currency metadata and doc flags', () => {
  const row = normalizeReportInvoice(makeInvoice());
  assert.equal(row.id, 'inv_1');
  assert.equal(row.number, 'INV/2026-27/0230');
  assert.equal(row.docType, 'invoice');
  assert.equal(row.status, 'pending');
  assert.equal(row.statusLabel, 'Payment Pending');
  assert.equal(row.issueDate, '2026-10-10');
  assert.equal(row.dueDate, '2026-10-24');
  assert.equal(row.currencyKey, 'USD');
  assert.equal(row.currencySymbol, '$');
  assert.equal(row.numberFormat, 'international');
  assert.equal(row.isInvoice, true);
  assert.equal(row.isDraft, false);
  assert.equal(row.isPaid, false);
  assert.equal(row.isOutstanding, true);
  // Money is recomputed through the shared calculator.
  assert.equal(row.subtotal, 300);
  assert.equal(row.taxTotal, 28); // 18 + 10
  assert.equal(row.total, 328);
});

test('rows normalize custom currency spellings into one grouping key', () => {
  const a = normalizeReportInvoice(makeInvoice({ meta: Object.assign(makeInvoice().meta, { currency: 'usd' }) }));
  const b = normalizeReportInvoice(makeInvoice({ meta: Object.assign(makeInvoice().meta, { currency: '$' }) }));
  assert.equal(a.currencyKey, b.currencyKey);
  assert.equal(a.currencyKey, 'USD');
});

test('legacy fallback names with linked markers', () => {
  const row = normalizeReportInvoice(makeInvoice()); // no companyId/clientId
  assert.equal(row.companyId, '');
  assert.equal(row.companyName, 'Apex Design');
  assert.equal(row.companyLinked, false);
  assert.equal(row.clientId, '');
  assert.equal(row.clientName, 'Starlight');
  assert.equal(row.clientLinked, false);
});

test('tax by rate and by leg derived from the shared calculator', () => {
  const row = normalizeReportInvoice(makeInvoice());
  const byRate = new Map(row.taxRates.map(r => [r.rate, r]));
  assert.equal(byRate.get(18).taxable, 100);
  assert.equal(byRate.get(18).tax, 18);
  assert.equal(byRate.get(5).taxable, 200);
  assert.equal(byRate.get(5).tax, 10);

  assert.equal(row.taxLegs.length, 2);
  const legs = row.taxLegs.map(l => ({ name: l.name, amount: l.amount })).sort((x, y) => x.name < y.name ? -1 : 1);
  assert.deepEqual(legs, [{ name: 'CGST', amount: 14 }, { name: 'SGST', amount: 14 }]);
  const legSum = row.taxLegs.reduce((s, l) => s + l.amount, 0);
  assert.ok(Math.abs(legSum - row.taxTotal) < 0.01);
});

test('frozen totals win over recomputation, drafts flag correctly', () => {
  const inv = makeInvoice({
    subtotal: 500,
    taxTotal: 90,
    total: 590,
    meta: Object.assign({}, makeInvoice().meta, { currency: '₹', numberFormat: 'indian', status: 'draft' })
  });
  const row = normalizeReportInvoice(inv);
  assert.equal(row.total, 590);
  assert.equal(row.taxTotal, 90);
  assert.equal(row.currencyKey, 'INR');
  assert.equal(row.currencySymbol, '₹');
  assert.equal(row.numberFormat, 'indian');
  assert.equal(row.isDraft, true);
  assert.equal(row.isInvoice, true);
  assert.equal(row.isOutstanding, false);
});

test('conversion link fields land on the row', () => {
  const source = makeInvoice({
    convertedToId: 'inv_conv',
    convertedToNumber: 'INV/2026-27/0300',
    convertedAt: '2026-10-02T00:00:00.000Z'
  });
  const row = normalizeReportInvoice(source);
  assert.equal(row.convertedToId, 'inv_conv');
  assert.equal(row.convertedToNumber, 'INV/2026-27/0300');
  assert.equal(row.convertedAt, '2026-10-02T00:00:00.000Z');
  assert.equal(row.sourceDocId, '');
  assert.ok(row.isConvertedSource);

  const child = makeInvoice({ sourceDocId: 'inv_q', sourceDocNumber: 'QT/2026-27/0253' });
  const row2 = normalizeReportInvoice(child);
  assert.equal(row2.sourceDocId, 'inv_q');
  assert.equal(row2.sourceDocNumber, 'QT/2026-27/0253');
  assert.equal(row2.convertedToId, '');
});

// ---------------------------------------------------------------------------
// Frozen-total reconciliation (H6)
// ---------------------------------------------------------------------------
test('frozen totals reconcile taxRates and taxLegs to the frozen tax (H6)', () => {
  // Items recompute to 300/28/328; the frozen record says 500/90/590.
  const inv = makeInvoice({ subtotal: 500, taxTotal: 90, total: 590 });
  const row = normalizeReportInvoice(inv);
  assert.equal(row.subtotal, 500);
  assert.equal(row.taxTotal, 90);
  assert.equal(row.total, 590);

  const rateSum = row.taxRates.reduce((s, r) => s + r.tax, 0);
  assert.ok(Math.abs(rateSum - 90) < 1e-9, 'taxRates sum must equal frozen taxTotal');
  const legSum = row.taxLegs.reduce((s, l) => s + l.amount, 0);
  assert.ok(Math.abs(legSum - 90) < 1e-9, 'taxLegs sum must equal frozen taxTotal');
  // Dashboard tax basis equals the Tax-tab basis.
  assert.ok(Math.abs(row.taxTotal - rateSum) < 1e-9);
  // Taxable values still come from the computed breakdown.
  const byRate = new Map(row.taxRates.map(r => [r.rate, r]));
  assert.equal(byRate.get(18).taxable, 100);
  assert.equal(byRate.get(5).taxable, 200);
});

test('partial frozen shapes recompute all three totals (H6)', () => {
  const inv = makeInvoice({ subtotal: 500, total: 590 }); // taxTotal missing
  const row = normalizeReportInvoice(inv);
  assert.equal(row.subtotal, 300);
  assert.equal(row.taxTotal, 28);
  assert.equal(row.total, 328);
});

test('zero computed tax with positive frozen tax uses the single-rate fallback (H6)', () => {
  const inv = makeInvoice({
    subtotal: 500, taxTotal: 90, total: 590,
    items: [{ id: 'i1', description: 'A', hsn: '', qty: 1, rate: 500, discount: 0, taxRate: 0 }]
  });
  const row = normalizeReportInvoice(inv);
  assert.equal(row.taxTotal, 90);
  assert.deepEqual(row.taxRates, [{ rate: 0, taxable: 500, tax: 90 }]);
  const legSum = row.taxLegs.reduce((s, l) => s + l.amount, 0);
  assert.ok(Math.abs(legSum - 90) < 1e-9);
});

// ---------------------------------------------------------------------------
// Outstanding = pending invoices only (M1)
// ---------------------------------------------------------------------------
test('outstanding counts pending invoices only; pending proformas stay pipeline (M1)', () => {
  const invoices = [
    makeInvoice({ id: 'inv_p' }), // pending invoice 328
    makeInvoice({ id: 'pi_p', meta: Object.assign({}, makeInvoice().meta, { docType: 'proforma', number: 'PI/2026-27/0017', status: 'pending' }), items: [{ id: 'i1', description: 'A', hsn: '', qty: 1, rate: 700, discount: 0, taxRate: 0 }] })
  ];
  const model = buildReportModel({ invoices, clients: [], companies: [], now: new Date(2026, 9, 26) });
  assert.equal(model.totals.outstandingDocs, 1);
  const usd = model.currencySummaries.find(s => s.currencyKey === 'USD');
  assert.equal(usd.outstanding, 328); // proforma total excluded
  assert.equal(usd.pipeline, 700); // pending proforma remains pipeline
  const proformaRow = model.rows.find(r => r.id === 'pi_p');
  assert.equal(proformaRow.isOutstanding, false);
  // Paid proformas stay reported separately either way.
  const paidPro = makeInvoice({ id: 'pi_paid', meta: Object.assign({}, makeInvoice().meta, { docType: 'proforma', number: 'PI/2026-27/0100', status: 'paid' }), items: [{ id: 'i1', description: 'A', hsn: '', qty: 1, rate: 800, discount: 0, taxRate: 0 }] });
  const paidRow = normalizeReportInvoice(paidPro);
  assert.equal(paidRow.isOutstanding, false);
  assert.equal(paidRow.isPaid, true);
});

// ---------------------------------------------------------------------------
// filterReportRows
// ---------------------------------------------------------------------------
test('filterReportRows matches type, status, dates, company, client and currency', () => {
  const rows = [
    normalizeReportInvoice(makeInvoice({ id: 'a', updatedAt: 1000 })),
    normalizeReportInvoice(makeInvoice({ id: 'b', updatedAt: 2000, meta: Object.assign({}, makeInvoice().meta, { docType: 'quotation', number: 'QT/2026-27/0253', status: 'sent', currency: '₹', numberFormat: 'indian' }) })),
    normalizeReportInvoice(makeInvoice({ id: 'c', updatedAt: 3000, meta: Object.assign({}, makeInvoice().meta, { status: 'paid' }), companyId: 'comp_apex', clientId: 'client_star' }))
  ];

  assert.deepEqual(filterReportRows(rows, { docType: 'invoice' }).map(r => r.id), ['a', 'c']);
  assert.deepEqual(filterReportRows(rows, { docType: 'quotation' }).map(r => r.id), ['b']);
  assert.deepEqual(filterReportRows(rows, { status: 'paid' }).map(r => r.id), ['c']);
  assert.deepEqual(filterReportRows(rows, { status: 'all', docType: 'all' }).map(r => r.id), ['a', 'b', 'c']);
  assert.deepEqual(filterReportRows(rows, { currency: 'INR' }).map(r => r.id), ['b']);
  assert.deepEqual(filterReportRows(rows, { company: 'comp_apex' }).map(r => r.id), ['c']);
  assert.deepEqual(filterReportRows(rows, { client: 'client_star' }).map(r => r.id), ['c']);

  // Inclusive date range.
  assert.deepEqual(filterReportRows(rows, { dateFrom: '2026-10-10', dateTo: '2026-10-10' }).length, 3);
  assert.deepEqual(filterReportRows(rows, { dateFrom: '2026-10-11', dateTo: '' }).length, 0);

  // Combined filters AND together.
  assert.deepEqual(filterReportRows(rows, { docType: 'invoice', status: 'pending', currency: 'USD' }).map(r => r.id), ['a']);
});

// ---------------------------------------------------------------------------
// buildReportModel
// ---------------------------------------------------------------------------
test('currency isolation: summaries never sum across currencies', () => {
  const invoices = [
    makeInvoice({ id: 'a' }), // USD 328 pending
    makeInvoice({
      id: 'b',
      meta: Object.assign({}, makeInvoice().meta, { currency: '₹', numberFormat: 'indian', status: 'paid' }),
      items: [{ id: 'i1', description: 'A', hsn: '', qty: 1, rate: 5000, discount: 0, taxRate: 0 }]
    })
  ];
  const model = buildReportModel({ invoices, clients: [], companies: [], now: new Date(2026, 9, 26) });

  assert.equal(model.currencySummaries.length, 2);
  const usd = model.currencySummaries.find(s => s.currencyKey === 'USD');
  const inr = model.currencySummaries.find(s => s.currencyKey === 'INR');
  assert.equal(usd.revenue, 328);
  assert.equal(usd.taxTotal, 28);
  assert.equal(usd.outstanding, 328);
  assert.equal(usd.paid, 0);
  assert.equal(inr.revenue, 5000);
  assert.equal(inr.paid, 5000);
  assert.equal(inr.outstanding, 0);
  // No cross-currency money fields on top-level totals.
  assert.equal(model.totals.revenue, undefined);
  assert.equal(model.totals.taxTotal, undefined);
});

test('revenue is invoices only; drafts excluded; pipeline includes quote/proforma/estimate', () => {
  const invoices = [
    makeInvoice({ id: 'inv_ok' }), // pending invoice 328
    makeInvoice({ id: 'inv_draft', meta: Object.assign({}, makeInvoice().meta, { status: 'draft' }), total: 99999 }),
    makeInvoice({ id: 'qt', meta: Object.assign({}, makeInvoice().meta, { docType: 'quotation', number: 'QT/2026-27/0253', status: 'sent' }), items: [{ id: 'i1', description: 'A', hsn: '', qty: 1, rate: 500, discount: 0, taxRate: 0 }] }),
    makeInvoice({ id: 'pi', meta: Object.assign({}, makeInvoice().meta, { docType: 'proforma', number: 'PI/2026-27/0017', status: 'pending' }), items: [{ id: 'i1', description: 'A', hsn: '', qty: 1, rate: 700, discount: 0, taxRate: 0 }] })
  ];
  const model = buildReportModel({ invoices, clients: [], companies: [], now: new Date(2026, 9, 26) });
  const usd = model.currencySummaries.find(s => s.currencyKey === 'USD');
  assert.equal(usd.revenue, 328); // quotes/proformas excluded from revenue
  assert.equal(usd.pipeline, 1200); // 500 quote + 700 proforma (not converts, not drafts)
  assert.equal(model.totals.drafts, 1); // draft stays in the document inventory
  assert.equal(model.totals.documents, 4);
  assert.equal(model.totals.invoices, 2);
  assert.equal(model.totals.pipelineDocs, 2);
});

test('paid proformas are reported separately and stay out of revenue', () => {
  const invoices = [
    makeInvoice({ id: 'pi_paid', meta: Object.assign({}, makeInvoice().meta, { docType: 'proforma', number: 'PI/2026-27/0100', status: 'paid' }), items: [{ id: 'i1', description: 'A', hsn: '', qty: 1, rate: 800, discount: 0, taxRate: 0 }] }),
    makeInvoice({ id: 'pi_draft', meta: Object.assign({}, makeInvoice().meta, { docType: 'proforma', number: 'PI/2026-27/0101', status: 'draft' }), items: [{ id: 'i1', description: 'A', hsn: '', qty: 1, rate: 500, discount: 0, taxRate: 0 }] })
  ];
  const model = buildReportModel({ invoices, clients: [], companies: [], now: new Date(2026, 9, 26) });
  assert.equal(model.paidProformaSummary.count, 1);
  assert.equal(model.paidProformaSummary.currencyBuckets.length, 1);
  assert.equal(model.paidProformaSummary.currencyBuckets[0].total, 800);
  const usd = model.currencySummaries.find(s => s.currencyKey === 'USD');
  assert.equal(usd.pipeline, 0); // drafts don't join pipeline, paid proforma isn't pipeline
  assert.equal(usd.revenue, 0);
});

test('conversion counts come from durable links, never PO text', () => {
  const invoices = [
    makeInvoice({ id: 'qt1', meta: Object.assign({}, makeInvoice().meta, { docType: 'quotation', number: 'QT/2026-27/0253', status: 'accepted' }), convertedToId: 'inv_target', convertedToNumber: 'INV/2026-27/0230' }),
    // PO text that mentions conversion must NOT count as a conversion link:
    makeInvoice({ id: 'qt2', meta: Object.assign({}, makeInvoice().meta, { docType: 'quotation', number: 'QT/2026-27/0254', status: 'sent', po: 'Converted to INV-0230' }), items: [{ id: 'i1', description: 'A', hsn: '', qty: 1, rate: 100, discount: 0, taxRate: 0 }] }),
    // The converted child invoice:
    makeInvoice({ id: 'inv_target', sourceDocId: 'qt1', sourceDocNumber: 'QT/2026-27/0253' })
  ];
  const model = buildReportModel({ invoices, clients: [], companies: [], now: new Date(2026, 9, 26) });
  assert.equal(model.conversionSummary.convertedSources, 1);
  assert.equal(model.conversionSummary.invoicesFromConversion, 1);
  assert.equal(model.conversionSummary.links[0].sourceId, 'qt1');
  assert.equal(model.conversionSummary.links[0].invoiceId, 'inv_target');
  // Converted source must not inflate open pipeline; the PO-text quote stays open pipeline.
  const usd = model.currencySummaries.find(s => s.currencyKey === 'USD');
  assert.deepEqual(usd.pipelineDocuments, ['qt2']);
  assert.equal(usd.pipeline, 100);
  assert.equal(usd.pipelineCount, 1);
});

test('company and client summaries link records and fall back to snapshots', () => {
  const invoices = [
    makeInvoice({ id: 'a', companyId: 'comp_apex', clientId: 'client_star' }),
    makeInvoice({ id: 'b' }) // legacy, no links
  ];
  const model = buildReportModel({ invoices, clients: CLIENTS, companies: COMPANIES, now: new Date(2026, 9, 26) });

  const linked = model.companySummaries.find(s => s.id === 'comp_apex');
  assert.equal(linked.name, 'Apex Design Co');
  assert.equal(linked.linked, true);
  assert.equal(linked.count, 1);
  assert.equal(linked.currencyBuckets[0].revenue, 328);

  const legacy = model.companySummaries.find(s => !s.id);
  assert.equal(legacy.name, 'Apex Design'); // sender snapshot name
  assert.equal(legacy.linked, false);
  assert.equal(legacy.count, 1);

  const star = model.clientSummaries.find(s => s.id === 'client_star');
  assert.equal(star.linked, true);
  assert.equal(star.name, 'Starlight Inc');

  const legacyClient = model.clientSummaries.find(s => !s.id);
  assert.equal(legacyClient.name, 'Starlight');
  assert.equal(legacyClient.linked, false);
});

test('recentDocuments are the newest five documents', () => {
  const invoices = [];
  for (let i = 0; i < 8; i++) {
    invoices.push(makeInvoice({
      id: 'd' + i,
      updatedAt: 1000 + i,
      meta: Object.assign({}, makeInvoice().meta, { date: '2026-09-0' + (i + 1), number: 'INV/2026-26/000' + i })
    }));
  }
  const model = buildReportModel({ invoices, clients: [], companies: [], now: new Date(2026, 9, 26) });
  assert.equal(model.recentDocuments.length, 5);
  assert.equal(model.recentDocuments[0].id, 'd7');
});

test('filters produce filteredRows without mutating rows', () => {
  const invoices = [
    makeInvoice({ id: 'a' }),
    makeInvoice({ id: 'qt', meta: Object.assign({}, makeInvoice().meta, { docType: 'quotation', number: 'QT1', status: 'sent' }) })
  ];
  const model = buildReportModel({
    invoices, clients: [], companies: [],
    filters: { docType: 'invoice' },
    now: new Date(2026, 9, 26)
  });
  assert.equal(model.rows.length, 2);
  assert.equal(model.filteredRows.length, 1);
  assert.equal(model.filteredRows[0].id, 'a');
});

test('empty input yields a valid empty model', () => {
  const model = buildReportModel({ invoices: [], clients: [], companies: [], now: new Date(2026, 9, 26) });
  assert.equal(model.rows.length, 0);
  assert.equal(model.filteredRows.length, 0);
  assert.equal(model.totals.documents, 0);
  assert.deepEqual(model.currencySummaries, []);
  assert.equal(model.paidProformaSummary.count, 0);
  assert.equal(model.conversionSummary.convertedSources, 0);
  assert.match(model.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
});

// ---------------------------------------------------------------------------
// summarizeHome
// ---------------------------------------------------------------------------
test('summarizeHome counts documents, invoices, open quotes and unpaid invoices', () => {
  const invoices = [
    makeInvoice({ id: 'a' }), // unpaid invoice
    makeInvoice({ id: 'b', meta: Object.assign({}, makeInvoice().meta, { status: 'paid' }) }),
    makeInvoice({ id: 'c', meta: Object.assign({}, makeInvoice().meta, { status: 'draft' }) }),
    makeInvoice({ id: 'q1', meta: Object.assign({}, makeInvoice().meta, { docType: 'quotation', number: 'QT1', status: 'sent' }) }),
    makeInvoice({ id: 'q2', meta: Object.assign({}, makeInvoice().meta, { docType: 'quotation', number: 'QT2', status: 'accepted', convertedToId: 'x' }) })
  ];
  const home = summarizeHome({ invoices, clients: [], companies: [], now: new Date(2026, 9, 26) });
  assert.equal(home.documentCount, 5);
  assert.equal(home.invoiceCount, 3);
  assert.equal(home.draftCount, 1);
  assert.equal(home.openQuotes, 1); // converted quote is excluded (durable link)
  assert.equal(home.unpaidInvoices, 1);
  assert.ok(Array.isArray(home.perCurrency));
  const usdHome = home.perCurrency.find(c => c.currencyKey === 'USD');
  assert.equal(usdHome.outstanding, 328);
  assert.ok(home.recent.length <= 5);
  assert.equal(home.recent[0].id, 'q2'); // newest by issueDate/updatedAt
});

test('summarizeHome per-currency money is all-time; tax stays current-month (M4)', () => {
  const invoices = [
    // Old unpaid invoice from two months ago.
    makeInvoice({ id: 'old', updatedAt: 500, meta: Object.assign({}, makeInvoice().meta, { date: '2026-08-15' }) }),
    // Current-month paid invoice contributes tax only for this month's window.
    makeInvoice({ id: 'now_paid', meta: Object.assign({}, makeInvoice().meta, { date: '2026-10-20', status: 'paid' }) })
  ];
  const home = summarizeHome({ invoices, clients: [], companies: [], now: new Date(2026, 10, 2) }); // November: the old invoice is outside the current month
  assert.equal(home.unpaidInvoices, 1); // all-time count
  const usdHome = home.perCurrency.find(c => c.currencyKey === 'USD');
  assert.ok(usdHome, 'per-currency bucket must exist even with an empty current month');
  assert.equal(usdHome.outstanding, 328); // all-time outstanding includes the old invoice
  assert.equal(usdHome.revenue, 656); // 328 old unpaid + 328 paid this month
  assert.equal(usdHome.paid, 328);
  assert.equal(usdHome.taxCurrentPeriod, 0); // no invoices dated in November
});

test('summarizeHome per-currency buckets expose numberFormat (follow-up)', () => {
  const invoices = [
    makeInvoice({ id: 'inr1', updatedAt: 100, meta: Object.assign({}, makeInvoice().meta, { currency: '₹', numberFormat: 'indian' }) }),
    makeInvoice({ id: 'usd1', updatedAt: 200, meta: Object.assign({}, makeInvoice().meta, { currency: '$', numberFormat: 'international' }) })
  ];
  const home = summarizeHome({ invoices, clients: [], companies: [], now: new Date(2026, 9, 26) });
  const inr = home.perCurrency.find(c => c.currencyKey === 'INR');
  const usd = home.perCurrency.find(c => c.currencyKey === 'USD');
  assert.ok(inr, 'INR bucket must exist');
  assert.equal(inr.numberFormat, 'indian');
  assert.ok(usd, 'USD bucket must exist');
  assert.equal(usd.numberFormat, 'international');
  // Every bucket carries a usable format so Home cards can format consistently.
  for (const bucket of home.perCurrency) {
    assert.ok(bucket.numberFormat === 'indian' || bucket.numberFormat === 'international');
  }
});

// ---------------------------------------------------------------------------
// toCsv
// ---------------------------------------------------------------------------
test('toCsv escapes quotes, commas and newlines and guards formula injection', () => {
  const csv = toCsv([
    ['Number', 'Amount', 'Command'],
    ['QT/2026-27/0253', '1,234.50', '=SUM(A1)'],
    ['INV/2026-27/0230', '88', '+import'],
    ['INV/2026-27/0231', '99', '@click'],
    ['-123', 'spread', 'a"b\nc']
  ]);
  // Escaping rules, applied per cell in order:
  //   1. cells starting with = + - @ get the guard apostrophe prefix
  //   2. cells containing a quote, comma or newline are wrapped in
  //      double quotes with inner quotes doubled
  const lines = csv.split('\n');
  assert.equal(lines.length, 6); // header + 4 rows (last row spans 2 raw lines)
  assert.equal(lines[0], 'Number,Amount,Command');
  assert.equal(lines[1], 'QT/2026-27/0253,"1,234.50",\'=SUM(A1)');
  assert.equal(lines[2], 'INV/2026-27/0230,88,\'+import');
  assert.equal(lines[3], 'INV/2026-27/0231,99,\'@click');
  assert.equal(lines[4], '\'-123,spread,"a""b');
  assert.equal(lines[5], 'c"');
});

test('toCsv renders non-string cells and handles empty input', () => {
  assert.equal(toCsv([]), '');
  assert.equal(toCsv([['a', 5]]), 'a,5');
  assert.equal(toCsv([[null, undefined, 0]]), ',,0');
});
