import type { Database, SqlJsStatic } from 'sql.js';
// sql.js is CommonJS - Vite pre-bundles it, but we need to handle default-interop
import _initSqlJs from 'sql.js';
const initSqlJs: (config?: { locateFile: (filename: string) => string }) => Promise<SqlJsStatic> =
  ((_initSqlJs as any).default ?? _initSqlJs) as any;
import { hashPassword } from './db/authService';
import { updateOverdueEMIs } from './db/emiService';
import { getSystemWorkingDate } from './workingDate';

let db: Database | null = null;
let initError: string | null = null;
let SQLInstance: SqlJsStatic | null = null;
const DB_STORE_NAME = 'gold_loan_db';
const DB_KEY = 'database';
const DB_FILE_NAME = 'gold_loan_data.db';

// ─── File-based helpers (Electron only) ──────────────────────────────────────
function getDbFilePath(): string | null {
  if (typeof window !== 'undefined' && (window as any).process && (window as any).require) {
    try {
      const path = (window as any).require('path');
      const electron = (window as any).require('electron');
      
      let baseDir: string | null = null;
      
      // Try getting path from Electron's app (via remote if available, or directly)
      try {
        const app = electron.app || (electron.remote && electron.remote.app);
        if (app) {
          baseDir = app.getPath('userData');
        }
      } catch (e) {}

      // Fallback to environment variables if Electron app path is not accessible
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

      // Final fallback to the folder containing the executable
      if (!baseDir) {
        baseDir = window.location.pathname.replace(/\/[^\/]+$/, '');
        if (process.platform === 'win32' || baseDir.includes(':')) {
          baseDir = baseDir.replace(/^\/([A-Z]:)/i, '$1').replace(/\//g, path.sep);
          baseDir = decodeURIComponent(baseDir);
        }
      }
      
      // Ensure the directory exists (optional but good practice)
      if (baseDir) {
        try {
          const fs = (window as any).require('fs');
          if (!fs.existsSync(baseDir)) {
            fs.mkdirSync(baseDir, { recursive: true });
          }
        } catch (e) {}
        
        const finalPath = path.join(baseDir, DB_FILE_NAME);
        console.log("Database path:", finalPath);
        return finalPath;
      }
    } catch (e) {
      console.warn("Failed to determine DB path:", e);
      return null;
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

// ─── IndexedDB helpers ────────────────────────────────────────────────────────
function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_STORE_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadFromIDB(): Promise<Uint8Array | null> {
  const idb = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(DB_STORE_NAME, 'readonly');
    const req = tx.objectStore(DB_STORE_NAME).get(DB_KEY);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function saveToIDB(data: Uint8Array): Promise<void> {
  const idb = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(DB_STORE_NAME, 'readwrite');
    const req = tx.objectStore(DB_STORE_NAME).put(data, DB_KEY);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ─── Save helper (call after every write) ────────────────────────────────────
export function saveDB(): void {
  if (db) {
    const data = db.export();
    // 1. Try file-based save (Electron)
    saveToFile(data).catch(() => {});
    // 2. Keep IndexedDB as backup/web-fallback
    saveToIDB(data).catch(console.error);
  }
}

// ─── Schema + seed ────────────────────────────────────────────────────────────
function createSchema(database: Database): void {
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
      created_by TEXT
    );

    CREATE TABLE IF NOT EXISTS loan_types (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      interest_rate REAL NOT NULL,
      min_amount REAL NOT NULL,
      max_amount REAL NOT NULL,
      min_tenure INTEGER NOT NULL,
      max_tenure INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS gold_rates (
      id TEXT PRIMARY KEY,
      gold_type TEXT NOT NULL,
      rate_per_gram REAL NOT NULL,
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

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
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

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      loan_id TEXT NOT NULL,
      payment_type TEXT NOT NULL,
      amount REAL NOT NULL,
      payment_date TEXT NOT NULL,
      principal_component REAL NOT NULL,
      interest_component REAL NOT NULL,
      penalty_component REAL NOT NULL,
      payment_method TEXT,
      transaction_ref TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL,
      customer_name TEXT
    );
  `);

    // Migration: Add new columns if they don't exist
    try {
      const tables = ['customers', 'loans', 'emis'];
      const adminResult = database.exec("SELECT id FROM users WHERE role='admin' LIMIT 1");
      const adminId = adminResult.length > 0 ? (adminResult[0].values[0][0] as string) : null;

      tables.forEach(table => {
        const tableInfo = database.exec(`PRAGMA table_info('${table}')`);
        if (tableInfo.length > 0) {
          const columns = tableInfo[0].values.map(row => row[1] as string);
          
          // Add created_by if missing
          if (!columns.includes('created_by')) {
            database.run(`ALTER TABLE ${table} ADD COLUMN created_by TEXT`);
            if (adminId) {
              database.run(`UPDATE ${table} SET created_by = ? WHERE created_by IS NULL`, [adminId]);
            }
          }

          // Add item_type to loans if missing
          if (table === 'loans' && !columns.includes('item_type')) {
            database.run("ALTER TABLE loans ADD COLUMN item_type TEXT");
            database.run("UPDATE loans SET item_type = 'Other' WHERE item_type IS NULL");
          }
          
          // Add kyc_docs_json to customers if missing
          if (table === 'customers' && !columns.includes('kyc_docs_json')) {
            database.run('ALTER TABLE customers ADD COLUMN kyc_docs_json TEXT');
          }
          
          // Add branch_id to loans if missing
          if (table === 'loans' && !columns.includes('branch_id')) {
            database.run('ALTER TABLE loans ADD COLUMN branch_id TEXT');
          }
          
          // Add locker_number to loans if missing
          if (table === 'loans' && !columns.includes('locker_number')) {
            database.run('ALTER TABLE loans ADD COLUMN locker_number TEXT');
          }

          // Add packet_number to loans if missing
          if (table === 'loans' && !columns.includes('packet_number')) {
            database.run('ALTER TABLE loans ADD COLUMN packet_number TEXT');
          }

          // Add ornament_photo_url to loans if missing
          if (table === 'loans' && !columns.includes('ornament_photo_url')) {
            database.run('ALTER TABLE loans ADD COLUMN ornament_photo_url TEXT');
          }

          // Add repayment_scheme to loans if missing
          if (table === 'loans' && !columns.includes('repayment_scheme')) {
            database.run("ALTER TABLE loans ADD COLUMN repayment_scheme TEXT");
            database.run("UPDATE loans SET repayment_scheme = 'EMI' WHERE repayment_scheme IS NULL");
          }
        }
      });

      // Add repayment_scheme to loan_types if missing
      const ltInfo = database.exec("PRAGMA table_info('loan_types')");
      if (ltInfo.length > 0) {
        const columns = ltInfo[0].values.map(row => row[1] as string);
        if (!columns.includes('repayment_scheme')) {
          database.run("ALTER TABLE loan_types ADD COLUMN repayment_scheme TEXT");
          database.run("UPDATE loan_types SET repayment_scheme = 'EMI' WHERE repayment_scheme IS NULL");
        }
      }

      // Cleanup: Remove any EMIs that were accidentally generated for Bullet loans
      try {
        database.run("DELETE FROM emis WHERE loan_id IN (SELECT id FROM loans WHERE repayment_scheme = 'BULLET')");
      } catch (e) {
        // Ignore if table doesn't exist yet
      }

      // Special case for existing emis table migration if not already handled
      const emiInfo = database.exec("PRAGMA table_info('emis')");
      if (emiInfo.length > 0) {
        const columns = emiInfo[0].values.map(row => row[1] as string);
        if (!columns.includes('payment_method')) {
          database.run("ALTER TABLE emis ADD COLUMN payment_method TEXT");
        }
        if (!columns.includes('transaction_ref')) {
          database.run("ALTER TABLE emis ADD COLUMN transaction_ref TEXT");
        }
        if (!columns.includes('payment_id')) {
          database.run("ALTER TABLE emis ADD COLUMN payment_id TEXT");
        }
      }

      // Add customer_name to payments if missing
      const paymentInfo = database.exec("PRAGMA table_info('payments')");
      if (paymentInfo.length > 0) {
        const paymentColumns = paymentInfo[0].values.map(row => row[1] as string);
        if (!paymentColumns.includes('customer_name')) {
          database.run("ALTER TABLE payments ADD COLUMN customer_name TEXT");
          // Backfill existing payments with customer name from loans table
          database.run(`
            UPDATE payments 
            SET customer_name = (SELECT customer_name FROM loans WHERE loans.id = payments.loan_id)
            WHERE customer_name IS NULL
          `);
        }
      }
    } catch (err) {
      console.error('Migration error:', err);
    }

    // Data Repair: Ensure all EMIs have created_by set correctly based on the loan creator
    try {
      database.run(`
        UPDATE emis 
        SET created_by = (SELECT created_by FROM loans WHERE loans.id = emis.loan_id) 
        WHERE created_by IS NULL
      `);
    } catch (err) {
      console.error('Data repair error:', err);
    }
  }

async function seedData(database: Database): Promise<void> {
  // REMOVED: Default users seeding (Admin/Staff) for "brand-new" application experience.
  // The app will now prompt the user to register an Admin account on first startup.

  // Seed gold rates
  const rateCount = (database.exec('SELECT COUNT(*) as c FROM gold_rates')[0]?.values[0][0] as number) ?? 0;
  if (rateCount === 0) {
    database.run(`
      INSERT INTO gold_rates (id, gold_type, rate_per_gram, updated_at) VALUES
        ('1', '24K', 0, '2024-03-15'),
        ('2', '22K', 0, '2024-03-15'),
        ('3', '18K', 0, '2024-03-15');
    `);
  } else {
    // Data Migration: Reset default rates if they match the initial seed
    try {
      database.run(`
        UPDATE gold_rates 
        SET rate_per_gram = 0 
        WHERE rate_per_gram IN (6500, 5950, 4875) AND updated_at = '2024-03-15'
      `);
    } catch (err) {
      console.error('Failed to reset default gold rates:', err);
    }
  }

  // Seed loan types
  const ltCount = (database.exec('SELECT COUNT(*) as c FROM loan_types')[0]?.values[0][0] as number) ?? 0;
  if (ltCount === 0) {
    database.run(`
      INSERT INTO loan_types (id, name, interest_rate, min_amount, max_amount, min_tenure, max_tenure) VALUES
        ('1', 'Standard Gold Loan', 12, 10000, 1000000, 6, 36),
        ('2', 'Premium Gold Loan', 10, 50000, 5000000, 12, 48),
        ('3', 'Quick Gold Loan', 15, 500, 500000, 3, 24);
    `);
  }

  // Seed default settings
  const settingsCount = (database.exec('SELECT COUNT(*) as c FROM settings')[0]?.values[0][0] as number) ?? 0;
  if (settingsCount === 0) {
    database.run(`
      INSERT INTO settings (key, value) VALUES
        ('shop_name', ''),
        ('shop_upi_id', ''),
        ('shop_address', ''),
        ('shop_phone', '');
    `);
  }
}

// ─── Settings Migration ───────────────────────────────────────────────────────
// Runs unconditionally on every startup to clear old hardcoded default values.
function migrateSettings(database: Database): void {
  try {
    database.run(`
      UPDATE settings 
      SET value = '' 
      WHERE (key = 'shop_name' AND value = 'Gold Loan Manager')
         OR (key = 'shop_phone' AND value = '+91-9999999999')
         OR (key = 'shop_address' AND value = 'Gold Loan Shop, India')
         OR (key = 'shop_upi_id' AND value = 'goldloanshop@upi')
    `);
  } catch (err) {
    console.error('Failed to reset default shop settings:', err);
  }
}

// ─── Penalty Rates Migration ──────────────────────────────────────────────────
// Ensures penalty_rate columns exist in the loans and emis tables for existing databases.
function migratePenaltyRates(database: Database): void {
  try {
    database.exec("SELECT penalty_rate FROM loans LIMIT 1");
  } catch (err) {
    console.log("Migrating loans table to add penalty_rate column...");
    try {
      database.run("ALTER TABLE loans ADD COLUMN penalty_rate REAL NOT NULL DEFAULT 2");
    } catch (alterErr) {
      console.error("Failed to alter loans table:", alterErr);
    }
  }

  try {
    database.exec("SELECT penalty_rate FROM emis LIMIT 1");
  } catch (err) {
    console.log("Migrating emis table to add penalty_rate column...");
    try {
      database.run("ALTER TABLE emis ADD COLUMN penalty_rate REAL NOT NULL DEFAULT 2");
    } catch (alterErr) {
      console.error("Failed to alter emis table:", alterErr);
    }
  }
}

// ─── Password migration (plaintext → SHA-256) ────────────────────────────────
// Detects unhashed passwords (not a 64-char hex string) and re-hashes them.
// Runs once on startup; safe to repeat (already-hashed rows are skipped).
async function migratePasswords(database: Database): Promise<void> {
  try {
    const result = database.exec('SELECT id, password FROM users');
    if (!result.length) return;

    let changed = false;
    for (const row of result[0].values) {
      const id = row[0] as string;
      const pwd = row[1] as string;
      // SHA-256 hashes are exactly 64 hex characters
      const isAlreadyHashed = /^[0-9a-f]{64}$/.test(pwd);
      if (!isAlreadyHashed) {
        const hashed = await hashPassword(pwd);
        database.run('UPDATE users SET password=? WHERE id=?', [hashed, id]);
        changed = true;
        console.log(`Migrated password for user id=${id}`);
      }
    }
    if (changed) saveDB();
  } catch (err) {
    console.error('Password migration error:', err);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────
export async function initDatabase(): Promise<Database> {
  if (db) return db;

  try {
    let config: any = {};
    
    // Use Node.js fs to load WASM directly if in Electron
    if (typeof window !== 'undefined' && (window as any).process && (window as any).require) {
      try {
        const fs = (window as any).require('fs');
        const path = (window as any).require('path');
        
        // Get directory of index.html
        let baseDir = window.location.pathname.replace(/\/[^\/]+$/, '');
        // On Windows, fix the /C:/... path and slashes
        if (process.platform === 'win32' || baseDir.includes(':')) {
          baseDir = baseDir.replace(/^\/([A-Z]:)/i, '$1').replace(/\//g, path.sep);
          // Handle cases where decodeURI is needed for spaces in path
          baseDir = decodeURIComponent(baseDir);
        }
        
        const wasmPath = path.join(baseDir, 'sql-wasm.wasm');
        console.log("Loading WASM from:", wasmPath);
        
        const wasmBinary = fs.readFileSync(wasmPath);
        config = { wasmBinary };
      } catch (e: any) {
        console.warn("Node WASM load failed, falling back to locateFile:", e);
        config = { locateFile: (file: string) => file };
      }
    } else {
      config = { locateFile: (file: string) => file };
    }

    const SQL = await initSqlJs(config);
    SQLInstance = SQL;

  // 1. Try file-based load (Electron primary)
  let savedData = await loadFromFile();
  
  // 2. Fallback to IndexedDB (Web or legacy Electron)
  if (!savedData) {
    savedData = await loadFromIDB();
  }

  if (savedData) {
    db = new SQL.Database(savedData);
  } else {
    db = new SQL.Database();
    createSchema(db);
    await seedData(db);
    // Initial save to both locations
    saveDB();
  }

  // Ensure schema exists even on existing DBs (safe with IF NOT EXISTS)
  createSchema(db);

  // Migrate old hardcoded default settings to empty strings (runs every startup)
  migrateSettings(db);

  // Migrate penalty rates (adds columns if missing)
  migratePenaltyRates(db);

  // Migrate any plaintext passwords to SHA-256 hashes
  await migratePasswords(db);

  // Auto-update overdue EMIs on startup
  updateOverdueEMIs();

    return db;
  } catch (err: any) {
    initError = err?.message || String(err);
    console.error("Database initialization failed:", err);
    throw err;
  }
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

/**
 * Checks if an Administrator already exists in the system.
 */
export function adminExists(): boolean {
  try {
    const db = getDB();
    const result = db.exec("SELECT COUNT(*) FROM users WHERE role='admin'");
    if (!result.length || !result[0].values.length) return false;
    return (result[0].values[0][0] as number) > 0;
  } catch (err) {
    return false;
  }
}

/**
 * Resets all application data (customers, loans, EMIs, activity logs, users, settings).
 * Acts as a factory reset.
 */
export function resetApplicationData(): void {
  try {
    const database = getDB();
    database.run('DELETE FROM customers');
    database.run('DELETE FROM loans');
    database.run('DELETE FROM emis');
    database.run('DELETE FROM activity_logs');
    database.run('DELETE FROM users');
    database.run('DELETE FROM settings');
    saveDB();
    console.log('Application data reset successfully.');
  } catch (err) {
    console.error('Failed to reset application data:', err);
    throw err;
  }
}

/**
 * Exports the current SQLite database as a downloadable file
 */
export function exportDatabase(): void {
  try {
    const database = getDB();
    const data = database.export();
    let exportData = data;

    if (SQLInstance) {
      try {
        // Create a temporary database copy from the main data to purge the users table
        const tempDb = new SQLInstance.Database(data);
        tempDb.run('DELETE FROM users');
        exportData = tempDb.export();
        tempDb.close();
        console.log('Successfully purged users authentication details from database backup.');
      } catch (purgeErr) {
        console.error('Failed to purge users table from backup:', purgeErr);
      }
    }

    const blob = new Blob([exportData as any], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gold_loan_backup_${getSystemWorkingDate()}.db`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Failed to export database:', err);
    throw err;
  }
}

/**
 * Imports a SQLite database from a Uint8Array, replacing the current db.
 * This will overwrite all existing data.
 */
export async function importDatabase(data: Uint8Array): Promise<void> {
  try {
    let config: any = {};
    if (typeof window !== 'undefined' && (window as any).process && (window as any).require) {
      try {
        const fs = (window as any).require('fs');
        const path = (window as any).require('path');
        let baseDir = window.location.pathname.replace(/\/[^\/]+$/, '');
        if (process.platform === 'win32' || baseDir.includes(':')) {
          baseDir = baseDir.replace(/^\/([A-Z]:)/i, '$1').replace(/\//g, path.sep);
          baseDir = decodeURIComponent(baseDir);
        }
        const wasmPath = path.join(baseDir, 'sql-wasm.wasm');
        const wasmBinary = fs.readFileSync(wasmPath);
        config = { wasmBinary };
      } catch (e: any) {
        config = { locateFile: (file: string) => file };
      }
    } else {
      config = { locateFile: (file: string) => file };
    }

    const SQL = await initSqlJs(config);
    const newDb = new SQL.Database(data);
    
    // Close the old db if it exists
    if (db) {
      try { db.close(); } catch (e) {}
    }
    
    // Replace the global db instance
    db = newDb;
    
    // Save to persistence
    saveDB();
    
    // Run migrations just in case the imported DB is an older schema
    createSchema(db);
    
    console.log('Database imported and saved successfully.');
  } catch (err) {
    console.error('Failed to import database:', err);
    throw new Error('Invalid database file or format.');
  }
}
