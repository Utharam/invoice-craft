# InvoiceCraft v1.3.0

> A local-first, browser-based invoice workspace with four document types, independent numbering, a preserved quote-to-invoice lifecycle, per-currency reporting, and a reusable item library.

InvoiceCraft runs entirely in the browser. Documents, clients, company profiles, item library, numbering settings, and the active draft live in IndexedDB. There is no account, backend, cloud sync, telemetry, or runtime dependency. The generated classic `js/bundle.js` also works when `index.html` is opened directly from disk (`file://`).

---

## What is new in 1.3.0

- **Quiet header**: flat brand lockup, text routes with an active underline, a single Compose `New` action, and a `More` menu for Guide, Companies, Previous Invoices, Clients, Backup, and Privacy. Save and Print live in the Compose canvas toolbar.
- **Saved item library**: IndexedDB v4 adds global and company-specific reusable items with a searchable Module 5 picker, bookmark save/update on each line item, and a Settings manager.
- **Currency-aware reuse**: the picker only offers items priced in the active document currency; global items appear first, company items second, and both share one search.
- **Backup v4**: JSON export/import includes catalog items and the item-library scope setting; v2/v3 backups still import.

## Previously in 1.2.0

- **Application shell with hash routes**: `#/home` (default), `#/compose`, `#/reports`, and `#/settings`. Compose stays mounted while you move between views, so editor state is preserved.
- **Home workspace**: continue-draft card, quick actions, compact statistics per currency, recent documents, and local-storage/backup guidance.
- **Independent numbering per document type**: invoice, quotation, estimate, and proforma each have their own counter while sharing the prefix pattern and reset policy.
- **Preserved quote-to-invoice conversion**: the source quote remains in history with a durable conversion link; the new invoice gets the next invoice number only.
- **Duplicate without `-COPY`**: duplicates receive a fresh number for their type, a clean status, and cleared conversion links.
- **Company default currency and number format**: new documents inherit them; applying a company to an existing document asks before changing currency.
- **Reports**: Dashboard, Documents, and Tax views with date/company/client/type/status/currency filters, CSV export, and report printing. Currencies are never combined.
- **IndexedDB v3**: report indexes, frozen document totals, durable document links, atomic save/numbering writes, atomic conversion writes, and v2/v3 backup import.
- **Route-aware shortcuts and printing**: `Ctrl/Cmd+P` prints the active view (invoice in Compose, report in Reports), `Ctrl/Cmd+S` saves only in Compose, and `Ctrl/Cmd+B` toggles the Compose sidebar.

---

## Document types and numbering

The four supported types are Invoice, Quotation, Cost Estimate, and Proforma Invoice.

Numbering settings include:

- One shared number pattern (for example `{PREFIX}/{FY}/{COUNTER}`), padding, and reset policy.
- Independent `counters` and `startingCounters` maps for `invoice`, `quotation`, `estimate`, and `proforma`.
- A shared `lastPeriodKey`, because the reset policy is shared.
- Auto mode and Manual mode.

Rules:

1. A fresh invoice consumes only the invoice counter. A quote consumes only the quotation counter, and so on.
2. Saving the same document repeatedly does not consume another number.
3. Saving a newly issued document and saving/converting a quote consume exactly one relevant number.
4. Conversion always uses the invoice counter and preserves the source quote number.
5. Manual mode never auto-generates, auto-rewrites, or auto-advances a number. Manual numbers are checked for uniqueness per document type when saved.
6. Period rollover resets every type counter to its own starting value.
7. `YYYY-MM-DD` dates are treated as local calendar dates.

Open **Settings > Numbering** or the editor's Numbering Engine dialog to edit all four counters and preview each next number.

---

## Conversion lifecycle

Converting a quotation, estimate, or proforma:

1. Refuses if the source already has a `convertedToId`.
2. Persists the source first if it has never been saved.
3. Creates a new invoice with a new `inv_` id, the next invoice number, today's issue date, a +14-day due date, `pending` status, and `sourceDocId`/`sourceDocNumber`.
4. Preserves the source currency, items, taxes, template, logo, client, payment details, and notes.
5. Updates the source with `convertedToId`, `convertedToNumber`, and `convertedAt`, and marks draft/sent sources as accepted.
6. Writes the source update, new invoice, and numbering configuration in one IndexedDB transaction.
7. Opens the new invoice in Compose.

The original quote is never overwritten or deleted. History and client-history rows show "Converted to INV/..." on the source and "From QT/..." on the invoice. Dangling links are displayed as historical text, not errors.

Duplicating a document creates a fresh record with the next number for that document type, resets status to the type default, records `duplicatedFromId`, clears conversion/source links, and never appends `-COPY`.

---

## Companies, clients, and currency

- Company records include sender details, remittance text, `defaultCurrency`, and `defaultNumberFormat`.
- New documents inherit the default company's currency and number format.
- Applying a company to an already saved document keeps the current currency unless you confirm the change.
- Conversion preserves the source document's currency.
- Documents store top-level `companyId`, `clientId`, `issueDate`, `docType`, `status`, canonical `currencyKey`, and frozen `subtotal`, `taxTotal`, and `total`.
- Denormalized sender/client snapshots remain on each document for historical display.
- The active company profile is saved with the active draft and restored on reload.
- `btn-save-client-to-book` stores the returned client id on the document.

Supported display presets include USD `$`, EUR `€`, GBP `£`, INR `₹`, CAD `C$`, AUD `A$`, JPY `¥`, CHF, AED, SAR, BHD, QAR, KWD, and OMR, plus custom currency keys. BHD, KWD, and OMR use three decimals; other currencies default to two. Indian and International number/word formats are supported.

---

## Reports definitions

Reports are computed directly from saved documents; there is no separate reporting store.

- **Revenue** means invoices only. Quotes, estimates, and proformas are pipeline.
- **Drafts** are counted in document inventory but excluded from financial totals by default.
- **Paid** and **outstanding** invoice totals are shown separately.
- **Converted sources** are not invoices and are excluded from revenue.
- Conversion counts come from durable `convertedToId`/`sourceDocId` links, never from PO text.
- **Tax** is calculated with the same item tax rates and normalized tax-leg allocation used by the invoice sheet. Missing item tax rates default to 18.
- Every total is bucketed by canonical `currencyKey`. The app never sums across currencies and performs no FX conversion.
- Unlinked legacy company/client documents are grouped under their snapshot name with an "unlinked" marker.
- CSV export escapes quotes, commas, and newlines and prefixes fields beginning with `=`, `+`, `-`, or `@`.

Open **Reports** from the top navigation. Use Load in the document register to open a record back in Compose.

---

## Saved item library

The item library (IndexedDB v4 `catalogItems` store) stores reusable line items — description, HSN, unit price, tax rate, and currency — with a `scope` of `global` (shared across the app) or `company` (linked to one sender profile).

- **Module 5 picker**: a "Saved items" search above the line items in Compose shows Shared (global) items first, then items for the active company, all in one search box and filtered to the active document's currency. Selecting a result adds a line item (qty 1, saved price/tax/HSN, discount 0) and updates the item's usage counters.
- **Bookmark save on line items**: each line item has a bookmark button that saves the description, HSN, price, tax, and currency to the library. When a matching item already exists (`scope + company + currency + trimmed-lowercase description`), the bookmark fills in and saves over it. New saves follow the default scope set below; a company scope save requires linking a company to the document.
- **Settings manager**: the Settings "Item library" card opens the manager with the default-scope toggle (Shared across the app / Per company), one search over both groups, a grouped list (Shared first), and add/edit/delete forms with a company selector.
- **Currency-aware**: currencies are canonicalized (`$`, `USD`, and `usd` are one key), so the picker only offers items priced in the current document's currency.
- **Isolation & backup**: catalog edits never modify saved documents or the active draft. backups are export version 4 and include `catalogItems` and the scope setting; v2/v3 backups import without catalog data.

---

## Home and Settings

Home is the default view. It shows:

- A continue-draft card with document number, client, and last-saved time.
- Quick actions for New Invoice, New Quote, Clients, Companies, and Backup.
- Compact document, invoice, open-quote, unpaid-invoice, and per-currency totals.
- The five most recent documents with an Open action.
- Local-first privacy, storage usage, backup guidance, guide link, and version.

Settings is a hub for the existing dialogs:

- Numbering
- Companies
- Item library
- Backup & Restore
- Privacy & Storage
- Document history
- Client directory

All dialogs remain single-instance and outside the route containers.

---

## Backup and storage

- **IndexedDB database**: `InvoiceCraftDB`, schema version 4.
- **Stores**: `invoices`, `clients`, `companies`, `catalogItems`, `settings`.
- **Backups**: JSON export version 4 includes invoices, clients, companies, catalog items, the item-library scope, profile, numbering config, and the active draft.
- **Import compatibility**: version 2, 3, and 4 backups are accepted. Missing `updatedAt`, frozen totals, and currency keys are stamped during import; items, taxes, and catalog items are normalized.
- **Merge semantics**: records with the same id are overwritten; other local records remain.
- **Default company**: the data layer always leaves exactly one default company when companies exist.

Browser storage can be cleared by privacy tools, browser cleanup, or site-data deletion. Export backups regularly.

---

## Printing

- **Compose**: prints the current invoice/quote with the existing A4 layout, title sanitization, and visual page-guide cleanup.
- **Reports**: prints the report layout only.
- **Home/Settings**: print is a no-op.
- `Ctrl/Cmd+P` routes by the current view. `Ctrl/Cmd+S` saves in Compose even while typing in an input, and is ignored outside Compose or while a dialog is open.
- Print CSS only displays the active view; hidden Compose content is never measured or printed.

---

## How to run

### Double-click / offline

Open `index.html` directly. The generated `js/bundle.js` is a classic IIFE with no module imports, so it works from `file://`.

### Local web server

```bash
npm start
# or
python -m http.server 8080
```

`npm start` runs `prestart` and rebuilds the bundle.

### Build and test

```bash
npm test        # Node built-in test runner over tests/
npm run build   # validates modules and regenerates js/bundle.js
```

The build uses an explicit module order:

`calc.js`, `numbering.js`, `catalog.js`, `db.js`, `icons.js`, `lifecycle.js`, `reports.js`, `report-ui.js`, `shell.js`, `app.js`.

It strips static imports/exports, rejects leftover module syntax, and fails if an expected module is missing. `predeploy` also runs the build.

---

## Project structure

```
index.html                 Hash-routed shell, Compose editor, Home, Reports, Settings, dialogs
css/styles.css             Editor, shell, Home, Settings, responsive and print styles
css/reports.css            Reports layout and report print styles
js/db.js                   IndexedDB v4, catalog store, frozen totals, atomic save/conversion, backups
js/calc.js                 Currency metadata, money/words, document totals, tax legs
js/numbering.js            Independent per-type counters, rollover, local date parsing
js/catalog.js              Saved-item normalization, dedupe keys, grouping, line-item conversion
js/lifecycle.js            Pure conversion and duplicate record builders
js/reports.js              Normalization, filters, aggregation, Home summary, CSV
js/report-ui.js            Reports view rendering and filters
js/shell.js                Hash router, Home, Settings hub, print/shortcut routing
js/app.js                  Editor state, rendering, event wiring, lifecycle integration
js/icons.js                Icon library and brand lockup generators
js/bundle.js               Generated classic IIFE loaded by index.html
build.js                   Ordered module bundler and validation
tests/                     Pure module and data-preparation tests
```

Runtime dependencies: none. Node is only needed for the build and tests.

---

## Compatibility

- Existing invoice record fields and defaults are preserved.
- Existing modal IDs, editor IDs, and the invoice print path are preserved.
- IndexedDB stores and settings keys are preserved; v3 adds fields and indexes during upgrade.
- v2 backups remain importable.
- The app remains local-only, offline-capable, and dependency-free at runtime.

## License

MIT
