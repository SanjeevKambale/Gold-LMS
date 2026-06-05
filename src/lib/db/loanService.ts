import { Loan, LoanType } from '../../types';
import { getSystemWorkingDate } from '../workingDate';
import { cachedLoans, cachedEmis, cachedPayments, syncWrite } from '../database';

export function getAllLoans(): Loan[] {
  return cachedLoans;
}

export function getLoanTypes(): LoanType[] {
  return [
    { id: '1', name: 'Standard Gold Loan', interestRate: 12, minAmount: 10000, maxAmount: 1000000, minTenure: 6, maxTenure: 36, repaymentScheme: 'EMI' },
    { id: '2', name: 'Premium Gold Loan', interestRate: 10, minAmount: 50000, maxAmount: 5000000, minTenure: 12, maxTenure: 48, repaymentScheme: 'EMI' },
    { id: '3', name: 'Quick Gold Loan', interestRate: 15, minAmount: 500, maxAmount: 500000, minTenure: 3, maxTenure: 24, repaymentScheme: 'EMI' }
  ];
}

export function addLoan(loan: Loan): void {
  // 1. Add to cache synchronously (prepend)
  cachedLoans.unshift(loan);

  // 2. Sync locally and to Supabase
  const payload = {
    id: loan.id,
    customer_id: loan.customerId,
    customer_name: loan.customerName,
    gold_weight: loan.goldWeight,
    gold_type: loan.goldType,
    gold_value: loan.goldValue,
    item_type: loan.itemType,
    loan_amount: loan.loanAmount,
    loan_type_id: loan.loanTypeId,
    loan_type_name: loan.loanTypeName,
    interest_rate: loan.interestRate,
    tenure: loan.tenure,
    start_date: loan.startDate,
    end_date: loan.endDate,
    status: loan.status,
    emi_amount: loan.emiAmount,
    created_by: loan.createdBy || null,
    branch_id: loan.branchId || null,
    locker_number: loan.lockerNumber || null,
    packet_number: loan.packetNumber || null,
    ornament_photo_url: loan.ornamentPhotoUrl || null,
    repayment_scheme: loan.repaymentScheme || 'EMI',
    penalty_rate: loan.penaltyRate ?? 2,
  };
  syncWrite('loans', 'insert', loan.id, payload);
}

export function updateLoanStatus(id: string, status: Loan['status']): void {
  // 1. Update cache synchronously
  const loan = cachedLoans.find(l => l.id === id);
  if (loan) {
    loan.status = status;
  }

  // 2. Sync locally and to Supabase
  const payload = { status };
  syncWrite('loans', 'update', id, payload);
}

export function deleteLoan(id: string): void {
  // 1. Remove from cache synchronously (both loan and associated EMIs)
  const lIdx = cachedLoans.findIndex(l => l.id === id);
  if (lIdx !== -1) {
    cachedLoans.splice(lIdx, 1);
  }

  // Remove associated EMIs from cache
  const deletedEmiIds: string[] = [];
  for (let i = cachedEmis.length - 1; i >= 0; i--) {
    if (cachedEmis[i].loanId === id) {
      deletedEmiIds.push(cachedEmis[i].id);
      cachedEmis.splice(i, 1);
    }
  }

  // 2. Sync deletions locally and to Supabase
  deletedEmiIds.forEach((emiId) => {
    syncWrite('emis', 'delete', emiId);
  });
  syncWrite('loans', 'delete', id);
}

export function renewLoan(
  oldLoanId: string,
  customerName: string,
  interestPaid: number,
  paymentMethod: string,
  transactionRef: string,
  createdBy: string
): void {
  const today = getSystemWorkingDate();
  const paymentId = `pay_ren_${Math.random().toString(36).substring(2, 11)}`;
  const createdAt = new Date().toISOString();

  const newPayment = {
    id: paymentId,
    loanId: oldLoanId,
    paymentType: 'settlement' as any,
    amount: interestPaid,
    paymentDate: today,
    principalComponent: 0,
    interestComponent: interestPaid,
    penaltyComponent: 0,
    paymentMethod,
    transactionRef,
    createdBy,
    createdAt,
    customerName
  };

  // 1. Add payment record to cache synchronously
  cachedPayments.unshift(newPayment);

  // 2. Mark pending/overdue EMIs as paid in cache and sync them
  cachedEmis.forEach((emi) => {
    if (emi.loanId === oldLoanId && (emi.status === 'pending' || emi.status === 'overdue')) {
      emi.status = 'paid';
      emi.paidAmount = emi.amount;
      emi.paymentMethod = paymentMethod;
      emi.transactionRef = `${transactionRef} (renewal)`;
      emi.paidDate = today;
      emi.paymentId = paymentId;

      const emiPayload = {
        status: 'paid',
        paid_amount: emi.amount,
        payment_method: paymentMethod,
        transaction_ref: `${transactionRef} (renewal)`,
        paid_date: today,
        payment_id: paymentId
      };
      syncWrite('emis', 'update', emi.id, emiPayload);
    }
  });

  // 3. Mark old loan as closed in cache synchronously
  updateLoanStatus(oldLoanId, 'closed');

  // 4. Sync payment insert
  const paymentPayload = {
    id: paymentId,
    loan_id: oldLoanId,
    payment_type: 'settlement',
    amount: interestPaid,
    payment_date: today,
    principal_component: 0,
    interest_component: interestPaid,
    penalty_component: 0,
    payment_method: paymentMethod,
    transaction_ref: transactionRef,
    created_by: createdBy,
    created_at: createdAt,
    customer_name: customerName
  };
  syncWrite('payments', 'insert', paymentId, paymentPayload);
}

export function settleNetPurchase(
  loanId: string,
  customerName: string,
  principalSettled: number,
  interestSettled: number,
  penaltySettled: number,
  totalDebt: number,
  paymentMethod: string,
  transactionRef: string,
  createdBy: string
): void {
  const today = getSystemWorkingDate();
  const paymentId = `pay_net_${Math.random().toString(36).substring(2, 11)}`;
  const createdAt = new Date().toISOString();

  const newPayment = {
    id: paymentId,
    loanId,
    paymentType: 'settlement' as any,
    amount: totalDebt,
    paymentDate: today,
    principalComponent: principalSettled,
    interestComponent: interestSettled,
    penaltyComponent: penaltySettled,
    paymentMethod,
    transactionRef,
    createdBy,
    createdAt,
    customerName
  };

  // 1. Add payment to cache synchronously
  cachedPayments.unshift(newPayment);

  // 2. Mark pending/overdue EMIs as paid in cache and sync them
  cachedEmis.forEach((emi) => {
    if (emi.loanId === loanId && (emi.status === 'pending' || emi.status === 'overdue')) {
      emi.status = 'paid';
      emi.paidAmount = emi.amount;
      emi.paymentMethod = paymentMethod;
      emi.transactionRef = `${transactionRef} (net-purchase)`;
      emi.paidDate = today;
      emi.paymentId = paymentId;

      const emiPayload = {
        status: 'paid',
        paid_amount: emi.amount,
        payment_method: paymentMethod,
        transaction_ref: `${transactionRef} (net-purchase)`,
        paid_date: today,
        payment_id: paymentId
      };
      syncWrite('emis', 'update', emi.id, emiPayload);
    }
  });

  // 3. Close the loan in cache
  updateLoanStatus(loanId, 'closed');

  // 4. Sync payment insert
  const paymentPayload = {
    id: paymentId,
    loan_id: loanId,
    payment_type: 'settlement',
    amount: totalDebt,
    payment_date: today,
    principal_component: principalSettled,
    interest_component: interestSettled,
    penalty_component: penaltySettled,
    payment_method: paymentMethod,
    transaction_ref: transactionRef,
    created_by: createdBy,
    created_at: createdAt,
    customer_name: customerName
  };
  syncWrite('payments', 'insert', paymentId, paymentPayload);
}

export function recordAuctionSale(
  loanId: string,
  customerName: string,
  auctionAmount: number,
  auctionFees: number,
  principalRecovered: number,
  interestRecovered: number,
  penaltyRecovered: number,
  auctionSurplus: number,
  auctionDeficit: number,
  paymentMethod: string,
  transactionRef: string,
  createdBy: string
): void {
  const today = getSystemWorkingDate();
  const paymentId = `pay_auc_${Math.random().toString(36).substring(2, 11)}`;
  const totalRecovered = principalRecovered + interestRecovered + penaltyRecovered;
  const createdAt = new Date().toISOString();
  
  // Serialize detailed auction details into transaction reference to bypass schema constraints
  const paymentRef = `${transactionRef} (Auction: Sale=${auctionAmount}, Fees=${auctionFees}, Surplus=${auctionSurplus}, Deficit=${auctionDeficit})`;

  const newPayment = {
    id: paymentId,
    loanId,
    paymentType: 'settlement' as any,
    amount: totalRecovered,
    paymentDate: today,
    principalComponent: principalRecovered,
    interestComponent: interestRecovered,
    penaltyComponent: penaltyRecovered,
    paymentMethod,
    transactionRef: paymentRef,
    createdBy,
    createdAt,
    customerName
  };

  // 1. Record payment in cache synchronously
  cachedPayments.unshift(newPayment);

  // 2. Mark pending/overdue EMIs as paid in cache & sync them
  cachedEmis.forEach((emi) => {
    if (emi.loanId === loanId && (emi.status === 'pending' || emi.status === 'overdue')) {
      emi.status = 'paid';
      emi.paidAmount = emi.amount;
      emi.paymentMethod = paymentMethod;
      emi.transactionRef = `${transactionRef} (auction)`;
      emi.paidDate = today;
      emi.paymentId = paymentId;

      const emiPayload = {
        status: 'paid',
        paid_amount: emi.amount,
        payment_method: paymentMethod,
        transaction_ref: `${transactionRef} (auction)`,
        paid_date: today,
        payment_id: paymentId
      };
      syncWrite('emis', 'update', emi.id, emiPayload);
    }
  });

  // 3. Update loan status to 'auctioned' in cache
  updateLoanStatus(loanId, 'auctioned');

  // 4. Sync payment insert
  const paymentPayload = {
    id: paymentId,
    loan_id: loanId,
    payment_type: 'settlement',
    amount: totalRecovered,
    payment_date: today,
    principal_component: principalRecovered,
    interest_component: interestRecovered,
    penalty_component: penaltyRecovered,
    payment_method: paymentMethod,
    transaction_ref: paymentRef,
    created_by: createdBy,
    created_at: createdAt,
    customer_name: customerName
  };
  syncWrite('payments', 'insert', paymentId, paymentPayload);
}
