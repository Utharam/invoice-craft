/**
 * InvoiceCraft - Main Application Logic
 * 10 Models, Multi-Leg Tax Engine, Creative Logo & Brand Lockup Studio, IndexedDB Persistence, Live Sheet Renderer.
 */

import {
  openDB,
  getInvoice,
  getAllInvoices,
  deleteInvoice,
  saveActiveDraft,
  getActiveDraftRecord,
  saveCompany,
  getCompany,
  getAllCompanies,
  deleteCompany,
  setDefaultCompany,
  getDefaultCompany,
  saveClient,
  getAllClients,
  deleteClient,
  exportAllData,
  importAllData,
  saveInvoiceAndNumbering,
  saveConversion,
  saveNumberingConfig,
  getNumberingConfig,
  getAllCatalogItems,
  saveCatalogItem,
  deleteCatalogItem,
  getItemLibraryConfig,
  saveItemLibraryConfig
} from './db.js';

import {
  ICON_CATEGORIES,
  ICONS,
  generateBrandLockupSVG,
  generateMonogramSVG,
  generateIconDataURI
} from './icons.js';

import {
  formatMoney,
  amountToWords,
  clampNum,
  calculateTotals,
  calculateTotal,
  normalizeCurrency
} from './calc.js';

import {
  DEFAULT_NUMBERING_CONFIG,
  normalizeNumberingConfig,
  resolvePeriodKey,
  parseLocalDate,
  getCounter,
  generateDocumentNumber,
  periodRollover,
  advanceTypeCounter
} from './numbering.js';

import {
  buildConversionRecords,
  buildDuplicateRecord
} from './lifecycle.js';

import {
  normalizeCatalogScope,
  buildCatalogCandidateFromLineItem,
  findCatalogMatch,
  catalogItemToLineItem,
  groupCatalogItemsForView
} from './catalog.js';

import {
  initShell,
  navigateTo,
  refreshShellCounts,
  getCurrentView,
  renderHome
} from './shell.js';

import {
  mountReportsView,
  refreshReportsView
} from './report-ui.js';

// ============================================================================
// 1. TEMPLATES REGISTRY (10 Distinct Models)
// ============================================================================
const TEMPLATES = [
  {
    id: 'modern-swiss',
    name: 'Modern Swiss',
    badge: 'Popular',
    desc: 'Clean asymmetric grid, razor-thin dividers, minimalist corporate feel.'
  },
  {
    id: 'minimalist-mono',
    name: 'Minimalist Mono',
    badge: 'Code/Dev',
    desc: 'Monospaced typography, typewriter dashed rules, developer aesthetic.'
  },
  {
    id: 'executive-corporate',
    name: 'Executive Corporate',
    badge: 'Finance/Law',
    desc: 'Solid colored accent header banner with structured zebra-stripe tables.'
  },
  {
    id: 'editorial-serif',
    name: 'Editorial Serif',
    badge: 'Luxury',
    desc: 'High-end serif headings, double hairline borders, refined layout.'
  },
  {
    id: 'bold-accent',
    name: 'Bold Accent',
    badge: 'Startup',
    desc: 'Vibrant left accent pillar with high-impact badges and totals.'
  },
  {
    id: 'tech-slate',
    name: 'Tech Slate',
    badge: 'SaaS',
    desc: 'Dark charcoal header with cyan accents and telemetry badge.'
  },
  {
    id: 'neobrutalist',
    name: 'Neobrutalist',
    badge: 'Indie',
    desc: '3px solid black outlines, hard offset drop shadows, retro chips.'
  },
  {
    id: 'compact-thermal',
    name: 'Compact Thermal',
    badge: 'Receipt',
    desc: 'Narrow receipt-style layout with dashed tear-off edges.'
  },
  {
    id: 'warm-studio',
    name: 'Warm Studio',
    badge: 'Artisan',
    desc: 'Earthy terracotta and sand tones with gentle rounded cards.'
  },
  {
    id: 'bento-grid',
    name: 'Bento Grid',
    badge: 'Modern UI',
    desc: 'Modular card compartments for party info, references, and totals.'
  }
];

// ============================================================================
// 2. DOCUMENT TYPES REGISTRY (Invoice, Quotation, Estimate, Proforma)
// ============================================================================
const APP_DOC_TYPES = {
  invoice: {
    id: 'invoice',
    name: 'Invoice',
    title: 'INVOICE',
    prefix: 'INV-',
    numLabel: 'Invoice #:',
    dueLabel: 'Due Date:',
    fromLabel: 'Billed From',
    toLabel: 'Billed To',
    paymentHeading: 'Remittance & Payment Instructions',
    notesHeading: 'Terms & Notes',
    subtotalLabel: 'Subtotal',
    totalLabel: 'Total Amount Due',
    defaultStatus: 'pending',
    defaultNotes: 'Payment is requested within 14 business days of invoice receipt. Thank you for your continued business!',
    statuses: [
      { id: 'draft', label: 'Draft' },
      { id: 'pending', label: 'Payment Pending' },
      { id: 'paid', label: 'Paid' }
    ]
  },
  quotation: {
    id: 'quotation',
    name: 'Quotation',
    title: 'QUOTATION',
    prefix: 'QT-',
    numLabel: 'Quote #:',
    dueLabel: 'Valid Until:',
    fromLabel: 'Prepared By',
    toLabel: 'Quotation For',
    paymentHeading: 'Payment Terms & Deposit Requirements',
    notesHeading: 'Terms & Scope of Work',
    subtotalLabel: 'Subtotal',
    totalLabel: 'Total Quote Amount',
    defaultStatus: 'sent',
    defaultNotes: 'This quotation is valid for 30 calendar days from the issue date. 50% deposit required upon project commencement.',
    statuses: [
      { id: 'draft', label: 'Draft' },
      { id: 'sent', label: 'Sent to Client' },
      { id: 'accepted', label: 'Accepted' },
      { id: 'declined', label: 'Declined' },
      { id: 'expired', label: 'Expired' }
    ]
  },
  estimate: {
    id: 'estimate',
    name: 'Estimate',
    title: 'ESTIMATE',
    prefix: 'EST-',
    numLabel: 'Estimate #:',
    dueLabel: 'Valid Until:',
    fromLabel: 'Prepared By',
    toLabel: 'Estimate For',
    paymentHeading: 'Estimated Payment Schedule',
    notesHeading: 'Estimate Terms & Contingencies',
    subtotalLabel: 'Estimated Subtotal',
    totalLabel: 'Total Estimated Cost',
    defaultStatus: 'draft',
    defaultNotes: 'This estimate is subject to project scope adjustments. Pricing is valid for 30 calendar days.',
    statuses: [
      { id: 'draft', label: 'Draft' },
      { id: 'sent', label: 'Sent to Client' },
      { id: 'accepted', label: 'Accepted' },
      { id: 'declined', label: 'Declined' },
      { id: 'expired', label: 'Expired' }
    ]
  },
  proforma: {
    id: 'proforma',
    name: 'Proforma Invoice',
    title: 'PROFORMA INVOICE',
    prefix: 'PI-',
    numLabel: 'Proforma #:',
    dueLabel: 'Valid Until:',
    fromLabel: 'Supplier / Consignor',
    toLabel: 'Consignee / Buyer',
    paymentHeading: 'Advance Payment Terms',
    notesHeading: 'Commercial Proforma Terms',
    subtotalLabel: 'Subtotal',
    totalLabel: 'Total Proforma Value',
    defaultStatus: 'pending',
    defaultNotes: 'This proforma invoice is issued for customs/advance payment formalities. Not a final demand for payment.',
    statuses: [
      { id: 'draft', label: 'Draft' },
      { id: 'pending', label: 'Payment Pending' },
      { id: 'paid', label: 'Paid / Advanced' }
    ]
  }
};

// ============================================================================
// 2B. DEFAULT STATE
// ============================================================================
const DEFAULT_INVOICE_STATE = {
  id: 'inv_' + Date.now(),
  template: 'modern-swiss',
  font: "'Inter', sans-serif",
  accentColor: '#2563eb',
  logo: {
    dataUri: null,
    width: 180,
    align: 'left',
    layout: 'left' // 'left', 'center', 'right'
  },
  meta: {
    docType: 'invoice',
    title: 'INVOICE',
    number: 'INV-2026-001',
    // Local calendar dates (appLocalDateString/addDaysLocal are hoisted
    // function declarations). UTC-based ISO strings would shift the default
    // date near midnight and put the wrong period into generated numbers.
    date: appLocalDateString(),
    dueDate: addDaysLocal(appLocalDateString(), 14),
    currency: '$',
    numberFormat: 'international',
    showAmountInWords: false,
    po: 'PO-8902',
    status: 'pending',
    showSignature: false
  },
  sender: {
    name: 'Apex Design & Tech Studio',
    email: 'billing@apexstudio.io',
    phone: '+1 (555) 234-5678',
    address: '100 Innovation Way, Suite 400\nSan Francisco, CA 94107',
    taxId: 'US-EIN 12-3456789'
  },
  client: {
    name: 'Starlight Enterprises Inc.',
    email: 'accounts@starlight.com',
    phone: '+1 (555) 987-6543',
    address: '742 Evergreen Terrace\nSeattle, WA 98101',
    taxId: 'VAT-8941042'
  },
  items: [
    {
      id: 'item_1',
      description: 'Web Application UI/UX Design System & Prototypes',
      hsn: '998314',
      qty: 1,
      rate: 3200,
      discount: 0,
      taxRate: 18
    },
    {
      id: 'item_2',
      description: 'Frontend Architecture Implementation (Vanilla ES + Tailwind)',
      hsn: '998313',
      qty: 40,
      rate: 95,
      discount: 5,
      taxRate: 18
    },
    {
      id: 'item_3',
      description: 'Printed Brand Assets & User Guidebooks',
      hsn: '490110',
      qty: 10,
      rate: 45,
      discount: 0,
      taxRate: 5
    },
    {
      id: 'item_4',
      description: 'Open-Source Community Maintenance (Exempt)',
      hsn: '998311',
      qty: 5,
      rate: 80,
      discount: 0,
      taxRate: 0
    }
  ],
  taxes: [
    {
      id: 'tax_1',
      name: 'CGST',
      ratio: 50
    },
    {
      id: 'tax_2',
      name: 'SGST',
      ratio: 50
    }
  ],
  payment: '',
  notes: 'Payment is requested within 14 business days of invoice receipt. Thank you for your continued business!'
};

function normalizeInvoice(inv) {
  if (!inv) return;
  if (!inv.meta) inv.meta = {};
  if (!inv.meta.docType || !APP_DOC_TYPES[inv.meta.docType]) {
    inv.meta.docType = 'invoice';
  }
  if (inv.meta.showSignature === undefined) {
    inv.meta.showSignature = (inv.meta.docType !== 'invoice');
  }
  if (inv.meta.number === undefined || inv.meta.number === null) {
    // Never invent a number here: manual mode intentionally allows a blank
    // number that the user fills in before saving.
    inv.meta.number = '';
  }
  // Persisted records are never renumbered (H1): only engine-issued unsaved
  // drafts (meta.numberAuto === true) may have their number regenerated.
  // Unknown markers default to false, i.e. treated as hand-edited.
  if (inv.updatedAt !== undefined && inv.updatedAt !== null) {
    inv.meta.numberAuto = false;
  } else if (inv.meta.numberAuto === undefined) {
    inv.meta.numberAuto = false;
  }
  if (!inv.meta.currency) inv.meta.currency = '$';
  if (!inv.sender) inv.sender = {};
  if (!inv.client) inv.client = {};
  if (inv.payment === undefined || inv.payment === null) inv.payment = '';
  if (inv.notes === undefined || inv.notes === null) inv.notes = '';
  if (inv.accentColor === undefined || inv.accentColor === null) inv.accentColor = '#2563eb';
  if (inv.font === undefined || inv.font === null) inv.font = "'Inter', sans-serif";
  if (!inv.template) inv.template = 'modern-swiss';
  if (!inv.logo) inv.logo = { dataUri: null, width: 180, align: 'left', layout: 'left' };
  if (!inv.logo.layout) inv.logo.layout = 'left';
  if (!inv.logo.align) inv.logo.align = 'left';
  if (inv.logo.width === undefined || inv.logo.width === null || isNaN(parseFloat(inv.logo.width))) {
    inv.logo.width = 180;
  }
  if (!Array.isArray(inv.items)) inv.items = [];
  // Drop malformed entries so a partially corrupted backup cannot break rendering.
  inv.items = inv.items.filter(item => item && typeof item === 'object');
  inv.items.forEach(item => {
    // Missing / null / empty / non-numeric tax rates default to 18, matching
    // the shared calculator and db normalization (L2). Never 0.
    const rawTaxRate = (item.taxRate === undefined || item.taxRate === null || item.taxRate === '') ? 18 : parseFloat(item.taxRate);
    item.taxRate = isFinite(rawTaxRate) ? clampNum(rawTaxRate, 0, 100, 18) : 18;
    if (item.qty === undefined || item.qty === null) {
      item.qty = 0;
    } else {
      item.qty = clampNum(item.qty, 0, 1000000, 0);
    }
    if (item.rate === undefined || item.rate === null) {
      item.rate = 0;
    } else {
      item.rate = clampNum(item.rate, 0, 1000000000, 0);
    }
    // Coerce to string: the sheet renderer calls .trim()/.toLowerCase() on these.
    if (item.hsn === undefined || item.hsn === null) {
      item.hsn = '';
    } else if (typeof item.hsn !== 'string') {
      item.hsn = String(item.hsn);
    }
    if (item.discount === undefined || item.discount === null) {
      item.discount = 0;
    } else {
      item.discount = clampNum(item.discount, 0, 100, 0);
    }
    if (typeof item.description !== 'string') item.description = '';
  });

  if (!Array.isArray(inv.taxes)) {
    inv.taxes = [
      { id: 'tax_1', name: 'CGST', ratio: 50 },
      { id: 'tax_2', name: 'SGST', ratio: 50 }
    ];
  } else {
    inv.taxes = inv.taxes.filter(t => t && typeof t === 'object');
    inv.taxes.forEach(t => {
      if (typeof t.name !== 'string') t.name = '';
      if (t.ratio === undefined && t.rate !== undefined) {
        t.ratio = parseFloat(t.rate) || 50;
      } else if (t.ratio === undefined) {
        t.ratio = 50;
      }
      t.ratio = clampNum(t.ratio, 0, 100, 50);
    });
  }

  if (!inv.meta.numberFormat) {
    inv.meta.numberFormat = (inv.meta.currency === '₹') ? 'indian' : 'international';
  }
  if (inv.meta.showAmountInWords === undefined) {
    inv.meta.showAmountInWords = false;
  }
}


let currentInvoice = JSON.parse(JSON.stringify(DEFAULT_INVOICE_STATE));
let currentNumberingConfig = normalizeNumberingConfig(DEFAULT_NUMBERING_CONFIG);
let canvasZoom = 1.0;
let autoSaveTimer = null;
let currentDocumentPersisted = false;
let documentEdited = false;
let pendingNewDocType = null;
let pendingPrefillClient = null;
let toggleSidebarPanel = null;
let reportsMounted = false;
let autosaveInFlight = null;

// ============================================================================
// 2B. NUMBERING ENGINE UI HELPERS (pure work lives in js/numbering.js)
// ============================================================================
function appLocalDateString(date = new Date()) {
  const d = (date instanceof Date && !isNaN(date.getTime())) ? date : new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDaysLocal(dateStr, days) {
  const base = parseLocalDate(dateStr) || new Date();
  base.setDate(base.getDate() + days);
  return appLocalDateString(base);
}

function activeDocType() {
  return (currentInvoice && currentInvoice.meta && currentInvoice.meta.docType) || 'invoice';
}

function docTypeName(type) {
  return (APP_DOC_TYPES[type] || APP_DOC_TYPES.invoice).name;
}

function numberingCounterId(type) {
  return type === 'quotation' ? 'num-cfg-counter-quotation'
    : type === 'estimate' ? 'num-cfg-counter-estimate'
      : type === 'proforma' ? 'num-cfg-counter-proforma'
        : 'num-cfg-counter-invoice';
}

function getPreviewId(type) {
  return type === 'invoice' ? 'num-preview-invoice'
    : type === 'quotation' ? 'num-preview-quote'
      : type === 'estimate' ? 'num-preview-estimate'
        : 'num-preview-proforma';
}

function generateForType(type, dateStr, config) {
  const normalized = normalizeNumberingConfig(config);
  if (normalized.mode === 'manual') return '';
  return generateDocumentNumber(type, dateStr, normalized, getCounter(normalized, type));
}

function rolloverNumberingConfig(config = currentNumberingConfig) {
  const rolled = periodRollover(normalizeNumberingConfig(config), new Date());
  return normalizeNumberingConfig(rolled.config || config);
}

function updateNumberingBadgeUI(config) {
  const badgeText = document.getElementById('numbering-badge-text');
  if (!badgeText) return;
  const type = activeDocType();
  if (!config || config.mode === 'manual') {
    badgeText.textContent = 'Manual Numbering';
    return;
  }
  const preview = generateForType(type, currentInvoice.meta.date, config);
  badgeText.textContent = `Auto (${docTypeName(type)}): ${preview}`;
}

function populateNumberingModal(config) {
  if (!config) config = currentNumberingConfig || DEFAULT_NUMBERING_CONFIG;
  // Rollover must be applied BEFORE the counters are shown, and persisted when
  // it changed, so opening this modal across a period boundary never displays
  // (or later saves) stale counters (H4). readNumberingModalConfig may stamp
  // the current period key afterwards.
  const rolled = periodRollover(normalizeNumberingConfig(config), new Date());
  config = normalizeNumberingConfig(rolled.config || config);
  if (rolled.changed) {
    currentNumberingConfig = config;
    try {
      const persisted = saveNumberingConfig(config);
      if (persisted && typeof persisted.catch === 'function') {
        persisted.catch(e => console.warn('Could not persist numbering rollover:', e));
      }
    } catch (e) {
      console.warn('Could not persist numbering rollover:', e);
    }
  }
  const radioAuto = document.getElementById('radio-mode-auto');
  const radioManual = document.getElementById('radio-mode-manual');
  const settingsPanel = document.getElementById('auto-numbering-settings-panel');

  if (config.mode === 'manual') {
    if (radioManual) radioManual.checked = true;
    if (settingsPanel) settingsPanel.style.opacity = '0.45';
  } else {
    if (radioAuto) radioAuto.checked = true;
    if (settingsPanel) settingsPanel.style.opacity = '1';
  }

  const patternInput = document.getElementById('num-cfg-pattern');
  if (patternInput) patternInput.value = config.scheme || '{PREFIX}/{FY}/{COUNTER}';

  const prefixInv = document.getElementById('num-prefix-inv');
  if (prefixInv) prefixInv.value = config.prefixInvoice || 'INV';
  const prefixQt = document.getElementById('num-prefix-qt');
  if (prefixQt) prefixQt.value = config.prefixQuotation || 'QT';
  const prefixEst = document.getElementById('num-prefix-est');
  if (prefixEst) prefixEst.value = config.prefixEstimate || 'EST';
  const prefixPi = document.getElementById('num-prefix-pi');
  if (prefixPi) prefixPi.value = config.prefixProforma || 'PI';

  ['invoice', 'quotation', 'estimate', 'proforma'].forEach(type => {
    const input = document.getElementById(numberingCounterId(type));
    if (input) input.value = getCounter(config, type);
  });
  const legacyCounterInput = document.getElementById('num-cfg-counter');
  if (legacyCounterInput) legacyCounterInput.value = getCounter(config, 'invoice');

  const paddingSelect = document.getElementById('num-cfg-padding');
  if (paddingSelect) paddingSelect.value = String(config.padding || 4);

  const resetSelect = document.getElementById('num-cfg-reset');
  if (resetSelect) resetSelect.value = config.resetPeriod || 'financial_year';

  updateNumberingModalPreviewLive();
}

function updateNumberingModalPreviewLive() {
  const mode = document.querySelector('input[name="num-mode"]:checked')?.value || 'auto';
  const tempConfig = normalizeNumberingConfig({
    mode,
    scheme: document.getElementById('num-cfg-pattern')?.value || '{PREFIX}/{FY}/{COUNTER}',
    prefixInvoice: document.getElementById('num-prefix-inv')?.value || 'INV',
    prefixQuotation: document.getElementById('num-prefix-qt')?.value || 'QT',
    prefixEstimate: document.getElementById('num-prefix-est')?.value || 'EST',
    prefixProforma: document.getElementById('num-prefix-pi')?.value || 'PI',
    counters: {
      invoice: parseInt(document.getElementById(numberingCounterId('invoice'))?.value, 10) || 1,
      quotation: parseInt(document.getElementById(numberingCounterId('quotation'))?.value, 10) || 1,
      estimate: parseInt(document.getElementById(numberingCounterId('estimate'))?.value, 10) || 1,
      proforma: parseInt(document.getElementById(numberingCounterId('proforma'))?.value, 10) || 1
    },
    startingCounters: currentNumberingConfig.startingCounters,
    padding: parseInt(document.getElementById('num-cfg-padding')?.value, 10) || 4,
    resetPeriod: document.getElementById('num-cfg-reset')?.value || 'financial_year',
    lastPeriodKey: currentNumberingConfig.lastPeriodKey
  });

  const activePreview = document.getElementById('num-preview-text');
  if (mode === 'manual') {
    ['invoice', 'quotation', 'estimate', 'proforma'].forEach(type => {
      const el = document.getElementById(getPreviewId(type));
      if (el) el.textContent = 'Manual';
    });
    if (activePreview) activePreview.textContent = 'Manual Entry (User Discretion)';
    return;
  }

  const dateStr = currentInvoice.meta.date || appLocalDateString();
  ['invoice', 'quotation', 'estimate', 'proforma'].forEach(type => {
    const el = document.getElementById(getPreviewId(type));
    if (el) el.textContent = generateForType(type, dateStr, tempConfig);
  });
  if (activePreview) {
    activePreview.textContent = `${docTypeName(activeDocType())}: ${generateForType(activeDocType(), dateStr, tempConfig)}`;
  }
}

function readNumberingModalConfig() {
  const mode = document.querySelector('input[name="num-mode"]:checked')?.value || 'auto';
  const counters = {};
  ['invoice', 'quotation', 'estimate', 'proforma'].forEach(type => {
    const el = document.getElementById(numberingCounterId(type));
    counters[type] = parseInt(el?.value, 10) || 1;
  });
  const resetPeriod = document.getElementById('num-cfg-reset')?.value || 'financial_year';
  const base = normalizeNumberingConfig(currentNumberingConfig);
  return normalizeNumberingConfig(Object.assign({}, base, {
    mode,
    scheme: document.getElementById('num-cfg-pattern')?.value || '{PREFIX}/{FY}/{COUNTER}',
    prefixInvoice: document.getElementById('num-prefix-inv')?.value || 'INV',
    prefixQuotation: document.getElementById('num-prefix-qt')?.value || 'QT',
    prefixEstimate: document.getElementById('num-prefix-est')?.value || 'EST',
    prefixProforma: document.getElementById('num-prefix-pi')?.value || 'PI',
    counters,
    // The edited live counters become the reset baseline (as the legacy UI
    // did), so a period/manual reset returns to the user-entered values
    // instead of an invisible old starting value.
    startingCounters: Object.assign({}, counters),
    padding: parseInt(document.getElementById('num-cfg-padding')?.value, 10) || 4,
    resetPeriod,
    lastPeriodKey: resolvePeriodKey(new Date(), resetPeriod),
    updatedAt: Date.now()
  }));
}

/**
 * Reset-safety validation (pure, testable): the scheme must carry enough
 * period information for the chosen reset policy, or numbers collide after
 * every rollover. Returns null when valid, else a human-readable reason.
 * - monthly:        {MM} plus a year token ({YYYY}, {YY} or {FY})
 * - calendar_year:  a year token ({YYYY}, {YY} or {FY})
 * - financial_year: {FY}, or ({YYYY} or {YY}) plus {MM}
 * - never:          no period-token requirement
 */
function validateNumberingSchemePeriod(scheme, resetPeriod) {
  const pattern = String(scheme || '');
  const hasYear = pattern.includes('{YYYY}') || pattern.includes('{YY}') || pattern.includes('{FY}');
  const hasMonth = pattern.includes('{MM}');
  if (resetPeriod === 'monthly' && !(hasYear && hasMonth)) {
    return 'Monthly reset requires a year token ({YYYY}, {YY} or {FY}) and {MM} in the scheme, otherwise numbers repeat after every monthly reset.';
  }
  if (resetPeriod === 'calendar_year' && !hasYear) {
    return 'Calendar-year reset requires a year token ({YYYY}, {YY} or {FY}) in the scheme, otherwise numbers repeat after every yearly reset.';
  }
  if (resetPeriod === 'financial_year' &&
      !(pattern.includes('{FY}') || ((pattern.includes('{YYYY}') || pattern.includes('{YY}')) && hasMonth))) {
    return 'Financial-year reset requires {FY}, or a year token ({YYYY} or {YY}) plus {MM}, in the scheme so numbers never repeat across years.';
  }
  return null; // 'never' (and any unknown policy): no period-token requirement
}

/**
 * Manual-mode numbers must be unique per document type. Auto numbers are
 * generated, but a hand-edited auto number is still checked.
 */
async function findNumberConflict(number, docType, excludeId) {
  const wanted = String(number || '').trim().toLowerCase();
  if (!wanted) return false;
  const invoices = await getAllInvoices();
  return invoices.some(inv => {
    if (excludeId && inv.id === excludeId) return false;
    const invType = (inv.meta && inv.meta.docType) || inv.docType || 'invoice';
    if (invType !== docType) return false;
    const invNumber = String((inv.meta && inv.meta.number) || inv.meta?.number || '').trim().toLowerCase();
    return invNumber === wanted;
  });
}

async function flushAutoSave() {
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = null;
  }
  // A pristine document (never edited, never persisted) has nothing worth
  // preserving: writing it here would create a phantom demo continue-draft on
  // a fresh install just by changing routes.
  if (!documentEdited && !currentDocumentPersisted) {
    return;
  }
  if (autosaveInFlight) {
    try { await autosaveInFlight; } catch (e) {}
  }
  try {
    autosaveInFlight = saveActiveDraft(currentInvoice, { activeCompanyProfileId, documentEdited });
    await autosaveInFlight;
  } catch (e) {
    console.warn('Auto-save flush error:', e);
  } finally {
    autosaveInFlight = null;
  }
}

// ============================================================================
// 3. INITIALIZATION
// ============================================================================
document.addEventListener('DOMContentLoaded', async () => {
  let dbReady = false;
  try {
    await openDB();
    dbReady = true;
  } catch (err) {
    console.warn('IndexedDB unavailable; the editor will run with local memory until reload:', err);
    const indicator = document.getElementById('db-status-indicator');
    if (indicator) {
      indicator.innerHTML = `
        <span class="db-status-dot" style="background:#eab308; box-shadow:0 0 6px #eab308;"></span>
        <span>Local Memory</span>
      `;
    }
  }

  // Load Numbering Engine settings (safe default on IDB failure)
  try {
    currentNumberingConfig = await getNumberingConfig();
  } catch (e) {
    console.warn('Numbering config load failed, using defaults:', e);
    currentNumberingConfig = normalizeNumberingConfig(DEFAULT_NUMBERING_CONFIG);
  }
  const rolled = periodRollover(currentNumberingConfig, new Date());
  currentNumberingConfig = normalizeNumberingConfig(rolled.config || currentNumberingConfig);
  if (rolled.changed && dbReady) {
    try { await saveNumberingConfig(currentNumberingConfig); } catch (e) { console.warn(e); }
  }

  // Load the saved item library (v4). Defaults keep Compose usable when IDB
  // is unavailable; the formatter-free cache is refreshed by catalog edits.
  try {
    catalogItems = await getAllCatalogItems();
  } catch (e) {
    console.warn('Item library load failed, using an empty library this session:', e);
    catalogItems = [];
  }
  try {
    itemLibraryConfig = await getItemLibraryConfig();
  } catch (e) {
    console.warn('Item library scope load failed, defaulting to Global:', e);
    itemLibraryConfig = { scope: 'global', updatedAt: null };
  }

  // Load existing draft or use default (each step guarded so IDB denial can't blank the app)
  let draftRecord = null;
  try {
    draftRecord = await getActiveDraftRecord();
  } catch (e) {
    console.warn('Draft load failed, starting fresh:', e);
    draftRecord = null;
  }
  const savedDraft = draftRecord && draftRecord.data ? draftRecord.data : null;
  if (savedDraft) {
    currentInvoice = Object.assign({}, DEFAULT_INVOICE_STATE, savedDraft);
    if (!currentInvoice.logo) currentInvoice.logo = { dataUri: null, width: 180, align: 'left', layout: 'left' };
    if (!currentInvoice.logo.layout) currentInvoice.logo.layout = 'left';
    activeCompanyProfileId = draftRecord.activeCompanyProfileId || savedDraft.activeCompanyProfileId || savedDraft.companyId || null;
    // A stale draft record can point at a document that no longer exists
    // (deleted, or lost to a failed save). Verify the persisted record before
    // treating the editor content as a saved document, and demote the draft
    // data so reloads cannot re-infer persistence from a leftover updatedAt.
    if (savedDraft.updatedAt && savedDraft.id) {
      try {
        const persistedRecord = await getInvoice(savedDraft.id);
        currentDocumentPersisted = Boolean(persistedRecord);
      } catch (e) {
        console.warn('Could not verify the persisted draft record:', e);
        currentDocumentPersisted = false;
      }
    } else {
      currentDocumentPersisted = false;
    }
    if (!currentDocumentPersisted) {
      delete currentInvoice.updatedAt;
    }
    // edited === null is the legacy "edited" marker: treat it as edited.
    documentEdited = draftRecord.edited === null ? true : Boolean(draftRecord.edited);
    // Legacy drafts predate the numberAuto marker. Infer it once so engine-
    // issued numbers stay tracked across the upgrade; anything ambiguous is
    // treated as hand-edited and never regenerated.
    if (!currentDocumentPersisted &&
        currentNumberingConfig.mode === 'auto' &&
        currentInvoice.meta.numberAuto === undefined) {
      const legacyType = currentInvoice.meta.docType || 'invoice';
      const legacyExpected = generateForType(legacyType, currentInvoice.meta.date, currentNumberingConfig);
      currentInvoice.meta.numberAuto = Boolean(legacyExpected) && legacyExpected === currentInvoice.meta.number;
    }
  } else {
    // If no draft, load default company profile if available
    let defCompany = null;
    try {
      defCompany = await getDefaultCompany();
    } catch (e) {
      console.warn('Default company load failed:', e);
    }
    if (defCompany) {
      activeCompanyProfileId = defCompany.id;
      currentInvoice.companyId = defCompany.id;
      currentInvoice.sender = {
        name: defCompany.name,
        email: defCompany.email || '',
        phone: defCompany.phone || '',
        address: defCompany.address || '',
        taxId: defCompany.taxId || ''
      };
      currentInvoice.payment = defCompany.payment || '';
      currentInvoice.meta.currency = defCompany.defaultCurrency || currentInvoice.meta.currency || '$';
      currentInvoice.meta.numberFormat = defCompany.defaultNumberFormat ||
        (currentInvoice.meta.currency === '₹' ? 'indian' : 'international');
    }
    // Set initial invoice number from the numbering engine if auto. Manual mode
    // never invents a number; the user types it.
    if (currentNumberingConfig && currentNumberingConfig.mode === 'auto') {
      const type = currentInvoice.meta.docType || 'invoice';
      currentInvoice.meta.number = generateForType(type, currentInvoice.meta.date, currentNumberingConfig);
      currentInvoice.meta.numberAuto = true;
    } else {
      currentInvoice.meta.number = '';
      currentInvoice.meta.numberAuto = false;
    }
    currentDocumentPersisted = false;
    documentEdited = false;
  }
  normalizeInvoice(currentInvoice);

  // Auto-clean legacy hardcoded dummy payment if business name is not Apex Studio
  if (currentInvoice.sender.name && !currentInvoice.sender.name.toLowerCase().includes('apex')) {
    if (isDummyApexPayment(currentInvoice.payment)) {
      currentInvoice.payment = '';
    }
  }
  try {
    const allComps = await getAllCompanies();
    for (const c of allComps) {
      if (c.name && !c.name.toLowerCase().includes('apex') && isDummyApexPayment(c.payment)) {
        c.payment = '';
        await saveCompany(c);
      }
    }
  } catch (err) {
    console.warn('Error sanitizing companies:', err);
  }

  // Populate UI (each step isolated so one failure can't blank the app)
  renderTemplatesGrid();
  renderColorSwatches();
  try { await updateSavedCompaniesCount(); } catch (e) { console.warn(e); }
  try { await renderCompanyProfilesSelector(); } catch (e) { console.warn(e); }
  populateFormFields();
  renderLineItemsEditor();
  renderTaxesEditor();
  setupLogoStudioTabs();
  renderIconsLibrary();
  try { await updateSavedInvoicesCount(); } catch (e) { console.warn(e); }
  enhanceAccessibility();

  // Initial Sheet Render & Calculations
  updateSheetView();

  // Attach Event Listeners
  attachFormListeners();
  attachNavigationListeners();
  attachZoomListeners();
  attachModalListeners();
  setupCatalogPicker();
  setupItemLibraryModal();
  try { await renderCompanyProfilesSelector(); } catch (e) { console.warn(e); }
  refreshCatalogPicker();
  updateCatalogSettingsCount();

  // Reports view is mounted once; it stays in the DOM while Compose remains mounted.
  try {
    const reportsRoot = document.getElementById('reports-root');
    if (reportsRoot && typeof mountReportsView === 'function') {
      mountReportsView(reportsRoot, { onOpenDocument: openDocumentInEditor });
      reportsMounted = true;
    }
  } catch (e) {
    console.warn('Reports view could not be mounted yet:', e);
  }

  // App shell boots into #/home by default, but all editor state is already ready.
  initShell({
    flushAutosave: flushAutoSave,
    onSaveCompose: () => { persistCurrentDocument(); },
    onToggleSidebar: () => { if (toggleSidebarPanel) toggleSidebarPanel(); },
    printCompose: () => safePrintAction(),
    onOpenDocument: openDocumentInEditor,
    onResumeDraft: resumeActiveDraft,
    onNewDocument: requestNewDocument,
    onOpenModal: async (id) => {
      await openAppModal(id);
    },
    onRouteChange: async (view) => {
      if (view === 'compose') {
        requestAnimationFrame(() => updateDocumentPaginationLive());
      } else if (view === 'reports' && reportsMounted) {
        try { await refreshReportsView(); } catch (e) { console.warn('Reports refresh failed:', e); }
      } else if (view === 'home') {
        try { await refreshShellCounts(); } catch (e) {}
      }
      if (view === 'compose') {
        syncComposeTitle();
      }
    }
  });

  try { await refreshShellCounts(); } catch (e) {}
});

// ============================================================================
// 4. RENDERING TEMPLATES & STYLING
// ============================================================================
function renderTemplatesGrid() {
  const container = document.getElementById('templates-grid');
  if (!container) return;
  container.innerHTML = TEMPLATES.map(t => `
    <div class="template-card ${currentInvoice.template === t.id ? 'active' : ''}" data-template="${t.id}">
      <div class="template-card-header">
        <span class="template-name">${t.name}</span>
        <span class="template-badge">${t.badge}</span>
      </div>
      <div class="template-desc">${t.desc}</div>
    </div>
  `).join('');

  container.querySelectorAll('.template-card').forEach(card => {
    card.addEventListener('click', () => {
      container.querySelectorAll('.template-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      currentInvoice.template = card.dataset.template;
      applyTemplateClass();
      triggerAutoSave();
    });
  });
}

function applyTemplateClass() {
  const sheet = document.getElementById('invoice-sheet');
  if (!sheet) return;
  TEMPLATES.forEach(t => sheet.classList.remove('template-' + t.id));
  sheet.classList.add('template-' + currentInvoice.template);
}

function renderColorSwatches() {
  const swatches = document.querySelectorAll('.color-swatch');
  swatches.forEach(swatch => {
    swatch.addEventListener('click', () => {
      swatches.forEach(s => s.classList.remove('active'));
      swatch.classList.add('active');
      const color = swatch.dataset.color;
      currentInvoice.accentColor = color;
      document.getElementById('accent-color-picker').value = color;
      document.getElementById('accent-color-hex').textContent = color;
      document.documentElement.style.setProperty('--accent-color', color);
      triggerAutoSave();
    });
  });
}

// ============================================================================
// 5. POPULATE FORM FIELDS FROM STATE
// ============================================================================
function populateFormFields() {
  normalizeInvoice(currentInvoice);
  const docType = currentInvoice.meta.docType || 'invoice';
  const cfg = APP_DOC_TYPES[docType] || APP_DOC_TYPES.invoice;

  // Section 1 Document Type Cards Grid
  document.querySelectorAll('#doc-type-cards-grid .doc-type-card').forEach(card => {
    if (card.dataset.type === docType) card.classList.add('active');
    else card.classList.remove('active');
  });
  syncDocTypeCardA11y(docType);

  const summaryBadge = document.getElementById('doc-type-badge-summary');
  if (summaryBadge) {
    summaryBadge.textContent = `${cfg.name.toUpperCase()} MODE`;
  }

  const hintBanner = document.getElementById('doc-type-hint-banner');
  if (hintBanner) {
    hintBanner.style.display = (docType === 'quotation' || docType === 'estimate' || docType === 'proforma') ? 'flex' : 'none';
  }

  // Section 3 Active Document Context
  const pillIcon = document.getElementById('doc-type-pill-icon');
  const pillName = document.getElementById('doc-type-pill-name');
  if (pillName) pillName.textContent = cfg.name;
  if (pillIcon) {
    const iconsMap = { invoice: '📄', quotation: '💬', estimate: '📐', proforma: '📋' };
    pillIcon.textContent = iconsMap[docType] || '📄';
  }
  updateNumberingBadgeUI(currentNumberingConfig);

  // Convert to Invoice button (in section 3 header)
  const convertBtn = document.getElementById('btn-convert-quote');
  if (convertBtn) {
    convertBtn.style.display = (docType === 'quotation' || docType === 'estimate' || docType === 'proforma') ? 'inline-flex' : 'none';
  }

  // Signature toggle in section 6
  const sigGroup = document.getElementById('group-quote-signature');
  const sigCheck = document.getElementById('check-quote-signature');
  if (sigGroup) {
    sigGroup.style.display = (docType !== 'invoice') ? 'block' : 'none';
  }
  if (sigCheck) {
    sigCheck.checked = !!currentInvoice.meta.showSignature;
  }

  // Section 3 dynamic header and labels
  const metaTitleEl = document.getElementById('section-meta-title');
  if (metaTitleEl) metaTitleEl.textContent = `3. ${cfg.name} Details`;

  const labelTitle = document.getElementById('label-doc-title');
  const labelNum = document.getElementById('label-doc-number');
  const labelDue = document.getElementById('label-doc-due');
  if (labelTitle) labelTitle.textContent = `${cfg.name} Title`;
  if (labelNum) labelNum.textContent = cfg.numLabel.replace(':', '');
  if (labelDue) labelDue.textContent = cfg.dueLabel.replace(':', '');

  // Sync status dropdown options based on document type
  syncStatusDropdown(docType, currentInvoice.meta.status);

  // Styles
  document.getElementById('font-select').value = currentInvoice.font;
  document.documentElement.style.setProperty('--invoice-font', currentInvoice.font);
  document.getElementById('accent-color-picker').value = currentInvoice.accentColor;
  document.getElementById('accent-color-hex').textContent = currentInvoice.accentColor;
  document.documentElement.style.setProperty('--accent-color', currentInvoice.accentColor);

  // Logo Settings
  document.getElementById('logo-width-slider').value = currentInvoice.logo.width || 180;
  document.getElementById('logo-width-val').textContent = (currentInvoice.logo.width || 180) + 'px';
  updateLogoAlignmentButtons(currentInvoice.logo.align || 'left');
  updateHeaderLayoutButtons(currentInvoice.logo.layout || 'left');

  // Meta Inputs
  document.getElementById('input-inv-title').value = currentInvoice.meta.title;
  document.getElementById('input-inv-number').value = currentInvoice.meta.number;
  document.getElementById('input-inv-date').value = currentInvoice.meta.date;
  document.getElementById('input-inv-due').value = currentInvoice.meta.dueDate || '';
  const selectCurr = document.getElementById('select-inv-currency');
  const customCurrWrapper = document.getElementById('custom-currency-wrapper');
  const inputCustomCurr = document.getElementById('input-custom-currency');
  const curVal = currentInvoice.meta.currency || '$';
  const knownCurrs = ['$', '€', '£', '₹', 'C$', 'A$', '¥', 'CHF', 'AED', 'SAR', 'BHD', 'QAR', 'KWD', 'OMR'];
  if (knownCurrs.includes(curVal)) {
    if (selectCurr) selectCurr.value = curVal;
    if (customCurrWrapper) customCurrWrapper.style.display = 'none';
  } else {
    if (selectCurr) selectCurr.value = 'custom';
    if (customCurrWrapper) customCurrWrapper.style.display = 'block';
    if (inputCustomCurr) inputCustomCurr.value = curVal;
  }
  document.getElementById('input-inv-po').value = currentInvoice.meta.po || '';
  document.getElementById('select-inv-status').value = currentInvoice.meta.status;
  const numFmtSelect = document.getElementById('select-inv-number-format');
  if (numFmtSelect) {
    numFmtSelect.value = currentInvoice.meta.numberFormat || 'international';
  }
  const checkWords = document.getElementById('check-amount-in-words');
  if (checkWords) {
    checkWords.checked = !!currentInvoice.meta.showAmountInWords;
  }

  // Sender
  document.getElementById('input-sender-name').value = currentInvoice.sender.name || '';
  document.getElementById('input-sender-email').value = currentInvoice.sender.email || '';
  document.getElementById('input-sender-phone').value = currentInvoice.sender.phone || '';
  document.getElementById('input-sender-address').value = currentInvoice.sender.address || '';
  document.getElementById('input-sender-taxid').value = currentInvoice.sender.taxId || '';

  const senderPaymentInput = document.getElementById('input-sender-payment');
  if (senderPaymentInput) senderPaymentInput.value = currentInvoice.payment || '';
  const clearSenderPaymentBtn = document.getElementById('btn-clear-sender-payment');
  if (clearSenderPaymentBtn) {
    clearSenderPaymentBtn.style.display = (currentInvoice.payment && currentInvoice.payment.trim()) ? 'inline-block' : 'none';
  }

  // Client
  document.getElementById('input-client-name').value = currentInvoice.client.name || '';
  document.getElementById('input-client-email').value = currentInvoice.client.email || '';
  document.getElementById('input-client-phone').value = currentInvoice.client.phone || '';
  document.getElementById('input-client-address').value = currentInvoice.client.address || '';
  document.getElementById('input-client-taxid').value = currentInvoice.client.taxId || '';

  // Payment & Notes
  document.getElementById('input-payment-info').value = currentInvoice.payment || '';
  document.getElementById('input-notes').value = currentInvoice.notes || '';

  updateSenderTaxHint();

  // Sync Studio default wordmarks with company name if present
  const monoWordmark = document.getElementById('monogram-wordmark');
  if (monoWordmark && !monoWordmark.value) monoWordmark.value = currentInvoice.sender.name;
  const iconWordmark = document.getElementById('icon-wordmark');
  if (iconWordmark && !iconWordmark.value) iconWordmark.value = currentInvoice.sender.name;

  // Saved item picker follows the active document (currency, company, dt).
  refreshCatalogPicker();

  // Apply template
  applyTemplateClass();
  updateLogoDisplay();
}

function syncStatusDropdown(docType, currentStatus) {
  const statusSelect = document.getElementById('select-inv-status');
  if (!statusSelect) return;
  const cfg = APP_DOC_TYPES[docType] || APP_DOC_TYPES.invoice;
  const validStatusIds = cfg.statuses.map(s => s.id);

  statusSelect.innerHTML = cfg.statuses.map(s => `
    <option value="${s.id}">${s.label}</option>
  `).join('');

  if (validStatusIds.includes(currentStatus)) {
    statusSelect.value = currentStatus;
  } else {
    statusSelect.value = cfg.defaultStatus;
    currentInvoice.meta.status = cfg.defaultStatus;
  }
}

async function switchDocumentType(newType) {
  if (!APP_DOC_TYPES[newType]) return;
  if (currentDocumentPersisted) {
    alert('This document is already saved. Create a new document to use a different document type — saved records are never overwritten by a type switch.');
    populateFormFields();
    updateSheetView();
    return;
  }

  const oldType = currentInvoice.meta.docType || 'invoice';
  const oldCfg = APP_DOC_TYPES[oldType] || APP_DOC_TYPES.invoice;
  const newCfg = APP_DOC_TYPES[newType];

  currentInvoice.meta.docType = newType;

  // If title was default or empty, update to new default title
  if (!currentInvoice.meta.title || currentInvoice.meta.title === oldCfg.title) {
    currentInvoice.meta.title = newCfg.title;
  }

  // Auto numbering uses the new type's independent counter. Manual mode never
  // rewrites a user-entered number.
  if (currentNumberingConfig && currentNumberingConfig.mode === 'auto') {
    currentInvoice.meta.number = generateForType(newType, currentInvoice.meta.date, currentNumberingConfig);
    currentInvoice.meta.numberAuto = true;
  } else {
    currentInvoice.meta.numberAuto = false;
  }

  // Update notes if it was default
  if (!currentInvoice.notes || currentInvoice.notes === oldCfg.defaultNotes) {
    currentInvoice.notes = newCfg.defaultNotes;
  }

  // If switching to quote/estimate, show signature block by default
  currentInvoice.meta.showSignature = (newType !== 'invoice');
  currentInvoice.meta.status = newCfg.defaultStatus;

  populateFormFields();
  updateSheetView();
  syncComposeTitle();
  refreshCatalogPicker();
  triggerAutoSave();
}

async function promptManualNumber(docType, suggested = '', excludeId = currentInvoice.id) {
  const entered = window.prompt(`Enter a unique ${docTypeName(docType)} number:`, suggested || '');
  if (entered === null) return null;
  const number = entered.trim();
  if (!number) {
    alert('A document number is required.');
    return null;
  }
  if (await findNumberConflict(number, docType, excludeId)) {
    alert(`The ${docTypeName(docType)} number "${number}" is already used by another saved document. Choose a different number.`);
    return null;
  }
  return number;
}

async function convertToInvoice() {
  const oldType = activeDocType();
  if (oldType === 'invoice') return;
  const oldNumber = currentInvoice.meta.number || '';
  const curDocName = (APP_DOC_TYPES[oldType] || APP_DOC_TYPES.quotation).name;

  try {
    // A conversion always needs a durable source record. A saved document with
    // unsaved edits must be re-saved first so the conversion snapshot carries
    // the live content with freshly frozen totals (re-saving a persisted
    // source never advances its counter).
    if (!currentDocumentPersisted || documentEdited) {
      const saved = await persistCurrentDocument();
      if (!saved) return;
    }
    if (currentInvoice.convertedToId || currentInvoice.meta?.convertedToId) {
      alert(`This ${curDocName.toLowerCase()} has already been converted to invoice ${currentInvoice.convertedToNumber || ''}. It cannot be converted twice.`);
      return;
    }

    let config = rolloverNumberingConfig(currentNumberingConfig);
    const today = appLocalDateString();
    let invoiceNumber;
    if (config.mode === 'manual') {
      invoiceNumber = await promptManualNumber('invoice');
      if (!invoiceNumber) return;
    } else {
      invoiceNumber = generateForType('invoice', today, config);
    }
    if (await findNumberConflict(invoiceNumber, 'invoice', null)) {
      alert(`The invoice number "${invoiceNumber}" is already in use. Conversion cancelled so no duplicate is stored.`);
      return;
    }

    const sourceSnapshot = JSON.parse(JSON.stringify(currentInvoice));
    // Only the source's own stored company link may be applied. Unlinked
    // legacy documents must never acquire the active/default company; an
    // explicitly linked company is never cleared.
    const company = sourceSnapshot.companyId ? await getCompany(sourceSnapshot.companyId) : null;
    const records = buildConversionRecords({
      source: sourceSnapshot,
      invoiceId: generateId('inv_'),
      invoiceNumber,
      now: new Date(today + 'T12:00:00'),
      company
    });
    if (!records || !records.invoice || !records.sourceUpdate) {
      throw new Error('Conversion record builder returned an invalid result.');
    }

    // Currency and number format always follow the source quote.
    records.invoice.meta.currency = sourceSnapshot.meta.currency;
    records.invoice.meta.numberFormat = sourceSnapshot.meta.numberFormat;
    records.invoice.companyId = sourceSnapshot.companyId || null;
    records.invoice.clientId = sourceSnapshot.clientId || null;
    if (config.mode === 'auto') {
      // The conversion invoice is generated and persisted in the same
      // transaction; the marker records engine issuance (it is ignored on
      // load of persisted records).
      records.invoice.meta.numberAuto = true;
      config = advanceTypeCounter(config, 'invoice');
    }

    await saveConversion({
      source: records.sourceUpdate,
      invoice: records.invoice,
      numberingConfig: config
    });

    currentNumberingConfig = normalizeNumberingConfig(config);
    currentInvoice = JSON.parse(JSON.stringify(records.invoice));
    normalizeInvoice(currentInvoice);
    currentDocumentPersisted = true;
    documentEdited = false;
    populateFormFields();
    renderLineItemsEditor();
    renderTaxesEditor();
    updateSheetView();
    try { await saveActiveDraft(currentInvoice, { activeCompanyProfileId, documentEdited: false }); } catch (e) { console.warn(e); }
    navigateTo('compose');
    requestAnimationFrame(() => updateDocumentPaginationLive());
    try { await updateSavedInvoicesCount(); } catch (e) {}
    await notifyDataChanged();
    syncComposeTitle();

    alert(`⚡ ${curDocName} "${oldNumber}" was converted into invoice "${currentInvoice.meta.number}". The original ${curDocName.toLowerCase()} is preserved with a conversion history link.`);
  } catch (err) {
    console.error('Conversion failed:', err);
    alert('Conversion failed: ' + (err && err.message ? err.message : err));
  }
}

// ============================================================================
// 5B. MULTIPLE COMPANY PROFILES ENGINE
// ============================================================================
let activeCompanyProfileId = null;
// Saved item library cache (v4 catalogItems store + default-scope setting).
// Filled once at boot after the DB opens, refreshed after catalog edits and
// while the item-library modal is open; Compose reads from memory only.
let catalogItems = [];
let itemLibraryConfig = { scope: 'global', updatedAt: null };
let itemLibraryEditing = null; // Record loaded into the modal form for editing

async function updateSavedCompaniesCount() {
  const companies = await getAllCompanies();
  const countEls = [
    document.getElementById('saved-companies-count'),
    document.getElementById('companies-count-badge'),
    document.getElementById('modal-companies-list-count'),
    document.getElementById('settings-company-count')
  ];
  countEls.forEach(el => {
    if (el) el.textContent = companies.length;
  });
}

async function renderCompanyProfilesSelector() {
  const select = document.getElementById('select-company-profile');
  if (!select) return;
  const companies = await getAllCompanies();

  // The catalog module consumes this read as its known-company set; refresh
  // it here so bookmark/scope logic always sees the current names/ids.
  catalogCompanyNameCache = new Map(companies.map(c => [
    String(c.id),
    (c && c.name) ? c.name : String(c.id)
  ]));
  catalogCompanyNamesResolved = true;

  let linkNormalized = false;
  if (companies.length === 0) {
    // Every link becomes dangling when the last company goes away.
    if (activeCompanyProfileId || currentInvoice.companyId) {
      activeCompanyProfileId = null;
      currentInvoice.companyId = null;
      linkNormalized = true;
    }
    select.innerHTML = `<option value="">Default Company Profile</option><option value="__new__">+ Add New Company Profile...</option>`;
    if (linkNormalized) {
      renderLineItemsEditor();
      refreshCatalogPicker();
    }
    return;
  }

  // A null/unknown active profile means "no company linked" (legacy or
  // unlinked documents). It must NOT silently adopt the default company.
  const isLinked = Boolean(activeCompanyProfileId) &&
    companies.some(c => c.id === activeCompanyProfileId);
  if (activeCompanyProfileId && !isLinked) {
    // Dangling reference (deleted company / stale backup): normalize to no link.
    activeCompanyProfileId = null;
    linkNormalized = true;
  }
  if (currentInvoice.companyId && !companies.some(c => c.id === currentInvoice.companyId)) {
    currentInvoice.companyId = null;
    linkNormalized = true;
  }
  const noLinkOption = isLinked
    ? ''
    : `<option value="" ${activeCompanyProfileId ? '' : 'selected'}>No company linked</option>`;

  select.innerHTML = companies.map(c => `
    <option value="${appEscapeHtml(c.id)}" ${c.id === activeCompanyProfileId ? 'selected' : ''}>
      🏢 ${appEscapeHtml(c.name)}${c.isDefault ? ' (Default)' : ''}
    </option>
  `).join('') + noLinkOption + `<option value="__new__">+ Add New Company Profile...</option>`;

  if (linkNormalized) {
    renderLineItemsEditor();
    refreshCatalogPicker();
  }
}

async function renderCompaniesModalList() {
  const container = document.getElementById('modal-companies-list');
  if (!container) return;
  const companies = await getAllCompanies();
  await updateSavedCompaniesCount();

  if (companies.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:24px 0; color:#94a3b8; font-size:13px;">
        No saved companies yet. Add your first business profile above!
      </div>
    `;
    return;
  }

  container.innerHTML = companies.map(comp => {
    const isDef = !!comp.isDefault;
    const isCurrentActive = comp.id === activeCompanyProfileId;
    const safeId = appEscapeHtml(comp.id);
    return `
      <div class="company-card-item ${isDef ? 'is-default' : ''}" data-id="${safeId}">
        <div style="flex:1; padding-right:12px;">
          <div style="font-size:13.5px; font-weight:700; color:#0f172a; display:flex; align-items:center; flex-wrap:wrap; gap:4px;">
            ${appEscapeHtml(comp.name)}
            ${isDef ? '<span class="badge-company-default">DEFAULT</span>' : ''}
            ${isCurrentActive ? '<span style="font-size:9.5px; font-weight:700; padding:1px 6px; border-radius:4px; background:#dcfce7; color:#16a34a; text-transform:uppercase;">ACTIVE</span>' : ''}
          </div>
          <div style="font-size:11.5px; color:#64748b; margin-top:2px;">
            ${appEscapeHtml(comp.email || '')}${comp.phone ? ' • ' + appEscapeHtml(comp.phone) : ''}${comp.taxId ? ' • Tax: ' + appEscapeHtml(comp.taxId) : ''}
          </div>
          <div style="font-size:11px; color:#475569; margin-top:2px;">
            Default currency: <strong>${appEscapeHtml(comp.defaultCurrency || '$')}</strong>
            &bull; ${appEscapeHtml((comp.defaultNumberFormat || 'international') === 'indian' ? 'Indian number format' : 'International number format')}
          </div>
          ${comp.address ? `<div style="font-size:11px; color:#94a3b8; margin-top:2px; white-space:pre-line;">${appEscapeHtml(comp.address)}</div>` : ''}
          ${comp.payment ? `<div style="font-size:10.5px; color:#0369a1; background:#f0f9ff; padding:3px 6px; border-radius:4px; margin-top:4px; display:inline-block;">Bank/Payment Remittance Saved</div>` : ''}
        </div>
        <div style="display:flex; gap:6px; align-items:center;">
          <button class="btn btn-primary btn-sm btn-use-company" data-id="${safeId}" title="Apply this company to the active document">
            Use
          </button>
          ${!isDef ? `<button class="btn btn-secondary btn-sm btn-set-default-company" data-id="${safeId}" title="Make default for all new documents">Make Default</button>` : ''}
          <button class="btn btn-secondary btn-sm btn-edit-company" data-id="${safeId}" title="Edit this company">
            Edit
          </button>
          <button class="btn btn-danger btn-sm btn-icon btn-del-company" data-id="${safeId}" title="Delete company" ${companies.length <= 1 ? 'disabled style="opacity:0.3; cursor:not-allowed;"' : ''}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </div>
      </div>
    `;
  }).join('');

  // Event handlers for company card actions
  container.querySelectorAll('.btn-use-company').forEach(btn => {
    btn.addEventListener('click', async () => {
      const comp = await getCompany(btn.dataset.id);
      if (comp) {
        applyCompanyToInvoice(comp);
        closeModal('modal-companies');
      }
    });
  });

  container.querySelectorAll('.btn-set-default-company').forEach(btn => {
    btn.addEventListener('click', async () => {
      await setDefaultCompany(btn.dataset.id);
      await renderCompanyProfilesSelector();
      await renderCompaniesModalList();
    });
  });

  container.querySelectorAll('.btn-edit-company').forEach(btn => {
    btn.addEventListener('click', async () => {
      const comp = await getCompany(btn.dataset.id);
      if (comp) {
        document.getElementById('modal-company-id').value = comp.id;
        document.getElementById('modal-company-name').value = comp.name || '';
        document.getElementById('modal-company-email').value = comp.email || '';
        document.getElementById('modal-company-phone').value = comp.phone || '';
        document.getElementById('modal-company-address').value = comp.address || '';
        document.getElementById('modal-company-taxid').value = comp.taxId || '';
        document.getElementById('modal-company-payment').value = comp.payment || '';
        document.getElementById('modal-company-currency').value = comp.defaultCurrency || '$';
        document.getElementById('modal-company-number-format').value = comp.defaultNumberFormat || 'international';
        document.getElementById('modal-company-is-default').checked = !!comp.isDefault;
        document.getElementById('company-form-heading').textContent = `Edit Company: ${comp.name}`;
        document.getElementById('btn-cancel-company-edit').style.display = 'inline-block';
        document.getElementById('modal-company-name').focus();
      }
    });
  });

  container.querySelectorAll('.btn-del-company').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (confirm('Permanently delete this company profile?')) {
        const deletedId = String(btn.dataset.id || '');
        await deleteCompany(deletedId);
        if (deletedId && (deletedId === activeCompanyProfileId || deletedId === currentInvoice.companyId)) {
          // A linked document must not keep scoping catalog items against a
          // deleted company: drop the link and rebuild the dependent UI.
          activeCompanyProfileId = null;
          currentInvoice.companyId = null;
          renderLineItemsEditor();
          updateSheetView();
        }
        refreshCatalogPicker();
        await renderCompanyProfilesSelector();
        await renderCompaniesModalList();
        await notifyDataChanged();
      }
    });
  });
}

function applyCompanyToInvoice(comp) {
  if (!comp) return;
  activeCompanyProfileId = comp.id;
  currentInvoice.companyId = comp.id;
  currentInvoice.sender = {
    name: comp.name || '',
    email: comp.email || '',
    phone: comp.phone || '',
    address: comp.address || '',
    taxId: comp.taxId || ''
  };
  currentInvoice.payment = comp.payment || '';

  // Currency defaults apply to new documents. On an already persisted document
  // the user must explicitly confirm a currency change.
  const targetCurrency = String(comp.defaultCurrency || '').trim();
  if (targetCurrency && targetCurrency !== currentInvoice.meta.currency) {
    const shouldChange = !currentDocumentPersisted ||
      confirm(`This company's default currency is ${targetCurrency}. Change the document currency from ${currentInvoice.meta.currency || '$'} to ${targetCurrency}?`);
    if (shouldChange) {
      currentInvoice.meta.currency = targetCurrency;
      currentInvoice.meta.numberFormat = comp.defaultNumberFormat ||
        (targetCurrency === '₹' ? 'indian' : 'international');
    }
  } else if (targetCurrency && !currentDocumentPersisted && comp.defaultNumberFormat) {
    currentInvoice.meta.numberFormat = comp.defaultNumberFormat;
  }

  // If Utharam company is selected, auto-configure official Utharam brand mark
  if (comp.name && comp.name.toLowerCase().includes('utharam') && (!currentInvoice.logo.dataUri || currentInvoice.logo.dataUri.startsWith('data:image/svg+xml'))) {
    currentInvoice.logo.dataUri = generateBrandLockupSVG({
      symbolType: 'monogram',
      initials: 'U',
      shape: 'squircle',
      emblemStyle: 'solid',
      markColor: '#ffffff',
      bgColor: '#059669',
      companyName: 'Utharam',
      tagline: 'Simple Solutions for Complex Problems',
      underlineStyle: 'solid',
      underlineSpan: 'auto',
      underlinePosition: 'bottom',
      layout: 'horizontal',
      textColor: '#0f172a',
      accentColor: '#059669'
    });
    currentInvoice.accentColor = '#059669';
  }

  populateFormFields();
  renderLineItemsEditor();
  updateSheetView();
  refreshCatalogPicker();
  triggerAutoSave();
  renderCompanyProfilesSelector();
}

/**
 * Manual rebranding: hand-editing the sender fields detaches the document
 * from the stored company profile (the link fields only — the sender snapshot
 * keeps the typed text), so Reports can never attribute a manually rebranded
 * document to the old company. Programmatic company application
 * (applyCompanyToInvoice) must NOT call this.
 */
function detachCompanyLink() {
  activeCompanyProfileId = null;
  currentInvoice.companyId = null;
  // The scope hint and any company-tagged picker rows must not reference the
  // dropped link (manual rebranding can happen on every sender keystroke).
  refreshCatalogPicker();
}

async function saveCompanyFromModal() {
  const id = document.getElementById('modal-company-id').value;
  const name = document.getElementById('modal-company-name').value.trim();
  if (!name) {
    alert('Please enter a company or trading name.');
    return;
  }

  const email = document.getElementById('modal-company-email').value.trim();
  const phone = document.getElementById('modal-company-phone').value.trim();
  const address = document.getElementById('modal-company-address').value.trim();
  const taxId = document.getElementById('modal-company-taxid').value.trim();
  const payment = document.getElementById('modal-company-payment').value.trim();
  const defaultCurrency = document.getElementById('modal-company-currency').value.trim() || '$';
  const defaultNumberFormat = document.getElementById('modal-company-number-format').value || 'international';
  const isDefault = document.getElementById('modal-company-is-default').checked;

  // Merge into the existing record so createdAt, default fields, and any
  // unknown fields survive editing.
  const existing = id ? await getCompany(id) : null;
  const company = Object.assign({}, existing || {}, {
    id: id || generateId('comp_'),
    name,
    email,
    phone,
    address,
    taxId,
    payment,
    defaultCurrency,
    defaultNumberFormat,
    isDefault
  });
  if (!company.createdAt) company.createdAt = Date.now();

  await saveCompany(company);
  if (isDefault) {
    await setDefaultCompany(company.id);
  } else {
    const companies = await getAllCompanies();
    if (!companies.some(c => c.isDefault)) {
      const fallback = companies.find(c => c.id !== company.id) || companies[0];
      if (fallback) await setDefaultCompany(fallback.id);
    }
  }

  resetCompanyModalForm();
  await renderCompanyProfilesSelector();
  await renderCompaniesModalList();
  await notifyDataChanged();
  // Names may have changed: refresh the label cache and the picker/hint so
  // scope hints and scope tags never show a stale company name.
  refreshCatalogPicker();
  alert(`Company profile "${company.name}" saved successfully!`);
}

function resetCompanyModalForm() {
  document.getElementById('modal-company-id').value = '';
  document.getElementById('modal-company-name').value = '';
  document.getElementById('modal-company-email').value = '';
  document.getElementById('modal-company-phone').value = '';
  document.getElementById('modal-company-address').value = '';
  document.getElementById('modal-company-taxid').value = '';
  document.getElementById('modal-company-payment').value = '';
  document.getElementById('modal-company-currency').value = '$';
  document.getElementById('modal-company-number-format').value = 'international';
  document.getElementById('modal-company-is-default').checked = false;
  document.getElementById('company-form-heading').textContent = 'Add New Company Profile';
  document.getElementById('btn-cancel-company-edit').style.display = 'none';
}

function updateLogoAlignmentButtons(align) {
  ['left', 'center', 'right'].forEach(a => {
    const btn = document.getElementById(`btn-logo-${a}`);
    if (btn) {
      if (a === align) btn.classList.add('btn-primary');
      else btn.classList.remove('btn-primary');
    }
  });
}

function updateHeaderLayoutButtons(layout) {
  ['left', 'center', 'right'].forEach(l => {
    const btn = document.getElementById(`btn-layout-${l}`);
    if (btn) {
      if (l === layout) btn.classList.add('btn-primary');
      else btn.classList.remove('btn-primary');
    }
  });
}

// ============================================================================
// 6. LINE ITEMS EDITOR & TAXES EDITOR
// ============================================================================
function updateLineTotalBadge(card, idx) {
  try {
    const item = currentInvoice.items[idx];
    if (!item || !card) return;
    const qty = clampNum(item.qty, 0, 1000000, 0);
    const rate = clampNum(item.rate, 0, 1000000000, 0);
    const disc = clampNum(item.discount, 0, 100, 0);
    const taxRate = clampNum(item.taxRate, 0, 100, 0);
    const taxable = qty * rate * (1 - disc / 100);
    const lineTotal = taxable + taxable * (taxRate / 100);
    const badge = card.querySelector('.item-total-badge');
    if (badge) {
      badge.textContent = formatMoney(lineTotal, currentInvoice.meta.currency || '$', currentInvoice.meta.numberFormat || 'international');
    }
  } catch (e) {}
}
function renderLineItemsEditor() {
  const container = document.getElementById('items-editor-list');
  if (!container) return;

  const currency = currentInvoice.meta.currency || '$';
  const numberFormat = currentInvoice.meta.numberFormat || 'international';

  container.innerHTML = currentInvoice.items.map((item, index) => {
    const qty = parseFloat(item.qty) || 0;
    const rate = parseFloat(item.rate) || 0;
    const disc = parseFloat(item.discount) || 0;
    const taxable = qty * rate * (1 - disc / 100);
    const taxRate = item.taxRate !== undefined ? parseFloat(item.taxRate) : 18;
    const taxAmount = taxable * (taxRate / 100);
    const lineTotal = taxable + taxAmount;

    const standardRates = [0, 5, 12, 18, 28];
    const isStandard = standardRates.includes(taxRate);

    // Bookmark state: filled when this line already matches a saved catalog
    // item under the current save scope/company/currency/description.
    const savedCatalogVersion = findSavedCatalogForItem(item);
    const isSavedToCatalog = Boolean(savedCatalogVersion);
    const saveBookmarkTitle = isSavedToCatalog
      ? 'Update saved item'
      : 'Save to item library';

    return `
      <div class="item-card-editor" data-index="${index}">
        <!-- Row 1: Description + HSN/SAC + Bookmark save + Delete -->
        <div class="item-card-row-1">
          <input type="text" class="form-input item-desc-input" value="${appEscapeHtml(item.description)}" placeholder="Service or Item Description">
          <input type="text" class="form-input item-hsn-input" value="${appEscapeHtml(item.hsn || '')}" placeholder="HSN/SAC" title="HSN/SAC Code (e.g. 998314)">
          <button type="button" class="btn-icon btn-save-catalog${isSavedToCatalog ? ' is-saved' : ''}" title="${saveBookmarkTitle}" aria-label="${saveBookmarkTitle}" aria-pressed="${isSavedToCatalog}" data-catalog-saved-id="${isSavedToCatalog ? appEscapeHtml(savedCatalogVersion.id) : ''}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
          </button>
          <button class="btn btn-danger btn-sm btn-icon btn-delete-item" title="Delete line item" ${currentInvoice.items.length <= 1 ? 'disabled style="opacity:0.3; cursor:not-allowed;"' : ''}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </div>

        <!-- Row 2: Qty + Rate + Disc + Tax Rate + Line Total -->
        <div class="item-card-row-2">
          <div>
            <span style="font-size:10px; color:#94a3b8; display:block; margin-bottom:2px;">Qty</span>
            <input type="number" class="form-input item-qty-input" value="${item.qty}" min="0.01" step="any" style="text-align:center; padding:5px 6px; font-size:12px;">
          </div>
          <div>
            <span style="font-size:10px; color:#94a3b8; display:block; margin-bottom:2px;">Unit Price</span>
            <input type="number" class="form-input item-rate-input" value="${item.rate}" min="0" step="any" style="text-align:right; padding:5px 6px; font-size:12px;">
          </div>
          <div>
            <span style="font-size:10px; color:#94a3b8; display:block; margin-bottom:2px;">Disc %</span>
            <input type="number" class="form-input item-disc-input" value="${item.discount || 0}" min="0" max="100" step="any" style="text-align:right; padding:5px 6px; font-size:12px;">
          </div>
          <div>
            <span style="font-size:10px; color:#94a3b8; display:block; margin-bottom:2px;">Tax Rate</span>
            <select class="form-select item-tax-select" style="padding:5px 6px; font-size:11px;">
              <option value="0" ${taxRate === 0 ? 'selected' : ''}>0% (Exempt)</option>
              <option value="5" ${taxRate === 5 ? 'selected' : ''}>5% Tax</option>
              <option value="12" ${taxRate === 12 ? 'selected' : ''}>12% Tax</option>
              <option value="18" ${taxRate === 18 ? 'selected' : ''}>18% GST</option>
              <option value="28" ${taxRate === 28 ? 'selected' : ''}>28% Tax</option>
              <option value="custom" ${!isStandard ? 'selected' : ''}>${!isStandard ? taxRate + '% Custom' : 'Custom %...'}</option>
            </select>
          </div>
          <div style="text-align:right;">
            <span style="font-size:10px; color:#94a3b8; display:block; margin-bottom:2px;">Line Total</span>
            <div class="item-total-badge" style="font-size:12px; font-weight:700; color:#0f172a; padding-top:4px;">${formatMoney(lineTotal, currency, numberFormat)}</div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Attach change listeners to item cards
  container.querySelectorAll('.item-card-editor').forEach(card => {
    const idx = parseInt(card.dataset.index, 10);
    card.querySelector('.item-desc-input').addEventListener('input', (e) => {
      currentInvoice.items[idx].description = e.target.value;
      // The catalog dedupe key includes the description: refresh this card's
      // bookmark state in place instead of re-rendering the whole editor.
      updateCatalogBookmarkState(card, idx);
      updateSheetView();
      triggerAutoSave();
    });
    card.querySelector('.item-hsn-input').addEventListener('input', (e) => {
      currentInvoice.items[idx].hsn = e.target.value;
      updateSheetView();
      triggerAutoSave();
    });
    card.querySelector('.item-qty-input').addEventListener('input', (e) => {
      currentInvoice.items[idx].qty = clampNum(e.target.value, 0, 1000000, 0);
      updateSheetView();
      updateLineTotalBadge(card, idx);
      triggerAutoSave();
    });
    card.querySelector('.item-qty-input').addEventListener('change', (e) => {
      e.target.value = currentInvoice.items[idx].qty;
      renderLineItemsEditor();
    });
    card.querySelector('.item-rate-input').addEventListener('input', (e) => {
      currentInvoice.items[idx].rate = clampNum(e.target.value, 0, 1000000000, 0);
      updateSheetView();
      updateLineTotalBadge(card, idx);
      triggerAutoSave();
    });
    card.querySelector('.item-rate-input').addEventListener('change', (e) => {
      e.target.value = currentInvoice.items[idx].rate;
      renderLineItemsEditor();
    });
    card.querySelector('.item-disc-input').addEventListener('input', (e) => {
      currentInvoice.items[idx].discount = clampNum(e.target.value, 0, 100, 0);
      updateSheetView();
      updateLineTotalBadge(card, idx);
      triggerAutoSave();
    });
    card.querySelector('.item-disc-input').addEventListener('change', (e) => {
      e.target.value = currentInvoice.items[idx].discount;
      renderLineItemsEditor();
    });
    card.querySelector('.item-tax-select').addEventListener('change', (e) => {
      if (e.target.value === 'custom') {
        const customPrompt = prompt('Enter custom tax percentage 0-100 (e.g. 7.5 or 15):', currentInvoice.items[idx].taxRate ?? '12');
        if (customPrompt !== null) {
          const parsed = clampNum(customPrompt, 0, 100, 0);
          currentInvoice.items[idx].taxRate = parsed;
        }
      } else {
        currentInvoice.items[idx].taxRate = clampNum(e.target.value, 0, 100, 0);
      }
      renderLineItemsEditor();
      updateSheetView();
      triggerAutoSave();
    });
    const deleteBtn = card.querySelector('.btn-delete-item');
    if (deleteBtn && !deleteBtn.disabled) {
      deleteBtn.addEventListener('click', () => {
        currentInvoice.items.splice(idx, 1);
        renderLineItemsEditor();
        updateSheetView();
        triggerAutoSave();
      });
    }
    const saveCatalogBtn = card.querySelector('.btn-save-catalog');
    if (saveCatalogBtn) {
      saveCatalogBtn.addEventListener('click', async () => {
        await saveLineItemToCatalog(idx);
      });
    }
  });
}

// ============================================================================
// 5B. SAVED ITEM LIBRARY (Module 5 picker + bookmark save + Settings manager)
// ============================================================================
// In-memory mirrors of the v4 catalog data (`catalogItems` store and the
// `itemLibraryConfig` setting) are loaded once at boot; writes go through
// js/db.js and update the cache immediately. Catalog edits never touch saved
// invoices or the active draft — they only write to `catalogItems`.
let catalogCompanyNameCache = new Map(); // companyId -> display name
let catalogCompanyNamesResolved = false; // cache contains a real company list?
let catalogStatusTimer = null;
let itemLibraryStatusTimer = null;

/** Canonical currency key of the active document (drives picker filtering). */
function catalogCurrencyKey() {
  return normalizeCurrency(currentInvoice.meta.currency || '$').key;
}

/**
 * Active company link: current document link wins, else the shell selector.
 * The id is validated against the known company list so deleted/dangling
 * links can never scope catalog saves or picker grouping — such links return
 * null (treated like "no company").
 */
function catalogActiveCompanyId() {
  const candidate = currentInvoice.companyId || activeCompanyProfileId || null;
  if (!candidate) return null;
  const key = String(candidate).trim();
  // Company list not loaded yet (very early boot / transient): fall back to
  // the raw link so the UI never spuriously blocks company-scope actions.
  if (!catalogCompanyNamesResolved) return key;
  return catalogCompanyNameCache.has(key) ? key : null;
}

/** Sync display label for a company id, best-effort from the name cache. */
function catalogCompanyLabel(companyId) {
  if (!companyId) return '';
  return catalogCompanyNameCache.get(String(companyId)) || '';
}

/** Keeps the companyId->name cache fresh; a failed read only risks labels. */
function refreshCatalogCompanyNameCache() {
  return getAllCompanies()
    .then(companies => {
      catalogCompanyNameCache = new Map((companies || []).map(c => [
        String(c.id),
        (c && c.name) ? c.name : String(c.id)
      ]));
      catalogCompanyNamesResolved = true;
    })
    .catch(() => {
      // An unreadable company list cannot vouch for any link: treat as empty
      // so stale/deleted ids are never used as a catalog save scope.
      catalogCompanyNameCache = new Map();
      catalogCompanyNamesResolved = true;
    });
}

/** Adds or replaces one record in the cache array (db returns newest first). */
function upsertCatalogItemInCache(record) {
  if (!record || !record.id) return;
  const idx = catalogItems.findIndex(c => c && c.id === record.id);
  if (idx >= 0) catalogItems[idx] = record;
  else catalogItems.unshift(record);
}

/** The scope new saves should use, honoring the configured default. */
function getCatalogSaveContext() {
  const scope = normalizeCatalogScope(itemLibraryConfig ? itemLibraryConfig.scope : 'global');
  const activeCompanyId = catalogActiveCompanyId();
  return {
    scope,
    companyId: scope === 'company' ? activeCompanyId : null,
    hasCompanyScopeBlocker: scope === 'company' && !activeCompanyId
  };
}

/**
 * The saved version of a line item under the current save scope/company/
 * currency/description — drives the bookmark's filled "saved" state.
 */
function findSavedCatalogForItem(lineItem) {
  if (!lineItem || typeof lineItem !== 'object') return null;
  const ctx = getCatalogSaveContext();
  const candidate = buildCatalogCandidateFromLineItem(lineItem, {
    scope: ctx.scope,
    companyId: ctx.companyId,
    currency: currentInvoice.meta.currency || '$',
    currencyKey: catalogCurrencyKey()
  });
  return findCatalogMatch(catalogItems, candidate);
}

/**
 * Refreshes one bookmark button's saved/unsaved state in place (class,
 * aria-pressed, title and data id) without rebuilding the whole item editor.
 * The dedupe key only depends on scope/company/currency/description, so this
 * runs on description edits; the editor is re-rendered wholly whenever the
 * catalog itself changes.
 */
function updateCatalogBookmarkState(card, index) {
  const btn = card && card.querySelector ? card.querySelector('.btn-save-catalog') : null;
  if (!btn) return;
  const item = currentInvoice.items[index];
  if (!item) return;
  const savedVersion = findSavedCatalogForItem(item);
  const isSaved = Boolean(savedVersion);
  const title = isSaved ? 'Update saved item' : 'Save to item library';
  btn.classList.toggle('is-saved', isSaved);
  btn.setAttribute('aria-pressed', isSaved ? 'true' : 'false');
  btn.setAttribute('aria-label', title);
  btn.setAttribute('title', title);
  // setAttribute writes the raw value (no HTML escaping needed here).
  btn.setAttribute('data-catalog-saved-id', isSaved ? savedVersion.id : '');
}

/** "Saved/Added to <x>" feedback for the Module 5 picker (timed clear). */
function setCatalogStatus(message) {
  const el = document.getElementById('catalog-status');
  if (!el) return;
  el.textContent = message || '';
  if (catalogStatusTimer) { clearTimeout(catalogStatusTimer); catalogStatusTimer = null; }
  if (message) {
    catalogStatusTimer = setTimeout(() => {
      el.textContent = '';
      catalogStatusTimer = null;
    }, 5000);
  }
}

/** Same feedback pattern for the item-library modal. */
function setItemLibraryStatus(message) {
  const el = document.getElementById('item-library-status');
  if (!el) return;
  el.textContent = message || '';
  if (itemLibraryStatusTimer) { clearTimeout(itemLibraryStatusTimer); itemLibraryStatusTimer = null; }
  if (message) {
    itemLibraryStatusTimer = setTimeout(() => {
      el.textContent = '';
      itemLibraryStatusTimer = null;
    }, 5000);
  }
}

/** Scope hint under the picker eyebrow: where new bookmark saves will land. */
function updateCatalogScopeHint() {
  const el = document.getElementById('catalog-scope-hint');
  if (!el) return;
  const scope = normalizeCatalogScope(itemLibraryConfig ? itemLibraryConfig.scope : 'global');
  if (scope !== 'company') {
    el.textContent = 'New saves go to Global items';
    return;
  }
  const companyId = catalogActiveCompanyId();
  if (!companyId) {
    el.textContent = 'Link a company to save company items';
    return;
  }
  el.textContent = `New saves go to ${catalogCompanyLabel(companyId) || 'your linked company'}`;
}

/** Refresh the picker hint + open results after company/currency/doc changes. */
function refreshCatalogPicker() {
  refreshCatalogCompanyNameCache().then(() => {
    updateCatalogScopeHint();
    if (isCatalogResultsOpen()) showCatalogResults();
  });
  updateCatalogScopeHint();
  if (isCatalogResultsOpen()) showCatalogResults();
}

/** Whether the picker dropdown is showing right now. */
function isCatalogResultsOpen() {
  const resultsEl = document.getElementById('catalog-results');
  if (!resultsEl || resultsEl.hidden) return false;
  const searchEl = document.getElementById('catalog-search');
  return Boolean(searchEl && (searchEl === document.activeElement || resultsEl.contains(document.activeElement)));
}

function hideCatalogResults() {
  const resultsEl = document.getElementById('catalog-results');
  const searchEl = document.getElementById('catalog-search');
  if (searchEl) searchEl.setAttribute('aria-expanded', 'false');
  if (resultsEl) resultsEl.hidden = true;
}

function catalogResultRowHTML(item) {
  const currency = (item.currency && typeof item.currency === 'string')
    ? item.currency
    : currentInvoice.meta.currency;
  const price = formatMoney(item.rate, currency, currentInvoice.meta.numberFormat || 'international');
  const scope = normalizeCatalogScope(item.scope);
  const scopeTag = scope === 'company' ? (catalogCompanyLabel(item.companyId) || 'Company') : 'Global';
  return `
    <button type="button" class="catalog-result-row" data-catalog-add="${appEscapeHtml(item.id)}" title="Add this saved item as a new line item">
      <span class="catalog-result-main">
        <span class="catalog-result-desc">${appEscapeHtml(item.description)}</span>
        <span class="catalog-result-meta">
          ${item.hsn ? `<span class="item-hsn-tag">HSN ${appEscapeHtml(item.hsn)}</span>` : ''}
          <span class="catalog-price">${appEscapeHtml(price)}</span>
          <span class="catalog-tax-badge">${Number(item.taxRate) || 0}% tax</span>
        </span>
      </span>
      <span class="catalog-scope-tag ${scope === 'company' ? 'is-company' : 'is-global'}">${appEscapeHtml(scopeTag)}</span>
    </button>`;
}

function catalogResultEmptyHTML(search) {
  const trimmed = (typeof search === 'string') ? search.trim() : '';
  const note = trimmed
    ? 'No saved items match this search.'
    : 'No saved items in this currency yet.';
  return `
    <div class="catalog-empty">
      <span>${note}</span>
      <button type="button" class="btn btn-secondary btn-sm" data-catalog-manage>Manage items</button>
    </div>`;
}

/** Renders the grouped global/company dropdown from the current cache. */
function showCatalogResults() {
  const searchEl = document.getElementById('catalog-search');
  const resultsEl = document.getElementById('catalog-results');
  if (!searchEl || !resultsEl) return;
  searchEl.setAttribute('aria-expanded', 'true');
  const search = searchEl.value;
  const groups = groupCatalogItemsForView(catalogItems, {
    search,
    currencyKey: catalogCurrencyKey(),
    companyId: catalogActiveCompanyId()
  });
  if (groups.length === 0) {
    resultsEl.innerHTML = catalogResultEmptyHTML(search);
  } else {
    resultsEl.innerHTML = groups.map(group => {
      return `<div class="catalog-group-label">${appEscapeHtml(group.label)}</div>` +
        group.items.map(catalogResultRowHTML).join('');
    }).join('');
  }
  resultsEl.hidden = false;
}

/** Repeated listeners: static wiring only, never per rendered row. */
function setupCatalogPicker() {
  const searchEl = document.getElementById('catalog-search');
  const resultsEl = document.getElementById('catalog-results');
  const manageBtn = document.getElementById('btn-manage-catalog');

  if (searchEl) {
    searchEl.addEventListener('focus', () => { showCatalogResults(); });
    searchEl.addEventListener('input', () => { showCatalogResults(); });
  }

  if (manageBtn) {
    manageBtn.addEventListener('click', async () => {
      // Never let the dropdown linger under the manager modal.
      hideCatalogResults();
      await openAppModal('modal-item-library');
    });
  }

  // One delegated click target for all result rows and the empty-state
  // Manage button; rows are re-rendered on every search change, so per-row
  // bindings would leak and never stay in sync.
  if (resultsEl) {
    resultsEl.addEventListener('click', async (e) => {
      const manageTrigger = e.target.closest('[data-catalog-manage]');
      if (manageTrigger) {
        hideCatalogResults();
        await openAppModal('modal-item-library');
        return;
      }
      const addBtn = e.target.closest('[data-catalog-add]');
      if (!addBtn) return;
      hideCatalogResults();
      await addLineItemFromCatalog(addBtn.getAttribute('data-catalog-add'));
    });
  }

  // Closing the manager (×, Close footer, Escape-cancel) dismisses any
  // lingering dropdown and re-syncs the picker with the post-edit catalog.
  const libraryModal = document.getElementById('modal-item-library');
  if (libraryModal) {
    libraryModal.addEventListener('close', () => {
      hideCatalogResults();
      refreshCatalogPicker();
    });
  }

  // Close the dropdown on any click outside the picker.
  document.addEventListener('click', (e) => {
    const picker = document.getElementById('catalog-picker');
    if (!picker || picker.contains(e.target)) return;
    hideCatalogResults();
  });

  // Escape closes the dropdown (and blurs) without touching open dialogs.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const openResults = document.getElementById('catalog-results');
    if (openResults && !openResults.hidden) {
      hideCatalogResults();
      const focusedSearch = document.getElementById('catalog-search');
      if (focusedSearch && focusedSearch === document.activeElement) focusedSearch.blur();
    }
  });
}

/**
 * Adds a saved catalog item to the document as a new line item (qty 1, saved
 * price/tax/HSN, discount 0) and bumps its usage counters as a non-blocking
 * write. The line item itself is plain document data — no catalog ids or
 * currency fields leak into the invoice.
 */
async function addLineItemFromCatalog(catalogId) {
  if (!catalogId) return;
  const item = catalogItems.find(c => c && c.id === catalogId);
  if (!item) {
    setCatalogStatus('That saved item is no longer in the library.');
    showCatalogResults();
    return;
  }

  currentInvoice.items.push(catalogItemToLineItem(item));
  renderLineItemsEditor();
  updateSheetView();
  triggerAutoSave();

  const searchEl = document.getElementById('catalog-search');
  if (searchEl) searchEl.value = '';
  hideCatalogResults();
  setCatalogStatus(`Added ${item.description}`);

  (async () => {
    try {
      const bumped = await saveCatalogItem({
        ...item,
        usageCount: (Number(item.usageCount) || 0) + 1,
        lastUsedAt: Date.now()
      });
      upsertCatalogItemInCache(bumped);
    } catch (e) {
      console.warn('Could not update saved item usage counters:', e);
    }
  })();
}

/**
 * Bookmark action for a line item card: save it to the library, or update the
 * existing match (scope + company + currency + description dedupe). Success
 * feedback goes to the picker status line, never an alert.
 */
async function saveLineItemToCatalog(index) {
  const item = currentInvoice.items[index];
  if (!item || typeof item !== 'object') return;
  const description = (typeof item.description === 'string') ? item.description.trim() : '';
  if (!description) {
    alert('Add a description before saving this line item to the item library.');
    return;
  }

  const ctx = getCatalogSaveContext();
  if (ctx.hasCompanyScopeBlocker) {
    alert('Link a company to this document or switch the item library to Shared in Settings.');
    return;
  }

  const currency = currentInvoice.meta.currency || '$';
  const currencyKey = normalizeCurrency(currency).key;
  const candidate = buildCatalogCandidateFromLineItem(item, {
    scope: ctx.scope,
    companyId: ctx.companyId,
    currency,
    currencyKey
  });
  const existing = findCatalogMatch(catalogItems, candidate);

  // Updates keep the stored id, createdAt and usage counters; new records are
  // normalized (clamps, descriptionKey, currencyKey) by saveCatalogItem.
  const record = Object.assign({}, candidate, existing ? {
    id: existing.id,
    createdAt: existing.createdAt,
    usageCount: existing.usageCount,
    lastUsedAt: existing.lastUsedAt
  } : {});

  try {
    const savedRecord = await saveCatalogItem(record);
    upsertCatalogItemInCache(savedRecord);
    renderLineItemsEditor();
    updateCatalogSettingsCount();
    updateCatalogScopeHint();
    if (isCatalogResultsOpen()) showCatalogResults();
    const scopeLabel = savedRecord.scope === 'company'
      ? (catalogCompanyLabel(savedRecord.companyId) || 'your company')
      : 'Global items';
    setCatalogStatus(existing ? `Updated ${savedRecord.description}` : `Saved to ${scopeLabel}`);
  } catch (e) {
    console.warn('Could not save line item to the library:', e);
    alert('Could not save this line item to the item library. ' + (e && e.message ? e.message : ''));
  }
}

// ---- Item library manager (Settings modal) --------------------------------

function updateCatalogSettingsCount() {
  const el = document.getElementById('settings-catalog-count');
  if (el) el.textContent = String(catalogItems.length);
}

function renderItemLibraryScopeRadios() {
  const scope = normalizeCatalogScope(itemLibraryConfig ? itemLibraryConfig.scope : 'global');
  document.querySelectorAll('input[name="item-library-scope"]').forEach(radio => {
    radio.checked = normalizeCatalogScope(radio.value) === scope;
  });
}

/**
 * Loads modal data, resets the form/search and renders the grouped list.
 * Called by openAppModal() every time the dialog opens, so the view never
 * shows a stale cache after external changes.
 */
async function openItemLibraryManager() {
  hideCatalogResults();
  try {
    catalogItems = await getAllCatalogItems();
  } catch (e) {
    console.warn('Item library refresh failed:', e);
  }
  try {
    itemLibraryConfig = await getItemLibraryConfig();
  } catch (e) {
    console.warn('Item library scope refresh failed:', e);
    itemLibraryConfig = { scope: 'global', updatedAt: null };
  }
  itemLibraryEditing = null;
  hideItemLibraryForm();
  renderItemLibraryScopeRadios();
  updateCatalogSettingsCount();
  const searchEl = document.getElementById('item-library-search');
  if (searchEl) searchEl.value = '';
  setItemLibraryStatus('');
  await refreshCatalogCompanyNameCache();
  await renderItemLibraryList();
  refreshCatalogPicker();
}

function updateCatalogFormCompanyState(hasCompanies) {
  const scopeEl = document.getElementById('item-library-scope');
  const companyEl = document.getElementById('item-library-company');
  const hintEl = document.getElementById('item-library-company-hint');
  const isCompany = Boolean(scopeEl) && normalizeCatalogScope(scopeEl.value) === 'company';
  if (companyEl) companyEl.disabled = !isCompany;
  if (hintEl && hasCompanies !== undefined) {
    if (isCompany && !hasCompanies) {
      hintEl.textContent = 'No saved companies yet — keep items shared, or add one in Companies first.';
    } else if (isCompany) {
      hintEl.textContent = 'Only documents linked to this company will see it.';
    } else {
      hintEl.textContent = '';
    }
  }
}

/** Populates the company select; an empty library keeps Global scope usable. */
async function populateItemLibraryCompanySelect(selectedId) {
  const select = document.getElementById('item-library-company');
  if (!select) return false;
  let companies = [];
  try {
    companies = await getAllCompanies();
  } catch (e) {
    console.warn('Company list for item library failed:', e);
  }
  const hasCompanies = companies.length > 0;
  if (!hasCompanies) {
    select.innerHTML = `<option value="">No companies saved yet &mdash; link one in Companies</option>`;
  } else {
    select.innerHTML = `<option value="">Choose a company&hellip;</option>` +
      companies.map(c => `<option value="${appEscapeHtml(c.id)}">${appEscapeHtml((c && c.name) || 'Company')}</option>`).join('');
    if (selectedId) select.value = String(selectedId);
    if (!select.value && selectedId && companies.some(c => String(c.id) === String(selectedId))) {
      select.value = String(selectedId);
    }
  }
  updateCatalogFormCompanyState(hasCompanies);
  return hasCompanies;
}

function itemLibraryRowHTML(item) {
  const currency = (item.currency && typeof item.currency === 'string')
    ? item.currency
    : currentInvoice.meta.currency;
  const price = formatMoney(item.rate, currency, currentInvoice.meta.numberFormat || 'international');
  const scope = normalizeCatalogScope(item.scope);
  const scopeTag = scope === 'company' ? (catalogCompanyLabel(item.companyId) || 'Company') : 'Global';
  const taxRate = Number(item.taxRate) || 0;
  return `
    <div class="item-library-row" data-item-library-row="${appEscapeHtml(item.id)}">
      <div class="item-library-row-main">
        <div class="item-library-row-desc">${appEscapeHtml(item.description)}</div>
        <div class="item-library-row-meta">
          <span class="catalog-price">${appEscapeHtml(price)}</span>
          <span>${taxRate}% tax</span>
          ${item.hsn ? `<span>HSN ${appEscapeHtml(item.hsn)}</span>` : ''}
        </div>
      </div>
      <span class="catalog-scope-tag ${scope === 'company' ? 'is-company' : 'is-global'}">${appEscapeHtml(scopeTag)}</span>
      <div class="item-library-row-actions">
        <button type="button" class="btn btn-secondary btn-sm" data-item-library-edit="${appEscapeHtml(item.id)}" title="Edit this item">Edit</button>
        <button type="button" class="btn btn-danger btn-sm btn-icon" data-item-library-remove="${appEscapeHtml(item.id)}" title="Delete this item">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
      </div>
    </div>`;
}

/** Grouped list (Shared first) filtered by description/HSN search. */
async function renderItemLibraryList() {
  const listEl = document.getElementById('item-library-list');
  const countEl = document.getElementById('item-library-count');
  if (!listEl) return;
  const searchEl = document.getElementById('item-library-search');
  const needle = searchEl ? searchEl.value.trim().toLowerCase() : '';
  const matchesSearch = (item) => {
    if (!needle) return true;
    const description = (typeof item.description === 'string') ? item.description.toLowerCase() : '';
    if (description.includes(needle)) return true;
    const hsn = (item.hsn === undefined || item.hsn === null) ? '' : String(item.hsn).toLowerCase();
    return hsn.includes(needle);
  };

  const globalItems = catalogItems.filter(i => i && typeof i === 'object' &&
    normalizeCatalogScope(i.scope) === 'global' && matchesSearch(i));
  const companyItems = catalogItems.filter(i => i && typeof i === 'object' &&
    normalizeCatalogScope(i.scope) === 'company' && matchesSearch(i));
  const shown = globalItems.length + companyItems.length;
  const total = catalogItems.length;

  if (countEl) {
    countEl.textContent = shown === total
      ? `${total} item${total === 1 ? '' : 's'}`
      : `${shown} of ${total} items`;
  }

  if (shown === 0) {
    listEl.innerHTML = `<div class="item-library-empty">${needle
      ? 'No saved items match this search.'
      : 'No saved items yet. Save line items from Compose, or add one here.'}</div>`;
    return;
  }

  let html = '';
  if (globalItems.length > 0) {
    html += `<div class="catalog-group-label">Global items</div>` + globalItems.map(itemLibraryRowHTML).join('');
  }
  if (companyItems.length > 0) {
    html += `<div class="catalog-group-label">Company items</div>` + companyItems.map(itemLibraryRowHTML).join('');
  }
  listEl.innerHTML = html;

  // Row bindings are re-attached per render like the other modal lists.
  listEl.querySelectorAll('[data-item-library-edit]').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = catalogItems.find(c => c && c.id === btn.getAttribute('data-item-library-edit'));
      if (item) showItemLibraryForm(item);
    });
  });
  listEl.querySelectorAll('[data-item-library-remove]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await deleteItemLibraryItem(btn.getAttribute('data-item-library-remove'));
    });
  });
}

/** Shows the inline form for Add (null) or Edit (a stored record). */
async function showItemLibraryForm(item = null) {
  const formEl = document.getElementById('item-library-form');
  if (!formEl) return;
  itemLibraryEditing = item && typeof item === 'object' ? item : null;

  const headingEl = document.getElementById('item-library-form-heading');
  const idEl = document.getElementById('item-library-id');
  const descEl = document.getElementById('item-library-description');
  const hsnEl = document.getElementById('item-library-hsn');
  const rateEl = document.getElementById('item-library-rate');
  const taxEl = document.getElementById('item-library-tax');
  const currencyEl = document.getElementById('item-library-currency');
  const scopeEl = document.getElementById('item-library-scope');
  const deleteBtn = document.getElementById('item-library-delete');

  const editing = itemLibraryEditing;
  const scope = normalizeCatalogScope(editing
    ? editing.scope
    : (itemLibraryConfig ? itemLibraryConfig.scope : 'global'));
  const companyId = editing
    ? editing.companyId
    : (scope === 'company' ? catalogActiveCompanyId() : '');

  if (headingEl) headingEl.textContent = editing ? 'Edit library item' : 'Add library item';
  if (idEl) idEl.value = editing ? editing.id : '';
  if (descEl) descEl.value = editing && editing.description ? editing.description : '';
  if (hsnEl) hsnEl.value = editing && editing.hsn ? editing.hsn : '';
  if (rateEl) rateEl.value = editing ? String(Number(editing.rate) || 0) : '0';
  if (taxEl) taxEl.value = editing ? String(Number(editing.taxRate) || 0) : '18';
  if (currencyEl) currencyEl.value = editing
    ? (editing.currency || '')
    : (currentInvoice.meta.currency || '$');
  if (scopeEl) scopeEl.value = scope;
  if (deleteBtn) deleteBtn.hidden = !editing;

  await populateItemLibraryCompanySelect(companyId);
  formEl.hidden = false;
  setItemLibraryStatus('');
  if (descEl) descEl.focus();
}

function hideItemLibraryForm() {
  const formEl = document.getElementById('item-library-form');
  if (formEl) formEl.hidden = true;
  ['item-library-id', 'item-library-description', 'item-library-hsn',
    'item-library-rate', 'item-library-tax', 'item-library-currency'
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const scopeEl = document.getElementById('item-library-scope');
  if (scopeEl) scopeEl.value = 'global';
  const companyEl = document.getElementById('item-library-company');
  if (companyEl) { companyEl.value = ''; companyEl.disabled = false; }
  const hintEl = document.getElementById('item-library-company-hint');
  if (hintEl) hintEl.textContent = '';
  itemLibraryEditing = null;
}

/** Validates, normalizes and persists the inline form; never mutates invoices. */
async function saveItemLibraryForm() {
  const idEl = document.getElementById('item-library-id');
  const descEl = document.getElementById('item-library-description');
  const hsnEl = document.getElementById('item-library-hsn');
  const rateEl = document.getElementById('item-library-rate');
  const taxEl = document.getElementById('item-library-tax');
  const currencyEl = document.getElementById('item-library-currency');
  const scopeEl = document.getElementById('item-library-scope');
  const companyEl = document.getElementById('item-library-company');
  if (!descEl || !scopeEl) return;

  const description = descEl.value.trim();
  if (!description) {
    alert('A description is required for the library item.');
    descEl.focus();
    return;
  }
  const scope = normalizeCatalogScope(scopeEl.value);
  const companyId = (scope === 'company' && companyEl) ? String(companyEl.value || '').trim() : '';
  if (scope === 'company' && !companyId) {
    alert('Choose a company for this item, or switch the scope to Shared.');
    if (companyEl) companyEl.focus();
    return;
  }

  const formId = (idEl && idEl.value) ? String(idEl.value).trim() : '';
  // When editing the same stored record, its counters/createdAt survive the
  // update; saveCatalogItem/normalizeCatalogItem re-stamp the rest.
  const baseline = itemLibraryEditing && formId && itemLibraryEditing.id === formId
    ? itemLibraryEditing
    : null;

  // A blank currency must never reach normalizeCatalogItem (empty currencyKey
  // would make the item unreachable in the currency-filtered picker): fall
  // back to the editing baseline's currency, then the document's currency.
  const docCurrency = (currentInvoice.meta.currency && String(currentInvoice.meta.currency).trim())
    ? String(currentInvoice.meta.currency).trim()
    : '$';
  let formCurrency = currencyEl ? String(currencyEl.value || '').trim() : '';
  if (!formCurrency) {
    formCurrency = (baseline && baseline.currency && String(baseline.currency).trim())
      ? String(baseline.currency).trim()
      : docCurrency;
    if (currencyEl) currencyEl.value = formCurrency;
  }

  const record = Object.assign({}, baseline || {}, {
    id: formId || undefined,
    description,
    hsn: hsnEl ? hsnEl.value.trim() : '',
    rate: rateEl ? rateEl.value : 0,
    taxRate: taxEl ? taxEl.value : 18,
    currency: formCurrency,
    scope,
    companyId: scope === 'company' ? companyId : null
  });

  try {
    const savedRecord = await saveCatalogItem(record);
    upsertCatalogItemInCache(savedRecord);
    updateCatalogSettingsCount();
    // Manager edits change what matches each line item's description/scope:
    // rebuild the bookmark states and the picker rows alongside the list.
    renderLineItemsEditor();
    hideItemLibraryForm();
    await renderItemLibraryList();
    refreshCatalogPicker();
    const scopeLabel = savedRecord.scope === 'company'
      ? (catalogCompanyLabel(savedRecord.companyId) || 'Company')
      : 'Global items';
    setItemLibraryStatus(baseline ? `Updated ${savedRecord.description}` : `Saved to ${scopeLabel}`);
  } catch (e) {
    console.warn('Could not save the library item:', e);
    alert('Could not save this library item. ' + (e && e.message ? e.message : ''));
  }
}

/** Confirm-delete from the manager; documents keep their line items. */
async function deleteItemLibraryItem(id) {
  if (!id) return;
  const item = catalogItems.find(c => c && c.id === id);
  if (!item) return;
  const label = item.description || 'this item';
  if (!confirm(`Delete "${label}" from the item library? Saved documents keep their line items.`)) return;
  try {
    await deleteCatalogItem(id);
    catalogItems = catalogItems.filter(c => c && c.id !== id);
    updateCatalogSettingsCount();
    if (itemLibraryEditing && itemLibraryEditing.id === id) hideItemLibraryForm();
    // Lines that matched the deleted item go back to the unsaved bookmark.
    renderLineItemsEditor();
    await renderItemLibraryList();
    refreshCatalogPicker();
    setItemLibraryStatus(`Deleted ${label}`);
  } catch (e) {
    console.warn('Could not delete the library item:', e);
    alert('Could not delete this library item. ' + (e && e.message ? e.message : ''));
  }
}

/** One-time modal wiring: search, toolbar, form buttons and scope radios. */
function setupItemLibraryModal() {
  const searchEl = document.getElementById('item-library-search');
  if (searchEl) searchEl.addEventListener('input', () => { renderItemLibraryList(); });

  const addBtn = document.getElementById('item-library-add');
  if (addBtn) addBtn.addEventListener('click', () => { showItemLibraryForm(null); });

  const saveBtn = document.getElementById('item-library-save');
  if (saveBtn) saveBtn.addEventListener('click', () => { saveItemLibraryForm(); });

  const cancelBtn = document.getElementById('item-library-cancel');
  if (cancelBtn) cancelBtn.addEventListener('click', () => { hideItemLibraryForm(); });

  const deleteBtn = document.getElementById('item-library-delete');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', async () => {
      if (itemLibraryEditing && itemLibraryEditing.id) {
        await deleteItemLibraryItem(itemLibraryEditing.id);
      }
    });
  }

  // Form scope select only toggles the company field enablement.
  const formScopeSelect = document.getElementById('item-library-scope');
  if (formScopeSelect) {
    formScopeSelect.addEventListener('change', () => {
      const companyEl = document.getElementById('item-library-company');
      // >1 option means real company options exist (the empty-library state
      // renders a single placeholder option and keeps Global usable).
      const hasCompanies = Boolean(companyEl) && companyEl.options.length > 1;
      updateCatalogFormCompanyState(hasCompanies);
    });
  }

  // Radios set the default save scope for new items (persisted immediately).
  document.querySelectorAll('input[name="item-library-scope"]').forEach(radio => {
    radio.addEventListener('change', async () => {
      if (!radio.checked) return;
      const scope = normalizeCatalogScope(radio.value);
      try {
        itemLibraryConfig = await saveItemLibraryConfig({ scope });
      } catch (e) {
        console.warn('Could not persist the item library scope:', e);
        itemLibraryConfig.scope = scope;
      }
      renderItemLibraryScopeRadios();
      // Saved-state badges depend on the configured scope: rebuild them.
      renderLineItemsEditor();
      updateCatalogScopeHint();
      refreshCatalogPicker();
    });
  });
}

function renderTaxesEditor() {
  const container = document.getElementById('taxes-editor-container');
  if (!container) return;
  if (!currentInvoice.taxes || currentInvoice.taxes.length === 0) {
    container.innerHTML = `
      <div style="font-size:12px; color:#94a3b8; padding:10px; text-align:center; background:#f8fafc; border-radius:6px; border:1px dashed #cbd5e1;">
        No tax split legs defined. (100% of tax will be reported as standard tax, or 0% if exempt).
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div style="display:grid; grid-template-columns: 1fr 100px 32px; gap:8px; margin-bottom:6px; font-size:11px; font-weight:600; color:#64748b;">
      <div>Tax Leg Name</div>
      <div style="text-align:right;">Split Share %</div>
      <div></div>
    </div>
  ` + currentInvoice.taxes.map((tax, index) => {
    const ratioVal = clampNum(tax.ratio !== undefined ? tax.ratio : tax.rate, 0, 100, 50);
    return `
      <div class="tax-row" data-index="${index}" style="display:grid; grid-template-columns: 1fr 100px 32px; gap:8px; align-items:center; margin-bottom:8px;">
        <input type="text" class="form-input tax-name-input" value="${appEscapeHtml(tax.name)}" placeholder="Tax Leg (e.g. CGST, SGST, VAT)">
        <div style="display:flex; align-items:center; gap:4px;">
          <input type="number" class="form-input tax-ratio-input" value="${ratioVal}" min="0" max="100" step="any" placeholder="Share %" style="text-align:right; padding:6px 8px;">
          <span style="font-size:12px; font-weight:600; color:#64748b;">%</span>
        </div>
        <button class="btn btn-danger btn-sm btn-icon btn-delete-tax" title="Remove tax leg">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.tax-row').forEach(row => {
    const idx = parseInt(row.dataset.index, 10);
    row.querySelector('.tax-name-input').addEventListener('input', (e) => {
      currentInvoice.taxes[idx].name = e.target.value;
      updateSheetView();
      triggerAutoSave();
    });
    row.querySelector('.tax-ratio-input').addEventListener('input', (e) => {
      currentInvoice.taxes[idx].ratio = clampNum(e.target.value, 0, 100, 0);
      updateSheetView();
      triggerAutoSave();
    });
    row.querySelector('.btn-delete-tax').addEventListener('click', () => {
      currentInvoice.taxes.splice(idx, 1);
      renderTaxesEditor();
      updateSheetView();
      triggerAutoSave();
    });
  });
}

function updateSenderTaxHint() {
  const hintBox = document.getElementById('sender-tax-hint-box');
  if (!hintBox) return;
  const taxIdVal = (currentInvoice.sender.taxId || '').trim();
  const hasTaxOnItems = currentInvoice.items.some(i => (parseFloat(i.taxRate) || 0) > 0);

  if (!taxIdVal) {
    if (hasTaxOnItems) {
      hintBox.innerHTML = `
        <div style="font-size:11px; color:#b45309; background:#fffbeb; padding:6px 10px; border-radius:6px; border:1px solid #fef3c7; display:flex; align-items:center; justify-content:space-between; gap:8px;">
          <span>ℹ️ No Tax ID specified. Not tax-registered?</span>
          <button type="button" class="btn btn-secondary btn-sm" id="btn-quick-zero-tax" style="padding:2px 8px; font-size:10.5px; white-space:nowrap;">
            Set 0% Tax (No Tax)
          </button>
        </div>
      `;
      const btn = document.getElementById('btn-quick-zero-tax');
      if (btn) {
        btn.addEventListener('click', () => {
          currentInvoice.items.forEach(item => { item.taxRate = 0; });
          currentInvoice.taxes = [];
          renderLineItemsEditor();
          renderTaxesEditor();
          updateSheetView();
          updateSenderTaxHint();
          triggerAutoSave();
        });
      }
    } else {
      hintBox.innerHTML = `
        <span style="font-size:10.5px; color:#64748b;">
          Unregistered / tax-exempt business: tax row and badges are omitted from invoice.
        </span>
      `;
    }
  } else {
    const formatted = formatTaxId(taxIdVal);
    hintBox.innerHTML = `
      <div style="font-size:10.5px; color:#0369a1; display:flex; align-items:center; justify-content:space-between; gap:6px;">
        <span>Registered: <strong>${appEscapeHtml(formatted)}</strong></span>
        ${!hasTaxOnItems ? `
          <button type="button" class="btn btn-secondary btn-sm" id="btn-quick-standard-tax" style="padding:1px 6px; font-size:10.5px;">
            Apply 18% GST
          </button>
        ` : ''}
      </div>
    `;
    const btnStd = document.getElementById('btn-quick-standard-tax');
    if (btnStd) {
      btnStd.addEventListener('click', () => {
        currentInvoice.items.forEach(item => { item.taxRate = 18; });
        currentInvoice.taxes = [
          { id: 'tax_1', name: 'CGST', ratio: 50 },
          { id: 'tax_2', name: 'SGST', ratio: 50 }
        ];
        renderLineItemsEditor();
        renderTaxesEditor();
        updateSheetView();
        updateSenderTaxHint();
        triggerAutoSave();
      });
    }
  }
}

// ============================================================================
// 7. TAX CALCULATOR & SHEET UPDATE ENGINE
// ============================================================================
function updateSheetView() {
  normalizeInvoice(currentInvoice);
  const currency = currentInvoice.meta.currency || '$';
  const numberFormat = currentInvoice.meta.numberFormat || 'international';
  const docType = currentInvoice.meta.docType || 'invoice';
  const cfg = APP_DOC_TYPES[docType] || APP_DOC_TYPES.invoice;

  // 1. Update Sheet Metadata & Dynamic Labels
  document.getElementById('sheet-inv-title').textContent = currentInvoice.meta.title || cfg.title;
  const numLabel = document.getElementById('sheet-num-label');
  if (numLabel) numLabel.textContent = cfg.numLabel;
  document.getElementById('sheet-inv-num').textContent = currentInvoice.meta.number || '';
  
  const dateLabel = document.getElementById('sheet-date-label');
  if (dateLabel) dateLabel.textContent = 'Date:';
  document.getElementById('sheet-inv-date').textContent = currentInvoice.meta.date || '';

  const dueLabel = document.getElementById('sheet-due-label');
  if (dueLabel) dueLabel.textContent = cfg.dueLabel;
  document.getElementById('sheet-inv-due').textContent = currentInvoice.meta.dueDate || '';

  const poVal = currentInvoice.meta.po || '';
  const poLabel = document.getElementById('sheet-po-label');
  const poDisplay = document.getElementById('sheet-po-val');
  if (poVal.trim()) {
    poLabel.style.display = 'inline';
    poDisplay.style.display = 'inline';
    poDisplay.textContent = poVal;
  } else {
    poLabel.style.display = 'none';
    poDisplay.style.display = 'none';
  }

  // Status Badge with dynamic classes and label
  const statusBadge = document.getElementById('sheet-status-badge');
  statusBadge.className = 'sheet-invoice-badge';
  const currentStatus = currentInvoice.meta.status || cfg.defaultStatus;
  const statusObj = cfg.statuses.find(s => s.id === currentStatus);
  const statusText = statusObj ? statusObj.label.toUpperCase() : currentStatus.toUpperCase();

  const statusClassMap = {
    paid: 'badge-paid',
    pending: 'badge-pending',
    draft: 'badge-draft',
    sent: 'badge-sent',
    accepted: 'badge-accepted',
    declined: 'badge-declined',
    expired: 'badge-expired'
  };
  statusBadge.classList.add(statusClassMap[currentStatus] || 'badge-pending');
  statusBadge.textContent = statusText;

  // 2. Sender and Client Headings & Info
  const fromHeading = document.getElementById('sheet-from-heading');
  const toHeading = document.getElementById('sheet-to-heading');
  if (fromHeading) fromHeading.textContent = cfg.fromLabel;
  if (toHeading) toHeading.textContent = cfg.toLabel;

  document.getElementById('sheet-sender-name').textContent = currentInvoice.sender.name || 'Your Company';
  const senderMetaParts = [];
  if (currentInvoice.sender.email || currentInvoice.sender.phone) {
    senderMetaParts.push([currentInvoice.sender.email, currentInvoice.sender.phone].filter(Boolean).join(' | '));
  }
  if (currentInvoice.sender.address) senderMetaParts.push(currentInvoice.sender.address);
  if (currentInvoice.sender.taxId && currentInvoice.sender.taxId.trim()) {
    senderMetaParts.push(formatTaxId(currentInvoice.sender.taxId, 'Tax ID'));
  }
  const senderMetaEl = document.getElementById('sheet-sender-meta');
  if (senderMetaParts.length > 0) {
    senderMetaEl.textContent = senderMetaParts.join('\n');
    senderMetaEl.style.display = 'block';
  } else {
    senderMetaEl.textContent = '';
    senderMetaEl.style.display = 'none';
  }

  document.getElementById('sheet-client-name').textContent = currentInvoice.client.name || 'Client Name';
  const clientMetaParts = [];
  if (currentInvoice.client.email || currentInvoice.client.phone) {
    clientMetaParts.push([currentInvoice.client.email, currentInvoice.client.phone].filter(Boolean).join(' | '));
  }
  if (currentInvoice.client.address) clientMetaParts.push(currentInvoice.client.address);
  if (currentInvoice.client.taxId && currentInvoice.client.taxId.trim()) {
    clientMetaParts.push(formatTaxId(currentInvoice.client.taxId, 'Tax/VAT ID'));
  }
  const clientMetaEl = document.getElementById('sheet-client-meta');
  if (clientMetaParts.length > 0) {
    clientMetaEl.textContent = clientMetaParts.join('\n');
    clientMetaEl.style.display = 'block';
  } else {
    clientMetaEl.textContent = '';
    clientMetaEl.style.display = 'none';
  }

  // Headings for Remittance / Payment & Notes
  const paymentHeading = document.getElementById('sheet-payment-heading');
  const notesHeading = document.getElementById('sheet-notes-heading');
  if (paymentHeading) paymentHeading.textContent = cfg.paymentHeading;
  if (notesHeading) notesHeading.textContent = cfg.notesHeading;

  // Subtotal & Total Labels
  const subtotalLabel = document.getElementById('sheet-subtotal-label');
  const totalLabel = document.getElementById('sheet-total-label');
  if (subtotalLabel) subtotalLabel.textContent = cfg.subtotalLabel;
  if (totalLabel) totalLabel.textContent = cfg.totalLabel;

  // 3. Line Items Calculations & Table Rendering (one shared calculation)
  const totals = calculateTotals(currentInvoice);
  const subtotal = totals.subtotal;
  const totalTaxSum = totals.taxTotal;
  const rateBreakdown = totals.rateBreakdown || [];

  const tbody = document.getElementById('sheet-items-tbody');
  tbody.innerHTML = (totals.lines || []).map(line => {
    const qty = line.qty;
    const rate = line.rate;
    const discountPct = line.discount;
    const taxableLine = line.taxable;
    const taxRate = line.taxRate;

    const isUnregistered = !currentInvoice.sender.taxId || !currentInvoice.sender.taxId.trim();
    const discDisplay = discountPct > 0 ? `${discountPct}%` : '—';
    const taxDisplay = taxRate > 0
      ? `<span class="item-tax-badge">${taxRate}%</span>`
      : (isUnregistered
          ? `<span style="color:#94a3b8;">—</span>`
          : `<span class="item-tax-badge" style="background:#f1f5f9; color:#94a3b8;">0% Exempt</span>`);

    const hsnMarkup = line.hsn && line.hsn.trim()
      ? `<div class="item-hsn-tag">HSN/SAC: ${appEscapeHtml(line.hsn.trim())}</div>`
      : '';

    return `
      <tr>
        <td>
          <div class="item-desc-bold">${appEscapeHtml(line.description || 'Item Description')}</div>
          ${hsnMarkup}
        </td>
        <td class="text-center">${qty}</td>
        <td class="text-right">${formatMoney(rate, currency, numberFormat)}</td>
        <td class="text-right">${discDisplay}</td>
        <td class="text-right">${taxDisplay}</td>
        <td class="text-right font-semibold">${formatMoney(taxableLine, currency, numberFormat)}</td>
      </tr>
    `;
  }).join('');

  document.getElementById('sheet-subtotal-val').textContent = formatMoney(subtotal, currency, numberFormat);

  // 4. Multi-Leg Taxes Calculation & Split
  const taxesListContainer = document.getElementById('sheet-taxes-list');
  const activeTaxLegs = currentInvoice.taxes || [];

  if (activeTaxLegs.length === 0 || totalTaxSum === 0) {
    if (totalTaxSum === 0 && subtotal > 0 && currentInvoice.sender.taxId && currentInvoice.sender.taxId.trim()) {
      taxesListContainer.innerHTML = `
        <div class="totals-row tax-leg">
          <span>Taxes</span>
          <span>${formatMoney(0, currency, numberFormat)} (0% Exempt)</span>
        </div>
      `;
    } else {
      taxesListContainer.innerHTML = '';
    }
  } else {
    const renderedTaxLegs = (totals.taxLegs || []).map(leg => {
      const legRatio = clampNum(leg.ratio, 0, 100, 0);
      return `
        <div class="totals-row tax-leg">
          <span>${appEscapeHtml(leg.name || 'Tax')} <span class="tax-tag">${legRatio}% split</span></span>
          <span>${formatMoney(leg.amount, currency, numberFormat)}</span>
        </div>
      `;
    });

    // Multi-rate summary banner if there are multiple rates
    const distinctRates = rateBreakdown
      .map(entry => Number(entry.rate))
      .sort((a, b) => b - a);
    let multiRateSummaryHtml = '';
    if (distinctRates.length > 1) {
      const breakdownText = distinctRates.map(rate => {
        const data = rateBreakdown.find(entry => Number(entry.rate) === rate) || { taxable: 0, tax: 0 };
        return `${rate}% on ${formatMoney(data.taxable, currency, numberFormat)}: ${formatMoney(data.tax, currency, numberFormat)}`;
      }).join(' • ');
      multiRateSummaryHtml = `
        <div style="font-size:10.5px; color:#64748b; padding:4px 0; border-bottom:1px dashed #e2e8f0; margin-bottom:4px; text-align:right;">
          Rate Breakdown: ${breakdownText}
        </div>
      `;
    }

    taxesListContainer.innerHTML = multiRateSummaryHtml + renderedTaxLegs.join('');
  }

  // 5. Total Due
  const grandTotal = totals.total;
  document.getElementById('sheet-total-val').textContent = formatMoney(grandTotal, currency, numberFormat);

  // Optional Amount in Words Block
  const wordsContainer = document.getElementById('sheet-words-container');
  const wordsVal = document.getElementById('sheet-words-val');
  if (wordsContainer && wordsVal) {
    if (currentInvoice.meta.showAmountInWords && grandTotal > 0) {
      wordsVal.textContent = amountToWords(grandTotal, currency, numberFormat);
      wordsContainer.style.display = 'block';
    } else {
      wordsContainer.style.display = 'none';
      wordsVal.textContent = '';
    }
  }

  // 6. Payment Info & Notes (Gracefully omit when not provided)
  const paymentContainer = document.getElementById('sheet-payment-container');
  const paymentBox = document.getElementById('sheet-payment-box');
  const notesContainer = document.getElementById('sheet-notes-container');
  const notesBox = document.getElementById('sheet-notes-box');
  const bottomSection = document.querySelector('.sheet-bottom-section');
  const paymentNotesArea = document.getElementById('sheet-payment-notes-area');

  const hasPayment = Boolean(currentInvoice.payment && currentInvoice.payment.trim());
  const hasNotes = Boolean(currentInvoice.notes && currentInvoice.notes.trim());
  const hasSignature = Boolean(docType !== 'invoice' && currentInvoice.meta.showSignature);

  if (paymentContainer && paymentBox) {
    if (hasPayment) {
      paymentBox.textContent = currentInvoice.payment.trim();
      paymentContainer.style.display = 'block';
    } else {
      paymentBox.textContent = '';
      paymentContainer.style.display = 'none';
    }
  }

  if (notesContainer && notesBox) {
    if (hasNotes) {
      notesBox.textContent = currentInvoice.notes.trim();
      notesContainer.style.display = 'block';
    } else {
      notesBox.textContent = '';
      notesContainer.style.display = 'none';
    }
  }

  if (paymentNotesArea && bottomSection) {
    const hasAnyLeft = hasPayment || hasNotes || hasSignature;
    if (hasAnyLeft) {
      paymentNotesArea.style.display = 'flex';
      bottomSection.classList.remove('no-notes-payment');
    } else {
      paymentNotesArea.style.display = 'none';
      bottomSection.classList.add('no-notes-payment');
    }
  }

  // 7. Client Acceptance Signature Block (Quotes & Estimates)
  const sigBlock = document.getElementById('sheet-signature-block');
  if (sigBlock) {
    sigBlock.style.display = (docType !== 'invoice' && currentInvoice.meta.showSignature) ? 'block' : 'none';
    const sigHeading = document.getElementById('sheet-sig-heading');
    if (sigHeading) {
      sigHeading.textContent = `${cfg.name} Acceptance & Approval`;
    }
  }

  // 8. Convert to Invoice Button Visibility
  const convertBtn = document.getElementById('btn-convert-quote');
  if (convertBtn) {
    convertBtn.style.display = (docType === 'quotation' || docType === 'estimate' || docType === 'proforma') ? 'inline-flex' : 'none';
  }

  updateLogoDisplay();
  updateDocumentPaginationLive();
}

function updateLogoDisplay() {
  const container = document.getElementById('sheet-logo-wrapper');
  const thumb = document.getElementById('logo-preview-thumb');
  const removeBtn = document.getElementById('btn-remove-logo');
  const headerBlock = document.getElementById('sheet-header-block');
  const logo = currentInvoice.logo;

  // Header placement class
  const layout = logo.layout || 'left';
  headerBlock.classList.remove('header-layout-left', 'header-layout-center', 'header-layout-right');
  headerBlock.classList.add(`header-layout-${layout}`);

  if (logo && logo.dataUri) {
    // Validate stored logo URI (protects against crafted backup imports injecting HTML/JS).
    if (!isValidLogoDataUri(logo.dataUri)) {
      logo.dataUri = null;
      updateLogoDisplay();
      return;
    }
    const width = clampNum(logo.width, 60, 450, 180);
    container.textContent = '';
    const img = document.createElement('img');
    img.src = logo.dataUri;
    img.className = 'sheet-logo-img';
    img.alt = 'Logo';
    img.style.width = width + 'px';
    img.style.maxWidth = width + 'px';
    container.appendChild(img);
    thumb.textContent = '';
    const thumbImg = document.createElement('img');
    thumbImg.src = logo.dataUri;
    thumbImg.alt = 'Logo Preview';
    thumb.appendChild(thumbImg);
    removeBtn.style.display = 'inline-flex';
  } else {
    // If no logo, show company text header
    container.innerHTML = `
      <div>
        <div class="sheet-company-title">${appEscapeHtml(currentInvoice.sender.name || 'Company Name')}</div>
        <div class="sheet-company-meta">${appEscapeHtml(currentInvoice.sender.address || '')}</div>
      </div>
    `;
    thumb.innerHTML = `<span style="font-size:11px; color:#94a3b8;">No Logo</span>`;
    removeBtn.style.display = 'none';
  }

  // Logo Alignment inside its container
  const align = logo.align || 'left';
  if (align === 'center') {
    container.style.justifyContent = 'center';
  } else if (align === 'right') {
    container.style.justifyContent = 'flex-end';
  } else {
    container.style.justifyContent = 'flex-start';
  }
}

// ============================================================================
// 8. LOGO & BRAND LOCKUP STUDIO IMPLEMENTATION
// ============================================================================
let activeSelectedIconId = 'terminal';

function setupLogoStudioTabs() {
  const tabs = document.querySelectorAll('.modal-tab-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const targetPane = document.getElementById(tab.dataset.tab);
      if (targetPane) targetPane.classList.add('active');
    });
  });

  // TAB 1: File Upload
  const dropzone = document.getElementById('dropzone-logo');
  const fileInput = document.getElementById('file-logo-input');
  dropzone.addEventListener('click', () => fileInput.click());

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = '#2563eb';
    dropzone.style.background = '#eff6ff';
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.style.borderColor = '#cbd5e1';
    dropzone.style.background = '#f8fafc';
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = '#cbd5e1';
    dropzone.style.background = '#f8fafc';
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleImageUpload(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleImageUpload(e.target.files[0]);
    }
    e.target.value = '';
  });

  const ALLOWED_LOGO_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
  let stagedUploadedUri = null;
  function handleImageUpload(file) {
    if (!file || !file.type || !file.type.startsWith('image/') || !ALLOWED_LOGO_MIME.includes(file.type)) {
      alert('Please upload a valid image file (.jpg, .png, .webp, .svg)');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert('Logo file is too large. Maximum allowed size is 10MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      if (file.type === 'image/svg+xml') {
        // Reject SVG payloads containing scripts / event handlers / foreign objects.
        const svgText = String(event.target.result || '');
        let decoded = '';
        try {
          const base64Part = svgText.split(',')[1] || '';
          decoded = atob(base64Part.slice(0, 20000));
        } catch (e) { decoded = svgText.slice(0, 20000); }
        if (/<script|onload\s*=|onerror\s*=|onclick\s*=|<foreignobject/i.test(svgText) || /<script|onload\s*=|onerror\s*=|<foreignobject/i.test(decoded)) {
          alert('This SVG contains scripts or active content and was rejected for security. Please use a raster logo or a clean vector SVG.');
          return;
        }
        stagedUploadedUri = event.target.result;
        showUploadedPreview(stagedUploadedUri);
      } else {
        const img = new Image();
        img.onload = () => {
          const maxDim = 800;
          let w = img.width;
          let h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          stagedUploadedUri = canvas.toDataURL('image/png', 0.92);
          showUploadedPreview(stagedUploadedUri);
        };
        img.onerror = () => {
          alert('Could not read this image file. Please try a different JPG/PNG/WebP file.');
        };
        img.src = event.target.result;
      }
    };
    reader.onerror = () => {
      alert('Could not read this file. Please try again.');
    };
    reader.readAsDataURL(file);
  }

  function showUploadedPreview(uri) {
    document.getElementById('upload-preview-area').style.display = 'block';
    document.getElementById('upload-preview-img').src = uri;
  }

  document.getElementById('btn-apply-uploaded-logo').addEventListener('click', () => {
    if (stagedUploadedUri) {
      currentInvoice.logo.dataUri = stagedUploadedUri;
      updateLogoDisplay();
      triggerAutoSave();
      closeModal('modal-logo-studio');
    }
  });

  // TAB 2: Monogram & Brand Lockup Generator
  const initialsInput = document.getElementById('monogram-initials');
  const shapeSelect = document.getElementById('monogram-shape');
  const styleSelect = document.getElementById('monogram-style');
  const wordmarkInput = document.getElementById('monogram-wordmark');
  const taglineInput = document.getElementById('monogram-tagline');
  const underlineSelect = document.getElementById('monogram-underline');
  const underlineSpanSelect = document.getElementById('monogram-underline-span');
  const underlinePosSelect = document.getElementById('monogram-underline-pos');
  const underlineSlider = document.getElementById('monogram-underline-slider');
  const underlineValLabel = document.getElementById('monogram-underline-val');
  const layoutSelect = document.getElementById('monogram-layout');
  const bgInput = document.getElementById('monogram-bg-color');
  const textInput = document.getElementById('monogram-text-color');
  const wordmarkColorInput = document.getElementById('monogram-wordmark-color');
  const monoPreview = document.getElementById('monogram-preview-img');

  function updateMonogramLockupLive() {
    const customLineW = underlineSlider ? parseInt(underlineSlider.value, 10) : 0;
    if (underlineValLabel) {
      underlineValLabel.textContent = customLineW > 0 ? `${customLineW}px` : 'Auto (Fit Text)';
    }

    const uri = generateBrandLockupSVG({
      symbolType: 'monogram',
      initials: initialsInput ? initialsInput.value || 'AD' : 'AD',
      shape: shapeSelect ? shapeSelect.value : 'squircle',
      emblemStyle: styleSelect ? styleSelect.value : 'solid',
      markColor: textInput ? textInput.value || '#ffffff' : '#ffffff',
      bgColor: bgInput ? bgInput.value || '#2563eb' : '#2563eb',
      companyName: wordmarkInput ? wordmarkInput.value || currentInvoice.sender.name || 'Apex Studio' : 'Apex Studio',
      tagline: taglineInput ? taglineInput.value : '',
      underlineStyle: underlineSelect ? underlineSelect.value : 'solid',
      underlineSpan: underlineSpanSelect ? underlineSpanSelect.value : 'auto',
      underlineWidth: customLineW,
      underlinePosition: underlinePosSelect ? underlinePosSelect.value : 'bottom',
      layout: layoutSelect ? layoutSelect.value : 'horizontal',
      textColor: wordmarkColorInput ? wordmarkColorInput.value || '#0f172a' : '#0f172a',
      accentColor: currentInvoice.accentColor || '#2563eb'
    });
    if (monoPreview) monoPreview.src = uri;
    return uri;
  }

  if (underlineSpanSelect) {
    underlineSpanSelect.addEventListener('change', () => {
      if (underlineSlider) underlineSlider.value = 0;
      updateMonogramLockupLive();
    });
  }

  if (underlineSlider) {
    underlineSlider.addEventListener('input', () => {
      updateMonogramLockupLive();
    });
  }

  [initialsInput, shapeSelect, styleSelect, wordmarkInput, taglineInput, underlineSelect, underlinePosSelect, layoutSelect, bgInput, textInput, wordmarkColorInput].forEach(elem => {
    if (elem) elem.addEventListener(elem.tagName === 'SELECT' ? 'change' : 'input', updateMonogramLockupLive);
  });
  updateMonogramLockupLive();

  document.getElementById('btn-apply-monogram').addEventListener('click', () => {
    const uri = updateMonogramLockupLive();
    currentInvoice.logo.dataUri = uri;
    updateLogoDisplay();
    triggerAutoSave();
    closeModal('modal-logo-studio');
  });

  // TAB 3: Icon Lockup Event Listeners
  const iconWordmark = document.getElementById('icon-wordmark');
  const iconTagline = document.getElementById('icon-tagline');
  const iconUnderline = document.getElementById('icon-underline');
  const iconUnderlineSpan = document.getElementById('icon-underline-span');
  const iconUnderlinePos = document.getElementById('icon-underline-pos');
  const iconUnderlineSlider = document.getElementById('icon-underline-slider');
  const iconShape = document.getElementById('icon-shape');

  if (iconUnderlineSpan) {
    iconUnderlineSpan.addEventListener('change', () => {
      if (iconUnderlineSlider) iconUnderlineSlider.value = 0;
      updateIconLockupLive();
    });
  }

  if (iconUnderlineSlider) {
    iconUnderlineSlider.addEventListener('input', () => {
      updateIconLockupLive();
    });
  }

  [iconWordmark, iconTagline, iconUnderline, iconUnderlineSpan, iconUnderlinePos, iconShape].forEach(el => {
    if (el) el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', updateIconLockupLive);
  });

  document.getElementById('btn-apply-selected-icon').addEventListener('click', () => {
    const uri = updateIconLockupLive();
    currentInvoice.logo.dataUri = uri;
    updateLogoDisplay();
    triggerAutoSave();
    closeModal('modal-logo-studio');
  });

  // TAB 4: AI Prompt Generator & Free 1-Click Generator
  const aiCompanyName = document.getElementById('ai-company-name');
  const aiIndustry = document.getElementById('ai-industry');
  const aiStyle = document.getElementById('ai-style-select');
  const aiColor = document.getElementById('ai-color-preference');
  const aiPromptOutput = document.getElementById('ai-prompt-output');

  function updateAIPrompt() {
    const name = aiCompanyName.value.trim() || 'My Business';
    const ind = aiIndustry.value.trim() || 'Professional Services';
    const style = aiStyle.value;
    const color = aiColor.value.trim() || 'accent color';

    const promptText = `Professional vector brand logo for "${name}", industry: ${ind}, style: ${style}, color palette: ${color}, isolated on clean solid white background, high aesthetic, SVG flat icon badge, minimalist, no photorealism, no 3d mockup, vector symbol`;
    aiPromptOutput.textContent = promptText;
  }

  aiCompanyName.addEventListener('input', updateAIPrompt);
  aiIndustry.addEventListener('input', updateAIPrompt);
  aiStyle.addEventListener('change', updateAIPrompt);
  aiColor.addEventListener('input', updateAIPrompt);
  updateAIPrompt();

  // Copy AI Prompt (with file:// + non-secure fallback)
  document.getElementById('btn-copy-ai-prompt').addEventListener('click', async () => {
    const btn = document.getElementById('btn-copy-ai-prompt');
    const text = aiPromptOutput.textContent;
    let copied = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        copied = true;
      } else {
        throw new Error('clipboard unavailable');
      }
    } catch (e) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        copied = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch (e2) { copied = false; }
    }
    btn.textContent = copied ? 'Copied!' : 'Copy failed — select manually';
    setTimeout(() => { btn.textContent = 'Copy Prompt'; }, 2000);
  });

  // Free 1-Click AI Generation via Pollinations.ai
  let stagedAILogoUri = null;
  document.getElementById('btn-generate-ai-logo').addEventListener('click', () => {
    const prompt = aiPromptOutput.textContent;
    const statusText = document.getElementById('ai-status-text');
    const aiImg = document.getElementById('ai-generated-img');
    const applyBtn = document.getElementById('btn-apply-ai-logo');

    statusText.style.display = 'block';
    statusText.textContent = 'Generating AI logo... (takes 3-5 seconds)';
    aiImg.style.display = 'none';
    applyBtn.style.display = 'none';

    const seed = Math.floor(Math.random() * 999999);
    const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=400&height=400&nologo=true&seed=${seed}`;

    const testImg = new Image();
    testImg.crossOrigin = 'anonymous';
    testImg.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 400;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(testImg, 0, 0, 400, 400);
      try {
        stagedAILogoUri = canvas.toDataURL('image/png');
        aiImg.src = stagedAILogoUri;
        aiImg.style.display = 'block';
        statusText.style.display = 'none';
        applyBtn.style.display = 'block';
      } catch (err) {
        console.warn('CORS or canvas error — remote AI logo not applied to keep offline/print reliable:', err);
        statusText.textContent = 'Could not embed the AI image (CORS blocked). Please retry, or copy the prompt above into ChatGPT/Midjourney and upload the result via the Upload tab.';
        stagedAILogoUri = null;
        aiImg.style.display = 'none';
        applyBtn.style.display = 'none';
      }
    };
    testImg.onerror = () => {
      statusText.textContent = 'Free AI service busy. You can copy the optimized prompt above and generate via ChatGPT or Midjourney!';
    };
    testImg.src = pollinationsUrl;
  });

  document.getElementById('btn-apply-ai-logo').addEventListener('click', () => {
    if (stagedAILogoUri && isValidLogoDataUri(stagedAILogoUri)) {
      currentInvoice.logo.dataUri = stagedAILogoUri;
      updateLogoDisplay();
      triggerAutoSave();
      closeModal('modal-logo-studio');
    } else if (stagedAILogoUri) {
      alert('AI logo is not embedded yet (remote URL). Please wait for generation to finish or upload the image file instead.');
    }
  });
}

function updateIconLockupLive() {
  const iconWordmark = document.getElementById('icon-wordmark');
  const iconTagline = document.getElementById('icon-tagline');
  const iconUnderline = document.getElementById('icon-underline');
  const iconUnderlineSpan = document.getElementById('icon-underline-span');
  const iconUnderlinePos = document.getElementById('icon-underline-pos');
  const iconUnderlineSlider = document.getElementById('icon-underline-slider');
  const iconUnderlineValLabel = document.getElementById('icon-underline-val');
  const iconShape = document.getElementById('icon-shape');
  const iconPreview = document.getElementById('icon-preview-img');

  const shapeVal = iconShape ? iconShape.value : 'none';
  const customLineW = iconUnderlineSlider ? parseInt(iconUnderlineSlider.value, 10) : 0;
  if (iconUnderlineValLabel) {
    iconUnderlineValLabel.textContent = customLineW > 0 ? `${customLineW}px` : 'Auto (Fit Text)';
  }

  const uri = generateBrandLockupSVG({
    symbolType: 'icon',
    iconId: activeSelectedIconId || 'terminal',
    shape: shapeVal,
    markColor: currentInvoice.accentColor || '#2563eb',
    bgColor: shapeVal !== 'none' ? '#eff6ff' : 'transparent',
    companyName: (iconWordmark && iconWordmark.value) ? iconWordmark.value : currentInvoice.sender.name || 'Apex Studio',
    tagline: iconTagline ? iconTagline.value : '',
    underlineStyle: iconUnderline ? iconUnderline.value : 'solid',
    underlineSpan: iconUnderlineSpan ? iconUnderlineSpan.value : 'auto',
    underlineWidth: customLineW,
    underlinePosition: iconUnderlinePos ? iconUnderlinePos.value : 'bottom',
    layout: 'horizontal',
    textColor: '#0f172a',
    accentColor: currentInvoice.accentColor || '#2563eb'
  });
  if (iconPreview) iconPreview.src = uri;
  return uri;
}

function renderIconsLibrary() {
  const chipsContainer = document.getElementById('icons-category-chips');
  const gridContainer = document.getElementById('icons-grid-picker');
  const selectedLabel = document.getElementById('selected-icon-label');

  let activeCategory = 'all';

  // Render Category Chips
  chipsContainer.innerHTML = `
    <button class="category-chip active" data-cat="all">All Icons (40+)</button>
    ${ICON_CATEGORIES.map(c => `
      <button class="category-chip" data-cat="${c.id}">${c.label}</button>
    `).join('')}
  `;

  function renderGrid() {
    const filtered = activeCategory === 'all' 
      ? ICONS 
      : ICONS.filter(i => i.category === activeCategory);

    gridContainer.innerHTML = filtered.map(icon => `
      <div class="icon-pick-card ${activeSelectedIconId === icon.id ? 'active' : ''}" data-id="${icon.id}" title="${icon.name}">
        ${icon.svg}
        <span style="font-size:10px; color:#64748b; margin-top:4px; text-align:center; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:100%;">${icon.name}</span>
      </div>
    `).join('');

    gridContainer.querySelectorAll('.icon-pick-card').forEach(card => {
      card.addEventListener('click', () => {
        gridContainer.querySelectorAll('.icon-pick-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        activeSelectedIconId = card.dataset.id;
        const iconObj = ICONS.find(i => i.id === activeSelectedIconId);
        selectedLabel.textContent = `Selected: ${iconObj.name}`;
        updateIconLockupLive();
      });
    });
  }

  chipsContainer.querySelectorAll('.category-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      chipsContainer.querySelectorAll('.category-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      activeCategory = chip.dataset.cat;
      renderGrid();
    });
  });

  renderGrid();
  updateIconLockupLive();
}

// ============================================================================
// 9. EVENT LISTENERS ATTACHMENT
// ============================================================================
function attachFormListeners() {
  // Font Selector
  document.getElementById('font-select').addEventListener('change', (e) => {
    currentInvoice.font = e.target.value;
    document.documentElement.style.setProperty('--invoice-font', currentInvoice.font);
    triggerAutoSave();
  });

  // Accent Color Picker
  document.getElementById('accent-color-picker').addEventListener('input', (e) => {
    currentInvoice.accentColor = e.target.value;
    document.getElementById('accent-color-hex').textContent = e.target.value;
    document.documentElement.style.setProperty('--accent-color', e.target.value);
    triggerAutoSave();
  });

  // Logo Size Slider
  document.getElementById('logo-width-slider').addEventListener('input', (e) => {
    currentInvoice.logo.width = parseInt(e.target.value, 10);
    document.getElementById('logo-width-val').textContent = e.target.value + 'px';
    updateLogoDisplay();
    triggerAutoSave();
  });

  // Logo Alignments inside container
  ['left', 'center', 'right'].forEach(align => {
    const btn = document.getElementById(`btn-logo-${align}`);
    if (btn) {
      btn.addEventListener('click', () => {
        currentInvoice.logo.align = align;
        updateLogoAlignmentButtons(align);
        updateLogoDisplay();
        triggerAutoSave();
      });
    }
  });

  // Header Placement Variations (Left Logo, Centered Brand, Right Logo)
  ['left', 'center', 'right'].forEach(layout => {
    const btn = document.getElementById(`btn-layout-${layout}`);
    if (btn) {
      btn.addEventListener('click', () => {
        currentInvoice.logo.layout = layout;
        updateHeaderLayoutButtons(layout);
        updateLogoDisplay();
        triggerAutoSave();
      });
    }
  });

  // Remove Logo
  document.getElementById('btn-remove-logo').addEventListener('click', () => {
    currentInvoice.logo.dataUri = null;
    updateLogoDisplay();
    triggerAutoSave();
  });

  // Section 1 Document Type Selection Cards
  document.querySelectorAll('#doc-type-cards-grid .doc-type-card').forEach(card => {
    card.addEventListener('click', async (e) => {
      e.preventDefault();
      const type = card.dataset.type;
      if (type && type !== currentInvoice.meta.docType) {
        await switchDocumentType(type);
      }
    });
  });

  // Section 1 Quick Convert Button in Hint Banner
  const btnQuickConvert = document.getElementById('btn-quick-convert-banner');
  if (btnQuickConvert) {
    btnQuickConvert.addEventListener('click', async (e) => {
      e.preventDefault();
      await convertToInvoice();
    });
  }

  // (Removed: legacy #doc-type-switcher listener — Section 1 now uses
  // #doc-type-cards-grid cards. Kept as no-op guard for forward-compat.)
  if (document.querySelector('#doc-type-switcher')) {
    document.querySelectorAll('#doc-type-switcher .btn-doc-type').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const type = btn.dataset.type;
        if (type && type !== currentInvoice.meta.docType) {
          await switchDocumentType(type);
        }
      });
    });
  }

  // Convert Quotation / Estimate to Invoice Button
  const btnConvert = document.getElementById('btn-convert-quote');
  if (btnConvert) {
    btnConvert.addEventListener('click', async (e) => {
      e.preventDefault();
      const curDoc = (APP_DOC_TYPES[currentInvoice.meta.docType] || APP_DOC_TYPES.quotation).name;
      if (confirm(`Convert this ${curDoc} into a finalized Invoice? All line items, rates, taxes, and client details will be preserved.`)) {
        await convertToInvoice();
      }
    });
  }

  // Quote Acceptance Signature Checkbox
  const checkSig = document.getElementById('check-quote-signature');
  if (checkSig) {
    checkSig.addEventListener('change', (e) => {
      currentInvoice.meta.showSignature = e.target.checked;
      updateSheetView();
      triggerAutoSave();
    });
  }

  // Invoice Metadata Fields
  bindTextInput('input-inv-title', val => currentInvoice.meta.title = val);
  bindTextInput('input-inv-number', val => {
    currentInvoice.meta.number = val;
    // A hand-edited number is owned by the user: the engine never regenerates
    // or advances it (it is still uniqueness-checked at save).
    currentInvoice.meta.numberAuto = false;
  });
  bindTextInput('input-inv-date', val => {
    currentInvoice.meta.date = val;
    // An engine-issued draft number follows the issue date ({FY}/{YYYY}/{MM}
    // tokens and period keys). Persisted records and hand-edited numbers never
    // move (H1). A rolled config is passed so the regenerated number uses the
    // current period's counter, never a stale one.
    refreshAutoNumberForDraft(rolloverNumberingConfig(currentNumberingConfig));
  });
  bindTextInput('input-inv-due', val => currentInvoice.meta.dueDate = val);
  bindTextInput('input-inv-po', val => currentInvoice.meta.po = val);

  const selectCurrency = document.getElementById('select-inv-currency');
  const customCurrWrapper = document.getElementById('custom-currency-wrapper');
  const inputCustomCurr = document.getElementById('input-custom-currency');

  if (selectCurrency) {
    selectCurrency.addEventListener('change', (e) => {
      const newCurr = e.target.value;
      const prevCurr = currentInvoice.meta.currency;

      if (newCurr === 'custom') {
        if (customCurrWrapper) customCurrWrapper.style.display = 'block';
        if (inputCustomCurr) {
          inputCustomCurr.focus();
          const customVal = inputCustomCurr.value.trim() || 'BHD';
          currentInvoice.meta.currency = customVal;
        }
      } else {
        if (customCurrWrapper) customCurrWrapper.style.display = 'none';
        currentInvoice.meta.currency = newCurr;
        const numFmtSelect = document.getElementById('select-inv-number-format');
        // Only auto-suggest Indian format when switching TO ₹; never clobber an
        // explicit user choice when switching between other currencies.
        if (newCurr === '₹' && prevCurr !== '₹') {
          currentInvoice.meta.numberFormat = 'indian';
          if (numFmtSelect) numFmtSelect.value = 'indian';
        }
      }
      updateSheetView();
      renderLineItemsEditor();
      // The saved-item picker is currency-aware: re-filter its groups.
      refreshCatalogPicker();
      triggerAutoSave();
    });
  }

  if (inputCustomCurr) {
    inputCustomCurr.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      currentInvoice.meta.currency = val || 'CUR';
      updateSheetView();
      renderLineItemsEditor();
      refreshCatalogPicker();
      triggerAutoSave();
    });
  }

  const selectNumFormat = document.getElementById('select-inv-number-format');
  if (selectNumFormat) {
    selectNumFormat.addEventListener('change', (e) => {
      currentInvoice.meta.numberFormat = e.target.value;
      updateSheetView();
      renderLineItemsEditor();
      triggerAutoSave();
    });
  }

  const checkWords = document.getElementById('check-amount-in-words');
  if (checkWords) {
    checkWords.addEventListener('change', (e) => {
      currentInvoice.meta.showAmountInWords = e.target.checked;
      updateSheetView();
      triggerAutoSave();
    });
  }

  bindTextInput('select-inv-status', val => currentInvoice.meta.status = val);

  // Sender Fields
  bindTextInput('input-sender-name', val => {
    currentInvoice.sender.name = val;
    // Hand-editing the sender detaches the stored company link so Reports
    // never attribute a manually rebranded document to the old company.
    detachCompanyLink();
    // Keep Studio wordmark in sync
    const monoWordmark = document.getElementById('monogram-wordmark');
    if (monoWordmark && !monoWordmark.value) monoWordmark.value = val;
  });
  bindTextInput('input-sender-email', val => {
    currentInvoice.sender.email = val;
    detachCompanyLink();
  });
  bindTextInput('input-sender-phone', val => {
    currentInvoice.sender.phone = val;
    detachCompanyLink();
  });
  bindTextInput('input-sender-address', val => {
    currentInvoice.sender.address = val;
    detachCompanyLink();
  });
  bindTextInput('input-sender-taxid', val => {
    currentInvoice.sender.taxId = val;
    detachCompanyLink();
    updateSenderTaxHint();
  });

  // Sender Payment & Notes Two-Way Sync
  const senderPaymentInput = document.getElementById('input-sender-payment');
  const paymentInfoInput = document.getElementById('input-payment-info');
  const clearPaymentBtn = document.getElementById('btn-clear-sender-payment');

  function syncPayment(val) {
    currentInvoice.payment = val;
    if (senderPaymentInput && senderPaymentInput.value !== val) senderPaymentInput.value = val;
    if (paymentInfoInput && paymentInfoInput.value !== val) paymentInfoInput.value = val;
    if (clearPaymentBtn) {
      clearPaymentBtn.style.display = val && val.trim() ? 'inline-block' : 'none';
    }
    updateSheetView();
    triggerAutoSave();
  }

  if (senderPaymentInput) {
    senderPaymentInput.addEventListener('input', (e) => syncPayment(e.target.value));
  }
  if (paymentInfoInput) {
    paymentInfoInput.addEventListener('input', (e) => syncPayment(e.target.value));
  }
  if (clearPaymentBtn) {
    clearPaymentBtn.addEventListener('click', () => syncPayment(''));
  }

  // Client Fields
  bindTextInput('input-client-name', val => {
    currentInvoice.client.name = val;
    // A hand-edited name is no longer guaranteed to match the directory record.
    currentInvoice.clientId = null;
    if (currentInvoice.client) delete currentInvoice.client.id;
  });
  bindTextInput('input-client-email', val => currentInvoice.client.email = val);
  bindTextInput('input-client-phone', val => currentInvoice.client.phone = val);
  bindTextInput('input-client-address', val => currentInvoice.client.address = val);
  bindTextInput('input-client-taxid', val => currentInvoice.client.taxId = val);

  // Notes
  bindTextInput('input-notes', val => currentInvoice.notes = val);

  // Add Item Button
  document.getElementById('btn-add-item').addEventListener('click', () => {
    currentInvoice.items.push({
      id: generateId('item_'),
      description: 'New Consulting / Service Item',
      hsn: '998314',
      qty: 1,
      rate: 100,
      discount: 0,
      taxRate: 18
    });
    renderLineItemsEditor();
    updateSheetView();
    triggerAutoSave();
  });

  // Add Tax Leg Button
  document.getElementById('btn-add-tax-leg').addEventListener('click', () => {
    const existingLegs = currentInvoice.taxes.length;
    currentInvoice.taxes.push({
      id: generateId('tax_'),
      name: 'Custom Tax',
      ratio: existingLegs === 0 ? 100 : 50
    });
    renderTaxesEditor();
    updateSheetView();
    triggerAutoSave();
  });

  // Tax Presets Dropdown
  document.getElementById('select-tax-preset').addEventListener('change', (e) => {
    const val = e.target.value;
    if (val === 'india_gst') {
      currentInvoice.taxes = [
        { id: 'tax_1', name: 'CGST', ratio: 50 },
        { id: 'tax_2', name: 'SGST', ratio: 50 }
      ];
    } else if (val === 'india_igst') {
      currentInvoice.taxes = [
        { id: 'tax_1', name: 'IGST (Inter-State)', ratio: 100 }
      ];
    } else if (val === 'us_state_county') {
      currentInvoice.taxes = [
        { id: 'tax_1', name: 'State Sales Tax', ratio: 75 },
        { id: 'tax_2', name: 'County / Local Tax', ratio: 25 }
      ];
    } else if (val === 'single_vat') {
      currentInvoice.taxes = [
        { id: 'tax_1', name: 'Standard VAT', ratio: 100 }
      ];
    } else if (val === 'zero_tax') {
      currentInvoice.taxes = [];
      currentInvoice.items.forEach(item => { item.taxRate = 0; });
      renderLineItemsEditor();
      updateSenderTaxHint();
    }
    renderTaxesEditor();
    updateSheetView();
    triggerAutoSave();
    e.target.value = '';
  });

  // Company Profile Selector Dropdown (Section 4A)
  const selectCompany = document.getElementById('select-company-profile');
  if (selectCompany) {
    selectCompany.addEventListener('change', async (e) => {
      const val = e.target.value;
      if (val === '__new__') {
        resetCompanyModalForm();
        await renderCompaniesModalList();
        openModal('modal-companies');
        selectCompany.value = activeCompanyProfileId || '';
        return;
      }
      // Empty value is the display-only "No company linked" state, never an
      // action; and an unknown id must not silently apply a company.
      if (!val) return;
      const comp = await getCompany(val);
      if (comp) {
        applyCompanyToInvoice(comp);
      }
    });
  }

  // Update Active Company Profile Button
  const btnUpdateCompany = document.getElementById('btn-update-sender-profile');
  if (btnUpdateCompany) {
    btnUpdateCompany.addEventListener('click', async () => {
      const select = document.getElementById('select-company-profile');
      const compId = select && select.value && select.value !== '__new__' ? select.value : activeCompanyProfileId;
      if (!compId) {
        // New companies inherit the current document's currency/format and
        // only claim the default slot when no default exists, so the app
        // never ends up with multiple defaults (M7).
        const companies = await getAllCompanies();
        const hasDefault = companies.some(c => c.isDefault);
        const newComp = {
          id: generateId('comp_'),
          name: currentInvoice.sender.name || 'My Company',
          email: currentInvoice.sender.email || '',
          phone: currentInvoice.sender.phone || '',
          address: currentInvoice.sender.address || '',
          taxId: currentInvoice.sender.taxId || '',
          payment: currentInvoice.payment || '',
          defaultCurrency: currentInvoice.meta.currency || '$',
          defaultNumberFormat: currentInvoice.meta.numberFormat || 'international',
          isDefault: !hasDefault
        };
        await saveCompany(newComp);
        if (newComp.isDefault) {
          await setDefaultCompany(newComp.id);
        }
        activeCompanyProfileId = newComp.id;
        currentInvoice.companyId = newComp.id;
        await renderCompanyProfilesSelector();
        await updateSavedCompaniesCount();
        await notifyDataChanged();
        refreshCatalogPicker();
        alert(`Company profile "${newComp.name}" saved!`);
      } else {
        const existing = await getCompany(compId);
        if (existing) {
          existing.name = currentInvoice.sender.name;
          existing.email = currentInvoice.sender.email;
          existing.phone = currentInvoice.sender.phone;
          existing.address = currentInvoice.sender.address;
          existing.taxId = currentInvoice.sender.taxId || '';
          existing.payment = currentInvoice.payment || '';
          await saveCompany(existing);
          await renderCompanyProfilesSelector();
          await notifyDataChanged();
          // Renames must reach the scope hint and company scope tags.
          refreshCatalogPicker();
          alert(`Company profile "${existing.name}" updated with current details!`);
        }
      }
    });
  }

  // Quick Open New Company in Modal
  const btnQuickNewComp = document.getElementById('btn-quick-new-company');
  if (btnQuickNewComp) {
    btnQuickNewComp.addEventListener('click', async () => {
      resetCompanyModalForm();
      await renderCompaniesModalList();
      openModal('modal-companies');
    });
  }

  // Quick Manage Companies Button
  const btnQuickManageComp = document.getElementById('btn-quick-manage-companies');
  if (btnQuickManageComp) {
    btnQuickManageComp.addEventListener('click', async () => {
      await renderCompaniesModalList();
      openModal('modal-companies');
    });
  }

  // Save Company From Modal Button
  const btnSaveCompModal = document.getElementById('btn-save-company-modal');
  if (btnSaveCompModal) {
    btnSaveCompModal.addEventListener('click', async () => {
      await saveCompanyFromModal();
    });
  }

  // Load Utharam Profile Preset Button
  const btnLoadUtharamPreset = document.getElementById('btn-load-utharam-preset');
  if (btnLoadUtharamPreset) {
    btnLoadUtharamPreset.addEventListener('click', () => {
      document.getElementById('modal-company-id').value = '';
      document.getElementById('modal-company-name').value = 'Utharam';
      document.getElementById('modal-company-email').value = 'contactutharam@gmail.com';
      document.getElementById('modal-company-phone').value = '';
      document.getElementById('modal-company-address').value = 'Kerala, India\nhttps://utharam.in/\nSimple Solutions for Complex Problems';
      document.getElementById('modal-company-taxid').value = 'KL-UTH-01';
      document.getElementById('modal-company-payment').value = 'Direct Wire / Bank Remittance on Request\nAccount: Utharam Research & Software Studio';
      document.getElementById('modal-company-currency').value = '₹';
      document.getElementById('modal-company-number-format').value = 'indian';
      document.getElementById('modal-company-is-default').checked = true;
      document.getElementById('company-form-heading').textContent = 'Add Utharam Official Profile Preset';
    });
  }

  // Cancel Company Edit in Modal
  const btnCancelCompEdit = document.getElementById('btn-cancel-company-edit');
  if (btnCancelCompEdit) {
    btnCancelCompEdit.addEventListener('click', () => {
      resetCompanyModalForm();
    });
  }

  // Save Sender Profile Default
  document.getElementById('btn-save-sender-profile').addEventListener('click', async () => {
    const select = document.getElementById('select-company-profile');
    const compId = select && select.value && select.value !== '__new__' ? select.value : null;
    const existing = compId ? await getCompany(compId) : null;
    const comp = Object.assign({}, existing || {}, {
      id: compId || generateId('comp_'),
      name: currentInvoice.sender.name || 'Apex Studio',
      email: currentInvoice.sender.email || '',
      phone: currentInvoice.sender.phone || '',
      address: currentInvoice.sender.address || '',
      taxId: currentInvoice.sender.taxId || '',
      payment: currentInvoice.payment || '',
      defaultCurrency: existing && existing.defaultCurrency ? existing.defaultCurrency : (currentInvoice.meta.currency || '$'),
      defaultNumberFormat: existing && existing.defaultNumberFormat ? existing.defaultNumberFormat : (currentInvoice.meta.numberFormat || 'international'),
      isDefault: true
    });
    if (!comp.createdAt) comp.createdAt = Date.now();
    await saveCompany(comp);
    await setDefaultCompany(comp.id);
    activeCompanyProfileId = comp.id;
    currentInvoice.companyId = comp.id;
    await renderCompanyProfilesSelector();
    await updateSavedCompaniesCount();
    await notifyDataChanged();
    alert(`"${comp.name}" saved as default company! All new documents will start with this profile.`);
  });

  // Save Client to Directory (clone first so saveClient's id/updatedAt stamp
  // never mutates the live invoice object)
  document.getElementById('btn-save-client-to-book').addEventListener('click', async () => {
    if (!currentInvoice.client.name) {
      alert('Please enter a client name first.');
      return;
    }
    const savedClient = await saveClient(Object.assign({}, currentInvoice.client, {
      id: currentInvoice.client.id || currentInvoice.clientId || undefined
    }));
    currentInvoice.clientId = savedClient.id;
    currentInvoice.client.id = savedClient.id;
    await notifyDataChanged();
    alert(`Client "${currentInvoice.client.name}" saved to Client Directory!`);
  });
}

function setupPillNavigation() {
  const pills = document.querySelectorAll('#sidebar-pills-bar .nav-pill');
  const sectionIds = ['sec-models', 'sec-brand', 'sec-meta', 'sec-parties', 'sec-items', 'sec-payment'];
  const sidebar = document.getElementById('editor-sidebar');
  const emptyState = document.getElementById('sidebar-empty-state');
  let currentActiveId = 'sec-models'; // default open section

  function toggleSection(targetId) {
    // If clicking the already open section -> collapse/hide it!
    if (currentActiveId === targetId) {
      currentActiveId = null;
      pills.forEach(p => p.classList.remove('active'));
      sectionIds.forEach(id => {
        const sec = document.getElementById(id);
        if (sec) sec.style.display = 'none';
      });
      if (emptyState) emptyState.style.display = 'flex';
      return;
    }

    // Otherwise expand the clicked section
    currentActiveId = targetId;
    if (emptyState) emptyState.style.display = 'none';

    pills.forEach(p => {
      if (p.dataset.target === targetId) p.classList.add('active');
      else p.classList.remove('active');
    });

    sectionIds.forEach(id => {
      const sec = document.getElementById(id);
      if (sec) {
        sec.style.display = (id === targetId) ? 'block' : 'none';
      }
    });

    if (sidebar) sidebar.scrollTop = 0;
  }

  pills.forEach(pill => {
    pill.addEventListener('click', (e) => {
      e.preventDefault();
      toggleSection(pill.dataset.target);
    });
  });

  // Next tab buttons inside sections
  document.querySelectorAll('.btn-next-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const nextId = btn.dataset.next;
      if (nextId) toggleSection(nextId);
    });
  });

  // Quick open buttons inside empty state
  document.querySelectorAll('.btn-quick-open').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.target;
      if (target) toggleSection(target);
    });
  });
}

function bindTextInput(elemId, callback) {
  const el = document.getElementById(elemId);
  if (!el) return;
  const eventType = el.tagName === 'SELECT' ? 'change' : 'input';
  el.addEventListener(eventType, (e) => {
    callback(e.target.value);
    updateSheetView();
    triggerAutoSave();
  });
}

// ============================================================================
// 10. NAVIGATION, SIDEBAR COLLAPSE, MODALS & BACKUP
// ============================================================================
async function resetToFreshDocument(prefillClient = null, requestedType = null) {
  const curType = requestedType && APP_DOC_TYPES[requestedType] ? requestedType : activeDocType();
  const cfg = APP_DOC_TYPES[curType] || APP_DOC_TYPES.invoice;
  let defCompany = null;
  try {
    defCompany = await getDefaultCompany();
  } catch (e) {
    console.warn('Default company lookup failed while starting a new document:', e);
  }
  currentInvoice = JSON.parse(JSON.stringify(DEFAULT_INVOICE_STATE));
  currentInvoice.id = (curType === 'invoice' ? 'inv_' : 'doc_') + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
  currentInvoice.meta.date = appLocalDateString();
  currentInvoice.meta.dueDate = addDaysLocal(currentInvoice.meta.date, 14);
  currentInvoice.meta.docType = curType;
  currentInvoice.meta.title = cfg.title;
  currentInvoice.meta.currency = (defCompany && defCompany.defaultCurrency) || '$';
  currentInvoice.meta.numberFormat = (defCompany && defCompany.defaultNumberFormat) ||
    (currentInvoice.meta.currency === '₹' ? 'indian' : 'international');
  if (currentNumberingConfig && currentNumberingConfig.mode === 'auto') {
    currentInvoice.meta.number = generateForType(curType, currentInvoice.meta.date, currentNumberingConfig);
    currentInvoice.meta.numberAuto = true;
  } else {
    // Manual mode never invents a number; the user types it.
    currentInvoice.meta.number = '';
    currentInvoice.meta.numberAuto = false;
  }
  currentInvoice.meta.status = cfg.defaultStatus;
  currentInvoice.meta.showSignature = (curType !== 'invoice');
  currentInvoice.notes = cfg.defaultNotes;
  delete currentInvoice.convertedToId;
  delete currentInvoice.convertedToNumber;
  delete currentInvoice.convertedAt;
  delete currentInvoice.sourceDocId;
  delete currentInvoice.sourceDocNumber;
  delete currentInvoice.duplicatedFromId;

  if (defCompany) {
    currentInvoice.sender = {
      name: defCompany.name || '',
      email: defCompany.email || '',
      phone: defCompany.phone || '',
      address: defCompany.address || '',
      taxId: defCompany.taxId || ''
    };
    currentInvoice.payment = defCompany.payment || '';
    activeCompanyProfileId = defCompany.id;
    currentInvoice.companyId = defCompany.id;
  } else {
    currentInvoice.payment = '';
    currentInvoice.companyId = null;
  }

  if (prefillClient) {
    currentInvoice.client = {
      name: prefillClient.name || '',
      email: prefillClient.email || '',
      phone: prefillClient.phone || '',
      address: prefillClient.address || '',
      taxId: prefillClient.taxId || ''
    };
    currentInvoice.clientId = prefillClient.id || null;
  } else {
    currentInvoice.clientId = null;
  }

  currentDocumentPersisted = false;
  documentEdited = false;
  try { await renderCompanyProfilesSelector(); } catch (e) { console.warn(e); }
  populateFormFields();
  renderLineItemsEditor();
  renderTaxesEditor();
  updateSheetView();
  refreshCatalogPicker();
  triggerAutoSave();
  navigateTo('compose');
  requestAnimationFrame(() => updateDocumentPaginationLive());
  syncComposeTitle();
}

/**
 * Keeps the browser tab title in sync with the document being edited.
 * navigateTo('compose') is a same-view no-op, so document changes must update
 * the title directly (UI9).
 */
function syncComposeTitle() {
  if (getCurrentView() !== 'compose') return;
  document.title = `${docTypeName(activeDocType())} ${currentInvoice.meta.number || ''} - InvoiceCraft`
    .replace(/\s+/g, ' ').trim();
}

/**
 * Single hook for "persisted data changed" events (UI3): refresh shell counts
 * plus whichever data-bearing view is currently visible. Never called during
 * initial boot.
 */
async function notifyDataChanged() {
  try { await refreshShellCounts(); } catch (e) { console.warn('Shell count refresh failed:', e); }
  const view = getCurrentView();
  if (view === 'reports' && reportsMounted) {
    try { await refreshReportsView(); } catch (e) { console.warn('Reports refresh failed:', e); }
  }
  if (view === 'home') {
    try { await renderHome(); } catch (e) { console.warn('Home refresh failed:', e); }
  }
}

/**
 * Regenerates the engine-issued number of an unsaved draft (H1). Used when the
 * issue date (or type/scheme inputs behind the number) change and again at
 * save time. Persisted records and hand-edited numbers are never rewritten.
 * The optional `config` lets callers pass an already-rolled numbering config;
 * whatever comes in is rolled here too (a no-op when already rolled), so a
 * period boundary can never regenerate a number from a stale counter.
 * Returns true when the number was rewritten.
 */
function refreshAutoNumberForDraft(config = currentNumberingConfig) {
  if (currentDocumentPersisted) return false;
  const effective = rolloverNumberingConfig(config || currentNumberingConfig);
  if (!effective || effective.mode !== 'auto') return false;
  if (!currentInvoice.meta.numberAuto) return false;
  const next = generateForType(activeDocType(), currentInvoice.meta.date, effective);
  if (!next || next === currentInvoice.meta.number) return false;
  currentInvoice.meta.number = next;
  const numInput = document.getElementById('input-inv-number');
  if (numInput) numInput.value = next;
  updateNumberingBadgeUI(effective);
  return true;
}

/**
 * Saves the active document and its numbering config in one transaction.
 * In auto mode the document's own type counter advances exactly once per newly
 * issued number; saving the same document again does not consume another.
 * Rollover is applied before anything else, every save uniqueness-checks the
 * number, and persisted records are never renumbered or re-advanced (H1–H4).
 */
async function persistCurrentDocument() {
  const persistedBeforeAttempt = currentDocumentPersisted;
  let saveCompleted = false;
  try {
    const type = activeDocType();
    const config = rolloverNumberingConfig(currentNumberingConfig);
    const autoMode = config.mode === 'auto';

    // Stale draft regeneration: re-issue the number from the current rolled
    // config and the current issue date before anything is written. The rolled
    // local config is passed explicitly so a period boundary can never
    // regenerate from the pre-rollover counter.
    if (autoMode && !currentDocumentPersisted && currentInvoice.meta.numberAuto) {
      if (refreshAutoNumberForDraft(config)) {
        updateSheetView();
      }
    }

    const number = String(currentInvoice.meta.number || '').trim();
    if (!number) {
      alert('Please enter a document number before saving.');
      return false;
    }

    // Auto mode always uniqueness-checks; hand-edited auto numbers and manual
    // numbers get the same guard. Re-saves exclude their own record.
    const conflict = await findNumberConflict(number, type, currentDocumentPersisted ? currentInvoice.id : null);
    if (conflict) {
      alert(`The ${docTypeName(type)} number "${number}" is already used by another saved document. Choose a unique number.`);
      return false;
    }

    // Advance exactly once per newly issued number; never for re-saves and
    // never for hand-edited numbers. A retyped number that exactly matches the
    // engine's expected current number is still a consumption and must
    // advance, or the next new document would collide with it.
    const expectedCurrentForCurrentConfig = autoMode
      ? generateForType(type, currentInvoice.meta.date, config)
      : '';
    let configToSave = config;
    if (autoMode && !currentDocumentPersisted &&
        (currentInvoice.meta.numberAuto ||
         (expectedCurrentForCurrentConfig && number === expectedCurrentForCurrentConfig))) {
      configToSave = advanceTypeCounter(config, type);
    }

    currentInvoice.meta.number = number;
    if (!autoMode) currentInvoice.meta.numberAuto = false;

    currentInvoice.companyId = activeCompanyProfileId || currentInvoice.companyId || null;
    if (!currentInvoice.clientId && currentInvoice.client && currentInvoice.client.id) {
      currentInvoice.clientId = currentInvoice.client.id;
    }

    await saveInvoiceAndNumbering(currentInvoice, configToSave);
    saveCompleted = true;
    currentNumberingConfig = normalizeNumberingConfig(configToSave);
    currentDocumentPersisted = true;
    documentEdited = false;
    updateNumberingBadgeUI(currentNumberingConfig);
    updateSheetView();
    syncComposeTitle();
    try { await saveActiveDraft(currentInvoice, { activeCompanyProfileId, documentEdited: false }); } catch (e) { console.warn(e); }
    try { await updateSavedInvoicesCount(); } catch (e) {}
    await notifyDataChanged();
    return true;
  } catch (err) {
    console.error('Save failed:', err);
    // A failed save must never leave the editor looking persisted: the prepare
    // step may already have stamped updatedAt on the live object before the
    // write failed. Demote the editor content back to an unsaved draft so a
    // reload cannot infer it was persisted.
    if (!persistedBeforeAttempt && !saveCompleted) {
      currentDocumentPersisted = false;
      delete currentInvoice.updatedAt;
      documentEdited = true;
      try {
        await saveActiveDraft(currentInvoice, { activeCompanyProfileId, documentEdited: true });
      } catch (e) { console.warn(e); }
    }
    alert('Could not save this document: ' + (err && err.message ? err.message : err));
    return false;
  }
}

async function openAppModal(id) {
  if (!id) return;
  if (id === 'modal-numbering-engine') {
    populateNumberingModal(currentNumberingConfig);
  } else if (id === 'modal-companies') {
    await renderCompaniesModalList();
  } else if (id === 'modal-clients') {
    await renderClientsList();
  } else if (id === 'modal-invoices') {
    await renderSavedInvoicesList();
  } else if (id === 'modal-item-library') {
    await openItemLibraryManager();
  }
  openModal(id);
}

async function resumeActiveDraft() {
  try {
    const record = await getActiveDraftRecord();
    if (record && record.data) {
      const data = record.data;
      // Verify the persisted record still exists instead of inferring from
      // updatedAt; a leftover updatedAt on a deleted record must not make the
      // editor treat the draft as a saved document.
      let persisted = false;
      if (data.updatedAt && data.id) {
        try {
          persisted = Boolean(await getInvoice(data.id));
        } catch (e) {
          console.warn('Could not verify the persisted draft record:', e);
          persisted = false;
        }
      }
      if (data.updatedAt && !persisted) delete data.updatedAt;
      // edited === null is the legacy "edited" marker: treat it as edited.
      await loadInvoiceIntoEditor(data, {
        persisted,
        activeCompanyProfileId: record.activeCompanyProfileId,
        documentEdited: record.edited === null ? true : Boolean(record.edited)
      });
    }
  } catch (e) {
    console.warn('Could not restore the active draft:', e);
  }
  navigateTo('compose');
  requestAnimationFrame(() => updateDocumentPaginationLive());
  syncComposeTitle();
}

async function requestNewDocument(type = null, prefillClient = null) {
  const targetType = type && APP_DOC_TYPES[type] ? type : activeDocType();
  // Only real edits are worth a save/discard prompt. A pristine default
  // document (or an untouched saved record) starts fresh with no prompt and
  // never writes a demo record (UI1/UI5).
  const hasUnsavedWork = documentEdited;
  if (hasUnsavedWork) {
    pendingNewDocType = targetType;
    pendingPrefillClient = prefillClient;
    const cfg = APP_DOC_TYPES[targetType] || APP_DOC_TYPES.invoice;
    const curNum = currentInvoice.meta.number || 'Current Document';
    const titleEl = document.getElementById('new-doc-cur-title');
    if (titleEl) titleEl.textContent = `${docTypeName(activeDocType())} "${curNum}" → new ${cfg.name}`;
    openModal('modal-confirm-new-doc');
    return;
  }
  navigateTo('compose');
  await resetToFreshDocument(prefillClient, targetType);
}

async function loadInvoiceIntoEditor(inv, opts = {}) {
  if (!inv) return false;
  normalizeInvoice(inv);
  currentInvoice = JSON.parse(JSON.stringify(inv));
  normalizeInvoice(currentInvoice);
  activeCompanyProfileId = opts.activeCompanyProfileId || currentInvoice.companyId || null;
  if (!activeCompanyProfileId && currentInvoice.sender && currentInvoice.sender.name) {
    try {
      const allComps = await getAllCompanies();
      const match = allComps.find(c => c.name === currentInvoice.sender.name);
      if (match) {
        activeCompanyProfileId = match.id;
        currentInvoice.companyId = currentInvoice.companyId || match.id;
      }
    } catch (e) {}
  }
  currentDocumentPersisted = opts.persisted !== undefined ? Boolean(opts.persisted) : Boolean(inv.updatedAt);
  documentEdited = Boolean(opts.documentEdited);
  try { await renderCompanyProfilesSelector(); } catch (e) {}
  populateFormFields();
  renderLineItemsEditor();
  renderTaxesEditor();
  updateSheetView();
  refreshCatalogPicker();
  try { await saveActiveDraft(currentInvoice, { activeCompanyProfileId, documentEdited }); } catch (e) { console.warn(e); }
  return true;
}

async function openDocumentInEditor(id) {
  try {
    const inv = await getInvoice(id);
    if (!inv) {
      alert('That document could not be found. It may have been deleted.');
      return false;
    }
    // Never silently replace an edited draft: resolve the dirty-draft prompt
    // BEFORE the new document is loaded or written to activeDraft (UI1).
    if (documentEdited &&
        !confirm('You have unsaved changes in the current draft. Opening this document will discard them. Discard and continue?')) {
      return false;
    }
    await loadInvoiceIntoEditor(inv, { persisted: true });
    navigateTo('compose');
    closeModal('modal-invoices');
    closeModal('modal-clients');
    closeModal('modal-reports');
    requestAnimationFrame(() => updateDocumentPaginationLive());
    try { await refreshShellCounts(); } catch (e) {}
    syncComposeTitle();
    return true;
  } catch (e) {
    console.error('Could not open document:', e);
    alert('Could not open that document: ' + (e && e.message ? e.message : e));
    return false;
  }
}

async function duplicateDocument(source) {
  if (!source) return false;
  // Never silently replace an edited draft: resolve the dirty-draft prompt
  // before a number is generated, consumed, or loaded (UI1).
  if (documentEdited &&
      !confirm('You have unsaved changes in the current draft. Duplicating will replace the editor content and discard them. Discard and continue?')) {
    return false;
  }
  const type = source.meta?.docType || 'invoice';
  let config = rolloverNumberingConfig(currentNumberingConfig);
  let number;
  if (config.mode === 'manual') {
    number = await promptManualNumber(type, '', null);
    if (!number) return false;
  } else {
    number = generateForType(type, appLocalDateString(), config);
    if (await findNumberConflict(number, type, null)) {
      alert(`The generated ${docTypeName(type)} number "${number}" is already in use. Duplicate cancelled.`);
      return false;
    }
  }

  const duplicate = buildDuplicateRecord({
    source,
    id: generateId('inv_'),
    number,
    now: new Date()
  });
  duplicate.meta.status = (APP_DOC_TYPES[type] || APP_DOC_TYPES.invoice).defaultStatus;
  delete duplicate.convertedToId;
  delete duplicate.convertedToNumber;
  delete duplicate.convertedAt;
  delete duplicate.sourceDocId;
  delete duplicate.sourceDocNumber;
  if (duplicate.meta) {
    delete duplicate.meta.convertedToId;
    delete duplicate.meta.convertedToNumber;
    delete duplicate.meta.convertedAt;
    delete duplicate.meta.sourceDocId;
    delete duplicate.meta.sourceDocNumber;
  }
  // Link identity stays honest (M6): a legacy source without a stored company
  // link produces a duplicate without an invented link. The sender snapshot is
  // kept as-is so number/currency/link never disagree.
  duplicate.companyId = source.companyId || null;
  duplicate.clientId = source.clientId || null;
  if (!duplicate.meta.currency) duplicate.meta.currency = source.meta?.currency || '$';
  duplicate.meta.numberAuto = config.mode === 'auto';

  if (config.mode === 'auto') {
    config = advanceTypeCounter(config, type);
  }
  try {
    await saveInvoiceAndNumbering(duplicate, config);
  } catch (e) {
    console.error('Duplicate save failed:', e);
    alert('Could not save the duplicate: ' + (e && e.message ? e.message : e));
    return false;
  }
  currentNumberingConfig = normalizeNumberingConfig(config);
  await loadInvoiceIntoEditor(duplicate, { persisted: true });
  closeModal('modal-invoices');
  closeModal('modal-clients');
  navigateTo('compose');
  requestAnimationFrame(() => updateDocumentPaginationLive());
  try { await updateSavedInvoicesCount(); } catch (e) {}
  await notifyDataChanged();
  syncComposeTitle();
  return true;
}

// Compose-only print manager path. The shell routes Ctrl+P here only in Compose.
function safePrintAction() {
  if (getCurrentView() !== 'compose') return false;
  const origTitle = document.title;
  const prefix = docTypeName(activeDocType());
  const rawNum = currentInvoice.meta.number || 'Draft';
  const sanitizedNum = rawNum.replace(/[\\/:*?"<>|]/g, '_');

  // Visual page break guides must never enter print output.
  document.querySelectorAll('.canvas-page-break-line').forEach(el => el.remove());

  if (safePrintAction._restore) {
    try {
      window.removeEventListener('afterprint', safePrintAction._restore);
      clearTimeout(safePrintAction._t);
    } catch (e) {}
  }

  document.title = `${prefix}-${sanitizedNum}`;
  const restoreTitle = () => {
    document.title = origTitle;
    if (getCurrentView() === 'compose') updateDocumentPaginationLive();
    safePrintAction._restore = null;
  };
  safePrintAction._restore = restoreTitle;
  window.addEventListener('afterprint', restoreTitle, { once: true });
  safePrintAction._t = setTimeout(restoreTitle, 1500);
  window.print();
  return true;
}

function attachNavigationListeners() {
  setupPillNavigation();

  // Sidebar Collapse / Expand Toggle
  const workspace = document.querySelector('.app-workspace');
  const sidebarToggleBtn = document.getElementById('btn-toggle-sidebar');
  const floatingToggleBtn = document.getElementById('btn-expand-sidebar-floating');

  const toggleSidebar = () => {
    if (getCurrentView() !== 'compose') return;
    const isCollapsed = workspace.classList.toggle('sidebar-collapsed');
    if (floatingToggleBtn) {
      floatingToggleBtn.style.display = isCollapsed ? 'inline-flex' : 'none';
    }
    if (sidebarToggleBtn) {
      sidebarToggleBtn.classList.toggle('btn-primary', isCollapsed);
    }
    requestAnimationFrame(() => updateDocumentPaginationLive());
  };
  toggleSidebarPanel = toggleSidebar;

  if (sidebarToggleBtn) sidebarToggleBtn.addEventListener('click', toggleSidebar);
  if (floatingToggleBtn) floatingToggleBtn.addEventListener('click', toggleSidebar);

  // New Document Button (existing confirmation dialog; target type is captured
  // when the action starts, so Home's New Quote works too).
  const btnNewInvoice = document.getElementById('btn-new-invoice');
  if (btnNewInvoice) {
    btnNewInvoice.addEventListener('click', () => {
      requestNewDocument(activeDocType());
    });
  }

  const btnNewSaveAndStart = document.getElementById('btn-new-save-and-start');
  if (btnNewSaveAndStart) {
    btnNewSaveAndStart.addEventListener('click', async () => {
      const targetType = pendingNewDocType || activeDocType();
      const targetClient = pendingPrefillClient;
      const saved = await persistCurrentDocument();
      if (!saved) return;
      closeModal('modal-confirm-new-doc');
      pendingNewDocType = null;
      pendingPrefillClient = null;
      await resetToFreshDocument(targetClient, targetType);
    });
  }

  const btnNewDiscard = document.getElementById('btn-new-discard');
  if (btnNewDiscard) {
    btnNewDiscard.addEventListener('click', async () => {
      const targetType = pendingNewDocType || activeDocType();
      const targetClient = pendingPrefillClient;
      closeModal('modal-confirm-new-doc');
      pendingNewDocType = null;
      pendingPrefillClient = null;
      await resetToFreshDocument(targetClient, targetType);
    });
  }

  // Save Document Button
  document.getElementById('btn-save-invoice').addEventListener('click', async () => {
    const saved = await persistCurrentDocument();
    if (!saved) return;
    alert(`${docTypeName(activeDocType())} "${currentInvoice.meta.number}" saved successfully to IndexedDB!`);
  });

  // Bind Print / Save PDF Buttons
  const btnPrintNav = document.getElementById('btn-print-pdf');
  if (btnPrintNav) btnPrintNav.addEventListener('click', safePrintAction);

  const btnPrintCanvas = document.getElementById('btn-print-preview');
  if (btnPrintCanvas) btnPrintCanvas.addEventListener('click', safePrintAction);

  // Modals Open Triggers
  document.getElementById('btn-open-logo-studio').addEventListener('click', () => {
    openModal('modal-logo-studio');
    const monoWordmark = document.getElementById('monogram-wordmark');
    if (monoWordmark && !monoWordmark.value) monoWordmark.value = currentInvoice.sender.name;
    const iconWordmark = document.getElementById('icon-wordmark');
    if (iconWordmark && !iconWordmark.value) iconWordmark.value = currentInvoice.sender.name;
    // updateMonogramLockupLive is scoped inside setupLogoStudioTabs; refresh via
    // input event so the live monogram preview re-renders, then refresh the icon lockup.
    try {
      const monoInit = document.getElementById('monogram-initials');
      if (monoInit) monoInit.dispatchEvent(new Event('input', { bubbles: true }));
    } catch (e) {}
    try {
      if (typeof updateIconLockupLive === 'function') updateIconLockupLive();
    } catch (e) { console.warn('Icon lockup refresh failed:', e); }
  });

  document.getElementById('btn-open-invoices-modal').addEventListener('click', async () => {
    await renderSavedInvoicesList();
    openModal('modal-invoices');
  });

  const filterInvSearch = document.getElementById('filter-inv-search');
  if (filterInvSearch) {
    filterInvSearch.addEventListener('input', (e) => {
      invoiceFilterState.search = e.target.value.trim();
      renderSavedInvoicesList();
    });
  }

  const filterInvClient = document.getElementById('filter-inv-client');
  if (filterInvClient) {
    filterInvClient.addEventListener('change', (e) => {
      invoiceFilterState.client = e.target.value;
      renderSavedInvoicesList();
    });
  }

  document.querySelectorAll('#filter-type-chips .btn-filter-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#filter-type-chips .btn-filter-chip').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      invoiceFilterState.docType = btn.dataset.type;
      renderSavedInvoicesList();
    });
  });

  document.getElementById('btn-open-clients-modal').addEventListener('click', async () => {
    await renderClientsList();
    openModal('modal-clients');
  });

  document.getElementById('btn-open-backup-modal').addEventListener('click', () => {
    openModal('modal-backup');
  });

  const btnOpenCompaniesModal = document.getElementById('btn-open-companies-modal');
  if (btnOpenCompaniesModal) {
    btnOpenCompaniesModal.addEventListener('click', async () => {
      await renderCompaniesModalList();
      openModal('modal-companies');
    });
  }

  // Open Privacy Notice Modal Trigger
  const btnOpenPrivacyModal = document.getElementById('btn-open-privacy-modal');
  if (btnOpenPrivacyModal) {
    btnOpenPrivacyModal.addEventListener('click', () => {
      openModal('modal-privacy-notice');
    });
  }

  // Open Guide Modal Trigger
  const btnOpenGuideModal = document.getElementById('btn-open-guide-modal');
  if (btnOpenGuideModal) {
    btnOpenGuideModal.addEventListener('click', () => {
      openModal('modal-user-guide');
    });
  }

  // Guide contents links scroll the dialog body (the page itself does not
  // scroll while a modal is open). Keeps the TOC useful in the editorial guide.
  const guideToc = document.querySelector('#modal-user-guide .guide-toc');
  if (guideToc) {
    guideToc.addEventListener('click', (e) => {
      const link = e.target.closest && e.target.closest('a[href^="#"]');
      if (!link) return;
      const target = document.querySelector(link.getAttribute('href'));
      const body = document.querySelector('#modal-user-guide .guide-body');
      if (!target || !body) return;
      e.preventDefault();
      const top = target.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop - 16;
      body.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    });
  }

  // Open Numbering Engine Modal Trigger
  const btnOpenNumberingModal = document.getElementById('btn-open-numbering-modal');
  if (btnOpenNumberingModal) {
    btnOpenNumberingModal.addEventListener('click', () => {
      populateNumberingModal(currentNumberingConfig);
      openModal('modal-numbering-engine');
    });
  }

  // Quick Next Seq # button in Section 3
  const btnQuickNextNum = document.getElementById('btn-quick-next-num');
  if (btnQuickNextNum) {
    btnQuickNextNum.addEventListener('click', async () => {
      if (currentNumberingConfig.mode === 'manual') {
        alert('Numbering is currently in Manual Mode. Click "Numbering Engine" to switch to Auto Continuous Sequence.');
        return;
      }
      // Saved documents are never renumbered (H1): rewriting a persisted
      // record here would desync it from history and reports.
      if (currentDocumentPersisted) {
        alert('This document is already saved, so its number is frozen. Saved documents are never renumbered — use New or Duplicate for a fresh number.');
        return;
      }
      currentNumberingConfig = rolloverNumberingConfig(currentNumberingConfig);
      const nextNum = generateForType(activeDocType(), currentInvoice.meta.date, currentNumberingConfig);
      currentInvoice.meta.number = nextNum;
      currentInvoice.meta.numberAuto = true;
      const numInput = document.getElementById('input-inv-number');
      if (numInput) numInput.value = nextNum;
      updateSheetView();
      syncComposeTitle();
      updateNumberingBadgeUI(currentNumberingConfig);
      triggerAutoSave();
    });
  }

  // Change doc type link in Section 3 toolbar (redirects to Section 1)
  const btnChangeDocType = document.getElementById('btn-change-doc-type');
  if (btnChangeDocType) {
    btnChangeDocType.addEventListener('click', () => {
      const pill1 = document.querySelector('#sidebar-pills-bar .nav-pill[data-target="sec-models"]');
      if (pill1) pill1.click();
    });
  }
}

function attachModalListeners() {
  // Universal data-close-modal handler
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = btn.getAttribute('data-close-modal');
      closeModal(targetId);
    });
  });

  // Explicit close buttons
  const explicitButtons = [
    { btnId: 'btn-close-logo-modal', modalId: 'modal-logo-studio' },
    { btnId: 'btn-cancel-logo-modal', modalId: 'modal-logo-studio' },
    { btnId: 'btn-close-invoices-modal', modalId: 'modal-invoices' },
    { btnId: 'btn-cancel-invoices-modal', modalId: 'modal-invoices' },
    { btnId: 'btn-close-clients-modal', modalId: 'modal-clients' },
    { btnId: 'btn-cancel-clients-modal', modalId: 'modal-clients' },
    { btnId: 'btn-close-backup-modal', modalId: 'modal-backup' },
    { btnId: 'btn-cancel-backup-modal', modalId: 'modal-backup' },
    { btnId: 'btn-close-companies-modal', modalId: 'modal-companies' },
    { btnId: 'btn-cancel-companies-modal', modalId: 'modal-companies' },
    { btnId: 'btn-close-numbering-modal', modalId: 'modal-numbering-engine' },
    { btnId: 'btn-cancel-numbering-modal', modalId: 'modal-numbering-engine' },
    { btnId: 'btn-close-privacy-modal', modalId: 'modal-privacy-notice' },
    { btnId: 'btn-cancel-privacy-modal', modalId: 'modal-privacy-notice' },
    { btnId: 'btn-close-guide-modal', modalId: 'modal-user-guide' },
    { btnId: 'btn-got-it-guide', modalId: 'modal-user-guide' },
    { btnId: 'btn-close-new-doc-modal', modalId: 'modal-confirm-new-doc' },
    { btnId: 'btn-new-cancel', modalId: 'modal-confirm-new-doc' }
  ];

  explicitButtons.forEach(({ btnId, modalId }) => {
    const btn = document.getElementById(btnId);
    if (btn) {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        closeModal(modalId);
      });
    }
  });

  // Quick export from Privacy Modal
  const btnQuickExportPrivacy = document.getElementById('btn-quick-export-from-privacy');
  if (btnQuickExportPrivacy) {
    btnQuickExportPrivacy.addEventListener('click', async () => {
      try {
        const data = await exportAllData();
        const jsonStr = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `InvoiceCraft_Backup_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        closeModal('modal-privacy-notice');
        alert('Database JSON backup successfully downloaded! Store this file safely on your computer or drive.');
      } catch (err) {
        alert('Failed to generate backup: ' + err.message);
      }
    });
  }

  // Numbering Modal Controls
  document.querySelectorAll('input[name="num-mode"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const panel = document.getElementById('auto-numbering-settings-panel');
      if (panel) {
        panel.style.opacity = radio.value === 'manual' ? '0.45' : '1';
      }
      updateNumberingModalPreviewLive();
    });
  });

  document.querySelectorAll('.btn-scheme-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      const patternInput = document.getElementById('num-cfg-pattern');
      if (patternInput) {
        patternInput.value = btn.dataset.scheme;
        updateNumberingModalPreviewLive();
      }
    });
  });

  document.querySelectorAll('.btn-token-insert').forEach(btn => {
    btn.addEventListener('click', () => {
      const patternInput = document.getElementById('num-cfg-pattern');
      if (patternInput) {
        patternInput.value += btn.dataset.token;
        updateNumberingModalPreviewLive();
      }
    });
  });

  ['num-cfg-pattern', 'num-prefix-inv', 'num-prefix-qt', 'num-prefix-est', 'num-prefix-pi',
    'num-cfg-counter-invoice', 'num-cfg-counter-quotation', 'num-cfg-counter-estimate', 'num-cfg-counter-proforma'
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', updateNumberingModalPreviewLive);
  });

  ['num-cfg-padding', 'num-cfg-reset'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', updateNumberingModalPreviewLive);
  });

  const btnSaveNumModal = document.getElementById('btn-save-numbering-modal');
  if (btnSaveNumModal) {
    btnSaveNumModal.addEventListener('click', async () => {
      const nextConfig = readNumberingModalConfig();
      // An auto scheme without {COUNTER} cannot produce unique numbers.
      if (nextConfig.mode === 'auto' && !String(nextConfig.scheme || '').includes('{COUNTER}')) {
        alert('Auto-numbering schemes must contain the {COUNTER} token so every number is unique. Add {COUNTER} to the pattern and save again.');
        return;
      }
      // The scheme must also carry enough period information for the reset
      // policy, or counters collide after every rollover.
      if (nextConfig.mode === 'auto') {
        const periodError = validateNumberingSchemePeriod(nextConfig.scheme, nextConfig.resetPeriod);
        if (periodError) {
          alert(periodError);
          return;
        }
      }
      currentNumberingConfig = nextConfig;
      await saveNumberingConfig(currentNumberingConfig);
      updateNumberingBadgeUI(currentNumberingConfig);

      // Saved records are never renumbered by a config change (H1). Only an
      // unsaved draft picks up the freshly previewed number.
      if (currentNumberingConfig.mode === 'auto' && !currentDocumentPersisted) {
        const newNum = generateForType(activeDocType(), currentInvoice.meta.date, currentNumberingConfig);
        currentInvoice.meta.number = newNum;
        currentInvoice.meta.numberAuto = true;
        const numInput = document.getElementById('input-inv-number');
        if (numInput) numInput.value = newNum;
      }
      updateSheetView();
      syncComposeTitle();
      triggerAutoSave();
      closeModal('modal-numbering-engine');
    });
  }

  // (Duplicate explicit-close registration removed — the loop above already
  // covers all buttons together with the universal [data-close-modal] handler.)

  // Modals are closed ONLY via explicit [×] or [Close] buttons to prevent accidental closure
  // Backdrop clicks intentionally do NOT close the modal dialog.

  // Backup Export JSON (append anchor for Firefox compat, delayed revoke)
  document.getElementById('btn-export-json').addEventListener('click', async () => {
    try {
      const data = await exportAllData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `InvoiceCraft_Backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (err) {
      alert('Failed to generate backup: ' + (err && err.message ? err.message : err));
    }
  });

  // Backup Import JSON
  const importInput = document.getElementById('file-import-input');
  document.getElementById('btn-trigger-import').addEventListener('click', () => importInput.click());

  importInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 25 * 1024 * 1024) {
        alert('Backup file is too large (max 25MB).');
        e.target.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const parsed = JSON.parse(evt.target.result);
          if (!parsed || typeof parsed !== 'object' ||
              (!Array.isArray(parsed.invoices) && !Array.isArray(parsed.clients) && !Array.isArray(parsed.companies) &&
               !parsed.numberingConfig && !parsed.profile &&
               !Array.isArray(parsed.catalogItems) && !parsed.itemLibraryConfig && !parsed.activeDraft)) {
            throw new Error('Unrecognized backup shape (expected invoices/clients/companies/catalogItems/catalog scope/numberingConfig/active draft).');
          }
          if (!confirm('Restore this backup? Existing records with the same IDs will be overwritten.')) {
            return;
          }
          await importAllData(parsed);
          await updateSavedInvoicesCount();
          await notifyDataChanged();
          alert('Database restored successfully! Reloading...');
          window.location.reload();
        } catch (err) {
          alert('Failed to restore backup: ' + err.message);
        } finally {
          importInput.value = '';
        }
      };
      reader.onerror = () => {
        alert('Could not read backup file.');
        importInput.value = '';
      };
      reader.readAsText(file);
    }
  });
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  if (typeof modal.showModal === 'function') {
    try {
      modal.showModal();
      return;
    } catch (e) {}
  }
  modal.setAttribute('open', '');
  modal.style.display = 'block';
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  if (typeof modal.close === 'function') {
    try {
      modal.close();
      return;
    } catch (e) {}
  }
  modal.removeAttribute('open');
  modal.style.display = 'none';
}

// ============================================================================
// 11. SAVED INVOICES & CLIENT DIRECTORY LISTS
// ============================================================================
async function updateSavedInvoicesCount() {
  const invoices = await getAllInvoices();
  const counter = document.getElementById('saved-invoices-count');
  if (counter) counter.textContent = invoices.length;
}

let invoiceFilterState = {
  search: '',
  docType: 'all',
  client: 'all'
};

async function renderSavedInvoicesList() {
  const container = document.getElementById('saved-invoices-list');
  if (!container) return;
  const invoices = await getAllInvoices();

  // 1. Update filter type chip counts
  const countAll = document.getElementById('count-all');
  const countInv = document.getElementById('count-invoice');
  const countQt = document.getElementById('count-quotation');
  const countEst = document.getElementById('count-estimate');
  const countPi = document.getElementById('count-proforma');

  if (countAll) countAll.textContent = invoices.length;
  if (countInv) countInv.textContent = invoices.filter(i => (i.meta?.docType || 'invoice') === 'invoice').length;
  if (countQt) countQt.textContent = invoices.filter(i => i.meta?.docType === 'quotation').length;
  if (countEst) countEst.textContent = invoices.filter(i => i.meta?.docType === 'estimate').length;
  if (countPi) countPi.textContent = invoices.filter(i => i.meta?.docType === 'proforma').length;

  // 2. Populate client filter dropdown
  const clientFilterSelect = document.getElementById('filter-inv-client');
  if (clientFilterSelect) {
    const prevSelected = invoiceFilterState.client;
    const clientCounts = {};
    invoices.forEach(i => {
      const name = (i.client?.name || '').trim();
      if (name) clientCounts[name] = (clientCounts[name] || 0) + 1;
    });
    const sortedClients = Object.keys(clientCounts).sort((a,b) => a.localeCompare(b));
    let optionsHtml = `<option value="all">All Clients (${invoices.length})</option>`;
    sortedClients.forEach(cName => {
      optionsHtml += `<option value="${appEscapeHtml(cName)}">${appEscapeHtml(cName)} (${clientCounts[cName]})</option>`;
    });
    clientFilterSelect.innerHTML = optionsHtml;
    if (sortedClients.includes(prevSelected) || prevSelected === 'all') {
      clientFilterSelect.value = prevSelected;
    } else {
      invoiceFilterState.client = 'all';
      clientFilterSelect.value = 'all';
    }
  }

  // 3. Filter invoices
  const filtered = invoices.filter(inv => {
    const docType = inv.meta?.docType || 'invoice';
    if (invoiceFilterState.docType !== 'all' && docType !== invoiceFilterState.docType) {
      return false;
    }
    const cName = (inv.client?.name || '').trim();
    if (invoiceFilterState.client !== 'all' && cName !== invoiceFilterState.client) {
      return false;
    }
    if (invoiceFilterState.search) {
      const q = invoiceFilterState.search.toLowerCase();
      const num = (inv.meta?.number || '').toLowerCase();
      const clientStr = cName.toLowerCase();
      const emailStr = (inv.client?.email || '').toLowerCase();
      const itemsMatch = (inv.items || []).some(it => (it.description || '').toLowerCase().includes(q));
      if (!num.includes(q) && !clientStr.includes(q) && !emailStr.includes(q) && !itemsMatch) {
        return false;
      }
    }
    return true;
  });

  // 4. Update summary text
  const summaryEl = document.getElementById('invoices-filter-summary');
  if (summaryEl) {
    summaryEl.textContent = `Showing ${filtered.length} of ${invoices.length} document${invoices.length !== 1 ? 's' : ''}`;
  }

  // 5. Render list
  if (invoices.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:28px 0; color:#94a3b8; font-size:13px;">
        No saved invoices or documents yet. Click "Save" in the top bar to store your first record!
      </div>
    `;
    return;
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:24px 0; color:#94a3b8; font-size:13px;">
        No documents match your active filter.
        <div style="margin-top:8px;">
          <button type="button" class="btn btn-secondary btn-xs" id="btn-reset-filters">Clear All Filters</button>
        </div>
      </div>
    `;
    const btnReset = document.getElementById('btn-reset-filters');
    if (btnReset) {
      btnReset.addEventListener('click', () => {
        invoiceFilterState = { search: '', docType: 'all', client: 'all' };
        const searchInput = document.getElementById('filter-inv-search');
        if (searchInput) searchInput.value = '';
        if (clientFilterSelect) clientFilterSelect.value = 'all';
        document.querySelectorAll('#filter-type-chips .btn-filter-chip').forEach(c => {
          c.classList.toggle('active', c.dataset.type === 'all');
        });
        renderSavedInvoicesList();
      });
    }
    return;
  }

  container.innerHTML = filtered.map(inv => {
    const dateFormatted = inv.updatedAt ? new Date(inv.updatedAt).toLocaleDateString() : '—';
    const docType = inv.meta?.docType || 'invoice';
    const docBadge = docType !== 'invoice'
      ? `<span style="display:inline-block; font-size:10px; font-weight:700; padding:1px 6px; border-radius:4px; background:#e0f2fe; color:#0369a1; text-transform:uppercase; margin-left:6px;">${appEscapeHtml(docType)}</span>`
      : '';
    const safeInvId = appEscapeHtml(inv.id);
    // Frozen totals win; legacy records fall back to the shared calculator.
    const frozenInvTotal = (inv.total === undefined || inv.total === null) ? NaN : Number(inv.total);
    const invTotal = Number.isFinite(frozenInvTotal) ? frozenInvTotal : calculateTotal(inv);
    const invTotalText = formatMoney(invTotal, inv.meta?.currency || '$', inv.meta?.numberFormat || 'international');
    const conversionRemark = inv.convertedToNumber
      ? `<div style="font-size:11px; color:#0369a1; margin-top:3px;">Converted to ${appEscapeHtml(inv.convertedToNumber)}${inv.convertedAt ? ' on ' + appEscapeHtml(new Date(inv.convertedAt).toLocaleDateString()) : ''}</div>`
      : (inv.sourceDocNumber
        ? `<div style="font-size:11px; color:#7c3aed; margin-top:3px;">From ${appEscapeHtml(inv.sourceDocNumber)}</div>`
        : '');
    return `
      <div style="display:flex; align-items:center; justify-content:space-between; padding:12px 14px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px;">
        <div>
          <div style="font-size:13.5px; font-weight:700; color:#0f172a; display:flex; align-items:center; flex-wrap:wrap; gap:4px;">
            ${appEscapeHtml(inv.meta?.number || 'Document')}
            ${docBadge}
            <span style="color:#94a3b8; font-weight:400; margin:0 4px;">&bull;</span>
            ${appEscapeHtml(inv.client?.name || 'Client')}
          </div>
          <div style="font-size:11.5px; color:#64748b; margin-top:2px;">
            Updated: ${appEscapeHtml(dateFormatted)} &bull; ${appEscapeHtml(invTotalText)}
          </div>
          ${conversionRemark}
        </div>
        <div style="display:flex; gap:6px;">
          <button class="btn btn-primary btn-sm btn-load-inv" data-id="${safeInvId}">Load</button>
          <button class="btn btn-secondary btn-sm btn-dup-inv" data-id="${safeInvId}">Duplicate</button>
          <button class="btn btn-danger btn-sm btn-icon btn-del-inv" data-id="${safeInvId}" title="Delete">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.btn-load-inv').forEach(btn => {
    btn.addEventListener('click', async () => {
      await openDocumentInEditor(btn.dataset.id);
    });
  });

  container.querySelectorAll('.btn-dup-inv').forEach(btn => {
    btn.addEventListener('click', async () => {
      const inv = await getInvoice(btn.dataset.id);
      if (!inv) return;
      normalizeInvoice(inv);
      await duplicateDocument(inv);
      try { await renderSavedInvoicesList(); } catch (e) {}
    });
  });

  container.querySelectorAll('.btn-del-inv').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (confirm('Permanently delete this document? Conversion numbers already written into other records are kept as history text.')) {
        await deleteInvoice(btn.dataset.id);
        // If the deleted record is the one open in the editor, demote the
        // editor content to an unsaved draft: Home must never present it as a
        // saved record and type switching must work again (UI6).
        if (currentDocumentPersisted && btn.dataset.id === currentInvoice.id) {
          currentDocumentPersisted = false;
          delete currentInvoice.updatedAt;
          documentEdited = true;
          try {
            await saveActiveDraft(currentInvoice, { activeCompanyProfileId, documentEdited: true });
          } catch (e) { console.warn(e); }
          updateNumberingBadgeUI(currentNumberingConfig);
        }
        await updateSavedInvoicesCount();
        await renderSavedInvoicesList();
        await notifyDataChanged();
      }
    });
  });
}

async function renderClientsList() {
  const container = document.getElementById('clients-list');
  if (!container) return;
  const clients = await getAllClients();
  const allInvoices = await getAllInvoices();

  if (clients.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:24px 0; color:#94a3b8; font-size:13px;">
        No clients in directory yet. Click "Add to Clients" in the Bill-To section to save one.
      </div>
    `;
    return;
  }

  container.innerHTML = clients.map(c => {
    const cNameClean = (c.name || '').trim().toLowerCase();
    const clientDocs = allInvoices.filter(inv => {
      const invCName = (inv.client?.name || '').trim().toLowerCase();
      // Durable-link match: saved documents keep the client link at top level
      // (clientId), while older/snapshot shapes may carry it on client.id.
      // Check both — guarded against records with no id — so a client rename
      // never orphans its linked documents.
      const idMatch = Boolean(c.id) && ((inv.client?.id === c.id) || (inv.clientId === c.id));
      return (invCName && invCName === cNameClean) || idMatch;
    });

    // Client totals are revenue-style (M2/M3): saved invoices only — quotes,
    // estimates, proformas, and draft-status documents are pipeline, not
    // revenue — grouped by canonical currency so mixed-currency histories are
    // never summed into one meaningless number.
    const invoiceDocs = clientDocs.filter(inv => {
      const docType = inv.meta?.docType || 'invoice';
      if (docType !== 'invoice') return false;
      return (inv.meta?.status || inv.status || 'pending') !== 'draft';
    });
    const totalsByCurrency = new Map();
    invoiceDocs.forEach(inv => {
      const currency = inv.meta?.currency || '$';
      const canonical = normalizeCurrency(currency);
      const key = canonical.key || String(currency).trim().toUpperCase();
      const frozen = (inv.total === undefined || inv.total === null) ? NaN : Number(inv.total);
      const value = Number.isFinite(frozen) ? frozen : calculateTotal(inv);
      const entry = totalsByCurrency.get(key) || {
        currency,
        numberFormat: inv.meta?.numberFormat || 'international',
        total: 0
      };
      entry.total += value;
      totalsByCurrency.set(key, entry);
    });
    const totalBilledText = Array.from(totalsByCurrency.values())
      .map(entry => formatMoney(entry.total, entry.currency, entry.numberFormat))
      .join(' • ');

    const docCountLabel = clientDocs.length === 0
      ? `<span style="font-size:11px; color:#94a3b8;">No documents yet</span>`
      : `<span style="font-size:11px; font-weight:600; color:#0369a1; background:#e0f2fe; padding:2px 8px; border-radius:10px;">${clientDocs.length} doc${clientDocs.length > 1 ? 's' : ''}${totalBilledText ? ` &bull; Invoiced Total: ${appEscapeHtml(totalBilledText)}` : ''}</span>`;

    const docsDrawerHtml = clientDocs.length > 0 ? `
      <div class="client-docs-drawer" id="client-drawer-${appEscapeHtml(c.id)}" style="display:none;">
        <div style="font-size:11px; font-weight:700; color:#475569; margin-bottom:6px; text-transform:uppercase; letter-spacing:0.4px;">
          Previous Documents for ${appEscapeHtml(c.name)}:
        </div>
        ${clientDocs.map(doc => {
          const docType = doc.meta?.docType || 'invoice';
          // History rows show the frozen total when present, else the shared
          // calculator, always formatted per the document's own currency and
          // number format (M3/L2).
          const frozenDocTotal = (doc.total === undefined || doc.total === null) ? NaN : Number(doc.total);
          const docTotal = formatMoney(
            Number.isFinite(frozenDocTotal) ? frozenDocTotal : calculateTotal(doc),
            doc.meta?.currency || '$',
            doc.meta?.numberFormat || 'international'
          );
          const docDate = doc.updatedAt ? new Date(doc.updatedAt).toLocaleDateString() : '';
          return `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 10px; background:#ffffff; border:1px solid #e2e8f0; border-radius:6px; margin-bottom:4px;">
              <div>
                <span style="font-size:12px; font-weight:700; color:#0f172a;">${appEscapeHtml(doc.meta?.number || 'Doc')}</span>
                <span style="font-size:9.5px; font-weight:700; padding:1px 5px; border-radius:3px; background:#e0f2fe; color:#0369a1; text-transform:uppercase; margin-left:4px;">${appEscapeHtml(docType)}</span>
                <span style="font-size:11px; color:#64748b; margin-left:6px;">${docDate} &bull; ${docTotal}</span>
                ${doc.convertedToNumber ? `<div style="font-size:10.5px; color:#0369a1; margin-top:2px;">Converted to ${appEscapeHtml(doc.convertedToNumber)}</div>` : ''}
                ${doc.sourceDocNumber ? `<div style="font-size:10.5px; color:#7c3aed; margin-top:2px;">From ${appEscapeHtml(doc.sourceDocNumber)}</div>` : ''}
              </div>
              <button class="btn btn-primary btn-xs btn-load-client-subdoc" data-doc-id="${appEscapeHtml(doc.id)}">Load</button>
            </div>
          `;
        }).join('')}
      </div>
    ` : '';

    return `
      <div style="padding:12px 14px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px;">
        <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px;">
          <div>
            <div style="font-size:13.5px; font-weight:700; color:#0f172a; display:flex; align-items:center; gap:8px;">
              ${appEscapeHtml(c.name)}
              ${docCountLabel}
            </div>
            <div style="font-size:11.5px; color:#64748b; margin-top:3px;">
              ${appEscapeHtml(c.email || 'No email')} ${c.phone ? ' &bull; ' + appEscapeHtml(c.phone) : ''} ${c.taxId ? ' &bull; Tax: ' + appEscapeHtml(c.taxId) : ''}
            </div>
          </div>
          <div style="display:flex; gap:6px; align-items:center;">
            ${clientDocs.length > 0 ? `<button class="btn btn-secondary btn-sm btn-toggle-client-history" data-client-id="${appEscapeHtml(c.id)}">History (${clientDocs.length})</button>` : ''}
            <button class="btn btn-primary btn-sm btn-select-client" data-id="${appEscapeHtml(c.id)}" title="Fill this client into current document">Use Client</button>
            <button class="btn btn-secondary btn-sm btn-new-for-client" data-id="${appEscapeHtml(c.id)}" title="Start fresh document for this client">+ New Doc</button>
            <button class="btn btn-danger btn-sm btn-icon btn-del-client" data-id="${appEscapeHtml(c.id)}" title="Delete client">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </div>
        ${docsDrawerHtml}
      </div>
    `;
  }).join('');

  // Bind History toggle buttons
  container.querySelectorAll('.btn-toggle-client-history').forEach(btn => {
    btn.addEventListener('click', () => {
      const drawer = document.getElementById(`client-drawer-${btn.dataset.clientId}`);
      if (drawer) {
        const isHidden = drawer.style.display === 'none';
        drawer.style.display = isHidden ? 'block' : 'none';
        btn.textContent = isHidden ? 'Hide History' : `History (${drawer.querySelectorAll('.btn-load-client-subdoc').length})`;
      }
    });
  });

  // Bind loading a sub-document from client history
  container.querySelectorAll('.btn-load-client-subdoc').forEach(btn => {
    btn.addEventListener('click', async () => {
      await openDocumentInEditor(btn.dataset.docId);
    });
  });

  // Bind Use Client
  container.querySelectorAll('.btn-select-client').forEach(btn => {
    btn.addEventListener('click', async () => {
      const match = clients.find(c => c.id === btn.dataset.id);
      if (match) {
        currentInvoice.client = {
          id: match.id,
          name: match.name,
          email: match.email || '',
          phone: match.phone || '',
          address: match.address || '',
          taxId: match.taxId || ''
        };
        currentInvoice.clientId = match.id;
        populateFormFields();
        updateSheetView();
        triggerAutoSave();
        closeModal('modal-clients');
        navigateTo('compose');
      }
    });
  });

  // Bind + New Doc for Client
  container.querySelectorAll('.btn-new-for-client').forEach(btn => {
    btn.addEventListener('click', async () => {
      const match = clients.find(c => c.id === btn.dataset.id);
      if (match) {
        closeModal('modal-clients');
        await requestNewDocument(activeDocType(), match);
      }
    });
  });

  // Bind Delete Client
  container.querySelectorAll('.btn-del-client').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (confirm('Permanently delete this client from your address book?')) {
        await deleteClient(btn.dataset.id);
        await renderClientsList();
        await notifyDataChanged();
      }
    });
  });
}

// ============================================================================
// 12. CANVAS ZOOM CONTROLS
// ============================================================================
function attachZoomListeners() {
  const container = document.getElementById('sheet-container');
  const indicator = document.getElementById('scale-indicator');
  if (!container || !indicator) return;

  const updateZoom = () => {
    container.style.transform = `scale(${canvasZoom})`;
    indicator.textContent = Math.round(canvasZoom * 100) + '%';
  };

  document.getElementById('btn-zoom-in').addEventListener('click', () => {
    if (canvasZoom < 1.4) {
      canvasZoom = Math.round((canvasZoom + 0.1) * 10) / 10;
      updateZoom();
    }
  });

  document.getElementById('btn-zoom-out').addEventListener('click', () => {
    if (canvasZoom > 0.5) {
      canvasZoom = Math.round((canvasZoom - 0.1) * 10) / 10;
      updateZoom();
    }
  });

  document.getElementById('btn-zoom-fit').addEventListener('click', () => {
    canvasZoom = 0.85;
    updateZoom();
  });

  const pageBadge = document.getElementById('canvas-page-badge');
  if (pageBadge) {
    pageBadge.addEventListener('click', () => {
      showPageBreakGuides = !showPageBreakGuides;
      updateDocumentPaginationLive();
    });
  }
}

// ============================================================================
// 13. AUTO-SAVE DEBOUNCER
// ============================================================================
function triggerAutoSave() {
  documentEdited = true;
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(async () => {
    try {
      autosaveInFlight = saveActiveDraft(currentInvoice, { activeCompanyProfileId, documentEdited });
      await autosaveInFlight;
    } catch (e) {
      console.warn('Auto-save error:', e);
    } finally {
      autosaveInFlight = null;
      autoSaveTimer = null;
    }
  }, 600);
}

function appEscapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// First-run accessibility + keyboard upgrade (progressive enhancement, no layout change).
function enhanceAccessibility() {
  try {
    // Close (×) buttons need accessible names.
    document.querySelectorAll('.app-modal .modal-header .btn').forEach(btn => {
      if ((btn.textContent || '').trim() === '×' && !btn.getAttribute('aria-label')) {
        btn.setAttribute('aria-label', 'Close dialog');
      }
    });
    // Pills expose expanded state.
    document.querySelectorAll('#sidebar-pills-bar .nav-pill').forEach(pill => {
      const target = pill.dataset.target;
      if (target && !pill.hasAttribute('aria-controls')) pill.setAttribute('aria-controls', target);
      if (!pill.hasAttribute('aria-expanded')) {
        pill.setAttribute('aria-expanded', pill.classList.contains('active') ? 'true' : 'false');
      }
    });
    // Doc-type cards: keep aria-checked in sync + keyboard activation.
    const cards = document.querySelectorAll('#doc-type-cards-grid .doc-type-card');
    cards.forEach(card => {
      if (!card.hasAttribute('tabindex')) card.setAttribute('tabindex', '0');
      if (!card.hasAttribute('role')) card.setAttribute('role', 'radio');
      if (!card.hasAttribute('aria-label')) {
        const t = card.querySelector('.doc-type-card-title');
        card.setAttribute('aria-label', t ? t.textContent.trim() : (card.dataset.type || 'document type'));
      }
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          card.click();
        }
      });
    });
    // Color swatches: keyboard operable.
    document.querySelectorAll('.color-swatch').forEach(sw => {
      if (!sw.hasAttribute('tabindex')) sw.setAttribute('tabindex', '0');
      if (!sw.hasAttribute('role')) sw.setAttribute('role', 'button');
      if (!sw.hasAttribute('aria-label')) sw.setAttribute('aria-label', 'Accent color ' + (sw.dataset.color || ''));
      sw.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          sw.click();
        }
      });
    });
    // Live regions for dynamic status text.
    ['scale-indicator', 'canvas-page-text'].forEach(id => {
      const el = document.getElementById(id);
      if (el && !el.hasAttribute('aria-live')) el.setAttribute('aria-live', 'polite');
    });
    // Upload preview image needs alt.
    const upImg = document.getElementById('upload-preview-img');
    if (upImg && !upImg.getAttribute('alt')) upImg.setAttribute('alt', 'Uploaded logo preview');
  } catch (e) {}
}

function syncDocTypeCardA11y(docType) {
  try {
    document.querySelectorAll('#doc-type-cards-grid .doc-type-card').forEach(card => {
      card.setAttribute('aria-checked', card.dataset.type === docType ? 'true' : 'false');
    });
    document.querySelectorAll('#sidebar-pills-bar .nav-pill').forEach(pill => {
      const sec = document.getElementById(pill.dataset.target);
      pill.setAttribute('aria-expanded', sec && sec.style.display !== 'none' ? 'true' : 'false');
    });
  } catch (e) {}
}

function generateId(prefix) {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return (prefix || 'id_') + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    }
  } catch (e) {}
  return (prefix || 'id_') + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
}

function isValidLogoDataUri(uri) {
  if (!uri || typeof uri !== 'string') return false;
  return /^data:image\/(png|jpeg|jpg|webp|gif|svg\+xml);base64,/i.test(uri) ||
    /^data:image\/svg\+xml(;charset=[^;,]+)?(;base64)?,/i.test(uri);
}

function formatTaxId(taxId, defaultPrefix = 'Tax ID') {
  if (!taxId || !taxId.trim()) return '';
  const trimmed = taxId.trim();
  const lower = trimmed.toLowerCase();

  // If already starts with a common recognized tax prefix, preserve it cleanly
  if (lower.startsWith('tax id') || lower.startsWith('tax:') || lower.startsWith('gstin') || 
      lower.startsWith('gst') || lower.startsWith('vat') || lower.startsWith('ein') || 
      lower.startsWith('pan') || lower.startsWith('abn')) {
    return trimmed;
  }

  // Check for Indian 15-character GSTIN format
  if (/^[0-9]{2}[a-zA-Z]{5}[0-9]{4}[a-zA-Z]{1}[1-9a-zA-Z]{1}[zZ]{1}[0-9a-zA-Z]{1}$/.test(trimmed)) {
    return `GSTIN: ${trimmed.toUpperCase()}`;
  }

  // Check for Indian 10-character PAN format
  if (/^[a-zA-Z]{5}[0-9]{4}[a-zA-Z]{1}$/.test(trimmed)) {
    return `PAN: ${trimmed.toUpperCase()}`;
  }

  return `${defaultPrefix}: ${trimmed}`;
}

function isDummyApexPayment(text) {
  if (!text) return false;
  return text.includes('First National Tech Bank') || text.includes('pay@apexstudio.io') || text.includes('FNTB-US-33');
}

// ============================================================================
// 13. LIVE A4 PAGINATION ENGINE
// ============================================================================
let showPageBreakGuides = false; // Kept false by default to prevent intrusive dashed lines across the invoice canvas

function updateDocumentPaginationLive() {
  const sheet = document.getElementById('invoice-sheet');
  const badge = document.getElementById('canvas-page-badge');
  const textEl = document.getElementById('canvas-page-text');
  if (!sheet || !badge || !textEl) return;

  // Measuring a hidden sheet returns 0 and would corrupt the page badge.
  // It is recomputed when the Compose route becomes visible.
  if (document.body.dataset.view && document.body.dataset.view !== 'compose') return;
  if (getCurrentView() !== 'compose') return;
  if (!sheet.offsetParent) return;

  requestAnimationFrame(() => {
    // 297mm standard A4 height in pixels at standard 96 DPI: 297 * 96 / 25.4 = 1122.52px
    const a4PageHeightPx = 1122;
    const contentHeight = sheet.scrollHeight;

    // Buffer tolerance for subpixel antialiasing & screen vs print padding disparity
    // On screen, the sheet has min-height: 297mm (1122px). If content is within 1195px,
    // it will comfortably fit in a single 1-page A4 print due to tight print margins.
    let estimatedPages = 1;
    if (contentHeight > 1195) {
      estimatedPages = Math.max(1, Math.ceil((contentHeight - 40) / a4PageHeightPx));
    }

    if (estimatedPages === 1) {
      badge.classList.remove('multi-page');
      textEl.textContent = 'A4: 1 Page';
      badge.title = 'Document fits cleanly on 1 single page (A4). Click to toggle visual boundary guides.';
    } else {
      badge.classList.add('multi-page');
      textEl.textContent = `A4: ${estimatedPages} Pages`;
      badge.title = `Document spans across ${estimatedPages} pages. Table headers will automatically repeat at the top of each page when printing. Click to toggle visual boundary guides.`;
    }

    if (showPageBreakGuides) {
      badge.classList.add('guides-active');
    } else {
      badge.classList.remove('guides-active');
    }

    renderVisualPageBreakGuides(sheet, estimatedPages, a4PageHeightPx);
  });
}

function renderVisualPageBreakGuides(sheet, totalPages, pageHeightPx) {
  // Always clean up existing guide lines
  sheet.querySelectorAll('.canvas-page-break-line').forEach(el => el.remove());

  // Only render visual guide lines if multi-page AND user explicitly enabled guides
  if (totalPages <= 1 || !showPageBreakGuides) return;

  for (let p = 1; p < totalPages; p++) {
    const guide = document.createElement('div');
    guide.className = 'canvas-page-break-line';
    guide.style.top = `${p * pageHeightPx}px`;
    guide.setAttribute('data-page-label', `Page ${p + 1} Boundary (A4)`);
    sheet.appendChild(guide);
  }
}

window.addEventListener('resize', () => {
  if (document.body.dataset.view === 'compose' && getCurrentView() === 'compose') {
    updateDocumentPaginationLive();
  }
});


