# Header Redesign & Saved Item Library — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ship InvoiceCraft 1.3.0 with a quiet header and a persistent global/company item library.

**Architecture:** Add a pure `catalog.js`, an IndexedDB v4 `catalogItems` store, and a Settings/picker UI. Preserve the existing bundle and all document behavior.

**Tech Stack:** Vanilla JS modules, IndexedDB, HTML/CSS, Node built-in tests, generated IIFE bundle.

**Spec:** `docs/superpowers/specs/2026-10-26-item-library-header-design.md`

## Global Constraints

- Version 1.3.0.
- No TypeScript, SQLite, backend, framework, chart library, inventory, or pricing tiers.
- Keep offline `file://`, existing IDs, existing Print/PDF, and all document behavior.
- Catalog items are currency-aware; global items first, company items second, one search.
- Catalog edits never mutate saved invoices.
- `npm test`, `npm run build`, `node --check`, and browser smoke must pass.

## Task 1: Catalog Data Layer

**Files:** `js/catalog.js`, `js/db.js`, `tests/catalog.test.mjs`, `tests/db.test.mjs`

**Interfaces:**
- `CATALOG_SCOPES`, `normalizeCatalogScope(value)`
- `catalogDescriptionKey(text)`
- `normalizeCatalogItem(item, { id, now })`
- `catalogMatchKey(item)`
- `findCatalogMatch(items, candidate)`
- `buildCatalogCandidateFromLineItem(lineItem, { scope, companyId, currency, currencyKey })`
- `catalogItemToLineItem(item)`
- `groupCatalogItemsForView(items, { search, currencyKey, companyId })` -> `[{ scope, label, items }]`
- DB: `getAllCatalogItems`, `saveCatalogItem`, `deleteCatalogItem`, `getItemLibraryConfig`, `saveItemLibraryConfig`
- `DB_VERSION = 4`; store `catalogItems` with indexes `scope`, `companyId`, `currencyKey`, `descriptionKey`, `updatedAt`.
- Backup export v4 includes `catalogItems` and `itemLibraryConfig`; import accepts 2/3/4 and writes catalog in the same transaction.
- `itemLibraryConfig` default `{ scope: 'global', updatedAt: null }`.

**Steps:** tests first (normalization, key, dedupe, grouping/currency/company, line-item conversion, import v4), implement, run tests/check, report.

## Task 2: Header Redesign

**Files:** `index.html`, `css/styles.css`, `js/shell.js`

- Replace header markup with brand + route links + New + More.
- Move `#btn-save-invoice` to the Compose canvas toolbar; keep `#btn-print-preview` as the single print button; remove header print.
- More menu: Guide, Companies count, Previous Invoices count, Clients, Backup, Privacy. Preserve IDs.
- More menu JS: toggle, outside click, Escape, route change, action click.
- CSS: 64px flat header, underlined route links, muted brand sublabel, More panel, responsive.
- Remove/hide the old privacy pill and gradient brand badge; keep a text `by Utharam` link.
- Preserve print hiding and accessibility.

## Task 3: Item Library UI

**Files:** `js/app.js`, `index.html`, `css/styles.css`, `README.md`

- Module 5: saved-item search picker (Global first, Company second), manage link, scope hint.
- Item card: bookmark button saves/updates the catalog item; mark already-saved items.
- Settings: Item library card + `modal-item-library` with default scope toggle, search, grouped list, add/edit/delete form.
- Load catalog/config after boot; refresh after company/currency changes and catalog edits.
- Picker adds line items; saved items never mutate invoices.
- Use exact item-library IDs prefixed `item-library-*` and picker IDs `catalog-*`.
- Update README.

## Task 4: Build, Version, Verification

- Add `catalog.js` to `build.js` before `db.js`; bump 1.3.0.
- Run `npm test`, `npm run build`, `node --check`, duplicate-ID audit.
- Browser smoke: header More menu, save item, picker global/company grouping, add from picker, reload persistence, Settings add/edit/delete, scope toggle, company switch, backup v4.
- Final bug hunt; fix Critical/Important; rebuild.

## Review Focus

- Header IDs preserved and Save/Print still work.
- More menu closes and does not break modal/route behavior.
- Global items first, company items second, search spans both.
- Currency filtering prevents wrong-price reuse.
- Dedupe is scope + company + currency + description.
- Catalog edits do not change saved invoices.
- DB v4 migration and v2/v3 backup import remain safe.
- Picker/listener re-renders do not duplicate event handlers.
