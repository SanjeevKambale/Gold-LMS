import { LoanTransfer, User } from '../../types';
import { supabase } from '../supabaseClient';
import { getRemainingLoanBalance, getEMIsByLoan, calculateEMIPenalty } from './emiService';
import { logActivity } from '../activityLogger';
import { cachedLoans, cachedEmis, cachedCustomers, cachedTransfers, syncWrite, getDB, saveDB } from '../database';

export function createTransferRequest(
  loanId: string,
  fromCustomerId: string,
  toCustomerId: string,
  toBranch: string,
  reason: string,
  user: User
): void {
  // 1. Validate same customer
  if (fromCustomerId === toCustomerId) {
    throw new Error('Cannot transfer a loan to the same customer.');
  }

  // 2. Validate loan status from cache
  const loan = cachedLoans.find(l => l.id === loanId);
  if (!loan) {
    throw new Error('Loan not found.');
  }
  const status = loan.status;
  const fromBranch = loan.branchId || 'Main Branch';

  if (status !== 'active') {
    throw new Error(`Loan must be ACTIVE to be transferred. Current status: ${status.toUpperCase()}`);
  }

  // 3. Calculate Outstanding synchronously (Balance + Penalties)
  const balance = getRemainingLoanBalance(loanId);
  const emis = getEMIsByLoan(loanId);
  const totalPenalty = emis.reduce((sum, emi) => sum + calculateEMIPenalty(emi), 0);
  const outstandingAmount = balance + totalPenalty;

  // 4. Create request record
  const id = crypto.randomUUID();
  const transferDate = new Date().toISOString();
  const newTransfer: LoanTransfer = {
    id,
    loanId,
    fromCustomerId,
    toCustomerId,
    fromBranch,
    toBranch,
    transferDate,
    outstandingAmount,
    reason,
    status: 'pending',
    requestedBy: user.id,
    requestedByName: user.name
  };

  // 5. Save to cache synchronously
  cachedTransfers.unshift(newTransfer);

  // 6. Sync locally and to Supabase
  const payload = {
    id,
    loan_id: loanId,
    from_customer_id: fromCustomerId,
    to_customer_id: toCustomerId,
    from_branch: fromBranch,
    to_branch: toBranch,
    transfer_date: transferDate,
    outstanding_amount: outstandingAmount,
    reason,
    requested_by: user.id,
    requested_by_name: user.name,
    status: 'pending'
  };
  syncWrite('loan_transfers', 'insert', id, payload);

  logActivity(user, 'loan_transfer_requested', `Requested loan transfer for Loan #${loanId} to Customer #${toCustomerId}`);
}

export function getPendingTransfers(): LoanTransfer[] {
  return cachedTransfers
    .filter(t => t.status === 'pending')
    .sort((a, b) => b.transferDate.localeCompare(a.transferDate));
}

export function getAllTransfers(): LoanTransfer[] {
  return cachedTransfers
    .slice()
    .sort((a, b) => b.transferDate.localeCompare(a.transferDate));
}

export function approveTransfer(transferId: string, admin: User): void {
  // 1. Get transfer from cache
  const transfer = cachedTransfers.find(t => t.id === transferId);
  if (!transfer) throw new Error('Transfer request not found');
  if (transfer.status !== 'pending') throw new Error('Transfer request already processed');

  // 2. Validate current loan status from cache
  const loan = cachedLoans.find(l => l.id === transfer.loanId);
  if (!loan) throw new Error('Original loan not found');
  if (loan.status !== 'active') throw new Error('Loan is no longer active');

  // 3. Get target customer name from cache
  const customer = cachedCustomers.find(c => c.id === transfer.toCustomerId);
  if (!customer) throw new Error('Target customer not found');
  const targetCustomerName = customer.name;

  // 4. Update memory cache synchronously
  // Update loan details
  loan.customerId = transfer.toCustomerId;
  loan.customerName = targetCustomerName;
  loan.branchId = transfer.toBranch || undefined;

  // Update associated EMIs in cache & database
  cachedEmis.forEach((emi) => {
    if (emi.loanId === transfer.loanId) {
      emi.customerId = transfer.toCustomerId;
      emi.customerName = targetCustomerName;
      syncWrite('emis', 'update', emi.id, {
        customer_id: transfer.toCustomerId,
        customer_name: targetCustomerName
      });
    }
  });

  // Update transfer request status
  transfer.status = 'approved';
  transfer.approvedBy = admin.id;
  transfer.approvedByName = admin.name;

  // 5. Sync updates to SQLite and Supabase
  syncWrite('loans', 'update', transfer.loanId, {
    customer_id: transfer.toCustomerId,
    customer_name: targetCustomerName,
    branch_id: transfer.toBranch || null
  });

  syncWrite('loan_transfers', 'update', transferId, {
    status: 'approved',
    approved_by: admin.id,
    approved_by_name: admin.name
  });

  logActivity(admin, 'loan_transfer_approved', `Approved loan transfer for Loan #${transfer.loanId} to ${targetCustomerName}`);
}

export function rejectTransfer(transferId: string, admin: User, reason: string): void {
  // 1. Update cache synchronously
  const transfer = cachedTransfers.find(t => t.id === transferId);
  if (transfer) {
    transfer.status = 'rejected';
    transfer.approvedBy = admin.id;
    transfer.approvedByName = admin.name;
    transfer.rejectionReason = reason;
  }

  // 2. Sync to local and Supabase
  const payload = {
    status: 'rejected',
    approved_by: admin.id,
    approved_by_name: admin.name,
    rejection_reason: reason
  };
  syncWrite('loan_transfers', 'update', transferId, payload);

  logActivity(admin, 'loan_transfer_rejected', `Rejected loan transfer request #${transferId} - Reason: ${reason}`);
}

export function clearAllTransfers(admin: User): void {
  // 1. Clear cache synchronously
  cachedTransfers.length = 0;

  // 2. Clear SQLite locally
  try {
    const localDb = getDB();
    localDb.run("DELETE FROM loan_transfers");
    saveDB();
  } catch (err) {
    console.error("Failed to clear local SQLite transfers:", err);
  }

  // 3. Delete from Supabase in background
  supabase
    .from('loan_transfers')
    .delete()
    .neq('id', 'placeholder')
    .then(({ error }) => {
      if (error) {
        console.error('Failed to sync cleared transfers to Supabase in background:', error.message);
        return;
      }
      logActivity(admin, 'loan_transfer_cleared', 'Cleared all loan transfer history logs');
    });
}

export function getTransfersByLoan(loanId: string): LoanTransfer[] {
  return cachedTransfers
    .filter(t => t.loanId === loanId)
    .sort((a, b) => b.transferDate.localeCompare(a.transferDate));
}
