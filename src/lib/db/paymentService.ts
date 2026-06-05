import { Payment } from '../../types';
import { getSystemWorkingDate } from '../workingDate';
import { cachedPayments, syncWrite } from '../database';

export function getPaymentsByLoan(loanId: string): Payment[] {
  const today = getSystemWorkingDate();
  return cachedPayments
    .filter(p => p.loanId === loanId && p.paymentDate <= today)
    .sort((a, b) => {
      const dateDiff = a.paymentDate.localeCompare(b.paymentDate);
      if (dateDiff !== 0) return dateDiff;
      return a.createdAt.localeCompare(b.createdAt);
    });
}

export function getAllPayments(): Payment[] {
  const today = getSystemWorkingDate();
  return cachedPayments
    .filter(p => p.paymentDate <= today)
    .sort((a, b) => {
      const dateDiff = b.paymentDate.localeCompare(a.paymentDate);
      if (dateDiff !== 0) return dateDiff;
      return b.createdAt.localeCompare(a.createdAt);
    });
}

export function addPayment(payment: Payment): void {
  // 1. Prepend to cache synchronously
  cachedPayments.unshift(payment);

  // 2. Sync locally and to Supabase
  const payload = {
    id: payment.id,
    loan_id: payment.loanId,
    payment_type: payment.paymentType,
    amount: payment.amount,
    payment_date: payment.paymentDate,
    principal_component: payment.principalComponent,
    interest_component: payment.interestComponent,
    penalty_component: payment.penaltyComponent,
    payment_method: payment.paymentMethod || null,
    transaction_ref: payment.transactionRef || null,
    created_by: payment.createdBy || null,
    created_at: payment.createdAt,
    customer_name: payment.customerName || null,
  };
  syncWrite('payments', 'insert', payment.id, payload);
}

export function deletePayment(id: string): void {
  // 1. Remove from cache synchronously
  const idx = cachedPayments.findIndex(p => p.id === id);
  if (idx !== -1) {
    cachedPayments.splice(idx, 1);
  }

  // 2. Sync locally and to Supabase
  syncWrite('payments', 'delete', id);
}
