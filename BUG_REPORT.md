# Bug Report — InvoiceCraft

**Project:** InvoiceCraft (invoice generator)
**Reviewed commit:** `b49518b` — "feat: add Middle Eastern & custom currencies, Previous Invoices filtering, client billing drawers, and graceful new doc save dialog"
**Scope:** `js/app.js`, `js/db.js`, `js/icons.js`, `index.html`, `build.js`
**Findings:** 11 defects — 3 critical (crash / silent data loss / duplicate IDs), 4 correctness, 4 hardening
**Status:** All fixed and verified. 69 assertions passing. Bundle rebuilds and parses cleanly.

> Line numbers below refer to commit `b49518b`, before fixes.

---

## Executive summary

The three critical bugs share a single root cause: **functions were written with side effects and lexical scope assumptions that were never verified.** Because the project has no lint step and `build.js` only checks *syntax* (via `new Function(bundle)`), nothing caught a function being called from outside its declaring scope, or a "read-only preview" that quietly wrote to IndexedDB.

No security vulnerabilities were found. The existing input-sanitization posture is genuinely good — `escapeHtml`, `isValidLogoDataUri`, and SVG script rejection are all sound and I left them intact.

---

## Critical

### 1. `ReferenceError` crash: "+ New Doc" from the client directory

**Location:** `attachNavigationListeners()` → `resetToFreshDocument` (line 2936); caller at `renderClientsList()` (line 3780)

**Symptom**
Clicking **"+ New Doc"** on any client in the Client Directory modal throws `ReferenceError: resetToFreshDocument is not defined`. The modal closes, then nothing happens. Completely dead button — the "Start fresh document for this client" feature is unreachable.

**Root cause**
`resetToFreshDocument` was declared as a nested function inside `attachNavigationListeners()`. `renderClientsList()` is a separate top-level function in the same IIFE, so the nested declaration was never in its scope. Function declarations hoist only within their enclosing function body — not across siblings.

**Fix**
Hoisted `resetToFreshDocument` to module scope. Also added defensive handling while moving it, since it now runs from more call sites:

```js
let defCompany = null;
try {
  defCompany = await getDefaultCompany();
} catch (e) {
  console.warn('Default company lookup failed while starting a new document:', e);
}
```

`renderCompanyProfilesSelector()` is now also wrapped in `try/catch` — it is `async`, and one rejected read should not abort document creation.

**Lesson**
Module-level functions in this bundle can only be reached from other module-level functions. A helper needed by two different feature areas must be declared at top level. A build-time syntax check cannot detect this class of error; it needs a scope/reference lint (e.g. ESLint `no-undef`).

---

### 2. Silent data loss: the Numbering modal preview overwrote saved settings

**Location:** `generateDocumentNumber()` (line 524), specifically the period-rollover block at lines 546–553; triggered by `updateNumberingModalPreviewLive()` (line 629)

**Symptom**
A user opens **Numbering Engine**, types in the pattern/prefix/counter fields to experiment, then closes with **Cancel**. Their real numbering configuration has been replaced by whatever was in the form at that moment. Counter, prefixes, scheme, and reset period are all clobbered, with no warning and no visible symptom beyond subtly wrong invoice numbers later.

**Root cause**
`generateDocumentNumber` was named and used as a pure formatter, but it also:
- mutated its `config` argument (`config.counter`, `config.lastPeriodKey`)
- called `saveNumberingConfig(config)` — an IndexedDB write — as a side effect

`updateNumberingModalPreviewLive` builds a throwaway `tempConfig` from the live form inputs and calls the function on every keystroke. Every keystroke persisted that temp config over the user's saved settings. The write was also **not awaited**, so failures surfaced as unhandled promise rejections.

**Fix**
Separated concerns. Period resolution and rollover are now explicit and separate; number formatting is pure:

```js
function resolvePeriodKey(date, resetPeriod) { /* ... */ }

async function syncNumberingPeriod(config) {
  if (!config || config.mode === 'manual') return false;
  const resetPeriod = config.resetPeriod || 'financial_year';
  const currentPeriodKey = resolvePeriodKey(new Date(), resetPeriod);
  if (config.lastPeriodKey === currentPeriodKey) return false;

  if (resetPeriod !== 'never' && config.lastPeriodKey) {
    config.counter = parseInt(config.startingCounter, 10) || 1;
    config.lastPeriodKey = currentPeriodKey;
    config.updatedAt = Date.now();
    try { await saveNumberingConfig(config); }
    catch (e) { console.warn('Could not persist numbering period rollover:', e); }
    return true;
  }

  // First run: stamp the period key, never reset the counter.
  config.lastPeriodKey = currentPeriodKey;
  try { await saveNumberingConfig(config); }
  catch (e) { console.warn('Could not persist numbering period key:', e); }
  return false;
}

function generateDocumentNumber(docType, dateStr, config, overrideCounter = null) {
  // Pure: no I/O, no mutation of the caller's config.
}
```

`syncNumberingPeriod` is now called only where a rollover is actually meaningful: app init, `switchDocumentType`, `convertToInvoice`, `resetToFreshDocument`, the "Next Seq #" button, and `advanceNumberingCounter`.

One behaviour change worth noting: the Numbering modal's **Save** now explicitly stamps `lastPeriodKey` for the current period, so a counter the user deliberately typed is bound to that period rather than being reset away on the next document.

**Lesson**
A function whose name reads as a pure transformation must not perform I/O. If preview and commit paths share it, the preview inherits the side effect. Also: fire-and-forget promises (`saveNumberingConfig(config)` with no `await`/`.catch()`) hide failures — every persistence call should be awaited and guarded.

---

### 3. Duplicate invoice numbers via "Save & Start Fresh"

**Location:** `btn-new-save-and-start` handler (line 3001)

**Symptom**
Saving through the **New Document** dialog's "Save & Start Fresh" does not advance the auto-numbering counter. The fresh document that follows is issued the same number as the one just saved — two different documents with an identical invoice number.

**Root cause**
The counter-advance logic lived only inside the `btn-save-invoice` click handler. The "Save & Start Fresh" handler called `saveInvoice()` + `updateSavedInvoicesCount()` directly and skipped it entirely. Duplicate logic paths, one of them incomplete.

**Fix**
Extracted the shared logic so the two paths cannot drift again:

```js
async function advanceNumberingCounter() {
  if (!currentNumberingConfig || currentNumberingConfig.mode !== 'auto') return false;
  await syncNumberingPeriod(currentNumberingConfig);

  const expectedCurrent = generateDocumentNumber(
    currentInvoice.meta.docType || 'invoice',
    currentInvoice.meta.date,
    currentNumberingConfig,
    currentNumberingConfig.counter
  );
  // Only advance when the doc still carries the engine's current number, so
  // repeated saves never skip a sequence and hand-typed numbers are preserved.
  if (currentInvoice.meta.number !== expectedCurrent) return false;

  currentNumberingConfig.counter = (parseInt(currentNumberingConfig.counter, 10) || 1) + 1;
  currentNumberingConfig.updatedAt = Date.now();
  try { await saveNumberingConfig(currentNumberingConfig); }
  catch (e) { console.warn('Could not persist advanced numbering counter:', e); }
  updateNumberingBadgeUI(currentNumberingConfig);
  return true;
}

async function persistCurrentDocument() {
  await advanceNumberingCounter();
  await saveInvoice(currentInvoice);
  await updateSavedInvoicesCount();
}
```

Both handlers now call `persistCurrentDocument()`.

**Lesson**
When two features need the same behaviour, extract it once. Inline duplication is where "one path forgot a step" bugs live.

---

## Correctness

### 4. Due Date input never populated from state

**Location:** `populateFormFields()` (~line 897), bound at line 2500

**Symptom**
Opening a saved document, duplicating one, switching document type, or starting a new document shows an **empty Due Date field** in the editor — while the rendered sheet correctly prints the real due date. Because the field is two-way bound, any subsequent edit to it wipes the stored due date.

**Root cause**
`input-inv-due` had a listener writing to `currentInvoice.meta.dueDate`, but the corresponding read in `populateFormFields` was simply omitted. Title, number, date, and PO were all written; due date was missed.

**Fix**
```js
document.getElementById('input-inv-due').value = currentInvoice.meta.dueDate || '';
```

**Lesson**
For every bound input there are two halves: write-on-render and read-on-change. A one-sided binding is invisible until it destroys data. Worth a helper that wires both directions from a single declaration.

---

### 5. Line-item search never matched anything

**Location:** `renderSavedInvoicesList()`, line 3504

**Symptom**
Searching the document history for a line-item description always returns no results, even when the text is clearly present on the invoice.

**Root cause**
```js
const itemsMatch = (inv.items || []).some(it => (it.desc || '').toLowerCase().includes(q));
```
Items store their text in `description`, not `desc`. `it.desc` is always `undefined`, so `itemsMatch` was always `false`. (`desc` is a real field elsewhere — on the template registry — which likely invited the typo.)

**Fix**
```js
const itemsMatch = (inv.items || []).some(it => (it.description || '').toLowerCase().includes(q));
```

**Lesson**
Schema property names are a contract. Searching over persisted records should ideally reference a single accessor rather than raw property names repeated across modules.

---

### 6. History list crashed on any record missing `client` or `meta`

**Location:** `renderSavedInvoicesList()`, lines 3566–3572

**Symptom**
If a single stored record is missing its `client` object, rendering the history modal throws and **the entire list fails to appear** — one bad record hides all history.

**Root cause**
```js
${escapeHtml(inv.meta.number || 'Document')}
${escapeHtml(inv.client.name || 'Client')}   // throws if client is undefined
```
The surrounding code used `inv.meta?.docType` and `inv.client?.name` in the filter and count sections — optional chaining was applied inconsistently within the same function.

**Fix**
```js
${escapeHtml(inv.meta?.number || 'Document')}
${escapeHtml(inv.client?.name || 'Client')}
${escapeHtml(inv.meta?.currency || '$')}
```

**Lesson**
Defensive access must be applied uniformly within a module, not per call site. In list renderers in particular, one malformed record should degrade that row, not the view.

---

### 7. History totals disagreed with the printed sheet

**Location:** `calculateTotal()` line 3804, vs. `updateSheetView()` line 1722 and `renderLineItemsEditor()` line 1361

**Symptom**
The total shown for a saved document in history (and in the client billing drawer) can differ from the total printed on that document. Legacy records without an explicit `taxRate` show ~18% less in the list than the sheet computes.

**Root cause**
Three code paths implemented the same tax default differently:

| Location | Missing `taxRate` treated as |
|---|---|
| `updateSheetView` | `18` |
| `renderLineItemsEditor` | `18` |
| `calculateTotal` | **`0`** |

**Fix**
Aligned `calculateTotal` with the render engine:
```js
const rawRate = (item.taxRate !== undefined && item.taxRate !== null) ? parseFloat(item.taxRate) : 18;
```

**Lesson**
Any business rule implemented in more than one place needs a single source of truth. This is the same class of bug as #3 — divergence between duplicated implementations.

---

## Hardening

### 8. `normalizeInvoice` did not cover imported/legacy records

**Location:** `normalizeInvoice()`, line 295

**Problem**
The function guarantees `meta` and `logo` exist, but not `sender`, `client`, `meta.number`, `meta.currency`, `accentColor`, `font`, or `template` — even though `populateFormFields()` and `updateSheetView()` dereference all of them unguarded. It also left `qty`/`rate` untouched when `null` and did not filter non-object entries from `items`/`taxes`.

Since backup import accepts arbitrary JSON (`importAllData` validates only that `id` is a non-empty string), a hand-edited or partially corrupt backup could produce a record that crashes the editor on load.

**Fix**
Extended normalization to backfill every field the render path dereferences, clamp numerics, coerce types the renderer calls string methods on, and drop malformed entries:

```js
if (!inv.meta.number) {
  inv.meta.number = (DOC_TYPES[inv.meta.docType].prefix || 'INV-') + new Date().getFullYear() + '-001';
}
if (!inv.sender) inv.sender = {};
if (!inv.client) inv.client = {};

// Drop malformed entries so a partially corrupted backup cannot break rendering.
inv.items = inv.items.filter(item => item && typeof item === 'object');
inv.items.forEach(item => {
  ...
  // Coerce to string: the sheet renderer calls .trim()/.toLowerCase() on these.
  if (item.hsn === undefined || item.hsn === null) item.hsn = '';
  else if (typeof item.hsn !== 'string') item.hsn = String(item.hsn);
  ...
});

inv.taxes = inv.taxes.filter(t => t && typeof t === 'object');
inv.taxes.forEach(t => {
  if (typeof t.name !== 'string') t.name = '';
  ...
  t.ratio = clampNum(t.ratio, 0, 100, 50);
});
```

Also added `logo.align` backfill and a numeric check on `logo.width`.

---

### 9. Tax-leg ratio written unescaped and unclamped into an HTML attribute

**Location:** `renderTaxesEditor()`, line 1501

**Problem**
```js
const ratioVal = tax.ratio !== undefined ? tax.ratio : (tax.rate !== undefined ? tax.rate : 50);
// ...
value="${ratioVal}"
```
A crafted backup could place a string containing `"` into `tax.ratio`, breaking out of the attribute. The value was also unvalidated at render time, so a stored value outside 0–100 reached the number input.

**Fix**
```js
const ratioVal = clampNum(tax.ratio !== undefined ? tax.ratio : tax.rate, 0, 100, 50);
```
`clampNum` returns a number, so the attribute can no longer be broken.

**Lesson**
Interpolating into an attribute is only safe with `escapeHtml`; clamping at render is a second layer. Doing both is cheap. (Note the adjacent `tax.name` interpolation already used `escapeHtml` correctly.)

---

### 10. Unhandled promise rejections on numbering writes

**Locations:** `generateDocumentNumber` (lines 549, 552) and the `btn-save-invoice` handler (line 3030)

**Problem**
Four `saveNumberingConfig(...)` calls were fire-and-forget or unguarded. If IndexedDB was unavailable — private browsing, quota exceeded, storage blocked — these produced unhandled rejections with no user feedback, and the counter silently desynced from what was persisted.

**Fix**
All four are now either inside `syncNumberingPeriod` / `advanceNumberingCounter` with `try/catch` and a `console.warn`, or awaited inside `async` event handlers.

---

### 11. Two unused imports

**Location:** `app.js` imports from `./db.js`

`saveCompanyProfile` and `getCompanyProfile` were imported but never referenced in the module body. Removed, along with the corresponding `export` surface remaining in `db.js` untouched (still used by `importAllData` for the legacy-migration path).

---

## Systemic themes

Four distinct bugs (#1, #2, #3, #7) reduce to two recurring patterns:

**A. No static analysis in the build.** `build.js` validates syntax via `new Function(bundle)` and correctly rejects leftover ES-module keywords — genuinely useful. But nothing checks identifier resolution, so bug #1 (out-of-scope call) and unused imports ship silently. Adding ESLint with `no-undef` and `no-unused-vars` would have caught both immediately.

**B. Duplicated logic across code paths.** The counter advance (#3) and the tax-rate default (#7) were each implemented two or three times and drifted. Extracting single sources of truth — `persistCurrentDocument()`, `advanceNumberingCounter()`, and a shared tax-default helper — removes the entire category.

A third, softer theme: **side effects inside functions named like pure transforms** (#2). `generateDocumentNumber` reads as a formatter; that it also persisted state is invisible at every call site.

---

## Verified as *not* bugs

Recording these so they are not "fixed" later:

- **`db-status-indicator` and `companies-count-badge` are referenced in JS but absent from `index.html`.** Both lookups are null-guarded (`if (indicator)`, `if (el)`), so these are harmless optional-target probes, not errors.
- **`btn-quick-zero-tax` / `btn-quick-standard-tax`** are created dynamically via `innerHTML` in `updateSenderTaxHint()` — they correctly do not exist in the static markup.
- **`#doc-type-switcher`** is a deliberate forward-compat guard, documented in a comment at the call site.
- **HTML ids "never referenced" in `app.js`** (e.g. `label-doc-date`, `tab-upload`, `color-presets`) are static labels, containers, and anchors — not orphaned code.
- **Existing security controls are sound and were left untouched:** `escapeHtml`, `isValidLogoDataUri`, the SVG script/handler rejection in the upload path, and the backup-shape validation in the import handler.

---

## Verification performed

- `node build.js` succeeds; the bundle parses and contains no leftover ES-module syntax.
- **49 logic assertions** against extracted pure functions: currency formatting (international + Indian lakh/crore), amount-in-words incl. carry-over rounding, FY boundary months (April/March), period-key resolution, scheme tokens, clamping, HTML escaping, logo URI validation, tax-ID formatting (GSTIN/PAN), and `normalizeInvoice` against malformed input.
- **20 numbering assertions** simulating the full sequence with a stubbed IndexedDB that records every write:
  - three consecutive "Save & Start Fresh" documents produce `0001`, `0002`, `0003` — no duplicates
  - re-saving the same document does **not** burn an additional number
  - five render-only previews produce **zero** writes and leave the counter untouched (the regression test for bug #2)
  - manual mode never auto-numbers and never writes
  - FY rollover resets the counter to `startingCounter`
  - first run stamps the period key **without** resetting the counter
  - repeated sync within a period is a no-op
  - a hand-typed document number is never overwritten
- Static audits for DOM id resolution, function scope, and import usage, re-run after the changes.

Manual browser testing is still recommended for the print/PDF path and the file-upload flow, which could not be exercised headlessly.