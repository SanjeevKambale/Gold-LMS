import React, { useState } from 'react';
import { Search, CheckCircle, AlertCircle, Clock, Info, QrCode, FileText, Share2, Calendar, Percent } from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { EMI, User } from '../types';
import { getSmartEMIs, payEMI as dbPayEMI, getRemainingLoanBalance, calculateEMIPenalty, getEMIsByLoan, rebalanceLoan, getEMIsByPaymentId, getAllEMIs, computeAmortization } from '../lib/db/emiService';
import { getAllLoans } from '../lib/db/loanService';
import { PayEMIModal } from './PayEMIModal';
import { getSystemWorkingDate } from '../lib/workingDate';
import { EMIQRModal } from './EMIQRModal';
import { generateEMIReceipt } from '../lib/pdfReceipt';
import { logActivity } from '../lib/activityLogger';

interface EMIManagementProps {
  currentUser: User;
}

export function EMIManagement({ currentUser }: EMIManagementProps) {
  const [emis, setEmis] = useState<EMI[]>(() => {
    try { 
      const allEmis = getSmartEMIs(); 
      return allEmis.filter((e: EMI) => e.createdBy === currentUser.id);
    } catch { return []; }
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'paid' | 'overdue'>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedEMI, setSelectedEMI] = useState<EMI | null>(null);
  const [showPayModal, setShowPayModal] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);

  const refreshEMIs = () => { 
    try { 
      const allEmis = getSmartEMIs(); 
      setEmis(allEmis.filter((e: EMI) => e.createdBy === currentUser.id));
    } catch {} 
  };

  const filteredEMIs = emis.filter(emi => {
    const matchesSearch = emi.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         emi.loanId.includes(searchTerm);
    const matchesFilter = filterStatus === 'all' || emi.status === filterStatus;
    const matchesDateFrom = !dateFrom || emi.dueDate >= dateFrom;
    const matchesDateTo = !dateTo || emi.dueDate <= dateTo;
    return matchesSearch && matchesFilter && matchesDateFrom && matchesDateTo;
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'paid':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'overdue':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4 text-yellow-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'bg-green-100 text-green-800';
      case 'overdue':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-yellow-100 text-yellow-800';
    }
  };

  const getRunningBalance = (emi: EMI) => {
    try {
      const allLoans = getAllLoans();
      const loan = allLoans.find(l => l.id === emi.loanId);
      if (!loan) return 0;
      
      const schedule = computeAmortization(loan.loanAmount, loan.interestRate, loan.tenure);
      
      // EMI 1 should show the starting loan principal
      if (emi.emiNumber === 1) return loan.loanAmount;
      
      // Subsequent EMIs show the principal after the previous installment
      return schedule[emi.emiNumber - 2]?.outstandingPrincipal || 0;
    } catch {
      return 0;
    }
  };

  const handlePayEMI = (
    emiId: string,
    paidAmount: number,
    paymentMethod: string,
    transactionRef: string,
    penaltyAmount: number,
    paidDate: string,
    adjustmentMode?: 'tenure' | 'emi'
  ) => {
    const emi = emis.find(e => e.id === emiId);
    
    // 1. Record the payment
    dbPayEMI(emiId, paidAmount, paymentMethod, transactionRef, paidDate, penaltyAmount, !!adjustmentMode);
    
    // 2. If adjustment mode is selected, rebalance the loan
    if (emi && adjustmentMode) {
      // Calculate true excess: (paid - penalty - remaining due for this emi)
      const advanceCredit = (emi.paidAmount && emi.status !== 'paid') ? emi.paidAmount : 0;
      const trueExcess = paidAmount + advanceCredit - emi.amount - penaltyAmount;
      
      if (trueExcess > 0) {
        rebalanceLoan(emi.loanId, trueExcess, adjustmentMode, emi.emiNumber);
      }
    }

    refreshEMIs();
    
    // Log activity
    if (emi) {
      logActivity(
        currentUser,
        'emi_paid',
        `EMI payment received from ${emi.customerName}${adjustmentMode ? ` (${adjustmentMode === 'tenure' ? 'Tenure Reduced' : 'EMI Reduced'})` : ''}`,
        `Loan ID: ${emi.loanId}, EMI #${emi.emiNumber}, Amount: ₹${paidAmount.toLocaleString()}`
      );
    }
  };

  const allContextEmis = getAllEMIs().filter(e => e.createdBy === currentUser.id);
  const totalPendingCount = allContextEmis.filter(e => e.status === 'pending').length;
  const totalOverdueCount = allContextEmis.filter(e => e.status === 'overdue').length;
  const totalPaidCount = allContextEmis.filter(e => e.status === 'paid').length;
  const totalContextEmis = allContextEmis.length;

  const totalOverdueAmount = allContextEmis.filter(e => e.status === 'overdue').reduce((sum, emi) => sum + emi.amount, 0);
  const totalCollectedAmount = allContextEmis.filter(e => e.status === 'paid').reduce((sum, emi) => sum + (emi.paidAmount || 0), 0);
  const totalUpcomingCount = emis.filter(e => e.status === 'pending').length;

  const upcomingEMIs = emis
    .filter(e => e.status === 'pending')
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">EMI Tracking</h2>
      </div>

      {/* EMI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <div className="bg-white rounded-none border border-black/15 p-4 md:p-6 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col h-full">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs md:text-sm text-gray-500 font-medium">Upcoming EMIs</p>
              <p className="text-xl md:text-2xl font-bold text-gray-900 mt-1">
                {totalUpcomingCount}
              </p>
              <p className="text-[10px] md:text-xs text-gray-400 mt-1 flex items-center gap-1">
                <Info className="w-3 h-3" /> Next due per loan
              </p>
            </div>
            <div className="w-10 h-10 md:w-12 md:h-12 bg-yellow-100 rounded-none border border-black/15 flex items-center justify-center shadow-sm">
              <Clock className="w-5 h-5 md:w-6 md:h-6 text-yellow-500" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-none border border-black/15 p-4 md:p-6 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col h-full">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs md:text-sm text-gray-500 font-medium">Overdue EMIs</p>
              <p className="text-xl md:text-2xl font-bold text-gray-900 mt-1">
                {totalOverdueCount}
              </p>
              <p className="text-xs md:text-sm font-bold text-red-600 mt-1">₹{totalOverdueAmount.toLocaleString()}</p>
            </div>
            <div className="w-10 h-10 md:w-12 md:h-12 bg-red-100 rounded-none border border-black/15 flex items-center justify-center shadow-sm">
              <AlertCircle className="w-5 h-5 md:w-6 md:h-6 text-red-500" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-none border border-black/15 p-4 md:p-6 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col h-full">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs md:text-sm text-gray-500 font-medium">Paid EMIs</p>
              <p className="text-xl md:text-2xl font-bold text-gray-900 mt-1">
                {totalPaidCount}
              </p>
              <p className="text-xs md:text-sm font-bold text-green-600 mt-1">₹{totalCollectedAmount.toLocaleString()}</p>
            </div>
            <div className="w-10 h-10 md:w-12 md:h-12 bg-green-100 rounded-none border border-black/15 flex items-center justify-center shadow-sm">
              <CheckCircle className="w-5 h-5 md:w-6 md:h-6 text-green-500" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-none border border-black/15 p-4 md:p-6 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col h-full">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs md:text-sm text-gray-500 font-medium">Collection Rate</p>
              <p className="text-xl md:text-2xl font-bold text-gray-900 mt-1">
                {totalContextEmis > 0 ? ((totalPaidCount / totalContextEmis) * 100).toFixed(0) : 0}%
              </p>
            </div>
            <div className="w-10 h-10 md:w-12 md:h-12 bg-purple-100 rounded-none border border-black/15 flex items-center justify-center shadow-sm overflow-hidden text-purple-600">
              <Percent className="w-5 h-5 md:w-6 md:h-6" />
            </div>
          </div>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6 lg:items-start">
        {/* Current Month's Pending EMIs */}
        <div 
          style={{ alignSelf: 'start' }} 
          className="bg-white rounded-none border border-black/15 p-6 shadow-sm flex flex-col w-full hover:shadow-md transition-all duration-300"
        >
          <div className="flex items-center justify-between mb-4 flex-shrink-0">
            <h3 className="text-lg font-semibold text-gray-900">Current Month's EMIs</h3>
            <span className="text-[10px] font-bold text-yellow-600 bg-yellow-50 px-2 py-1 rounded-none border border-black/15 uppercase tracking-tighter">
              {new Date(getSystemWorkingDate()).toLocaleString('default', { month: 'short' })}
            </span>
          </div>
          
          {(() => {
            const now = new Date(getSystemWorkingDate());
            const currentMonth = now.getMonth();
            const currentYear = now.getFullYear();
            
            const currentMonthEmis = emis.filter((e: EMI) => {
              const dueDate = new Date(e.dueDate);
              return dueDate.getMonth() === currentMonth && 
                     dueDate.getFullYear() === currentYear;
            }).sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

            if (currentMonthEmis.length === 0) {
              return (
                <div className="flex flex-col items-center justify-center py-6 px-4 text-center border border-dashed border-black/15 rounded-none bg-gray-50/50">
                  <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-3">
                    <Calendar className="w-6 h-6 text-blue-500" />
                  </div>
                  <h4 className="text-sm font-semibold text-gray-900">All Collected!</h4>
                  <p className="text-xs text-gray-500 mt-1 max-w-[200px]">No pending EMIs found for the current month.</p>
                </div>
              );
            }

            return (
              <div className="space-y-3 overflow-y-auto pr-1">
                {currentMonthEmis.map((emi) => {
                  const dueDate = new Date(emi.dueDate);
                  const isOverdue = emi.status === 'overdue' || (emi.status === 'pending' && dueDate < new Date(getSystemWorkingDate()));
                  
                  return (
                    <div key={emi.id} className={`p-3 rounded-none border border-black/15 ${
                      emi.status === 'paid' ? 'bg-green-50 border-black/15' :
                      isOverdue ? 'bg-red-50 border-black/15' : 
                      'bg-gray-50 border-black/15'
                    }`}>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="font-medium text-gray-900 text-sm">{emi.customerName}</p>
                            {emi.status === 'paid' && <CheckCircle className="w-3 h-3 text-green-500" />}
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">EMI {emi.emiNumber}</p>
                          <div className="flex items-center gap-1.5 mt-1">
                            {emi.status === 'paid' ? (
                              <CheckCircle className="w-3 h-3 text-green-500" />
                            ) : (
                              <Clock className={`w-3 h-3 ${isOverdue ? 'text-red-500' : 'text-gray-400'}`} />
                            )}
                            <p className={`text-[10px] font-bold ${
                              emi.status === 'paid' ? 'text-green-600' :
                              isOverdue ? 'text-red-600' : 
                              'text-gray-500'
                            }`}>
                              {emi.status === 'paid' ? `Paid on ${new Date(emi.paidDate!).toLocaleDateString()}` : `Due: ${dueDate.toLocaleDateString()}`}
                            </p>
                          </div>
                        </div>
                        <p className={`text-sm font-bold ${
                          emi.status === 'paid' ? 'text-green-600' :
                          isOverdue ? 'text-red-600' : 
                          'text-gray-900'
                        }`}>
                          ₹{emi.amount.toLocaleString()}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>

        {/* EMI List */}
        <div className="lg:col-span-2 flex flex-col space-y-4">
          {/* Filters */}
          <div className="bg-white rounded-none border border-black/15 p-4 shadow-sm hover:shadow-md transition-all duration-300">
            <div className="flex flex-col gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by customer or loan ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 text-sm md:text-base border border-black/15 rounded-none border border-black/15 focus:ring-2 focus:ring-yellow-500 transition-all"
                />
              </div>
              <div className="flex gap-2 overflow-x-auto pb-2 -mx-2 px-2 scrollbar-hide">
                {['all', 'pending', 'overdue', 'paid'].map((status) => (
                  <button
                    key={status}
                    onClick={() => setFilterStatus(status as any)}
                    className={`px-4 py-2 rounded-none border border-black/15 capitalize transition-all text-xs md:text-sm font-bold whitespace-nowrap ${
                      filterStatus === status
                        ? 'bg-yellow-500 text-white border-black/15 shadow-md shadow-yellow-100'
                        : 'bg-white text-gray-600 border-black/15 hover:border-black/15 hover:bg-yellow-50/30'
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-black/5">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Due From</label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-black/15 bg-white focus:outline-none focus:ring-1 focus:ring-yellow-500 rounded-none"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Due To</label>
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-black/15 bg-white focus:outline-none focus:ring-1 focus:ring-yellow-500 rounded-none"
                    />
                    {(dateFrom || dateTo) && (
                      <button
                        type="button"
                        onClick={() => {
                          setDateFrom('');
                          setDateTo('');
                        }}
                        className="px-3 py-2 text-xs font-bold bg-gray-100 hover:bg-gray-200 border border-black/15 text-gray-700 transition-all rounded-none whitespace-nowrap"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* EMI List Table */}
          <div className="bg-white rounded-none border border-black/15 shadow-sm overflow-hidden flex-1 hover:shadow-md transition-all duration-300">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Customer</th>
                    <th className="text-left py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">EMI</th>
                    <th className="text-center py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Collected / Total</th>
                    <th className="text-center py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Remaining</th>
                    <th className="text-center py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Penalty</th>
                    <th className="text-center py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="text-center py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredEMIs.map((emi) => (
                    <tr key={emi.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="py-4 px-6">
                        <div>
                          <p className="text-sm font-bold text-gray-900">{emi.customerName}</p>
                          <p className="text-xs text-gray-500 font-mono">Loan {emi.loanId}</p>
                          {emi.status === 'paid' && (
                            <p className="text-[10px] text-green-600 font-semibold font-mono mt-0.5">
                              Receipt: REC-EMI-{emi.paymentId ? emi.paymentId.replace('pay_', '').toUpperCase() : `${emi.loanId.slice(-6)}-${emi.emiNumber}`}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <p className="text-sm font-bold text-gray-900">EMI {emi.emiNumber}</p>
                      </td>
                      <td className="py-4 px-6 text-center">
                        <p className="text-sm font-bold text-gray-900">
                          {emi.paidAmount !== undefined && emi.paidAmount > 0 ? (
                            <>
                              <span className={(emi.paidAmount < emi.amount && emi.status === 'paid') ? 'text-orange-600' : emi.status === 'paid' ? 'text-green-600' : 'text-blue-600'}>
                                ₹{emi.paidAmount.toLocaleString()}
                              </span>
                              <span className="text-gray-400 font-normal"> / ₹{emi.amount.toLocaleString()}</span>
                            </>
                          ) : (
                            `₹${emi.amount.toLocaleString()}`
                          )}
                        </p>
                        {emi.paidAmount !== undefined && emi.paidAmount > 0 && emi.paidAmount < emi.amount && (
                          <p className="text-[10px] font-black text-orange-500 mt-0.5">
                            Bal: ₹{(emi.amount - emi.paidAmount).toLocaleString()}
                          </p>
                        )}
                      </td>
                      <td className="py-4 px-6 text-center">
                        <p className="text-sm font-bold text-gray-900">
                          ₹{getRunningBalance(emi).toLocaleString()}
                        </p>
                      </td>
                      <td className="py-4 px-6 text-center">
                        {emi.status === 'overdue' ? (
                          <p className="text-sm font-black text-red-600">₹{calculateEMIPenalty(emi).toLocaleString()}</p>
                        ) : (
                          <p className="text-sm text-gray-400">-</p>
                        )}
                      </td>
                      <td className="py-4 px-6 text-center">
                        <span className={`inline-flex items-center px-4 py-1 rounded-full text-[10px] font-bold tracking-wide border border-current ${getStatusColor(emi.status)}`}>
                          {emi.status}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {(emi.status === 'pending' || emi.status === 'overdue') && (
                            <>
                              <button
                                onClick={() => {
                                  setSelectedEMI(emi);
                                  setShowPayModal(true);
                                }}
                                className="px-4 py-1.5 bg-green-500 text-white text-xs font-bold rounded-none border border-black/15 hover:bg-green-600 transition-all active:scale-95 shadow-sm shadow-green-100"
                              >
                                Pay
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedEMI(emi);
                                  setShowQRModal(true);
                                }}
                                className="p-2 text-yellow-600 bg-yellow-50 hover:bg-yellow-100 rounded-none border border-black/15 transition-all active:scale-95"
                              >
                                <QrCode className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          {emi.status === 'paid' && (
                            <button
                              onClick={() => {
                                const allEmisForLoan = getEMIsByLoan(emi.loanId);
                                
                                // Fetch related EMIs if part of a group payment
                                let relatedEmis = [emi];
                                if (emi.paymentId) {
                                  relatedEmis = getEMIsByPaymentId(emi.paymentId);
                                }
                                
                                const totalPaidAmount = relatedEmis.reduce((sum, e) => sum + (e.paidAmount || 0), 0);
                                const coveredEMIs = relatedEmis.map(e => e.emiNumber);

                                generateEMIReceipt({
                                  loanId: emi.loanId,
                                  customerName: emi.customerName,
                                  emiNumber: emi.emiNumber,
                                  emiAmount: emi.amount,
                                  penaltyAmount: calculateEMIPenalty(emi),
                                  paidAmount: emi.paidAmount || emi.amount,
                                  totalPaidAmount,
                                  coveredEMIs,
                                  paymentMethod: emi.paymentMethod || 'cash',
                                  transactionRef: emi.transactionRef || '',
                                  dueDate: emi.dueDate,
                                  paidDate: emi.paidDate || emi.dueDate,
                                  remainingBalance: getRemainingLoanBalance(emi.loanId),
                                  totalEMIs: allEmisForLoan.length,
                                  paidEMIsCount: allEmisForLoan.filter(e => e.status === 'paid').length,
                                  paymentId: emi.paymentId,
                                  penaltyRate: emi.penaltyRate,
                                });
                              }}
                              className="p-2 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-none border border-black/15 transition-all active:scale-95"
                            >
                              <FileText className="w-4 h-4" />
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

          {/* EMI List - Mobile Card View - REMOVED */}
          <div className="hidden space-y-4">
            {filteredEMIs.length === 0 ? (
              <div className="bg-white rounded-none border border-black/15 p-10 text-center border-2 border-dashed border-black/15">
                <Search className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">No EMIs found.</p>
              </div>
            ) : (
              filteredEMIs.map((emi) => (
                <div 
                  key={emi.id} 
                  className="bg-white rounded-none border border-black/15 shadow-sm overflow-hidden hover:shadow-md transition-all duration-300 w-fit"
                >
                  <div className="p-4 flex items-center flex-nowrap overflow-x-auto no-scrollbar">
                    {/* Customer Info */}
                    <div className="flex items-center gap-3 min-w-[140px] flex-shrink-0">
                      <div className="w-9 h-9 rounded-none border border-black/15 bg-blue-50 flex items-center justify-center">
                        <FileText className="w-5 h-5 text-blue-600" />
                      </div>
                      <div className="truncate pr-16 md:pr-24">
                        <p className="text-xs font-bold text-gray-400 font-mono">Loan #{emi.loanId.slice(-6)}</p>
                        <h3 className="text-base font-black text-gray-900 leading-tight truncate">{emi.customerName}</h3>
                      </div>
                    </div>

                    {/* EMI Details */}
                    <div className="flex items-center flex-shrink-0 border-x border-black/15 px-12 whitespace-nowrap mr-16 md:mr-24">
                      <div className="text-center min-w-[80px] mr-16">
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">EMI</p>
                        <p className="text-base font-black text-gray-900">{emi.emiNumber}</p>
                      </div>
                      <div className="text-center min-w-[120px]">
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Amount</p>
                        <p className="text-base font-black text-yellow-600">₹{emi.amount.toLocaleString()}</p>
                      </div>
                    </div>

                    {/* Status */}
                    <div className={`flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest border ${getStatusColor(emi.status)} shadow-sm mr-16`}>
                      {emi.status}
                    </div>
                    <div className="flex items-center gap-3 border-l border-black/15 pl-6 flex-shrink-0">
                      {(emi.status === 'pending' || emi.status === 'overdue') ? (
                        <>
                          <button
                            onClick={() => {
                              setSelectedEMI(emi);
                              setShowPayModal(true);
                            }}
                            className="px-6 py-2.5 bg-green-500 text-white font-black text-[10px] uppercase tracking-widest rounded-none border border-black/15 hover:bg-green-600 transition-colors shadow-sm shadow-green-100"
                          >
                            Pay Now
                          </button>
                          <button
                            onClick={() => {
                              setSelectedEMI(emi);
                              setShowQRModal(true);
                            }}
                            className="w-10 h-10 flex items-center justify-center text-yellow-600 bg-yellow-50 rounded-none border border-black/15 hover:bg-yellow-100 transition-colors border border-black/15"
                          >
                            <QrCode className="w-5 h-5" />
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => {
                            const allEmisForLoan = getEMIsByLoan(emi.loanId);
                            
                            // Fetch related EMIs if part of a group payment
                            let relatedEmis = [emi];
                            if (emi.paymentId) {
                              relatedEmis = getEMIsByPaymentId(emi.paymentId);
                            }
                            
                            const totalPaidAmount = relatedEmis.reduce((sum, e) => sum + (e.paidAmount || 0), 0);
                            const coveredEMIs = relatedEmis.map(e => e.emiNumber);

                            generateEMIReceipt({
                              loanId: emi.loanId,
                              customerName: emi.customerName,
                              emiNumber: emi.emiNumber,
                              emiAmount: emi.amount,
                              penaltyAmount: calculateEMIPenalty(emi),
                              paidAmount: emi.paidAmount || emi.amount,
                              totalPaidAmount,
                              coveredEMIs,
                              paymentMethod: emi.paymentMethod || 'cash',
                              transactionRef: emi.transactionRef || '',
                              dueDate: emi.dueDate,
                              paidDate: emi.paidDate || emi.dueDate,
                              remainingBalance: getRemainingLoanBalance(emi.loanId),
                              totalEMIs: allEmisForLoan.length,
                              paidEMIsCount: allEmisForLoan.filter(e => e.status === 'paid').length,
                              paymentId: emi.paymentId,
                              penaltyRate: emi.penaltyRate,
                            });
                          }}
                          className="px-5 py-2.5 bg-blue-50 text-blue-600 font-black text-[10px] uppercase tracking-widest rounded-none border border-black/15 hover:bg-blue-100 transition-colors border border-black/15"
                        >
                          Receipt
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      {showPayModal && selectedEMI && (
        <PayEMIModal
          emi={selectedEMI as EMI}
          onClose={() => {
            setShowPayModal(false);
            refreshEMIs(); // Refresh in case payment was made but modal closed without HMR
          }}
          onPay={handlePayEMI}
        />
      )}

      {showQRModal && selectedEMI && (
        <EMIQRModal
          emi={selectedEMI as EMI}
          onClose={() => setShowQRModal(false)}
        />
      )}
      </div>
    </div>
  );
}
