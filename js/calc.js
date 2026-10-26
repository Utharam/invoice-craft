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
export function clampNum(value, min, max, fallback = 0) {
  const n = parseFloat(value);
  if (!isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// ============================================================================
// 2. CURRENCY REGISTRY
// ============================================================================
export const CURRENCY_REGISTRY = {
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
export function normalizeCurrency(value) {
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
export function formatMoney(amount, currency = '', format = 'international') {
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

export function amountToWords(amount, currency = '$', format = 'international') {
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
export function calculateTotals(invoice) {
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
export function calculateTotal(invoice) {
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
export function splitTaxLegs(taxes, totalTax, decimals = 2) {
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
