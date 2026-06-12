import { useState, useEffect, useRef } from 'react';
import { X, Calculator, Camera, Check, Link as LinkIcon, Eye, Search, AlertTriangle } from 'lucide-react';
import { Loan, Customer, GoldRate, User } from '../types';
import { getAllCustomers } from '../lib/db/customerService';
import { getAllGoldRates } from '../lib/db/goldRateService';
import { saveUploadedFile, openLocalFile } from '../lib/fileService';
import { getSystemWorkingDate } from '../lib/workingDate';
import { CameraCaptureModal } from './CameraCaptureModal';
import { compressImage } from '../lib/imageCompressor';

interface CreateLoanModalProps {
  onClose: () => void;
  onCreate: (loan: Loan) => void;
  currentUser: User;
  prefillTemplate?: Partial<Loan>;
}

export function CreateLoanModal({ onClose, onCreate, currentUser, prefillTemplate }: CreateLoanModalProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [goldRates, setGoldRates] = useState<GoldRate[]>([]);

  useEffect(() => {
    try {
      const allCustomers = getAllCustomers();
      setCustomers(allCustomers);
      setGoldRates(getAllGoldRates());
    } catch {}
  }, [currentUser]);

  const [selectedCustomerId, setSelectedCustomerId] = useState(prefillTemplate?.customerId || '');
  const [customerSearch, setCustomerSearch] = useState(prefillTemplate ? `${prefillTemplate.customerName}` : '');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [goldWeight, setGoldWeight] = useState(prefillTemplate?.goldWeight?.toString() || '');
  const [goldType, setGoldType] = useState<'24K' | '22K' | '18K' | ''>(prefillTemplate?.goldType || '');
  const [itemType, setItemType] = useState(prefillTemplate?.itemType || '');
  const [customItemType, setCustomItemType] = useState('');
  const [loanAmount, setLoanAmount] = useState(prefillTemplate?.loanAmount?.toString() || '');
  const [tenure, setTenure] = useState(prefillTemplate?.tenure?.toString() || '');
  const [interestRate, setInterestRate] = useState(prefillTemplate?.interestRate?.toString() || '');
  const [penaltyRate, setPenaltyRate] = useState(prefillTemplate?.penaltyRate?.toString() || '');
  const [repaymentScheme, setRepaymentScheme] = useState<'EMI' | 'BULLET' | ''>(prefillTemplate?.repaymentScheme || '');
  const [ltvPercentage, setLtvPercentage] = useState(
    prefillTemplate && prefillTemplate.goldValue && prefillTemplate.loanAmount
      ? Math.round((prefillTemplate.loanAmount / prefillTemplate.goldValue) * 100).toString()
      : ''
  );
  
  const [lockerNumber, setLockerNumber] = useState(prefillTemplate?.lockerNumber || '');
  const [packetNumber, setPacketNumber] = useState(prefillTemplate?.packetNumber || '');
  const [ornamentPhotos, setOrnamentPhotos] = useState<{ url: string; name: string }[]>(() => {
    if (prefillTemplate?.ornamentPhotoUrl) {
      try {
        const parsed = JSON.parse(prefillTemplate.ornamentPhotoUrl);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {}
    }
    return [];
  });
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [showOrnamentCamera, setShowOrnamentCamera] = useState(false);

  const [goldValue, setGoldValue] = useState(0);
  const [maxLoanAmount, setMaxLoanAmount] = useState(0);
  const [emiAmount, setEmiAmount] = useState(0);
  const [showLtvWarningPopup, setShowLtvWarningPopup] = useState(false);

  const verifiedCustomers = customers.filter(c => c.kycStatus === 'verified');
  const filteredVerifiedCustomers = verifiedCustomers.filter(customer =>
    customer.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    customer.phone.includes(customerSearch)
  );
  const goldRate = goldRates.find(gr => gr.goldType === goldType)?.ratePerGram || 0;

  // Calculate gold value and max loan amount based on manual LTV%
  useEffect(() => {
    const weight = parseFloat(goldWeight) || 0;
    const value = weight * goldRate;
    setGoldValue(value);

    const ltvVal = parseFloat(ltvPercentage) || 0;
    const calculatedMax = Math.floor(value * (ltvVal / 100));
    setMaxLoanAmount(calculatedMax);
    
    if (calculatedMax > 0) {
      setLoanAmount(calculatedMax.toString());
    } else {
      setLoanAmount('');
    }
  }, [goldWeight, goldRate, ltvPercentage]);

  // File upload handler
  const handleFileChange = async (file: File | null) => {
    if (!file) return;
    
    // Size limit enforcement for documents/PDFs
    if (file.type.includes('pdf') && file.size > 1 * 1024 * 1024) {
      alert("Document file size exceeds the 1MB limit! Please upload a compressed PDF.");
      return;
    }

    setIsUploading(true);
    try {
      let finalFile = file;
      if (file.type.startsWith('image/')) {
        finalFile = await compressImage(file, 800, 0.6);
      }
      const customer = verifiedCustomers.find(c => c.id === selectedCustomerId);
      const name = customer ? customer.name : 'unknown_customer';
      const filePath = await saveUploadedFile(finalFile, name + '_ornament');
      setOrnamentPhotos(prev => [...prev, { url: filePath, name: finalFile.name }]);
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setIsUploading(false);
    }
  };

  // Calculate EMI
  useEffect(() => {
    const principal = parseFloat(loanAmount) || 0;
    const months = parseInt(tenure) || 0;
    const rate = parseFloat(interestRate) || 0;

    if (principal > 0 && months > 0 && rate > 0) {
      const monthlyRate = rate / 12 / 100;
      const emi = principal * monthlyRate * Math.pow(1 + monthlyRate, months) / 
                  (Math.pow(1 + monthlyRate, months) - 1);
      setEmiAmount(Math.round(emi));
    } else {
      setEmiAmount(0);
    }
  }, [loanAmount, tenure, interestRate]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const amount = parseFloat(loanAmount) || 0;
    if (amount > maxLoanAmount) {
      setShowLtvWarningPopup(true);
      return;
    }
    
    executeCreateLoan();
  };

  const executeCreateLoan = () => {
    const customer = verifiedCustomers.find(c => c.id === selectedCustomerId);
    if (!customer) return;

    const workingDateStr = getSystemWorkingDate();
    const [yr, mo, dy] = workingDateStr.split('-').map(Number);
    const startDate = new Date(yr, mo - 1, dy);
    const endDate = new Date(yr, mo - 1 + parseInt(tenure), dy);

    const formatLocalDate = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const startDateStr = formatLocalDate(startDate);
    const endDateStr = formatLocalDate(endDate);

    const newLoan: Loan = {
      id: Date.now().toString(),
      customerId: selectedCustomerId,
      customerName: customer.name,
      goldWeight: parseFloat(goldWeight),
      goldType: goldType as '24K' | '22K' | '18K',
      goldValue,
      itemType: itemType === 'Other' ? customItemType : itemType,
      loanAmount: parseFloat(loanAmount),
      loanTypeId: 'standard',
      loanTypeName: 'Standard Gold Loan',
      interestRate: parseFloat(interestRate) || 18,
      tenure: parseInt(tenure),
      startDate: startDateStr,
      endDate: endDateStr,
      status: 'active',
      emiAmount: repaymentScheme === 'EMI' ? emiAmount : 0,
      lockerNumber,
      packetNumber,
      ornamentPhotoUrl: ornamentPhotos.length > 0 ? JSON.stringify(ornamentPhotos) : undefined,
      repaymentScheme: repaymentScheme as 'EMI' | 'BULLET',
      penaltyRate: parseFloat(penaltyRate) || 2,
    };

    onCreate(newLoan);
    setShowLtvWarningPopup(false);
  };

  const isValidLoanAmount = () => {
    const amount = parseFloat(loanAmount) || 0;
    return amount > 0;
  };

  const isValidTenure = () => {
    const months = parseInt(tenure) || 0;
    return months >= 1 && months <= 120;
  };

  return (
    <>
      <div className={`fixed inset-0 bg-black overflow-y-auto flex ${showOrnamentCamera ? 'flex-col lg:flex-row items-center justify-center gap-6' : 'items-center justify-center'} z-50 p-4`}>
        <div className="bg-white rounded-none border border-black/15 max-w-4xl w-full my-auto shadow-2xl">
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
              <div className="relative">
                <div className="relative flex items-center">
                  <input
                    type="text"
                    required={!selectedCustomerId}
                    placeholder="Search customer by name or phone number..."
                    value={customerSearch}
                    onChange={(e) => {
                      setCustomerSearch(e.target.value);
                      setShowCustomerDropdown(true);
                      if (!e.target.value) {
                        setSelectedCustomerId('');
                      }
                    }}
                    onFocus={() => setShowCustomerDropdown(true)}
                    className="w-full pl-4 pr-10 py-2.5 border border-black/15 rounded-none border border-black/15 focus:ring-2 focus:ring-yellow-500 focus:border-transparent text-sm bg-white"
                  />
                  {selectedCustomerId ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCustomerId('');
                        setCustomerSearch('');
                        setShowCustomerDropdown(false);
                      }}
                      className="absolute right-3 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  ) : (
                    <Search className="w-4 h-4 text-gray-400 absolute right-3 pointer-events-none" />
                  )}
                </div>

                {/* Combobox Dropdown */}
                {showCustomerDropdown && (
                  <>
                    {/* Click outside backdrop to close */}
                    <div 
                      className="fixed inset-0 z-10" 
                      onClick={() => setShowCustomerDropdown(false)}
                    />
                    
                    <div className="absolute left-0 right-0 mt-1 bg-white border border-black/15 shadow-xl max-h-60 overflow-y-auto z-20 divide-y divide-gray-100">
                      {filteredVerifiedCustomers.length > 0 ? (
                        filteredVerifiedCustomers.map(customer => {
                          const isSelected = selectedCustomerId === customer.id;
                          return (
                            <button
                              key={customer.id}
                              type="button"
                              onClick={() => {
                                setSelectedCustomerId(customer.id);
                                setCustomerSearch(`${customer.name} — ${customer.phone}`);
                                setShowCustomerDropdown(false);
                              }}
                              className={`w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center justify-between ${
                                isSelected ? 'bg-yellow-50 text-yellow-800 font-semibold' : 'hover:bg-gray-50 text-gray-700'
                              }`}
                            >
                              <div>
                                <p className="font-medium">{customer.name}</p>
                                <p className="text-xs text-gray-400 font-mono mt-0.5">{customer.phone}</p>
                              </div>
                              {isSelected && <Check className="w-4 h-4 text-yellow-600" />}
                            </button>
                          );
                        })
                      ) : (
                        <div className="px-4 py-3 text-sm text-gray-500 text-center">
                          No matching verified customers found.
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
              {verifiedCustomers.length === 0 && (
                <p className="text-sm text-red-600 mt-2">No verified customers available. Please verify customer KYC first.</p>
              )}
            </div>
          </div>

          {/* Gold Details */}
          <div>
            <h4 className="text-sm font-medium text-gray-900 mb-4">Gold Details</h4>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                   <option value="">Select Gold Type...</option>
                   <option value="24K">24K - ₹{goldRates.find(r => r.goldType === '24K')?.ratePerGram || 0}/g</option>
                   <option value="22K">22K - ₹{goldRates.find(r => r.goldType === '22K')?.ratePerGram || 0}/g</option>
                   <option value="18K">18K - ₹{goldRates.find(r => r.goldType === '18K')?.ratePerGram || 0}/g</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Gold Value</label>
                <div className="w-full px-4 py-2 bg-gray-50 border border-black/15 rounded-none border border-black/15">
                  <p className="text-gray-900 font-medium">₹{goldValue.toLocaleString()}</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  LTV (%) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.1"
                  required
                  value={ltvPercentage}
                  onChange={(e) => setLtvPercentage(e.target.value)}
                  className="w-full px-4 py-2 border border-black/15 rounded-none border border-black/15 focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                  placeholder="75"
                  min="1"
                  max="100"
                />
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
                  <option value="">Select Item Type...</option>
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Locker Number</label>
                <input
                  type="text"
                  value={lockerNumber}
                  onChange={(e) => setLockerNumber(e.target.value)}
                  className="w-full px-4 py-2 border border-black/15 rounded-none border border-black/15 focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                  placeholder="e.g., L-101"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Packet Number</label>
                <input
                  type="text"
                  value={packetNumber}
                  onChange={(e) => setPacketNumber(e.target.value)}
                  className="w-full px-4 py-2 border border-black/15 rounded-none border border-black/15 focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                  placeholder="e.g., P-2023"
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Ornament Photos (Upload at least 1)</label>
              <div className="space-y-3">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
                  className="hidden"
                  accept=".pdf,image/*"
                />
                       <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-none border border-black/15 bg-white text-gray-500 hover:border-yellow-50 hover:bg-yellow-50 justify-center w-full sm:w-auto"
                  >
                    <Camera className="w-4 h-4" />
                    {isUploading ? 'Uploading...' : 'Upload Photo'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowOrnamentCamera(true)}
                    disabled={isUploading}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-none border border-black/15 bg-yellow-50 text-yellow-600 hover:bg-yellow-100 justify-center w-full sm:w-auto"
                  >
                    <Camera className="w-4 h-4 animate-pulse" />
                    Capture Live Ornament
                  </button>
                  {ornamentPhotos.length > 0 && (
                    <span className="text-xs font-bold text-green-700 bg-green-50 px-2.5 py-1.5 border border-green-200 inline-flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5" />
                      {ornamentPhotos.length} {ornamentPhotos.length === 1 ? 'Photo' : 'Photos'} Uploaded
                    </span>
                  )}
                </div>                {ornamentPhotos.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                    {ornamentPhotos.map((photo, index) => (
                      <div key={index} className="flex items-center justify-between text-xs text-gray-600 bg-white p-2.5 rounded-none border border-black/15 shadow-sm">
                        <div className="flex items-center gap-2 truncate">
                          <LinkIcon className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <span className="truncate font-semibold">{photo.name}</span>
                        </div>
                        <div className="flex items-center gap-1.5 border-l pl-2 border-black/15 shrink-0">
                          <button
                            type="button"
                            onClick={() => openLocalFile(photo.url)}
                            className="p-1 text-blue-500 hover:bg-blue-50 rounded transition-colors"
                            title="View Document"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setOrnamentPhotos(prev => prev.filter((_, i) => i !== index));
                            }}
                            className="p-1 text-red-500 hover:bg-red-50 rounded transition-colors"
                            title="Remove File"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-3 p-3 bg-blue-50 border border-black/15 rounded-none border border-black/15">
              <p className="text-sm text-blue-800">
                <strong>Max Loan Amount (Up to {ltvPercentage}% LTV):</strong> ₹{maxLoanAmount.toLocaleString()}
              </p>
            </div>
          </div>

          {/* Loan Details */}
          <div className="space-y-6">
            <h4 className="text-sm font-medium text-gray-900 mb-4 border-b pb-2">Loan Structure</h4>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Repayment Scheme <span className="text-red-500">*</span>
              </label>
              <div className="flex flex-col sm:flex-row gap-3">
                <label className={`flex-1 flex items-center justify-center gap-2 p-3 border-2 cursor-pointer transition-all text-sm font-bold ${
                  repaymentScheme === 'BULLET' ? 'border-yellow-500 bg-yellow-50 text-yellow-800' : 'border-black/15 bg-white text-gray-600 hover:bg-gray-50'
                }`}>
                  <input 
                    type="radio" 
                    name="repaymentScheme" 
                    value="BULLET" 
                    checked={repaymentScheme === 'BULLET'} 
                    onChange={() => setRepaymentScheme('BULLET')}
                    className="hidden" 
                  />
                  Gold Loan Bullet (Dynamic Interest)
                </label>
                <label className={`flex-1 flex items-center justify-center gap-2 p-3 border-2 cursor-pointer transition-all text-sm font-bold ${
                  repaymentScheme === 'EMI' ? 'border-yellow-500 bg-yellow-50 text-yellow-800' : 'border-black/15 bg-white text-gray-600 hover:bg-gray-50'
                }`}>
                  <input 
                    type="radio" 
                    name="repaymentScheme" 
                    value="EMI" 
                    checked={repaymentScheme === 'EMI'} 
                    onChange={() => setRepaymentScheme('EMI')}
                    className="hidden" 
                  />
                  Standard Monthly EMI
                </label>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {repaymentScheme === 'BULLET' 
                  ? 'Interest accrues daily. Customer can pay interest-only or lump sums anytime.' 
                  : 'Fixed monthly payments including both principal and interest.'}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Interest Rate (% p.a.) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={interestRate}
                  onChange={(e) => setInterestRate(e.target.value)}
                  className="w-full px-4 py-2 border border-black/15 rounded-none border border-black/15 focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                  placeholder="e.g., 18"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Overdue Penalty (% per month, calculated daily) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={penaltyRate}
                  onChange={(e) => setPenaltyRate(e.target.value)}
                  className="w-full px-4 py-2 border border-black/15 rounded-none border border-black/15 focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                  placeholder="e.g., 2"
                />
              </div>
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
                  onBlur={() => {
                    const amount = parseFloat(loanAmount) || 0;
                    if (maxLoanAmount > 0 && amount > maxLoanAmount) {
                      setShowLtvWarningPopup(true);
                    }
                  }}
                  className="w-full px-4 py-2 border border-black/15 rounded-none border border-black/15 focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                  placeholder="200000"
                  min={1}
                />
                {loanAmount && parseFloat(loanAmount) < 1 && (
                  <p className="text-sm text-red-600 mt-1">
                    Amount must be at least ₹1
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
                  placeholder="12"
                  min={1}
                  max={60}
                />
                {tenure && !isValidTenure() && (
                  <p className="text-sm text-red-600 mt-1">
                    Tenure must be between 1 and 60 months
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* EMI Calculation */}
          {repaymentScheme === 'EMI' && emiAmount > 0 && (
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
              disabled={!selectedCustomerId || !goldWeight || !goldType || !ltvPercentage || !loanAmount || !tenure || !interestRate || !penaltyRate || !repaymentScheme || !isValidLoanAmount() || !isValidTenure() || !itemType || (itemType === 'Other' && !customItemType) || ornamentPhotos.length === 0}
              className="px-6 py-2 bg-yellow-500 text-white rounded-none border border-black/15 hover:bg-yellow-600 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              Create Loan
            </button>


          </div>
        </form>
      </div>

      {showLtvWarningPopup && (
        <div 
          className="fixed inset-0 flex items-center justify-center p-4 animate-fade-in"
          style={{ 
            backgroundColor: 'rgba(0, 0, 0, 0.6)', 
            backdropFilter: 'blur(4px)', 
            zIndex: 99999 
          }}
        >
          <div 
            className="bg-white overflow-hidden w-full shadow-2xl relative border border-black/5 flex flex-col"
            style={{ 
              maxWidth: '320px', 
              borderRadius: '24px'
            }}
          >
            {/* Red header with white warning triangle */}
            <div 
              className="py-8 flex items-center justify-center w-full"
              style={{ backgroundColor: '#f05252' }}
            >
              <AlertTriangle className="w-16 h-16 text-white stroke-[1.5]" />
            </div>
            
            {/* White content body */}
            <div className="p-6 text-center space-y-4 flex flex-col items-center">
              <h3 
                className="text-2xl font-bold text-center"
                style={{ color: '#2d3748' }}
              >
                Warning!
              </h3>
              
              <p className="text-sm text-gray-500 leading-relaxed px-2 text-center">
                LTV Limit is Exceeded! please adjust the loan amount as per LTV Limit
              </p>
              <div className="pt-2 w-full flex justify-center">
                <button
                  type="button"
                  onClick={() => setShowLtvWarningPopup(false)}
                  className="text-white text-xs font-bold tracking-wider py-3 uppercase transition-all duration-200 shadow-md hover:shadow-lg focus:outline-none"
                  style={{ 
                    backgroundColor: '#f05252', 
                    borderRadius: '8px',
                    minWidth: '140px',
                    textAlign: 'center'
                  }}
                >
                  CLOSE
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showOrnamentCamera && (
        <CameraCaptureModal
          title="Capture Ornament Photo"
          isEmbedded={true}
          onClose={() => setShowOrnamentCamera(false)}
          onCapture={(file) => handleFileChange(file)}
        />
      )}
    </div>
  </>
);
}
