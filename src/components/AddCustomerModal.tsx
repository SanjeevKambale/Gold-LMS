import { useState, useRef } from 'react';
import { X, Plus, Trash2, FileText, Camera, Check, Link as LinkIcon, Eye } from 'lucide-react';
import { Customer, KYCDocument } from '../types';
import { saveUploadedFile, openLocalFile } from '../lib/fileService';

interface AddCustomerModalProps {
  onClose: () => void;
  onAdd: (customer: Customer) => void;
}

export function AddCustomerModal({ onClose, onAdd }: AddCustomerModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
  });

  const [kycDocs, setKycDocs] = useState<Partial<KYCDocument>[]>([
    { id: '1', type: 'Aadhaar Card', number: '', status: 'pending' }
  ]);

  const [isUploading, setIsUploading] = useState(false);
  const fileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  const handleAddDoc = () => {
    setKycDocs([
      ...kycDocs,
      { id: Date.now().toString(), type: 'PAN Card', number: '', status: 'pending' }
    ]);
  };

  const handleRemoveDoc = (id: string) => {
    if (kycDocs.length > 1) {
      setKycDocs(kycDocs.filter(doc => doc.id !== id));
    }
  };

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

  const isFormValid = () => {
    const isPersonalInfoValid = !!(formData.name && formData.phone && formData.email && formData.address);
    const areDocsValid = kycDocs.every(doc => validateDocNumber(doc.type || '', doc.number || ''));
    return isPersonalInfoValid && areDocsValid && !isUploading;
  };

  const handleUpdateDoc = (id: string, field: keyof KYCDocument, value: any) => {
    setKycDocs(prev => prev.map(doc => {
      if (doc.id === id) {
        let finalValue = value;
        // Auto-uppercase for certain doc types
        if (field === 'number' && ['PAN Card', 'Voter ID', 'Passport'].includes(doc.type || '')) {
          finalValue = value.toUpperCase();
        }
        return { ...doc, [field]: finalValue };
      }
      return doc;
    }));
  };

  const handleUpdateDocFields = (id: string, updates: Partial<KYCDocument>) => {
    setKycDocs(prev => prev.map(doc => doc.id === id ? { ...doc, ...updates } : doc));
  };

  const handleFileChange = async (id: string, file: File | null) => {
    if (!file) return;
    
    setIsUploading(true);
    try {
      const filePath = await saveUploadedFile(file, formData.name || 'temporary_customer');
      handleUpdateDocFields(id, {
        fileUrl: filePath,
        fileName: file.name,
        fileType: file.type.includes('pdf') ? 'pdf' : 'image'
      });
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate that we have at least one valid doc or whatever requirements
    const finalKycDocs: KYCDocument[] = kycDocs.map(doc => ({
      id: doc.id || Date.now().toString(),
      type: doc.type || 'Other',
      number: doc.number || '',
      status: 'pending',
      fileUrl: doc.fileUrl,
      fileName: doc.fileName,
      fileType: doc.fileType,
    }));

    const newCustomer: Customer = {
      id: Date.now().toString(),
      ...formData,
      kycDocument: finalKycDocs[0]?.type || 'N/A', // Legacy support
      kycNumber: finalKycDocs[0]?.number || 'N/A',   // Legacy support
      kycDocuments: finalKycDocs,
      kycStatus: 'pending',
      createdAt: new Date().toISOString().split('T')[0],
    };

    onAdd(newCustomer);
  };

  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-none border border-black/15 max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-white border-b border-black/15 px-4 md:px-6 py-3 md:py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-yellow-100 rounded-none border border-black/15 flex items-center justify-center text-yellow-600">
              <Plus className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg md:text-xl font-bold text-gray-900">Add New Customer</h3>
              <p className="text-xs text-gray-500">Register a new client and upload KYC documents</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-none border border-black/15 transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 md:p-6 space-y-6 md:space-y-8">
          {/* Personal Information */}
          <div className="space-y-4">
            <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Personal Information
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-gray-600 uppercase ml-1">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-black/15 rounded-none border border-black/15 focus:ring-2 focus:ring-yellow-500 focus:border-transparent outline-none transition-all"
                  placeholder="e.g. John Doe"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-gray-600 uppercase ml-1">
                  Phone Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  required
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-black/15 rounded-none border border-black/15 focus:ring-2 focus:ring-yellow-500 focus:border-transparent outline-none transition-all"
                  placeholder="+91 98765 43210"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-gray-600 uppercase ml-1">
                  Email Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-black/15 rounded-none border border-black/15 focus:ring-2 focus:ring-yellow-500 focus:border-transparent outline-none transition-all"
                  placeholder="john@example.com"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-gray-600 uppercase ml-1">
                  Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-black/15 rounded-none border border-black/15 focus:ring-2 focus:ring-yellow-500 focus:border-transparent outline-none transition-all"
                  placeholder="Full residential address"
                />
              </div>
            </div>
          </div>

          <hr className="border-black/15" />

          {/* Documents Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                <Camera className="w-4 h-4" />
                KYC Verification Documents
              </h4>
              <button
                type="button"
                onClick={handleAddDoc}
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-yellow-600 bg-yellow-50 hover:bg-yellow-100 rounded-none border border-black/15 transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Document
              </button>
            </div>

            <div className="space-y-4">
              {kycDocs.map((doc, index) => (
                <div key={doc.id} className="p-4 md:p-5 bg-gray-50/50 border border-black/15 rounded-none border border-black/15 space-y-4 group hover:border-black/15 transition-colors">
                  <div className="flex items-center justify-between border-b border-black/15 pb-3">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Document #{index + 1}</span>
                    {kycDocs.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveDoc(doc.id!)}
                        className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-bold text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-none border border-black/15 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Remove
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="block text-[10px] font-bold text-gray-500 uppercase ml-1">Document Type</label>
                      <select
                        value={doc.type}
                        onChange={(e) => handleUpdateDoc(doc.id!, 'type', e.target.value)}
                        className="w-full px-3 py-2 text-sm bg-white border border-black/15 rounded-none border border-black/15 focus:ring-2 focus:ring-yellow-500 focus:border-transparent outline-none"
                      >
                        <option value="Aadhaar Card">Aadhaar Card</option>
                        <option value="PAN Card">PAN Card</option>
                        <option value="Passport">Passport</option>
                        <option value="Driving License">Driving License</option>
                        <option value="Voter ID">Voter ID</option>
                        <option value="Ration Card">Ration Card</option>
                        <option value="Bank Passbook">Bank Passbook/Statement</option>
                        <option value="Property Document">Property Document</option>
                        <option value="Utility Bill">Utility Bill</option>
                        <option value="Other">Other Document</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-[10px] font-bold text-gray-500 uppercase ml-1">Document/ID Number</label>
                      <input
                        type="text"
                        required
                        value={doc.number}
                        onChange={(e) => handleUpdateDoc(doc.id!, 'number', e.target.value)}
                        placeholder={doc.type === 'Aadhaar Card' ? "Enter 12-digit number" : "Enter unique ID number"}
                        className={`w-full px-3 py-2 text-sm bg-white border rounded-none border focus:ring-2 focus:ring-yellow-500 focus:border-transparent outline-none transition-all ${
                          doc.number && !validateDocNumber(doc.type || '', doc.number) 
                            ? 'border-red-500 bg-red-50' 
                            : 'border-black/15'
                        }`}
                      />
                      {doc.number && !validateDocNumber(doc.type || '', doc.number) && (
                        <p className="text-[10px] font-bold text-red-500 ml-1">
                          {doc.type === 'Aadhaar Card' ? 'Must be exactly 12 digits' : 
                           doc.type === 'PAN Card' ? 'Invalid PAN format (ABCDE1234F)' : 
                           'Invalid document number format'}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* File Upload Area */}
                  <div className="flex flex-col sm:flex-row items-center gap-3">
                    <input
                      type="file"
                      ref={(el) => (fileInputRefs.current[doc.id!] = el)}
                      onChange={(e) => handleFileChange(doc.id!, e.target.files?.[0] || null)}
                      className="hidden"
                      accept=".pdf,image/*"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRefs.current[doc.id!]?.click()}
                      disabled={isUploading}
                      className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-none border border-black/15 transition-all border-2 border-dashed w-full sm:w-auto justify-center ${
                        doc.fileUrl 
                          ? 'border-black/15 bg-green-50 text-green-700' 
                          : 'border-black/15 bg-white text-gray-500 hover:border-black/15 hover:bg-yellow-50'
                      }`}
                    >
                      {doc.fileUrl ? (
                        <>
                          <Check className="w-4 h-4" />
                          File Uploaded
                        </>
                      ) : (
                        <>
                          <Camera className="w-4 h-4" />
                          {isUploading ? 'Uploading...' : 'Upload Photo/PDF'}
                        </>
                      )}
                    </button>
                    {doc.fileName && (
                      <div className="flex items-center gap-2 text-xs text-gray-400 bg-white px-3 py-1.5 rounded-none border border-black/15">
                        <LinkIcon className="w-3 h-3" />
                        <span className="truncate max-w-[150px] md:max-w-[200px]">{doc.fileName}</span>
                        <div className="flex items-center gap-1 ml-1 border-l pl-2 border-black/15">
                          <button
                            type="button"
                            onClick={() => openLocalFile(doc.fileUrl!)}
                            className="p-1 text-blue-500 hover:bg-blue-50 rounded transition-colors"
                            title="View Document"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdateDocFields(doc.id!, { fileUrl: undefined, fileName: undefined, fileType: undefined })}
                            className="p-1 text-red-500 hover:bg-red-50 rounded transition-colors"
                            title="Remove File"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 bg-yellow-50 border border-black/15 rounded-none border border-black/15">
              <p className="text-xs text-yellow-800 leading-relaxed">
                <strong>Important:</strong> Gold loans require at least two forms of identification (e.g., Aadhaar + PAN). Staff must physically verify original documents before moving to the next stage.
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-6 border-t border-black/15">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 text-sm font-bold text-gray-500 hover:bg-gray-100 rounded-none border border-black/15 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isFormValid()}
              className="px-6 py-2.5 text-sm font-bold bg-yellow-500 text-white rounded-none border border-black/15 hover:bg-yellow-600 transition-all shadow-lg shadow-yellow-100 disabled:bg-gray-200 disabled:shadow-none disabled:cursor-not-allowed"
            >
              Register
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
