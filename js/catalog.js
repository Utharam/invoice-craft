/**
 * InvoiceCraft — saved item catalog (pure, dependency-light).
 *
 * Normalization, dedupe keys, picker grouping and line-item conversion for
 * the persistent item library (global + company scope). No storage here:
 * js/db.js owns the IndexedDB v4 `catalogItems` store and calls into this
 * module for every write. Pure functions only — the same inputs always
 * produce the same record, so `catalogMatchKey` can drive dedupe anywhere.
 */

import { normalizeCurrency, clampNum } from './calc.js';

/** Valid library scopes, in display order (global items are shown first). */
export const CATALOG_SCOPES = ['global', 'company'];

/**
 * Canonical scope for any stored value: only 'company' (any casing) maps to
 * the company scope; everything else falls back to 'global'.
 */
export function normalizeCatalogScope(value) {
  return (String(value === null || value === undefined ? '' : value).trim().toLowerCase() === 'company')
    ? 'company'
    : 'global';
}

/** Trimmed lowercase search/dedupe key for a catalog description. */
export function catalogDescriptionKey(text) {
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
export function normalizeCatalogItem(item, { id, now } = {}) {
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
export function catalogMatchKey(item) {
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
export function findCatalogMatch(items, candidate) {
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
export function buildCatalogCandidateFromLineItem(lineItem, { scope, companyId, currency, currencyKey } = {}) {
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
export function catalogItemToLineItem(item) {
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
export function groupCatalogItemsForView(items, { search, currencyKey, companyId } = {}) {
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
