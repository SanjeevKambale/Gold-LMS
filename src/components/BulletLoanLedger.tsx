import { useState, useEffect } from 'react';
import { Loan, Payment, User } from '../types';
import { calculateBulletLoanBalances, LoanBalances } from '../lib/db/loanCalculationService';
import { getSystemWorkingDate } from '../lib/workingDate';
import { getPaymentsByLoan, addPayment } from '../lib/db/paymentService';
import { updateLoanStatus } from '../lib/db/loanService';
import { logActivity } from '../lib/activityLogger';
import { CreditCard, CheckCircle, Calculator, TrendingDown, Clock } from 'lucide-react';

interface BulletLoanLedgerProps {
  loan: Loan;
  currentUser: User;
  onRefresh: () => void;
  onModalStateChange?: (isOpen: boolean) => void;
}

export function BulletLoanLedger({ loan, currentUser, onRefresh, onModalStateChange }: BulletLoanLedgerProps) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [balances, setBalances] = useState<LoanBalances | null>(null);
  
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentType, setPaymentType] = useState<'INTEREST' | 'PARTIAL' | 'FULL_CLOSURE'>('INTEREST');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [penaltyAmount, setPenaltyAmount] = useState('0');
  const [paymentDate, setPaymentDate] = useState(() => getSystemWorkingDate());

  useEffect(() => {
    if (onModalStateChange) {
      onModalStateChange(showPaymentModal);
    }
  }, [showPaymentModal, onModalStateChange]);

  const refreshLedger = () => {
    setPayments(getPaymentsByLoan(loan.id));
    setBalances(calculateBulletLoanBalances(loan));
  };

  useEffect(() => {
    refreshLedger();
  }, [loan]);

  const handlePayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!balances) return;

    const amount = parseFloat(paymentAmount) || 0;
    const penalty = parseFloat(penaltyAmount) || 0;
    
    if (amount <= 0 && penalty <= 0) return;

    let principalComponent = 0;
    let interestComponent = 0;
    const penaltyComponent = penalty;
    
    // Allocate payment
    let remainingAmount = amount;

    if (paymentType === 'INTEREST') {
      interestComponent = Math.min(remainingAmount, balances.unpaidInterest);
      remainingAmount -= interestComponent;
      // If there's any remaining amount, it shouldn't really happen for INTEREST ONLY, 
      // but we just allocate it to principal just in case, or throw an error.
      principalComponent = remainingAmount; 
    } else if (paymentType === 'PARTIAL') {
      // Typically partial pays interest first, then principal. 
      // Let's assume the user entered the principal they want to pay.
      // Wait, let's keep it simple: "PARTIAL" is purely principal reduction.
      principalComponent = remainingAmount;
    } else if (paymentType === 'FULL_CLOSURE') {
      interestComponent = balances.unpaidInterest;
      principalComponent = balances.remainingPrincipal;
    }

    const payment: Payment = {
      id: Date.now().toString(),
      loanId: loan.id,
      customerName: loan.customerName,
      paymentType,
      amount: amount + penalty,
      paymentDate: paymentDate,
      principalComponent,
      interestComponent,
      penaltyComponent,
      paymentMethod: 'cash',
      createdBy: currentUser.id,
      createdAt: new Date().toISOString()
    };

    addPayment(payment);
    
    logActivity(
      currentUser,
      'bullet_payment_made',
      `Bullet loan payment received: ${paymentType}`,
      `Loan ID: ${loan.id}, Amount: ₹${(amount + penalty).toLocaleString()}`
    );

    setShowPaymentModal(false);
    setPaymentAmount('');
    setPenaltyAmount('0');
    setPaymentDate(getSystemWorkingDate());
    
    // Close the loan if fully paid
    if (paymentType === 'FULL_CLOSURE' || (paymentType === 'PARTIAL' && principalComponent >= balances.remainingPrincipal)) {
      updateLoanStatus(loan.id, 'completed');
    }
    
    refreshLedger();
    onRefresh();
  };

  if (!balances) return null;

  return (
    <div className={`space-y-6 mt-6 pt-6 ${showPaymentModal ? 'border-none' : 'border-t border-black/15'}`}>
      <h4 className={`text-sm font-bold text-gray-900 mb-3 items-center gap-2 ${showPaymentModal ? 'hidden' : 'flex'}`}>
        <Calculator className="w-4 h-4 text-gray-400" />
        Bullet Loan Ledger (Dynamic Interest)
      </h4>

      {/* Balances Dashboard */}
      <div className={`gap-4 ${showPaymentModal ? 'hidden' : 'grid grid-cols-2 md:grid-cols-4'}`}>
        <div className="bg-white p-4 border border-black/15 rounded-none shadow-sm">
          <p className="text-xs text-gray-500 font-medium">Remaining Principal</p>
          <p className="text-lg font-bold text-gray-900 mt-1">₹{balances.remainingPrincipal.toLocaleString()}</p>
        </div>
        <div className="bg-white p-4 border border-black/15 rounded-none shadow-sm">
          <p className="text-xs text-gray-500 font-medium">Unpaid Interest</p>
          <p className="text-lg font-bold text-yellow-600 mt-1">₹{Math.floor(balances.unpaidInterest).toLocaleString()}</p>
        </div>
        <div className="bg-red-50 p-4 border border-red-100 rounded-none shadow-sm">
          <p className="text-xs text-red-600 font-medium">Total Payable (Today)</p>
          <p className="text-lg font-bold text-red-700 mt-1">₹{Math.floor(balances.totalPayableAmount).toLocaleString()}</p>
        </div>
        <div className="bg-blue-50 p-4 border border-blue-100 rounded-none shadow-sm">
          <p className="text-xs text-blue-600 font-medium">Interest Paid</p>
          <p className="text-lg font-bold text-blue-700 mt-1">₹{balances.totalPaidInterest.toLocaleString()}</p>
        </div>
      </div>

      {balances.isOverdue && (
        <div className="bg-red-100 p-3 flex items-center gap-2 text-red-800 text-sm font-bold">
          <Clock className="w-4 h-4" />
          Loan is overdue by {balances.overdueDays} days!
        </div>
      )}

      {/* Action Buttons */}
      {loan.status === 'active' && balances.remainingPrincipal > 0 && (
        <div className={`flex-wrap gap-2 ${showPaymentModal ? 'hidden' : 'flex'}`}>
          <button
            onClick={() => { setPaymentType('INTEREST'); setShowPaymentModal(true); }}
            className="px-4 py-2 bg-yellow-50 text-yellow-700 border border-black/15 text-sm font-bold hover:bg-yellow-100"
          >
            Pay Interest Only
          </button>
          <button
            onClick={() => { setPaymentType('PARTIAL'); setShowPaymentModal(true); }}
            className="px-4 py-2 bg-blue-50 text-blue-700 border border-black/15 text-sm font-bold hover:bg-blue-100"
          >
            Partial Principal
          </button>
          <button
            onClick={() => { setPaymentType('FULL_CLOSURE'); setShowPaymentModal(true); }}
            className="px-4 py-2 bg-green-500 text-white border border-black/15 text-sm font-bold hover:bg-green-600"
          >
            Full Closure
          </button>
        </div>
      )}

      {/* Ledger Table */}
      {payments.length > 0 && (
        <div className={`bg-white border border-black/15 overflow-hidden ${showPaymentModal ? 'hidden' : 'block'}`}>
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b border-black/15">
              <tr>
                <th className="p-3 text-xs font-bold text-gray-500 uppercase">Date</th>
                <th className="p-3 text-xs font-bold text-gray-500 uppercase">Type</th>
                <th className="p-3 text-xs font-bold text-gray-500 uppercase">Principal</th>
                <th className="p-3 text-xs font-bold text-gray-500 uppercase">Interest</th>
                <th className="p-3 text-xs font-bold text-gray-500 uppercase">Penalty</th>
                <th className="p-3 text-xs font-bold text-gray-500 uppercase text-right">Total Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {payments.map(p => (
                <tr key={p.id}>
                  <td className="p-3">{new Date(p.paymentDate).toLocaleDateString()}</td>
                  <td className="p-3 font-bold text-gray-700">{p.paymentType.replace('_', ' ')}</td>
                  <td className="p-3 text-blue-600">₹{p.principalComponent.toLocaleString()}</td>
                  <td className="p-3 text-yellow-600">₹{p.interestComponent.toLocaleString()}</td>
                  <td className="p-3 text-red-600">₹{p.penaltyComponent.toLocaleString()}</td>
                  <td className="p-3 font-bold text-right">₹{p.amount.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 visible" style={{ zIndex: 9999 }}>
          <div className="bg-white w-full max-w-sm border border-black/15 shadow-2xl">
            <div className="p-4 border-b border-black/15 bg-gray-50">
              <h3 className="font-bold text-lg">Record {paymentType.replace('_', ' ')}</h3>
            </div>
            <form onSubmit={handlePayment} className="p-4 space-y-4">
              {paymentType === 'FULL_CLOSURE' ? (
                <div className="bg-yellow-50 p-3 border border-black/15">
                  <p className="text-sm font-bold">Principal Due: ₹{balances.remainingPrincipal.toLocaleString()}</p>
                  <p className="text-sm font-bold">Interest Due: ₹{Math.floor(balances.unpaidInterest).toLocaleString()}</p>
                  <p className="text-base font-black mt-2">Total to Pay: ₹{Math.floor(balances.totalPayableAmount).toLocaleString()}</p>
                  {/* For full closure, we auto-calculate the amount. We just allow them to add penalty. */}
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Amount (₹)
                  </label>
                  <input
                    type="number"
                    required
                    value={paymentAmount}
                    onChange={e => setPaymentAmount(e.target.value)}
                    max={paymentType === 'INTEREST' ? Math.floor(balances.unpaidInterest) : balances.remainingPrincipal}
                    className="w-full border border-black/15 p-2 focus:ring-2 focus:ring-yellow-500"
                  />
                  {paymentType === 'INTEREST' && <p className="text-[10px] text-gray-500 mt-1">Max unpaid interest: ₹{Math.floor(balances.unpaidInterest)}</p>}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Optional: Add Penalty / Late Fee (₹)
                </label>
                <input
                  type="number"
                  value={penaltyAmount}
                  onChange={e => setPenaltyAmount(e.target.value)}
                  className="w-full border border-black/15 p-2 focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Payment Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={paymentDate}
                  onChange={e => setPaymentDate(e.target.value)}
                  max={new Date().toISOString().split('T')[0]} // Cannot be in the future
                  className="w-full border border-black/15 p-2 focus:ring-2 focus:ring-yellow-500 font-mono"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowPaymentModal(false)} className="flex-1 py-2 bg-gray-100 font-bold border border-black/15">
                  Cancel
                </button>
                <button type="submit" className="flex-1 py-2 bg-yellow-500 text-white font-bold border border-black/15">
                  Confirm Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
