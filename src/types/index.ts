export interface KYCDocument {
  id: string;
  type: string;
  number: string;
  status: 'pending' | 'verified' | 'rejected';
  fileUrl?: string; // Local path in Electron, Supabase URL in Online mode
  fileName?: string;
  fileType?: string;
  verifiedAt?: string;
  verifiedBy?: string;
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  kycStatus: 'pending' | 'verified' | 'rejected';
  kycDocument: string; // Keep for legacy
  kycNumber: string;   // Keep for legacy
  kycDocuments?: KYCDocument[]; // New field for multiple docs
  createdAt: string;
  photoUrl?: string;
  createdBy?: string;
}

export interface GoldRate {
  id: string;
  goldType: '24K' | '22K' | '18K';
  ratePerGram: number;
  updatedAt: string;
}

export interface LoanType {
  id: string;
  name: string;
  interestRate: number;
  minAmount: number;
  maxAmount: number;
  minTenure: number;
  maxTenure: number;
  repaymentScheme?: 'EMI' | 'BULLET';
}

export interface Loan {
  id: string;
  customerId: string;
  customerName: string;
  goldWeight: number;
  goldType: '24K' | '22K' | '18K';
  goldValue: number;
  itemType: string;
  loanAmount: number;
  loanTypeId: string;
  loanTypeName: string;
  interestRate: number;
  tenure: number;
  startDate: string;
  endDate: string;
  status: 'active' | 'closed' | 'defaulted' | 'completed' | 'auctioned' | 'overdue';
  emiAmount: number;
  createdBy?: string;
  branchId?: string;
  lockerNumber?: string;
  packetNumber?: string;
  ornamentPhotoUrl?: string;
  repaymentScheme?: 'EMI' | 'BULLET';
  penaltyRate?: number;
}

export interface LoanTransfer {
  id: string;
  loanId: string;
  fromCustomerId: string;
  toCustomerId: string;
  fromBranch?: string;
  toBranch?: string;
  transferDate: string;
  outstandingAmount: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedBy: string;
  requestedByName: string;
  approvedBy?: string;
  approvedByName?: string;
  rejectionReason?: string;
}

export interface EMI {
  id: string;
  loanId: string;
  customerId: string;
  customerName: string;
  emiNumber: number;
  dueDate: string;
  amount: number;
  status: 'pending' | 'paid' | 'overdue';
  paidDate?: string;
  paidAmount?: number;
  paymentMethod?: string;
  transactionRef?: string;
  paymentId?: string;
  createdBy?: string;
  penaltyRate?: number;
}

export interface Payment {
  id: string;
  loanId: string;
  paymentType: 'INTEREST' | 'PARTIAL' | 'FULL_CLOSURE' | 'RENEWAL' | 'PENALTY';
  amount: number;
  paymentDate: string;
  principalComponent: number;
  interestComponent: number;
  penaltyComponent: number;
  paymentMethod?: string;
  transactionRef?: string;
  createdBy?: string;
  createdAt: string;
  customerName?: string;
}

export interface User {
  id: string;
  username: string;
  name: string;
  role: 'admin' | 'staff';
  email: string;
  createdAt: string;
}

export type ActivityType = 
  | 'login'
  | 'logout'
  | 'customer_added'
  | 'customer_updated'
  | 'customer_deleted'
  | 'loan_created'
  | 'loan_updated'
  | 'loan_closed'
  | 'loan_transfer_requested'
  | 'loan_transfer_approved'
  | 'loan_transfer_rejected'
  | 'loan_transfer_cleared'
  | 'emi_paid'
  | 'bullet_payment_made'
  | 'kyc_verified'
  | 'kyc_rejected'
  | 'gold_rate_updated'
  | 'settings_updated'
  | 'user_deleted';

export interface ActivityLog {
  id: string;
  userId: string;
  userName: string;
  userRole: 'admin' | 'staff';
  activityType: ActivityType;
  description: string;
  details?: string;
  timestamp: string;
  ipAddress?: string;
}
