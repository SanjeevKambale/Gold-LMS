import { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Save, Trash2, Building2, Phone, MapPin, CreditCard, AlertTriangle, Users, UserX, RefreshCw, Database, Upload } from 'lucide-react';
import { resetApplicationData, exportDatabase, importDatabase } from '../lib/database';
import { User } from '../types';
import { getAllSettings, updateSettings, AppSettings } from '../lib/db/settingsService';
import { logActivity } from '../lib/activityLogger';
import { Button } from './ui/button';
import { ConfirmationModal } from './ConfirmationModal';
import { deleteUser, getAllUsers } from '../lib/db/authService';
import { clearUserFromStorage } from '../lib/auth';
import { Badge } from './ui/badge';
import { CreateStaffModal } from './CreateStaffModal';
import { UserPlus } from 'lucide-react';

interface SettingsProps {
  currentUser: User;
  onLogout: () => void;
}

export function Settings({ currentUser, onLogout }: SettingsProps) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showCreateStaffModal, setShowCreateStaffModal] = useState(false);
  const [staffToDelete, setStaffToDelete] = useState<User | null>(null);
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [users, setUsers] = useState<User[]>([]);

  const refreshUsers = () => {
    try { setUsers(getAllUsers()); } catch { /* ignore */ }
  };

  useEffect(() => {
    try {
      setSettings(getAllSettings());
      setUsers(getAllUsers());
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  }, []);

  const handleSave = () => {
    if (!settings) return;

    // #13 Basic phone validation
    const phoneClean = settings.shop_phone.trim();
    if (phoneClean && !/^[+\d\s\-()]{7,20}$/.test(phoneClean)) {
      setSaveMessage({ type: 'error', text: 'Invalid phone number format.' });
      return;
    }

    setIsSaving(true);
    setSaveMessage(null);
    try {
      updateSettings(settings);
      setSaveMessage({ type: 'success', text: 'Settings saved successfully!' });
      logActivity(currentUser, 'settings_updated', 'Updated application settings');
    } catch (err) {
      setSaveMessage({ type: 'error', text: 'Failed to save settings.' });
    } finally {
      setIsSaving(false);
      // Clear message after 3 seconds
      setTimeout(() => setSaveMessage(null), 3000);
    }
  };

  const confirmDeleteAccount = () => {
    logActivity(currentUser, 'user_deleted', 'Account deleted by user');
    deleteUser(currentUser.id);
    setShowDeleteConfirm(false);
    // Wait a moment for DB sync before triggering logout
    setTimeout(() => {
      onLogout();
    }, 100);
  };

  const confirmDeleteStaff = () => {
    if (!staffToDelete) return;
    logActivity(currentUser, 'user_deleted', `Admin deleted staff account: ${staffToDelete.name}`);
    deleteUser(staffToDelete.id);
    setStaffToDelete(null);
    refreshUsers();
  };

  const handleResetData = () => {
    try {
      resetApplicationData();
      logActivity(currentUser, 'settings_updated', 'Application Data Reset', 'Factory reset performed by admin');
      onLogout(); // Force logout after reset
    } catch (err) {
      setSaveMessage({ type: 'error', text: 'Failed to reset application data.' });
    }
  };

  const handleBackupData = () => {
    try {
      exportDatabase();
      setSaveMessage({ type: 'success', text: 'Data backup downloaded successfully!' });
      setTimeout(() => setSaveMessage(null), 3000);
      logActivity(currentUser, 'settings_updated', 'Exported database backup', 'Manual data backup initiated');
    } catch (err) {
      setSaveMessage({ type: 'error', text: 'Failed to backup data. Please try again.' });
      setTimeout(() => setSaveMessage(null), 3000);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setImportFile(e.target.files[0]);
      setShowImportConfirm(true);
      // Reset input value so the same file can be selected again if needed
      e.target.value = '';
    }
  };

  const handleImportData = async () => {
    if (!importFile) return;
    try {
      const arrayBuffer = await importFile.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      await importDatabase(uint8Array);
      
      logActivity(currentUser, 'settings_updated', 'Database Restore', 'Database restored from backup file');
      
      setSaveMessage({ type: 'success', text: 'Database restored successfully! Logging out...' });
      setShowImportConfirm(false);
      setImportFile(null);
      
      // Give it a moment to save, then log out
      setTimeout(() => {
        onLogout();
      }, 1500);
      
    } catch (err) {
      setSaveMessage({ type: 'error', text: 'Failed to restore database. Invalid file.' });
      setShowImportConfirm(false);
      setImportFile(null);
    }
  };

  if (!settings) {
    return <div className="p-8 text-center text-gray-500">Loading settings...</div>;
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 md:gap-4 mb-2">
        <div className="p-3 bg-yellow-100 rounded-none border border-black/15 shadow-sm">
          <SettingsIcon className="w-6 h-6 md:w-8 md:h-8 text-yellow-700" />
        </div>
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900">Application Settings</h2>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
        {/* Business Profile */}
        <div className="bg-white rounded-none border border-black/15 shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-all duration-300">
          <div className="px-6 py-4 border-b border-black/15 bg-gray-50/50 flex-shrink-0 flex justify-between items-center">
            <h3 className="flex items-center gap-2 font-bold text-gray-900">
              <Building2 className="w-4 h-4 text-yellow-600" />
              Business Profile
            </h3>
            <Button
              onClick={() => {
                if (settings) {
                  setSettings({
                    ...settings,
                    shop_name: '',
                    shop_phone: '',
                    shop_address: '',
                    shop_upi_id: '',
                  });
                }
              }}
              variant="ghost"
              size="sm"
              className="text-red-500 hover:text-red-700 hover:bg-red-50 h-8 px-3 text-xs font-semibold rounded-none border border-black/15"
            >
              <Trash2 className="w-3 h-3 mr-1" />
              Clear Fields
            </Button>
          </div>
          <div className="p-6 space-y-4 flex-1">
            <div className="space-y-1">
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Shop Name</label>
              <input
                type="text"
                value={settings.shop_name}
                onChange={(e) => setSettings({ ...settings, shop_name: e.target.value })}
                placeholder="Enter shop name"
                className="w-full px-4 py-2.5 border border-black/15 rounded-none border border-black/15 focus:ring-2 focus:ring-yellow-500 focus:border-transparent outline-none transition-all placeholder:text-gray-300"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Shop Phone</label>
              <div className="relative">
                <input
                  type="text"
                  value={settings.shop_phone}
                  onChange={(e) => setSettings({ ...settings, shop_phone: e.target.value })}
                  placeholder="+91-0000000000"
                  className="w-full py-2.5 border border-black/15 rounded-none border border-black/15 focus:ring-2 focus:ring-yellow-500 focus:border-transparent outline-none transition-all placeholder:text-gray-300"
                  style={{ paddingRight: '3rem', paddingLeft: '1rem' }}
                />
                <Phone className="text-gray-400 w-4 h-4" style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', left: 'auto' }} />
              </div>
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Shop Address</label>
              <div className="relative">
                <textarea
                  value={settings.shop_address}
                  onChange={(e) => setSettings({ ...settings, shop_address: e.target.value })}
                  placeholder="Street name, City, Pincode"
                  className="w-full py-2.5 border border-black/15 rounded-none border border-black/15 focus:ring-2 focus:ring-yellow-500 focus:border-transparent outline-none h-20 resize-none transition-all placeholder:text-gray-300"
                  style={{ paddingRight: '3rem', paddingLeft: '1rem' }}
                />
                <MapPin className="text-gray-400 w-4 h-4" style={{ position: 'absolute', right: '1rem', top: '1rem', left: 'auto' }} />
              </div>
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">UPI ID for Payments</label>
              <div className="relative">
                <input
                  type="text"
                  value={settings.shop_upi_id}
                  onChange={(e) => setSettings({ ...settings, shop_upi_id: e.target.value })}
                  placeholder="payee@upi"
                  className="w-full py-2.5 border border-black/15 rounded-none border border-black/15 focus:ring-2 focus:ring-yellow-500 focus:border-transparent outline-none transition-all placeholder:text-gray-300"
                  style={{ paddingRight: '3rem', paddingLeft: '1rem' }}
                />
                <CreditCard className="text-gray-400 w-4 h-4" style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', left: 'auto' }} />
              </div>
            </div>

            {/* In-container Save Button */}
            <div className="pt-4 border-t border-black/15 flex justify-end">
              <Button
                onClick={handleSave}
                disabled={isSaving}
                className="w-full sm:w-fit flex items-center justify-center bg-yellow-500 hover:bg-yellow-600 text-white px-6 py-3 h-auto rounded-none border border-black/15 shadow-md shadow-yellow-100 transition-all font-semibold text-sm md:text-base"
              >
                {isSaving ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Saving...</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Save className="w-5 h-5" />
                    <span>Save Changes</span>
                  </div>
                )}
              </Button>
            </div>
          </div>
        </div>


        {/* Account & User Management */}
        <div className="bg-white rounded-none border border-black/15 shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-all duration-300">
          <div className="px-6 py-4 border-b border-black/15 bg-gray-50/50 flex-shrink-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h3 className="flex items-center gap-2 font-bold text-gray-900">
              <Users className="w-4 h-4 text-blue-600" />
              Account & User Management
            </h3>
            <Button
              onClick={() => setShowCreateStaffModal(true)}
              variant="outline"
              size="sm"
              className="border-black/15 text-blue-600 hover:bg-blue-50 h-8 px-3 text-xs font-semibold rounded-none border border-black/15"
            >
              <UserPlus className="w-3.5 h-3.5 mr-1" />
              Add New Staff
            </Button>
          </div>
          <div className="p-6 flex flex-col flex-1 space-y-6">
            {/* User List */}
            <div>
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">System Users</h4>
              <div className="space-y-2">
                {users.filter((u: User) => u.id !== currentUser.id).length === 0 ? (
                  <p className="py-2 text-xs text-gray-400 italic">No other staff accounts found.</p>
                ) : (
                  users.filter((u: User) => u.id !== currentUser.id).map((user: User) => (
                    <div key={user.id} className="flex items-center justify-between py-2 border-b border-black/15 last:border-0 hover:bg-gray-50/50 transition-colors px-2 rounded-none border border-black/15">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-none border border-black/15 flex items-center justify-center text-xs font-bold shadow-sm ${
                          user.role === 'admin' ? 'bg-yellow-100 text-yellow-700 border border-black/15' : 'bg-blue-100 text-blue-700 border border-black/15'
                        }`}>
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-gray-900">{user.name}</p>
                          <p className="text-[10px] text-gray-500">{user.email}</p>
                        </div>
                      </div>
                      <Button
                        onClick={() => setStaffToDelete(user)}
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 h-8 px-3 text-[10px] font-bold rounded-none border border-black/15"
                      >
                        <UserX className="w-3.5 h-3.5 mr-1" />
                        Delete
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Data Management (Admin Only) */}
            {currentUser.role === 'admin' && (
              <div className="pt-6 border-t border-black/15 mt-4">
                <h4 className="flex items-center gap-2 text-sm font-bold text-gray-900 mb-2">
                  <Database className="w-4 h-4 text-blue-600" />
                  Data Management
                </h4>
                <p className="text-[10px] md:text-xs text-gray-500 mb-4 leading-relaxed">
                  Download a complete backup of the application database, or restore an existing backup. Restoring a backup will overwrite all current data.
                </p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button
                    onClick={handleBackupData}
                    className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-3 h-auto text-sm font-bold rounded-none border border-black/15 shadow-sm hover:shadow-md transition-all"
                  >
                    <Database className="w-4 h-4" />
                    Download Backup
                  </Button>
                  <label className="flex-1 block cursor-pointer">
                    <input 
                      type="file" 
                      accept=".db" 
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <div className="w-full flex items-center justify-center gap-2 bg-white hover:bg-gray-50 text-gray-900 py-3 h-auto text-sm font-bold rounded-none border border-black/15 shadow-sm hover:shadow-md transition-all">
                      <Upload className="w-4 h-4" />
                      Restore Backup
                    </div>
                  </label>
                </div>
              </div>
            )}

            {/* Danger Zone */}
            <div className="pt-6 border-t border-black/15 mt-auto">
              <h4 className="flex items-center gap-2 text-sm font-bold text-red-600 mb-2">
                <AlertTriangle className="w-4 h-4" />
                Danger Zone
              </h4>
              <p className="text-[10px] md:text-xs text-gray-500 mb-4 leading-relaxed">
                Permanently remove your account (<strong>{currentUser.name}</strong>) from the system. 
                <span className="block mt-1 text-red-400 italic font-medium">This action cannot be undone.</span>
              </p>
              <Button
                onClick={() => setShowDeleteConfirm(true)}
                variant="destructive"
                className="w-full flex items-center justify-center gap-2 py-3 h-auto text-sm font-bold rounded-none border border-black/15 shadow-sm shadow-red-100 hover:shadow-md transition-all"
              >
                <Trash2 className="w-4 h-4" />
                Delete My Account
              </Button>

              {/* Reset Application Data (Admin Only) Integrated Below */}
              {currentUser.role === 'admin' && (
                <div className="mt-4">
                  <div 
                    onClick={() => setShowResetConfirm(true)}
                    className="group cursor-pointer flex items-center justify-center gap-2 p-3 border border-black/15 rounded-none border border-black/15 hover:bg-red-50 hover:border-black/15 transition-all duration-300"
                  >
                    <Trash2 className="w-4 h-4 text-red-600 group-hover:scale-110 transition-transform" />
                    <span className="text-sm font-bold text-red-600">Reset</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>



      <div>
        {saveMessage && (
          <div className="pt-4 border-t border-black/15">
            <span className={`text-sm font-medium ${saveMessage.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
              {saveMessage.text}
            </span>
          </div>
        )}
      </div>

      <ConfirmationModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={confirmDeleteAccount}
        title="Delete Account"
        message="DANGER: You are about to PERMANENTLY delete your account. This will remove all your access and clear your session data immediately. This action cannot be undone."
        confirmText="Yes, Delete Permanently"
        type="danger"
      />


      <ConfirmationModal
        isOpen={!!staffToDelete}
        onClose={() => setStaffToDelete(null)}
        onConfirm={confirmDeleteStaff}
        title="Delete Staff Account"
        message={`Are you sure you want to permanently delete the account for "${staffToDelete?.name}"? This action cannot be undone.`}
        confirmText="Yes, Delete Account"
        type="danger"
      />

      <ConfirmationModal
        isOpen={showResetConfirm}
        onClose={() => setShowResetConfirm(false)}
        onConfirm={handleResetData}
        title="Reset Application Data"
        message="DANGER: This will permanently delete all customers, loans, EMI history, user accounts, and shop settings. The application will be reset to factory defaults. This action cannot be undone."
        confirmText="Yes, Reset Factory Defaults"
        type="danger"
      />

      <ConfirmationModal
        isOpen={showImportConfirm}
        onClose={() => {
          setShowImportConfirm(false);
          setImportFile(null);
        }}
        onConfirm={handleImportData}
        title="Restore Database Backup"
        message={`DANGER: You are about to overwrite ALL current application data with the contents of "${importFile?.name}". This action cannot be undone. You will be logged out automatically after the restore.`}
        confirmText="Yes, Overwrite Data"
        type="danger"
      />

      {showCreateStaffModal && (
        <CreateStaffModal
          onClose={() => setShowCreateStaffModal(false)}
          onSuccess={() => {
            refreshUsers();
            setSaveMessage({ type: 'success', text: 'Staff account created successfully!' });
            setTimeout(() => setSaveMessage(null), 3000);
          }}
        />
      )}
    </div>
  );
}
