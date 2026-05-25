import { useState, useEffect } from 'react';
import { X, Calculator } from 'lucide-react';
import { Loan, Customer, GoldRate, LoanType, User } from '../types';
import { getAllCustomers } from '../lib/db/customerService';
import { getLoanTypes } from '../lib/db/loanService';
import { getAllGoldRates } from '../lib/db/goldRateService';

interface CreateLoanModalProps {
  onClose: () => void;
  onCreate: (loan: Loan) => void;
  currentUser: User;
}

export function CreateLoanModal({ onClose, onCreate, currentUser }: CreateLoanModalProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [goldRates, setGoldRates] = useState<GoldRate[]>([]);
  const [loanTypes, setLoanTypes] = useState<LoanType[]>([]);

  useEffect(() => {
    try {
      const allCustomers = getAllCustomers();
      const filteredCustomers = currentUser.role === 'staff'
        ? allCustomers.filter(c => c.createdBy === currentUser.id)
        : allCustomers;
      
      setCustomers(filteredCustomers);
      setGoldRates(getAllGoldRates());
      setLoanTypes(getLoanTypes());
    } catch {}
  }, [currentUser]);

  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [goldWeight, setGoldWeight] = useState('');
  const [goldType, setGoldType] = useState<'24K' | '22K' | '18K'>('22K');
  const [itemType, setItemType] = useState('Ring');
  const [customItemType, setCustomItemType] = useState('');
  const [loanTypeId, setLoanTypeId] = useState('');
  const [loanAmount, setLoanAmount] = useState('');
  const [tenure, setTenure] = useState('');
  
  const [goldValue, setGoldValue] = useState(0);
  const [maxLoanAmount, setMaxLoanAmount] = useState(0);
  const [emiAmount, setEmiAmount] = useState(0);
  const [effectiveLTV, setEffectiveLTV] = useState(0);

  const verifiedCustomers = customers.filter(c => c.kycStatus === 'verified');
  const selectedLoanType = loanTypes.find(lt => lt.id === loanTypeId);
  const goldRate = goldRates.find(gr => gr.goldType === goldType)?.ratePerGram || 0;

  // Calculate gold value and max loan amount
  useEffect(() => {
    const weight = parseFloat(goldWeight) || 0;
    const value = weight * goldRate;
    
    // Tiered LTV Logic: 85% for loans up to ₹2.5 Lakh, 75% for larger loans
    const threshold = 250000;
    const smallLTV = 0.85;
    const largeLTV = 0.75;
    
    let calculatedMax = Math.floor(Math.max(Math.min(value * smallLTV, threshold), value * largeLTV));
    
    setGoldValue(value);
    setMaxLoanAmount(calculatedMax);
    setEffectiveLTV(value > 0 ? Math.round((calculatedMax / value) * 100) : 0);
    
    if (calculatedMax > 0) {
      // Auto-select a loan type if none is selected
      if (!loanTypeId && loanTypes.length > 0) {
        // Find a loan type where the calculated max fits within its range
        const bestType = loanTypes.find(lt => calculatedMax >= lt.minAmount) || loanTypes[0];
        if (bestType) setLoanTypeId(bestType.id);
      }

      // Respect loan type maximum if one is selected
      const currentType = selectedLoanType || loanTypes.find(lt => lt.id === loanTypeId);
      const finalMax = currentType ? Math.min(calculatedMax, currentType.maxAmount) : calculatedMax;
      setLoanAmount(finalMax.toString());
    }
  }, [goldWeight, goldRate, selectedLoanType, loanTypes]);

  // Calculate EMI
  useEffect(() => {
    const principal = parseFloat(loanAmount) || 0;
    const months = parseInt(tenure) || 0;
    const rate = selectedLoanType?.interestRate || 0;

    if (principal > 0 && months > 0 && rate > 0) {
      const monthlyRate = rate / 12 / 100;
      const emi = principal * monthlyRate * Math.pow(1 + monthlyRate, months) / 
                  (Math.pow(1 + monthlyRate, months) - 1);
      setEmiAmount(Math.round(emi));
    } else {
      setEmiAmount(0);
    }
  }, [loanAmount, tenure, selectedLoanType]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const customer = verifiedCustomers.find(c => c.id === selectedCustomerId);
    if (!customer || !selectedLoanType) return;

    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + parseInt(tenure));

    const newLoan: Loan = {
      id: Date.now().toString(),
      customerId: selectedCustomerId,
      customerName: customer.name,
      goldWeight: parseFloat(goldWeight),
      goldType,
      goldValue,
      itemType: itemType === 'Other' ? customItemType : itemType,
      loanAmount: parseFloat(loanAmount),
      loanTypeId,
      loanTypeName: selectedLoanType.name,
      interestRate: selectedLoanType.interestRate,
      tenure: parseInt(tenure),
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      status: 'active',
      emiAmount,
    };

    onCreate(newLoan);
  };

  const isValidLoanAmount = () => {
    const amount = parseFloat(loanAmount) || 0;
    if (!selectedLoanType) return false;
    return amount >= selectedLoanType.minAmount && 
           amount <= selectedLoanType.maxAmount && 
           amount <= maxLoanAmount;
  };

  const isValidTenure = () => {
    const months = parseInt(tenure) || 0;
    if (!selectedLoanType) return false;
    return months >= selectedLoanType.minTenure && months <= selectedLoanType.maxTenure;
  };

  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-none border border-black/15 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-black/15 px-6 py-4 flex items-center justify-between">
          <h3 className="text-xl font-semibold text-gray-900">Create New Gold Loan</h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-none border border-black/15 transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Customer Selection */}
          <div>
            <h4 className="text-sm font-medium text-gray-900 mb-4">Customer Information</h4>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Customer (KYC Verified Only) <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
                className="w-full px-4 py-2 border border-black/15 rounded-none border border-black/15 focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
              >
                <option value="">Choose a customer...</option>
                {verifiedCustomers.map(customer => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name} - {customer.phone}
                  </option>
                ))}
              </select>
              {verifiedCustomers.length === 0 && (
                <p className="text-sm text-red-600 mt-2">No verified customers available. Please verify customer KYC first.</p>
              )}
            </div>
          </div>

          {/* Gold Details */}
          <div>
            <h4 className="text-sm font-medium text-gray-900 mb-4">Gold Details</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Gold Weight (grams) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={goldWeight}
                  onChange={(e) => setGoldWeight(e.target.value)}
                  className="w-full px-4 py-2 border border-black/15 rounded-none border border-black/15 focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                  placeholder="50.00"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Gold Type <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={goldType}
                  onChange={(e) => setGoldType(e.target.value as any)}
                  className="w-full px-4 py-2 border border-black/15 rounded-none border border-black/15 focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                >
                   <option value="24K">24K - ₹{goldRates.find(r => r.goldType === '24K')?.ratePerGram}/g</option>
                   <option value="22K">22K - ₹{goldRates.find(r => r.goldType === '22K')?.ratePerGram}/g</option>
                   <option value="18K">18K - ₹{goldRates.find(r => r.goldType === '18K')?.ratePerGram}/g</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Gold Value</label>
                <div className="w-full px-4 py-2 bg-gray-50 border border-black/15 rounded-none border border-black/15">
                  <p className="text-gray-900 font-medium">₹{goldValue.toLocaleString()}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Gold Item Type <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={itemType}
                  onChange={(e) => setItemType(e.target.value)}
                  className="w-full px-4 py-2 border border-black/15 rounded-none border border-black/15 focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                >
                  <option value="Ring">Ring</option>
                  <option value="Necklace">Necklace</option>
                  <option value="Bangles">Bangles</option>
                  <option value="Earrings">Earrings</option>
                  <option value="Chain">Chain</option>
                  <option value="Bracelet">Bracelet</option>
                  <option value="Other">Other (Custom)</option>
                </select>
              </div>

              {itemType === 'Other' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Custom Item Type <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={customItemType}
                    onChange={(e) => setCustomItemType(e.target.value)}
                    className="w-full px-4 py-2 border border-black/15 rounded-none border border-black/15 focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                    placeholder="e.g., Gold Coin, Anklet"
                  />
                </div>
              )}
            </div>

            <div className="mt-3 p-3 bg-blue-50 border border-black/15 rounded-none border border-black/15">
              <p className="text-sm text-blue-800">
                <strong>Max Loan Amount (Up to {effectiveLTV}% LTV):</strong> ₹{maxLoanAmount.toLocaleString()}
              </p>
            </div>
          </div>

          {/* Loan Type Selection */}
          <div>
            <h4 className="text-sm font-medium text-gray-900 mb-4">Loan Type</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {loanTypes.map(loanType => (
                <div
                  key={loanType.id}
                  onClick={() => setLoanTypeId(loanType.id)}
                  className={`p-4 border-2 rounded-none border border-black/15 cursor-pointer transition-all ${
                    loanTypeId === loanType.id
                      ? 'border-black/15 bg-yellow-50'
                      : 'border-black/15 hover:border-black/15'
                  }`}
                >
                  <h5 className="font-medium text-gray-900 mb-2">{loanType.name}</h5>
                  <div className="space-y-1 text-sm text-gray-600">
                    <p>Interest: {loanType.interestRate}% p.a.</p>
                    <p>Amount: ₹{(loanType.minAmount / 1000).toFixed(0)}K - ₹{(loanType.maxAmount / 100000).toFixed(0)}L</p>
                    <p>Tenure: {loanType.minTenure}-{loanType.maxTenure} months</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Loan Details */}
          {selectedLoanType && (
            <div>
              <h4 className="text-sm font-medium text-gray-900 mb-4">Loan Details</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Loan Amount (₹) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="1"
                    required
                    value={loanAmount}
                    onChange={(e) => setLoanAmount(e.target.value)}
                    className="w-full px-4 py-2 border border-black/15 rounded-none border border-black/15 focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                    placeholder="200000"
                    min={selectedLoanType.minAmount}
                    max={Math.min(selectedLoanType.maxAmount, maxLoanAmount)}
                  />
                  {loanAmount && !isValidLoanAmount() && (
                    <p className="text-sm text-red-600 mt-1">
                      Amount must be between ₹{selectedLoanType.minAmount.toLocaleString()} and ₹{Math.min(selectedLoanType.maxAmount, maxLoanAmount).toLocaleString()}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Tenure (months) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    value={tenure}
                    onChange={(e) => setTenure(e.target.value)}
                    className="w-full px-4 py-2 border border-black/15 rounded-none border border-black/15 focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                    placeholder="24"
                    min={selectedLoanType.minTenure}
                    max={selectedLoanType.maxTenure}
                  />
                  {tenure && !isValidTenure() && (
                    <p className="text-sm text-red-600 mt-1">
                      Tenure must be between {selectedLoanType.minTenure} and {selectedLoanType.maxTenure} months
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* EMI Calculation */}
          {emiAmount > 0 && (
            <div className="p-6 bg-gradient-to-r from-yellow-50 to-orange-50 border border-black/15 rounded-none border border-black/15">
              <div className="flex items-center gap-3 mb-4">
                <Calculator className="w-6 h-6 text-yellow-600" />
                <h4 className="text-lg font-semibold text-gray-900">EMI Calculation</h4>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Monthly EMI</p>
                  <p className="text-2xl font-semibold text-gray-900">₹{emiAmount.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Total Payable</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    ₹{(emiAmount * parseInt(tenure || '0')).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Total Interest</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    ₹{((emiAmount * parseInt(tenure || '0')) - parseFloat(loanAmount || '0')).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-black/15">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-none border border-black/15 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!selectedCustomerId || !goldWeight || !loanTypeId || !loanAmount || !tenure || !isValidLoanAmount() || !isValidTenure() || (itemType === 'Other' && !customItemType)}
              className="px-6 py-2 bg-yellow-500 text-white rounded-none border border-black/15 hover:bg-yellow-600 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              Create Loan
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
