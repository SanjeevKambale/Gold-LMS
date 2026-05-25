import { useState, useEffect } from 'react';
import { Send, Clock, CheckCircle, XCircle, Trash2, Search, Filter, X } from 'lucide-react';
import { LoanTransfer, User, Loan } from '../types';
import { getAllTransfers, approveTransfer, rejectTransfer, clearAllTransfers } from '../lib/db/loanTransferService';
import { getAllLoans } from '../lib/db/loanService';
import { logActivity } from '../lib/activityLogger';

interface LoanTransferManagementProps {
  currentUser: User;
}

export function LoanTransferManagement({ currentUser }: LoanTransferManagementProps) {
  const [transfers, setTransfers] = useState<LoanTransfer[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [rejectionTransferId, setRejectionTransferId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const refreshData = () => {
    try {
      setTransfers(getAllTransfers());
      setLoans(getAllLoans());
    } catch {
      setTransfers([]);
      setLoans([]);
    }
  };

  useEffect(() => {
    refreshData();
  }, []);

  const handleApproveTransfer = (transferId: string) => {
    try {
      approveTransfer(transferId, currentUser);
      refreshData();
    } catch (err: any) {
      alert(err.message || 'Failed to approve transfer');
    }
  };

  const handleRejectTransfer = () => {
    if (!rejectionTransferId || !rejectionReason) return;
    try {
      rejectTransfer(rejectionTransferId, currentUser, rejectionReason);
      setRejectionTransferId(null);
      setRejectionReason('');
      refreshData();
    } catch (err: any) {
      alert(err.message || 'Failed to reject transfer');
    }
  };

  const handleClearLogs = () => {
    if (window.confirm('Are you sure you want to clear all loan transfer history? This action cannot be undone.')) {
      try {
        clearAllTransfers(currentUser);
        refreshData();
      } catch (err: any) {
        alert(err.message || 'Failed to clear logs');
      }
    }
  };

  const filteredTransfers = transfers.filter(t => {
    const loan = loans.find(l => l.id === t.loanId);
    const matchesSearch = t.loanId.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         loan?.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         t.toCustomerId.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterStatus === 'all' || t.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Loan Transfer Management</h2>
          <p className="text-gray-500 mt-1">Monitor and approve ownership transfer requests</p>
        </div>
        {currentUser.role === 'admin' && transfers.length > 0 && (
          <button
            onClick={handleClearLogs}
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-none border border-black/15 transition-all border border-black/15 shadow-sm"
          >
            <Trash2 className="w-4 h-4" />
            Clear All History
          </button>
        )}
      </div>

      {/* Stats and Search */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-none border border-black/15 p-6 border border-black/15 shadow-sm space-y-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by Loan ID, Customer, or Target ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-black/15 rounded-none border border-black/15 focus:ring-2 focus:ring-yellow-500 outline-none transition-all"
              />
            </div>
            <div className="flex gap-2">
              {['all', 'pending', 'approved', 'rejected'].map((status) => (
                <button
                  key={status}
                  onClick={() => setFilterStatus(status as any)}
                  className={`px-4 py-2 rounded-none border border-black/15 capitalize transition-all text-sm font-bold border ${
                    filterStatus === status
                      ? 'bg-yellow-500 text-white border-black/15 shadow-lg shadow-yellow-100'
                      : 'bg-white text-gray-600 border-black/15 hover:border-black/15'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-yellow-50 rounded-none border border-black/15 p-6 border border-black/15 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-yellow-800 uppercase tracking-wider">Pending Requests</p>
            <p className="text-3xl font-black text-yellow-900 mt-1">
              {transfers.filter(t => t.status === 'pending').length}
            </p>
          </div>
          <div className="w-14 h-14 bg-white rounded-none border border-black/15 flex items-center justify-center shadow-sm">
            <Clock className="w-7 h-7 text-yellow-600" />
          </div>
        </div>
      </div>

      {/* Transfer History Table */}
      <div className="bg-white rounded-none border border-black/15 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/50 border-b border-black/15">
                <th className="py-4 px-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Loan & Date</th>
                <th className="py-4 px-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Original Owner</th>
                <th className="py-4 px-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Target Recipient</th>
                <th className="py-4 px-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Route</th>
                <th className="py-4 px-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Status</th>
                <th className="py-4 px-6 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredTransfers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-20 text-center">
                    <div className="flex flex-col items-center gap-3 text-gray-400">
                      <Send className="w-12 h-12 opacity-10" />
                      <p className="text-sm font-medium">No transfer requests found</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredTransfers.map((transfer) => {
                  const loan = loans.find(l => l.id === transfer.loanId);
                  return (
                    <tr key={transfer.id} className="hover:bg-gray-50/30 transition-colors group">
                      <td className="py-5 px-6">
                        <div className="flex flex-col">
                          <span className="font-mono text-xs font-bold text-gray-900 group-hover:text-yellow-600 transition-colors">
                            #{transfer.loanId.slice(-6)}
                          </span>
                          <span className="text-[10px] text-gray-400 font-medium mt-1">
                            {new Date(transfer.transferDate).toLocaleDateString()}
                          </span>
                        </div>
                      </td>
                      <td className="py-5 px-6">
                        <p className="text-sm font-bold text-gray-900">{loan?.customerName || 'N/A'}</p>
                        <p className="text-[10px] text-gray-400 font-medium italic">Original Account</p>
                      </td>
                      <td className="py-5 px-6">
                        <p className="text-sm font-bold text-blue-600">{transfer.toCustomerId}</p>
                        <p className="text-[10px] text-gray-400 font-medium italic">Target Customer ID</p>
                      </td>
                      <td className="py-5 px-6">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-none">{transfer.fromBranch}</span>
                          <span className="text-gray-300">→</span>
                          <span className="text-[10px] font-bold text-blue-500 bg-blue-50 px-2 py-0.5 rounded-none">{transfer.toBranch}</span>
                        </div>
                      </td>
                      <td className="py-5 px-6">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border shadow-sm ${
                          transfer.status === 'approved' ? 'bg-green-50 text-green-700 border-black/15' :
                          transfer.status === 'rejected' ? 'bg-red-50 text-red-700 border-black/15' :
                          'bg-yellow-50 text-yellow-700 border-black/15 animate-pulse'
                        }`}>
                          {transfer.status}
                        </span>
                      </td>
                      <td className="py-5 px-6 text-center">
                        {currentUser.role === 'admin' && transfer.status === 'pending' ? (
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleApproveTransfer(transfer.id)}
                              className="p-2.5 bg-green-50 text-green-600 hover:bg-green-100 hover:border-green-600 rounded-none border border-black/15 transition-all shadow-sm hover:scale-110 active:scale-95"
                              title="Approve"
                            >
                              <CheckCircle className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => setRejectionTransferId(transfer.id)}
                              className="p-2.5 bg-red-50 text-red-600 hover:bg-red-100 hover:border-red-600 rounded-none border border-black/15 transition-all shadow-sm hover:scale-110 active:scale-95"
                              title="Reject"
                            >
                              <XCircle className="w-5 h-5" />
                            </button>
                          </div>
                        ) : (
                          <div className="text-[10px] text-gray-400 font-medium italic">
                            {transfer.status === 'approved' ? (
                              <div className="flex flex-col items-center">
                                <span>Approved by</span>
                                <span className="text-green-600 font-bold">{transfer.approvedByName}</span>
                              </div>
                            ) : transfer.status === 'rejected' ? (
                              <div className="flex flex-col items-center max-w-[120px] mx-auto">
                                <span>Rejected:</span>
                                <span className="text-red-500 break-words line-clamp-1" title={transfer.rejectionReason}>{transfer.rejectionReason}</span>
                              </div>
                            ) : (
                              'Awaiting Admin Approval'
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Rejection Modal */}
      {rejectionTransferId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4">
          <div className="bg-white rounded-none border border-black/15 w-full max-w-md shadow-2xl overflow-hidden transform transition-all">
            <div className="bg-red-500 px-6 py-4 flex items-center justify-between text-white">
              <div className="flex items-center gap-3">
                <XCircle className="w-6 h-6" />
                <h3 className="text-xl font-bold uppercase tracking-wide">Reject Request</h3>
              </div>
              <button 
                onClick={() => setRejectionTransferId(null)}
                className="p-1 hover:bg-white/20 rounded-none border border-black/15 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="space-y-2">
                <p className="text-gray-500 text-sm">Please provide a reason for rejecting this transfer.</p>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  className="w-full px-4 py-4 bg-gray-50 border border-black/15 rounded-none border border-black/15 focus:ring-2 focus:ring-red-500 outline-none text-sm min-h-[120px] resize-none"
                  placeholder="e.g. Documentation mismatch, Invalid recipient..."
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setRejectionTransferId(null)}
                  className="py-3 text-sm font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-none border border-black/15 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRejectTransfer}
                  disabled={!rejectionReason}
                  className="py-3 text-sm font-bold bg-red-500 text-white rounded-none border border-black/15 hover:bg-red-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-red-100"
                >
                  Reject Transfer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
