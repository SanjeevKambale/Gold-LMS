import { LoanTransfer, Customer, User, Loan } from '../../types';
import { getDB, saveDB } from '../database';
import { getRemainingLoanBalance, getEMIsByLoan, calculateEMIPenalty } from './emiService';
import { logActivity } from '../activityLogger';

function rowToTransfer(row: any[]): LoanTransfer {
  return {
    id: row[0] as string,
    loanId: row[1] as string,
    fromCustomerId: row[2] as string,
    toCustomerId: row[3] as string,
    fromBranch: row[4] as string,
    toBranch: row[5] as string,
    transferDate: row[6] as string,
    outstandingAmount: row[7] as number,
    reason: row[8] as string,
    status: row[9] as 'pending' | 'approved' | 'rejected',
    requestedBy: row[10] as string,
    requestedByName: row[11] as string,
    approvedBy: row[12] as string | undefined,
    approvedByName: row[13] as string | undefined,
    rejectionReason: row[14] as string | undefined,
  };
}

export function createTransferRequest(
  loanId: string,
  fromCustomerId: string,
  toCustomerId: string,
  toBranch: string,
  reason: string,
  user: User
): void {
  const db = getDB();

  // 1. Validate same customer
  if (fromCustomerId === toCustomerId) {
    throw new Error('Cannot transfer a loan to the same customer.');
  }

  // 2. Validate loan status
  const loanResult = db.exec('SELECT status, branch_id FROM loans WHERE id=?', [loanId]);
  if (!loanResult.length || !loanResult[0].values.length) {
    throw new Error('Loan not found.');
  }
  const status = loanResult[0].values[0][0] as string;
  const fromBranch = (loanResult[0].values[0][1] as string) || 'Main Branch';

  if (status !== 'active') {
    throw new Error(`Loan must be ACTIVE to be transferred. Current status: ${status.toUpperCase()}`);
  }

  // 3. Calculate Outstanding (Balance + Penalties)
  const balance = getRemainingLoanBalance(loanId);
  const emis = getEMIsByLoan(loanId);
  const totalPenalty = emis.reduce((sum, emi) => sum + calculateEMIPenalty(emi), 0);
  const outstandingAmount = balance + totalPenalty;

  // 4. Create request record
  const id = crypto.randomUUID();
  const transferDate = new Date().toISOString();

  db.run(
    `INSERT INTO loan_transfers (
      id, loan_id, from_customer_id, to_customer_id, from_branch, to_branch,
      transfer_date, outstanding_amount, reason, requested_by, requested_by_name, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, loanId, fromCustomerId, toCustomerId, fromBranch, toBranch,
      transferDate, outstandingAmount, reason, user.id, user.name, 'pending'
    ]
  );

  saveDB();
  logActivity(user, 'loan_transfer_requested', `Requested loan transfer for Loan #${loanId} to Customer #${toCustomerId}`);
}

export function getPendingTransfers(): LoanTransfer[] {
  const db = getDB();
  const result = db.exec('SELECT * FROM loan_transfers WHERE status="pending" ORDER BY transfer_date DESC');
  if (!result.length) return [];
  return result[0].values.map(rowToTransfer);
}

export function getAllTransfers(): LoanTransfer[] {
  const db = getDB();
  const result = db.exec('SELECT * FROM loan_transfers ORDER BY transfer_date DESC');
  if (!result.length) return [];
  return result[0].values.map(rowToTransfer);
}

export function approveTransfer(transferId: string, admin: User): void {
  const db = getDB();
  
  // 1. Get transfer details
  const result = db.exec('SELECT * FROM loan_transfers WHERE id=?', [transferId]);
  if (!result.length || !result[0].values.length) throw new Error('Transfer request not found');
  const transfer = rowToTransfer(result[0].values[0]);

  if (transfer.status !== 'pending') throw new Error('Transfer request already processed');

  // 2. Validate current loan status
  const loanResult = db.exec('SELECT status, id FROM loans WHERE id=?', [transfer.loanId]);
  if (!loanResult.length || !loanResult[0].values.length) throw new Error('Original loan not found');
  if (loanResult[0].values[0][0] !== 'active') throw new Error('Loan is no longer active');

  // 3. Get target customer name
  const custResult = db.exec('SELECT name FROM customers WHERE id=?', [transfer.toCustomerId]);
  if (!custResult.length || !custResult[0].values.length) throw new Error('Target customer not found');
  const targetCustomerName = custResult[0].values[0][0] as string;

  // 4. Execute Transfer via Transaction
  db.run('BEGIN TRANSACTION');
  try {
    // Update loan details
    db.run(
      'UPDATE loans SET customer_id=?, customer_name=?, branch_id=? WHERE id=?',
      [transfer.toCustomerId, targetCustomerName, transfer.toBranch || null, transfer.loanId]
    );

    // Update associated EMIs
    db.run(
      'UPDATE emis SET customer_id=?, customer_name=? WHERE loan_id=?',
      [transfer.toCustomerId, targetCustomerName, transfer.loanId]
    );

    // Update transfer status
    db.run(
      'UPDATE loan_transfers SET status="approved", approved_by=?, approved_by_name=? WHERE id=?',
      [admin.id, admin.name, transferId]
    );

    db.run('COMMIT');
    saveDB();
    logActivity(admin, 'loan_transfer_approved', `Approved loan transfer for Loan #${transfer.loanId} to ${targetCustomerName}`);
  } catch (err) {
    db.run('ROLLBACK');
    throw err;
  }
}

export function rejectTransfer(transferId: string, admin: User, reason: string): void {
  const db = getDB();
  
  db.run(
    'UPDATE loan_transfers SET status="rejected", approved_by=?, approved_by_name=?, rejection_reason=? WHERE id=?',
    [admin.id, admin.name, reason, transferId]
  );
  
  saveDB();
  logActivity(admin, 'loan_transfer_rejected', `Rejected loan transfer request #${transferId} - Reason: ${reason}`);
}

export function clearAllTransfers(admin: User): void {
  const db = getDB();
  db.run('DELETE FROM loan_transfers');
  saveDB();
  logActivity(admin, 'loan_transfer_cleared', 'Cleared all loan transfer history logs');
}

export function getTransfersByLoan(loanId: string): LoanTransfer[] {
  const db = getDB();
  const result = db.exec('SELECT * FROM loan_transfers WHERE loan_id=? ORDER BY transfer_date DESC', [loanId]);
  if (!result.length) return [];
  return result[0].values.map(rowToTransfer);
}


