/**
 * InvoiceCraft — Reports view UI.
 *
 * Mounts the full-page Reports view into a supplied root element:
 * Dashboard / Documents / Tax tabs, filter bar (date preset + custom range,
 * company, client, type, status, currency), per-currency stat cards,
 * company/client summaries, conversion + paid-proforma summaries, the
 * document register (Load / CSV), tax by rate and by leg, print button and
 * loading / empty / error states.
 *
 * Contract with the shell:
 *  - mountReportsView(root, { onOpenDocument }) — shell supplies the element
 *    and an open-in-Compose callback. The editor DOM is never assumed.
 *  - refreshReportsView() re-reads IndexedDB and re-renders.
 *  - One load per refresh, filter in memory, request token guards against
 *    stale async results when the view is refreshed quickly.
 *  - All element ids are report-* only; no editor/modal ids are touched.
 */

import { getAllInvoices, getAllClients, getAllCompanies } from './db.js';
import { buildReportModel, toCsv } from './reports.js';
import { formatMoney } from './calc.js';

// ============================================================================
// 1. STATE
// ============================================================================
const state = {
  mounted: false,
  root: null,
  onOpenDocument: null,
  requestToken: 0,
  activeTab: 'dashboard',
  loading: false,
  model: null,
  filters: {
    datePreset: 'all', // 'all' | 'this_month' | 'last_month' | 'this_fy' | 'last_fy' | 'custom'
    dateFrom: '',
    dateTo: '',
    docType: 'all',
    status: 'all',
    company: 'all',
    client: 'all',
    currency: 'all'
  }
};

// ============================================================================
// 2. SMALL UTILITIES
// ============================================================================
function esc(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Returns { from, to } as YYYY-MM-DD strings ('' = unbounded). */
function resolvePresetRange(preset, now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (preset) {
    case 'this_month':
      return { from: `${y}-${pad2(m + 1)}-01`, to: `${y}-${pad2(m + 1)}-31` };
    case 'last_month': {
      const py = m === 0 ? y - 1 : y;
      const pm = m === 0 ? 11 : m - 1;
      return { from: `${py}-${pad2(pm + 1)}-01`, to: `${py}-${pad2(pm + 1)}-31` };
    }
    case 'this_fy': {
      const fy = (m >= 3) ? { from: `${y}-04-01`, to: `${y + 1}-03-31` } : { from: `${y - 1}-04-01`, to: `${y}-03-31` };
      return fy;
    }
    case 'last_fy': {
      const fy = (m >= 3) ? { from: `${y - 1}-04-01`, to: `${y}-03-31` } : { from: `${y - 2}-04-01`, to: `${y - 1}-03-31` };
      return fy;
    }
    default:
      return { from: '', to: '' };
  }
}

function effectiveDateFilters() {
  const f = state.filters;
  if (f.datePreset !== 'custom') {
    const range = resolvePresetRange(f.datePreset, new Date());
    return { dateFrom: range.from, dateTo: range.to };
  }
  return { dateFrom: f.dateFrom, dateTo: f.dateTo };
}

function money(value, rowLike) {
  return formatMoney(value, rowLike && rowLike.currencySymbol ? rowLike.currencySymbol : '', rowLike && rowLike.numberFormat ? rowLike.numberFormat : 'international');
}

function sortRowsNewest(rows) {
  return [...rows].sort((a, b) => {
    const d = String(b.issueDate || '').localeCompare(String(a.issueDate || ''));
    if (d !== 0) return d;
    return String(b.number || '').localeCompare(String(a.number || ''));
  });
}

// ============================================================================
// 3. FILTERED AGGREGATION (all money stays inside per-currency buckets)
// ============================================================================
function aggregateRows(rows) {
  const byCurrency = new Map();
  const companies = new Map();
  const clients = new Map();
  const taxRates = new Map(); // currencyKey -> Map(rate -> {taxable, tax})
  const taxLegs = new Map();  // currencyKey -> Map(name -> {ratio, amount})

  function currencyBucket(row) {
    let bucket = byCurrency.get(row.currencyKey);
    if (!bucket) {
      bucket = { currencyKey: row.currencyKey, symbol: row.currencySymbol, numberFormat: row.numberFormat, documents: 0, invoices: 0, drafts: 0, revenue: 0, paid: 0, outstanding: 0, pipeline: 0, pipelineCount: 0, tax: 0 };
      byCurrency.set(row.currencyKey, bucket);
    }
    return bucket;
  }

  function party(map, row, which) {
    const id = which === 'company' ? row.companyId : row.clientId;
    const name = which === 'company' ? row.companyName : row.clientName;
    const key = id ? 'id:' + id : 'name:' + name;
    let entry = map.get(key);
    if (!entry) {
      entry = { id, name: name || 'Unlinked', linked: which === 'company' ? row.companyLinked : row.clientLinked, count: 0, currencyBuckets: [] };
      map.set(key, entry);
    }
    entry.count += 1;
    if (row.isDraft || !row.isInvoice || row.isConvertedSource) return;
    let bucket = entry.currencyBuckets.find(b => b.currencyKey === row.currencyKey);
    if (!bucket) {
      bucket = { currencyKey: row.currencyKey, symbol: row.currencySymbol, numberFormat: row.numberFormat, revenue: 0, paid: 0, outstanding: 0, tax: 0 };
      entry.currencyBuckets.push(bucket);
    }
    bucket.revenue += row.total;
    bucket.tax += row.taxTotal;
    if (row.isPaid) bucket.paid += row.total;
    else if (row.isOutstanding) bucket.outstanding += row.total;
  }

  for (const row of rows) {
    const bucket = currencyBucket(row);
    bucket.documents += 1;
    if (row.docType === 'invoice') bucket.invoices += 1;
    if (row.isDraft) bucket.drafts += 1;

    if (!row.isDraft && row.isInvoice && !row.isConvertedSource) {
      bucket.revenue += row.total;
      bucket.tax += row.taxTotal;
      if (row.isPaid) bucket.paid += row.total;
      else if (row.isOutstanding) bucket.outstanding += row.total;

      // Tax-by-rate grouping for the Tax tab.
      if (!taxRates.has(row.currencyKey)) taxRates.set(row.currencyKey, new Map());
      const rateMap = taxRates.get(row.currencyKey);
      for (const rate of row.taxRates) {
        if (!rateMap.has(rate.rate)) rateMap.set(rate.rate, { rate: rate.rate, taxable: 0, tax: 0 });
        const r = rateMap.get(rate.rate);
        r.taxable += rate.taxable;
        r.tax += rate.tax;
      }

      if (!taxLegs.has(row.currencyKey)) taxLegs.set(row.currencyKey, new Map());
      const legMap = taxLegs.get(row.currencyKey);
      for (const leg of row.taxLegs) {
        const key = (leg.name || 'Tax') + '|' + leg.ratio;
        if (!legMap.has(key)) legMap.set(key, { name: leg.name || 'Tax', ratio: leg.ratio, amount: 0 });
        legMap.get(key).amount += leg.amount;
      }
    }

    const isProformaPaid = row.docType === 'proforma' && row.isPaid;
    if (!row.isDraft && row.docType !== 'invoice' && !row.isConvertedSource && !isProformaPaid && ['sent', 'accepted', 'pending'].includes(row.status)) {
      bucket.pipeline += row.total;
      bucket.pipelineCount += 1;
    }

    party(companies, row, 'company');
    party(clients, row, 'client');
  }

  return { byCurrency, companies, clients, taxRates, taxLegs };
}

function sortedCurrencyBuckets(byCurrency) {
  return [...byCurrency.values()].sort((a, b) => a.currencyKey.localeCompare(b.currencyKey));
}

function remarkOf(row) {
  const remarks = [];
  if (row.sourceDocId) remarks.push(`From ${row.sourceDocNumber || row.sourceDocId}`);
  if (row.convertedToId) remarks.push(`Converted to ${row.convertedToNumber || row.convertedToId}`);
  return remarks.join(' · ');
}

// ============================================================================
// 4. SKELETON
// ============================================================================
function buildSkeleton() {
  const root = state.root;
  root.classList.add('report-root');
  root.innerHTML = `
    <header class="report-header">
      <div class="report-heading-group">
        <h2 id="report-heading" class="report-title">Reports</h2>
        <p class="report-subtitle">Saved documents, revenue and tax — grouped strictly by currency.</p>
      </div>
      <div class="report-header-actions">
        <button id="report-btn-print" type="button" class="report-btn">Print</button>
      </div>
    </header>

    <div id="report-filterbar" class="report-filterbar">
      <label class="report-filter">
        <span>Period</span>
        <select id="report-filter-date-preset">
          <option value="all">All time</option>
          <option value="this_month">This month</option>
          <option value="last_month">Last month</option>
          <option value="this_fy">This FY</option>
          <option value="last_fy">Last FY</option>
          <option value="custom">Custom range</option>
        </select>
      </label>
      <label class="report-filter report-filter-date">
        <span>From</span>
        <input id="report-filter-date-from" type="date" disabled />
      </label>
      <label class="report-filter report-filter-date">
        <span>To</span>
        <input id="report-filter-date-to" type="date" disabled />
      </label>
      <label class="report-filter">
        <span>Company</span>
        <select id="report-filter-company"></select>
      </label>
      <label class="report-filter">
        <span>Client</span>
        <select id="report-filter-client"></select>
      </label>
      <label class="report-filter">
        <span>Type</span>
        <select id="report-filter-type">
          <option value="all">All types</option>
          <option value="invoice">Invoices</option>
          <option value="quotation">Quotations</option>
          <option value="estimate">Estimates</option>
          <option value="proforma">Proformas</option>
        </select>
      </label>
      <label class="report-filter">
        <span>Status</span>
        <select id="report-filter-status">
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="pending">Pending</option>
          <option value="paid">Paid</option>
          <option value="sent">Sent</option>
          <option value="accepted">Accepted</option>
          <option value="declined">Declined</option>
          <option value="expired">Expired</option>
        </select>
      </label>
      <label class="report-filter">
        <span>Currency</span>
        <select id="report-filter-currency"></select>
      </label>
      <button id="report-btn-clear-filters" type="button" class="report-btn report-btn-ghost">Clear</button>
    </div>

    <nav id="report-tabbar" class="report-tabbar" aria-label="Report views">
      <button id="report-tab-dashboard" type="button" class="report-tab is-active" data-tab="dashboard">Dashboard</button>
      <button id="report-tab-documents" type="button" class="report-tab" data-tab="documents">Documents</button>
      <button id="report-tab-tax" type="button" class="report-tab" data-tab="tax">Tax</button>
    </nav>

    <div class="report-content-wrap">
      <div id="report-content"></div>
    </div>
  `;
}

function contentEl() {
  return state.root ? state.root.querySelector('#report-content') : null;
}

// ============================================================================
// 5. FILTER OPTIONS
// ============================================================================
function renderFilterOptions() {
  const model = state.model;
  if (!model || !state.root) return;

  const companySelect = state.root.querySelector('#report-filter-company');
  const clientSelect = state.root.querySelector('#report-filter-client');
  const currencySelect = state.root.querySelector('#report-filter-currency');

  const prevCompany = state.filters.company;
  const prevClient = state.filters.client;
  const prevCurrency = state.filters.currency;

  const companyOptions = ['<option value="all">All companies</option>'];
  for (const c of model.companySummaries) {
    const value = c.id || c.name;
    companyOptions.push(`<option value="${esc(value)}">${esc(c.name)}${c.linked ? '' : ' · unlinked'}</option>`);
  }
  companySelect.innerHTML = companyOptions.join('');

  const clientOptions = ['<option value="all">All clients</option>'];
  for (const c of model.clientSummaries) {
    const value = c.id || c.name;
    clientOptions.push(`<option value="${esc(value)}">${esc(c.name)}${c.linked ? '' : ' · unlinked'}</option>`);
  }
  clientSelect.innerHTML = clientOptions.join('');

  const currencies = new Map();
  for (const row of model.rows) {
    if (row.currencyKey) currencies.set(row.currencyKey, row.currencySymbol || row.currencyKey);
  }
  const currencyOptions = ['<option value="all">All currencies</option>'];
  for (const [key, symbol] of [...currencies.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    currencyOptions.push(`<option value="${esc(key)}">${esc(symbol)} · ${esc(key)}</option>`);
  }
  currencySelect.innerHTML = currencyOptions.join('');

  // Preserve user selections while they still exist; otherwise reset the
  // applied filter and control together, then rebuild once. 'all' is always
  // present, so this cannot loop.
  const hasOption = (select, value) => [...select.options].some(o => o.value === value);
  let filtersReset = false;

  if (hasOption(companySelect, prevCompany)) {
    companySelect.value = prevCompany;
  } else {
    state.filters.company = 'all';
    companySelect.value = 'all';
    filtersReset = true;
  }
  if (hasOption(clientSelect, prevClient)) {
    clientSelect.value = prevClient;
  } else {
    state.filters.client = 'all';
    clientSelect.value = 'all';
    filtersReset = true;
  }
  if (hasOption(currencySelect, prevCurrency)) {
    currencySelect.value = prevCurrency;
  } else {
    state.filters.currency = 'all';
    currencySelect.value = 'all';
    filtersReset = true;
  }

  if (filtersReset) onFilterChange();
  return filtersReset;
}

// ============================================================================
// 6. STATEFUL VIEWS
// ============================================================================
function renderLoading() {
  const content = contentEl();
  if (!content) return;
  content.innerHTML = `
    <div class="report-state-card" id="report-loading">
      <div class="report-spinner" aria-hidden="true"></div>
      <p>Reading your saved documents&hellip;</p>
    </div>
  `;
}

function renderError(message) {
  const content = contentEl();
  if (!content) return;
  content.innerHTML = `
    <div class="report-state-card report-state-error" id="report-error">
      <h3>Reports could not be loaded</h3>
      <p>${esc(message || 'Something went wrong while reading the local database.')}</p>
      <button id="report-btn-retry" type="button" class="report-btn">Retry</button>
    </div>
  `;
}

function renderEmpty(reason) {
  const content = contentEl();
  if (!content) return;
  content.innerHTML = `
    <div class="report-state-card" id="report-empty">
      <h3>${reason.heading}</h3>
      <p>${reason.body}</p>
    </div>
  `;
}

// ============================================================================
// 7. DASHBOARD TAB
// ============================================================================
function renderDashboard() {
  const model = state.model;
  const content = contentEl();
  if (!model || !content) return;

  const filtered = model.filteredRows;
  const agg = aggregateRows(filtered);
  const cards = [];

  // Top-level stat cards (counts only — money never crosses currencies).
  const invoicesCount = filtered.filter(r => r.docType === 'invoice').length;
  const unpaidCount = filtered.filter(r => r.docType === 'invoice' && r.isOutstanding).length;
  const openQuoteCount = filtered.filter(r => r.docType === 'quotation' && !r.isDraft && !r.isConvertedSource && ['sent', 'accepted'].includes(r.status)).length;
  const draftCount = filtered.filter(r => r.isDraft).length;
  const convertedCount = filtered.filter(r => r.isInvoice && r.isConvertedChild).length;

  cards.push(`<div class="report-card"><span class="report-card-label">Documents</span><span class="report-card-value">${filtered.length}</span></div>`);
  cards.push(`<div class="report-card"><span class="report-card-label">Invoices</span><span class="report-card-value">${invoicesCount}</span></div>`);
  cards.push(`<div class="report-card"><span class="report-card-label">Unpaid invoices</span><span class="report-card-value">${unpaidCount}</span></div>`);
  cards.push(`<div class="report-card"><span class="report-card-label">Open quotes</span><span class="report-card-value">${openQuoteCount}</span></div>`);
  cards.push(`<div class="report-card"><span class="report-card-label">Drafts</span><span class="report-card-value">${draftCount}</span></div>`);
  cards.push(`<div class="report-card"><span class="report-card-label">From conversion</span><span class="report-card-value">${convertedCount}</span></div>`);

  // Document inventory by type/status for the filtered set (counts only).
  const typeLabels = { invoice: 'Invoice', quotation: 'Quotation', estimate: 'Estimate', proforma: 'Proforma' };
  const typeCounts = { invoice: 0, quotation: 0, estimate: 0, proforma: 0 };
  const statusLabels = { draft: 'Draft', pending: 'Pending', paid: 'Paid', sent: 'Sent', accepted: 'Accepted', declined: 'Declined', expired: 'Expired' };
  const statusOrder = ['draft', 'pending', 'sent', 'accepted', 'paid', 'declined', 'expired'];
  const statusCounts = new Map();
  for (const row of filtered) {
    if (Object.prototype.hasOwnProperty.call(typeCounts, row.docType)) typeCounts[row.docType] += 1;
    statusCounts.set(row.status, (statusCounts.get(row.status) || 0) + 1);
  }
  const typeCountRows = Object.keys(typeCounts)
    .map(type => `<div><dt>${esc(typeLabels[type])}</dt><dd>${typeCounts[type]}</dd></div>`)
    .join('');
  const statusEntries = statusOrder
    .filter(status => statusCounts.has(status))
    .map(status => [status, statusCounts.get(status)]);
  for (const [status, count] of statusCounts) {
    if (!Object.prototype.hasOwnProperty.call(statusLabels, status)) statusEntries.push([status, count]);
  }
  const statusCountRows = statusEntries
    .map(([status, count]) => `<div><dt>${esc(statusLabels[status] || status)}</dt><dd>${count}</dd></div>`)
    .join('');

  // Per-currency cards — bucket by bucket money.
  const currencyBlocks = sortedCurrencyBuckets(agg.byCurrency).map(bucket => `
    <div class="report-card report-card-currency">
      <span class="report-card-label">Revenue · ${esc(bucket.symbol || bucket.currencyKey || 'No currency')}</span>
      <span class="report-card-value">${esc(money(bucket.revenue, bucket))}</span>
      <dl class="report-card-breakdown">
        <div><dt>Paid</dt><dd>${esc(money(bucket.paid, bucket))}</dd></div>
        <div><dt>Outstanding</dt><dd>${esc(money(bucket.outstanding, bucket))}</dd></div>
        <div><dt>Pipeline</dt><dd>${esc(money(bucket.pipeline, bucket))} (${bucket.pipelineCount})</dd></div>
        <div><dt>Tax</dt><dd>${esc(money(bucket.tax, bucket))}</dd></div>
        <div><dt>Drafts</dt><dd>${bucket.drafts}</dd></div>
      </dl>
    </div>
  `).join('');

  // Conversion & paid proforma summaries.
  const convertedSources = filtered.filter(r => r.isConvertedSource);
  const proformaPaid = filtered.filter(r => r.isPaid && r.docType === 'proforma' && !r.isDraft);
  const proformaPaidBuckets = new Map();
  for (const row of proformaPaid) {
    if (!proformaPaidBuckets.has(row.currencyKey)) {
      proformaPaidBuckets.set(row.currencyKey, { currencyKey: row.currencyKey, symbol: row.currencySymbol, numberFormat: row.numberFormat, count: 0, total: 0 });
    }
    const b = proformaPaidBuckets.get(row.currencyKey);
    b.count += 1;
    b.total += row.total;
  }

  const companyRowsTable = companySummaryTable(agg.companies);
  const clientRowsTable = clientSummaryTable(agg.clients);

  const recent = sortRowsNewest(filtered).slice(0, 5);
  const recentMarkup = recent.map(row => `
    <li class="report-recent-item">
      <span class="report-recent-num">${esc(row.number || '(no number)')}</span>
      <span class="report-recent-meta">${esc(row.docTypeLabel)} · ${esc(row.statusLabel)} · ${esc(row.issueDate || '—')}</span>
      <button type="button" class="report-btn report-btn-ghost" data-report-open="${esc(row.id)}">Load</button>
    </li>
  `).join('');

  content.innerHTML = `
    <div class="report-cards" id="report-stat-cards">${cards.join('')}</div>
    <section class="report-section panel" id="report-counts-section">
      <div class="report-section-panel">
        <h3 class="report-section-title" id="report-type-counts-title">Documents by type</h3>
        <dl class="report-card-breakdown" id="report-type-counts">${typeCountRows}</dl>
      </div>
      <div class="report-section-panel">
        <h3 class="report-section-title" id="report-status-counts-title">Documents by status</h3>
        <dl class="report-card-breakdown" id="report-status-counts">${statusCountRows}</dl>
      </div>
    </section>
    <section class="report-section">
      <h3 class="report-section-title" id="report-currency-summary-title">By currency</h3>
      <div class="report-cards">${currencyBlocks || '<p class="report-muted">No documents in this period.</p>'}</div>
    </section>
    <section class="report-section">
      <h3 class="report-section-title" id="report-company-summary-title">By company</h3>
      ${companyRowsTable}
      ${clientRowsTable}
    </section>
    <section class="report-section report-section-two">
      <div class="report-section-panel">
        <h3 class="report-section-title" id="report-conversion-summary-title">Conversions</h3>
        <p class="report-muted">${convertedSources.length} source document${convertedSources.length === 1 ? '' : 's'} converted into invoices (durable links).</p>
        <ul class="report-plain-list" id="report-conversion-list">
          ${convertedSources.slice(0, 5).map(r => `<li><strong>${esc(r.number || r.id)}</strong> → ${esc(r.convertedToNumber || r.convertedToId)}</li>`).join('')}
        </ul>
        <h3 class="report-section-title" id="report-paidproforma-summary-title">Paid proformas</h3>
        <ul class="report-plain-list" id="report-paidproforma-list">
          ${proformaPaidBuckets.size
            ? [...proformaPaidBuckets.values()].map(b => `<li><strong>${esc(b.symbol || b.currencyKey)}</strong> ${esc(money(b.total, b))} · ${b.count} proforma${b.count === 1 ? '' : 's'}</li>`).join('')
            : '<li class="report-muted">None in this period.</li>'}
        </ul>
      </div>
      <div class="report-section-panel">
        <h3 class="report-section-title" id="report-recent-title">Recent documents</h3>
        <ul class="report-recent-list" id="report-recent-list">
          ${recentMarkup || '<li class="report-muted">No documents yet.</li>'}
        </ul>
      </div>
    </section>
  `;
}

function bucketLines(buckets, field) {
  if (!buckets.length) return '<span class="report-muted">—</span>';
  return buckets.map(b => `${esc(b.symbol || b.currencyKey || '')} ${esc(money(b[field] || 0, b))}`).join('<br>');
}

function companySummaryTable(companies) {
  const list = [...companies.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const body = list.map(c => `
    <tr>
      <td>${esc(c.name)}${c.linked ? '' : ' <span class="report-tag-unlinked">unlinked</span>'}</td>
      <td>${c.count}</td>
      <td>${bucketLines(c.currencyBuckets, 'revenue')}</td>
      <td>${bucketLines(c.currencyBuckets, 'paid')}</td>
      <td>${bucketLines(c.currencyBuckets, 'outstanding')}</td>
      <td>${bucketLines(c.currencyBuckets, 'tax')}</td>
    </tr>
  `).join('');
  return `
    <div class="report-table-wrap">
      <table class="report-table" id="report-company-table">
        <thead><tr><th>Company</th><th>Documents</th><th>Invoiced</th><th>Paid</th><th>Outstanding</th><th>Tax</th></tr></thead>
        <tbody>${body || '<tr><td colspan="6" class="report-muted">No companies to show.</td></tr>'}</tbody>
      </table>
    </div>
  `;
}

function clientSummaryTable(clients) {
  const list = [...clients.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  if (list.length === 0) return '';
  const body = list.map(c => `
    <tr>
      <td>${esc(c.name)}${c.linked ? '' : ' <span class="report-tag-unlinked">unlinked</span>'}</td>
      <td>${c.count}</td>
      <td>${bucketLines(c.currencyBuckets, 'revenue')}</td>
      <td>${bucketLines(c.currencyBuckets, 'paid')}</td>
      <td>${bucketLines(c.currencyBuckets, 'outstanding')}</td>
    </tr>
  `).join('');
  return `
    <h3 class="report-section-title" id="report-client-summary-title">By client</h3>
    <div class="report-table-wrap">
      <table class="report-table" id="report-client-table">
        <thead><tr><th>Client</th><th>Documents</th><th>Invoiced</th><th>Paid</th><th>Outstanding</th></tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  `;
}

// ============================================================================
// 8. DOCUMENTS TAB
// ============================================================================
function csvRows() {
  const model = state.model;
  const rows = [['Number', 'Type', 'Status', 'Issue Date', 'Due Date', 'Company', 'Client', 'Currency', 'Total', 'Conversion']];
  for (const row of sortRowsNewest(model.filteredRows)) {
    rows.push([
      row.number,
      row.docTypeLabel,
      row.statusLabel,
      row.issueDate,
      row.dueDate,
      row.companyName,
      row.clientName,
      row.currencyKey || row.currencySymbol,
      money(row.total, row),
      remarkOf(row)
    ]);
  }
  return rows;
}

function downloadCsv() {
  if (!state.model) return;
  const csv = toCsv(csvRows());
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const now = new Date();
  a.href = url;
  a.download = `invoicecraft-documents-${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function renderDocuments() {
  const model = state.model;
  const content = contentEl();
  if (!model || !content) return;

  const rows = sortRowsNewest(model.filteredRows);
  const body = rows.map(row => `
    <tr class="report-doc-row" data-report-id="${esc(row.id)}">
      <td class="report-strong">${esc(row.number || '(no number)')}</td>
      <td>${esc(row.docTypeLabel)}</td>
      <td><span class="report-status report-status-${esc(row.status)}">${esc(row.statusLabel)}</span></td>
      <td>${esc(row.issueDate || '—')}</td>
      <td>${esc(row.companyName || '—')}${row.companyLinked === false ? ' <span class="report-tag-unlinked">unlinked</span>' : ''}</td>
      <td>${esc(row.clientName || '—')}${row.clientLinked === false ? ' <span class="report-tag-unlinked">unlinked</span>' : ''}</td>
      <td>${esc(row.currencySymbol || row.currencyKey || '—')}</td>
      <td class="report-num">${esc(money(row.total, row))}</td>
      <td>${esc(remarkOf(row) || '—')}</td>
      <td><button type="button" class="report-btn report-btn-ghost" data-report-open="${esc(row.id)}">Load</button></td>
    </tr>
  `).join('');

  const typeText = rows.length === 1 ? 'document' : 'documents';

  content.innerHTML = `
    <div class="report-toolbar">
      <span class="report-muted" id="report-doc-count">${rows.length} ${typeText}</span>
      <div class="report-header-actions">
        <button id="report-btn-csv" type="button" class="report-btn">Export CSV</button>
      </div>
    </div>
    <div class="report-table-wrap">
      <table class="report-table" id="report-documents-table">
        <thead>
          <tr>
            <th>Number</th><th>Type</th><th>Status</th><th>Issued</th>
            <th>Company</th><th>Client</th><th>Cur</th>
            <th class="report-num">Total</th><th>Conversion</th><th></th>
          </tr>
        </thead>
        <tbody>${body || '<tr><td colspan="10" class="report-muted">No documents match the current filters.</td></tr>'}</tbody>
      </table>
    </div>
  `;
}

// ============================================================================
// 9. TAX TAB
// ============================================================================
function renderTax() {
  const model = state.model;
  const content = contentEl();
  if (!model || !content) return;

  const rows = model.filteredRows;
  if (rows.length === 0) {
    renderEmpty({
      heading: 'No tax to report',
      body: 'No saved documents match the current filters. Loosen the period or status filters and try again.'
    });
    return;
  }

  const agg = aggregateRows(rows);
  const currencyList = sortedCurrencyBuckets(agg.byCurrency);

  const rateRows = currencyList.map(bucket => {
    const rateMap = agg.taxRates.get(bucket.currencyKey);
    if (!rateMap) return '';
    return [...rateMap.values()]
      .sort((a, b) => b.rate - a.rate)
      .map(r => `
        <tr>
          <td>${esc(bucket.symbol || bucket.currencyKey)}</td>
          <td>${esc(r.rate)}%</td>
          <td class="report-num">${esc(money(r.taxable, bucket))}</td>
          <td class="report-num">${esc(money(r.tax, bucket))}</td>
        </tr>
      `).join('');
  }).join('');

  const legRows = currencyList.map(bucket => {
    const legMap = agg.taxLegs.get(bucket.currencyKey);
    if (!legMap) return '';
    return [...legMap.values()].map(l => `
      <tr>
        <td>${esc(bucket.symbol || bucket.currencyKey)}</td>
        <td>${esc(l.name)}</td>
        <td>${esc(l.ratio)}% split</td>
        <td class="report-num">${esc(money(l.amount, bucket))}</td>
      </tr>
    `).join('');
  }).join('');

  content.innerHTML = `
    <section class="report-section" id="report-tax-by-rate">
      <h3 class="report-section-title">Tax by rate</h3>
      <div class="report-table-wrap">
        <table class="report-table">
          <thead><tr><th>Currency</th><th>Rate</th><th class="report-num">Taxable</th><th class="report-num">Tax</th></tr></thead>
          <tbody>${rateRows || '<tr><td colspan="4" class="report-muted">No taxable invoices in this period.</td></tr>'}</tbody>
        </table>
      </div>
    </section>
    <section class="report-section" id="report-tax-by-leg">
      <h3 class="report-section-title">Tax by leg</h3>
      <div class="report-table-wrap">
        <table class="report-table">
          <thead><tr><th>Currency</th><th>Leg</th><th>Split</th><th class="report-num">Tax amount</th></tr></thead>
          <tbody>${legRows || '<tr><td colspan="4" class="report-muted">No tax legs recorded in this period.</td></tr>'}</tbody>
        </table>
      </div>
    </section>
    <p class="report-muted" id="report-tax-note">Tax legs are split shares of the computed tax, never extra rates. Totals match the invoice sheet.</p>
  `;
}

// ============================================================================
// 10. RENDER PIPELINE
// ============================================================================
function renderActiveTab() {
  const model = state.model;
  if (!model) return;

  const tabbar = state.root.querySelector('#report-tabbar');
  for (const tab of tabbar.querySelectorAll('.report-tab')) {
    tab.classList.toggle('is-active', tab.dataset.tab === state.activeTab);
  }

  if (model.rows.length === 0) {
    renderEmpty({
      heading: 'No saved documents yet',
      body: 'Save an invoice, quotation, estimate or proforma in Compose and it will appear here with revenue, pipeline and tax stats.'
    });
    renderFilterOptions();
    return;
  }

  if (model.filteredRows.length === 0) {
    renderEmpty({
      heading: 'Nothing matches these filters',
      body: 'Try a wider period, different status, or clear the filters to see everything.'
    });
    // Rebuild the controls even when nothing matched; a vanished selection
    // may need to be reset and reloaded.
    renderFilterOptions();
    return;
  }

  if (renderFilterOptions()) return;
  if (state.activeTab === 'documents') renderDocuments();
  else if (state.activeTab === 'tax') renderTax();
  else renderDashboard();
}

// ============================================================================
// 11. DATA LOAD
// ============================================================================
function setPrintEnabled(enabled) {
  const button = state.root && state.root.querySelector('#report-btn-print');
  if (button) button.disabled = !enabled;
}

async function loadAndRender() {
  if (!state.mounted || !state.root) return;
  const token = ++state.requestToken;

  state.loading = true;
  setPrintEnabled(false);
  renderLoading();

  try {
    const [invoices, clients, companies] = await Promise.all([
      getAllInvoices(),
      getAllClients(),
      getAllCompanies()
    ]);
    if (token !== state.requestToken) return; // stale result — a newer refresh won

    const dates = effectiveDateFilters();
    state.model = buildReportModel({
      invoices,
      clients,
      companies,
      filters: {
        dateFrom: dates.dateFrom,
        dateTo: dates.dateTo,
        docType: state.filters.docType,
        status: state.filters.status,
        company: state.filters.company,
        client: state.filters.client,
        currency: state.filters.currency
      },
      now: new Date()
    });
    renderActiveTab();
  } catch (err) {
    if (token !== state.requestToken) return;
    console.error('[report-ui] load failed:', err);
    state.model = null;
    renderError((err && err.message) ? err.message : 'The local database is not responding.');
  } finally {
    if (token === state.requestToken) {
      state.loading = false;
      setPrintEnabled(Boolean(state.model));
    }
  }
}

// ============================================================================
// 12. EVENT WIRING
// ============================================================================
function onFilterChange() {
  loadAndRender().catch(err => console.error('[report-ui] refresh failed:', err));
}

function attachEvents() {
  const root = state.root;

  root.addEventListener('change', (event) => {
    const target = event.target;
    switch (target.id) {
      case 'report-filter-date-preset': {
        state.filters.datePreset = target.value;
        const fromInput = root.querySelector('#report-filter-date-from');
        const toInput = root.querySelector('#report-filter-date-to');
        const isCustom = state.filters.datePreset === 'custom';
        fromInput.disabled = !isCustom;
        toInput.disabled = !isCustom;
        if (!isCustom) {
          const range = resolvePresetRange(state.filters.datePreset, new Date());
          state.filters.dateFrom = range.from;
          state.filters.dateTo = range.to;
          fromInput.value = range.from;
          toInput.value = range.to;
        }
        onFilterChange();
        break;
      }
      case 'report-filter-date-from':
        state.filters.dateFrom = target.value;
        if (state.filters.dateTo && state.filters.dateTo < state.filters.dateFrom) {
          state.filters.dateTo = state.filters.dateFrom;
          root.querySelector('#report-filter-date-to').value = state.filters.dateTo;
        }
        onFilterChange();
        break;
      case 'report-filter-date-to':
        state.filters.dateTo = target.value;
        onFilterChange();
        break;
      case 'report-filter-company':
        state.filters.company = target.value;
        onFilterChange();
        break;
      case 'report-filter-client':
        state.filters.client = target.value;
        onFilterChange();
        break;
      case 'report-filter-type':
        state.filters.docType = target.value;
        onFilterChange();
        break;
      case 'report-filter-status':
        state.filters.status = target.value;
        onFilterChange();
        break;
      case 'report-filter-currency':
        state.filters.currency = target.value;
        onFilterChange();
        break;
      default:
        break;
    }
  });

  root.addEventListener('click', (event) => {
    const target = event.target;
    const tabButton = target.closest && target.closest('#report-tabbar .report-tab');
    if (tabButton) {
      state.activeTab = tabButton.dataset.tab;
      renderActiveTab();
      return;
    }

    const openButton = target.closest && target.closest('[data-report-open]');
    if (openButton && typeof state.onOpenDocument === 'function') {
      state.onOpenDocument(openButton.getAttribute('data-report-open'));
      return;
    }

    switch (target.id) {
      case 'report-btn-print':
        if (state.loading || !state.model) break;
        try { window.print(); } catch (e) { console.warn('[report-ui] print failed:', e); }
        break;
      case 'report-btn-csv':
        downloadCsv();
        break;
      case 'report-btn-retry':
        loadAndRender().catch(err => console.error('[report-ui] retry failed:', err));
        break;
      case 'report-btn-clear-filters':
        state.filters.datePreset = 'all';
        state.filters.dateFrom = '';
        state.filters.dateTo = '';
        state.filters.docType = 'all';
        state.filters.status = 'all';
        state.filters.company = 'all';
        state.filters.client = 'all';
        state.filters.currency = 'all';
        const presetSelect = root.querySelector('#report-filter-date-preset');
        if (presetSelect) presetSelect.value = 'all';
        const fromInput = root.querySelector('#report-filter-date-from');
        const toInput = root.querySelector('#report-filter-date-to');
        if (fromInput) { fromInput.value = ''; fromInput.disabled = true; }
        if (toInput) { toInput.value = ''; toInput.disabled = true; }
        const typeSelect = root.querySelector('#report-filter-type');
        if (typeSelect) typeSelect.value = 'all';
        const statusSelect = root.querySelector('#report-filter-status');
        if (statusSelect) statusSelect.value = 'all';
        const companySelect = root.querySelector('#report-filter-company');
        if (companySelect) companySelect.value = 'all';
        const clientSelect = root.querySelector('#report-filter-client');
        if (clientSelect) clientSelect.value = 'all';
        const currencySelect = root.querySelector('#report-filter-currency');
        if (currencySelect) currencySelect.value = 'all';
        onFilterChange();
        break;
      default:
        break;
    }
  });
}

// ============================================================================
// 13. PUBLIC API
// ============================================================================
/**
 * Mounts the Reports view skeleton into `root` and performs the first load.
 * `options.onOpenDocument(id)` is supplied by the shell and should navigate
 * to Compose with the requested document.
 */
export function mountReportsView(root, options = {}) {
  if (!root) return;
  state.mounted = true;
  state.root = root;
  state.onOpenDocument = (typeof options.onOpenDocument === 'function') ? options.onOpenDocument : null;
  buildSkeleton();
  attachEvents();
  loadAndRender().catch(err => console.error('[report-ui] mount load failed:', err));
}

/**
 * Re-reads IndexedDB and re-renders the active tab. Safe to call even when
 * the view is not yet mounted (it becomes a no-op).
 */
export function refreshReportsView() {
  if (!state.mounted || !state.root) return;
  loadAndRender().catch(err => console.error('[report-ui] refresh failed:', err));
}

/**
 * True only when Reports has finished loading a model and is safe to print.
 * Used by the shell to avoid printing the loading/error state via Ctrl+P.
 */
export function canPrintReports() {
  return Boolean(state.mounted && state.root && !state.loading && state.model);
}
