import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';
import { Badge } from './ui/badge';
import {
  FileText,
  Download,
  Filter,
  Search,
  Calendar,
  Activity,
  LogIn,
  LogOut,
  UserPlus,
  CheckCircle,
  XCircle,
  TrendingUp,
  Clock,
  Trash2,
  CreditCard,
} from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { getActivityLogs, getMonthlyReport, clearActivityLogs } from '../lib/activityLogger';
import { ActivityLog, ActivityType, User } from '../types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { ConfirmationModal } from './ConfirmationModal';
import { AdminTransferDashboard } from './AdminTransferDashboard';
import { Send } from 'lucide-react';
import { generateExcelXML } from '../lib/reportUtils';

interface StaffReportsProps {
  currentUser: User;
}

export function StaffReports({ currentUser }: StaffReportsProps) {
  const [selectedUser, setSelectedUser] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const refreshLogs = () => {
    setActivityLogs(getActivityLogs());
  };

  const handleClearLogs = () => {
    setShowClearConfirm(true);
  };

  const confirmClearLogs = () => {
    clearActivityLogs();
    refreshLogs();
    setShowClearConfirm(false);
  };

  useEffect(() => {
    refreshLogs();
  }, []);

  // Get unique users from activity logs
  const uniqueUsers = useMemo(() => {
    const users = new Map();
    activityLogs.forEach(log => {
      // Exclude Admin users from the report lists (requested)
      if (log.userRole !== 'admin' && !users.has(log.userId)) {
        users.set(log.userId, { id: log.userId, name: log.userName, role: log.userRole });
      }
    });
    return Array.from(users.values());
  }, [activityLogs]);

  // Filter activities
  const filteredActivities = useMemo(() => {
    // Force staff-only logs by filtering out admin entries
    let filtered = activityLogs.filter(log => log.userRole !== 'admin');

    // Filter by user
    if (selectedUser !== 'all') {
      filtered = filtered.filter(log => log.userId === selectedUser);
    }

    // Filter by activity type
    if (selectedType !== 'all') {
      filtered = filtered.filter(log => log.activityType === selectedType);
    }

    // Filter by search query
    if (searchQuery) {
      filtered = filtered.filter(log =>
        log.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.userName.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Filter by date range
    if (dateFrom) {
      filtered = filtered.filter(log => new Date(log.timestamp) >= new Date(dateFrom));
    }
    if (dateTo) {
      filtered = filtered.filter(log => new Date(log.timestamp) <= new Date(dateTo + 'T23:59:59'));
    }

    return filtered;
  }, [activityLogs, selectedUser, selectedType, searchQuery, dateFrom, dateTo]);

  // Get monthly report data
  const monthlyReportData = useMemo(() => {
    if (selectedUser === 'all') return [];
    return getMonthlyReport(selectedUser, selectedYear, selectedMonth);
  }, [selectedUser, selectedYear, selectedMonth]);


  const getActivityIcon = (type: ActivityType) => {
    switch (type) {
      case 'login': return <LogIn className="w-4 h-4" />;
      case 'logout': return <LogOut className="w-4 h-4" />;
      case 'customer_added': return <UserPlus className="w-4 h-4" />;
      case 'loan_created': return <BrandLogo className="w-4 h-4" />;
      case 'emi_paid': return <CreditCard className="w-4 h-4" />;
      case 'kyc_verified': return <CheckCircle className="w-4 h-4" />;
      case 'kyc_rejected': return <XCircle className="w-4 h-4" />;
      case 'gold_rate_updated': return <TrendingUp className="w-4 h-4" />;
      default: return <Activity className="w-4 h-4" />;
    }
  };

  const getActivityBadgeVariant = (type: ActivityType): "default" | "secondary" | "destructive" | "outline" => {
    switch (type) {
      case 'login':
      case 'customer_added':
      case 'loan_created':
      case 'kyc_verified':
        return 'default';
      case 'logout':
        return 'secondary';
      case 'kyc_rejected':
      case 'loan_closed':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  const escapeCSV = (field: string | number | boolean | null | undefined): string => {
    if (field === null || field === undefined) return '';
    const str = String(field);
    if (str.includes(',') || str.includes('\n') || str.includes('"')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const exportToCSV = () => {
    const timestamp = new Date().toISOString().split('T')[0];
    const headers = ['TIMESTAMP', 'STAFF NAME', 'ACTIVITY TYPE', 'DESCRIPTION', 'DETAILS'];
    const data = filteredActivities.map(log => [
      new Date(log.timestamp).toISOString().replace('T', ' ').substring(0, 19),
      log.userName,
      log.activityType.toUpperCase().replace(/_/g, ' '),
      log.description,
      log.details || '',
    ]);

    const xmlData = generateExcelXML(headers, data, [140, 120, 120, 250, 300]);
    const blob = new Blob([xmlData], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `GoldLoan_Staff_Report_${timestamp}.xls`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportMonthlyReport = () => {
    if (selectedUser === 'all') return;
    
    const headers = ['TIMESTAMP', 'ACTIVITY TYPE', 'DESCRIPTION', 'DETAILS'];
    const data = monthlyReportData.map(log => [
      new Date(log.timestamp).toISOString().replace('T', ' ').substring(0, 19),
      log.activityType.toUpperCase().replace(/_/g, ' '),
      log.description,
      log.details || '',
    ]);

    const userName = uniqueUsers.find(u => u.id === selectedUser)?.name || 'Staff';
    const monthName = new Date(selectedYear, selectedMonth - 1).toLocaleString('default', { month: 'long' });

    const xmlData = generateExcelXML(headers, data, [140, 120, 250, 300]);
    const blob = new Blob([xmlData], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Monthly_Report_${userName}_${monthName}_${selectedYear}.xls`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleManualRefresh = () => {
    refreshLogs();
  };


  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl md:text-3xl font-bold text-gray-900">Staff Reports & Activity</h2>
        <div className="mt-1">
          <p className="text-sm md:text-base text-gray-600">
            Monitor staff activities, login history, and generate reports
          </p>
        </div>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="activity" className="space-y-4">
        <TabsList className="flex flex-row items-center justify-start w-full lg:w-auto bg-gray-100/80 p-1.5 rounded-none border border-black/15 shadow-inner overflow-x-auto scrollbar-hide gap-1.5 mb-6">
          <TabsTrigger value="activity" className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-none border border-black/15 transition-all whitespace-nowrap flex-1 text-xs md:text-sm font-bold data-[state=active]:bg-white data-[state=active]:text-yellow-600 data-[state=active]:shadow-md data-[state=active]:translate-y-[-1px] text-gray-500 hover:text-gray-700">
            <Activity className="w-4 h-4" />
            <span className="min-w-max">Activity Logs</span>
          </TabsTrigger>
          <TabsTrigger value="monthly" className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-none border border-black/15 transition-all whitespace-nowrap flex-1 text-xs md:text-sm font-bold data-[state=active]:bg-white data-[state=active]:text-yellow-600 data-[state=active]:shadow-md data-[state=active]:translate-y-[-1px] text-gray-500 hover:text-gray-700">
            <FileText className="w-4 h-4" />
            <span className="min-w-max">Monthly Reports</span>
          </TabsTrigger>
          <TabsTrigger value="transfers" className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-none border border-black/15 transition-all whitespace-nowrap flex-1 text-xs md:text-sm font-bold data-[state=active]:bg-white data-[state=active]:text-yellow-600 data-[state=active]:shadow-md data-[state=active]:translate-y-[-1px] text-gray-500 hover:text-gray-700">
            <Send className="w-4 h-4" />
            <span className="min-w-max">Transfer Requests</span>
          </TabsTrigger>
        </TabsList>

        {/* Activity Logs Tab */}
        <TabsContent value="activity" className="space-y-4">
          <div className="bg-white rounded-none border border-black/15 shadow-sm overflow-hidden hover:shadow-md transition-all duration-300">
            <div className="px-6 py-4 border-b border-black/15 bg-gray-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Activity Logs</h3>
                <p className="text-xs text-gray-500">View and filter all staff activities</p>
              </div>
              <div className="flex flex-row flex-wrap items-center justify-end gap-2 w-full sm:w-auto">
                <Button 
                  onClick={handleClearLogs} 
                  variant="outline" 
                  size="sm"
                  className="text-red-500 hover:text-red-600 hover:bg-red-50 border-black/15 font-semibold px-3 h-8 text-xs rounded-none border border-black/15 transition-all active:scale-95"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-2" />
                  Clear Logs
                </Button>
                <Button 
                  onClick={exportToCSV} 
                  size="sm" 
                  className="px-3 h-8 text-xs font-semibold rounded-none border border-black/15 bg-yellow-500 text-white hover:bg-yellow-600 shadow-sm transition-all active:scale-95"
                >
                  <Download className="w-3.5 h-3.5 mr-2" />
                  Export CSV
                </Button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              {/* Filters */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-gray-500 uppercase">Staff Member</Label>
                  <Select value={selectedUser} onValueChange={setSelectedUser}>
                    <SelectTrigger className="rounded-none border border-black/15 h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Staff</SelectItem>
                      {uniqueUsers.map(user => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-gray-500 uppercase">Activity Type</Label>
                  <Select value={selectedType} onValueChange={setSelectedType}>
                    <SelectTrigger className="rounded-none border border-black/15 h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="login">Login</SelectItem>
                      <SelectItem value="logout">Logout</SelectItem>
                      <SelectItem value="customer_added">Customer Added</SelectItem>
                      <SelectItem value="loan_created">Loan Created</SelectItem>
                      <SelectItem value="emi_paid">EMI Paid</SelectItem>
                      <SelectItem value="kyc_verified">KYC Verified</SelectItem>
                      <SelectItem value="kyc_rejected">KYC Rejected</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-gray-500 uppercase">From Date</Label>
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="rounded-none border border-black/15 h-10"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-gray-500 uppercase">To Date</Label>
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="rounded-none border border-black/15 h-10"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-gray-500 uppercase">Search Details</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      placeholder="Keywords..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 rounded-none border border-black/15 h-10"
                    />
                  </div>
                </div>
              </div>

              {/* Activity Table - Desktop */}
              <div className="hidden md:block rounded-none border border-black/15 overflow-hidden">
                <Table>
                  <TableHeader className="bg-gray-50/50">
                    <TableRow>
                      <TableHead className="w-[180px] font-bold text-gray-600">Timestamp</TableHead>
                      <TableHead className="font-bold text-gray-600">Staff</TableHead>
                      <TableHead className="font-bold text-gray-600">Activity</TableHead>
                      <TableHead className="font-bold text-gray-600">Description</TableHead>
                      <TableHead className="hidden lg:table-cell font-bold text-gray-600">Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredActivities.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-12 text-gray-500">
                          <Clock className="w-12 h-12 mx-auto mb-3 text-gray-200" />
                          <p className="font-medium">No activity records match your filters.</p>
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredActivities.map((log) => (
                        <TableRow key={log.id} className="hover:bg-gray-50/50 transition-colors">
                          <TableCell className="font-mono text-xs text-gray-500">
                            {new Date(log.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                          </TableCell>
                          <TableCell>
                            <div className="font-bold text-gray-900">{log.userName}</div>
                            <div className="text-[10px] text-gray-400 uppercase font-medium">{log.userRole}</div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={getActivityBadgeVariant(log.activityType)} className="gap-1.5 font-bold uppercase tracking-wider text-[10px] py-1">
                              {getActivityIcon(log.activityType)}
                              {log.activityType.replace(/_/g, ' ')}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-xs truncate text-sm text-gray-700">{log.description}</TableCell>
                          <TableCell className="hidden lg:table-cell max-w-sm truncate text-gray-400 text-xs italic">
                            {log.details || '-'}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Activity Logs - Mobile List (Simplified) */}
              <div className="md:hidden">
                {filteredActivities.length === 0 ? (
                  <div className="bg-gray-50 rounded-none border border-black/15 p-12 text-center border-2 border-dashed border-black/15">
                    <Activity className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">No activity found.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {filteredActivities.slice(0, 50).map((log) => (
                      <div key={log.id} className="py-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-gray-400">
                              {getActivityIcon(log.activityType)}
                            </span>
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                              {log.activityType.replace(/_/g, ' ')}
                            </span>
                          </div>
                          <p className="text-[10px] text-gray-400 font-mono">
                            {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {new Date(log.timestamp).toLocaleDateString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm font-bold text-gray-900 leading-tight">{log.description}</p>
                          <p className="text-xs text-gray-500 mt-1">By <span className="font-semibold text-gray-700">{log.userName}</span></p>
                        </div>
                        {log.details && (
                          <p className="text-[10px] text-gray-400 italic bg-gray-50 p-2 rounded-none border border-black/15">
                            {log.details}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {filteredActivities.length > 0 && (
                <p className="text-sm text-gray-500 text-center">
                  Showing {filteredActivities.length} {filteredActivities.length === 1 ? 'activity' : 'activities'}
                </p>
              )}
            </div>
          </div>
        </TabsContent>

        {/* Monthly Reports Tab */}
        <TabsContent value="monthly" className="space-y-4">
          <div className="bg-white rounded-none border border-black/15 shadow-sm overflow-hidden hover:shadow-md transition-all duration-300">
            <div className="px-6 py-4 border-b border-black/15 bg-gray-50/50">
              <h3 className="text-lg font-bold text-gray-900">Monthly Reports</h3>
              <p className="text-xs text-gray-500">Generate detailed monthly activity reports for staff members</p>
            </div>
            <div className="p-6 space-y-6">
              {/* Report Filters */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Staff Member</Label>
                  <Select value={selectedUser} onValueChange={setSelectedUser}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select staff" />
                    </SelectTrigger>
                    <SelectContent>
                      {uniqueUsers.map(user => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Month</Label>
                  <Select value={selectedMonth.toString()} onValueChange={(v: string) => setSelectedMonth(parseInt(v))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map(month => (
                        <SelectItem key={month} value={month.toString()}>
                          {new Date(2024, month - 1).toLocaleString('default', { month: 'long' })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Year</Label>
                  <Select value={selectedYear.toString()} onValueChange={(v: string) => setSelectedYear(parseInt(v))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 60 }, (_, i) => 2020 + i).map(year => (
                        <SelectItem key={year} value={year.toString()}>
                          {year}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {selectedUser !== 'all' && (
                <>
                  {/* Report Summary */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 lg:items-stretch">
                    <div className="p-4 bg-gray-50 rounded-none border border-black/15 flex flex-col justify-center">
                      <p className="text-xs text-gray-400 font-medium mb-1">Total Activities</p>
                      <p className="text-xl font-bold text-gray-900">{monthlyReportData.length}</p>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-none border border-black/15 flex flex-col justify-center">
                      <p className="text-xs text-gray-400 font-medium mb-1">Login Sessions</p>
                      <p className="text-xl font-bold text-gray-900">
                        {monthlyReportData.filter(l => l.activityType === 'login').length}
                      </p>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-none border border-black/15 flex flex-col justify-center">
                      <p className="text-xs text-gray-400 font-medium mb-1">Customers Added</p>
                      <p className="text-xl font-bold text-gray-900">
                        {monthlyReportData.filter(l => l.activityType === 'customer_added').length}
                      </p>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-none border border-black/15 flex flex-col justify-center">
                      <p className="text-xs text-gray-400 font-medium mb-1">Loans Created</p>
                      <p className="text-xl font-bold text-gray-900">
                        {monthlyReportData.filter(l => l.activityType === 'loan_created').length}
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-end">
                  <Button 
                    onClick={exportMonthlyReport} 
                    disabled={monthlyReportData.length === 0}
                    className="bg-yellow-500 text-white hover:bg-yellow-600"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download Report
                  </Button>
                  </div>

                  {/* Monthly Report Table */}
                  <div className="rounded-none border border-black/15 overflow-hidden">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date & Time</TableHead>
                            <TableHead>Activity</TableHead>
                            <TableHead>Description</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {monthlyReportData.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={3} className="text-center py-8 text-gray-500">
                                <Calendar className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                                <p>No activities for this period</p>
                              </TableCell>
                            </TableRow>
                          ) : (
                            monthlyReportData.map((log) => (
                              <TableRow key={log.id}>
                                <TableCell className="font-mono text-xs">
                                  {new Date(log.timestamp).toLocaleString()}
                                </TableCell>
                                <TableCell>
                                  <Badge variant={getActivityBadgeVariant(log.activityType)} className="gap-1">
                                    {getActivityIcon(log.activityType)}
                                    <span>{log.activityType.replace(/_/g, ' ')}</span>
                                  </Badge>
                                </TableCell>
                                <TableCell>{log.description}</TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </>
              )}

              {selectedUser === 'all' && (
                <div className="text-center py-12 text-gray-500">
                  <FileText className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                  <p className="text-lg font-medium">Select a staff member to view monthly report</p>
                  <p className="text-sm mt-2">Choose a staff member from the dropdown above</p>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* Transfer Requests Tab */}
        <TabsContent value="transfers" className="space-y-4">
          <div className="bg-white rounded-none border border-black/15 shadow-sm p-6 overflow-hidden">
             <AdminTransferDashboard currentUser={currentUser} />
          </div>
        </TabsContent>
      </Tabs>

      <ConfirmationModal
        isOpen={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        onConfirm={confirmClearLogs}
        title="Clear Activity Logs"
        message="Are you sure you want to clear all activity logs? This will permanently remove all activity history for all staff members and cannot be undone."
        confirmText="Clear All Logs"
        type="danger"
      />
    </div>
  );
}
