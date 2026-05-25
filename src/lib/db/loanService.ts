import { Loan, LoanType } from '../../types';
import { getDB, saveDB } from '../database';

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
  };
}

export function getAllLoans(): Loan[] {
  const db = getDB();
  const result = db.exec(
    `SELECT id, customer_id, customer_name, gold_weight, gold_type, gold_value, item_type,
            loan_amount, loan_type_id, loan_type_name, interest_rate, tenure,
            start_date, end_date, status, emi_amount, created_by
     FROM loans ORDER BY start_date DESC`
  );
  if (!result.length) return [];
  return result[0].values.map(rowToLoan);
}

export function getLoanTypes(): LoanType[] {
  const db = getDB();
  const result = db.exec(
    'SELECT id, name, interest_rate, min_amount, max_amount, min_tenure, max_tenure FROM loan_types'
  );
  if (!result.length) return [];
  return result[0].values.map(rowToLoanType);
}

export function addLoan(loan: Loan): void {
  const db = getDB();
  db.run(
    `INSERT INTO loans (id, customer_id, customer_name, gold_weight, gold_type, gold_value, item_type,
                        loan_amount, loan_type_id, loan_type_name, interest_rate, tenure,
                        start_date, end_date, status, emi_amount, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
