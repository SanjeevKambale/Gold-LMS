import { Loan } from '../../types';
import { getPaymentsByLoan } from './paymentService';
import { getSystemWorkingDate } from '../workingDate';

export interface LoanBalances {
  remainingPrincipal: number;
  totalAccruedInterest: number;
  totalPaidInterest: number;
  unpaidInterest: number;
  totalPaidPenalties: number;
  totalPayableAmount: number;
  overdueDays: number;
  isOverdue: boolean;
}

/**
 * Calculates interest for exact days.
 * Formula: P * R * T, where T = days / 365
 */
export function calculateInterestForDays(principal: number, ratePerYear: number, days: number): number {
  if (days <= 0 || principal <= 0) return 0;
  return (principal * ratePerYear * (days / 365)) / 100;
}

export function calculateBulletLoanBalances(
  loan: Loan,
  asOfDateStr: string = getSystemWorkingDate()
): LoanBalances {
  const payments = getPaymentsByLoan(loan.id);
  
  let currentPrincipal = loan.loanAmount;
  let totalAccruedInterest = 0;
  let totalPaidInterest = 0;
  let totalPaidPenalties = 0;
  
  // Track the date from which we are currently calculating interest.
  // Initially, it's the loan start date.
  let lastCalculationDate = loan.startDate;

  // Process payments chronologically to handle partial principal reductions
  for (const payment of payments) {
    // Calculate interest accrued from the last calculation date to this payment date
    const lastDate = new Date(lastCalculationDate);
    const paymentDateObj = new Date(payment.paymentDate);
    
    // Only calculate if the payment date is after the last calculation date
    if (paymentDateObj > lastDate) {
      const daysDiff = Math.floor((paymentDateObj.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
      const interestForPeriod = calculateInterestForDays(currentPrincipal, loan.interestRate, daysDiff);
      totalAccruedInterest += interestForPeriod;
      lastCalculationDate = payment.paymentDate; // Advance the calculation cursor
    }

    // Apply the payment to our balances
    currentPrincipal -= payment.principalComponent;
    totalPaidInterest += payment.interestComponent;
    totalPaidPenalties += payment.penaltyComponent;
  }

  // Calculate interest from the last payment (or start date if no payments) up to the asOfDate
  const finalDate = new Date(asOfDateStr);
  const lastDate = new Date(lastCalculationDate);
  
  if (finalDate > lastDate) {
    const daysDiff = Math.floor((finalDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
    const interestForPeriod = calculateInterestForDays(currentPrincipal, loan.interestRate, daysDiff);
    totalAccruedInterest += interestForPeriod;
  }

  // Unpaid interest is whatever has accrued minus what has been explicitly paid
  const unpaidInterest = Math.max(0, totalAccruedInterest - totalPaidInterest);
  
  // Total payable right now
  const totalPayableAmount = currentPrincipal + unpaidInterest;

  // Calculate overdue status
  const endDateObj = new Date(loan.endDate);
  const isOverdue = finalDate > endDateObj && loan.status === 'active';
  const overdueDays = isOverdue ? Math.floor((finalDate.getTime() - endDateObj.getTime()) / (1000 * 60 * 60 * 24)) : 0;

  return {
    remainingPrincipal: currentPrincipal,
    totalAccruedInterest,
    totalPaidInterest,
    unpaidInterest,
    totalPaidPenalties,
    totalPayableAmount,
    isOverdue,
    overdueDays
  };
}
