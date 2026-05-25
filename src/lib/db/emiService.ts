import { EMI } from '../../types';
import { getDB, saveDB } from '../database';

function rowToEMI(row: any[]): EMI {
  return {
    id: row[0] as string,
    loanId: row[1] as string,
    customerId: row[2] as string,
    customerName: row[3] as string,
    emiNumber: row[4] as number,
    dueDate: row[5] as string,
    amount: row[6] as number,
    status: row[7] as 'pending' | 'paid' | 'overdue',
    paidDate: row[8] as string | undefined,
    paidAmount: row[9] as number | undefined,
    paymentMethod: row[10] as string | undefined,
    transactionRef: row[11] as string | undefined,
    paymentId: row[12] as string | undefined,
    createdBy: row[13] as string | undefined,
  };
}

export function getAllEMIs(): EMI[] {
  const db = getDB();
  const result = db.exec(
    `SELECT id, loan_id, customer_id, customer_name, emi_number, due_date,
            amount, status, paid_date, paid_amount, payment_method, transaction_ref, payment_id, created_by
     FROM emis ORDER BY due_date ASC`
  );
  if (!result.length) return [];
  return result[0].values.map(rowToEMI);
}

/** Returns all EMIs for a specific loan, ordered by emi_number. */
export function getEMIsByLoan(loanId: string): EMI[] {
  const db = getDB();
  const result = db.exec(
    `SELECT id, loan_id, customer_id, customer_name, emi_number, due_date,
            amount, status, paid_date, paid_amount, payment_method, transaction_ref, payment_id, created_by
     FROM emis WHERE loan_id=? ORDER BY emi_number ASC`,
    [loanId]
  );
  if (!result.length) return [];
  return result[0].values.map(rowToEMI);
}


/**
 * Smart EMI list:
 * - All paid EMIs (history)
 * - All overdue EMIs
 * - Only the NEXT pending EMI per loan (lowest emi_number still pending)
 * When a pending EMI is paid, the next one in sequence becomes visible.
 */
export function getSmartEMIs(): EMI[] {
  const db = getDB();

  // Get all paid + overdue
  const paidOverdue = db.exec(
    `SELECT id, loan_id, customer_id, customer_name, emi_number, due_date,
            amount, status, paid_date, paid_amount, payment_method, transaction_ref, payment_id, created_by
     FROM emis WHERE status IN ('paid', 'overdue')
     ORDER BY due_date DESC`
  );

  // Get only the NEXT pending EMI per loan (min emi_number that is pending)
  const nextPending = db.exec(
    `SELECT e.id, e.loan_id, e.customer_id, e.customer_name, e.emi_number, e.due_date,
            e.amount, e.status, e.paid_date, e.paid_amount, e.payment_method, e.transaction_ref, e.payment_id, e.created_by
     FROM emis e
     INNER JOIN (
       SELECT loan_id, MIN(emi_number) as min_emi
       FROM emis WHERE status = 'pending'
       GROUP BY loan_id
     ) nxt ON e.loan_id = nxt.loan_id AND e.emi_number = nxt.min_emi
     ORDER BY e.due_date ASC`
  );

  const result: EMI[] = [];
  if (paidOverdue.length) result.push(...paidOverdue[0].values.map(rowToEMI));
  if (nextPending.length) result.push(...nextPending[0].values.map(rowToEMI));

  // Sort: overdue first, then pending by due date, then paid most recent
  return result.sort((a, b) => {
    if (a.status === 'overdue' && b.status !== 'overdue') return -1;
    if (b.status === 'overdue' && a.status !== 'overdue') return 1;
    if (a.status === 'pending' && b.status === 'pending') return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    if (a.status === 'paid' && b.status !== 'paid') return 1;
    if (b.status === 'paid' && a.status !== 'paid') return -1;
    return new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime();
  });
}


export function addEMIs(emis: EMI[]): void {
  const db = getDB();
  for (const emi of emis) {
    db.run(
      `INSERT INTO emis (id, loan_id, customer_id, customer_name, emi_number, due_date, amount, status, paid_date, paid_amount, payment_method, transaction_ref, payment_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        emi.id,
        emi.loanId,
        emi.customerId,
        emi.customerName,
        emi.emiNumber,
        emi.dueDate,
        emi.amount,
        emi.status,
        emi.paidDate ?? null,
        emi.paidAmount ?? null,
        emi.paymentMethod ?? null,
        emi.transactionRef ?? null,
        emi.paymentId ?? null,
        emi.createdBy ?? null,
      ]
    );
  }
  saveDB();
}

export function payEMI(
  id: string,
  paidAmount: number,
  paymentMethod: string,
  transactionRef: string,
  paidDate: string,
  penaltyAmount: number = 0,
  skipExcessDistribution: boolean = false
): void {
  const db = getDB();

  // Step 1: Get current EMI details (loanId, contract amount, existing advance credit)
  const emiRow = db.exec('SELECT loan_id, amount, paid_amount FROM emis WHERE id=?', [id]);
  if (!emiRow.length || !emiRow[0].values.length) { saveDB(); return; }

  const loanId          = emiRow[0].values[0][0] as string;
  const contractAmount  = emiRow[0].values[0][1] as number;
  const existingCredit  = (emiRow[0].values[0][2] as number) || 0;

  // Total money available for this EMI = user's payment + any prior advance credit
  const totalApplied = paidAmount + existingCredit;

  // Step 2: Mark current EMI as paid
  const paymentId = `pay_${Math.random().toString(36).substring(2, 11)}`;
  const amountToApply = Math.min(totalApplied, contractAmount + penaltyAmount);

  db.run(
    `UPDATE emis SET status='paid', paid_amount=?, payment_method=?, transaction_ref=?, payment_id=?, paid_date=? WHERE id=?`,
    [amountToApply, paymentMethod, transactionRef, paymentId, paidDate, id]
  );

  // Step 3: Calculate TRUE excess (beyond the full EMI + penalty obligation)
  let excess = totalApplied - amountToApply;

  // Step 4: Distribute excess to upcoming pending/overdue EMIs in order
  if (excess > 0 && !skipExcessDistribution) {
    const pending = db.exec(
      `SELECT id, amount, paid_amount FROM emis
       WHERE loan_id=? AND status IN ('pending','overdue')
       ORDER BY emi_number ASC`,
      [loanId]
    );

    if (pending.length && pending[0].values.length) {
      for (const row of pending[0].values) {
        if (excess <= 0) break;

        const nextId             = row[0] as string;
        const nextContract       = row[1] as number;
        const nextExistingCredit = (row[2] as number) || 0;
        const totalForNext       = excess + nextExistingCredit;

        if (totalForNext >= nextContract) {
          // Enough to fully cover this EMI — mark it paid
          db.run(
            `UPDATE emis
             SET status='paid', paid_amount=?, payment_method=?, transaction_ref=?, payment_id=?, paid_date=?
             WHERE id=?`,
            [nextContract, paymentMethod, transactionRef, paymentId, paidDate, nextId]
          );
          excess = totalForNext - nextContract;
        } else {
          // Partial advance — store as credit, keep status pending
          db.run(
            `UPDATE emis SET paid_amount=?, payment_id=? WHERE id=?`,
            [totalForNext, paymentId, nextId]
          );
          excess = 0;
        }
      }
    }
  }

  // Step 5: If all EMIs are now paid, mark the loan completed
  const unpaid = db.exec(
    `SELECT COUNT(*) FROM emis WHERE loan_id=? AND status IN ('pending','overdue')`,
    [loanId]
  );
  const unpaidCount = unpaid.length && unpaid[0].values.length
    ? (unpaid[0].values[0][0] as number) : 1;

  if (unpaidCount === 0) {
    db.run(`UPDATE loans SET status='completed' WHERE id=?`, [loanId]);
  }

  saveDB();
}

/** Returns all EMIs associated with a specific payment transaction. */
export function getEMIsByPaymentId(paymentId: string): EMI[] {
  const db = getDB();
  const result = db.exec(
    `SELECT id, loan_id, customer_id, customer_name, emi_number, due_date,
            amount, status, paid_date, paid_amount, payment_method, transaction_ref, payment_id, created_by
     FROM emis WHERE payment_id=? ORDER BY emi_number ASC`,
    [paymentId]
  );
  if (!result.length) return [];
  return result[0].values.map(rowToEMI);
}


/**
 * Automatically marks pending EMIs whose due date has passed as 'overdue'.
 * Should be called once on app startup (after DB is ready).
 */
export function updateOverdueEMIs(): void {
  const db = getDB();
  const today = new Date().toISOString().split('T')[0];
  db.run(
    `UPDATE emis SET status='overdue' WHERE status='pending' AND due_date < ?`,
    [today]
  );
  saveDB();
}

/**
 * Calculates the total remaining balance for all EMIs of a specific loan.
 */
export function getRemainingLoanBalance(loanId: string): number {
  try {
    const db = getDB();
    
    // 1. Get original loan details
    const loanRow = db.exec("SELECT loan_amount, interest_rate, tenure FROM loans WHERE id=?", [loanId]);
    if (!loanRow.length || !loanRow[0].values.length) return 0;
    
    const originalPrincipal = Number(loanRow[0].values[0][0]);
    const annualRate = Number(loanRow[0].values[0][1]);
    const originalTenure = Number(loanRow[0].values[0][2]);
    
    // 2. Get all EMIs to find progress
    const emisResult = db.exec(
      "SELECT emi_number, status, paid_amount, amount FROM emis WHERE loan_id=? ORDER BY emi_number ASC",
      [loanId]
    );
    if (!emisResult.length || !emisResult[0].values.length) return originalPrincipal;
    
    // 3. Generate the original amortization schedule to find the principal milestones
    const schedule = computeAmortization(originalPrincipal, annualRate, originalTenure);
    
    let lastPaidEmiNumber = 0;
    let excessOnPending = 0;
    
    for (const row of emisResult[0].values) {
      const num = Number(row[0]);
      const status = String(row[1]).toLowerCase();
      const paid = Number(row[2]) || 0;
      const amount = Number(row[3]);
      
      if (status === 'paid') {
        lastPaidEmiNumber = Math.max(lastPaidEmiNumber, num);
      } else if (paid > 0) {
        // If an EMI is partially paid, we treat that as immediate principal reduction
        excessOnPending += paid;
      }
    }
    
    // 4. Current balance is the scheduled principal after the last paid EMI, minus any advance/partial payments
    const scheduledBalance = lastPaidEmiNumber === 0 
      ? originalPrincipal 
      : (schedule[lastPaidEmiNumber - 1]?.outstandingPrincipal ?? 0);
      
    return Math.max(0, Math.round(scheduledBalance - excessOnPending));
  } catch (err) {
    console.error('Error calculating remaining balance:', err);
    return 0;
  }
}

/**
 * Calculates the overdue penalty (2% per month or part thereof).
 */
export function calculateEMIPenalty(emi: { amount: number; dueDate: string; status: string; paidDate?: string }): number {
  const dueDate = new Date(emi.dueDate);
  const targetDate = emi.paidDate ? new Date(emi.paidDate) : new Date();
  
  // Calculate difference in days
  const diffTime = targetDate.getTime() - dueDate.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays <= 0) return 0;
  
  // If it's already paid but was paid before it became overdue, penalty is 0
  if (emi.status === 'paid' && !emi.paidDate) return 0;

  // 2% for every 30-day period (or part thereof)
  const monthsOverdue = Math.ceil(diffDays / 30);
  return Math.round(emi.amount * 0.02 * monthsOverdue);
}

// ─── Amortisation & Early Closure ────────────────────────────────────────────

export interface AmortizationRow {
  emiNumber: number;
  emiAmount: number;
  principalPaid: number;
  interestPaid: number;
  outstandingPrincipal: number;
}

/**
 * Computes the full reducing-balance amortisation schedule for a loan.
 * Each row shows how much of that EMI goes to interest vs principal.
 */
export function computeAmortization(
  principal: number,
  annualRate: number,
  tenureMonths: number
): AmortizationRow[] {
  const r = annualRate / 12 / 100;
  const emi =
    r === 0
      ? principal / tenureMonths
      : (principal * r * Math.pow(1 + r, tenureMonths)) /
        (Math.pow(1 + r, tenureMonths) - 1);

  let outstanding = principal;
  return Array.from({ length: tenureMonths }, (_, i) => {
    const interestPaid  = outstanding * r;
    const principalPaid = emi - interestPaid;
    outstanding = Math.max(0, outstanding - principalPaid);
    return {
      emiNumber:           i + 1,
      emiAmount:           Math.round(emi),
      principalPaid:       Math.round(principalPaid),
      interestPaid:        Math.round(interestPaid),
      outstandingPrincipal: Math.round(outstanding),
    };
  });
}

/**
 * Early loan closure.
 *
 * Charges the customer ONLY the outstanding principal (future interest is waived).
 * Marks all remaining EMIs as paid with their amortisation principal component,
 * then sets the loan status to 'completed'.
 *
 * Returns the amount charged and the interest saved.
 */
export function earlyCloseLoan(
  loanId: string,
  principal: number,
  annualRate: number,
  tenure: number,
  paymentMethod: string,
  transactionRef: string,
  paidEMICount: number   // number of EMIs already fully paid
): { amountCharged: number; interestSaved: number } {
  const db       = getDB();
  const today    = new Date().toISOString().split('T')[0];
  const schedule = computeAmortization(principal, annualRate, tenure);

  // Outstanding principal = what's still owed (principal only, no future interest)
  const outstandingPrincipal =
    paidEMICount === 0
      ? principal
      : schedule[paidEMICount - 1]?.outstandingPrincipal ?? principal;

  // Sum of remaining contracted EMI amounts (if they had paid normally)
  const remResult = db.exec(
    `SELECT COALESCE(SUM(amount), 0) FROM emis WHERE loan_id=? AND status IN ('pending','overdue')`,
    [loanId]
  );
  const remainingEMITotal = (remResult[0]?.values[0]?.[0] as number) || 0;
  const interestSaved = Math.max(0, remainingEMITotal - outstandingPrincipal);

  // Mark every remaining (pending / overdue) EMI as paid.
  // Each one gets its PRINCIPAL COMPONENT from the amortisation schedule
  // (so the records are accurate; total ≈ outstandingPrincipal).
  const pendingRows = db.exec(
    `SELECT id, emi_number FROM emis
     WHERE loan_id=? AND status IN ('pending','overdue')
     ORDER BY emi_number ASC`,
    [loanId]
  );

  if (pendingRows.length && pendingRows[0].values.length) {
    for (const row of pendingRows[0].values) {
      const emiId     = row[0] as string;
      const emiNumber = row[1] as number;
      const principalForThisEMI = schedule[emiNumber - 1]?.principalPaid ?? 0;

      db.run(
        `UPDATE emis
         SET status='paid', paid_amount=?, payment_method=?, transaction_ref=?, paid_date=?
         WHERE id=?`,
        [Math.round(principalForThisEMI), paymentMethod, `${transactionRef} (early-closure)`, today, emiId]
      );
    }
  }

  // Close the loan
  db.run(`UPDATE loans SET status='completed' WHERE id=?`, [loanId]);
  saveDB();

  return {
    amountCharged: Math.round(outstandingPrincipal),
    interestSaved: Math.round(interestSaved),
  };
}

/**
 * Re-amortizes a loan after a significant principal payment.
 * 
 * @param loanId The ID of the loan to rebalance
 * @param excessPaid The additional amount paid towards principal (beyond current EMI)
 * @param mode 'tenure' to keep EMI same but finish earlier, 'emi' to keep end date but lower monthly payment
 * @param lastPaidEmiNumber The number of the last fully paid EMI
 */
export function rebalanceLoan(
  loanId: string,
  excessPaid: number,
  mode: 'tenure' | 'emi',
  lastPaidEmiNumber: number
): void {
  const db = getDB();
  
  // 1. Get Loan details
  const loanResult = db.exec(
    'SELECT loan_amount, interest_rate, tenure, start_date, emi_amount, customer_id, customer_name, created_by FROM loans WHERE id=?',
    [loanId]
  );
  if (!loanResult.length || !loanResult[0].values.length) return;
  
  const originalPrincipal = loanResult[0].values[0][0] as number;
  const annualRate       = loanResult[0].values[0][1] as number;
  const originalTenure   = loanResult[0].values[0][2] as number;
  const startDate        = loanResult[0].values[0][3] as string;
  const originalEmi      = loanResult[0].values[0][4] as number;
  const customerId       = loanResult[0].values[0][5] as string;
  const customerName     = loanResult[0].values[0][6] as string;
  const createdBy        = loanResult[0].values[0][7] as string;

  // 2. Calculate current outstanding principal BEFORE the excess payment
  const schedule = computeAmortization(originalPrincipal, annualRate, originalTenure);
  const currentOutstanding = lastPaidEmiNumber === 0 
    ? originalPrincipal 
    : (schedule[lastPaidEmiNumber - 1]?.outstandingPrincipal ?? 0);

  // 3. New outstanding principal after excess
  const newPrincipal = Math.max(0, currentOutstanding - excessPaid);

  // 4. Delete all future pending/overdue EMIs
  // 5. Delete future pending/overdue EMIs (to be replaced)
  db.run("DELETE FROM emis WHERE loan_id=? AND status IN ('pending', 'overdue')", [loanId]);

  if (newPrincipal <= 0) {
    db.run("UPDATE loans SET status='completed' WHERE id=?", [loanId]);
    saveDB();
    return;
  }

  // 5. Calculate new schedule
  const r = annualRate / 12 / 100;
  let remainingMonths = 0;
  let newEmi = originalEmi;

  if (mode === 'emi') {
    remainingMonths = originalTenure - lastPaidEmiNumber;
    if (remainingMonths > 0) {
      newEmi = r === 0 
        ? newPrincipal / remainingMonths 
        : (newPrincipal * r * Math.pow(1 + r, remainingMonths)) / (Math.pow(1 + r, remainingMonths) - 1);
    }
  } else {
    // Mode: 'tenure'
    // Solve for n: n = -log(1 - (r*P)/E) / log(1+r)
    if (r === 0) {
      remainingMonths = Math.ceil(newPrincipal / originalEmi);
    } else {
      const arg = 1 - (r * newPrincipal) / originalEmi;
      if (arg <= 0) {
        // EMI is too low to even cover interest? Unlikely here but safety first
        remainingMonths = 1; 
      } else {
        remainingMonths = Math.ceil(-Math.log(arg) / Math.log(1 + r));
      }
    }
    newEmi = originalEmi;
  }

  // 6. Generate new EMIs
  const newSchedule = Array.from({ length: remainingMonths }, (_, i) => {
    const emiNum = lastPaidEmiNumber + i + 1;
    const dueDate = new Date(startDate);
    dueDate.setMonth(dueDate.getMonth() + emiNum);
    
    return {
      id: `${loanId}_emi_${emiNum}_r${Math.random().toString(36).substring(2, 7)}`,
      loanId,
      customerId,
      customerName,
      emiNumber: emiNum,
      dueDate: dueDate.toISOString().split('T')[0],
      amount: Math.round(newEmi),
      status: 'pending' as const,
    };
  });

  // 7. Insert new EMIs
  for (const emi of newSchedule) {
    db.run(
      `INSERT INTO emis (id, loan_id, customer_id, customer_name, emi_number, due_date, amount, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [emi.id, emi.loanId, emi.customerId, emi.customerName, emi.emiNumber, emi.dueDate, emi.amount, emi.status, createdBy]
    );
  }

  // 8. Update loan record if EMI changed
  if (mode === 'emi') {
    db.run("UPDATE loans SET emi_amount=? WHERE id=?", [Math.round(newEmi), loanId]);
  }

  saveDB();
}
