import { useState } from 'react';
import {
  X, TrendingDown, CheckCircle, ChevronDown, ChevronUp,
  Sparkles, Banknote, FileText, AlertTriangle,
} from 'lucide-react';
import { Loan } from '../types';
import {
  getEMIsByLoan,
  computeAmortization,
  earlyCloseLoan,
  AmortizationRow,
} from '../lib/db/emiService';
import { getSystemWorkingDate } from '../lib/workingDate';

interface EarlyClosureModalProps {
  loan: Loan;
  onClose: () => void;
  /** Called after the loan is successfully closed */
  onClosed: (amountCharged: number, interestSaved: number) => void;
}

export function EarlyClosureModal({ loan, onClose, onClosed }: EarlyClosureModalProps) {
  const [step, setStep]               = useState<'overview' | 'success'>('overview');
  const [showSchedule, setShowSchedule] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [transactionRef, setTransactionRef] = useState('');
  const [closureDate, setClosureDate]       = useState(() => getSystemWorkingDate());
  const [isLoading, setIsLoading]     = useState(false);
  const [result, setResult]           = useState<{ amountCharged: number; interestSaved: number } | null>(null);

  // ── Data computation ──────────────────────────────────────────────────────
  const allEmis   = getEMIsByLoan(loan.id);
  const paidEmis  = allEmis.filter(e => e.status === 'paid');
  const paidCount = paidEmis.length;
  const totalEmis = allEmis.length;

  const schedule: AmortizationRow[] = computeAmortization(
    loan.loanAmount,
    loan.interestRate,
    loan.tenure
  );

  // Outstanding principal = balance after paidCount payments
  const outstandingPrincipal =
    paidCount === 0
      ? loan.loanAmount
      : (schedule[paidCount - 1]?.outstandingPrincipal ?? loan.loanAmount);

  // What the customer would pay if they continued normally (sum of remaining contracted EMIs)
  const remainingEmis         = allEmis.filter(e => e.status === 'pending' || e.status === 'overdue');
  const remainingEMITotal     = remainingEmis.reduce((s, e) => s + e.amount, 0);
  const interestSaved         = Math.max(0, remainingEMITotal - outstandingPrincipal);

  // Interest already paid in completed EMIs
  const interestAlreadyPaid   = paidEmis.reduce((s, e) => {
    return s + (schedule[e.emiNumber - 1]?.interestPaid ?? 0);
  }, 0);

  const progressPct = totalEmis > 0 ? Math.round((paidCount / totalEmis) * 100) : 0;

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const res = earlyCloseLoan(
        loan.id,
        loan.loanAmount,
        loan.interestRate,
        loan.tenure,
        paymentMethod,
        transactionRef || 'early-closure',
        paidCount,
        closureDate
      );
      setResult(res);
      setStep('success');
      onClosed(res.amountCharged, res.interestSaved);
    } finally {
      setIsLoading(false);
    }
  };

  // ── Success Screen ─────────────────────────────────────────────────────────
  if (step === 'success' && result) {
    return (
      <div className="fixed inset-0 bg-black overflow-y-auto flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-none border border-black/15 w-full max-w-md shadow-2xl overflow-hidden my-auto">
          {/* Header */}
          <div className="bg-green-600 px-6 py-8 text-center relative overflow-hidden">
            <div className="absolute -top-6 -right-6 w-24 h-24 bg-white opacity-10 rounded-full" />
            <div className="absolute -bottom-4 -left-4 w-16 h-16 bg-white opacity-10 rounded-full" />
            <div className="w-16 h-16 bg-white bg-opacity-20 rounded-full flex items-center justify-center mx-auto mb-3">
              <CheckCircle className="w-9 h-9 text-white" />
            </div>
            <h3 className="text-white font-bold text-xl">Loan Closed! 🎉</h3>
            <p className="text-green-100 text-sm mt-1">Customer has cleared all dues</p>
          </div>

          <div className="p-6 space-y-4">
            {/* Amount paid */}
            <div className="bg-gray-50 rounded-none border border-black/15 p-4 space-y-3">
              {[
                ['Loan ID',               `#${loan.id}`],
                ['Customer',              loan.customerName],
                ['Principal Settled',     `₹${result.amountCharged.toLocaleString('en-IN')}`],
                ['EMIs Paid',             `${paidCount} of ${totalEmis} months`],
                ['Closure Date',          new Date().toLocaleDateString('en-IN')],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between text-sm">
                  <span className="text-gray-500">{k}</span>
                  <span className="font-semibold text-gray-900">{v}</span>
                </div>
              ))}
            </div>

            {/* Interest saved highlight */}
            {result.interestSaved > 0 && (
              <div className="bg-green-50 border border-green-200 rounded-none p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-bold text-green-800">Interest Saved</span>
                </div>
                <p className="text-2xl font-bold text-green-700">
                  ₹{result.interestSaved.toLocaleString('en-IN')}
                </p>
                <p className="text-xs text-green-600 mt-1">
                  Future interest waived on early closure
                </p>
              </div>
            )}

            <div className="bg-yellow-50 border border-yellow-200 rounded-none p-3 flex gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-600 shrink-0 mt-0.5" />
              <p className="text-xs text-yellow-800 font-medium">
                Gold pledged against this loan can now be returned to the customer.
              </p>
            </div>

            <button
              onClick={onClose}
              className="w-full py-3 bg-gray-900 text-white rounded-none border border-black/15 font-semibold hover:bg-gray-800 transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Overview + Payment Form ────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 overflow-y-auto flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-none border border-black/15 w-full shadow-2xl flex flex-col my-auto" style={{ maxWidth: '42rem' }}>

        {/* Header */}
        <div className="bg-yellow-500 flex items-center justify-between" style={{ padding: '1.25rem 1.5rem' }}>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-yellow-600 rounded-none flex items-center justify-center shadow-inner">
              <TrendingDown className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-white font-bold text-lg leading-tight">Early Loan Closure</h3>
              <p className="text-yellow-100 text-xs">Pay only outstanding principal — interest waived</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-white hover:bg-yellow-600 rounded-none transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-5">

          {/* Progress */}
          <div className="bg-gray-50 rounded-none border border-black/15 p-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-semibold text-gray-700">Repayment Progress</span>
              <span className="text-sm font-bold text-gray-900">{paidCount} / {totalEmis} EMIs</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5 mb-2">
              <div
                className="bg-yellow-500 h-2.5 rounded-full transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-gray-500">
              <span>{progressPct}% complete</span>
              <span>{totalEmis - paidCount} months remaining</span>
            </div>
          </div>

          {/* Financial comparison */}
          <div className="rounded-none border border-black/15 overflow-hidden">
            <div className="bg-gray-50 px-4 py-2.5 border-b border-black/15">
              <p className="text-xs font-bold text-gray-600 uppercase tracking-wide">Financial Breakdown</p>
            </div>
            <div className="divide-y divide-gray-100">
              {[
                {
                  label: 'Original Loan Amount',
                  value: `₹${loan.loanAmount.toLocaleString('en-IN')}`,
                  sub: null,
                  color: 'text-gray-900',
                },
                {
                  label: 'Interest Paid So Far',
                  value: `₹${Math.round(interestAlreadyPaid).toLocaleString('en-IN')}`,
                  sub: `${paidCount} months of interest`,
                  color: 'text-gray-700',
                },
                {
                  label: 'Remaining EMIs (Normal)',
                  value: `₹${remainingEMITotal.toLocaleString('en-IN')}`,
                  sub: `${totalEmis - paidCount} × ₹${loan.emiAmount.toLocaleString('en-IN')}`,
                  color: 'text-red-600',
                },
              ].map(({ label, value, sub, color }) => (
                <div key={label} className="px-4 py-3 flex justify-between items-center">
                  <div>
                    <p className="text-sm text-gray-600">{label}</p>
                    {sub && <p className="text-xs text-gray-400">{sub}</p>}
                  </div>
                  <p className={`text-sm font-bold ${color}`}>{value}</p>
                </div>
              ))}

              {/* Highlighted: Outstanding principal */}
              <div className="px-4 py-4 bg-yellow-50 flex justify-between items-center border-t border-yellow-200 border-b border-yellow-200">
                <div>
                  <p className="text-sm font-bold text-yellow-900">💰 You Pay Today (Early Closure)</p>
                  <p className="text-xs text-yellow-700">Outstanding principal only — interest waived</p>
                </div>
                <p className="text-xl font-bold text-yellow-700">
                  ₹{Math.round(outstandingPrincipal).toLocaleString('en-IN')}
                </p>
              </div>

              {/* Interest saved */}
              {interestSaved > 0 && (
                <div className="px-4 py-3 bg-emerald-50 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-600" />
                    <p className="text-sm font-bold text-emerald-800">Interest Saved</p>
                  </div>
                  <p className="text-lg font-bold text-emerald-700">
                    ₹{interestSaved.toLocaleString('en-IN')}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Amortisation schedule (collapsible) */}
          <div className="rounded-none border border-black/15 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowSchedule(s => !s)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
            >
              <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">
                View Amortisation Schedule
              </span>
              {showSchedule
                ? <ChevronUp className="w-4 h-4 text-gray-500" />
                : <ChevronDown className="w-4 h-4 text-gray-500" />}
            </button>
            {showSchedule && (
              <div className="overflow-x-auto max-h-56 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      {['EMI', 'Principal', 'Interest', 'Balance', 'Status'].map(h => (
                        <th key={h} className="py-2 px-3 text-left text-gray-500 font-semibold whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {schedule.map((row, idx) => {
                      const isPaid   = idx < paidCount;
                      const isCurrent = idx === paidCount;
                      return (
                        <tr
                          key={row.emiNumber}
                          className={`border-t border-black/15 ${
                            isPaid    ? 'bg-green-50/60 text-gray-500' :
                            isCurrent ? 'bg-yellow-50 font-semibold'   :
                            'text-gray-700'
                          }`}
                        >
                          <td className="py-1.5 px-3">#{row.emiNumber}</td>
                          <td className="py-1.5 px-3">₹{row.principalPaid.toLocaleString('en-IN')}</td>
                          <td className="py-1.5 px-3 text-red-500">₹{row.interestPaid.toLocaleString('en-IN')}</td>
                          <td className="py-1.5 px-3">₹{row.outstandingPrincipal.toLocaleString('en-IN')}</td>
                          <td className="py-1.5 px-3">
                            {isPaid ? (
                              <span className="text-green-600 font-semibold">✓ Paid</span>
                            ) : isCurrent ? (
                              <span className="text-yellow-600 font-semibold">← Current</span>
                            ) : (
                              <span className="text-gray-400">Waived</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Warning */}
          <div className="bg-blue-50 border border-black/15 rounded-none border border-black/15 p-3 flex gap-2">
            <AlertTriangle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <p className="text-xs text-blue-800">
              After closure, all remaining EMIs will be marked as settled. The loan status will change to <strong>Completed</strong> and the pledged gold can be returned.
            </p>
          </div>

          {/* Payment Form */}
          <form onSubmit={handleConfirm} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Payment Method <span className="text-red-500">*</span>
              </label>
              <select
                value={paymentMethod}
                onChange={e => setPaymentMethod(e.target.value)}
                className="w-full px-4 py-2.5 border border-black/15 rounded-none border border-black/15 focus:ring-2 focus:ring-yellow-500 focus:border-transparent text-sm"
              >
                <option value="cash">Cash</option>
                <option value="upi_gpay">UPI — Google Pay</option>
                <option value="upi_phonepe">UPI — PhonePe</option>
                <option value="upi_paytm">UPI — Paytm</option>
                <option value="upi_other">UPI — Other</option>
                <option value="netbanking">Net Banking</option>
                <option value="bank_transfer">Bank Transfer / NEFT</option>
                <option value="cheque">Cheque</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Transaction / Reference No.
                {paymentMethod !== 'cash' && <span className="text-red-500"> *</span>}
              </label>
              <input
                type="text"
                value={transactionRef}
                onChange={e => setTransactionRef(e.target.value)}
                required={paymentMethod !== 'cash'}
                placeholder={paymentMethod.startsWith('upi') ? 'UPI Transaction ID' : 'Reference Number'}
                className="w-full px-4 py-2.5 border border-black/15 rounded-none border border-black/15 focus:ring-2 focus:ring-yellow-500 focus:border-transparent text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Payment/Closure Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                required
                value={closureDate}
                onChange={e => setClosureDate(e.target.value)}
                max={getSystemWorkingDate()} // Cannot be in the future
                className="w-full px-4 py-2.5 border border-black/15 rounded-none border border-black/15 focus:ring-2 focus:ring-yellow-500 focus:border-transparent text-sm font-mono"
              />
            </div>

            {/* Summary pill */}
            <div className="flex items-center justify-between bg-yellow-50 border border-yellow-200 rounded-none px-4 py-3">
              <div className="flex items-center gap-2">
                <Banknote className="w-4 h-4 text-yellow-600" />
                <span className="text-sm font-bold text-yellow-900">Total to Collect</span>
              </div>
              <span className="text-lg font-bold text-yellow-700">
                ₹{Math.round(outstandingPrincipal).toLocaleString('en-IN')}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="py-3 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-none border border-black/15 font-semibold text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="py-3 bg-yellow-500 hover:bg-yellow-600 text-white rounded-none border border-black/15 font-bold text-sm transition-all shadow-md flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <FileText className="w-4 h-4" />
                    Confirm Closure
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
