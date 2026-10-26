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

export const DEFAULT_NUMBERING_CONFIG = {
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
export function normalizeNumberingConfig(config) {
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
export function formatFinancialYear(date) {
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

export function resolvePeriodKey(date, resetPeriod) {
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
export function parseLocalDate(value) {
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
export function getCounter(config, docType) {
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
export function advanceTypeCounter(config, docType) {
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
export function generateDocumentNumber(docType, dateStr, config, overrideCounter = null) {
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
export function periodRollover(config, now = new Date()) {
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
