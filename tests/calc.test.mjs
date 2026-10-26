/**
 * Stream A — calc module tests.
 * Interface under test: ../js/calc.js
 *   CURRENCY_REGISTRY, normalizeCurrency, formatMoney, amountToWords,
 *   clampNum, calculateTotals, calculateTotal, splitTaxLegs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CURRENCY_REGISTRY,
  normalizeCurrency,
  formatMoney,
  amountToWords,
  clampNum,
  calculateTotals,
  calculateTotal,
  splitTaxLegs
} from '../js/calc.js';

// ---------------------------------------------------------------------------
// Currency registry & normalizeCurrency
// ---------------------------------------------------------------------------
test('currency registry exposes canonical entries', () => {
  assert.ok(CURRENCY_REGISTRY && typeof CURRENCY_REGISTRY === 'object');
  const usd = normalizeCurrency('$');
  assert.equal(usd.key, 'USD');
  assert.equal(usd.symbol, '$');
  const inr = normalizeCurrency('₹');
  assert.equal(inr.key, 'INR');
  assert.equal(inr.symbol, '₹');
});

test('normalizeCurrency trims and uppercases custom keys for grouping', () => {
  const usd = normalizeCurrency(' usd ');
  assert.equal(usd.key, 'USD');
  assert.equal(usd.code, 'USD');

  const custom = normalizeCurrency('credits');
  assert.equal(custom.key, 'CREDITS');
  assert.equal(custom.code, 'CREDITS');
  assert.equal(custom.symbol, 'credits');
  assert.ok(custom.majorPlural && custom.minorPlural);

  // '$' and 'usd' must group under the same key.
  assert.equal(normalizeCurrency('$').key, normalizeCurrency('usd').key);
});

test('BHD, KWD and OMR use three decimals; default is two', () => {
  assert.equal(normalizeCurrency('BHD').decimals, 3);
  assert.equal(normalizeCurrency('KWD').decimals, 3);
  assert.equal(normalizeCurrency('OMR').decimals, 3);
  assert.equal(normalizeCurrency('$').decimals, 2);
  assert.equal(normalizeCurrency('€').decimals, 2);
  assert.equal(normalizeCurrency('unknown-coin').decimals, 2);
});

test('normalizeCurrency has an empty safe default', () => {
  const empty = normalizeCurrency('');
  assert.equal(empty.key, '');
  assert.equal(empty.symbol, '');
  assert.equal(empty.decimals, 2);
});

// ---------------------------------------------------------------------------
// formatMoney
// ---------------------------------------------------------------------------
test('formatMoney international grouping', () => {
  assert.equal(formatMoney(1234567.89, '$'), '$1,234,567.89');
  assert.equal(formatMoney(1000, '$'), '$1,000.00');
  assert.equal(formatMoney(900, '$'), '$900.00');
});

test('formatMoney Indian grouping (Lakh/Crore)', () => {
  assert.equal(formatMoney(1234567.89, '₹', 'indian'), '₹ 12,34,567.89');
  assert.equal(formatMoney(123456789.0, '₹', 'indian'), '₹ 12,34,56,789.00');
});

test('formatMoney three-decimal currencies', () => {
  assert.equal(formatMoney(10, 'BHD'), 'BHD 10.000');
  assert.equal(formatMoney(1.2555, 'KWD'), 'KWD 1.256');
  assert.equal(formatMoney(0.0004, 'OMR'), 'OMR 0.000');
});

test('formatMoney half-up rounding of 0.015 to $0.02', () => {
  assert.equal(formatMoney(0.015, '$'), '$0.02');
});

test('formatMoney negative amounts and empty currency', () => {
  assert.equal(formatMoney(-5.5, 'AED'), '-AED 5.50');
  assert.equal(formatMoney(5.5), '5.50');
});

// ---------------------------------------------------------------------------
// amountToWords
// ---------------------------------------------------------------------------
test('amountToWords international dollars and cents', () => {
  assert.equal(
    amountToWords(1234.56, '$'),
    'One Thousand Two Hundred Thirty-Four Dollars and Fifty-Six Cents Only'
  );
  assert.equal(amountToWords(1, '$'), 'One Dollar Only');
});

test('amountToWords carries rounding overflow into major words', () => {
  // 99.995 formats as $100.00; words must say One Hundred Dollars (never 100 cents).
  assert.equal(amountToWords(99.995, '$'), 'One Hundred Dollars Only');
});

test('amountToWords half-up minor rounding matches formatMoney', () => {
  // 0.015 formats as $0.02; words must agree (only the minor leg is nonzero).
  assert.equal(amountToWords(0.015, '$'), 'Zero Dollars and Two Cents Only');
});

test('amountToWords Indian crore/lakh and Rupees/Paise', () => {
  assert.equal(
    amountToWords(123456.78, '₹', 'indian'),
    'Rupees One Lakh Twenty-Three Thousand Four Hundred Fifty-Six and Seventy-Eight Paise Only'
  );
});

test('amountToWords Bahraini Dinar uses three minor decimals (fils)', () => {
  assert.equal(
    amountToWords(1.005, 'BHD'),
    'One Bahraini Dinar and Five Fils Only'
  );
});

// ---------------------------------------------------------------------------
// clampNum
// ---------------------------------------------------------------------------
test('clampNum clamps and falls back', () => {
  assert.equal(clampNum(15, 0, 10), 10);
  assert.equal(clampNum(-5, 0, 10), 0);
  assert.equal(clampNum('7.5', 0, 10), 7.5);
  assert.equal(clampNum('abc', 0, 10, 2), 2);
  assert.equal(clampNum(undefined, 0, 10), 0);
});

// ---------------------------------------------------------------------------
// calculateTotals / calculateTotal
// ---------------------------------------------------------------------------
test('calculateTotals defaults missing taxRate to 18 everywhere', () => {
  const inv = {
    meta: { currency: '$', numberFormat: 'international' },
    items: [{ id: 'i1', description: 'Design', hsn: '998314', qty: 1, rate: 100 }],
    taxes: []
  };
  const t = calculateTotals(inv);
  assert.equal(t.subtotal, 100);
  assert.equal(t.taxTotal, 18);
  assert.equal(t.total, 118);
  assert.deepEqual(t.rateBreakdown, [{ rate: 18, taxable: 100, tax: 18 }]);
  assert.equal(t.lines.length, 1);
  assert.equal(t.lines[0].taxRate, 18);
  assert.equal(t.lines[0].taxable, 100);
  assert.equal(t.lines[0].tax, 18);
  assert.equal(t.lines[0].total, 118);
});

test('calculateTotals applies discount and rate breakdown per rate', () => {
  const inv = {
    items: [
      { id: 'a', description: 'a', hsn: '', qty: 1, rate: 100, discount: 0, taxRate: 18 },
      { id: 'b', description: 'b', hsn: '', qty: 2, rate: 100, discount: 10, taxRate: 5 }
    ],
    taxes: [{ id: 't1', name: 'CGST', ratio: 50 }, { id: 't2', name: 'SGST', ratio: 50 }]
  };
  const t = calculateTotals(inv);
  assert.equal(t.subtotal, 280);
  assert.equal(t.taxTotal, 27);
  assert.equal(t.total, 307);
  const byRate = new Map(t.rateBreakdown.map(r => [r.rate, r]));
  assert.equal(byRate.get(18).taxable, 100);
  assert.equal(byRate.get(18).tax, 18);
  assert.equal(byRate.get(5).taxable, 180);
  assert.equal(byRate.get(5).tax, 9);
});

test('calculateTotal returns the same number as calculateTotals().total', () => {
  const inv = { items: [{ qty: 2, rate: 50, taxRate: 0 }] };
  assert.equal(calculateTotal(inv), calculateTotals(inv).total);
  assert.equal(calculateTotal(inv), 100);
});

test('calculateTotals tolerates missing/invalid items', () => {
  const t = calculateTotals({ items: null, taxes: null });
  assert.equal(t.subtotal, 0);
  assert.equal(t.taxTotal, 0);
  assert.equal(t.total, 0);
  assert.deepEqual(t.rateBreakdown, []);
  assert.deepEqual(t.lines, []);
  // No tax at all: the fallback still yields a single zero-amount Tax leg.
  assert.deepEqual(t.taxLegs, [{ id: null, name: 'Tax', ratio: 100, amount: 0 }]);
});

// ---------------------------------------------------------------------------
// splitTaxLegs
// ---------------------------------------------------------------------------
test('splitTaxLegs allocates by normalized leg ratio', () => {
  const legs = splitTaxLegs(
    [{ id: 'a', name: 'CGST', ratio: 30 }, { id: 'b', name: 'SGST', ratio: 60 }],
    10
  );
  // Shares are 30/90 and 60/90, not raw 30% and 60%.
  assert.equal(legs.length, 2);
  assert.equal(legs[0].id, 'a');
  assert.equal(legs[0].name, 'CGST');
  assert.ok(Math.abs(legs[0].amount - 3.33) < 0.005);
  assert.ok(Math.abs(legs[1].amount - 6.67) < 0.005);
  assert.ok(Math.abs(legs[0].amount + legs[1].amount - 10) < 1e-9);
});

test('splitTaxLegs falls back to a single 100% Tax leg for zero/empty legs', () => {
  const empty = splitTaxLegs([], 12.34);
  assert.deepEqual(empty, [{ id: null, name: 'Tax', ratio: 100, amount: 12.34 }]);

  const zeroed = splitTaxLegs([{ id: 'z', name: 'X', ratio: 0 }], 5);
  assert.deepEqual(zeroed, [{ id: null, name: 'Tax', ratio: 100, amount: 5 }]);

  const zeroTax = splitTaxLegs([{ id: 'a', name: 'CGST', ratio: 50 }], 0);
  assert.deepEqual(zeroTax, [{ id: 'a', name: 'CGST', ratio: 50, amount: 0 }]);
});

// ---------------------------------------------------------------------------
// splitTaxLegs — minor-unit precision (H7)
// ---------------------------------------------------------------------------
test('splitTaxLegs honors 3-decimal currencies (BHD/KWD/OMR)', () => {
  const taxes = [{ id: 'a', name: 'CGST', ratio: 50 }, { id: 'b', name: 'SGST', ratio: 50 }];
  for (const cur of ['BHD', 'KWD', 'OMR']) {
    const dec = normalizeCurrency(cur).decimals;
    assert.equal(dec, 3);
    const legs = splitTaxLegs(taxes, 1.005, dec);
    const legSum = legs.reduce((s, l) => s + l.amount, 0);
    // Formatted leg sum equals the formatted tax total at 3 decimals.
    assert.equal(formatMoney(legSum, cur), formatMoney(1.005, cur));
    assert.equal(formatMoney(legSum, cur), cur + ' 1.005');
  }
  // The 3-decimal legs are distinct minor-unit values, not 2-decimal lumps.
  const bhd = splitTaxLegs(taxes, 1.005, 3);
  assert.equal(formatMoney(bhd[0].amount, 'BHD'), 'BHD 0.502');
  assert.equal(formatMoney(bhd[1].amount, 'BHD'), 'BHD 0.503');
});

test('splitTaxLegs defaults to 2 decimals when the third argument is omitted', () => {
  const legs = splitTaxLegs([{ id: 'a', name: 'CGST', ratio: 50 }, { id: 'b', name: 'SGST', ratio: 50 }], 1.005);
  assert.equal(formatMoney(legs.reduce((s, l) => s + l.amount, 0), '$'), '$1.01'); // 2-decimal total
});

test('calculateTotals allocates legs at the document currency minor unit', () => {
  const inv = {
    meta: { currency: 'KWD' },
    items: [{ id: 'i1', description: 'A', hsn: '', qty: 15, rate: 1, discount: 0, taxRate: 6.7 }],
    taxes: [{ id: 'a', name: 'CGST', ratio: 50 }, { id: 'b', name: 'SGST', ratio: 50 }]
  };
  const t = calculateTotals(inv);
  assert.ok(Math.abs(t.taxTotal - 1.005) < 1e-9);
  const legSum = t.taxLegs.reduce((s, l) => s + l.amount, 0);
  assert.equal(formatMoney(legSum, 'KWD'), formatMoney(t.taxTotal, 'KWD'));
  assert.equal(formatMoney(legSum, 'KWD'), 'KWD 1.005');
});
