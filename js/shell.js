/**
 * InvoiceCraft App Shell
 * Hash router, Home, Settings hub, shared print/shortcut routing.
 *
 * Views: #/home (default), #/compose, #/reports, #/settings.
 * Compose stays mounted; CSS toggles top-level views through body[data-view].
 */

import {
  getAllInvoices,
  getAllClients,
  getAllCompanies,
  getActiveDraftRecord
} from './db.js';
import { summarizeHome } from './reports.js';
import { formatMoney, normalizeCurrency, calculateTotals } from './calc.js';
import { parseLocalDate } from './numbering.js';
import { canPrintReports } from './report-ui.js';

const SHELL_APP_VERSION = '1.3.0';
const SHELL_ROUTES = ['home', 'compose', 'reports', 'settings'];
const SHELL_ROUTE_TITLES = {
  home: 'Home',
  compose: 'Compose',
  reports: 'Reports',
  settings: 'Settings'
};
const SHELL_HEADING_IDS = {
  home: 'home-heading',
  compose: 'compose-heading',
  reports: 'report-heading',
  settings: 'settings-heading'
};

let shellOptions = {};
let shellMounted = false;
let shellCurrentView = 'home';
let shellRouteToken = 0;
let shellHomeRenderToken = 0;
let shellHeaderMoreClose = null;

function normalizeRoute(value) {
  const raw = String(value || '').replace(/^#\/?/, '').split(/[/?]/)[0].toLowerCase();
  return SHELL_ROUTES.includes(raw) ? raw : 'home';
}

function parseHash() {
  return normalizeRoute(window.location.hash);
}

function setHash(view) {
  const target = '#/' + view;
  if (window.location.hash === target) return;
  try {
    window.history.replaceState(null, '', target);
  } catch (e) {
    window.location.hash = target;
  }
}

function isDialogOpen() {
  try {
    return Boolean(document.querySelector('dialog[open], .app-modal[open]'));
  } catch (e) {
    return false;
  }
}

function closeOpenDialogs() {
  document.querySelectorAll('dialog[open], .app-modal[open]').forEach(dialog => {
    try {
      if (typeof dialog.close === 'function') dialog.close();
      else {
        dialog.removeAttribute('open');
        dialog.style.display = 'none';
      }
    } catch (e) {
      try {
        dialog.removeAttribute('open');
        dialog.style.display = 'none';
      } catch (e2) {}
    }
  });
}

function openDialogById(id) {
  if (typeof shellOptions.onOpenModal === 'function') {
    return Promise.resolve(shellOptions.onOpenModal(id));
  }
  const modal = document.getElementById(id);
  if (!modal) return Promise.resolve(false);
  if (typeof modal.showModal === 'function') {
    try {
      modal.showModal();
      return Promise.resolve(true);
    } catch (e) {}
  }
  modal.setAttribute('open', '');
  modal.style.display = 'block';
  return Promise.resolve(true);
}

function setupHeaderMore() {
  const toggle = document.getElementById('btn-header-more');
  const panel = document.getElementById('header-more-panel');
  if (!toggle || !panel) return;

  let open = false;

  const setOpen = (next) => {
    open = Boolean(next);
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  };

  const close = () => {
    if (!open) return;
    setOpen(false);
  };

  shellHeaderMoreClose = close;

  toggle.addEventListener('click', () => {
    setOpen(!open);
  });

  // Let each button's own handler run first, then dismiss the menu.
  panel.addEventListener('click', (event) => {
    const target = event.target && event.target.nodeType === 1
      ? event.target
      : event.target && event.target.parentElement;
    if (!target || !target.closest || !target.closest('button')) return;
    setTimeout(close, 0);
  });

  document.addEventListener('click', (event) => {
    if (!open) return;
    const target = event.target;
    if (target && (toggle.contains(target) || panel.contains(target))) return;
    close();
  });

  document.addEventListener('keydown', (event) => {
    if (!open || event.key !== 'Escape') return;
    close();
    try { toggle.focus(); } catch (e) {}
  });

  toggle.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowDown') return;
    event.preventDefault();
    if (!open) setOpen(true);
    const first = panel.querySelector('button');
    if (first) first.focus();
  });
}

function closeHeaderMore() {
  if (typeof shellHeaderMoreClose === 'function') shellHeaderMoreClose();
}

function isEditingTarget(target) {
  if (!target || !target.tagName) return false;
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' ||
    target.isContentEditable === true ||
    Boolean(target.closest && target.closest('[contenteditable="true"]'));
}

function formatRelativeTime(timestamp) {
  if (!timestamp) return 'just now';
  const then = Number(timestamp);
  if (!Number.isFinite(then)) return 'recently';
  const diff = Math.max(0, Date.now() - then);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  try {
    return new Date(then).toLocaleDateString();
  } catch (e) {
    return 'recently';
  }
}

function shortDate(value) {
  if (!value) return '';
  try {
    // Date-only values must use the local calendar, not UTC midnight.
    const d = typeof value === 'number' ? new Date(value) : parseLocalDate(value);
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString();
  } catch (e) {
    return String(value);
  }
}

function shellEscapeHtml(str) {
  if (str === undefined || str === null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function countByType(invoices, type) {
  return invoices.filter(inv => ((inv && inv.meta && inv.meta.docType) || inv.docType || 'invoice') === type).length;
}

function fallbackSummary(invoices) {
  const currencyMap = new Map();
  invoices.forEach(inv => {
    const meta = inv.meta || {};
    const docType = meta.docType || inv.docType || 'invoice';
    const status = meta.status || inv.status || 'draft';
    const isDraft = status === 'draft';
    const norm = normalizeCurrency(meta.currency || '$');
    if (!currencyMap.has(norm.key)) {
      currencyMap.set(norm.key, {
        currencyKey: norm.key,
        currencySymbol: meta.currency || norm.symbol,
        invoices: 0,
        invoiceTotal: 0,
        paidTotal: 0,
        outstanding: 0,
        taxTotal: 0
      });
    }
    const bucket = currencyMap.get(norm.key);
    if (docType === 'invoice' && !isDraft) {
      const totals = calculateTotals(inv);
      bucket.invoices += 1;
      bucket.invoiceTotal += totals.total;
      bucket.taxTotal += totals.taxTotal;
      if (status === 'paid') bucket.paidTotal += totals.total;
      else bucket.outstanding += totals.total;
    }
  });
  const currencySummaries = Array.from(currencyMap.values());
  return {
    totalDocuments: invoices.length,
    invoiceCount: countByType(invoices, 'invoice'),
    openQuotes: invoices.filter(inv => {
      const type = (inv.meta && inv.meta.docType) || 'invoice';
      const status = (inv.meta && inv.meta.status) || '';
      return (type === 'quotation' || type === 'estimate') && status !== 'accepted' && status !== 'declined' && status !== 'expired';
    }).length,
    unpaidInvoices: invoices.filter(inv => {
      const type = (inv.meta && inv.meta.docType) || 'invoice';
      const status = (inv.meta && inv.meta.status) || '';
      return type === 'invoice' && status !== 'draft' && status !== 'paid';
    }).length,
    currencySummaries,
    recentDocuments: invoices.slice(0, 5)
  };
}

function numberValue() {
  return Array.prototype.slice.call(arguments).find(v => v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v)));
}

function normalizeCurrencySummaries(summary, invoices) {
  let list = summary && (summary.currencySummaries || summary.perCurrency || summary.currencies || summary.byCurrency);
  if (list && !Array.isArray(list) && typeof list === 'object') {
    list = Object.keys(list).map(key => Object.assign({ currencyKey: key }, list[key]));
  }
  if (!Array.isArray(list) || list.length === 0) {
    list = fallbackSummary(invoices).currencySummaries;
  }

  // Older summaries omit numberFormat; derive it from a saved document so
  // Home matches the Reports register (e.g. INR uses Indian grouping).
  const invoiceFormats = new Map();
  if (Array.isArray(invoices)) {
    for (const inv of invoices) {
      if (!inv) continue;
      const meta = inv.meta || {};
      const norm = normalizeCurrency(meta.currency || inv.currencyKey || '$');
      if (invoiceFormats.has(norm.key)) continue;
      const format = meta.numberFormat || inv.numberFormat;
      if (format) invoiceFormats.set(norm.key, format);
    }
  }

  return list.map(item => {
    const key = item.currencyKey || item.key || item.currency || '$';
    const norm = normalizeCurrency(key);
    return {
      key: norm.key,
      symbol: item.currencySymbol || item.symbol || key,
      numberFormat: item.numberFormat || invoiceFormats.get(norm.key) || 'international',
      invoices: Number(item.invoices ?? item.invoiceCount ?? item.count ?? 0),
      invoiced: Number(item.invoiceTotal ?? item.invoiced ?? item.totalInvoiced ?? item.revenue ?? item.total ?? 0),
      paid: Number(item.paidTotal ?? item.paid ?? 0),
      outstanding: Number(item.outstanding ?? item.unpaid ?? item.pending ?? 0),
      tax: Number(item.taxTotal ?? item.taxCurrentPeriod ?? item.tax ?? 0)
    };
  });
}

function renderHomeDraft(record) {
  const container = document.getElementById('home-continue');
  if (!container) return;
  if (!record || !record.data) {
    container.innerHTML = `
      <div class="home-continue-empty">
        <div>
          <div class="home-card-eyebrow">Continue working</div>
          <h2>No active draft yet</h2>
          <p>Start a new invoice or quotation. Your work is auto-saved locally as you type.</p>
        </div>
        <button type="button" class="btn btn-primary" data-home-action="new-invoice">New Invoice</button>
      </div>
    `;
    return;
  }

  const data = record.data || {};
  const meta = data.meta || {};
  const type = meta.docType || 'invoice';
  const typeName = type === 'quotation' ? 'Quotation' : type === 'estimate' ? 'Estimate' : type === 'proforma' ? 'Proforma' : 'Invoice';
  const number = meta.number || 'Untitled document';
  const client = (data.client && data.client.name) || 'No client yet';
  const currency = meta.currency || '$';
  const totals = calculateTotals(data);
  const totalText = formatMoney(totals.total, currency, meta.numberFormat || 'international');

  container.innerHTML = `
    <div class="home-continue-card">
      <div class="home-continue-main">
        <div class="home-card-eyebrow">Continue draft</div>
        <div class="home-continue-title-row">
          <h2>${shellEscapeHtml(number)}</h2>
          <span class="home-type-chip">${shellEscapeHtml(typeName)}</span>
        </div>
        <p>${shellEscapeHtml(client)} &bull; ${shellEscapeHtml(totalText)}</p>
        <p class="home-muted">Last saved ${shellEscapeHtml(formatRelativeTime(record.updatedAt))}</p>
      </div>
      <button type="button" class="btn btn-primary" data-home-action="resume-draft">Resume draft</button>
    </div>
  `;
}

function renderHomeStats(summary, currencySummaries, invoices) {
  const container = document.getElementById('home-stats');
  if (!container) return;

  const totalDocuments = numberValue(summary && summary.totalDocuments, summary && summary.documentCount, summary && summary.documents, invoices.length);
  const invoiceCount = numberValue(summary && summary.invoiceCount, summary && summary.invoices, countByType(invoices, 'invoice'));
  const openQuotes = numberValue(summary && summary.openQuotes, summary && summary.openQuoteCount, summary && summary.openQuotations);
  const unpaid = numberValue(summary && summary.unpaidInvoices, summary && summary.unpaidInvoiceCount, summary && summary.outstandingInvoices);

  container.innerHTML = `
    <div class="home-stat-card">
      <span class="home-stat-label">Documents</span>
      <strong class="home-stat-value">${shellEscapeHtml(totalDocuments)}</strong>
      <span class="home-stat-note">All saved types</span>
    </div>
    <div class="home-stat-card">
      <span class="home-stat-label">Invoices</span>
      <strong class="home-stat-value">${shellEscapeHtml(invoiceCount)}</strong>
      <span class="home-stat-note">Revenue documents</span>
    </div>
    <div class="home-stat-card">
      <span class="home-stat-label">Open quotes</span>
      <strong class="home-stat-value">${shellEscapeHtml(openQuotes !== undefined ? openQuotes : '—')}</strong>
      <span class="home-stat-note">Pipeline, not revenue</span>
    </div>
    <div class="home-stat-card">
      <span class="home-stat-label">Unpaid invoices</span>
      <strong class="home-stat-value">${shellEscapeHtml(unpaid !== undefined ? unpaid : '—')}</strong>
      <span class="home-stat-note">Outstanding balance below</span>
    </div>
    <div class="home-currency-wrap">
      ${currencySummaries.length === 0 ? '<div class="home-empty-inline">No saved invoice totals yet.</div>' : `
        <p class="home-currency-note">Invoiced, paid and outstanding are all-time. Tax is for the current month.</p>
        ${currencySummaries.map(c => `
        <div class="home-currency-card">
          <div class="home-currency-head">
            <strong>${shellEscapeHtml(c.symbol || c.key)}</strong>
            <span>${shellEscapeHtml(c.key)}</span>
          </div>
          <div class="home-currency-row"><span>Invoiced</span><strong>${shellEscapeHtml(formatMoney(c.invoiced, c.symbol, c.numberFormat))}</strong></div>
          <div class="home-currency-row"><span>Paid</span><span>${shellEscapeHtml(formatMoney(c.paid, c.symbol, c.numberFormat))}</span></div>
          <div class="home-currency-row"><span>Outstanding</span><span>${shellEscapeHtml(formatMoney(c.outstanding, c.symbol, c.numberFormat))}</span></div>
          <div class="home-currency-row"><span>Tax this month</span><span>${shellEscapeHtml(formatMoney(c.tax, c.symbol, c.numberFormat))}</span></div>
        </div>
      `).join('')}`}
    </div>
  `;
}

function renderRecentDocuments(summary, invoices) {
  const container = document.getElementById('home-recent');
  if (!container) return;
  let docs = summary && (summary.recentDocuments || summary.recent);
  if (!Array.isArray(docs) || docs.length === 0) docs = invoices.slice(0, 5);

  if (!docs || docs.length === 0) {
    container.innerHTML = '<div class="home-empty-inline">No documents saved yet. Your first invoice will appear here.</div>';
    return;
  }

  container.innerHTML = docs.slice(0, 5).map(doc => {
    const id = doc.id || '';
    const number = doc.number || (doc.meta && doc.meta.number) || 'Untitled';
    const type = doc.docType || (doc.meta && doc.meta.docType) || 'invoice';
    const status = doc.status || (doc.meta && doc.meta.status) || 'draft';
    const client = doc.clientName || (doc.client && doc.client.name) || 'Client';
    const currency = doc.currencySymbol || (doc.meta && doc.meta.currency) || doc.currencyKey || '$';
    const total = Number(doc.total ?? (doc.meta && doc.meta.total) ?? calculateTotals(doc).total) || 0;
    const date = doc.issueDate || (doc.meta && doc.meta.date) || doc.updatedAt;
    const numberFormat = doc.numberFormat || (doc.meta && doc.meta.numberFormat) || 'international';
    const remark = doc.convertedToNumber ? `Converted to ${doc.convertedToNumber}` : (doc.sourceDocNumber ? `From ${doc.sourceDocNumber}` : '');
    return `
      <div class="home-recent-row">
        <div class="home-recent-main">
          <div class="home-recent-title">
            <strong>${shellEscapeHtml(number)}</strong>
            <span class="home-type-chip">${shellEscapeHtml(type)}</span>
            <span class="home-status-chip">${shellEscapeHtml(status)}</span>
          </div>
          <div class="home-recent-meta">${shellEscapeHtml(client)}${date ? ' • ' + shellEscapeHtml(shortDate(date)) : ''}${remark ? ' • ' + shellEscapeHtml(remark) : ''}</div>
        </div>
        <div class="home-recent-actions">
          <span class="home-recent-total">${shellEscapeHtml(formatMoney(total, currency, numberFormat))}</span>
          ${id ? `<button type="button" class="btn btn-secondary btn-sm" data-open-document="${shellEscapeHtml(id)}">Open</button>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

async function updateStorageInfo() {
  const el = document.getElementById('home-storage-text');
  if (!el) return;
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      const used = estimate.usage || 0;
      const quota = estimate.quota || 0;
      if (quota > 0) {
        const usedMb = (used / (1024 * 1024)).toFixed(1);
        const pct = Math.min(100, (used / quota) * 100).toFixed(1);
        el.textContent = `IndexedDB in use: ~${usedMb} MB (${pct}% of available browser storage).`;
        return;
      }
    }
    el.textContent = 'IndexedDB storage is active in this browser. Use Backup regularly.';
  } catch (e) {
    el.textContent = 'IndexedDB storage is active in this browser. Use Backup regularly.';
  }
}

export async function renderHome() {
  const token = ++shellHomeRenderToken;
  const draftEl = document.getElementById('home-continue');
  const statsEl = document.getElementById('home-stats');
  const recentEl = document.getElementById('home-recent');
  if (!draftEl || !statsEl || !recentEl) return;

  if (!draftEl.innerHTML.trim()) {
    draftEl.innerHTML = '<div class="home-loading">Loading your workspace…</div>';
  }

  let invoices = [];
  let clients = [];
  let companies = [];
  let draftRecord = null;
  try {
    const results = await Promise.all([
      getAllInvoices(),
      getAllClients(),
      getAllCompanies(),
      getActiveDraftRecord()
    ]);
    invoices = results[0] || [];
    clients = results[1] || [];
    companies = results[2] || [];
    draftRecord = results[3] || null;
  } catch (e) {
    if (token !== shellHomeRenderToken) return;
    draftEl.innerHTML = `<div class="home-empty-inline">Could not read local data: ${shellEscapeHtml(e && e.message ? e.message : 'database unavailable')}.</div>`;
    return;
  }
  if (token !== shellHomeRenderToken) return;

  let summary = null;
  try {
    summary = summarizeHome({ invoices, clients, companies, now: new Date() });
  } catch (e) {
    summary = fallbackSummary(invoices);
  }
  if (!summary || typeof summary !== 'object') summary = fallbackSummary(invoices);

  const currencySummaries = normalizeCurrencySummaries(summary, invoices);
  renderHomeDraft(draftRecord);
  renderHomeStats(summary, currencySummaries, invoices);
  renderRecentDocuments(summary, invoices);

  const draftState = document.getElementById('home-draft-state');
  if (draftState) {
    draftState.textContent = draftRecord ? `Draft saved ${formatRelativeTime(draftRecord.updatedAt)}` : 'No draft saved';
  }
  const versionEl = document.getElementById('home-version');
  if (versionEl) versionEl.textContent = SHELL_APP_VERSION;
  updateStorageInfo();
  refreshShellCounts({ invoices, clients, companies });
}

export function refreshShellCounts(preloaded) {
  const update = ({ invoices, clients, companies }) => {
    document.querySelectorAll('[data-shell-count="documents"]').forEach(el => {
      el.textContent = invoices.length;
    });
    document.querySelectorAll('[data-shell-count="clients"]').forEach(el => {
      el.textContent = clients.length;
    });
    document.querySelectorAll('[data-shell-count="companies"]').forEach(el => {
      el.textContent = companies.length;
    });
    const settingsDocs = document.getElementById('settings-doc-count');
    if (settingsDocs) settingsDocs.textContent = invoices.length;
    const settingsClients = document.getElementById('settings-client-count');
    if (settingsClients) settingsClients.textContent = clients.length;
    const settingsCompanies = document.getElementById('settings-company-count');
    if (settingsCompanies) settingsCompanies.textContent = companies.length;
  };

  if (preloaded) {
    update(preloaded);
    return Promise.resolve();
  }
  return Promise.all([
    getAllInvoices().catch(() => []),
    getAllClients().catch(() => []),
    getAllCompanies().catch(() => [])
  ]).then(results => update({ invoices: results[0], clients: results[1], companies: results[2] }))
    .catch(() => {});
}

export function getCurrentView() {
  return shellCurrentView;
}

export async function printCurrentView() {
  if (shellCurrentView === 'compose') {
    if (typeof shellOptions.printCompose === 'function') {
      await shellOptions.printCompose();
      return true;
    }
    window.dispatchEvent(new CustomEvent('invoicecraft:print-compose'));
    return true;
  }

  if (shellCurrentView === 'reports') {
    if (typeof shellOptions.printReports === 'function') {
      await shellOptions.printReports();
      return true;
    }
    // Never print the Reports spinner/empty shell before data has loaded.
    if (!canPrintReports()) return false;
    const reportButton = document.querySelector('#report-btn-print, #btn-report-print, #btn-print-report, #report-print, #report-print-btn, [data-report-print], [data-report-action="print"], [data-action="print-report"]');
    if (reportButton) {
      reportButton.click();
      return true;
    }
    const origTitle = document.title;
    document.title = 'InvoiceCraft Report';
    const restore = () => { document.title = origTitle; };
    window.addEventListener('afterprint', restore, { once: true });
    try { window.print(); } finally { setTimeout(restore, 1500); }
    return true;
  }

  // Home and Settings intentionally do not print.
  return false;
}

function handleRouteClick(event) {
  const routeTarget = event.target.closest && event.target.closest('[data-route]');
  if (routeTarget) {
    event.preventDefault();
    navigateTo(routeTarget.getAttribute('data-route'));
    return;
  }

  const modalTarget = event.target.closest && event.target.closest('[data-open-modal]');
  if (modalTarget) {
    event.preventDefault();
    openDialogById(modalTarget.getAttribute('data-open-modal'));
    return;
  }

  const actionTarget = event.target.closest && event.target.closest('[data-home-action]');
  if (actionTarget) {
    event.preventDefault();
    const action = actionTarget.getAttribute('data-home-action');
    if (action === 'new-invoice' || action === 'new-quote') {
      if (typeof shellOptions.onNewDocument === 'function') shellOptions.onNewDocument(action === 'new-quote' ? 'quotation' : 'invoice');
      else navigateTo('compose');
      return;
    }
    if (action === 'resume-draft') {
      if (typeof shellOptions.onResumeDraft === 'function') shellOptions.onResumeDraft();
      else navigateTo('compose');
      return;
    }
    if (action === 'clients' || action === 'companies' || action === 'backup' || action === 'guide') {
      const modalMap = {
        clients: 'modal-clients',
        companies: 'modal-companies',
        backup: 'modal-backup',
        guide: 'modal-user-guide'
      };
      openDialogById(modalMap[action]);
      return;
    }
  }

  const docTarget = event.target.closest && event.target.closest('[data-open-document]');
  if (docTarget) {
    event.preventDefault();
    const id = docTarget.getAttribute('data-open-document');
    if (typeof shellOptions.onOpenDocument === 'function') shellOptions.onOpenDocument(id);
  }
}

function handleShortcut(event) {
  const key = String(event.key || '').toLowerCase();
  const mod = event.ctrlKey || event.metaKey;
  if (!mod) return;
  // Leave browser-specific combos (Ctrl+Shift+S/P, Alt variants) alone.
  if (event.altKey || event.shiftKey) return;

  if (key === 'p') {
    event.preventDefault();
    if (isDialogOpen()) return;
    printCurrentView();
    return;
  }

  if (key === 's') {
    // Always claim Ctrl/Cmd+S so the browser Save Page dialog never opens.
    event.preventDefault();
    if (shellCurrentView !== 'compose' || isDialogOpen()) return;
    // Input events already update editor state, so saving from a field is safe.
    if (typeof shellOptions.onSaveCompose === 'function') shellOptions.onSaveCompose();
    else window.dispatchEvent(new CustomEvent('invoicecraft:save-compose'));
    return;
  }

  if (key === 'b') {
    // Always claim the chord; only Compose may toggle its sidebar.
    event.preventDefault();
    if (shellCurrentView !== 'compose' || isDialogOpen() || isEditingTarget(event.target)) return;
    if (typeof shellOptions.onToggleSidebar === 'function') shellOptions.onToggleSidebar();
  }
}

async function applyRoute(view, opts = {}) {
  const normalized = normalizeRoute(view);
  const token = ++shellRouteToken;
  shellCurrentView = normalized;
  setHash(normalized);

  closeOpenDialogs();
  closeHeaderMore();
  if (!opts.initial && typeof shellOptions.flushAutosave === 'function') {
    try { await shellOptions.flushAutosave(); } catch (e) { console.warn('Autosave flush failed:', e); }
  }
  if (token !== shellRouteToken) return;

  document.body.dataset.view = normalized;
  document.title = `${SHELL_ROUTE_TITLES[normalized]} - InvoiceCraft`;

  document.querySelectorAll('[data-route]').forEach(el => {
    const isActive = normalizeRoute(el.getAttribute('data-route')) === normalized;
    el.classList.toggle('active', isActive);
    if (isActive) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  });

  if (normalized === 'home') {
    await renderHome();
  } else if (normalized === 'settings') {
    refreshShellCounts();
  }
  if (token !== shellRouteToken) return;

  if (typeof shellOptions.onRouteChange === 'function') {
    try {
      await shellOptions.onRouteChange(normalized);
    } catch (e) {
      console.error('Route change handler failed:', e);
    }
  }

  if (!opts.initial) {
    const heading = document.getElementById(SHELL_HEADING_IDS[normalized]);
    if (heading) {
      if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
      try {
        heading.focus({ preventScroll: true });
      } catch (e) {
        heading.focus();
      }
    }
  }
}

export function navigateTo(view) {
  const normalized = normalizeRoute(view);
  if (normalized === shellCurrentView && document.body.dataset.view === normalized) {
    const target = '#/' + normalized;
    if (window.location.hash === target) return;
  }
  if (window.location.hash === '#/' + normalized) {
    applyRoute(normalized);
  } else {
    // hashchange performs the actual route switch.
    window.location.hash = '#/' + normalized;
  }
}

export function initShell(options = {}) {
  shellOptions = options || {};
  if (shellMounted) return;
  shellMounted = true;

  const initial = parseHash();
  if (!window.location.hash || !SHELL_ROUTES.includes(parseHash())) {
    setHash(initial);
  }
  document.body.dataset.view = initial;
  setupHeaderMore();
  document.addEventListener('click', handleRouteClick);
  window.addEventListener('keydown', handleShortcut);
  window.addEventListener('hashchange', () => {
    applyRoute(parseHash());
  });
  applyRoute(initial, { initial: true });
}
