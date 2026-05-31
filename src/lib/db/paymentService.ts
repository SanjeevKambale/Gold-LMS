import { Payment } from '../../types';
import { getDB, saveDB } from '../database';
import { getSystemWorkingDate } from '../workingDate';

function rowToPayment(row: any[]): Payment {
  return {
    id: row[0] as string,
    loanId: row[1] as string,
    paymentType: row[2] as 'INTEREST' | 'PARTIAL' | 'FULL_CLOSURE' | 'RENEWAL' | 'PENALTY',
    amount: row[3] as number,
    paymentDate: row[4] as string,
    principalComponent: row[5] as number,
    interestComponent: row[6] as number,
    penaltyComponent: row[7] as number,
    paymentMethod: row[8] as string | undefined,
    transactionRef: row[9] as string | undefined,
    createdBy: row[10] as string | undefined,
    createdAt: row[11] as string,
    customerName: row[12] as string | undefined,
  };
}

export function getPaymentsByLoan(loanId: string): Payment[] {
  const db = getDB();
  const today = getSystemWorkingDate();
  const result = db.exec(
    `SELECT id, loan_id, payment_type, amount, payment_date, principal_component, 
            interest_component, penalty_component, payment_method, transaction_ref, 
            created_by, created_at, customer_name 
     FROM payments WHERE loan_id = ? AND payment_date <= ? ORDER BY payment_date ASC, created_at ASC`,
    [loanId, today]
  );
  if (!result.length || !result[0].values.length) return [];
  return result[0].values.map(rowToPayment);
}

export function getAllPayments(): Payment[] {
  const db = getDB();
  const today = getSystemWorkingDate();
  const result = db.exec(
    `SELECT id, loan_id, payment_type, amount, payment_date, principal_component, 
            interest_component, penalty_component, payment_method, transaction_ref, 
            created_by, created_at, customer_name 
     FROM payments WHERE payment_date <= ? ORDER BY payment_date DESC, created_at DESC`,
    [today]
  );
  if (!result.length || !result[0].values.length) return [];
  return result[0].values.map(rowToPayment);
}

export function addPayment(payment: Payment): void {
  const db = getDB();
  db.run(
    `INSERT INTO payments (id, loan_id, payment_type, amount, payment_date, 
                           principal_component, interest_component, penalty_component, 
                           payment_method, transaction_ref, created_by, created_at, customer_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payment.id,
      payment.loanId,
      payment.paymentType,
      payment.amount,
      payment.paymentDate,
      payment.principalComponent,
      payment.interestComponent,
      payment.penaltyComponent,
      payment.paymentMethod ?? null,
      payment.transactionRef ?? null,
      payment.createdBy ?? null,
      payment.createdAt,
      payment.customerName ?? null,
    ]
  );
  saveDB();
}

export function deletePayment(id: string): void {
  const db = getDB();
  db.run('DELETE FROM payments WHERE id=?', [id]);
  saveDB();
}
