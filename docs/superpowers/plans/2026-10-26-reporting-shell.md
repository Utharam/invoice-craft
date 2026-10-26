# InvoiceCraft Reporting Shell & Document Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Home/Compose/Reports/Settings shell, independent per-type numbering, a preserved quote-to-invoice lifecycle, company default currency, and local-first company/client/tax reporting without leaving IndexedDB.

**Architecture:** Extract pure calculation, numbering, lifecycle, and reporting logic into modules. Keep `js/bundle.js` as the single generated classic IIFE for `file://`. Compose stays mounted; hash routing toggles top-level views. IndexedDB v3 adds durable document links, frozen totals, indexes, and atomic conversion writes.

**Tech Stack:** Vanilla JS (ES modules in source, concatenated IIFE bundle), HTML5, CSS, IndexedDB, Node built-in test runner. No runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-10-26-reporting-shell-design.md`

## Global Constraints

- Target version: `1.2.0` in `package.json`, `package-lock.json`, docs, and generated bundle banner.
- No SQLite, backend, cloud sync, framework, router library, chart library, or TypeScript rewrite.
- No accounting features: no ledger, payments, expenses, credit notes, FX, or tax filing forms.
- Preserve offline `file://` support through the generated classic `js/bundle.js`.
- Preserve existing invoice shape, modal IDs, editor IDs, print path, and IndexedDB backup compatibility.
- Reports never sum across currencies.
- Manual numbering never auto-generates or auto-advances.
- Previews never write to IndexedDB.
- `npm test`, `npm run build`, and `git diff --check` must pass before completion.

## Review Focus

- Conversion must never overwrite or lose the source quote; both records must be saved atomically.
- Invoice and quotation counters must never consume each other’s sequence.
- Reports must exclude quotes/estimates/proformas and drafts from invoice revenue, and must bucket by currency.
- Hidden Compose must not be measured or printed; report print must not print the invoice.
- Legacy records and v2 backups must remain loadable and appear in history/reports.
- Route changes must flush autosave and close dialogs; async report/home renders must not race.

---

## File Structure

**New files**
- `js/calc.js` — currency metadata, money/words, document totals, tax legs, numeric clamp.
- `js/numbering.js` — per-type numbering config, migration, period rollover, number generation.
- `js/lifecycle.js` — pure conversion/duplicate record builders.
- `js/reports.js` — report normalization, filters, aggregation, CSV.
- `js/report-ui.js` — Reports view UI and report print trigger.
- `js/shell.js` — hash router, Home, Settings hub, route-aware shortcuts/print.
- `css/reports.css` — report layout and report print styles.
- `js/package.json` — `{ "type": "module" }` so Node tests import source modules.
- `tests/calc.test.mjs`, `tests/numbering.test.mjs`, `tests/lifecycle.test.mjs`, `tests/reports.test.mjs`.

**Modified files**
- `index.html` — shell views, route nav, Home, Reports root, Settings hub, numbering/company fields, stylesheet link.
- `js/db.js` — DB_VERSION 3, indexes, prepared invoices, frozen totals, atomic save/conversion, backup v3.
- `js/app.js` — consume modules, integrate numbering/conversion/company currency, retain editor rendering and existing IDs.
- `js/shell.js` and `js/report-ui.js` are initialized from the existing DOMContentLoaded boot.
- `css/styles.css` — shell/view primitives, Home/Settings layout, route-aware print.
- `build.js` — explicit module order, strip/validate imports/exports.
- `package.json` / `package-lock.json` — scripts, version, no runtime dependencies.
- `README.md` — feature/run/structure updates.

---

## Task 1: Pure Calculation Module

**Files:**
- Create: `js/calc.js`
- Create: `tests/calc.test.mjs`
- Create: `js/package.json`
- Modify: `js/app.js` only after module tests pass (remove duplicate definitions and import from `./calc.js`)

**Interfaces:**
- Produces:
  - `CURRENCY_REGISTRY`
  - `normalizeCurrency(value) -> { key, symbol, code, decimals, majorSingular, majorPlural, minorSingular, minorPlural, leadMajor }`
  - `formatMoney(amount, currency = '', format = 'international') -> string`
  - `amountToWords(amount, currency = '$', format = 'international') -> string`
  - `clampNum(value, min, max, fallback = 0) -> number`
  - `calculateTotals(invoice) -> { subtotal, taxTotal, total, lines, rateBreakdown, taxLegs }`
  - `calculateTotal(invoice) -> number`
  - `splitTaxLegs(taxes, totalTax) -> [{ id, name, ratio, amount }]`
- `calculateTotals.lines[]`: `{ id, description, hsn, qty, rate, discount, taxRate, taxable, tax, total }`
- `calculateTotals.rateBreakdown[]`: `{ rate, taxable, tax }`
- `taxLegs` allocate normalized ratios; zero/empty legs produce a single `Tax` 100% leg.

- [ ] **Step 1: Write failing tests** for international/Indian grouping, BHD/KWD/OMR three decimals, `$0.015` rounding, amount-in-words carry-over, custom currency normalization (`usd` → `USD`), missing taxRate default 18, tax-leg normalized allocation, and zero-leg fallback.
- [ ] **Step 2: Run `node --test tests/calc.test.mjs`** and confirm failures are “function not defined”.
- [ ] **Step 3: Implement `js/calc.js`** with one currency registry and one totals implementation; keep existing function names/signatures compatible.
- [ ] **Step 4: Run the calc tests** and confirm PASS.
- [ ] **Step 5: Replace duplicate functions in `js/app.js`** (`formatMoney`, `amountToWords`, `convert*ToWords`, `calculateTotal`, `clampNum`) with imports from `./calc.js`; update the sheet renderer to call `calculateTotals()` once per render and use its lines/rateBreakdown/taxLegs.
- [ ] **Step 6: Run `node --check js/app.js`** and existing app smoke checks.
- [ ] **Step 7: Commit** `feat: add shared calculation and currency module`.

## Task 2: Per-Type Numbering Module

**Files:**
- Create: `js/numbering.js`
- Create: `tests/numbering.test.mjs`
- Modify: `js/db.js` (move/re-export `DEFAULT_NUMBERING_CONFIG`, migration)
- Modify: `js/app.js` (consume module)

**Interfaces:**
- Produces:
  - `DEFAULT_NUMBERING_CONFIG`
  - `normalizeNumberingConfig(config) -> normalized config`
  - `formatFinancialYear(date)`
  - `resolvePeriodKey(date, resetPeriod)`
  - `parseLocalDate(value)`
  - `getCounter(config, docType) -> number`
  - `generateDocumentNumber(docType, dateStr, config, overrideCounter = null) -> string`
  - `periodRollover(config, now = new Date()) -> { config, changed }`
  - `advanceTypeCounter(config, docType) -> config` (pure clone)
- Normalized config:
  - `counters: { invoice, quotation, estimate, proforma }`
  - `startingCounters: { invoice, quotation, estimate, proforma }`
  - existing `scheme`, `prefix*`, `padding`, `resetPeriod`, `lastPeriodKey`, `mode`.
- Migration: invoice counter from legacy `counter`; other types from their own starting counter/default; never from the shared live counter.
- `parseLocalDate('YYYY-MM-DD')` returns local midnight, not UTC.
- Manual mode: `generateDocumentNumber` returns an empty string unless a number is explicitly supplied by the caller; manual call sites must not use it.

- [ ] **Step 1: Write failing tests** for legacy migration, four independent counters, quote 253/invoice 230 coexistence, conversion using only invoice counter, FY/month rollover resetting each type, local-date parsing, and manual no-op.
- [ ] **Step 2: Run `node --test tests/numbering.test.mjs`** and confirm expected failures.
- [ ] **Step 3: Implement `js/numbering.js`** and update `js/db.js` to re-export/migrate the config.
- [ ] **Step 4: Run numbering tests** and confirm PASS.
- [ ] **Step 5: Update `js/app.js`** to use per-type counters, current-type badges/previews, and no prefix rewriting in manual mode.
- [ ] **Step 6: Commit** `feat: add independent per-document-type numbering`.

## Task 3: Lifecycle Record Builders

**Files:**
- Create: `js/lifecycle.js`
- Create: `tests/lifecycle.test.mjs`

**Interfaces:**
- Produces:
  - `buildConversionRecords({ source, invoiceId, invoiceNumber, now, company }) -> { sourceUpdate, invoice }`
  - `buildDuplicateRecord({ source, id, number, now }) -> invoice`
- Conversion invoice: new `inv_` id, `meta.docType='invoice'`, `meta.number=invoiceNumber`, issue date today, due +14 days, status `pending`, `sourceDocId`/`sourceDocNumber`, preserved currency/template/logo/items/taxes/client/payment/notes, clears signature.
- Source update: `convertedToId`, `convertedToNumber`, `convertedAt`, status `accepted` if it was `draft`/`sent`; do not overwrite financial fields.
- Duplicate: fresh id/number, type-default status, clears conversion fields, sets `duplicatedFromId`; never appends `-COPY`.

- [ ] **Step 1: Write failing tests** for conversion link fields, source preservation, currency preservation, date reset, duplicate link/status clearing, and refusal when source already converted.
- [ ] **Step 2: Run `node --test tests/lifecycle.test.mjs`** and confirm failures.
- [ ] **Step 3: Implement `js/lifecycle.js`**.
- [ ] **Step 4: Run lifecycle tests** and confirm PASS.
- [ ] **Step 5: Commit** `feat: add conversion and duplicate record builders`.

## Task 4: Reports Engine

**Files:**
- Create: `js/reports.js`
- Create: `tests/reports.test.mjs`

**Interfaces:**
- Produces:
  - `normalizeReportInvoice(invoice) -> ReportRow`
  - `filterReportRows(rows, filters) -> ReportRow[]`
  - `buildReportModel({ invoices, clients, companies, filters, now }) -> ReportModel`
  - `summarizeHome({ invoices, clients, companies, now }) -> HomeSummary`
  - `toCsv(rows) -> string`
- `ReportRow`: `{ id, number, docType, status, statusLabel, issueDate, dueDate, companyId, companyName, companyLinked, clientId, clientName, clientLinked, currencyKey, currencySymbol, numberFormat, subtotal, taxTotal, total, sourceDocId, sourceDocNumber, convertedToId, convertedToNumber, convertedAt, isDraft, isInvoice, isPaid, isOutstanding, taxRates, taxLegs }`
- `filters`: `{ dateFrom, dateTo, docType, status, company, client, currency }`.
- `ReportModel`: `{ generatedAt, rows, filteredRows, totals, currencySummaries, companySummaries, clientSummaries, conversionSummary, paidProformaSummary, recentDocuments }`.
- Revenue definition: invoices only; drafts excluded from financial totals; paid vs invoiced separated; quotes/estimates/proformas are pipeline.
- Aggregation bucket key is canonical `currencyKey`; never sum across buckets.
- Legacy fallback: `companyName = sender.name`, `clientName = client.name`; mark `linked:false`.
- Tax summary uses `calculateTotals()`; tax by rate and normalized leg allocation.
- CSV escapes quotes/commas/newlines and prefixes fields beginning `=`, `+`, `-`, `@` with `'`.

- [ ] **Step 1: Write failing tests** for currency isolation, invoice-only revenue, draft exclusion, status/type filters, conversion counts from links, paid proformas, company/client name fallback, tax by rate/leg, and CSV formula-injection guard.
- [ ] **Step 2: Run `node --test tests/reports.test.mjs`** and confirm failures.
- [ ] **Step 3: Implement `js/reports.js`**.
- [ ] **Step 4: Run report tests** and confirm PASS.
- [ ] **Step 5: Commit** `feat: add pure reporting engine`.

## Task 5: Reports UI

**Files:**
- Create: `js/report-ui.js`
- Create: `css/reports.css`
- Modify: `index.html` (only if the shell task has not already added `#view-reports` and `#reports-root`)

**Interfaces:**
- Produces:
  - `mountReportsView(root, { onOpenDocument })`
  - `refreshReportsView()`
- Consumes: `getAllInvoices`, `getAllClients`, `getAllCompanies` from `./db.js`; `buildReportModel`, `toCsv` from `./reports.js`; `formatMoney` from `./calc.js`.
- UI: tabs Dashboard/Documents/Tax; filters (date preset + custom, company, client, doc type, status, currency); per-currency cards; company/client tables; conversion and paid-proforma summaries; document register with Load and CSV; tax by rate/leg; print button; empty/error/loading states.
- Use `report-*` prefixed IDs only. Never duplicate existing modal/editor IDs.
- `onOpenDocument(id)` is supplied by the shell and navigates to Compose.

- [ ] **Step 1: Implement the view markup/render functions** with a single load per refresh and a request token to ignore stale async results.
- [ ] **Step 2: Add CSS** for report layout, responsive tables, print padding/table headers, and `body[data-view="reports"]` print visibility.
- [ ] **Step 3: Run `node --check js/report-ui.js`** and verify no duplicate IDs against `index.html`.
- [ ] **Step 4: Commit** `feat: add reports view`.

## Task 6: IndexedDB v3 and Data Model

**Files:**
- Modify: `js/db.js`
- Modify: `js/app.js` (save/load call sites)
- Tests: pure helpers only; manual IDB verification.

**Interfaces:**
- `DB_VERSION = 3`.
- Add indexes to existing stores on upgrade: `issueDate`, `docType`, `status`, `companyId`, `clientId`, `currencyKey`.
- `prepareInvoiceForSave(invoice, extras = {}) -> invoice` stamps `updatedAt`, `issueDate`, `docType`, `status`, canonical `currencyKey`, frozen subtotal/taxTotal/total, and durable links.
- `saveInvoice(invoice)` uses `prepareInvoiceForSave`.
- `saveInvoiceAndNumbering(invoice, numberingConfig)` writes invoice + settings in one transaction.
- `saveConversion({ source, invoice, numberingConfig })` writes source, invoice, and settings in one transaction.
- `getAllInvoices()` reads the whole store and sorts by `updatedAt || issueDate || 0` so records missing `updatedAt` are not dropped.
- `importAllData` accepts v2/v3, stamps missing `updatedAt`/frozen fields, normalizes items/taxes, and includes `activeDraft` when present.
- `setDefaultCompany` always leaves exactly one default.
- `getActiveDraftRecord()` returns `{ data, updatedAt }`; keep `getActiveDraft()` compatibility.
- Keep `openDB` blocked/error handling from hanging: reject/return a retryable error.

- [ ] **Step 1: Implement v3 upgrade/index creation** using `event.target.transaction.objectStore(...)` for existing stores.
- [ ] **Step 2: Implement save preparation and atomic save/conversion**; use `calculateTotals` for frozen totals.
- [ ] **Step 3: Update import/export** to backup version 3 with v2 compatibility.
- [ ] **Step 4: Verify with a temporary browser/manual script** that save, reload, conversion, and import work; document results in the implementer report.
- [ ] **Step 5: Commit** `feat: add indexeddb v3 document links and atomic writes`.

## Task 7: Numbering, Conversion, and Company Currency Integration

**Files:**
- Modify: `js/app.js`
- Modify: `js/db.js`
- Modify: `index.html` (numbering modal, company modal)
- Modify: `README.md` later in Task 10

**Interfaces:**
- Numbering modal: per-type counter fields `num-cfg-counter-invoice`, `num-cfg-counter-quotation`, `num-cfg-counter-estimate`, `num-cfg-counter-proforma`; previews per type; keep existing close/save IDs.
- Numbering badge and Next Seq use the active document type.
- `persistCurrentDocument()` uses `saveInvoiceAndNumbering`.
- Conversion uses `buildConversionRecords` + `saveConversion`; source must be persisted first; already-converted blocked; new invoice opens in Compose.
- Duplicate uses `buildDuplicateRecord` + fresh number + `saveInvoiceAndNumbering`.
- `switchDocumentType()` on a persisted record must not overwrite it; direct user to create a new document.
- Company modal gains `modal-company-currency` and `modal-company-number-format`.
- `applyCompanyToInvoice()` applies default currency/number format only to new/empty documents; existing documents prompt before changing.
- Persist/restore `activeCompanyProfileId` with the active draft.
- `btn-save-client-to-book` stores the returned client id into `currentInvoice.clientId`.
- History/client rows display conversion remarks.

- [ ] **Step 1: Update numbering modal markup and listeners** to per-type counters/previews.
- [ ] **Step 2: Integrate per-type counter advance/save** through the atomic DB API.
- [ ] **Step 3: Replace conversion/duplicate/type-switch flows** with lifecycle builders and atomic writes.
- [ ] **Step 4: Add company currency fields and merge-on-save behavior** (preserve `createdAt` and unknown fields).
- [ ] **Step 5: Persist company/client identity and active company profile** on all save/load paths.
- [ ] **Step 6: Add conversion remarks** to `renderSavedInvoicesList` and client history drawers.
- [ ] **Step 7: Smoke-test** new invoice, quote save, conversion, fresh invoice numbering, company currency on new docs, and duplicate.
- [ ] **Step 8: Commit** `feat: integrate independent numbering and preserved conversion lifecycle`.

## Task 8: App Shell, Home, Settings, Print, and Shortcuts

**Files:**
- Create: `js/shell.js`
- Modify: `index.html`
- Modify: `js/app.js`
- Modify: `css/styles.css`

**Interfaces:**
- Routes: `#/home`, `#/compose`, `#/reports`, `#/settings`; default `#/home`; unknown → home.
- `document.body.dataset.view` set on every route.
- Views: `#view-home`, `#view-compose`, `#view-reports`, `#view-settings`; Compose is the existing `.app-workspace` and stays mounted.
- `initShell({ onRouteChange })`; `navigateTo(view)`; `renderHome()`; `refreshShellCounts()`.
- Home: continue draft, quick actions, compact stats from `summarizeHome`, recent documents, local-first/storage/backup info.
- Settings hub: Numbering, Companies, Backup/Restore, Privacy/Storage; uses existing modals via `data-open-modal`, no duplicate IDs.
- Route nav: Home/Compose/Reports/Settings; Compose-only actions hidden by `body[data-view]`.
- On route change: close dialogs, flush autosave, set title, focus view heading, refresh destination, recalc pagination only after Compose is visible.
- Print manager: top-level `printCurrentView()`; Compose prints invoice with existing title/guide cleanup; Reports prints report; other views no-op. Ctrl+P routes by view; Ctrl+S only in Compose; modal/input targets are ignored.
- Pagination: skip while Compose hidden; recalc on Compose entry.
- Home New Invoice navigates to Compose and starts an invoice with the dirty-draft prompt when needed.
- Report document Load uses a shared `openDocumentInEditor(id)` that navigates to Compose.

- [ ] **Step 1: Add shell markup and route navigation**; wrap existing workspace in the Compose view without changing editor IDs.
- [ ] **Step 2: Implement hash router, view toggling, dialog close, autosave flush, focus, and title**.
- [ ] **Step 3: Implement Home rendering** with continue draft, quick actions, stats, recent documents, and info.
- [ ] **Step 4: Implement Settings hub** opening existing dialogs.
- [ ] **Step 5: Move/split print and keyboard handling** by view; guard pagination while hidden.
- [ ] **Step 6: Add shell/Home/Settings CSS and route-aware print CSS**; remove unconditional print visibility of `.app-workspace`.
- [ ] **Step 7: Wire `mountReportsView` from `js/report-ui.js`** into the Reports view with an `openDocumentInEditor` callback.
- [ ] **Step 8: Run `node --check` on new/changed JS and a browser smoke test** for all four routes, back/forward, print from each view, and Compose state preservation.
- [ ] **Step 9: Commit** `feat: add app shell, home, settings, and route-aware print`.

## Task 9: Build, Tests, and Bundle

**Files:**
- Modify: `build.js`
- Modify: `package.json`, `package-lock.json`
- Generated: `js/bundle.js`

**Interfaces:**
- Explicit module order: `db.js`, `icons.js`, `calc.js`, `numbering.js`, `lifecycle.js`, `reports.js`, `report-ui.js`, `shell.js`, `app.js`.
- Strip all static imports and `export` keywords from every module; fail if any `import`/`export` survives.
- Fail if an expected module is missing.
- Add `"test": "node --test tests"` and `"predeploy": "node build.js"`.
- Keep `prestart` build.
- Bundle banner uses `package.json` version.

- [ ] **Step 1: Update `build.js`** to the explicit list and stricter validation.
- [ ] **Step 2: Run `npm test`** and confirm all pure-module tests pass.
- [ ] **Step 3: Run `npm run build`** and confirm `js/bundle.js` parses with no leftover module syntax.
- [ ] **Step 4: Update `package.json`/lock to 1.2.0** and add scripts.
- [ ] **Step 5: Commit** `build: bundle modular sources and add test runner`.

## Task 10: Documentation, Version, and Verification

**Files:**
- Modify: `README.md`
- Modify: `package.json`, `package-lock.json` (if not already 1.2.0)
- Generated: `js/bundle.js`

- [ ] **Step 1: Update README** with Home/Reports/Settings, independent numbering, conversion lifecycle, company currency, and report definitions.
- [ ] **Step 2: Run `npm test`, `npm run build`, `node --check` on changed JS, `git diff --check`**.
- [ ] **Step 3: Run the final bug-hunt subagent** against the branch diff using the Review Focus list.
- [ ] **Step 4: Fix Critical/Important findings in one batch**, rebuild, and re-run verification.
- [ ] **Step 5: Commit** `docs: document reporting shell and bump version to 1.2.0`.

---

## Parallel Execution Map

- **Stream A (GLM_executer_max):** Tasks 4, 5, and the pure parts of Tasks 1–3 with tests. New files only: `js/calc.js`, `js/numbering.js`, `js/lifecycle.js`, `js/reports.js`, `js/report-ui.js`, `css/reports.css`, `tests/*`, `js/package.json`. Do not edit `js/app.js`, `js/db.js`, `index.html`, `css/styles.css`, `build.js`, or `package.json`.
- **Stream B (GLM_Orchastrator_max):** Tasks 6–9 plus editor integration in `js/app.js`, `js/db.js`, `index.html`, `css/styles.css`, `build.js`, `package.json`. Consume Stream A interfaces; do not edit Stream A files.
- **Integration:** controller runs `npm test`, `npm run build`, browser smoke checks, duplicate-ID check, and the final bug hunt; dispatches one fix batch.

## Self-Review Notes

- Spec coverage: Home, Compose, Reports, Settings, numbering, conversion, company currency, tax, currency isolation, IndexedDB, build, tests, docs are each mapped to a task.
- Type consistency: `counters`/`startingCounters`, `ReportRow`, `ReportModel`, `calculateTotals`, `buildConversionRecords`, `mountReportsView`, and DB function names are used consistently above.
- Review Focus has a test owner for each risk.
