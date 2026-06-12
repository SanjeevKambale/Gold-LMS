import { X, AlertCircle } from 'lucide-react';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
  isLoading?: boolean;
}

export function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  type = 'warning',
  isLoading = false
}: ConfirmationModalProps) {
  if (!isOpen) return null;

  const getColorClasses = () => {
    switch (type) {
      case 'danger':
        return {
          bg: 'bg-red-500 hover:bg-red-600',
          lightBg: 'bg-red-50',
          icon: 'text-red-500',
          border: 'border-black/15'
        };
      case 'info':
        return {
          bg: 'bg-blue-500 hover:bg-blue-600',
          lightBg: 'bg-blue-50',
          icon: 'text-blue-500',
          border: 'border-black/15'
        };
      default:
        return {
          bg: 'bg-yellow-500 hover:bg-yellow-600',
          lightBg: 'bg-yellow-50',
          icon: 'text-yellow-500',
          border: 'border-black/15'
        };
    }
  };

  const colors = getColorClasses();

  return (
    <div className="fixed inset-0 bg-black/70 overflow-y-auto flex items-center justify-center z-[9999] p-4 animate-in fade-in duration-200">
      <div 
        className="bg-white rounded-none border border-black/15 max-w-sm w-full shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-black/15 my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start p-4 border-b border-black/15">
          <div className="flex items-center gap-3">
            <div className={`p-2 ${colors.lightBg} rounded-none border border-black/15`}>
              <AlertCircle className={`w-5 h-5 ${colors.icon}`} />
            </div>
            <h3 className="font-bold text-gray-900 text-lg leading-tight">{title}</h3>
          </div>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded-none border border-black/15 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          <p className="text-gray-600 text-sm leading-relaxed">
            {message}
          </p>
        </div>

        <div className="p-4 bg-gray-50 border-t border-black/15 grid grid-cols-2 gap-3">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="py-2.5 px-4 bg-white border border-black/15 rounded-none border border-black/15 text-gray-700 font-medium hover:bg-gray-100 transition-colors text-sm disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={`py-2.5 px-4 ${colors.bg} text-white rounded-none border border-black/15 font-medium transition-all shadow-sm text-sm active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2`}
          >
            {isLoading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
