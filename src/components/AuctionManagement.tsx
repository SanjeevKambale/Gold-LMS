import { useState, useEffect } from 'react';
import { 
  Gavel, 
  Search, 
  ShieldAlert, 
  CheckCircle, 
  TrendingUp, 
  TrendingDown, 
  Printer, 
  Scale,
  Calendar
} from 'lucide-react';
import { Loan, Payment, User } from '../types';
import { getAllLoans } from '../lib/db/loanService';
import { getAllPayments } from '../lib/db/paymentService';
import { generateAuctionReceipt } from '../lib/pdfReceipt';
import { OverdueSettlementModal } from './OverdueSettlementModal';
import { getEMIsByLoan, calculateEMIPenalty, getRemainingLoanBalance } from '../lib/db/emiService';
import { calculateBulletLoanBalances } from '../lib/db/loanCalculationService';
import { getSystemWorkingDate } from '../lib/workingDate';
import { logActivity } from '../lib/activityLogger';

interface AuctionManagementProps {
  currentUser: User;
}

interface AuctionMetadata {
  originalRef: string;
  salePrice: number;
  fees: number;
  surplus: number;
  deficit: number;
}

export function AuctionManagement({ currentUser }: AuctionManagementProps) {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [activeSubTab, setActiveSubTab] = useState<'eligible' | 'history'>('eligible');
  const [searchTerm, setSearchTerm] = useState('');
  const [settlementLoan, setSettlementLoan] = useState<Loan | null>(null);

  // Load database entities
  const loadData = () => {
    try {
      setLoans(getAllLoans());
      setPayments(getAllPayments());
    } catch (err) {
      console.error('Failed to load loans/payments inside AuctionManagement:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const isAdmin = currentUser.role === 'admin';

  // Helper parser for serialized transactionRef containing auction metadata
  const parseAuctionRef = (transactionRef?: string): AuctionMetadata => {
    const defaultMeta: AuctionMetadata = {
      originalRef: transactionRef || '',
      salePrice: 0,
      fees: 0,
      surplus: 0,
      deficit: 0
    };

    if (!transactionRef) return defaultMeta;

    // Regex pattern: "Ref (Auction: Sale=50000, Fees=1000, Surplus=2000, Deficit=0)"
    const regex = /(.*?)\s*\(Auction:\s*Sale=([\d.]+),\s*Fees=([\d.]+),\s*Surplus=([\d.]+),\s*Deficit=([\d.]+)\)/i;
    const match = transactionRef.match(regex);

    if (match) {
      return {
        originalRef: match[1].trim(),
        salePrice: parseFloat(match[2]) || 0,
        fees: parseFloat(match[3]) || 0,
        surplus: parseFloat(match[4]) || 0,
        deficit: parseFloat(match[5]) || 0
      };
    }

    return defaultMeta;
  };

  // Filter lists
  const eligibleLoans = loans.filter(loan => {
    const isEligible = loan.status === 'defaulted' || loan.status === 'overdue';
    const matchesSearch = loan.customerName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          loan.id.toLowerCase().includes(searchTerm.toLowerCase());
    return isEligible && matchesSearch;
  });

  const auctionedLoans = loans.filter(loan => {
    const isAuctioned = loan.status === 'auctioned';
    const matchesSearch = loan.customerName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          loan.id.toLowerCase().includes(searchTerm.toLowerCase());
    return isAuctioned && matchesSearch;
  });

  // Calculate stats based on auctioned loans
  let totalAuctionedCount = 0;
  let totalRecoveredAmount = 0;
  let totalSurplusAmount = 0;
  let totalDeficitAmount = 0;
  let totalGoldWeightAuctioned = 0;

  loans.forEach(loan => {
    if (loan.status === 'auctioned') {
      totalAuctionedCount++;
      totalGoldWeightAuctioned += loan.goldWeight;
      const payment = payments.find(p => p.loanId === loan.id && p.id.startsWith('pay_auc_'));
      if (payment) {
        totalRecoveredAmount += payment.amount;
        const meta = parseAuctionRef(payment.transactionRef);
        totalSurplusAmount += meta.surplus;
        totalDeficitAmount += meta.deficit;
      }
    }
  });

  // Calculate live outstanding dues for an eligible loan
  const getOutstandingDues = (loan: Loan) => {
    if (loan.repaymentScheme === 'BULLET') {
      const balances = calculateBulletLoanBalances(loan, getSystemWorkingDate());
      const penalty = balances.isOverdue ? Math.round(balances.remainingPrincipal * (loan.penaltyRate ?? 2) / 100 * Math.ceil(balances.overdueDays / 30)) : 0;
      return {
        principal: balances.remainingPrincipal,
        interest: balances.unpaidInterest,
        penalty,
        total: balances.remainingPrincipal + balances.unpaidInterest + penalty
      };
    } else {
      const principal = getRemainingLoanBalance(loan.id);
      const allEmis = getEMIsByLoan(loan.id);
      const unpaidEmis = allEmis.filter(e => e.status === 'pending' || e.status === 'overdue');
      let interest = 0;
      let penalty = 0;
      unpaidEmis.forEach(emi => {
        interest += emi.amount;
        penalty += calculateEMIPenalty(emi);
      });
      return {
        principal,
        interest,
        penalty,
        total: principal + interest + penalty
      };
    }
  };

  const handlePrintReceipt = (loan: Loan) => {
    const payment = payments.find(p => p.loanId === loan.id && p.id.startsWith('pay_auc_'));
    if (!payment) {
      alert('Could not find recovery payment record for this auction.');
      return;
    }
    const meta = parseAuctionRef(payment.transactionRef);
    generateAuctionReceipt({
      loan,
      auctionAmount: meta.salePrice,
      auctionFees: meta.fees,
      principalRecovered: payment.principalComponent,
      interestRecovered: payment.interestComponent,
      penaltyRecovered: payment.penaltyComponent,
      surplusReturned: meta.surplus,
      deficitWrittenOff: meta.deficit,
      paymentMethod: payment.paymentMethod || 'bank_transfer',
      transactionRef: meta.originalRef,
      auctionDate: payment.paymentDate,
      paymentId: payment.id
    });
  };

  return (
    <div className="space-y-4 md:space-y-6">
      
      {/* Title Header */}
      <div>
        <h2 className="text-xl md:text-2xl font-semibold text-gray-900 flex items-center gap-2">
          Collateral Auction Management
        </h2>
        <p className="text-sm text-gray-500 mt-1">Settle outstanding defaulted loans via public auctions</p>
      </div>

      {/* Consistent Stats Grid */}
      <div className="dashboard-stats-grid">
        
        {/* Stat 1: Total Auctioned */}
        <div className="app-card flex flex-col h-full">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-xs md:text-sm text-gray-500 mb-1 font-medium">Total Auctioned Items</p>
              <p className="text-2xl md:text-3xl font-bold text-gray-900 mb-1">{totalAuctionedCount}</p>
              <p className="text-xs md:text-sm text-gray-400 font-medium">Weight: {totalGoldWeightAuctioned.toFixed(1)}g</p>
            </div>
            <div className="bg-yellow-500 w-10 h-10 md:w-12 md:h-12 rounded-none border border-black/15 flex items-center justify-center flex-shrink-0 text-white">
              <Gavel className="w-5 h-5 md:w-6 md:h-6" />
            </div>
          </div>
        </div>

        {/* Stat 2: Total Recovered */}
        <div className="app-card flex flex-col h-full">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-xs md:text-sm text-gray-500 mb-1 font-medium">Total Recovered Amount</p>
              <p className="text-2xl md:text-3xl font-bold text-green-600 mb-1">₹{totalRecoveredAmount.toLocaleString('en-IN')}</p>
              <p className="text-xs md:text-sm text-gray-400 font-medium">Principal, interest & penalty</p>
            </div>
            <div className="bg-green-500 w-10 h-10 md:w-12 md:h-12 rounded-none border border-black/15 flex items-center justify-center flex-shrink-0 text-white">
              <TrendingUp className="w-5 h-5 md:w-6 md:h-6" />
            </div>
          </div>
        </div>

        {/* Stat 3: Surplus Returned */}
        <div className="app-card flex flex-col h-full">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-xs md:text-sm text-gray-500 mb-1 font-medium">Surplus Returned</p>
              <p className="text-2xl md:text-3xl font-bold text-blue-600 mb-1">₹{totalSurplusAmount.toLocaleString('en-IN')}</p>
              <p className="text-xs md:text-sm text-gray-400 font-medium">Returned to customers</p>
            </div>
            <div className="bg-blue-500 w-10 h-10 md:w-12 md:h-12 rounded-none border border-black/15 flex items-center justify-center flex-shrink-0 text-white">
              <Scale className="w-5 h-5 md:w-6 md:h-6" />
            </div>
          </div>
        </div>

        {/* Stat 4: Deficits Written-off */}
        <div className="app-card flex flex-col h-full">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-xs md:text-sm text-gray-500 mb-1 font-medium">Deficits Written-off</p>
              <p className="text-2xl md:text-3xl font-bold text-red-600 mb-1">₹{totalDeficitAmount.toLocaleString('en-IN')}</p>
              <p className="text-xs md:text-sm text-gray-400 font-medium">Deficit written-off</p>
            </div>
            <div className="bg-red-600 w-10 h-10 md:w-12 md:h-12 rounded-none border border-black/15 flex items-center justify-center flex-shrink-0 text-white">
              <TrendingDown className="w-5 h-5 md:w-6 md:h-6" />
            </div>
          </div>
        </div>

      </div>

      {/* Tabs & Search controls - Bordered Brutalism Theme */}
      <div className="bg-white rounded-none border border-black/15 p-4 md:p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          
          {/* Brutalist Sub Tabs Selector */}
          <div className="flex flex-wrap gap-2 shrink-0">
            <button
              onClick={() => setActiveSubTab('eligible')}
              className={`px-4 py-2.5 border capitalize transition-all text-xs md:text-sm font-bold whitespace-nowrap flex items-center gap-2 !rounded-lg shrink-0 ${
                activeSubTab === 'eligible'
                  ? 'bg-yellow-500 text-white border-black/15 shadow-md shadow-yellow-100'
                  : 'bg-white text-gray-600 border-black/15 hover:bg-yellow-50/30'
              }`}
            >
              <ShieldAlert className="w-4 h-4 text-current" />
              Eligible for Auction ({eligibleLoans.length})
            </button>
            <button
              onClick={() => setActiveSubTab('history')}
              className={`px-4 py-2.5 border capitalize transition-all text-xs md:text-sm font-bold whitespace-nowrap flex items-center gap-2 !rounded-lg shrink-0 ${
                activeSubTab === 'history'
                  ? 'bg-yellow-500 text-white border-black/15 shadow-md shadow-yellow-100'
                  : 'bg-white text-gray-600 border-black/15 hover:bg-yellow-50/30'
              }`}
            >
              <CheckCircle className="w-4 h-4 text-current" />
              Auctioned History ({auctionedLoans.length})
            </button>
          </div>

          {/* Brutalist Search Box */}
          <div className="relative w-full sm:w-72 shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by customer or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-sm border border-black/15 rounded-none focus:ring-2 focus:ring-yellow-500 focus:border-transparent transition-all outline-none bg-white font-medium"
            />
          </div>

        </div>
      </div>

      {/* Main Table Container */}
      <div className="bg-white rounded-none border border-black/15 shadow-sm overflow-hidden hover:shadow-md transition-all duration-300">
        
        {activeSubTab === 'eligible' ? (
          <div className="overflow-x-auto">
            {eligibleLoans.length > 0 ? (
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr className="border-b border-black/15">
                    <th className="text-left py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Loan Details</th>
                    <th className="text-left py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Customer</th>
                    <th className="text-left py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Collateral Gold</th>
                    <th className="text-left py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Outstanding Balances</th>
                    <th className="text-left py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="text-center py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {eligibleLoans.map((loan) => {
                    const dues = getOutstandingDues(loan);
                    return (
                      <tr key={loan.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="py-4 px-6">
                          <p className="font-bold text-sm text-gray-900 font-mono">#{loan.id.slice(-6)}</p>
                          <p className="text-[10px] text-gray-400 font-mono">REC-LN-{loan.id}</p>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className="text-[9px] px-1.5 py-0.5 bg-yellow-50 text-yellow-700 font-bold border border-yellow-200 uppercase tracking-wider rounded-none">
                              {loan.repaymentScheme}
                            </span>
                          </div>
                        </td>
                        <td className="py-4 px-6">
                          <p className="text-sm font-semibold text-gray-900">{loan.customerName}</p>
                          <p className="text-[10px] text-gray-400 font-mono">Cust ID: {loan.customerId}</p>
                        </td>
                        <td className="py-4 px-6">
                          <p className="text-sm font-bold text-gray-900">{loan.goldWeight}g ({loan.goldType})</p>
                          <p className="text-xs text-blue-600 font-medium truncate max-w-[120px]" title={loan.itemType}>{loan.itemType}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">Value: ₹{loan.goldValue.toLocaleString('en-IN')}</p>
                        </td>
                        <td className="py-4 px-6 font-mono">
                          <p className="text-sm font-bold text-red-600">₹{dues.total.toLocaleString('en-IN')}</p>
                          <p className="text-[10px] text-gray-500">Pr: ₹{dues.principal.toLocaleString('en-IN')} | Int: ₹{dues.interest.toLocaleString('en-IN')}</p>
                          {dues.penalty > 0 && <p className="text-[9px] text-red-500 font-medium">Pen: ₹{dues.penalty.toLocaleString('en-IN')}</p>}
                        </td>
                        <td className="py-4 px-6">
                          <span className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                            loan.status === 'defaulted' 
                              ? 'bg-red-50 text-red-700 border-red-200' 
                              : 'bg-yellow-50 text-yellow-800 border-yellow-200'
                          }`}>
                            {loan.status}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-center">
                          {isAdmin ? (
                            <button
                              onClick={() => setSettlementLoan(loan)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-none border border-black/15 hover:bg-red-700 font-bold text-xs transition-all hover:scale-105 shadow-sm"
                            >
                              <Gavel className="w-3.5 h-3.5" />
                              Run Auction
                            </button>
                          ) : (
                            <span 
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-400 rounded-none border border-black/10 font-bold text-xs cursor-not-allowed opacity-60"
                              title="Administrator access required to execute auction"
                            >
                              <Gavel className="w-3.5 h-3.5 text-gray-300" />
                              Admin Only
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="flex flex-col items-center justify-center min-h-[350px] p-6 text-center space-y-4">
                <div className="w-16 h-16 bg-gray-50 text-gray-400 border border-black/5 rounded-full flex items-center justify-center mx-auto shadow-inner">
                  <CheckCircle className="w-8 h-8 text-green-500" />
                </div>
                <div className="space-y-1">
                  <h4 className="font-bold text-gray-900 text-lg">No Eligible Items for Auction</h4>
                  <p className="text-sm text-gray-500 max-w-sm mx-auto">All active gold loans are performing correctly. There are currently no defaulted or overdue loans awaiting auction.</p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            {auctionedLoans.length > 0 ? (
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr className="border-b border-black/15">
                    <th className="text-left py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Loan Details</th>
                    <th className="text-left py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Customer</th>
                    <th className="text-left py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Auction Valuation</th>
                    <th className="text-left py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Debt Recovery</th>
                    <th className="text-left py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Surplus / Deficit</th>
                    <th className="text-center py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Print Record</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {auctionedLoans.map((loan) => {
                    const payment = payments.find(p => p.loanId === loan.id && p.id.startsWith('pay_auc_'));
                    const meta = payment ? parseAuctionRef(payment.transactionRef) : null;
                    return (
                      <tr key={loan.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="py-4 px-6">
                          <p className="font-bold text-sm text-gray-900 font-mono">#{loan.id.slice(-6)}</p>
                          <p className="text-[10px] text-gray-400 font-mono">REC-LN-{loan.id}</p>
                          {payment && (
                            <p className="text-[10px] text-gray-500 flex items-center gap-1 mt-1">
                              <Calendar className="w-3 h-3 text-gray-400" />
                              {new Date(payment.paymentDate).toLocaleDateString()}
                            </p>
                          )}
                        </td>
                        <td className="py-4 px-6">
                          <p className="text-sm font-semibold text-gray-900">{loan.customerName}</p>
                          <p className="text-[10px] text-gray-400 font-mono">Collateral: {loan.goldWeight}g {loan.goldType}</p>
                        </td>
                        <td className="py-4 px-6 font-mono">
                          {meta ? (
                            <>
                              <p className="text-sm font-bold text-gray-900">₹{meta.salePrice.toLocaleString('en-IN')}</p>
                              <p className="text-[10px] text-gray-500">Fees: ₹{meta.fees.toLocaleString('en-IN')}</p>
                              <p className="text-[10px] text-blue-600 font-bold mt-0.5">Net: ₹{(meta.salePrice - meta.fees).toLocaleString('en-IN')}</p>
                            </>
                          ) : (
                            <p className="text-xs text-gray-400 italic">No auction meta found</p>
                          )}
                        </td>
                        <td className="py-4 px-6 font-mono">
                          {payment ? (
                            <>
                              <p className="text-sm font-bold text-green-600">₹{payment.amount.toLocaleString('en-IN')}</p>
                              <p className="text-[10px] text-gray-500">Pr: ₹{payment.principalComponent.toLocaleString('en-IN')} | Int: ₹{payment.interestComponent.toLocaleString('en-IN')}</p>
                              {payment.penaltyComponent > 0 && (
                                <p className="text-[9px] text-red-500 font-medium">Pen: ₹{payment.penaltyComponent.toLocaleString('en-IN')}</p>
                              )}
                            </>
                          ) : (
                            <p className="text-xs text-gray-400 italic">No recovery details</p>
                          )}
                        </td>
                        <td className="py-4 px-6">
                          {meta ? (
                            meta.surplus > 0 ? (
                              <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-50 text-green-700 border border-green-200 text-xs font-bold font-mono rounded-none">
                                +₹{meta.surplus.toLocaleString('en-IN')} (Surplus)
                              </span>
                            ) : meta.deficit > 0 ? (
                              <span className="inline-flex items-center gap-1 px-3 py-1 bg-red-50 text-red-700 border border-red-200 text-xs font-bold font-mono rounded-none">
                                -₹{meta.deficit.toLocaleString('en-IN')} (Deficit)
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-3 py-1 bg-gray-50 text-gray-500 border border-gray-200 text-xs font-bold font-mono rounded-none">
                                Balanced
                              </span>
                            )
                          ) : (
                            <p className="text-xs text-gray-400">—</p>
                          )}
                        </td>
                        <td className="py-4 px-6 text-center">
                          <button
                            onClick={() => handlePrintReceipt(loan)}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-none border border-black/15 transition-all hover:scale-110"
                            title="Print Auction Report"
                          >
                            <Printer className="w-5 h-5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="flex flex-col items-center justify-center min-h-[350px] p-6 text-center space-y-4">
                <div className="w-16 h-16 bg-gray-50 text-gray-400 border border-black/5 rounded-full flex items-center justify-center mx-auto shadow-inner">
                  <Gavel className="w-8 h-8 text-gray-400" />
                </div>
                <div className="space-y-1">
                  <h4 className="font-bold text-gray-900 text-lg">No Auction History Found</h4>
                  <p className="text-sm text-gray-500 max-w-sm mx-auto">There are no completed gold auctions recorded in the database yet.</p>
                </div>
              </div>
            )}
          </div>
        )}

      </div>

      {/* OverdueSettlementModal mount */}
      {settlementLoan && (
        <OverdueSettlementModal
          loan={settlementLoan}
          currentUser={currentUser}
          initialMode="auction"
          onClose={() => setSettlementLoan(null)}
          onSuccess={() => {
            setSettlementLoan(null);
            loadData(); // reload
            
            // Trigger system-wide reload notification/activity log sync
            logActivity(
              currentUser,
              'loan_transfer_cleared' as any,
              `Refreshed loan list on auction completion for ${settlementLoan.customerName}`
            );
          }}
          onInitiateRenewalLoanCreation={() => {}} // not needed in auction mode
        />
      )}

    </div>
  );
}
