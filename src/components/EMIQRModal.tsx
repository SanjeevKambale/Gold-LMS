import { useEffect, useRef, useState } from 'react';
import { X, Download, QrCode, Share2, Info } from 'lucide-react';
import { EMI } from '../types';
import { getAllSettings } from '../lib/db/settingsService';

// @ts-expect-error - qrcode types not installed
import QRCode from 'qrcode';

interface EMIQRModalProps {
  emi: EMI;
  onClose: () => void;
  customerPhone?: string;
}

export function EMIQRModal({ emi, onClose, customerPhone }: EMIQRModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const settings = getAllSettings();
  const { shop_name, shop_upi_id } = settings;

  const upiLink = `upi://pay?pa=${encodeURIComponent(shop_upi_id)}&pn=${encodeURIComponent(shop_name)}&am=${emi.amount}&tn=${encodeURIComponent(`EMI #${emi.emiNumber} - Loan ${emi.loanId}`)}&cu=INR`;

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, upiLink, {
        width: 180,
        margin: 2,
        color: { dark: '#1a1a1a', light: '#ffffff' },
        errorCorrectionLevel: 'M',
      }, (err: Error | null) => {
        if (!err && canvasRef.current) {
          setQrDataUrl(canvasRef.current.toDataURL('image/png'));
        }
      });
    }
  }, [upiLink]);

  const handleDownload = () => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `EMI-QR-Loan${emi.loanId}-EMI${emi.emiNumber}.png`;
    a.click();
  };

  const whatsappMsg = encodeURIComponent(
    `Hello ${emi.customerName},\n\n` +
    `Your EMI #${emi.emiNumber} for Loan #${emi.loanId} is due on *${new Date(emi.dueDate).toLocaleDateString('en-IN')}*.\n\n` +
    `💰 Amount: *₹${emi.amount.toLocaleString('en-IN')}*\n\n` +
    `📱 You can pay via any UPI app (GPay, PhonePe, Paytm):\n` +
    `UPI ID: *${shop_upi_id}*\n\n` +
    `After payment, please share the transaction screenshot or UPI reference number.\n\n` +
    `Thank you!\n— ${shop_name}`
  );

  const whatsappUrl = customerPhone
    ? `https://wa.me/91${customerPhone.replace(/\D/g, '')}?text=${whatsappMsg}`
    : `https://wa.me/?text=${whatsappMsg}`;

  const handleCopyUPI = () => {
    navigator.clipboard.writeText(shop_upi_id).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-none border border-black/15 max-w-sm w-full shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
        <div className="bg-yellow-500 px-4 py-3 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-white" />
            <h3 className="text-white font-bold text-base">UPI Payment QR</h3>
          </div>
          <button onClick={onClose} className="text-white hover:opacity-80 transition-opacity p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="overflow-y-auto flex-1 p-4 space-y-4 custom-scrollbar">
          {/* Customer + EMI Info */}
          <div>
            <p className="text-sm font-semibold text-gray-900">{emi.customerName}</p>
            <div className="flex justify-between mt-1">
              <span className="text-xs text-gray-500">Loan #{emi.loanId} · EMI #{emi.emiNumber}</span>
              <span className="text-xs text-gray-500">Due: {new Date(emi.dueDate).toLocaleDateString('en-IN')}</span>
            </div>
            <div className="mt-3 bg-yellow-50 border border-black/15 rounded-none border border-black/15 px-3 py-3">
              <p className="text-center text-2xl font-bold text-yellow-700">₹{emi.amount.toLocaleString('en-IN')}</p>
              <p className="text-center text-xs text-yellow-600 mt-0.5">EMI Amount to Pay</p>
            </div>
          </div>

          {/* QR Code */}
          <div className="flex flex-col items-center bg-gray-50 rounded-none border border-black/15 p-3 border border-black/15">
            <canvas ref={canvasRef} className="rounded-none border border-black/15 shadow-sm bg-white" />
            <p className="text-xs text-gray-500 mt-2">Scan with any UPI app</p>
          </div>

          {/* UPI ID */}
          <div className="flex items-center justify-between bg-gray-100 border border-black/15 rounded-none border border-black/15 px-4 py-2.5">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold mb-0.5">Shop UPI ID</p>
              <p className="text-sm font-mono font-bold text-gray-800">{shop_upi_id}</p>
            </div>
            <button
              onClick={handleCopyUPI}
              className="text-xs bg-white border border-black/15 rounded-none border border-black/15 px-3 py-1.5 hover:bg-gray-50 transition-colors font-medium text-gray-700 shadow-sm"
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>

          {/* Info Note */}
          <div className="flex gap-2.5 bg-blue-50 border border-black/15 rounded-none border border-black/15 p-3">
            <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-blue-700 leading-relaxed">
              Customer can pay via <strong>GPay, PhonePe, Paytm</strong>.
              After payment, copy the transaction ID to mark this EMI as paid.
            </p>
          </div>
        </div>

        {/* Action Buttons - Fixed at bottom */}
        <div className="p-4 bg-white border-t border-black/15 flex-shrink-0 grid grid-cols-2 gap-3">
          <button
            onClick={handleDownload}
            disabled={!qrDataUrl}
            className="flex items-center justify-center gap-2 py-2.5 bg-yellow-500 text-white rounded-none border border-black/15 font-medium hover:bg-yellow-600 transition-colors disabled:opacity-50 text-sm shadow-sm"
          >
            <Download className="w-4 h-4" />
            Download
          </button>
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 py-2.5 bg-green-500 text-white rounded-none border border-black/15 font-medium hover:bg-green-600 transition-colors text-sm shadow-sm"
          >
            <Share2 className="w-4 h-4" />
            WhatsApp
          </a>
        </div>
      </div>
    </div>
  );
}
