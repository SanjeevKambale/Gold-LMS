import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Loan } from '../types';
import { getAllSettings } from './db/settingsService';
import { savePdfToCustomerFolder } from './fileService';

export function generateLoanReceipt(loan: Loan): void {
  const doc = new jsPDF();

  const settings = getAllSettings();
  const shop_name = settings.shop_name || 'Gold Loan Manager';
  const shop_address = settings.shop_address || 'Shop Address';
  const shop_phone = settings.shop_phone || 'Contact Number';

  // ─── Header ───────────────────────────────────────────────────────────────
  doc.setFillColor(202, 138, 4); // yellow-600
  doc.rect(0, 0, 210, 30, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(shop_name, 14, 13);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`${shop_address} | ${shop_phone}`, 14, 21);

  // ─── Title ────────────────────────────────────────────────────────────────
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('LOAN SANCTION RECEIPT', 14, 42);

  doc.setDrawColor(202, 138, 4);
  doc.setLineWidth(0.5);
  doc.line(14, 44, 196, 44);

  // Receipt meta
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80, 80, 80);
  doc.text(`Receipt No: REC-LN-${loan.id}`, 14, 52);
  doc.text(`Loan ID: ${loan.id}`, 14, 57);
  doc.text(`Date: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}`, 196, 52, { align: 'right' });

  // ─── Customer & Loan info table ───────────────────────────────────────────
  autoTable(doc, {
    startY: 62,
    head: [['CUSTOMER & LOAN DETAILS', '']],
    body: [
      ['Receipt No.', `REC-LN-${loan.id}`],
      ['Customer Name', loan.customerName],
      ['Loan ID', loan.id],
      ['Loan Type', loan.loanTypeName],
      ['Gold Weight', `${loan.goldWeight} grams`],
      ['Gold Type / Purity', loan.goldType],
      ['Gold Value', `Rs. ${loan.goldValue.toLocaleString('en-IN')}`],
      ['Loan Amount Sanctioned', `Rs. ${loan.loanAmount.toLocaleString('en-IN')}`],
      ['Interest Rate (p.a.)', `${loan.interestRate}%`],
      ['Loan Tenure', `${loan.tenure} months`],
      ['Monthly EMI Amount', `Rs. ${loan.emiAmount.toLocaleString('en-IN')}`],
      ['Start Date', new Date(loan.startDate).toLocaleDateString('en-IN')],
      ['End Date', new Date(loan.endDate).toLocaleDateString('en-IN')],
      ['Loan Status', loan.status.toUpperCase()],
    ],
    headStyles: { fillColor: [202, 138, 4], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [254, 252, 232] },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 70 } },
    styles: { fontSize: 10 },
  });

  const finalY = ((doc as any).lastAutoTable?.finalY ?? 100) + 16;

  // ─── Terms ────────────────────────────────────────────────────────────────
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.setFont('helvetica', 'bold');
  doc.text('Terms & Conditions:', 14, finalY);
  doc.setFont('helvetica', 'normal');
  const terms = [
    '• EMI must be paid on or before the due date every month.',
    '• Late payment may attract penalty charges.',
    '• Gold ornaments will be released only after full loan repayment.',
    '• This receipt is computer-generated and valid without signature.',
  ];
  terms.forEach((t, i) => doc.text(t, 14, finalY + 6 + i * 5));

  // ─── Footer ───────────────────────────────────────────────────────────────
  doc.setFillColor(245, 245, 245);
  doc.rect(0, 272, 210, 25, 'F');
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text('Thank you for choosing ' + shop_name, 105, 280, { align: 'center' });
  doc.text(shop_address + ' | ' + shop_phone, 105, 286, { align: 'center' });
  doc.text('This is a system-generated receipt. No signature required.', 105, 292, { align: 'center' });

  doc.save(`Loan-Receipt-${loan.id}.pdf`);

  // Save a copy inside customer folder in Electron
  const pdfBuffer = doc.output('arraybuffer');
  savePdfToCustomerFolder(pdfBuffer, `Loan-Receipt-${loan.id}.pdf`, loan.customerName).catch(console.error);
}

export function generateEMIReceipt(params: {
  loanId: string;
  customerName: string;
  emiNumber: number;
  emiAmount: number;
  penaltyAmount?: number;
  paidAmount: number;
  paymentMethod: string;
  transactionRef: string;
  dueDate: string;
  paidDate: string;
  remainingBalance: number;   // outstanding loan balance AFTER this payment
  totalEMIs?: number;         // total number of EMIs for the loan
  paidEMIsCount?: number;     // how many EMIs have been fully paid (including this one)
  totalPaidAmount?: number;   // total amount in this transaction (for overpayments)
  coveredEMIs?: number[];     // list of EMI numbers covered by this payment
  paymentId?: string;         // payment ID to generate the unique receipt number
  penaltyRate?: number;       // penalty rate configured for this loan
}): void {
  const doc = new jsPDF();
  
  const penalty = params.penaltyAmount || 0;
  const ratePercentage = params.penaltyRate !== undefined && params.penaltyRate !== null ? params.penaltyRate : 2;

  const settings = getAllSettings();
  const shop_name = settings.shop_name || 'Gold Loan Manager';
  const shop_address = settings.shop_address || 'Shop Address';
  const shop_phone = settings.shop_phone || 'Contact Number';

  const receiptNo = `REC-EMI-${params.paymentId ? params.paymentId.replace('pay_', '').toUpperCase() : `${params.loanId.slice(-6)}-${params.emiNumber}`}`;

  // ─── Header ───────────────────────────────────────────────────────────────
  doc.setFillColor(34, 197, 94); // green-500
  doc.rect(0, 0, 210, 30, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(shop_name, 14, 13);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`${shop_address} | ${shop_phone}`, 14, 21);

  // ─── Title ────────────────────────────────────────────────────────────────
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('EMI PAYMENT RECEIPT', 14, 42);

  doc.setDrawColor(34, 197, 94);
  doc.setLineWidth(0.5);
  doc.line(14, 44, 196, 44);

  // Paid stamp
  doc.setFontSize(28);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(34, 197, 94);
  doc.text('PAID', 170, 65, { align: 'right' });

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80, 80, 80);
  doc.text(`Receipt No: ${receiptNo}`, 14, 52);
  doc.text(`Receipt Date: ${new Date(params.paidDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}`, 196, 52, { align: 'right' });

  // ─── Payment details table ────────────────────────────────────────────────
  autoTable(doc, {
    startY: 72,
    head: [['EMI PAYMENT DETAILS', '']],
    body: [
      ['Receipt No.', receiptNo],
      ['Customer Name', params.customerName],
      ['Loan ID', params.loanId],
      ['EMI Number', `${params.emiNumber}`],
      ['EMI Due Date', new Date(params.dueDate).toLocaleDateString('en-IN')],
      ['Payment Date', new Date(params.paidDate).toLocaleDateString('en-IN')],
      ['EMI Amount Due', `Rs. ${params.emiAmount.toLocaleString('en-IN')}`],
      ...(penalty > 0 ? [[`Penalty Charge (${ratePercentage}%/mo)`, `Rs. ${penalty.toLocaleString('en-IN')}`]] : []),
      ['Amount Paid', `Rs. ${(params.totalPaidAmount || params.paidAmount).toLocaleString('en-IN')}`],
      ...(params.coveredEMIs && params.coveredEMIs.length > 1 ? [['Covered Installments', `EMI ${params.coveredEMIs.join(', ')}`]] : []),
      ['Payment Method', params.paymentMethod.replace('_', ' ').toUpperCase()],
      ['Transaction / Ref. No.', params.transactionRef || '—'],
      ['Payment Status', (params.totalEMIs && params.paidEMIsCount === params.totalEMIs) || params.remainingBalance <= 0 ? 'LOAN FULLY REPAID' : 'PAID'],
      ['Remaining Loan Balance', `Rs. ${params.remainingBalance.toLocaleString('en-IN')}`],
      ...(params.totalEMIs && params.paidEMIsCount !== undefined
        ? [[`EMI Progress`, `${params.paidEMIsCount} of ${params.totalEMIs} EMIs paid`]]
        : []),
    ],
    headStyles: { fillColor: [34, 197, 94], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [240, 253, 244] },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 70 } },
    styles: { fontSize: 10 },
    // Highlight remaining balance row
    didParseCell: (data: any) => {
      const isFullyRepaid = params.remainingBalance <= 0 || (params.totalEMIs && params.paidEMIsCount === params.totalEMIs);
      
      const rows = [
        'Receipt No.', 'Customer Name', 'Loan ID', 'EMI Number', 'EMI Due Date',
        'Payment Date', 'EMI Amount Due',
        ...(penalty > 0 ? [`Penalty Charge (${ratePercentage}%/mo)`] : []),
        'Amount Paid',
        ...(params.coveredEMIs && params.coveredEMIs.length > 1 ? ['Covered Installments'] : []),
        'Payment Method', 'Transaction / Ref. No.', 'Payment Status',
        'Remaining Loan Balance',
        ...(params.totalEMIs && params.paidEMIsCount !== undefined ? ['EMI Progress'] : []),
      ];

      const balanceRowIndex = rows.indexOf('Remaining Loan Balance');
      const statusRowIndex = rows.indexOf('Payment Status');

      if (data.section === 'body' && (data.row.index === balanceRowIndex || (isFullyRepaid && data.row.index === statusRowIndex))) {
        data.cell.styles.fillColor = isFullyRepaid
          ? [220, 252, 231]   // green-100 — fully paid
          : [254, 243, 199];  // yellow-100 — still outstanding
        data.cell.styles.textColor = isFullyRepaid
          ? [21, 128, 61]     // green-700
          : [146, 64, 14];    // amber-800
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  const finalY = ((doc as any).lastAutoTable?.finalY ?? 100) + 10;

  // ─── Remaining Balance highlight box ─────────────────────────────────────
  const isFullyRepaidSummary = params.remainingBalance <= 0 || (params.totalEMIs && params.paidEMIsCount === params.totalEMIs);
  if (isFullyRepaidSummary) {
    // Loan fully repaid
    doc.setFillColor(220, 252, 231); // green-100
    doc.roundedRect(14, finalY, 182, 18, 3, 3, 'F');
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(21, 128, 61); // green-700
    doc.text('Loan Fully Repaid — Gold Can Be Returned!', 105, finalY + 11, { align: 'center' });
  } else {
    // Still outstanding
    doc.setFillColor(254, 243, 199); // yellow-100
    doc.roundedRect(14, finalY, 182, 18, 3, 3, 'F');
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(146, 64, 14); // amber-800
    doc.text(
      `Outstanding Balance After This Payment:   Rs. ${params.remainingBalance.toLocaleString('en-IN')}`,
      105, finalY + 11, { align: 'center' }
    );
  }

  const notesY = finalY + 26;
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.setFont('helvetica', 'normal');
  doc.text('Keep this receipt for your records. Present this as proof of payment if required.', 14, notesY);
  doc.text('This is a computer-generated receipt and is valid without a physical signature.', 14, notesY + 6);

  // ─── Footer ───────────────────────────────────────────────────────────────
  doc.setFillColor(245, 245, 245);
  doc.rect(0, 272, 210, 25, 'F');
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text('Thank you for your payment! — ' + shop_name, 105, 280, { align: 'center' });
  doc.text(`${shop_address} | ${shop_phone}`, 105, 286, { align: 'center' });

  doc.save(`EMI-Receipt-${params.loanId}-EMI${params.emiNumber}.pdf`);

  // Save a copy of loan completed receipt inside customer folder in Electron if fully repaid
  const isFullyRepaid = params.remainingBalance <= 0 || (params.totalEMIs && params.paidEMIsCount === params.totalEMIs);
  if (isFullyRepaid) {
    const pdfBuffer = doc.output('arraybuffer');
    savePdfToCustomerFolder(pdfBuffer, `Loan-Completed-Receipt-${params.loanId}.pdf`, params.customerName).catch(console.error);
  }
}
