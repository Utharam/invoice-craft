/**
 * Stream A — numbering module tests.
 * Interface under test: ../js/numbering.js
 *   DEFAULT_NUMBERING_CONFIG, normalizeNumberingConfig, formatFinancialYear,
 *   resolvePeriodKey, parseLocalDate, getCounter, generateDocumentNumber,
 *   periodRollover, advanceTypeCounter
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_NUMBERING_CONFIG,
  normalizeNumberingConfig,
  formatFinancialYear,
  resolvePeriodKey,
  parseLocalDate,
  getCounter,
  generateDocumentNumber,
  periodRollover,
  advanceTypeCounter
} from '../js/numbering.js';

// ---------------------------------------------------------------------------
// Defaults & normalization
// ---------------------------------------------------------------------------
test('DEFAULT_NUMBERING_CONFIG carries per-type counter maps', () => {
  assert.ok(DEFAULT_NUMBERING_CONFIG);
  assert.ok(DEFAULT_NUMBERING_CONFIG.counters);
  assert.ok(DEFAULT_NUMBERING_CONFIG.startingCounters);
  for (const t of ['invoice', 'quotation', 'estimate', 'proforma']) {
    assert.ok(Number.isFinite(Number(DEFAULT_NUMBERING_CONFIG.counters[t])));
    assert.ok(Number.isFinite(Number(DEFAULT_NUMBERING_CONFIG.startingCounters[t])));
  }
});

test('normalizeNumberingConfig migrates the legacy shared counter to invoice only', () => {
  const legacy = {
    mode: 'auto',
    scheme: '{PREFIX}/{FY}/{COUNTER}',
    prefixInvoice: 'INV',
    prefixQuotation: 'QT',
    counter: 229,
    startingCounter: 1,
    padding: 4,
    resetPeriod: 'financial_year',
    lastPeriodKey: ''
  };
  const cfg = normalizeNumberingConfig(legacy);
  // Legacy counter flows to the invoice counter...
  assert.equal(cfg.counters.invoice, 229);
  // ...never to the other types' counters (they start from their own value).
  assert.equal(cfg.counters.quotation, 1);
  assert.equal(cfg.counters.estimate, 1);
  assert.equal(cfg.counters.proforma, 1);
  // Mirror fields stay in sync for older call sites.
  assert.equal(cfg.counter, 229);
  assert.equal(cfg.startingCounter, 1);
  // Migration must be idempotent.
  const again = normalizeNumberingConfig(cfg);
  assert.deepEqual(again.counters, cfg.counters);
  assert.deepEqual(again.startingCounters, cfg.startingCounters);
});

test('normalizeNumberingConfig keeps explicit independent counters', () => {
  const cfg = normalizeNumberingConfig({
    counter: 999,
    startingCounter: 1,
    counters: { invoice: 230, quotation: 253, estimate: 3, proforma: 4 },
    startingCounters: { invoice: 230, quotation: 250, estimate: 1, proforma: 1 }
  });
  assert.deepEqual(cfg.counters, { invoice: 230, quotation: 253, estimate: 3, proforma: 4 });
  assert.deepEqual(cfg.startingCounters, { invoice: 230, quotation: 250, estimate: 1, proforma: 1 });
  assert.equal(cfg.counter, 230);
});

test('normalizeNumberingConfig skips legacy counter when counters object already lists invoice', () => {
  const cfg = normalizeNumberingConfig({ counter: 77, counters: { invoice: 230 } });
  assert.equal(cfg.counters.invoice, 230);
  assert.equal(cfg.counters.quotation, 1);
});

// ---------------------------------------------------------------------------
// Date & period helpers
// ---------------------------------------------------------------------------
test('parseLocalDate treats YYYY-MM-DD as a local calendar date, not UTC', () => {
  const d = parseLocalDate('2026-02-28');
  assert.ok(d instanceof Date);
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 1);
  assert.equal(d.getDate(), 28);
  // Not shifted into the previous/next day by a timezone.
  assert.equal(d.getHours(), 0);
  assert.equal(d.getMinutes(), 0);

  const first = parseLocalDate('2026-03-01');
  assert.equal(first.getDate(), 1);
  assert.equal(first.getMonth(), 2);

  // Full timestamps keep instant equality (they are not calendar-shifted).
  const ts = '2026-12-31T23:59:59.000Z';
  assert.equal(parseLocalDate(ts).getTime(), new Date(ts).getTime());

  assert.ok(isNaN(parseLocalDate('not-a-date').getTime()));
  assert.ok(isNaN(parseLocalDate('').getTime()));
});

test('formatFinancialYear follows the April–March FY', () => {
  assert.equal(formatFinancialYear(new Date(2026, 9, 26)), '2026-27'); // October
  assert.equal(formatFinancialYear(new Date(2026, 3, 1)), '2026-27');  // April 1
  assert.equal(formatFinancialYear(new Date(2026, 2, 31)), '2025-26'); // March 31
  assert.equal(formatFinancialYear(new Date(2025, 11, 31)), '2025-26'); // December
});

test('resolvePeriodKey matches the reset policy', () => {
  assert.equal(resolvePeriodKey(new Date(2026, 9, 15), 'financial_year'), '2026-27');
  assert.equal(resolvePeriodKey(new Date(2026, 9, 15), 'calendar_year'), '2026');
  assert.equal(resolvePeriodKey(new Date(2026, 8, 30), 'monthly'), '2026-09');
  assert.equal(resolvePeriodKey(new Date(2026, 9, 15), 'never'), 'continuous');
  assert.equal(resolvePeriodKey(new Date(2026, 9, 15), 'unknown'), 'continuous');
});

// ---------------------------------------------------------------------------
// Number generation
// ---------------------------------------------------------------------------
test('generateDocumentNumber produces per-type numbers from per-type counters', () => {
  const cfg = normalizeNumberingConfig({
    padding: 4,
    counters: { invoice: 230, quotation: 253, estimate: 3, proforma: 17 },
    lastPeriodKey: '2026-27'
  });
  assert.equal(generateDocumentNumber('invoice', '2026-10-26', cfg), 'INV/2026-27/0230');
  assert.equal(generateDocumentNumber('quotation', '2026-10-26', cfg), 'QT/2026-27/0253');
  assert.equal(generateDocumentNumber('estimate', '2026-10-26', cfg), 'EST/2026-27/0003');
  assert.equal(generateDocumentNumber('proforma', '2026-10-26', cfg), 'PI/2026-27/0017');
});

test('generateDocumentNumber supports scheme tokens and custom prefixes', () => {
  const cfg = normalizeNumberingConfig({
    scheme: '{PREFIX}-{YYYY}-{MM}-{COUNTER}',
    prefixInvoice: 'ABL',
    padding: 3,
    counters: { invoice: 42, quotation: 1, estimate: 1, proforma: 1 }
  });
  assert.equal(generateDocumentNumber('invoice', '2026-01-05', cfg), 'ABL-2026-01-042');
  // {YY} token and FY token
  const cfg2 = normalizeNumberingConfig({
    scheme: '{PREFIX}/{YY}-{COUNTER}',
    padding: 2,
    counters: { invoice: 7, quotation: 1, estimate: 1, proforma: 1 }
  });
  assert.equal(generateDocumentNumber('invoice', '2026-10-26', cfg2), 'INV/26-07');
});

test('generateDocumentNumber parses the date locally (no UTC day shift)', () => {
  const cfg = normalizeNumberingConfig({
    scheme: '{PREFIX}/{YYYY}-{MM}',
    padding: 4,
    counters: { invoice: 1, quotation: 1, estimate: 1, proforma: 1 }
  });
  assert.equal(generateDocumentNumber('invoice', '2026-03-01', cfg).includes('2026-03'), true);
  assert.equal(generateDocumentNumber('invoice', '2026-12-31', cfg).includes('2026-12'), true);
  // Invalid date -> falls back to today, still produces a number.
  assert.match(generateDocumentNumber('invoice', 'garbage', cfg), /^INV\//);
});

test('generateDocumentNumber honours an explicit overrideCounter', () => {
  const cfg = normalizeNumberingConfig({ padding: 4, counters: { invoice: 230, quotation: 1, estimate: 1, proforma: 1 } });
  assert.equal(generateDocumentNumber('invoice', '2026-10-26', cfg, 500), 'INV/2026-27/0500');
});

test('manual mode returns an empty string unless caller supplies an override', () => {
  const cfg = normalizeNumberingConfig({ mode: 'manual', padding: 4, counters: { invoice: 5, quotation: 1, estimate: 1, proforma: 1 } });
  assert.equal(generateDocumentNumber('invoice', '2026-10-26', cfg), '');
  assert.equal(generateDocumentNumber('quotation', '2026-10-26', cfg), '');
  assert.equal(generateDocumentNumber('invoice', '2026-10-26', cfg, 9), 'INV/2026-27/0009');
});

// ---------------------------------------------------------------------------
// Counters
// ---------------------------------------------------------------------------
test('getCounter returns the counter for the requested type', () => {
  const cfg = normalizeNumberingConfig({ counters: { invoice: 230, quotation: 253, estimate: 3, proforma: 17 } });
  assert.equal(getCounter(cfg, 'invoice'), 230);
  assert.equal(getCounter(cfg, 'quotation'), 253);
  assert.equal(getCounter(cfg, 'estimate'), 3);
  assert.equal(getCounter(cfg, 'proforma'), 17);
  assert.equal(getCounter(cfg, 'unknown'), 1);
});

test('advanceTypeCounter advances only the requested type on a clone', () => {
  const base = normalizeNumberingConfig({
    counters: { invoice: 229, quotation: 253, estimate: 3, proforma: 4 },
    startingCounters: { invoice: 230, quotation: 250, estimate: 1, proforma: 1 }
  });
  const next = advanceTypeCounter(base, 'invoice');
  assert.equal(next.counters.invoice, 230);
  assert.equal(next.counter, 230);
  assert.equal(next.counters.quotation, 253);
  // Original config is untouched.
  assert.equal(base.counters.invoice, 229);
  assert.equal(base.counter, 229);
});

test('conversion numbering consumes the invoice counter only', () => {
  // Quote at 253, fresh invoices at 230: converting the quote must take 230
  // and leave the quote sequence alone.
  const cfg = normalizeNumberingConfig({
    padding: 4,
    counters: { invoice: 229, quotation: 253, estimate: 3, proforma: 4 },
    lastPeriodKey: '2026-27'
  });
  let advanced = advanceTypeCounter(cfg, 'invoice');
  let firstConverted = generateDocumentNumber('invoice', '2026-10-26', advanced);
  assert.equal(firstConverted, 'INV/2026-27/0230');
  // The quote still formats from its own counter.
  assert.equal(generateDocumentNumber('quotation', '2026-10-26', advanced), 'QT/2026-27/0253');
  // A second conversion uses 231 and code remains quote-only.
  advanced = advanceTypeCounter(advanced, 'invoice');
  assert.equal(generateDocumentNumber('invoice', '2026-10-26', advanced), 'INV/2026-27/0231');
  assert.equal(advanced.counters.quotation, 253);
});

// ---------------------------------------------------------------------------
// Period rollover
// ---------------------------------------------------------------------------
test('periodRollover resets every type counter to its own starting value', () => {
  const stale = normalizeNumberingConfig({
    resetPeriod: 'financial_year',
    lastPeriodKey: '2025-26',
    counters: { invoice: 45, quotation: 60, estimate: 2, proforma: 9 },
    startingCounters: { invoice: 230, quotation: 253, estimate: 3, proforma: 10 }
  });
  const { config, changed } = periodRollover(stale, new Date(2026, 9, 15));
  assert.equal(changed, true);
  assert.deepEqual(config.counters, { invoice: 230, quotation: 253, estimate: 3, proforma: 10 });
  assert.equal(config.lastPeriodKey, '2026-27');
  // Pure: input untouched.
  assert.equal(stale.counters.invoice, 45);
});

test('already-current config is untouched by rollover', () => {
  const current = normalizeNumberingConfig({
    resetPeriod: 'financial_year',
    lastPeriodKey: '2026-27',
    counters: { invoice: 45, quotation: 60, estimate: 2, proforma: 9 },
    startingCounters: { invoice: 230, quotation: 253, estimate: 3, proforma: 10 }
  });
  const { config, changed } = periodRollover(current, new Date(2026, 9, 15));
  assert.equal(changed, false);
  assert.deepEqual(config.counters, current.counters);
  assert.equal(config.lastPeriodKey, '2026-27');
});

test('first run stamps the period key without resetting counters', () => {
  const fresh = normalizeNumberingConfig({
    resetPeriod: 'financial_year',
    lastPeriodKey: '',
    counters: { invoice: 45, quotation: 7, estimate: 2, proforma: 9 }
  });
  const { config, changed } = periodRollover(fresh, new Date(2026, 9, 15));
  assert.equal(changed, false);
  assert.deepEqual(config.counters, fresh.counters);
  assert.equal(config.lastPeriodKey, '2026-27');
});

test('rollover honours monthly and calendar reset policies', () => {
  const staleMonthly = normalizeNumberingConfig({
    resetPeriod: 'monthly',
    lastPeriodKey: '2026-09',
    counters: { invoice: 5, quotation: 2, estimate: 1, proforma: 1 },
    startingCounters: { invoice: 1, quotation: 1, estimate: 1, proforma: 1 }
  });
  const monthly = periodRollover(staleMonthly, new Date(2026, 9, 12));
  assert.equal(monthly.changed, true);
  assert.equal(monthly.config.lastPeriodKey, '2026-10');
  assert.equal(monthly.config.counters.invoice, 1);

  const staleYearly = normalizeNumberingConfig({
    resetPeriod: 'calendar_year',
    lastPeriodKey: '2025',
    counters: { invoice: 5, quotation: 2, estimate: 1, proforma: 1 },
    startingCounters: { invoice: 1, quotation: 1, estimate: 1, proforma: 1 }
  });
  const yearly = periodRollover(staleYearly, new Date(2026, 0, 1));
  assert.equal(yearly.changed, true);
  assert.equal(yearly.config.lastPeriodKey, '2026');
});

test("'never' policy never resets counters", () => {
  const cfg = normalizeNumberingConfig({
    resetPeriod: 'never',
    lastPeriodKey: '',
    counters: { invoice: 5, quotation: 2, estimate: 1, proforma: 1 },
    startingCounters: { invoice: 1, quotation: 1, estimate: 1, proforma: 1 }
  });
  const { config, changed } = periodRollover(cfg, new Date(2026, 9, 15));
  assert.equal(changed, false);
  assert.equal(config.counters.invoice, 5);
});

test('manual mode rollover is a no-op for counters', () => {
  const cfg = normalizeNumberingConfig({
    mode: 'manual',
    resetPeriod: 'financial_year',
    lastPeriodKey: '2025-26',
    counters: { invoice: 5, quotation: 2, estimate: 1, proforma: 1 },
    startingCounters: { invoice: 1, quotation: 1, estimate: 1, proforma: 1 }
  });
  const { changed } = periodRollover(cfg, new Date(2026, 9, 15));
  assert.equal(changed, false);
});
