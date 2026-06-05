-- ─── GOLD LOAN MANAGEMENT SYSTEM SUPABASE DATABASE SCHEMA ───
-- Copy and run this script in your Supabase SQL Editor.

-- Enable UUID extension if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'staff')),
    email TEXT NOT NULL,
    created_at TEXT NOT NULL
);

-- 2. CUSTOMERS TABLE
CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    address TEXT NOT NULL,
    kyc_status TEXT NOT NULL DEFAULT 'pending' CHECK (kyc_status IN ('pending', 'verified', 'rejected')),
    kyc_document TEXT NOT NULL,
    kyc_number TEXT NOT NULL,
    created_at TEXT NOT NULL,
    photo_url TEXT,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    kyc_docs_json TEXT
);

-- 3. LOAN TYPES TABLE
CREATE TABLE IF NOT EXISTS loan_types (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    interest_rate REAL NOT NULL,
    min_amount REAL NOT NULL,
    max_amount REAL NOT NULL,
    min_tenure INTEGER NOT NULL,
    max_tenure INTEGER NOT NULL,
    repayment_scheme TEXT NOT NULL DEFAULT 'EMI' CHECK (repayment_scheme IN ('EMI', 'BULLET'))
);

-- 4. GOLD RATES TABLE
CREATE TABLE IF NOT EXISTS gold_rates (
    id TEXT PRIMARY KEY,
    gold_type TEXT NOT NULL UNIQUE CHECK (gold_type IN ('24K', '22K', '18K')),
    rate_per_gram REAL NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
);

-- 5. LOANS TABLE
CREATE TABLE IF NOT EXISTS loans (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    customer_name TEXT NOT NULL,
    gold_weight REAL NOT NULL,
    gold_type TEXT NOT NULL REFERENCES gold_rates(gold_type),
    gold_value REAL NOT NULL,
    item_type TEXT,
    loan_amount REAL NOT NULL,
    loan_type_id TEXT NOT NULL,
    loan_type_name TEXT NOT NULL,
    interest_rate REAL NOT NULL,
    tenure INTEGER NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed', 'defaulted', 'overdue', 'completed', 'auctioned')),
    emi_amount REAL NOT NULL,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    branch_id TEXT,
    locker_number TEXT,
    packet_number TEXT,
    ornament_photo_url TEXT,
    repayment_scheme TEXT NOT NULL DEFAULT 'EMI' CHECK (repayment_scheme IN ('EMI', 'BULLET')),
    penalty_rate REAL NOT NULL DEFAULT 2
);

-- 6. EMIS TABLE
CREATE TABLE IF NOT EXISTS emis (
    id TEXT PRIMARY KEY,
    loan_id TEXT NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
    customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    customer_name TEXT NOT NULL,
    emi_number INTEGER NOT NULL,
    due_date TEXT NOT NULL,
    amount REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue', 'partially_paid')),
    paid_date TEXT,
    paid_amount REAL,
    payment_method TEXT,
    transaction_ref TEXT,
    payment_id TEXT,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    penalty_rate REAL NOT NULL DEFAULT 2
);

-- 7. PAYMENTS TABLE
CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    loan_id TEXT NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
    payment_type TEXT NOT NULL CHECK (payment_type IN ('INTEREST', 'PARTIAL', 'FULL_CLOSURE', 'RENEWAL', 'PENALTY', 'emi', 'part_payment', 'settlement', 'interest_only')),
    amount REAL NOT NULL,
    payment_date TEXT NOT NULL,
    principal_component REAL NOT NULL DEFAULT 0,
    interest_component REAL NOT NULL DEFAULT 0,
    penalty_component REAL NOT NULL DEFAULT 0,
    payment_method TEXT,
    transaction_ref TEXT,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    customer_name TEXT
);

-- 8. SETTINGS TABLE
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- 9. ACTIVITY LOGS TABLE
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

-- 10. LOAN TRANSFERS TABLE
CREATE TABLE IF NOT EXISTS loan_transfers (
    id TEXT PRIMARY KEY,
    loan_id TEXT NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
    from_customer_id TEXT NOT NULL REFERENCES customers(id),
    to_customer_id TEXT NOT NULL REFERENCES customers(id),
    from_branch TEXT,
    to_branch TEXT,
    transfer_date TEXT NOT NULL,
    outstanding_amount REAL NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    requested_by TEXT NOT NULL REFERENCES users(id),
    requested_by_name TEXT NOT NULL,
    approved_by TEXT REFERENCES users(id),
    approved_by_name TEXT,
    rejection_reason TEXT
);

-- ─── DATABASE INDEXES FOR MAXIMUM QUERY PERFORMANCE ───
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_loans_customer_id ON loans(customer_id);
CREATE INDEX IF NOT EXISTS idx_loans_status ON loans(status);
CREATE INDEX IF NOT EXISTS idx_emis_loan_id ON emis(loan_id);
CREATE INDEX IF NOT EXISTS idx_emis_status ON emis(status);
CREATE INDEX IF NOT EXISTS idx_payments_loan_id ON payments(loan_id);
CREATE INDEX IF NOT EXISTS idx_transfers_status ON loan_transfers(status);

-- ─── SEED DEFAULT INITIAL DATA ───

-- Seed default gold types
INSERT INTO gold_rates (id, gold_type, rate_per_gram, updated_at)
VALUES 
    ('1', '24K', 0, '2026-06-02'),
    ('2', '22K', 0, '2026-06-02'),
    ('3', '18K', 0, '2026-06-02')
ON CONFLICT (gold_type) DO NOTHING;

-- Seed default loan types
INSERT INTO loan_types (id, name, interest_rate, min_amount, max_amount, min_tenure, max_tenure, repayment_scheme)
VALUES 
    ('1', 'Standard Gold Loan', 12, 10000, 1000000, 6, 36, 'EMI'),
    ('2', 'Premium Gold Loan', 10, 50000, 5000000, 12, 48, 'EMI'),
    ('3', 'Quick Gold Loan', 15, 500, 500000, 3, 24, 'EMI')
ON CONFLICT (id) DO NOTHING;

-- Seed default blank shop settings
INSERT INTO settings (key, value)
VALUES
    ('shop_name', ''),
    ('shop_upi_id', ''),
    ('shop_address', ''),
    ('shop_phone', '')
ON CONFLICT (key) DO NOTHING;

-- Disable Row Level Security (RLS) on all tables to allow simple anon/staff client-side access
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE customers DISABLE ROW LEVEL SECURITY;
ALTER TABLE loan_types DISABLE ROW LEVEL SECURITY;
ALTER TABLE gold_rates DISABLE ROW LEVEL SECURITY;
ALTER TABLE loans DISABLE ROW LEVEL SECURITY;
ALTER TABLE emis DISABLE ROW LEVEL SECURITY;
ALTER TABLE payments DISABLE ROW LEVEL SECURITY;
ALTER TABLE settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE loan_transfers DISABLE ROW LEVEL SECURITY;

-- Grant full access to anonymous and authenticated users for all public tables
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;
