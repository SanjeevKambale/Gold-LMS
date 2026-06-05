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
  IndianRupee,
  Send,
  Lock,
  Calendar,
  Gavel
} from 'lucide-react';
import { getSystemWorkingDate, isSystemBackdated, setSystemWorkingDate } from './lib/workingDate';
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
import { AuctionManagement } from './components/AuctionManagement';
import { initDatabase, adminExists } from './lib/database';
import { getSystemTheme } from './lib/db/settingsService';
import { getUserFromStorage, clearUserFromStorage } from './lib/auth';
import { getAllUsers } from './lib/db/authService';
import { logActivity } from './lib/activityLogger';
import { ConfirmationModal } from './components/ConfirmationModal';
import { Badge } from './components/ui/badge';
import { Button } from './components/ui/button';
import { BrandLogo } from './components/BrandLogo';
import { AdminVerificationModal } from './components/AdminVerificationModal';
import { SystemLockModal } from './components/SystemLockModal';
import { StaffVerificationModal } from './components/StaffVerificationModal';
import { PreLoginSettingsModal } from './components/PreLoginSettingsModal';

type TabType = 'dashboard' | 'customers' | 'loans' | 'transfers' | 'emi' | 'auctions' | 'rates' | 'reports' | 'settings';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    const hash = window.location.hash.replace('#', '') as TabType;
    const validTabs: TabType[] = ['dashboard', 'customers', 'loans', 'transfers', 'emi', 'auctions', 'rates', 'reports'];
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
  const [pendingStaffToVerify, setPendingStaffToVerify] = useState<User | null>(null);
  const [isLocked, setIsLocked] = useState(() => {
    return localStorage.getItem('system_locked') === 'true';
  });
  const [workingDate, setWorkingDate] = useState(() => getSystemWorkingDate());
  const [isBackdatingModalOpen, setIsBackdatingModalOpen] = useState(false);
  const [tempWorkingDate, setTempWorkingDate] = useState(workingDate);
  const [showPreLoginSettings, setShowPreLoginSettings] = useState(false);

  // Sync lock state to localStorage
  useEffect(() => {
    localStorage.setItem('system_locked', isLocked ? 'true' : 'false');
  }, [isLocked]);

  // Keyboard shortcut to standlock the application (Ctrl+Alt+L or Alt+L)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        currentUser &&
        ((e.ctrlKey && e.altKey && e.key.toLowerCase() === 'l') || (e.altKey && e.key.toLowerCase() === 'l'))
      ) {
        e.preventDefault();
        setIsLocked(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentUser]);

  const handleToggleStaffSelector = async () => {
    const newState = !isStaffSelectorOpen;
    setIsStaffSelectorOpen(newState);
    if (newState) {
      try {
        const users = await getAllUsers();
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
        const exists = await adminExists();
        setHasAdmin(exists);
        
        // Load and apply system color theme
        try {
          const savedTheme = await getSystemTheme();
          document.documentElement.setAttribute('data-theme', savedTheme || 'gold');
        } catch (themeErr) {
          console.warn("Theme loader error:", themeErr);
        }
        
        const savedUser = getUserFromStorage();
        if (savedUser) {
          setCurrentUser(savedUser);
          setViewMode(savedUser.role);
          const hash = window.location.hash.replace('#', '') as TabType;
          const validTabs: TabType[] = ['dashboard', 'customers', 'loans', 'transfers', 'emi', 'auctions', 'rates', 'reports', 'settings'];
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
      const validTabs: TabType[] = ['dashboard', 'customers', 'loans', 'transfers', 'emi', 'auctions', 'rates', 'reports', 'settings'];
      
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
    setIsLocked(false);
    localStorage.setItem('system_locked', 'false');
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
    setIsLocked(false);
    localStorage.setItem('system_locked', 'false');
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
      setIsLocked(false);
      localStorage.removeItem('system_locked');
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
    let preLoginView;
    switch (authScreen) {
      case 'login':
        preLoginView = (
          <Login 
            onLoginSuccess={handleLoginSuccess} 
            onSwitchToSignUp={() => setAuthScreen('signup')} 
            onForgotPassword={() => setAuthScreen('forgot-password')} 
            onBack={() => setAuthScreen('welcome')}
          />
        );
        break;
      case 'signup':
        preLoginView = (
          <SignUp 
            onSignUpSuccess={handleSignUpSuccess} 
            onSwitchToLogin={() => setAuthScreen('login')} 
            onBack={() => setAuthScreen('welcome')}
          />
        );
        break;
      case 'forgot-password':
        preLoginView = (
          <ForgotPassword 
            onBackToLogin={() => setAuthScreen('login')} 
          />
        );
        break;
      default:
        preLoginView = (
          <Welcome 
            onNavigate={(screen) => setAuthScreen(screen)} 
            hasAdmin={hasAdmin} 
            onOpenSettings={() => setShowPreLoginSettings(true)}
          />
        );
    }

    return (
      <>
        {preLoginView}
        {showPreLoginSettings && (
          <PreLoginSettingsModal
            onClose={() => setShowPreLoginSettings(false)}
            onDataResetOrImport={async () => {
              const exists = await adminExists();
              setHasAdmin(exists);
              // Refresh root theme
              try {
                const savedTheme = await getSystemTheme();
                document.documentElement.setAttribute('data-theme', savedTheme || 'gold');
              } catch (err) {
                console.warn(err);
              }
            }}
          />
        )}
      </>
    );
  }

  const staffTabs = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'customers', label: 'Customers', icon: Users },
    { id: 'loans', label: 'Gold Loans', icon: IndianRupee },
    { id: 'transfers', label: 'Loan Transfers', icon: Send },
    { id: 'emi', label: 'EMI Tracking', icon: CreditCard },
    { id: 'auctions', label: 'Auctions', icon: Gavel },
  ];

  const adminTabs = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'customers', label: 'Customers', icon: Users },
    { id: 'loans', label: 'Gold Loans', icon: IndianRupee },
    { id: 'transfers', label: 'Loan Transfers', icon: Send },
    { id: 'emi', label: 'EMI Tracking', icon: CreditCard },
    { id: 'auctions', label: 'Auctions', icon: Gavel },
    { id: 'rates', label: 'Gold Rates', icon: TrendingUp },
    { id: 'reports', label: 'Reports', icon: Activity },
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

  const bannerActive = isSystemBackdated();
  const headerStickyTop = bannerActive ? '40px' : '0px';
  const sidebarStickyTop = bannerActive ? '113px' : '73px';
  const sidebarHeight = bannerActive ? 'calc(100vh - 113px)' : 'calc(100vh - 73px)';

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {isSystemBackdated() && (
        <div 
          className="bg-yellow-500 text-black font-bold text-center text-xs md:text-sm px-4 flex items-center justify-center gap-2 z-40 shadow-md flex-shrink-0 animate-in slide-in-from-top duration-300 transition-all border-b border-yellow-600 sticky top-0"
          style={{
            height: '40px',
            filter: isLocked ? 'blur(12px)' : undefined,
            pointerEvents: isLocked ? 'none' : 'auto',
            userSelect: isLocked ? 'none' : 'auto',
          }}
        >
          <span>⚠️</span>
          <span>System Working Date is set to <strong className="font-mono">{workingDate}</strong>. All entries, interest accruals, and reports are simulated for this day.</span>
          <button 
            onClick={() => {
              setSystemWorkingDate(null);
              setWorkingDate(new Date().toISOString().split('T')[0]);
              window.location.reload();
            }}
            className="ml-3 px-3 py-1 bg-black text-white hover:bg-black/85 text-[10px] md:text-xs font-bold uppercase transition-all rounded-sm border border-black shadow-sm"
          >
            Reset to Today
          </button>
        </div>
      )}
      <header 
        className="bg-white border-b border-black z-30 flex-shrink-0 shadow-sm transition-all duration-300 sticky"
        style={{
          top: headerStickyTop,
          filter: isLocked ? 'blur(12px)' : undefined,
          pointerEvents: isLocked ? 'none' : 'auto',
          userSelect: isLocked ? 'none' : 'auto',
          height: '73px',
        }}
      >
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
              {/* Working Date Selector */}
              <button
                onClick={() => {
                  setTempWorkingDate(workingDate);
                  setIsBackdatingModalOpen(true);
                }}
                className={`flex items-center gap-2 px-3 h-9 text-xs md:text-sm font-semibold border transition-all rounded-none ${
                  isSystemBackdated()
                    ? 'bg-yellow-500 text-black border-yellow-600 hover:bg-yellow-600 shadow-sm'
                    : 'bg-white text-gray-700 border-black hover:bg-gray-50'
                }`}
                title="System Working Date Settings"
              >
                <Calendar className="w-4 h-4 text-current" />
                <span className="hidden sm:inline font-bold uppercase tracking-wider text-[10px]">Working Date:</span>
                <span className="font-bold font-mono">{workingDate}</span>
              </button>
              <div className="flex items-center gap-2 px-3 h-9 bg-gray-50 rounded-none border border-black">
                <div className="w-6 h-6 bg-yellow-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <UserIcon className="w-3 h-3 text-yellow-700" />
                </div>
                <div className="text-left flex flex-col justify-center">
                  <p className="text-xs font-bold text-gray-900 leading-none mb-1">{effectiveUser.name}</p>
                  <p className="text-[10px] font-semibold text-gray-500 leading-none capitalize">{effectiveUser.role}</p>
                </div>
              </div>

              <Button
                onClick={() => setIsLocked(true)}
                variant="outline"
                size="sm"
                className="border-black text-yellow-600 hover:bg-yellow-50 hover:border-black transition-colors h-9 w-9 p-0 flex items-center justify-center flex-shrink-0"
                title="Lock Session (Ctrl+Alt+L or Alt+L)"
              >
                <Lock className="w-4 h-4" />
              </Button>

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
 
      <div className="flex flex-1">
        <aside 
          className="w-64 bg-white border-r border-black overflow-y-auto flex-shrink-0 transition-all duration-300 sticky"
          style={{
            top: sidebarStickyTop,
            height: sidebarHeight,
            filter: isLocked ? 'blur(12px)' : undefined,
            pointerEvents: isLocked ? 'none' : 'auto',
            userSelect: isLocked ? 'none' : 'auto',
          }}
        >
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
                            setPendingStaffToVerify(staff);
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

        <main 
          className="flex-1 p-4 md:p-8 pb-24 lg:pb-8 bg-gray-50/50 transition-all duration-300"
          style={isLocked ? { filter: 'blur(12px)', pointerEvents: 'none', userSelect: 'none' } : undefined}
        >
          <div className="max-w-7xl mx-auto">
            {activeTab === 'dashboard' && <Dashboard currentUser={effectiveUser} />}
            {activeTab === 'customers' && <CustomerManagement currentUser={effectiveUser} />}
            {activeTab === 'loans' && <LoanManagement currentUser={effectiveUser} />}
            {activeTab === 'transfers' && <LoanTransferManagement currentUser={effectiveUser} />}
            {activeTab === 'emi' && <EMIManagement currentUser={effectiveUser} />}
            {activeTab === 'auctions' && <AuctionManagement currentUser={effectiveUser} />}
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

      {pendingStaffToVerify && (
        <StaffVerificationModal
          staffUser={pendingStaffToVerify}
          onClose={() => setPendingStaffToVerify(null)}
          onSuccess={() => {
            setImpersonatedStaffId(pendingStaffToVerify.id);
            setViewMode('staff');
            setPendingStaffToVerify(null);
            setIsStaffSelectorOpen(false);
            const adminOnlyTabs = ['rates', 'reports', 'settings'];
            if (adminOnlyTabs.includes(activeTab)) {
              handleTabChange('dashboard');
            }
          }}
        />
      )}

      {isLocked && currentUser && (
        <SystemLockModal
          currentUser={effectiveUser}
          onUnlock={() => setIsLocked(false)}
        />
      )}

      {isBackdatingModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-black shadow-2xl max-w-md w-full p-6 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-black/15 mb-5">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-yellow-600" />
                Configure System Working Date
              </h3>
              <button 
                onClick={() => setIsBackdatingModalOpen(false)}
                className="p-1 hover:bg-gray-100 rounded-sm transition-colors"
              >
                <X className="w-5 h-5 text-gray-400 hover:text-gray-600" />
              </button>
            </div>
            
            <p className="text-xs text-gray-500 mb-4 leading-relaxed">
              Backdating allows simulating all accrued interest, dynamic late penalty fees, report generations, and pre-filling loan/payment details as of a specific date in history or future.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Simulated Date</label>
                <input
                  type="date"
                  value={tempWorkingDate}
                  onChange={(e) => setTempWorkingDate(e.target.value)}
                  className="w-full px-4 py-2.5 border border-black focus:ring-2 focus:ring-yellow-500 focus:border-transparent font-mono text-sm bg-white"
                />
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setSystemWorkingDate(tempWorkingDate);
                    setWorkingDate(tempWorkingDate);
                    setIsBackdatingModalOpen(false);
                    window.location.reload();
                  }}
                  className="w-full py-3 bg-yellow-500 hover:bg-yellow-600 text-white font-bold text-sm border border-black shadow-md transition-all uppercase tracking-wider flex items-center justify-center gap-2"
                >
                  Apply Simulated Date
                </button>
                
                <button
                  type="button"
                  onClick={() => {
                    const todayStr = new Date().toISOString().split('T')[0];
                    setSystemWorkingDate(null);
                    setWorkingDate(todayStr);
                    setIsBackdatingModalOpen(false);
                    window.location.reload();
                  }}
                  className="w-full py-2.5 bg-white hover:bg-gray-50 text-gray-700 font-semibold text-sm border border-black/20 transition-all uppercase tracking-wider"
                >
                  Reset to Actual Today
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
