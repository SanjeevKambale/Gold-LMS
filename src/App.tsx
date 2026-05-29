import { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Users, 
  CreditCard, 
  TrendingUp, 
  Activity, 
  LogOut, 
  Menu, 
  X, 
  User as UserIcon, 
  Settings as SettingsIcon,
  DollarSign,
  Send
} from 'lucide-react';
import { User, ActivityLog } from './types';
import { Dashboard } from './components/Dashboard';
import { CustomerManagement } from './components/CustomerManagement';
import { LoanManagement } from './components/LoanManagement';
import { EMIManagement } from './components/EMIManagement';
import { LoanTransferManagement } from './components/LoanTransferManagement';
import { GoldRateManagement } from './components/GoldRateManagement';
import { Settings } from './components/Settings';
import { StaffReports } from './components/StaffReports';
import { Login } from './components/Login';
import { SignUp } from './components/SignUp';
import { ForgotPassword } from './components/ForgotPassword';
import { Welcome } from './components/Welcome';
import { initDatabase, adminExists } from './lib/database';
import { getUserFromStorage, clearUserFromStorage } from './lib/auth';
import { getAllUsers } from './lib/db/authService';
import { logActivity } from './lib/activityLogger';
import { ConfirmationModal } from './components/ConfirmationModal';
import { Badge } from './components/ui/badge';
import { Button } from './components/ui/button';
import { BrandLogo } from './components/BrandLogo';
import { AdminVerificationModal } from './components/AdminVerificationModal';

type TabType = 'dashboard' | 'customers' | 'loans' | 'transfers' | 'emi' | 'rates' | 'reports' | 'settings';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    const hash = window.location.hash.replace('#', '') as TabType;
    const validTabs: TabType[] = ['dashboard', 'customers', 'loans', 'transfers', 'emi', 'rates', 'reports'];
    return validTabs.includes(hash) ? hash : 'dashboard';
  });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authScreen, setAuthScreen] = useState<'welcome' | 'login' | 'signup' | 'forgot-password'>('welcome');
  const [hasAdmin, setHasAdmin] = useState<boolean>(true);
  const [viewMode, setViewMode] = useState<'admin' | 'staff'>('admin');
  const [showAdminVerification, setShowAdminVerification] = useState(false);
  const [staffList, setStaffList] = useState<User[]>([]);
  const [impersonatedStaffId, setImpersonatedStaffId] = useState<string | null>(null);
  const [isStaffSelectorOpen, setIsStaffSelectorOpen] = useState(false);

  const handleToggleStaffSelector = () => {
    const newState = !isStaffSelectorOpen;
    setIsStaffSelectorOpen(newState);
    if (newState) {
      try {
        const users = getAllUsers();
        setStaffList(users.filter(u => u.role === 'staff'));
      } catch (err) {
        console.error('Error fetching staff list:', err);
      }
    }
  };

  // Check for existing session on mount
  useEffect(() => {
    const init = async () => {
      try {
        await initDatabase();
        const exists = adminExists();
        setHasAdmin(exists);
        
        const savedUser = getUserFromStorage();
        if (savedUser) {
          setCurrentUser(savedUser);
          setViewMode(savedUser.role);
          const hash = window.location.hash.replace('#', '') as TabType;
          const validTabs: TabType[] = ['dashboard', 'customers', 'loans', 'transfers', 'emi', 'rates', 'reports', 'settings'];
          if (!validTabs.includes(hash) || (hash === 'settings' && savedUser.role !== 'admin')) {
            const defaultTab = 'dashboard';
            setActiveTab(defaultTab);
            window.location.hash = defaultTab;
          } else {
            setActiveTab(hash);
          }
        } else if (!exists) {
          // If no admin exists, we stay on the welcome screen which will prompt for admin creation
          setAuthScreen('welcome');
        }
      } catch (err) {
        console.error('Database initialization error:', err);
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, []);

  // Listen to browser Back/Forward (hash changes)
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '') as TabType;
      const validTabs: TabType[] = ['dashboard', 'customers', 'loans', 'transfers', 'emi', 'rates', 'reports', 'settings'];
      
      if (validTabs.includes(hash)) {
        const effectiveRole = currentUser?.role === 'admin' ? viewMode : 'staff';
        const adminOnlyTabs = ['rates', 'reports', 'settings'];
        if (adminOnlyTabs.includes(hash) && effectiveRole !== 'admin') {
          const defaultTab = 'dashboard';
          setActiveTab(defaultTab);
          window.location.hash = defaultTab;
          return;
        }
        setActiveTab(hash);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [currentUser, viewMode]); // Fix #3: include currentUser to avoid stale closure

  const handleLoginSuccess = (user: User) => {
    setCurrentUser(user);
    setViewMode(user.role);
    if (user.role === 'admin') setHasAdmin(true);
    const defaultTab = 'dashboard';
    window.location.hash = defaultTab;
    setActiveTab(defaultTab);
    logActivity(user, 'login', `${user.name} logged in as ${user.role}`);
  };

  const handleSignUpSuccess = (user: User) => {
    // Auto-login the newly registered user (Fix #7)
    setCurrentUser(user);
    setViewMode(user.role);
    const defaultTab = 'dashboard';
    window.location.hash = defaultTab;
    setActiveTab(defaultTab);
    setAuthScreen('welcome');
    if (user.role === 'admin') setHasAdmin(true);
    logActivity(user, 'login', `${user.name} registered and signed in as ${user.role}`);
  };

  const handleLogout = () => {
    if (currentUser) {
      logActivity(currentUser, 'logout', 'Signed out from the application');
    }
    
    // Check if admin still exists (in case account was just deleted)
    setTimeout(() => {
      setHasAdmin(adminExists());
    }, 200);

    // Safety delay to ensure DB sync is complete and avoid Electron focus deadlocks
    setTimeout(() => {
      clearUserFromStorage();
      setCurrentUser(null);
      window.history.replaceState(null, '', '#');
      setActiveTab('dashboard');
      setAuthScreen('welcome');
    }, 100);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-black border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600 font-medium">Initializing Database...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    switch (authScreen) {
      case 'login':
        return (
          <Login 
            onLoginSuccess={handleLoginSuccess} 
            onSwitchToSignUp={() => setAuthScreen('signup')} 
            onForgotPassword={() => setAuthScreen('forgot-password')} 
            onBack={() => setAuthScreen('welcome')}
          />
        );
      case 'signup':
        return (
          <SignUp 
            onSignUpSuccess={handleSignUpSuccess} 
            onSwitchToLogin={() => setAuthScreen('login')} 
            onBack={() => setAuthScreen('welcome')}
          />
        );
      case 'forgot-password':
        return (
          <ForgotPassword 
            onBackToLogin={() => setAuthScreen('login')} 
          />
        );
      default:
        return <Welcome onNavigate={(screen) => setAuthScreen(screen)} hasAdmin={hasAdmin} />;
    }
  }

  const staffTabs = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'customers', label: 'Customers', icon: Users },
    { id: 'loans', label: 'Gold Loans', icon: DollarSign },
    { id: 'transfers', label: 'Loan Transfers', icon: Send },
    { id: 'emi', label: 'EMI Tracking', icon: CreditCard },
  ];

  const adminTabs = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'customers', label: 'Customers', icon: Users },
    { id: 'loans', label: 'Gold Loans', icon: DollarSign },
    { id: 'transfers', label: 'Loan Transfers', icon: Send },
    { id: 'emi', label: 'EMI Tracking', icon: CreditCard },
    { id: 'rates', label: 'Gold Rates', icon: TrendingUp },
    { id: 'reports', label: 'Staff Reports', icon: Activity },
    { id: 'settings', label: 'Settings', icon: SettingsIcon },
  ];

  const effectiveRole = currentUser.role === 'admin' ? viewMode : 'staff';
  
  let effectiveUser = { ...currentUser, role: effectiveRole };
  
  if (currentUser.role === 'admin' && viewMode === 'staff' && impersonatedStaffId) {
    const selectedStaff = staffList.find(s => s.id === impersonatedStaffId);
    if (selectedStaff) {
      effectiveUser = selectedStaff;
    }
  }

  const tabs = effectiveRole === 'admin' ? adminTabs : staffTabs;

  const handleTabChange = (tabId: TabType) => {
    window.location.hash = tabId;
    setActiveTab(tabId);
    setIsMobileMenuOpen(false);
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-gray-50">
      <header className="bg-white border-b border-black z-20 flex-shrink-0 shadow-sm">
        <div className="px-4 md:px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 md:gap-3">
              <div className="w-8 h-8 md:w-10 md:h-10 flex items-center justify-center overflow-hidden">
                <BrandLogo className="w-full h-full" />
              </div>
              <div>
                <h1 className="text-base md:text-xl font-bold text-gray-900">Gold Loan Manager</h1>
                <p className="text-[10px] md:text-xs text-gray-500 hidden sm:block font-medium">
                  {effectiveRole === 'admin' ? 'Administrative Control' : 'Secure Loan Management'}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="hidden md:flex items-center gap-2 px-3 h-9 bg-gray-50 rounded-none border border-black">
                <div className="w-6 h-6 bg-yellow-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <UserIcon className="w-3 h-3 text-yellow-700" />
                </div>
                <div className="text-left flex flex-col justify-center">
                  <p className="text-xs font-bold text-gray-900 leading-none mb-1">{currentUser.name}</p>
                  <p className="text-[10px] font-semibold text-gray-500 leading-none capitalize">{currentUser.role}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 md:border-l md:border-black md:pl-3 md:ml-1">
                <Button
                  onClick={handleLogout}
                  variant="outline"
                  size="sm"
                  className="border-black text-red-600 hover:bg-red-50 hover:border-black transition-colors h-9 px-4 font-semibold"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Logout
                </Button>
              </div>
            </div>
          </div>
        </div>
      </header>
 
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-64 bg-white border-r border-black overflow-y-auto flex-shrink-0">
          <nav className="p-4 space-y-1.5">
            {currentUser.role === 'admin' && (
              <div className="mb-4">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 px-2">Role Switch</p>
                <div className="space-y-1.5">
                  <button
                    onClick={() => {
                      if (viewMode !== 'admin') {
                        setShowAdminVerification(true);
                      }
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-none border border-black/15 transition-all ${
                      viewMode === 'admin' 
                        ? 'bg-yellow-500 text-white font-bold border-yellow-600 shadow-sm'
                        : 'bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <Activity className="w-4 h-4" />
                    <span className="text-sm font-semibold">Admin Dashboard</span>
                  </button>
                  <button
                    onClick={() => {
                      if (viewMode === 'admin') {
                        handleToggleStaffSelector();
                      }
                    }}
                    className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 rounded-none border border-black/15 transition-all ${
                      viewMode === 'staff' 
                        ? 'bg-yellow-500 text-white font-bold border-yellow-600 shadow-sm'
                        : 'bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Users className="w-4 h-4" />
                      <span className="text-sm font-semibold truncate max-w-[140px]">
                        {viewMode === 'staff' ? `Staff: ${effectiveUser.name}` : 'Staff Dashboard'}
                      </span>
                    </div>
                  </button>
                  {isStaffSelectorOpen && viewMode === 'admin' && (
                    <div className="pt-2 px-2 pb-1 animate-in fade-in slide-in-from-top-2 duration-200 space-y-1.5">
                      {staffList.length > 0 ? staffList.map((staff) => (
                        <button
                          key={staff.id}
                          onClick={() => {
                            setImpersonatedStaffId(staff.id);
                            setViewMode('staff');
                            setIsStaffSelectorOpen(false);
                            const adminOnlyTabs = ['rates', 'reports', 'settings'];
                            if (adminOnlyTabs.includes(activeTab)) {
                              handleTabChange('dashboard');
                            }
                          }}
                          className="w-full text-left px-3 py-2 text-sm bg-white border border-black/15 hover:bg-yellow-50 hover:border-yellow-500 transition-colors shadow-sm font-medium text-gray-800"
                        >
                          {staff.name}
                        </button>
                      )) : (
                        <p className="text-[10px] text-gray-500 italic px-1">No staff users available</p>
                      )}
                    </div>
                  )}
                </div>
                <div className="h-px bg-black/15 w-full my-4"></div>
              </div>
            )}

            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 px-2">Navigation</p>
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id as TabType)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-none border border-black transition-all ${
                    activeTab === tab.id
                      ? 'bg-yellow-500 text-white font-bold shadow-lg shadow-yellow-100'
                      : 'text-gray-700 hover:bg-gray-100/50'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-sm">{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        <main className="flex-1 overflow-y-auto p-4 md:p-8 pb-24 lg:pb-8 bg-gray-50/50">
          <div className="max-w-7xl mx-auto">
            {activeTab === 'dashboard' && <Dashboard currentUser={effectiveUser} />}
            {activeTab === 'customers' && <CustomerManagement currentUser={effectiveUser} />}
            {activeTab === 'loans' && <LoanManagement currentUser={effectiveUser} />}
            {activeTab === 'transfers' && <LoanTransferManagement currentUser={effectiveUser} />}
            {activeTab === 'emi' && <EMIManagement currentUser={effectiveUser} />}
            {activeTab === 'rates' && effectiveRole === 'admin' && <GoldRateManagement currentUser={effectiveUser} />}
            {activeTab === 'reports' && effectiveRole === 'admin' && <StaffReports currentUser={effectiveUser} />}
            {activeTab === 'settings' && effectiveRole === 'admin' && <Settings currentUser={effectiveUser} onLogout={handleLogout} />}
          </div>
        </main>
      </div>

      {showAdminVerification && (
        <AdminVerificationModal
          currentUser={currentUser}
          onClose={() => setShowAdminVerification(false)}
          onSuccess={() => {
            setShowAdminVerification(false);
            setViewMode('admin');
          }}
        />
      )}

    </div>
  );
}
