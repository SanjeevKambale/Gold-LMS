# Gold Loan Management App

A premium, local-first desktop and web application designed to manage gold loans, customers, EMI tracking, and gold rate monitoring. Built using React, Electron, and SQLite (WebAssembly).

---

## 🚀 Key Features

- **Local-First Architecture**: Runs entirely offline with a client-side SQLite database (`sql.js`), falling back to IndexedDB in web environments.
- **Gold Valuation & Tiered LTV**: Automated calculation of Loan-To-Value constraints (85% LTV up to ₹2.5 Lakh, 75% LTV above) based on active gold rates.
- **Automated EMI Calculations**: Real-time compound interest amortization and overdue penalty calculations.
- **Role-Based Access Control**: Strict access boundaries between Admins (full auditing/settings) and Staff (customer and loan creation).
- **Loan Transfers & Activity Logs**: Comprehensive audit trailing with immutable logging and admin approval flows for loan transfers.
- **PDF Generation**: Offline generation of professional loan receipts.

---

## 🛠 Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Radix UI, Lucide Icons, Recharts
- **Desktop Runtime**: Electron
- **Database**: SQL.js (SQLite WebAssembly)
- **Utilities**: jsPDF & autotable, i18next

---

## ⚙️ Installation & Setup

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or later recommended)

### Steps

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Run Development Server (Web):**
   ```bash
   npm run dev
   ```

3. **Run Development Server (Electron Desktop):**
   ```bash
   npm run electron:dev
   ```

4. **Build Production Web App:**
   ```bash
   npm run build
   ```

5. **Package Desktop Executable:**
   ```bash
   npm run electron:package
   ```
   *The portable Windows desktop executable will be built in the `dist-desktop/` directory.*

---

## 🔒 First-Run & Authentication
On the first launch, the system will detect an empty database and prompt you to create the initial **Administrator** account. Once registered, the administrator can log in to manage active system settings and create or approve **Staff** user accounts.

---

## 📄 License
Internal use only. Unauthorized distribution or copying is prohibited.