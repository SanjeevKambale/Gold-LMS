import { EMI } from '../../types';
import { getSystemWorkingDate } from '../workingDate';
import { cachedLoans, cachedEmis, cachedPayments, syncWrite } from '../database';

function getEffectiveEMI(emi: EMI, today: string): EMI {
  const isPaidInFuture = emi.status === 'paid' && emi.paidDate && emi.paidDate > today;
  if (isPaidInFuture) {
    const isOverdue = emi.dueDate < today;
    return {
      ...emi,
      status: isOverdue ? 'overdue' : 'pending',
      paidDate: undefined,
      paidAmount: undefined,
      paymentMethod: undefined,
      transactionRef: undefined,
      paymentId: undefined,
    };
  }
  return emi;
}

export function getAllEMIs(): EMI[] {
  const today = getSystemWorkingDate();
  // We want EMIs for loans that have start_date <= today
  const activeLoanIds = cachedLoans
    .filter(l => l.startDate <= today)
    .map(l => l.id);

  if (activeLoanIds.length === 0) return [];

  return cachedEmis
    .filter(e => activeLoanIds.includes(e.loanId))
    .map(e => getEffectiveEMI(e, today))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export function getEMIsByLoan(loanId: string): EMI[] {
  const today = getSystemWorkingDate();
  const loan = cachedLoans.find(l => l.id === loanId);
  if (!loan || loan.startDate > today) return [];

  return cachedEmis
    .filter(e => e.loanId === loanId)
    .map(e => getEffectiveEMI(e, today))
    .sort((a, b) => a.emiNumber - b.emiNumber);
}

export function getSmartEMIs(): EMI[] {
  const today = getSystemWorkingDate();
  const activeLoanIds = cachedLoans
    .filter(l => l.startDate <= today)
    .map(l => l.id);

  if (activeLoanIds.length === 0) return [];

  // Filter and get effective EMIs
  const effective = cachedEmis
    .filter(e => activeLoanIds.includes(e.loanId))
    .map(e => getEffectiveEMI(e, today));

  // Fetch all paid and overdue EMIs
  const paidOverdue = effective.filter(e => e.status === 'paid' || e.status === 'overdue');

  // Fetch next pending EMIs per loan (lowest emiNumber among pending)
  const pending = effective.filter(e => e.status === 'pending');
  const nextPendingMap = new Map<string, EMI>();
  pending.forEach(emi => {
    const existing = nextPendingMap.get(emi.loanId);
    if (!existing || emi.emiNumber < existing.emiNumber) {
      nextPendingMap.set(emi.loanId, emi);
    }
  });
  const nextPendingList = Array.from(nextPendingMap.values());

  const result = [...paidOverdue, ...nextPendingList];

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
  // 1. Push to cache synchronously
  emis.forEach(emi => {
    // Check if already in cache to prevent duplicates
    if (!cachedEmis.some(e => e.id === emi.id)) {
      cachedEmis.push(emi);
    }

    // 2. Sync to SQLite and Supabase
    const payload = {
      id: emi.id,
      loan_id: emi.loanId,
      customer_id: emi.customerId,
      customer_name: emi.customerName,
      emi_number: emi.emiNumber,
      due_date: emi.dueDate,
      amount: emi.amount,
      status: emi.status,
      paid_date: emi.paidDate || null,
      paid_amount: emi.paidAmount || null,
      payment_method: emi.paymentMethod || null,
      transaction_ref: emi.transactionRef || null,
      payment_id: emi.paymentId || null,
      created_by: emi.createdBy || null,
      penalty_rate: emi.penaltyRate ?? 2,
    };
    syncWrite('emis', 'insert', emi.id, payload);
  });
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
  // 1. Get EMI details from cache synchronously
  const emi = cachedEmis.find(e => e.id === id);
  if (!emi) {
    console.error('payEMI error: could not locate EMI:', id);
    return;
  }

  const loanId = emi.loanId;
  const contractAmount = emi.amount;
  const existingCredit = emi.paidAmount || 0;

  const totalApplied = paidAmount + existingCredit;
  const paymentId = `pay_${Math.random().toString(36).substring(2, 11)}`;
  const amountToApply = Math.min(totalApplied, contractAmount + penaltyAmount);

  // 2. Mark current EMI as paid in cache synchronously
  emi.status = 'paid';
  emi.paidAmount = amountToApply;
  emi.paymentMethod = paymentMethod;
  emi.transactionRef = transactionRef;
  emi.paymentId = paymentId;
  emi.paidDate = paidDate;

  let excess = totalApplied - amountToApply;

  const databaseUpdates: Array<{ id: string; updates: any }> = [];
  databaseUpdates.push({
    id,
    updates: {
      status: 'paid',
      paid_amount: amountToApply,
      payment_method: paymentMethod,
      transaction_ref: transactionRef,
      payment_id: paymentId,
      paid_date: paidDate
    }
  });

  // 3. Distribute excess to upcoming pending/overdue EMIs in cache
  if (excess > 0 && !skipExcessDistribution) {
    const pending = cachedEmis
      .filter(e => e.loanId === loanId && (e.status === 'pending' || e.status === 'overdue'))
      .sort((a, b) => a.emiNumber - b.emiNumber);

    for (const row of pending) {
      if (excess <= 0) break;

      const nextId = row.id;
      const nextContract = row.amount;
      const nextExistingCredit = row.paidAmount || 0;
      const totalForNext = excess + nextExistingCredit;

      if (totalForNext >= nextContract) {
        // Fully cover in cache
        row.status = 'paid';
        row.paidAmount = nextContract;
        row.paymentMethod = paymentMethod;
        row.transactionRef = transactionRef;
        row.paymentId = paymentId;
        row.paidDate = paidDate;

        databaseUpdates.push({
          id: nextId,
          updates: {
            status: 'paid',
            paid_amount: nextContract,
            payment_method: paymentMethod,
            transaction_ref: transactionRef,
            payment_id: paymentId,
            paid_date: paidDate
          }
        });
        excess = totalForNext - nextContract;
      } else {
        // Partial advance in cache
        row.paidAmount = totalForNext;
        row.paymentId = paymentId;

        databaseUpdates.push({
          id: nextId,
          updates: {
            paid_amount: totalForNext,
            payment_id: paymentId
          }
        });
        excess = 0;
      }
    }
  }

  // 4. Mark loan completed in cache if no unpaid EMIs left
  const unpaidCount = cachedEmis.filter(e => e.loanId === loanId && (e.status === 'pending' || e.status === 'overdue')).length;
  let loanCompleted = false;
  if (unpaidCount === 0) {
    const loan = cachedLoans.find(l => l.id === loanId);
    if (loan) {
      loan.status = 'completed';
      loanCompleted = true;
    }
  }

  // 5. Sync updates locally and to Supabase
  for (const item of databaseUpdates) {
    syncWrite('emis', 'update', item.id, item.updates);
  }

  if (loanCompleted) {
    syncWrite('loans', 'update', loanId, { status: 'completed' });
  }
}

export function getEMIsByPaymentId(paymentId: string): EMI[] {
  const today = getSystemWorkingDate();
  const activeLoanIds = cachedLoans
    .filter(l => l.startDate <= today)
    .map(l => l.id);

  if (activeLoanIds.length === 0) return [];

  return cachedEmis
    .filter(e => e.paymentId === paymentId && activeLoanIds.includes(e.loanId))
    .map(e => getEffectiveEMI(e, today))
    .sort((a, b) => a.emiNumber - b.emiNumber);
}

export function updateOverdueEMIs(): void {
  const today = getSystemWorkingDate();
  const updates: Array<{ id: string; status: 'overdue' | 'pending' }> = [];

  cachedEmis.forEach((emi) => {
    if (emi.status === 'pending' && emi.dueDate < today) {
      emi.status = 'overdue';
      updates.push({ id: emi.id, status: 'overdue' });
    } else if (emi.status === 'overdue' && emi.dueDate >= today) {
      emi.status = 'pending';
      updates.push({ id: emi.id, status: 'pending' });
    }
  });

  // Sync to SQLite and Supabase
  updates.forEach(item => {
    syncWrite('emis', 'update', item.id, { status: item.status });
  });
}

export function getRemainingLoanBalance(loanId: string): number {
  // 1. Get original loan details
  const loan = cachedLoans.find(l => l.id === loanId);
  if (!loan) return 0;

  const originalPrincipal = Number(loan.loanAmount);
  const annualRate = Number(loan.interestRate);
  const originalTenure = Number(loan.tenure);

  // 2. Get all EMIs on this loan
  const emis = cachedEmis
    .filter(e => e.loanId === loanId)
    .sort((a, b) => a.emiNumber - b.emiNumber);

  if (emis.length === 0) return originalPrincipal;

  // 3. Generate amortization schedule
  const schedule = computeAmortization(originalPrincipal, annualRate, originalTenure);

  let lastPaidEmiNumber = 0;
  let excessOnPending = 0;

  const today = getSystemWorkingDate();
  emis.forEach((emiRow) => {
    const effective = getEffectiveEMI(emiRow, today);
    const num = Number(effective.emiNumber);
    const paid = Number(effective.paidAmount) || 0;

    if (effective.status === 'paid') {
      lastPaidEmiNumber = Math.max(lastPaidEmiNumber, num);
    } else if (paid > 0) {
      excessOnPending += paid;
    }
  });

  const scheduledBalance = lastPaidEmiNumber === 0
    ? originalPrincipal
    : (schedule[lastPaidEmiNumber - 1]?.outstandingPrincipal ?? 0);

  return Math.max(0, Math.round(scheduledBalance - excessOnPending));
}

export function calculateEMIPenalty(emi: { amount: number; dueDate: string; status: string; paidDate?: string; penaltyRate?: number }): number {
  const dueDate = new Date(emi.dueDate);
  const targetDate = emi.paidDate ? new Date(emi.paidDate) : new Date(getSystemWorkingDate());

  const diffTime = targetDate.getTime() - dueDate.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return 0;
  if (emi.status === 'paid' && !emi.paidDate) return 0;

  const ratePercentage = emi.penaltyRate !== undefined && emi.penaltyRate !== null ? emi.penaltyRate : 2;
  const penalty = emi.amount * (ratePercentage / 100 / 30) * diffDays;
  return Math.round(penalty);
}

export interface AmortizationRow {
  emiNumber: number;
  emiAmount: number;
  principalPaid: number;
  interestPaid: number;
  outstandingPrincipal: number;
}

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

export function earlyCloseLoan(
  loanId: string,
  principal: number,
  annualRate: number,
  tenure: number,
  paymentMethod: string,
  transactionRef: string,
  paidEMICount: number,
  paidDate?: string
): { amountCharged: number; interestSaved: number } {
  try {
    const today = paidDate || getSystemWorkingDate();
    const schedule = computeAmortization(principal, annualRate, tenure);

    const outstandingPrincipal =
      paidEMICount === 0
        ? principal
        : schedule[paidEMICount - 1]?.outstandingPrincipal ?? principal;

    // Get all pending/overdue EMIs on this loan from cache
    const pending = cachedEmis
      .filter(e => e.loanId === loanId && (e.status === 'pending' || e.status === 'overdue'))
      .sort((a, b) => a.emiNumber - b.emiNumber);

    let remainingEMITotal = 0;
    pending.forEach(emi => {
      remainingEMITotal += emi.amount;
    });

    const interestSaved = Math.max(0, remainingEMITotal - outstandingPrincipal);

    // Update EMIs in cache & sync them
    pending.forEach(emi => {
      const principalForThisEMI = schedule[emi.emiNumber - 1]?.principalPaid ?? 0;
      emi.status = 'paid';
      emi.paidAmount = Math.round(principalForThisEMI);
      emi.paymentMethod = paymentMethod;
      emi.transactionRef = `${transactionRef} (early-closure)`;
      emi.paidDate = today;

      const emiPayload = {
        status: 'paid',
        paid_amount: Math.round(principalForThisEMI),
        payment_method: paymentMethod,
        transaction_ref: `${transactionRef} (early-closure)`,
        paid_date: today
      };
      syncWrite('emis', 'update', emi.id, emiPayload);
    });

    // Close the loan in cache & sync it
    const loan = cachedLoans.find(l => l.id === loanId);
    if (loan) {
      loan.status = 'completed';
      syncWrite('loans', 'update', loanId, { status: 'completed' });
    }

    return {
      amountCharged: Math.round(outstandingPrincipal),
      interestSaved: Math.round(interestSaved),
    };
  } catch (err) {
    console.error('earlyCloseLoan exception:', err);
    throw err;
  }
}

export function rebalanceLoan(
  loanId: string,
  excessPaid: number,
  mode: 'tenure' | 'emi',
  lastPaidEmiNumber: number
): void {
  try {
    // 1. Get Loan details from cache synchronously
    const loan = cachedLoans.find(l => l.id === loanId);
    if (!loan) return;

    const originalPrincipal = loan.loanAmount;
    const annualRate = loan.interestRate;
    const originalTenure = loan.tenure;
    const startDate = loan.startDate;
    const originalEmi = loan.emiAmount;
    const customerId = loan.customerId;
    const customerName = loan.customerName;
    const createdBy = loan.createdBy;

    // 2. Calculate current outstanding principal BEFORE the excess payment
    const schedule = computeAmortization(originalPrincipal, annualRate, originalTenure);
    const currentOutstanding = lastPaidEmiNumber === 0
      ? originalPrincipal
      : (schedule[lastPaidEmiNumber - 1]?.outstandingPrincipal ?? 0);

    // 3. New outstanding principal after excess
    const newPrincipal = Math.max(0, currentOutstanding - excessPaid);

    // Find future pending/overdue EMIs to delete
    const deletedEmiIds: string[] = [];
    cachedEmis.forEach(e => {
      if (e.loanId === loanId && (e.status === 'pending' || e.status === 'overdue')) {
        deletedEmiIds.push(e.id);
      }
    });

    // 4. Delete future pending/overdue EMIs from cache synchronously
    for (let i = cachedEmis.length - 1; i >= 0; i--) {
      if (cachedEmis[i].loanId === loanId && (cachedEmis[i].status === 'pending' || cachedEmis[i].status === 'overdue')) {
        cachedEmis.splice(i, 1);
      }
    }

    if (newPrincipal <= 0) {
      loan.status = 'completed';
      // Sync completion locally and to Supabase
      syncWrite('loans', 'update', loanId, { status: 'completed' });
      deletedEmiIds.forEach(id => {
        syncWrite('emis', 'delete', id);
      });
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
      if (r === 0) {
        remainingMonths = Math.ceil(newPrincipal / originalEmi);
      } else {
        const arg = 1 - (r * newPrincipal) / originalEmi;
        if (arg <= 0) {
          remainingMonths = 1;
        } else {
          remainingMonths = Math.ceil(-Math.log(arg) / Math.log(1 + r));
        }
      }
      newEmi = originalEmi;
    }

    // 6. Generate new EMIs and push to cache synchronously
    const newSchedule: EMI[] = Array.from({ length: remainingMonths }, (_, i) => {
      const emiNum = lastPaidEmiNumber + i + 1;
      const dueDate = new Date(startDate);
      dueDate.setMonth(dueDate.getMonth() + emiNum);

      return {
        id: `${loanId}_emi_${emiNum}_r${Math.random().toString(36).substring(2, 7)}`,
        loanId: loanId,
        customerId: customerId,
        customerName: customerName,
        emiNumber: emiNum,
        dueDate: dueDate.toISOString().split('T')[0],
        amount: Math.round(newEmi),
        status: 'pending',
        createdBy: createdBy
      };
    });

    cachedEmis.push(...newSchedule);

    // 7. Update loan record in cache
    if (mode === 'emi') {
      loan.emiAmount = Math.round(newEmi);
    }

    // 8. Sync deletions, insertions, and loan update
    deletedEmiIds.forEach(id => {
      syncWrite('emis', 'delete', id);
    });

    newSchedule.forEach(emi => {
      const emiPayload = {
        id: emi.id,
        loan_id: emi.loanId,
        customer_id: emi.customerId,
        customer_name: emi.customerName,
        emi_number: emi.emiNumber,
        due_date: emi.dueDate,
        amount: emi.amount,
        status: emi.status,
        created_by: emi.createdBy || null
      };
      syncWrite('emis', 'insert', emi.id, emiPayload);
    });

    if (mode === 'emi') {
      syncWrite('loans', 'update', loanId, { emi_amount: Math.round(newEmi) });
    }

  } catch (err) {
    console.error('rebalanceLoan exception:', err);
    throw err;
  }
}

export function deleteEMIRecord(id: string): void {
  // 1. Remove from cache
  const idx = cachedEmis.findIndex(e => e.id === id);
  if (idx !== -1) {
    cachedEmis.splice(idx, 1);
  }

  // 2. Sync deletion
  syncWrite('emis', 'delete', id);
}

export function resetEMIPayment(id: string): void {
  // 1. Reset in cache
  const emi = cachedEmis.find(e => e.id === id);
  if (emi) {
    emi.status = 'pending';
    emi.paidDate = undefined;
    emi.paidAmount = undefined;
    emi.paymentMethod = undefined;
    emi.transactionRef = undefined;
    emi.paymentId = undefined;
  }

  // 2. Sync reset update
  const payload = {
    status: 'pending',
    paid_date: null,
    paid_amount: null,
    payment_method: null,
    transaction_ref: null,
    payment_id: null
  };
  syncWrite('emis', 'update', id, payload);
}
