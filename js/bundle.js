/**
 * InvoiceCraft Standalone Bundle
 * 100% Client-Side Plug-and-Play (Runs on both http:// and file://)
 */
(function() {
  'use strict';

  // --- 1. IndexedDB Engine ---
  /**
 * InvoiceCraftDB - IndexedDB Storage Layer
 * Privacy-first, local-only client-side database for invoices, clients, and assets.
 */

const DB_NAME = 'InvoiceCraftDB';
const DB_VERSION = 2;

let dbInstance = null;
async function openDB() {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    let request;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (e) {
      reject(e);
      return;
    }

    request.onblocked = () => {
      console.warn('IndexedDB upgrade blocked by another open tab. Close other tabs and retry.');
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Invoices store
      if (!db.objectStoreNames.contains('invoices')) {
        const invStore = db.createObjectStore('invoices', { keyPath: 'id' });
        invStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        invStore.createIndex('invoiceNumber', 'invoiceNumber', { unique: false });
      }

      // Clients store for quick auto-fill
      if (!db.objectStoreNames.contains('clients')) {
        const clientStore = db.createObjectStore('clients', { keyPath: 'id' });
        clientStore.createIndex('name', 'name', { unique: false });
      }

      // Multiple Companies store
      if (!db.objectStoreNames.contains('companies')) {
        const compStore = db.createObjectStore('companies', { keyPath: 'id' });
        compStore.createIndex('name', 'name', { unique: false });
        compStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }

      // Settings and drafts store
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      dbInstance.onversionchange = () => {
        try { dbInstance.close(); } catch (e) {}
        dbInstance = null;
      };
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      console.error('IndexedDB open error:', event.target.error);
      reject(event.target.error);
    };
  });
}

function makeId(prefix) {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return prefix + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    }
  } catch (e) {}
  return prefix + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
}

// Invoices CRUD
async function saveInvoice(invoice) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(['invoices'], 'readwrite');
    } catch (e) {
      reject(e);
      return;
    }
    const store = tx.objectStore('invoices');
    if (!invoice.id) invoice.id = makeId('inv_');
    invoice.updatedAt = Date.now();
    const req = store.put(invoice);
    req.onsuccess = () => resolve(invoice.id);
    req.onerror = () => reject(req.error);
    tx.onerror = () => reject(tx.error || req.error);
    tx.onabort = () => reject(tx.error || new Error('Save aborted (quota exceeded?)'));
  });
}
async function getInvoice(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['invoices'], 'readonly');
    const store = tx.objectStore('invoices');
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}
async function getAllInvoices() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['invoices'], 'readonly');
    const store = tx.objectStore('invoices');
    const index = store.index('updatedAt');
    const req = index.getAll();
    req.onsuccess = () => {
      // Return sorted newest first
      const results = req.result || [];
      results.reverse();
      resolve(results);
    };
    req.onerror = () => reject(req.error);
  });
}
async function deleteInvoice(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['invoices'], 'readwrite');
    const store = tx.objectStore('invoices');
    const req = store.delete(id);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

// Auto-saved Draft State
async function saveActiveDraft(draft) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['settings'], 'readwrite');
    const store = tx.objectStore('settings');
    const req = store.put({ key: 'activeDraft', data: draft, updatedAt: Date.now() });
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}
async function getActiveDraft() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['settings'], 'readonly');
    const store = tx.objectStore('settings');
    const req = store.get('activeDraft');
    req.onsuccess = () => resolve(req.result ? req.result.data : null);
    req.onerror = () => reject(req.error);
  });
}

// Multiple Company Profiles CRUD
async function saveCompany(company) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['companies'], 'readwrite');
    const store = tx.objectStore('companies');
    if (!company.id) company.id = makeId('comp_');
    company.updatedAt = Date.now();
    if (!company.createdAt) company.createdAt = Date.now();
    const req = store.put(company);
    req.onsuccess = () => resolve(company);
    req.onerror = () => reject(req.error);
  });
}
async function getCompany(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['companies'], 'readonly');
    const store = tx.objectStore('companies');
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}
async function getAllCompanies() {
  const db = await openDB();
  return new Promise(async (resolve, reject) => {
    try {
      const tx = db.transaction(['companies'], 'readonly');
      const store = tx.objectStore('companies');
      const req = store.getAll();
      req.onsuccess = async () => {
        let list = req.result || [];
        // If no companies found in companies store yet, check legacy settings
        if (list.length === 0) {
          const legacy = await getLegacyProfile();
          if (legacy && legacy.name) {
            const migrated = {
              id: 'comp_default',
              name: legacy.name,
              email: legacy.email || '',
              phone: legacy.phone || '',
              address: legacy.address || '',
              taxId: legacy.taxId || '',
              payment: '',
              isDefault: true,
              createdAt: Date.now(),
              updatedAt: Date.now()
            };
            await saveCompany(migrated);
            list = [migrated];
          }
        }
        // Sort default first, then newest
        list.sort((a, b) => {
          if (a.isDefault && !b.isDefault) return -1;
          if (!a.isDefault && b.isDefault) return 1;
          return (b.updatedAt || 0) - (a.updatedAt || 0);
        });
        resolve(list);
      };
      req.onerror = () => reject(req.error);
    } catch (e) {
      reject(e);
    }
  });
}
async function deleteCompany(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['companies'], 'readwrite');
    const store = tx.objectStore('companies');
    const req = store.delete(id);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}
async function setDefaultCompany(id) {
  const db = await openDB();
  const companies = await getAllCompanies();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['companies'], 'readwrite');
    const store = tx.objectStore('companies');
    for (const c of companies) {
      c.isDefault = (c.id === id);
      c.updatedAt = Date.now();
      store.put(c);
    }
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}
async function getDefaultCompany() {
  const companies = await getAllCompanies();
  if (companies.length > 0) {
    const def = companies.find(c => c.isDefault);
    return def || companies[0];
  }
  return null;
}

async function getLegacyProfile() {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(['settings'], 'readonly');
      const store = tx.objectStore('settings');
      const req = store.get('companyProfile');
      req.onsuccess = () => resolve(req.result ? req.result.data : null);
      req.onerror = () => resolve(null);
    });
  } catch (e) {
    return null;
  }
}

// Company Profile (Sender Defaults backward compatibility)
async function saveCompanyProfile(profile) {
  const db = await openDB();
  if (profile && profile.name) {
    const comp = {
      id: profile.id || makeId('comp_'),
      name: profile.name,
      email: profile.email || '',
      phone: profile.phone || '',
      address: profile.address || '',
      taxId: profile.taxId || '',
      payment: profile.payment || '',
      isDefault: true,
      updatedAt: Date.now()
    };
    await saveCompany(comp);
    await setDefaultCompany(comp.id);
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['settings'], 'readwrite');
    const store = tx.objectStore('settings');
    const req = store.put({ key: 'companyProfile', data: profile });
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}
async function getCompanyProfile() {
  const def = await getDefaultCompany();
  if (def) return def;
  return await getLegacyProfile();
}

// Clients Directory
async function saveClient(client) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['clients'], 'readwrite');
    const store = tx.objectStore('clients');
    if (!client.id) client.id = makeId('client_');
    client.updatedAt = Date.now();
    const req = store.put(client);
    req.onsuccess = () => resolve(client);
    req.onerror = () => reject(req.error);
  });
}
async function getAllClients() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['clients'], 'readonly');
    const store = tx.objectStore('clients');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}
async function deleteClient(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['clients'], 'readwrite');
    const store = tx.objectStore('clients');
    const req = store.delete(id);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

// Numbering Engine Settings
const DEFAULT_NUMBERING_CONFIG = {
  mode: 'auto', // 'auto' | 'manual'
  scheme: '{PREFIX}/{FY}/{COUNTER}', // '{PREFIX}/{FY}/{COUNTER}' | '{PREFIX}-{YYYY}-{COUNTER}' | '{PREFIX}/{YYYY}-{MM}/{COUNTER}' | '{PREFIX}-{COUNTER}' | custom
  prefixInvoice: 'INV',
  prefixQuotation: 'QT',
  prefixEstimate: 'EST',
  prefixProforma: 'PI',
  counter: 1, // current / next sequence counter
  startingCounter: 1, // base counter to reset to
  padding: 4, // e.g. 4 -> 0001
  resetPeriod: 'financial_year', // 'never' | 'financial_year' | 'calendar_year' | 'monthly'
  lastPeriodKey: '', // e.g. '2025-26' or '2026' or '2026-09'
  updatedAt: Date.now()
};
async function saveNumberingConfig(config) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['settings'], 'readwrite');
    const store = tx.objectStore('settings');
    const req = store.put({ key: 'numberingConfig', data: config });
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}
async function getNumberingConfig() {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(['settings'], 'readonly');
      const store = tx.objectStore('settings');
      const req = store.get('numberingConfig');
      req.onsuccess = () => {
        if (req.result && req.result.data) {
          resolve(Object.assign({}, DEFAULT_NUMBERING_CONFIG, req.result.data));
        } else {
          resolve(Object.assign({}, DEFAULT_NUMBERING_CONFIG));
        }
      };
      req.onerror = () => resolve(Object.assign({}, DEFAULT_NUMBERING_CONFIG));
    });
  } catch (e) {
    return Object.assign({}, DEFAULT_NUMBERING_CONFIG);
  }
}

// Full Backup Export / Import
async function exportAllData() {
  const db = await openDB();
  const invoices = await getAllInvoices();
  const clients = await getAllClients();
  const companies = await getAllCompanies();
  const profile = await getCompanyProfile();
  const numberingConfig = await getNumberingConfig();

  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    invoices,
    clients,
    companies,
    profile,
    numberingConfig
  };
}

function txComplete(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error || new Error('Import transaction failed'));
    tx.onabort = () => reject(tx.error || new Error('Import transaction aborted'));
  });
}
async function importAllData(data) {
  const db = await openDB();
  if (!data || typeof data !== 'object') throw new Error('Invalid backup format');

  const hasAnyPayload = Array.isArray(data.invoices) || Array.isArray(data.clients) ||
    Array.isArray(data.companies) || data.profile || data.numberingConfig;
  if (!hasAnyPayload) throw new Error('Backup contains no invoices, clients, companies, or settings');

  if (data.version !== undefined && data.version !== 2) {
    console.warn('Backup version mismatch (expected 2, got ' + data.version + '). Attempting best-effort import.');
  }

  if (Array.isArray(data.invoices)) {
    for (const inv of data.invoices) {
      if (!inv || typeof inv.id !== 'string' || !inv.id) {
        throw new Error('Invalid invoice record in backup (missing string id)');
      }
    }
    const tx = db.transaction(['invoices'], 'readwrite');
    const store = tx.objectStore('invoices');
    for (const inv of data.invoices) {
      store.put(inv);
    }
    await txComplete(tx);
  }

  if (Array.isArray(data.clients)) {
    for (const c of data.clients) {
      if (!c || typeof c.id !== 'string' || !c.id) {
        throw new Error('Invalid client record in backup (missing string id)');
      }
    }
    const tx = db.transaction(['clients'], 'readwrite');
    const store = tx.objectStore('clients');
    for (const c of data.clients) {
      store.put(c);
    }
    await txComplete(tx);
  }

  if (Array.isArray(data.companies)) {
    // Skip duplicates already present via profile import path: dedupe by id.
    const seen = new Set();
    const deduped = [];
    for (const comp of data.companies) {
      if (!comp || typeof comp.id !== 'string' || !comp.id) {
        throw new Error('Invalid company record in backup (missing string id)');
      }
      if (!seen.has(comp.id)) {
        seen.add(comp.id);
        deduped.push(comp);
      }
    }
    const tx = db.transaction(['companies'], 'readwrite');
    const store = tx.objectStore('companies');
    for (const comp of deduped) {
      // If profile payload carries the same company id, prefer the companies[] copy
      // and skip the legacy double-write below.
      store.put(comp);
    }
    await txComplete(tx);
  }

  if (data.profile) {
    const profileId = data.profile.id;
    let alreadyImported = false;
    if (profileId && Array.isArray(data.companies)) {
      alreadyImported = data.companies.some(c => c && c.id === profileId);
    }
    if (!alreadyImported) {
      await saveCompanyProfile(data.profile);
    } else if (profileId) {
      try { await setDefaultCompany(profileId); } catch (e) { console.warn(e); }
    }
  }

  if (data.numberingConfig) {
    if (typeof data.numberingConfig !== 'object') throw new Error('Invalid numberingConfig in backup');
    const merged = Object.assign({}, DEFAULT_NUMBERING_CONFIG, data.numberingConfig);
    await saveNumberingConfig(merged);
  }

  return true;
}


  // --- 2. Icon Library & Monogram Generator ---
  /**
 * Curated Open SVG Business Icons & Brand Lockup Generator
 * Supports 40+ vector icons across 7 industries and comprehensive Brand Lockups
 * (Icon/Monogram + Company Wordmark + Subtitle Tagline + Decorative Underlines).
 */
const ICON_CATEGORIES = [
  { id: 'tech', label: 'Tech & Dev' },
  { id: 'finance', label: 'Finance & Tax' },
  { id: 'legal', label: 'Legal & Consulting' },
  { id: 'creative', label: 'Design & Media' },
  { id: 'trades', label: 'Trades & Home' },
  { id: 'retail', label: 'Retail & Logistics' },
  { id: 'abstract', label: 'Geometric Badges' }
];
const ICONS = [
  // Tech & Dev
  {
    id: 'terminal',
    category: 'tech',
    name: 'Terminal Console',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>`
  },
  {
    id: 'code',
    category: 'tech',
    name: 'Code Brackets',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>`
  },
  {
    id: 'cpu',
    category: 'tech',
    name: 'Microchip CPU',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect><rect x="9" y="9" width="6" height="6"></rect><line x1="9" y1="1" x2="9" y2="4"></line><line x1="15" y1="1" x2="15" y2="4"></line><line x1="9" y1="20" x2="9" y2="23"></line><line x1="15" y1="20" x2="15" y2="23"></line><line x1="20" y1="9" x2="23" y2="9"></line><line x1="20" y1="14" x2="23" y2="14"></line><line x1="1" y1="9" x2="4" y2="9"></line><line x1="1" y1="14" x2="4" y2="14"></line></svg>`
  },
  {
    id: 'cloud',
    category: 'tech',
    name: 'Cloud Infrastructure',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"></path></svg>`
  },
  {
    id: 'database',
    category: 'tech',
    name: 'Database Storage',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg>`
  },
  {
    id: 'zap',
    category: 'tech',
    name: 'Lightning Fast',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`
  },

  // Finance & Tax
  {
    id: 'briefcase',
    category: 'finance',
    name: 'Executive Briefcase',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>`
  },
  {
    id: 'chart-trending',
    category: 'finance',
    name: 'Growth Analytics',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>`
  },
  {
    id: 'receipt',
    category: 'finance',
    name: 'Ledger Receipt',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1z"></path><line x1="8" y1="8" x2="16" y2="8"></line><line x1="8" y1="12" x2="16" y2="12"></line><line x1="8" y1="16" x2="12" y2="16"></line></svg>`
  },
  {
    id: 'vault',
    category: 'finance',
    name: 'Safe Vault',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"></rect><circle cx="12" cy="12" r="3"></circle><line x1="12" y1="9" x2="12" y2="7"></line><line x1="15" y1="12" x2="17" y2="12"></line><line x1="12" y1="15" x2="12" y2="17"></line><line x1="9" y1="12" x2="7" y2="12"></line></svg>`
  },
  {
    id: 'credit-card',
    category: 'finance',
    name: 'Payment Card',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>`
  },

  // Legal & Consulting
  {
    id: 'scale',
    category: 'legal',
    name: 'Scales of Justice',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"></path><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"></path><path d="M7 21h10"></path><path d="M12 3v18"></path><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"></path></svg>`
  },
  {
    id: 'shield-check',
    category: 'legal',
    name: 'Security Shield',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><polyline points="9 12 11 14 15 10"></polyline></svg>`
  },
  {
    id: 'landmark',
    category: 'legal',
    name: 'Institution Pillars',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="21" x2="21" y2="21"></line><line x1="6" y1="18" x2="6" y2="11"></line><line x1="10" y1="18" x2="10" y2="11"></line><line x1="14" y1="18" x2="14" y2="11"></line><line x1="18" y1="18" x2="18" y2="11"></line><polygon points="12 2 20 7 4 7 12 2"></polygon></svg>`
  },
  {
    id: 'award',
    category: 'legal',
    name: 'Quality Award',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="7"></circle><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"></polyline></svg>`
  },

  // Creative & Media
  {
    id: 'pen-tool',
    category: 'creative',
    name: 'Vector Pen Tool',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19 7-7 3 3-7 7-3-3z"></path><path d="m18 13-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path><path d="m2 2 7.586 7.586"></path><circle cx="11" cy="11" r="2"></circle></svg>`
  },
  {
    id: 'palette',
    category: 'creative',
    name: 'Design Palette',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r=".5"></circle><circle cx="17.5" cy="10.5" r=".5"></circle><circle cx="8.5" cy="7.5" r=".5"></circle><circle cx="6.5" cy="12.5" r=".5"></circle><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"></path></svg>`
  },
  {
    id: 'camera',
    category: 'creative',
    name: 'Studio Camera',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>`
  },
  {
    id: 'layers',
    category: 'creative',
    name: 'Modular Layers',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>`
  },
  {
    id: 'feather',
    category: 'creative',
    name: 'Editorial Quill',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z"></path><line x1="16" y1="8" x2="2" y2="22"></line><line x1="17.5" y1="15" x2="9" y2="15"></line></svg>`
  },

  // Trades & Home
  {
    id: 'hammer',
    category: 'trades',
    name: 'Craftsman Hammer',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 12-8.5 8.5c-.83.83-2.17.83-3 0 0 0 0 0 0 0a2.12 2.12 0 0 1 0-3L12 9"></path><path d="M17.64 15 22 10.64"></path><path d="m20.91 3.26-6.5 6.5"></path><path d="m14.56 2.05 4.3 4.3"></path><path d="m4.93 4.93 4.24 4.24"></path></svg>`
  },
  {
    id: 'wrench',
    category: 'trades',
    name: 'Mechanic Wrench',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>`
  },
  {
    id: 'home',
    category: 'trades',
    name: 'Architect Home',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>`
  },
  {
    id: 'compass',
    category: 'trades',
    name: 'Drafting Compass',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon></svg>`
  },

  // Retail & Logistics
  {
    id: 'shopping-bag',
    category: 'retail',
    name: 'Boutique Bag',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>`
  },
  {
    id: 'package',
    category: 'retail',
    name: 'Parcel Delivery',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"></line><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>`
  },
  {
    id: 'truck',
    category: 'retail',
    name: 'Freight Logistics',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>`
  },
  {
    id: 'globe',
    category: 'retail',
    name: 'Global Enterprise',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>`
  },

  // Abstract & Badges
  {
    id: 'hexagon',
    category: 'abstract',
    name: 'Hexagon Apex',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path></svg>`
  },
  {
    id: 'infinity',
    category: 'abstract',
    name: 'Infinity Loop',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18.178 8c5.096 0 5.096 8 0 8-2.617 0-4.636-2.073-6.178-4-1.542-1.927-3.561-4-6.178-4-5.096 0-5.096 8 0 8 2.617 0 4.636-2.073 6.178-4 1.542-1.927 3.561-4 6.178-4z"></path></svg>`
  },
  {
    id: 'target',
    category: 'abstract',
    name: 'Precision Target',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>`
  },
  {
    id: 'sparkles',
    category: 'abstract',
    name: 'Modern Sparkle',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"></path></svg>`
  }
];

/**
 * Estimate visual text width in pixels
 */
function estimateTextWidth(text, fontSize, isUppercase = false, letterSpacing = 0) {
  if (!text) return 0;
  const str = isUppercase ? text.toUpperCase() : text;
  let total = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if ('ilI|:;.!\''.includes(ch)) total += fontSize * 0.28;
    else if ('mwMW_@#%'.includes(ch)) total += fontSize * 0.88;
    else if (ch === ' ') total += fontSize * 0.32;
    else if (ch >= 'A' && ch <= 'Z') total += fontSize * 0.68;
    else total += fontSize * 0.58;
  }
  total += Math.max(0, str.length - 1) * letterSpacing;
  return Math.round(total);
}

/**
 * Generate a standalone SVG element for a symbol (Monogram or Icon)
 */
function renderSymbolSVG(symbolType, initials, shape, iconId, markColor, bgColor, emblemStyle = 'solid') {
  markColor = markColor || '#2563eb';
  bgColor = bgColor || 'transparent';

  if (symbolType === 'icon') {
    const icon = ICONS.find(i => i.id === iconId) || ICONS[0];
    let bgShape = '';
    const shapeFill = bgColor !== 'transparent' ? bgColor : markColor;
    let fillAttr = `fill="${shapeFill}"`;
    let strokeAttr = '';
    if (emblemStyle === 'outline') {
      fillAttr = 'fill="transparent"';
      strokeAttr = `stroke="${shapeFill}" stroke-width="2.5"`;
    } else if (emblemStyle === 'soft') {
      fillAttr = `fill="${shapeFill}" fill-opacity="0.14"`;
    }

    if (shape === 'circle') bgShape = `<circle cx="28" cy="28" r="26" ${fillAttr} ${strokeAttr} />`;
    else if (shape === 'squircle') bgShape = `<rect x="3" y="3" width="50" height="50" rx="14" ${fillAttr} ${strokeAttr} />`;
    else if (shape === 'square') bgShape = `<rect x="3" y="3" width="50" height="50" rx="8" ${fillAttr} ${strokeAttr} />`;

    const iconColor = (emblemStyle === 'outline' || emblemStyle === 'soft') ? shapeFill : markColor;
    const iconInner = icon.svg
      .replace('stroke="currentColor"', `stroke="${iconColor}"`)
      .replace(/viewBox="[^"]*"/, 'viewBox="0 0 24 24" x="12" y="12" width="32" height="32"');

    return `<g>${bgShape}${iconInner}</g>`;
  }

  // Monogram Symbol
  const cleanInitials = escapeXml((initials || 'AB').substring(0, 3).toUpperCase());
  const fillCol = bgColor !== 'transparent' ? bgColor : markColor;
  let fillAttr = `fill="${fillCol}"`;
  let strokeAttr = '';
  let letterColor = '#ffffff';

  if (emblemStyle === 'outline') {
    fillAttr = 'fill="transparent"';
    strokeAttr = `stroke="${fillCol}" stroke-width="2.5"`;
    letterColor = fillCol;
  } else if (emblemStyle === 'soft') {
    fillAttr = `fill="${fillCol}" fill-opacity="0.14"`;
    letterColor = fillCol;
  } else {
    letterColor = (bgColor !== 'transparent' && markColor === '#ffffff') ? '#ffffff' : (bgColor !== 'transparent' ? markColor : '#ffffff');
  }

  let shapePath = '';
  if (shape === 'circle') shapePath = `<circle cx="28" cy="28" r="26" ${fillAttr} ${strokeAttr} />`;
  else if (shape === 'squircle') shapePath = `<rect x="3" y="3" width="50" height="50" rx="14" ${fillAttr} ${strokeAttr} />`;
  else if (shape === 'shield') shapePath = `<path d="M28 3 L50 12 L50 31 C50 42 28 53 28 53 C28 53 6 42 6 31 L6 12 Z" ${fillAttr} ${strokeAttr} />`;
  else if (shape === 'hexagon') shapePath = `<polygon points="28,3 51,15 51,41 28,53 5,41 5,15" ${fillAttr} ${strokeAttr} />`;
  else if (shape === 'diamond') shapePath = `<polygon points="28,3 53,28 28,53 3,28" ${fillAttr} ${strokeAttr} />`;
  else shapePath = `<rect x="3" y="3" width="50" height="50" rx="8" ${fillAttr} ${strokeAttr} />`;

  const fontSize = cleanInitials.length > 2 ? 16 : 20;

  return `
    <g>
      ${shapePath}
      <text x="28" y="34" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="${fontSize}" font-weight="800" fill="${letterColor}" text-anchor="middle" dominant-baseline="middle" letter-spacing="0.5">${cleanInitials}</text>
    </g>
  `;
}

/**
 * Universal XML & SVG Safe Data URI Helpers
 */
function escapeXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
function svgToDataURI(svgString) {
  try {
    if (typeof btoa === 'function') {
      return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgString)));
    }
  } catch (err) {
    console.warn('btoa encoding error, falling back:', err);
  }
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString);
}

/**
 * Generate Decorative Underline Markups
 */
function renderUnderlineSVG(style, x1, y, width, accentColor) {
  const x2 = x1 + width;
  accentColor = accentColor || '#2563eb';

  if (style === 'solid') {
    return `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${accentColor}" stroke-width="2.5" stroke-linecap="round" />`;
  }
  if (style === 'dashed') {
    return `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${accentColor}" stroke-width="2.5" stroke-dasharray="6,4" stroke-linecap="round" />`;
  }
  if (style === 'accent-pip') {
    return `
      <line x1="${x1}" y1="${y}" x2="${Math.max(x1 + 10, x2 - 8)}" y2="${y}" stroke="${accentColor}" stroke-width="2" stroke-linecap="round" />
      <circle cx="${x2}" cy="${y}" r="3" fill="${accentColor}" />
    `;
  }
  if (style === 'gradient') {
    const gradId = 'brandGrad_' + Math.abs(Math.round(x1 + y + width));
    return `
      <defs>
        <linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="${accentColor}" stop-opacity="1" />
          <stop offset="65%" stop-color="${accentColor}" stop-opacity="0.8" />
          <stop offset="100%" stop-color="${accentColor}" stop-opacity="0" />
        </linearGradient>
      </defs>
      <line x1="${x1}" y1="${y}" x2="${x2 + 15}" y2="${y}" stroke="url(#${gradId})" stroke-width="3" stroke-linecap="round" />
    `;
  }
  if (style === 'double') {
    return `
      <line x1="${x1}" y1="${y - 2}" x2="${x2}" y2="${y - 2}" stroke="${accentColor}" stroke-width="1.5" />
      <line x1="${x1}" y1="${y + 2}" x2="${x2}" y2="${y + 2}" stroke="${accentColor}" stroke-width="1.5" />
    `;
  }
  if (style === 'dots') {
    const dotsCount = Math.max(3, Math.floor(width / 12));
    let dots = '';
    for (let i = 0; i < dotsCount; i++) {
      dots += `<circle cx="${x1 + i * 12 + 3}" cy="${y}" r="2" fill="${accentColor}" />`;
    }
    return dots;
  }
  if (style === 'offset-shadow') {
    return `
      <line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="#0f172a" stroke-width="3" />
      <line x1="${x1 + 3}" y1="${y + 3}" x2="${x2 + 3}" y2="${y + 3}" stroke="${accentColor}" stroke-width="2" />
    `;
  }
  return ''; // none
}

/**
 * Complete Brand Lockup SVG Generator
 * Combines Symbol (Monogram or Icon) + Wordmark + Tagline + Underline
 */
function generateBrandLockupSVG({
  symbolType = 'monogram', // 'monogram' or 'icon'
  initials = 'AD',
  shape = 'squircle',
  emblemStyle = 'solid',   // 'solid', 'outline', 'soft'
  iconId = 'terminal',
  markColor = '#2563eb',
  bgColor = '#2563eb',
  companyName = 'Apex Studio',
  tagline = 'Design & Technology',
  underlineStyle = 'solid',    // 'none', 'solid', 'dashed', 'accent-pip', 'gradient', 'double', 'dots', 'offset-shadow'
  underlineSpan = 'auto',      // 'auto', 'title', 'short', 'extended', 'custom'
  underlineWidth = 0,          // manual pixel length if > 0
  underlinePosition = 'bottom',// 'bottom' (below tagline) or 'middle' (between title & tagline)
  layout = 'horizontal',       // 'horizontal' or 'stacked'
  textColor = '#0f172a',
  accentColor = '#2563eb'
}) {
  const sanitizedName = escapeXml(companyName || '');
  const sanitizedTag = escapeXml((tagline || '').toUpperCase());

  const symbolSVG = renderSymbolSVG(symbolType, initials, shape, iconId, markColor, bgColor, emblemStyle);

  const titleWidth = estimateTextWidth(sanitizedName, 20, false, -0.4);
  const tagWidth = sanitizedTag ? estimateTextWidth(sanitizedTag, 9, true, 1.5) : 0;
  const maxTextWidth = Math.max(titleWidth, tagWidth);

  // Compute underline length accurately matching user choice or subtext
  let lineW = Math.max(40, maxTextWidth);
  if (underlineWidth && parseInt(underlineWidth, 10) > 0) {
    lineW = parseInt(underlineWidth, 10);
  } else if (underlineSpan === 'title') {
    lineW = Math.max(30, titleWidth);
  } else if (underlineSpan === 'short') {
    lineW = 45;
  } else if (underlineSpan === 'extended') {
    lineW = maxTextWidth + 35;
  } else {
    // 'auto': exactly spans the longer of wordmark or subtitle
    lineW = Math.max(40, maxTextWidth);
  }

  if (layout === 'stacked') {
    const width = Math.max(300, Math.round(Math.max(maxTextWidth, lineW) + 60));
    const height = 120;
    const centerX = width / 2;
    const symbolX = centerX - 28;

    let yTitle = 76;
    let yTag = 94;
    let yUnderline = 104;

    if (underlinePosition === 'middle' && sanitizedTag) {
      yTitle = 72;
      yUnderline = 82;
      yTag = 96;
    }

    const startX = centerX - Math.round(lineW / 2);
    const underlineMarkup = renderUnderlineSVG(underlineStyle, startX, yUnderline, lineW, accentColor);

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
      <g transform="translate(${symbolX}, 6)">${symbolSVG}</g>
      <text x="${centerX}" y="${yTitle}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="18" font-weight="800" fill="${textColor}" text-anchor="middle" letter-spacing="-0.3">${sanitizedName}</text>
      ${sanitizedTag ? `<text x="${centerX}" y="${yTag}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="8.5" font-weight="600" fill="#64748b" text-anchor="middle" letter-spacing="1.8">${sanitizedTag}</text>` : ''}
      ${underlineMarkup}
    </svg>`;

    return svgToDataURI(svg);
  }

  // Default: Horizontal Lockup
  let yTitle = 34;
  let yTag = 50;
  let yUnderline = 62;
  let svgHeight = 74;

  if (underlinePosition === 'middle' && sanitizedTag) {
    yTitle = 28;
    yUnderline = 38;
    yTag = 54;
    svgHeight = 74;
  } else if (!sanitizedTag) {
    yTitle = 33;
    yUnderline = 46;
    svgHeight = 64;
  }

  const startX = 74;
  const underlineMarkup = renderUnderlineSVG(underlineStyle, startX, yUnderline, lineW, accentColor);
  const totalContentWidth = startX + Math.max(maxTextWidth, lineW) + 20;
  const width = Math.max(280, Math.min(560, Math.round(totalContentWidth)));

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${svgHeight}" width="${width}" height="${svgHeight}">
    <g transform="translate(6, 8)">${symbolSVG}</g>
    <text x="74" y="${yTitle}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="20" font-weight="800" fill="${textColor}" letter-spacing="-0.4">${sanitizedName}</text>
    ${sanitizedTag ? `<text x="74" y="${yTag}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="9" font-weight="600" fill="#64748b" letter-spacing="1.5">${sanitizedTag}</text>` : ''}
    ${underlineMarkup}
  </svg>`;

  return svgToDataURI(svg);
}

/**
 * Backward compatibility helpers
 */
function generateMonogramSVG(initials, shape, bgColor, textColor) {
  return generateBrandLockupSVG({
    symbolType: 'monogram',
    initials,
    shape,
    markColor: textColor,
    bgColor,
    companyName: '',
    tagline: '',
    underlineStyle: 'none',
    layout: 'horizontal'
  });
}
function generateIconDataURI(iconId, color = '#2563eb', bgColor = 'transparent', shape = 'none') {
  return generateBrandLockupSVG({
    symbolType: 'icon',
    iconId,
    shape,
    markColor: color,
    bgColor,
    companyName: '',
    tagline: '',
    underlineStyle: 'none',
    layout: 'horizontal'
  });
}


  // --- 3. App Controller ---
  /**
 * InvoiceCraft - Main Application Logic
 * 10 Models, Multi-Leg Tax Engine, Creative Logo & Brand Lockup Studio, IndexedDB Persistence, Live Sheet Renderer.
 */





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
const DOC_TYPES = {
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
    date: new Date().toISOString().split('T')[0],
    dueDate: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
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
  if (!inv.meta.docType || !DOC_TYPES[inv.meta.docType]) {
    inv.meta.docType = 'invoice';
  }
  if (inv.meta.showSignature === undefined) {
    inv.meta.showSignature = (inv.meta.docType !== 'invoice');
  }
  if (!inv.meta.number) {
    inv.meta.number = (DOC_TYPES[inv.meta.docType].prefix || 'INV-') + new Date().getFullYear() + '-001';
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
    if (item.taxRate === undefined || item.taxRate === null) {
      item.taxRate = 18;
    } else {
      item.taxRate = clampNum(item.taxRate, 0, 100, 0);
    }
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

/**
 * Currency & Number Formatter supporting Indian (Lakhs & Crores) and International (Millions) styles.
 * Indian format: 12,34,567.89
 * International format: 1,234,567.89
 */
function formatMoney(amount, currency = '', format = 'international') {
  const num = Number(amount) || 0;
  const isNeg = num < 0;
  const absNum = Math.abs(num);
  const parts = absNum.toFixed(2).split('.');
  let intPart = parts[0];
  const decPart = parts[1];

  let formattedInt = '';
  if (format === 'indian') {
    // Indian formatting: last 3 digits, then groups of 2 digits
    if (intPart.length > 3) {
      const lastThree = intPart.substring(intPart.length - 3);
      const otherNumbers = intPart.substring(0, intPart.length - 3);
      formattedInt = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + lastThree;
    } else {
      formattedInt = intPart;
    }
  } else {
    // International standard formatting: groups of 3 digits
    formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  const sign = isNeg ? '-' : '';
  const sep = (currency && (currency.length > 1 || currency === '₹')) ? ' ' : '';
  return `${sign}${currency}${currency ? sep : ''}${formattedInt}.${decPart}`;
}

/**
 * Number to Words Converter supporting Indian (Lakhs/Crores/Rupees/Paise)
 * and International (Millions/Billions/Dollars/Cents) conventions.
 */
const NUM_WORDS_ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
const NUM_WORDS_TEENS = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const NUM_WORDS_TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function convertThreeDigitsToWords(n) {
  let str = '';
  if (n >= 100) {
    str += NUM_WORDS_ONES[Math.floor(n / 100)] + ' Hundred ';
    n %= 100;
  }
  if (n >= 20) {
    str += NUM_WORDS_TENS[Math.floor(n / 10)] + (n % 10 > 0 ? '-' + NUM_WORDS_ONES[n % 10] : '') + ' ';
  } else if (n >= 10) {
    str += NUM_WORDS_TEENS[n - 10] + ' ';
  } else if (n > 0) {
    str += NUM_WORDS_ONES[n] + ' ';
  }
  return str.trim();
}

function convertInternationalToWords(num) {
  if (num === 0) return 'Zero';
  const scales = ['', 'Thousand', 'Million', 'Billion', 'Trillion', 'Quadrillion', 'Quintillion'];
  let words = [];
  let scaleIdx = 0;
  num = Math.floor(Math.abs(num));
  if (num > Number.MAX_SAFE_INTEGER) return String(Math.floor(num));
  while (num > 0) {
    const chunk = num % 1000;
    if (chunk > 0) {
      const chunkWords = convertThreeDigitsToWords(chunk);
      const scaleName = scales[scaleIdx] || '';
      words.unshift(scaleName ? `${chunkWords} ${scaleName}` : chunkWords);
    }
    num = Math.floor(num / 1000);
    scaleIdx++;
  }
  return words.join(' ').trim();
}

function convertIndianToWords(num) {
  if (num === 0) return 'Zero';
  const crore = Math.floor(num / 10000000);
  num %= 10000000;
  const lakh = Math.floor(num / 100000);
  num %= 100000;
  const thousand = Math.floor(num / 1000);
  num %= 1000;
  const remainder = num;

  let parts = [];
  if (crore > 0) {
    parts.push(convertIndianToWords(crore) + ' Crore');
  }
  if (lakh > 0) {
    parts.push(convertThreeDigitsToWords(lakh) + ' Lakh');
  }
  if (thousand > 0) {
    parts.push(convertThreeDigitsToWords(thousand) + ' Thousand');
  }
  if (remainder > 0) {
    parts.push(convertThreeDigitsToWords(remainder));
  }
  return parts.join(' ').trim();
}

function amountToWords(amount, currency = '$', format = 'international') {
  const num = Math.abs(Number(amount) || 0);
  let intPart = Math.floor(num);
  let decPart = Math.round((num - intPart) * 100);
  // Carry rounding overflow (e.g. 99.995 -> 100.00, not "One Hundred Cents").
  if (decPart === 100) {
    intPart += 1;
    decPart = 0;
  }

  const currMap = {
    '₹': { majorSingular: 'Rupee', majorPlural: 'Rupees', minorSingular: 'Paisa', minorPlural: 'Paise', leadMajor: true },
    '$': { majorSingular: 'Dollar', majorPlural: 'Dollars', minorSingular: 'Cent', minorPlural: 'Cents', leadMajor: false },
    '€': { majorSingular: 'Euro', majorPlural: 'Euros', minorSingular: 'Cent', minorPlural: 'Cents', leadMajor: false },
    '£': { majorSingular: 'Pound', majorPlural: 'Pounds', minorSingular: 'Penny', minorPlural: 'Pence', leadMajor: false },
    'C$': { majorSingular: 'Canadian Dollar', majorPlural: 'Canadian Dollars', minorSingular: 'Cent', minorPlural: 'Cents', leadMajor: false },
    'A$': { majorSingular: 'Australian Dollar', majorPlural: 'Australian Dollars', minorSingular: 'Cent', minorPlural: 'Cents', leadMajor: false },
    'AED': { majorSingular: 'UAE Dirham', majorPlural: 'UAE Dirhams', minorSingular: 'Fil', minorPlural: 'Fils', leadMajor: false },
    'SAR': { majorSingular: 'Saudi Riyal', majorPlural: 'Saudi Riyals', minorSingular: 'Halala', minorPlural: 'Halalas', leadMajor: false },
    'BHD': { majorSingular: 'Bahraini Dinar', majorPlural: 'Bahraini Dinars', minorSingular: 'Fils', minorPlural: 'Fils', leadMajor: false },
    'BD': { majorSingular: 'Bahraini Dinar', majorPlural: 'Bahraini Dinars', minorSingular: 'Fils', minorPlural: 'Fils', leadMajor: false },
    'QAR': { majorSingular: 'Qatari Riyal', majorPlural: 'Qatari Riyals', minorSingular: 'Dirham', minorPlural: 'Dirhams', leadMajor: false },
    'KWD': { majorSingular: 'Kuwaiti Dinar', majorPlural: 'Kuwaiti Dinars', minorSingular: 'Fils', minorPlural: 'Fils', leadMajor: false },
    'OMR': { majorSingular: 'Omani Rial', majorPlural: 'Omani Rials', minorSingular: 'Baisa', minorPlural: 'Baisa', leadMajor: false },
    '¥': { majorSingular: 'Yen', majorPlural: 'Yen', minorSingular: '', minorPlural: '', leadMajor: false },
    'CHF': { majorSingular: 'Swiss Franc', majorPlural: 'Swiss Francs', minorSingular: 'Rappen', minorPlural: 'Rappen', leadMajor: false }
  };

  const curr = currMap[currency] || { majorSingular: currency || '', majorPlural: currency || '', minorSingular: 'Cent', minorPlural: 'Cents', leadMajor: false };
  // Derive Indian vs International words strictly from the selected number format
  // so the sheet total (formatMoney) and the words block can never disagree.
  const isIndian = (format === 'indian');
  const intWords = isIndian ? convertIndianToWords(intPart) : convertInternationalToWords(intPart);

  const majorWord = intPart === 1 ? curr.majorSingular : curr.majorPlural;
  let result = '';
  if (curr.leadMajor) {
    result = majorWord + ' ' + intWords;
  } else {
    result = intWords + (majorWord ? ' ' + majorWord : '');
  }

  if (decPart > 0 && curr.minorPlural) {
    const decWords = convertThreeDigitsToWords(decPart);
    const minorWord = decPart === 1 ? curr.minorSingular : curr.minorPlural;
    result += ' and ' + decWords + ' ' + minorWord;
  }

  return result.trim() + ' Only';
}

// ============================================================================
// 2B. NUMBERING ENGINE HELPERS
// ============================================================================
let currentNumberingConfig = Object.assign({}, DEFAULT_NUMBERING_CONFIG);

function formatFinancialYear(d) {
  const date = (d instanceof Date && !isNaN(d.getTime())) ? d : new Date();
  const month = date.getMonth(); // 0-indexed, 3 is April
  const year = date.getFullYear();
  if (month >= 3) {
    const nextYearShort = (year + 1).toString().slice(-2);
    return `${year}-${nextYearShort}`;
  } else {
    const curYearShort = year.toString().slice(-2);
    return `${year - 1}-${curYearShort}`;
  }
}

function resolvePeriodKey(date, resetPeriod) {
  if (resetPeriod === 'financial_year') return formatFinancialYear(date);
  if (resetPeriod === 'calendar_year') return date.getFullYear().toString();
  if (resetPeriod === 'monthly') return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  return 'continuous';
}

/**
 * Rolls the counter over when the configured reset period has changed and
 * persists the new period key. Kept separate from generateDocumentNumber so
 * that read-only previews (badges, modal live preview, save-time comparison)
 * never mutate the counter or write to IndexedDB.
 * Returns true when a rollover actually occurred.
 */
async function syncNumberingPeriod(config) {
  if (!config || config.mode === 'manual') return false;
  const resetPeriod = config.resetPeriod || 'financial_year';
  const currentPeriodKey = resolvePeriodKey(new Date(), resetPeriod);

  if (config.lastPeriodKey === currentPeriodKey) return false;

  if (resetPeriod !== 'never' && config.lastPeriodKey) {
    config.counter = parseInt(config.startingCounter, 10) || 1;
    config.lastPeriodKey = currentPeriodKey;
    config.updatedAt = Date.now();
    try {
      await saveNumberingConfig(config);
    } catch (e) {
      console.warn('Could not persist numbering period rollover:', e);
    }
    return true;
  }

  // First run for this config: only stamp the period key, never reset the counter.
  config.lastPeriodKey = currentPeriodKey;
  try {
    await saveNumberingConfig(config);
  } catch (e) {
    console.warn('Could not persist numbering period key:', e);
  }
  return false;
}

/**
 * Pure formatter: builds a document number from a config snapshot.
 * Performs no I/O and mutates nothing, so it is safe for live previews.
 */
function generateDocumentNumber(docType, dateStr, config, overrideCounter = null) {
  if (!config) config = DEFAULT_NUMBERING_CONFIG;
  if (config.mode === 'manual' && overrideCounter === null) {
    return currentInvoice?.meta?.number || 'INV-2026-001';
  }

  const d = dateStr ? new Date(dateStr) : new Date();
  const date = (!isNaN(d.getTime())) ? d : new Date();

  // Determine Prefix for docType
  let prefix = config.prefixInvoice || 'INV';
  if (docType === 'quotation') prefix = config.prefixQuotation || 'QT';
  else if (docType === 'estimate') prefix = config.prefixEstimate || 'EST';
  else if (docType === 'proforma') prefix = config.prefixProforma || 'PI';

  // Format variables
  const counterVal = (overrideCounter !== null) ? overrideCounter : (parseInt(config.counter, 10) || 1);
  const padDigits = parseInt(config.padding, 10) || 4;
  const paddedCounter = String(counterVal).padStart(padDigits, '0');
  const yyyy = date.getFullYear().toString();
  const yy = yyyy.slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const fy = formatFinancialYear(date);
  const pattern = config.scheme || '{PREFIX}/{FY}/{COUNTER}';

  return pattern
    .replace(/\{PREFIX\}/g, prefix)
    .replace(/\{FY\}/g, fy)
    .replace(/\{YYYY\}/g, yyyy)
    .replace(/\{YY\}/g, yy)
    .replace(/\{MM\}/g, mm)
    .replace(/\{COUNTER\}/g, paddedCounter);
}

function updateNumberingBadgeUI(config) {
  const badgeText = document.getElementById('numbering-badge-text');
  if (!badgeText) return;
  if (!config || config.mode === 'manual') {
    badgeText.textContent = 'Manual Numbering';
  } else {
    const preview = generateDocumentNumber('invoice', currentInvoice.meta.date, config, config.counter);
    badgeText.textContent = `Auto: ${preview}`;
  }
}

function populateNumberingModal(config) {
  if (!config) config = DEFAULT_NUMBERING_CONFIG;
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

  const counterInput = document.getElementById('num-cfg-counter');
  if (counterInput) counterInput.value = config.counter || 1;

  const paddingSelect = document.getElementById('num-cfg-padding');
  if (paddingSelect) paddingSelect.value = String(config.padding || 4);

  const resetSelect = document.getElementById('num-cfg-reset');
  if (resetSelect) resetSelect.value = config.resetPeriod || 'financial_year';

  updateNumberingModalPreviewLive();
}

function updateNumberingModalPreviewLive() {
  const previewInv = document.getElementById('num-preview-text');
  const previewQuote = document.getElementById('num-preview-quote');
  if (!previewInv) return;

  const mode = document.querySelector('input[name="num-mode"]:checked')?.value || 'auto';
  const tempConfig = {
    mode,
    scheme: document.getElementById('num-cfg-pattern')?.value || '{PREFIX}/{FY}/{COUNTER}',
    prefixInvoice: document.getElementById('num-prefix-inv')?.value || 'INV',
    prefixQuotation: document.getElementById('num-prefix-qt')?.value || 'QT',
    prefixEstimate: document.getElementById('num-prefix-est')?.value || 'EST',
    prefixProforma: document.getElementById('num-prefix-pi')?.value || 'PI',
    counter: parseInt(document.getElementById('num-cfg-counter')?.value, 10) || 1,
    padding: parseInt(document.getElementById('num-cfg-padding')?.value, 10) || 4,
    resetPeriod: document.getElementById('num-cfg-reset')?.value || 'financial_year'
  };

  if (mode === 'manual') {
    previewInv.textContent = 'Manual Entry (User Discretion)';
    if (previewQuote) previewQuote.textContent = 'Manual';
  } else {
    const invNum = generateDocumentNumber('invoice', currentInvoice.meta.date, tempConfig, tempConfig.counter);
    const qtNum = generateDocumentNumber('quotation', currentInvoice.meta.date, tempConfig, tempConfig.counter);
    previewInv.textContent = invNum;
    if (previewQuote) previewQuote.textContent = qtNum;
  }
}

let currentInvoice = JSON.parse(JSON.stringify(DEFAULT_INVOICE_STATE));
let canvasZoom = 1.0;
let autoSaveTimer = null;

// ============================================================================
// 3. INITIALIZATION
// ============================================================================
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await openDB();
  } catch (err) {
    console.warn('IndexedDB fallback issue:', err);
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
    currentNumberingConfig = Object.assign({}, DEFAULT_NUMBERING_CONFIG);
  }

  // Load existing draft or use default (each step guarded so IDB denial can't blank the app)
  let savedDraft = null;
  try {
    savedDraft = await getActiveDraft();
  } catch (e) {
    console.warn('Draft load failed, starting fresh:', e);
    savedDraft = null;
  }
  if (savedDraft) {
    currentInvoice = Object.assign({}, DEFAULT_INVOICE_STATE, savedDraft);
    if (!currentInvoice.logo.layout) currentInvoice.logo.layout = 'left';
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
      currentInvoice.sender = {
        name: defCompany.name,
        email: defCompany.email || '',
        phone: defCompany.phone || '',
        address: defCompany.address || '',
        taxId: defCompany.taxId || ''
      };
      currentInvoice.payment = defCompany.payment || '';
    }
    // Set initial invoice number from numbering engine if auto
    if (currentNumberingConfig && currentNumberingConfig.mode === 'auto') {
      await syncNumberingPeriod(currentNumberingConfig);
      currentInvoice.meta.number = generateDocumentNumber(
        currentInvoice.meta.docType || 'invoice',
        currentInvoice.meta.date,
        currentNumberingConfig,
        currentNumberingConfig.counter
      );
    }
  }

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
  try { updateSavedInvoicesCount(); } catch (e) { console.warn(e); }
  enhanceAccessibility();

  // Initial Sheet Render & Calculations
  updateSheetView();

  // Attach Event Listeners
  attachFormListeners();
  attachNavigationListeners();
  attachZoomListeners();
  attachModalListeners();
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
  const cfg = DOC_TYPES[docType] || DOC_TYPES.invoice;

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

  // Apply template
  applyTemplateClass();
  updateLogoDisplay();
}

function syncStatusDropdown(docType, currentStatus) {
  const statusSelect = document.getElementById('select-inv-status');
  if (!statusSelect) return;
  const cfg = DOC_TYPES[docType] || DOC_TYPES.invoice;
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
  if (!DOC_TYPES[newType]) return;
  const oldType = currentInvoice.meta.docType || 'invoice';
  const oldCfg = DOC_TYPES[oldType] || DOC_TYPES.invoice;
  const newCfg = DOC_TYPES[newType];

  currentInvoice.meta.docType = newType;

  // If title was default or empty, update to new default title
  if (!currentInvoice.meta.title || currentInvoice.meta.title === oldCfg.title) {
    currentInvoice.meta.title = newCfg.title;
  }

  // Update document number from numbering engine if auto, or standard prefix replacement
  if (currentNumberingConfig && currentNumberingConfig.mode === 'auto') {
    await syncNumberingPeriod(currentNumberingConfig);
    currentInvoice.meta.number = generateDocumentNumber(newType, currentInvoice.meta.date, currentNumberingConfig, currentNumberingConfig.counter);
  } else {
    const knownPrefixes = ['INV-', 'QT-', 'EST-', 'PI-'];
    let currentNum = currentInvoice.meta.number || '';
    let replaced = false;
    for (const p of knownPrefixes) {
      if (currentNum.startsWith(p)) {
        currentInvoice.meta.number = currentNum.replace(p, newCfg.prefix);
        replaced = true;
        break;
      }
    }
    if (!replaced) {
      currentInvoice.meta.number = newCfg.prefix + new Date().getFullYear() + '-001';
    }
  }

  // Update notes if it was default
  if (!currentInvoice.notes || currentInvoice.notes === oldCfg.defaultNotes) {
    currentInvoice.notes = newCfg.defaultNotes;
  }

  // If switching to quote/estimate, show signature block by default
  if (newType !== 'invoice') {
    currentInvoice.meta.showSignature = true;
  } else {
    currentInvoice.meta.showSignature = false;
  }

  // Set default status for new type
  currentInvoice.meta.status = newCfg.defaultStatus;

  populateFormFields();
  updateSheetView();
  triggerAutoSave();
}

async function convertToInvoice() {
  const oldType = currentInvoice.meta.docType || 'quotation';
  const oldNumber = currentInvoice.meta.number || 'QT-001';
  const curDocName = (DOC_TYPES[oldType] || DOC_TYPES.quotation).name;

  currentInvoice.meta.docType = 'invoice';
  currentInvoice.meta.title = 'INVOICE';

  // Replace number using Numbering Engine or standard prefix
  if (currentNumberingConfig && currentNumberingConfig.mode === 'auto') {
    await syncNumberingPeriod(currentNumberingConfig);
    currentInvoice.meta.number = generateDocumentNumber('invoice', currentInvoice.meta.date, currentNumberingConfig, currentNumberingConfig.counter);
  } else {
    const knownPrefixes = ['QT-', 'EST-', 'PI-'];
    let currentNum = currentInvoice.meta.number || '';
    let replaced = false;
    for (const p of knownPrefixes) {
      if (currentNum.startsWith(p)) {
        currentInvoice.meta.number = currentNum.replace(p, 'INV-');
        replaced = true;
        break;
      }
    }
    if (!replaced) {
      currentInvoice.meta.number = 'INV-' + (currentNum || (new Date().getFullYear() + '-001'));
    }
  }

  // Set PO / Ref if not set
  if (!currentInvoice.meta.po || currentInvoice.meta.po.trim() === '') {
    currentInvoice.meta.po = `Ref: ${oldNumber}`;
  }

  // Set issue date to today and due date to +14 days
  currentInvoice.meta.date = new Date().toISOString().split('T')[0];
  currentInvoice.meta.dueDate = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];
  currentInvoice.meta.status = 'pending';
  currentInvoice.meta.showSignature = false;

  // If notes matched any non-invoice default (quote/estimate/proforma), switch to invoice default
  if (currentInvoice.notes === DOC_TYPES.quotation.defaultNotes || currentInvoice.notes === DOC_TYPES.estimate.defaultNotes || currentInvoice.notes === DOC_TYPES.proforma.defaultNotes) {
    currentInvoice.notes = DOC_TYPES.invoice.defaultNotes;
  }

  populateFormFields();
  updateSheetView();
  triggerAutoSave();
  alert(`⚡ ${curDocName} "${oldNumber}" was successfully converted into Invoice "${currentInvoice.meta.number}"! All items, rates, taxes, and client details have been preserved.`);
}

// ============================================================================
// 5B. MULTIPLE COMPANY PROFILES ENGINE
// ============================================================================
let activeCompanyProfileId = null;

async function updateSavedCompaniesCount() {
  const companies = await getAllCompanies();
  const countEls = [
    document.getElementById('saved-companies-count'),
    document.getElementById('companies-count-badge'),
    document.getElementById('modal-companies-list-count')
  ];
  countEls.forEach(el => {
    if (el) el.textContent = companies.length;
  });
}

async function renderCompanyProfilesSelector() {
  const select = document.getElementById('select-company-profile');
  if (!select) return;
  const companies = await getAllCompanies();

  if (companies.length === 0) {
    select.innerHTML = `<option value="">Default Company Profile</option><option value="__new__">+ Add New Company Profile...</option>`;
    return;
  }

  // Determine active id if not set
  if (!activeCompanyProfileId) {
    const def = companies.find(c => c.isDefault) || companies[0];
    if (def) activeCompanyProfileId = def.id;
  }

  select.innerHTML = companies.map(c => `
    <option value="${escapeHtml(c.id)}" ${c.id === activeCompanyProfileId ? 'selected' : ''}>
      🏢 ${escapeHtml(c.name)}${c.isDefault ? ' (Default)' : ''}
    </option>
  `).join('') + `<option value="__new__">+ Add New Company Profile...</option>`;
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
    const safeId = escapeHtml(comp.id);
    return `
      <div class="company-card-item ${isDef ? 'is-default' : ''}" data-id="${safeId}">
        <div style="flex:1; padding-right:12px;">
          <div style="font-size:13.5px; font-weight:700; color:#0f172a; display:flex; align-items:center; flex-wrap:wrap; gap:4px;">
            ${escapeHtml(comp.name)}
            ${isDef ? '<span class="badge-company-default">DEFAULT</span>' : ''}
            ${isCurrentActive ? '<span style="font-size:9.5px; font-weight:700; padding:1px 6px; border-radius:4px; background:#dcfce7; color:#16a34a; text-transform:uppercase;">ACTIVE</span>' : ''}
          </div>
          <div style="font-size:11.5px; color:#64748b; margin-top:2px;">
            ${escapeHtml(comp.email || '')}${comp.phone ? ' • ' + escapeHtml(comp.phone) : ''}${comp.taxId ? ' • Tax: ' + escapeHtml(comp.taxId) : ''}
          </div>
          ${comp.address ? `<div style="font-size:11px; color:#94a3b8; margin-top:2px; white-space:pre-line;">${escapeHtml(comp.address)}</div>` : ''}
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
        await deleteCompany(btn.dataset.id);
        if (activeCompanyProfileId === btn.dataset.id) activeCompanyProfileId = null;
        await renderCompanyProfilesSelector();
        await renderCompaniesModalList();
      }
    });
  });
}

function applyCompanyToInvoice(comp) {
  if (!comp) return;
  activeCompanyProfileId = comp.id;
  currentInvoice.sender = {
    name: comp.name || '',
    email: comp.email || '',
    phone: comp.phone || '',
    address: comp.address || '',
    taxId: comp.taxId || ''
  };
  currentInvoice.payment = comp.payment || '';

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
  updateSheetView();
  triggerAutoSave();
  renderCompanyProfilesSelector();
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
  const isDefault = document.getElementById('modal-company-is-default').checked;

  const company = {
    id: id || generateId('comp_'),
    name,
    email,
    phone,
    address,
    taxId,
    payment,
    isDefault
  };

  await saveCompany(company);
  if (isDefault) {
    await setDefaultCompany(company.id);
  }

  resetCompanyModalForm();
  await renderCompanyProfilesSelector();
  await renderCompaniesModalList();
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

    return `
      <div class="item-card-editor" data-index="${index}">
        <!-- Row 1: Description + HSN/SAC + Delete -->
        <div class="item-card-row-1">
          <input type="text" class="form-input item-desc-input" value="${escapeHtml(item.description)}" placeholder="Service or Item Description">
          <input type="text" class="form-input item-hsn-input" value="${escapeHtml(item.hsn || '')}" placeholder="HSN/SAC" title="HSN/SAC Code (e.g. 998314)">
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
        <input type="text" class="form-input tax-name-input" value="${escapeHtml(tax.name)}" placeholder="Tax Leg (e.g. CGST, SGST, VAT)">
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
        <span>Registered: <strong>${escapeHtml(formatted)}</strong></span>
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
  const cfg = DOC_TYPES[docType] || DOC_TYPES.invoice;

  // 1. Update Sheet Metadata & Dynamic Labels
  document.getElementById('sheet-inv-title').textContent = currentInvoice.meta.title || cfg.title;
  const numLabel = document.getElementById('sheet-num-label');
  if (numLabel) numLabel.textContent = cfg.numLabel;
  document.getElementById('sheet-inv-num').textContent = currentInvoice.meta.number || (cfg.prefix + '001');
  
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

  // 3. Line Items Calculations & Table Rendering
  let subtotal = 0;
  let totalTaxSum = 0;
  const rateBreakdown = {};

  const tbody = document.getElementById('sheet-items-tbody');
  tbody.innerHTML = currentInvoice.items.map(item => {
    const qty = clampNum(item.qty, 0, 1000000, 0);
    const rate = clampNum(item.rate, 0, 1000000000, 0);
    const discountPct = clampNum(item.discount, 0, 100, 0);
    const taxableLine = qty * rate * (1 - discountPct / 100);
    const rawTaxRate = (item.taxRate !== undefined && item.taxRate !== null) ? parseFloat(item.taxRate) : 18;
    const taxRate = isFinite(rawTaxRate) ? Math.min(100, Math.max(0, rawTaxRate)) : 0;
    const itemTax = taxableLine * (taxRate / 100);

    subtotal += taxableLine;
    totalTaxSum += itemTax;

    if (!rateBreakdown[taxRate]) {
      rateBreakdown[taxRate] = { taxable: 0, tax: 0 };
    }
    rateBreakdown[taxRate].taxable += taxableLine;
    rateBreakdown[taxRate].tax += itemTax;

    const isUnregistered = !currentInvoice.sender.taxId || !currentInvoice.sender.taxId.trim();
    const discDisplay = discountPct > 0 ? `${discountPct}%` : '—';
    const taxDisplay = taxRate > 0 
      ? `<span class="item-tax-badge">${taxRate}%</span>` 
      : (isUnregistered 
          ? `<span style="color:#94a3b8;">—</span>` 
          : `<span class="item-tax-badge" style="background:#f1f5f9; color:#94a3b8;">0% Exempt</span>`);

    const hsnMarkup = item.hsn && item.hsn.trim() 
      ? `<div class="item-hsn-tag">HSN/SAC: ${escapeHtml(item.hsn.trim())}</div>` 
      : '';

    return `
      <tr>
        <td>
          <div class="item-desc-bold">${escapeHtml(item.description || 'Item Description')}</div>
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
    const rawSum = activeTaxLegs.reduce((sum, t) => sum + (parseFloat(t.ratio) || 0), 0);
    const sumOfRatios = rawSum > 0 ? rawSum : 100;
    // If user zeroed all legs but tax exists, show a single consolidated Tax row
    // so the breakdown never displays $0 legs while the total still includes tax.
    const effectiveLegs = rawSum > 0 ? activeTaxLegs : [{ name: 'Tax', ratio: 100 }];

    const renderedTaxLegs = effectiveLegs.map(leg => {
      const legRatio = clampNum(leg.ratio, 0, 100, 0);
      const legShareFrac = sumOfRatios > 0 ? (legRatio / sumOfRatios) : 0;
      const legTaxAmount = totalTaxSum * legShareFrac;

      return `
        <div class="totals-row tax-leg">
          <span>${escapeHtml(leg.name || 'Tax')} <span class="tax-tag">${legRatio}% split</span></span>
          <span>${formatMoney(legTaxAmount, currency, numberFormat)}</span>
        </div>
      `;
    });

    // Multi-rate summary banner if there are multiple rates
    const distinctRates = Object.keys(rateBreakdown).map(Number).sort((a,b) => b - a);
    let multiRateSummaryHtml = '';
    if (distinctRates.length > 1) {
      const breakdownText = distinctRates.map(r => {
        const data = rateBreakdown[r];
        return `${r}% on ${formatMoney(data.taxable, currency, numberFormat)}: ${formatMoney(data.tax, currency, numberFormat)}`;
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
  const grandTotal = subtotal + totalTaxSum;
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
        <div class="sheet-company-title">${escapeHtml(currentInvoice.sender.name || 'Company Name')}</div>
        <div class="sheet-company-meta">${escapeHtml(currentInvoice.sender.address || '')}</div>
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
      const curDoc = (DOC_TYPES[currentInvoice.meta.docType] || DOC_TYPES.quotation).name;
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
  bindTextInput('input-inv-number', val => currentInvoice.meta.number = val);
  bindTextInput('input-inv-date', val => currentInvoice.meta.date = val);
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
      triggerAutoSave();
    });
  }

  if (inputCustomCurr) {
    inputCustomCurr.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      currentInvoice.meta.currency = val || 'CUR';
      updateSheetView();
      renderLineItemsEditor();
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
    // Keep Studio wordmark in sync
    const monoWordmark = document.getElementById('monogram-wordmark');
    if (monoWordmark && !monoWordmark.value) monoWordmark.value = val;
  });
  bindTextInput('input-sender-email', val => currentInvoice.sender.email = val);
  bindTextInput('input-sender-phone', val => currentInvoice.sender.phone = val);
  bindTextInput('input-sender-address', val => currentInvoice.sender.address = val);
  bindTextInput('input-sender-taxid', val => {
    currentInvoice.sender.taxId = val;
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
  bindTextInput('input-client-name', val => currentInvoice.client.name = val);
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
        const newComp = {
          id: generateId('comp_'),
          name: currentInvoice.sender.name || 'My Company',
          email: currentInvoice.sender.email || '',
          phone: currentInvoice.sender.phone || '',
          address: currentInvoice.sender.address || '',
          taxId: currentInvoice.sender.taxId || '',
          payment: currentInvoice.payment || '',
          isDefault: true
        };
        await saveCompany(newComp);
        activeCompanyProfileId = newComp.id;
        await renderCompanyProfilesSelector();
        await updateSavedCompaniesCount();
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
    const compId = select && select.value && select.value !== '__new__' ? select.value : generateId('comp_');
    const comp = {
      id: compId,
      name: currentInvoice.sender.name || 'Apex Studio',
      email: currentInvoice.sender.email || '',
      phone: currentInvoice.sender.phone || '',
      address: currentInvoice.sender.address || '',
      taxId: currentInvoice.sender.taxId || '',
      payment: currentInvoice.payment || '',
      isDefault: true
    };
    await saveCompany(comp);
    await setDefaultCompany(comp.id);
    activeCompanyProfileId = comp.id;
    await renderCompanyProfilesSelector();
    await updateSavedCompaniesCount();
    alert(`"${comp.name}" saved as default company! All new documents will start with this profile.`);
  });

  // Save Client to Directory (clone first so saveClient's id/updatedAt stamp
  // never mutates the live invoice object)
  document.getElementById('btn-save-client-to-book').addEventListener('click', async () => {
    if (!currentInvoice.client.name) {
      alert('Please enter a client name first.');
      return;
    }
    await saveClient(Object.assign({}, currentInvoice.client));
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
async function resetToFreshDocument(prefillClient = null) {
  const curType = currentInvoice.meta.docType || 'invoice';
  const cfg = DOC_TYPES[curType] || DOC_TYPES.invoice;
  let defCompany = null;
  try {
    defCompany = await getDefaultCompany();
  } catch (e) {
    console.warn('Default company lookup failed while starting a new document:', e);
  }
  currentInvoice = JSON.parse(JSON.stringify(DEFAULT_INVOICE_STATE));
  currentInvoice.id = (curType === 'invoice' ? 'inv_' : 'doc_') + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
  currentInvoice.meta.date = new Date().toISOString().split('T')[0];
  currentInvoice.meta.dueDate = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];
  currentInvoice.meta.docType = curType;
  currentInvoice.meta.title = cfg.title;
  if (currentNumberingConfig && currentNumberingConfig.mode === 'auto') {
    await syncNumberingPeriod(currentNumberingConfig);
    currentInvoice.meta.number = generateDocumentNumber(curType, currentInvoice.meta.date, currentNumberingConfig, currentNumberingConfig.counter);
  } else {
    currentInvoice.meta.number = cfg.prefix + new Date().getFullYear() + '-' + Math.floor(100 + Math.random() * 900);
  }
  currentInvoice.meta.status = cfg.defaultStatus;
  currentInvoice.meta.showSignature = (curType !== 'invoice');
  currentInvoice.notes = cfg.defaultNotes;
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
  } else {
    currentInvoice.payment = '';
  }

  if (prefillClient) {
    currentInvoice.client = {
      name: prefillClient.name || '',
      email: prefillClient.email || '',
      phone: prefillClient.phone || '',
      address: prefillClient.address || '',
      taxId: prefillClient.taxId || ''
    };
  }

  try { await renderCompanyProfilesSelector(); } catch (e) { console.warn(e); }
  populateFormFields();
  renderLineItemsEditor();
  renderTaxesEditor();
  updateSheetView();
  triggerAutoSave();
}

function attachNavigationListeners() {
  setupPillNavigation();

  // Sidebar Collapse / Expand Toggle
  const workspace = document.querySelector('.app-workspace');
  const sidebarToggleBtn = document.getElementById('btn-toggle-sidebar');
  const floatingToggleBtn = document.getElementById('btn-expand-sidebar-floating');

  const toggleSidebar = () => {
    const isCollapsed = workspace.classList.toggle('sidebar-collapsed');
    if (floatingToggleBtn) {
      floatingToggleBtn.style.display = isCollapsed ? 'inline-flex' : 'none';
    }
    if (sidebarToggleBtn) {
      sidebarToggleBtn.classList.toggle('btn-primary', isCollapsed);
    }
  };

  if (sidebarToggleBtn) sidebarToggleBtn.addEventListener('click', toggleSidebar);
  if (floatingToggleBtn) floatingToggleBtn.addEventListener('click', toggleSidebar);

  // Global Keyboard shortcuts: Ctrl+B (Sidebar), Ctrl+S (Save), Ctrl+P (Print)
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      toggleSidebar();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      const saveBtn = document.getElementById('btn-save-invoice');
      if (saveBtn) saveBtn.click();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
      e.preventDefault();
      safePrintAction();
    }
  });

  /**
 * Burns the current auto-number so the next document gets a fresh one.
 * Only advances when the document still carries the engine's current number,
 * so repeated saves of the same document never skip a sequence number and
 * hand-typed numbers are never overwritten.
 * Returns true when the counter advanced.
 */
async function advanceNumberingCounter() {
  if (!currentNumberingConfig || currentNumberingConfig.mode !== 'auto') return false;
  await syncNumberingPeriod(currentNumberingConfig);

  const expectedCurrent = generateDocumentNumber(
    currentInvoice.meta.docType || 'invoice',
    currentInvoice.meta.date,
    currentNumberingConfig,
    currentNumberingConfig.counter
  );
  if (currentInvoice.meta.number !== expectedCurrent) return false;

  currentNumberingConfig.counter = (parseInt(currentNumberingConfig.counter, 10) || 1) + 1;
  currentNumberingConfig.updatedAt = Date.now();
  try {
    await saveNumberingConfig(currentNumberingConfig);
  } catch (e) {
    console.warn('Could not persist advanced numbering counter:', e);
  }
  updateNumberingBadgeUI(currentNumberingConfig);
  return true;
}

/**
 * Persists the active document and consumes its auto-generated number.
 * Shared by "Save" and "Save & Start Fresh" so both paths stay consistent.
 */
async function persistCurrentDocument() {
  await advanceNumberingCounter();
  await saveInvoice(currentInvoice);
  await updateSavedInvoicesCount();
}

// New Document Button (Opens Graceful Confirmation Dialog)
  const btnNewInvoice = document.getElementById('btn-new-invoice');
  if (btnNewInvoice) {
    btnNewInvoice.addEventListener('click', () => {
      const curType = currentInvoice.meta.docType || 'invoice';
      const cfg = DOC_TYPES[curType] || DOC_TYPES.invoice;
      const curNum = currentInvoice.meta.number || 'Current Document';
      const titleEl = document.getElementById('new-doc-cur-title');
      if (titleEl) titleEl.textContent = `${cfg.name} "${curNum}"`;
      openModal('modal-confirm-new-doc');
    });
  }

  const btnNewSaveAndStart = document.getElementById('btn-new-save-and-start');
  if (btnNewSaveAndStart) {
    btnNewSaveAndStart.addEventListener('click', async () => {
      await persistCurrentDocument();
      closeModal('modal-confirm-new-doc');
      await resetToFreshDocument();
    });
  }

  const btnNewDiscard = document.getElementById('btn-new-discard');
  if (btnNewDiscard) {
    btnNewDiscard.addEventListener('click', async () => {
      closeModal('modal-confirm-new-doc');
      await resetToFreshDocument();
    });
  }

  // Save Document Button
  document.getElementById('btn-save-invoice').addEventListener('click', async () => {
    await persistCurrentDocument();
    const docTypeName = (DOC_TYPES[currentInvoice.meta.docType] || DOC_TYPES.invoice).name;
    alert(`${docTypeName} "${currentInvoice.meta.number}" saved successfully to IndexedDB!`);
  });

  // Print / Save as PDF Handler (100% Vector, Selectable Text, Zero Marks)
  function safePrintAction() {
    const origTitle = document.title;
    const docType = currentInvoice.meta.docType || 'invoice';
    const prefix = (DOC_TYPES[docType] ? DOC_TYPES[docType].name : 'Invoice');
    const rawNum = currentInvoice.meta.number || 'Draft';
    const sanitizedNum = rawNum.replace(/[\\/:*?"<>|]/g, '_');

    // 1. Remove any on-screen visual page break lines so they NEVER enter print output
    document.querySelectorAll('.canvas-page-break-line').forEach(el => el.remove());

    // 2. Temporarily set document title to the clean document number
    document.title = `${prefix}-${sanitizedNum}`;
    const restoreTitle = () => {
      document.title = origTitle;
      updateDocumentPaginationLive();
    };
    if (!safePrintAction._afterPrintBound) {
      window.addEventListener('afterprint', restoreTitle);
      safePrintAction._afterPrintBound = true;
    }
    // Fallback timer in case afterprint is not fired (some browsers / cancelled dialogs)
    clearTimeout(safePrintAction._t);
    safePrintAction._t = setTimeout(restoreTitle, 1500);
    window.print();
  }

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
      await syncNumberingPeriod(currentNumberingConfig);
      const nextNum = generateDocumentNumber(
        currentInvoice.meta.docType || 'invoice',
        currentInvoice.meta.date,
        currentNumberingConfig,
        currentNumberingConfig.counter
      );
      currentInvoice.meta.number = nextNum;
      const numInput = document.getElementById('input-inv-number');
      if (numInput) numInput.value = nextNum;
      updateSheetView();
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

  ['num-cfg-pattern', 'num-prefix-inv', 'num-prefix-qt', 'num-prefix-est', 'num-prefix-pi', 'num-cfg-counter'].forEach(id => {
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
      const mode = document.querySelector('input[name="num-mode"]:checked')?.value || 'auto';
      const counterVal = parseInt(document.getElementById('num-cfg-counter')?.value, 10) || 1;
      currentNumberingConfig.mode = mode;
      currentNumberingConfig.scheme = document.getElementById('num-cfg-pattern')?.value || '{PREFIX}/{FY}/{COUNTER}';
      currentNumberingConfig.prefixInvoice = document.getElementById('num-prefix-inv')?.value || 'INV';
      currentNumberingConfig.prefixQuotation = document.getElementById('num-prefix-qt')?.value || 'QT';
      currentNumberingConfig.prefixEstimate = document.getElementById('num-prefix-est')?.value || 'EST';
      currentNumberingConfig.prefixProforma = document.getElementById('num-prefix-pi')?.value || 'PI';
      currentNumberingConfig.counter = counterVal;
      currentNumberingConfig.startingCounter = counterVal;
      currentNumberingConfig.padding = parseInt(document.getElementById('num-cfg-padding')?.value, 10) || 4;
      currentNumberingConfig.resetPeriod = document.getElementById('num-cfg-reset')?.value || 'financial_year';
      currentNumberingConfig.updatedAt = Date.now();
      // Stamp the current period explicitly: the counter value the user just typed
      // is authoritative, so bind it to this period rather than letting a rollover
      // reset it away on the next document.
      currentNumberingConfig.lastPeriodKey = resolvePeriodKey(new Date(), currentNumberingConfig.resetPeriod);

      await saveNumberingConfig(currentNumberingConfig);
      updateNumberingBadgeUI(currentNumberingConfig);

      if (mode === 'auto') {
        const newNum = generateDocumentNumber(
          currentInvoice.meta.docType || 'invoice',
          currentInvoice.meta.date,
          currentNumberingConfig,
          currentNumberingConfig.counter
        );
        currentInvoice.meta.number = newNum;
        const numInput = document.getElementById('input-inv-number');
        if (numInput) numInput.value = newNum;
        updateSheetView();
        triggerAutoSave();
      }

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
          if (!parsed || typeof parsed !== 'object' || (!Array.isArray(parsed.invoices) && !Array.isArray(parsed.clients) && !Array.isArray(parsed.companies) && !parsed.numberingConfig && !parsed.profile)) {
            throw new Error('Unrecognized backup shape (expected invoices/clients/companies/numberingConfig).');
          }
          if (!confirm('Restore this backup? Existing records with the same IDs will be overwritten.')) {
            return;
          }
          await importAllData(parsed);
          await updateSavedInvoicesCount();
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
      optionsHtml += `<option value="${escapeHtml(cName)}">${escapeHtml(cName)} (${clientCounts[cName]})</option>`;
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
      ? `<span style="display:inline-block; font-size:10px; font-weight:700; padding:1px 6px; border-radius:4px; background:#e0f2fe; color:#0369a1; text-transform:uppercase; margin-left:6px;">${escapeHtml(docType)}</span>`
      : '';
    const safeInvId = escapeHtml(inv.id);
    const invTotal = calculateTotal(inv);
    const invTotalText = isFinite(invTotal) ? invTotal.toFixed(2) : '0.00';
    return `
      <div style="display:flex; align-items:center; justify-content:space-between; padding:12px 14px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px;">
        <div>
          <div style="font-size:13.5px; font-weight:700; color:#0f172a; display:flex; align-items:center; flex-wrap:wrap; gap:4px;">
            ${escapeHtml(inv.meta?.number || 'Document')}
            ${docBadge}
            <span style="color:#94a3b8; font-weight:400; margin:0 4px;">&bull;</span>
            ${escapeHtml(inv.client?.name || 'Client')}
          </div>
          <div style="font-size:11.5px; color:#64748b; margin-top:2px;">
            Updated: ${escapeHtml(dateFormatted)} &bull; ${escapeHtml(inv.meta?.currency || '$')}${escapeHtml(invTotalText)}
          </div>
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
      const inv = await getInvoice(btn.dataset.id);
      if (inv) {
        normalizeInvoice(inv);
        currentInvoice = JSON.parse(JSON.stringify(inv));
        if (inv.sender && inv.sender.name) {
          try {
            const allComps = await getAllCompanies();
            const match = allComps.find(c => c.name === inv.sender.name);
            if (match) activeCompanyProfileId = match.id;
          } catch (e) {}
        }
        populateFormFields();
        renderLineItemsEditor();
        renderTaxesEditor();
        updateSheetView();
        triggerAutoSave();
        closeModal('modal-invoices');
      }
    });
  });

  container.querySelectorAll('.btn-dup-inv').forEach(btn => {
    btn.addEventListener('click', async () => {
      const inv = await getInvoice(btn.dataset.id);
      if (inv) {
        normalizeInvoice(inv);
        currentInvoice = JSON.parse(JSON.stringify(inv));
        currentInvoice.id = generateId('inv_');
        currentInvoice.meta.number += '-COPY';
        populateFormFields();
        renderLineItemsEditor();
        renderTaxesEditor();
        updateSheetView();
        await saveInvoice(currentInvoice);
        await updateSavedInvoicesCount();
        await renderSavedInvoicesList();
      }
    });
  });

  container.querySelectorAll('.btn-del-inv').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (confirm('Permanently delete this invoice?')) {
        await deleteInvoice(btn.dataset.id);
        await updateSavedInvoicesCount();
        await renderSavedInvoicesList();
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
      return (invCName && invCName === cNameClean) || (inv.client?.id === c.id);
    });

    const totalBilled = clientDocs.reduce((sum, inv) => sum + calculateTotal(inv), 0);
    const currSym = clientDocs[0]?.meta?.currency || currentInvoice.meta?.currency || '$';
    const totalBilledText = formatMoney(totalBilled, currSym);

    const docCountLabel = clientDocs.length === 0
      ? `<span style="font-size:11px; color:#94a3b8;">No documents yet</span>`
      : `<span style="font-size:11px; font-weight:600; color:#0369a1; background:#e0f2fe; padding:2px 8px; border-radius:10px;">${clientDocs.length} doc${clientDocs.length > 1 ? 's' : ''} &bull; Total: ${totalBilledText}</span>`;

    const docsDrawerHtml = clientDocs.length > 0 ? `
      <div class="client-docs-drawer" id="client-drawer-${escapeHtml(c.id)}" style="display:none;">
        <div style="font-size:11px; font-weight:700; color:#475569; margin-bottom:6px; text-transform:uppercase; letter-spacing:0.4px;">
          Previous Documents for ${escapeHtml(c.name)}:
        </div>
        ${clientDocs.map(doc => {
          const docType = doc.meta?.docType || 'invoice';
          const docTotal = formatMoney(calculateTotal(doc), doc.meta?.currency || '$');
          const docDate = doc.updatedAt ? new Date(doc.updatedAt).toLocaleDateString() : '';
          return `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 10px; background:#ffffff; border:1px solid #e2e8f0; border-radius:6px; margin-bottom:4px;">
              <div>
                <span style="font-size:12px; font-weight:700; color:#0f172a;">${escapeHtml(doc.meta?.number || 'Doc')}</span>
                <span style="font-size:9.5px; font-weight:700; padding:1px 5px; border-radius:3px; background:#e0f2fe; color:#0369a1; text-transform:uppercase; margin-left:4px;">${escapeHtml(docType)}</span>
                <span style="font-size:11px; color:#64748b; margin-left:6px;">${docDate} &bull; ${docTotal}</span>
              </div>
              <button class="btn btn-primary btn-xs btn-load-client-subdoc" data-doc-id="${escapeHtml(doc.id)}">Load</button>
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
              ${escapeHtml(c.name)}
              ${docCountLabel}
            </div>
            <div style="font-size:11.5px; color:#64748b; margin-top:3px;">
              ${escapeHtml(c.email || 'No email')} ${c.phone ? ' &bull; ' + escapeHtml(c.phone) : ''} ${c.taxId ? ' &bull; Tax: ' + escapeHtml(c.taxId) : ''}
            </div>
          </div>
          <div style="display:flex; gap:6px; align-items:center;">
            ${clientDocs.length > 0 ? `<button class="btn btn-secondary btn-sm btn-toggle-client-history" data-client-id="${escapeHtml(c.id)}">History (${clientDocs.length})</button>` : ''}
            <button class="btn btn-primary btn-sm btn-select-client" data-id="${escapeHtml(c.id)}" title="Fill this client into current document">Use Client</button>
            <button class="btn btn-secondary btn-sm btn-new-for-client" data-id="${escapeHtml(c.id)}" title="Start fresh document for this client">+ New Doc</button>
            <button class="btn btn-danger btn-sm btn-icon btn-del-client" data-id="${escapeHtml(c.id)}" title="Delete client">
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
      const inv = await getInvoice(btn.dataset.docId);
      if (inv) {
        normalizeInvoice(inv);
        currentInvoice = JSON.parse(JSON.stringify(inv));
        if (inv.sender && inv.sender.name) {
          try {
            const allComps = await getAllCompanies();
            const match = allComps.find(comp => comp.name === inv.sender.name);
            if (match) activeCompanyProfileId = match.id;
          } catch (e) {}
        }
        populateFormFields();
        renderLineItemsEditor();
        renderTaxesEditor();
        updateSheetView();
        triggerAutoSave();
        closeModal('modal-clients');
      }
    });
  });

  // Bind Use Client
  container.querySelectorAll('.btn-select-client').forEach(btn => {
    btn.addEventListener('click', async () => {
      const match = clients.find(c => c.id === btn.dataset.id);
      if (match) {
        currentInvoice.client = {
          name: match.name,
          email: match.email || '',
          phone: match.phone || '',
          address: match.address || '',
          taxId: match.taxId || ''
        };
        populateFormFields();
        updateSheetView();
        triggerAutoSave();
        closeModal('modal-clients');
      }
    });
  });

  // Bind + New Doc for Client
  container.querySelectorAll('.btn-new-for-client').forEach(btn => {
    btn.addEventListener('click', async () => {
      const match = clients.find(c => c.id === btn.dataset.id);
      if (match) {
        closeModal('modal-clients');
        await resetToFreshDocument(match);
      }
    });
  });

  // Bind Delete Client
  container.querySelectorAll('.btn-del-client').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (confirm('Permanently delete this client from your address book?')) {
        await deleteClient(btn.dataset.id);
        await renderClientsList();
      }
    });
  });
}

function calculateTotal(inv) {
  let sub = 0;
  let totalTax = 0;
  (inv.items || []).forEach(item => {
    const q = clampNum(item.qty, 0, 1000000, 0);
    const r = clampNum(item.rate, 0, 1000000000, 0);
    const d = clampNum(item.discount, 0, 100, 0);
    const taxable = q * r * (1 - d / 100);
    const rawRate = (item.taxRate !== undefined && item.taxRate !== null) ? parseFloat(item.taxRate) : 18;
    const taxRate = isFinite(rawRate) ? Math.min(100, Math.max(0, rawRate)) : 0;
    sub += taxable;
    totalTax += taxable * (taxRate / 100);
  });
  const total = sub + totalTax;
  return isFinite(total) ? total : 0;
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
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(async () => {
    try {
      await saveActiveDraft(currentInvoice);
    } catch (e) {
      console.warn('Auto-save error:', e);
    }
  }, 600);
}

function escapeHtml(str) {
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

// Central numeric sanitizer: clamps parsed numbers into [min, max], falls back on NaN.
function clampNum(value, min, max, fallback = 0) {
  const n = parseFloat(value);
  if (!isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
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
  updateDocumentPaginationLive();
});




})();
