import { useState, useEffect } from 'react';
import { X, RefreshCw, Scale, ShieldAlert, ArrowRight, Banknote, Calendar, CreditCard, CheckCircle } from 'lucide-react';
import { Loan, User, GoldRate, Payment } from '../types';
import { renewLoan, settleNetPurchase, recordAuctionSale } from '../lib/db/loanService';
import { getAllGoldRates } from '../lib/db/goldRateService';
import { calculateBulletLoanBalances } from '../lib/db/loanCalculationService';
import { getEMIsByLoan, calculateEMIPenalty, getRemainingLoanBalance } from '../lib/db/emiService';
import { getSystemWorkingDate } from '../lib/workingDate';
import { logActivity } from '../lib/activityLogger';

interface OverdueSettlementModalProps {
  loan: Loan;
  currentUser: User;
  onClose: () => void;
  onSuccess: () => void;
  onInitiateRenewalLoanCreation: (renewalTemplate: Partial<Loan>) => void;
  initialMode?: WorkflowMode;
}

type WorkflowMode = 'select' | 'renewal' | 'net_purchase' | 'auction' | 'success';

export function OverdueSettlementModal({
  loan,
  currentUser,
  onClose,
  onSuccess,
  onInitiateRenewalLoanCreation,
  initialMode = 'select'
}: OverdueSettlementModalProps) {
  const [mode, setMode] = useState<WorkflowMode>(initialMode);
  const [successMsg, setSuccessMsg] = useState('');
  
  // Form common fields
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [transactionRef, setTransactionRef] = useState('');
  const [processingDate, setProcessingDate] = useState(() => getSystemWorkingDate());
  const [isLoading, setIsLoading] = useState(false);

  // Gold rates data
  const [goldRates, setGoldRates] = useState<GoldRate[]>([]);
  const [selectedRatePerGram, setSelectedRatePerGram] = useState<number>(0);

  // Financial calculations
  const [outstandingPrincipal, setOutstandingPrincipal] = useState(0);
  const [outstandingInterest, setOutstandingInterest] = useState(0);
  const [outstandingPenalty, setOutstandingPenalty] = useState(0);
  const [totalDebt, setTotalDebt] = useState(0);

  // Renewal specific
  const [renewalAmount, setRenewalAmount] = useState(0);

  // Net Purchase specific
  const [goldRateInput, setGoldRateInput] = useState<string>('');
  const [netPayout, setNetPayout] = useState(0);

  // Auction specific
  const [auctionSalePrice, setAuctionSalePrice] = useState<string>('');
  const [auctionFees, setAuctionFees] = useState<string>('0');
  const [auctionPrincipalRec, setAuctionPrincipalRec] = useState(0);
  const [auctionInterestRec, setAuctionInterestRec] = useState(0);
  const [auctionPenaltyRec, setAuctionPenaltyRec] = useState(0);
  const [auctionSurplus, setAuctionSurplus] = useState(0);
  const [auctionDeficit, setAuctionDeficit] = useState(0);

  const isAdmin = currentUser.role === 'admin';

  // Load calculations and gold rates on startup
  useEffect(() => {
    // 1. Fetch live gold rates
    const rates = getAllGoldRates();
    setGoldRates(rates);
    const matchingRate = rates.find(r => r.goldType === loan.goldType);
    if (matchingRate) {
      setSelectedRatePerGram(matchingRate.ratePerGram);
      setGoldRateInput(matchingRate.ratePerGram.toString());
    }

    // 2. Perform outstanding debt calculations
    if (loan.repaymentScheme === 'BULLET') {
      const bulletBalances = calculateBulletLoanBalances(loan, getSystemWorkingDate());
      setOutstandingPrincipal(bulletBalances.remainingPrincipal);
      setOutstandingInterest(bulletBalances.unpaidInterest);
      // Bullet loans accumulate simple penalties if overdue
      const penalty = bulletBalances.isOverdue ? Math.round(bulletBalances.remainingPrincipal * (loan.penaltyRate ?? 2) / 100 * Math.ceil(bulletBalances.overdueDays / 30)) : 0;
      setOutstandingPenalty(penalty);
      const debt = bulletBalances.remainingPrincipal + bulletBalances.unpaidInterest + penalty;
      setTotalDebt(debt);
      setRenewalAmount(bulletBalances.unpaidInterest + penalty);
    } else {
      // EMI Loan
      const remainingPrincipal = getRemainingLoanBalance(loan.id);
      setOutstandingPrincipal(remainingPrincipal);

      const allEmis = getEMIsByLoan(loan.id);
      const unpaidEmis = allEmis.filter(e => e.status === 'pending' || e.status === 'overdue');
      
      let interestDue = 0;
      let penaltyDue = 0;
      
      unpaidEmis.forEach(emi => {
        // Calculate accrued interest component for unpaid EMIs based on original amortization
        // (Using standard emiAmount - principalPaid, or simply emiAmount as total due interest if it's interest-focused)
        interestDue += emi.amount;
        penaltyDue += calculateEMIPenalty(emi);
      });

      setOutstandingInterest(interestDue);
      setOutstandingPenalty(penaltyDue);
      const debt = remainingPrincipal + interestDue + penaltyDue;
      setTotalDebt(debt);
      setRenewalAmount(interestDue + penaltyDue);
    }
  }, [loan]);

  // Handle gold rate change / Net Payout updates
  useEffect(() => {
    const rate = parseFloat(goldRateInput) || 0;
    const goldVal = loan.goldWeight * rate;
    setNetPayout(goldVal - totalDebt);
  }, [goldRateInput, totalDebt, loan]);

  // Handle Auction input changes and allocations
  useEffect(() => {
    const saleVal = parseFloat(auctionSalePrice) || 0;
    const feesVal = parseFloat(auctionFees) || 0;
    const netRecovered = Math.max(0, saleVal - feesVal);

    let remaining = netRecovered;

    // Allocate first to penalties
    const penaltyRec = Math.min(remaining, outstandingPenalty);
    remaining -= penaltyRec;

    // Allocate next to interest
    const interestRec = Math.min(remaining, outstandingInterest);
    remaining -= interestRec;

    // Allocate final to principal
    const principalRec = Math.min(remaining, outstandingPrincipal);
    remaining -= principalRec;

    setAuctionPenaltyRec(Math.round(penaltyRec));
    setAuctionInterestRec(Math.round(interestRec));
    setAuctionPrincipalRec(Math.round(principalRec));

    const recoveredTotal = penaltyRec + interestRec + principalRec;
    if (netRecovered > totalDebt) {
      setAuctionSurplus(Math.round(netRecovered - totalDebt));
      setAuctionDeficit(0);
    } else {
      setAuctionSurplus(0);
      setAuctionDeficit(Math.round(totalDebt - recoveredTotal));
    }
  }, [auctionSalePrice, auctionFees, outstandingPrincipal, outstandingInterest, outstandingPenalty, totalDebt]);

  // Submissions
  const handleRenewalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      renewLoan(
        loan.id,
        loan.customerName,
        renewalAmount,
        paymentMethod,
        transactionRef || 'renewal-rollover',
        currentUser.id
      );

      logActivity(
        currentUser,
        'loan_updated',
        `Renewed loan for ${loan.customerName}`,
        `Old Loan ID: ${loan.id}, Interest & Penalties paid: ₹${renewalAmount.toLocaleString()}, Old loan status marked Closed.`
      );

      // Create pre-filled new loan template
      const renewalTemplate: Partial<Loan> = {
        customerId: loan.customerId,
        customerName: loan.customerName,
        goldWeight: loan.goldWeight,
        goldType: loan.goldType,
        goldValue: loan.goldValue,
        itemType: loan.itemType,
        loanAmount: loan.loanAmount, // Keep same principal
        loanTypeId: loan.loanTypeId,
        loanTypeName: loan.loanTypeName,
        interestRate: loan.interestRate,
        tenure: loan.tenure,
        lockerNumber: loan.lockerNumber,
        packetNumber: loan.packetNumber,
        ornamentPhotoUrl: loan.ornamentPhotoUrl,
        repaymentScheme: loan.repaymentScheme,
        penaltyRate: loan.penaltyRate,
      };

      setSuccessMsg('Renewal payment completed and old loan closed. Spawning new loan setup...');
      setMode('success');

      // Call parent to immediately pop the Create Loan screen pre-filled
      setTimeout(() => {
        onInitiateRenewalLoanCreation(renewalTemplate);
        onSuccess();
      }, 2000);
    } catch (err: any) {
      alert(`Renewal failed: ${err.message || err}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNetPurchaseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      settleNetPurchase(
        loan.id,
        loan.customerName,
        outstandingPrincipal,
        outstandingInterest,
        outstandingPenalty,
        totalDebt,
        paymentMethod,
        transactionRef || 'net-settlement-purchase',
        currentUser.id
      );

      logActivity(
        currentUser,
        'loan_closed',
        `Net Gold Purchase Settlement for ${loan.customerName}`,
        `Loan ID: ${loan.id}, Principal: ₹${outstandingPrincipal.toLocaleString()}, Interest: ₹${outstandingInterest.toLocaleString()}, Gold purchased at ₹${goldRateInput}/g. Net payout to customer: ₹${netPayout.toLocaleString()}. Ornaments surrendered.`
      );

      setSuccessMsg(`Net Gold Purchase Settlement Completed! Ornaments are now shop property. Net cash payout to customer: ₹${Math.round(netPayout).toLocaleString()}`);
      setMode('success');
    } catch (err: any) {
      alert(`Settlement failed: ${err.message || err}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAuctionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      recordAuctionSale(
        loan.id,
        loan.customerName,
        parseFloat(auctionSalePrice),
        parseFloat(auctionFees) || 0,
        auctionPrincipalRec,
        auctionInterestRec,
        auctionPenaltyRec,
        auctionSurplus,
        auctionDeficit,
        paymentMethod,
        transactionRef || 'auction-liquidation',
        currentUser.id
      );

      logActivity(
        currentUser,
        'loan_updated',
        `Gold Auction recovery completed for ${loan.customerName}`,
        `Loan ID: ${loan.id}, Sold for: ₹${parseFloat(auctionSalePrice).toLocaleString()}, Principal Recovered: ₹${auctionPrincipalRec.toLocaleString()}, Surplus Returned: ₹${auctionSurplus.toLocaleString()}, Deficit written off: ₹${auctionDeficit.toLocaleString()}`
      );

      setSuccessMsg(`Gold ornaments auctioned successfully. Outstanding balance recovered: ₹${(auctionPrincipalRec + auctionInterestRec + auctionPenaltyRec).toLocaleString()}. Status set to Auctioned.`);
      setMode('success');
    } catch (err: any) {
      alert(`Auction recording failed: ${err.message || err}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-none border border-black/15 w-full shadow-2xl flex flex-col overflow-hidden max-h-[95vh]" style={{ maxWidth: '44rem' }}>
        
        {/* Header */}
        <div className="bg-yellow-500 px-6 py-4 flex items-center justify-between border-b border-black/15 text-white">
          <div>
            <h3 className="font-bold text-lg leading-tight">Overdue Settlement & Recovery</h3>
            <p className="text-xs text-yellow-100 mt-0.5">Manage rollover, net settlement, or auction for Loan #{loan.id.slice(-6)}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-yellow-600 rounded-none transition-colors">
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Content Body */}
        <div className="overflow-y-auto flex-1 p-6 space-y-6">

          {/* Mode Selector Dashboard */}
          {mode === 'select' && (
            <div className="space-y-6">
              <div className="bg-yellow-50 border border-yellow-200 p-4 text-sm text-yellow-800 rounded-none flex flex-col gap-2">
                <p className="font-bold">⚠️ Customer Account Overdue Details:</p>
                <div className="grid grid-cols-2 gap-4 text-xs font-mono bg-white p-3 border border-yellow-100 mt-1">
                  <div>• Customer: <strong>{loan.customerName}</strong></div>
                  <div>• Gold Weight: <strong>{loan.goldWeight}g ({loan.goldType})</strong></div>
                  <div>• Outstanding Principal: <strong>₹{outstandingPrincipal.toLocaleString()}</strong></div>
                  <div>• Interest Dues: <strong>₹{outstandingInterest.toLocaleString()}</strong></div>
                  {outstandingPenalty > 0 && <div>• Penalty Accrued: <strong className="text-red-600">₹{outstandingPenalty.toLocaleString()}</strong></div>}
                  <div>• Total Debt: <strong>₹{totalDebt.toLocaleString()}</strong></div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                
                {/* 1. Renewal Option */}
                <button
                  type="button"
                  onClick={() => setMode('renewal')}
                  className="flex items-start text-left p-4 border border-black/15 hover:bg-yellow-50/50 hover:border-yellow-500 transition-all rounded-none gap-4 group"
                >
                  <div className="w-12 h-12 bg-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                    <RefreshCw className="w-6 h-6 group-hover:rotate-180 transition-transform duration-500" />
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-gray-900 text-base">Option 1: Loan Renewal (Rollover)</span>
                      <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-yellow-600 group-hover:translate-x-1 transition-all" />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Customer pays **only interest & penalty** (₹{renewalAmount.toLocaleString()}). The current loan is closed, and a fresh 12-month loan is generated for the remaining principal.
                    </p>
                  </div>
                </button>

                {/* 2. Net Gold Purchase Option */}
                <div className="relative">
                  <button
                    type="button"
                    disabled={!isAdmin}
                    onClick={() => setMode('net_purchase')}
                    className={`w-full flex items-start text-left p-4 border rounded-none gap-4 group ${
                      isAdmin 
                        ? 'border-black/15 hover:bg-yellow-50/50 hover:border-yellow-500 hover:shadow-md transition-all'
                        : 'bg-gray-50 border-gray-200 cursor-not-allowed opacity-60'
                    }`}
                  >
                    <div className="w-12 h-12 bg-green-100 flex items-center justify-center text-green-600 shrink-0">
                      <Scale className="w-6 h-6" />
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-gray-900 text-base">
                          Option 2: Net Gold Purchase Settlement
                          {!isAdmin && <span className="text-[10px] bg-red-100 text-red-700 font-bold px-2 py-0.5 ml-2 uppercase">Admin Only</span>}
                        </span>
                        {isAdmin && <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-yellow-600 group-hover:translate-x-1 transition-all" />}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        The shop purchases the customer's ornaments at live market rates (based on {loan.goldType}). We deduct the outstanding debt (₹{totalDebt.toLocaleString()}) and pay the cash surplus directly to the customer.
                      </p>
                    </div>
                  </button>
                </div>

                {/* 3. Auction Option */}
                <div className="relative">
                  <button
                    type="button"
                    disabled={!isAdmin}
                    onClick={() => setMode('auction')}
                    className={`w-full flex items-start text-left p-4 border rounded-none gap-4 group ${
                      isAdmin 
                        ? 'border-black/15 hover:bg-yellow-50/50 hover:border-yellow-500 hover:shadow-md transition-all'
                        : 'bg-gray-50 border-gray-200 cursor-not-allowed opacity-60'
                    }`}
                  >
                    <div className="w-12 h-12 bg-red-100 flex items-center justify-center text-red-600 shrink-0">
                      <ShieldAlert className="w-6 h-6" />
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-gray-900 text-base">
                          Option 3: Gold Auction Recovery
                          {!isAdmin && <span className="text-[10px] bg-red-100 text-red-700 font-bold px-2 py-0.5 ml-2 uppercase">Admin Only</span>}
                        </span>
                        {isAdmin && <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-yellow-600 group-hover:translate-x-1 transition-all" />}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Forfeit and sell the ornaments at public auction. Record recovered principal/interest proceeds, return any remaining surplus, or write off the deficit.
                      </p>
                    </div>
                  </button>
                </div>

              </div>
            </div>
          )}

          {/* Form: Loan Renewal */}
          {mode === 'renewal' && (
            <form onSubmit={handleRenewalSubmit} className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 p-4 rounded-none space-y-2">
                <h4 className="font-bold text-blue-900 text-sm">🔄 Loan Renewal (Rollover) Summary</h4>
                <p className="text-xs text-blue-800">
                  The old loan will be closed as renewed. You must collect the overdue interest and penalties to continue.
                </p>
                <div className="grid grid-cols-2 gap-4 text-xs font-mono pt-2 border-t border-blue-100 text-gray-700">
                  <div>Outstanding Interest: <strong>₹{outstandingInterest.toLocaleString()}</strong></div>
                  <div>Accrued Penalty Dues: <strong>₹{outstandingPenalty.toLocaleString()}</strong></div>
                  <div className="col-span-2 text-sm text-blue-900 font-sans font-bold pt-1">
                    Total Collected Renewal Fee: ₹{renewalAmount.toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Form Input fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1">Payment Method</label>
                  <select
                    value={paymentMethod}
                    onChange={e => setPaymentMethod(e.target.value)}
                    className="w-full px-4 py-2 border border-black/15 rounded-none focus:ring-2 focus:ring-yellow-500 text-sm"
                  >
                    <option value="cash">Cash</option>
                    <option value="upi">UPI / QR Scan</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="cheque">Cheque</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1">Transaction Ref No.</label>
                  <input
                    type="text"
                    value={transactionRef}
                    onChange={e => setTransactionRef(e.target.value)}
                    placeholder="Ref number or note..."
                    className="w-full px-4 py-2 border border-black/15 rounded-none focus:ring-2 focus:ring-yellow-500 text-sm"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1">Processing Date</label>
                  <input
                    type="date"
                    value={processingDate}
                    onChange={e => setProcessingDate(e.target.value)}
                    className="w-full px-4 py-2 border border-black/15 rounded-none focus:ring-2 focus:ring-yellow-500 text-sm font-mono"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setMode('select')}
                  className="px-6 py-3 bg-gray-100 hover:bg-gray-200 border border-black/15 rounded-none font-bold text-sm text-gray-700 transition-colors"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 py-3 bg-yellow-500 hover:bg-yellow-600 text-white font-bold rounded-none border border-black/15 transition-all text-sm flex items-center justify-center gap-2"
                >
                  {isLoading ? 'Processing Renewal...' : `Confirm Renewal & Collect ₹${renewalAmount.toLocaleString()}`}
                </button>
              </div>
            </form>
          )}

          {/* Form: Net Gold Purchase Settlement */}
          {mode === 'net_purchase' && (
            <form onSubmit={handleNetPurchaseSubmit} className="space-y-4">
              <div className="bg-green-50 border border-green-200 p-4 rounded-none space-y-2 text-green-800">
                <h4 className="font-bold text-green-900 text-sm flex items-center gap-2">
                  <Scale className="w-4 h-4" />
                  Net Gold Purchase Settlement Form
                </h4>
                <p className="text-xs text-green-800">
                  Valuing gold collateral against outstanding debt. Shop buys gold directly from customer.
                </p>
              </div>

              {/* Rate calculator */}
              <div className="border border-black/15 p-4 rounded-none space-y-4 bg-gray-50">
                <h5 className="text-xs font-bold text-gray-700 uppercase tracking-wide">Gold Valuation calculator</h5>
                <div className="grid grid-cols-3 gap-4 text-sm items-center">
                  <div>
                    <span className="block text-[10px] text-gray-500 uppercase">Collateral Weight</span>
                    <strong className="text-gray-900">{loan.goldWeight} grams</strong>
                  </div>
                  <div>
                    <span className="block text-[10px] text-gray-500 uppercase">Purity Type</span>
                    <strong className="text-gray-900">{loan.goldType}</strong>
                  </div>
                  <div>
                    <span className="block text-[10px] text-gray-500 uppercase">Live Gold Rate (Gram)</span>
                    <input
                      type="number"
                      required
                      value={goldRateInput}
                      onChange={e => setGoldRateInput(e.target.value)}
                      className="w-full px-2 py-1 border border-black/15 rounded-none font-bold text-sm"
                    />
                  </div>
                </div>

                <div className="pt-2 border-t border-black/10 flex justify-between items-center text-sm">
                  <span>Assessed Gold Purchase Value:</span>
                  <strong className="text-lg text-green-700">₹{Math.round(loan.goldWeight * (parseFloat(goldRateInput) || 0)).toLocaleString()}</strong>
                </div>
              </div>

              {/* Net Payout Summary */}
              <div className="border border-black/15 p-4 rounded-none bg-white space-y-2">
                <h5 className="text-xs font-bold text-gray-700 uppercase tracking-wide">Financial Deductions & Payout</h5>
                <div className="grid grid-cols-2 gap-3 text-xs font-mono text-gray-600">
                  <div>Total Outstanding Debt: </div>
                  <div className="text-right font-bold text-gray-900">₹{totalDebt.toLocaleString()}</div>
                  <div className="pl-2">• Outstanding Principal:</div>
                  <div className="text-right">₹{outstandingPrincipal.toLocaleString()}</div>
                  <div className="pl-2">• Accrued Interest:</div>
                  <div className="text-right">₹{outstandingInterest.toLocaleString()}</div>
                  <div className="pl-2">• Accrued Penalty:</div>
                  <div className="text-right">₹{outstandingPenalty.toLocaleString()}</div>
                </div>

                <div className={`mt-3 p-3 flex justify-between items-center font-bold border ${
                  netPayout >= 0 
                    ? 'bg-green-50 border-green-200 text-green-800' 
                    : 'bg-red-50 border-red-200 text-red-800'
                }`}>
                  <div>
                    <span>{netPayout >= 0 ? 'Surplus Paid to Customer:' : 'Deficit Owed by Customer:'}</span>
                  </div>
                  <span className="text-xl">₹{Math.abs(Math.round(netPayout)).toLocaleString()}</span>
                </div>
              </div>

              {/* Payment Details */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1">Surplus Payout Method</label>
                  <select
                    value={paymentMethod}
                    onChange={e => setPaymentMethod(e.target.value)}
                    className="w-full px-4 py-2 border border-black/15 rounded-none focus:ring-2 focus:ring-yellow-500 text-sm"
                  >
                    <option value="cash">Cash</option>
                    <option value="bank_transfer">Bank Transfer / NEFT</option>
                    <option value="cheque">Cheque</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1">Reference/Receipt No.</label>
                  <input
                    type="text"
                    value={transactionRef}
                    onChange={e => setTransactionRef(e.target.value)}
                    placeholder="Receipt ref or voucher ID..."
                    className="w-full px-4 py-2 border border-black/15 rounded-none focus:ring-2 focus:ring-yellow-500 text-sm"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setMode('select')}
                  className="px-6 py-3 bg-gray-100 hover:bg-gray-200 border border-black/15 rounded-none font-bold text-sm text-gray-700 transition-colors"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-none border border-black/15 transition-all text-sm flex items-center justify-center gap-2"
                >
                  {isLoading ? 'Processing Settlement...' : `Confirm Net Gold Purchase Settlement`}
                </button>
              </div>
            </form>
          )}

          {/* Form: Gold Auction Recovery */}
          {mode === 'auction' && (
            <form onSubmit={handleAuctionSubmit} className="space-y-4">
              <div className="bg-red-50 border border-red-200 p-4 rounded-none space-y-2 text-red-800">
                <h4 className="font-bold text-red-900 text-sm flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4" />
                  Gold Auction & Liquidation Form
                </h4>
                <p className="text-xs text-red-800">
                  Record proceeds from the public auction of gold ornaments. System will allocate proceeds to penalty, interest, and principal.
                </p>
              </div>

              {/* Auction details inputs */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1">Gross Auction Sale Price <span className="text-red-500">*</span></label>
                  <input
                    type="number"
                    required
                    value={auctionSalePrice}
                    onChange={e => setAuctionSalePrice(e.target.value)}
                    placeholder="Enter final auction bid price..."
                    className="w-full px-4 py-2.5 border border-black/15 rounded-none focus:ring-2 focus:ring-yellow-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1">Auctioneer Fees/Charges</label>
                  <input
                    type="number"
                    required
                    value={auctionFees}
                    onChange={e => setAuctionFees(e.target.value)}
                    placeholder="Enter auction charges..."
                    className="w-full px-4 py-2.5 border border-black/15 rounded-none focus:ring-2 focus:ring-yellow-500 text-sm"
                  />
                </div>
              </div>

              {/* Allocation panel */}
              <div className="border border-black/15 p-4 rounded-none bg-gray-50 space-y-2 text-xs">
                <h5 className="font-bold text-gray-700 uppercase tracking-wide mb-2">Proceeds Allocation Summary</h5>
                <div className="grid grid-cols-2 gap-2 font-mono text-gray-600">
                  <div>Penalty Recovered:</div>
                  <div className="text-right font-bold text-gray-900">₹{auctionPenaltyRec.toLocaleString()} / ₹{outstandingPenalty.toLocaleString()}</div>
                  <div>Interest Recovered:</div>
                  <div className="text-right font-bold text-gray-900">₹{auctionInterestRec.toLocaleString()} / ₹{outstandingInterest.toLocaleString()}</div>
                  <div>Principal Recovered:</div>
                  <div className="text-right font-bold text-gray-900">₹{auctionPrincipalRec.toLocaleString()} / ₹{outstandingPrincipal.toLocaleString()}</div>
                </div>

                <div className="border-t border-black/10 pt-2 flex flex-col gap-1">
                  {auctionSurplus > 0 && (
                    <div className="flex justify-between items-center text-green-700 font-bold">
                      <span>Surplus to Return to Customer:</span>
                      <span className="text-sm">₹{auctionSurplus.toLocaleString()}</span>
                    </div>
                  )}
                  {auctionDeficit > 0 && (
                    <div className="flex justify-between items-center text-red-700 font-bold">
                      <span>Deficit written off by Shop:</span>
                      <span className="text-sm">₹{auctionDeficit.toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Deposit method */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1">Recovery Payment Method</label>
                  <select
                    value={paymentMethod}
                    onChange={e => setPaymentMethod(e.target.value)}
                    className="w-full px-4 py-2.5 border border-black/15 rounded-none focus:ring-2 focus:ring-yellow-500 text-sm"
                  >
                    <option value="bank_transfer">Bank Transfer / NEFT</option>
                    <option value="cash">Cash</option>
                    <option value="cheque">Cheque</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1">Auction Ref / Certificate No.</label>
                  <input
                    type="text"
                    value={transactionRef}
                    onChange={e => setTransactionRef(e.target.value)}
                    placeholder="Enter auction ID or slip no..."
                    className="w-full px-4 py-2.5 border border-black/15 rounded-none focus:ring-2 focus:ring-yellow-500 text-sm"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setMode('select')}
                  className="px-6 py-3 bg-gray-100 hover:bg-gray-200 border border-black/15 rounded-none font-bold text-sm text-gray-700 transition-colors"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={isLoading || !auctionSalePrice}
                  className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-none border border-black/15 transition-all text-sm flex items-center justify-center gap-2"
                >
                  {isLoading ? 'Recording Auction...' : `Record Gold Auction Liquidation`}
                </button>
              </div>
            </form>
          )}

          {/* Mode: Success Confirmation */}
          {mode === 'success' && (
            <div className="flex flex-col items-center justify-center py-8 text-center space-y-4">
              <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center shadow-inner">
                <CheckCircle className="w-10 h-10" />
              </div>
              <h4 className="font-bold text-xl text-gray-900">Settlement Successful!</h4>
              <p className="text-sm text-gray-500 max-w-sm">
                {successMsg}
              </p>
              <button
                onClick={() => {
                  onSuccess();
                }}
                className="px-8 py-2.5 bg-gray-900 hover:bg-gray-800 text-white font-bold rounded-none border border-black/15 transition-colors text-sm"
              >
                Done
              </button>
            </div>
          )}

        </div>

      </div>
    </div>
  );
}
