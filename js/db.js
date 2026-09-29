/**
 * InvoiceCraftDB - IndexedDB Storage Layer
 * Privacy-first, local-only client-side database for invoices, clients, and assets.
 */

const DB_NAME = 'InvoiceCraftDB';
const DB_VERSION = 2;

let dbInstance = null;

export async function openDB() {
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
export async function saveInvoice(invoice) {
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

export async function getInvoice(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['invoices'], 'readonly');
    const store = tx.objectStore('invoices');
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllInvoices() {
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

export async function deleteInvoice(id) {
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
export async function saveActiveDraft(draft) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['settings'], 'readwrite');
    const store = tx.objectStore('settings');
    const req = store.put({ key: 'activeDraft', data: draft, updatedAt: Date.now() });
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

export async function getActiveDraft() {
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
export async function saveCompany(company) {
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

export async function getCompany(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['companies'], 'readonly');
    const store = tx.objectStore('companies');
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllCompanies() {
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

export async function deleteCompany(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['companies'], 'readwrite');
    const store = tx.objectStore('companies');
    const req = store.delete(id);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

export async function setDefaultCompany(id) {
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

export async function getDefaultCompany() {
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
export async function saveCompanyProfile(profile) {
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

export async function getCompanyProfile() {
  const def = await getDefaultCompany();
  if (def) return def;
  return await getLegacyProfile();
}

// Clients Directory
export async function saveClient(client) {
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

export async function getAllClients() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['clients'], 'readonly');
    const store = tx.objectStore('clients');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteClient(id) {
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
export const DEFAULT_NUMBERING_CONFIG = {
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

export async function saveNumberingConfig(config) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['settings'], 'readwrite');
    const store = tx.objectStore('settings');
    const req = store.put({ key: 'numberingConfig', data: config });
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

export async function getNumberingConfig() {
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
export async function exportAllData() {
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

export async function importAllData(data) {
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
