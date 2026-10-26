/**
 * Stream B1 fix — editor lifecycle, numbering, drafts, history contracts.
 *
 * js/app.js is DOM-coupled (it wires `document` at module top level), so it
 * cannot be imported under Node. These tests instead assert the source-level
 * invariants required by fix-B1-brief.md, so a regression that removes one of
 * the guards fails loudly here.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const appPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'js', 'app.js');
const src = readFileSync(appPath, 'utf8');

function assertContains(haystack, needle, message) {
  assert.ok(haystack.includes(needle), message || `Expected source to contain: ${needle}`);
}

// ============================================================================
// H1-H4: numberAuto tracking
// ============================================================================
test('H1: engine-generated numbers are marked numberAuto=true', () => {
  // boot (no draft), reset to fresh, switch type, Next Seq, modal apply, conversion, duplicate
  assert.match(src, /meta\.number = generateForType\(type, currentInvoice\.meta\.date, currentNumberingConfig\);\s*\n\s*currentInvoice\.meta\.numberAuto = true;/);
  assert.match(src, /meta\.number = generateForType\(curType, currentInvoice\.meta\.date, currentNumberingConfig\);\s*\n\s*currentInvoice\.meta\.numberAuto = true;/);
  assert.match(src, /meta\.number = generateForType\(newType, currentInvoice\.meta\.date, currentNumberingConfig\);\s*\n\s*currentInvoice\.meta\.numberAuto = true;/);
  assert.match(src, /currentInvoice\.meta\.number = nextNum;\s*\n\s*currentInvoice\.meta\.numberAuto = true;/);
  assert.match(src, /records\.invoice\.meta\.numberAuto = true;/);
  assert.match(src, /duplicate\.meta\.numberAuto = config\.mode === 'auto';/);
});

test('H1: hand-editing the number input clears numberAuto', () => {
  assert.match(src, /bindTextInput\('input-inv-number', val => \{\s*\n\s*currentInvoice\.meta\.number = val;\s*\n\s*[^]*?currentInvoice\.meta\.numberAuto = false;/);
});

test('H1: persisted records are never renumbered (normalizeInvoice guard)', () => {
  assert.match(src, /if \(inv\.updatedAt !== undefined && inv\.updatedAt !== null\) \{\s*\n\s*inv\.meta\.numberAuto = false;/);
});

test('H2: persist applies rollover first, always uniqueness-checks, advances once per issued number only', () => {
  const persistBody = src.slice(src.indexOf('async function persistCurrentDocument()'), src.indexOf('async function openAppModal('));
  assert.ok(persistBody.length > 0, 'persistCurrentDocument must exist');
  assertContains(persistBody, 'rolloverNumberingConfig(currentNumberingConfig)', 'save must apply periodRollover first');
  assertContains(persistBody, "findNumberConflict(number, type, currentDocumentPersisted ? currentInvoice.id : null)", 'save must always uniqueness-check');
  assertContains(persistBody, 'refreshAutoNumberForDraft(config)', 'save must regenerate stale draft numbers from the already-rolled local config');
  // Advance exactly once per issued number: engine-issued drafts and retyped
  // numbers matching the engine's expected current number both advance.
  assert.match(
    persistBody,
    /autoMode && !currentDocumentPersisted &&\s*\n\s*\(currentInvoice\.meta\.numberAuto \|\|\s*\n\s*\(expectedCurrentForCurrentConfig && number === expectedCurrentForCurrentConfig\)\)/,
    'advance condition must cover engine-issued and retyped-to-expected numbers'
  );
  assert.equal((persistBody.match(/advanceTypeCounter\(/g) || []).length, 1, 'persist must call advanceTypeCounter exactly once');
  assertContains(persistBody, 'const expectedCurrentForCurrentConfig = autoMode', 'persist must derive the expected current number from the rolled config');
});

test('H1: issue-date changes regenerate engine-issued draft numbers only', () => {
  assert.match(src, /bindTextInput\('input-inv-date', val => \{\s*\n\s*currentInvoice\.meta\.date = val;[\s\S]*?refreshAutoNumberForDraft\(rolloverNumberingConfig\(currentNumberingConfig\)\);/);
  const refreshBody = src.slice(src.indexOf('function refreshAutoNumberForDraft(config'), src.indexOf('/**\n * Saves the active document'));
  assert.ok(refreshBody.length > 0, 'refreshAutoNumberForDraft must exist');
  assertContains(refreshBody, 'if (currentDocumentPersisted) return false;');
  assertContains(refreshBody, 'rolloverNumberingConfig(config || currentNumberingConfig)', 'helper must roll the effective config itself');
  assertContains(refreshBody, "effective.mode !== 'auto'");
  assertContains(refreshBody, 'if (!currentInvoice.meta.numberAuto) return false;');
});

test('H2-followup: the issue-date path and persist both hand the helper an already-rolled config', () => {
  const persistBody = src.slice(src.indexOf('async function persistCurrentDocument()'), src.indexOf('async function openAppModal('));
  assertContains(persistBody, 'refreshAutoNumberForDraft(config)', 'persist passes its rolled local config');
  const dateBody = src.slice(src.indexOf("bindTextInput('input-inv-date'"), src.indexOf("bindTextInput('input-inv-due'"));
  assertContains(dateBody, 'refreshAutoNumberForDraft(rolloverNumberingConfig(currentNumberingConfig))', 'date path passes a rolled config');
});

test('H1: Next Seq # never rewrites a persisted document number', () => {
  const nextSeqBody = src.slice(src.indexOf("btnQuickNextNum.addEventListener"), src.indexOf('// Change doc type link in Section 3'));
  assertContains(nextSeqBody, 'if (currentDocumentPersisted) {', 'Next Seq must refuse persisted docs');
  assertContains(nextSeqBody, 'Saved documents are never renumbered');
});

test('H1: numbering modal save guards persisted docs and requires {COUNTER} in auto schemes', () => {
  const modalSaveBody = src.slice(src.indexOf('btnSaveNumModal.addEventListener'), src.indexOf('// (Duplicate explicit-close registration removed'));
  assertContains(modalSaveBody, "includes('{COUNTER}')", 'auto schemes must contain {COUNTER}');
  assertContains(modalSaveBody, '&& !currentDocumentPersisted', 'modal must not rewrite a persisted document number');
  assertContains(modalSaveBody, 'currentInvoice.meta.numberAuto = true;');
});

test('H4: numbering modal applies rollover before showing counters and persists changes', () => {
  const populateBody = src.slice(src.indexOf('function populateNumberingModal('), src.indexOf('function updateNumberingModalPreviewLive()'));
  assertContains(populateBody, 'periodRollover(normalizeNumberingConfig(config), new Date())');
  assertContains(populateBody, 'saveNumberingConfig(config)');
});

// ============================================================================
// UI1 / UI5 / UI6: unsaved draft protection
// ============================================================================
test('UI1/UI5: new-document prompt keys off documentEdited only', () => {
  const body = src.slice(src.indexOf('async function requestNewDocument('), src.indexOf('async function loadInvoiceIntoEditor('));
  assert.match(body, /const hasUnsavedWork = documentEdited;/);
  assert.ok(!/!currentDocumentPersisted \|\| documentEdited/.test(body), 'pristine docs must not prompt');
});

test('UI1: open/duplicate resolve the dirty-draft prompt before replacing the draft', () => {
  const openBody = src.slice(src.indexOf('async function openDocumentInEditor('), src.indexOf('async function duplicateDocument('));
  const dupBody = src.slice(src.indexOf('async function duplicateDocument('), src.indexOf('// Compose-only print manager path'));
  for (const [name, body] of [['openDocumentInEditor', openBody], ['duplicateDocument', dupBody]]) {
    const gateIdx = body.indexOf('documentEdited &&');
    const loadIdx = body.indexOf('await loadInvoiceIntoEditor(');
    assert.ok(gateIdx !== -1, `${name} must gate on documentEdited`);
    assert.ok(loadIdx !== -1, `${name} must load the document`);
    assert.ok(gateIdx < loadIdx, `${name} must resolve the prompt before load/saveActiveDraft`);
    assertContains(body, 'confirm(', `${name} must offer discard/cancel`);
  }
});

test('UI6: deleting the open document demotes the editor content to an unsaved draft', () => {
  const delBody = src.slice(src.indexOf("container.querySelectorAll('.btn-del-inv')"), src.indexOf('async function renderClientsList()'));
  assertContains(delBody, 'currentDocumentPersisted = false;');
  assertContains(delBody, 'delete currentInvoice.updatedAt;');
  assertContains(delBody, 'saveActiveDraft(currentInvoice');
});

// ============================================================================
// M6 / M7: duplicate link identity, quick company defaults
// ============================================================================
test('M6: duplicates keep an honest company link (no invented active-profile link)', () => {
  assertContains(src, 'duplicate.companyId = source.companyId || null;');
  assert.ok(!/duplicate\.companyId = source\.companyId \|\| activeCompanyProfileId/.test(src), 'duplicate must not fall back to the active profile link');
});

test('M7: quick company creation inherits document currency/format and never leaves multiple defaults', () => {
  const body = src.slice(src.indexOf("btnUpdateCompany.addEventListener"), src.indexOf('// Quick Open New Company in Modal'));
  assertContains(body, 'defaultCurrency: currentInvoice.meta.currency');
  assertContains(body, 'defaultNumberFormat: currentInvoice.meta.numberFormat');
  assertContains(body, "companies.some(c => c.isDefault)");
  assertContains(body, 'await setDefaultCompany(newComp.id);');
});

// ============================================================================
// M2 / M3 / L2: history/client totals, taxRate default
// ============================================================================
test('M2: client totals are invoices-only and grouped per canonical currency', () => {
  const body = src.slice(src.indexOf('async function renderClientsList('), src.indexOf('// ============================================================================\n// 12. CANVAS ZOOM'));
  assertContains(body, "docType !== 'invoice'") ;
  assertContains(body, "!== 'draft'");
  assertContains(body, 'normalizeCurrency(');
  assertContains(body, 'Number.isFinite(frozen) ? frozen : calculateTotal(inv)');
  assertContains(body, "formatMoney(entry.total, entry.currency, entry.numberFormat)");
});

test('M2-followup: client directory matches durable top-level clientId links too', () => {
  const body = src.slice(src.indexOf('async function renderClientsList('), src.indexOf('// ============================================================================\n// 12. CANVAS ZOOM'));
  assertContains(body, '(inv.clientId === c.id)', 'documents linked via top-level clientId must match');
  assertContains(body, 'Boolean(c.id)', 'id matching must be guarded against records with no id');
});

test('M3: saved-list and history rows use frozen totals with per-document money formatting', () => {
  const listBody = src.slice(src.indexOf('async function renderSavedInvoicesList('), src.indexOf('async function renderClientsList('));
  assertContains(listBody, 'Number.isFinite(frozenInvTotal) ? frozenInvTotal : calculateTotal(inv)');
  assertContains(listBody, "formatMoney(invTotal, inv.meta?.currency || '$', inv.meta?.numberFormat || 'international')");
  assert.ok(!/toFixed\(2\)/.test(listBody), 'saved list must not use raw toFixed(2)');
  const drawerBody = src.slice(src.indexOf('async function renderClientsList('), src.indexOf('// ============================================================================\n// 12. CANVAS ZOOM'));
  assertContains(drawerBody, 'Number.isFinite(frozenDocTotal) ? frozenDocTotal : calculateTotal(doc)');
  assert.ok(!/toFixed\(2\)/.test(drawerBody), 'client drawer must not use raw toFixed(2)');
});

test('L2: normalizeInvoice defaults missing/empty/non-finite item taxRate to 18', () => {
  assert.match(src, /\(item\.taxRate === undefined \|\| item\.taxRate === null \|\| item\.taxRate === ''\) \? 18 : parseFloat\(item\.taxRate\)/);
  assert.ok(!/item\.taxRate = clampNum\(item\.taxRate, 0, 100, 0\)/.test(src), 'invalid taxRate must not fall back to 0');
});

// ============================================================================
// UI3 / UI9 / UI10: stale views, titles, counts
// ============================================================================
test('UI3: notifyDataChanged refreshes counts plus the visible data view, and is called after mutations', () => {
  const body = src.slice(src.indexOf('async function notifyDataChanged()'), src.indexOf('/**\n * Regenerates the engine-issued number'));
  assertContains(body, 'refreshShellCounts()');
  assertContains(body, "view === 'reports' && reportsMounted");
  assertContains(body, 'refreshReportsView()');
  assertContains(body, "view === 'home'");
  assertContains(body, 'renderHome()');

  const mutationSites = [
    ['save', src.indexOf('async function persistCurrentDocument()')],
  ];
  assert.ok(mutationSites.every(([, idx]) => idx !== -1));
  // Called after save, conversion, duplicate, invoice delete, client save/delete, company save/delete, import
  const persistBody = src.slice(src.indexOf('async function persistCurrentDocument()'), src.indexOf('async function openAppModal('));
  assertContains(persistBody, 'await notifyDataChanged();');
  const convertBody = src.slice(src.indexOf('async function convertToInvoice()'), src.indexOf('// 5B. MULTIPLE COMPANY PROFILES ENGINE'));
  assertContains(convertBody, 'await notifyDataChanged();');
  const dupBody = src.slice(src.indexOf('async function duplicateDocument('), src.indexOf('// Compose-only print manager path'));
  assertContains(dupBody, 'await notifyDataChanged();');
  const delBody = src.slice(src.indexOf("container.querySelectorAll('.btn-del-inv')"), src.indexOf('async function renderClientsList()'));
  assertContains(delBody, 'await notifyDataChanged();');
  const clientSaveBody = src.slice(src.indexOf("'btn-save-client-to-book'"), src.indexOf('function setupPillNavigation()'));
  assertContains(clientSaveBody, 'await notifyDataChanged();');
  const clientDelBody = src.slice(src.indexOf("container.querySelectorAll('.btn-del-client')"), src.indexOf('// ============================================================================\n// 12. CANVAS ZOOM'));
  assertContains(clientDelBody, 'await notifyDataChanged();');
  const companySaveBody = src.slice(src.indexOf('async function saveCompanyFromModal()'), src.indexOf('function resetCompanyModalForm()'));
  assertContains(companySaveBody, 'await notifyDataChanged();');
  const companyDelBody = src.slice(src.indexOf("container.querySelectorAll('.btn-del-company')"), src.indexOf('function applyCompanyToInvoice('));
  assertContains(companyDelBody, 'await notifyDataChanged();');
  const importBody = src.slice(src.indexOf('await importAllData(parsed);'), src.indexOf("alert('Database restored successfully!"));
  assertContains(importBody, 'await notifyDataChanged();');
  // Boot must not call it
  const bootBody = src.slice(src.indexOf("document.addEventListener('DOMContentLoaded'"), src.indexOf('// ============================================================================\n// 4. RENDERING'));
  assert.ok(!bootBody.includes('notifyDataChanged()'), 'boot must not call notifyDataChanged');
});

test('UI9: syncComposeTitle exists and runs after load, reset/new, save, conversion, duplicate', () => {
  assertContains(src, 'function syncComposeTitle()');
  for (const anchor of [
    'async function persistCurrentDocument()',
    'async function convertToInvoice()',
    'async function duplicateDocument(',
    'async function resetToFreshDocument(',
    'async function openDocumentInEditor(',
    'async function resumeActiveDraft(',
    'async function switchDocumentType('
  ]) {
    const idx = src.indexOf(anchor);
    assert.ok(idx !== -1, `${anchor} must exist`);
    const body = src.slice(idx, idx + 4000);
    assertContains(body, 'syncComposeTitle();', `${anchor} must call syncComposeTitle`);
  }
});

test('UI10: company count updates also refresh the settings hub count', () => {
  const body = src.slice(src.indexOf('async function updateSavedCompaniesCount()'), src.indexOf('async function renderCompanyProfilesSelector()'));
  assertContains(body, "document.getElementById('settings-company-count')");
});

// ============================================================================
// Report/history load action
// ============================================================================
test('Report Load keeps using openDocumentInEditor as the shared loader', () => {
  assertContains(src, "mountReportsView(reportsRoot, { onOpenDocument: openDocumentInEditor });");
  const listBody = src.slice(src.indexOf("container.querySelectorAll('.btn-load-inv')"), src.indexOf("container.querySelectorAll('.btn-dup-inv')"));
  assertContains(listBody, 'await openDocumentInEditor(btn.dataset.id);');
  const subdocBody = src.slice(src.indexOf("container.querySelectorAll('.btn-load-client-subdoc')"), src.indexOf('// Bind Use Client'));
  assertContains(subdocBody, 'await openDocumentInEditor(btn.dataset.docId);');
});

// ============================================================================
// Final review round
// ============================================================================
test('F1: conversion re-persists a dirty saved source before building records', () => {
  const body = src.slice(src.indexOf('async function convertToInvoice()'), src.indexOf('// 5B. MULTIPLE COMPANY PROFILES ENGINE'));
  assert.match(body, /if \(!currentDocumentPersisted \|\| documentEdited\) \{\s*\n\s*const saved = await persistCurrentDocument\(\);\s*\n\s*if \(!saved\) return;/);
});

test('F2: unlinked legacy documents never acquire the default/active company', () => {
  const selectorBody = src.slice(src.indexOf('async function renderCompanyProfilesSelector()'), src.indexOf('async function renderCompaniesModalList()'));
  assert.ok(!/activeCompanyProfileId = (companies\.find|def\.id)/.test(selectorBody), 'selector must not adopt the default company');
  assertContains(selectorBody, 'No company linked');
  const handlerBody = src.slice(src.indexOf("selectCompany.addEventListener('change'"), src.indexOf('// Update Active Company Profile Button'));
  assertContains(handlerBody, 'if (!val) return;', 'empty selection must be ignored');
  const convertBody = src.slice(src.indexOf('async function convertToInvoice()'), src.indexOf('// 5B. MULTIPLE COMPANY PROFILES ENGINE'));
  assertContains(convertBody, 'sourceSnapshot.companyId ? await getCompany(sourceSnapshot.companyId) : null');
  assertContains(convertBody, 'records.invoice.companyId = sourceSnapshot.companyId || null;');
  assert.ok(!/records\.invoice\.companyId = sourceSnapshot\.companyId \|\| activeCompanyProfileId/.test(src), 'conversion must not fall back to the active profile link');
});

test('F3: reset-safe scheme validation exists with per-policy period-token rules', () => {
  const helperBody = src.slice(src.indexOf('function validateNumberingSchemePeriod('), src.indexOf('/**\n * Manual rebranding:'));
  assert.ok(helperBody.length > 0, 'validateNumberingSchemePeriod helper must exist');
  assert.match(helperBody, /resetPeriod === 'monthly' && !\(hasYear && hasMonth\)/);
  assert.match(helperBody, /resetPeriod === 'calendar_year' && !hasYear/);
  assert.match(helperBody, /resetPeriod === 'financial_year' &&\s*\n?\s*!\(pattern\.includes\('\{FY\}'\) \|\| /);
  assert.ok(!/resetPeriod === 'never' &&/.test(helperBody), "'never' must impose no period-token requirement");
  const modalSaveBody = src.slice(src.indexOf('btnSaveNumModal.addEventListener'), src.indexOf('// (Duplicate explicit-close registration removed'));
  assertContains(modalSaveBody, 'validateNumberingSchemePeriod(nextConfig.scheme, nextConfig.resetPeriod)');
  const saveBranch = modalSaveBody.slice(modalSaveBody.indexOf('validateNumberingSchemePeriod'));
  const returnIdx = saveBranch.indexOf('return;', saveBranch.indexOf('alert(periodError)'));
  const closeIdx = saveBranch.indexOf("closeModal('modal-numbering-engine')");
  assert.ok(returnIdx !== -1 && closeIdx !== -1 && returnIdx < closeIdx, 'invalid scheme must return without saving or closing');
});

test('F4: failed saves and stale draft records can never look persisted', () => {
  const persistBody = src.slice(src.indexOf('async function persistCurrentDocument()'), src.indexOf('async function openAppModal('));
  const catchBody = persistBody.slice(persistBody.indexOf('} catch (err) {'));
  assertContains(catchBody, 'currentDocumentPersisted = false;');
  assertContains(catchBody, 'delete currentInvoice.updatedAt;');
  assertContains(catchBody, 'documentEdited = true;');
  assertContains(catchBody, 'saveActiveDraft(currentInvoice');
  assertContains(persistBody, 'const persistedBeforeAttempt = currentDocumentPersisted;');
  assertContains(persistBody, 'saveCompleted = true;');

  const bootBody = src.slice(src.indexOf("document.addEventListener('DOMContentLoaded'"), src.indexOf('// ============================================================================\n// 4. RENDERING'));
  assertContains(bootBody, 'await getInvoice(savedDraft.id)');
  assertContains(bootBody, 'draftRecord.edited === null ? true : Boolean(draftRecord.edited)');

  const resumeBody = src.slice(src.indexOf('async function resumeActiveDraft()'), src.indexOf('async function requestNewDocument('));
  assertContains(resumeBody, 'await getInvoice(data.id)');
  assertContains(resumeBody, 'record.edited === null ? true : Boolean(record.edited)');
  assert.ok(!/persisted: Boolean\(record\.data\.updatedAt\)/.test(resumeBody), 'resume must verify, not infer persistence');
});

test('F5: flushAutoSave never writes a pristine document as a draft', () => {
  const body = src.slice(src.indexOf('async function flushAutoSave()'), src.indexOf('// ============================================================================\n// 3. INITIALIZATION'));
  const gateIdx = body.indexOf('if (!documentEdited && !currentDocumentPersisted) {');
  const writeIdx = body.indexOf('saveActiveDraft(');
  assert.ok(gateIdx !== -1 && writeIdx !== -1 && gateIdx < writeIdx, 'pristine gate must precede any activeDraft write');
});

test('F6: numbering modal mirrors edited counters into startingCounters', () => {
  const body = src.slice(src.indexOf('function readNumberingModalConfig()'), src.indexOf('/**\n * Reset-safety validation'));
  assertContains(body, 'startingCounters: Object.assign({}, counters)');
  assert.ok(!body.includes('startingCounters: base.startingCounters'), 'the old invisible baseline must be gone');
});

test('F7: manual sender edits detach the company link; programmatic application does not', () => {
  assertContains(src, 'function detachCompanyLink()');
  const detachBody = src.slice(src.indexOf('function detachCompanyLink()'), src.indexOf('async function saveCompanyFromModal()'));
  assertContains(detachBody, 'activeCompanyProfileId = null;');
  assertContains(detachBody, 'currentInvoice.companyId = null;');
  const senderBody = src.slice(src.indexOf("// Sender Fields"), src.indexOf('// Sender Payment & Notes Two-Way Sync'));
  for (const field of ['input-sender-name', 'input-sender-email', 'input-sender-phone', 'input-sender-address', 'input-sender-taxid']) {
    const fieldIdx = senderBody.indexOf(`bindTextInput('${field}'`);
    const nextFieldIdx = senderBody.indexOf("bindTextInput('", fieldIdx + 1);
    const chunk = senderBody.slice(fieldIdx, nextFieldIdx === -1 ? senderBody.length : nextFieldIdx);
    assertContains(chunk, 'detachCompanyLink();', `${field} must detach the company link`);
  }
  const applyBody = src.slice(src.indexOf('function applyCompanyToInvoice('), src.indexOf('function detachCompanyLink()'));
  assert.ok(!applyBody.includes('detachCompanyLink()'), 'programmatic company application must not detach');
});

test('F8: default document dates are local calendar dates', () => {
  const stateBody = src.slice(src.indexOf('const DEFAULT_INVOICE_STATE = {'), src.indexOf('function normalizeInvoice('));
  assertContains(stateBody, 'date: appLocalDateString()');
  assertContains(stateBody, 'dueDate: addDaysLocal(appLocalDateString(), 14)');
  assert.ok(!stateBody.includes('new Date().toISOString()'), 'default state must not use UTC-shifted dates');
});
