import React, { useContext, useEffect, useRef, useState } from 'react';
import { AppContext, AppProvider, useApp } from './context/AppContext';
import { HeaderStats } from './components/HeaderStats';
import { CollectScreen } from './components/CollectScreen';
import { UnitsScreen } from './components/UnitsScreen';
import { PaymentsScreen } from './components/PaymentsScreen';
import { LeasesScreen } from './components/LeasesScreen';
import { BackupScreen } from './components/BackupScreen';
import { ReportsScreen } from './components/ReportsScreen';
import { LockGate } from './components/LockGate';
import { WelcomeScreen } from './components/WelcomeScreen';
import { QuickSearch, ShortcutsHelp } from './components/QuickSearch';
import { attentionSummary, buildAttentionItems, type AttentionTarget } from './logic/attention';
import { ToastUndo } from './components/ToastUndo';
import { calculateUnit, getLeaseAlerts, getTodayStr } from './logic/rentEngine';
import {
  Banknote,
  Building,
  CreditCard,
  CalendarClock,
  Settings as SettingsIcon,
  Search,
  BarChart3,
  Sun,
  Moon
} from 'lucide-react';

type Tab = 'collect' | 'units' | 'payments' | 'leases' | 'reports' | 'backup';

function MainLayout() {
  const [activeTab, setActiveTab] = useState<Tab>('collect');
  const [paymentsView, setPaymentsView] = useState<'all' | 'cheques'>('all');

  // Leaving Payments resets it to the full list next time.
  useEffect(() => {
    if (activeTab !== 'payments') setPaymentsView('all');
  }, [activeTab]);

  // Used by the "Needs attention" panel to jump to the right place.
  const navigateTo = (target: AttentionTarget) => {
    if (target === 'payments_cheques') {
      setPaymentsView('cheques');
      setActiveTab('payments');
      return;
    }
    setPaymentsView('all');
    setActiveTab(target);
  };
  const { theme, toggleTheme, activeUnits: units, payments, settings, currency, db } = useApp();
  // No units at all (not even archived): show the welcome screen instead of empty lists.
  const isEmpty = db.units.length === 0;

  // Windows app: one summary notification per launch, only if turned on in Settings.
  const hasNotified = useRef(false);
  useEffect(() => {
    if (hasNotified.current || !settings.notifyOnOpen || typeof window.rentAPI?.notify !== 'function') return;
    hasNotified.current = true;
    const items = buildAttentionItems(units, payments, currency, getTodayStr());
    if (items.length > 0) window.rentAPI.notify({ title: 'Rent Tracker: needs attention', body: attentionSummary(items) });
  }, [settings.notifyOnOpen, units, payments, currency]);

  // Keyboard shortcuts: Ctrl+K search, Ctrl+1..6 tabs, ? help (not while typing).
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  useEffect(() => {
    const tabs: Tab[] = ['collect', 'units', 'payments', 'leases', 'reports', 'backup'];
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping = !!target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
      const isDialogOpen = !!document.querySelector('[role=dialog]');
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (!isDialogOpen) setIsSearchOpen(true);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && /^[1-6]$/.test(e.key) && !isDialogOpen) {
        e.preventDefault();
        setActiveTab(tabs[Number(e.key) - 1]);
        return;
      }
      if (e.key === '?' && !isTyping && !isDialogOpen) {
        e.preventDefault();
        setIsHelpOpen(true);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const todayStr = getTodayStr();

  // Badges calculation
  const calcs = units.map((u) => calculateUnit(u, payments, todayStr));
  const overdueCount = calcs.filter((c) => c.status === 'overdue' || c.status === 'today').length;
  const leaseAlerts = getLeaseAlerts(units, todayStr);
  const urgentLeasesCount = leaseAlerts.filter((l) => l.isUrgent).length;

  return (
    <div
      data-theme={theme}
      className={`${theme === 'dark' ? 'dark' : ''} min-h-screen flex flex-col bg-[#EDF1F4] dark:bg-[#10181D] text-[#1B2B34] dark:text-[#E6EDF1] transition-colors pb-24 md:pb-10`}
    >
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-white dark:bg-[#18232A] border-b border-[#D5DDE3] dark:border-[#2B3A44] shadow-xs">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          {/* Logo & App Name */}
          <div className="flex items-center gap-3">
            <img src="./icon.svg" alt="" width={40} height={40} className="w-10 h-10 shrink-0 drop-shadow-sm" />
            <div>
              <h1 className="text-lg sm:text-xl font-black tracking-tight leading-none text-[#1B2B34] dark:text-[#E6EDF1]">
                Rent Tracker
              </h1>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[11px] font-medium text-[#5E6E78] dark:text-[#8E9EA8]">
                  Automated dues · 1-tap collect · 100% Offline
                </span>
              </div>
            </div>
          </div>

          {/* Desktop Navigation Tabs */}
          <nav className="hidden md:flex items-center gap-1 bg-[#EDF1F4]/70 dark:bg-[#10181D] p-1 rounded-xl border border-[#D5DDE3] dark:border-[#2B3A44]">
            <button
              onClick={() => setActiveTab('collect')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition cursor-pointer relative ${
                activeTab === 'collect'
                  ? 'bg-white dark:bg-[#18232A] text-[#2E3F8F] dark:text-[#7D8CE8] shadow-xs'
                  : 'text-[#5E6E78] dark:text-[#8E9EA8] hover:text-[#1B2B34] dark:hover:text-[#E6EDF1]'
              }`}
            >
              <Banknote className="w-4 h-4" />
              To collect
              {overdueCount > 0 && (
                <span className="px-1.5 py-0.2 text-[10px] font-black rounded-full bg-[#B4341F] text-white">
                  {overdueCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('units')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeTab === 'units'
                  ? 'bg-white dark:bg-[#18232A] text-[#2E3F8F] dark:text-[#7D8CE8] shadow-xs'
                  : 'text-[#5E6E78] dark:text-[#8E9EA8] hover:text-[#1B2B34] dark:hover:text-[#E6EDF1]'
              }`}
            >
              <Building className="w-4 h-4" />
              Units ({units.length})
            </button>

            <button
              onClick={() => setActiveTab('payments')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeTab === 'payments'
                  ? 'bg-white dark:bg-[#18232A] text-[#2E3F8F] dark:text-[#7D8CE8] shadow-xs'
                  : 'text-[#5E6E78] dark:text-[#8E9EA8] hover:text-[#1B2B34] dark:hover:text-[#E6EDF1]'
              }`}
            >
              <CreditCard className="w-4 h-4" />
              Payments
            </button>

            <button
              onClick={() => setActiveTab('leases')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition cursor-pointer relative ${
                activeTab === 'leases'
                  ? 'bg-white dark:bg-[#18232A] text-[#2E3F8F] dark:text-[#7D8CE8] shadow-xs'
                  : 'text-[#5E6E78] dark:text-[#8E9EA8] hover:text-[#1B2B34] dark:hover:text-[#E6EDF1]'
              }`}
            >
              <CalendarClock className="w-4 h-4" />
              Leases
              {urgentLeasesCount > 0 && (
                <span className="px-1.5 py-0.2 text-[10px] font-black rounded-full bg-[#B4341F] text-white">
                  {urgentLeasesCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('reports')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeTab === 'reports'
                  ? 'bg-white dark:bg-[#18232A] text-[#2E3F8F] dark:text-[#7D8CE8] shadow-xs'
                  : 'text-[#5E6E78] dark:text-[#8E9EA8] hover:text-[#1B2B34] dark:hover:text-[#E6EDF1]'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              Reports
            </button>

            <button
              onClick={() => setActiveTab('backup')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeTab === 'backup'
                  ? 'bg-white dark:bg-[#18232A] text-[#2E3F8F] dark:text-[#7D8CE8] shadow-xs'
                  : 'text-[#5E6E78] dark:text-[#8E9EA8] hover:text-[#1B2B34] dark:hover:text-[#E6EDF1]'
              }`}
            >
              <SettingsIcon className="w-4 h-4" />
              Settings
            </button>
          </nav>

          {/* Right actions: search, theme toggle */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsSearchOpen(true)}
              title="Search (Ctrl+K)"
              aria-label="Search tenants, units, receipts (Ctrl+K)"
              className="tap-target flex items-center justify-center w-10 h-10 rounded-xl text-[#5E6E78] dark:text-[#8E9EA8] hover:text-[#1B2B34] dark:hover:text-[#E6EDF1] hover:bg-gray-100 dark:hover:bg-[#2B3A44] transition-colors cursor-pointer"
            >
              <Search className="w-5 h-5" />
            </button>
            <button
              onClick={toggleTheme}
              type="button"
              id="theme-toggle"
              data-testid="theme-toggle"
              className="tap-target relative flex items-center justify-center w-10 h-10 rounded-xl text-[#5E6E78] dark:text-[#8E9EA8] hover:text-[#1B2B34] dark:hover:text-[#E6EDF1] hover:bg-gray-100 dark:hover:bg-[#2B3A44] transition-colors cursor-pointer group active:scale-95"
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              <div className="relative w-5 h-5 flex items-center justify-center">
                {/* Sun Icon (active in dark mode) */}
                <Sun
                  className={`w-5 h-5 text-amber-400 absolute transition-all duration-300 ease-in-out ${
                    theme === 'dark'
                      ? 'opacity-100 rotate-0 scale-100'
                      : 'opacity-0 -rotate-90 scale-50 pointer-events-none'
                  }`}
                />
                {/* Moon Icon (active in light mode) */}
                <Moon
                  className={`w-5 h-5 text-slate-700 dark:text-slate-200 absolute transition-all duration-300 ease-in-out ${
                    theme === 'light'
                      ? 'opacity-100 rotate-0 scale-100'
                      : 'opacity-0 rotate-90 scale-50 pointer-events-none'
                  }`}
                />
              </div>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 pt-6">
        {/* Always Visible Header Stats at Top */}
        <HeaderStats />

        {/* Dynamic Screen View */}
        {isEmpty && (activeTab === 'collect' || activeTab === 'units') && <WelcomeScreen />}
        {!isEmpty && activeTab === 'collect' && <CollectScreen onNavigate={navigateTo} />}
        {!isEmpty && activeTab === 'units' && <UnitsScreen />}
        {activeTab === 'payments' && <PaymentsScreen key={paymentsView} initialView={paymentsView} />}
        {activeTab === 'leases' && <LeasesScreen />}
        {activeTab === 'reports' && <ReportsScreen />}
        {activeTab === 'backup' && <BackupScreen />}
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-[#18232A] border-t border-[#D5DDE3] dark:border-[#2B3A44] px-2 py-1 shadow-lg">
        <div className="grid grid-cols-6 gap-1">
          <button
            onClick={() => setActiveTab('collect')}
            className={`tap-target flex flex-col items-center justify-center py-1.5 rounded-xl transition cursor-pointer relative ${
              activeTab === 'collect'
                ? 'text-[#2E3F8F] dark:text-[#7D8CE8] font-bold'
                : 'text-[#5E6E78] dark:text-[#8E9EA8]'
            }`}
          >
            <Banknote className="w-5 h-5" />
            <span className="text-[10px] mt-0.5">Collect</span>
            {overdueCount > 0 && (
              <span className="absolute top-1 right-2.5 w-4 h-4 text-[9px] font-black rounded-full bg-[#B4341F] text-white flex items-center justify-center">
                {overdueCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('units')}
            className={`tap-target flex flex-col items-center justify-center py-1.5 rounded-xl transition cursor-pointer ${
              activeTab === 'units'
                ? 'text-[#2E3F8F] dark:text-[#7D8CE8] font-bold'
                : 'text-[#5E6E78] dark:text-[#8E9EA8]'
            }`}
          >
            <Building className="w-5 h-5" />
            <span className="text-[10px] mt-0.5">Units</span>
          </button>

          <button
            onClick={() => setActiveTab('payments')}
            className={`tap-target flex flex-col items-center justify-center py-1.5 rounded-xl transition cursor-pointer ${
              activeTab === 'payments'
                ? 'text-[#2E3F8F] dark:text-[#7D8CE8] font-bold'
                : 'text-[#5E6E78] dark:text-[#8E9EA8]'
            }`}
          >
            <CreditCard className="w-5 h-5" />
            <span className="text-[10px] mt-0.5">Payments</span>
          </button>

          <button
            onClick={() => setActiveTab('leases')}
            className={`tap-target flex flex-col items-center justify-center py-1.5 rounded-xl transition cursor-pointer relative ${
              activeTab === 'leases'
                ? 'text-[#2E3F8F] dark:text-[#7D8CE8] font-bold'
                : 'text-[#5E6E78] dark:text-[#8E9EA8]'
            }`}
          >
            <CalendarClock className="w-5 h-5" />
            <span className="text-[10px] mt-0.5">Leases</span>
            {urgentLeasesCount > 0 && (
              <span className="absolute top-1 right-2.5 w-4 h-4 text-[9px] font-black rounded-full bg-[#B4341F] text-white flex items-center justify-center">
                {urgentLeasesCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('reports')}
            className={`tap-target flex flex-col items-center justify-center py-1.5 rounded-xl transition cursor-pointer ${
              activeTab === 'reports'
                ? 'text-[#2E3F8F] dark:text-[#7D8CE8] font-bold'
                : 'text-[#5E6E78] dark:text-[#8E9EA8]'
            }`}
          >
            <BarChart3 className="w-5 h-5" />
            <span className="text-[10px] mt-0.5">Reports</span>
          </button>

          <button
            onClick={() => setActiveTab('backup')}
            className={`tap-target flex flex-col items-center justify-center py-1.5 rounded-xl transition cursor-pointer ${
              activeTab === 'backup'
                ? 'text-[#2E3F8F] dark:text-[#7D8CE8] font-bold'
                : 'text-[#5E6E78] dark:text-[#8E9EA8]'
            }`}
          >
            <SettingsIcon className="w-5 h-5" />
            <span className="text-[10px] mt-0.5">Settings</span>
          </button>
        </div>
      </nav>

      {/* Floating 6-second Undo Toast */}
      <ToastUndo />

      {isSearchOpen && <QuickSearch onClose={() => setIsSearchOpen(false)} />}
      {isHelpOpen && <ShortcutsHelp onClose={() => setIsHelpOpen(false)} />}
    </div>
  );
}

export default function App() {
  const context = useContext(AppContext);
  if (!context) {
    return (
      <AppProvider>
        <App />
      </AppProvider>
    );
  }

  // Subscribes App component directly to AppContext, ensuring App re-renders when theme changes
  const { theme } = context;

  return (
    <LockGate>
      <MainLayout />
    </LockGate>
  );
}
