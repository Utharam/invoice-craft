/**
 * InvoiceCraft Standalone Bundle v1.3.0
 * 100% Client-Side Plug-and-Play (Runs on both http:// and file://)
 */
(function() {
  'use strict';

  // --- 1. Shared Calculation & Currency ---

/**
 * InvoiceCraft — shared calculation module (pure, dependency-free).
 *
 * One implementation for money formatting, amount-in-words, numeric clamping,
 * document totals, per-rate tax breakdown and normalized tax-leg allocation.
 * Used by the invoice sheet, the reports engine and the reports UI so every
 * view of the same document always agrees on the numbers.
 *
 * Rounding: half-up on the human-readable decimal value (string based), so
 * 0.015 -> 0.02 and 99.995 -> 100.00 exactly like a user reading the digits
 * expects; plain float arithmetic would disagree.
 */

// ============================================================================
// 1. NUMBER CLAMPING
// ============================================================================
function clampNum(value, min, max, fallback = 0) {
  const n = parseFloat(value);
  if (!isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// ============================================================================
// 2. CURRENCY REGISTRY
// ============================================================================
const CURRENCY_REGISTRY = {
  USD: { key: 'USD', code: 'USD', symbol: '$', decimals: 2, majorSingular: 'Dollar', majorPlural: 'Dollars', minorSingular: 'Cent', minorPlural: 'Cents', leadMajor: false },
  INR: { key: 'INR', code: 'INR', symbol: '₹', decimals: 2, majorSingular: 'Rupee', majorPlural: 'Rupees', minorSingular: 'Paisa', minorPlural: 'Paise', leadMajor: true },
  EUR: { key: 'EUR', code: 'EUR', symbol: '€', decimals: 2, majorSingular: 'Euro', majorPlural: 'Euros', minorSingular: 'Cent', minorPlural: 'Cents', leadMajor: false },
  GBP: { key: 'GBP', code: 'GBP', symbol: '£', decimals: 2, majorSingular: 'Pound', majorPlural: 'Pounds', minorSingular: 'Penny', minorPlural: 'Pence', leadMajor: false },
  CAD: { key: 'CAD', code: 'CAD', symbol: 'C$', decimals: 2, majorSingular: 'Canadian Dollar', majorPlural: 'Canadian Dollars', minorSingular: 'Cent', minorPlural: 'Cents', leadMajor: false },
  AUD: { key: 'AUD', code: 'AUD', symbol: 'A$', decimals: 2, majorSingular: 'Australian Dollar', majorPlural: 'Australian Dollars', minorSingular: 'Cent', minorPlural: 'Cents', leadMajor: false },
  JPY: { key: 'JPY', code: 'JPY', symbol: '¥', decimals: 2, majorSingular: 'Yen', majorPlural: 'Yen', minorSingular: '', minorPlural: '', leadMajor: false },
  CHF: { key: 'CHF', code: 'CHF', symbol: 'CHF', decimals: 2, majorSingular: 'Swiss Franc', majorPlural: 'Swiss Francs', minorSingular: 'Rappen', minorPlural: 'Rappen', leadMajor: false },
  AED: { key: 'AED', code: 'AED', symbol: 'AED', decimals: 2, majorSingular: 'UAE Dirham', majorPlural: 'UAE Dirhams', minorSingular: 'Fil', minorPlural: 'Fils', leadMajor: false },
  SAR: { key: 'SAR', code: 'SAR', symbol: 'SAR', decimals: 2, majorSingular: 'Saudi Riyal', majorPlural: 'Saudi Riyals', minorSingular: 'Halala', minorPlural: 'Halalas', leadMajor: false },
  BHD: { key: 'BHD', code: 'BHD', symbol: 'BHD', decimals: 3, majorSingular: 'Bahraini Dinar', majorPlural: 'Bahraini Dinars', minorSingular: 'Fils', minorPlural: 'Fils', leadMajor: false },
  QAR: { key: 'QAR', code: 'QAR', symbol: 'QAR', decimals: 2, majorSingular: 'Qatari Riyal', majorPlural: 'Qatari Riyals', minorSingular: 'Dirham', minorPlural: 'Dirhams', leadMajor: false },
  KWD: { key: 'KWD', code: 'KWD', symbol: 'KWD', decimals: 3, majorSingular: 'Kuwaiti Dinar', majorPlural: 'Kuwaiti Dinars', minorSingular: 'Fils', minorPlural: 'Fils', leadMajor: false },
  OMR: { key: 'OMR', code: 'OMR', symbol: 'OMR', decimals: 3, majorSingular: 'Omani Rial', majorPlural: 'Omani Rials', minorSingular: 'Baisa', minorPlural: 'Baisa', leadMajor: false }
};

// Aliases resolve to the canonical registry key ('BD' -> 'BHD').
const CURRENCY_ALIASES = { BD: 'BHD' };

// symbol/code/key -> registry key, built once from the single registry.
const CURRENCY_LOOKUP = {};
for (const key of Object.keys(CURRENCY_REGISTRY)) {
  const entry = CURRENCY_REGISTRY[key];
  CURRENCY_LOOKUP[key] = key;
  if (entry.code) CURRENCY_LOOKUP[String(entry.code).toUpperCase()] = key;
  if (entry.symbol) CURRENCY_LOOKUP[entry.symbol] = key;
}
for (const [alias, target] of Object.entries(CURRENCY_ALIASES)) {
  CURRENCY_LOOKUP[alias] = target;
}

function titleCaseCurrencyName(key) {
  return String(key)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Canonicalizes any stored currency value into one nickname for grouping.
 * Custom keys are trimmed/uppercased so 'usd', 'Usd' and '$' all group to USD.
 */
function normalizeCurrency(value) {
  const raw = (value === null || value === undefined) ? '' : String(value);
  const symbol = raw.trim();
  if (!symbol) {
    return { key: '', code: '', symbol: '', decimals: 2, majorSingular: '', majorPlural: '', minorSingular: 'Cent', minorPlural: 'Cents', leadMajor: false };
  }
  const upper = symbol.toUpperCase();
  const key = CURRENCY_LOOKUP[upper] || CURRENCY_LOOKUP[symbol] || upper;
  const entry = CURRENCY_REGISTRY[key];
  if (entry) {
    return {
      key: entry.key,
      code: entry.code,
      symbol: entry.symbol,
      decimals: entry.decimals,
      majorSingular: entry.majorSingular,
      majorPlural: entry.majorPlural,
      minorSingular: entry.minorSingular,
      minorPlural: entry.minorPlural,
      leadMajor: entry.leadMajor
    };
  }
  const name = titleCaseCurrencyName(upper);
  return {
    key: upper,
    code: upper,
    symbol: symbol,
    decimals: 2,
    majorSingular: name,
    majorPlural: name,
    minorSingular: 'Cent',
    minorPlural: 'Cents',
    leadMajor: false
  };
}

// ============================================================================
// 3. DECIMAL ROUNDING (string based, half-up on the readable digits)
// ============================================================================
function roundDecimalString(absNum, decimals) {
  const dec = Math.max(0, Math.min(8, Math.floor(Number(decimals) || 0)));
  if (!isFinite(absNum)) return { intPart: '0', frac: '0'.repeat(dec) };
  let str = String(Math.abs(absNum));
  if (/e/i.test(str)) str = Math.abs(absNum).toFixed(dec);
  const pointIdx = str.indexOf('.');
  let intPart = pointIdx === -1 ? str : str.slice(0, pointIdx);
  let frac = pointIdx === -1 ? '' : str.slice(pointIdx + 1);
  if (intPart === '' || intPart === '-') intPart = '0';

  if (frac.length <= dec) {
    return { intPart, frac: frac + '0'.repeat(dec - frac.length) };
  }

  const keep = frac.slice(0, dec);
  const firstDropped = parseInt(frac.charAt(dec), 10) || 0;
  if (firstDropped < 5) {
    return { intPart, frac: keep };
  }

  // Half-up: add 1 to the combined integer digits, carrying from the right.
  const digits = (intPart + keep).split('');
  let i = digits.length - 1;
  let carry = 1;
  for (; i >= 0 && carry; i--) {
    const d = digits[i].charCodeAt(0) - 48 + carry;
    if (d >= 10) { digits[i] = '0'; carry = 1; } else { digits[i] = String.fromCharCode(48 + d); carry = 0; }
  }
  let combined = (carry ? '1' : '') + digits.join('');
  if (dec === 0) return { intPart: combined, frac: '' };
  if (combined.length <= dec) combined = combined.padStart(dec + 1, '0');
  return { intPart: combined.slice(0, combined.length - dec) || '0', frac: combined.slice(combined.length - dec) };
}

function groupDigits(intDigits, format) {
  if (format === 'indian') {
    if (intDigits.length > 3) {
      const lastThree = intDigits.slice(-3);
      const rest = intDigits.slice(0, -3);
      return rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + lastThree;
    }
    return intDigits;
  }
  return intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// Bulk of the money pipeline keeps full float precision; presentation and
// leg allocation round half-up at the minor-unit level.
function roundHalfUpNumber(num, decimals) {
  const r = roundDecimalString(num, decimals);
  return Number((r.intPart + (r.frac ? '.' + r.frac : '')));
}

// ============================================================================
// 4. MONEY FORMATTING
// ============================================================================
function formatMoney(amount, currency = '', format = 'international') {
  const num = Number(amount);
  const isNeg = isFinite(num) && num < 0;
  const safe = isFinite(num) ? Math.abs(num) : 0;
  const meta = normalizeCurrency(currency);
  const rounded = roundDecimalString(safe, meta.decimals);
  const grouped = groupDigits(rounded.intPart, format);
  const currencyStr = (currency === null || currency === undefined) ? '' : String(currency);
  const sep = (currencyStr && (currencyStr.length > 1 || currencyStr === '₹')) ? ' ' : '';
  return `${isNeg ? '-' : ''}${currencyStr}${currencyStr ? sep : ''}${grouped}.${rounded.frac}`;
}

// ============================================================================
// 5. NUMBER TO WORDS
// ============================================================================
const NUM_WORDS_ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
const NUM_WORDS_TEENS = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const NUM_WORDS_TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function threeDigitsToWords(n) {
  let str = '';
  if (n >= 100) {
    str += NUM_WORDS_ONES[Math.floor(n / 100)] + ' Hundred ';
    n %= 100;
  }
  if (n >= 20) {
    str += NUM_WORDS_TENS[Math.floor(n / 10)] + (n % 10 > 0 ? '-' + NUM_WORDS_ONES[n % 10] : '') + ' ';
  } else if (n >= 10) {
    str += NUM_WORDS_TEENS[n - 10] + ' ';
  } else if (n > 0) {
    str += NUM_WORDS_ONES[n] + ' ';
  }
  return str.trim();
}

function internationalWords(num) {
  if (num === 0) return 'Zero';
  const scales = ['', 'Thousand', 'Million', 'Billion', 'Trillion', 'Quadrillion', 'Quintillion'];
  let words = [];
  let scaleIdx = 0;
  num = Math.floor(Math.abs(num));
  if (num > Number.MAX_SAFE_INTEGER) return String(Math.floor(num));
  while (num > 0) {
    const chunk = num % 1000;
    if (chunk > 0) {
      const chunkWords = threeDigitsToWords(chunk);
      const scaleName = scales[scaleIdx] || '';
      words.unshift(scaleName ? `${chunkWords} ${scaleName}` : chunkWords);
    }
    num = Math.floor(num / 1000);
    scaleIdx++;
  }
  return words.join(' ').trim();
}

function indianWords(num) {
  if (num === 0) return 'Zero';
  const crore = Math.floor(num / 10000000);
  num %= 10000000;
  const lakh = Math.floor(num / 100000);
  num %= 100000;
  const thousand = Math.floor(num / 1000);
  num %= 1000;
  const remainder = num;

  let parts = [];
  if (crore > 0) parts.push(indianWords(crore) + ' Crore');
  if (lakh > 0) parts.push(threeDigitsToWords(lakh) + ' Lakh');
  if (thousand > 0) parts.push(threeDigitsToWords(thousand) + ' Thousand');
  if (remainder > 0) parts.push(threeDigitsToWords(remainder));
  return parts.join(' ').trim();
}

function amountToWords(amount, currency = '$', format = 'international') {
  const num = Number(amount);
  const abs = Math.abs(isFinite(num) ? num : 0);
  const meta = normalizeCurrency(String(currency ?? '$'));
  const decimals = meta.decimals || 2;
  // Round once, then split: keeps formatMoney and the words block in lockstep,
  // including the carry case (99.995 -> $100.00 -> 'One Hundred Dollars').
  const rounded = roundDecimalString(abs, decimals);
  const intPart = parseInt(rounded.intPart, 10) || 0;
  const minorPart = decimals > 0 ? (parseInt(rounded.frac, 10) || 0) : 0;

  const intWords = (format === 'indian') ? indianWords(intPart) : internationalWords(intPart);
  const majorWord = intPart === 1 ? meta.majorSingular : meta.majorPlural;

  let result = '';
  if (meta.leadMajor) {
    result = (majorWord ? majorWord + ' ' : '') + intWords;
  } else {
    result = intWords + (majorWord ? ' ' + majorWord : '');
  }

  if (minorPart > 0 && meta.minorPlural) {
    const decWords = threeDigitsToWords(minorPart);
    const minorWord = minorPart === 1 ? meta.minorSingular : meta.minorPlural;
    result += (result ? ' ' : '') + 'and ' + decWords + ' ' + minorWord;
  }

  return result.trim() + ' Only';
}

// ============================================================================
// 6. DOCUMENT TOTALS & TAX ALLOCATION
// ============================================================================
/**
 * One shared calculation for line totals, subtotal, tax, grand total,
 * per-rate breakdown and normalized tax-leg allocation.
 * Missing item taxRate defaults to 18 everywhere.
 */
function calculateTotals(invoice) {
  const rawItems = (invoice && Array.isArray(invoice.items)) ? invoice.items : [];
  const taxes = (invoice && Array.isArray(invoice.taxes)) ? invoice.taxes : [];

  let subtotal = 0;
  let taxTotal = 0;
  const lines = [];
  const breakdown = new Map();

  for (const item of rawItems) {
    if (!item || typeof item !== 'object') continue;
    const id = (item.id === undefined || item.id === null) ? '' : String(item.id);
    const description = (typeof item.description === 'string') ? item.description : '';
    const hsn = (item.hsn === undefined || item.hsn === null) ? '' : String(item.hsn);
    const qty = clampNum(item.qty, 0, 1000000, 0);
    const rate = clampNum(item.rate, 0, 1000000000, 0);
    const discount = clampNum(item.discount, 0, 100, 0);

    const rawRate = (item.taxRate === undefined || item.taxRate === null || item.taxRate === '') ? 18 : parseFloat(item.taxRate);
    const taxRate = isFinite(rawRate) ? clampNum(rawRate, 0, 100, 18) : 18;

    const taxable = qty * rate * (1 - discount / 100);
    const tax = taxable * (taxRate / 100);

    subtotal += taxable;
    taxTotal += tax;

    if (!breakdown.has(taxRate)) {
      breakdown.set(taxRate, { rate: taxRate, taxable: 0, tax: 0 });
    }
    const bucket = breakdown.get(taxRate);
    bucket.taxable += taxable;
    bucket.tax += tax;

    lines.push({
      id, description, hsn, qty, rate, discount, taxRate,
      taxable, tax, total: taxable + tax
    });
  }

  const rateBreakdown = Array.from(breakdown.values()).sort((a, b) => b.rate - a.rate);
  // Leg allocation happens at the document currency's minor unit so
  // three-decimal currencies (BHD/KWD/OMR) keep their precision.
  const currencyDecimals = normalizeCurrency(invoice && invoice.meta ? invoice.meta.currency : '').decimals;
  const taxLegs = splitTaxLegs(taxes, taxTotal, currencyDecimals);

  return { subtotal, taxTotal, total: subtotal + taxTotal, lines, rateBreakdown, taxLegs };
}

/** Convenience: grand total only. */
function calculateTotal(invoice) {
  const t = calculateTotals(invoice);
  return isFinite(t.total) ? t.total : 0;
}

/**
 * Tax legs are split shares, not tax rates: each leg's amount is carved out
 * of the total tax by its normalized ratio. Zero/empty ratios fall back to a
 * single consolidated 100% 'Tax' leg so the allocation never vanishes.
 * `decimals` is the currency's minor-unit precision (2 by default; 3 for
 * BHD/KWD/OMR) and rounds the total, every amount and the drift correction.
 */
function splitTaxLegs(taxes, totalTax, decimals = 2) {
  const dec = Math.max(0, Math.min(8, Math.floor(Number(decimals) || 0)));
  const factor = Math.pow(10, dec);
  const total = isFinite(totalTax) ? Number(totalTax) : 0;
  const roundedTotal = roundHalfUpNumber(total, dec);

  const legs = (Array.isArray(taxes) ? taxes : [])
    .filter(t => t && typeof t === 'object')
    .map(t => {
      let id = null;
      if (t.id !== undefined && t.id !== null) id = t.id;
      const name = (typeof t.name === 'string' && t.name.trim()) ? t.name.trim() : 'Tax';
      const ratio = clampNum(t.ratio, 0, 100, 0);
      return { id, name, ratio };
    });

  const rawSum = legs.reduce((sum, leg) => sum + leg.ratio, 0);

  if (legs.length === 0 || rawSum <= 0) {
    return [{ id: null, name: 'Tax', ratio: 100, amount: roundedTotal }];
  }

  const amounts = legs.map(leg => roundHalfUpNumber(total * (leg.ratio / rawSum), dec));
  // Keep the legs' sum exactly equal to the rounded total tax: push the
  // residual onto the largest leg so drift can never leak into totals.
  const drift = Math.round((roundedTotal - amounts.reduce((s, a) => s + a, 0)) * factor) / factor;
  if (drift !== 0) {
    let maxIdx = 0;
    for (let i = 1; i < legs.length; i++) {
      if (legs[i].ratio > legs[maxIdx].ratio) maxIdx = i;
    }
    amounts[maxIdx] += drift;
  }

  return legs.map((leg, i) => ({ id: leg.id, name: leg.name, ratio: leg.ratio, amount: amounts[i] }));
}

  // --- 2. Independent Document Numbering ---

/**
 * InvoiceCraft — document numbering module (pure).
 *
 * One scheme, one prefix set, one padding and one reset policy shared by all
 * document types — but an independent counter per type:
 * invoice / quotation / estimate / proforma.
 *
 * Legacy configs that only carry the old shared `counter` migrate that value
 * to the invoice counter alone; the other types start from their own starting
 * value or the default (never from the shared live counter).
 *
 * Everything here is pure: no IndexedDB access, no DOM. Callers persist the
 * returned config themselves and never persist previews.
 */

const DOC_TYPE_KEYS = ['invoice', 'quotation', 'estimate', 'proforma'];

const DEFAULT_NUMBERING_CONFIG = {
  mode: 'auto', // 'auto' | 'manual'
  scheme: '{PREFIX}/{FY}/{COUNTER}', // tokens: {PREFIX} {FY} {YYYY} {YY} {MM} {COUNTER} (custom ok)
  prefixInvoice: 'INV',
  prefixQuotation: 'QT',
  prefixEstimate: 'EST',
  prefixProforma: 'PI',
  counter: 1, // legacy field, mirrored to counters.invoice
  startingCounter: 1, // legacy field, mirrored to startingCounters.invoice
  padding: 4,
  resetPeriod: 'financial_year', // 'never' | 'financial_year' | 'calendar_year' | 'monthly'
  updatedAt: Date.now(),
  lastPeriodKey: '', // e.g. '2025-26' | '2026' | '2026-09' ('continuous' for never)
  counters: { invoice: 1, quotation: 1, estimate: 1, proforma: 1 },
  startingCounters: { invoice: 1, quotation: 1, estimate: 1, proforma: 1 }
};

// ============================================================================
// 1. CONFIG NORMALIZATION & LEGACY MIGRATION
// ============================================================================
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toIntOrDefault(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function normalizeCounterMap(config) {
  const result = {};
  const provided = isPlainObject(config.counters) ? config.counters : null;
  for (const t of DOC_TYPE_KEYS) {
    if (provided && provided[t] !== undefined && provided[t] !== null && Number.isFinite(parseInt(provided[t], 10))) {
      result[t] = toIntOrDefault(provided[t], 1);
    } else if (t === 'invoice') {
      // Legacy migration: invoice counter comes from the old shared counter.
      result[t] = toIntOrDefault(config.counter, 1);
    } else {
      // Other types come from their own starting value/default, never the
      // legacy shared live counter.
      const starts = isPlainObject(config.startingCounters) ? config.startingCounters : null;
      const ownStart = starts ? toIntOrDefault(starts[t], 1) : 1;
      result[t] = ownStart;
    }
  }
  return result;
}

function normalizeStartingCounterMap(config) {
  const result = {};
  const provided = isPlainObject(config.startingCounters) ? config.startingCounters : null;
  const legacyStart = toIntOrDefault(config.startingCounter, 1) || 1;
  for (const t of DOC_TYPE_KEYS) {
    if (provided && provided[t] !== undefined && provided[t] !== null && Number.isFinite(parseInt(provided[t], 10))) {
      result[t] = toIntOrDefault(provided[t], 1);
    } else if (t === 'invoice') {
      result[t] = legacyStart;
    } else {
      result[t] = 1;
    }
  }
  return result;
}

/**
 * Returns a complete, safe copy of the numbering config. Idempotent, so
 * loading a stored normalized config and normalizing again is a no-op.
 */
function normalizeNumberingConfig(config) {
  const source = isPlainObject(config) ? config : {};

  const normalized = Object.assign({}, DEFAULT_NUMBERING_CONFIG, source);
  normalized.mode = (source.mode === 'manual') ? 'manual' : 'auto';
  normalized.scheme = (typeof source.scheme === 'string' && source.scheme.trim()) ? source.scheme : DEFAULT_NUMBERING_CONFIG.scheme;
  normalized.prefixInvoice = (typeof source.prefixInvoice === 'string') ? source.prefixInvoice : DEFAULT_NUMBERING_CONFIG.prefixInvoice;
  normalized.prefixQuotation = (typeof source.prefixQuotation === 'string') ? source.prefixQuotation : DEFAULT_NUMBERING_CONFIG.prefixQuotation;
  normalized.prefixEstimate = (typeof source.prefixEstimate === 'string') ? source.prefixEstimate : DEFAULT_NUMBERING_CONFIG.prefixEstimate;
  normalized.prefixProforma = (typeof source.prefixProforma === 'string') ? source.prefixProforma : DEFAULT_NUMBERING_CONFIG.prefixProforma;
  normalized.padding = Math.max(1, Math.min(8, toIntOrDefault(source.padding, DEFAULT_NUMBERING_CONFIG.padding) || DEFAULT_NUMBERING_CONFIG.padding));
  normalized.resetPeriod = ['never', 'financial_year', 'calendar_year', 'monthly'].includes(source.resetPeriod)
    ? source.resetPeriod
    : DEFAULT_NUMBERING_CONFIG.resetPeriod;
  normalized.lastPeriodKey = (typeof source.lastPeriodKey === 'string') ? source.lastPeriodKey : '';

  normalized.startingCounters = normalizeStartingCounterMap(source);
  normalized.counters = normalizeCounterMap(source);

  // Mirror the invoice slot into the legacy fields for older call sites.
  normalized.counter = normalized.counters.invoice;
  normalized.startingCounter = normalized.startingCounters.invoice;

  normalized.updatedAt = Number.isFinite(Number(source.updatedAt))
    ? Number(source.updatedAt)
    : (Number.isFinite(Number(normalized.updatedAt)) ? Number(normalized.updatedAt) : Date.now());

  return normalized;
}

// ============================================================================
// 2. PERIOD HELPERS
// ============================================================================
function formatFinancialYear(date) {
  const d = (date instanceof Date && !isNaN(date.getTime())) ? date : new Date();
  const month = d.getMonth(); // 0-indexed; 3 is April
  const year = d.getFullYear();
  if (month >= 3) {
    const nextYearShort = String(year + 1).slice(-2);
    return `${year}-${nextYearShort}`;
  }
  const curYearShort = String(year).slice(-2);
  return `${year - 1}-${curYearShort}`;
}

function resolvePeriodKey(date, resetPeriod) {
  const d = (date instanceof Date && !isNaN(date.getTime())) ? date : new Date();
  if (resetPeriod === 'financial_year') return formatFinancialYear(d);
  if (resetPeriod === 'calendar_year') return d.getFullYear().toString();
  if (resetPeriod === 'monthly') return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  return 'continuous';
}

/**
 * Parses 'YYYY-MM-DD' (and full ISO strings) without the UTC shift that
 * `new Date('2026-03-01')` applies, so numbers generated on a boundary day
 * use the calendar the user actually picked. Invalid input yields an invalid
 * Date (NaN time).
 */
function parseLocalDate(value) {
  if (value instanceof Date) return new Date(value.getTime());
  if (value === null || value === undefined) return new Date(NaN);
  const str = String(value).trim();
  if (!str) return new Date(NaN);

  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
  if (dateOnly) {
    const y = Number(dateOnly[1]);
    const m = Number(dateOnly[2]);
    const d = Number(dateOnly[3]);
    if (m < 1 || m > 12 || d < 1 || d > 31) return new Date(NaN);
    return new Date(y, m - 1, d, 0, 0, 0, 0);
  }

  const datePart = /^(\d{4})-(\d{2})-(\d{2})(?:[T ]\d{2}:\d{2})?/.exec(str);
  if (datePart && str.includes('T')) {
    // Timestamps with a time or zone fall back to the JS parser, which is
    // already exact for those forms; date-only strings never reach here.
    const parsed = new Date(str);
    return isNaN(parsed.getTime()) ? new Date(NaN) : parsed;
  }
  if (datePart) {
    const y = Number(datePart[1]);
    let m = Number(datePart[2]);
    let d = Number(datePart[3]);
    if (m < 1 || m > 12 || d < 1 || d > 31) return new Date(NaN);
    return new Date(y, m - 1, d, 0, 0, 0, 0);
  }

  const parsed = new Date(str);
  return isNaN(parsed.getTime()) ? new Date(NaN) : parsed;
}

// ============================================================================
// 3. COUNTER ACCESS
// ============================================================================
function getCounter(config, docType) {
  const cfg = normalizeNumberingConfig(config);
  const counters = cfg.counters || DEFAULT_NUMBERING_CONFIG.counters;
  const n = parseInt(counters[docType], 10);
  return Number.isFinite(n) && n >= 0 ? n : 1;
}

/**
 * Pure clone advance: increments one type's counter by exactly one.
 * Same-document re-saves therefore never consume extra numbers (the caller
 * only advances when a number was actually issued).
 */
function advanceTypeCounter(config, docType) {
  const cfg = normalizeNumberingConfig(config);
  if (!DOC_TYPE_KEYS.includes(docType)) return cfg;
  cfg.counters = Object.assign({}, cfg.counters);
  cfg.counters[docType] = getCounter(cfg, docType) + 1;
  if (docType === 'invoice') cfg.counter = cfg.counters.invoice;
  return cfg;
}

// ============================================================================
// 4. NUMBER GENERATION
// ============================================================================
function resolvePrefix(cfg, docType) {
  switch (docType) {
    case 'quotation': return cfg.prefixQuotation || 'QT';
    case 'estimate': return cfg.prefixEstimate || 'EST';
    case 'proforma': return cfg.prefixProforma || 'PI';
    default: return cfg.prefixInvoice || 'INV';
  }
}

/**
 * Pure formatter for one document number from a config snapshot.
 * - 'auto' mode: formats from the type's counter (or the caller's override).
 * - 'manual' mode: returns '' unless the caller explicitly supplies an
 *   overrideCounter; manual call sites never auto-generate or auto-advance.
 */
function generateDocumentNumber(docType, dateStr, config, overrideCounter = null) {
  const cfg = normalizeNumberingConfig(config);

  if (cfg.mode === 'manual' && overrideCounter === null) {
    return '';
  }

  let date = parseLocalDate(dateStr);
  if (isNaN(date.getTime())) date = new Date();

  const prefix = resolvePrefix(cfg, docType);
  const counterVal = (overrideCounter !== null && overrideCounter !== undefined && Number.isFinite(Number(overrideCounter)))
    ? Number(overrideCounter)
    : getCounter(cfg, docType);
  const padDigits = Math.max(1, cfg.padding || 4);
  const paddedCounter = String(counterVal).padStart(padDigits, '0');
  const yyyy = date.getFullYear().toString();
  const yy = yyyy.slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const fy = formatFinancialYear(date);
  const pattern = cfg.scheme || DEFAULT_NUMBERING_CONFIG.scheme;

  return pattern
    .replace(/\{PREFIX\}/g, prefix)
    .replace(/\{FY\}/g, fy)
    .replace(/\{YYYY\}/g, yyyy)
    .replace(/\{YY\}/g, yy)
    .replace(/\{MM\}/g, mm)
    .replace(/\{COUNTER\}/g, paddedCounter);
}

// ============================================================================
// 5. PERIOD ROLLOVER
// ============================================================================
/**
 * Pure rollover check for a numbering snapshot.
 * Returns { config, changed }: a normalized config and whether counters were
 * reset to their per-type starting values this call.
 *
 * Rules:
 * - manual mode: never touches counters (changed: false).
 * - lastPeriodKey already matches: no change.
 * - first run (empty lastPeriodKey): stamps the key only, no reset.
 * - resetPeriod 'never': never resets.
 * - otherwise: every type counter resets to its own starting value.
 */
function periodRollover(config, now = new Date()) {
  const cfg = normalizeNumberingConfig(config);
  const at = (now instanceof Date && !isNaN(now.getTime())) ? now : new Date();
  const resetPeriod = cfg.resetPeriod || 'financial_year';
  const currentKey = resolvePeriodKey(at, resetPeriod);

  if (cfg.mode === 'manual' || cfg.lastPeriodKey === currentKey) {
    return { config: cfg, changed: false };
  }

  const firstRun = !cfg.lastPeriodKey;
  if (resetPeriod !== 'never' && !firstRun) {
    cfg.counters = Object.assign({}, cfg.startingCounters);
    cfg.counter = cfg.counters.invoice;
    cfg.lastPeriodKey = currentKey;
    cfg.updatedAt = Date.now();
    return { config: cfg, changed: true };
  }

  // Never-policy or first observation: stamp the key only, keep counters.
  cfg.lastPeriodKey = currentKey;
  return { config: cfg, changed: false };
}

  // --- 3. Saved Item Library ---

/**
 * InvoiceCraft — saved item catalog (pure, dependency-light).
 *
 * Normalization, dedupe keys, picker grouping and line-item conversion for
 * the persistent item library (global + company scope). No storage here:
 * js/db.js owns the IndexedDB v4 `catalogItems` store and calls into this
 * module for every write. Pure functions only — the same inputs always
 * produce the same record, so `catalogMatchKey` can drive dedupe anywhere.
 */



/** Valid library scopes, in display order (global items are shown first). */
const CATALOG_SCOPES = ['global', 'company'];

/**
 * Canonical scope for any stored value: only 'company' (any casing) maps to
 * the company scope; everything else falls back to 'global'.
 */
function normalizeCatalogScope(value) {
  return (String(value === null || value === undefined ? '' : value).trim().toLowerCase() === 'company')
    ? 'company'
    : 'global';
}

/** Trimmed lowercase search/dedupe key for a catalog description. */
function catalogDescriptionKey(text) {
  return (typeof text === 'string') ? text.trim().toLowerCase() : '';
}

/** Fallback id generator (same shape as the db layer's ids). */
function makeCatalogId() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return 'cat_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    }
  } catch (e) {}
  return 'cat_' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
}

function resolveNow(now) {
  if (now === undefined || now === null) return Date.now();
  const n = Number(now);
  return Number.isFinite(n) ? n : Date.now();
}

/**
 * Normalize a catalog item into the stamped v4 record shape:
 * { id, description, descriptionKey, hsn, rate, taxRate, currency,
 *   currencyKey, scope, companyId, usageCount, lastUsedAt, createdAt,
 *   updatedAt }
 *
 * - rate clamps to >= 0 (invalid/missing -> 0), taxRate clamps to 0-100
 *   (blank/invalid/missing -> 18, the app-wide line-item default).
 * - currency is canonicalized via calc.normalizeCurrency: `currency` keeps a
 *   displayable symbol ('$' for USD/INR-style entries) and `currencyKey` the
 *   grouping key, so '$', 'USD' and 'usd' all collapse to one currency.
 * - scope is 'global'|'company'; companyId is null for global items (and for
 *   company items saved without a company link).
 * - Updates (same id) preserve createdAt, usageCount and lastUsedAt;
 *   updatedAt is always stamped to `now` (default: Date.now()).
 */
function normalizeCatalogItem(item, { id, now } = {}) {
  const src = (item && typeof item === 'object') ? item : {};
  const nowMs = resolveNow(now);

  const finalId = (id !== undefined && id !== null && String(id).trim())
    ? String(id).trim()
    : (typeof src.id === 'string' && src.id.trim() ? src.id.trim() : makeCatalogId());

  const rawDescription = (src.description === undefined || src.description === null)
    ? ''
    : String(src.description);
  const description = rawDescription.trim();
  const descriptionKey = catalogDescriptionKey(description);

  const hsn = (src.hsn === undefined || src.hsn === null) ? '' : String(src.hsn);

  const rate = clampNum(src.rate, 0, 1000000000, 0);

  const rawTaxRate = (src.taxRate === undefined || src.taxRate === null || src.taxRate === '')
    ? 18
    : parseFloat(src.taxRate);
  const taxRate = Number.isFinite(rawTaxRate) ? clampNum(rawTaxRate, 0, 100, 18) : 18;

  const currencyMeta = normalizeCurrency(src.currency);
  const currency = currencyMeta.symbol || currencyMeta.key;
  const currencyKey = currencyMeta.key;

  const scope = normalizeCatalogScope(src.scope);
  const rawCompanyId = (src.companyId === undefined || src.companyId === null) ? '' : String(src.companyId).trim();
  const companyId = (scope === 'company' && rawCompanyId) ? rawCompanyId : null;

  const usage = clampNum(src.usageCount, 0, Number.MAX_SAFE_INTEGER, 0);
  const usageCount = Math.max(0, Math.floor(usage));

  const rawLastUsed = Number(src.lastUsedAt);
  const lastUsedAt = Number.isFinite(rawLastUsed) ? rawLastUsed : null;

  const rawCreated = Number(src.createdAt);
  const createdAt = (Number.isFinite(rawCreated) && rawCreated > 0) ? rawCreated : nowMs;

  return {
    id: finalId,
    description,
    descriptionKey,
    hsn,
    rate,
    taxRate,
    currency,
    currencyKey,
    scope,
    companyId,
    usageCount,
    lastUsedAt,
    createdAt,
    updatedAt: nowMs
  };
}

/**
 * Dedupe key: scope + companyId + currencyKey + descriptionKey. Inputs are
 * re-normalized so raw line-item candidates collide with stored records.
 */
function catalogMatchKey(item) {
  const src = (item && typeof item === 'object') ? item : {};
  const scope = normalizeCatalogScope(src.scope);
  const rawCompanyId = (src.companyId === undefined || src.companyId === null) ? '' : String(src.companyId).trim();
  const companyId = (scope === 'company' && rawCompanyId) ? rawCompanyId : '';
  const currencySource = (src.currencyKey === undefined || src.currencyKey === null) ? src.currency : src.currencyKey;
  const currencyKey = normalizeCurrency(currencySource).key;
  const descriptionKey = catalogDescriptionKey(
    (src.description === undefined || src.description === null) ? '' : String(src.description)
  );
  return [scope, companyId, currencyKey, descriptionKey].join('|');
}

/**
 * First stored item whose match key equals the candidate's, or null. This is
 * the dedupe rule: scope + companyId + currency + trimmed-lowercase
 * description.
 */
function findCatalogMatch(items, candidate) {
  if (!Array.isArray(items) || !candidate || typeof candidate !== 'object') return null;
  const key = catalogMatchKey(candidate);
  for (const item of items) {
    if (item && typeof item === 'object' && catalogMatchKey(item) === key) return item;
  }
  return null;
}

/**
 * Minimal catalog candidate from a document line item (qty and discount are
 * deliberately NOT carried into the library). Scope/company/currency come
 * from the caller's save context; currencyKey is derived when not given.
 */
function buildCatalogCandidateFromLineItem(lineItem, { scope, companyId, currency, currencyKey } = {}) {
  const line = (lineItem && typeof lineItem === 'object') ? lineItem : {};
  const normalizedScope = normalizeCatalogScope(scope);
  const rawCompanyId = (companyId === undefined || companyId === null) ? '' : String(companyId).trim();
  const candidate = {
    description: (line.description === undefined || line.description === null) ? '' : String(line.description),
    hsn: (line.hsn === undefined || line.hsn === null) ? '' : String(line.hsn),
    rate: line.rate,
    taxRate: line.taxRate,
    scope: normalizedScope,
    companyId: (normalizedScope === 'company' && rawCompanyId) ? rawCompanyId : null,
    currency: (currency === undefined || currency === null) ? '' : currency
  };
  if (currencyKey === undefined || currencyKey === null) {
    candidate.currencyKey = normalizeCurrency(candidate.currency).key;
  } else {
    candidate.currencyKey = currencyKey;
  }
  return candidate;
}

/**
 * Line item built from a saved catalog item: qty 1, saved price/tax/HSN,
 * discount 0. Exactly the fields a document line needs — no catalog ids,
 * currency or usage counters leak into the invoice.
 */
function catalogItemToLineItem(item) {
  const src = (item && typeof item === 'object') ? item : {};
  const rawTaxRate = (src.taxRate === undefined || src.taxRate === null || src.taxRate === '')
    ? 18
    : parseFloat(src.taxRate);
  return {
    description: (typeof src.description === 'string') ? src.description : '',
    hsn: (src.hsn === undefined || src.hsn === null) ? '' : String(src.hsn),
    qty: 1,
    rate: clampNum(src.rate, 0, 1000000000, 0),
    discount: 0,
    taxRate: Number.isFinite(rawTaxRate) ? clampNum(rawTaxRate, 0, 100, 18) : 18
  };
}

const GLOBAL_GROUP_LABEL = 'Global items';
const COMPANY_GROUP_LABEL = 'Company items';

/**
 * Groups catalog items for the picker view:
 * [{ scope: 'global', label: 'Global items', items },
 *  { scope: 'company', label: 'Company items', items }]
 *
 * - Global group first, then the active company's items (a company link is
 *   required; other companies' items never appear).
 * - Both groups are filtered to the canonical document currency and by a
 *   case-insensitive search over description and HSN.
 * - Empty groups are omitted (a fully empty result is []).
 * - Item order inside each group follows the input order (the db layer
 *   already returns newest first).
 */
function groupCatalogItemsForView(items, { search, currencyKey, companyId } = {}) {
  if (!Array.isArray(items)) return [];

  const canonicalKey = normalizeCurrency(currencyKey === undefined || currencyKey === null ? '' : currencyKey).key;
  const needle = (typeof search === 'string') ? search.trim().toLowerCase() : '';
  const activeCompanyId = (companyId === undefined || companyId === null) ? '' : String(companyId).trim();

  const matches = (item) => {
    if (!item || typeof item !== 'object') return false;
    const itemKeySource = (item.currencyKey === undefined || item.currencyKey === null) ? item.currency : item.currencyKey;
    if (normalizeCurrency(itemKeySource).key !== canonicalKey) return false;
    if (!needle) return true;
    const description = (typeof item.description === 'string') ? item.description.toLowerCase() : '';
    if (description.includes(needle)) return true;
    const hsn = (item.hsn === undefined || item.hsn === null) ? '' : String(item.hsn).toLowerCase();
    return hsn.includes(needle);
  };

  const globalItems = [];
  const companyItems = [];
  for (const item of items) {
    if (!matches(item)) continue;
    const scope = normalizeCatalogScope(item && item.scope);
    if (scope === 'global') {
      globalItems.push(item);
    } else if (activeCompanyId && item.companyId && String(item.companyId) === activeCompanyId) {
      companyItems.push(item);
    }
  }

  const groups = [];
  if (globalItems.length > 0) {
    groups.push({ scope: 'global', label: GLOBAL_GROUP_LABEL, items: globalItems });
  }
  if (companyItems.length > 0) {
    groups.push({ scope: 'company', label: COMPANY_GROUP_LABEL, items: companyItems });
  }
  return groups;
}

  // --- 4. IndexedDB Engine ---

/**
 * InvoiceCraftDB - IndexedDB Storage Layer (v4)
 * Privacy-first, local-only client-side database for documents, clients, and assets.
 *
 * v3 adds report indexes, frozen totals, durable document links, and atomic
 * invoice + numbering writes. v4 adds the `catalogItems` store (saved item
 * library) plus the `itemLibraryConfig` setting. v2 backups remain importable.
 */







const DB_NAME = 'InvoiceCraftDB';
const DB_VERSION = 4;

let dbInstance = null;

function makeRetryableError(message, cause) {
  const err = new Error(message);
  err.name = 'InvoiceCraftDatabaseError';
  err.retryable = true;
  if (cause) err.cause = cause;
  return err;
}

async function openDB() {
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
function prepareInvoiceForSave(invoice, extras = {}, options = {}) {
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
async function saveInvoice(invoice) {
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
async function saveInvoiceAndNumbering(invoice, numberingConfig) {
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
function checkConversionSourceState(storedSource, invoiceId) {
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
async function saveConversion({ source, invoice, numberingConfig }) {
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

async function getInvoice(id) {
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

async function getAllInvoices() {
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

async function deleteInvoice(id) {
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
async function saveActiveDraft(draft, extras = {}) {
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

async function getActiveDraftRecord() {
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

async function getActiveDraft() {
  const record = await getActiveDraftRecord();
  return record ? record.data : null;
}

// Multiple Company Profiles CRUD
async function saveCompany(company) {
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

async function getCompany(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['companies'], 'readonly');
    const store = tx.objectStore('companies');
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function getAllCompanies() {
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

async function deleteCompany(id) {
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

async function setDefaultCompany(id) {
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

async function getDefaultCompany() {
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
async function saveCompanyProfile(profile) {
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

async function getCompanyProfile() {
  const def = await getDefaultCompany();
  if (def) return def;
  return await getLegacyProfile();
}

// Clients Directory
async function saveClient(client) {
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

async function getAllClients() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['clients'], 'readonly');
    const store = tx.objectStore('clients');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function deleteClient(id) {
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
async function saveNumberingConfig(config) {
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

async function getNumberingConfig() {
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
async function getAllCatalogItems() {
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
function checkCatalogSaveState(storedItems, record) {
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
async function saveCatalogItem(item) {
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

async function deleteCatalogItem(id) {
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
async function getItemLibraryConfig() {
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

async function saveItemLibraryConfig(config) {
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
async function exportAllData() {
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
function validateImportData(data) {
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
async function importAllData(data) {
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

  // --- 5. Icon Library & Monogram Generator ---

/**
 * Curated Open SVG Business Icons & Brand Lockup Generator
 * Supports 40+ vector icons across 7 industries and comprehensive Brand Lockups
 * (Icon/Monogram + Company Wordmark + Subtitle Tagline + Decorative Underlines).
 */

const ICON_CATEGORIES = [
  { id: 'tech', label: 'Tech & Dev' },
  { id: 'finance', label: 'Finance & Tax' },
  { id: 'legal', label: 'Legal & Consulting' },
  { id: 'creative', label: 'Design & Media' },
  { id: 'trades', label: 'Trades & Home' },
  { id: 'retail', label: 'Retail & Logistics' },
  { id: 'abstract', label: 'Geometric Badges' }
];

const ICONS = [
  // Tech & Dev
  {
    id: 'terminal',
    category: 'tech',
    name: 'Terminal Console',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>`
  },
  {
    id: 'code',
    category: 'tech',
    name: 'Code Brackets',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>`
  },
  {
    id: 'cpu',
    category: 'tech',
    name: 'Microchip CPU',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect><rect x="9" y="9" width="6" height="6"></rect><line x1="9" y1="1" x2="9" y2="4"></line><line x1="15" y1="1" x2="15" y2="4"></line><line x1="9" y1="20" x2="9" y2="23"></line><line x1="15" y1="20" x2="15" y2="23"></line><line x1="20" y1="9" x2="23" y2="9"></line><line x1="20" y1="14" x2="23" y2="14"></line><line x1="1" y1="9" x2="4" y2="9"></line><line x1="1" y1="14" x2="4" y2="14"></line></svg>`
  },
  {
    id: 'cloud',
    category: 'tech',
    name: 'Cloud Infrastructure',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"></path></svg>`
  },
  {
    id: 'database',
    category: 'tech',
    name: 'Database Storage',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg>`
  },
  {
    id: 'zap',
    category: 'tech',
    name: 'Lightning Fast',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`
  },

  // Finance & Tax
  {
    id: 'briefcase',
    category: 'finance',
    name: 'Executive Briefcase',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>`
  },
  {
    id: 'chart-trending',
    category: 'finance',
    name: 'Growth Analytics',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>`
  },
  {
    id: 'receipt',
    category: 'finance',
    name: 'Ledger Receipt',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1z"></path><line x1="8" y1="8" x2="16" y2="8"></line><line x1="8" y1="12" x2="16" y2="12"></line><line x1="8" y1="16" x2="12" y2="16"></line></svg>`
  },
  {
    id: 'vault',
    category: 'finance',
    name: 'Safe Vault',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"></rect><circle cx="12" cy="12" r="3"></circle><line x1="12" y1="9" x2="12" y2="7"></line><line x1="15" y1="12" x2="17" y2="12"></line><line x1="12" y1="15" x2="12" y2="17"></line><line x1="9" y1="12" x2="7" y2="12"></line></svg>`
  },
  {
    id: 'credit-card',
    category: 'finance',
    name: 'Payment Card',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>`
  },

  // Legal & Consulting
  {
    id: 'scale',
    category: 'legal',
    name: 'Scales of Justice',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"></path><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"></path><path d="M7 21h10"></path><path d="M12 3v18"></path><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"></path></svg>`
  },
  {
    id: 'shield-check',
    category: 'legal',
    name: 'Security Shield',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><polyline points="9 12 11 14 15 10"></polyline></svg>`
  },
  {
    id: 'landmark',
    category: 'legal',
    name: 'Institution Pillars',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="21" x2="21" y2="21"></line><line x1="6" y1="18" x2="6" y2="11"></line><line x1="10" y1="18" x2="10" y2="11"></line><line x1="14" y1="18" x2="14" y2="11"></line><line x1="18" y1="18" x2="18" y2="11"></line><polygon points="12 2 20 7 4 7 12 2"></polygon></svg>`
  },
  {
    id: 'award',
    category: 'legal',
    name: 'Quality Award',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="7"></circle><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"></polyline></svg>`
  },

  // Creative & Media
  {
    id: 'pen-tool',
    category: 'creative',
    name: 'Vector Pen Tool',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19 7-7 3 3-7 7-3-3z"></path><path d="m18 13-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path><path d="m2 2 7.586 7.586"></path><circle cx="11" cy="11" r="2"></circle></svg>`
  },
  {
    id: 'palette',
    category: 'creative',
    name: 'Design Palette',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r=".5"></circle><circle cx="17.5" cy="10.5" r=".5"></circle><circle cx="8.5" cy="7.5" r=".5"></circle><circle cx="6.5" cy="12.5" r=".5"></circle><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"></path></svg>`
  },
  {
    id: 'camera',
    category: 'creative',
    name: 'Studio Camera',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>`
  },
  {
    id: 'layers',
    category: 'creative',
    name: 'Modular Layers',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>`
  },
  {
    id: 'feather',
    category: 'creative',
    name: 'Editorial Quill',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z"></path><line x1="16" y1="8" x2="2" y2="22"></line><line x1="17.5" y1="15" x2="9" y2="15"></line></svg>`
  },

  // Trades & Home
  {
    id: 'hammer',
    category: 'trades',
    name: 'Craftsman Hammer',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 12-8.5 8.5c-.83.83-2.17.83-3 0 0 0 0 0 0 0a2.12 2.12 0 0 1 0-3L12 9"></path><path d="M17.64 15 22 10.64"></path><path d="m20.91 3.26-6.5 6.5"></path><path d="m14.56 2.05 4.3 4.3"></path><path d="m4.93 4.93 4.24 4.24"></path></svg>`
  },
  {
    id: 'wrench',
    category: 'trades',
    name: 'Mechanic Wrench',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>`
  },
  {
    id: 'home',
    category: 'trades',
    name: 'Architect Home',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>`
  },
  {
    id: 'compass',
    category: 'trades',
    name: 'Drafting Compass',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon></svg>`
  },

  // Retail & Logistics
  {
    id: 'shopping-bag',
    category: 'retail',
    name: 'Boutique Bag',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>`
  },
  {
    id: 'package',
    category: 'retail',
    name: 'Parcel Delivery',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"></line><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>`
  },
  {
    id: 'truck',
    category: 'retail',
    name: 'Freight Logistics',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>`
  },
  {
    id: 'globe',
    category: 'retail',
    name: 'Global Enterprise',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>`
  },

  // Abstract & Badges
  {
    id: 'hexagon',
    category: 'abstract',
    name: 'Hexagon Apex',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path></svg>`
  },
  {
    id: 'infinity',
    category: 'abstract',
    name: 'Infinity Loop',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18.178 8c5.096 0 5.096 8 0 8-2.617 0-4.636-2.073-6.178-4-1.542-1.927-3.561-4-6.178-4-5.096 0-5.096 8 0 8 2.617 0 4.636-2.073 6.178-4 1.542-1.927 3.561-4 6.178-4z"></path></svg>`
  },
  {
    id: 'target',
    category: 'abstract',
    name: 'Precision Target',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>`
  },
  {
    id: 'sparkles',
    category: 'abstract',
    name: 'Modern Sparkle',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"></path></svg>`
  }
];

/**
 * Estimate visual text width in pixels
 */
function estimateTextWidth(text, fontSize, isUppercase = false, letterSpacing = 0) {
  if (!text) return 0;
  const str = isUppercase ? text.toUpperCase() : text;
  let total = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if ('ilI|:;.!\''.includes(ch)) total += fontSize * 0.28;
    else if ('mwMW_@#%'.includes(ch)) total += fontSize * 0.88;
    else if (ch === ' ') total += fontSize * 0.32;
    else if (ch >= 'A' && ch <= 'Z') total += fontSize * 0.68;
    else total += fontSize * 0.58;
  }
  total += Math.max(0, str.length - 1) * letterSpacing;
  return Math.round(total);
}

/**
 * Generate a standalone SVG element for a symbol (Monogram or Icon)
 */
function renderSymbolSVG(symbolType, initials, shape, iconId, markColor, bgColor, emblemStyle = 'solid') {
  markColor = markColor || '#2563eb';
  bgColor = bgColor || 'transparent';

  if (symbolType === 'icon') {
    const icon = ICONS.find(i => i.id === iconId) || ICONS[0];
    let bgShape = '';
    const shapeFill = bgColor !== 'transparent' ? bgColor : markColor;
    let fillAttr = `fill="${shapeFill}"`;
    let strokeAttr = '';
    if (emblemStyle === 'outline') {
      fillAttr = 'fill="transparent"';
      strokeAttr = `stroke="${shapeFill}" stroke-width="2.5"`;
    } else if (emblemStyle === 'soft') {
      fillAttr = `fill="${shapeFill}" fill-opacity="0.14"`;
    }

    if (shape === 'circle') bgShape = `<circle cx="28" cy="28" r="26" ${fillAttr} ${strokeAttr} />`;
    else if (shape === 'squircle') bgShape = `<rect x="3" y="3" width="50" height="50" rx="14" ${fillAttr} ${strokeAttr} />`;
    else if (shape === 'square') bgShape = `<rect x="3" y="3" width="50" height="50" rx="8" ${fillAttr} ${strokeAttr} />`;

    const iconColor = (emblemStyle === 'outline' || emblemStyle === 'soft') ? shapeFill : markColor;
    const iconInner = icon.svg
      .replace('stroke="currentColor"', `stroke="${iconColor}"`)
      .replace(/viewBox="[^"]*"/, 'viewBox="0 0 24 24" x="12" y="12" width="32" height="32"');

    return `<g>${bgShape}${iconInner}</g>`;
  }

  // Monogram Symbol
  const cleanInitials = escapeXml((initials || 'AB').substring(0, 3).toUpperCase());
  const fillCol = bgColor !== 'transparent' ? bgColor : markColor;
  let fillAttr = `fill="${fillCol}"`;
  let strokeAttr = '';
  let letterColor = '#ffffff';

  if (emblemStyle === 'outline') {
    fillAttr = 'fill="transparent"';
    strokeAttr = `stroke="${fillCol}" stroke-width="2.5"`;
    letterColor = fillCol;
  } else if (emblemStyle === 'soft') {
    fillAttr = `fill="${fillCol}" fill-opacity="0.14"`;
    letterColor = fillCol;
  } else {
    letterColor = (bgColor !== 'transparent' && markColor === '#ffffff') ? '#ffffff' : (bgColor !== 'transparent' ? markColor : '#ffffff');
  }

  let shapePath = '';
  if (shape === 'circle') shapePath = `<circle cx="28" cy="28" r="26" ${fillAttr} ${strokeAttr} />`;
  else if (shape === 'squircle') shapePath = `<rect x="3" y="3" width="50" height="50" rx="14" ${fillAttr} ${strokeAttr} />`;
  else if (shape === 'shield') shapePath = `<path d="M28 3 L50 12 L50 31 C50 42 28 53 28 53 C28 53 6 42 6 31 L6 12 Z" ${fillAttr} ${strokeAttr} />`;
  else if (shape === 'hexagon') shapePath = `<polygon points="28,3 51,15 51,41 28,53 5,41 5,15" ${fillAttr} ${strokeAttr} />`;
  else if (shape === 'diamond') shapePath = `<polygon points="28,3 53,28 28,53 3,28" ${fillAttr} ${strokeAttr} />`;
  else shapePath = `<rect x="3" y="3" width="50" height="50" rx="8" ${fillAttr} ${strokeAttr} />`;

  const fontSize = cleanInitials.length > 2 ? 16 : 20;

  return `
    <g>
      ${shapePath}
      <text x="28" y="34" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="${fontSize}" font-weight="800" fill="${letterColor}" text-anchor="middle" dominant-baseline="middle" letter-spacing="0.5">${cleanInitials}</text>
    </g>
  `;
}

/**
 * Universal XML & SVG Safe Data URI Helpers
 */
function escapeXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function svgToDataURI(svgString) {
  try {
    if (typeof btoa === 'function') {
      return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgString)));
    }
  } catch (err) {
    console.warn('btoa encoding error, falling back:', err);
  }
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString);
}

/**
 * Generate Decorative Underline Markups
 */
function renderUnderlineSVG(style, x1, y, width, accentColor) {
  const x2 = x1 + width;
  accentColor = accentColor || '#2563eb';

  if (style === 'solid') {
    return `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${accentColor}" stroke-width="2.5" stroke-linecap="round" />`;
  }
  if (style === 'dashed') {
    return `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${accentColor}" stroke-width="2.5" stroke-dasharray="6,4" stroke-linecap="round" />`;
  }
  if (style === 'accent-pip') {
    return `
      <line x1="${x1}" y1="${y}" x2="${Math.max(x1 + 10, x2 - 8)}" y2="${y}" stroke="${accentColor}" stroke-width="2" stroke-linecap="round" />
      <circle cx="${x2}" cy="${y}" r="3" fill="${accentColor}" />
    `;
  }
  if (style === 'gradient') {
    const gradId = 'brandGrad_' + Math.abs(Math.round(x1 + y + width));
    return `
      <defs>
        <linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="${accentColor}" stop-opacity="1" />
          <stop offset="65%" stop-color="${accentColor}" stop-opacity="0.8" />
          <stop offset="100%" stop-color="${accentColor}" stop-opacity="0" />
        </linearGradient>
      </defs>
      <line x1="${x1}" y1="${y}" x2="${x2 + 15}" y2="${y}" stroke="url(#${gradId})" stroke-width="3" stroke-linecap="round" />
    `;
  }
  if (style === 'double') {
    return `
      <line x1="${x1}" y1="${y - 2}" x2="${x2}" y2="${y - 2}" stroke="${accentColor}" stroke-width="1.5" />
      <line x1="${x1}" y1="${y + 2}" x2="${x2}" y2="${y + 2}" stroke="${accentColor}" stroke-width="1.5" />
    `;
  }
  if (style === 'dots') {
    const dotsCount = Math.max(3, Math.floor(width / 12));
    let dots = '';
    for (let i = 0; i < dotsCount; i++) {
      dots += `<circle cx="${x1 + i * 12 + 3}" cy="${y}" r="2" fill="${accentColor}" />`;
    }
    return dots;
  }
  if (style === 'offset-shadow') {
    return `
      <line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="#0f172a" stroke-width="3" />
      <line x1="${x1 + 3}" y1="${y + 3}" x2="${x2 + 3}" y2="${y + 3}" stroke="${accentColor}" stroke-width="2" />
    `;
  }
  return ''; // none
}

/**
 * Complete Brand Lockup SVG Generator
 * Combines Symbol (Monogram or Icon) + Wordmark + Tagline + Underline
 */
function generateBrandLockupSVG({
  symbolType = 'monogram', // 'monogram' or 'icon'
  initials = 'AD',
  shape = 'squircle',
  emblemStyle = 'solid',   // 'solid', 'outline', 'soft'
  iconId = 'terminal',
  markColor = '#2563eb',
  bgColor = '#2563eb',
  companyName = 'Apex Studio',
  tagline = 'Design & Technology',
  underlineStyle = 'solid',    // 'none', 'solid', 'dashed', 'accent-pip', 'gradient', 'double', 'dots', 'offset-shadow'
  underlineSpan = 'auto',      // 'auto', 'title', 'short', 'extended', 'custom'
  underlineWidth = 0,          // manual pixel length if > 0
  underlinePosition = 'bottom',// 'bottom' (below tagline) or 'middle' (between title & tagline)
  layout = 'horizontal',       // 'horizontal' or 'stacked'
  textColor = '#0f172a',
  accentColor = '#2563eb'
}) {
  const sanitizedName = escapeXml(companyName || '');
  const sanitizedTag = escapeXml((tagline || '').toUpperCase());

  const symbolSVG = renderSymbolSVG(symbolType, initials, shape, iconId, markColor, bgColor, emblemStyle);

  const titleWidth = estimateTextWidth(sanitizedName, 20, false, -0.4);
  const tagWidth = sanitizedTag ? estimateTextWidth(sanitizedTag, 9, true, 1.5) : 0;
  const maxTextWidth = Math.max(titleWidth, tagWidth);

  // Compute underline length accurately matching user choice or subtext
  let lineW = Math.max(40, maxTextWidth);
  if (underlineWidth && parseInt(underlineWidth, 10) > 0) {
    lineW = parseInt(underlineWidth, 10);
  } else if (underlineSpan === 'title') {
    lineW = Math.max(30, titleWidth);
  } else if (underlineSpan === 'short') {
    lineW = 45;
  } else if (underlineSpan === 'extended') {
    lineW = maxTextWidth + 35;
  } else {
    // 'auto': exactly spans the longer of wordmark or subtitle
    lineW = Math.max(40, maxTextWidth);
  }

  if (layout === 'stacked') {
    const width = Math.max(300, Math.round(Math.max(maxTextWidth, lineW) + 60));
    const height = 120;
    const centerX = width / 2;
    const symbolX = centerX - 28;

    let yTitle = 76;
    let yTag = 94;
    let yUnderline = 104;

    if (underlinePosition === 'middle' && sanitizedTag) {
      yTitle = 72;
      yUnderline = 82;
      yTag = 96;
    }

    const startX = centerX - Math.round(lineW / 2);
    const underlineMarkup = renderUnderlineSVG(underlineStyle, startX, yUnderline, lineW, accentColor);

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
      <g transform="translate(${symbolX}, 6)">${symbolSVG}</g>
      <text x="${centerX}" y="${yTitle}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="18" font-weight="800" fill="${textColor}" text-anchor="middle" letter-spacing="-0.3">${sanitizedName}</text>
      ${sanitizedTag ? `<text x="${centerX}" y="${yTag}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="8.5" font-weight="600" fill="#64748b" text-anchor="middle" letter-spacing="1.8">${sanitizedTag}</text>` : ''}
      ${underlineMarkup}
    </svg>`;

    return svgToDataURI(svg);
  }

  // Default: Horizontal Lockup
  let yTitle = 34;
  let yTag = 50;
  let yUnderline = 62;
  let svgHeight = 74;

  if (underlinePosition === 'middle' && sanitizedTag) {
    yTitle = 28;
    yUnderline = 38;
    yTag = 54;
    svgHeight = 74;
  } else if (!sanitizedTag) {
    yTitle = 33;
    yUnderline = 46;
    svgHeight = 64;
  }

  const startX = 74;
  const underlineMarkup = renderUnderlineSVG(underlineStyle, startX, yUnderline, lineW, accentColor);
  const totalContentWidth = startX + Math.max(maxTextWidth, lineW) + 20;
  const width = Math.max(280, Math.min(560, Math.round(totalContentWidth)));

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${svgHeight}" width="${width}" height="${svgHeight}">
    <g transform="translate(6, 8)">${symbolSVG}</g>
    <text x="74" y="${yTitle}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="20" font-weight="800" fill="${textColor}" letter-spacing="-0.4">${sanitizedName}</text>
    ${sanitizedTag ? `<text x="74" y="${yTag}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="9" font-weight="600" fill="#64748b" letter-spacing="1.5">${sanitizedTag}</text>` : ''}
    ${underlineMarkup}
  </svg>`;

  return svgToDataURI(svg);
}

/**
 * Backward compatibility helpers
 */
function generateMonogramSVG(initials, shape, bgColor, textColor) {
  return generateBrandLockupSVG({
    symbolType: 'monogram',
    initials,
    shape,
    markColor: textColor,
    bgColor,
    companyName: '',
    tagline: '',
    underlineStyle: 'none',
    layout: 'horizontal'
  });
}

function generateIconDataURI(iconId, color = '#2563eb', bgColor = 'transparent', shape = 'none') {
  return generateBrandLockupSVG({
    symbolType: 'icon',
    iconId,
    shape,
    markColor: color,
    bgColor,
    companyName: '',
    tagline: '',
    underlineStyle: 'none',
    layout: 'horizontal'
  });
}

  // --- 6. Conversion & Duplicate Lifecycle ---

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
function buildConversionRecords({ source, invoiceId, invoiceNumber, now, company } = {}) {
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
function buildDuplicateRecord({ source, id, number, now } = {}) {
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

  // --- 7. Reporting Engine ---

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
function normalizeReportInvoice(invoice) {
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
function filterReportRows(rows, filters = {}) {
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
function buildReportModel({ invoices, clients, companies, filters, now } = {}) {
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
function summarizeHome({ invoices, clients, companies, now } = {}) {
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
function toCsv(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return '';
  return rows.map(cells => (Array.isArray(cells) ? cells : [cells]).map(csvCell).join(',')).join('\n');
}

  // --- 8. Reports View ---

/**
 * InvoiceCraft — Reports view UI.
 *
 * Mounts the full-page Reports view into a supplied root element:
 * Dashboard / Documents / Tax tabs, filter bar (date preset + custom range,
 * company, client, type, status, currency), per-currency stat cards,
 * company/client summaries, conversion + paid-proforma summaries, the
 * document register (Load / CSV), tax by rate and by leg, print button and
 * loading / empty / error states.
 *
 * Contract with the shell:
 *  - mountReportsView(root, { onOpenDocument }) — shell supplies the element
 *    and an open-in-Compose callback. The editor DOM is never assumed.
 *  - refreshReportsView() re-reads IndexedDB and re-renders.
 *  - One load per refresh, filter in memory, request token guards against
 *    stale async results when the view is refreshed quickly.
 *  - All element ids are report-* only; no editor/modal ids are touched.
 */





// ============================================================================
// 1. STATE
// ============================================================================
const state = {
  mounted: false,
  root: null,
  onOpenDocument: null,
  requestToken: 0,
  activeTab: 'dashboard',
  loading: false,
  model: null,
  filters: {
    datePreset: 'all', // 'all' | 'this_month' | 'last_month' | 'this_fy' | 'last_fy' | 'custom'
    dateFrom: '',
    dateTo: '',
    docType: 'all',
    status: 'all',
    company: 'all',
    client: 'all',
    currency: 'all'
  }
};

// ============================================================================
// 2. SMALL UTILITIES
// ============================================================================
function esc(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Returns { from, to } as YYYY-MM-DD strings ('' = unbounded). */
function resolvePresetRange(preset, now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (preset) {
    case 'this_month':
      return { from: `${y}-${pad2(m + 1)}-01`, to: `${y}-${pad2(m + 1)}-31` };
    case 'last_month': {
      const py = m === 0 ? y - 1 : y;
      const pm = m === 0 ? 11 : m - 1;
      return { from: `${py}-${pad2(pm + 1)}-01`, to: `${py}-${pad2(pm + 1)}-31` };
    }
    case 'this_fy': {
      const fy = (m >= 3) ? { from: `${y}-04-01`, to: `${y + 1}-03-31` } : { from: `${y - 1}-04-01`, to: `${y}-03-31` };
      return fy;
    }
    case 'last_fy': {
      const fy = (m >= 3) ? { from: `${y - 1}-04-01`, to: `${y}-03-31` } : { from: `${y - 2}-04-01`, to: `${y - 1}-03-31` };
      return fy;
    }
    default:
      return { from: '', to: '' };
  }
}

function effectiveDateFilters() {
  const f = state.filters;
  if (f.datePreset !== 'custom') {
    const range = resolvePresetRange(f.datePreset, new Date());
    return { dateFrom: range.from, dateTo: range.to };
  }
  return { dateFrom: f.dateFrom, dateTo: f.dateTo };
}

function money(value, rowLike) {
  return formatMoney(value, rowLike && rowLike.currencySymbol ? rowLike.currencySymbol : '', rowLike && rowLike.numberFormat ? rowLike.numberFormat : 'international');
}

function sortRowsNewest(rows) {
  return [...rows].sort((a, b) => {
    const d = String(b.issueDate || '').localeCompare(String(a.issueDate || ''));
    if (d !== 0) return d;
    return String(b.number || '').localeCompare(String(a.number || ''));
  });
}

// ============================================================================
// 3. FILTERED AGGREGATION (all money stays inside per-currency buckets)
// ============================================================================
function aggregateRows(rows) {
  const byCurrency = new Map();
  const companies = new Map();
  const clients = new Map();
  const taxRates = new Map(); // currencyKey -> Map(rate -> {taxable, tax})
  const taxLegs = new Map();  // currencyKey -> Map(name -> {ratio, amount})

  function currencyBucket(row) {
    let bucket = byCurrency.get(row.currencyKey);
    if (!bucket) {
      bucket = { currencyKey: row.currencyKey, symbol: row.currencySymbol, numberFormat: row.numberFormat, documents: 0, invoices: 0, drafts: 0, revenue: 0, paid: 0, outstanding: 0, pipeline: 0, pipelineCount: 0, tax: 0 };
      byCurrency.set(row.currencyKey, bucket);
    }
    return bucket;
  }

  function party(map, row, which) {
    const id = which === 'company' ? row.companyId : row.clientId;
    const name = which === 'company' ? row.companyName : row.clientName;
    const key = id ? 'id:' + id : 'name:' + name;
    let entry = map.get(key);
    if (!entry) {
      entry = { id, name: name || 'Unlinked', linked: which === 'company' ? row.companyLinked : row.clientLinked, count: 0, currencyBuckets: [] };
      map.set(key, entry);
    }
    entry.count += 1;
    if (row.isDraft || !row.isInvoice || row.isConvertedSource) return;
    let bucket = entry.currencyBuckets.find(b => b.currencyKey === row.currencyKey);
    if (!bucket) {
      bucket = { currencyKey: row.currencyKey, symbol: row.currencySymbol, numberFormat: row.numberFormat, revenue: 0, paid: 0, outstanding: 0, tax: 0 };
      entry.currencyBuckets.push(bucket);
    }
    bucket.revenue += row.total;
    bucket.tax += row.taxTotal;
    if (row.isPaid) bucket.paid += row.total;
    else if (row.isOutstanding) bucket.outstanding += row.total;
  }

  for (const row of rows) {
    const bucket = currencyBucket(row);
    bucket.documents += 1;
    if (row.docType === 'invoice') bucket.invoices += 1;
    if (row.isDraft) bucket.drafts += 1;

    if (!row.isDraft && row.isInvoice && !row.isConvertedSource) {
      bucket.revenue += row.total;
      bucket.tax += row.taxTotal;
      if (row.isPaid) bucket.paid += row.total;
      else if (row.isOutstanding) bucket.outstanding += row.total;

      // Tax-by-rate grouping for the Tax tab.
      if (!taxRates.has(row.currencyKey)) taxRates.set(row.currencyKey, new Map());
      const rateMap = taxRates.get(row.currencyKey);
      for (const rate of row.taxRates) {
        if (!rateMap.has(rate.rate)) rateMap.set(rate.rate, { rate: rate.rate, taxable: 0, tax: 0 });
        const r = rateMap.get(rate.rate);
        r.taxable += rate.taxable;
        r.tax += rate.tax;
      }

      if (!taxLegs.has(row.currencyKey)) taxLegs.set(row.currencyKey, new Map());
      const legMap = taxLegs.get(row.currencyKey);
      for (const leg of row.taxLegs) {
        const key = (leg.name || 'Tax') + '|' + leg.ratio;
        if (!legMap.has(key)) legMap.set(key, { name: leg.name || 'Tax', ratio: leg.ratio, amount: 0 });
        legMap.get(key).amount += leg.amount;
      }
    }

    const isProformaPaid = row.docType === 'proforma' && row.isPaid;
    if (!row.isDraft && row.docType !== 'invoice' && !row.isConvertedSource && !isProformaPaid && ['sent', 'accepted', 'pending'].includes(row.status)) {
      bucket.pipeline += row.total;
      bucket.pipelineCount += 1;
    }

    party(companies, row, 'company');
    party(clients, row, 'client');
  }

  return { byCurrency, companies, clients, taxRates, taxLegs };
}

function sortedCurrencyBuckets(byCurrency) {
  return [...byCurrency.values()].sort((a, b) => a.currencyKey.localeCompare(b.currencyKey));
}

function remarkOf(row) {
  const remarks = [];
  if (row.sourceDocId) remarks.push(`From ${row.sourceDocNumber || row.sourceDocId}`);
  if (row.convertedToId) remarks.push(`Converted to ${row.convertedToNumber || row.convertedToId}`);
  return remarks.join(' · ');
}

// ============================================================================
// 4. SKELETON
// ============================================================================
function buildSkeleton() {
  const root = state.root;
  root.classList.add('report-root');
  root.innerHTML = `
    <header class="report-header">
      <div class="report-heading-group">
        <h2 id="report-heading" class="report-title">Reports</h2>
        <p class="report-subtitle">Saved documents, revenue and tax — grouped strictly by currency.</p>
      </div>
      <div class="report-header-actions">
        <button id="report-btn-print" type="button" class="report-btn">Print</button>
      </div>
    </header>

    <div id="report-filterbar" class="report-filterbar">
      <label class="report-filter">
        <span>Period</span>
        <select id="report-filter-date-preset">
          <option value="all">All time</option>
          <option value="this_month">This month</option>
          <option value="last_month">Last month</option>
          <option value="this_fy">This FY</option>
          <option value="last_fy">Last FY</option>
          <option value="custom">Custom range</option>
        </select>
      </label>
      <label class="report-filter report-filter-date">
        <span>From</span>
        <input id="report-filter-date-from" type="date" disabled />
      </label>
      <label class="report-filter report-filter-date">
        <span>To</span>
        <input id="report-filter-date-to" type="date" disabled />
      </label>
      <label class="report-filter">
        <span>Company</span>
        <select id="report-filter-company"></select>
      </label>
      <label class="report-filter">
        <span>Client</span>
        <select id="report-filter-client"></select>
      </label>
      <label class="report-filter">
        <span>Type</span>
        <select id="report-filter-type">
          <option value="all">All types</option>
          <option value="invoice">Invoices</option>
          <option value="quotation">Quotations</option>
          <option value="estimate">Estimates</option>
          <option value="proforma">Proformas</option>
        </select>
      </label>
      <label class="report-filter">
        <span>Status</span>
        <select id="report-filter-status">
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="pending">Pending</option>
          <option value="paid">Paid</option>
          <option value="sent">Sent</option>
          <option value="accepted">Accepted</option>
          <option value="declined">Declined</option>
          <option value="expired">Expired</option>
        </select>
      </label>
      <label class="report-filter">
        <span>Currency</span>
        <select id="report-filter-currency"></select>
      </label>
      <button id="report-btn-clear-filters" type="button" class="report-btn report-btn-ghost">Clear</button>
    </div>

    <nav id="report-tabbar" class="report-tabbar" aria-label="Report views">
      <button id="report-tab-dashboard" type="button" class="report-tab is-active" data-tab="dashboard">Dashboard</button>
      <button id="report-tab-documents" type="button" class="report-tab" data-tab="documents">Documents</button>
      <button id="report-tab-tax" type="button" class="report-tab" data-tab="tax">Tax</button>
    </nav>

    <div class="report-content-wrap">
      <div id="report-content"></div>
    </div>
  `;
}

function contentEl() {
  return state.root ? state.root.querySelector('#report-content') : null;
}

// ============================================================================
// 5. FILTER OPTIONS
// ============================================================================
function renderFilterOptions() {
  const model = state.model;
  if (!model || !state.root) return;

  const companySelect = state.root.querySelector('#report-filter-company');
  const clientSelect = state.root.querySelector('#report-filter-client');
  const currencySelect = state.root.querySelector('#report-filter-currency');

  const prevCompany = state.filters.company;
  const prevClient = state.filters.client;
  const prevCurrency = state.filters.currency;

  const companyOptions = ['<option value="all">All companies</option>'];
  for (const c of model.companySummaries) {
    const value = c.id || c.name;
    companyOptions.push(`<option value="${esc(value)}">${esc(c.name)}${c.linked ? '' : ' · unlinked'}</option>`);
  }
  companySelect.innerHTML = companyOptions.join('');

  const clientOptions = ['<option value="all">All clients</option>'];
  for (const c of model.clientSummaries) {
    const value = c.id || c.name;
    clientOptions.push(`<option value="${esc(value)}">${esc(c.name)}${c.linked ? '' : ' · unlinked'}</option>`);
  }
  clientSelect.innerHTML = clientOptions.join('');

  const currencies = new Map();
  for (const row of model.rows) {
    if (row.currencyKey) currencies.set(row.currencyKey, row.currencySymbol || row.currencyKey);
  }
  const currencyOptions = ['<option value="all">All currencies</option>'];
  for (const [key, symbol] of [...currencies.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    currencyOptions.push(`<option value="${esc(key)}">${esc(symbol)} · ${esc(key)}</option>`);
  }
  currencySelect.innerHTML = currencyOptions.join('');

  // Preserve user selections while they still exist; otherwise reset the
  // applied filter and control together, then rebuild once. 'all' is always
  // present, so this cannot loop.
  const hasOption = (select, value) => [...select.options].some(o => o.value === value);
  let filtersReset = false;

  if (hasOption(companySelect, prevCompany)) {
    companySelect.value = prevCompany;
  } else {
    state.filters.company = 'all';
    companySelect.value = 'all';
    filtersReset = true;
  }
  if (hasOption(clientSelect, prevClient)) {
    clientSelect.value = prevClient;
  } else {
    state.filters.client = 'all';
    clientSelect.value = 'all';
    filtersReset = true;
  }
  if (hasOption(currencySelect, prevCurrency)) {
    currencySelect.value = prevCurrency;
  } else {
    state.filters.currency = 'all';
    currencySelect.value = 'all';
    filtersReset = true;
  }

  if (filtersReset) onFilterChange();
  return filtersReset;
}

// ============================================================================
// 6. STATEFUL VIEWS
// ============================================================================
function renderLoading() {
  const content = contentEl();
  if (!content) return;
  content.innerHTML = `
    <div class="report-state-card" id="report-loading">
      <div class="report-spinner" aria-hidden="true"></div>
      <p>Reading your saved documents&hellip;</p>
    </div>
  `;
}

function renderError(message) {
  const content = contentEl();
  if (!content) return;
  content.innerHTML = `
    <div class="report-state-card report-state-error" id="report-error">
      <h3>Reports could not be loaded</h3>
      <p>${esc(message || 'Something went wrong while reading the local database.')}</p>
      <button id="report-btn-retry" type="button" class="report-btn">Retry</button>
    </div>
  `;
}

function renderEmpty(reason) {
  const content = contentEl();
  if (!content) return;
  content.innerHTML = `
    <div class="report-state-card" id="report-empty">
      <h3>${reason.heading}</h3>
      <p>${reason.body}</p>
    </div>
  `;
}

// ============================================================================
// 7. DASHBOARD TAB
// ============================================================================
function renderDashboard() {
  const model = state.model;
  const content = contentEl();
  if (!model || !content) return;

  const filtered = model.filteredRows;
  const agg = aggregateRows(filtered);
  const cards = [];

  // Top-level stat cards (counts only — money never crosses currencies).
  const invoicesCount = filtered.filter(r => r.docType === 'invoice').length;
  const unpaidCount = filtered.filter(r => r.docType === 'invoice' && r.isOutstanding).length;
  const openQuoteCount = filtered.filter(r => r.docType === 'quotation' && !r.isDraft && !r.isConvertedSource && ['sent', 'accepted'].includes(r.status)).length;
  const draftCount = filtered.filter(r => r.isDraft).length;
  const convertedCount = filtered.filter(r => r.isInvoice && r.isConvertedChild).length;

  cards.push(`<div class="report-card"><span class="report-card-label">Documents</span><span class="report-card-value">${filtered.length}</span></div>`);
  cards.push(`<div class="report-card"><span class="report-card-label">Invoices</span><span class="report-card-value">${invoicesCount}</span></div>`);
  cards.push(`<div class="report-card"><span class="report-card-label">Unpaid invoices</span><span class="report-card-value">${unpaidCount}</span></div>`);
  cards.push(`<div class="report-card"><span class="report-card-label">Open quotes</span><span class="report-card-value">${openQuoteCount}</span></div>`);
  cards.push(`<div class="report-card"><span class="report-card-label">Drafts</span><span class="report-card-value">${draftCount}</span></div>`);
  cards.push(`<div class="report-card"><span class="report-card-label">From conversion</span><span class="report-card-value">${convertedCount}</span></div>`);

  // Document inventory by type/status for the filtered set (counts only).
  const typeLabels = { invoice: 'Invoice', quotation: 'Quotation', estimate: 'Estimate', proforma: 'Proforma' };
  const typeCounts = { invoice: 0, quotation: 0, estimate: 0, proforma: 0 };
  const statusLabels = { draft: 'Draft', pending: 'Pending', paid: 'Paid', sent: 'Sent', accepted: 'Accepted', declined: 'Declined', expired: 'Expired' };
  const statusOrder = ['draft', 'pending', 'sent', 'accepted', 'paid', 'declined', 'expired'];
  const statusCounts = new Map();
  for (const row of filtered) {
    if (Object.prototype.hasOwnProperty.call(typeCounts, row.docType)) typeCounts[row.docType] += 1;
    statusCounts.set(row.status, (statusCounts.get(row.status) || 0) + 1);
  }
  const typeCountRows = Object.keys(typeCounts)
    .map(type => `<div><dt>${esc(typeLabels[type])}</dt><dd>${typeCounts[type]}</dd></div>`)
    .join('');
  const statusEntries = statusOrder
    .filter(status => statusCounts.has(status))
    .map(status => [status, statusCounts.get(status)]);
  for (const [status, count] of statusCounts) {
    if (!Object.prototype.hasOwnProperty.call(statusLabels, status)) statusEntries.push([status, count]);
  }
  const statusCountRows = statusEntries
    .map(([status, count]) => `<div><dt>${esc(statusLabels[status] || status)}</dt><dd>${count}</dd></div>`)
    .join('');

  // Per-currency cards — bucket by bucket money.
  const currencyBlocks = sortedCurrencyBuckets(agg.byCurrency).map(bucket => `
    <div class="report-card report-card-currency">
      <span class="report-card-label">Revenue · ${esc(bucket.symbol || bucket.currencyKey || 'No currency')}</span>
      <span class="report-card-value">${esc(money(bucket.revenue, bucket))}</span>
      <dl class="report-card-breakdown">
        <div><dt>Paid</dt><dd>${esc(money(bucket.paid, bucket))}</dd></div>
        <div><dt>Outstanding</dt><dd>${esc(money(bucket.outstanding, bucket))}</dd></div>
        <div><dt>Pipeline</dt><dd>${esc(money(bucket.pipeline, bucket))} (${bucket.pipelineCount})</dd></div>
        <div><dt>Tax</dt><dd>${esc(money(bucket.tax, bucket))}</dd></div>
        <div><dt>Drafts</dt><dd>${bucket.drafts}</dd></div>
      </dl>
    </div>
  `).join('');

  // Conversion & paid proforma summaries.
  const convertedSources = filtered.filter(r => r.isConvertedSource);
  const proformaPaid = filtered.filter(r => r.isPaid && r.docType === 'proforma' && !r.isDraft);
  const proformaPaidBuckets = new Map();
  for (const row of proformaPaid) {
    if (!proformaPaidBuckets.has(row.currencyKey)) {
      proformaPaidBuckets.set(row.currencyKey, { currencyKey: row.currencyKey, symbol: row.currencySymbol, numberFormat: row.numberFormat, count: 0, total: 0 });
    }
    const b = proformaPaidBuckets.get(row.currencyKey);
    b.count += 1;
    b.total += row.total;
  }

  const companyRowsTable = companySummaryTable(agg.companies);
  const clientRowsTable = clientSummaryTable(agg.clients);

  const recent = sortRowsNewest(filtered).slice(0, 5);
  const recentMarkup = recent.map(row => `
    <li class="report-recent-item">
      <span class="report-recent-num">${esc(row.number || '(no number)')}</span>
      <span class="report-recent-meta">${esc(row.docTypeLabel)} · ${esc(row.statusLabel)} · ${esc(row.issueDate || '—')}</span>
      <button type="button" class="report-btn report-btn-ghost" data-report-open="${esc(row.id)}">Load</button>
    </li>
  `).join('');

  content.innerHTML = `
    <div class="report-cards" id="report-stat-cards">${cards.join('')}</div>
    <section class="report-section panel" id="report-counts-section">
      <div class="report-section-panel">
        <h3 class="report-section-title" id="report-type-counts-title">Documents by type</h3>
        <dl class="report-card-breakdown" id="report-type-counts">${typeCountRows}</dl>
      </div>
      <div class="report-section-panel">
        <h3 class="report-section-title" id="report-status-counts-title">Documents by status</h3>
        <dl class="report-card-breakdown" id="report-status-counts">${statusCountRows}</dl>
      </div>
    </section>
    <section class="report-section">
      <h3 class="report-section-title" id="report-currency-summary-title">By currency</h3>
      <div class="report-cards">${currencyBlocks || '<p class="report-muted">No documents in this period.</p>'}</div>
    </section>
    <section class="report-section">
      <h3 class="report-section-title" id="report-company-summary-title">By company</h3>
      ${companyRowsTable}
      ${clientRowsTable}
    </section>
    <section class="report-section report-section-two">
      <div class="report-section-panel">
        <h3 class="report-section-title" id="report-conversion-summary-title">Conversions</h3>
        <p class="report-muted">${convertedSources.length} source document${convertedSources.length === 1 ? '' : 's'} converted into invoices (durable links).</p>
        <ul class="report-plain-list" id="report-conversion-list">
          ${convertedSources.slice(0, 5).map(r => `<li><strong>${esc(r.number || r.id)}</strong> → ${esc(r.convertedToNumber || r.convertedToId)}</li>`).join('')}
        </ul>
        <h3 class="report-section-title" id="report-paidproforma-summary-title">Paid proformas</h3>
        <ul class="report-plain-list" id="report-paidproforma-list">
          ${proformaPaidBuckets.size
            ? [...proformaPaidBuckets.values()].map(b => `<li><strong>${esc(b.symbol || b.currencyKey)}</strong> ${esc(money(b.total, b))} · ${b.count} proforma${b.count === 1 ? '' : 's'}</li>`).join('')
            : '<li class="report-muted">None in this period.</li>'}
        </ul>
      </div>
      <div class="report-section-panel">
        <h3 class="report-section-title" id="report-recent-title">Recent documents</h3>
        <ul class="report-recent-list" id="report-recent-list">
          ${recentMarkup || '<li class="report-muted">No documents yet.</li>'}
        </ul>
      </div>
    </section>
  `;
}

function bucketLines(buckets, field) {
  if (!buckets.length) return '<span class="report-muted">—</span>';
  return buckets.map(b => `${esc(b.symbol || b.currencyKey || '')} ${esc(money(b[field] || 0, b))}`).join('<br>');
}

function companySummaryTable(companies) {
  const list = [...companies.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const body = list.map(c => `
    <tr>
      <td>${esc(c.name)}${c.linked ? '' : ' <span class="report-tag-unlinked">unlinked</span>'}</td>
      <td>${c.count}</td>
      <td>${bucketLines(c.currencyBuckets, 'revenue')}</td>
      <td>${bucketLines(c.currencyBuckets, 'paid')}</td>
      <td>${bucketLines(c.currencyBuckets, 'outstanding')}</td>
      <td>${bucketLines(c.currencyBuckets, 'tax')}</td>
    </tr>
  `).join('');
  return `
    <div class="report-table-wrap">
      <table class="report-table" id="report-company-table">
        <thead><tr><th>Company</th><th>Documents</th><th>Invoiced</th><th>Paid</th><th>Outstanding</th><th>Tax</th></tr></thead>
        <tbody>${body || '<tr><td colspan="6" class="report-muted">No companies to show.</td></tr>'}</tbody>
      </table>
    </div>
  `;
}

function clientSummaryTable(clients) {
  const list = [...clients.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  if (list.length === 0) return '';
  const body = list.map(c => `
    <tr>
      <td>${esc(c.name)}${c.linked ? '' : ' <span class="report-tag-unlinked">unlinked</span>'}</td>
      <td>${c.count}</td>
      <td>${bucketLines(c.currencyBuckets, 'revenue')}</td>
      <td>${bucketLines(c.currencyBuckets, 'paid')}</td>
      <td>${bucketLines(c.currencyBuckets, 'outstanding')}</td>
    </tr>
  `).join('');
  return `
    <h3 class="report-section-title" id="report-client-summary-title">By client</h3>
    <div class="report-table-wrap">
      <table class="report-table" id="report-client-table">
        <thead><tr><th>Client</th><th>Documents</th><th>Invoiced</th><th>Paid</th><th>Outstanding</th></tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  `;
}

// ============================================================================
// 8. DOCUMENTS TAB
// ============================================================================
function csvRows() {
  const model = state.model;
  const rows = [['Number', 'Type', 'Status', 'Issue Date', 'Due Date', 'Company', 'Client', 'Currency', 'Total', 'Conversion']];
  for (const row of sortRowsNewest(model.filteredRows)) {
    rows.push([
      row.number,
      row.docTypeLabel,
      row.statusLabel,
      row.issueDate,
      row.dueDate,
      row.companyName,
      row.clientName,
      row.currencyKey || row.currencySymbol,
      money(row.total, row),
      remarkOf(row)
    ]);
  }
  return rows;
}

function downloadCsv() {
  if (!state.model) return;
  const csv = toCsv(csvRows());
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const now = new Date();
  a.href = url;
  a.download = `invoicecraft-documents-${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function renderDocuments() {
  const model = state.model;
  const content = contentEl();
  if (!model || !content) return;

  const rows = sortRowsNewest(model.filteredRows);
  const body = rows.map(row => `
    <tr class="report-doc-row" data-report-id="${esc(row.id)}">
      <td class="report-strong">${esc(row.number || '(no number)')}</td>
      <td>${esc(row.docTypeLabel)}</td>
      <td><span class="report-status report-status-${esc(row.status)}">${esc(row.statusLabel)}</span></td>
      <td>${esc(row.issueDate || '—')}</td>
      <td>${esc(row.companyName || '—')}${row.companyLinked === false ? ' <span class="report-tag-unlinked">unlinked</span>' : ''}</td>
      <td>${esc(row.clientName || '—')}${row.clientLinked === false ? ' <span class="report-tag-unlinked">unlinked</span>' : ''}</td>
      <td>${esc(row.currencySymbol || row.currencyKey || '—')}</td>
      <td class="report-num">${esc(money(row.total, row))}</td>
      <td>${esc(remarkOf(row) || '—')}</td>
      <td><button type="button" class="report-btn report-btn-ghost" data-report-open="${esc(row.id)}">Load</button></td>
    </tr>
  `).join('');

  const typeText = rows.length === 1 ? 'document' : 'documents';

  content.innerHTML = `
    <div class="report-toolbar">
      <span class="report-muted" id="report-doc-count">${rows.length} ${typeText}</span>
      <div class="report-header-actions">
        <button id="report-btn-csv" type="button" class="report-btn">Export CSV</button>
      </div>
    </div>
    <div class="report-table-wrap">
      <table class="report-table" id="report-documents-table">
        <thead>
          <tr>
            <th>Number</th><th>Type</th><th>Status</th><th>Issued</th>
            <th>Company</th><th>Client</th><th>Cur</th>
            <th class="report-num">Total</th><th>Conversion</th><th></th>
          </tr>
        </thead>
        <tbody>${body || '<tr><td colspan="10" class="report-muted">No documents match the current filters.</td></tr>'}</tbody>
      </table>
    </div>
  `;
}

// ============================================================================
// 9. TAX TAB
// ============================================================================
function renderTax() {
  const model = state.model;
  const content = contentEl();
  if (!model || !content) return;

  const rows = model.filteredRows;
  if (rows.length === 0) {
    renderEmpty({
      heading: 'No tax to report',
      body: 'No saved documents match the current filters. Loosen the period or status filters and try again.'
    });
    return;
  }

  const agg = aggregateRows(rows);
  const currencyList = sortedCurrencyBuckets(agg.byCurrency);

  const rateRows = currencyList.map(bucket => {
    const rateMap = agg.taxRates.get(bucket.currencyKey);
    if (!rateMap) return '';
    return [...rateMap.values()]
      .sort((a, b) => b.rate - a.rate)
      .map(r => `
        <tr>
          <td>${esc(bucket.symbol || bucket.currencyKey)}</td>
          <td>${esc(r.rate)}%</td>
          <td class="report-num">${esc(money(r.taxable, bucket))}</td>
          <td class="report-num">${esc(money(r.tax, bucket))}</td>
        </tr>
      `).join('');
  }).join('');

  const legRows = currencyList.map(bucket => {
    const legMap = agg.taxLegs.get(bucket.currencyKey);
    if (!legMap) return '';
    return [...legMap.values()].map(l => `
      <tr>
        <td>${esc(bucket.symbol || bucket.currencyKey)}</td>
        <td>${esc(l.name)}</td>
        <td>${esc(l.ratio)}% split</td>
        <td class="report-num">${esc(money(l.amount, bucket))}</td>
      </tr>
    `).join('');
  }).join('');

  content.innerHTML = `
    <section class="report-section" id="report-tax-by-rate">
      <h3 class="report-section-title">Tax by rate</h3>
      <div class="report-table-wrap">
        <table class="report-table">
          <thead><tr><th>Currency</th><th>Rate</th><th class="report-num">Taxable</th><th class="report-num">Tax</th></tr></thead>
          <tbody>${rateRows || '<tr><td colspan="4" class="report-muted">No taxable invoices in this period.</td></tr>'}</tbody>
        </table>
      </div>
    </section>
    <section class="report-section" id="report-tax-by-leg">
      <h3 class="report-section-title">Tax by leg</h3>
      <div class="report-table-wrap">
        <table class="report-table">
          <thead><tr><th>Currency</th><th>Leg</th><th>Split</th><th class="report-num">Tax amount</th></tr></thead>
          <tbody>${legRows || '<tr><td colspan="4" class="report-muted">No tax legs recorded in this period.</td></tr>'}</tbody>
        </table>
      </div>
    </section>
    <p class="report-muted" id="report-tax-note">Tax legs are split shares of the computed tax, never extra rates. Totals match the invoice sheet.</p>
  `;
}

// ============================================================================
// 10. RENDER PIPELINE
// ============================================================================
function renderActiveTab() {
  const model = state.model;
  if (!model) return;

  const tabbar = state.root.querySelector('#report-tabbar');
  for (const tab of tabbar.querySelectorAll('.report-tab')) {
    tab.classList.toggle('is-active', tab.dataset.tab === state.activeTab);
  }

  if (model.rows.length === 0) {
    renderEmpty({
      heading: 'No saved documents yet',
      body: 'Save an invoice, quotation, estimate or proforma in Compose and it will appear here with revenue, pipeline and tax stats.'
    });
    renderFilterOptions();
    return;
  }

  if (model.filteredRows.length === 0) {
    renderEmpty({
      heading: 'Nothing matches these filters',
      body: 'Try a wider period, different status, or clear the filters to see everything.'
    });
    // Rebuild the controls even when nothing matched; a vanished selection
    // may need to be reset and reloaded.
    renderFilterOptions();
    return;
  }

  if (renderFilterOptions()) return;
  if (state.activeTab === 'documents') renderDocuments();
  else if (state.activeTab === 'tax') renderTax();
  else renderDashboard();
}

// ============================================================================
// 11. DATA LOAD
// ============================================================================
function setPrintEnabled(enabled) {
  const button = state.root && state.root.querySelector('#report-btn-print');
  if (button) button.disabled = !enabled;
}

async function loadAndRender() {
  if (!state.mounted || !state.root) return;
  const token = ++state.requestToken;

  state.loading = true;
  setPrintEnabled(false);
  renderLoading();

  try {
    const [invoices, clients, companies] = await Promise.all([
      getAllInvoices(),
      getAllClients(),
      getAllCompanies()
    ]);
    if (token !== state.requestToken) return; // stale result — a newer refresh won

    const dates = effectiveDateFilters();
    state.model = buildReportModel({
      invoices,
      clients,
      companies,
      filters: {
        dateFrom: dates.dateFrom,
        dateTo: dates.dateTo,
        docType: state.filters.docType,
        status: state.filters.status,
        company: state.filters.company,
        client: state.filters.client,
        currency: state.filters.currency
      },
      now: new Date()
    });
    renderActiveTab();
  } catch (err) {
    if (token !== state.requestToken) return;
    console.error('[report-ui] load failed:', err);
    state.model = null;
    renderError((err && err.message) ? err.message : 'The local database is not responding.');
  } finally {
    if (token === state.requestToken) {
      state.loading = false;
      setPrintEnabled(Boolean(state.model));
    }
  }
}

// ============================================================================
// 12. EVENT WIRING
// ============================================================================
function onFilterChange() {
  loadAndRender().catch(err => console.error('[report-ui] refresh failed:', err));
}

function attachEvents() {
  const root = state.root;

  root.addEventListener('change', (event) => {
    const target = event.target;
    switch (target.id) {
      case 'report-filter-date-preset': {
        state.filters.datePreset = target.value;
        const fromInput = root.querySelector('#report-filter-date-from');
        const toInput = root.querySelector('#report-filter-date-to');
        const isCustom = state.filters.datePreset === 'custom';
        fromInput.disabled = !isCustom;
        toInput.disabled = !isCustom;
        if (!isCustom) {
          const range = resolvePresetRange(state.filters.datePreset, new Date());
          state.filters.dateFrom = range.from;
          state.filters.dateTo = range.to;
          fromInput.value = range.from;
          toInput.value = range.to;
        }
        onFilterChange();
        break;
      }
      case 'report-filter-date-from':
        state.filters.dateFrom = target.value;
        if (state.filters.dateTo && state.filters.dateTo < state.filters.dateFrom) {
          state.filters.dateTo = state.filters.dateFrom;
          root.querySelector('#report-filter-date-to').value = state.filters.dateTo;
        }
        onFilterChange();
        break;
      case 'report-filter-date-to':
        state.filters.dateTo = target.value;
        onFilterChange();
        break;
      case 'report-filter-company':
        state.filters.company = target.value;
        onFilterChange();
        break;
      case 'report-filter-client':
        state.filters.client = target.value;
        onFilterChange();
        break;
      case 'report-filter-type':
        state.filters.docType = target.value;
        onFilterChange();
        break;
      case 'report-filter-status':
        state.filters.status = target.value;
        onFilterChange();
        break;
      case 'report-filter-currency':
        state.filters.currency = target.value;
        onFilterChange();
        break;
      default:
        break;
    }
  });

  root.addEventListener('click', (event) => {
    const target = event.target;
    const tabButton = target.closest && target.closest('#report-tabbar .report-tab');
    if (tabButton) {
      state.activeTab = tabButton.dataset.tab;
      renderActiveTab();
      return;
    }

    const openButton = target.closest && target.closest('[data-report-open]');
    if (openButton && typeof state.onOpenDocument === 'function') {
      state.onOpenDocument(openButton.getAttribute('data-report-open'));
      return;
    }

    switch (target.id) {
      case 'report-btn-print':
        if (state.loading || !state.model) break;
        try { window.print(); } catch (e) { console.warn('[report-ui] print failed:', e); }
        break;
      case 'report-btn-csv':
        downloadCsv();
        break;
      case 'report-btn-retry':
        loadAndRender().catch(err => console.error('[report-ui] retry failed:', err));
        break;
      case 'report-btn-clear-filters':
        state.filters.datePreset = 'all';
        state.filters.dateFrom = '';
        state.filters.dateTo = '';
        state.filters.docType = 'all';
        state.filters.status = 'all';
        state.filters.company = 'all';
        state.filters.client = 'all';
        state.filters.currency = 'all';
        const presetSelect = root.querySelector('#report-filter-date-preset');
        if (presetSelect) presetSelect.value = 'all';
        const fromInput = root.querySelector('#report-filter-date-from');
        const toInput = root.querySelector('#report-filter-date-to');
        if (fromInput) { fromInput.value = ''; fromInput.disabled = true; }
        if (toInput) { toInput.value = ''; toInput.disabled = true; }
        const typeSelect = root.querySelector('#report-filter-type');
        if (typeSelect) typeSelect.value = 'all';
        const statusSelect = root.querySelector('#report-filter-status');
        if (statusSelect) statusSelect.value = 'all';
        const companySelect = root.querySelector('#report-filter-company');
        if (companySelect) companySelect.value = 'all';
        const clientSelect = root.querySelector('#report-filter-client');
        if (clientSelect) clientSelect.value = 'all';
        const currencySelect = root.querySelector('#report-filter-currency');
        if (currencySelect) currencySelect.value = 'all';
        onFilterChange();
        break;
      default:
        break;
    }
  });
}

// ============================================================================
// 13. PUBLIC API
// ============================================================================
/**
 * Mounts the Reports view skeleton into `root` and performs the first load.
 * `options.onOpenDocument(id)` is supplied by the shell and should navigate
 * to Compose with the requested document.
 */
function mountReportsView(root, options = {}) {
  if (!root) return;
  state.mounted = true;
  state.root = root;
  state.onOpenDocument = (typeof options.onOpenDocument === 'function') ? options.onOpenDocument : null;
  buildSkeleton();
  attachEvents();
  loadAndRender().catch(err => console.error('[report-ui] mount load failed:', err));
}

/**
 * Re-reads IndexedDB and re-renders the active tab. Safe to call even when
 * the view is not yet mounted (it becomes a no-op).
 */
function refreshReportsView() {
  if (!state.mounted || !state.root) return;
  loadAndRender().catch(err => console.error('[report-ui] refresh failed:', err));
}

/**
 * True only when Reports has finished loading a model and is safe to print.
 * Used by the shell to avoid printing the loading/error state via Ctrl+P.
 */
function canPrintReports() {
  return Boolean(state.mounted && state.root && !state.loading && state.model);
}

  // --- 9. App Shell, Home & Settings ---

/**
 * InvoiceCraft App Shell
 * Hash router, Home, Settings hub, shared print/shortcut routing.
 *
 * Views: #/home (default), #/compose, #/reports, #/settings.
 * Compose stays mounted; CSS toggles top-level views through body[data-view].
 */







const SHELL_APP_VERSION = '1.3.0';
const SHELL_ROUTES = ['home', 'compose', 'reports', 'settings'];
const SHELL_ROUTE_TITLES = {
  home: 'Home',
  compose: 'Compose',
  reports: 'Reports',
  settings: 'Settings'
};
const SHELL_HEADING_IDS = {
  home: 'home-heading',
  compose: 'compose-heading',
  reports: 'report-heading',
  settings: 'settings-heading'
};

let shellOptions = {};
let shellMounted = false;
let shellCurrentView = 'home';
let shellRouteToken = 0;
let shellHomeRenderToken = 0;
let shellHeaderMoreClose = null;

function normalizeRoute(value) {
  const raw = String(value || '').replace(/^#\/?/, '').split(/[/?]/)[0].toLowerCase();
  return SHELL_ROUTES.includes(raw) ? raw : 'home';
}

function parseHash() {
  return normalizeRoute(window.location.hash);
}

function setHash(view) {
  const target = '#/' + view;
  if (window.location.hash === target) return;
  try {
    window.history.replaceState(null, '', target);
  } catch (e) {
    window.location.hash = target;
  }
}

function isDialogOpen() {
  try {
    return Boolean(document.querySelector('dialog[open], .app-modal[open]'));
  } catch (e) {
    return false;
  }
}

function closeOpenDialogs() {
  document.querySelectorAll('dialog[open], .app-modal[open]').forEach(dialog => {
    try {
      if (typeof dialog.close === 'function') dialog.close();
      else {
        dialog.removeAttribute('open');
        dialog.style.display = 'none';
      }
    } catch (e) {
      try {
        dialog.removeAttribute('open');
        dialog.style.display = 'none';
      } catch (e2) {}
    }
  });
}

function openDialogById(id) {
  if (typeof shellOptions.onOpenModal === 'function') {
    return Promise.resolve(shellOptions.onOpenModal(id));
  }
  const modal = document.getElementById(id);
  if (!modal) return Promise.resolve(false);
  if (typeof modal.showModal === 'function') {
    try {
      modal.showModal();
      return Promise.resolve(true);
    } catch (e) {}
  }
  modal.setAttribute('open', '');
  modal.style.display = 'block';
  return Promise.resolve(true);
}

function setupHeaderMore() {
  const toggle = document.getElementById('btn-header-more');
  const panel = document.getElementById('header-more-panel');
  if (!toggle || !panel) return;

  let open = false;

  const setOpen = (next) => {
    open = Boolean(next);
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  };

  const close = () => {
    if (!open) return;
    setOpen(false);
  };

  shellHeaderMoreClose = close;

  toggle.addEventListener('click', () => {
    setOpen(!open);
  });

  // Let each button's own handler run first, then dismiss the menu.
  panel.addEventListener('click', (event) => {
    const target = event.target && event.target.nodeType === 1
      ? event.target
      : event.target && event.target.parentElement;
    if (!target || !target.closest || !target.closest('button')) return;
    setTimeout(close, 0);
  });

  document.addEventListener('click', (event) => {
    if (!open) return;
    const target = event.target;
    if (target && (toggle.contains(target) || panel.contains(target))) return;
    close();
  });

  document.addEventListener('keydown', (event) => {
    if (!open || event.key !== 'Escape') return;
    close();
    try { toggle.focus(); } catch (e) {}
  });

  toggle.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowDown') return;
    event.preventDefault();
    if (!open) setOpen(true);
    const first = panel.querySelector('button');
    if (first) first.focus();
  });
}

function closeHeaderMore() {
  if (typeof shellHeaderMoreClose === 'function') shellHeaderMoreClose();
}

function isEditingTarget(target) {
  if (!target || !target.tagName) return false;
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' ||
    target.isContentEditable === true ||
    Boolean(target.closest && target.closest('[contenteditable="true"]'));
}

function formatRelativeTime(timestamp) {
  if (!timestamp) return 'just now';
  const then = Number(timestamp);
  if (!Number.isFinite(then)) return 'recently';
  const diff = Math.max(0, Date.now() - then);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  try {
    return new Date(then).toLocaleDateString();
  } catch (e) {
    return 'recently';
  }
}

function shortDate(value) {
  if (!value) return '';
  try {
    // Date-only values must use the local calendar, not UTC midnight.
    const d = typeof value === 'number' ? new Date(value) : parseLocalDate(value);
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString();
  } catch (e) {
    return String(value);
  }
}

function shellEscapeHtml(str) {
  if (str === undefined || str === null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function countByType(invoices, type) {
  return invoices.filter(inv => ((inv && inv.meta && inv.meta.docType) || inv.docType || 'invoice') === type).length;
}

function fallbackSummary(invoices) {
  const currencyMap = new Map();
  invoices.forEach(inv => {
    const meta = inv.meta || {};
    const docType = meta.docType || inv.docType || 'invoice';
    const status = meta.status || inv.status || 'draft';
    const isDraft = status === 'draft';
    const norm = normalizeCurrency(meta.currency || '$');
    if (!currencyMap.has(norm.key)) {
      currencyMap.set(norm.key, {
        currencyKey: norm.key,
        currencySymbol: meta.currency || norm.symbol,
        invoices: 0,
        invoiceTotal: 0,
        paidTotal: 0,
        outstanding: 0,
        taxTotal: 0
      });
    }
    const bucket = currencyMap.get(norm.key);
    if (docType === 'invoice' && !isDraft) {
      const totals = calculateTotals(inv);
      bucket.invoices += 1;
      bucket.invoiceTotal += totals.total;
      bucket.taxTotal += totals.taxTotal;
      if (status === 'paid') bucket.paidTotal += totals.total;
      else bucket.outstanding += totals.total;
    }
  });
  const currencySummaries = Array.from(currencyMap.values());
  return {
    totalDocuments: invoices.length,
    invoiceCount: countByType(invoices, 'invoice'),
    openQuotes: invoices.filter(inv => {
      const type = (inv.meta && inv.meta.docType) || 'invoice';
      const status = (inv.meta && inv.meta.status) || '';
      return (type === 'quotation' || type === 'estimate') && status !== 'accepted' && status !== 'declined' && status !== 'expired';
    }).length,
    unpaidInvoices: invoices.filter(inv => {
      const type = (inv.meta && inv.meta.docType) || 'invoice';
      const status = (inv.meta && inv.meta.status) || '';
      return type === 'invoice' && status !== 'draft' && status !== 'paid';
    }).length,
    currencySummaries,
    recentDocuments: invoices.slice(0, 5)
  };
}

function numberValue() {
  return Array.prototype.slice.call(arguments).find(v => v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v)));
}

function normalizeCurrencySummaries(summary, invoices) {
  let list = summary && (summary.currencySummaries || summary.perCurrency || summary.currencies || summary.byCurrency);
  if (list && !Array.isArray(list) && typeof list === 'object') {
    list = Object.keys(list).map(key => Object.assign({ currencyKey: key }, list[key]));
  }
  if (!Array.isArray(list) || list.length === 0) {
    list = fallbackSummary(invoices).currencySummaries;
  }

  // Older summaries omit numberFormat; derive it from a saved document so
  // Home matches the Reports register (e.g. INR uses Indian grouping).
  const invoiceFormats = new Map();
  if (Array.isArray(invoices)) {
    for (const inv of invoices) {
      if (!inv) continue;
      const meta = inv.meta || {};
      const norm = normalizeCurrency(meta.currency || inv.currencyKey || '$');
      if (invoiceFormats.has(norm.key)) continue;
      const format = meta.numberFormat || inv.numberFormat;
      if (format) invoiceFormats.set(norm.key, format);
    }
  }

  return list.map(item => {
    const key = item.currencyKey || item.key || item.currency || '$';
    const norm = normalizeCurrency(key);
    return {
      key: norm.key,
      symbol: item.currencySymbol || item.symbol || key,
      numberFormat: item.numberFormat || invoiceFormats.get(norm.key) || 'international',
      invoices: Number(item.invoices ?? item.invoiceCount ?? item.count ?? 0),
      invoiced: Number(item.invoiceTotal ?? item.invoiced ?? item.totalInvoiced ?? item.revenue ?? item.total ?? 0),
      paid: Number(item.paidTotal ?? item.paid ?? 0),
      outstanding: Number(item.outstanding ?? item.unpaid ?? item.pending ?? 0),
      tax: Number(item.taxTotal ?? item.taxCurrentPeriod ?? item.tax ?? 0)
    };
  });
}

function renderHomeDraft(record) {
  const container = document.getElementById('home-continue');
  if (!container) return;
  if (!record || !record.data) {
    container.innerHTML = `
      <div class="home-continue-empty">
        <div>
          <div class="home-card-eyebrow">Continue working</div>
          <h2>No active draft yet</h2>
          <p>Start a new invoice or quotation. Your work is auto-saved locally as you type.</p>
        </div>
        <button type="button" class="btn btn-primary" data-home-action="new-invoice">New Invoice</button>
      </div>
    `;
    return;
  }

  const data = record.data || {};
  const meta = data.meta || {};
  const type = meta.docType || 'invoice';
  const typeName = type === 'quotation' ? 'Quotation' : type === 'estimate' ? 'Estimate' : type === 'proforma' ? 'Proforma' : 'Invoice';
  const number = meta.number || 'Untitled document';
  const client = (data.client && data.client.name) || 'No client yet';
  const currency = meta.currency || '$';
  const totals = calculateTotals(data);
  const totalText = formatMoney(totals.total, currency, meta.numberFormat || 'international');

  container.innerHTML = `
    <div class="home-continue-card">
      <div class="home-continue-main">
        <div class="home-card-eyebrow">Continue draft</div>
        <div class="home-continue-title-row">
          <h2>${shellEscapeHtml(number)}</h2>
          <span class="home-type-chip">${shellEscapeHtml(typeName)}</span>
        </div>
        <p>${shellEscapeHtml(client)} &bull; ${shellEscapeHtml(totalText)}</p>
        <p class="home-muted">Last saved ${shellEscapeHtml(formatRelativeTime(record.updatedAt))}</p>
      </div>
      <button type="button" class="btn btn-primary" data-home-action="resume-draft">Resume draft</button>
    </div>
  `;
}

function renderHomeStats(summary, currencySummaries, invoices) {
  const container = document.getElementById('home-stats');
  if (!container) return;

  const totalDocuments = numberValue(summary && summary.totalDocuments, summary && summary.documentCount, summary && summary.documents, invoices.length);
  const invoiceCount = numberValue(summary && summary.invoiceCount, summary && summary.invoices, countByType(invoices, 'invoice'));
  const openQuotes = numberValue(summary && summary.openQuotes, summary && summary.openQuoteCount, summary && summary.openQuotations);
  const unpaid = numberValue(summary && summary.unpaidInvoices, summary && summary.unpaidInvoiceCount, summary && summary.outstandingInvoices);

  container.innerHTML = `
    <div class="home-stat-card">
      <span class="home-stat-label">Documents</span>
      <strong class="home-stat-value">${shellEscapeHtml(totalDocuments)}</strong>
      <span class="home-stat-note">All saved types</span>
    </div>
    <div class="home-stat-card">
      <span class="home-stat-label">Invoices</span>
      <strong class="home-stat-value">${shellEscapeHtml(invoiceCount)}</strong>
      <span class="home-stat-note">Revenue documents</span>
    </div>
    <div class="home-stat-card">
      <span class="home-stat-label">Open quotes</span>
      <strong class="home-stat-value">${shellEscapeHtml(openQuotes !== undefined ? openQuotes : '—')}</strong>
      <span class="home-stat-note">Pipeline, not revenue</span>
    </div>
    <div class="home-stat-card">
      <span class="home-stat-label">Unpaid invoices</span>
      <strong class="home-stat-value">${shellEscapeHtml(unpaid !== undefined ? unpaid : '—')}</strong>
      <span class="home-stat-note">Outstanding balance below</span>
    </div>
    <div class="home-currency-wrap">
      ${currencySummaries.length === 0 ? '<div class="home-empty-inline">No saved invoice totals yet.</div>' : `
        <p class="home-currency-note">Invoiced, paid and outstanding are all-time. Tax is for the current month.</p>
        ${currencySummaries.map(c => `
        <div class="home-currency-card">
          <div class="home-currency-head">
            <strong>${shellEscapeHtml(c.symbol || c.key)}</strong>
            <span>${shellEscapeHtml(c.key)}</span>
          </div>
          <div class="home-currency-row"><span>Invoiced</span><strong>${shellEscapeHtml(formatMoney(c.invoiced, c.symbol, c.numberFormat))}</strong></div>
          <div class="home-currency-row"><span>Paid</span><span>${shellEscapeHtml(formatMoney(c.paid, c.symbol, c.numberFormat))}</span></div>
          <div class="home-currency-row"><span>Outstanding</span><span>${shellEscapeHtml(formatMoney(c.outstanding, c.symbol, c.numberFormat))}</span></div>
          <div class="home-currency-row"><span>Tax this month</span><span>${shellEscapeHtml(formatMoney(c.tax, c.symbol, c.numberFormat))}</span></div>
        </div>
      `).join('')}`}
    </div>
  `;
}

function renderRecentDocuments(summary, invoices) {
  const container = document.getElementById('home-recent');
  if (!container) return;
  let docs = summary && (summary.recentDocuments || summary.recent);
  if (!Array.isArray(docs) || docs.length === 0) docs = invoices.slice(0, 5);

  if (!docs || docs.length === 0) {
    container.innerHTML = '<div class="home-empty-inline">No documents saved yet. Your first invoice will appear here.</div>';
    return;
  }

  container.innerHTML = docs.slice(0, 5).map(doc => {
    const id = doc.id || '';
    const number = doc.number || (doc.meta && doc.meta.number) || 'Untitled';
    const type = doc.docType || (doc.meta && doc.meta.docType) || 'invoice';
    const status = doc.status || (doc.meta && doc.meta.status) || 'draft';
    const client = doc.clientName || (doc.client && doc.client.name) || 'Client';
    const currency = doc.currencySymbol || (doc.meta && doc.meta.currency) || doc.currencyKey || '$';
    const total = Number(doc.total ?? (doc.meta && doc.meta.total) ?? calculateTotals(doc).total) || 0;
    const date = doc.issueDate || (doc.meta && doc.meta.date) || doc.updatedAt;
    const numberFormat = doc.numberFormat || (doc.meta && doc.meta.numberFormat) || 'international';
    const remark = doc.convertedToNumber ? `Converted to ${doc.convertedToNumber}` : (doc.sourceDocNumber ? `From ${doc.sourceDocNumber}` : '');
    return `
      <div class="home-recent-row">
        <div class="home-recent-main">
          <div class="home-recent-title">
            <strong>${shellEscapeHtml(number)}</strong>
            <span class="home-type-chip">${shellEscapeHtml(type)}</span>
            <span class="home-status-chip">${shellEscapeHtml(status)}</span>
          </div>
          <div class="home-recent-meta">${shellEscapeHtml(client)}${date ? ' • ' + shellEscapeHtml(shortDate(date)) : ''}${remark ? ' • ' + shellEscapeHtml(remark) : ''}</div>
        </div>
        <div class="home-recent-actions">
          <span class="home-recent-total">${shellEscapeHtml(formatMoney(total, currency, numberFormat))}</span>
          ${id ? `<button type="button" class="btn btn-secondary btn-sm" data-open-document="${shellEscapeHtml(id)}">Open</button>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

async function updateStorageInfo() {
  const el = document.getElementById('home-storage-text');
  if (!el) return;
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      const used = estimate.usage || 0;
      const quota = estimate.quota || 0;
      if (quota > 0) {
        const usedMb = (used / (1024 * 1024)).toFixed(1);
        const pct = Math.min(100, (used / quota) * 100).toFixed(1);
        el.textContent = `IndexedDB in use: ~${usedMb} MB (${pct}% of available browser storage).`;
        return;
      }
    }
    el.textContent = 'IndexedDB storage is active in this browser. Use Backup regularly.';
  } catch (e) {
    el.textContent = 'IndexedDB storage is active in this browser. Use Backup regularly.';
  }
}

async function renderHome() {
  const token = ++shellHomeRenderToken;
  const draftEl = document.getElementById('home-continue');
  const statsEl = document.getElementById('home-stats');
  const recentEl = document.getElementById('home-recent');
  if (!draftEl || !statsEl || !recentEl) return;

  if (!draftEl.innerHTML.trim()) {
    draftEl.innerHTML = '<div class="home-loading">Loading your workspace…</div>';
  }

  let invoices = [];
  let clients = [];
  let companies = [];
  let draftRecord = null;
  try {
    const results = await Promise.all([
      getAllInvoices(),
      getAllClients(),
      getAllCompanies(),
      getActiveDraftRecord()
    ]);
    invoices = results[0] || [];
    clients = results[1] || [];
    companies = results[2] || [];
    draftRecord = results[3] || null;
  } catch (e) {
    if (token !== shellHomeRenderToken) return;
    draftEl.innerHTML = `<div class="home-empty-inline">Could not read local data: ${shellEscapeHtml(e && e.message ? e.message : 'database unavailable')}.</div>`;
    return;
  }
  if (token !== shellHomeRenderToken) return;

  let summary = null;
  try {
    summary = summarizeHome({ invoices, clients, companies, now: new Date() });
  } catch (e) {
    summary = fallbackSummary(invoices);
  }
  if (!summary || typeof summary !== 'object') summary = fallbackSummary(invoices);

  const currencySummaries = normalizeCurrencySummaries(summary, invoices);
  renderHomeDraft(draftRecord);
  renderHomeStats(summary, currencySummaries, invoices);
  renderRecentDocuments(summary, invoices);

  const draftState = document.getElementById('home-draft-state');
  if (draftState) {
    draftState.textContent = draftRecord ? `Draft saved ${formatRelativeTime(draftRecord.updatedAt)}` : 'No draft saved';
  }
  const versionEl = document.getElementById('home-version');
  if (versionEl) versionEl.textContent = SHELL_APP_VERSION;
  updateStorageInfo();
  refreshShellCounts({ invoices, clients, companies });
}

function refreshShellCounts(preloaded) {
  const update = ({ invoices, clients, companies }) => {
    document.querySelectorAll('[data-shell-count="documents"]').forEach(el => {
      el.textContent = invoices.length;
    });
    document.querySelectorAll('[data-shell-count="clients"]').forEach(el => {
      el.textContent = clients.length;
    });
    document.querySelectorAll('[data-shell-count="companies"]').forEach(el => {
      el.textContent = companies.length;
    });
    const settingsDocs = document.getElementById('settings-doc-count');
    if (settingsDocs) settingsDocs.textContent = invoices.length;
    const settingsClients = document.getElementById('settings-client-count');
    if (settingsClients) settingsClients.textContent = clients.length;
    const settingsCompanies = document.getElementById('settings-company-count');
    if (settingsCompanies) settingsCompanies.textContent = companies.length;
  };

  if (preloaded) {
    update(preloaded);
    return Promise.resolve();
  }
  return Promise.all([
    getAllInvoices().catch(() => []),
    getAllClients().catch(() => []),
    getAllCompanies().catch(() => [])
  ]).then(results => update({ invoices: results[0], clients: results[1], companies: results[2] }))
    .catch(() => {});
}

function getCurrentView() {
  return shellCurrentView;
}

async function printCurrentView() {
  if (shellCurrentView === 'compose') {
    if (typeof shellOptions.printCompose === 'function') {
      await shellOptions.printCompose();
      return true;
    }
    window.dispatchEvent(new CustomEvent('invoicecraft:print-compose'));
    return true;
  }

  if (shellCurrentView === 'reports') {
    if (typeof shellOptions.printReports === 'function') {
      await shellOptions.printReports();
      return true;
    }
    // Never print the Reports spinner/empty shell before data has loaded.
    if (!canPrintReports()) return false;
    const reportButton = document.querySelector('#report-btn-print, #btn-report-print, #btn-print-report, #report-print, #report-print-btn, [data-report-print], [data-report-action="print"], [data-action="print-report"]');
    if (reportButton) {
      reportButton.click();
      return true;
    }
    const origTitle = document.title;
    document.title = 'InvoiceCraft Report';
    const restore = () => { document.title = origTitle; };
    window.addEventListener('afterprint', restore, { once: true });
    try { window.print(); } finally { setTimeout(restore, 1500); }
    return true;
  }

  // Home and Settings intentionally do not print.
  return false;
}

function handleRouteClick(event) {
  const routeTarget = event.target.closest && event.target.closest('[data-route]');
  if (routeTarget) {
    event.preventDefault();
    navigateTo(routeTarget.getAttribute('data-route'));
    return;
  }

  const modalTarget = event.target.closest && event.target.closest('[data-open-modal]');
  if (modalTarget) {
    event.preventDefault();
    openDialogById(modalTarget.getAttribute('data-open-modal'));
    return;
  }

  const actionTarget = event.target.closest && event.target.closest('[data-home-action]');
  if (actionTarget) {
    event.preventDefault();
    const action = actionTarget.getAttribute('data-home-action');
    if (action === 'new-invoice' || action === 'new-quote') {
      if (typeof shellOptions.onNewDocument === 'function') shellOptions.onNewDocument(action === 'new-quote' ? 'quotation' : 'invoice');
      else navigateTo('compose');
      return;
    }
    if (action === 'resume-draft') {
      if (typeof shellOptions.onResumeDraft === 'function') shellOptions.onResumeDraft();
      else navigateTo('compose');
      return;
    }
    if (action === 'clients' || action === 'companies' || action === 'backup' || action === 'guide') {
      const modalMap = {
        clients: 'modal-clients',
        companies: 'modal-companies',
        backup: 'modal-backup',
        guide: 'modal-user-guide'
      };
      openDialogById(modalMap[action]);
      return;
    }
  }

  const docTarget = event.target.closest && event.target.closest('[data-open-document]');
  if (docTarget) {
    event.preventDefault();
    const id = docTarget.getAttribute('data-open-document');
    if (typeof shellOptions.onOpenDocument === 'function') shellOptions.onOpenDocument(id);
  }
}

function handleShortcut(event) {
  const key = String(event.key || '').toLowerCase();
  const mod = event.ctrlKey || event.metaKey;
  if (!mod) return;
  // Leave browser-specific combos (Ctrl+Shift+S/P, Alt variants) alone.
  if (event.altKey || event.shiftKey) return;

  if (key === 'p') {
    event.preventDefault();
    if (isDialogOpen()) return;
    printCurrentView();
    return;
  }

  if (key === 's') {
    // Always claim Ctrl/Cmd+S so the browser Save Page dialog never opens.
    event.preventDefault();
    if (shellCurrentView !== 'compose' || isDialogOpen()) return;
    // Input events already update editor state, so saving from a field is safe.
    if (typeof shellOptions.onSaveCompose === 'function') shellOptions.onSaveCompose();
    else window.dispatchEvent(new CustomEvent('invoicecraft:save-compose'));
    return;
  }

  if (key === 'b') {
    // Always claim the chord; only Compose may toggle its sidebar.
    event.preventDefault();
    if (shellCurrentView !== 'compose' || isDialogOpen() || isEditingTarget(event.target)) return;
    if (typeof shellOptions.onToggleSidebar === 'function') shellOptions.onToggleSidebar();
  }
}

async function applyRoute(view, opts = {}) {
  const normalized = normalizeRoute(view);
  const token = ++shellRouteToken;
  shellCurrentView = normalized;
  setHash(normalized);

  closeOpenDialogs();
  closeHeaderMore();
  if (!opts.initial && typeof shellOptions.flushAutosave === 'function') {
    try { await shellOptions.flushAutosave(); } catch (e) { console.warn('Autosave flush failed:', e); }
  }
  if (token !== shellRouteToken) return;

  document.body.dataset.view = normalized;
  document.title = `${SHELL_ROUTE_TITLES[normalized]} - InvoiceCraft`;

  document.querySelectorAll('[data-route]').forEach(el => {
    const isActive = normalizeRoute(el.getAttribute('data-route')) === normalized;
    el.classList.toggle('active', isActive);
    if (isActive) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  });

  if (normalized === 'home') {
    await renderHome();
  } else if (normalized === 'settings') {
    refreshShellCounts();
  }
  if (token !== shellRouteToken) return;

  if (typeof shellOptions.onRouteChange === 'function') {
    try {
      await shellOptions.onRouteChange(normalized);
    } catch (e) {
      console.error('Route change handler failed:', e);
    }
  }

  if (!opts.initial) {
    const heading = document.getElementById(SHELL_HEADING_IDS[normalized]);
    if (heading) {
      if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
      try {
        heading.focus({ preventScroll: true });
      } catch (e) {
        heading.focus();
      }
    }
  }
}

function navigateTo(view) {
  const normalized = normalizeRoute(view);
  if (normalized === shellCurrentView && document.body.dataset.view === normalized) {
    const target = '#/' + normalized;
    if (window.location.hash === target) return;
  }
  if (window.location.hash === '#/' + normalized) {
    applyRoute(normalized);
  } else {
    // hashchange performs the actual route switch.
    window.location.hash = '#/' + normalized;
  }
}

function initShell(options = {}) {
  shellOptions = options || {};
  if (shellMounted) return;
  shellMounted = true;

  const initial = parseHash();
  if (!window.location.hash || !SHELL_ROUTES.includes(parseHash())) {
    setHash(initial);
  }
  document.body.dataset.view = initial;
  setupHeaderMore();
  document.addEventListener('click', handleRouteClick);
  window.addEventListener('keydown', handleShortcut);
  window.addEventListener('hashchange', () => {
    applyRoute(parseHash());
  });
  applyRoute(initial, { initial: true });
}

  // --- 10. App Controller ---

/**
 * InvoiceCraft - Main Application Logic
 * 10 Models, Multi-Leg Tax Engine, Creative Logo & Brand Lockup Studio, IndexedDB Persistence, Live Sheet Renderer.
 */

















// ============================================================================
// 1. TEMPLATES REGISTRY (10 Distinct Models)
// ============================================================================
const TEMPLATES = [
  {
    id: 'modern-swiss',
    name: 'Modern Swiss',
    badge: 'Popular',
    desc: 'Clean asymmetric grid, razor-thin dividers, minimalist corporate feel.'
  },
  {
    id: 'minimalist-mono',
    name: 'Minimalist Mono',
    badge: 'Code/Dev',
    desc: 'Monospaced typography, typewriter dashed rules, developer aesthetic.'
  },
  {
    id: 'executive-corporate',
    name: 'Executive Corporate',
    badge: 'Finance/Law',
    desc: 'Solid colored accent header banner with structured zebra-stripe tables.'
  },
  {
    id: 'editorial-serif',
    name: 'Editorial Serif',
    badge: 'Luxury',
    desc: 'High-end serif headings, double hairline borders, refined layout.'
  },
  {
    id: 'bold-accent',
    name: 'Bold Accent',
    badge: 'Startup',
    desc: 'Vibrant left accent pillar with high-impact badges and totals.'
  },
  {
    id: 'tech-slate',
    name: 'Tech Slate',
    badge: 'SaaS',
    desc: 'Dark charcoal header with cyan accents and telemetry badge.'
  },
  {
    id: 'neobrutalist',
    name: 'Neobrutalist',
    badge: 'Indie',
    desc: '3px solid black outlines, hard offset drop shadows, retro chips.'
  },
  {
    id: 'compact-thermal',
    name: 'Compact Thermal',
    badge: 'Receipt',
    desc: 'Narrow receipt-style layout with dashed tear-off edges.'
  },
  {
    id: 'warm-studio',
    name: 'Warm Studio',
    badge: 'Artisan',
    desc: 'Earthy terracotta and sand tones with gentle rounded cards.'
  },
  {
    id: 'bento-grid',
    name: 'Bento Grid',
    badge: 'Modern UI',
    desc: 'Modular card compartments for party info, references, and totals.'
  }
];

// ============================================================================
// 2. DOCUMENT TYPES REGISTRY (Invoice, Quotation, Estimate, Proforma)
// ============================================================================
const APP_DOC_TYPES = {
  invoice: {
    id: 'invoice',
    name: 'Invoice',
    title: 'INVOICE',
    prefix: 'INV-',
    numLabel: 'Invoice #:',
    dueLabel: 'Due Date:',
    fromLabel: 'Billed From',
    toLabel: 'Billed To',
    paymentHeading: 'Remittance & Payment Instructions',
    notesHeading: 'Terms & Notes',
    subtotalLabel: 'Subtotal',
    totalLabel: 'Total Amount Due',
    defaultStatus: 'pending',
    defaultNotes: 'Payment is requested within 14 business days of invoice receipt. Thank you for your continued business!',
    statuses: [
      { id: 'draft', label: 'Draft' },
      { id: 'pending', label: 'Payment Pending' },
      { id: 'paid', label: 'Paid' }
    ]
  },
  quotation: {
    id: 'quotation',
    name: 'Quotation',
    title: 'QUOTATION',
    prefix: 'QT-',
    numLabel: 'Quote #:',
    dueLabel: 'Valid Until:',
    fromLabel: 'Prepared By',
    toLabel: 'Quotation For',
    paymentHeading: 'Payment Terms & Deposit Requirements',
    notesHeading: 'Terms & Scope of Work',
    subtotalLabel: 'Subtotal',
    totalLabel: 'Total Quote Amount',
    defaultStatus: 'sent',
    defaultNotes: 'This quotation is valid for 30 calendar days from the issue date. 50% deposit required upon project commencement.',
    statuses: [
      { id: 'draft', label: 'Draft' },
      { id: 'sent', label: 'Sent to Client' },
      { id: 'accepted', label: 'Accepted' },
      { id: 'declined', label: 'Declined' },
      { id: 'expired', label: 'Expired' }
    ]
  },
  estimate: {
    id: 'estimate',
    name: 'Estimate',
    title: 'ESTIMATE',
    prefix: 'EST-',
    numLabel: 'Estimate #:',
    dueLabel: 'Valid Until:',
    fromLabel: 'Prepared By',
    toLabel: 'Estimate For',
    paymentHeading: 'Estimated Payment Schedule',
    notesHeading: 'Estimate Terms & Contingencies',
    subtotalLabel: 'Estimated Subtotal',
    totalLabel: 'Total Estimated Cost',
    defaultStatus: 'draft',
    defaultNotes: 'This estimate is subject to project scope adjustments. Pricing is valid for 30 calendar days.',
    statuses: [
      { id: 'draft', label: 'Draft' },
      { id: 'sent', label: 'Sent to Client' },
      { id: 'accepted', label: 'Accepted' },
      { id: 'declined', label: 'Declined' },
      { id: 'expired', label: 'Expired' }
    ]
  },
  proforma: {
    id: 'proforma',
    name: 'Proforma Invoice',
    title: 'PROFORMA INVOICE',
    prefix: 'PI-',
    numLabel: 'Proforma #:',
    dueLabel: 'Valid Until:',
    fromLabel: 'Supplier / Consignor',
    toLabel: 'Consignee / Buyer',
    paymentHeading: 'Advance Payment Terms',
    notesHeading: 'Commercial Proforma Terms',
    subtotalLabel: 'Subtotal',
    totalLabel: 'Total Proforma Value',
    defaultStatus: 'pending',
    defaultNotes: 'This proforma invoice is issued for customs/advance payment formalities. Not a final demand for payment.',
    statuses: [
      { id: 'draft', label: 'Draft' },
      { id: 'pending', label: 'Payment Pending' },
      { id: 'paid', label: 'Paid / Advanced' }
    ]
  }
};

// ============================================================================
// 2B. DEFAULT STATE
// ============================================================================
const DEFAULT_INVOICE_STATE = {
  id: 'inv_' + Date.now(),
  template: 'modern-swiss',
  font: "'Inter', sans-serif",
  accentColor: '#2563eb',
  logo: {
    dataUri: null,
    width: 180,
    align: 'left',
    layout: 'left' // 'left', 'center', 'right'
  },
  meta: {
    docType: 'invoice',
    title: 'INVOICE',
    number: 'INV-2026-001',
    // Local calendar dates (appLocalDateString/addDaysLocal are hoisted
    // function declarations). UTC-based ISO strings would shift the default
    // date near midnight and put the wrong period into generated numbers.
    date: appLocalDateString(),
    dueDate: addDaysLocal(appLocalDateString(), 14),
    currency: '$',
    numberFormat: 'international',
    showAmountInWords: false,
    po: 'PO-8902',
    status: 'pending',
    showSignature: false
  },
  sender: {
    name: 'Apex Design & Tech Studio',
    email: 'billing@apexstudio.io',
    phone: '+1 (555) 234-5678',
    address: '100 Innovation Way, Suite 400\nSan Francisco, CA 94107',
    taxId: 'US-EIN 12-3456789'
  },
  client: {
    name: 'Starlight Enterprises Inc.',
    email: 'accounts@starlight.com',
    phone: '+1 (555) 987-6543',
    address: '742 Evergreen Terrace\nSeattle, WA 98101',
    taxId: 'VAT-8941042'
  },
  items: [
    {
      id: 'item_1',
      description: 'Web Application UI/UX Design System & Prototypes',
      hsn: '998314',
      qty: 1,
      rate: 3200,
      discount: 0,
      taxRate: 18
    },
    {
      id: 'item_2',
      description: 'Frontend Architecture Implementation (Vanilla ES + Tailwind)',
      hsn: '998313',
      qty: 40,
      rate: 95,
      discount: 5,
      taxRate: 18
    },
    {
      id: 'item_3',
      description: 'Printed Brand Assets & User Guidebooks',
      hsn: '490110',
      qty: 10,
      rate: 45,
      discount: 0,
      taxRate: 5
    },
    {
      id: 'item_4',
      description: 'Open-Source Community Maintenance (Exempt)',
      hsn: '998311',
      qty: 5,
      rate: 80,
      discount: 0,
      taxRate: 0
    }
  ],
  taxes: [
    {
      id: 'tax_1',
      name: 'CGST',
      ratio: 50
    },
    {
      id: 'tax_2',
      name: 'SGST',
      ratio: 50
    }
  ],
  payment: '',
  notes: 'Payment is requested within 14 business days of invoice receipt. Thank you for your continued business!'
};

function normalizeInvoice(inv) {
  if (!inv) return;
  if (!inv.meta) inv.meta = {};
  if (!inv.meta.docType || !APP_DOC_TYPES[inv.meta.docType]) {
    inv.meta.docType = 'invoice';
  }
  if (inv.meta.showSignature === undefined) {
    inv.meta.showSignature = (inv.meta.docType !== 'invoice');
  }
  if (inv.meta.number === undefined || inv.meta.number === null) {
    // Never invent a number here: manual mode intentionally allows a blank
    // number that the user fills in before saving.
    inv.meta.number = '';
  }
  // Persisted records are never renumbered (H1): only engine-issued unsaved
  // drafts (meta.numberAuto === true) may have their number regenerated.
  // Unknown markers default to false, i.e. treated as hand-edited.
  if (inv.updatedAt !== undefined && inv.updatedAt !== null) {
    inv.meta.numberAuto = false;
  } else if (inv.meta.numberAuto === undefined) {
    inv.meta.numberAuto = false;
  }
  if (!inv.meta.currency) inv.meta.currency = '$';
  if (!inv.sender) inv.sender = {};
  if (!inv.client) inv.client = {};
  if (inv.payment === undefined || inv.payment === null) inv.payment = '';
  if (inv.notes === undefined || inv.notes === null) inv.notes = '';
  if (inv.accentColor === undefined || inv.accentColor === null) inv.accentColor = '#2563eb';
  if (inv.font === undefined || inv.font === null) inv.font = "'Inter', sans-serif";
  if (!inv.template) inv.template = 'modern-swiss';
  if (!inv.logo) inv.logo = { dataUri: null, width: 180, align: 'left', layout: 'left' };
  if (!inv.logo.layout) inv.logo.layout = 'left';
  if (!inv.logo.align) inv.logo.align = 'left';
  if (inv.logo.width === undefined || inv.logo.width === null || isNaN(parseFloat(inv.logo.width))) {
    inv.logo.width = 180;
  }
  if (!Array.isArray(inv.items)) inv.items = [];
  // Drop malformed entries so a partially corrupted backup cannot break rendering.
  inv.items = inv.items.filter(item => item && typeof item === 'object');
  inv.items.forEach(item => {
    // Missing / null / empty / non-numeric tax rates default to 18, matching
    // the shared calculator and db normalization (L2). Never 0.
    const rawTaxRate = (item.taxRate === undefined || item.taxRate === null || item.taxRate === '') ? 18 : parseFloat(item.taxRate);
    item.taxRate = isFinite(rawTaxRate) ? clampNum(rawTaxRate, 0, 100, 18) : 18;
    if (item.qty === undefined || item.qty === null) {
      item.qty = 0;
    } else {
      item.qty = clampNum(item.qty, 0, 1000000, 0);
    }
    if (item.rate === undefined || item.rate === null) {
      item.rate = 0;
    } else {
      item.rate = clampNum(item.rate, 0, 1000000000, 0);
    }
    // Coerce to string: the sheet renderer calls .trim()/.toLowerCase() on these.
    if (item.hsn === undefined || item.hsn === null) {
      item.hsn = '';
    } else if (typeof item.hsn !== 'string') {
      item.hsn = String(item.hsn);
    }
    if (item.discount === undefined || item.discount === null) {
      item.discount = 0;
    } else {
      item.discount = clampNum(item.discount, 0, 100, 0);
    }
    if (typeof item.description !== 'string') item.description = '';
  });

  if (!Array.isArray(inv.taxes)) {
    inv.taxes = [
      { id: 'tax_1', name: 'CGST', ratio: 50 },
      { id: 'tax_2', name: 'SGST', ratio: 50 }
    ];
  } else {
    inv.taxes = inv.taxes.filter(t => t && typeof t === 'object');
    inv.taxes.forEach(t => {
      if (typeof t.name !== 'string') t.name = '';
      if (t.ratio === undefined && t.rate !== undefined) {
        t.ratio = parseFloat(t.rate) || 50;
      } else if (t.ratio === undefined) {
        t.ratio = 50;
      }
      t.ratio = clampNum(t.ratio, 0, 100, 50);
    });
  }

  if (!inv.meta.numberFormat) {
    inv.meta.numberFormat = (inv.meta.currency === '₹') ? 'indian' : 'international';
  }
  if (inv.meta.showAmountInWords === undefined) {
    inv.meta.showAmountInWords = false;
  }
}


let currentInvoice = JSON.parse(JSON.stringify(DEFAULT_INVOICE_STATE));
let currentNumberingConfig = normalizeNumberingConfig(DEFAULT_NUMBERING_CONFIG);
let canvasZoom = 1.0;
let autoSaveTimer = null;
let currentDocumentPersisted = false;
let documentEdited = false;
let pendingNewDocType = null;
let pendingPrefillClient = null;
let toggleSidebarPanel = null;
let reportsMounted = false;
let autosaveInFlight = null;

// ============================================================================
// 2B. NUMBERING ENGINE UI HELPERS (pure work lives in js/numbering.js)
// ============================================================================
function appLocalDateString(date = new Date()) {
  const d = (date instanceof Date && !isNaN(date.getTime())) ? date : new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDaysLocal(dateStr, days) {
  const base = parseLocalDate(dateStr) || new Date();
  base.setDate(base.getDate() + days);
  return appLocalDateString(base);
}

function activeDocType() {
  return (currentInvoice && currentInvoice.meta && currentInvoice.meta.docType) || 'invoice';
}

function docTypeName(type) {
  return (APP_DOC_TYPES[type] || APP_DOC_TYPES.invoice).name;
}

function numberingCounterId(type) {
  return type === 'quotation' ? 'num-cfg-counter-quotation'
    : type === 'estimate' ? 'num-cfg-counter-estimate'
      : type === 'proforma' ? 'num-cfg-counter-proforma'
        : 'num-cfg-counter-invoice';
}

function getPreviewId(type) {
  return type === 'invoice' ? 'num-preview-invoice'
    : type === 'quotation' ? 'num-preview-quote'
      : type === 'estimate' ? 'num-preview-estimate'
        : 'num-preview-proforma';
}

function generateForType(type, dateStr, config) {
  const normalized = normalizeNumberingConfig(config);
  if (normalized.mode === 'manual') return '';
  return generateDocumentNumber(type, dateStr, normalized, getCounter(normalized, type));
}

function rolloverNumberingConfig(config = currentNumberingConfig) {
  const rolled = periodRollover(normalizeNumberingConfig(config), new Date());
  return normalizeNumberingConfig(rolled.config || config);
}

function updateNumberingBadgeUI(config) {
  const badgeText = document.getElementById('numbering-badge-text');
  if (!badgeText) return;
  const type = activeDocType();
  if (!config || config.mode === 'manual') {
    badgeText.textContent = 'Manual Numbering';
    return;
  }
  const preview = generateForType(type, currentInvoice.meta.date, config);
  badgeText.textContent = `Auto (${docTypeName(type)}): ${preview}`;
}

function populateNumberingModal(config) {
  if (!config) config = currentNumberingConfig || DEFAULT_NUMBERING_CONFIG;
  // Rollover must be applied BEFORE the counters are shown, and persisted when
  // it changed, so opening this modal across a period boundary never displays
  // (or later saves) stale counters (H4). readNumberingModalConfig may stamp
  // the current period key afterwards.
  const rolled = periodRollover(normalizeNumberingConfig(config), new Date());
  config = normalizeNumberingConfig(rolled.config || config);
  if (rolled.changed) {
    currentNumberingConfig = config;
    try {
      const persisted = saveNumberingConfig(config);
      if (persisted && typeof persisted.catch === 'function') {
        persisted.catch(e => console.warn('Could not persist numbering rollover:', e));
      }
    } catch (e) {
      console.warn('Could not persist numbering rollover:', e);
    }
  }
  const radioAuto = document.getElementById('radio-mode-auto');
  const radioManual = document.getElementById('radio-mode-manual');
  const settingsPanel = document.getElementById('auto-numbering-settings-panel');

  if (config.mode === 'manual') {
    if (radioManual) radioManual.checked = true;
    if (settingsPanel) settingsPanel.style.opacity = '0.45';
  } else {
    if (radioAuto) radioAuto.checked = true;
    if (settingsPanel) settingsPanel.style.opacity = '1';
  }

  const patternInput = document.getElementById('num-cfg-pattern');
  if (patternInput) patternInput.value = config.scheme || '{PREFIX}/{FY}/{COUNTER}';

  const prefixInv = document.getElementById('num-prefix-inv');
  if (prefixInv) prefixInv.value = config.prefixInvoice || 'INV';
  const prefixQt = document.getElementById('num-prefix-qt');
  if (prefixQt) prefixQt.value = config.prefixQuotation || 'QT';
  const prefixEst = document.getElementById('num-prefix-est');
  if (prefixEst) prefixEst.value = config.prefixEstimate || 'EST';
  const prefixPi = document.getElementById('num-prefix-pi');
  if (prefixPi) prefixPi.value = config.prefixProforma || 'PI';

  ['invoice', 'quotation', 'estimate', 'proforma'].forEach(type => {
    const input = document.getElementById(numberingCounterId(type));
    if (input) input.value = getCounter(config, type);
  });
  const legacyCounterInput = document.getElementById('num-cfg-counter');
  if (legacyCounterInput) legacyCounterInput.value = getCounter(config, 'invoice');

  const paddingSelect = document.getElementById('num-cfg-padding');
  if (paddingSelect) paddingSelect.value = String(config.padding || 4);

  const resetSelect = document.getElementById('num-cfg-reset');
  if (resetSelect) resetSelect.value = config.resetPeriod || 'financial_year';

  updateNumberingModalPreviewLive();
}

function updateNumberingModalPreviewLive() {
  const mode = document.querySelector('input[name="num-mode"]:checked')?.value || 'auto';
  const tempConfig = normalizeNumberingConfig({
    mode,
    scheme: document.getElementById('num-cfg-pattern')?.value || '{PREFIX}/{FY}/{COUNTER}',
    prefixInvoice: document.getElementById('num-prefix-inv')?.value || 'INV',
    prefixQuotation: document.getElementById('num-prefix-qt')?.value || 'QT',
    prefixEstimate: document.getElementById('num-prefix-est')?.value || 'EST',
    prefixProforma: document.getElementById('num-prefix-pi')?.value || 'PI',
    counters: {
      invoice: parseInt(document.getElementById(numberingCounterId('invoice'))?.value, 10) || 1,
      quotation: parseInt(document.getElementById(numberingCounterId('quotation'))?.value, 10) || 1,
      estimate: parseInt(document.getElementById(numberingCounterId('estimate'))?.value, 10) || 1,
      proforma: parseInt(document.getElementById(numberingCounterId('proforma'))?.value, 10) || 1
    },
    startingCounters: currentNumberingConfig.startingCounters,
    padding: parseInt(document.getElementById('num-cfg-padding')?.value, 10) || 4,
    resetPeriod: document.getElementById('num-cfg-reset')?.value || 'financial_year',
    lastPeriodKey: currentNumberingConfig.lastPeriodKey
  });

  const activePreview = document.getElementById('num-preview-text');
  if (mode === 'manual') {
    ['invoice', 'quotation', 'estimate', 'proforma'].forEach(type => {
      const el = document.getElementById(getPreviewId(type));
      if (el) el.textContent = 'Manual';
    });
    if (activePreview) activePreview.textContent = 'Manual Entry (User Discretion)';
    return;
  }

  const dateStr = currentInvoice.meta.date || appLocalDateString();
  ['invoice', 'quotation', 'estimate', 'proforma'].forEach(type => {
    const el = document.getElementById(getPreviewId(type));
    if (el) el.textContent = generateForType(type, dateStr, tempConfig);
  });
  if (activePreview) {
    activePreview.textContent = `${docTypeName(activeDocType())}: ${generateForType(activeDocType(), dateStr, tempConfig)}`;
  }
}

function readNumberingModalConfig() {
  const mode = document.querySelector('input[name="num-mode"]:checked')?.value || 'auto';
  const counters = {};
  ['invoice', 'quotation', 'estimate', 'proforma'].forEach(type => {
    const el = document.getElementById(numberingCounterId(type));
    counters[type] = parseInt(el?.value, 10) || 1;
  });
  const resetPeriod = document.getElementById('num-cfg-reset')?.value || 'financial_year';
  const base = normalizeNumberingConfig(currentNumberingConfig);
  return normalizeNumberingConfig(Object.assign({}, base, {
    mode,
    scheme: document.getElementById('num-cfg-pattern')?.value || '{PREFIX}/{FY}/{COUNTER}',
    prefixInvoice: document.getElementById('num-prefix-inv')?.value || 'INV',
    prefixQuotation: document.getElementById('num-prefix-qt')?.value || 'QT',
    prefixEstimate: document.getElementById('num-prefix-est')?.value || 'EST',
    prefixProforma: document.getElementById('num-prefix-pi')?.value || 'PI',
    counters,
    // The edited live counters become the reset baseline (as the legacy UI
    // did), so a period/manual reset returns to the user-entered values
    // instead of an invisible old starting value.
    startingCounters: Object.assign({}, counters),
    padding: parseInt(document.getElementById('num-cfg-padding')?.value, 10) || 4,
    resetPeriod,
    lastPeriodKey: resolvePeriodKey(new Date(), resetPeriod),
    updatedAt: Date.now()
  }));
}

/**
 * Reset-safety validation (pure, testable): the scheme must carry enough
 * period information for the chosen reset policy, or numbers collide after
 * every rollover. Returns null when valid, else a human-readable reason.
 * - monthly:        {MM} plus a year token ({YYYY}, {YY} or {FY})
 * - calendar_year:  a year token ({YYYY}, {YY} or {FY})
 * - financial_year: {FY}, or ({YYYY} or {YY}) plus {MM}
 * - never:          no period-token requirement
 */
function validateNumberingSchemePeriod(scheme, resetPeriod) {
  const pattern = String(scheme || '');
  const hasYear = pattern.includes('{YYYY}') || pattern.includes('{YY}') || pattern.includes('{FY}');
  const hasMonth = pattern.includes('{MM}');
  if (resetPeriod === 'monthly' && !(hasYear && hasMonth)) {
    return 'Monthly reset requires a year token ({YYYY}, {YY} or {FY}) and {MM} in the scheme, otherwise numbers repeat after every monthly reset.';
  }
  if (resetPeriod === 'calendar_year' && !hasYear) {
    return 'Calendar-year reset requires a year token ({YYYY}, {YY} or {FY}) in the scheme, otherwise numbers repeat after every yearly reset.';
  }
  if (resetPeriod === 'financial_year' &&
      !(pattern.includes('{FY}') || ((pattern.includes('{YYYY}') || pattern.includes('{YY}')) && hasMonth))) {
    return 'Financial-year reset requires {FY}, or a year token ({YYYY} or {YY}) plus {MM}, in the scheme so numbers never repeat across years.';
  }
  return null; // 'never' (and any unknown policy): no period-token requirement
}

/**
 * Manual-mode numbers must be unique per document type. Auto numbers are
 * generated, but a hand-edited auto number is still checked.
 */
async function findNumberConflict(number, docType, excludeId) {
  const wanted = String(number || '').trim().toLowerCase();
  if (!wanted) return false;
  const invoices = await getAllInvoices();
  return invoices.some(inv => {
    if (excludeId && inv.id === excludeId) return false;
    const invType = (inv.meta && inv.meta.docType) || inv.docType || 'invoice';
    if (invType !== docType) return false;
    const invNumber = String((inv.meta && inv.meta.number) || inv.meta?.number || '').trim().toLowerCase();
    return invNumber === wanted;
  });
}

async function flushAutoSave() {
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = null;
  }
  // A pristine document (never edited, never persisted) has nothing worth
  // preserving: writing it here would create a phantom demo continue-draft on
  // a fresh install just by changing routes.
  if (!documentEdited && !currentDocumentPersisted) {
    return;
  }
  if (autosaveInFlight) {
    try { await autosaveInFlight; } catch (e) {}
  }
  try {
    autosaveInFlight = saveActiveDraft(currentInvoice, { activeCompanyProfileId, documentEdited });
    await autosaveInFlight;
  } catch (e) {
    console.warn('Auto-save flush error:', e);
  } finally {
    autosaveInFlight = null;
  }
}

// ============================================================================
// 3. INITIALIZATION
// ============================================================================
document.addEventListener('DOMContentLoaded', async () => {
  let dbReady = false;
  try {
    await openDB();
    dbReady = true;
  } catch (err) {
    console.warn('IndexedDB unavailable; the editor will run with local memory until reload:', err);
    const indicator = document.getElementById('db-status-indicator');
    if (indicator) {
      indicator.innerHTML = `
        <span class="db-status-dot" style="background:#eab308; box-shadow:0 0 6px #eab308;"></span>
        <span>Local Memory</span>
      `;
    }
  }

  // Load Numbering Engine settings (safe default on IDB failure)
  try {
    currentNumberingConfig = await getNumberingConfig();
  } catch (e) {
    console.warn('Numbering config load failed, using defaults:', e);
    currentNumberingConfig = normalizeNumberingConfig(DEFAULT_NUMBERING_CONFIG);
  }
  const rolled = periodRollover(currentNumberingConfig, new Date());
  currentNumberingConfig = normalizeNumberingConfig(rolled.config || currentNumberingConfig);
  if (rolled.changed && dbReady) {
    try { await saveNumberingConfig(currentNumberingConfig); } catch (e) { console.warn(e); }
  }

  // Load the saved item library (v4). Defaults keep Compose usable when IDB
  // is unavailable; the formatter-free cache is refreshed by catalog edits.
  try {
    catalogItems = await getAllCatalogItems();
  } catch (e) {
    console.warn('Item library load failed, using an empty library this session:', e);
    catalogItems = [];
  }
  try {
    itemLibraryConfig = await getItemLibraryConfig();
  } catch (e) {
    console.warn('Item library scope load failed, defaulting to Global:', e);
    itemLibraryConfig = { scope: 'global', updatedAt: null };
  }

  // Load existing draft or use default (each step guarded so IDB denial can't blank the app)
  let draftRecord = null;
  try {
    draftRecord = await getActiveDraftRecord();
  } catch (e) {
    console.warn('Draft load failed, starting fresh:', e);
    draftRecord = null;
  }
  const savedDraft = draftRecord && draftRecord.data ? draftRecord.data : null;
  if (savedDraft) {
    currentInvoice = Object.assign({}, DEFAULT_INVOICE_STATE, savedDraft);
    if (!currentInvoice.logo) currentInvoice.logo = { dataUri: null, width: 180, align: 'left', layout: 'left' };
    if (!currentInvoice.logo.layout) currentInvoice.logo.layout = 'left';
    activeCompanyProfileId = draftRecord.activeCompanyProfileId || savedDraft.activeCompanyProfileId || savedDraft.companyId || null;
    // A stale draft record can point at a document that no longer exists
    // (deleted, or lost to a failed save). Verify the persisted record before
    // treating the editor content as a saved document, and demote the draft
    // data so reloads cannot re-infer persistence from a leftover updatedAt.
    if (savedDraft.updatedAt && savedDraft.id) {
      try {
        const persistedRecord = await getInvoice(savedDraft.id);
        currentDocumentPersisted = Boolean(persistedRecord);
      } catch (e) {
        console.warn('Could not verify the persisted draft record:', e);
        currentDocumentPersisted = false;
      }
    } else {
      currentDocumentPersisted = false;
    }
    if (!currentDocumentPersisted) {
      delete currentInvoice.updatedAt;
    }
    // edited === null is the legacy "edited" marker: treat it as edited.
    documentEdited = draftRecord.edited === null ? true : Boolean(draftRecord.edited);
    // Legacy drafts predate the numberAuto marker. Infer it once so engine-
    // issued numbers stay tracked across the upgrade; anything ambiguous is
    // treated as hand-edited and never regenerated.
    if (!currentDocumentPersisted &&
        currentNumberingConfig.mode === 'auto' &&
        currentInvoice.meta.numberAuto === undefined) {
      const legacyType = currentInvoice.meta.docType || 'invoice';
      const legacyExpected = generateForType(legacyType, currentInvoice.meta.date, currentNumberingConfig);
      currentInvoice.meta.numberAuto = Boolean(legacyExpected) && legacyExpected === currentInvoice.meta.number;
    }
  } else {
    // If no draft, load default company profile if available
    let defCompany = null;
    try {
      defCompany = await getDefaultCompany();
    } catch (e) {
      console.warn('Default company load failed:', e);
    }
    if (defCompany) {
      activeCompanyProfileId = defCompany.id;
      currentInvoice.companyId = defCompany.id;
      currentInvoice.sender = {
        name: defCompany.name,
        email: defCompany.email || '',
        phone: defCompany.phone || '',
        address: defCompany.address || '',
        taxId: defCompany.taxId || ''
      };
      currentInvoice.payment = defCompany.payment || '';
      currentInvoice.meta.currency = defCompany.defaultCurrency || currentInvoice.meta.currency || '$';
      currentInvoice.meta.numberFormat = defCompany.defaultNumberFormat ||
        (currentInvoice.meta.currency === '₹' ? 'indian' : 'international');
    }
    // Set initial invoice number from the numbering engine if auto. Manual mode
    // never invents a number; the user types it.
    if (currentNumberingConfig && currentNumberingConfig.mode === 'auto') {
      const type = currentInvoice.meta.docType || 'invoice';
      currentInvoice.meta.number = generateForType(type, currentInvoice.meta.date, currentNumberingConfig);
      currentInvoice.meta.numberAuto = true;
    } else {
      currentInvoice.meta.number = '';
      currentInvoice.meta.numberAuto = false;
    }
    currentDocumentPersisted = false;
    documentEdited = false;
  }
  normalizeInvoice(currentInvoice);

  // Auto-clean legacy hardcoded dummy payment if business name is not Apex Studio
  if (currentInvoice.sender.name && !currentInvoice.sender.name.toLowerCase().includes('apex')) {
    if (isDummyApexPayment(currentInvoice.payment)) {
      currentInvoice.payment = '';
    }
  }
  try {
    const allComps = await getAllCompanies();
    for (const c of allComps) {
      if (c.name && !c.name.toLowerCase().includes('apex') && isDummyApexPayment(c.payment)) {
        c.payment = '';
        await saveCompany(c);
      }
    }
  } catch (err) {
    console.warn('Error sanitizing companies:', err);
  }

  // Populate UI (each step isolated so one failure can't blank the app)
  renderTemplatesGrid();
  renderColorSwatches();
  try { await updateSavedCompaniesCount(); } catch (e) { console.warn(e); }
  try { await renderCompanyProfilesSelector(); } catch (e) { console.warn(e); }
  populateFormFields();
  renderLineItemsEditor();
  renderTaxesEditor();
  setupLogoStudioTabs();
  renderIconsLibrary();
  try { await updateSavedInvoicesCount(); } catch (e) { console.warn(e); }
  enhanceAccessibility();

  // Initial Sheet Render & Calculations
  updateSheetView();

  // Attach Event Listeners
  attachFormListeners();
  attachNavigationListeners();
  attachZoomListeners();
  attachModalListeners();
  setupCatalogPicker();
  setupItemLibraryModal();
  try { await renderCompanyProfilesSelector(); } catch (e) { console.warn(e); }
  refreshCatalogPicker();
  updateCatalogSettingsCount();

  // Reports view is mounted once; it stays in the DOM while Compose remains mounted.
  try {
    const reportsRoot = document.getElementById('reports-root');
    if (reportsRoot && typeof mountReportsView === 'function') {
      mountReportsView(reportsRoot, { onOpenDocument: openDocumentInEditor });
      reportsMounted = true;
    }
  } catch (e) {
    console.warn('Reports view could not be mounted yet:', e);
  }

  // App shell boots into #/home by default, but all editor state is already ready.
  initShell({
    flushAutosave: flushAutoSave,
    onSaveCompose: () => { persistCurrentDocument(); },
    onToggleSidebar: () => { if (toggleSidebarPanel) toggleSidebarPanel(); },
    printCompose: () => safePrintAction(),
    onOpenDocument: openDocumentInEditor,
    onResumeDraft: resumeActiveDraft,
    onNewDocument: requestNewDocument,
    onOpenModal: async (id) => {
      await openAppModal(id);
    },
    onRouteChange: async (view) => {
      if (view === 'compose') {
        requestAnimationFrame(() => updateDocumentPaginationLive());
      } else if (view === 'reports' && reportsMounted) {
        try { await refreshReportsView(); } catch (e) { console.warn('Reports refresh failed:', e); }
      } else if (view === 'home') {
        try { await refreshShellCounts(); } catch (e) {}
      }
      if (view === 'compose') {
        syncComposeTitle();
      }
    }
  });

  try { await refreshShellCounts(); } catch (e) {}
});

// ============================================================================
// 4. RENDERING TEMPLATES & STYLING
// ============================================================================
function renderTemplatesGrid() {
  const container = document.getElementById('templates-grid');
  if (!container) return;
  container.innerHTML = TEMPLATES.map(t => `
    <div class="template-card ${currentInvoice.template === t.id ? 'active' : ''}" data-template="${t.id}">
      <div class="template-card-header">
        <span class="template-name">${t.name}</span>
        <span class="template-badge">${t.badge}</span>
      </div>
      <div class="template-desc">${t.desc}</div>
    </div>
  `).join('');

  container.querySelectorAll('.template-card').forEach(card => {
    card.addEventListener('click', () => {
      container.querySelectorAll('.template-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      currentInvoice.template = card.dataset.template;
      applyTemplateClass();
      triggerAutoSave();
    });
  });
}

function applyTemplateClass() {
  const sheet = document.getElementById('invoice-sheet');
  if (!sheet) return;
  TEMPLATES.forEach(t => sheet.classList.remove('template-' + t.id));
  sheet.classList.add('template-' + currentInvoice.template);
}

function renderColorSwatches() {
  const swatches = document.querySelectorAll('.color-swatch');
  swatches.forEach(swatch => {
    swatch.addEventListener('click', () => {
      swatches.forEach(s => s.classList.remove('active'));
      swatch.classList.add('active');
      const color = swatch.dataset.color;
      currentInvoice.accentColor = color;
      document.getElementById('accent-color-picker').value = color;
      document.getElementById('accent-color-hex').textContent = color;
      document.documentElement.style.setProperty('--accent-color', color);
      triggerAutoSave();
    });
  });
}

// ============================================================================
// 5. POPULATE FORM FIELDS FROM STATE
// ============================================================================
function populateFormFields() {
  normalizeInvoice(currentInvoice);
  const docType = currentInvoice.meta.docType || 'invoice';
  const cfg = APP_DOC_TYPES[docType] || APP_DOC_TYPES.invoice;

  // Section 1 Document Type Cards Grid
  document.querySelectorAll('#doc-type-cards-grid .doc-type-card').forEach(card => {
    if (card.dataset.type === docType) card.classList.add('active');
    else card.classList.remove('active');
  });
  syncDocTypeCardA11y(docType);

  const summaryBadge = document.getElementById('doc-type-badge-summary');
  if (summaryBadge) {
    summaryBadge.textContent = `${cfg.name.toUpperCase()} MODE`;
  }

  const hintBanner = document.getElementById('doc-type-hint-banner');
  if (hintBanner) {
    hintBanner.style.display = (docType === 'quotation' || docType === 'estimate' || docType === 'proforma') ? 'flex' : 'none';
  }

  // Section 3 Active Document Context
  const pillIcon = document.getElementById('doc-type-pill-icon');
  const pillName = document.getElementById('doc-type-pill-name');
  if (pillName) pillName.textContent = cfg.name;
  if (pillIcon) {
    const iconsMap = { invoice: '📄', quotation: '💬', estimate: '📐', proforma: '📋' };
    pillIcon.textContent = iconsMap[docType] || '📄';
  }
  updateNumberingBadgeUI(currentNumberingConfig);

  // Convert to Invoice button (in section 3 header)
  const convertBtn = document.getElementById('btn-convert-quote');
  if (convertBtn) {
    convertBtn.style.display = (docType === 'quotation' || docType === 'estimate' || docType === 'proforma') ? 'inline-flex' : 'none';
  }

  // Signature toggle in section 6
  const sigGroup = document.getElementById('group-quote-signature');
  const sigCheck = document.getElementById('check-quote-signature');
  if (sigGroup) {
    sigGroup.style.display = (docType !== 'invoice') ? 'block' : 'none';
  }
  if (sigCheck) {
    sigCheck.checked = !!currentInvoice.meta.showSignature;
  }

  // Section 3 dynamic header and labels
  const metaTitleEl = document.getElementById('section-meta-title');
  if (metaTitleEl) metaTitleEl.textContent = `3. ${cfg.name} Details`;

  const labelTitle = document.getElementById('label-doc-title');
  const labelNum = document.getElementById('label-doc-number');
  const labelDue = document.getElementById('label-doc-due');
  if (labelTitle) labelTitle.textContent = `${cfg.name} Title`;
  if (labelNum) labelNum.textContent = cfg.numLabel.replace(':', '');
  if (labelDue) labelDue.textContent = cfg.dueLabel.replace(':', '');

  // Sync status dropdown options based on document type
  syncStatusDropdown(docType, currentInvoice.meta.status);

  // Styles
  document.getElementById('font-select').value = currentInvoice.font;
  document.documentElement.style.setProperty('--invoice-font', currentInvoice.font);
  document.getElementById('accent-color-picker').value = currentInvoice.accentColor;
  document.getElementById('accent-color-hex').textContent = currentInvoice.accentColor;
  document.documentElement.style.setProperty('--accent-color', currentInvoice.accentColor);

  // Logo Settings
  document.getElementById('logo-width-slider').value = currentInvoice.logo.width || 180;
  document.getElementById('logo-width-val').textContent = (currentInvoice.logo.width || 180) + 'px';
  updateLogoAlignmentButtons(currentInvoice.logo.align || 'left');
  updateHeaderLayoutButtons(currentInvoice.logo.layout || 'left');

  // Meta Inputs
  document.getElementById('input-inv-title').value = currentInvoice.meta.title;
  document.getElementById('input-inv-number').value = currentInvoice.meta.number;
  document.getElementById('input-inv-date').value = currentInvoice.meta.date;
  document.getElementById('input-inv-due').value = currentInvoice.meta.dueDate || '';
  const selectCurr = document.getElementById('select-inv-currency');
  const customCurrWrapper = document.getElementById('custom-currency-wrapper');
  const inputCustomCurr = document.getElementById('input-custom-currency');
  const curVal = currentInvoice.meta.currency || '$';
  const knownCurrs = ['$', '€', '£', '₹', 'C$', 'A$', '¥', 'CHF', 'AED', 'SAR', 'BHD', 'QAR', 'KWD', 'OMR'];
  if (knownCurrs.includes(curVal)) {
    if (selectCurr) selectCurr.value = curVal;
    if (customCurrWrapper) customCurrWrapper.style.display = 'none';
  } else {
    if (selectCurr) selectCurr.value = 'custom';
    if (customCurrWrapper) customCurrWrapper.style.display = 'block';
    if (inputCustomCurr) inputCustomCurr.value = curVal;
  }
  document.getElementById('input-inv-po').value = currentInvoice.meta.po || '';
  document.getElementById('select-inv-status').value = currentInvoice.meta.status;
  const numFmtSelect = document.getElementById('select-inv-number-format');
  if (numFmtSelect) {
    numFmtSelect.value = currentInvoice.meta.numberFormat || 'international';
  }
  const checkWords = document.getElementById('check-amount-in-words');
  if (checkWords) {
    checkWords.checked = !!currentInvoice.meta.showAmountInWords;
  }

  // Sender
  document.getElementById('input-sender-name').value = currentInvoice.sender.name || '';
  document.getElementById('input-sender-email').value = currentInvoice.sender.email || '';
  document.getElementById('input-sender-phone').value = currentInvoice.sender.phone || '';
  document.getElementById('input-sender-address').value = currentInvoice.sender.address || '';
  document.getElementById('input-sender-taxid').value = currentInvoice.sender.taxId || '';

  const senderPaymentInput = document.getElementById('input-sender-payment');
  if (senderPaymentInput) senderPaymentInput.value = currentInvoice.payment || '';
  const clearSenderPaymentBtn = document.getElementById('btn-clear-sender-payment');
  if (clearSenderPaymentBtn) {
    clearSenderPaymentBtn.style.display = (currentInvoice.payment && currentInvoice.payment.trim()) ? 'inline-block' : 'none';
  }

  // Client
  document.getElementById('input-client-name').value = currentInvoice.client.name || '';
  document.getElementById('input-client-email').value = currentInvoice.client.email || '';
  document.getElementById('input-client-phone').value = currentInvoice.client.phone || '';
  document.getElementById('input-client-address').value = currentInvoice.client.address || '';
  document.getElementById('input-client-taxid').value = currentInvoice.client.taxId || '';

  // Payment & Notes
  document.getElementById('input-payment-info').value = currentInvoice.payment || '';
  document.getElementById('input-notes').value = currentInvoice.notes || '';

  updateSenderTaxHint();

  // Sync Studio default wordmarks with company name if present
  const monoWordmark = document.getElementById('monogram-wordmark');
  if (monoWordmark && !monoWordmark.value) monoWordmark.value = currentInvoice.sender.name;
  const iconWordmark = document.getElementById('icon-wordmark');
  if (iconWordmark && !iconWordmark.value) iconWordmark.value = currentInvoice.sender.name;

  // Saved item picker follows the active document (currency, company, dt).
  refreshCatalogPicker();

  // Apply template
  applyTemplateClass();
  updateLogoDisplay();
}

function syncStatusDropdown(docType, currentStatus) {
  const statusSelect = document.getElementById('select-inv-status');
  if (!statusSelect) return;
  const cfg = APP_DOC_TYPES[docType] || APP_DOC_TYPES.invoice;
  const validStatusIds = cfg.statuses.map(s => s.id);

  statusSelect.innerHTML = cfg.statuses.map(s => `
    <option value="${s.id}">${s.label}</option>
  `).join('');

  if (validStatusIds.includes(currentStatus)) {
    statusSelect.value = currentStatus;
  } else {
    statusSelect.value = cfg.defaultStatus;
    currentInvoice.meta.status = cfg.defaultStatus;
  }
}

async function switchDocumentType(newType) {
  if (!APP_DOC_TYPES[newType]) return;
  if (currentDocumentPersisted) {
    alert('This document is already saved. Create a new document to use a different document type — saved records are never overwritten by a type switch.');
    populateFormFields();
    updateSheetView();
    return;
  }

  const oldType = currentInvoice.meta.docType || 'invoice';
  const oldCfg = APP_DOC_TYPES[oldType] || APP_DOC_TYPES.invoice;
  const newCfg = APP_DOC_TYPES[newType];

  currentInvoice.meta.docType = newType;

  // If title was default or empty, update to new default title
  if (!currentInvoice.meta.title || currentInvoice.meta.title === oldCfg.title) {
    currentInvoice.meta.title = newCfg.title;
  }

  // Auto numbering uses the new type's independent counter. Manual mode never
  // rewrites a user-entered number.
  if (currentNumberingConfig && currentNumberingConfig.mode === 'auto') {
    currentInvoice.meta.number = generateForType(newType, currentInvoice.meta.date, currentNumberingConfig);
    currentInvoice.meta.numberAuto = true;
  } else {
    currentInvoice.meta.numberAuto = false;
  }

  // Update notes if it was default
  if (!currentInvoice.notes || currentInvoice.notes === oldCfg.defaultNotes) {
    currentInvoice.notes = newCfg.defaultNotes;
  }

  // If switching to quote/estimate, show signature block by default
  currentInvoice.meta.showSignature = (newType !== 'invoice');
  currentInvoice.meta.status = newCfg.defaultStatus;

  populateFormFields();
  updateSheetView();
  syncComposeTitle();
  refreshCatalogPicker();
  triggerAutoSave();
}

async function promptManualNumber(docType, suggested = '', excludeId = currentInvoice.id) {
  const entered = window.prompt(`Enter a unique ${docTypeName(docType)} number:`, suggested || '');
  if (entered === null) return null;
  const number = entered.trim();
  if (!number) {
    alert('A document number is required.');
    return null;
  }
  if (await findNumberConflict(number, docType, excludeId)) {
    alert(`The ${docTypeName(docType)} number "${number}" is already used by another saved document. Choose a different number.`);
    return null;
  }
  return number;
}

async function convertToInvoice() {
  const oldType = activeDocType();
  if (oldType === 'invoice') return;
  const oldNumber = currentInvoice.meta.number || '';
  const curDocName = (APP_DOC_TYPES[oldType] || APP_DOC_TYPES.quotation).name;

  try {
    // A conversion always needs a durable source record. A saved document with
    // unsaved edits must be re-saved first so the conversion snapshot carries
    // the live content with freshly frozen totals (re-saving a persisted
    // source never advances its counter).
    if (!currentDocumentPersisted || documentEdited) {
      const saved = await persistCurrentDocument();
      if (!saved) return;
    }
    if (currentInvoice.convertedToId || currentInvoice.meta?.convertedToId) {
      alert(`This ${curDocName.toLowerCase()} has already been converted to invoice ${currentInvoice.convertedToNumber || ''}. It cannot be converted twice.`);
      return;
    }

    let config = rolloverNumberingConfig(currentNumberingConfig);
    const today = appLocalDateString();
    let invoiceNumber;
    if (config.mode === 'manual') {
      invoiceNumber = await promptManualNumber('invoice');
      if (!invoiceNumber) return;
    } else {
      invoiceNumber = generateForType('invoice', today, config);
    }
    if (await findNumberConflict(invoiceNumber, 'invoice', null)) {
      alert(`The invoice number "${invoiceNumber}" is already in use. Conversion cancelled so no duplicate is stored.`);
      return;
    }

    const sourceSnapshot = JSON.parse(JSON.stringify(currentInvoice));
    // Only the source's own stored company link may be applied. Unlinked
    // legacy documents must never acquire the active/default company; an
    // explicitly linked company is never cleared.
    const company = sourceSnapshot.companyId ? await getCompany(sourceSnapshot.companyId) : null;
    const records = buildConversionRecords({
      source: sourceSnapshot,
      invoiceId: generateId('inv_'),
      invoiceNumber,
      now: new Date(today + 'T12:00:00'),
      company
    });
    if (!records || !records.invoice || !records.sourceUpdate) {
      throw new Error('Conversion record builder returned an invalid result.');
    }

    // Currency and number format always follow the source quote.
    records.invoice.meta.currency = sourceSnapshot.meta.currency;
    records.invoice.meta.numberFormat = sourceSnapshot.meta.numberFormat;
    records.invoice.companyId = sourceSnapshot.companyId || null;
    records.invoice.clientId = sourceSnapshot.clientId || null;
    if (config.mode === 'auto') {
      // The conversion invoice is generated and persisted in the same
      // transaction; the marker records engine issuance (it is ignored on
      // load of persisted records).
      records.invoice.meta.numberAuto = true;
      config = advanceTypeCounter(config, 'invoice');
    }

    await saveConversion({
      source: records.sourceUpdate,
      invoice: records.invoice,
      numberingConfig: config
    });

    currentNumberingConfig = normalizeNumberingConfig(config);
    currentInvoice = JSON.parse(JSON.stringify(records.invoice));
    normalizeInvoice(currentInvoice);
    currentDocumentPersisted = true;
    documentEdited = false;
    populateFormFields();
    renderLineItemsEditor();
    renderTaxesEditor();
    updateSheetView();
    try { await saveActiveDraft(currentInvoice, { activeCompanyProfileId, documentEdited: false }); } catch (e) { console.warn(e); }
    navigateTo('compose');
    requestAnimationFrame(() => updateDocumentPaginationLive());
    try { await updateSavedInvoicesCount(); } catch (e) {}
    await notifyDataChanged();
    syncComposeTitle();

    alert(`⚡ ${curDocName} "${oldNumber}" was converted into invoice "${currentInvoice.meta.number}". The original ${curDocName.toLowerCase()} is preserved with a conversion history link.`);
  } catch (err) {
    console.error('Conversion failed:', err);
    alert('Conversion failed: ' + (err && err.message ? err.message : err));
  }
}

// ============================================================================
// 5B. MULTIPLE COMPANY PROFILES ENGINE
// ============================================================================
let activeCompanyProfileId = null;
// Saved item library cache (v4 catalogItems store + default-scope setting).
// Filled once at boot after the DB opens, refreshed after catalog edits and
// while the item-library modal is open; Compose reads from memory only.
let catalogItems = [];
let itemLibraryConfig = { scope: 'global', updatedAt: null };
let itemLibraryEditing = null; // Record loaded into the modal form for editing

async function updateSavedCompaniesCount() {
  const companies = await getAllCompanies();
  const countEls = [
    document.getElementById('saved-companies-count'),
    document.getElementById('companies-count-badge'),
    document.getElementById('modal-companies-list-count'),
    document.getElementById('settings-company-count')
  ];
  countEls.forEach(el => {
    if (el) el.textContent = companies.length;
  });
}

async function renderCompanyProfilesSelector() {
  const select = document.getElementById('select-company-profile');
  if (!select) return;
  const companies = await getAllCompanies();

  // The catalog module consumes this read as its known-company set; refresh
  // it here so bookmark/scope logic always sees the current names/ids.
  catalogCompanyNameCache = new Map(companies.map(c => [
    String(c.id),
    (c && c.name) ? c.name : String(c.id)
  ]));
  catalogCompanyNamesResolved = true;

  let linkNormalized = false;
  if (companies.length === 0) {
    // Every link becomes dangling when the last company goes away.
    if (activeCompanyProfileId || currentInvoice.companyId) {
      activeCompanyProfileId = null;
      currentInvoice.companyId = null;
      linkNormalized = true;
    }
    select.innerHTML = `<option value="">Default Company Profile</option><option value="__new__">+ Add New Company Profile...</option>`;
    if (linkNormalized) {
      renderLineItemsEditor();
      refreshCatalogPicker();
    }
    return;
  }

  // A null/unknown active profile means "no company linked" (legacy or
  // unlinked documents). It must NOT silently adopt the default company.
  const isLinked = Boolean(activeCompanyProfileId) &&
    companies.some(c => c.id === activeCompanyProfileId);
  if (activeCompanyProfileId && !isLinked) {
    // Dangling reference (deleted company / stale backup): normalize to no link.
    activeCompanyProfileId = null;
    linkNormalized = true;
  }
  if (currentInvoice.companyId && !companies.some(c => c.id === currentInvoice.companyId)) {
    currentInvoice.companyId = null;
    linkNormalized = true;
  }
  const noLinkOption = isLinked
    ? ''
    : `<option value="" ${activeCompanyProfileId ? '' : 'selected'}>No company linked</option>`;

  select.innerHTML = companies.map(c => `
    <option value="${appEscapeHtml(c.id)}" ${c.id === activeCompanyProfileId ? 'selected' : ''}>
      🏢 ${appEscapeHtml(c.name)}${c.isDefault ? ' (Default)' : ''}
    </option>
  `).join('') + noLinkOption + `<option value="__new__">+ Add New Company Profile...</option>`;

  if (linkNormalized) {
    renderLineItemsEditor();
    refreshCatalogPicker();
  }
}

async function renderCompaniesModalList() {
  const container = document.getElementById('modal-companies-list');
  if (!container) return;
  const companies = await getAllCompanies();
  await updateSavedCompaniesCount();

  if (companies.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:24px 0; color:#94a3b8; font-size:13px;">
        No saved companies yet. Add your first business profile above!
      </div>
    `;
    return;
  }

  container.innerHTML = companies.map(comp => {
    const isDef = !!comp.isDefault;
    const isCurrentActive = comp.id === activeCompanyProfileId;
    const safeId = appEscapeHtml(comp.id);
    return `
      <div class="company-card-item ${isDef ? 'is-default' : ''}" data-id="${safeId}">
        <div style="flex:1; padding-right:12px;">
          <div style="font-size:13.5px; font-weight:700; color:#0f172a; display:flex; align-items:center; flex-wrap:wrap; gap:4px;">
            ${appEscapeHtml(comp.name)}
            ${isDef ? '<span class="badge-company-default">DEFAULT</span>' : ''}
            ${isCurrentActive ? '<span style="font-size:9.5px; font-weight:700; padding:1px 6px; border-radius:4px; background:#dcfce7; color:#16a34a; text-transform:uppercase;">ACTIVE</span>' : ''}
          </div>
          <div style="font-size:11.5px; color:#64748b; margin-top:2px;">
            ${appEscapeHtml(comp.email || '')}${comp.phone ? ' • ' + appEscapeHtml(comp.phone) : ''}${comp.taxId ? ' • Tax: ' + appEscapeHtml(comp.taxId) : ''}
          </div>
          <div style="font-size:11px; color:#475569; margin-top:2px;">
            Default currency: <strong>${appEscapeHtml(comp.defaultCurrency || '$')}</strong>
            &bull; ${appEscapeHtml((comp.defaultNumberFormat || 'international') === 'indian' ? 'Indian number format' : 'International number format')}
          </div>
          ${comp.address ? `<div style="font-size:11px; color:#94a3b8; margin-top:2px; white-space:pre-line;">${appEscapeHtml(comp.address)}</div>` : ''}
          ${comp.payment ? `<div style="font-size:10.5px; color:#0369a1; background:#f0f9ff; padding:3px 6px; border-radius:4px; margin-top:4px; display:inline-block;">Bank/Payment Remittance Saved</div>` : ''}
        </div>
        <div style="display:flex; gap:6px; align-items:center;">
          <button class="btn btn-primary btn-sm btn-use-company" data-id="${safeId}" title="Apply this company to the active document">
            Use
          </button>
          ${!isDef ? `<button class="btn btn-secondary btn-sm btn-set-default-company" data-id="${safeId}" title="Make default for all new documents">Make Default</button>` : ''}
          <button class="btn btn-secondary btn-sm btn-edit-company" data-id="${safeId}" title="Edit this company">
            Edit
          </button>
          <button class="btn btn-danger btn-sm btn-icon btn-del-company" data-id="${safeId}" title="Delete company" ${companies.length <= 1 ? 'disabled style="opacity:0.3; cursor:not-allowed;"' : ''}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </div>
      </div>
    `;
  }).join('');

  // Event handlers for company card actions
  container.querySelectorAll('.btn-use-company').forEach(btn => {
    btn.addEventListener('click', async () => {
      const comp = await getCompany(btn.dataset.id);
      if (comp) {
        applyCompanyToInvoice(comp);
        closeModal('modal-companies');
      }
    });
  });

  container.querySelectorAll('.btn-set-default-company').forEach(btn => {
    btn.addEventListener('click', async () => {
      await setDefaultCompany(btn.dataset.id);
      await renderCompanyProfilesSelector();
      await renderCompaniesModalList();
    });
  });

  container.querySelectorAll('.btn-edit-company').forEach(btn => {
    btn.addEventListener('click', async () => {
      const comp = await getCompany(btn.dataset.id);
      if (comp) {
        document.getElementById('modal-company-id').value = comp.id;
        document.getElementById('modal-company-name').value = comp.name || '';
        document.getElementById('modal-company-email').value = comp.email || '';
        document.getElementById('modal-company-phone').value = comp.phone || '';
        document.getElementById('modal-company-address').value = comp.address || '';
        document.getElementById('modal-company-taxid').value = comp.taxId || '';
        document.getElementById('modal-company-payment').value = comp.payment || '';
        document.getElementById('modal-company-currency').value = comp.defaultCurrency || '$';
        document.getElementById('modal-company-number-format').value = comp.defaultNumberFormat || 'international';
        document.getElementById('modal-company-is-default').checked = !!comp.isDefault;
        document.getElementById('company-form-heading').textContent = `Edit Company: ${comp.name}`;
        document.getElementById('btn-cancel-company-edit').style.display = 'inline-block';
        document.getElementById('modal-company-name').focus();
      }
    });
  });

  container.querySelectorAll('.btn-del-company').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (confirm('Permanently delete this company profile?')) {
        const deletedId = String(btn.dataset.id || '');
        await deleteCompany(deletedId);
        if (deletedId && (deletedId === activeCompanyProfileId || deletedId === currentInvoice.companyId)) {
          // A linked document must not keep scoping catalog items against a
          // deleted company: drop the link and rebuild the dependent UI.
          activeCompanyProfileId = null;
          currentInvoice.companyId = null;
          renderLineItemsEditor();
          updateSheetView();
        }
        refreshCatalogPicker();
        await renderCompanyProfilesSelector();
        await renderCompaniesModalList();
        await notifyDataChanged();
      }
    });
  });
}

function applyCompanyToInvoice(comp) {
  if (!comp) return;
  activeCompanyProfileId = comp.id;
  currentInvoice.companyId = comp.id;
  currentInvoice.sender = {
    name: comp.name || '',
    email: comp.email || '',
    phone: comp.phone || '',
    address: comp.address || '',
    taxId: comp.taxId || ''
  };
  currentInvoice.payment = comp.payment || '';

  // Currency defaults apply to new documents. On an already persisted document
  // the user must explicitly confirm a currency change.
  const targetCurrency = String(comp.defaultCurrency || '').trim();
  if (targetCurrency && targetCurrency !== currentInvoice.meta.currency) {
    const shouldChange = !currentDocumentPersisted ||
      confirm(`This company's default currency is ${targetCurrency}. Change the document currency from ${currentInvoice.meta.currency || '$'} to ${targetCurrency}?`);
    if (shouldChange) {
      currentInvoice.meta.currency = targetCurrency;
      currentInvoice.meta.numberFormat = comp.defaultNumberFormat ||
        (targetCurrency === '₹' ? 'indian' : 'international');
    }
  } else if (targetCurrency && !currentDocumentPersisted && comp.defaultNumberFormat) {
    currentInvoice.meta.numberFormat = comp.defaultNumberFormat;
  }

  // If Utharam company is selected, auto-configure official Utharam brand mark
  if (comp.name && comp.name.toLowerCase().includes('utharam') && (!currentInvoice.logo.dataUri || currentInvoice.logo.dataUri.startsWith('data:image/svg+xml'))) {
    currentInvoice.logo.dataUri = generateBrandLockupSVG({
      symbolType: 'monogram',
      initials: 'U',
      shape: 'squircle',
      emblemStyle: 'solid',
      markColor: '#ffffff',
      bgColor: '#059669',
      companyName: 'Utharam',
      tagline: 'Simple Solutions for Complex Problems',
      underlineStyle: 'solid',
      underlineSpan: 'auto',
      underlinePosition: 'bottom',
      layout: 'horizontal',
      textColor: '#0f172a',
      accentColor: '#059669'
    });
    currentInvoice.accentColor = '#059669';
  }

  populateFormFields();
  renderLineItemsEditor();
  updateSheetView();
  refreshCatalogPicker();
  triggerAutoSave();
  renderCompanyProfilesSelector();
}

/**
 * Manual rebranding: hand-editing the sender fields detaches the document
 * from the stored company profile (the link fields only — the sender snapshot
 * keeps the typed text), so Reports can never attribute a manually rebranded
 * document to the old company. Programmatic company application
 * (applyCompanyToInvoice) must NOT call this.
 */
function detachCompanyLink() {
  activeCompanyProfileId = null;
  currentInvoice.companyId = null;
  // The scope hint and any company-tagged picker rows must not reference the
  // dropped link (manual rebranding can happen on every sender keystroke).
  refreshCatalogPicker();
}

async function saveCompanyFromModal() {
  const id = document.getElementById('modal-company-id').value;
  const name = document.getElementById('modal-company-name').value.trim();
  if (!name) {
    alert('Please enter a company or trading name.');
    return;
  }

  const email = document.getElementById('modal-company-email').value.trim();
  const phone = document.getElementById('modal-company-phone').value.trim();
  const address = document.getElementById('modal-company-address').value.trim();
  const taxId = document.getElementById('modal-company-taxid').value.trim();
  const payment = document.getElementById('modal-company-payment').value.trim();
  const defaultCurrency = document.getElementById('modal-company-currency').value.trim() || '$';
  const defaultNumberFormat = document.getElementById('modal-company-number-format').value || 'international';
  const isDefault = document.getElementById('modal-company-is-default').checked;

  // Merge into the existing record so createdAt, default fields, and any
  // unknown fields survive editing.
  const existing = id ? await getCompany(id) : null;
  const company = Object.assign({}, existing || {}, {
    id: id || generateId('comp_'),
    name,
    email,
    phone,
    address,
    taxId,
    payment,
    defaultCurrency,
    defaultNumberFormat,
    isDefault
  });
  if (!company.createdAt) company.createdAt = Date.now();

  await saveCompany(company);
  if (isDefault) {
    await setDefaultCompany(company.id);
  } else {
    const companies = await getAllCompanies();
    if (!companies.some(c => c.isDefault)) {
      const fallback = companies.find(c => c.id !== company.id) || companies[0];
      if (fallback) await setDefaultCompany(fallback.id);
    }
  }

  resetCompanyModalForm();
  await renderCompanyProfilesSelector();
  await renderCompaniesModalList();
  await notifyDataChanged();
  // Names may have changed: refresh the label cache and the picker/hint so
  // scope hints and scope tags never show a stale company name.
  refreshCatalogPicker();
  alert(`Company profile "${company.name}" saved successfully!`);
}

function resetCompanyModalForm() {
  document.getElementById('modal-company-id').value = '';
  document.getElementById('modal-company-name').value = '';
  document.getElementById('modal-company-email').value = '';
  document.getElementById('modal-company-phone').value = '';
  document.getElementById('modal-company-address').value = '';
  document.getElementById('modal-company-taxid').value = '';
  document.getElementById('modal-company-payment').value = '';
  document.getElementById('modal-company-currency').value = '$';
  document.getElementById('modal-company-number-format').value = 'international';
  document.getElementById('modal-company-is-default').checked = false;
  document.getElementById('company-form-heading').textContent = 'Add New Company Profile';
  document.getElementById('btn-cancel-company-edit').style.display = 'none';
}

function updateLogoAlignmentButtons(align) {
  ['left', 'center', 'right'].forEach(a => {
    const btn = document.getElementById(`btn-logo-${a}`);
    if (btn) {
      if (a === align) btn.classList.add('btn-primary');
      else btn.classList.remove('btn-primary');
    }
  });
}

function updateHeaderLayoutButtons(layout) {
  ['left', 'center', 'right'].forEach(l => {
    const btn = document.getElementById(`btn-layout-${l}`);
    if (btn) {
      if (l === layout) btn.classList.add('btn-primary');
      else btn.classList.remove('btn-primary');
    }
  });
}

// ============================================================================
// 6. LINE ITEMS EDITOR & TAXES EDITOR
// ============================================================================
function updateLineTotalBadge(card, idx) {
  try {
    const item = currentInvoice.items[idx];
    if (!item || !card) return;
    const qty = clampNum(item.qty, 0, 1000000, 0);
    const rate = clampNum(item.rate, 0, 1000000000, 0);
    const disc = clampNum(item.discount, 0, 100, 0);
    const taxRate = clampNum(item.taxRate, 0, 100, 0);
    const taxable = qty * rate * (1 - disc / 100);
    const lineTotal = taxable + taxable * (taxRate / 100);
    const badge = card.querySelector('.item-total-badge');
    if (badge) {
      badge.textContent = formatMoney(lineTotal, currentInvoice.meta.currency || '$', currentInvoice.meta.numberFormat || 'international');
    }
  } catch (e) {}
}
function renderLineItemsEditor() {
  const container = document.getElementById('items-editor-list');
  if (!container) return;

  const currency = currentInvoice.meta.currency || '$';
  const numberFormat = currentInvoice.meta.numberFormat || 'international';

  container.innerHTML = currentInvoice.items.map((item, index) => {
    const qty = parseFloat(item.qty) || 0;
    const rate = parseFloat(item.rate) || 0;
    const disc = parseFloat(item.discount) || 0;
    const taxable = qty * rate * (1 - disc / 100);
    const taxRate = item.taxRate !== undefined ? parseFloat(item.taxRate) : 18;
    const taxAmount = taxable * (taxRate / 100);
    const lineTotal = taxable + taxAmount;

    const standardRates = [0, 5, 12, 18, 28];
    const isStandard = standardRates.includes(taxRate);

    // Bookmark state: filled when this line already matches a saved catalog
    // item under the current save scope/company/currency/description.
    const savedCatalogVersion = findSavedCatalogForItem(item);
    const isSavedToCatalog = Boolean(savedCatalogVersion);
    const saveBookmarkTitle = isSavedToCatalog
      ? 'Update saved item'
      : 'Save to item library';

    return `
      <div class="item-card-editor" data-index="${index}">
        <!-- Row 1: Description + HSN/SAC + Bookmark save + Delete -->
        <div class="item-card-row-1">
          <input type="text" class="form-input item-desc-input" value="${appEscapeHtml(item.description)}" placeholder="Service or Item Description">
          <input type="text" class="form-input item-hsn-input" value="${appEscapeHtml(item.hsn || '')}" placeholder="HSN/SAC" title="HSN/SAC Code (e.g. 998314)">
          <button type="button" class="btn-icon btn-save-catalog${isSavedToCatalog ? ' is-saved' : ''}" title="${saveBookmarkTitle}" aria-label="${saveBookmarkTitle}" aria-pressed="${isSavedToCatalog}" data-catalog-saved-id="${isSavedToCatalog ? appEscapeHtml(savedCatalogVersion.id) : ''}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
          </button>
          <button class="btn btn-danger btn-sm btn-icon btn-delete-item" title="Delete line item" ${currentInvoice.items.length <= 1 ? 'disabled style="opacity:0.3; cursor:not-allowed;"' : ''}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </div>

        <!-- Row 2: Qty + Rate + Disc + Tax Rate + Line Total -->
        <div class="item-card-row-2">
          <div>
            <span style="font-size:10px; color:#94a3b8; display:block; margin-bottom:2px;">Qty</span>
            <input type="number" class="form-input item-qty-input" value="${item.qty}" min="0.01" step="any" style="text-align:center; padding:5px 6px; font-size:12px;">
          </div>
          <div>
            <span style="font-size:10px; color:#94a3b8; display:block; margin-bottom:2px;">Unit Price</span>
            <input type="number" class="form-input item-rate-input" value="${item.rate}" min="0" step="any" style="text-align:right; padding:5px 6px; font-size:12px;">
          </div>
          <div>
            <span style="font-size:10px; color:#94a3b8; display:block; margin-bottom:2px;">Disc %</span>
            <input type="number" class="form-input item-disc-input" value="${item.discount || 0}" min="0" max="100" step="any" style="text-align:right; padding:5px 6px; font-size:12px;">
          </div>
          <div>
            <span style="font-size:10px; color:#94a3b8; display:block; margin-bottom:2px;">Tax Rate</span>
            <select class="form-select item-tax-select" style="padding:5px 6px; font-size:11px;">
              <option value="0" ${taxRate === 0 ? 'selected' : ''}>0% (Exempt)</option>
              <option value="5" ${taxRate === 5 ? 'selected' : ''}>5% Tax</option>
              <option value="12" ${taxRate === 12 ? 'selected' : ''}>12% Tax</option>
              <option value="18" ${taxRate === 18 ? 'selected' : ''}>18% GST</option>
              <option value="28" ${taxRate === 28 ? 'selected' : ''}>28% Tax</option>
              <option value="custom" ${!isStandard ? 'selected' : ''}>${!isStandard ? taxRate + '% Custom' : 'Custom %...'}</option>
            </select>
          </div>
          <div style="text-align:right;">
            <span style="font-size:10px; color:#94a3b8; display:block; margin-bottom:2px;">Line Total</span>
            <div class="item-total-badge" style="font-size:12px; font-weight:700; color:#0f172a; padding-top:4px;">${formatMoney(lineTotal, currency, numberFormat)}</div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Attach change listeners to item cards
  container.querySelectorAll('.item-card-editor').forEach(card => {
    const idx = parseInt(card.dataset.index, 10);
    card.querySelector('.item-desc-input').addEventListener('input', (e) => {
      currentInvoice.items[idx].description = e.target.value;
      // The catalog dedupe key includes the description: refresh this card's
      // bookmark state in place instead of re-rendering the whole editor.
      updateCatalogBookmarkState(card, idx);
      updateSheetView();
      triggerAutoSave();
    });
    card.querySelector('.item-hsn-input').addEventListener('input', (e) => {
      currentInvoice.items[idx].hsn = e.target.value;
      updateSheetView();
      triggerAutoSave();
    });
    card.querySelector('.item-qty-input').addEventListener('input', (e) => {
      currentInvoice.items[idx].qty = clampNum(e.target.value, 0, 1000000, 0);
      updateSheetView();
      updateLineTotalBadge(card, idx);
      triggerAutoSave();
    });
    card.querySelector('.item-qty-input').addEventListener('change', (e) => {
      e.target.value = currentInvoice.items[idx].qty;
      renderLineItemsEditor();
    });
    card.querySelector('.item-rate-input').addEventListener('input', (e) => {
      currentInvoice.items[idx].rate = clampNum(e.target.value, 0, 1000000000, 0);
      updateSheetView();
      updateLineTotalBadge(card, idx);
      triggerAutoSave();
    });
    card.querySelector('.item-rate-input').addEventListener('change', (e) => {
      e.target.value = currentInvoice.items[idx].rate;
      renderLineItemsEditor();
    });
    card.querySelector('.item-disc-input').addEventListener('input', (e) => {
      currentInvoice.items[idx].discount = clampNum(e.target.value, 0, 100, 0);
      updateSheetView();
      updateLineTotalBadge(card, idx);
      triggerAutoSave();
    });
    card.querySelector('.item-disc-input').addEventListener('change', (e) => {
      e.target.value = currentInvoice.items[idx].discount;
      renderLineItemsEditor();
    });
    card.querySelector('.item-tax-select').addEventListener('change', (e) => {
      if (e.target.value === 'custom') {
        const customPrompt = prompt('Enter custom tax percentage 0-100 (e.g. 7.5 or 15):', currentInvoice.items[idx].taxRate ?? '12');
        if (customPrompt !== null) {
          const parsed = clampNum(customPrompt, 0, 100, 0);
          currentInvoice.items[idx].taxRate = parsed;
        }
      } else {
        currentInvoice.items[idx].taxRate = clampNum(e.target.value, 0, 100, 0);
      }
      renderLineItemsEditor();
      updateSheetView();
      triggerAutoSave();
    });
    const deleteBtn = card.querySelector('.btn-delete-item');
    if (deleteBtn && !deleteBtn.disabled) {
      deleteBtn.addEventListener('click', () => {
        currentInvoice.items.splice(idx, 1);
        renderLineItemsEditor();
        updateSheetView();
        triggerAutoSave();
      });
    }
    const saveCatalogBtn = card.querySelector('.btn-save-catalog');
    if (saveCatalogBtn) {
      saveCatalogBtn.addEventListener('click', async () => {
        await saveLineItemToCatalog(idx);
      });
    }
  });
}

// ============================================================================
// 5B. SAVED ITEM LIBRARY (Module 5 picker + bookmark save + Settings manager)
// ============================================================================
// In-memory mirrors of the v4 catalog data (`catalogItems` store and the
// `itemLibraryConfig` setting) are loaded once at boot; writes go through
// js/db.js and update the cache immediately. Catalog edits never touch saved
// invoices or the active draft — they only write to `catalogItems`.
let catalogCompanyNameCache = new Map(); // companyId -> display name
let catalogCompanyNamesResolved = false; // cache contains a real company list?
let catalogStatusTimer = null;
let itemLibraryStatusTimer = null;

/** Canonical currency key of the active document (drives picker filtering). */
function catalogCurrencyKey() {
  return normalizeCurrency(currentInvoice.meta.currency || '$').key;
}

/**
 * Active company link: current document link wins, else the shell selector.
 * The id is validated against the known company list so deleted/dangling
 * links can never scope catalog saves or picker grouping — such links return
 * null (treated like "no company").
 */
function catalogActiveCompanyId() {
  const candidate = currentInvoice.companyId || activeCompanyProfileId || null;
  if (!candidate) return null;
  const key = String(candidate).trim();
  // Company list not loaded yet (very early boot / transient): fall back to
  // the raw link so the UI never spuriously blocks company-scope actions.
  if (!catalogCompanyNamesResolved) return key;
  return catalogCompanyNameCache.has(key) ? key : null;
}

/** Sync display label for a company id, best-effort from the name cache. */
function catalogCompanyLabel(companyId) {
  if (!companyId) return '';
  return catalogCompanyNameCache.get(String(companyId)) || '';
}

/** Keeps the companyId->name cache fresh; a failed read only risks labels. */
function refreshCatalogCompanyNameCache() {
  return getAllCompanies()
    .then(companies => {
      catalogCompanyNameCache = new Map((companies || []).map(c => [
        String(c.id),
        (c && c.name) ? c.name : String(c.id)
      ]));
      catalogCompanyNamesResolved = true;
    })
    .catch(() => {
      // An unreadable company list cannot vouch for any link: treat as empty
      // so stale/deleted ids are never used as a catalog save scope.
      catalogCompanyNameCache = new Map();
      catalogCompanyNamesResolved = true;
    });
}

/** Adds or replaces one record in the cache array (db returns newest first). */
function upsertCatalogItemInCache(record) {
  if (!record || !record.id) return;
  const idx = catalogItems.findIndex(c => c && c.id === record.id);
  if (idx >= 0) catalogItems[idx] = record;
  else catalogItems.unshift(record);
}

/** The scope new saves should use, honoring the configured default. */
function getCatalogSaveContext() {
  const scope = normalizeCatalogScope(itemLibraryConfig ? itemLibraryConfig.scope : 'global');
  const activeCompanyId = catalogActiveCompanyId();
  return {
    scope,
    companyId: scope === 'company' ? activeCompanyId : null,
    hasCompanyScopeBlocker: scope === 'company' && !activeCompanyId
  };
}

/**
 * The saved version of a line item under the current save scope/company/
 * currency/description — drives the bookmark's filled "saved" state.
 */
function findSavedCatalogForItem(lineItem) {
  if (!lineItem || typeof lineItem !== 'object') return null;
  const ctx = getCatalogSaveContext();
  const candidate = buildCatalogCandidateFromLineItem(lineItem, {
    scope: ctx.scope,
    companyId: ctx.companyId,
    currency: currentInvoice.meta.currency || '$',
    currencyKey: catalogCurrencyKey()
  });
  return findCatalogMatch(catalogItems, candidate);
}

/**
 * Refreshes one bookmark button's saved/unsaved state in place (class,
 * aria-pressed, title and data id) without rebuilding the whole item editor.
 * The dedupe key only depends on scope/company/currency/description, so this
 * runs on description edits; the editor is re-rendered wholly whenever the
 * catalog itself changes.
 */
function updateCatalogBookmarkState(card, index) {
  const btn = card && card.querySelector ? card.querySelector('.btn-save-catalog') : null;
  if (!btn) return;
  const item = currentInvoice.items[index];
  if (!item) return;
  const savedVersion = findSavedCatalogForItem(item);
  const isSaved = Boolean(savedVersion);
  const title = isSaved ? 'Update saved item' : 'Save to item library';
  btn.classList.toggle('is-saved', isSaved);
  btn.setAttribute('aria-pressed', isSaved ? 'true' : 'false');
  btn.setAttribute('aria-label', title);
  btn.setAttribute('title', title);
  // setAttribute writes the raw value (no HTML escaping needed here).
  btn.setAttribute('data-catalog-saved-id', isSaved ? savedVersion.id : '');
}

/** "Saved/Added to <x>" feedback for the Module 5 picker (timed clear). */
function setCatalogStatus(message) {
  const el = document.getElementById('catalog-status');
  if (!el) return;
  el.textContent = message || '';
  if (catalogStatusTimer) { clearTimeout(catalogStatusTimer); catalogStatusTimer = null; }
  if (message) {
    catalogStatusTimer = setTimeout(() => {
      el.textContent = '';
      catalogStatusTimer = null;
    }, 5000);
  }
}

/** Same feedback pattern for the item-library modal. */
function setItemLibraryStatus(message) {
  const el = document.getElementById('item-library-status');
  if (!el) return;
  el.textContent = message || '';
  if (itemLibraryStatusTimer) { clearTimeout(itemLibraryStatusTimer); itemLibraryStatusTimer = null; }
  if (message) {
    itemLibraryStatusTimer = setTimeout(() => {
      el.textContent = '';
      itemLibraryStatusTimer = null;
    }, 5000);
  }
}

/** Scope hint under the picker eyebrow: where new bookmark saves will land. */
function updateCatalogScopeHint() {
  const el = document.getElementById('catalog-scope-hint');
  if (!el) return;
  const scope = normalizeCatalogScope(itemLibraryConfig ? itemLibraryConfig.scope : 'global');
  if (scope !== 'company') {
    el.textContent = 'New saves go to Global items';
    return;
  }
  const companyId = catalogActiveCompanyId();
  if (!companyId) {
    el.textContent = 'Link a company to save company items';
    return;
  }
  el.textContent = `New saves go to ${catalogCompanyLabel(companyId) || 'your linked company'}`;
}

/** Refresh the picker hint + open results after company/currency/doc changes. */
function refreshCatalogPicker() {
  refreshCatalogCompanyNameCache().then(() => {
    updateCatalogScopeHint();
    if (isCatalogResultsOpen()) showCatalogResults();
  });
  updateCatalogScopeHint();
  if (isCatalogResultsOpen()) showCatalogResults();
}

/** Whether the picker dropdown is showing right now. */
function isCatalogResultsOpen() {
  const resultsEl = document.getElementById('catalog-results');
  if (!resultsEl || resultsEl.hidden) return false;
  const searchEl = document.getElementById('catalog-search');
  return Boolean(searchEl && (searchEl === document.activeElement || resultsEl.contains(document.activeElement)));
}

function hideCatalogResults() {
  const resultsEl = document.getElementById('catalog-results');
  const searchEl = document.getElementById('catalog-search');
  if (searchEl) searchEl.setAttribute('aria-expanded', 'false');
  if (resultsEl) resultsEl.hidden = true;
}

function catalogResultRowHTML(item) {
  const currency = (item.currency && typeof item.currency === 'string')
    ? item.currency
    : currentInvoice.meta.currency;
  const price = formatMoney(item.rate, currency, currentInvoice.meta.numberFormat || 'international');
  const scope = normalizeCatalogScope(item.scope);
  const scopeTag = scope === 'company' ? (catalogCompanyLabel(item.companyId) || 'Company') : 'Global';
  return `
    <button type="button" class="catalog-result-row" data-catalog-add="${appEscapeHtml(item.id)}" title="Add this saved item as a new line item">
      <span class="catalog-result-main">
        <span class="catalog-result-desc">${appEscapeHtml(item.description)}</span>
        <span class="catalog-result-meta">
          ${item.hsn ? `<span class="item-hsn-tag">HSN ${appEscapeHtml(item.hsn)}</span>` : ''}
          <span class="catalog-price">${appEscapeHtml(price)}</span>
          <span class="catalog-tax-badge">${Number(item.taxRate) || 0}% tax</span>
        </span>
      </span>
      <span class="catalog-scope-tag ${scope === 'company' ? 'is-company' : 'is-global'}">${appEscapeHtml(scopeTag)}</span>
    </button>`;
}

function catalogResultEmptyHTML(search) {
  const trimmed = (typeof search === 'string') ? search.trim() : '';
  const note = trimmed
    ? 'No saved items match this search.'
    : 'No saved items in this currency yet.';
  return `
    <div class="catalog-empty">
      <span>${note}</span>
      <button type="button" class="btn btn-secondary btn-sm" data-catalog-manage>Manage items</button>
    </div>`;
}

/** Renders the grouped global/company dropdown from the current cache. */
function showCatalogResults() {
  const searchEl = document.getElementById('catalog-search');
  const resultsEl = document.getElementById('catalog-results');
  if (!searchEl || !resultsEl) return;
  searchEl.setAttribute('aria-expanded', 'true');
  const search = searchEl.value;
  const groups = groupCatalogItemsForView(catalogItems, {
    search,
    currencyKey: catalogCurrencyKey(),
    companyId: catalogActiveCompanyId()
  });
  if (groups.length === 0) {
    resultsEl.innerHTML = catalogResultEmptyHTML(search);
  } else {
    resultsEl.innerHTML = groups.map(group => {
      return `<div class="catalog-group-label">${appEscapeHtml(group.label)}</div>` +
        group.items.map(catalogResultRowHTML).join('');
    }).join('');
  }
  resultsEl.hidden = false;
}

/** Repeated listeners: static wiring only, never per rendered row. */
function setupCatalogPicker() {
  const searchEl = document.getElementById('catalog-search');
  const resultsEl = document.getElementById('catalog-results');
  const manageBtn = document.getElementById('btn-manage-catalog');

  if (searchEl) {
    searchEl.addEventListener('focus', () => { showCatalogResults(); });
    searchEl.addEventListener('input', () => { showCatalogResults(); });
  }

  if (manageBtn) {
    manageBtn.addEventListener('click', async () => {
      // Never let the dropdown linger under the manager modal.
      hideCatalogResults();
      await openAppModal('modal-item-library');
    });
  }

  // One delegated click target for all result rows and the empty-state
  // Manage button; rows are re-rendered on every search change, so per-row
  // bindings would leak and never stay in sync.
  if (resultsEl) {
    resultsEl.addEventListener('click', async (e) => {
      const manageTrigger = e.target.closest('[data-catalog-manage]');
      if (manageTrigger) {
        hideCatalogResults();
        await openAppModal('modal-item-library');
        return;
      }
      const addBtn = e.target.closest('[data-catalog-add]');
      if (!addBtn) return;
      hideCatalogResults();
      await addLineItemFromCatalog(addBtn.getAttribute('data-catalog-add'));
    });
  }

  // Closing the manager (×, Close footer, Escape-cancel) dismisses any
  // lingering dropdown and re-syncs the picker with the post-edit catalog.
  const libraryModal = document.getElementById('modal-item-library');
  if (libraryModal) {
    libraryModal.addEventListener('close', () => {
      hideCatalogResults();
      refreshCatalogPicker();
    });
  }

  // Close the dropdown on any click outside the picker.
  document.addEventListener('click', (e) => {
    const picker = document.getElementById('catalog-picker');
    if (!picker || picker.contains(e.target)) return;
    hideCatalogResults();
  });

  // Escape closes the dropdown (and blurs) without touching open dialogs.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const openResults = document.getElementById('catalog-results');
    if (openResults && !openResults.hidden) {
      hideCatalogResults();
      const focusedSearch = document.getElementById('catalog-search');
      if (focusedSearch && focusedSearch === document.activeElement) focusedSearch.blur();
    }
  });
}

/**
 * Adds a saved catalog item to the document as a new line item (qty 1, saved
 * price/tax/HSN, discount 0) and bumps its usage counters as a non-blocking
 * write. The line item itself is plain document data — no catalog ids or
 * currency fields leak into the invoice.
 */
async function addLineItemFromCatalog(catalogId) {
  if (!catalogId) return;
  const item = catalogItems.find(c => c && c.id === catalogId);
  if (!item) {
    setCatalogStatus('That saved item is no longer in the library.');
    showCatalogResults();
    return;
  }

  currentInvoice.items.push(catalogItemToLineItem(item));
  renderLineItemsEditor();
  updateSheetView();
  triggerAutoSave();

  const searchEl = document.getElementById('catalog-search');
  if (searchEl) searchEl.value = '';
  hideCatalogResults();
  setCatalogStatus(`Added ${item.description}`);

  (async () => {
    try {
      const bumped = await saveCatalogItem({
        ...item,
        usageCount: (Number(item.usageCount) || 0) + 1,
        lastUsedAt: Date.now()
      });
      upsertCatalogItemInCache(bumped);
    } catch (e) {
      console.warn('Could not update saved item usage counters:', e);
    }
  })();
}

/**
 * Bookmark action for a line item card: save it to the library, or update the
 * existing match (scope + company + currency + description dedupe). Success
 * feedback goes to the picker status line, never an alert.
 */
async function saveLineItemToCatalog(index) {
  const item = currentInvoice.items[index];
  if (!item || typeof item !== 'object') return;
  const description = (typeof item.description === 'string') ? item.description.trim() : '';
  if (!description) {
    alert('Add a description before saving this line item to the item library.');
    return;
  }

  const ctx = getCatalogSaveContext();
  if (ctx.hasCompanyScopeBlocker) {
    alert('Link a company to this document or switch the item library to Shared in Settings.');
    return;
  }

  const currency = currentInvoice.meta.currency || '$';
  const currencyKey = normalizeCurrency(currency).key;
  const candidate = buildCatalogCandidateFromLineItem(item, {
    scope: ctx.scope,
    companyId: ctx.companyId,
    currency,
    currencyKey
  });
  const existing = findCatalogMatch(catalogItems, candidate);

  // Updates keep the stored id, createdAt and usage counters; new records are
  // normalized (clamps, descriptionKey, currencyKey) by saveCatalogItem.
  const record = Object.assign({}, candidate, existing ? {
    id: existing.id,
    createdAt: existing.createdAt,
    usageCount: existing.usageCount,
    lastUsedAt: existing.lastUsedAt
  } : {});

  try {
    const savedRecord = await saveCatalogItem(record);
    upsertCatalogItemInCache(savedRecord);
    renderLineItemsEditor();
    updateCatalogSettingsCount();
    updateCatalogScopeHint();
    if (isCatalogResultsOpen()) showCatalogResults();
    const scopeLabel = savedRecord.scope === 'company'
      ? (catalogCompanyLabel(savedRecord.companyId) || 'your company')
      : 'Global items';
    setCatalogStatus(existing ? `Updated ${savedRecord.description}` : `Saved to ${scopeLabel}`);
  } catch (e) {
    console.warn('Could not save line item to the library:', e);
    alert('Could not save this line item to the item library. ' + (e && e.message ? e.message : ''));
  }
}

// ---- Item library manager (Settings modal) --------------------------------

function updateCatalogSettingsCount() {
  const el = document.getElementById('settings-catalog-count');
  if (el) el.textContent = String(catalogItems.length);
}

function renderItemLibraryScopeRadios() {
  const scope = normalizeCatalogScope(itemLibraryConfig ? itemLibraryConfig.scope : 'global');
  document.querySelectorAll('input[name="item-library-scope"]').forEach(radio => {
    radio.checked = normalizeCatalogScope(radio.value) === scope;
  });
}

/**
 * Loads modal data, resets the form/search and renders the grouped list.
 * Called by openAppModal() every time the dialog opens, so the view never
 * shows a stale cache after external changes.
 */
async function openItemLibraryManager() {
  hideCatalogResults();
  try {
    catalogItems = await getAllCatalogItems();
  } catch (e) {
    console.warn('Item library refresh failed:', e);
  }
  try {
    itemLibraryConfig = await getItemLibraryConfig();
  } catch (e) {
    console.warn('Item library scope refresh failed:', e);
    itemLibraryConfig = { scope: 'global', updatedAt: null };
  }
  itemLibraryEditing = null;
  hideItemLibraryForm();
  renderItemLibraryScopeRadios();
  updateCatalogSettingsCount();
  const searchEl = document.getElementById('item-library-search');
  if (searchEl) searchEl.value = '';
  setItemLibraryStatus('');
  await refreshCatalogCompanyNameCache();
  await renderItemLibraryList();
  refreshCatalogPicker();
}

function updateCatalogFormCompanyState(hasCompanies) {
  const scopeEl = document.getElementById('item-library-scope');
  const companyEl = document.getElementById('item-library-company');
  const hintEl = document.getElementById('item-library-company-hint');
  const isCompany = Boolean(scopeEl) && normalizeCatalogScope(scopeEl.value) === 'company';
  if (companyEl) companyEl.disabled = !isCompany;
  if (hintEl && hasCompanies !== undefined) {
    if (isCompany && !hasCompanies) {
      hintEl.textContent = 'No saved companies yet — keep items shared, or add one in Companies first.';
    } else if (isCompany) {
      hintEl.textContent = 'Only documents linked to this company will see it.';
    } else {
      hintEl.textContent = '';
    }
  }
}

/** Populates the company select; an empty library keeps Global scope usable. */
async function populateItemLibraryCompanySelect(selectedId) {
  const select = document.getElementById('item-library-company');
  if (!select) return false;
  let companies = [];
  try {
    companies = await getAllCompanies();
  } catch (e) {
    console.warn('Company list for item library failed:', e);
  }
  const hasCompanies = companies.length > 0;
  if (!hasCompanies) {
    select.innerHTML = `<option value="">No companies saved yet &mdash; link one in Companies</option>`;
  } else {
    select.innerHTML = `<option value="">Choose a company&hellip;</option>` +
      companies.map(c => `<option value="${appEscapeHtml(c.id)}">${appEscapeHtml((c && c.name) || 'Company')}</option>`).join('');
    if (selectedId) select.value = String(selectedId);
    if (!select.value && selectedId && companies.some(c => String(c.id) === String(selectedId))) {
      select.value = String(selectedId);
    }
  }
  updateCatalogFormCompanyState(hasCompanies);
  return hasCompanies;
}

function itemLibraryRowHTML(item) {
  const currency = (item.currency && typeof item.currency === 'string')
    ? item.currency
    : currentInvoice.meta.currency;
  const price = formatMoney(item.rate, currency, currentInvoice.meta.numberFormat || 'international');
  const scope = normalizeCatalogScope(item.scope);
  const scopeTag = scope === 'company' ? (catalogCompanyLabel(item.companyId) || 'Company') : 'Global';
  const taxRate = Number(item.taxRate) || 0;
  return `
    <div class="item-library-row" data-item-library-row="${appEscapeHtml(item.id)}">
      <div class="item-library-row-main">
        <div class="item-library-row-desc">${appEscapeHtml(item.description)}</div>
        <div class="item-library-row-meta">
          <span class="catalog-price">${appEscapeHtml(price)}</span>
          <span>${taxRate}% tax</span>
          ${item.hsn ? `<span>HSN ${appEscapeHtml(item.hsn)}</span>` : ''}
        </div>
      </div>
      <span class="catalog-scope-tag ${scope === 'company' ? 'is-company' : 'is-global'}">${appEscapeHtml(scopeTag)}</span>
      <div class="item-library-row-actions">
        <button type="button" class="btn btn-secondary btn-sm" data-item-library-edit="${appEscapeHtml(item.id)}" title="Edit this item">Edit</button>
        <button type="button" class="btn btn-danger btn-sm btn-icon" data-item-library-remove="${appEscapeHtml(item.id)}" title="Delete this item">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
      </div>
    </div>`;
}

/** Grouped list (Shared first) filtered by description/HSN search. */
async function renderItemLibraryList() {
  const listEl = document.getElementById('item-library-list');
  const countEl = document.getElementById('item-library-count');
  if (!listEl) return;
  const searchEl = document.getElementById('item-library-search');
  const needle = searchEl ? searchEl.value.trim().toLowerCase() : '';
  const matchesSearch = (item) => {
    if (!needle) return true;
    const description = (typeof item.description === 'string') ? item.description.toLowerCase() : '';
    if (description.includes(needle)) return true;
    const hsn = (item.hsn === undefined || item.hsn === null) ? '' : String(item.hsn).toLowerCase();
    return hsn.includes(needle);
  };

  const globalItems = catalogItems.filter(i => i && typeof i === 'object' &&
    normalizeCatalogScope(i.scope) === 'global' && matchesSearch(i));
  const companyItems = catalogItems.filter(i => i && typeof i === 'object' &&
    normalizeCatalogScope(i.scope) === 'company' && matchesSearch(i));
  const shown = globalItems.length + companyItems.length;
  const total = catalogItems.length;

  if (countEl) {
    countEl.textContent = shown === total
      ? `${total} item${total === 1 ? '' : 's'}`
      : `${shown} of ${total} items`;
  }

  if (shown === 0) {
    listEl.innerHTML = `<div class="item-library-empty">${needle
      ? 'No saved items match this search.'
      : 'No saved items yet. Save line items from Compose, or add one here.'}</div>`;
    return;
  }

  let html = '';
  if (globalItems.length > 0) {
    html += `<div class="catalog-group-label">Global items</div>` + globalItems.map(itemLibraryRowHTML).join('');
  }
  if (companyItems.length > 0) {
    html += `<div class="catalog-group-label">Company items</div>` + companyItems.map(itemLibraryRowHTML).join('');
  }
  listEl.innerHTML = html;

  // Row bindings are re-attached per render like the other modal lists.
  listEl.querySelectorAll('[data-item-library-edit]').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = catalogItems.find(c => c && c.id === btn.getAttribute('data-item-library-edit'));
      if (item) showItemLibraryForm(item);
    });
  });
  listEl.querySelectorAll('[data-item-library-remove]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await deleteItemLibraryItem(btn.getAttribute('data-item-library-remove'));
    });
  });
}

/** Shows the inline form for Add (null) or Edit (a stored record). */
async function showItemLibraryForm(item = null) {
  const formEl = document.getElementById('item-library-form');
  if (!formEl) return;
  itemLibraryEditing = item && typeof item === 'object' ? item : null;

  const headingEl = document.getElementById('item-library-form-heading');
  const idEl = document.getElementById('item-library-id');
  const descEl = document.getElementById('item-library-description');
  const hsnEl = document.getElementById('item-library-hsn');
  const rateEl = document.getElementById('item-library-rate');
  const taxEl = document.getElementById('item-library-tax');
  const currencyEl = document.getElementById('item-library-currency');
  const scopeEl = document.getElementById('item-library-scope');
  const deleteBtn = document.getElementById('item-library-delete');

  const editing = itemLibraryEditing;
  const scope = normalizeCatalogScope(editing
    ? editing.scope
    : (itemLibraryConfig ? itemLibraryConfig.scope : 'global'));
  const companyId = editing
    ? editing.companyId
    : (scope === 'company' ? catalogActiveCompanyId() : '');

  if (headingEl) headingEl.textContent = editing ? 'Edit library item' : 'Add library item';
  if (idEl) idEl.value = editing ? editing.id : '';
  if (descEl) descEl.value = editing && editing.description ? editing.description : '';
  if (hsnEl) hsnEl.value = editing && editing.hsn ? editing.hsn : '';
  if (rateEl) rateEl.value = editing ? String(Number(editing.rate) || 0) : '0';
  if (taxEl) taxEl.value = editing ? String(Number(editing.taxRate) || 0) : '18';
  if (currencyEl) currencyEl.value = editing
    ? (editing.currency || '')
    : (currentInvoice.meta.currency || '$');
  if (scopeEl) scopeEl.value = scope;
  if (deleteBtn) deleteBtn.hidden = !editing;

  await populateItemLibraryCompanySelect(companyId);
  formEl.hidden = false;
  setItemLibraryStatus('');
  if (descEl) descEl.focus();
}

function hideItemLibraryForm() {
  const formEl = document.getElementById('item-library-form');
  if (formEl) formEl.hidden = true;
  ['item-library-id', 'item-library-description', 'item-library-hsn',
    'item-library-rate', 'item-library-tax', 'item-library-currency'
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const scopeEl = document.getElementById('item-library-scope');
  if (scopeEl) scopeEl.value = 'global';
  const companyEl = document.getElementById('item-library-company');
  if (companyEl) { companyEl.value = ''; companyEl.disabled = false; }
  const hintEl = document.getElementById('item-library-company-hint');
  if (hintEl) hintEl.textContent = '';
  itemLibraryEditing = null;
}

/** Validates, normalizes and persists the inline form; never mutates invoices. */
async function saveItemLibraryForm() {
  const idEl = document.getElementById('item-library-id');
  const descEl = document.getElementById('item-library-description');
  const hsnEl = document.getElementById('item-library-hsn');
  const rateEl = document.getElementById('item-library-rate');
  const taxEl = document.getElementById('item-library-tax');
  const currencyEl = document.getElementById('item-library-currency');
  const scopeEl = document.getElementById('item-library-scope');
  const companyEl = document.getElementById('item-library-company');
  if (!descEl || !scopeEl) return;

  const description = descEl.value.trim();
  if (!description) {
    alert('A description is required for the library item.');
    descEl.focus();
    return;
  }
  const scope = normalizeCatalogScope(scopeEl.value);
  const companyId = (scope === 'company' && companyEl) ? String(companyEl.value || '').trim() : '';
  if (scope === 'company' && !companyId) {
    alert('Choose a company for this item, or switch the scope to Shared.');
    if (companyEl) companyEl.focus();
    return;
  }

  const formId = (idEl && idEl.value) ? String(idEl.value).trim() : '';
  // When editing the same stored record, its counters/createdAt survive the
  // update; saveCatalogItem/normalizeCatalogItem re-stamp the rest.
  const baseline = itemLibraryEditing && formId && itemLibraryEditing.id === formId
    ? itemLibraryEditing
    : null;

  // A blank currency must never reach normalizeCatalogItem (empty currencyKey
  // would make the item unreachable in the currency-filtered picker): fall
  // back to the editing baseline's currency, then the document's currency.
  const docCurrency = (currentInvoice.meta.currency && String(currentInvoice.meta.currency).trim())
    ? String(currentInvoice.meta.currency).trim()
    : '$';
  let formCurrency = currencyEl ? String(currencyEl.value || '').trim() : '';
  if (!formCurrency) {
    formCurrency = (baseline && baseline.currency && String(baseline.currency).trim())
      ? String(baseline.currency).trim()
      : docCurrency;
    if (currencyEl) currencyEl.value = formCurrency;
  }

  const record = Object.assign({}, baseline || {}, {
    id: formId || undefined,
    description,
    hsn: hsnEl ? hsnEl.value.trim() : '',
    rate: rateEl ? rateEl.value : 0,
    taxRate: taxEl ? taxEl.value : 18,
    currency: formCurrency,
    scope,
    companyId: scope === 'company' ? companyId : null
  });

  try {
    const savedRecord = await saveCatalogItem(record);
    upsertCatalogItemInCache(savedRecord);
    updateCatalogSettingsCount();
    // Manager edits change what matches each line item's description/scope:
    // rebuild the bookmark states and the picker rows alongside the list.
    renderLineItemsEditor();
    hideItemLibraryForm();
    await renderItemLibraryList();
    refreshCatalogPicker();
    const scopeLabel = savedRecord.scope === 'company'
      ? (catalogCompanyLabel(savedRecord.companyId) || 'Company')
      : 'Global items';
    setItemLibraryStatus(baseline ? `Updated ${savedRecord.description}` : `Saved to ${scopeLabel}`);
  } catch (e) {
    console.warn('Could not save the library item:', e);
    alert('Could not save this library item. ' + (e && e.message ? e.message : ''));
  }
}

/** Confirm-delete from the manager; documents keep their line items. */
async function deleteItemLibraryItem(id) {
  if (!id) return;
  const item = catalogItems.find(c => c && c.id === id);
  if (!item) return;
  const label = item.description || 'this item';
  if (!confirm(`Delete "${label}" from the item library? Saved documents keep their line items.`)) return;
  try {
    await deleteCatalogItem(id);
    catalogItems = catalogItems.filter(c => c && c.id !== id);
    updateCatalogSettingsCount();
    if (itemLibraryEditing && itemLibraryEditing.id === id) hideItemLibraryForm();
    // Lines that matched the deleted item go back to the unsaved bookmark.
    renderLineItemsEditor();
    await renderItemLibraryList();
    refreshCatalogPicker();
    setItemLibraryStatus(`Deleted ${label}`);
  } catch (e) {
    console.warn('Could not delete the library item:', e);
    alert('Could not delete this library item. ' + (e && e.message ? e.message : ''));
  }
}

/** One-time modal wiring: search, toolbar, form buttons and scope radios. */
function setupItemLibraryModal() {
  const searchEl = document.getElementById('item-library-search');
  if (searchEl) searchEl.addEventListener('input', () => { renderItemLibraryList(); });

  const addBtn = document.getElementById('item-library-add');
  if (addBtn) addBtn.addEventListener('click', () => { showItemLibraryForm(null); });

  const saveBtn = document.getElementById('item-library-save');
  if (saveBtn) saveBtn.addEventListener('click', () => { saveItemLibraryForm(); });

  const cancelBtn = document.getElementById('item-library-cancel');
  if (cancelBtn) cancelBtn.addEventListener('click', () => { hideItemLibraryForm(); });

  const deleteBtn = document.getElementById('item-library-delete');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', async () => {
      if (itemLibraryEditing && itemLibraryEditing.id) {
        await deleteItemLibraryItem(itemLibraryEditing.id);
      }
    });
  }

  // Form scope select only toggles the company field enablement.
  const formScopeSelect = document.getElementById('item-library-scope');
  if (formScopeSelect) {
    formScopeSelect.addEventListener('change', () => {
      const companyEl = document.getElementById('item-library-company');
      // >1 option means real company options exist (the empty-library state
      // renders a single placeholder option and keeps Global usable).
      const hasCompanies = Boolean(companyEl) && companyEl.options.length > 1;
      updateCatalogFormCompanyState(hasCompanies);
    });
  }

  // Radios set the default save scope for new items (persisted immediately).
  document.querySelectorAll('input[name="item-library-scope"]').forEach(radio => {
    radio.addEventListener('change', async () => {
      if (!radio.checked) return;
      const scope = normalizeCatalogScope(radio.value);
      try {
        itemLibraryConfig = await saveItemLibraryConfig({ scope });
      } catch (e) {
        console.warn('Could not persist the item library scope:', e);
        itemLibraryConfig.scope = scope;
      }
      renderItemLibraryScopeRadios();
      // Saved-state badges depend on the configured scope: rebuild them.
      renderLineItemsEditor();
      updateCatalogScopeHint();
      refreshCatalogPicker();
    });
  });
}

function renderTaxesEditor() {
  const container = document.getElementById('taxes-editor-container');
  if (!container) return;
  if (!currentInvoice.taxes || currentInvoice.taxes.length === 0) {
    container.innerHTML = `
      <div style="font-size:12px; color:#94a3b8; padding:10px; text-align:center; background:#f8fafc; border-radius:6px; border:1px dashed #cbd5e1;">
        No tax split legs defined. (100% of tax will be reported as standard tax, or 0% if exempt).
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div style="display:grid; grid-template-columns: 1fr 100px 32px; gap:8px; margin-bottom:6px; font-size:11px; font-weight:600; color:#64748b;">
      <div>Tax Leg Name</div>
      <div style="text-align:right;">Split Share %</div>
      <div></div>
    </div>
  ` + currentInvoice.taxes.map((tax, index) => {
    const ratioVal = clampNum(tax.ratio !== undefined ? tax.ratio : tax.rate, 0, 100, 50);
    return `
      <div class="tax-row" data-index="${index}" style="display:grid; grid-template-columns: 1fr 100px 32px; gap:8px; align-items:center; margin-bottom:8px;">
        <input type="text" class="form-input tax-name-input" value="${appEscapeHtml(tax.name)}" placeholder="Tax Leg (e.g. CGST, SGST, VAT)">
        <div style="display:flex; align-items:center; gap:4px;">
          <input type="number" class="form-input tax-ratio-input" value="${ratioVal}" min="0" max="100" step="any" placeholder="Share %" style="text-align:right; padding:6px 8px;">
          <span style="font-size:12px; font-weight:600; color:#64748b;">%</span>
        </div>
        <button class="btn btn-danger btn-sm btn-icon btn-delete-tax" title="Remove tax leg">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.tax-row').forEach(row => {
    const idx = parseInt(row.dataset.index, 10);
    row.querySelector('.tax-name-input').addEventListener('input', (e) => {
      currentInvoice.taxes[idx].name = e.target.value;
      updateSheetView();
      triggerAutoSave();
    });
    row.querySelector('.tax-ratio-input').addEventListener('input', (e) => {
      currentInvoice.taxes[idx].ratio = clampNum(e.target.value, 0, 100, 0);
      updateSheetView();
      triggerAutoSave();
    });
    row.querySelector('.btn-delete-tax').addEventListener('click', () => {
      currentInvoice.taxes.splice(idx, 1);
      renderTaxesEditor();
      updateSheetView();
      triggerAutoSave();
    });
  });
}

function updateSenderTaxHint() {
  const hintBox = document.getElementById('sender-tax-hint-box');
  if (!hintBox) return;
  const taxIdVal = (currentInvoice.sender.taxId || '').trim();
  const hasTaxOnItems = currentInvoice.items.some(i => (parseFloat(i.taxRate) || 0) > 0);

  if (!taxIdVal) {
    if (hasTaxOnItems) {
      hintBox.innerHTML = `
        <div style="font-size:11px; color:#b45309; background:#fffbeb; padding:6px 10px; border-radius:6px; border:1px solid #fef3c7; display:flex; align-items:center; justify-content:space-between; gap:8px;">
          <span>ℹ️ No Tax ID specified. Not tax-registered?</span>
          <button type="button" class="btn btn-secondary btn-sm" id="btn-quick-zero-tax" style="padding:2px 8px; font-size:10.5px; white-space:nowrap;">
            Set 0% Tax (No Tax)
          </button>
        </div>
      `;
      const btn = document.getElementById('btn-quick-zero-tax');
      if (btn) {
        btn.addEventListener('click', () => {
          currentInvoice.items.forEach(item => { item.taxRate = 0; });
          currentInvoice.taxes = [];
          renderLineItemsEditor();
          renderTaxesEditor();
          updateSheetView();
          updateSenderTaxHint();
          triggerAutoSave();
        });
      }
    } else {
      hintBox.innerHTML = `
        <span style="font-size:10.5px; color:#64748b;">
          Unregistered / tax-exempt business: tax row and badges are omitted from invoice.
        </span>
      `;
    }
  } else {
    const formatted = formatTaxId(taxIdVal);
    hintBox.innerHTML = `
      <div style="font-size:10.5px; color:#0369a1; display:flex; align-items:center; justify-content:space-between; gap:6px;">
        <span>Registered: <strong>${appEscapeHtml(formatted)}</strong></span>
        ${!hasTaxOnItems ? `
          <button type="button" class="btn btn-secondary btn-sm" id="btn-quick-standard-tax" style="padding:1px 6px; font-size:10.5px;">
            Apply 18% GST
          </button>
        ` : ''}
      </div>
    `;
    const btnStd = document.getElementById('btn-quick-standard-tax');
    if (btnStd) {
      btnStd.addEventListener('click', () => {
        currentInvoice.items.forEach(item => { item.taxRate = 18; });
        currentInvoice.taxes = [
          { id: 'tax_1', name: 'CGST', ratio: 50 },
          { id: 'tax_2', name: 'SGST', ratio: 50 }
        ];
        renderLineItemsEditor();
        renderTaxesEditor();
        updateSheetView();
        updateSenderTaxHint();
        triggerAutoSave();
      });
    }
  }
}

// ============================================================================
// 7. TAX CALCULATOR & SHEET UPDATE ENGINE
// ============================================================================
function updateSheetView() {
  normalizeInvoice(currentInvoice);
  const currency = currentInvoice.meta.currency || '$';
  const numberFormat = currentInvoice.meta.numberFormat || 'international';
  const docType = currentInvoice.meta.docType || 'invoice';
  const cfg = APP_DOC_TYPES[docType] || APP_DOC_TYPES.invoice;

  // 1. Update Sheet Metadata & Dynamic Labels
  document.getElementById('sheet-inv-title').textContent = currentInvoice.meta.title || cfg.title;
  const numLabel = document.getElementById('sheet-num-label');
  if (numLabel) numLabel.textContent = cfg.numLabel;
  document.getElementById('sheet-inv-num').textContent = currentInvoice.meta.number || '';
  
  const dateLabel = document.getElementById('sheet-date-label');
  if (dateLabel) dateLabel.textContent = 'Date:';
  document.getElementById('sheet-inv-date').textContent = currentInvoice.meta.date || '';

  const dueLabel = document.getElementById('sheet-due-label');
  if (dueLabel) dueLabel.textContent = cfg.dueLabel;
  document.getElementById('sheet-inv-due').textContent = currentInvoice.meta.dueDate || '';

  const poVal = currentInvoice.meta.po || '';
  const poLabel = document.getElementById('sheet-po-label');
  const poDisplay = document.getElementById('sheet-po-val');
  if (poVal.trim()) {
    poLabel.style.display = 'inline';
    poDisplay.style.display = 'inline';
    poDisplay.textContent = poVal;
  } else {
    poLabel.style.display = 'none';
    poDisplay.style.display = 'none';
  }

  // Status Badge with dynamic classes and label
  const statusBadge = document.getElementById('sheet-status-badge');
  statusBadge.className = 'sheet-invoice-badge';
  const currentStatus = currentInvoice.meta.status || cfg.defaultStatus;
  const statusObj = cfg.statuses.find(s => s.id === currentStatus);
  const statusText = statusObj ? statusObj.label.toUpperCase() : currentStatus.toUpperCase();

  const statusClassMap = {
    paid: 'badge-paid',
    pending: 'badge-pending',
    draft: 'badge-draft',
    sent: 'badge-sent',
    accepted: 'badge-accepted',
    declined: 'badge-declined',
    expired: 'badge-expired'
  };
  statusBadge.classList.add(statusClassMap[currentStatus] || 'badge-pending');
  statusBadge.textContent = statusText;

  // 2. Sender and Client Headings & Info
  const fromHeading = document.getElementById('sheet-from-heading');
  const toHeading = document.getElementById('sheet-to-heading');
  if (fromHeading) fromHeading.textContent = cfg.fromLabel;
  if (toHeading) toHeading.textContent = cfg.toLabel;

  document.getElementById('sheet-sender-name').textContent = currentInvoice.sender.name || 'Your Company';
  const senderMetaParts = [];
  if (currentInvoice.sender.email || currentInvoice.sender.phone) {
    senderMetaParts.push([currentInvoice.sender.email, currentInvoice.sender.phone].filter(Boolean).join(' | '));
  }
  if (currentInvoice.sender.address) senderMetaParts.push(currentInvoice.sender.address);
  if (currentInvoice.sender.taxId && currentInvoice.sender.taxId.trim()) {
    senderMetaParts.push(formatTaxId(currentInvoice.sender.taxId, 'Tax ID'));
  }
  const senderMetaEl = document.getElementById('sheet-sender-meta');
  if (senderMetaParts.length > 0) {
    senderMetaEl.textContent = senderMetaParts.join('\n');
    senderMetaEl.style.display = 'block';
  } else {
    senderMetaEl.textContent = '';
    senderMetaEl.style.display = 'none';
  }

  document.getElementById('sheet-client-name').textContent = currentInvoice.client.name || 'Client Name';
  const clientMetaParts = [];
  if (currentInvoice.client.email || currentInvoice.client.phone) {
    clientMetaParts.push([currentInvoice.client.email, currentInvoice.client.phone].filter(Boolean).join(' | '));
  }
  if (currentInvoice.client.address) clientMetaParts.push(currentInvoice.client.address);
  if (currentInvoice.client.taxId && currentInvoice.client.taxId.trim()) {
    clientMetaParts.push(formatTaxId(currentInvoice.client.taxId, 'Tax/VAT ID'));
  }
  const clientMetaEl = document.getElementById('sheet-client-meta');
  if (clientMetaParts.length > 0) {
    clientMetaEl.textContent = clientMetaParts.join('\n');
    clientMetaEl.style.display = 'block';
  } else {
    clientMetaEl.textContent = '';
    clientMetaEl.style.display = 'none';
  }

  // Headings for Remittance / Payment & Notes
  const paymentHeading = document.getElementById('sheet-payment-heading');
  const notesHeading = document.getElementById('sheet-notes-heading');
  if (paymentHeading) paymentHeading.textContent = cfg.paymentHeading;
  if (notesHeading) notesHeading.textContent = cfg.notesHeading;

  // Subtotal & Total Labels
  const subtotalLabel = document.getElementById('sheet-subtotal-label');
  const totalLabel = document.getElementById('sheet-total-label');
  if (subtotalLabel) subtotalLabel.textContent = cfg.subtotalLabel;
  if (totalLabel) totalLabel.textContent = cfg.totalLabel;

  // 3. Line Items Calculations & Table Rendering (one shared calculation)
  const totals = calculateTotals(currentInvoice);
  const subtotal = totals.subtotal;
  const totalTaxSum = totals.taxTotal;
  const rateBreakdown = totals.rateBreakdown || [];

  const tbody = document.getElementById('sheet-items-tbody');
  tbody.innerHTML = (totals.lines || []).map(line => {
    const qty = line.qty;
    const rate = line.rate;
    const discountPct = line.discount;
    const taxableLine = line.taxable;
    const taxRate = line.taxRate;

    const isUnregistered = !currentInvoice.sender.taxId || !currentInvoice.sender.taxId.trim();
    const discDisplay = discountPct > 0 ? `${discountPct}%` : '—';
    const taxDisplay = taxRate > 0
      ? `<span class="item-tax-badge">${taxRate}%</span>`
      : (isUnregistered
          ? `<span style="color:#94a3b8;">—</span>`
          : `<span class="item-tax-badge" style="background:#f1f5f9; color:#94a3b8;">0% Exempt</span>`);

    const hsnMarkup = line.hsn && line.hsn.trim()
      ? `<div class="item-hsn-tag">HSN/SAC: ${appEscapeHtml(line.hsn.trim())}</div>`
      : '';

    return `
      <tr>
        <td>
          <div class="item-desc-bold">${appEscapeHtml(line.description || 'Item Description')}</div>
          ${hsnMarkup}
        </td>
        <td class="text-center">${qty}</td>
        <td class="text-right">${formatMoney(rate, currency, numberFormat)}</td>
        <td class="text-right">${discDisplay}</td>
        <td class="text-right">${taxDisplay}</td>
        <td class="text-right font-semibold">${formatMoney(taxableLine, currency, numberFormat)}</td>
      </tr>
    `;
  }).join('');

  document.getElementById('sheet-subtotal-val').textContent = formatMoney(subtotal, currency, numberFormat);

  // 4. Multi-Leg Taxes Calculation & Split
  const taxesListContainer = document.getElementById('sheet-taxes-list');
  const activeTaxLegs = currentInvoice.taxes || [];

  if (activeTaxLegs.length === 0 || totalTaxSum === 0) {
    if (totalTaxSum === 0 && subtotal > 0 && currentInvoice.sender.taxId && currentInvoice.sender.taxId.trim()) {
      taxesListContainer.innerHTML = `
        <div class="totals-row tax-leg">
          <span>Taxes</span>
          <span>${formatMoney(0, currency, numberFormat)} (0% Exempt)</span>
        </div>
      `;
    } else {
      taxesListContainer.innerHTML = '';
    }
  } else {
    const renderedTaxLegs = (totals.taxLegs || []).map(leg => {
      const legRatio = clampNum(leg.ratio, 0, 100, 0);
      return `
        <div class="totals-row tax-leg">
          <span>${appEscapeHtml(leg.name || 'Tax')} <span class="tax-tag">${legRatio}% split</span></span>
          <span>${formatMoney(leg.amount, currency, numberFormat)}</span>
        </div>
      `;
    });

    // Multi-rate summary banner if there are multiple rates
    const distinctRates = rateBreakdown
      .map(entry => Number(entry.rate))
      .sort((a, b) => b - a);
    let multiRateSummaryHtml = '';
    if (distinctRates.length > 1) {
      const breakdownText = distinctRates.map(rate => {
        const data = rateBreakdown.find(entry => Number(entry.rate) === rate) || { taxable: 0, tax: 0 };
        return `${rate}% on ${formatMoney(data.taxable, currency, numberFormat)}: ${formatMoney(data.tax, currency, numberFormat)}`;
      }).join(' • ');
      multiRateSummaryHtml = `
        <div style="font-size:10.5px; color:#64748b; padding:4px 0; border-bottom:1px dashed #e2e8f0; margin-bottom:4px; text-align:right;">
          Rate Breakdown: ${breakdownText}
        </div>
      `;
    }

    taxesListContainer.innerHTML = multiRateSummaryHtml + renderedTaxLegs.join('');
  }

  // 5. Total Due
  const grandTotal = totals.total;
  document.getElementById('sheet-total-val').textContent = formatMoney(grandTotal, currency, numberFormat);

  // Optional Amount in Words Block
  const wordsContainer = document.getElementById('sheet-words-container');
  const wordsVal = document.getElementById('sheet-words-val');
  if (wordsContainer && wordsVal) {
    if (currentInvoice.meta.showAmountInWords && grandTotal > 0) {
      wordsVal.textContent = amountToWords(grandTotal, currency, numberFormat);
      wordsContainer.style.display = 'block';
    } else {
      wordsContainer.style.display = 'none';
      wordsVal.textContent = '';
    }
  }

  // 6. Payment Info & Notes (Gracefully omit when not provided)
  const paymentContainer = document.getElementById('sheet-payment-container');
  const paymentBox = document.getElementById('sheet-payment-box');
  const notesContainer = document.getElementById('sheet-notes-container');
  const notesBox = document.getElementById('sheet-notes-box');
  const bottomSection = document.querySelector('.sheet-bottom-section');
  const paymentNotesArea = document.getElementById('sheet-payment-notes-area');

  const hasPayment = Boolean(currentInvoice.payment && currentInvoice.payment.trim());
  const hasNotes = Boolean(currentInvoice.notes && currentInvoice.notes.trim());
  const hasSignature = Boolean(docType !== 'invoice' && currentInvoice.meta.showSignature);

  if (paymentContainer && paymentBox) {
    if (hasPayment) {
      paymentBox.textContent = currentInvoice.payment.trim();
      paymentContainer.style.display = 'block';
    } else {
      paymentBox.textContent = '';
      paymentContainer.style.display = 'none';
    }
  }

  if (notesContainer && notesBox) {
    if (hasNotes) {
      notesBox.textContent = currentInvoice.notes.trim();
      notesContainer.style.display = 'block';
    } else {
      notesBox.textContent = '';
      notesContainer.style.display = 'none';
    }
  }

  if (paymentNotesArea && bottomSection) {
    const hasAnyLeft = hasPayment || hasNotes || hasSignature;
    if (hasAnyLeft) {
      paymentNotesArea.style.display = 'flex';
      bottomSection.classList.remove('no-notes-payment');
    } else {
      paymentNotesArea.style.display = 'none';
      bottomSection.classList.add('no-notes-payment');
    }
  }

  // 7. Client Acceptance Signature Block (Quotes & Estimates)
  const sigBlock = document.getElementById('sheet-signature-block');
  if (sigBlock) {
    sigBlock.style.display = (docType !== 'invoice' && currentInvoice.meta.showSignature) ? 'block' : 'none';
    const sigHeading = document.getElementById('sheet-sig-heading');
    if (sigHeading) {
      sigHeading.textContent = `${cfg.name} Acceptance & Approval`;
    }
  }

  // 8. Convert to Invoice Button Visibility
  const convertBtn = document.getElementById('btn-convert-quote');
  if (convertBtn) {
    convertBtn.style.display = (docType === 'quotation' || docType === 'estimate' || docType === 'proforma') ? 'inline-flex' : 'none';
  }

  updateLogoDisplay();
  updateDocumentPaginationLive();
}

function updateLogoDisplay() {
  const container = document.getElementById('sheet-logo-wrapper');
  const thumb = document.getElementById('logo-preview-thumb');
  const removeBtn = document.getElementById('btn-remove-logo');
  const headerBlock = document.getElementById('sheet-header-block');
  const logo = currentInvoice.logo;

  // Header placement class
  const layout = logo.layout || 'left';
  headerBlock.classList.remove('header-layout-left', 'header-layout-center', 'header-layout-right');
  headerBlock.classList.add(`header-layout-${layout}`);

  if (logo && logo.dataUri) {
    // Validate stored logo URI (protects against crafted backup imports injecting HTML/JS).
    if (!isValidLogoDataUri(logo.dataUri)) {
      logo.dataUri = null;
      updateLogoDisplay();
      return;
    }
    const width = clampNum(logo.width, 60, 450, 180);
    container.textContent = '';
    const img = document.createElement('img');
    img.src = logo.dataUri;
    img.className = 'sheet-logo-img';
    img.alt = 'Logo';
    img.style.width = width + 'px';
    img.style.maxWidth = width + 'px';
    container.appendChild(img);
    thumb.textContent = '';
    const thumbImg = document.createElement('img');
    thumbImg.src = logo.dataUri;
    thumbImg.alt = 'Logo Preview';
    thumb.appendChild(thumbImg);
    removeBtn.style.display = 'inline-flex';
  } else {
    // If no logo, show company text header
    container.innerHTML = `
      <div>
        <div class="sheet-company-title">${appEscapeHtml(currentInvoice.sender.name || 'Company Name')}</div>
        <div class="sheet-company-meta">${appEscapeHtml(currentInvoice.sender.address || '')}</div>
      </div>
    `;
    thumb.innerHTML = `<span style="font-size:11px; color:#94a3b8;">No Logo</span>`;
    removeBtn.style.display = 'none';
  }

  // Logo Alignment inside its container
  const align = logo.align || 'left';
  if (align === 'center') {
    container.style.justifyContent = 'center';
  } else if (align === 'right') {
    container.style.justifyContent = 'flex-end';
  } else {
    container.style.justifyContent = 'flex-start';
  }
}

// ============================================================================
// 8. LOGO & BRAND LOCKUP STUDIO IMPLEMENTATION
// ============================================================================
let activeSelectedIconId = 'terminal';

function setupLogoStudioTabs() {
  const tabs = document.querySelectorAll('.modal-tab-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const targetPane = document.getElementById(tab.dataset.tab);
      if (targetPane) targetPane.classList.add('active');
    });
  });

  // TAB 1: File Upload
  const dropzone = document.getElementById('dropzone-logo');
  const fileInput = document.getElementById('file-logo-input');
  dropzone.addEventListener('click', () => fileInput.click());

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = '#2563eb';
    dropzone.style.background = '#eff6ff';
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.style.borderColor = '#cbd5e1';
    dropzone.style.background = '#f8fafc';
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = '#cbd5e1';
    dropzone.style.background = '#f8fafc';
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleImageUpload(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleImageUpload(e.target.files[0]);
    }
    e.target.value = '';
  });

  const ALLOWED_LOGO_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
  let stagedUploadedUri = null;
  function handleImageUpload(file) {
    if (!file || !file.type || !file.type.startsWith('image/') || !ALLOWED_LOGO_MIME.includes(file.type)) {
      alert('Please upload a valid image file (.jpg, .png, .webp, .svg)');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert('Logo file is too large. Maximum allowed size is 10MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      if (file.type === 'image/svg+xml') {
        // Reject SVG payloads containing scripts / event handlers / foreign objects.
        const svgText = String(event.target.result || '');
        let decoded = '';
        try {
          const base64Part = svgText.split(',')[1] || '';
          decoded = atob(base64Part.slice(0, 20000));
        } catch (e) { decoded = svgText.slice(0, 20000); }
        if (/<script|onload\s*=|onerror\s*=|onclick\s*=|<foreignobject/i.test(svgText) || /<script|onload\s*=|onerror\s*=|<foreignobject/i.test(decoded)) {
          alert('This SVG contains scripts or active content and was rejected for security. Please use a raster logo or a clean vector SVG.');
          return;
        }
        stagedUploadedUri = event.target.result;
        showUploadedPreview(stagedUploadedUri);
      } else {
        const img = new Image();
        img.onload = () => {
          const maxDim = 800;
          let w = img.width;
          let h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          stagedUploadedUri = canvas.toDataURL('image/png', 0.92);
          showUploadedPreview(stagedUploadedUri);
        };
        img.onerror = () => {
          alert('Could not read this image file. Please try a different JPG/PNG/WebP file.');
        };
        img.src = event.target.result;
      }
    };
    reader.onerror = () => {
      alert('Could not read this file. Please try again.');
    };
    reader.readAsDataURL(file);
  }

  function showUploadedPreview(uri) {
    document.getElementById('upload-preview-area').style.display = 'block';
    document.getElementById('upload-preview-img').src = uri;
  }

  document.getElementById('btn-apply-uploaded-logo').addEventListener('click', () => {
    if (stagedUploadedUri) {
      currentInvoice.logo.dataUri = stagedUploadedUri;
      updateLogoDisplay();
      triggerAutoSave();
      closeModal('modal-logo-studio');
    }
  });

  // TAB 2: Monogram & Brand Lockup Generator
  const initialsInput = document.getElementById('monogram-initials');
  const shapeSelect = document.getElementById('monogram-shape');
  const styleSelect = document.getElementById('monogram-style');
  const wordmarkInput = document.getElementById('monogram-wordmark');
  const taglineInput = document.getElementById('monogram-tagline');
  const underlineSelect = document.getElementById('monogram-underline');
  const underlineSpanSelect = document.getElementById('monogram-underline-span');
  const underlinePosSelect = document.getElementById('monogram-underline-pos');
  const underlineSlider = document.getElementById('monogram-underline-slider');
  const underlineValLabel = document.getElementById('monogram-underline-val');
  const layoutSelect = document.getElementById('monogram-layout');
  const bgInput = document.getElementById('monogram-bg-color');
  const textInput = document.getElementById('monogram-text-color');
  const wordmarkColorInput = document.getElementById('monogram-wordmark-color');
  const monoPreview = document.getElementById('monogram-preview-img');

  function updateMonogramLockupLive() {
    const customLineW = underlineSlider ? parseInt(underlineSlider.value, 10) : 0;
    if (underlineValLabel) {
      underlineValLabel.textContent = customLineW > 0 ? `${customLineW}px` : 'Auto (Fit Text)';
    }

    const uri = generateBrandLockupSVG({
      symbolType: 'monogram',
      initials: initialsInput ? initialsInput.value || 'AD' : 'AD',
      shape: shapeSelect ? shapeSelect.value : 'squircle',
      emblemStyle: styleSelect ? styleSelect.value : 'solid',
      markColor: textInput ? textInput.value || '#ffffff' : '#ffffff',
      bgColor: bgInput ? bgInput.value || '#2563eb' : '#2563eb',
      companyName: wordmarkInput ? wordmarkInput.value || currentInvoice.sender.name || 'Apex Studio' : 'Apex Studio',
      tagline: taglineInput ? taglineInput.value : '',
      underlineStyle: underlineSelect ? underlineSelect.value : 'solid',
      underlineSpan: underlineSpanSelect ? underlineSpanSelect.value : 'auto',
      underlineWidth: customLineW,
      underlinePosition: underlinePosSelect ? underlinePosSelect.value : 'bottom',
      layout: layoutSelect ? layoutSelect.value : 'horizontal',
      textColor: wordmarkColorInput ? wordmarkColorInput.value || '#0f172a' : '#0f172a',
      accentColor: currentInvoice.accentColor || '#2563eb'
    });
    if (monoPreview) monoPreview.src = uri;
    return uri;
  }

  if (underlineSpanSelect) {
    underlineSpanSelect.addEventListener('change', () => {
      if (underlineSlider) underlineSlider.value = 0;
      updateMonogramLockupLive();
    });
  }

  if (underlineSlider) {
    underlineSlider.addEventListener('input', () => {
      updateMonogramLockupLive();
    });
  }

  [initialsInput, shapeSelect, styleSelect, wordmarkInput, taglineInput, underlineSelect, underlinePosSelect, layoutSelect, bgInput, textInput, wordmarkColorInput].forEach(elem => {
    if (elem) elem.addEventListener(elem.tagName === 'SELECT' ? 'change' : 'input', updateMonogramLockupLive);
  });
  updateMonogramLockupLive();

  document.getElementById('btn-apply-monogram').addEventListener('click', () => {
    const uri = updateMonogramLockupLive();
    currentInvoice.logo.dataUri = uri;
    updateLogoDisplay();
    triggerAutoSave();
    closeModal('modal-logo-studio');
  });

  // TAB 3: Icon Lockup Event Listeners
  const iconWordmark = document.getElementById('icon-wordmark');
  const iconTagline = document.getElementById('icon-tagline');
  const iconUnderline = document.getElementById('icon-underline');
  const iconUnderlineSpan = document.getElementById('icon-underline-span');
  const iconUnderlinePos = document.getElementById('icon-underline-pos');
  const iconUnderlineSlider = document.getElementById('icon-underline-slider');
  const iconShape = document.getElementById('icon-shape');

  if (iconUnderlineSpan) {
    iconUnderlineSpan.addEventListener('change', () => {
      if (iconUnderlineSlider) iconUnderlineSlider.value = 0;
      updateIconLockupLive();
    });
  }

  if (iconUnderlineSlider) {
    iconUnderlineSlider.addEventListener('input', () => {
      updateIconLockupLive();
    });
  }

  [iconWordmark, iconTagline, iconUnderline, iconUnderlineSpan, iconUnderlinePos, iconShape].forEach(el => {
    if (el) el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', updateIconLockupLive);
  });

  document.getElementById('btn-apply-selected-icon').addEventListener('click', () => {
    const uri = updateIconLockupLive();
    currentInvoice.logo.dataUri = uri;
    updateLogoDisplay();
    triggerAutoSave();
    closeModal('modal-logo-studio');
  });

  // TAB 4: AI Prompt Generator & Free 1-Click Generator
  const aiCompanyName = document.getElementById('ai-company-name');
  const aiIndustry = document.getElementById('ai-industry');
  const aiStyle = document.getElementById('ai-style-select');
  const aiColor = document.getElementById('ai-color-preference');
  const aiPromptOutput = document.getElementById('ai-prompt-output');

  function updateAIPrompt() {
    const name = aiCompanyName.value.trim() || 'My Business';
    const ind = aiIndustry.value.trim() || 'Professional Services';
    const style = aiStyle.value;
    const color = aiColor.value.trim() || 'accent color';

    const promptText = `Professional vector brand logo for "${name}", industry: ${ind}, style: ${style}, color palette: ${color}, isolated on clean solid white background, high aesthetic, SVG flat icon badge, minimalist, no photorealism, no 3d mockup, vector symbol`;
    aiPromptOutput.textContent = promptText;
  }

  aiCompanyName.addEventListener('input', updateAIPrompt);
  aiIndustry.addEventListener('input', updateAIPrompt);
  aiStyle.addEventListener('change', updateAIPrompt);
  aiColor.addEventListener('input', updateAIPrompt);
  updateAIPrompt();

  // Copy AI Prompt (with file:// + non-secure fallback)
  document.getElementById('btn-copy-ai-prompt').addEventListener('click', async () => {
    const btn = document.getElementById('btn-copy-ai-prompt');
    const text = aiPromptOutput.textContent;
    let copied = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        copied = true;
      } else {
        throw new Error('clipboard unavailable');
      }
    } catch (e) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        copied = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch (e2) { copied = false; }
    }
    btn.textContent = copied ? 'Copied!' : 'Copy failed — select manually';
    setTimeout(() => { btn.textContent = 'Copy Prompt'; }, 2000);
  });

  // Free 1-Click AI Generation via Pollinations.ai
  let stagedAILogoUri = null;
  document.getElementById('btn-generate-ai-logo').addEventListener('click', () => {
    const prompt = aiPromptOutput.textContent;
    const statusText = document.getElementById('ai-status-text');
    const aiImg = document.getElementById('ai-generated-img');
    const applyBtn = document.getElementById('btn-apply-ai-logo');

    statusText.style.display = 'block';
    statusText.textContent = 'Generating AI logo... (takes 3-5 seconds)';
    aiImg.style.display = 'none';
    applyBtn.style.display = 'none';

    const seed = Math.floor(Math.random() * 999999);
    const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=400&height=400&nologo=true&seed=${seed}`;

    const testImg = new Image();
    testImg.crossOrigin = 'anonymous';
    testImg.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 400;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(testImg, 0, 0, 400, 400);
      try {
        stagedAILogoUri = canvas.toDataURL('image/png');
        aiImg.src = stagedAILogoUri;
        aiImg.style.display = 'block';
        statusText.style.display = 'none';
        applyBtn.style.display = 'block';
      } catch (err) {
        console.warn('CORS or canvas error — remote AI logo not applied to keep offline/print reliable:', err);
        statusText.textContent = 'Could not embed the AI image (CORS blocked). Please retry, or copy the prompt above into ChatGPT/Midjourney and upload the result via the Upload tab.';
        stagedAILogoUri = null;
        aiImg.style.display = 'none';
        applyBtn.style.display = 'none';
      }
    };
    testImg.onerror = () => {
      statusText.textContent = 'Free AI service busy. You can copy the optimized prompt above and generate via ChatGPT or Midjourney!';
    };
    testImg.src = pollinationsUrl;
  });

  document.getElementById('btn-apply-ai-logo').addEventListener('click', () => {
    if (stagedAILogoUri && isValidLogoDataUri(stagedAILogoUri)) {
      currentInvoice.logo.dataUri = stagedAILogoUri;
      updateLogoDisplay();
      triggerAutoSave();
      closeModal('modal-logo-studio');
    } else if (stagedAILogoUri) {
      alert('AI logo is not embedded yet (remote URL). Please wait for generation to finish or upload the image file instead.');
    }
  });
}

function updateIconLockupLive() {
  const iconWordmark = document.getElementById('icon-wordmark');
  const iconTagline = document.getElementById('icon-tagline');
  const iconUnderline = document.getElementById('icon-underline');
  const iconUnderlineSpan = document.getElementById('icon-underline-span');
  const iconUnderlinePos = document.getElementById('icon-underline-pos');
  const iconUnderlineSlider = document.getElementById('icon-underline-slider');
  const iconUnderlineValLabel = document.getElementById('icon-underline-val');
  const iconShape = document.getElementById('icon-shape');
  const iconPreview = document.getElementById('icon-preview-img');

  const shapeVal = iconShape ? iconShape.value : 'none';
  const customLineW = iconUnderlineSlider ? parseInt(iconUnderlineSlider.value, 10) : 0;
  if (iconUnderlineValLabel) {
    iconUnderlineValLabel.textContent = customLineW > 0 ? `${customLineW}px` : 'Auto (Fit Text)';
  }

  const uri = generateBrandLockupSVG({
    symbolType: 'icon',
    iconId: activeSelectedIconId || 'terminal',
    shape: shapeVal,
    markColor: currentInvoice.accentColor || '#2563eb',
    bgColor: shapeVal !== 'none' ? '#eff6ff' : 'transparent',
    companyName: (iconWordmark && iconWordmark.value) ? iconWordmark.value : currentInvoice.sender.name || 'Apex Studio',
    tagline: iconTagline ? iconTagline.value : '',
    underlineStyle: iconUnderline ? iconUnderline.value : 'solid',
    underlineSpan: iconUnderlineSpan ? iconUnderlineSpan.value : 'auto',
    underlineWidth: customLineW,
    underlinePosition: iconUnderlinePos ? iconUnderlinePos.value : 'bottom',
    layout: 'horizontal',
    textColor: '#0f172a',
    accentColor: currentInvoice.accentColor || '#2563eb'
  });
  if (iconPreview) iconPreview.src = uri;
  return uri;
}

function renderIconsLibrary() {
  const chipsContainer = document.getElementById('icons-category-chips');
  const gridContainer = document.getElementById('icons-grid-picker');
  const selectedLabel = document.getElementById('selected-icon-label');

  let activeCategory = 'all';

  // Render Category Chips
  chipsContainer.innerHTML = `
    <button class="category-chip active" data-cat="all">All Icons (40+)</button>
    ${ICON_CATEGORIES.map(c => `
      <button class="category-chip" data-cat="${c.id}">${c.label}</button>
    `).join('')}
  `;

  function renderGrid() {
    const filtered = activeCategory === 'all' 
      ? ICONS 
      : ICONS.filter(i => i.category === activeCategory);

    gridContainer.innerHTML = filtered.map(icon => `
      <div class="icon-pick-card ${activeSelectedIconId === icon.id ? 'active' : ''}" data-id="${icon.id}" title="${icon.name}">
        ${icon.svg}
        <span style="font-size:10px; color:#64748b; margin-top:4px; text-align:center; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:100%;">${icon.name}</span>
      </div>
    `).join('');

    gridContainer.querySelectorAll('.icon-pick-card').forEach(card => {
      card.addEventListener('click', () => {
        gridContainer.querySelectorAll('.icon-pick-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        activeSelectedIconId = card.dataset.id;
        const iconObj = ICONS.find(i => i.id === activeSelectedIconId);
        selectedLabel.textContent = `Selected: ${iconObj.name}`;
        updateIconLockupLive();
      });
    });
  }

  chipsContainer.querySelectorAll('.category-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      chipsContainer.querySelectorAll('.category-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      activeCategory = chip.dataset.cat;
      renderGrid();
    });
  });

  renderGrid();
  updateIconLockupLive();
}

// ============================================================================
// 9. EVENT LISTENERS ATTACHMENT
// ============================================================================
function attachFormListeners() {
  // Font Selector
  document.getElementById('font-select').addEventListener('change', (e) => {
    currentInvoice.font = e.target.value;
    document.documentElement.style.setProperty('--invoice-font', currentInvoice.font);
    triggerAutoSave();
  });

  // Accent Color Picker
  document.getElementById('accent-color-picker').addEventListener('input', (e) => {
    currentInvoice.accentColor = e.target.value;
    document.getElementById('accent-color-hex').textContent = e.target.value;
    document.documentElement.style.setProperty('--accent-color', e.target.value);
    triggerAutoSave();
  });

  // Logo Size Slider
  document.getElementById('logo-width-slider').addEventListener('input', (e) => {
    currentInvoice.logo.width = parseInt(e.target.value, 10);
    document.getElementById('logo-width-val').textContent = e.target.value + 'px';
    updateLogoDisplay();
    triggerAutoSave();
  });

  // Logo Alignments inside container
  ['left', 'center', 'right'].forEach(align => {
    const btn = document.getElementById(`btn-logo-${align}`);
    if (btn) {
      btn.addEventListener('click', () => {
        currentInvoice.logo.align = align;
        updateLogoAlignmentButtons(align);
        updateLogoDisplay();
        triggerAutoSave();
      });
    }
  });

  // Header Placement Variations (Left Logo, Centered Brand, Right Logo)
  ['left', 'center', 'right'].forEach(layout => {
    const btn = document.getElementById(`btn-layout-${layout}`);
    if (btn) {
      btn.addEventListener('click', () => {
        currentInvoice.logo.layout = layout;
        updateHeaderLayoutButtons(layout);
        updateLogoDisplay();
        triggerAutoSave();
      });
    }
  });

  // Remove Logo
  document.getElementById('btn-remove-logo').addEventListener('click', () => {
    currentInvoice.logo.dataUri = null;
    updateLogoDisplay();
    triggerAutoSave();
  });

  // Section 1 Document Type Selection Cards
  document.querySelectorAll('#doc-type-cards-grid .doc-type-card').forEach(card => {
    card.addEventListener('click', async (e) => {
      e.preventDefault();
      const type = card.dataset.type;
      if (type && type !== currentInvoice.meta.docType) {
        await switchDocumentType(type);
      }
    });
  });

  // Section 1 Quick Convert Button in Hint Banner
  const btnQuickConvert = document.getElementById('btn-quick-convert-banner');
  if (btnQuickConvert) {
    btnQuickConvert.addEventListener('click', async (e) => {
      e.preventDefault();
      await convertToInvoice();
    });
  }

  // (Removed: legacy #doc-type-switcher listener — Section 1 now uses
  // #doc-type-cards-grid cards. Kept as no-op guard for forward-compat.)
  if (document.querySelector('#doc-type-switcher')) {
    document.querySelectorAll('#doc-type-switcher .btn-doc-type').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const type = btn.dataset.type;
        if (type && type !== currentInvoice.meta.docType) {
          await switchDocumentType(type);
        }
      });
    });
  }

  // Convert Quotation / Estimate to Invoice Button
  const btnConvert = document.getElementById('btn-convert-quote');
  if (btnConvert) {
    btnConvert.addEventListener('click', async (e) => {
      e.preventDefault();
      const curDoc = (APP_DOC_TYPES[currentInvoice.meta.docType] || APP_DOC_TYPES.quotation).name;
      if (confirm(`Convert this ${curDoc} into a finalized Invoice? All line items, rates, taxes, and client details will be preserved.`)) {
        await convertToInvoice();
      }
    });
  }

  // Quote Acceptance Signature Checkbox
  const checkSig = document.getElementById('check-quote-signature');
  if (checkSig) {
    checkSig.addEventListener('change', (e) => {
      currentInvoice.meta.showSignature = e.target.checked;
      updateSheetView();
      triggerAutoSave();
    });
  }

  // Invoice Metadata Fields
  bindTextInput('input-inv-title', val => currentInvoice.meta.title = val);
  bindTextInput('input-inv-number', val => {
    currentInvoice.meta.number = val;
    // A hand-edited number is owned by the user: the engine never regenerates
    // or advances it (it is still uniqueness-checked at save).
    currentInvoice.meta.numberAuto = false;
  });
  bindTextInput('input-inv-date', val => {
    currentInvoice.meta.date = val;
    // An engine-issued draft number follows the issue date ({FY}/{YYYY}/{MM}
    // tokens and period keys). Persisted records and hand-edited numbers never
    // move (H1). A rolled config is passed so the regenerated number uses the
    // current period's counter, never a stale one.
    refreshAutoNumberForDraft(rolloverNumberingConfig(currentNumberingConfig));
  });
  bindTextInput('input-inv-due', val => currentInvoice.meta.dueDate = val);
  bindTextInput('input-inv-po', val => currentInvoice.meta.po = val);

  const selectCurrency = document.getElementById('select-inv-currency');
  const customCurrWrapper = document.getElementById('custom-currency-wrapper');
  const inputCustomCurr = document.getElementById('input-custom-currency');

  if (selectCurrency) {
    selectCurrency.addEventListener('change', (e) => {
      const newCurr = e.target.value;
      const prevCurr = currentInvoice.meta.currency;

      if (newCurr === 'custom') {
        if (customCurrWrapper) customCurrWrapper.style.display = 'block';
        if (inputCustomCurr) {
          inputCustomCurr.focus();
          const customVal = inputCustomCurr.value.trim() || 'BHD';
          currentInvoice.meta.currency = customVal;
        }
      } else {
        if (customCurrWrapper) customCurrWrapper.style.display = 'none';
        currentInvoice.meta.currency = newCurr;
        const numFmtSelect = document.getElementById('select-inv-number-format');
        // Only auto-suggest Indian format when switching TO ₹; never clobber an
        // explicit user choice when switching between other currencies.
        if (newCurr === '₹' && prevCurr !== '₹') {
          currentInvoice.meta.numberFormat = 'indian';
          if (numFmtSelect) numFmtSelect.value = 'indian';
        }
      }
      updateSheetView();
      renderLineItemsEditor();
      // The saved-item picker is currency-aware: re-filter its groups.
      refreshCatalogPicker();
      triggerAutoSave();
    });
  }

  if (inputCustomCurr) {
    inputCustomCurr.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      currentInvoice.meta.currency = val || 'CUR';
      updateSheetView();
      renderLineItemsEditor();
      refreshCatalogPicker();
      triggerAutoSave();
    });
  }

  const selectNumFormat = document.getElementById('select-inv-number-format');
  if (selectNumFormat) {
    selectNumFormat.addEventListener('change', (e) => {
      currentInvoice.meta.numberFormat = e.target.value;
      updateSheetView();
      renderLineItemsEditor();
      triggerAutoSave();
    });
  }

  const checkWords = document.getElementById('check-amount-in-words');
  if (checkWords) {
    checkWords.addEventListener('change', (e) => {
      currentInvoice.meta.showAmountInWords = e.target.checked;
      updateSheetView();
      triggerAutoSave();
    });
  }

  bindTextInput('select-inv-status', val => currentInvoice.meta.status = val);

  // Sender Fields
  bindTextInput('input-sender-name', val => {
    currentInvoice.sender.name = val;
    // Hand-editing the sender detaches the stored company link so Reports
    // never attribute a manually rebranded document to the old company.
    detachCompanyLink();
    // Keep Studio wordmark in sync
    const monoWordmark = document.getElementById('monogram-wordmark');
    if (monoWordmark && !monoWordmark.value) monoWordmark.value = val;
  });
  bindTextInput('input-sender-email', val => {
    currentInvoice.sender.email = val;
    detachCompanyLink();
  });
  bindTextInput('input-sender-phone', val => {
    currentInvoice.sender.phone = val;
    detachCompanyLink();
  });
  bindTextInput('input-sender-address', val => {
    currentInvoice.sender.address = val;
    detachCompanyLink();
  });
  bindTextInput('input-sender-taxid', val => {
    currentInvoice.sender.taxId = val;
    detachCompanyLink();
    updateSenderTaxHint();
  });

  // Sender Payment & Notes Two-Way Sync
  const senderPaymentInput = document.getElementById('input-sender-payment');
  const paymentInfoInput = document.getElementById('input-payment-info');
  const clearPaymentBtn = document.getElementById('btn-clear-sender-payment');

  function syncPayment(val) {
    currentInvoice.payment = val;
    if (senderPaymentInput && senderPaymentInput.value !== val) senderPaymentInput.value = val;
    if (paymentInfoInput && paymentInfoInput.value !== val) paymentInfoInput.value = val;
    if (clearPaymentBtn) {
      clearPaymentBtn.style.display = val && val.trim() ? 'inline-block' : 'none';
    }
    updateSheetView();
    triggerAutoSave();
  }

  if (senderPaymentInput) {
    senderPaymentInput.addEventListener('input', (e) => syncPayment(e.target.value));
  }
  if (paymentInfoInput) {
    paymentInfoInput.addEventListener('input', (e) => syncPayment(e.target.value));
  }
  if (clearPaymentBtn) {
    clearPaymentBtn.addEventListener('click', () => syncPayment(''));
  }

  // Client Fields
  bindTextInput('input-client-name', val => {
    currentInvoice.client.name = val;
    // A hand-edited name is no longer guaranteed to match the directory record.
    currentInvoice.clientId = null;
    if (currentInvoice.client) delete currentInvoice.client.id;
  });
  bindTextInput('input-client-email', val => currentInvoice.client.email = val);
  bindTextInput('input-client-phone', val => currentInvoice.client.phone = val);
  bindTextInput('input-client-address', val => currentInvoice.client.address = val);
  bindTextInput('input-client-taxid', val => currentInvoice.client.taxId = val);

  // Notes
  bindTextInput('input-notes', val => currentInvoice.notes = val);

  // Add Item Button
  document.getElementById('btn-add-item').addEventListener('click', () => {
    currentInvoice.items.push({
      id: generateId('item_'),
      description: 'New Consulting / Service Item',
      hsn: '998314',
      qty: 1,
      rate: 100,
      discount: 0,
      taxRate: 18
    });
    renderLineItemsEditor();
    updateSheetView();
    triggerAutoSave();
  });

  // Add Tax Leg Button
  document.getElementById('btn-add-tax-leg').addEventListener('click', () => {
    const existingLegs = currentInvoice.taxes.length;
    currentInvoice.taxes.push({
      id: generateId('tax_'),
      name: 'Custom Tax',
      ratio: existingLegs === 0 ? 100 : 50
    });
    renderTaxesEditor();
    updateSheetView();
    triggerAutoSave();
  });

  // Tax Presets Dropdown
  document.getElementById('select-tax-preset').addEventListener('change', (e) => {
    const val = e.target.value;
    if (val === 'india_gst') {
      currentInvoice.taxes = [
        { id: 'tax_1', name: 'CGST', ratio: 50 },
        { id: 'tax_2', name: 'SGST', ratio: 50 }
      ];
    } else if (val === 'india_igst') {
      currentInvoice.taxes = [
        { id: 'tax_1', name: 'IGST (Inter-State)', ratio: 100 }
      ];
    } else if (val === 'us_state_county') {
      currentInvoice.taxes = [
        { id: 'tax_1', name: 'State Sales Tax', ratio: 75 },
        { id: 'tax_2', name: 'County / Local Tax', ratio: 25 }
      ];
    } else if (val === 'single_vat') {
      currentInvoice.taxes = [
        { id: 'tax_1', name: 'Standard VAT', ratio: 100 }
      ];
    } else if (val === 'zero_tax') {
      currentInvoice.taxes = [];
      currentInvoice.items.forEach(item => { item.taxRate = 0; });
      renderLineItemsEditor();
      updateSenderTaxHint();
    }
    renderTaxesEditor();
    updateSheetView();
    triggerAutoSave();
    e.target.value = '';
  });

  // Company Profile Selector Dropdown (Section 4A)
  const selectCompany = document.getElementById('select-company-profile');
  if (selectCompany) {
    selectCompany.addEventListener('change', async (e) => {
      const val = e.target.value;
      if (val === '__new__') {
        resetCompanyModalForm();
        await renderCompaniesModalList();
        openModal('modal-companies');
        selectCompany.value = activeCompanyProfileId || '';
        return;
      }
      // Empty value is the display-only "No company linked" state, never an
      // action; and an unknown id must not silently apply a company.
      if (!val) return;
      const comp = await getCompany(val);
      if (comp) {
        applyCompanyToInvoice(comp);
      }
    });
  }

  // Update Active Company Profile Button
  const btnUpdateCompany = document.getElementById('btn-update-sender-profile');
  if (btnUpdateCompany) {
    btnUpdateCompany.addEventListener('click', async () => {
      const select = document.getElementById('select-company-profile');
      const compId = select && select.value && select.value !== '__new__' ? select.value : activeCompanyProfileId;
      if (!compId) {
        // New companies inherit the current document's currency/format and
        // only claim the default slot when no default exists, so the app
        // never ends up with multiple defaults (M7).
        const companies = await getAllCompanies();
        const hasDefault = companies.some(c => c.isDefault);
        const newComp = {
          id: generateId('comp_'),
          name: currentInvoice.sender.name || 'My Company',
          email: currentInvoice.sender.email || '',
          phone: currentInvoice.sender.phone || '',
          address: currentInvoice.sender.address || '',
          taxId: currentInvoice.sender.taxId || '',
          payment: currentInvoice.payment || '',
          defaultCurrency: currentInvoice.meta.currency || '$',
          defaultNumberFormat: currentInvoice.meta.numberFormat || 'international',
          isDefault: !hasDefault
        };
        await saveCompany(newComp);
        if (newComp.isDefault) {
          await setDefaultCompany(newComp.id);
        }
        activeCompanyProfileId = newComp.id;
        currentInvoice.companyId = newComp.id;
        await renderCompanyProfilesSelector();
        await updateSavedCompaniesCount();
        await notifyDataChanged();
        refreshCatalogPicker();
        alert(`Company profile "${newComp.name}" saved!`);
      } else {
        const existing = await getCompany(compId);
        if (existing) {
          existing.name = currentInvoice.sender.name;
          existing.email = currentInvoice.sender.email;
          existing.phone = currentInvoice.sender.phone;
          existing.address = currentInvoice.sender.address;
          existing.taxId = currentInvoice.sender.taxId || '';
          existing.payment = currentInvoice.payment || '';
          await saveCompany(existing);
          await renderCompanyProfilesSelector();
          await notifyDataChanged();
          // Renames must reach the scope hint and company scope tags.
          refreshCatalogPicker();
          alert(`Company profile "${existing.name}" updated with current details!`);
        }
      }
    });
  }

  // Quick Open New Company in Modal
  const btnQuickNewComp = document.getElementById('btn-quick-new-company');
  if (btnQuickNewComp) {
    btnQuickNewComp.addEventListener('click', async () => {
      resetCompanyModalForm();
      await renderCompaniesModalList();
      openModal('modal-companies');
    });
  }

  // Quick Manage Companies Button
  const btnQuickManageComp = document.getElementById('btn-quick-manage-companies');
  if (btnQuickManageComp) {
    btnQuickManageComp.addEventListener('click', async () => {
      await renderCompaniesModalList();
      openModal('modal-companies');
    });
  }

  // Save Company From Modal Button
  const btnSaveCompModal = document.getElementById('btn-save-company-modal');
  if (btnSaveCompModal) {
    btnSaveCompModal.addEventListener('click', async () => {
      await saveCompanyFromModal();
    });
  }

  // Load Utharam Profile Preset Button
  const btnLoadUtharamPreset = document.getElementById('btn-load-utharam-preset');
  if (btnLoadUtharamPreset) {
    btnLoadUtharamPreset.addEventListener('click', () => {
      document.getElementById('modal-company-id').value = '';
      document.getElementById('modal-company-name').value = 'Utharam';
      document.getElementById('modal-company-email').value = 'contactutharam@gmail.com';
      document.getElementById('modal-company-phone').value = '';
      document.getElementById('modal-company-address').value = 'Kerala, India\nhttps://utharam.in/\nSimple Solutions for Complex Problems';
      document.getElementById('modal-company-taxid').value = 'KL-UTH-01';
      document.getElementById('modal-company-payment').value = 'Direct Wire / Bank Remittance on Request\nAccount: Utharam Research & Software Studio';
      document.getElementById('modal-company-currency').value = '₹';
      document.getElementById('modal-company-number-format').value = 'indian';
      document.getElementById('modal-company-is-default').checked = true;
      document.getElementById('company-form-heading').textContent = 'Add Utharam Official Profile Preset';
    });
  }

  // Cancel Company Edit in Modal
  const btnCancelCompEdit = document.getElementById('btn-cancel-company-edit');
  if (btnCancelCompEdit) {
    btnCancelCompEdit.addEventListener('click', () => {
      resetCompanyModalForm();
    });
  }

  // Save Sender Profile Default
  document.getElementById('btn-save-sender-profile').addEventListener('click', async () => {
    const select = document.getElementById('select-company-profile');
    const compId = select && select.value && select.value !== '__new__' ? select.value : null;
    const existing = compId ? await getCompany(compId) : null;
    const comp = Object.assign({}, existing || {}, {
      id: compId || generateId('comp_'),
      name: currentInvoice.sender.name || 'Apex Studio',
      email: currentInvoice.sender.email || '',
      phone: currentInvoice.sender.phone || '',
      address: currentInvoice.sender.address || '',
      taxId: currentInvoice.sender.taxId || '',
      payment: currentInvoice.payment || '',
      defaultCurrency: existing && existing.defaultCurrency ? existing.defaultCurrency : (currentInvoice.meta.currency || '$'),
      defaultNumberFormat: existing && existing.defaultNumberFormat ? existing.defaultNumberFormat : (currentInvoice.meta.numberFormat || 'international'),
      isDefault: true
    });
    if (!comp.createdAt) comp.createdAt = Date.now();
    await saveCompany(comp);
    await setDefaultCompany(comp.id);
    activeCompanyProfileId = comp.id;
    currentInvoice.companyId = comp.id;
    await renderCompanyProfilesSelector();
    await updateSavedCompaniesCount();
    await notifyDataChanged();
    alert(`"${comp.name}" saved as default company! All new documents will start with this profile.`);
  });

  // Save Client to Directory (clone first so saveClient's id/updatedAt stamp
  // never mutates the live invoice object)
  document.getElementById('btn-save-client-to-book').addEventListener('click', async () => {
    if (!currentInvoice.client.name) {
      alert('Please enter a client name first.');
      return;
    }
    const savedClient = await saveClient(Object.assign({}, currentInvoice.client, {
      id: currentInvoice.client.id || currentInvoice.clientId || undefined
    }));
    currentInvoice.clientId = savedClient.id;
    currentInvoice.client.id = savedClient.id;
    await notifyDataChanged();
    alert(`Client "${currentInvoice.client.name}" saved to Client Directory!`);
  });
}

function setupPillNavigation() {
  const pills = document.querySelectorAll('#sidebar-pills-bar .nav-pill');
  const sectionIds = ['sec-models', 'sec-brand', 'sec-meta', 'sec-parties', 'sec-items', 'sec-payment'];
  const sidebar = document.getElementById('editor-sidebar');
  const emptyState = document.getElementById('sidebar-empty-state');
  let currentActiveId = 'sec-models'; // default open section

  function toggleSection(targetId) {
    // If clicking the already open section -> collapse/hide it!
    if (currentActiveId === targetId) {
      currentActiveId = null;
      pills.forEach(p => p.classList.remove('active'));
      sectionIds.forEach(id => {
        const sec = document.getElementById(id);
        if (sec) sec.style.display = 'none';
      });
      if (emptyState) emptyState.style.display = 'flex';
      return;
    }

    // Otherwise expand the clicked section
    currentActiveId = targetId;
    if (emptyState) emptyState.style.display = 'none';

    pills.forEach(p => {
      if (p.dataset.target === targetId) p.classList.add('active');
      else p.classList.remove('active');
    });

    sectionIds.forEach(id => {
      const sec = document.getElementById(id);
      if (sec) {
        sec.style.display = (id === targetId) ? 'block' : 'none';
      }
    });

    if (sidebar) sidebar.scrollTop = 0;
  }

  pills.forEach(pill => {
    pill.addEventListener('click', (e) => {
      e.preventDefault();
      toggleSection(pill.dataset.target);
    });
  });

  // Next tab buttons inside sections
  document.querySelectorAll('.btn-next-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const nextId = btn.dataset.next;
      if (nextId) toggleSection(nextId);
    });
  });

  // Quick open buttons inside empty state
  document.querySelectorAll('.btn-quick-open').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.target;
      if (target) toggleSection(target);
    });
  });
}

function bindTextInput(elemId, callback) {
  const el = document.getElementById(elemId);
  if (!el) return;
  const eventType = el.tagName === 'SELECT' ? 'change' : 'input';
  el.addEventListener(eventType, (e) => {
    callback(e.target.value);
    updateSheetView();
    triggerAutoSave();
  });
}

// ============================================================================
// 10. NAVIGATION, SIDEBAR COLLAPSE, MODALS & BACKUP
// ============================================================================
async function resetToFreshDocument(prefillClient = null, requestedType = null) {
  const curType = requestedType && APP_DOC_TYPES[requestedType] ? requestedType : activeDocType();
  const cfg = APP_DOC_TYPES[curType] || APP_DOC_TYPES.invoice;
  let defCompany = null;
  try {
    defCompany = await getDefaultCompany();
  } catch (e) {
    console.warn('Default company lookup failed while starting a new document:', e);
  }
  currentInvoice = JSON.parse(JSON.stringify(DEFAULT_INVOICE_STATE));
  currentInvoice.id = (curType === 'invoice' ? 'inv_' : 'doc_') + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
  currentInvoice.meta.date = appLocalDateString();
  currentInvoice.meta.dueDate = addDaysLocal(currentInvoice.meta.date, 14);
  currentInvoice.meta.docType = curType;
  currentInvoice.meta.title = cfg.title;
  currentInvoice.meta.currency = (defCompany && defCompany.defaultCurrency) || '$';
  currentInvoice.meta.numberFormat = (defCompany && defCompany.defaultNumberFormat) ||
    (currentInvoice.meta.currency === '₹' ? 'indian' : 'international');
  if (currentNumberingConfig && currentNumberingConfig.mode === 'auto') {
    currentInvoice.meta.number = generateForType(curType, currentInvoice.meta.date, currentNumberingConfig);
    currentInvoice.meta.numberAuto = true;
  } else {
    // Manual mode never invents a number; the user types it.
    currentInvoice.meta.number = '';
    currentInvoice.meta.numberAuto = false;
  }
  currentInvoice.meta.status = cfg.defaultStatus;
  currentInvoice.meta.showSignature = (curType !== 'invoice');
  currentInvoice.notes = cfg.defaultNotes;
  delete currentInvoice.convertedToId;
  delete currentInvoice.convertedToNumber;
  delete currentInvoice.convertedAt;
  delete currentInvoice.sourceDocId;
  delete currentInvoice.sourceDocNumber;
  delete currentInvoice.duplicatedFromId;

  if (defCompany) {
    currentInvoice.sender = {
      name: defCompany.name || '',
      email: defCompany.email || '',
      phone: defCompany.phone || '',
      address: defCompany.address || '',
      taxId: defCompany.taxId || ''
    };
    currentInvoice.payment = defCompany.payment || '';
    activeCompanyProfileId = defCompany.id;
    currentInvoice.companyId = defCompany.id;
  } else {
    currentInvoice.payment = '';
    currentInvoice.companyId = null;
  }

  if (prefillClient) {
    currentInvoice.client = {
      name: prefillClient.name || '',
      email: prefillClient.email || '',
      phone: prefillClient.phone || '',
      address: prefillClient.address || '',
      taxId: prefillClient.taxId || ''
    };
    currentInvoice.clientId = prefillClient.id || null;
  } else {
    currentInvoice.clientId = null;
  }

  currentDocumentPersisted = false;
  documentEdited = false;
  try { await renderCompanyProfilesSelector(); } catch (e) { console.warn(e); }
  populateFormFields();
  renderLineItemsEditor();
  renderTaxesEditor();
  updateSheetView();
  refreshCatalogPicker();
  triggerAutoSave();
  navigateTo('compose');
  requestAnimationFrame(() => updateDocumentPaginationLive());
  syncComposeTitle();
}

/**
 * Keeps the browser tab title in sync with the document being edited.
 * navigateTo('compose') is a same-view no-op, so document changes must update
 * the title directly (UI9).
 */
function syncComposeTitle() {
  if (getCurrentView() !== 'compose') return;
  document.title = `${docTypeName(activeDocType())} ${currentInvoice.meta.number || ''} - InvoiceCraft`
    .replace(/\s+/g, ' ').trim();
}

/**
 * Single hook for "persisted data changed" events (UI3): refresh shell counts
 * plus whichever data-bearing view is currently visible. Never called during
 * initial boot.
 */
async function notifyDataChanged() {
  try { await refreshShellCounts(); } catch (e) { console.warn('Shell count refresh failed:', e); }
  const view = getCurrentView();
  if (view === 'reports' && reportsMounted) {
    try { await refreshReportsView(); } catch (e) { console.warn('Reports refresh failed:', e); }
  }
  if (view === 'home') {
    try { await renderHome(); } catch (e) { console.warn('Home refresh failed:', e); }
  }
}

/**
 * Regenerates the engine-issued number of an unsaved draft (H1). Used when the
 * issue date (or type/scheme inputs behind the number) change and again at
 * save time. Persisted records and hand-edited numbers are never rewritten.
 * The optional `config` lets callers pass an already-rolled numbering config;
 * whatever comes in is rolled here too (a no-op when already rolled), so a
 * period boundary can never regenerate a number from a stale counter.
 * Returns true when the number was rewritten.
 */
function refreshAutoNumberForDraft(config = currentNumberingConfig) {
  if (currentDocumentPersisted) return false;
  const effective = rolloverNumberingConfig(config || currentNumberingConfig);
  if (!effective || effective.mode !== 'auto') return false;
  if (!currentInvoice.meta.numberAuto) return false;
  const next = generateForType(activeDocType(), currentInvoice.meta.date, effective);
  if (!next || next === currentInvoice.meta.number) return false;
  currentInvoice.meta.number = next;
  const numInput = document.getElementById('input-inv-number');
  if (numInput) numInput.value = next;
  updateNumberingBadgeUI(effective);
  return true;
}

/**
 * Saves the active document and its numbering config in one transaction.
 * In auto mode the document's own type counter advances exactly once per newly
 * issued number; saving the same document again does not consume another.
 * Rollover is applied before anything else, every save uniqueness-checks the
 * number, and persisted records are never renumbered or re-advanced (H1–H4).
 */
async function persistCurrentDocument() {
  const persistedBeforeAttempt = currentDocumentPersisted;
  let saveCompleted = false;
  try {
    const type = activeDocType();
    const config = rolloverNumberingConfig(currentNumberingConfig);
    const autoMode = config.mode === 'auto';

    // Stale draft regeneration: re-issue the number from the current rolled
    // config and the current issue date before anything is written. The rolled
    // local config is passed explicitly so a period boundary can never
    // regenerate from the pre-rollover counter.
    if (autoMode && !currentDocumentPersisted && currentInvoice.meta.numberAuto) {
      if (refreshAutoNumberForDraft(config)) {
        updateSheetView();
      }
    }

    const number = String(currentInvoice.meta.number || '').trim();
    if (!number) {
      alert('Please enter a document number before saving.');
      return false;
    }

    // Auto mode always uniqueness-checks; hand-edited auto numbers and manual
    // numbers get the same guard. Re-saves exclude their own record.
    const conflict = await findNumberConflict(number, type, currentDocumentPersisted ? currentInvoice.id : null);
    if (conflict) {
      alert(`The ${docTypeName(type)} number "${number}" is already used by another saved document. Choose a unique number.`);
      return false;
    }

    // Advance exactly once per newly issued number; never for re-saves and
    // never for hand-edited numbers. A retyped number that exactly matches the
    // engine's expected current number is still a consumption and must
    // advance, or the next new document would collide with it.
    const expectedCurrentForCurrentConfig = autoMode
      ? generateForType(type, currentInvoice.meta.date, config)
      : '';
    let configToSave = config;
    if (autoMode && !currentDocumentPersisted &&
        (currentInvoice.meta.numberAuto ||
         (expectedCurrentForCurrentConfig && number === expectedCurrentForCurrentConfig))) {
      configToSave = advanceTypeCounter(config, type);
    }

    currentInvoice.meta.number = number;
    if (!autoMode) currentInvoice.meta.numberAuto = false;

    currentInvoice.companyId = activeCompanyProfileId || currentInvoice.companyId || null;
    if (!currentInvoice.clientId && currentInvoice.client && currentInvoice.client.id) {
      currentInvoice.clientId = currentInvoice.client.id;
    }

    await saveInvoiceAndNumbering(currentInvoice, configToSave);
    saveCompleted = true;
    currentNumberingConfig = normalizeNumberingConfig(configToSave);
    currentDocumentPersisted = true;
    documentEdited = false;
    updateNumberingBadgeUI(currentNumberingConfig);
    updateSheetView();
    syncComposeTitle();
    try { await saveActiveDraft(currentInvoice, { activeCompanyProfileId, documentEdited: false }); } catch (e) { console.warn(e); }
    try { await updateSavedInvoicesCount(); } catch (e) {}
    await notifyDataChanged();
    return true;
  } catch (err) {
    console.error('Save failed:', err);
    // A failed save must never leave the editor looking persisted: the prepare
    // step may already have stamped updatedAt on the live object before the
    // write failed. Demote the editor content back to an unsaved draft so a
    // reload cannot infer it was persisted.
    if (!persistedBeforeAttempt && !saveCompleted) {
      currentDocumentPersisted = false;
      delete currentInvoice.updatedAt;
      documentEdited = true;
      try {
        await saveActiveDraft(currentInvoice, { activeCompanyProfileId, documentEdited: true });
      } catch (e) { console.warn(e); }
    }
    alert('Could not save this document: ' + (err && err.message ? err.message : err));
    return false;
  }
}

async function openAppModal(id) {
  if (!id) return;
  if (id === 'modal-numbering-engine') {
    populateNumberingModal(currentNumberingConfig);
  } else if (id === 'modal-companies') {
    await renderCompaniesModalList();
  } else if (id === 'modal-clients') {
    await renderClientsList();
  } else if (id === 'modal-invoices') {
    await renderSavedInvoicesList();
  } else if (id === 'modal-item-library') {
    await openItemLibraryManager();
  }
  openModal(id);
}

async function resumeActiveDraft() {
  try {
    const record = await getActiveDraftRecord();
    if (record && record.data) {
      const data = record.data;
      // Verify the persisted record still exists instead of inferring from
      // updatedAt; a leftover updatedAt on a deleted record must not make the
      // editor treat the draft as a saved document.
      let persisted = false;
      if (data.updatedAt && data.id) {
        try {
          persisted = Boolean(await getInvoice(data.id));
        } catch (e) {
          console.warn('Could not verify the persisted draft record:', e);
          persisted = false;
        }
      }
      if (data.updatedAt && !persisted) delete data.updatedAt;
      // edited === null is the legacy "edited" marker: treat it as edited.
      await loadInvoiceIntoEditor(data, {
        persisted,
        activeCompanyProfileId: record.activeCompanyProfileId,
        documentEdited: record.edited === null ? true : Boolean(record.edited)
      });
    }
  } catch (e) {
    console.warn('Could not restore the active draft:', e);
  }
  navigateTo('compose');
  requestAnimationFrame(() => updateDocumentPaginationLive());
  syncComposeTitle();
}

async function requestNewDocument(type = null, prefillClient = null) {
  const targetType = type && APP_DOC_TYPES[type] ? type : activeDocType();
  // Only real edits are worth a save/discard prompt. A pristine default
  // document (or an untouched saved record) starts fresh with no prompt and
  // never writes a demo record (UI1/UI5).
  const hasUnsavedWork = documentEdited;
  if (hasUnsavedWork) {
    pendingNewDocType = targetType;
    pendingPrefillClient = prefillClient;
    const cfg = APP_DOC_TYPES[targetType] || APP_DOC_TYPES.invoice;
    const curNum = currentInvoice.meta.number || 'Current Document';
    const titleEl = document.getElementById('new-doc-cur-title');
    if (titleEl) titleEl.textContent = `${docTypeName(activeDocType())} "${curNum}" → new ${cfg.name}`;
    openModal('modal-confirm-new-doc');
    return;
  }
  navigateTo('compose');
  await resetToFreshDocument(prefillClient, targetType);
}

async function loadInvoiceIntoEditor(inv, opts = {}) {
  if (!inv) return false;
  normalizeInvoice(inv);
  currentInvoice = JSON.parse(JSON.stringify(inv));
  normalizeInvoice(currentInvoice);
  activeCompanyProfileId = opts.activeCompanyProfileId || currentInvoice.companyId || null;
  if (!activeCompanyProfileId && currentInvoice.sender && currentInvoice.sender.name) {
    try {
      const allComps = await getAllCompanies();
      const match = allComps.find(c => c.name === currentInvoice.sender.name);
      if (match) {
        activeCompanyProfileId = match.id;
        currentInvoice.companyId = currentInvoice.companyId || match.id;
      }
    } catch (e) {}
  }
  currentDocumentPersisted = opts.persisted !== undefined ? Boolean(opts.persisted) : Boolean(inv.updatedAt);
  documentEdited = Boolean(opts.documentEdited);
  try { await renderCompanyProfilesSelector(); } catch (e) {}
  populateFormFields();
  renderLineItemsEditor();
  renderTaxesEditor();
  updateSheetView();
  refreshCatalogPicker();
  try { await saveActiveDraft(currentInvoice, { activeCompanyProfileId, documentEdited }); } catch (e) { console.warn(e); }
  return true;
}

async function openDocumentInEditor(id) {
  try {
    const inv = await getInvoice(id);
    if (!inv) {
      alert('That document could not be found. It may have been deleted.');
      return false;
    }
    // Never silently replace an edited draft: resolve the dirty-draft prompt
    // BEFORE the new document is loaded or written to activeDraft (UI1).
    if (documentEdited &&
        !confirm('You have unsaved changes in the current draft. Opening this document will discard them. Discard and continue?')) {
      return false;
    }
    await loadInvoiceIntoEditor(inv, { persisted: true });
    navigateTo('compose');
    closeModal('modal-invoices');
    closeModal('modal-clients');
    closeModal('modal-reports');
    requestAnimationFrame(() => updateDocumentPaginationLive());
    try { await refreshShellCounts(); } catch (e) {}
    syncComposeTitle();
    return true;
  } catch (e) {
    console.error('Could not open document:', e);
    alert('Could not open that document: ' + (e && e.message ? e.message : e));
    return false;
  }
}

async function duplicateDocument(source) {
  if (!source) return false;
  // Never silently replace an edited draft: resolve the dirty-draft prompt
  // before a number is generated, consumed, or loaded (UI1).
  if (documentEdited &&
      !confirm('You have unsaved changes in the current draft. Duplicating will replace the editor content and discard them. Discard and continue?')) {
    return false;
  }
  const type = source.meta?.docType || 'invoice';
  let config = rolloverNumberingConfig(currentNumberingConfig);
  let number;
  if (config.mode === 'manual') {
    number = await promptManualNumber(type, '', null);
    if (!number) return false;
  } else {
    number = generateForType(type, appLocalDateString(), config);
    if (await findNumberConflict(number, type, null)) {
      alert(`The generated ${docTypeName(type)} number "${number}" is already in use. Duplicate cancelled.`);
      return false;
    }
  }

  const duplicate = buildDuplicateRecord({
    source,
    id: generateId('inv_'),
    number,
    now: new Date()
  });
  duplicate.meta.status = (APP_DOC_TYPES[type] || APP_DOC_TYPES.invoice).defaultStatus;
  delete duplicate.convertedToId;
  delete duplicate.convertedToNumber;
  delete duplicate.convertedAt;
  delete duplicate.sourceDocId;
  delete duplicate.sourceDocNumber;
  if (duplicate.meta) {
    delete duplicate.meta.convertedToId;
    delete duplicate.meta.convertedToNumber;
    delete duplicate.meta.convertedAt;
    delete duplicate.meta.sourceDocId;
    delete duplicate.meta.sourceDocNumber;
  }
  // Link identity stays honest (M6): a legacy source without a stored company
  // link produces a duplicate without an invented link. The sender snapshot is
  // kept as-is so number/currency/link never disagree.
  duplicate.companyId = source.companyId || null;
  duplicate.clientId = source.clientId || null;
  if (!duplicate.meta.currency) duplicate.meta.currency = source.meta?.currency || '$';
  duplicate.meta.numberAuto = config.mode === 'auto';

  if (config.mode === 'auto') {
    config = advanceTypeCounter(config, type);
  }
  try {
    await saveInvoiceAndNumbering(duplicate, config);
  } catch (e) {
    console.error('Duplicate save failed:', e);
    alert('Could not save the duplicate: ' + (e && e.message ? e.message : e));
    return false;
  }
  currentNumberingConfig = normalizeNumberingConfig(config);
  await loadInvoiceIntoEditor(duplicate, { persisted: true });
  closeModal('modal-invoices');
  closeModal('modal-clients');
  navigateTo('compose');
  requestAnimationFrame(() => updateDocumentPaginationLive());
  try { await updateSavedInvoicesCount(); } catch (e) {}
  await notifyDataChanged();
  syncComposeTitle();
  return true;
}

// Compose-only print manager path. The shell routes Ctrl+P here only in Compose.
function safePrintAction() {
  if (getCurrentView() !== 'compose') return false;
  const origTitle = document.title;
  const prefix = docTypeName(activeDocType());
  const rawNum = currentInvoice.meta.number || 'Draft';
  const sanitizedNum = rawNum.replace(/[\\/:*?"<>|]/g, '_');

  // Visual page break guides must never enter print output.
  document.querySelectorAll('.canvas-page-break-line').forEach(el => el.remove());

  if (safePrintAction._restore) {
    try {
      window.removeEventListener('afterprint', safePrintAction._restore);
      clearTimeout(safePrintAction._t);
    } catch (e) {}
  }

  document.title = `${prefix}-${sanitizedNum}`;
  const restoreTitle = () => {
    document.title = origTitle;
    if (getCurrentView() === 'compose') updateDocumentPaginationLive();
    safePrintAction._restore = null;
  };
  safePrintAction._restore = restoreTitle;
  window.addEventListener('afterprint', restoreTitle, { once: true });
  safePrintAction._t = setTimeout(restoreTitle, 1500);
  window.print();
  return true;
}

function attachNavigationListeners() {
  setupPillNavigation();

  // Sidebar Collapse / Expand Toggle
  const workspace = document.querySelector('.app-workspace');
  const sidebarToggleBtn = document.getElementById('btn-toggle-sidebar');
  const floatingToggleBtn = document.getElementById('btn-expand-sidebar-floating');

  const toggleSidebar = () => {
    if (getCurrentView() !== 'compose') return;
    const isCollapsed = workspace.classList.toggle('sidebar-collapsed');
    if (floatingToggleBtn) {
      floatingToggleBtn.style.display = isCollapsed ? 'inline-flex' : 'none';
    }
    if (sidebarToggleBtn) {
      sidebarToggleBtn.classList.toggle('btn-primary', isCollapsed);
    }
    requestAnimationFrame(() => updateDocumentPaginationLive());
  };
  toggleSidebarPanel = toggleSidebar;

  if (sidebarToggleBtn) sidebarToggleBtn.addEventListener('click', toggleSidebar);
  if (floatingToggleBtn) floatingToggleBtn.addEventListener('click', toggleSidebar);

  // New Document Button (existing confirmation dialog; target type is captured
  // when the action starts, so Home's New Quote works too).
  const btnNewInvoice = document.getElementById('btn-new-invoice');
  if (btnNewInvoice) {
    btnNewInvoice.addEventListener('click', () => {
      requestNewDocument(activeDocType());
    });
  }

  const btnNewSaveAndStart = document.getElementById('btn-new-save-and-start');
  if (btnNewSaveAndStart) {
    btnNewSaveAndStart.addEventListener('click', async () => {
      const targetType = pendingNewDocType || activeDocType();
      const targetClient = pendingPrefillClient;
      const saved = await persistCurrentDocument();
      if (!saved) return;
      closeModal('modal-confirm-new-doc');
      pendingNewDocType = null;
      pendingPrefillClient = null;
      await resetToFreshDocument(targetClient, targetType);
    });
  }

  const btnNewDiscard = document.getElementById('btn-new-discard');
  if (btnNewDiscard) {
    btnNewDiscard.addEventListener('click', async () => {
      const targetType = pendingNewDocType || activeDocType();
      const targetClient = pendingPrefillClient;
      closeModal('modal-confirm-new-doc');
      pendingNewDocType = null;
      pendingPrefillClient = null;
      await resetToFreshDocument(targetClient, targetType);
    });
  }

  // Save Document Button
  document.getElementById('btn-save-invoice').addEventListener('click', async () => {
    const saved = await persistCurrentDocument();
    if (!saved) return;
    alert(`${docTypeName(activeDocType())} "${currentInvoice.meta.number}" saved successfully to IndexedDB!`);
  });

  // Bind Print / Save PDF Buttons
  const btnPrintNav = document.getElementById('btn-print-pdf');
  if (btnPrintNav) btnPrintNav.addEventListener('click', safePrintAction);

  const btnPrintCanvas = document.getElementById('btn-print-preview');
  if (btnPrintCanvas) btnPrintCanvas.addEventListener('click', safePrintAction);

  // Modals Open Triggers
  document.getElementById('btn-open-logo-studio').addEventListener('click', () => {
    openModal('modal-logo-studio');
    const monoWordmark = document.getElementById('monogram-wordmark');
    if (monoWordmark && !monoWordmark.value) monoWordmark.value = currentInvoice.sender.name;
    const iconWordmark = document.getElementById('icon-wordmark');
    if (iconWordmark && !iconWordmark.value) iconWordmark.value = currentInvoice.sender.name;
    // updateMonogramLockupLive is scoped inside setupLogoStudioTabs; refresh via
    // input event so the live monogram preview re-renders, then refresh the icon lockup.
    try {
      const monoInit = document.getElementById('monogram-initials');
      if (monoInit) monoInit.dispatchEvent(new Event('input', { bubbles: true }));
    } catch (e) {}
    try {
      if (typeof updateIconLockupLive === 'function') updateIconLockupLive();
    } catch (e) { console.warn('Icon lockup refresh failed:', e); }
  });

  document.getElementById('btn-open-invoices-modal').addEventListener('click', async () => {
    await renderSavedInvoicesList();
    openModal('modal-invoices');
  });

  const filterInvSearch = document.getElementById('filter-inv-search');
  if (filterInvSearch) {
    filterInvSearch.addEventListener('input', (e) => {
      invoiceFilterState.search = e.target.value.trim();
      renderSavedInvoicesList();
    });
  }

  const filterInvClient = document.getElementById('filter-inv-client');
  if (filterInvClient) {
    filterInvClient.addEventListener('change', (e) => {
      invoiceFilterState.client = e.target.value;
      renderSavedInvoicesList();
    });
  }

  document.querySelectorAll('#filter-type-chips .btn-filter-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#filter-type-chips .btn-filter-chip').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      invoiceFilterState.docType = btn.dataset.type;
      renderSavedInvoicesList();
    });
  });

  document.getElementById('btn-open-clients-modal').addEventListener('click', async () => {
    await renderClientsList();
    openModal('modal-clients');
  });

  document.getElementById('btn-open-backup-modal').addEventListener('click', () => {
    openModal('modal-backup');
  });

  const btnOpenCompaniesModal = document.getElementById('btn-open-companies-modal');
  if (btnOpenCompaniesModal) {
    btnOpenCompaniesModal.addEventListener('click', async () => {
      await renderCompaniesModalList();
      openModal('modal-companies');
    });
  }

  // Open Privacy Notice Modal Trigger
  const btnOpenPrivacyModal = document.getElementById('btn-open-privacy-modal');
  if (btnOpenPrivacyModal) {
    btnOpenPrivacyModal.addEventListener('click', () => {
      openModal('modal-privacy-notice');
    });
  }

  // Open Guide Modal Trigger
  const btnOpenGuideModal = document.getElementById('btn-open-guide-modal');
  if (btnOpenGuideModal) {
    btnOpenGuideModal.addEventListener('click', () => {
      openModal('modal-user-guide');
    });
  }

  // Guide contents links scroll the dialog body (the page itself does not
  // scroll while a modal is open). Keeps the TOC useful in the editorial guide.
  const guideToc = document.querySelector('#modal-user-guide .guide-toc');
  if (guideToc) {
    guideToc.addEventListener('click', (e) => {
      const link = e.target.closest && e.target.closest('a[href^="#"]');
      if (!link) return;
      const target = document.querySelector(link.getAttribute('href'));
      const body = document.querySelector('#modal-user-guide .guide-body');
      if (!target || !body) return;
      e.preventDefault();
      const top = target.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop - 16;
      body.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    });
  }

  // Open Numbering Engine Modal Trigger
  const btnOpenNumberingModal = document.getElementById('btn-open-numbering-modal');
  if (btnOpenNumberingModal) {
    btnOpenNumberingModal.addEventListener('click', () => {
      populateNumberingModal(currentNumberingConfig);
      openModal('modal-numbering-engine');
    });
  }

  // Quick Next Seq # button in Section 3
  const btnQuickNextNum = document.getElementById('btn-quick-next-num');
  if (btnQuickNextNum) {
    btnQuickNextNum.addEventListener('click', async () => {
      if (currentNumberingConfig.mode === 'manual') {
        alert('Numbering is currently in Manual Mode. Click "Numbering Engine" to switch to Auto Continuous Sequence.');
        return;
      }
      // Saved documents are never renumbered (H1): rewriting a persisted
      // record here would desync it from history and reports.
      if (currentDocumentPersisted) {
        alert('This document is already saved, so its number is frozen. Saved documents are never renumbered — use New or Duplicate for a fresh number.');
        return;
      }
      currentNumberingConfig = rolloverNumberingConfig(currentNumberingConfig);
      const nextNum = generateForType(activeDocType(), currentInvoice.meta.date, currentNumberingConfig);
      currentInvoice.meta.number = nextNum;
      currentInvoice.meta.numberAuto = true;
      const numInput = document.getElementById('input-inv-number');
      if (numInput) numInput.value = nextNum;
      updateSheetView();
      syncComposeTitle();
      updateNumberingBadgeUI(currentNumberingConfig);
      triggerAutoSave();
    });
  }

  // Change doc type link in Section 3 toolbar (redirects to Section 1)
  const btnChangeDocType = document.getElementById('btn-change-doc-type');
  if (btnChangeDocType) {
    btnChangeDocType.addEventListener('click', () => {
      const pill1 = document.querySelector('#sidebar-pills-bar .nav-pill[data-target="sec-models"]');
      if (pill1) pill1.click();
    });
  }
}

function attachModalListeners() {
  // Universal data-close-modal handler
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = btn.getAttribute('data-close-modal');
      closeModal(targetId);
    });
  });

  // Explicit close buttons
  const explicitButtons = [
    { btnId: 'btn-close-logo-modal', modalId: 'modal-logo-studio' },
    { btnId: 'btn-cancel-logo-modal', modalId: 'modal-logo-studio' },
    { btnId: 'btn-close-invoices-modal', modalId: 'modal-invoices' },
    { btnId: 'btn-cancel-invoices-modal', modalId: 'modal-invoices' },
    { btnId: 'btn-close-clients-modal', modalId: 'modal-clients' },
    { btnId: 'btn-cancel-clients-modal', modalId: 'modal-clients' },
    { btnId: 'btn-close-backup-modal', modalId: 'modal-backup' },
    { btnId: 'btn-cancel-backup-modal', modalId: 'modal-backup' },
    { btnId: 'btn-close-companies-modal', modalId: 'modal-companies' },
    { btnId: 'btn-cancel-companies-modal', modalId: 'modal-companies' },
    { btnId: 'btn-close-numbering-modal', modalId: 'modal-numbering-engine' },
    { btnId: 'btn-cancel-numbering-modal', modalId: 'modal-numbering-engine' },
    { btnId: 'btn-close-privacy-modal', modalId: 'modal-privacy-notice' },
    { btnId: 'btn-cancel-privacy-modal', modalId: 'modal-privacy-notice' },
    { btnId: 'btn-close-guide-modal', modalId: 'modal-user-guide' },
    { btnId: 'btn-got-it-guide', modalId: 'modal-user-guide' },
    { btnId: 'btn-close-new-doc-modal', modalId: 'modal-confirm-new-doc' },
    { btnId: 'btn-new-cancel', modalId: 'modal-confirm-new-doc' }
  ];

  explicitButtons.forEach(({ btnId, modalId }) => {
    const btn = document.getElementById(btnId);
    if (btn) {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        closeModal(modalId);
      });
    }
  });

  // Quick export from Privacy Modal
  const btnQuickExportPrivacy = document.getElementById('btn-quick-export-from-privacy');
  if (btnQuickExportPrivacy) {
    btnQuickExportPrivacy.addEventListener('click', async () => {
      try {
        const data = await exportAllData();
        const jsonStr = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `InvoiceCraft_Backup_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        closeModal('modal-privacy-notice');
        alert('Database JSON backup successfully downloaded! Store this file safely on your computer or drive.');
      } catch (err) {
        alert('Failed to generate backup: ' + err.message);
      }
    });
  }

  // Numbering Modal Controls
  document.querySelectorAll('input[name="num-mode"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const panel = document.getElementById('auto-numbering-settings-panel');
      if (panel) {
        panel.style.opacity = radio.value === 'manual' ? '0.45' : '1';
      }
      updateNumberingModalPreviewLive();
    });
  });

  document.querySelectorAll('.btn-scheme-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      const patternInput = document.getElementById('num-cfg-pattern');
      if (patternInput) {
        patternInput.value = btn.dataset.scheme;
        updateNumberingModalPreviewLive();
      }
    });
  });

  document.querySelectorAll('.btn-token-insert').forEach(btn => {
    btn.addEventListener('click', () => {
      const patternInput = document.getElementById('num-cfg-pattern');
      if (patternInput) {
        patternInput.value += btn.dataset.token;
        updateNumberingModalPreviewLive();
      }
    });
  });

  ['num-cfg-pattern', 'num-prefix-inv', 'num-prefix-qt', 'num-prefix-est', 'num-prefix-pi',
    'num-cfg-counter-invoice', 'num-cfg-counter-quotation', 'num-cfg-counter-estimate', 'num-cfg-counter-proforma'
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', updateNumberingModalPreviewLive);
  });

  ['num-cfg-padding', 'num-cfg-reset'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', updateNumberingModalPreviewLive);
  });

  const btnSaveNumModal = document.getElementById('btn-save-numbering-modal');
  if (btnSaveNumModal) {
    btnSaveNumModal.addEventListener('click', async () => {
      const nextConfig = readNumberingModalConfig();
      // An auto scheme without {COUNTER} cannot produce unique numbers.
      if (nextConfig.mode === 'auto' && !String(nextConfig.scheme || '').includes('{COUNTER}')) {
        alert('Auto-numbering schemes must contain the {COUNTER} token so every number is unique. Add {COUNTER} to the pattern and save again.');
        return;
      }
      // The scheme must also carry enough period information for the reset
      // policy, or counters collide after every rollover.
      if (nextConfig.mode === 'auto') {
        const periodError = validateNumberingSchemePeriod(nextConfig.scheme, nextConfig.resetPeriod);
        if (periodError) {
          alert(periodError);
          return;
        }
      }
      currentNumberingConfig = nextConfig;
      await saveNumberingConfig(currentNumberingConfig);
      updateNumberingBadgeUI(currentNumberingConfig);

      // Saved records are never renumbered by a config change (H1). Only an
      // unsaved draft picks up the freshly previewed number.
      if (currentNumberingConfig.mode === 'auto' && !currentDocumentPersisted) {
        const newNum = generateForType(activeDocType(), currentInvoice.meta.date, currentNumberingConfig);
        currentInvoice.meta.number = newNum;
        currentInvoice.meta.numberAuto = true;
        const numInput = document.getElementById('input-inv-number');
        if (numInput) numInput.value = newNum;
      }
      updateSheetView();
      syncComposeTitle();
      triggerAutoSave();
      closeModal('modal-numbering-engine');
    });
  }

  // (Duplicate explicit-close registration removed — the loop above already
  // covers all buttons together with the universal [data-close-modal] handler.)

  // Modals are closed ONLY via explicit [×] or [Close] buttons to prevent accidental closure
  // Backdrop clicks intentionally do NOT close the modal dialog.

  // Backup Export JSON (append anchor for Firefox compat, delayed revoke)
  document.getElementById('btn-export-json').addEventListener('click', async () => {
    try {
      const data = await exportAllData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `InvoiceCraft_Backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (err) {
      alert('Failed to generate backup: ' + (err && err.message ? err.message : err));
    }
  });

  // Backup Import JSON
  const importInput = document.getElementById('file-import-input');
  document.getElementById('btn-trigger-import').addEventListener('click', () => importInput.click());

  importInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 25 * 1024 * 1024) {
        alert('Backup file is too large (max 25MB).');
        e.target.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const parsed = JSON.parse(evt.target.result);
          if (!parsed || typeof parsed !== 'object' ||
              (!Array.isArray(parsed.invoices) && !Array.isArray(parsed.clients) && !Array.isArray(parsed.companies) &&
               !parsed.numberingConfig && !parsed.profile &&
               !Array.isArray(parsed.catalogItems) && !parsed.itemLibraryConfig && !parsed.activeDraft)) {
            throw new Error('Unrecognized backup shape (expected invoices/clients/companies/catalogItems/catalog scope/numberingConfig/active draft).');
          }
          if (!confirm('Restore this backup? Existing records with the same IDs will be overwritten.')) {
            return;
          }
          await importAllData(parsed);
          await updateSavedInvoicesCount();
          await notifyDataChanged();
          alert('Database restored successfully! Reloading...');
          window.location.reload();
        } catch (err) {
          alert('Failed to restore backup: ' + err.message);
        } finally {
          importInput.value = '';
        }
      };
      reader.onerror = () => {
        alert('Could not read backup file.');
        importInput.value = '';
      };
      reader.readAsText(file);
    }
  });
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  if (typeof modal.showModal === 'function') {
    try {
      modal.showModal();
      return;
    } catch (e) {}
  }
  modal.setAttribute('open', '');
  modal.style.display = 'block';
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  if (typeof modal.close === 'function') {
    try {
      modal.close();
      return;
    } catch (e) {}
  }
  modal.removeAttribute('open');
  modal.style.display = 'none';
}

// ============================================================================
// 11. SAVED INVOICES & CLIENT DIRECTORY LISTS
// ============================================================================
async function updateSavedInvoicesCount() {
  const invoices = await getAllInvoices();
  const counter = document.getElementById('saved-invoices-count');
  if (counter) counter.textContent = invoices.length;
}

let invoiceFilterState = {
  search: '',
  docType: 'all',
  client: 'all'
};

async function renderSavedInvoicesList() {
  const container = document.getElementById('saved-invoices-list');
  if (!container) return;
  const invoices = await getAllInvoices();

  // 1. Update filter type chip counts
  const countAll = document.getElementById('count-all');
  const countInv = document.getElementById('count-invoice');
  const countQt = document.getElementById('count-quotation');
  const countEst = document.getElementById('count-estimate');
  const countPi = document.getElementById('count-proforma');

  if (countAll) countAll.textContent = invoices.length;
  if (countInv) countInv.textContent = invoices.filter(i => (i.meta?.docType || 'invoice') === 'invoice').length;
  if (countQt) countQt.textContent = invoices.filter(i => i.meta?.docType === 'quotation').length;
  if (countEst) countEst.textContent = invoices.filter(i => i.meta?.docType === 'estimate').length;
  if (countPi) countPi.textContent = invoices.filter(i => i.meta?.docType === 'proforma').length;

  // 2. Populate client filter dropdown
  const clientFilterSelect = document.getElementById('filter-inv-client');
  if (clientFilterSelect) {
    const prevSelected = invoiceFilterState.client;
    const clientCounts = {};
    invoices.forEach(i => {
      const name = (i.client?.name || '').trim();
      if (name) clientCounts[name] = (clientCounts[name] || 0) + 1;
    });
    const sortedClients = Object.keys(clientCounts).sort((a,b) => a.localeCompare(b));
    let optionsHtml = `<option value="all">All Clients (${invoices.length})</option>`;
    sortedClients.forEach(cName => {
      optionsHtml += `<option value="${appEscapeHtml(cName)}">${appEscapeHtml(cName)} (${clientCounts[cName]})</option>`;
    });
    clientFilterSelect.innerHTML = optionsHtml;
    if (sortedClients.includes(prevSelected) || prevSelected === 'all') {
      clientFilterSelect.value = prevSelected;
    } else {
      invoiceFilterState.client = 'all';
      clientFilterSelect.value = 'all';
    }
  }

  // 3. Filter invoices
  const filtered = invoices.filter(inv => {
    const docType = inv.meta?.docType || 'invoice';
    if (invoiceFilterState.docType !== 'all' && docType !== invoiceFilterState.docType) {
      return false;
    }
    const cName = (inv.client?.name || '').trim();
    if (invoiceFilterState.client !== 'all' && cName !== invoiceFilterState.client) {
      return false;
    }
    if (invoiceFilterState.search) {
      const q = invoiceFilterState.search.toLowerCase();
      const num = (inv.meta?.number || '').toLowerCase();
      const clientStr = cName.toLowerCase();
      const emailStr = (inv.client?.email || '').toLowerCase();
      const itemsMatch = (inv.items || []).some(it => (it.description || '').toLowerCase().includes(q));
      if (!num.includes(q) && !clientStr.includes(q) && !emailStr.includes(q) && !itemsMatch) {
        return false;
      }
    }
    return true;
  });

  // 4. Update summary text
  const summaryEl = document.getElementById('invoices-filter-summary');
  if (summaryEl) {
    summaryEl.textContent = `Showing ${filtered.length} of ${invoices.length} document${invoices.length !== 1 ? 's' : ''}`;
  }

  // 5. Render list
  if (invoices.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:28px 0; color:#94a3b8; font-size:13px;">
        No saved invoices or documents yet. Click "Save" in the top bar to store your first record!
      </div>
    `;
    return;
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:24px 0; color:#94a3b8; font-size:13px;">
        No documents match your active filter.
        <div style="margin-top:8px;">
          <button type="button" class="btn btn-secondary btn-xs" id="btn-reset-filters">Clear All Filters</button>
        </div>
      </div>
    `;
    const btnReset = document.getElementById('btn-reset-filters');
    if (btnReset) {
      btnReset.addEventListener('click', () => {
        invoiceFilterState = { search: '', docType: 'all', client: 'all' };
        const searchInput = document.getElementById('filter-inv-search');
        if (searchInput) searchInput.value = '';
        if (clientFilterSelect) clientFilterSelect.value = 'all';
        document.querySelectorAll('#filter-type-chips .btn-filter-chip').forEach(c => {
          c.classList.toggle('active', c.dataset.type === 'all');
        });
        renderSavedInvoicesList();
      });
    }
    return;
  }

  container.innerHTML = filtered.map(inv => {
    const dateFormatted = inv.updatedAt ? new Date(inv.updatedAt).toLocaleDateString() : '—';
    const docType = inv.meta?.docType || 'invoice';
    const docBadge = docType !== 'invoice'
      ? `<span style="display:inline-block; font-size:10px; font-weight:700; padding:1px 6px; border-radius:4px; background:#e0f2fe; color:#0369a1; text-transform:uppercase; margin-left:6px;">${appEscapeHtml(docType)}</span>`
      : '';
    const safeInvId = appEscapeHtml(inv.id);
    // Frozen totals win; legacy records fall back to the shared calculator.
    const frozenInvTotal = (inv.total === undefined || inv.total === null) ? NaN : Number(inv.total);
    const invTotal = Number.isFinite(frozenInvTotal) ? frozenInvTotal : calculateTotal(inv);
    const invTotalText = formatMoney(invTotal, inv.meta?.currency || '$', inv.meta?.numberFormat || 'international');
    const conversionRemark = inv.convertedToNumber
      ? `<div style="font-size:11px; color:#0369a1; margin-top:3px;">Converted to ${appEscapeHtml(inv.convertedToNumber)}${inv.convertedAt ? ' on ' + appEscapeHtml(new Date(inv.convertedAt).toLocaleDateString()) : ''}</div>`
      : (inv.sourceDocNumber
        ? `<div style="font-size:11px; color:#7c3aed; margin-top:3px;">From ${appEscapeHtml(inv.sourceDocNumber)}</div>`
        : '');
    return `
      <div style="display:flex; align-items:center; justify-content:space-between; padding:12px 14px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px;">
        <div>
          <div style="font-size:13.5px; font-weight:700; color:#0f172a; display:flex; align-items:center; flex-wrap:wrap; gap:4px;">
            ${appEscapeHtml(inv.meta?.number || 'Document')}
            ${docBadge}
            <span style="color:#94a3b8; font-weight:400; margin:0 4px;">&bull;</span>
            ${appEscapeHtml(inv.client?.name || 'Client')}
          </div>
          <div style="font-size:11.5px; color:#64748b; margin-top:2px;">
            Updated: ${appEscapeHtml(dateFormatted)} &bull; ${appEscapeHtml(invTotalText)}
          </div>
          ${conversionRemark}
        </div>
        <div style="display:flex; gap:6px;">
          <button class="btn btn-primary btn-sm btn-load-inv" data-id="${safeInvId}">Load</button>
          <button class="btn btn-secondary btn-sm btn-dup-inv" data-id="${safeInvId}">Duplicate</button>
          <button class="btn btn-danger btn-sm btn-icon btn-del-inv" data-id="${safeInvId}" title="Delete">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.btn-load-inv').forEach(btn => {
    btn.addEventListener('click', async () => {
      await openDocumentInEditor(btn.dataset.id);
    });
  });

  container.querySelectorAll('.btn-dup-inv').forEach(btn => {
    btn.addEventListener('click', async () => {
      const inv = await getInvoice(btn.dataset.id);
      if (!inv) return;
      normalizeInvoice(inv);
      await duplicateDocument(inv);
      try { await renderSavedInvoicesList(); } catch (e) {}
    });
  });

  container.querySelectorAll('.btn-del-inv').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (confirm('Permanently delete this document? Conversion numbers already written into other records are kept as history text.')) {
        await deleteInvoice(btn.dataset.id);
        // If the deleted record is the one open in the editor, demote the
        // editor content to an unsaved draft: Home must never present it as a
        // saved record and type switching must work again (UI6).
        if (currentDocumentPersisted && btn.dataset.id === currentInvoice.id) {
          currentDocumentPersisted = false;
          delete currentInvoice.updatedAt;
          documentEdited = true;
          try {
            await saveActiveDraft(currentInvoice, { activeCompanyProfileId, documentEdited: true });
          } catch (e) { console.warn(e); }
          updateNumberingBadgeUI(currentNumberingConfig);
        }
        await updateSavedInvoicesCount();
        await renderSavedInvoicesList();
        await notifyDataChanged();
      }
    });
  });
}

async function renderClientsList() {
  const container = document.getElementById('clients-list');
  if (!container) return;
  const clients = await getAllClients();
  const allInvoices = await getAllInvoices();

  if (clients.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:24px 0; color:#94a3b8; font-size:13px;">
        No clients in directory yet. Click "Add to Clients" in the Bill-To section to save one.
      </div>
    `;
    return;
  }

  container.innerHTML = clients.map(c => {
    const cNameClean = (c.name || '').trim().toLowerCase();
    const clientDocs = allInvoices.filter(inv => {
      const invCName = (inv.client?.name || '').trim().toLowerCase();
      // Durable-link match: saved documents keep the client link at top level
      // (clientId), while older/snapshot shapes may carry it on client.id.
      // Check both — guarded against records with no id — so a client rename
      // never orphans its linked documents.
      const idMatch = Boolean(c.id) && ((inv.client?.id === c.id) || (inv.clientId === c.id));
      return (invCName && invCName === cNameClean) || idMatch;
    });

    // Client totals are revenue-style (M2/M3): saved invoices only — quotes,
    // estimates, proformas, and draft-status documents are pipeline, not
    // revenue — grouped by canonical currency so mixed-currency histories are
    // never summed into one meaningless number.
    const invoiceDocs = clientDocs.filter(inv => {
      const docType = inv.meta?.docType || 'invoice';
      if (docType !== 'invoice') return false;
      return (inv.meta?.status || inv.status || 'pending') !== 'draft';
    });
    const totalsByCurrency = new Map();
    invoiceDocs.forEach(inv => {
      const currency = inv.meta?.currency || '$';
      const canonical = normalizeCurrency(currency);
      const key = canonical.key || String(currency).trim().toUpperCase();
      const frozen = (inv.total === undefined || inv.total === null) ? NaN : Number(inv.total);
      const value = Number.isFinite(frozen) ? frozen : calculateTotal(inv);
      const entry = totalsByCurrency.get(key) || {
        currency,
        numberFormat: inv.meta?.numberFormat || 'international',
        total: 0
      };
      entry.total += value;
      totalsByCurrency.set(key, entry);
    });
    const totalBilledText = Array.from(totalsByCurrency.values())
      .map(entry => formatMoney(entry.total, entry.currency, entry.numberFormat))
      .join(' • ');

    const docCountLabel = clientDocs.length === 0
      ? `<span style="font-size:11px; color:#94a3b8;">No documents yet</span>`
      : `<span style="font-size:11px; font-weight:600; color:#0369a1; background:#e0f2fe; padding:2px 8px; border-radius:10px;">${clientDocs.length} doc${clientDocs.length > 1 ? 's' : ''}${totalBilledText ? ` &bull; Invoiced Total: ${appEscapeHtml(totalBilledText)}` : ''}</span>`;

    const docsDrawerHtml = clientDocs.length > 0 ? `
      <div class="client-docs-drawer" id="client-drawer-${appEscapeHtml(c.id)}" style="display:none;">
        <div style="font-size:11px; font-weight:700; color:#475569; margin-bottom:6px; text-transform:uppercase; letter-spacing:0.4px;">
          Previous Documents for ${appEscapeHtml(c.name)}:
        </div>
        ${clientDocs.map(doc => {
          const docType = doc.meta?.docType || 'invoice';
          // History rows show the frozen total when present, else the shared
          // calculator, always formatted per the document's own currency and
          // number format (M3/L2).
          const frozenDocTotal = (doc.total === undefined || doc.total === null) ? NaN : Number(doc.total);
          const docTotal = formatMoney(
            Number.isFinite(frozenDocTotal) ? frozenDocTotal : calculateTotal(doc),
            doc.meta?.currency || '$',
            doc.meta?.numberFormat || 'international'
          );
          const docDate = doc.updatedAt ? new Date(doc.updatedAt).toLocaleDateString() : '';
          return `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 10px; background:#ffffff; border:1px solid #e2e8f0; border-radius:6px; margin-bottom:4px;">
              <div>
                <span style="font-size:12px; font-weight:700; color:#0f172a;">${appEscapeHtml(doc.meta?.number || 'Doc')}</span>
                <span style="font-size:9.5px; font-weight:700; padding:1px 5px; border-radius:3px; background:#e0f2fe; color:#0369a1; text-transform:uppercase; margin-left:4px;">${appEscapeHtml(docType)}</span>
                <span style="font-size:11px; color:#64748b; margin-left:6px;">${docDate} &bull; ${docTotal}</span>
                ${doc.convertedToNumber ? `<div style="font-size:10.5px; color:#0369a1; margin-top:2px;">Converted to ${appEscapeHtml(doc.convertedToNumber)}</div>` : ''}
                ${doc.sourceDocNumber ? `<div style="font-size:10.5px; color:#7c3aed; margin-top:2px;">From ${appEscapeHtml(doc.sourceDocNumber)}</div>` : ''}
              </div>
              <button class="btn btn-primary btn-xs btn-load-client-subdoc" data-doc-id="${appEscapeHtml(doc.id)}">Load</button>
            </div>
          `;
        }).join('')}
      </div>
    ` : '';

    return `
      <div style="padding:12px 14px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px;">
        <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px;">
          <div>
            <div style="font-size:13.5px; font-weight:700; color:#0f172a; display:flex; align-items:center; gap:8px;">
              ${appEscapeHtml(c.name)}
              ${docCountLabel}
            </div>
            <div style="font-size:11.5px; color:#64748b; margin-top:3px;">
              ${appEscapeHtml(c.email || 'No email')} ${c.phone ? ' &bull; ' + appEscapeHtml(c.phone) : ''} ${c.taxId ? ' &bull; Tax: ' + appEscapeHtml(c.taxId) : ''}
            </div>
          </div>
          <div style="display:flex; gap:6px; align-items:center;">
            ${clientDocs.length > 0 ? `<button class="btn btn-secondary btn-sm btn-toggle-client-history" data-client-id="${appEscapeHtml(c.id)}">History (${clientDocs.length})</button>` : ''}
            <button class="btn btn-primary btn-sm btn-select-client" data-id="${appEscapeHtml(c.id)}" title="Fill this client into current document">Use Client</button>
            <button class="btn btn-secondary btn-sm btn-new-for-client" data-id="${appEscapeHtml(c.id)}" title="Start fresh document for this client">+ New Doc</button>
            <button class="btn btn-danger btn-sm btn-icon btn-del-client" data-id="${appEscapeHtml(c.id)}" title="Delete client">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </div>
        ${docsDrawerHtml}
      </div>
    `;
  }).join('');

  // Bind History toggle buttons
  container.querySelectorAll('.btn-toggle-client-history').forEach(btn => {
    btn.addEventListener('click', () => {
      const drawer = document.getElementById(`client-drawer-${btn.dataset.clientId}`);
      if (drawer) {
        const isHidden = drawer.style.display === 'none';
        drawer.style.display = isHidden ? 'block' : 'none';
        btn.textContent = isHidden ? 'Hide History' : `History (${drawer.querySelectorAll('.btn-load-client-subdoc').length})`;
      }
    });
  });

  // Bind loading a sub-document from client history
  container.querySelectorAll('.btn-load-client-subdoc').forEach(btn => {
    btn.addEventListener('click', async () => {
      await openDocumentInEditor(btn.dataset.docId);
    });
  });

  // Bind Use Client
  container.querySelectorAll('.btn-select-client').forEach(btn => {
    btn.addEventListener('click', async () => {
      const match = clients.find(c => c.id === btn.dataset.id);
      if (match) {
        currentInvoice.client = {
          id: match.id,
          name: match.name,
          email: match.email || '',
          phone: match.phone || '',
          address: match.address || '',
          taxId: match.taxId || ''
        };
        currentInvoice.clientId = match.id;
        populateFormFields();
        updateSheetView();
        triggerAutoSave();
        closeModal('modal-clients');
        navigateTo('compose');
      }
    });
  });

  // Bind + New Doc for Client
  container.querySelectorAll('.btn-new-for-client').forEach(btn => {
    btn.addEventListener('click', async () => {
      const match = clients.find(c => c.id === btn.dataset.id);
      if (match) {
        closeModal('modal-clients');
        await requestNewDocument(activeDocType(), match);
      }
    });
  });

  // Bind Delete Client
  container.querySelectorAll('.btn-del-client').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (confirm('Permanently delete this client from your address book?')) {
        await deleteClient(btn.dataset.id);
        await renderClientsList();
        await notifyDataChanged();
      }
    });
  });
}

// ============================================================================
// 12. CANVAS ZOOM CONTROLS
// ============================================================================
function attachZoomListeners() {
  const container = document.getElementById('sheet-container');
  const indicator = document.getElementById('scale-indicator');
  if (!container || !indicator) return;

  const updateZoom = () => {
    container.style.transform = `scale(${canvasZoom})`;
    indicator.textContent = Math.round(canvasZoom * 100) + '%';
  };

  document.getElementById('btn-zoom-in').addEventListener('click', () => {
    if (canvasZoom < 1.4) {
      canvasZoom = Math.round((canvasZoom + 0.1) * 10) / 10;
      updateZoom();
    }
  });

  document.getElementById('btn-zoom-out').addEventListener('click', () => {
    if (canvasZoom > 0.5) {
      canvasZoom = Math.round((canvasZoom - 0.1) * 10) / 10;
      updateZoom();
    }
  });

  document.getElementById('btn-zoom-fit').addEventListener('click', () => {
    canvasZoom = 0.85;
    updateZoom();
  });

  const pageBadge = document.getElementById('canvas-page-badge');
  if (pageBadge) {
    pageBadge.addEventListener('click', () => {
      showPageBreakGuides = !showPageBreakGuides;
      updateDocumentPaginationLive();
    });
  }
}

// ============================================================================
// 13. AUTO-SAVE DEBOUNCER
// ============================================================================
function triggerAutoSave() {
  documentEdited = true;
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(async () => {
    try {
      autosaveInFlight = saveActiveDraft(currentInvoice, { activeCompanyProfileId, documentEdited });
      await autosaveInFlight;
    } catch (e) {
      console.warn('Auto-save error:', e);
    } finally {
      autosaveInFlight = null;
      autoSaveTimer = null;
    }
  }, 600);
}

function appEscapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// First-run accessibility + keyboard upgrade (progressive enhancement, no layout change).
function enhanceAccessibility() {
  try {
    // Close (×) buttons need accessible names.
    document.querySelectorAll('.app-modal .modal-header .btn').forEach(btn => {
      if ((btn.textContent || '').trim() === '×' && !btn.getAttribute('aria-label')) {
        btn.setAttribute('aria-label', 'Close dialog');
      }
    });
    // Pills expose expanded state.
    document.querySelectorAll('#sidebar-pills-bar .nav-pill').forEach(pill => {
      const target = pill.dataset.target;
      if (target && !pill.hasAttribute('aria-controls')) pill.setAttribute('aria-controls', target);
      if (!pill.hasAttribute('aria-expanded')) {
        pill.setAttribute('aria-expanded', pill.classList.contains('active') ? 'true' : 'false');
      }
    });
    // Doc-type cards: keep aria-checked in sync + keyboard activation.
    const cards = document.querySelectorAll('#doc-type-cards-grid .doc-type-card');
    cards.forEach(card => {
      if (!card.hasAttribute('tabindex')) card.setAttribute('tabindex', '0');
      if (!card.hasAttribute('role')) card.setAttribute('role', 'radio');
      if (!card.hasAttribute('aria-label')) {
        const t = card.querySelector('.doc-type-card-title');
        card.setAttribute('aria-label', t ? t.textContent.trim() : (card.dataset.type || 'document type'));
      }
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          card.click();
        }
      });
    });
    // Color swatches: keyboard operable.
    document.querySelectorAll('.color-swatch').forEach(sw => {
      if (!sw.hasAttribute('tabindex')) sw.setAttribute('tabindex', '0');
      if (!sw.hasAttribute('role')) sw.setAttribute('role', 'button');
      if (!sw.hasAttribute('aria-label')) sw.setAttribute('aria-label', 'Accent color ' + (sw.dataset.color || ''));
      sw.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          sw.click();
        }
      });
    });
    // Live regions for dynamic status text.
    ['scale-indicator', 'canvas-page-text'].forEach(id => {
      const el = document.getElementById(id);
      if (el && !el.hasAttribute('aria-live')) el.setAttribute('aria-live', 'polite');
    });
    // Upload preview image needs alt.
    const upImg = document.getElementById('upload-preview-img');
    if (upImg && !upImg.getAttribute('alt')) upImg.setAttribute('alt', 'Uploaded logo preview');
  } catch (e) {}
}

function syncDocTypeCardA11y(docType) {
  try {
    document.querySelectorAll('#doc-type-cards-grid .doc-type-card').forEach(card => {
      card.setAttribute('aria-checked', card.dataset.type === docType ? 'true' : 'false');
    });
    document.querySelectorAll('#sidebar-pills-bar .nav-pill').forEach(pill => {
      const sec = document.getElementById(pill.dataset.target);
      pill.setAttribute('aria-expanded', sec && sec.style.display !== 'none' ? 'true' : 'false');
    });
  } catch (e) {}
}

function generateId(prefix) {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return (prefix || 'id_') + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    }
  } catch (e) {}
  return (prefix || 'id_') + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
}

function isValidLogoDataUri(uri) {
  if (!uri || typeof uri !== 'string') return false;
  return /^data:image\/(png|jpeg|jpg|webp|gif|svg\+xml);base64,/i.test(uri) ||
    /^data:image\/svg\+xml(;charset=[^;,]+)?(;base64)?,/i.test(uri);
}

function formatTaxId(taxId, defaultPrefix = 'Tax ID') {
  if (!taxId || !taxId.trim()) return '';
  const trimmed = taxId.trim();
  const lower = trimmed.toLowerCase();

  // If already starts with a common recognized tax prefix, preserve it cleanly
  if (lower.startsWith('tax id') || lower.startsWith('tax:') || lower.startsWith('gstin') || 
      lower.startsWith('gst') || lower.startsWith('vat') || lower.startsWith('ein') || 
      lower.startsWith('pan') || lower.startsWith('abn')) {
    return trimmed;
  }

  // Check for Indian 15-character GSTIN format
  if (/^[0-9]{2}[a-zA-Z]{5}[0-9]{4}[a-zA-Z]{1}[1-9a-zA-Z]{1}[zZ]{1}[0-9a-zA-Z]{1}$/.test(trimmed)) {
    return `GSTIN: ${trimmed.toUpperCase()}`;
  }

  // Check for Indian 10-character PAN format
  if (/^[a-zA-Z]{5}[0-9]{4}[a-zA-Z]{1}$/.test(trimmed)) {
    return `PAN: ${trimmed.toUpperCase()}`;
  }

  return `${defaultPrefix}: ${trimmed}`;
}

function isDummyApexPayment(text) {
  if (!text) return false;
  return text.includes('First National Tech Bank') || text.includes('pay@apexstudio.io') || text.includes('FNTB-US-33');
}

// ============================================================================
// 13. LIVE A4 PAGINATION ENGINE
// ============================================================================
let showPageBreakGuides = false; // Kept false by default to prevent intrusive dashed lines across the invoice canvas

function updateDocumentPaginationLive() {
  const sheet = document.getElementById('invoice-sheet');
  const badge = document.getElementById('canvas-page-badge');
  const textEl = document.getElementById('canvas-page-text');
  if (!sheet || !badge || !textEl) return;

  // Measuring a hidden sheet returns 0 and would corrupt the page badge.
  // It is recomputed when the Compose route becomes visible.
  if (document.body.dataset.view && document.body.dataset.view !== 'compose') return;
  if (getCurrentView() !== 'compose') return;
  if (!sheet.offsetParent) return;

  requestAnimationFrame(() => {
    // 297mm standard A4 height in pixels at standard 96 DPI: 297 * 96 / 25.4 = 1122.52px
    const a4PageHeightPx = 1122;
    const contentHeight = sheet.scrollHeight;

    // Buffer tolerance for subpixel antialiasing & screen vs print padding disparity
    // On screen, the sheet has min-height: 297mm (1122px). If content is within 1195px,
    // it will comfortably fit in a single 1-page A4 print due to tight print margins.
    let estimatedPages = 1;
    if (contentHeight > 1195) {
      estimatedPages = Math.max(1, Math.ceil((contentHeight - 40) / a4PageHeightPx));
    }

    if (estimatedPages === 1) {
      badge.classList.remove('multi-page');
      textEl.textContent = 'A4: 1 Page';
      badge.title = 'Document fits cleanly on 1 single page (A4). Click to toggle visual boundary guides.';
    } else {
      badge.classList.add('multi-page');
      textEl.textContent = `A4: ${estimatedPages} Pages`;
      badge.title = `Document spans across ${estimatedPages} pages. Table headers will automatically repeat at the top of each page when printing. Click to toggle visual boundary guides.`;
    }

    if (showPageBreakGuides) {
      badge.classList.add('guides-active');
    } else {
      badge.classList.remove('guides-active');
    }

    renderVisualPageBreakGuides(sheet, estimatedPages, a4PageHeightPx);
  });
}

function renderVisualPageBreakGuides(sheet, totalPages, pageHeightPx) {
  // Always clean up existing guide lines
  sheet.querySelectorAll('.canvas-page-break-line').forEach(el => el.remove());

  // Only render visual guide lines if multi-page AND user explicitly enabled guides
  if (totalPages <= 1 || !showPageBreakGuides) return;

  for (let p = 1; p < totalPages; p++) {
    const guide = document.createElement('div');
    guide.className = 'canvas-page-break-line';
    guide.style.top = `${p * pageHeightPx}px`;
    guide.setAttribute('data-page-label', `Page ${p + 1} Boundary (A4)`);
    sheet.appendChild(guide);
  }
}

window.addEventListener('resize', () => {
  if (document.body.dataset.view === 'compose' && getCurrentView() === 'compose') {
    updateDocumentPaginationLive();
  }
});

})();
