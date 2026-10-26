# InvoiceCraft Reporting Shell & Document Lifecycle — Design

**Date:** 2026-10-26
**Status:** Approved for planning
**Target version:** 1.2.0

## Intent

Turn InvoiceCraft from a single-page invoice editor into a local-first document workspace with a home view, reporting, settings, proper document lifecycles, and independent numbering per document type — without becoming accounting software and without moving off IndexedDB.

## Goals

- Home is the default view with minimal branding, continue-draft, quick actions, compact stats, recent documents, and local-first/backup info.
- Compose remains the existing editor, mounted and one click away.
- Reports is a full page with Dashboard, Documents, and Tax views.
- Settings is a hub for Numbering, Companies, Backup/Restore, and Privacy/Storage.
- Invoice, quotation, estimate, and proforma have independent counters, starting numbers, and period resets.
- Converting a quotation/estimate/proforma preserves the source record and creates a new invoice record with durable links and history remarks.
- Companies have a default currency used for new documents only.
- Reports group strictly by currency; no FX and no combined multi-currency totals.
- All data remains in IndexedDB with JSON backup/restore and offline `file://` support.
- Source is split into focused modules; `js/bundle.js` remains the single generated artifact loaded by `index.html`.

## Non-goals

- No SQLite, backend, cloud sync, accounts, permissions, or multi-user support.
- No general ledger, double-entry, expenses, bank reconciliation, payment allocation, credit notes, or tax filing forms.
- No custom report builder, chart library, frontend framework, or router library.
- No TypeScript rewrite in this release.
- No separate logo-library page; Logo Studio stays an editor modal.

## Decisions

### App shell

- Hash routes: `#/home` (default), `#/compose`, `#/reports`, `#/settings`.
- One page; views are top-level sections toggled by CSS. Compose is never unmounted.
- `document.body.dataset.view` drives view-specific CSS, shortcuts, and print.
- Route changes close open dialogs, flush pending autosave, update the title, focus the new heading, and refresh data for the destination view.
- Compose-only actions (New, Save, Print, sidebar toggle) are hidden outside Compose.
- `updateDocumentPaginationLive()` does nothing while Compose is hidden and is recalculated when Compose becomes visible.
- One top-level print manager handles invoice print in Compose and report print in Reports. Ctrl+P routes by view; Ctrl+S saves only in Compose and is ignored in inputs/dialogs where inappropriate.
- Existing modal IDs and events stay single-instance; Settings cards open existing dialogs.

### Home

- Minimal brand header and route navigation.
- Continue-draft card using the autosaved draft (`activeDraft`), with number, client, and last-updated time.
- Quick actions: New Invoice, New Quote, Clients, Companies, Backup.
- Compact stats: documents, invoices, open quotes, unpaid invoices, tax for the current period, per currency. Link to Reports for detail.
- Recent documents (5) with open action.
- Info panel: local-first privacy, storage status, backup reminder, version, guide link.
- New Invoice from Home goes to Compose; if a meaningful unsaved draft exists, use the existing save/discard/cancel prompt.

### Numbering

- One scheme, prefix set, padding, and reset policy; independent counters per type.
- Config shape additions:
  - `counters: { invoice, quotation, estimate, proforma }`
  - `startingCounters: { invoice, quotation, estimate, proforma }`
- Legacy migration: `invoice` counter comes from the old `counter`; other types start from their own starting counter/default (never the shared current counter). `lastPeriodKey` remains shared because reset policy is shared.
- Rollover resets every type counter to its own starting value.
- Manual mode never auto-generates, auto-rewrites, or auto-advances numbers. Manual numbers are validated for uniqueness on save.
- Fresh invoice uses the invoice counter only.
- Conversion uses the invoice counter only; the source keeps its own number.
- Saving the same document repeatedly must not consume another number. “Save” and “Save & Start Fresh” each consume exactly one.
- Number generation parses `YYYY-MM-DD` as a local calendar date. Conversion sets the invoice date before generating its number.
- Numbering previews and modal keystrokes never write to IndexedDB.

### Document lifecycle and conversion

- Saved source documents are never overwritten by a type change or conversion.
- `switchDocumentType()` applies only to unsaved drafts. On a persisted record it must direct the user to create a new document instead of mutating the saved one.
- Conversion flow:
  1. Refuse if the source already has `convertedToId`.
  2. Ensure the source is persisted; if not, save it first with its current number.
  3. Clone content into a new invoice record with a new `inv_` id, new invoice number, today’s issue date, +14-day due date, status `pending`, and `sourceDocId`/`sourceDocNumber`.
  4. Update the source with `convertedToId`, `convertedToNumber`, `convertedAt`; keep its own status (set to `accepted` if it was `draft`/`sent`).
  5. Write new invoice, source update, and numbering config in one IndexedDB transaction.
  6. Open the new invoice in Compose and show a confirmation.
- History and report rows show “Converted to INV/…” on the source and “From QT/…” on the invoice.
- Duplicate creates a fresh record with the next number for its type, resets status to the type default, clears conversion/source links, and records `duplicatedFromId`. It does not append `-COPY`.
- Deleting a linked record keeps the number snapshot; reports treat dangling links as historical text, not errors.

### Companies, clients, and currency

- Persist top-level `companyId` and `clientId` on documents at save time. Keep denormalized sender/client snapshots for historical display.
- Persist `activeCompanyProfileId` with the active draft and restore it.
- Company records gain `defaultCurrency` and `defaultNumberFormat`.
- New documents inherit the default company’s currency and number format. Applying a company to an existing document keeps its currency unless the user confirms a change.
- Conversion preserves the source currency.
- Every saved document freezes `issueDate`, `docType`, `status`, canonical `currencyKey`, `subtotal`, `taxTotal`, and `total`.
- Currency metadata lives in one place: symbol/code aliases and minor units. BHD, KWD, and OMR use three decimals; others default to two. Custom currency keys are uppercased/trimmed for grouping.
- Reports never sum across currencies. Unmatched legacy company/client documents are grouped under their snapshot name with an “unlinked” marker.

### Reports

- Pure report engine over saved documents; no separate reporting store.
- Filters: date range (issue date; presets incl. this month, last month, this FY, last FY, all), company, client, document type, status, currency.
- Dashboard: document counts by type/status, invoice totals, paid/outstanding, open quote pipeline, paid proformas, converted quote count, tax total, per-company and per-client summaries.
- Documents: filterable register with number, type, status, date, company, client, currency, total, conversion remark; load and CSV.
- Tax: tax by rate and tax leg for the selected period/company/currency, using the same calculation as the sheet.
- Definitions:
  - Revenue = invoices only. Paid vs invoiced basis shown separately.
  - Quotes/estimates/proformas are pipeline, not revenue.
  - Drafts excluded from financial totals by default; still counted in document inventory.
  - Converted sources excluded from revenue (they are not invoices).
- Conversion counts come from durable links, never from PO text.
- CSV includes currency and guards against spreadsheet formula injection.
- Reports support print with report-specific page padding; invoice print remains unchanged.

### Calculation

- One shared calculation module returns line totals, subtotal, tax total, grand total, per-rate tax breakdown, and tax-leg allocation.
- Missing item tax rate defaults to 18 everywhere.
- Tax legs are split shares, not tax rates. Leg amounts are allocated from the total tax by normalized ratio.
- Frozen totals are used by reports/history; legacy records fall back to the shared calculator.
- `formatMoney`, `amountToWords`, and report totals use the same currency metadata and minor-unit rounding.

## Architecture / file boundaries

- `js/db.js` — IndexedDB v3, indexes, atomic save/conversion/import, backup v3.
- `js/calc.js` — pure money, currency, words, document totals/tax allocation.
- `js/numbering.js` — pure per-type numbering, migration, period helpers.
- `js/reports.js` — pure report normalization, filtering, aggregation, CSV.
- `js/report-ui.js` — Reports view rendering, filters, export, print trigger.
- `js/shell.js` — hash router, Home, Settings hub, nav state, print/shortcut routing.
- `js/app.js` — editor state, rendering, event wiring, lifecycle integration.
- `js/icons.js` — unchanged icon library.
- `js/bundle.js` — generated, never hand-edited.
- `css/styles.css` — existing editor styles plus shell/view primitives.
- `css/reports.css` — report layout and report print styles.
- `build.js` — explicit ordered module list, import/export stripping, validation.
- `tests/*.test.mjs` — Node built-in test runner for pure modules.

The build remains dependency-free and produces a classic IIFE bundle for `file://`. Tests import ESM source via `js/package.json` with `"type": "module"`.

## Compatibility

- Preserve all existing invoice shape fields and defaults.
- Keep backup import compatible with v2; write backups as v3.
- Keep IndexedDB stores and settings keys; add fields/indexes via DB_VERSION 3.
- Keep existing modal IDs/events and the invoice print path.
- Keep local-only, offline, zero-runtime-dependency behavior.

## Acceptance

- Quote `QT/2026/0253` can exist while fresh invoice `INV/2026/0230` exists; converting the quote produces the next invoice number and the quote remains with a conversion remark.
- No document type consumes another type’s counter.
- Reports never combine currencies, and company/client totals match the selected documents.
- Home opens by default; Compose, Reports, and Settings are navigable without losing editor state.
- Print from Compose prints the invoice; print from Reports prints the report; neither prints the other view.
- `npm run build`, `npm test`, and a manual double-click `file://` load succeed.
