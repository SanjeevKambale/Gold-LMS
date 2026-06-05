import type { Database, SqlJsStatic } from 'sql.js';
import _initSqlJs from 'sql.js';
const initSqlJs: (config?: { locateFile: (filename: string) => string }) => Promise<SqlJsStatic> =
  ((_initSqlJs as any).default ?? _initSqlJs) as any;

import { supabase, isConfigured, supabaseUrl, supabaseAnonKey } from './supabaseClient';
import { User, Customer, Loan, EMI, Payment, GoldRate, LoanTransfer, ActivityLog } from '../types';

let db: Database | null = null;
let SQLInstance: SqlJsStatic | null = null;
let initError: string | null = null;
let isInitializing = false;
let isInitialized = false;
let initPromise: Promise<void> | null = null;
const DB_STORE_NAME = 'gold_loan_db';
const DB_KEY = 'database';
const DB_FILE_NAME = 'gold_loan_data.db';

// ─── UNIFIED CACHED MEMORY ARRAYS ────────────────────────────────────────────
export let cachedUsers: User[] = [];
export let cachedCustomers: Customer[] = [];
export let cachedLoans: Loan[] = [];
export let cachedEmis: EMI[] = [];
export let cachedPayments: Payment[] = [];
export let cachedSettings: { [key: string]: string } = {};
export let cachedGoldRates: GoldRate[] = [];
export let cachedTransfers: LoanTransfer[] = [];
export let cachedActivityLogs: ActivityLog[] = [];

// ─── NETWORK CONNECTION CHECK ────────────────────────────────────────────────
export async function isOnline(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return false;
  }
  try {
    const headers: HeadersInit = {};
    if (supabaseAnonKey && supabaseAnonKey !== 'placeholder-key') {
      headers['apikey'] = supabaseAnonKey;
    }
    const response = await fetch(`${supabaseUrl}/rest/v1/`, { 
      method: 'HEAD', 
      headers, 
      cache: 'no-store' 
    });
    return response.status === 200 || response.status === 401 || response.status === 400;
  } catch {
    return false;
  }
}

// ─── LOCAL FILE & INDEXEDDB UTILITIES ────────────────────────────────────────
function getDbFilePath(): string | null {
  if (typeof window !== 'undefined' && (window as any).process && (window as any).require) {
    try {
      const path = (window as any).require('path');
      const electron = (window as any).require('electron');
      let baseDir: string | null = null;
      try {
        const app = electron.app || (electron.remote && electron.remote.app);
        if (app) baseDir = app.getPath('userData');
      } catch {}

      if (!baseDir) {
        const appName = 'Gold Loan Manager';
        if (process.platform === 'win32' && process.env.APPDATA) {
          baseDir = path.join(process.env.APPDATA, appName);
        } else if (process.platform === 'darwin' && process.env.HOME) {
          baseDir = path.join(process.env.HOME, 'Library', 'Application Support', appName);
        } else if (process.env.HOME) {
          baseDir = path.join(process.env.HOME, '.config', appName);
        }
      }

      if (!baseDir) {
        baseDir = window.location.pathname.replace(/\/[^\/]+$/, '');
        if (process.platform === 'win32' || baseDir.includes(':')) {
          baseDir = baseDir.replace(/^\/([A-Z]:)/i, '$1').replace(/\//g, path.sep);
          baseDir = decodeURIComponent(baseDir);
        }
      }
      
      if (baseDir) {
        try {
          const fs = (window as any).require('fs');
          if (!fs.existsSync(baseDir)) {
            fs.mkdirSync(baseDir, { recursive: true });
          }
        } catch {}
        return path.join(baseDir, DB_FILE_NAME);
      }
    } catch (e) {
      console.warn("Failed to determine DB path:", e);
    }
  }
  return null;
}

async function loadFromFile(): Promise<Uint8Array | null> {
  const filePath = getDbFilePath();
  if (filePath) {
    try {
      const fs = (window as any).require('fs');
      if (fs.existsSync(filePath)) {
        const buffer = fs.readFileSync(filePath);
        return new Uint8Array(buffer);
      }
    } catch (e) {
      console.warn("Failed to load from file:", e);
    }
  }
  return null;
}

async function saveToFile(data: Uint8Array): Promise<void> {
  const filePath = getDbFilePath();
  if (filePath) {
    try {
      const fs = (window as any).require('fs');
      fs.writeFileSync(filePath, Buffer.from(data));
    } catch (e) {
      console.error("Failed to save to file:", e);
    }
  }
}

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_STORE_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadFromIDB(): Promise<Uint8Array | null> {
  try {
    const idb = await openIDB();
    return new Promise((resolve, reject) => {
      const tx = idb.transaction(DB_STORE_NAME, 'readonly');
      const req = tx.objectStore(DB_STORE_NAME).get(DB_KEY);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function saveToIDB(data: Uint8Array): Promise<void> {
  try {
    const idb = await openIDB();
    return new Promise<void>((resolve, reject) => {
      const tx = idb.transaction(DB_STORE_NAME, 'readwrite');
      const req = tx.objectStore(DB_STORE_NAME).put(data, DB_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error(err);
  }
}

export function saveDB(): void {
  if (db) {
    const data = db.export();
    saveToFile(data).catch(() => {});
    saveToIDB(data).catch(console.error);
  }
}

// ─── SQLITE SCHEMA CREATION ──────────────────────────────────────────────────
function createSQLiteSchema(database: Database): void {
  database.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      email TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      address TEXT NOT NULL,
      kyc_status TEXT NOT NULL DEFAULT 'pending',
      kyc_document TEXT NOT NULL,
      kyc_number TEXT NOT NULL,
      created_at TEXT NOT NULL,
      photo_url TEXT,
      created_by TEXT,
      kyc_docs_json TEXT
    );

    CREATE TABLE IF NOT EXISTS loan_types (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      interest_rate REAL NOT NULL,
      min_amount REAL NOT NULL,
      max_amount REAL NOT NULL,
      min_tenure INTEGER NOT NULL,
      max_tenure INTEGER NOT NULL,
      repayment_scheme TEXT NOT NULL DEFAULT 'EMI'
    );

    CREATE TABLE IF NOT EXISTS gold_rates (
      id TEXT PRIMARY KEY,
      gold_type TEXT NOT NULL UNIQUE,
      rate_per_gram REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS loans (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      gold_weight REAL NOT NULL,
      gold_type TEXT NOT NULL,
      gold_value REAL NOT NULL,
      item_type TEXT,
      loan_amount REAL NOT NULL,
      loan_type_id TEXT NOT NULL,
      loan_type_name TEXT NOT NULL,
      interest_rate REAL NOT NULL,
      tenure INTEGER NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      emi_amount REAL NOT NULL,
      created_by TEXT,
      branch_id TEXT,
      locker_number TEXT,
      packet_number TEXT,
      ornament_photo_url TEXT,
      repayment_scheme TEXT NOT NULL DEFAULT 'EMI',
      penalty_rate REAL NOT NULL DEFAULT 2
    );

    CREATE TABLE IF NOT EXISTS emis (
      id TEXT PRIMARY KEY,
      loan_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      emi_number INTEGER NOT NULL,
      due_date TEXT NOT NULL,
      amount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      paid_date TEXT,
      paid_amount REAL,
      payment_method TEXT,
      transaction_ref TEXT,
      payment_id TEXT,
      created_by TEXT,
      penalty_rate REAL NOT NULL DEFAULT 2
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      loan_id TEXT NOT NULL,
      payment_type TEXT NOT NULL,
      amount REAL NOT NULL,
      payment_date TEXT NOT NULL,
      principal_component REAL NOT NULL DEFAULT 0,
      interest_component REAL NOT NULL DEFAULT 0,
      penalty_component REAL NOT NULL DEFAULT 0,
      payment_method TEXT,
      transaction_ref TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL,
      customer_name TEXT
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      user_role TEXT NOT NULL,
      activity_type TEXT NOT NULL,
      description TEXT NOT NULL,
      details TEXT,
      timestamp TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS loan_transfers (
      id TEXT PRIMARY KEY,
      loan_id TEXT NOT NULL,
      from_customer_id TEXT NOT NULL,
      to_customer_id TEXT NOT NULL,
      from_branch TEXT,
      to_branch TEXT,
      transfer_date TEXT NOT NULL,
      outstanding_amount REAL NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      requested_by TEXT NOT NULL,
      requested_by_name TEXT NOT NULL,
      approved_by TEXT,
      approved_by_name TEXT,
      rejection_reason TEXT
    );

    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY,
      table_name TEXT NOT NULL,
      action TEXT NOT NULL,
      record_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      timestamp TEXT NOT NULL
    );
  `);
}

// ─── SQLITE CRUD HELPERS ─────────────────────────────────────────────────────
export function queryRows(sql: string, params: any[] = []): any[] {
  if (!db) return [];
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows: any[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

export function insertLocalRow(tableName: string, payload: any, skipSave = false): void {
  if (!db) return;
  const keys = Object.keys(payload);
  const values = Object.values(payload) as any[];
  const placeholders = keys.map(() => '?').join(', ');
  const sql = `INSERT OR REPLACE INTO ${tableName} (${keys.join(', ')}) VALUES (${placeholders})`;
  db.run(sql, values);
  if (!skipSave) saveDB();
}

export function updateLocalRow(tableName: string, payload: any, recordId: string, skipSave = false): void {
  if (!db) return;
  const keys = Object.keys(payload);
  const values = Object.values(payload) as any[];
  const setClause = keys.map(k => `${k} = ?`).join(', ');
  const idCol = tableName === 'settings' ? 'key' : 'id';
  const sql = `UPDATE ${tableName} SET ${setClause} WHERE ${idCol} = ?`;
  db.run(sql, [...values, recordId]);
  if (!skipSave) saveDB();
}

export function deleteLocalRow(tableName: string, recordId: string, skipSave = false): void {
  if (!db) return;
  const idCol = tableName === 'settings' ? 'key' : 'id';
  const sql = `DELETE FROM ${tableName} WHERE ${idCol} = ?`;
  db.run(sql, [recordId]);
  if (!skipSave) saveDB();
}

// ─── HYBRID SYNC WRITE OPERATOR ──────────────────────────────────────────────
export function syncWrite(
  tableName: string,
  action: 'insert' | 'update' | 'delete',
  recordId: string,
  payload?: any
): void {
  // 1. Commit to SQLite synchronously first
  try {
    if (action === 'insert') {
      insertLocalRow(tableName, payload);
    } else if (action === 'update') {
      updateLocalRow(tableName, payload, recordId);
    } else if (action === 'delete') {
      deleteLocalRow(tableName, recordId);
    }
  } catch (err) {
    console.error(`Failed to commit local SQLite write on ${tableName}:`, err);
  }

  // 2. Queue or sync to Supabase in the background
  (async () => {
    try {
      const online = await isOnline();
      if (!online) {
        throw new Error('Offline mode active.');
      }

      let error;
      if (action === 'insert') {
        const res = await supabase.from(tableName).insert([payload]);
        error = res.error;
      } else if (action === 'update') {
        const idCol = tableName === 'settings' ? 'key' : 'id';
        const res = await supabase.from(tableName).update(payload).eq(idCol, recordId);
        error = res.error;
      } else if (action === 'delete') {
        const idCol = tableName === 'settings' ? 'key' : 'id';
        const res = await supabase.from(tableName).delete().eq(idCol, recordId);
        error = res.error;
      }

      if (error) throw error;
    } catch (err: any) {
      console.warn(`Cloud push failed for ${tableName} (${action}). Appending to sync queue.`, err.message || err);
      // Append to the sync queue in local SQLite
      const queueItem = {
        id: `sq_${Math.random().toString(36).substring(2, 11)}_${Date.now()}`,
        table_name: tableName,
        action,
        record_id: recordId,
        payload_json: payload ? JSON.stringify(payload) : '{}',
        timestamp: new Date().toISOString()
      };
      try {
        insertLocalRow('sync_queue', queueItem);
      } catch (qErr) {
        console.error('Failed to append to sync queue in SQLite:', qErr);
      }
    }
  })();
}

// ─── SYNC QUEUE PROCESSING ───────────────────────────────────────────────────
let isSyncing = false;

export async function processSyncQueue(): Promise<void> {
  if (isSyncing) return;
  if (!db) return;

  try {
    const online = await isOnline();
    if (!online) return;

    const queue = queryRows("SELECT * FROM sync_queue ORDER BY timestamp ASC");
    if (queue.length === 0) return;

    isSyncing = true;
    console.log(`Synchronizing ${queue.length} offline operations to Supabase cloud...`);

    for (const item of queue) {
      const { id, table_name, action, record_id, payload_json } = item;
      const payload = JSON.parse(payload_json);

      let error;
      if (action === 'insert') {
        const res = await supabase.from(table_name).insert([payload]);
        error = res.error;
      } else if (action === 'update') {
        const idCol = table_name === 'settings' ? 'key' : 'id';
        const res = await supabase.from(table_name).update(payload).eq(idCol, record_id);
        error = res.error;
      } else if (action === 'delete') {
        const idCol = table_name === 'settings' ? 'key' : 'id';
        const res = await supabase.from(table_name).delete().eq(idCol, record_id);
        error = res.error;
      }

      if (error) {
        const isNetwork = error.message && (
          error.message.includes('fetch') ||
          error.message.includes('Network') ||
          error.message.includes('getaddrinfo')
        );
        if (isNetwork) {
          console.warn("Network unreachable. Pausing sync queue execution.");
          break;
        } else {
          // If it's a structural or validation error, delete from queue so it doesn't block the rest
          console.error(`Supabase rejected synced item ${id} on ${table_name}: ${error.message}`);
          db.run("DELETE FROM sync_queue WHERE id = ?", [id]);
          saveDB();
        }
      } else {
        // Success: remove from local queue
        db.run("DELETE FROM sync_queue WHERE id = ?", [id]);
        saveDB();
        console.log(`Successfully synced offline ${action} for ${table_name} id ${record_id}`);
      }
    }
  } catch (err) {
    console.error("Failed executing processSyncQueue loop:", err);
  } finally {
    isSyncing = false;
  }
}

// ─── SQLITE CACHE LOADERS ────────────────────────────────────────────────────
export function loadSQLiteToCache(): void {
  // 1. Users
  cachedUsers = queryRows("SELECT * FROM users ORDER BY created_at ASC").map(r => ({
    id: r.id,
    username: r.username,
    name: r.name,
    role: r.role as 'admin' | 'staff',
    email: r.email,
    createdAt: r.created_at
  }));

  // 2. Customers
  cachedCustomers = queryRows("SELECT * FROM customers ORDER BY created_at DESC").map(r => ({
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    address: r.address,
    kycStatus: r.kyc_status as 'pending' | 'verified' | 'rejected',
    kycDocument: r.kyc_document,
    kycNumber: r.kyc_number,
    kycDocuments: r.kyc_docs_json ? JSON.parse(r.kyc_docs_json) : [],
    createdAt: r.created_at,
    photoUrl: r.photo_url || undefined,
    createdBy: r.created_by || undefined
  }));

  // 3. Loans
  cachedLoans = queryRows("SELECT * FROM loans ORDER BY start_date DESC").map(r => ({
    id: r.id,
    customerId: r.customer_id,
    customerName: r.customer_name,
    goldWeight: r.gold_weight,
    goldType: r.gold_type as '24K' | '22K' | '18K',
    goldValue: r.gold_value,
    itemType: r.item_type || '',
    loanAmount: r.loan_amount,
    loanTypeId: r.loan_type_id,
    loanTypeName: r.loan_type_name,
    interestRate: r.interest_rate,
    tenure: r.tenure,
    startDate: r.start_date,
    endDate: r.end_date,
    status: r.status as any,
    emiAmount: r.emi_amount,
    createdBy: r.created_by || undefined,
    branchId: r.branch_id || undefined,
    lockerNumber: r.locker_number || undefined,
    packetNumber: r.packet_number || undefined,
    ornamentPhotoUrl: r.ornament_photo_url || undefined,
    repaymentScheme: r.repayment_scheme as 'EMI' | 'BULLET',
    penaltyRate: r.penalty_rate ?? 2
  }));

  // 4. EMIs
  cachedEmis = queryRows("SELECT * FROM emis ORDER BY due_date ASC").map(r => ({
    id: r.id,
    loanId: r.loan_id,
    customerId: r.customer_id,
    customerName: r.customer_name,
    emiNumber: r.emi_number,
    dueDate: r.due_date,
    amount: r.amount,
    status: r.status as any,
    paidDate: r.paid_date || undefined,
    paidAmount: r.paid_amount || undefined,
    paymentMethod: r.payment_method || undefined,
    transactionRef: r.transaction_ref || undefined,
    paymentId: r.payment_id || undefined,
    createdBy: r.created_by || undefined,
    penaltyRate: r.penalty_rate ?? 2
  }));

  // 5. Payments
  cachedPayments = queryRows("SELECT * FROM payments ORDER BY payment_date ASC").map(r => ({
    id: r.id,
    loanId: r.loan_id,
    paymentType: r.payment_type as any,
    amount: r.amount,
    paymentDate: r.payment_date,
    principalComponent: r.principal_component,
    interestComponent: r.interest_component,
    penaltyComponent: r.penalty_component,
    paymentMethod: r.payment_method || undefined,
    transactionRef: r.transaction_ref || undefined,
    createdBy: r.created_by || undefined,
    createdAt: r.created_at,
    customerName: r.customer_name || undefined
  }));

  // 6. Settings
  cachedSettings = {};
  queryRows("SELECT * FROM settings").forEach(r => {
    cachedSettings[r.key] = r.value;
  });

  // 7. Gold Rates
  cachedGoldRates = queryRows("SELECT * FROM gold_rates ORDER BY gold_type ASC").map(r => ({
    id: r.id,
    goldType: r.gold_type as '24K' | '22K' | '18K',
    ratePerGram: r.rate_per_gram,
    updatedAt: r.updated_at
  }));

  // 8. Loan Transfers
  cachedTransfers = queryRows("SELECT * FROM loan_transfers ORDER BY transfer_date DESC").map(r => ({
    id: r.id,
    loanId: r.loan_id,
    fromCustomerId: r.from_customer_id,
    toCustomerId: r.to_customer_id,
    fromBranch: r.from_branch || undefined,
    toBranch: r.to_branch || undefined,
    transferDate: r.transfer_date,
    outstandingAmount: r.outstanding_amount,
    reason: r.reason,
    status: r.status as 'pending' | 'approved' | 'rejected',
    requestedBy: r.requested_by,
    requestedByName: r.requested_by_name,
    approvedBy: r.approved_by || undefined,
    approvedByName: r.approved_by_name || undefined,
    rejectionReason: r.rejection_reason || undefined
  }));

  // 9. Activity Logs
  cachedActivityLogs = queryRows("SELECT * FROM activity_logs ORDER BY timestamp DESC LIMIT 1000").map(r => ({
    id: r.id,
    userId: r.user_id,
    userName: r.user_name,
    userRole: r.user_role as 'admin' | 'staff',
    activityType: r.activity_type as any,
    description: r.description,
    details: r.details || undefined,
    timestamp: r.timestamp
  }));
}

export async function loadSupabaseToSQLite(): Promise<void> {
  if (!db) return;

  const [
    rUsers,
    rCustomers,
    rLoans,
    rEmis,
    rPayments,
    rSettings,
    rGoldRates,
    rTransfers,
    rLogs
  ] = await Promise.all([
    supabase.from('users').select('*'),
    supabase.from('customers').select('*'),
    supabase.from('loans').select('*'),
    supabase.from('emis').select('*'),
    supabase.from('payments').select('*'),
    supabase.from('settings').select('*'),
    supabase.from('gold_rates').select('*'),
    supabase.from('loan_transfers').select('*'),
    supabase.from('activity_logs').select('*').limit(1000)
  ]);

  db.run("BEGIN TRANSACTION");
  try {
    db.run("DELETE FROM users");
    db.run("DELETE FROM customers");
    db.run("DELETE FROM loans");
    db.run("DELETE FROM emis");
    db.run("DELETE FROM payments");
    db.run("DELETE FROM settings");
    db.run("DELETE FROM gold_rates");
    db.run("DELETE FROM loan_transfers");
    db.run("DELETE FROM activity_logs");

    (rUsers.data || []).forEach(r => insertLocalRow('users', r, true));
    (rCustomers.data || []).forEach(r => insertLocalRow('customers', r, true));
    (rLoans.data || []).forEach(r => insertLocalRow('loans', r, true));
    (rEmis.data || []).forEach(r => insertLocalRow('emis', r, true));
    (rPayments.data || []).forEach(r => insertLocalRow('payments', r, true));
    (rSettings.data || []).forEach(r => insertLocalRow('settings', r, true));
    (rGoldRates.data || []).forEach(r => insertLocalRow('gold_rates', r, true));
    (rTransfers.data || []).forEach(r => insertLocalRow('loan_transfers', r, true));
    (rLogs.data || []).forEach(r => insertLocalRow('activity_logs', r, true));

    db.run("COMMIT");
  } catch (err) {
    db.run("ROLLBACK");
    console.error("Failed to populate SQLite from Supabase:", err);
    throw err;
  }
  saveDB();
}

// ─── INITIALIZATION LIFECYCLE ────────────────────────────────────────────────
export async function initDatabase(): Promise<void> {
  if (isInitialized) return;
  if (isInitializing) return initPromise!;

  if (!isConfigured) {
    throw new Error('Supabase configuration parameters missing.');
  }

  isInitializing = true;
  initPromise = (async () => {
    try {
      let config: any = {};
      if (typeof window !== 'undefined' && (window as any).process && (window as any).require) {
        try {
          const fs = (window as any).require('fs');
          const path = (window as any).require('path');
          let wasmPath: string;

          if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            wasmPath = path.join(process.cwd(), 'public', 'sql-wasm.wasm');
          } else {
            let baseDir = window.location.pathname.replace(/\/[^\/]+$/, '');
            if (process.platform === 'win32' || baseDir.includes(':')) {
              baseDir = baseDir.replace(/^\/([A-Z]:)/i, '$1').replace(/\//g, path.sep);
              baseDir = decodeURIComponent(baseDir);
            }
            wasmPath = path.join(baseDir, 'sql-wasm.wasm');
          }

          const wasmBinary = fs.readFileSync(wasmPath);
          config = { wasmBinary };
        } catch (e: any) {
          console.warn("Locating sql-wasm.wasm fallback:", e);
          config = { locateFile: (file: string) => file };
        }
      } else {
        config = { locateFile: (file: string) => file };
      }

      const SQL = await initSqlJs(config);
      SQLInstance = SQL;

      // 1. Try file-based SQLite database load (Electron userData directory)
      let savedData = await loadFromFile();
      // 2. Try IndexedDB database load (Web/Legacy fallback)
      if (!savedData) {
        savedData = await loadFromIDB();
      }

      if (savedData) {
        db = new SQL.Database(savedData);
      } else {
        db = new SQL.Database();
      }

      // Ensure the SQLite schema matching Supabase structure is created
      createSQLiteSchema(db);

      const online = await isOnline();
      if (online) {
        console.log("Device is ONLINE. Synchronizing cloud data...");
        // Flush queue first to avoid overwriting newer local edits
        await processSyncQueue();
        // Re-load SQLite from Supabase cloud snapshot
        await loadSupabaseToSQLite();
        // Hydrate memory cache arrays
        loadSQLiteToCache();
      } else {
        console.log("Device is OFFLINE. Loading local SQLite backup...");
        // Load straight from SQLite backup into cache arrays
        loadSQLiteToCache();
      }

      // Seeding default configuration/settings if missing in cache
      if (Object.keys(cachedSettings).length === 0) {
        const defaultSettings = {
          shop_name: 'Gold Loan Manager',
          shop_upi_id: 'goldloanshop@upi',
          shop_address: 'Gold Loan Shop, India',
          shop_phone: '+91-9999999999'
        };
        Object.entries(defaultSettings).forEach(([key, value]) => {
          syncWrite('settings', 'insert', key, { key, value });
        });
        cachedSettings = defaultSettings;
      }

      // Seeding default gold rates if missing in cache
      if (cachedGoldRates.length === 0) {
        const todayStr = new Date().toISOString().split('T')[0];
        const defaultRates = [
          { id: '1', gold_type: '24K', rate_per_gram: 6500, updated_at: todayStr },
          { id: '2', gold_type: '22K', rate_per_gram: 5950, updated_at: todayStr },
          { id: '3', gold_type: '18K', rate_per_gram: 4875, updated_at: todayStr }
        ];
        defaultRates.forEach(r => syncWrite('gold_rates', 'insert', r.id, r));
        cachedGoldRates = defaultRates.map(r => ({
          id: r.id,
          goldType: r.gold_type as any,
          ratePerGram: r.rate_per_gram,
          updatedAt: r.updated_at
        }));
      }

      // ─── START AUTOMATIC BACKGROUND SYNC WORKER ──────────────────────────────
      setInterval(() => {
        processSyncQueue().catch(console.error);
      }, 30000); // Trigger queue check every 30 seconds

      if (typeof window !== 'undefined') {
        window.addEventListener('online', () => {
          console.log("Network online event detected. Processing sync queue...");
          processSyncQueue().catch(console.error);
        });
      }

      console.log("Database initialized and loaded successfully!");
      isInitialized = true;
      isInitializing = false;
    } catch (err: any) {
      isInitializing = false;
      initPromise = null;
      initError = err?.message || String(err);
      console.error("Database initialization failed:", err);
      throw err;
    }
  })();

  return initPromise;
}

export function getDB(): Database {
  if (!db) {
    if (initError) {
      throw new Error(`Database failed to start: ${initError}`);
    }
    throw new Error('Database not initialized. Please wait or restart the app.');
  }
  return db;
}

export function adminExists(): boolean {
  return cachedUsers.some(u => u.role === 'admin');
}

export function resetApplicationData(): void {
  try {
    cachedUsers = [];
    cachedCustomers = [];
    cachedLoans = [];
    cachedEmis = [];
    cachedPayments = [];
    cachedSettings = {};
    cachedTransfers = [];
    cachedActivityLogs = [];

    if (db) {
      db.run("DELETE FROM users");
      db.run("DELETE FROM customers");
      db.run("DELETE FROM loans");
      db.run("DELETE FROM emis");
      db.run("DELETE FROM payments");
      db.run("DELETE FROM settings");
      db.run("DELETE FROM gold_rates");
      db.run("DELETE FROM loan_transfers");
      db.run("DELETE FROM activity_logs");
      db.run("DELETE FROM sync_queue");
      saveDB();
    }

    Promise.all([
      supabase.from('loan_transfers').delete().neq('id', 'placeholder'),
      supabase.from('activity_logs').delete().neq('id', 'placeholder'),
      supabase.from('payments').delete().neq('id', 'placeholder'),
      supabase.from('emis').delete().neq('id', 'placeholder'),
      supabase.from('loans').delete().neq('id', 'placeholder'),
      supabase.from('customers').delete().neq('id', 'placeholder'),
      supabase.from('users').delete().neq('id', 'placeholder'),
      supabase.from('settings').delete().neq('key', 'placeholder')
    ]).catch(err => console.error("Purging cloud data failed:", err));

  } catch (err) {
    console.error('Failed to execute database factory reset:', err);
    throw err;
  }
}

export function exportDatabase(): void {
  if (!db) {
    console.error("No active database to export.");
    return;
  }
  try {
    const data = db.export();
    const blob = new Blob([data as any], { type: 'application/x-sqlite3' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gold_loan_backup_${new Date().toISOString().split('T')[0]}.db`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log("Database backup file downloaded successfully!");
  } catch (err) {
    console.error("Failed to export database:", err);
    throw err;
  }
}

export function importDatabase(data: Uint8Array): void {
  if (!SQLInstance) {
    throw new Error("SQL.js is not initialized. Please wait or restart the app.");
  }
  
  // 1. Close current DB if active
  if (db) {
    try {
      db.close();
    } catch (e) {
      console.warn("Error closing old DB instance:", e);
    }
  }

  // 2. Instantiate new DB using the imported Uint8Array
  db = new SQLInstance.Database(data);

  // 3. Ensure schema exists (safety fallback)
  createSQLiteSchema(db);

  // 4. Save to IndexedDB and local file
  saveDB();

  // 5. Reload cached arrays
  loadSQLiteToCache();

  console.log("Database restored successfully from imported backup!");
}
