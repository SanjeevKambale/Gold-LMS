import React, { useState } from 'react';
import { X, FileText, Download, Share2, QrCode, CheckCircle, Percent } from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { EMI } from '../types';
import { generateEMIReceipt } from '../lib/pdfReceipt';
import { getAllSettings } from '../lib/db/settingsService';
import { getRemainingLoanBalance, calculateEMIPenalty, getEMIsByLoan } from '../lib/db/emiService';
import { getSystemWorkingDate } from '../lib/workingDate';

interface PayEMIModalProps {
  emi: EMI;
  onClose: () => void;
  onPay: (emiId: string, paidAmount: number, paymentMethod: string, transactionRef: string, penaltyAmount: number, paidDate: string, adjustmentMode?: 'tenure' | 'emi') => void;
  customerPhone?: string;
}

export function PayEMIModal({ emi, onClose, onPay, customerPhone }: PayEMIModalProps) {
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [transactionRef, setTransactionRef] = useState('');
  const [step, setStep] = useState<'form' | 'receipt'>('form');
  const [finalPaidAmount, setFinalPaidAmount] = useState(0);
  const [finalMethod, setFinalMethod] = useState('');
  const [finalRef, setFinalRef] = useState('');
  const [adjustmentMode, setAdjustmentMode] = useState<'none' | 'tenure' | 'emi'>('none');
  const [paidDate, setPaidDate] = useState(() => getSystemWorkingDate());
  const settings = getAllSettings();
  const { shop_name, shop_upi_id } = settings;
  const currentTotalRemaining = getRemainingLoanBalance(emi.loanId);
  const penaltyAmount = calculateEMIPenalty(emi);

  // Advance credit: if a pending EMI already has paid_amount set from a prior overpayment
  const advanceCredit = (emi.paidAmount && emi.status !== 'paid') ? emi.paidAmount : 0;
  // How much the customer still needs to pay for this EMI
  const remainingDue = Math.max(0, emi.amount - advanceCredit);

  const [paidAmount, setPaidAmount] = useState(() => (remainingDue + penaltyAmount).toString());

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(paidAmount);
    setFinalPaidAmount(amount);
    setFinalMethod(paymentMethod);
    setFinalRef(transactionRef);
    onPay(emi.id, amount, paymentMethod, transactionRef, penaltyAmount, paidDate, adjustmentMode === 'none' ? undefined : adjustmentMode);
    setStep('receipt');
  };

  const handleDownloadReceipt = () => {
    // Fetch latest balance AFTER payment was recorded
    const allEmis    = getEMIsByLoan(emi.loanId);
    const totalEMIs  = allEmis.length;
    const paidEMIsCount = allEmis.filter(e => e.status === 'paid').length;
    // Balance remaining after this payment (re-query from DB so it's post-payment accurate)
    const balanceAfter = getRemainingLoanBalance(emi.loanId);

    // Find all EMIs that were updated by this payment
    // Since we just paid, the latest paid EMIs with the same transaction ref will be our target
    const currentEmiInDb = allEmis.find(e => e.id === emi.id);
    let coveredEMIs: number[] = [emi.emiNumber];
    if (currentEmiInDb?.paymentId) {
      const related = allEmis.filter(e => e.paymentId === currentEmiInDb.paymentId);
      coveredEMIs = related.map(r => r.emiNumber);
    }

    generateEMIReceipt({
      loanId: emi.loanId,
      customerName: emi.customerName,
      emiNumber: emi.emiNumber,
      emiAmount: emi.amount,
      penaltyAmount: penaltyAmount,
      paidAmount: finalPaidAmount,
      totalPaidAmount: finalPaidAmount,
      coveredEMIs,
      paymentMethod: finalMethod,
      transactionRef: finalRef,
      dueDate: emi.dueDate,
      paidDate,
      remainingBalance: balanceAfter,
      totalEMIs,
      paidEMIsCount,
      paymentId: currentEmiInDb?.paymentId,
    });
  };

  const whatsappMsg = encodeURIComponent(
    `Hello ${emi.customerName},\n\n` +
    `✅ Your EMI #${emi.emiNumber} payment has been received!\n\n` +
    `💰 Amount Paid: *₹${finalPaidAmount.toLocaleString('en-IN')}*\n` +
    `📅 Payment Date: *${new Date(paidDate).toLocaleDateString('en-IN')}*\n` +
    `🏦 Method: *${finalMethod.replace('_', ' ').toUpperCase()}*\n` +
    (finalRef ? `📋 Ref: *${finalRef}*\n` : '') +
    `\nThank you for your payment!\n— ${shop_name}`
  );

  const whatsappUrl = customerPhone
    ? `https://wa.me/91${customerPhone.replace(/\D/g, '')}?text=${whatsappMsg}`
    : `https://wa.me/?text=${whatsappMsg}`;

  if (step === 'receipt') {
    const allEmis = getEMIsByLoan(emi.loanId);
    const currentEmiInDb = allEmis.find(e => e.id === emi.id);
    const receiptNo = `REC-EMI-${currentEmiInDb?.paymentId ? currentEmiInDb.paymentId.replace('pay_', '').toUpperCase() : `${emi.loanId.slice(-6)}-${emi.emiNumber}`}`;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-none border border-black/15 max-w-md w-full shadow-2xl overflow-hidden border border-black/15">
          <div className="bg-gradient-to-br from-green-500 to-emerald-600 px-6 py-6 text-center relative overflow-hidden">
            <div className="absolute top-0 right-0 -mr-6 -mt-6 w-24 h-24 bg-white opacity-10 rounded-full"></div>
            <CheckCircle className="w-12 h-12 text-white mx-auto mb-2 drop-shadow-sm" />
            <h3 className="text-white font-bold text-lg">Payment Recorded!</h3>
            <p className="text-green-50 text-xs font-medium">₹{finalPaidAmount.toLocaleString('en-IN')} received successfully</p>
          </div>

          <div className="px-6 py-5 space-y-5">
            <div className="bg-gray-50 rounded-none border border-black/15 p-4 space-y-3">
              {[
                ['Receipt No.', receiptNo],
                ['Customer', emi.customerName],
                ['Loan ID', emi.loanId],
                ['EMI', `${emi.emiNumber}`],
                ['Amount Paid', `₹${finalPaidAmount.toLocaleString('en-IN')}`],
                ...(finalPaidAmount < emi.amount ? [['Balance Due', `₹${(emi.amount - finalPaidAmount).toLocaleString('en-IN')}`]] : []),
                ['Method', finalMethod.replace('_', ' ').toUpperCase()],
                ...(finalRef ? [['Ref No.', finalRef]] : []),
                ['Date', new Date(paidDate).toLocaleDateString('en-IN')],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between items-start gap-4 text-xs md:text-sm">
                  <span className="text-gray-500 font-medium shrink-0">{k}</span>
                  <span className="text-gray-900 font-semibold text-right break-words leading-tight">{v}</span>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <button
                onClick={handleDownloadReceipt}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-yellow-500 text-white rounded-none border border-black/15 font-medium hover:bg-yellow-600 transition-colors shadow-sm"
              >
                <Download className="w-4 h-4" />
                Download PDF Receipt
              </button>
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-green-500 text-white rounded-none border border-black/15 font-medium hover:bg-green-600 transition-colors shadow-sm"
              >
                <Share2 className="w-4 h-4" />
                Send via WhatsApp
              </a>
              <button
                onClick={onClose}
                className="w-full py-2.5 text-gray-700 bg-gray-100 rounded-none border border-black/15 font-medium hover:bg-gray-200 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-none border border-black/15 max-w-md w-full">
        <div className="border-b border-black/15 px-6 py-4 flex items-center justify-between">
          <h3 className="text-xl font-semibold text-gray-900">Record EMI Payment</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-none border border-black/15 transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* EMI Details */}
          <div className="p-4 bg-gray-50 rounded-none border border-black/15">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-6 h-6 bg-yellow-100 rounded-none flex items-center justify-center overflow-hidden">
                <BrandLogo className="w-full h-full p-1" />
              </div>
              <h4 className="font-medium text-gray-900">EMI Details</h4>
            </div>
            <div className="space-y-2 text-sm">
              {[
                ['Customer', emi.customerName],
                ['Loan ID', emi.loanId],
                ['EMI Number', `${emi.emiNumber}`],
                ['Due Date', new Date(emi.dueDate).toLocaleDateString('en-IN')],
                ['Contract EMI', `₹${emi.amount.toLocaleString('en-IN')}`],
                ...(penaltyAmount > 0 ? [[`Penalty (${emi.penaltyRate ?? 2}%/mo)`, `₹${penaltyAmount.toLocaleString('en-IN')}`]] : []),
                ...(advanceCredit > 0 ? [['Advance Credit', `−₹${advanceCredit.toLocaleString('en-IN')}`]] : []),
                ['Amount Due Now', `₹${(remainingDue + penaltyAmount).toLocaleString('en-IN')}`],
                ['Total Loan Balance', `₹${currentTotalRemaining.toLocaleString('en-IN')}`],
              ].map(([k, v]) => (
                <div key={k} className={`flex justify-between ${k === 'Amount Due Now' ? 'font-semibold text-gray-900 border-t border-black/15 pt-2 mt-1' : ''}`}>
                  <span className="text-gray-500">{k}:</span>
                  <span className={`font-medium ${
                    k === 'Advance Credit' ? 'text-green-600' :
                    k === 'Amount Due Now' ? 'text-yellow-700' :
                    'text-gray-900'
                  }`}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* UPI Info */}
          <div className="bg-blue-50 border border-black/15 rounded-none border border-black/15 p-3 text-xs text-blue-700">
            💡 Customer can pay via <strong>GPay, PhonePe, Paytm</strong> using UPI ID: <strong>{shop_upi_id}</strong>.
            Enter the UPI transaction ID below as reference.
          </div>

          {/* Payment Information */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Payment Amount <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={paidAmount}
                onChange={(e) => setPaidAmount(e.target.value)}
                className="w-full px-4 py-2 border border-black/15 rounded-none border border-black/15 focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Payment Method <span className="text-red-500">*</span>
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full px-4 py-2 border border-black/15 rounded-none border border-black/15 focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
              >
                <option value="cash">Cash</option>
                <option value="upi_gpay">UPI - Google Pay</option>
                <option value="upi_phonepe">UPI - PhonePe</option>
                <option value="upi_paytm">UPI - Paytm</option>
                <option value="upi_other">UPI - Other</option>
                <option value="netbanking">Net Banking</option>
                <option value="card">Debit / Credit Card</option>
                <option value="bank_transfer">Bank Transfer / NEFT</option>
                <option value="cheque">Cheque</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Transaction / Reference Number
                {paymentMethod !== 'cash' && <span className="text-red-500"> *</span>}
              </label>
              <input
                type="text"
                value={transactionRef}
                onChange={(e) => setTransactionRef(e.target.value)}
                required={paymentMethod !== 'cash'}
                className="w-full px-4 py-2 border border-black/15 rounded-none border border-black/15 focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                placeholder={paymentMethod.startsWith('upi') ? 'UPI Transaction ID' : 'Reference Number'}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Payment Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                required
                value={paidDate}
                onChange={(e) => setPaidDate(e.target.value)}
                max={getSystemWorkingDate()} // Cannot be in the future
                className="w-full px-4 py-2 border border-black/15 rounded-none border border-black/15 focus:ring-2 focus:ring-yellow-500 focus:border-transparent font-mono"
              />
            </div>
          </div>

          {paidAmount && !isNaN(parseFloat(paidAmount)) && (() => {
            const amt = parseFloat(paidAmount);
            const totalDueNow = remainingDue + penaltyAmount;
            const isShort = amt < totalDueNow;
            // True excess = what's above the full obligation (after accounting for advance credit)
            const trueExcess = amt + advanceCredit - emi.amount - penaltyAmount;
            const balanceAfter = Math.max(0, currentTotalRemaining - amt - advanceCredit + penaltyAmount);

            return (
              <div className="space-y-4">
                <div className={`p-3 rounded-none border border-black/15 space-y-2 ${
                  isShort ? 'bg-orange-50 border border-black/15' :
                  trueExcess > 0 ? 'bg-emerald-50 border border-black/15' :
                  'bg-blue-50 border border-black/15'
                }`}>
                  {isShort && (
                    <p className="text-sm text-orange-800">
                      <strong>Partial Payment:</strong> ₹{(totalDueNow - amt).toLocaleString('en-IN')} still due this month
                    </p>
                  )}
                  {!isShort && trueExcess > 0 && (
                    <div className="space-y-1">
                      <p className="text-sm text-emerald-800">
                        <strong>🎉 Large Overpayment:</strong> ₹{trueExcess.toLocaleString('en-IN')} excess detected.
                      </p>
                      <p className="text-[10px] text-emerald-600">How should we handle this excess to save interest?</p>
                    </div>
                  )}
                  {!isShort && trueExcess <= 0 && (
                    <p className="text-sm text-blue-800">
                      <strong>Payment Amount:</strong> ₹{amt.toLocaleString('en-IN')}
                    </p>
                  )}
                  <div className="flex justify-between items-center text-xs font-semibold text-gray-700 pt-1 border-t border-black/15/50">
                    <span>Loan Balance After Payment:</span>
                    <span className={trueExcess > 0 ? 'text-emerald-700' : 'text-blue-700'}>
                      ₹{Math.max(0, balanceAfter).toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>

                {!isShort && trueExcess > (emi.amount * 0.5) && (
                  <div className="bg-amber-50 border border-black/15 rounded-none border border-black/15 p-4 space-y-3">
                    <h5 className="text-xs font-bold text-amber-900 uppercase tracking-wider flex items-center gap-2">
                      <Percent className="w-3.5 h-3.5" />
                      Interest Saving Options
                    </h5>
                    <div className="grid grid-cols-1 gap-2">
                      <button
                        type="button"
                        onClick={() => setAdjustmentMode('none')}
                        className={`flex items-center justify-between p-2.5 rounded-none border border-black/15 text-left transition-all ${
                          adjustmentMode === 'none' ? 'bg-white border-black/15 shadow-sm' : 'bg-amber-50/50 border-black/15 hover:border-black/15'
                        }`}
                      >
                        <div>
                          <p className="text-xs font-bold text-gray-900">Advance Payment</p>
                          <p className="text-[10px] text-gray-500">Apply to future EMIs (No interest saving)</p>
                        </div>
                        {adjustmentMode === 'none' && <CheckCircle className="w-4 h-4 text-amber-500" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => setAdjustmentMode('tenure')}
                        className={`flex items-center justify-between p-2.5 rounded-none border border-black/15 text-left transition-all ${
                          adjustmentMode === 'tenure' ? 'bg-white border-black/15 shadow-sm' : 'bg-amber-50/50 border-black/15 hover:border-black/15'
                        }`}
                      >
                        <div>
                          <p className="text-xs font-bold text-gray-900">Reduce Tenure (Recommended)</p>
                          <p className="text-[10px] text-gray-500">Finish loan faster, save max interest</p>
                        </div>
                        {adjustmentMode === 'tenure' && <CheckCircle className="w-4 h-4 text-amber-500" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => setAdjustmentMode('emi')}
                        className={`flex items-center justify-between p-2.5 rounded-none border border-black/15 text-left transition-all ${
                          adjustmentMode === 'emi' ? 'bg-white border-black/15 shadow-sm' : 'bg-amber-50/50 border-black/15 hover:border-black/15'
                        }`}
                      >
                        <div>
                          <p className="text-xs font-bold text-gray-900">Reduce EMI Amount</p>
                          <p className="text-[10px] text-gray-500">Lower monthly burden, keep same end date</p>
                        </div>
                        {adjustmentMode === 'emi' && <CheckCircle className="w-4 h-4 text-amber-500" />}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          <div className="grid grid-cols-2 gap-3 pt-4 border-t border-black/15">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-none border border-black/15 transition-colors font-medium text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2.5 bg-green-500 text-white rounded-none border border-black/15 hover:bg-green-600 transition-colors flex items-center justify-center gap-2 font-medium text-sm shadow-sm"
            >
              <FileText className="w-4 h-4" />
              Confirm & Receipt
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
