import { useState, useEffect } from 'react';
import { Plus, Search, Edit2, Eye, CheckCircle, XCircle, Clock, Trash2, AlertTriangle, X } from 'lucide-react';
import { Customer, User } from '../types';
import { getAllCustomers, addCustomer as dbAddCustomer, updateCustomer as dbUpdateCustomer, deleteCustomer as dbDeleteCustomer } from '../lib/db/customerService';
import { AddCustomerModal } from './AddCustomerModal';
import { CustomerDetailsModal } from './CustomerDetailsModal';

import { logActivity } from '../lib/activityLogger';

interface CustomerManagementProps {
  currentUser: User;
}

export function CustomerManagement({ currentUser }: CustomerManagementProps) {
  const [customers, setCustomers] = useState<Customer[]>(() => {
    try { 
      const allCustomers = getAllCustomers();
      return currentUser.role === 'staff'
        ? allCustomers.filter(c => c.createdBy === currentUser.id)
        : allCustomers;
    } catch { return []; }
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'verified' | 'pending' | 'rejected'>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [deleteCustomer, setDeleteCustomer] = useState<Customer | null>(null);

  const refreshCustomers = () => {
    try { 
      const allCustomers = getAllCustomers();
      setCustomers(currentUser.role === 'staff'
        ? allCustomers.filter(c => c.createdBy === currentUser.id)
        : allCustomers);
    } catch {}
  };

  const handleDeleteCustomer = () => {
    if (!deleteCustomer) return;
    dbDeleteCustomer(deleteCustomer.id);
    refreshCustomers();
    logActivity(
      currentUser,
      'customer_deleted',
      `Removed customer: ${deleteCustomer.name}`,
      `Phone: ${deleteCustomer.phone}`
    );
    setDeleteCustomer(null);
  };

  const filteredCustomers = customers.filter(customer => {
    const matchesSearch = customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         customer.phone.includes(searchTerm) ||
                         customer.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterStatus === 'all' || customer.kycStatus === filterStatus;
    return matchesSearch && matchesFilter;
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'verified':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'rejected':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4 text-yellow-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'verified':
        return 'bg-green-100 text-green-800';
      case 'rejected':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-yellow-100 text-yellow-800';
    }
  };

  const handleAddCustomer = (customer: Customer) => {
    const customerWithCreator = { ...customer, createdBy: currentUser.id };
    dbAddCustomer(customerWithCreator);
    refreshCustomers();
    setShowAddModal(false);
    
    // Log activity
    logActivity(
      currentUser,
      'customer_added',
      `Added new customer: ${customer.name}`,
      `Phone: ${customer.phone}, KYC Status: ${customer.kycStatus}`
    );
  };

  const handleViewCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setShowDetailsModal(true);
  };

  const handleUpdateCustomer = (updatedCustomer: Customer, shouldClose: boolean = true) => {
    const oldCustomer = customers.find(c => c.id === updatedCustomer.id);
    dbUpdateCustomer(updatedCustomer);
    refreshCustomers();
    if (shouldClose) {
      setShowDetailsModal(false);
    }
    
    // Check if KYC status changed
    if (oldCustomer && oldCustomer.kycStatus !== updatedCustomer.kycStatus) {
      if (updatedCustomer.kycStatus === 'verified') {
        logActivity(
          currentUser,
          'kyc_verified',
          `Verified KYC for customer: ${updatedCustomer.name}`,
          `Document: ${updatedCustomer.kycDocument}, Number: ${updatedCustomer.kycNumber}`
        );
      } else if (updatedCustomer.kycStatus === 'rejected') {
        logActivity(
          currentUser,
          'kyc_rejected',
          `Rejected KYC for customer: ${updatedCustomer.name}`,
          `Document: ${updatedCustomer.kycDocument}`
        );
      }
    } else {
      logActivity(
        currentUser,
        'customer_updated',
        `Updated customer information: ${updatedCustomer.name}`,
        `Phone: ${updatedCustomer.phone}`
      );
    }
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 md:gap-0">
        <div>
          <h2 className="text-xl md:text-2xl font-semibold text-gray-900">Customer Management</h2>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center justify-center gap-2 bg-yellow-500 text-white px-4 py-2.5 rounded-none border border-black/15 hover:bg-yellow-600 transition-colors"
        >
          <Plus className="w-5 h-5" />
          <span className="text-sm md:text-base">Add Customer</span>
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-none border border-black/15 p-4 md:p-6 border border-black/15 shadow-sm hover:shadow-md transition-all duration-300">
        <div className="flex flex-col gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, phone, or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-sm md:text-base border border-black/15 rounded-none border border-black/15 focus:ring-2 focus:ring-yellow-500 focus:border-transparent transition-all"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-2 px-2 scrollbar-hide">
            {['all', 'verified', 'pending', 'rejected'].map((status) => (
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

      {/* Customer Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        <div className="bg-white rounded-none border border-black/15 p-4 md:p-6 border border-black/15 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col h-full">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs md:text-sm text-gray-500 font-medium">Total Customers</p>
              <p className="text-xl md:text-2xl font-bold text-gray-900 mt-1">{customers.length}</p>
            </div>
            <div className="w-10 h-10 md:w-12 md:h-12 bg-blue-100 rounded-none border border-black/15 flex items-center justify-center shadow-sm">
              <CheckCircle className="w-5 h-5 md:w-6 md:h-6 text-blue-500" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-none border border-black/15 p-4 md:p-6 border border-black/15 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col h-full">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs md:text-sm text-gray-500 font-medium">Verified KYC</p>
              <p className="text-xl md:text-2xl font-bold text-gray-900 mt-1">
                {customers.filter(c => c.kycStatus === 'verified').length}
              </p>
            </div>
            <div className="w-10 h-10 md:w-12 md:h-12 bg-green-100 rounded-none border border-black/15 flex items-center justify-center shadow-sm">
              <CheckCircle className="w-5 h-5 md:w-6 md:h-6 text-green-500" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-none border border-black/15 p-4 md:p-6 border border-black/15 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col h-full">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs md:text-sm text-gray-500 font-medium">Pending KYC</p>
              <p className="text-xl md:text-2xl font-bold text-gray-900 mt-1">
                {customers.filter(c => c.kycStatus === 'pending').length}
              </p>
            </div>
            <div className="w-10 h-10 md:w-12 md:h-12 bg-yellow-100 rounded-none border border-black/15 flex items-center justify-center shadow-sm">
              <Clock className="w-5 h-5 md:w-6 md:h-6 text-yellow-500" />
            </div>
          </div>
        </div>
      </div>

      {/* Customer List Table */}
      <div className="bg-white rounded-none border border-black/15 shadow-sm overflow-hidden hover:shadow-md transition-all duration-300">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Customer</th>
                <th className="text-left py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Contact</th>
                <th className="text-left py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">KYC Info</th>
                <th className="text-left py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="text-left py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Joined</th>
                <th className="text-center py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredCustomers.map((customer) => (
                <tr key={customer.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="py-4 px-6">
                    <div>
                      <p className="text-sm font-bold text-gray-900">{customer.name}</p>
                      <p className="text-xs text-gray-500">{customer.email}</p>
                    </div>
                  </td>
                  <td className="py-4 px-6">
                    <p className="text-sm text-gray-900 font-medium">{customer.phone}</p>
                  </td>
                  <td className="py-4 px-6">
                    <div>
                      <p className="text-sm font-bold text-gray-900">{customer.kycDocument}</p>
                      <p className="text-xs text-gray-500 font-mono tracking-tighter">{customer.kycNumber}</p>
                    </div>
                  </td>
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(customer.kycStatus)}
                      <span className={`inline-flex items-center px-4 py-1 rounded-full text-[10px] font-bold tracking-wide border border-current ${getStatusColor(customer.kycStatus)}`}>
                        {customer.kycStatus}
                      </span>
                    </div>
                  </td>
                  <td className="py-4 px-6">
                    <p className="text-sm text-gray-900">{new Date(customer.createdAt).toLocaleDateString()}</p>
                  </td>
                  <td className="py-4 px-6 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => handleViewCustomer(customer)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-none border border-black/15 transition-all hover:scale-110"
                      >
                        <Eye className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => handleViewCustomer(customer)}
                        className="p-2 text-gray-600 hover:bg-gray-100 rounded-none border border-black/15 transition-all hover:scale-110"
                      >
                        <Edit2 className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => setDeleteCustomer(customer)}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-none border border-black/15 transition-all hover:scale-110"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Customer List - Mobile Row View - REMOVED */}
      <div className="hidden bg-white rounded-none border border-black/15 shadow-sm overflow-hidden">
        {filteredCustomers.length === 0 ? (
          <div className="p-10 text-center">
            <Search className="w-12 h-12 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No customers found.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredCustomers.map((customer) => (
              <div key={customer.id} className="p-4 flex items-center justify-between gap-3 hover:bg-gray-50 transition-colors active:bg-gray-100">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white shadow-sm flex-shrink-0 ${
                    customer.kycStatus === 'verified' ? 'bg-green-500' : 
                    customer.kycStatus === 'rejected' ? 'bg-red-500' : 'bg-yellow-500'
                  }`}>
                    {customer.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold text-gray-900 truncate">{customer.name}</h4>
                    <p className="text-xs text-gray-500 truncate">{customer.phone}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border border-current ${
                        customer.kycStatus === 'verified' ? 'bg-green-100 text-green-600 border-black/15' : 
                        customer.kycStatus === 'rejected' ? 'bg-red-100 text-red-600 border-black/15' : 'bg-yellow-100 text-yellow-600 border-black/15'
                      }`}>
                        {customer.kycStatus}
                      </span>
                      <span className="text-[9px] text-gray-300">•</span>
                      <span className="text-[9px] text-gray-400 font-mono">UID: {customer.id.slice(-6)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => handleViewCustomer(customer)}
                    className="p-2 text-blue-600 bg-blue-50 rounded-none border border-black/15 hover:bg-blue-100 transition-colors"
                    title="View Details"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleViewCustomer(customer)}
                    className="p-2 text-gray-600 bg-gray-50 rounded-none border border-black/15 hover:bg-gray-100 transition-colors"
                    title="Edit"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setDeleteCustomer(customer)}
                    className="p-2 text-red-500 bg-red-50 rounded-none border border-black/15 hover:bg-red-100 transition-colors"
                    title="Remove"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showAddModal && (
        <AddCustomerModal
          onClose={() => setShowAddModal(false)}
          onAdd={handleAddCustomer}
        />
      )}

      {showDetailsModal && selectedCustomer && (
        <CustomerDetailsModal
          customer={selectedCustomer}
          onClose={() => setShowDetailsModal(false)}
          onUpdate={handleUpdateCustomer}
        />
      )}

      {/* Delete Customer Confirmation Modal */}
      {deleteCustomer && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-none border border-black/15 w-full max-w-sm shadow-2xl relative overflow-hidden">
            <button 
              onClick={() => setDeleteCustomer(null)}
              className="absolute text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors flex justify-center items-center"
              style={{ top: '1rem', right: '1rem', width: '2rem', height: '2rem' }}
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex flex-col items-center px-6 pt-6 pb-4 border-b border-black/15">
              <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mb-3">
                <AlertTriangle className="w-7 h-7 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900">Remove Customer?</h3>
              <p className="text-sm text-gray-500 mt-1 text-center">This action cannot be undone.</p>
            </div>
            <div className="px-6 py-4">
              <p className="text-sm text-gray-700 text-center">
                Permanently remove <strong>{deleteCustomer.name}</strong> from the system?
              </p>
              <div className="mt-3 bg-red-50 rounded-none border border-black/15 p-3 text-xs text-gray-600 space-y-1">
                <p>• Phone: {deleteCustomer.phone}</p>
                <p>• KYC: {deleteCustomer.kycDocument} — {deleteCustomer.kycNumber}</p>
              </div>
            </div>
            <div className="px-6 pb-6 flex flex-col gap-2 relative z-10">
              <button
                onClick={handleDeleteCustomer}
                className="w-full py-2.5 bg-red-500 text-white font-medium rounded-none border border-black/15 hover:bg-red-600 active:bg-red-700 transition-colors flex items-center justify-center gap-2"
                style={{ marginTop: '0.75rem' }}
              >
                <Trash2 className="w-4 h-4" />
                Remove Customer
              </button>
              <button
                onClick={() => setDeleteCustomer(null)}
                className="w-full py-2.5 text-gray-700 bg-gray-100 font-medium rounded-none border border-black/15 hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
