import { useState, useEffect } from 'react';
import { X, Send, ArrowRight, User as UserIcon, Building2, ClipboardList, AlertCircle } from 'lucide-react';
import { Loan, Customer, User } from '../types';
import { getAllCustomers } from '../lib/db/customerService';
import { getRemainingLoanBalance, calculateEMIPenalty, getEMIsByLoan } from '../lib/db/emiService';
import { createTransferRequest } from '../lib/db/loanTransferService';

interface LoanTransferModalProps {
  loan: Loan;
  currentUser: User;
  onClose: () => void;
  onSuccess: () => void;
}

export function LoanTransferModal({ loan, currentUser, onClose, onSuccess }: LoanTransferModalProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [toCustomerId, setToCustomerId] = useState('');
  const [toBranch, setToBranch] = useState('Main Branch');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCustomers(getAllCustomers().filter(c => c.id !== loan.customerId));
  }, [loan.customerId]);

  const balance = getRemainingLoanBalance(loan.id);
  const emis = getEMIsByLoan(loan.id);
  const totalPenalty = emis.reduce((sum, emi) => sum + calculateEMIPenalty(emi), 0);
  const outstanding = balance + totalPenalty;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!toCustomerId) {
      setError('Please select a recipient customer');
      return;
    }
    setError(null);
    setIsSubmitting(true);

    try {
      createTransferRequest(
        loan.id,
        loan.customerId,
        toCustomerId,
        toBranch,
        reason,
        currentUser
      );
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to submit transfer request');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-none border border-black/15 max-w-md w-full shadow-2xl overflow-hidden border border-black/15">
        <div className="bg-yellow-500 px-6 py-4 flex items-center justify-between text-white">
          <div className="flex items-center gap-3">
            <Send className="w-6 h-6" />
            <h3 className="text-xl font-bold uppercase tracking-wide">Request Loan Transfer</h3>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-none border border-black/15 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6">
          {/* Financial Summary Banner */}
          <div className="mb-6 p-4 bg-gray-50 rounded-none border border-black/15 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-gray-400 uppercase">Current Outstanding</p>
              <p className="text-2xl font-black text-gray-900">₹{outstanding.toLocaleString('en-IN')}</p>
            </div>
            <div className="flex flex-col items-end text-[10px] font-bold text-gray-500 uppercase">
              <p>Principal: ₹{balance.toLocaleString('en-IN')}</p>
              <p className="text-red-500">Penalty: ₹{totalPenalty.toLocaleString('en-IN')}</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="flex items-center gap-4 py-4 px-2 border-y border-dashed border-black/15">
               <div className="flex-1 text-center">
                 <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">From Customer</p>
                 <p className="text-sm font-bold text-gray-700 truncate">{loan.customerName}</p>
               </div>
               <div className="p-2 bg-yellow-100 rounded-full text-yellow-600">
                 <ArrowRight className="w-4 h-4" />
               </div>
               <div className="flex-1 text-center">
                 <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Target Customer</p>
                 <select
                    required
                    value={toCustomerId}
                    onChange={(e) => setToCustomerId(e.target.value)}
                    className="w-full text-sm font-bold text-blue-600 bg-transparent border-none focus:ring-0 text-center cursor-pointer"
                 >
                   <option value="">Select Recipient...</option>
                   {customers.map(c => (
                     <option key={c.id} value={c.id}>{c.name}</option>
                   ))}
                 </select>
               </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase ml-1">
                  <Building2 className="w-3.5 h-3.5" />
                  Target Branch
                </label>
                <input
                  type="text"
                  required
                  value={toBranch}
                  onChange={(e) => setToBranch(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-50 border border-black/15 rounded-none border border-black/15 focus:ring-2 focus:ring-yellow-500 outline-none text-sm"
                  placeholder="e.g. South Branch"
                />
              </div>

              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase ml-1">
                  <ClipboardList className="w-3.5 h-3.5" />
                  Transfer Reason
                </label>
                <input
                  type="text"
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-50 border border-black/15 rounded-none border border-black/15 focus:ring-2 focus:ring-yellow-500 outline-none text-sm"
                  placeholder="e.g. Legal ownership change"
                />
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-black/15 rounded-none border border-black/15 flex items-start gap-2 text-red-700 text-xs">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <p className="font-medium">{error}</p>
              </div>
            )}

            <div className="pt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={onClose}
                className="py-2.5 text-sm font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-none border border-black/15 transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !toCustomerId}
                className="py-2.5 text-sm font-bold bg-yellow-500 text-white rounded-none border border-black/15 hover:bg-yellow-600 transition-all shadow-lg shadow-yellow-100 disabled:bg-gray-200 disabled:shadow-none"
              >
                {isSubmitting ? 'Transferring...' : 'Transfer'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
