import { useState } from 'react';
import { X, CheckCircle, XCircle, Edit2, Save, FileText, ExternalLink, ShieldCheck, Clock } from 'lucide-react';
import { Customer, KYCDocument } from '../types';
import { openLocalFile } from '../lib/fileService';
import { ConfirmationModal } from './ConfirmationModal';
import { getAllCustomers } from '../lib/db/customerService';

interface CustomerDetailsModalProps {
  customer: Customer;
  onClose: () => void;
  onUpdate: (customer: Customer, shouldClose?: boolean) => void;
}

export function CustomerDetailsModal({ customer, onClose, onUpdate }: CustomerDetailsModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Customer>({
    ...customer,
  });

  const [confirmVerifyDocId, setConfirmVerifyDocId] = useState<string | null>(null);
  const [confirmRejectDocId, setConfirmRejectDocId] = useState<string | null>(null);
  const isConfirmOpen = !!confirmVerifyDocId || !!confirmRejectDocId;

  const validateDocNumber = (type: string, number: string) => {
    if (!number) return false;
    const cleanNumber = number.trim().toUpperCase();
    
    switch (type) {
      case 'Aadhaar Card':
        return /^[0-9]{12}$/.test(cleanNumber);
      case 'PAN Card':
        return /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(cleanNumber);
      case 'Voter ID':
        return /^[A-Z0-9]{10}$/.test(cleanNumber);
      case 'Passport':
        return /^[A-Z0-9]{8}$/.test(cleanNumber);
      case 'Driving License':
        return cleanNumber.length >= 10 && cleanNumber.length <= 16;
      default:
        return cleanNumber.length >= 4;
    }
  };

  const isProfileValid = () => {
    const isPersonalInfoValid = !!(formData.name && formData.phone && formData.email && formData.address);
    // Only validate documents if we are in a state where they can be edited (though here they are mostly viewed)
    const areDocsValid = (formData.kycDocuments || []).every(doc => validateDocNumber(doc.type || '', doc.number || ''));
    return isPersonalInfoValid && areDocsValid;
  };

  const handleSave = () => {
    // Check if email already exists for another customer
    const cleanEmail = formData.email ? formData.email.trim().toLowerCase() : '';
    if (cleanEmail) {
      try {
        const allCustomers = getAllCustomers();
        const emailExists = allCustomers.some(c => String(c.id) !== String(customer.id) && c.email && c.email.trim().toLowerCase() === cleanEmail);
        if (emailExists) {
          alert("A customer with this email address is already registered!");
          return;
        }
      } catch (e) {
        console.error('Failed to validate duplicate email:', e);
      }
    }

    onUpdate({
      ...formData,
      kycDocument: formData.kycDocuments?.[0]?.type || formData.kycDocument,
      kycNumber: formData.kycDocuments?.[0]?.number || formData.kycNumber,
    }, true);
    setIsEditing(false);
  };

  const handleDocStatusChange = (docId: string, status: 'verified' | 'rejected') => {
    const updatedDocs = (formData.kycDocuments || []).map(doc => 
      doc.id === docId ? { ...doc, status, verifiedAt: new Date().toISOString() } : doc
    );
    
    // Determine overall status
    let overallStatus: 'pending' | 'verified' | 'rejected' = 'verified';
    if (updatedDocs.some(doc => doc.status === 'rejected')) {
      overallStatus = 'rejected';
    } else if (updatedDocs.some(doc => doc.status === 'pending')) {
      overallStatus = 'pending';
    }

    const updatedCustomer = { ...formData, kycDocuments: updatedDocs, kycStatus: overallStatus };
    setFormData(updatedCustomer);
    onUpdate(updatedCustomer, false);
  };

  const StatusBadge = ({ status }: { status: string }) => {
    const styles = {
      verified: 'bg-green-100 text-green-700 border-black/15',
      rejected: 'bg-red-100 text-red-700 border-black/15',
      pending: 'bg-yellow-100 text-yellow-700 border-black/15',
    };
    return (
      <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-tight border ${styles[status as keyof typeof styles] || styles.pending}`}>
        {status}
      </span>
    );
  };

  return (
    <div className="fixed inset-0 bg-black overflow-y-auto flex items-center justify-center z-50 p-4">
      <div className={`bg-white rounded-none border border-black/15 max-w-3xl w-full shadow-2xl flex flex-col my-auto ${isConfirmOpen ? 'hidden' : ''}`}>
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-black/15 px-6 py-4 flex items-center justify-between z-10">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-none border border-black/15 flex items-center justify-center font-bold text-white shadow-lg ${
                formData.kycStatus === 'verified' ? 'bg-green-500 shadow-green-100' : 
                formData.kycStatus === 'rejected' ? 'bg-red-500 shadow-red-100' : 'bg-yellow-500 shadow-yellow-100'
              }`}>
                {formData.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900">{formData.name}</h3>
                <p className="text-xs text-gray-400 font-medium">Customer ID: {formData.id}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
            {!isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-yellow-700 bg-yellow-50 hover:bg-yellow-100 rounded-none border border-black/15 transition-all"
              >
                <Edit2 className="w-4 h-4" />
                Edit Profile
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-none border border-black/15 transition-colors text-gray-400"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-8">
          {/* Top Info Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gray-50/50 p-4 rounded-none border border-black/15">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Global KYC Status</p>
              <div className="flex items-center gap-2">
                {formData.kycStatus === 'verified' ? <ShieldCheck className="w-5 h-5 text-green-500" /> : <Clock className="w-5 h-5 text-yellow-500" />}
                <span className={`text-lg font-bold capitalize ${
                  formData.kycStatus === 'verified' ? 'text-green-700' :
                  formData.kycStatus === 'rejected' ? 'text-red-700' : 'text-yellow-700'
                }`}>
                  {formData.kycStatus}
                </span>
              </div>
            </div>
            <div className="bg-gray-50/50 p-4 rounded-none border border-black/15">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Phone Number</p>
              <p className="text-sm font-bold text-gray-900">{formData.phone}</p>
            </div>
            <div className="bg-gray-50/50 p-4 rounded-none border border-black/15">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Registration Date</p>
              <p className="text-sm font-bold text-gray-900">{new Date(formData.createdAt).toLocaleDateString()}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-16">
            {/* Left Column: Personal Info */}
            <div className="space-y-6">
              <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2 border-black/15 pl-3">
                Profile Details
              </h4>
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-gray-400 uppercase">Email Address</label>
                    {isEditing ? (
                      <input
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="w-full px-4 py-2.5 bg-gray-50 border border-black/15 rounded-none border border-black/15 focus:ring-2 focus:ring-yellow-500 outline-none"
                      />
                    ) : (
                      <p className="text-sm text-gray-700 font-medium">{formData.email}</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-gray-400 uppercase">Residential Address</label>
                    {isEditing ? (
                      <textarea
                        value={formData.address}
                        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                        rows={3}
                        className="w-full px-4 py-2.5 bg-gray-50 border border-black/15 rounded-none border border-black/15 focus:ring-2 focus:ring-yellow-500 outline-none"
                      />
                    ) : (
                      <p className="text-sm text-gray-700 font-medium leading-relaxed">{formData.address}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="h-px bg-gray-100 my-10" />

            {/* Right Column: KYC Documents */}
            <div className="space-y-6">
              <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2 border-black/15 pl-3">
                KYC Documents & Verification
              </h4>
              <div className="space-y-4">
                {(!formData.kycDocuments || formData.kycDocuments.length === 0) ? (
                  <div className="text-center py-8 bg-gray-50 border border-dashed border-black/15 rounded-none border border-black/15">
                    <p className="text-xs text-gray-400">No modern KYC documents found for this customer.</p>
                  </div>
                ) : (
                  formData.kycDocuments.map((doc) => (
                    <div key={doc.id} className="p-4 bg-white border border-black/15 rounded-none border border-black/15 shadow-sm space-y-3 hover:border-black/15 transition-all">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-blue-50 rounded-none border border-black/15 text-blue-600">
                            <FileText className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-bold text-gray-900">{doc.type}</p>
                              <StatusBadge status={doc.status} />
                            </div>
                            <p className="text-[10px] font-mono font-bold text-gray-400 mt-0.5">ID: {doc.number}</p>
                          </div>
                        </div>
                        {doc.fileUrl && (
                          <button
                            onClick={() => openLocalFile(doc.fileUrl!)}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-none border border-black/15 transition-all"
                            title="Open/Download Document"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-2 pt-4 border-t border-black/15">
                        {doc.status === 'pending' ? (
                          <>
                            <button
                              onClick={() => setConfirmVerifyDocId(doc.id!)}
                              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-green-500 text-white text-sm font-bold rounded-none border border-black/15 hover:bg-green-600 transition-all shadow-lg shadow-green-100"
                            >
                              <CheckCircle className="w-4 h-4" />
                              Verify
                            </button>
                            <button
                              onClick={() => setConfirmRejectDocId(doc.id!)}
                              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-500 text-white text-sm font-bold rounded-none border border-black/15 hover:bg-red-600 transition-all shadow-lg shadow-red-100"
                            >
                              <XCircle className="w-4 h-4" />
                              Reject
                            </button>
                          </>
                        ) : (
                          <div className="flex items-center gap-2 text-[10px] text-gray-400 font-bold italic">
                            <CheckCircle className={`w-3 h-3 ${doc.status === 'verified' ? 'text-green-500' : 'text-red-500'}`} />
                            {doc.status === 'verified' ? 'Physically Verified' : 'Rejected'}
                            {doc.verifiedAt && ` on ${new Date(doc.verifiedAt).toLocaleDateString()}`}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Verification Warning */}
          <div className="p-4 bg-yellow-50 border border-black/15 rounded-none border border-black/15 flex items-start gap-3 mt-6">
             <ShieldCheck className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
             <p className="text-xs text-yellow-800 leading-relaxed font-medium">
               <strong>Verification Protocol:</strong> Please ensure you have visually cross-referenced the physical documents with these uploads. Admin can audit all verification history from their log profile.
             </p>
          </div>

          {/* Footer Actions */}
          {isEditing && (
            <div className="flex items-center justify-end gap-3 pt-6 border-t border-black/15">
              <button
                onClick={() => {
                  setFormData(customer);
                  setIsEditing(false);
                }}
                className="px-6 py-2.5 text-sm font-bold text-gray-500 hover:bg-gray-100 rounded-none border border-black/15 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!isProfileValid()}
                className="flex items-center gap-2 px-6 py-2.5 bg-yellow-500 text-white text-sm font-bold rounded-none border border-black/15 hover:bg-yellow-600 transition-all shadow-lg shadow-yellow-100 disabled:bg-gray-200 disabled:shadow-none disabled:cursor-not-allowed"
              >
                <Save className="w-4 h-4" />
                Update
              </button>
            </div>
          )}
        </div>

      </div>

      {/* Confirmation Modals */}
      <ConfirmationModal
        isOpen={!!confirmVerifyDocId}
        onClose={() => setConfirmVerifyDocId(null)}
        onConfirm={() => {
          if (confirmVerifyDocId) {
            handleDocStatusChange(confirmVerifyDocId, 'verified');
            setConfirmVerifyDocId(null);
          }
        }}
        title="Verify Document?"
        message="Are you sure you want to verify this document? This will update the customer's KYC status and allow them to take loans."
        confirmText="Verify Now"
        type="info"
      />

      <ConfirmationModal
        isOpen={!!confirmRejectDocId}
        onClose={() => setConfirmRejectDocId(null)}
        onConfirm={() => {
          if (confirmRejectDocId) {
            handleDocStatusChange(confirmRejectDocId, 'rejected');
            setConfirmRejectDocId(null);
          }
        }}
        title="Reject Document?"
        message="Are you sure you want to reject this document? The customer will not be able to proceed until they provide a valid document."
        confirmText="Reject Document"
        type="danger"
      />
    </div>
  );
}
