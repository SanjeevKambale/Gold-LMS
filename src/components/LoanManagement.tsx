import { useState, useEffect } from 'react';
import { Plus, Search, Eye, FileText, Trash2, AlertTriangle, X, CreditCard, TrendingDown, Send, TrendingUp, Clock, Scale, Download, Calendar, CheckCircle, XCircle, History, Camera } from 'lucide-react';
import { Loan, EMI, User, LoanTransfer } from '../types';
import { getAllLoans, addLoan as dbAddLoan, deleteLoan as dbDeleteLoan } from '../lib/db/loanService';
import { addEMIs } from '../lib/db/emiService';
import { getTransfersByLoan } from '../lib/db/loanTransferService';
import { CreateLoanModal } from './CreateLoanModal';
import { EarlyClosureModal } from './EarlyClosureModal';
import { LoanTransferModal } from './LoanTransferModal';
import { ConfirmationModal } from './ConfirmationModal';
import { BulletLoanLedger } from './BulletLoanLedger';
import { generateLoanReceipt } from '../lib/pdfReceipt';
import { logActivity } from '../lib/activityLogger';

function parseOrnamentPhotos(photoUrlStr?: string): { url: string; name: string }[] {
  if (!photoUrlStr) return [];
  if (photoUrlStr.startsWith('[') && photoUrlStr.endsWith(']')) {
    try {
      const parsed = JSON.parse(photoUrlStr);
      if (Array.isArray(parsed)) {
        return parsed.map((item: any) => {
          if (typeof item === 'string') {
            return { url: item, name: item.split(/[/\\]/).pop() || 'Ornament Photo' };
          }
          return { url: item.url || '', name: item.name || 'Ornament Photo' };
        });
      }
    } catch (e) {}
  }
  return [{ url: photoUrlStr, name: photoUrlStr.split(/[/\\]/).pop() || 'Ornament Photo' }];
}

interface LoanManagementProps {
  currentUser: User;
}

export function LoanManagement({ currentUser }: LoanManagementProps) {
  const [loans, setLoans] = useState<Loan[]>(() => {
    try { 
      const allLoans = getAllLoans();
      return currentUser.role === 'staff' 
        ? allLoans.filter(l => l.createdBy === currentUser.id)
        : allLoans;
    } catch { return []; }
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'closed' | 'defaulted' | 'completed'>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [discardLoan, setDiscardLoan] = useState<Loan | null>(null);
  const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null);
  const [earlyClosureLoan, setEarlyClosureLoan] = useState<Loan | null>(null);
  const [transferLoan, setTransferLoan] = useState<Loan | null>(null);
  const [showOrnamentImage, setShowOrnamentImage] = useState<string | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);



  const [selectedLoanHistory, setSelectedLoanHistory] = useState<LoanTransfer[]>([]);

  useEffect(() => {
    if (selectedLoan) {
      setSelectedLoanHistory(getTransfersByLoan(selectedLoan.id));
    }
  }, [selectedLoan]);


  const handleEarlyClosure = (amountCharged: number, interestSaved: number) => {
    const loan = earlyClosureLoan;
    if (loan) {
      logActivity(
        currentUser,
        'loan_closed',
        `Early loan closure for ${loan.customerName}`,
        `Loan ID: ${loan.id}, Principal settled: ₹${amountCharged.toLocaleString()}, Interest saved: ₹${interestSaved.toLocaleString()}`
      );
    }
    refreshLoans();
    setEarlyClosureLoan(null);
    setSelectedLoan(null);
  };

  const refreshLoans = () => { 
    try { 
      const allLoans = getAllLoans();
      setLoans(currentUser.role === 'staff' 
        ? allLoans.filter(l => l.createdBy === currentUser.id)
        : allLoans);
    } catch {} 
  };

  const handleDiscardLoan = () => {
    if (!discardLoan) return;
    dbDeleteLoan(discardLoan.id);
    refreshLoans();
    logActivity(
      currentUser,
      'loan_updated',
      `Discarded loan for ${discardLoan.customerName}`,
      `Loan ID: ${discardLoan.id}, Amount: ₹${discardLoan.loanAmount.toLocaleString()}`
    );
    setDiscardLoan(null);
  };

  const filteredLoans = loans.filter(loan => {
    const matchesSearch = loan.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         loan.id.includes(searchTerm);
    const matchesFilter = filterStatus === 'all' || loan.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'closed':
        return 'bg-gray-100 text-gray-800';
      case 'defaulted':
        return 'bg-red-100 text-red-800';
      case 'completed':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const handleCreateLoan = (loan: Loan) => {
    const loanWithCreator = { ...loan, createdBy: currentUser.id };
    dbAddLoan(loanWithCreator);

    // Auto-generate EMI records for this loan if it's an EMI scheme
    if (loan.repaymentScheme !== 'BULLET') {
      const emis: EMI[] = Array.from({ length: loan.tenure }, (_, i) => {
        const dueDate = new Date(loan.startDate);
        dueDate.setMonth(dueDate.getMonth() + i + 1);
        return {
          id: `${loan.id}_emi_${i + 1}`,
          loanId: loan.id,
          customerId: loan.customerId,
          customerName: loan.customerName,
          emiNumber: i + 1,
          dueDate: dueDate.toISOString().split('T')[0],
          amount: loan.emiAmount,
          status: 'pending',
          createdBy: currentUser.id,
          penaltyRate: loan.penaltyRate,
        };
      });
      addEMIs(emis);
    }

    refreshLoans();
    setShowCreateModal(false);
    
    // Log activity
    logActivity(
      currentUser,
      'loan_created',
      `Created new loan for ${loan.customerName}`,
      `Amount: ₹${loan.loanAmount.toLocaleString()}, Gold: ${loan.goldWeight}g ${loan.goldType}, Tenure: ${loan.tenure} months`
    );

    // Generate PDF receipt instantly
    generateLoanReceipt(loan);
  };

  const totalActiveLoans = loans.filter(l => l.status === 'active').length;
  const totalLoanAmount = loans.filter(l => l.status === 'active').reduce((sum, loan) => sum + loan.loanAmount, 0);
  const totalGoldWeight = loans.filter(l => l.status === 'active').reduce((sum, loan) => sum + loan.goldWeight, 0);



  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl md:text-2xl font-semibold text-gray-900">Gold Loan Management</h2>
          <p className="text-sm md:text-base text-gray-500 mt-1">Create and manage gold loans for customers</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center justify-center gap-2 bg-yellow-500 text-white px-4 py-2.5 rounded-none border border-black/15 hover:bg-yellow-600 transition-colors"
        >
          <Plus className="w-5 h-5" />
          <span className="text-sm md:text-base">Create Loan</span>
        </button>
      </div>

      {/* Loan Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6">
        <div className="bg-white rounded-none border border-black/15 p-4 md:p-6 border border-black/15 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col h-full">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs md:text-sm text-gray-500 font-medium">Active Loans</p>
              <p className="text-xl md:text-2xl font-bold text-gray-900 mt-1">{totalActiveLoans}</p>
            </div>
            <div className="w-10 h-10 md:w-12 md:h-12 bg-green-100 rounded-none border border-black/15 flex items-center justify-center shadow-sm">
              <FileText className="w-5 h-5 md:w-6 md:h-6 text-green-500" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-none border border-black/15 p-4 md:p-6 border border-black/15 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col h-full">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs md:text-sm text-gray-500 font-medium">Total Loan Amount</p>
              <p className="text-xl md:text-2xl font-bold text-gray-900 mt-1">₹{(totalLoanAmount / 100000).toFixed(1)}L</p>
            </div>
            <div className="w-10 h-10 md:w-12 md:h-12 bg-yellow-100 rounded-none border border-black/15 flex items-center justify-center shadow-sm">
              <FileText className="w-5 h-5 md:w-6 md:h-6 text-yellow-500" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-none border border-black/15 p-4 md:p-6 border border-black/15 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col h-full">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs md:text-sm text-gray-500 font-medium">Total Gold Weight</p>
              <p className="text-xl md:text-2xl font-bold text-gray-900 mt-1">{totalGoldWeight.toFixed(0)}g</p>
            </div>
            <div className="w-10 h-10 md:w-12 md:h-12 bg-purple-100 rounded-none border border-black/15 flex items-center justify-center shadow-sm">
              <FileText className="w-5 h-5 md:w-6 md:h-6 text-purple-500" />
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-none border border-black/15 p-4 md:p-6 border border-black/15 shadow-sm hover:shadow-md transition-all duration-300">
        <div className="flex flex-col gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by customer or loan ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-sm md:text-base border border-black/15 rounded-none border border-black/15 focus:ring-2 focus:ring-yellow-500 focus:border-transparent transition-all"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-2 px-2 scrollbar-hide">
            {['all', 'active', 'completed', 'closed', 'defaulted'].map((status) => (
              <button
                key={status}
                onClick={() => setFilterStatus(status as any)}
                className={`px-4 py-2 rounded-none border border-black/15 capitalize transition-all text-xs md:text-sm font-bold whitespace-nowrap border ${
                  filterStatus === status
                    ? 'bg-yellow-500 text-white border-black/15 shadow-md shadow-yellow-100'
                    : 'bg-white text-gray-600 border-black/15 hover:border-black/15 hover:bg-yellow-50/30'
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Loans List Table */}
      <div className="bg-white rounded-none border border-black/15 shadow-sm overflow-hidden hover:shadow-md transition-all duration-300">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Loan ID</th>
                <th className="text-left py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Customer</th>
                <th className="text-left py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Gold Info</th>
                <th className="text-left py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Loan Details</th>
                <th className="text-left py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">EMI</th>
                <th className="text-left py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Tenure</th>
                <th className="text-left py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="text-center py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredLoans.map((loan) => (
                <tr key={loan.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="py-4 px-6">
                    <p className="font-bold text-sm text-gray-900 font-mono">{loan.id.slice(-6)}</p>
                    <p className="text-[10px] text-gray-400 font-mono">REC-LN-{loan.id}</p>
                  </td>
                  <td className="py-4 px-6">
                    <p className="text-sm font-semibold text-gray-900">{loan.customerName}</p>
                  </td>
                  <td className="py-4 px-6">
                    <div>
                      <p className="text-sm font-bold text-gray-900">{loan.goldWeight}g ({loan.goldType})</p>
                      <p className="text-xs text-blue-600 font-medium">{loan.itemType}</p>
                      <p className="text-xs text-gray-500">Value: ₹{loan.goldValue.toLocaleString()}</p>
                    </div>
                  </td>
                  <td className="py-4 px-6">
                    <div>
                      <p className="text-sm font-bold text-gray-900">₹{loan.loanAmount.toLocaleString()}</p>
                      <p className="text-xs text-gray-500 truncate max-w-[150px]">{loan.loanTypeName}</p>
                      <p className="text-xs text-gray-500">{loan.interestRate}% interest</p>
                    </div>
                  </td>
                  <td className="py-4 px-6">
                    {loan.repaymentScheme === 'BULLET' ? (
                      <p className="text-sm font-bold text-yellow-700 bg-yellow-50 px-2 py-1 inline-block border border-yellow-200">Bullet</p>
                    ) : (
                      <p className="text-sm font-bold text-yellow-600">₹{loan.emiAmount.toLocaleString()}</p>
                    )}
                  </td>
                  <td className="py-4 px-6">
                    <div>
                      <p className="text-sm text-gray-900">{loan.tenure} months</p>
                      <p className="text-xs text-gray-500">{new Date(loan.startDate).toLocaleDateString()}</p>
                    </div>
                  </td>
                  <td className="py-4 px-6">
                    <span className={`inline-flex items-center px-4 py-1 rounded-full text-xs font-bold tracking-wide ${getStatusColor(loan.status)} shadow-sm border border-current`}>
                      {loan.status}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => setSelectedLoan(loan)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-none border border-black/15 transition-all hover:scale-110"
                        title="View Details"
                      >
                        <Eye className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => generateLoanReceipt(loan)}
                        className="p-2 text-green-600 hover:bg-green-50 rounded-none border border-black/15 transition-all hover:scale-110"
                        title="Download Receipt"
                      >
                        <FileText className="w-5 h-5" />
                      </button>
                      {loan.status === 'active' && (
                        <button
                          onClick={() => setTransferLoan(loan)}
                          className="p-2 text-yellow-600 hover:bg-yellow-50 rounded-none border border-black/15 transition-all hover:scale-110"
                          title="Transfer Loan"
                        >
                          <Send className="w-5 h-5" />
                        </button>
                      )}
                      {(loan.status === 'active' || loan.status === 'completed') && (
                        <button
                          onClick={() => setDiscardLoan(loan)}
                          className="p-2 text-red-500 hover:bg-red-50 rounded-none border border-black/15 transition-all hover:scale-110"
                          title={loan.status === 'completed' ? "Delete Record" : "Discard Loan"}
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showCreateModal && (
        <CreateLoanModal
          currentUser={currentUser}
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateLoan}
        />
      )}

      {/* Discard Confirmation Modal */}
      {discardLoan && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-none border border-black/15 w-full max-w-sm shadow-2xl relative overflow-hidden">
            <button 
              onClick={() => setDiscardLoan(null)}
              className="absolute text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors flex justify-center items-center"
              style={{ top: '1rem', right: '1rem', width: '2rem', height: '2rem' }}
            >
              <X className="w-5 h-5" />
            </button>
            {/* Header */}
            <div className="flex flex-col items-center px-6 pt-6 pb-4 border-b border-black/15">
              <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mb-3">
                <AlertTriangle className="w-7 h-7 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900">
                {discardLoan.status === 'completed' ? 'Delete Completed Loan?' : 'Discard Loan?'}
              </h3>
              <p className="text-sm text-gray-500 mt-1 text-center">This action cannot be undone.</p>
            </div>
            {/* Body */}
            <div className="px-6 py-4">
              <p className="text-sm text-gray-700 text-center">
                Permanently {discardLoan.status === 'completed' ? 'delete' : 'discard'} the loan record for <strong>{discardLoan.customerName}</strong>?
              </p>
              <div className="mt-3 bg-red-50 rounded-none border border-black/15 p-3 text-xs text-gray-600 space-y-1">
                <p>• Loan ID: #{discardLoan.id}</p>
                <p>• Status: <span className="capitalize font-bold">{discardLoan.status}</span></p>
                <p>• Amount: ₹{discardLoan.loanAmount.toLocaleString()}</p>
                <p>• All associated records will be removed</p>
              </div>
            </div>
            {/* Footer buttons — full width, stacked */}
            <div className="px-6 pb-6 flex flex-col gap-2 relative z-10">
              <button
                onClick={handleDiscardLoan}
                className="w-full py-2.5 bg-red-500 text-white font-medium rounded-none border border-black/15 hover:bg-red-600 active:bg-red-700 transition-colors flex items-center justify-center gap-2"
                style={{ marginTop: '0.75rem' }}
              >
                <Trash2 className="w-4 h-4" />
                {discardLoan.status === 'completed' ? 'Delete Record' : 'Discard Loan'}
              </button>
              <button
                onClick={() => setDiscardLoan(null)}
                className="w-full py-2.5 text-gray-700 bg-gray-100 font-medium rounded-none border border-black/15 hover:bg-gray-200 active:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loan Details Modal */}
      {selectedLoan && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
          <div className={`w-full max-w-2xl relative overflow-hidden flex flex-col max-h-[90vh] ${isPaymentModalOpen ? 'bg-transparent shadow-none border-none' : 'bg-white rounded-none border border-black/15 shadow-2xl'}`}>
            <div className={`flex items-center justify-between px-6 py-4 border-b border-black/15 bg-gray-50/50 ${isPaymentModalOpen ? 'hidden' : 'flex'}`}>
              <div>
                <h3 className="text-lg md:text-xl font-bold text-gray-900">Loan Details</h3>
                <p className="text-xs text-gray-500 mt-0.5">#{selectedLoan.id}</p>
              </div>
              <button 
                onClick={() => setSelectedLoan(null)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors flex justify-center items-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {/* Header Status */}
              <div className={`items-center justify-between bg-yellow-50 p-4 rounded-none border border-black/15 ${isPaymentModalOpen ? 'hidden' : 'flex'}`}>
                <div>
                  <p className="text-xs text-yellow-800 font-medium">Customer</p>
                  <p className="text-base font-bold text-yellow-900">{selectedLoan.customerName}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-yellow-800 font-medium">Status</p>
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold capitalize mt-1 ${getStatusColor(selectedLoan.status)} border border-current`}>
                    {selectedLoan.status}
                  </span>
                </div>
              </div>

              {/* Grid Details */}
              <div className={`grid-cols-1 md:grid-cols-2 gap-6 ${isPaymentModalOpen ? 'hidden' : 'grid'}`}>
                <div>
                  <h4 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-gray-400" />
                    Loan Information
                  </h4>
                  <div className="space-y-3 bg-gray-50 p-4 rounded-none border border-black/15">
                    <div>
                      <p className="text-xs text-gray-500">Receipt No.</p>
                      <p className="text-sm font-bold text-yellow-700 font-mono">REC-LN-{selectedLoan.id}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Loan Type</p>
                      <p className="text-sm font-medium text-gray-900">{selectedLoan.loanTypeName}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Principal Amount</p>
                      <p className="text-base font-bold text-gray-900">₹{selectedLoan.loanAmount.toLocaleString()}</p>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <p className="text-xs text-gray-500">Interest Rate</p>
                        <p className="text-sm font-medium text-gray-900">{selectedLoan.interestRate}% p.a.</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Penalty Rate</p>
                        <p className="text-sm font-medium text-gray-900">{selectedLoan.penaltyRate ?? 2}%/mo</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Tenure</p>
                        <p className="text-sm font-medium text-gray-900">{selectedLoan.tenure} Months</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-xs text-gray-500">Start Date</p>
                        <p className="text-sm font-medium text-gray-900">{new Date(selectedLoan.startDate).toLocaleDateString()}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">End/Due Date</p>
                        <p className="text-sm font-medium text-gray-900">{new Date(selectedLoan.endDate).toLocaleDateString()}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                    <Plus className="w-4 h-4 text-gray-400" />
                    Collateral (Gold) Details
                  </h4>
                  <div className="space-y-3 bg-gray-50 p-4 rounded-none border border-black/15">
                    <div>
                      <p className="text-xs text-gray-500">Gold Type / Purity</p>
                      <p className="text-sm font-medium text-gray-900">{selectedLoan.goldType}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Item Type</p>
                      <p className="text-sm font-medium text-gray-900">{selectedLoan.itemType}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Total Net Weight</p>
                      <p className="text-sm font-medium text-gray-900">{selectedLoan.goldWeight} grams</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Assessed Gold Value</p>
                      <p className="text-base font-bold text-gray-900">₹{selectedLoan.goldValue.toLocaleString()}</p>
                    </div>
                    {(selectedLoan.lockerNumber || selectedLoan.packetNumber) && (
                      <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-black/10">
                        {selectedLoan.lockerNumber && (
                          <div>
                            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Locker No</p>
                            <p className="text-sm font-bold text-gray-900">{selectedLoan.lockerNumber}</p>
                          </div>
                        )}
                        {selectedLoan.packetNumber && (
                          <div>
                            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Packet No</p>
                            <p className="text-sm font-bold text-gray-900">{selectedLoan.packetNumber}</p>
                          </div>
                        )}
                      </div>
                    )}
                    {selectedLoan.ornamentPhotoUrl && (
                      <div className="pt-3 space-y-2">
                        <p className="text-[10px] text-gray-500 uppercase tracking-wider">Ornament Photos</p>
                        <div className="flex flex-col gap-2">
                          {parseOrnamentPhotos(selectedLoan.ornamentPhotoUrl).map((photo, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => setShowOrnamentImage(photo.url)}
                              className="w-full flex items-center justify-center gap-2 bg-blue-50 hover:bg-blue-100 text-blue-700 py-2 border border-blue-200 rounded-none transition-colors text-sm font-semibold"
                            >
                              <Camera className="w-4 h-4" />
                              <span>View Photo {i + 1} ({photo.name})</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <h4 className="text-sm font-bold text-gray-900 mb-3 mt-6 flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-gray-400" />
                    Repayment Info
                  </h4>
                  {selectedLoan.repaymentScheme === 'BULLET' ? (
                    <div className="bg-yellow-50 p-4 rounded-none border border-black/15">
                      <p className="text-xs text-yellow-800">Dynamic Bullet Loan</p>
                      <p className="text-xl font-bold text-yellow-900">Simple Interest Accrual</p>
                    </div>
                  ) : (
                    <div className="bg-blue-50 p-4 rounded-none border border-black/15">
                      <p className="text-xs text-blue-800">Fixed Monthly EMI</p>
                      <p className="text-xl font-bold text-blue-900">₹{selectedLoan.emiAmount.toLocaleString()}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Bullet Loan Ledger integration */}
              {selectedLoan.repaymentScheme === 'BULLET' && (
                <BulletLoanLedger 
                  loan={selectedLoan} 
                  currentUser={currentUser} 
                  onRefresh={() => {
                    refreshLoans();
                  }}
                  onModalStateChange={setIsPaymentModalOpen}
                />
              )}

              {/* Ownership History */}
              {selectedLoanHistory.length > 0 && (
                <div className={`mt-8 pt-6 border-t border-black/15 ${isPaymentModalOpen ? 'hidden' : 'block'}`}>
                  <h4 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <History className="w-4 h-4 text-gray-400" />
                    Ownership & Transfer History
                  </h4>
                  <div className="space-y-3">
                    {selectedLoanHistory.map((transfer) => (
                      <div key={transfer.id} className="relative pl-6 before:absolute before:left-2 before:top-3 before:bottom-0 before:w-px before:bg-gray-200 last:before:hidden">
                        <div className="absolute left-0 top-2 w-4 h-4 bg-white border-2 border-black/15 rounded-full z-10" />
                        <div className="bg-gray-50 p-4 rounded-none border border-black/15">
                          <div className="flex items-center justify-between mb-2">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              transfer.status === 'approved' ? 'bg-green-100 text-green-700' :
                              transfer.status === 'rejected' ? 'bg-red-100 text-red-700' :
                              'bg-yellow-100 text-yellow-700'
                            }`}>
                              {transfer.status}
                            </span>
                            <span className="text-[10px] font-medium text-gray-400">{new Date(transfer.transferDate).toLocaleDateString()}</span>
                          </div>
                          <p className="text-xs font-bold text-gray-700">
                            Target Customer: <span className="text-blue-600">#{transfer.toCustomerId}</span>
                          </p>
                          <p className="text-[10px] text-gray-500 mt-1">
                            From {transfer.fromBranch} → To {transfer.toBranch}
                          </p>
                          {transfer.status === 'approved' && (
                            <p className="text-[9px] text-green-600 mt-2 italic font-medium">
                              Approved by {transfer.approvedByName}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>

            <div className={`px-6 py-4 border-t border-black/15 bg-gray-50/50 items-center justify-between gap-3 ${isPaymentModalOpen ? 'hidden' : 'flex'}`}>
              {selectedLoan.status === 'active' && (
                <button
                  onClick={() => {
                    setEarlyClosureLoan(selectedLoan);
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-none border border-black/15 text-sm font-semibold transition-colors shadow-sm"
                >
                  <TrendingDown className="w-4 h-4" />
                  Early Closure
                </button>
              )}
              <button
                onClick={() => setSelectedLoan(null)}
                className="ml-auto px-6 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-none border border-black/15 transition-colors text-sm font-medium"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}
      {earlyClosureLoan && (
        <EarlyClosureModal
          loan={earlyClosureLoan}
          onClose={() => setEarlyClosureLoan(null)}
          onClosed={handleEarlyClosure}
        />
      )}
      {transferLoan && (
        <LoanTransferModal
          loan={transferLoan}
          currentUser={currentUser}
          onClose={() => setTransferLoan(null)}
          onSuccess={() => {
            setTransferLoan(null);
            refreshLoans();
          }}
        />
      )}

      {/* Ornament Image Viewer Modal */}
      {showOrnamentImage && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4" onClick={() => setShowOrnamentImage(null)}>
          <div className="relative max-w-4xl w-full flex flex-col items-center justify-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-full flex justify-end mb-2">
              <button
                onClick={() => setShowOrnamentImage(null)}
                className="p-2 text-white hover:text-gray-300 transition-colors bg-black bg-opacity-60 rounded-full"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <img 
              src={showOrnamentImage} 
              alt="Gold Ornament" 
              className="w-full h-auto object-contain border-4 border-white shadow-2xl bg-white"
              style={{ maxHeight: '85vh' }}
            />
          </div>
        </div>
      )}

    </div>
  );
}
