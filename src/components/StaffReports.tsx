import { useState, useMemo, useEffect } from 'react';
import { User, Loan, EMI, Customer, Payment } from '../types';
import { getAllUsers } from '../lib/db/authService';
import { getAllLoans, deleteLoan } from '../lib/db/loanService';
import { getAllEMIs, resetEMIPayment } from '../lib/db/emiService';
import { getAllCustomers, deleteCustomer } from '../lib/db/customerService';
import { getAllPayments, deletePayment } from '../lib/db/paymentService';
import { openLocalFile, getFileUrl } from '../lib/fileService';
import { getSystemWorkingDate } from '../lib/workingDate';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import ExcelJS from 'exceljs';
import { getAllSettings } from '../lib/db/settingsService';
import {
  Calendar,
  Activity,
  CheckCircle,
  AlertTriangle,
  Users,
  Wallet,
  Box,
  Camera,
  Phone,
  ArrowUpRight,
  ArrowDownLeft,
  Search,
  Trash2,
  Printer,
  Download,
  FileText,
  X,
} from 'lucide-react';

interface StaffReportsProps {
  currentUser: User;
}

type ReportType =
  | 'daily_collection'
  | 'active_loans'
  | 'closed_loans'
  | 'overdue_loans'
  | 'customer_statements'
  | 'cashbook'
  | 'gold_inventory'
  | null;

async function exportReportExcel(
  filename: string,
  title: string,
  subtitle: string,
  headers: string[],
  rows: (string | number)[][]
) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Report');

  const shop = getAllSettings();
  const shopName = shop.shop_name || 'Gold Loan Manager';
  const shopAddress = shop.shop_address || '';
  const shopPhone = shop.shop_phone || '';

  // Ensure grid lines are visible
  worksheet.views = [{ showGridLines: true }];

  // 1. Shop Info Header
  worksheet.mergeCells('A1:F1');
  const shopCell = worksheet.getCell('A1');
  shopCell.value = shopName.toUpperCase();
  shopCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FFA76A02' } }; // Gold color
  shopCell.alignment = { vertical: 'middle', horizontal: 'left' };
  worksheet.getRow(1).height = 28;

  worksheet.mergeCells('A2:F2');
  const shopInfoCell = worksheet.getCell('A2');
  shopInfoCell.value = `${shopAddress} ${shopPhone ? ' | ' + shopPhone : ''}`;
  shopInfoCell.font = { name: 'Arial', size: 9, color: { argb: 'FF666666' } };
  shopInfoCell.alignment = { vertical: 'middle', horizontal: 'left' };
  worksheet.getRow(2).height = 18;

  // Space row 3
  worksheet.getRow(3).height = 10;

  // 2. Report Details
  worksheet.mergeCells('A4:F4');
  const titleCell = worksheet.getCell('A4');
  titleCell.value = title.toUpperCase();
  titleCell.font = { name: 'Arial', size: 13, bold: true, color: { argb: 'FF000000' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
  worksheet.getRow(4).height = 22;

  worksheet.mergeCells('A5:F5');
  const subtitleCell = worksheet.getCell('A5');
  subtitleCell.value = subtitle;
  subtitleCell.font = { name: 'Arial', size: 9, italic: true, color: { argb: 'FF888888' } };
  subtitleCell.alignment = { vertical: 'middle', horizontal: 'left' };
  worksheet.getRow(5).height = 18;

  // Space row 6
  worksheet.getRow(6).height = 15;

  // Identify column roles
  const idColIndices = headers
    .map((h, i) => {
      const lower = h.toLowerCase();
      if (
        lower.includes('id') ||
        lower.includes('contact') ||
        lower.includes('phone') ||
        lower.includes('packet') ||
        lower.includes('locker')
      ) {
        return i;
      }
      return -1;
    })
    .filter(idx => idx !== -1);

  // 3. Add Headers (Row 7)
  const headerRowNumber = 7;
  const headerRow = worksheet.getRow(headerRowNumber);
  headerRow.height = 26;

  headers.forEach((headerText, colIndex) => {
    const cell = headerRow.getCell(colIndex + 1);
    cell.value = headerText.toUpperCase();
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFCA8A04' } // Yellow-600 gold color
    };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
    cell.border = {
      bottom: { style: 'medium', color: { argb: 'FFA76A02' } }
    };
  });

  // 4. Add Data Rows
  rows.forEach((row, rowIndex) => {
    const rowNumber = headerRowNumber + 1 + rowIndex;
    const excelRow = worksheet.getRow(rowNumber);
    excelRow.height = 20;

    const isTotalRow = String(row[0]).toUpperCase().includes('TOTAL') || String(row[0]).toUpperCase().includes('NET');

    row.forEach((cellValue, colIndex) => {
      const cell = excelRow.getCell(colIndex + 1);

      // Styles
      const isAltRow = rowIndex % 2 === 1;
      const cellFillColor = isTotalRow
        ? 'FFFDF4E3' // Gold light highlight for totals row
        : isAltRow
        ? 'FEFCF0' // Very light gold/yellow alternate row
        : 'FFFFFFFF'; // White

      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: cellFillColor }
      };

      // Border styling
      if (isTotalRow) {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFCA8A04' } },
          bottom: { style: 'double', color: { argb: 'FFCA8A04' } }
        };
      } else {
        cell.border = {
          bottom: { style: 'thin', color: { argb: 'FFEAEAEA' } }
        };
      }

      // Check if it's an ID or contact column
      const isIdCol = idColIndices.includes(colIndex);

      if (isIdCol && cellValue !== null && cellValue !== undefined && !isTotalRow) {
        // Keep strictly as text to prevent scientific notation & leading zero loss
        cell.value = String(cellValue);
        cell.numFmt = '@'; // Text format
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
        cell.font = { name: 'Arial', size: 9, bold: isTotalRow };
      } else {
        // Parse currency strings into actual numbers for professional calculations!
        const parsed = typeof cellValue === 'string' ? cellValue.trim() : '';
        const isNegative = parsed.startsWith('-') || parsed.includes('- ₹');
        const hasCurrency = parsed.includes('₹') || parsed.includes('Rs.');
        
        // Extract digits and decimal point
        const digits = parsed.replace(/[^\d.-]/g, '');

        if (hasCurrency && digits !== '' && !isNaN(Number(digits))) {
          const num = Number(digits);
          cell.value = isNegative ? -Math.abs(num) : num;
          cell.numFmt = '₹#,##0';
          cell.alignment = { vertical: 'middle', horizontal: 'right' };
          cell.font = { name: 'Arial', size: 9, bold: isTotalRow };
        } else if (typeof cellValue === 'number') {
          cell.value = cellValue;
          cell.alignment = { vertical: 'middle', horizontal: 'right' };
          cell.font = { name: 'Arial', size: 9, bold: isTotalRow };
        } else {
          // Standard text
          cell.value = cellValue;
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
          cell.font = { name: 'Arial', size: 9, bold: isTotalRow };
        }
      }
    });
  });

  // 5. Auto-fit column widths
  headers.forEach((_, colIndex) => {
    const column = worksheet.getColumn(colIndex + 1);
    let maxLength = 0;
    column.eachCell({ includeEmpty: true }, (cell) => {
      let cellLength = 0;
      if (cell.value !== null && cell.value !== undefined) {
        if (cell.numFmt === '₹#,##0' && typeof cell.value === 'number') {
          cellLength = cell.value.toLocaleString().length + 2; // account for Rupee sign
        } else {
          cellLength = String(cell.value).length;
        }
      }
      if (cellLength > maxLength) {
        maxLength = cellLength;
      }
    });
    // Set column width with safety padding
    column.width = Math.max(maxLength + 4, 12);
  });

  // 6. Save Workbook
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.xlsx') ? filename : `${filename.split('.')[0]}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function printTable(title: string, subtitle: string, headers: string[], rows: (string | number)[][]) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  const shop = getAllSettings();
  const shopName = shop.shop_name || 'Gold Loan Manager';
  const shopAddress = shop.shop_address || '';
  const shopPhone = shop.shop_phone || '';

  const html = `
    <html>
      <head>
        <title>${title}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 30px; color: #333; }
          .header { text-align: center; border-bottom: 2px solid #ca8a04; padding-bottom: 15px; margin-bottom: 20px; }
          .shop-name { font-size: 24px; font-weight: bold; color: #ca8a04; margin-bottom: 5px; text-transform: uppercase; }
          .shop-info { font-size: 12px; color: #666; }
          .report-title { font-size: 18px; font-weight: bold; margin-top: 15px; text-transform: uppercase; }
          .report-subtitle { font-size: 12px; color: #666; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; }
          th { background-color: #f8f9fa; border-bottom: 2px solid #dee2e6; color: #495057; font-weight: bold; padding: 10px; text-align: left; font-size: 12px; text-transform: uppercase; }
          td { border-bottom: 1px solid #dee2e6; padding: 10px; font-size: 12px; color: #212529; }
          tr:nth-child(even) { background-color: #fdfdfd; }
          .footer { margin-top: 40px; text-align: center; font-size: 10px; color: #888; border-top: 1px solid #dee2e6; padding-top: 15px; }
          @media print {
            body { padding: 0; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="shop-name">${shopName}</div>
          <div class="shop-info">${shopAddress} ${shopPhone ? ' | ' + shopPhone : ''}</div>
          <div class="report-title">${title}</div>
          <div class="report-subtitle">${subtitle}</div>
        </div>
        <table>
          <thead>
            <tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${rows.map(r => `<tr>${r.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}
          </tbody>
        </table>
        <div class="footer">
          This is a system-generated report. Printed on ${new Date().toLocaleDateString('en-IN')}.
        </div>
        <script>
          window.onload = function() {
            window.print();
            setTimeout(function() { window.close(); }, 500);
          };
        </script>
      </body>
    </html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
}

function parseOrnamentPhotos(photoUrlStr?: string): { url: string; name: string }[] {
  if (!photoUrlStr) return [];
  if (photoUrlStr.startsWith('[') && photoUrlStr.endsWith(']')) {
    try {
      const parsed = JSON.parse(photoUrlStr);
      if (Array.isArray(parsed)) {
        return parsed.map((item: any) => {
          if (typeof item === 'string') {
            return { url: item, name: item.split(/[/\\]/).pop() || 'Ornament Photo' };
          }
          return { url: item.url || '', name: item.name || 'Ornament Photo' };
        });
      }
    } catch (e) {}
  }
  return [{ url: photoUrlStr, name: photoUrlStr.split(/[/\\]/).pop() || 'Ornament Photo' }];
}

function exportReportPDF(title: string, subtitle: string, headers: string[], rows: (string | number)[][]) {
  const doc = new jsPDF();
  const shop = getAllSettings();
  const shopName = shop.shop_name || 'Gold Loan Manager';
  const shopAddress = shop.shop_address || '';
  const shopPhone = shop.shop_phone || '';

  const cleanString = (val: string | number) => {
    if (typeof val === 'string') {
      return val.replace(/₹/g, 'Rs. ');
    }
    return val;
  };

  const cleanedTitle = cleanString(title) as string;
  const cleanedSubtitle = cleanString(subtitle) as string;
  const cleanedHeaders = headers.map(cleanString) as string[];
  const cleanedRows = rows.map(r => r.map(cleanString));

  // Header banner
  doc.setFillColor(202, 138, 4); // gold color
  doc.rect(0, 0, 210, 25, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(shopName, 14, 11);
  
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`${shopAddress} ${shopPhone ? ' | ' + shopPhone : ''}`, 14, 18);

  // Title
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(cleanedTitle, 14, 37);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text(cleanedSubtitle, 14, 43);

  doc.setDrawColor(202, 138, 4);
  doc.setLineWidth(0.5);
  doc.line(14, 46, 196, 46);

  autoTable(doc, {
    startY: 50,
    head: [cleanedHeaders],
    body: cleanedRows as any,
    headStyles: { fillColor: [202, 138, 4], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [254, 252, 232] },
    styles: { fontSize: 9 },
  });

  doc.save(`${cleanedTitle.toLowerCase().replace(/\s+/g, '-')}.pdf`);
}

interface ConfirmState {
  show: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
}

export function StaffReports({ currentUser }: StaffReportsProps) {
  const [selectedReport, setSelectedReport] = useState<ReportType>('daily_collection');
  const [loans, setLoans]         = useState<Loan[]>([]);
  const [allLoans, setAllLoans]   = useState<Loan[]>([]);
  const [emis, setEmis]           = useState<EMI[]>([]);
  const [payments, setPayments]   = useState<Payment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [users, setUsers]         = useState<User[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState<string>('');

  const [confirm, setConfirm] = useState<ConfirmState>({
    show: false, title: '', message: '', onConfirm: () => {},
  });
  const [showOrnamentImage, setShowOrnamentImage] = useState<string | null>(null);

  // ── Filter states ─────────────────────────────────────────────────────────
  const today = getSystemWorkingDate();
  const [dcDate, setDcDate]         = useState(today);
  const [dcSearch, setDcSearch]     = useState('');
  const [alSearch, setAlSearch]     = useState('');
  const [alDateFrom, setAlDateFrom] = useState('');
  const [alDateTo, setAlDateTo]     = useState('');
  const [clSearch, setClSearch]     = useState('');
  const [clStatus, setClStatus]     = useState('');
  const [olSearch, setOlSearch]     = useState('');
  const [csSearch, setCsSearch]     = useState('');
  const [cbDate, setCbDate]         = useState(today);
  const [giSearch, setGiSearch]     = useState('');
  const [giGoldType, setGiGoldType] = useState('');
  // ─────────────────────────────────────────────────────────────────────────

  const loadData = () => {
    try {
      const fetched = getAllLoans();
      setAllLoans(fetched);
      setLoans(fetched);
      setEmis(getAllEMIs());
      setPayments(getAllPayments());
      setCustomers(getAllCustomers());
      setUsers(getAllUsers());
    } catch {}
  };

  useEffect(() => { loadData(); }, [currentUser]);

  const activeLoans  = useMemo(() => loans.filter(l => l.status === 'active'), [loans]);
  const closedLoans  = useMemo(() => loans.filter(l => l.status === 'closed' || l.status === 'completed' || l.status === 'auctioned'), [loans]);
  const overdueLoans = useMemo(() => loans.filter(l => l.status === 'defaulted'), [loans]);

  const reportsList = [
    { id: 'daily_collection',    label: 'Daily Collection',    icon: Calendar },
    { id: 'active_loans',        label: 'Active Loans',        icon: Activity },
    { id: 'closed_loans',        label: 'Closed Loans',        icon: CheckCircle },
    { id: 'overdue_loans',       label: 'Overdue Loans',       icon: AlertTriangle },
    { id: 'customer_statements', label: 'Customer Statements', icon: Users },
    { id: 'cashbook',            label: 'Cashbook',            icon: Wallet },
    { id: 'gold_inventory',      label: 'Gold Inventory',      icon: Box },
  ] as const;

  const staffUsers = useMemo(
    () => users.filter(user => user.role === 'staff'),
    [users]
  );

  const matchesStaff = (createdBy?: string) =>
    !selectedStaffId || (createdBy === selectedStaffId);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const askConfirm = (title: string, message: string, onConfirm: () => void) =>
    setConfirm({ show: true, title, message, onConfirm });

  const SearchInput = ({
    value, onChange, placeholder = 'Search…',
  }: { value: string; onChange: (v: string) => void; placeholder?: string }) => (
    <div className="relative flex-1 min-w-[180px]">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-9 pr-3 py-2 text-sm border border-black/15 bg-white focus:outline-none focus:ring-1 focus:ring-yellow-400 focus:border-yellow-400 rounded-sm"
      />
    </div>
  );

  const DateInput = ({
    label, value, onChange,
  }: { label: string; value: string; onChange: (v: string) => void }) => (
    <div className="flex flex-col gap-1 min-w-[140px]">
      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</label>
      <input
        type="date"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="px-3 py-2 text-sm border border-black/15 bg-white focus:outline-none focus:ring-1 focus:ring-yellow-400 focus:border-yellow-400 rounded-sm"
      />
    </div>
  );

  const SelectInput = ({
    label, value, onChange, options,
  }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) => (
    <div className="flex flex-col gap-1 min-w-[140px]">
      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="px-3 py-2 text-sm border border-black/15 bg-white focus:outline-none focus:ring-1 focus:ring-yellow-400 focus:border-yellow-400 rounded-sm"
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );

  /** Top bar: filters on the left, single Delete All button on the right */
  const ReportHeader = ({
    title,
    count,
    onDeleteAll,
    deleteLabel,
    badge,
    onExportPDF,
    onExportExcel,
    onPrint,
    children,
  }: {
    title: string;
    count: number;
    onDeleteAll: () => void;
    deleteLabel?: string;
    badge?: React.ReactNode;
    onExportPDF?: () => void;
    onExportExcel?: () => void;
    onPrint?: () => void;
    children?: React.ReactNode;
  }) => (
    <div className="mb-5">
      {/* Title row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <h3 className="text-xl font-bold">{title}</h3>
        <div className="flex items-center gap-3 flex-wrap">
          {badge}
          {count > 0 && onExportPDF && (
            <button
              onClick={onExportPDF}
              className="flex items-center gap-2 px-3 py-2 text-xs font-bold bg-white text-gray-700 border border-black/15 hover:bg-gray-50 transition-all rounded-sm shadow-sm"
              title="Export to PDF"
            >
              <FileText className="w-4 h-4 text-red-600" />
              <span>PDF</span>
            </button>
          )}
          {count > 0 && onExportExcel && (
            <button
              onClick={onExportExcel}
              className="flex items-center gap-2 px-3 py-2 text-xs font-bold bg-white text-gray-700 border border-black/15 hover:bg-gray-50 transition-all rounded-sm shadow-sm"
              title="Export to Excel"
            >
              <Download className="w-4 h-4 text-green-600" />
              <span>Excel</span>
            </button>
          )}
          {count > 0 && onPrint && (
            <button
              onClick={onPrint}
              className="flex items-center gap-2 px-3 py-2 text-xs font-bold bg-white text-gray-700 border border-black/15 hover:bg-gray-50 transition-all rounded-sm shadow-sm"
              title="Print Report"
            >
              <Printer className="w-4 h-4 text-blue-500" />
              <span>Print</span>
            </button>
          )}
          <button
            onClick={onDeleteAll}
            disabled={count === 0}
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors rounded-sm"
          >
            <Trash2 className="w-4 h-4" />
            {deleteLabel ?? `Delete All (${count})`}
          </button>
        </div>
      </div>
      {/* Filter bar */}
      {children && (
        <div className="flex flex-wrap items-end gap-3 p-4 bg-gray-50 border border-black/10 rounded-sm">
          {children}
        </div>
      )}
    </div>
  );
  // ─────────────────────────────────────────────────────────────────────────

  // ── Reports ───────────────────────────────────────────────────────────────
  const renderDailyCollection = () => {
    const filteredEMIs = emis.filter(e => {
      if (e.status !== 'paid' || e.paidDate !== dcDate) return false;
      if (!matchesStaff(e.createdBy)) return false;
      const q = dcSearch.toLowerCase();
      if (q && !e.customerName.toLowerCase().includes(q) && !e.loanId.includes(q)) return false;
      return true;
    });
    const filteredPayments = payments.filter(p => {
      if (p.paymentDate !== dcDate) return false;
      if (!matchesStaff(p.createdBy)) return false;
      const name = (p.customerName || allLoans.find(l => l.id === p.loanId)?.customerName || '').toLowerCase();
      const q = dcSearch.toLowerCase();
      if (q && !name.includes(q) && !p.loanId.includes(q)) return false;
      return true;
    });

    const totalCollected =
      filteredEMIs.reduce((s, e) => s + (e.paidAmount || 0), 0) +
      filteredPayments.reduce((s, p) => s + p.amount, 0);
    const totalCount = filteredEMIs.length + filteredPayments.length;

    const handleDeleteAll = () => askConfirm(
      'Delete All Collection Entries',
      `This will revert ${filteredEMIs.length} EMI payment(s) to "Pending" and permanently delete ${filteredPayments.length} bullet payment(s) for ${dcDate}. Continue?`,
      () => {
        filteredEMIs.forEach(e => resetEMIPayment(e.id));
        filteredPayments.forEach(p => deletePayment(p.id));
        loadData();
      }
    );

    const getDailyCollectionData = () => {
      const headers = ['Customer', 'Loan ID', 'Type', 'Amount Paid', 'Method'];
      const rows = [
        ...filteredEMIs.map(e => [e.customerName, e.loanId, `EMI #${e.emiNumber}`, `₹${(e.paidAmount || 0).toLocaleString()}`, e.paymentMethod || 'cash']),
        ...filteredPayments.map(p => {
          const name = p.customerName || allLoans.find(l => l.id === p.loanId)?.customerName || 'Unknown';
          return [name, p.loanId, `Bullet ${p.paymentType.replace('_', ' ')}`, `₹${p.amount.toLocaleString()}`, p.paymentMethod || 'cash'];
        })
      ];
      return { headers, rows };
    };

    const handleExportPDF = () => {
      const { headers, rows } = getDailyCollectionData();
      exportReportPDF('Daily Collection Report', `Date: ${dcDate} | Total Collected: Rs. ${totalCollected.toLocaleString()}`, headers, rows);
    };

    const handleExportExcel = () => {
      const { headers, rows } = getDailyCollectionData();
      rows.push(['TOTAL', '', '', `₹${totalCollected.toLocaleString()}`, '']);
      exportReportExcel(`daily-collection-${dcDate}.xlsx`, 'Daily Collection Report', `Date: ${dcDate} | Total Collected: Rs. ${totalCollected.toLocaleString()}`, headers, rows);
    };

    const handlePrint = () => {
      const { headers, rows } = getDailyCollectionData();
      rows.push(['TOTAL', '', '', `₹${totalCollected.toLocaleString()}`, '']);
      printTable('Daily Collection Report', `Date: ${dcDate} | Total Collected: Rs. ${totalCollected.toLocaleString()}`, headers, rows);
    };

    return (
      <div className="bg-white p-6 border border-black/15">
        <ReportHeader
          title="Daily Collection Report"
          count={totalCount}
          onDeleteAll={handleDeleteAll}
          onExportPDF={handleExportPDF}
          onExportExcel={handleExportExcel}
          onPrint={handlePrint}
          badge={
            <div className="bg-blue-50 text-blue-700 px-4 py-2 font-bold border border-blue-200 whitespace-nowrap">
              Total: ₹{totalCollected.toLocaleString()}
            </div>
          }
        >
          <DateInput label="Date" value={dcDate} onChange={setDcDate} />
          <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Search</label>
            <SearchInput value={dcSearch} onChange={setDcSearch} placeholder="Customer or Loan ID…" />
          </div>
        </ReportHeader>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b border-black/15">
              <tr>
                <th className="p-3 text-sm font-bold text-gray-600">Customer</th>
                <th className="p-3 text-sm font-bold text-gray-600">Loan ID</th>
                <th className="p-3 text-sm font-bold text-gray-600">EMI No.</th>
                <th className="p-3 text-sm font-bold text-gray-600">Amount Paid</th>
                <th className="p-3 text-sm font-bold text-gray-600">Method</th>
              </tr>
            </thead>
            <tbody>
              {totalCount > 0 ? (
                <>
                  {filteredEMIs.map(emi => (
                    <tr key={emi.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="p-3 text-sm font-semibold">{emi.customerName}</td>
                      <td className="p-3 text-sm font-mono">{emi.loanId}</td>
                      <td className="p-3 text-sm text-gray-600">EMI #{emi.emiNumber}</td>
                      <td className="p-3 text-sm font-bold text-green-600">₹{emi.paidAmount?.toLocaleString()}</td>
                      <td className="p-3 text-sm capitalize">{emi.paymentMethod}</td>
                    </tr>
                  ))}
                  {filteredPayments.map(payment => {
                    const name = payment.customerName || allLoans.find(l => l.id === payment.loanId)?.customerName || 'Unknown';
                    return (
                      <tr key={payment.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="p-3 text-sm font-semibold">{name}</td>
                        <td className="p-3 text-sm font-mono">{payment.loanId}</td>
                        <td className="p-3 text-sm text-gray-600">Bullet {payment.paymentType.replace('_', ' ')}</td>
                        <td className="p-3 text-sm font-bold text-green-600">₹{payment.amount.toLocaleString()}</td>
                        <td className="p-3 text-sm capitalize">{payment.paymentMethod || 'cash'}</td>
                      </tr>
                    );
                  })}
                </>
              ) : (
                <tr><td colSpan={5} className="text-center text-gray-500 p-6">No collections found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderActiveLoans = () => {
    const filtered = activeLoans.filter(loan => {
      if (!matchesStaff(loan.createdBy)) return false;
      const q = alSearch.toLowerCase();
      if (q && !loan.customerName.toLowerCase().includes(q) && !loan.id.includes(q)) return false;
      if (alDateFrom && loan.startDate < alDateFrom) return false;
      if (alDateTo   && loan.startDate > alDateTo)   return false;
      return true;
    });

    const getActiveLoansData = () => {
      const headers = ['Loan ID', 'Customer', 'Amount', 'Date Issued'];
      const rows = filtered.map(loan => [loan.id, loan.customerName, `₹${loan.loanAmount.toLocaleString()}`, new Date(loan.startDate).toLocaleDateString()]);
      return { headers, rows };
    };

    const handleExportPDF = () => {
      const { headers, rows } = getActiveLoansData();
      exportReportPDF('Active Loans Report', `Total Active: ${filtered.length}`, headers, rows);
    };

    const handleExportExcel = () => {
      const { headers, rows } = getActiveLoansData();
      const totalAmount = filtered.reduce((s, l) => s + l.loanAmount, 0);
      rows.push(['TOTAL', '', `₹${totalAmount.toLocaleString()}`, '']);
      exportReportExcel('active-loans.xlsx', 'Active Loans Report', `Total Active: ${filtered.length}`, headers, rows);
    };

    const handlePrint = () => {
      const { headers, rows } = getActiveLoansData();
      const totalAmount = filtered.reduce((s, l) => s + l.loanAmount, 0);
      rows.push(['TOTAL', '', `₹${totalAmount.toLocaleString()}`, '']);
      printTable('Active Loans Report', `Total Active: ${filtered.length}`, headers, rows);
    };

    return (
      <div className="bg-white p-6 border border-black/15">
        <ReportHeader
          title="Active Loans"
          count={filtered.length}
          onDeleteAll={() => askConfirm(
            'Delete All Active Loans',
            `Permanently delete ${filtered.length} active loan(s) and all their EMIs? This cannot be undone.`,
            () => { filtered.forEach(l => deleteLoan(l.id)); loadData(); }
          )}
          onExportPDF={handleExportPDF}
          onExportExcel={handleExportExcel}
          onPrint={handlePrint}
        >
          <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Search</label>
            <SearchInput value={alSearch} onChange={setAlSearch} placeholder="Customer or Loan ID…" />
          </div>
          <DateInput label="Issued From" value={alDateFrom} onChange={setAlDateFrom} />
          <DateInput label="Issued To"   value={alDateTo}   onChange={setAlDateTo} />
        </ReportHeader>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b border-black/15">
              <tr>
                <th className="p-3 text-sm font-bold text-gray-600">Loan ID</th>
                <th className="p-3 text-sm font-bold text-gray-600">Customer</th>
                <th className="p-3 text-sm font-bold text-gray-600">Amount</th>
                <th className="p-3 text-sm font-bold text-gray-600">Date Issued</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length > 0 ? filtered.map(loan => (
                <tr key={loan.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="p-3 text-sm font-mono">{loan.id}</td>
                  <td className="p-3 text-sm font-semibold">{loan.customerName}</td>
                  <td className="p-3 text-sm font-bold">₹{loan.loanAmount.toLocaleString()}</td>
                  <td className="p-3 text-sm text-gray-600">{new Date(loan.startDate).toLocaleDateString()}</td>
                </tr>
              )) : (
                <tr><td colSpan={4} className="text-center p-6 text-gray-500">No active loans match the filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderClosedLoans = () => {
    const filtered = closedLoans.filter(loan => {
      if (!matchesStaff(loan.createdBy)) return false;
      const q = clSearch.toLowerCase();
      if (q && !loan.customerName.toLowerCase().includes(q) && !loan.id.includes(q)) return false;
      if (clStatus && loan.status !== clStatus) return false;
      return true;
    });

    const getClosedLoansData = () => {
      const headers = ['Loan ID', 'Customer', 'Amount', 'Status'];
      const rows = filtered.map(loan => [loan.id, loan.customerName, `₹${loan.loanAmount.toLocaleString()}`, loan.status.toUpperCase()]);
      return { headers, rows };
    };

    const handleExportPDF = () => {
      const { headers, rows } = getClosedLoansData();
      exportReportPDF('Closed Loans Report', `Total Closed: ${filtered.length}`, headers, rows);
    };

    const handleExportExcel = () => {
      const { headers, rows } = getClosedLoansData();
      const totalAmount = filtered.reduce((s, l) => s + l.loanAmount, 0);
      rows.push(['TOTAL', '', `₹${totalAmount.toLocaleString()}`, '']);
      exportReportExcel('closed-loans.xlsx', 'Closed Loans Report', `Total Closed: ${filtered.length}`, headers, rows);
    };

    const handlePrint = () => {
      const { headers, rows } = getClosedLoansData();
      const totalAmount = filtered.reduce((s, l) => s + l.loanAmount, 0);
      rows.push(['TOTAL', '', `₹${totalAmount.toLocaleString()}`, '']);
      printTable('Closed Loans Report', `Total Closed: ${filtered.length}`, headers, rows);
    };

    return (
      <div className="bg-white p-6 border border-black/15">
        <ReportHeader
          title="Closed Loans"
          count={filtered.length}
          onDeleteAll={() => askConfirm(
            'Delete All Closed Loans',
            `Permanently delete ${filtered.length} closed/completed loan record(s)? This cannot be undone.`,
            () => { filtered.forEach(l => deleteLoan(l.id)); loadData(); }
          )}
          onExportPDF={handleExportPDF}
          onExportExcel={handleExportExcel}
          onPrint={handlePrint}
        >
          <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Search</label>
            <SearchInput value={clSearch} onChange={setClSearch} placeholder="Customer or Loan ID…" />
          </div>
          <SelectInput
            label="Status"
            value={clStatus}
            onChange={setClStatus}
            options={[
              { value: '',          label: 'All Statuses' },
              { value: 'closed',    label: 'Closed' },
              { value: 'completed', label: 'Completed' },
              { value: 'auctioned', label: 'Auctioned' },
            ]}
          />
        </ReportHeader>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b border-black/15">
              <tr>
                <th className="p-3 text-sm font-bold text-gray-600">Loan ID</th>
                <th className="p-3 text-sm font-bold text-gray-600">Customer</th>
                <th className="p-3 text-sm font-bold text-gray-600">Amount</th>
                <th className="p-3 text-sm font-bold text-gray-600">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length > 0 ? filtered.map(loan => (
                <tr key={loan.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="p-3 text-sm font-mono">{loan.id}</td>
                  <td className="p-3 text-sm font-semibold">{loan.customerName}</td>
                  <td className="p-3 text-sm font-bold">₹{loan.loanAmount.toLocaleString()}</td>
                  <td className="p-3 text-sm">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-bold border border-current ${
                      loan.status === 'completed' ? 'bg-blue-100 text-blue-700' :
                      loan.status === 'auctioned' ? 'bg-orange-100 text-orange-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {loan.status}
                    </span>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={4} className="text-center text-gray-500 p-6">No closed loans match the filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderOverdueLoans = () => {
    const filtered = overdueLoans.filter(loan => {
      if (!matchesStaff(loan.createdBy)) return false;
      const q = olSearch.toLowerCase();
      if (q && !loan.customerName.toLowerCase().includes(q) && !loan.id.includes(q)) return false;
      return true;
    });

    const getOverdueLoansData = () => {
      const headers = ['Customer', 'Contact', 'Loan ID', 'Loan Amount', 'Since'];
      const rows = filtered.map(loan => {
        const customer = customers.find(c => c.id === loan.customerId);
        return [
          loan.customerName,
          customer?.phone || 'N/A',
          loan.id,
          `₹${loan.loanAmount.toLocaleString()}`,
          new Date(loan.startDate).toLocaleDateString('en-IN')
        ];
      });
      return { headers, rows };
    };

    const handleExportPDF = () => {
      const { headers, rows } = getOverdueLoansData();
      exportReportPDF('Overdue Loans Report', `Total Overdue: ${filtered.length}`, headers, rows);
    };

    const handleExportExcel = () => {
      const { headers, rows } = getOverdueLoansData();
      const totalAmount = filtered.reduce((s, l) => s + l.loanAmount, 0);
      rows.push(['TOTAL', '', '', `₹${totalAmount.toLocaleString()}`, '']);
      exportReportExcel('overdue-loans.xlsx', 'Overdue Loans Report', `Total Overdue: ${filtered.length}`, headers, rows);
    };

    const handlePrint = () => {
      const { headers, rows } = getOverdueLoansData();
      const totalAmount = filtered.reduce((s, l) => s + l.loanAmount, 0);
      rows.push(['TOTAL', '', '', `₹${totalAmount.toLocaleString()}`, '']);
      printTable('Overdue Loans Report', `Total Overdue: ${filtered.length}`, headers, rows);
    };

    return (
      <div className="bg-white p-6 border border-black/15">
        <ReportHeader
          title="Overdue Loans"
          count={filtered.length}
          onDeleteAll={() => askConfirm(
            'Delete All Overdue Loans',
            `Permanently delete ${filtered.length} overdue loan(s) and all their EMIs? This cannot be undone.`,
            () => { filtered.forEach(l => deleteLoan(l.id)); loadData(); }
          )}
          onExportPDF={handleExportPDF}
          onExportExcel={handleExportExcel}
          onPrint={handlePrint}
        >
          <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Search</label>
            <SearchInput value={olSearch} onChange={setOlSearch} placeholder="Customer or Loan ID…" />
          </div>
        </ReportHeader>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b border-black/15">
              <tr>
                <th className="p-3 text-sm font-bold text-gray-600">Customer</th>
                <th className="p-3 text-sm font-bold text-gray-600">Contact</th>
                <th className="p-3 text-sm font-bold text-gray-600">Loan ID</th>
                <th className="p-3 text-sm font-bold text-gray-600">Loan Amount</th>
                <th className="p-3 text-sm font-bold text-gray-600">Since</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length > 0 ? filtered.map(loan => {
                const customer = customers.find(c => c.id === loan.customerId);
                return (
                  <tr key={loan.id} className="border-b border-gray-100 hover:bg-red-50">
                    <td className="p-3 text-sm font-semibold">{loan.customerName}</td>
                    <td className="p-3 text-sm text-gray-600 flex items-center gap-1">
                      <Phone className="w-3 h-3" /> {customer?.phone || 'N/A'}
                    </td>
                    <td className="p-3 text-sm font-mono">{loan.id}</td>
                    <td className="p-3 text-sm font-bold text-red-600">₹{loan.loanAmount.toLocaleString()}</td>
                    <td className="p-3 text-sm text-gray-600">{new Date(loan.startDate).toLocaleDateString()}</td>
                  </tr>
                );
              }) : (
                <tr><td colSpan={5} className="text-center text-gray-500 p-6">No overdue loans match the filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderCustomerStatements = () => {
    const statementData = customers.map(c => {
      const customerLoans = loans.filter(l => l.customerId === c.id);
      const totalBorrowed = customerLoans.reduce((s, l) => s + l.loanAmount, 0);
      const customerEMIs  = emis.filter(e => e.customerId === c.id && e.status === 'paid');
      const totalPaid     = customerEMIs.reduce((s, e) => s + (e.paidAmount || 0), 0);
      const activeCount   = customerLoans.filter(l => l.status === 'active' || l.status === 'defaulted').length;
      return { ...c, totalBorrowed, totalPaid, activeCount, loanCount: customerLoans.length };
    }).filter(c => c.loanCount > 0);

    const filtered = statementData.filter(c => {
      if (!matchesStaff(c.createdBy)) return false;
      const q = csSearch.toLowerCase();
      if (q && !c.name.toLowerCase().includes(q) && !c.phone.includes(q)) return false;
      return true;
    });

    const getCustomerStatementsData = () => {
      const headers = ['Customer', 'Contact', 'Active / Total', 'Total Borrowed', 'Total Paid'];
      const rows = filtered.map(c => [
        c.name,
        c.phone,
        `${c.activeCount} / ${c.loanCount}`,
        `₹${c.totalBorrowed.toLocaleString()}`,
        `₹${c.totalPaid.toLocaleString()}`
      ]);
      return { headers, rows };
    };

    const handleExportPDF = () => {
      const { headers, rows } = getCustomerStatementsData();
      exportReportPDF('Customer Statements Report', `Total Customers: ${filtered.length}`, headers, rows);
    };

    const handleExportExcel = () => {
      const { headers, rows } = getCustomerStatementsData();
      const totalBorrowed = filtered.reduce((s, c) => s + c.totalBorrowed, 0);
      const totalPaid = filtered.reduce((s, c) => s + c.totalPaid, 0);
      rows.push(['TOTAL', '', '', `₹${totalBorrowed.toLocaleString()}`, `₹${totalPaid.toLocaleString()}`]);
      exportReportExcel('customer-statements.xlsx', 'Customer Statements Report', `Total Customers: ${filtered.length}`, headers, rows);
    };

    const handlePrint = () => {
      const { headers, rows } = getCustomerStatementsData();
      const totalBorrowed = filtered.reduce((s, c) => s + c.totalBorrowed, 0);
      const totalPaid = filtered.reduce((s, c) => s + c.totalPaid, 0);
      rows.push(['TOTAL', '', '', `₹${totalBorrowed.toLocaleString()}`, `₹${totalPaid.toLocaleString()}`]);
      printTable('Customer Statements Report', `Total Customers: ${filtered.length}`, headers, rows);
    };

    return (
      <div className="bg-white p-6 border border-black/15">
        <ReportHeader
          title="Customer Statements"
          count={filtered.length}
          onDeleteAll={() => askConfirm(
            'Delete All Customers',
            `Permanently delete ${filtered.length} customer record(s)? This cannot be undone.`,
            () => { filtered.forEach(c => deleteCustomer(c.id)); loadData(); }
          )}
          onExportPDF={handleExportPDF}
          onExportExcel={handleExportExcel}
          onPrint={handlePrint}
        >
          <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Search</label>
            <SearchInput value={csSearch} onChange={setCsSearch} placeholder="Name or phone…" />
          </div>
        </ReportHeader>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b border-black/15">
              <tr>
                <th className="p-3 text-sm font-bold text-gray-600">Customer</th>
                <th className="p-3 text-sm font-bold text-gray-600">Contact</th>
                <th className="p-3 text-sm font-bold text-gray-600">Active / Total</th>
                <th className="p-3 text-sm font-bold text-gray-600">Total Borrowed</th>
                <th className="p-3 text-sm font-bold text-gray-600">Total Paid</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length > 0 ? filtered.map(c => (
                <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="p-3 text-sm font-semibold">{c.name}</td>
                  <td className="p-3 text-sm text-gray-600">{c.phone}</td>
                  <td className="p-3 text-sm">
                    <span className="font-bold text-yellow-600">{c.activeCount}</span>
                    <span className="text-gray-400 mx-1">/</span>
                    <span>{c.loanCount}</span>
                  </td>
                  <td className="p-3 text-sm font-bold">₹{c.totalBorrowed.toLocaleString()}</td>
                  <td className="p-3 text-sm font-bold text-green-600">₹{c.totalPaid.toLocaleString()}</td>
                </tr>
              )) : (
                <tr><td colSpan={5} className="text-center text-gray-500 p-6">No customers match the search.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderCashbook = () => {
    const emiInflows = emis
      .filter(e => e.status === 'paid' && e.paidDate === cbDate && matchesStaff(e.createdBy))
      .map(e => ({ id: e.id, kind: 'emi' as const, type: 'inflow', desc: `EMI #${e.emiNumber} Payment`, customerName: e.customerName, amount: e.paidAmount || 0 }));

    const paymentInflows = payments
      .filter(p => p.paymentDate === cbDate && matchesStaff(p.createdBy))
      .map(p => {
        const loan = allLoans.find(l => l.id === p.loanId);
        return { id: p.id, kind: 'payment' as const, type: 'inflow', desc: `Bullet ${p.paymentType.replace('_', ' ')} Payment`, customerName: p.customerName || loan?.customerName || 'Unknown', amount: p.amount };
      });

    const outflows = loans
      .filter(l => l.startDate === cbDate && matchesStaff(l.createdBy))
      .map(l => ({ id: l.id, kind: 'loan' as const, type: 'outflow', desc: 'Loan Disbursement', customerName: l.customerName, amount: l.loanAmount }));

    const transactions = [...emiInflows, ...paymentInflows, ...outflows];
    const totalIn  = [...emiInflows, ...paymentInflows].reduce((s, t) => s + t.amount, 0);
    const totalOut = outflows.reduce((s, t) => s + t.amount, 0);
    const net      = totalIn - totalOut;

    const handleDeleteAll = () => askConfirm(
      'Delete All Cashbook Entries',
      `This will revert ${emiInflows.length} EMI payment(s) to "Pending", delete ${paymentInflows.length} bullet payment(s), and delete ${outflows.length} loan disbursement(s) for ${cbDate}. Continue?`,
      () => {
        emiInflows.forEach(t => resetEMIPayment(t.id));
        paymentInflows.forEach(t => deletePayment(t.id));
        outflows.forEach(t => deleteLoan(t.id));
        loadData();
      }
    );

    const getCashbookData = () => {
      const headers = ['Type', 'Description', 'Customer', 'Amount'];
      const rows = transactions.map(t => [
        t.type.toUpperCase(),
        t.desc,
        t.customerName,
        `${t.type === 'inflow' ? '+' : '-'} ₹${t.amount.toLocaleString()}`
      ]);
      return { headers, rows };
    };

    const handleExportPDF = () => {
      const { headers, rows } = getCashbookData();
      exportReportPDF(
        'Cashbook Report',
        `Date: ${cbDate} | Total In: Rs. ${totalIn.toLocaleString()} | Total Out: Rs. ${totalOut.toLocaleString()} | Net: Rs. ${net.toLocaleString()}`,
        headers,
        rows
      );
    };

    const handleExportExcel = () => {
      const { headers, rows } = getCashbookData();
      rows.push(['TOTAL INFLOWS', '', '', `₹${totalIn.toLocaleString()}`]);
      rows.push(['TOTAL OUTFLOWS', '', '', `₹${totalOut.toLocaleString()}`]);
      rows.push(['NET POSITION', '', '', `₹${net.toLocaleString()}`]);
      exportReportExcel(`cashbook-${cbDate}.xlsx`, 'Cashbook Report', `Date: ${cbDate} | Total In: Rs. ${totalIn.toLocaleString()} | Total Out: Rs. ${totalOut.toLocaleString()} | Net: Rs. ${net.toLocaleString()}`, headers, rows);
    };

    const handlePrint = () => {
      const { headers, rows } = getCashbookData();
      rows.push(['TOTAL INFLOWS', '', '', `₹${totalIn.toLocaleString()}`]);
      rows.push(['TOTAL OUTFLOWS', '', '', `₹${totalOut.toLocaleString()}`]);
      rows.push(['NET POSITION', '', '', `₹${net.toLocaleString()}`]);
      printTable(
        'Cashbook Report',
        `Date: ${cbDate} | Total In: Rs. ${totalIn.toLocaleString()} | Total Out: Rs. ${totalOut.toLocaleString()} | Net: Rs. ${net.toLocaleString()}`,
        headers,
        rows
      );
    };

    return (
      <div className="bg-white p-6 border border-black/15">
        <ReportHeader
          title="Cashbook"
          count={transactions.length}
          onDeleteAll={handleDeleteAll}
          onExportPDF={handleExportPDF}
          onExportExcel={handleExportExcel}
          onPrint={handlePrint}
          badge={
            <div className="flex flex-wrap gap-2">
              <div className="bg-green-50 text-green-700 px-3 py-2 font-bold border border-green-200 text-sm">In: ₹{totalIn.toLocaleString()}</div>
              <div className="bg-red-50 text-red-700 px-3 py-2 font-bold border border-red-200 text-sm">Out: ₹{totalOut.toLocaleString()}</div>
              <div className={`px-3 py-2 font-bold border text-sm ${net >= 0 ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-orange-50 text-orange-700 border-orange-200'}`}>
                Net: ₹{net.toLocaleString()}
              </div>
            </div>
          }
        >
          <DateInput label="Date" value={cbDate} onChange={setCbDate} />
        </ReportHeader>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b border-black/15">
              <tr>
                <th className="p-3 text-sm font-bold text-gray-600">Type</th>
                <th className="p-3 text-sm font-bold text-gray-600">Description</th>
                <th className="p-3 text-sm font-bold text-gray-600">Customer</th>
                <th className="p-3 text-sm font-bold text-gray-600 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {transactions.length > 0 ? transactions.map(t => (
                <tr key={t.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="p-3">
                    {t.type === 'inflow' ? (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-green-700 bg-green-100 px-2 py-1">
                        <ArrowDownLeft className="w-3 h-3" /> IN
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-red-700 bg-red-100 px-2 py-1">
                        <ArrowUpRight className="w-3 h-3" /> OUT
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-sm text-gray-700">{t.desc}</td>
                  <td className="p-3 text-sm font-semibold">{t.customerName}</td>
                  <td className={`p-3 text-sm font-bold text-right ${t.type === 'inflow' ? 'text-green-600' : 'text-red-600'}`}>
                    {t.type === 'inflow' ? '+' : '-'} ₹{t.amount.toLocaleString()}
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={4} className="text-center text-gray-500 p-6">No cashbook entries for the selected date.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderGoldInventory = () => {
    const inventoryLoans = loans.filter(l => l.status === 'active' || l.status === 'defaulted');
    const filtered = inventoryLoans.filter(loan => {
      const q = giSearch.toLowerCase();
      if (q &&
        !loan.customerName.toLowerCase().includes(q) &&
        !(loan.lockerNumber || '').toLowerCase().includes(q) &&
        !(loan.packetNumber || '').toLowerCase().includes(q) &&
        !(loan.itemType || '').toLowerCase().includes(q)) return false;
      if (giGoldType && loan.goldType !== giGoldType) return false;
      return true;
    });

    const totalWeight = filtered.reduce((s, l) => s + l.goldWeight, 0);
    const totalValue  = filtered.reduce((s, l) => s + l.goldValue, 0);

    const getGoldInventoryData = () => {
      const headers = ['Locker / Packet', 'Customer', 'Item Details', 'Purity', 'Gross Weight', 'Gold Value'];
      const rows = filtered.map(loan => [
        `L-${loan.lockerNumber || 'N/A'} / P-${loan.packetNumber || 'N/A'}`,
        loan.customerName,
        loan.itemType,
        loan.goldType,
        `${loan.goldWeight}g`,
        `₹${loan.goldValue.toLocaleString()}`
      ]);
      return { headers, rows };
    };

    const handleExportPDF = () => {
      const { headers, rows } = getGoldInventoryData();
      exportReportPDF(
        'Gold Inventory Safe Report',
        `Items: ${filtered.length} | Total Weight: ${totalWeight.toFixed(2)}g | Total Value: Rs. ${totalValue.toLocaleString()}`,
        headers,
        rows
      );
    };

    const handleExportExcel = () => {
      const { headers, rows } = getGoldInventoryData();
      rows.push(['TOTAL', '', '', '', `${totalWeight.toFixed(2)}g`, `₹${totalValue.toLocaleString()}`]);
      exportReportExcel('gold-inventory.xlsx', 'Gold Inventory Safe Report', `Items: ${filtered.length} | Total Weight: ${totalWeight.toFixed(2)}g | Total Value: Rs. ${totalValue.toLocaleString()}`, headers, rows);
    };

    const handlePrint = () => {
      const { headers, rows } = getGoldInventoryData();
      rows.push(['TOTAL', '', '', '', `${totalWeight.toFixed(2)}g`, `₹${totalValue.toLocaleString()}`]);
      printTable(
        'Gold Inventory Safe Report',
        `Items: ${filtered.length} | Total Weight: ${totalWeight.toFixed(2)}g | Total Value: Rs. ${totalValue.toLocaleString()}`,
        headers,
        rows
      );
    };

    return (
      <div className="bg-white p-6 border border-black/15">
        <ReportHeader
          title="Gold Inventory (In Safe)"
          count={filtered.length}
          onDeleteAll={() => askConfirm(
            'Delete All Gold Inventory Entries',
            `Permanently delete ${filtered.length} inventory record(s) and their associated loans? This cannot be undone.`,
            () => { filtered.forEach(l => deleteLoan(l.id)); loadData(); }
          )}
          onExportPDF={handleExportPDF}
          onExportExcel={handleExportExcel}
          onPrint={handlePrint}
          badge={
            <div className="flex flex-wrap gap-2">
              <div className="bg-yellow-50 text-yellow-800 px-3 py-2 text-sm font-bold border border-yellow-200">
                {filtered.length} Items · {totalWeight.toFixed(2)}g
              </div>
              <div className="bg-yellow-50 text-yellow-800 px-3 py-2 text-sm font-bold border border-yellow-200">
                Value: ₹{totalValue.toLocaleString()}
              </div>
            </div>
          }
        >
          <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Search</label>
            <SearchInput value={giSearch} onChange={setGiSearch} placeholder="Customer, locker, item…" />
          </div>
          <SelectInput
            label="Gold Purity"
            value={giGoldType}
            onChange={setGiGoldType}
            options={[
              { value: '',    label: 'All Purities' },
              { value: '24K', label: '24K' },
              { value: '22K', label: '22K' },
              { value: '18K', label: '18K' },
            ]}
          />
        </ReportHeader>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b border-black/15">
              <tr>
                <th className="p-3 text-sm font-bold text-gray-600">Locker / Packet</th>
                <th className="p-3 text-sm font-bold text-gray-600">Customer</th>
                <th className="p-3 text-sm font-bold text-gray-600">Item Details</th>
                <th className="p-3 text-sm font-bold text-gray-600">Gold Value</th>
                <th className="p-3 text-sm font-bold text-gray-600 text-center">Photo</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length > 0 ? filtered.map(loan => (
                <tr key={loan.id} className="border-b border-gray-100 hover:bg-yellow-50">
                  <td className="p-3 text-sm font-mono font-bold text-yellow-700">
                    L-{loan.lockerNumber || 'N/A'} / P-{loan.packetNumber || 'N/A'}
                  </td>
                  <td className="p-3 text-sm font-semibold">{loan.customerName}</td>
                  <td className="p-3 text-sm">
                    <div className="font-semibold text-gray-800">{loan.itemType} ({loan.goldType})</div>
                    <div className="text-gray-500 text-xs">{loan.goldWeight}g gross weight</div>
                  </td>
                  <td className="p-3 text-sm font-bold text-gray-700">₹{loan.goldValue.toLocaleString()}</td>
                  <td className="p-3 text-center">
                    {loan.ornamentPhotoUrl ? (
                      <div className="flex justify-center gap-1.5 flex-wrap">
                        {parseOrnamentPhotos(loan.ornamentPhotoUrl).map((photo, i) => (
                          <button
                            key={i}
                            onClick={() => setShowOrnamentImage(photo.url)}
                            className="text-yellow-600 hover:text-yellow-750 inline-flex items-center gap-1 text-xs font-bold bg-yellow-50 hover:bg-yellow-100 border border-yellow-200 px-2 py-1 rounded-sm shadow-sm transition-all"
                            title={photo.name}
                          >
                            <Camera className="w-3.5 h-3.5 shrink-0" />
                            <span>Photo {i + 1}</span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <span className="text-gray-400 text-xs">No Photo</span>
                    )}
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={5} className="text-center text-gray-500 p-6">No items match the filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };
  // ─────────────────────────────────────────────────────────────────────────

  const renderReportContent = () => {
    switch (selectedReport) {
      case 'daily_collection':    return renderDailyCollection();
      case 'active_loans':        return renderActiveLoans();
      case 'closed_loans':        return renderClosedLoans();
      case 'overdue_loans':       return renderOverdueLoans();
      case 'customer_statements': return renderCustomerStatements();
      case 'cashbook':            return renderCashbook();
      case 'gold_inventory':      return renderGoldInventory();
      default: return null;
    }
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900">Reports</h2>
          {currentUser.role === 'admin' && (
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">Staff:</span>
              <select
                value={selectedStaffId}
                onChange={e => setSelectedStaffId(e.target.value)}
                className="px-3 py-1.5 text-sm font-semibold border border-black/15 bg-white rounded-none focus:outline-none focus:ring-1 focus:ring-yellow-400 focus:border-yellow-400 w-48 shadow-sm cursor-pointer text-gray-800"
              >
                <option value="">All Staff Members</option>
                {staffUsers.map(staff => (
                  <option key={staff.id} value={staff.id}>{staff.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2 border-b border-black/15 pb-4">
          {reportsList.map(report => {
            const Icon = report.icon;
            const isActive = selectedReport === report.id;
            return (
              <button
                key={report.id}
                onClick={() => setSelectedReport(report.id as ReportType)}
                className={`flex items-center gap-2 px-4 py-2 font-bold text-sm transition-all border ${
                  isActive
                    ? 'bg-yellow-500 text-black border-yellow-600 shadow-sm'
                    : 'bg-white text-gray-600 border-black/15 hover:bg-gray-50 hover:text-black hover:border-black/30'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-black' : 'text-gray-500'}`} />
                {report.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 animate-in fade-in duration-300">
        {renderReportContent()}
      </div>

      {/* ── Confirmation Dialog ── */}
      {confirm.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white border border-black/15 shadow-xl max-w-md w-full p-6 rounded-sm">
            <div className="flex items-start gap-3 mb-5">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">{confirm.title}</h3>
                <p className="text-sm text-gray-600 mt-1 leading-relaxed">{confirm.message}</p>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirm(s => ({ ...s, show: false }))}
                className="px-4 py-2 text-sm font-bold bg-white border border-black/20 text-gray-700 hover:bg-gray-50 rounded-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => { confirm.onConfirm(); setConfirm(s => ({ ...s, show: false })); }}
                className="px-4 py-2 text-sm font-bold bg-red-600 text-white hover:bg-red-700 rounded-sm"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Ornament Image Viewer Modal */}
      {showOrnamentImage && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 animate-in fade-in duration-200" onClick={() => setShowOrnamentImage(null)}>
          <div className="relative max-w-4xl w-full flex flex-col items-center justify-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-full flex justify-end mb-2">
              <button
                onClick={() => setShowOrnamentImage(null)}
                className="p-2 text-white hover:text-gray-300 transition-colors bg-black bg-opacity-60 rounded-full"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <img 
              src={getFileUrl(showOrnamentImage)} 
              alt="Gold Ornament" 
              className="w-full h-auto object-contain border-4 border-white shadow-2xl bg-white animate-in zoom-in-95 duration-200"
              style={{ maxHeight: '85vh' }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
