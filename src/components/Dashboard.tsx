import { useState, useEffect } from 'react';
import { Users, CreditCard, AlertCircle, TrendingUp, CheckCircle, Clock, DollarSign, Calendar } from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { User, Customer, Loan, EMI, ActivityLog } from '../types';
import { getAllCustomers } from '../lib/db/customerService';
import { getAllLoans } from '../lib/db/loanService';
import { getAllEMIs } from '../lib/db/emiService';
import { getActivityLogs } from '../lib/activityLogger';
import { ConfirmationModal } from './ConfirmationModal';

interface DashboardProps {
  currentUser: User;
}

export function Dashboard({ currentUser }: DashboardProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [emis, setEmis] = useState<EMI[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    try {
      const allCustomers = getAllCustomers();
      const allLoans = getAllLoans();
      const allEmis = getAllEMIs();

      if (currentUser.role === 'staff') {
        const staffCustomers = allCustomers.filter((c: Customer) => c.createdBy === currentUser.id);
        const staffLoans = allLoans.filter((l: Loan) => l.createdBy === currentUser.id);
        setCustomers(staffCustomers);
        setLoans(staffLoans);
        setEmis(allEmis.filter((e: EMI) => e.createdBy === currentUser.id));
      } else {
        setCustomers(allCustomers);
        setLoans(allLoans);
        setEmis(allEmis);
      }
    } catch {
      // DB may not be ready
    }
  };

  const totalCustomers = customers.length;
  const verifiedCustomers = customers.filter((c: Customer) => c.kycStatus === 'verified').length;
  const activeLoansCount = loans.filter((l: Loan) => l.status === 'active').length;
  const totalLoanAmount = loans.filter((l: Loan) => l.status === 'active').reduce((sum: number, loan: Loan) => sum + loan.loanAmount, 0);
  const pendingEMIs = emis.filter((e: EMI) => e.status === 'pending').length;
  const overdueEMIs = emis.filter((e: EMI) => e.status === 'overdue').length;
  const collectedEMIs = emis.filter((e: EMI) => e.status === 'paid').reduce((sum: number, emi: EMI) => sum + (emi.paidAmount || 0), 0);

  const stats = [
    {
      label: 'Total Customers',
      value: totalCustomers,
      subValue: `${verifiedCustomers} verified`,
      icon: Users,
      color: 'bg-blue-500',
    },
    {
      label: 'Active Loans',
      value: activeLoansCount,
      subValue: `₹${(totalLoanAmount / 100000).toFixed(1)}L total`,
      icon: DollarSign,
      color: 'bg-yellow-500',
    },
    {
      label: 'Pending EMIs',
      value: pendingEMIs,
      subValue: `${overdueEMIs} overdue`,
      icon: CreditCard,
      color: 'bg-green-500',
    },
    {
      label: 'EMIs Collected',
      value: `₹${(collectedEMIs / 100000).toFixed(1)}L`,
      subValue: 'This month',
      icon: TrendingUp,
      color: 'bg-purple-500',
    },
  ];

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h2 className="text-xl md:text-2xl font-semibold text-gray-900">Dashboard Overview</h2>
      </div>

      {/* Stats Grid */}
      <div className="dashboard-stats-grid">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div key={index} className="app-card flex flex-col h-full">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-xs md:text-sm text-gray-500 mb-1 font-medium">{stat.label}</p>
                  <p className="text-2xl md:text-3xl font-bold text-gray-900 mb-1">{stat.value}</p>
                  <p className="text-xs md:text-sm text-gray-400 font-medium">{stat.subValue}</p>
                </div>
                <div className={`${stat.icon !== BrandLogo ? stat.color : ''} w-10 h-10 md:w-12 md:h-12 rounded-none border border-black/15 flex items-center justify-center flex-shrink-0 overflow-hidden`}>
                  {stat.icon === BrandLogo ? (
                    <BrandLogo className="w-full h-full" />
                  ) : (
                    <Icon className="w-5 h-5 md:w-6 md:h-6 text-white" />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Current Month's Pending EMIs */}
      {(() => {
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        
        const currentMonthEmis = emis.filter((e: EMI) => {
          const dueDate = new Date(e.dueDate);
          return dueDate.getMonth() === currentMonth && 
                 dueDate.getFullYear() === currentYear &&
                 (e.status === 'pending' || e.status === 'overdue');
        });

        if (currentMonthEmis.length === 0) return null;

        return (
          <div className="bg-white rounded-none border border-black/15 p-4 md:p-6 border border-black/15 shadow-sm flex flex-col hover:shadow-md transition-all duration-300">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-yellow-600" />
                <h3 className="text-base md:text-lg font-semibold text-gray-900">
                  Current Month's Pending EMIs
                </h3>
              </div>
              <span className="text-[10px] md:text-xs font-bold text-gray-400 uppercase tracking-widest px-3 py-1 bg-gray-50 rounded-none border border-black/15">
                {now.toLocaleString('default', { month: 'long', year: 'numeric' })}
              </span>
            </div>
            
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {currentMonthEmis.map((emi: EMI) => (
                <div key={emi.id} className={`${emi.status === 'overdue' ? 'bg-red-50 border-black/15' : 'bg-yellow-50 border-black/15'} rounded-none border border-black/15 p-4 border hover:shadow-sm transition-all`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm md:text-base text-gray-900 truncate">{emi.customerName}</p>
                      <p className="text-xs md:text-sm text-gray-600 font-medium mt-0.5">EMI #{emi.emiNumber} • ₹{emi.amount.toLocaleString()}</p>
                      <div className="flex items-center gap-1.5 mt-2">
                        <Clock className={`w-3 h-3 ${emi.status === 'overdue' ? 'text-red-500' : 'text-yellow-600'}`} />
                        <p className={`text-[10px] md:text-xs font-bold uppercase tracking-wider ${emi.status === 'overdue' ? 'text-red-600' : 'text-yellow-700'}`}>
                          Due: {new Date(emi.dueDate).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    {emi.status === 'overdue' ? (
                      <div className="text-[10px] bg-red-600 text-white px-2 py-1 rounded font-bold uppercase">Overdue</div>
                    ) : (
                      <div className="text-[10px] bg-yellow-500 text-white px-2 py-1 rounded font-bold uppercase">Pending</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Active Loans Summary - Staff Only */}
      {currentUser.role === 'staff' && (
        <div className="bg-white rounded-none border border-black/15 p-4 md:p-6 border border-black/15 shadow-sm hover:shadow-md transition-all duration-300">
          <h3 className="text-base md:text-lg font-semibold text-gray-900 mb-4">Active Loans Summary</h3>
          <div className="overflow-x-auto -mx-4 md:mx-0">
            <div className="inline-block min-w-full align-middle">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-black/15">
                    <th className="text-left py-3 px-3 md:px-4 text-xs md:text-sm font-medium text-gray-500 whitespace-nowrap">Customer</th>
                    <th className="text-left py-3 px-3 md:px-4 text-xs md:text-sm font-medium text-gray-500 whitespace-nowrap">Loan Amount</th>
                    <th className="text-left py-3 px-3 md:px-4 text-xs md:text-sm font-medium text-gray-500 whitespace-nowrap">Gold Weight</th>
                    <th className="text-left py-3 px-3 md:px-4 text-xs md:text-sm font-medium text-gray-500 whitespace-nowrap">EMI Amount</th>
                    <th className="text-left py-3 px-3 md:px-4 text-xs md:text-sm font-medium text-gray-500 whitespace-nowrap">Tenure</th>
                    <th className="text-left py-3 px-3 md:px-4 text-xs md:text-sm font-medium text-gray-500 whitespace-nowrap">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loans.filter((l: Loan) => l.status === 'active').map((loan: Loan) => (
                    <tr key={loan.id} className="border-b border-black/15 last:border-0 hover:bg-gray-50 transition-colors">
                      <td className="py-3 px-3 md:px-4 text-xs md:text-sm text-gray-900 whitespace-nowrap font-medium">{loan.customerName}</td>
                      <td className="py-3 px-3 md:px-4 text-xs md:text-sm text-gray-900 whitespace-nowrap font-bold">₹{loan.loanAmount.toLocaleString()}</td>
                      <td className="py-3 px-3 md:px-4 text-xs md:text-sm text-gray-900 whitespace-nowrap">{loan.goldWeight}g ({loan.goldType})</td>
                      <td className="py-3 px-3 md:px-4 text-xs md:text-sm text-gray-900 whitespace-nowrap font-medium">₹{loan.emiAmount.toLocaleString()}</td>
                      <td className="py-3 px-3 md:px-4 text-xs md:text-sm text-gray-900 whitespace-nowrap">{loan.tenure} mo</td>
                      <td className="py-3 px-3 md:px-4">
                        <span className="inline-flex items-center px-2 md:px-2.5 py-0.5 rounded-full text-[10px] md:text-xs font-bold bg-green-100 text-green-800 whitespace-nowrap uppercase">
                          Active
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Admin-only Customer Directory */}
      {currentUser.role === 'admin' && (
        <div className="bg-white rounded-none border border-black/15 p-4 md:p-6 border border-black/15 shadow-sm hover:shadow-md transition-all duration-300">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base md:text-lg font-semibold text-gray-900">Global Customer Directory</h3>
            <span className="text-[10px] md:text-xs font-bold text-gray-400 uppercase tracking-widest">{customers.length} total customers</span>
          </div>
          <div className="overflow-x-auto -mx-4 md:mx-0">
            <div className="inline-block min-w-full align-middle">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-black/15">
                    <th className="text-left py-3 px-3 md:px-4 text-xs md:text-sm font-medium text-gray-500 whitespace-nowrap">Customer Info</th>
                    <th className="text-left py-3 px-3 md:px-4 text-xs md:text-sm font-medium text-gray-500 whitespace-nowrap">Identity Verification</th>
                    <th className="text-left py-3 px-3 md:px-4 text-xs md:text-sm font-medium text-gray-500 whitespace-nowrap">Active Loan Categories</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {customers.map((customer) => {
                    const customerLoans = loans.filter(l => l.customerId === customer.id);
                    return (
                      <tr key={customer.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="py-4 px-3 md:px-4">
                          <p className="text-xs md:text-sm text-gray-900 font-bold">{customer.name}</p>
                          <p className="text-[10px] md:text-xs text-gray-500 font-medium">{customer.phone}</p>
                        </td>
                        <td className="py-4 px-3 md:px-4">
                          <p className="text-xs md:text-sm text-gray-900 font-semibold">{customer.kycDocument}</p>
                          <p className="text-[10px] md:text-xs text-gray-400 font-mono tracking-tighter italic">{customer.kycNumber}</p>
                        </td>
                        <td className="py-4 px-3 md:px-4">
                          {customerLoans.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5 focus-within:">
                              {Array.from(new Set(customerLoans.map(l => l.loanTypeName))).map((type, idx) => (
                                <span key={idx} className="inline-flex items-center px-2 py-0.5 rounded-none border border-black/15 text-[9px] md:text-[10px] font-bold bg-yellow-100 text-yellow-700 uppercase border border-black/15 shadow-sm">
                                  {type}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[10px] md:text-xs text-gray-400 italic">No loans history</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <div />
    </div>
  );
}
