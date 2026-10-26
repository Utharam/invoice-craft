import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CATALOG_SCOPES,
  normalizeCatalogScope,
  catalogDescriptionKey,
  normalizeCatalogItem,
  catalogMatchKey,
  findCatalogMatch,
  buildCatalogCandidateFromLineItem,
  catalogItemToLineItem,
  groupCatalogItemsForView
} from '../js/catalog.js';

// ---------------------------------------------------------------------------
// Scopes
// ---------------------------------------------------------------------------
test('CATALOG_SCOPES lists global first, company second', () => {
  assert.deepEqual(CATALOG_SCOPES, ['global', 'company']);
});

test('normalizeCatalogScope accepts only global/company and defaults to global', () => {
  assert.equal(normalizeCatalogScope('global'), 'global');
  assert.equal(normalizeCatalogScope('company'), 'company');
  assert.equal(normalizeCatalogScope('Company'), 'company');
  assert.equal(normalizeCatalogScope('  COMPANY '), 'company');
  assert.equal(normalizeCatalogScope('weird'), 'global');
  assert.equal(normalizeCatalogScope(''), 'global');
  assert.equal(normalizeCatalogScope(null), 'global');
  assert.equal(normalizeCatalogScope(undefined), 'global');
  assert.equal(normalizeCatalogScope(42), 'global');
});

// ---------------------------------------------------------------------------
// Description key
// ---------------------------------------------------------------------------
test('catalogDescriptionKey trims and lowercases', () => {
  assert.equal(catalogDescriptionKey('  Paper A4  '), 'paper a4');
  assert.equal(catalogDescriptionKey('PAPER A4'), 'paper a4');
  assert.equal(catalogDescriptionKey('Paper A4'), 'paper a4'); // idempotent
  assert.equal(catalogDescriptionKey(''), '');
  assert.equal(catalogDescriptionKey('   '), '');
  assert.equal(catalogDescriptionKey(null), '');
  assert.equal(catalogDescriptionKey(undefined), '');
  assert.equal(catalogDescriptionKey(42), '');
});

// ---------------------------------------------------------------------------
// normalizeCatalogItem
// ---------------------------------------------------------------------------
test('normalizeCatalogItem stamps a full record for a fresh item', () => {
  const record = normalizeCatalogItem(
    {
      description: '  Paper A4  ',
      hsn: 4802,
      rate: '12.5',
      taxRate: 18,
      currency: '$',
      scope: 'company',
      companyId: 'comp_1'
    },
    { id: 'cat_1', now: 1000 }
  );

  assert.deepEqual(record, {
    id: 'cat_1',
    description: 'Paper A4',
    descriptionKey: 'paper a4',
    hsn: '4802',
    rate: 12.5,
    taxRate: 18,
    currency: '$',
    currencyKey: 'USD',
    scope: 'company',
    companyId: 'comp_1',
    usageCount: 0,
    lastUsedAt: null,
    createdAt: 1000,
    updatedAt: 1000
  });
});

test('normalizeCatalogItem preserves createdAt/usageCount/lastUsedAt on update', () => {
  const existing = {
    id: 'cat_1',
    description: 'Paper A4',
    descriptionKey: 'paper a4',
    hsn: '4802',
    rate: 12.5,
    taxRate: 18,
    currency: '$',
    currencyKey: 'USD',
    scope: 'company',
    companyId: 'comp_1',
    usageCount: 7,
    lastUsedAt: 900,
    createdAt: 500,
    updatedAt: 900
  };

  const updated = normalizeCatalogItem(
    Object.assign({}, existing, { description: 'Paper A4 Premium', rate: 15 }),
    { now: 2000 }
  );

  assert.equal(updated.id, 'cat_1');
  assert.equal(updated.description, 'Paper A4 Premium');
  assert.equal(updated.descriptionKey, 'paper a4 premium');
  assert.equal(updated.rate, 15);
  assert.equal(updated.createdAt, 500); // preserved
  assert.equal(updated.usageCount, 7); // preserved
  assert.equal(updated.lastUsedAt, 900); // preserved
  assert.equal(updated.updatedAt, 2000); // re-stamped
  assert.equal(updated.currencyKey, 'USD');
});

test('normalizeCatalogItem clamps rate >= 0 and taxRate 0-100', () => {
  const base = { description: 'X', currency: '$', scope: 'global' };

  assert.equal(normalizeCatalogItem(Object.assign({}, base, { rate: -5 }), { id: 'c', now: 1 }).rate, 0);
  assert.equal(normalizeCatalogItem(Object.assign({}, base, { rate: 'abc' }), { id: 'c', now: 1 }).rate, 0);
  assert.equal(normalizeCatalogItem(Object.assign({}, base, { rate: undefined }), { id: 'c', now: 1 }).rate, 0);
  assert.equal(normalizeCatalogItem(Object.assign({}, base, { rate: 999 }), { id: 'c', now: 1 }).rate, 999);

  assert.equal(normalizeCatalogItem(Object.assign({}, base, { taxRate: 150 }), { id: 'c', now: 1 }).taxRate, 100);
  assert.equal(normalizeCatalogItem(Object.assign({}, base, { taxRate: -3 }), { id: 'c', now: 1 }).taxRate, 0);
  assert.equal(normalizeCatalogItem(Object.assign({}, base, { taxRate: 0 }), { id: 'c', now: 1 }).taxRate, 0);
  assert.equal(normalizeCatalogItem(Object.assign({}, base, { taxRate: '' }), { id: 'c', now: 1 }).taxRate, 18);
  assert.equal(normalizeCatalogItem(Object.assign({}, base, { taxRate: 'xyz' }), { id: 'c', now: 1 }).taxRate, 18);
  assert.equal(normalizeCatalogItem(Object.assign({}, base, { taxRate: undefined }), { id: 'c', now: 1 }).taxRate, 18);
});

test('normalizeCatalogItem normalizes currency to canonical key and symbol', () => {
  const base = { description: 'X', scope: 'global' };

  const usd = normalizeCatalogItem(Object.assign({}, base, { currency: 'usd' }), { id: 'c', now: 1 });
  assert.equal(usd.currency, '$');
  assert.equal(usd.currencyKey, 'USD');

  const rupee = normalizeCatalogItem(Object.assign({}, base, { currency: '₹' }), { id: 'c', now: 1 });
  assert.equal(rupee.currency, '₹');
  assert.equal(rupee.currencyKey, 'INR');

  const none = normalizeCatalogItem(Object.assign({}, base, { currency: '' }), { id: 'c', now: 1 });
  assert.equal(none.currency, '');
  assert.equal(none.currencyKey, '');
});

test('normalizeCatalogItem forces companyId null for global scope', () => {
  const item = normalizeCatalogItem(
    { description: 'X', scope: 'global', companyId: 'comp_1' },
    { id: 'c', now: 1 }
  );
  assert.equal(item.scope, 'global');
  assert.equal(item.companyId, null);

  const defaulted = normalizeCatalogItem({ description: 'X' }, { id: 'c', now: 1 });
  assert.equal(defaulted.scope, 'global');
  assert.equal(defaulted.companyId, null);

  const orphan = normalizeCatalogItem(
    { description: 'X', scope: 'company', companyId: '   ' },
    { id: 'c', now: 1 }
  );
  assert.equal(orphan.scope, 'company');
  assert.equal(orphan.companyId, null);
});

test('normalizeCatalogItem generates an id and stamps time when not provided', () => {
  const record = normalizeCatalogItem({ description: 'X' });
  assert.match(record.id, /^cat_/);
  assert.ok(Number.isFinite(record.updatedAt) && record.updatedAt > 0);
  assert.equal(record.createdAt, record.updatedAt);
  assert.equal(record.usageCount, 0);
  assert.equal(record.lastUsedAt, null);
  assert.equal(record.description, 'X');
  assert.equal(record.descriptionKey, 'x');
});

test('normalizeCatalogItem tolerates null/non-object input', () => {
  const record = normalizeCatalogItem(null, { id: 'cat_x', now: 5 });
  assert.equal(record.id, 'cat_x');
  assert.equal(record.description, '');
  assert.equal(record.descriptionKey, '');
  assert.equal(record.scope, 'global');
  assert.equal(record.companyId, null);
});

// ---------------------------------------------------------------------------
// Match key + dedupe
// ---------------------------------------------------------------------------
test('catalogMatchKey joins scope, companyId, currencyKey and descriptionKey', () => {
  const item = normalizeCatalogItem(
    { description: 'Paper A4', scope: 'company', companyId: 'comp_1', currency: '$' },
    { id: 'cat_1', now: 1 }
  );
  assert.equal(catalogMatchKey(item), 'company|comp_1|USD|paper a4');

  const globalItem = normalizeCatalogItem(
    { description: 'Paper A4', scope: 'global', companyId: 'comp_1', currency: '$' },
    { id: 'cat_2', now: 1 }
  );
  assert.equal(catalogMatchKey(globalItem), 'global||USD|paper a4');
});

test('catalogMatchKey normalizes raw candidates so duplicates collide', () => {
  const stored = normalizeCatalogItem(
    { description: 'Paper A4', scope: 'company', companyId: 'comp_1', currency: '$' },
    { id: 'cat_1', now: 1 }
  );
  // Raw candidate: different case, extra whitespace, symbol currency.
  const candidate = {
    description: '  paper a4  ',
    scope: 'Company',
    companyId: 'comp_1',
    currency: '$'
  };
  assert.equal(catalogMatchKey(candidate), catalogMatchKey(stored));

  // Same description in a different currency does NOT match.
  const otherCurrency = Object.assign({}, candidate, { currency: '₹' });
  assert.notEqual(catalogMatchKey(otherCurrency), catalogMatchKey(stored));

  // Same description for a different company does NOT match.
  const otherCompany = Object.assign({}, candidate, { companyId: 'comp_2' });
  assert.notEqual(catalogMatchKey(otherCompany), catalogMatchKey(stored));
});

test('findCatalogMatch returns the matching item or null', () => {
  const a = normalizeCatalogItem({ description: 'Paper A4', scope: 'global', currency: '$' }, { id: 'cat_a', now: 1 });
  const b = normalizeCatalogItem({ description: 'Logo print', scope: 'company', companyId: 'comp_1', currency: '$' }, { id: 'cat_b', now: 1 });
  const items = [a, b];

  assert.equal(findCatalogMatch(items, { description: 'PAPER A4', scope: 'global', currency: '$' }), a);
  assert.equal(
    findCatalogMatch(items, buildCatalogCandidateFromLineItem(
      { description: 'Logo print', rate: 1 },
      { scope: 'company', companyId: 'comp_1', currency: '$' }
    )),
    b
  );
  assert.equal(findCatalogMatch(items, { description: 'Unknown', scope: 'global', currency: '$' }), null);
  assert.equal(findCatalogMatch(null, { description: 'Paper A4' }), null);
  assert.equal(findCatalogMatch(items, null), null);
});

// ---------------------------------------------------------------------------
// Line item -> candidate
// ---------------------------------------------------------------------------
test('buildCatalogCandidateFromLineItem builds a minimal normalized candidate', () => {
  const lineItem = {
    id: 'li_1',
    description: 'Design work',
    hsn: '99',
    qty: 3,
    rate: 100,
    discount: 10,
    taxRate: 18
  };

  const candidate = buildCatalogCandidateFromLineItem(lineItem, {
    scope: 'company',
    companyId: 'comp_1',
    currency: '$'
  });

  // Minimal: qty/discount/line id must not leak into the catalog candidate.
  assert.deepEqual(candidate, {
    description: 'Design work',
    hsn: '99',
    rate: 100,
    taxRate: 18,
    scope: 'company',
    companyId: 'comp_1',
    currency: '$',
    currencyKey: 'USD'
  });

  // It dedupes against an already-saved item.
  const saved = normalizeCatalogItem(candidate, { id: 'cat_1', now: 1 });
  assert.equal(catalogMatchKey(saved), catalogMatchKey(candidate));
});

test('buildCatalogCandidateFromLineItem normalizes scope and tolerates missing fields', () => {
  const candidate = buildCatalogCandidateFromLineItem(
    { description: 'Design work' },
    { scope: 'bogus', companyId: null, currency: '₹', currencyKey: undefined }
  );
  assert.equal(candidate.scope, 'global');
  assert.equal(candidate.companyId, null);
  assert.equal(candidate.currency, '₹');
  assert.equal(candidate.currencyKey, 'INR');
  assert.equal(candidate.hsn, '');
  assert.equal(candidate.rate, undefined);
});

// ---------------------------------------------------------------------------
// Catalog item -> line item
// ---------------------------------------------------------------------------
test('catalogItemToLineItem converts with qty 1 and discount 0', () => {
  const item = normalizeCatalogItem(
    { description: 'Paper A4', hsn: '4802', rate: 12.5, taxRate: 18, currency: '$', scope: 'global' },
    { id: 'cat_1', now: 1 }
  );

  assert.deepEqual(catalogItemToLineItem(item), {
    description: 'Paper A4',
    hsn: '4802',
    qty: 1,
    rate: 12.5,
    discount: 0,
    taxRate: 18
  });
});

test('catalogItemToLineItem applies catalog defaults for missing fields', () => {
  assert.deepEqual(
    catalogItemToLineItem({ description: 'Bare', rate: -4, taxRate: 200 }),
    { description: 'Bare', hsn: '', qty: 1, rate: 0, discount: 0, taxRate: 100 }
  );
  assert.deepEqual(
    catalogItemToLineItem(null),
    { description: '', hsn: '', qty: 1, rate: 0, discount: 0, taxRate: 18 }
  );
});

// ---------------------------------------------------------------------------
// Grouping for the picker view
// ---------------------------------------------------------------------------
function buildFixtureItems() {
  return [
    normalizeCatalogItem({ description: 'Paper A4', scope: 'global', currency: '$' }, { id: 'g1', now: 4 }),
    normalizeCatalogItem({ description: 'Logo print', scope: 'company', companyId: 'comp_1', currency: '$' }, { id: 'c1', now: 3 }),
    normalizeCatalogItem({ description: 'Other co item', scope: 'company', companyId: 'comp_2', currency: '$' }, { id: 'c2', now: 2 }),
    normalizeCatalogItem({ description: 'Rupee item', scope: 'global', currency: '₹' }, { id: 'g2', now: 1 })
  ];
}

test('groupCatalogItemsForView shows global first, company second, currency filtered', () => {
  const groups = groupCatalogItemsForView(buildFixtureItems(), {
    search: '',
    currencyKey: '$',
    companyId: 'comp_1'
  });

  assert.deepEqual(groups.map(g => g.scope), ['global', 'company']);
  assert.deepEqual(groups.map(g => g.label), ['Global items', 'Company items']);
  assert.deepEqual(groups[0].items.map(i => i.id), ['g1']);
  assert.deepEqual(groups[1].items.map(i => i.id), ['c1']);
});

test('groupCatalogItemsForView filters by canonical currencyKey', () => {
  const groups = groupCatalogItemsForView(buildFixtureItems(), {
    search: '',
    currencyKey: 'usd', // non-canonical input must still work
    companyId: 'comp_1'
  });
  assert.deepEqual(groups.map(g => g.scope), ['global', 'company']);

  const inrGroups = groupCatalogItemsForView(buildFixtureItems(), {
    search: '',
    currencyKey: '₹',
    companyId: 'comp_1'
  });
  assert.equal(inrGroups.length, 1);
  assert.equal(inrGroups[0].scope, 'global');
  assert.deepEqual(inrGroups[0].items.map(i => i.id), ['g2']);
});

test('groupCatalogItemsForView searches case-insensitively across both groups', () => {
  const items = buildFixtureItems();
  items.push(
    normalizeCatalogItem({ description: 'Sticker sheet', hsn: '4802', scope: 'global', currency: '$' }, { id: 'g3', now: 5 })
  );

  const byDescription = groupCatalogItemsForView(items, { search: 'LOGO', currencyKey: '$', companyId: 'comp_1' });
  assert.equal(byDescription.length, 1);
  assert.equal(byDescription[0].scope, 'company');
  assert.deepEqual(byDescription[0].items.map(i => i.id), ['c1']);

  // HSN search reaches both groups.
  const byHsn = groupCatalogItemsForView(items, { search: '4802', currencyKey: '$', companyId: 'comp_1' });
  assert.deepEqual(byHsn.map(g => g.scope), ['global']);
  assert.deepEqual(byHsn[0].items.map(i => i.id), ['g3']);

  const noHits = groupCatalogItemsForView(items, { search: 'zzz', currencyKey: '$', companyId: 'comp_1' });
  assert.deepEqual(noHits, []);

  // Whitespace search behaves like no search.
  const blank = groupCatalogItemsForView(items, { search: '   ', currencyKey: '$', companyId: 'comp_1' });
  assert.deepEqual(blank.map(g => g.scope), ['global', 'company']);
});

test('groupCatalogItemsForView omits company group without an active company', () => {
  const groups = groupCatalogItemsForView(buildFixtureItems(), {
    search: '',
    currencyKey: '$',
    companyId: null
  });
  assert.deepEqual(groups.map(g => g.scope), ['global']);
  assert.deepEqual(groups[0].items.map(i => i.id), ['g1']);

  const noCompanyIdOption = groupCatalogItemsForView(buildFixtureItems(), { search: '', currencyKey: '$' });
  assert.deepEqual(noCompanyIdOption.map(g => g.scope), ['global']);
});

test('groupCatalogItemsForView omits empty groups and tolerates bad input', () => {
  const onlyCompany = [
    normalizeCatalogItem({ description: 'Logo print', scope: 'company', companyId: 'comp_1', currency: '$' }, { id: 'c1', now: 1 })
  ];
  const groups = groupCatalogItemsForView(onlyCompany, { search: '', currencyKey: '$', companyId: 'comp_1' });
  assert.deepEqual(groups.map(g => g.scope), ['company']);

  assert.deepEqual(groupCatalogItemsForView([], { search: '', currencyKey: '$', companyId: 'comp_1' }), []);
  assert.deepEqual(groupCatalogItemsForView(null, { search: '', currencyKey: '$', companyId: 'comp_1' }), []);
  assert.deepEqual(groupCatalogItemsForView(buildFixtureItems(), {}), []);
});
