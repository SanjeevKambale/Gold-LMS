import { useState, useEffect } from 'react';
import { 
  Settings as SettingsIcon, 
  X, 
  Palette, 
  Database, 
  Upload, 
  Trash2, 
  Check, 
  AlertTriangle 
} from 'lucide-react';
import { resetApplicationData, importDatabase } from '../lib/database';
import { getSystemTheme, updateSystemTheme } from '../lib/db/settingsService';
import { Button } from './ui/button';
import { ConfirmationModal } from './ConfirmationModal';

interface PreLoginSettingsModalProps {
  onClose: () => void;
  onDataResetOrImport: () => void;
}

export function PreLoginSettingsModal({ onClose, onDataResetOrImport }: PreLoginSettingsModalProps) {
  const [activeTheme, setActiveTheme] = useState(() => getSystemTheme());
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleThemeChange = (themeId: string) => {
    try {
      updateSystemTheme(themeId);
      document.documentElement.setAttribute('data-theme', themeId);
      setActiveTheme(themeId);
      setMessage({ type: 'success', text: `System theme changed to ${themeId === 'gold' ? 'Classic Gold' : themeId === 'emerald' ? 'Emerald Mint' : themeId === 'ruby' ? 'Royal Crimson' : 'Sleek Obsidian'} successfully!` });
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to update system theme.' });
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const handleResetData = () => {
    try {
      resetApplicationData();
      setShowResetConfirm(false);
      setMessage({ type: 'success', text: 'Application database reset successfully!' });
      setTimeout(() => {
        setMessage(null);
        onDataResetOrImport();
        onClose();
      }, 1500);
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to reset database.' });
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setImportFile(e.target.files[0]);
      setShowImportConfirm(true);
      e.target.value = '';
    }
  };

  const handleImportData = async () => {
    if (!importFile) return;
    try {
      const arrayBuffer = await importFile.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      await importDatabase(uint8Array);
      
      setMessage({ type: 'success', text: 'Database restored successfully!' });
      setShowImportConfirm(false);
      setImportFile(null);
      
      setTimeout(() => {
        setMessage(null);
        onDataResetOrImport();
        onClose();
      }, 1500);
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to restore database. Invalid file.' });
      setShowImportConfirm(false);
      setImportFile(null);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  return (
    <>
      <div 
        className="fixed inset-0 bg-transparent"
        style={{ zIndex: 99999 }}
        onClick={onClose}
      >
        <div 
          className="fixed bg-white border border-black/15 rounded-none max-w-md w-full max-h-[85vh] overflow-y-auto shadow-2xl flex flex-col animate-in slide-in-from-top-5 duration-200"
          style={{
            top: '5.5rem',
            right: '1.5rem',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-black/15 flex items-center justify-between bg-gray-50">
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <SettingsIcon className="w-5 h-5 text-yellow-600 animate-spin-slow" />
              System Setup & Settings
            </h3>
            <button 
              type="button"
              onClick={onClose} 
              className="p-1.5 hover:bg-gray-100 rounded-none border border-black/15 transition-colors"
            >
              <X className="w-4 h-4 text-gray-700" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 space-y-6">
            {message && (
              <div className={`p-4 border rounded-none text-xs font-bold ${
                message.type === 'success' 
                  ? 'bg-green-50 border-green-200 text-green-800' 
                  : 'bg-red-50 border-red-200 text-red-800'
              }`}>
                {message.text}
              </div>
            )}

            {/* System Color Theme */}
            <div className="space-y-3">
              <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
                <Palette className="w-4 h-4 text-yellow-600" />
                Color Theme Option
              </h4>
              <p className="text-xs text-gray-500 leading-relaxed">
                Choose the visual color accents for the application interface.
              </p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { id: 'gold', name: 'Classic Gold', color: '#d4af37' },
                  { id: 'emerald', name: 'Emerald Mint', color: '#10b981' },
                  { id: 'ruby', name: 'Royal Crimson', color: '#fa5252' },
                  { id: 'obsidian', name: 'Sleek Obsidian', color: '#475569' }
                ].map((t) => {
                  const isSelected = activeTheme === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => handleThemeChange(t.id)}
                      className={`flex items-center gap-3 p-3 cursor-pointer transition-all duration-200 border rounded-none hover:bg-gray-50 active:scale-[0.98] ${
                        isSelected
                          ? t.id === 'gold' ? 'border-[#d4af37] bg-[#d4af37]/5 ring-1 ring-[#d4af37]'
                            : t.id === 'emerald' ? 'border-[#10b981] bg-[#10b981]/5 ring-1 ring-[#10b981]'
                            : t.id === 'ruby' ? 'border-[#fa5252] bg-[#fa5252]/5 ring-1 ring-[#fa5252]'
                            : 'border-[#475569] bg-[#475569]/5 ring-1 ring-[#475569]'
                          : 'border-black/15 bg-white'
                      }`}
                    >
                      <div 
                        className="w-4 h-4 rounded-full flex items-center justify-center border border-black/10 shrink-0" 
                        style={{ backgroundColor: t.color }}
                      >
                        {isSelected && (
                          <Check className="w-2.5 h-2.5 text-white stroke-[3.5px]" />
                        )}
                      </div>
                      <span className="text-xs font-bold text-gray-900">{t.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <hr className="border-black/15" />

            {/* Database Management */}
            <div className="space-y-3">
              <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
                <Database className="w-4 h-4 text-blue-600" />
                Database Configuration
              </h4>
              <p className="text-xs text-gray-500 leading-relaxed">
                Import an existing database backup (`.db` SQL file) to restore your system configurations, user accounts, and customer loan data.
              </p>
              <div>
                <label className="block cursor-pointer">
                  <input 
                    type="file" 
                    accept=".db" 
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <div className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-3 font-bold rounded-none border border-black/15 shadow-sm transition-all text-sm">
                    <Upload className="w-4 h-4" />
                    Restore Database Backup
                  </div>
                </label>
              </div>
            </div>

            <hr className="border-black/15" />

            {/* Danger Zone */}
            <div className="space-y-3 bg-red-50/50 p-4 border border-red-200">
              <h4 className="text-sm font-bold text-red-600 uppercase tracking-wider flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                Danger Zone
              </h4>
              <p className="text-xs text-gray-500 leading-relaxed">
                Perform a factory reset to clear all local data. This will wipe all accounts, customer records, and settings.
              </p>
              <Button
                onClick={() => setShowResetConfirm(true)}
                variant="destructive"
                className="w-full flex items-center justify-center gap-2 py-3 text-sm font-bold rounded-none border border-black/15 shadow-sm"
              >
                <Trash2 className="w-4 h-4" />
                Wipe Local Database (Reset)
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modals */}
      <ConfirmationModal
        isOpen={showResetConfirm}
        onClose={() => setShowResetConfirm(false)}
        onConfirm={handleResetData}
        title="Factory Reset Application Data?"
        message="Are you absolutely sure you want to delete ALL application data (users, customers, loans, files, settings)? This action will erase your local database and cannot be undone."
        confirmText="Yes, Factory Reset"
        type="danger"
      />

      <ConfirmationModal
        isOpen={showImportConfirm}
        onClose={() => {
          setShowImportConfirm(false);
          setImportFile(null);
        }}
        onConfirm={handleImportData}
        title="Restore Database from Backup?"
        message={`Are you sure you want to restore the database from "${importFile?.name}"? This will completely overwrite all current application data, settings, and login credentials.`}
        confirmText="Yes, Restore Backup"
        type="warning"
      />
    </>
  );
}
