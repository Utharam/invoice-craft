# Header Redesign & Saved Item Library — Design

**Date:** 2026-10-26
**Target version:** 1.3.0

## Intent

Reduce header visual noise and add a persistent, currency-aware item library so repeated line items can be reused without retyping. The library supports global items and company-specific items, with global items shown first and both searchable together.

## Header

- Single 64px row, white, hairline bottom border, no gradients or heavy shadows.
- Left: compose sidebar toggle (Compose only), flat monogram, `InvoiceCraft`, muted `by Utharam` link.
- Center: Home / Compose / Reports / Settings as quiet text links with a thin active underline.
- Right: `New` in Compose, `More` menu with Guide, Companies, Previous Invoices, Clients, Backup, Privacy. Counts live inside the menu.
- Save and Print live in the Compose canvas toolbar, not the global header.
- Privacy is a quiet item in More and Settings, not a large green pill.
- `More` closes on outside click, Escape, route change, or action selection.
- Preserve all existing element IDs used by app.js; move buttons rather than duplicating them.

## Item library

- IndexedDB v4 adds a `catalogItems` store.
- `catalogItems` record: `id`, `description`, `descriptionKey`, `hsn`, `rate`, `taxRate`, `currency`, `currencyKey`, `scope` (`global`|`company`), `companyId`, `usageCount`, `lastUsedAt`, `createdAt`, `updatedAt`.
- Default-save setting `itemLibraryConfig.scope`: `global` or `company`.
- Module 5:
  - Searchable saved-item picker shows **Global items** first, then **Company items** for the active company. Both are searchable in one input.
  - Clicking a result adds a line item with qty 1, saved price, tax, HSN, and discount 0.
  - Each line item has a bookmark action: save/update the current description, HSN, price, tax, currency, and scope.
  - Items are filtered to the active document currency. Global items always appear; company items require an active company link.
  - Scope hint tells the user where new saves go; a Manage button opens Settings.
- Settings:
  - New **Item library** modal with the default-scope toggle, search, grouped Global/Company list, and add/edit/delete form.
  - New Settings hub card opening the modal.
- Dedupe: same `scope + companyId + currencyKey + descriptionKey` updates the existing item.
- Saved invoices are never modified by catalog edits. Catalog items are included in JSON backup/restore (v4).
- No units, inventory, suppliers, or pricing tiers in this release.

## Compatibility

- Keep all invoice, client, company, numbering, conversion, report, and backup behavior.
- Import v2/v3 backups without catalog data; export v4.
- Keep offline `file://`, zero runtime dependencies, and the generated IIFE bundle.

## File boundaries

- `js/catalog.js` — pure catalog normalization, matching, grouping, line-item conversion.
- `js/db.js` — v4 store, catalog CRUD, item-library config, backup/restore.
- `js/app.js` — picker, save-to-library, Settings manager, item editor integration.
- `js/shell.js` — header More menu behavior.
- `index.html` — header, picker, Settings card, item-library modal.
- `css/styles.css` — header redesign, picker, catalog manager.
- `build.js` — add `catalog.js`, bump version.
- `README.md`, `package.json`, `package-lock.json` — v1.3.0.
