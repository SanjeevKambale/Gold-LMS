import { useState, useEffect } from 'react';
import { 
  CheckCircle2, 
  XCircle, 
  Clock, 
  ArrowRight, 
  FileText, 
  User as UserIcon, 
  ShieldAlert, 
  Search,
  AlertTriangle,
  Download
} from 'lucide-react';
import { LoanTransfer, User } from '../types';
import { getPendingTransfers, approveTransfer, rejectTransfer, getAllTransfers } from '../lib/db/loanTransferService';
import { ConfirmationModal } from './ConfirmationModal';
import { generateExcelXML } from '../lib/reportUtils';


interface AdminTransferDashboardProps {
  currentUser: User;
}

export function AdminTransferDashboard({ currentUser }: AdminTransferDashboardProps) {
  const [transfers, setTransfers] = useState<LoanTransfer[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    id: string;
    type: 'approve' | 'reject';
    show: boolean;
  }>({ id: '', type: 'approve', show: false });
  const [rejectionReason, setRejectionReason] = useState('');

  const loadTransfers = () => {
    setTransfers(getPendingTransfers());
  };

  useEffect(() => {
    loadTransfers();
  }, []);

  const handleAction = async () => {
    if (!confirmModal.id) return;
    setIsLoading(true);
    try {
      if (confirmModal.type === 'approve') {
        approveTransfer(confirmModal.id, currentUser);
      } else {
        if (!rejectionReason) throw new Error('Please provide a reason for rejection');
        rejectTransfer(confirmModal.id, currentUser, rejectionReason);
      }
      loadTransfers();
      setConfirmModal({ ...confirmModal, show: false });
      setRejectionReason('');
    } catch (err: any) {
      alert(err.message || 'Operation failed');
    } finally {
      setIsLoading(false);
    }
  };

  const filteredTransfers = transfers.filter(t => 
    t.loanId.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.requestedByName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const exportReport = () => {
    const allTransfers = getAllTransfers();
    const timestamp = new Date().toISOString().split('T')[0];
    const headers = [
      'DATE', 
      'LOAN ID', 
      'FROM CUSTOMER', 
      'TO CUSTOMER', 
      'FROM BRANCH', 
      'TO BRANCH', 
      'AMOUNT', 
      'STATUS', 
      'REQUESTED BY', 
      'PROCESSED BY',
      'REASON / REMARKS'
    ];
    
    const data = allTransfers.map(t => [
      new Date(t.transferDate).toLocaleString(),
      t.loanId,
      t.fromCustomerId,
      t.toCustomerId,
      t.fromBranch || 'Main Branch',
      t.toBranch || '-',
      t.outstandingAmount,
      t.status.toUpperCase(),
      t.requestedByName,
      t.approvedByName || '-',
      t.status === 'rejected' ? `Rejected: ${t.rejectionReason}` : t.reason
    ]);

    const xmlData = generateExcelXML(headers, data, [140, 100, 120, 120, 120, 120, 100, 100, 120, 120, 250]);
    const blob = new Blob([xmlData], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Loan_Transfers_Report_${timestamp}.xls`;
    a.click();
    URL.revokeObjectURL(url);
  };


  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-3">
            <ShieldAlert className="w-8 h-8 text-yellow-500" />
            LOAN TRANSFER REQUESTS
          </h2>
          <p className="text-sm text-gray-500 font-medium tracking-wide">Review and approve ownership change requests from staff</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by Loan ID or Staff..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 bg-white border border-black/15 rounded-none border border-black/15 focus:ring-2 focus:ring-yellow-500 outline-none w-full md:w-64 shadow-sm text-sm"
            />
          </div>
          <button
            onClick={exportReport}
            className="flex items-center gap-2 px-4 py-2 bg-yellow-500 text-white rounded-none border border-black/15 hover:bg-yellow-600 transition-all text-sm font-bold shadow-lg shadow-yellow-100"
          >
            <Download className="w-4 h-4" />
            Download Report
          </button>
        </div>
      </div>

      {filteredTransfers.length === 0 ? (
        <div className="bg-white rounded-none border border-black/15 border-dashed border-black/15 p-12 text-center">
          <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Clock className="w-10 h-10 text-gray-300" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-1">Queue Empty</h3>
          <p className="text-sm text-gray-400">There are no pending loan transfer requests to review.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredTransfers.map((transfer) => (
            <div key={transfer.id} className="bg-white rounded-none border border-black/15 shadow-sm hover:shadow-md transition-all overflow-hidden group">
              <div className="p-5 flex flex-col md:flex-row gap-6">
                {/* Transfer Info */}
                <div className="flex-1 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                       <span className="px-3 py-1 bg-yellow-500 text-white text-[10px] font-black rounded-none border border-black/15 uppercase">Loan Request</span>
                       <span className="text-xs font-bold text-gray-400">ID: {transfer.loanId}</span>
                    </div>
                    <span className="text-xs font-bold text-gray-400 italic">requested on {new Date(transfer.transferDate).toLocaleDateString()}</span>
                  </div>

                  <div className="flex items-center gap-4 bg-gray-50 rounded-none border border-black/15 p-4 border border-black/15/50">
                    <div className="flex-1">
                      <p className="text-[10px] font-black text-gray-400 uppercase mb-1">From Customer ID</p>
                      <p className="text-sm font-bold text-gray-900 font-mono">{transfer.fromCustomerId}</p>
                      <p className="text-[10px] font-bold text-gray-500 mt-1">{transfer.fromBranch}</p>
                    </div>
                    <div className="p-2 bg-white shadow-sm rounded-full text-yellow-600 border border-black/15">
                      <ArrowRight className="w-4 h-4" />
                    </div>
                    <div className="flex-1">
                      <p className="text-[10px] font-black text-blue-400 uppercase mb-1">To Customer ID</p>
                      <p className="text-sm font-bold text-blue-600 font-mono">{transfer.toCustomerId}</p>
                      <p className="text-[10px] font-bold text-blue-500 mt-1">{transfer.toBranch}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-gray-50 rounded-none border border-black/15">
                      <FileText className="w-4 h-4 text-gray-400" />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-gray-400 uppercase mb-0.5">Transfer Reason</p>
                      <p className="text-xs text-gray-700 font-medium leading-relaxed italic">"{transfer.reason}"</p>
                    </div>
                  </div>
                </div>

                {/* Status & Actions */}
                <div className="md:w-64 flex flex-col justify-between border-l border-black/15 md:pl-6 pt-4 md:pt-0">
                  <div className="space-y-4">
                    <div className="bg-gray-900 text-white p-4 rounded-none border border-black/15 shadow-xl shadow-gray-200">
                       <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Outstanding Balance</p>
                       <p className="text-xl font-black italic">₹{transfer.outstandingAmount.toLocaleString('en-IN')}</p>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-none border border-black/15 text-blue-700">
                      <UserIcon className="w-3.5 h-3.5" />
                      <p className="text-[10px] font-bold uppercase truncate">Requested by: {transfer.requestedByName}</p>
                    </div>
                  </div>

                  <div className="flex gap-2 mt-6">
                    <button
                      onClick={() => setConfirmModal({ id: transfer.id, type: 'reject', show: true })}
                      disabled={isLoading}
                      className="flex-1 py-2.5 bg-red-50 text-red-600 hover:bg-red-500 hover:text-white text-xs font-bold uppercase rounded-none border border-black/15 transition-all flex items-center justify-center gap-2"
                    >
                      <XCircle className="w-4 h-4" />
                      Reject
                    </button>
                    <button
                      onClick={() => setConfirmModal({ id: transfer.id, type: 'approve', show: true })}
                      disabled={isLoading}
                      className="flex-1 py-2.5 bg-green-500 text-white hover:bg-green-600 text-xs font-bold uppercase rounded-none border border-black/15 transition-all shadow-lg shadow-green-100 flex items-center justify-center gap-2"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Approve
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Rejection / Approval Confirmation Modal */}
      {confirmModal.show && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-none border border-black/15 max-w-md w-full shadow-2xl overflow-hidden p-6 space-y-6">
            <div className="text-center space-y-2">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto ${
                confirmModal.type === 'approve' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
              }`}>
                {confirmModal.type === 'approve' ? <CheckCircle2 className="w-8 h-8" /> : <AlertTriangle className="w-8 h-8" />}
              </div>
              <h3 className="text-xl font-bold text-gray-900 capitalize">
                {confirmModal.type} Loan Transfer?
              </h3>
              <p className="text-sm text-gray-500">
                Are you sure you want to {confirmModal.type} this ownership change? This operation will be logged.
              </p>
            </div>

            {confirmModal.type === 'reject' && (
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Rejection Reason</label>
                <textarea
                  required
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Provide a reason for the staff..."
                  className="w-full px-4 py-3 bg-gray-50 border border-black/15 rounded-none border border-black/15 focus:ring-2 focus:ring-red-500 outline-none text-sm min-h-[100px]"
                />
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => {
                  setConfirmModal({ ...confirmModal, show: false });
                  setRejectionReason('');
                }}
                className="flex-1 py-3 text-sm font-bold text-gray-500 bg-gray-50 hover:bg-gray-100 rounded-none border border-black/15 transition-all"
              >
                Go Back
              </button>
              <button
                onClick={handleAction}
                disabled={isLoading || (confirmModal.type === 'reject' && !rejectionReason)}
                className={`flex-1 py-3 text-sm font-bold text-white rounded-none border border-black/15 transition-all shadow-lg ${
                  confirmModal.type === 'approve' 
                    ? 'bg-green-500 hover:bg-green-600 shadow-green-100' 
                    : 'bg-red-500 hover:bg-red-600 shadow-red-100'
                }`}
              >
                {isLoading ? 'Processing...' : `Confirm ${confirmModal.type}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
