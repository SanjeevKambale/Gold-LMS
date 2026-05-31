import { Loan, LoanType } from '../../types';
import { getDB, saveDB } from '../database';
import { getSystemWorkingDate } from '../workingDate';

function rowToLoan(row: any[]): Loan {
  return {
    id: row[0] as string,
    customerId: row[1] as string,
    customerName: row[2] as string,
    goldWeight: row[3] as number,
    goldType: row[4] as '24K' | '22K' | '18K',
    goldValue: row[5] as number,
    itemType: row[6] as string,
    loanAmount: row[7] as number,
    loanTypeId: row[8] as string,
    loanTypeName: row[9] as string,
    interestRate: row[10] as number,
    tenure: row[11] as number,
    startDate: row[12] as string,
    endDate: row[13] as string,
    status: row[14] as 'active' | 'closed' | 'defaulted' | 'completed',
    emiAmount: row[15] as number,
    createdBy: row[16] as string | undefined,
    branchId: row[17] as string | undefined,
    lockerNumber: row[18] as string | undefined,
    packetNumber: row[19] as string | undefined,
    ornamentPhotoUrl: row[20] as string | undefined,
    repaymentScheme: row[21] as 'EMI' | 'BULLET',
    penaltyRate: row[22] !== undefined && row[22] !== null ? row[22] as number : 2,
  };
}

function rowToLoanType(row: any[]): LoanType {
  return {
    id: row[0] as string,
    name: row[1] as string,
    interestRate: row[2] as number,
    minAmount: row[3] as number,
    maxAmount: row[4] as number,
    minTenure: row[5] as number,
    maxTenure: row[6] as number,
    repaymentScheme: row[7] as 'EMI' | 'BULLET' | undefined,
  };
}

export function getAllLoans(): Loan[] {
  const db = getDB();
  const today = getSystemWorkingDate();
  const result = db.exec(
    `SELECT id, customer_id, customer_name, gold_weight, gold_type, gold_value, item_type,
            loan_amount, loan_type_id, loan_type_name, interest_rate, tenure,
            start_date, end_date, status, emi_amount, created_by, branch_id, locker_number, packet_number, ornament_photo_url, repayment_scheme, penalty_rate
     FROM loans WHERE start_date <= ? ORDER BY start_date DESC`,
    [today]
  );
  if (!result.length) return [];
  return result[0].values.map(rowToLoan);
}

export function getLoanTypes(): LoanType[] {
  const db = getDB();
  const result = db.exec(
    'SELECT id, name, interest_rate, min_amount, max_amount, min_tenure, max_tenure, repayment_scheme FROM loan_types'
  );
  if (!result.length) return [];
  return result[0].values.map(rowToLoanType);
}

export function addLoan(loan: Loan): void {
  const db = getDB();
  db.run(
    `INSERT INTO loans (id, customer_id, customer_name, gold_weight, gold_type, gold_value, item_type,
                        loan_amount, loan_type_id, loan_type_name, interest_rate, tenure,
                        start_date, end_date, status, emi_amount, created_by, branch_id, locker_number, packet_number, ornament_photo_url, repayment_scheme, penalty_rate)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      loan.id,
      loan.customerId,
      loan.customerName,
      loan.goldWeight,
      loan.goldType,
      loan.goldValue,
      loan.itemType,
      loan.loanAmount,
      loan.loanTypeId,
      loan.loanTypeName,
      loan.interestRate,
      loan.tenure,
      loan.startDate,
      loan.endDate,
      loan.status,
      loan.emiAmount,
      loan.createdBy ?? null,
      loan.branchId ?? null,
      loan.lockerNumber ?? null,
      loan.packetNumber ?? null,
      loan.ornamentPhotoUrl ?? null,
      loan.repaymentScheme ?? 'EMI',
      loan.penaltyRate ?? 2,
    ]
  );
  saveDB();
}

export function updateLoanStatus(id: string, status: 'active' | 'closed' | 'defaulted' | 'completed'): void {
  const db = getDB();
  db.run('UPDATE loans SET status=? WHERE id=?', [status, id]);
  saveDB();
}

export function deleteLoan(id: string): void {
  const db = getDB();
  // Delete all associated EMIs first, then the loan
  db.run('DELETE FROM emis WHERE loan_id=?', [id]);
  db.run('DELETE FROM loans WHERE id=?', [id]);
  saveDB();
}
