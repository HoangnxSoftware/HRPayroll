import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  INITIAL_SETTINGS, 
  INITIAL_EMPLOYEES, 
  INITIAL_DEPENDENTS, 
  INITIAL_INSURANCES, 
  INITIAL_MEAL_REGISTRATIONS, 
  INITIAL_SPECIAL_ALLOWANCES, 
  INITIAL_TIMEKEEPINGS 
} from './data/initialData';
import { 
  SystemSettings, 
  Employee, 
  Dependent, 
  InsuranceRecord, 
  MealRegistration, 
  SpecialAllowance, 
  TimekeepingRecord, 
  PayrollRecord, 
  GoogleSyncState,
  PaymentStatus 
} from './types';
import { calculateEmployeePayroll, isEmployeeActiveInMonth } from './utils/payrollCalculator';
import { FullPayrollData, importFullDataFromGoogleSheets } from './services/googleSheetsService';
import {
  getCurrentUser,
  hasValidGoogleToken,
  googleSignIn,
  getGoogleTokenRemainingMs,
  GOOGLE_DRIVE_CONNECTION_LOST_EVENT
} from './services/authService';
import { CloudOff, WifiOff, AlertTriangle, RefreshCw, Link2, X } from 'lucide-react';
import {
  sanitizeSettings,
  sanitizeEmployees,
  sanitizeDependents,
  sanitizeInsurances,
  sanitizeMealRegistrations,
  sanitizeSpecialAllowances,
  sanitizeTimekeepings
} from './utils/sanitizeData';

import { AuthRoleProvider, useAuthRole } from './context/AuthRoleContext';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { GoogleSyncModal } from './components/GoogleSyncModal';
import { PrintSlipModal } from './components/PrintSlipModal';
import { PrintPayrollModal } from './components/PrintPayrollModal';
import { EmployeeModal } from './components/EmployeeModal';

import { DashboardView } from './views/DashboardView';
import { SettingsView } from './views/SettingsView';
import { EmployeesView } from './views/EmployeesView';
import { DependentsView } from './views/DependentsView';
import { InsuranceView } from './views/InsuranceView';
import { MealView } from './views/MealView';
import { AllowancesView } from './views/AllowancesView';
import { TimekeepingView } from './views/TimekeepingView';
import { PayrollView } from './views/PayrollView';
import { AnnualPayrollView } from './views/AnnualPayrollView';
import { TaxReportView } from './views/TaxReportView';
import { UserManagementView } from './views/UserManagementView';
import { MyPayslipView } from './views/MyPayslipView';
import { LoginModal, saveDatabaseConnectionToStorage } from './components/LoginModal';
import { ChangePasswordModal } from './components/ChangePasswordModal';
import { LogoutSyncConfirmModal } from './components/LogoutSyncConfirmModal';
import { ConfirmModal } from './components/ConfirmModal';
import { ErrorBoundary } from './components/ErrorBoundary';

function PayrollAppContent() {
  const { currentUser, isAuthenticated, currentUserRole, logout, resetOfficialUsersForNewDatabase } = useAuthRole();
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('payroll_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const handleToggleSidebarCollapse = () => {
    setIsSidebarCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem('payroll_sidebar_collapsed', String(next));
      } catch (e) {
        console.warn('Lỗi lưu trạng thái sidebar:', e);
      }
      return next;
    });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        const target = e.target as HTMLElement;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
          return;
        }
        e.preventDefault();
        handleToggleSidebarCollapse();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const [deleteConfirmState, setDeleteConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  // Auto redirect employee to my_payslip
  useEffect(() => {
    if (currentUserRole === 'employee' && activeTab !== 'my_payslip' && activeTab !== 'timekeeping') {
      setActiveTab('my_payslip');
    }
  }, [currentUserRole, activeTab]);

  // Core Data States (persisted in localStorage to preserve company settings across logout/login)
  const [settings, setSettings] = useState<SystemSettings>(() => {
    try {
      const saved = localStorage.getItem('payroll_system_settings');
      let current = saved ? JSON.parse(saved) : null;
      const sanitized = sanitizeSettings(current);
      const savedAddress = localStorage.getItem('payroll_company_address');
      if (savedAddress && savedAddress.trim()) {
        sanitized.address = savedAddress.trim();
      }
      const savedPhone = localStorage.getItem('payroll_company_phone');
      if (savedPhone && savedPhone.trim() && savedPhone !== 'capped' && savedPhone !== 'fully_exempt') {
        sanitized.phoneNumber = savedPhone.trim();
      }
      return sanitized;
    } catch (e) {
      console.warn('Lỗi đọc settings từ localStorage:', e);
    }
    return INITIAL_SETTINGS;
  });

  const [employees, setEmployees] = useState<Employee[]>(() => {
    try {
      const saved = localStorage.getItem('payroll_employees_data');
      if (saved) return sanitizeEmployees(JSON.parse(saved));
    } catch (e) {
      console.warn('Lỗi đọc employees từ localStorage:', e);
    }
    return INITIAL_EMPLOYEES;
  });

  const [dependents, setDependents] = useState<Dependent[]>(() => {
    try {
      const saved = localStorage.getItem('payroll_dependents_data');
      if (saved) return sanitizeDependents(JSON.parse(saved));
    } catch (e) {
      console.warn('Lỗi đọc dependents từ localStorage:', e);
    }
    return INITIAL_DEPENDENTS;
  });

  const [insurances, setInsurances] = useState<InsuranceRecord[]>(() => {
    try {
      const saved = localStorage.getItem('payroll_insurances_data');
      if (saved) return sanitizeInsurances(JSON.parse(saved));
    } catch (e) {
      console.warn('Lỗi đọc insurances từ localStorage:', e);
    }
    return INITIAL_INSURANCES;
  });

  const [mealRegistrations, setMealRegistrations] = useState<MealRegistration[]>(() => {
    try {
      const saved = localStorage.getItem('payroll_meals_data');
      if (saved) return sanitizeMealRegistrations(JSON.parse(saved));
    } catch (e) {
      console.warn('Lỗi đọc meals từ localStorage:', e);
    }
    return INITIAL_MEAL_REGISTRATIONS;
  });

  const [specialAllowances, setSpecialAllowances] = useState<SpecialAllowance[]>(() => {
    try {
      const saved = localStorage.getItem('payroll_allowances_data');
      if (saved) return sanitizeSpecialAllowances(JSON.parse(saved));
    } catch (e) {
      console.warn('Lỗi đọc allowances từ localStorage:', e);
    }
    return INITIAL_SPECIAL_ALLOWANCES;
  });

  const [timekeepings, setTimekeepings] = useState<TimekeepingRecord[]>(() => {
    try {
      const saved = localStorage.getItem('payroll_timekeepings_data');
      if (saved) return sanitizeTimekeepings(JSON.parse(saved));
    } catch (e) {
      console.warn('Lỗi đọc timekeepings từ localStorage:', e);
    }
    return INITIAL_TIMEKEEPINGS;
  });

  // Tự động lưu cấu hình và dữ liệu vào localStorage
  useEffect(() => {
    try {
      localStorage.setItem('payroll_system_settings', JSON.stringify(settings));
      if (settings.address && settings.address.trim()) {
        localStorage.setItem('payroll_company_address', settings.address.trim());
      }
      if (settings.phoneNumber && settings.phoneNumber.trim() && settings.phoneNumber !== 'capped' && settings.phoneNumber !== 'fully_exempt') {
        localStorage.setItem('payroll_company_phone', settings.phoneNumber.trim());
      }
    } catch (e) {
      console.warn('Lỗi lưu settings:', e);
    }
  }, [settings]);

  useEffect(() => {
    try {
      localStorage.setItem('payroll_employees_data', JSON.stringify(employees));
    } catch (e) {}
  }, [employees]);

  useEffect(() => {
    try {
      localStorage.setItem('payroll_dependents_data', JSON.stringify(dependents));
    } catch (e) {}
  }, [dependents]);

  useEffect(() => {
    try {
      localStorage.setItem('payroll_insurances_data', JSON.stringify(insurances));
    } catch (e) {}
  }, [insurances]);

  useEffect(() => {
    try {
      localStorage.setItem('payroll_meals_data', JSON.stringify(mealRegistrations));
    } catch (e) {}
  }, [mealRegistrations]);

  useEffect(() => {
    try {
      localStorage.setItem('payroll_allowances_data', JSON.stringify(specialAllowances));
    } catch (e) {}
  }, [specialAllowances]);

  useEffect(() => {
    try {
      localStorage.setItem('payroll_timekeepings_data', JSON.stringify(timekeepings));
    } catch (e) {}
  }, [timekeepings]);

  // Sync State with Google Sheets / Drive (Persisted across sessions)
  const [syncState, setSyncState] = useState<GoogleSyncState>(() => {
    try {
      const saved = localStorage.getItem('payroll_google_sync_state');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn('Lỗi đọc sync state từ localStorage:', e);
    }
    return {
      isConnected: false,
      userEmail: null,
      spreadsheetId: null,
      spreadsheetUrl: null,
      lastSyncTime: null,
      isSyncing: false,
      syncSuccess: false,
      syncMessage: null
    };
  });

  // Tự động lưu trạng thái đồng bộ và lưu đường dẫn file cơ sở dữ liệu để phục vụ lần đăng nhập tiếp theo
  useEffect(() => {
    try {
      localStorage.setItem('payroll_google_sync_state', JSON.stringify(syncState));
    } catch (e) {
      console.warn('Lỗi lưu sync state:', e);
    }
    if (syncState.spreadsheetId && !syncState.isDemoMode) {
      saveDatabaseConnectionToStorage({
        id: syncState.spreadsheetId,
        name: syncState.spreadsheetName,
        url: syncState.spreadsheetUrl
      });
    }
  }, [syncState]);

  // Yêu cầu: Khi đóng thẻ/tab trình duyệt, luôn cảnh báo để nhắc nhở đồng bộ lên Google Drive / Sheets
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      const confirmNotice = 'Bạn có thể có dữ liệu tính lương chưa đồng bộ lên Google Sheets/Drive. Bạn có chắc chắn muốn đóng tab không?';
      e.returnValue = confirmNotice;
      return confirmNotice;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  // Modal states
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [isPrintPayrollOpen, setIsPrintPayrollOpen] = useState(false);
  const [printPayrollDepartmentId, setPrintPayrollDepartmentId] = useState<string | undefined>(undefined);
  const [isPrintSlipOpen, setIsPrintSlipOpen] = useState(false);
  const [selectedSlipEmpId, setSelectedSlipEmpId] = useState<string | undefined>(undefined);
  const [selectedSlipEmpIds, setSelectedSlipEmpIds] = useState<string[] | undefined>(undefined);
  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false);
  const [employeeToEdit, setEmployeeToEdit] = useState<Employee | null>(null);

  const isDemoMode = Boolean(syncState.isDemoMode) || localStorage.getItem('payroll_is_demo_mode') === 'true';
  const [isNetworkOnline, setIsNetworkOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [driveConnectionAlert, setDriveConnectionAlert] = useState<{
    type: 'expired' | 'interrupted';
    reason: string;
  } | null>(null);
  const [tokenRemainingMs, setTokenRemainingMs] = useState<number>(() => getGoogleTokenRemainingMs());
  const [isReconnectingDrive, setIsReconnectingDrive] = useState(false);
  const [driveReconnectError, setDriveReconnectError] = useState<string | null>(null);
  const [isDriveBannerDismissed, setIsDriveBannerDismissed] = useState(false);

  // Check existing Google Auth session on mount
  useEffect(() => {
    const user = getCurrentUser();
    const validToken = hasValidGoogleToken();
    setTokenRemainingMs(getGoogleTokenRemainingMs());
    if (user && validToken) {
      setSyncState(prev => ({
        ...prev,
        isConnected: true,
        userEmail: user.email
      }));
    } else if (!validToken) {
      setSyncState(prev => (
        prev.isConnected
          ? {
              ...prev,
              isConnected: false,
              syncMessage: 'Phiên kết nối Google Drive đã hết hạn hoặc chưa được cấp quyền.'
            }
          : prev
      ));
    }
  }, []);

  // Theo dõi liên tục trạng thái mạng, phiên token Google Drive và sự kiện mất kết nối khi đồng bộ
  useEffect(() => {
    const checkDriveStatus = () => {
      const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
      setIsNetworkOnline(online);
      const remaining = getGoogleTokenRemainingMs();
      setTokenRemainingMs(remaining);

      if (isDemoMode) {
        setDriveConnectionAlert(null);
        setDriveReconnectError(null);
        return;
      }

      if (syncState.isConnected && remaining <= 0) {
        setSyncState(prev => (
          prev.isConnected
            ? {
                ...prev,
                isConnected: false,
                syncMessage: 'Phiên kết nối Google Drive đã hết hạn. Vui lòng kết nối lại để tiếp tục đồng bộ.'
              }
            : prev
        ));
        setDriveConnectionAlert({
          type: 'expired',
          reason: 'Phiên đăng nhập Google Drive đã hết hạn (quá 55 phút). Vui lòng kết nối lại để việc đồng bộ được diễn ra liên tục.'
        });
        setIsDriveBannerDismissed(false);
      } else if (online && remaining >= 5 * 60 * 1000 && syncState.isConnected && syncState.spreadsheetId) {
        setDriveConnectionAlert(null);
        setDriveReconnectError(null);
      }
    };

    checkDriveStatus();
    const intervalId = window.setInterval(checkDriveStatus, 15000);

    const handleOnline = () => {
      setIsNetworkOnline(true);
      checkDriveStatus();
    };

    const handleOffline = () => {
      setIsNetworkOnline(false);
      setIsDriveBannerDismissed(false);
      setDriveConnectionAlert({
        type: 'interrupted',
        reason: 'Mất kết nối mạng Internet. Kết nối Google Drive đang bị gián đoạn — vui lòng kiểm tra lại đường truyền để tiếp tục đồng bộ.'
      });
    };

    const handleDriveLost = (ev: Event) => {
      if (isDemoMode) return;
      const detail = (ev as CustomEvent<{ type?: 'expired' | 'interrupted'; reason?: string }>).detail;
      const alertType: 'expired' | 'interrupted' = detail?.type === 'expired' ? 'expired' : 'interrupted';
      const reason = detail?.reason || 'Kết nối Google Drive bị gián đoạn hoặc đã hết phiên làm việc.';
      if (alertType === 'expired') {
        setSyncState(prev => ({
          ...prev,
          isConnected: false,
          syncMessage: reason
        }));
      }
      setTokenRemainingMs(getGoogleTokenRemainingMs());
      setDriveConnectionAlert({ type: alertType, reason });
      setIsDriveBannerDismissed(false);
    };

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState !== 'hidden') {
        checkDriveStatus();
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener(GOOGLE_DRIVE_CONNECTION_LOST_EVENT, handleDriveLost);
    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener(GOOGLE_DRIVE_CONNECTION_LOST_EVENT, handleDriveLost);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    };
  }, [isDemoMode, syncState.isConnected, syncState.spreadsheetId]);

  const normalizeMonthKey = (monthVal?: string | number, yearVal?: number) => {
    const str = String(monthVal || '');
    if (str.includes('-')) return str;
    const mNum = Number(monthVal) || settings.currentMonth;
    const yNum = yearVal || settings.currentYear;
    return `${yNum}-${String(mNum).padStart(2, '0')}`;
  };

  // Automatic Dynamic Payroll Calculation Engine
  const payrolls: PayrollRecord[] = useMemo(() => {
    // Chỉ tính lương cho những nhân viên đang hoạt động trong tháng này
    // (nhân viên đã nghỉ việc, thai sản, điều chuyển sẽ không hiển thị ở các tháng không liên quan)
    const activeEmployees = employees.filter(emp =>
      isEmployeeActiveInMonth(emp, settings.currentMonth, settings.currentYear)
    );

    const currentMonthKey = `${settings.currentYear}-${String(settings.currentMonth).padStart(2, '0')}`;
    return activeEmployees.map(emp => {
      const tk = timekeepings.find(t => 
        t.employeeId === emp.id && (
          normalizeMonthKey(t.month, t.year) === currentMonthKey ||
          (!t.month && settings.currentMonth === 9 && settings.currentYear === 2026)
        )
      );
      const ins = insurances.find(i => i.employeeId === emp.id);
      const meal = mealRegistrations.find(m => m.employeeId === emp.id && (m.month === currentMonthKey || !m.month));
      const empAllowances = specialAllowances.filter(a => a.employeeId === emp.id && (a.month === currentMonthKey || !a.month));
      const empDependents = dependents.filter(d => d.employeeId === emp.id);

      return calculateEmployeePayroll(
        emp,
        tk,
        ins,
        meal,
        empAllowances,
        empDependents,
        settings,
        0,
        0,
        timekeepings
      );
    });
  }, [employees, timekeepings, insurances, mealRegistrations, specialAllowances, dependents, settings]);

  // Handler: Change Month / Year
  const handleMonthChange = (month: number, year: number) => {
    setSettings(prev => ({ ...prev, currentMonth: month, currentYear: year }));
  };

  // Full data package for Google Sheets sync
  const fullPayrollData: FullPayrollData = useMemo(() => ({
    settings,
    employees,
    dependents,
    insurances,
    mealRegistrations,
    specialAllowances,
    timekeepings,
    payrolls
  }), [settings, employees, dependents, insurances, mealRegistrations, specialAllowances, timekeepings, payrolls]);

  // Handler: Import Data from Google Sheets
  const handleDataImported = (imported: Partial<FullPayrollData>) => {
    if (imported.settings) setSettings(sanitizeSettings(imported.settings));
    if (imported.employees) setEmployees(sanitizeEmployees(imported.employees));
    if (imported.dependents) setDependents(sanitizeDependents(imported.dependents));
    if (imported.insurances) setInsurances(sanitizeInsurances(imported.insurances));
    if (imported.mealRegistrations) setMealRegistrations(sanitizeMealRegistrations(imported.mealRegistrations));
    if (imported.specialAllowances) setSpecialAllowances(sanitizeSpecialAllowances(imported.specialAllowances));
    if (imported.timekeepings) setTimekeepings(sanitizeTimekeepings(imported.timekeepings));
  };

  // Handler: Apply new company clean blank database
  const handleApplyNewCompanyData = (
    newData: FullPayrollData,
    spreadsheetInfo?: { id: string; url: string; title: string }
  ) => {
    setSettings(sanitizeSettings(newData.settings));
    setEmployees(sanitizeEmployees(newData.employees));
    setDependents(sanitizeDependents(newData.dependents));
    setInsurances(sanitizeInsurances(newData.insurances));
    setMealRegistrations(sanitizeMealRegistrations(newData.mealRegistrations));
    setSpecialAllowances(sanitizeSpecialAllowances(newData.specialAllowances));
    setTimekeepings(sanitizeTimekeepings(newData.timekeepings));
    resetOfficialUsersForNewDatabase();

    if (spreadsheetInfo) {
      localStorage.setItem('payroll_is_demo_mode', 'false');
      saveDatabaseConnectionToStorage({
        id: spreadsheetInfo.id,
        name: spreadsheetInfo.title,
        url: spreadsheetInfo.url
      });
      setSyncState(prev => ({
        ...prev,
        isConnected: true,
        isDemoMode: false,
        spreadsheetId: spreadsheetInfo.id,
        spreadsheetName: spreadsheetInfo.title,
        spreadsheetUrl: spreadsheetInfo.url,
        syncMessage: `Đang kết nối: ${spreadsheetInfo.title}`
      }));
    }
  };

  // Handler: Load data from Google Spreadsheet
  const handleLoadDataFromSpreadsheet = async (
    spreadsheetId: string,
    spreadsheetName?: string
  ): Promise<boolean> => {
    try {
      const fullData = await importFullDataFromGoogleSheets(spreadsheetId);
      if (fullData) {
        if (fullData.settings) {
          setSettings(sanitizeSettings(fullData.settings));
        }
        if (fullData.employees) {
          setEmployees(sanitizeEmployees(fullData.employees));
        }
        if (fullData.dependents) {
          setDependents(sanitizeDependents(fullData.dependents));
        }
        if (fullData.insurances) {
          setInsurances(sanitizeInsurances(fullData.insurances));
        }
        if (fullData.mealRegistrations) {
          setMealRegistrations(sanitizeMealRegistrations(fullData.mealRegistrations));
        }
        if (fullData.specialAllowances) {
          setSpecialAllowances(sanitizeSpecialAllowances(fullData.specialAllowances));
        }
        if (fullData.timekeepings) {
          setTimekeepings(sanitizeTimekeepings(fullData.timekeepings));
        }
        localStorage.setItem('payroll_is_demo_mode', 'false');
        const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
        const sheetTitle = spreadsheetName || fullData.settings?.companyName || 'Bảng tính Google Sheets';
        saveDatabaseConnectionToStorage({
          id: spreadsheetId,
          name: sheetTitle,
          url: sheetUrl
        });
        setSyncState(prev => ({
          ...prev,
          isConnected: true,
          isDemoMode: false,
          spreadsheetId,
          spreadsheetName: spreadsheetName || fullData.settings?.companyName || prev.spreadsheetName,
          spreadsheetUrl: sheetUrl,
          syncMessage: `Đã kết nối dữ liệu Google Sheets: ${spreadsheetName || spreadsheetId}`
        }));
        return true;
      }
      return false;
    } catch (err: any) {
      const isAuthErr = !hasValidGoogleToken() || err?.message?.includes('Chưa đăng nhập Google') || err?.message?.includes('hết hạn');
      if (isAuthErr) {
        console.warn('Google Sheets: Phiên làm việc Google chưa được kích hoạt hoặc đã hết hạn.');
        setSyncState(prev => ({
          ...prev,
          isConnected: false,
          syncMessage: 'Phiên đăng nhập Google đã hết hạn. Vui lòng kết nối lại tài khoản Google.'
        }));
        return false;
      }
      console.warn('Lỗi khi nạp dữ liệu từ Google Sheets:', err);
      return false;
    }
  };

  // Tự động đồng bộ từ Google Sheets tối đa 1 lần khi mới khởi động ứng dụng
  // (Tránh ghi đè dữ liệu đang nhập khi người dùng mới xác thực lại Google hoặc vừa tạo bảng tính trong phiên làm việc)
  const hasAutoLoadedOnStartupRef = useRef(false);
  useEffect(() => {
    if (hasAutoLoadedOnStartupRef.current) return;
    const isDemo = syncState.isDemoMode || localStorage.getItem('payroll_is_demo_mode') === 'true';
    if (!isDemo && syncState.isConnected && syncState.spreadsheetId) {
      hasAutoLoadedOnStartupRef.current = true;
      if (!hasValidGoogleToken()) {
        setSyncState(prev => ({
          ...prev,
          isConnected: false,
          syncMessage: 'Vui lòng đăng nhập Google để tiếp tục đồng bộ dữ liệu.'
        }));
        return;
      }
      handleLoadDataFromSpreadsheet(syncState.spreadsheetId, syncState.spreadsheetName || undefined).catch(err => {
        console.warn('Không thể tự động tải từ Google Sheets khi khởi động:', err);
      });
    }
  }, [syncState.isConnected, syncState.spreadsheetId, syncState.isDemoMode]);

  // Handler: Reset to local demo data
  const handleResetToDemoData = () => {
    localStorage.setItem('payroll_is_demo_mode', 'true');
    setSettings(INITIAL_SETTINGS);
    setEmployees(INITIAL_EMPLOYEES);
    setDependents(INITIAL_DEPENDENTS);
    setInsurances(INITIAL_INSURANCES);
    setMealRegistrations(INITIAL_MEAL_REGISTRATIONS);
    setSpecialAllowances(INITIAL_SPECIAL_ALLOWANCES);
    setTimekeepings(INITIAL_TIMEKEEPINGS);
    setSyncState(prev => ({
      ...prev,
      isDemoMode: true,
      spreadsheetId: null,
      spreadsheetName: null,
      spreadsheetUrl: null,
      syncMessage: 'Đang dùng dữ liệu mẫu nội bộ (Khóa đồng bộ Google Sheets)'
    }));
  };

  // Employee CRUD
  const handleAddEmployeeClick = () => {
    setEmployeeToEdit(null);
    setIsEmployeeModalOpen(true);
  };

  const handleEditEmployeeClick = (emp: Employee) => {
    setEmployeeToEdit(emp);
    setIsEmployeeModalOpen(true);
  };

  const handleSaveEmployee = (emp: Employee) => {
    setEmployees(prev => {
      const idx = prev.findIndex(e => e.id === emp.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = emp;
        return copy;
      }
      return [...prev, emp];
    });
  };

  const handleDeleteEmployee = (id: string) => {
    const emp = employees.find(e => e.id === id);
    const empName = emp ? `${emp.fullName} (${emp.employeeCode})` : 'nhân viên này';
    setDeleteConfirmState({
      isOpen: true,
      title: 'Xác Nhận Xóa Nhân Viên',
      message: `Bạn có chắc chắn muốn xóa nhân viên "${empName}" khỏi hệ thống? Thao tác này sẽ đồng thời xóa toàn bộ dữ liệu chấm công, bảo hiểm, ăn ca, người phụ thuộc và phụ cấp liên quan.`,
      onConfirm: () => {
        setEmployees(prev => prev.filter(e => e.id !== id));
        setTimekeepings(prev => prev.filter(t => t.employeeId !== id));
        setInsurances(prev => prev.filter(i => i.employeeId !== id));
        setMealRegistrations(prev => prev.filter(m => m.employeeId !== id));
        setDependents(prev => prev.filter(d => d.employeeId !== id));
        setSpecialAllowances(prev => prev.filter(a => a.employeeId !== id));
        setDeleteConfirmState(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const handleImportEmployees = (imported: Partial<Employee>[]) => {
    const newItems: Employee[] = imported.map((imp, idx) => ({
      id: `emp-${Date.now()}-${idx}`,
      employeeCode: imp.employeeCode || `NV-${1000 + idx}`,
      fullName: imp.fullName || 'Chưa đặt tên',
      idCardNumber: imp.idCardNumber || '',
      birthDate: imp.birthDate || '1995-01-01',
      issueDate: imp.issueDate || '2021-01-01',
      issuePlace: imp.issuePlace || 'Cục Cảnh sát QLHC về TTXH',
      address: imp.address || '',
      phoneNumber: imp.phoneNumber || '',
      email: imp.email || '',
      departmentId: settings.departments[0]?.id || '',
      positionId: settings.positions[0]?.id || '',
      workStatus: imp.workStatus || 'active',
      startDate: imp.startDate || '2024-01-01',
      salaryBasis: imp.salaryBasis || 'monthly',
      baseSalary: imp.baseSalary || 10000000,
      salaryPercent: 100,
      bankAccount: imp.bankAccount || '',
      bankName: imp.bankName || 'Vietcombank',
      taxId: imp.taxId || ''
    }));

    setEmployees(prev => [...prev, ...newItems]);
  };

  const handleUpdateEmployeeSalary = (employeeId: string, newSalary: number) => {
    setEmployees(prev => prev.map(e => e.id === employeeId ? { ...e, baseSalary: newSalary } : e));
  };

  // Dependents CRUD
  const handleAddDependent = (dep: Dependent) => setDependents(prev => [...prev, dep]);
  const handleBatchAddDependents = (newDeps: Dependent[]) => setDependents(prev => [...prev, ...newDeps]);
  const handleUpdateDependent = (dep: Dependent) => setDependents(prev => prev.map(d => d.id === dep.id ? dep : d));
  const handleDeleteDependent = (id: string) => {
    const dep = dependents.find(d => d.id === id);
    const depName = dep ? dep.fullName : 'người phụ thuộc này';
    setDeleteConfirmState({
      isOpen: true,
      title: 'Xác Nhận Xóa Người Phụ Thuộc',
      message: `Bạn có chắc chắn muốn xóa người phụ thuộc "${depName}" khỏi hệ thống?`,
      onConfirm: () => {
        setDependents(prev => prev.filter(d => d.id !== id));
        setDeleteConfirmState(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  // Insurance update
  const handleUpdateInsurance = (ins: InsuranceRecord) => {
    setInsurances(prev => {
      const idx = prev.findIndex(i => i.id === ins.id || (Boolean(ins.employeeId) && i.employeeId === ins.employeeId));
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = ins;
        return copy;
      }
      return [...prev, ins];
    });
  };

  // Meal update
  const handleUpdateMeal = (meal: MealRegistration) => {
    setMealRegistrations(prev => {
      const idx = prev.findIndex(m => m.id === meal.id || (m.employeeId === meal.employeeId && m.month === meal.month));
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = meal;
        return copy;
      }
      return [...prev, meal];
    });
  };

  const handleBatchUpdateMeals = (meals: MealRegistration[]) => {
    setMealRegistrations(prev => {
      const map = new Map(prev.map(m => [`${m.employeeId}_${m.month || ''}`, m]));
      meals.forEach(m => {
        map.set(`${m.employeeId}_${m.month || ''}`, m);
      });
      return Array.from(map.values());
    });
  };

  // Allowances CRUD
  const handleAddAllowance = (a: SpecialAllowance) => setSpecialAllowances(prev => [...prev, a]);
  const handleBatchAddAllowances = (newAllowances: SpecialAllowance[]) => setSpecialAllowances(prev => [...prev, ...newAllowances]);
  const handleBatchUpsertAllowances = (
    items: SpecialAllowance[],
    mode: 'overwrite' | 'skip' | 'append' = 'overwrite'
  ) => {
    setSpecialAllowances(prev => {
      if (mode === 'append') {
        return [...prev, ...items];
      }

      const next = [...prev];
      items.forEach(item => {
        const normalizedName = (item.name || '').trim().toLowerCase();
        const matchIdx = next.findIndex(existing => {
          if ((existing.id && existing.id.startsWith('adv-')) || (existing.name || '').toLowerCase().includes('tạm ứng')) {
            return false;
          }
          if (existing.employeeId !== item.employeeId || existing.month !== item.month) {
            return false;
          }
          if (item.catalogId && existing.catalogId && existing.catalogId === item.catalogId) {
            return true;
          }
          return (existing.name || '').trim().toLowerCase() === normalizedName;
        });

        if (matchIdx >= 0) {
          if (mode === 'overwrite') {
            next[matchIdx] = {
              ...next[matchIdx],
              allowanceType: item.allowanceType,
              catalogId: item.catalogId ?? next[matchIdx].catalogId,
              name: item.name,
              amount: item.amount,
              isTaxable: item.isTaxable,
              note: item.note
            };
          }
        } else {
          next.push(item);
        }
      });

      return next;
    });
  };
  const handleUpdateAllowance = (a: SpecialAllowance) => setSpecialAllowances(prev => prev.map(item => item.id === a.id ? a : item));
  const handleDeleteAllowance = (id: string) => {
    const item = specialAllowances.find(a => a.id === id);
    const itemName = item ? item.name : 'khoản phụ cấp này';
    setDeleteConfirmState({
      isOpen: true,
      title: 'Xác Nhận Xóa Phụ Cấp',
      message: `Bạn có chắc muốn xóa khoản phụ cấp "${itemName}"?`,
      onConfirm: () => {
        setSpecialAllowances(prev => prev.filter(item => item.id !== id));
        setDeleteConfirmState(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  // Timekeeping updates
  const handleUpdateTimekeeping = (tk: TimekeepingRecord) => {
    setTimekeepings(prev => {
      const tkKey = normalizeMonthKey(tk.month, tk.year);
      const tkYear = tk.year || Number(tkKey.split('-')[0]) || settings.currentYear;
      const idx = prev.findIndex(t => 
        t.id === tk.id || 
        (t.employeeId === tk.employeeId && normalizeMonthKey(t.month, t.year) === tkKey)
      );
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...tk, month: tkKey, year: tkYear };
        return copy;
      }
      return [...prev, { ...tk, month: tkKey, year: tkYear }];
    });
  };

  const handleBatchUpdateTimekeeping = (records: TimekeepingRecord[]) => {
    setTimekeepings(prev => {
      const map = new Map<string, TimekeepingRecord>();
      prev.forEach(t => {
        const k = `${t.employeeId}_${normalizeMonthKey(t.month, t.year)}`;
        map.set(k, t);
      });
      records.forEach(t => {
        const keyMonth = normalizeMonthKey(t.month, t.year);
        const k = `${t.employeeId}_${keyMonth}`;
        const recYear = t.year || Number(keyMonth.split('-')[0]) || settings.currentYear;
        map.set(k, { ...t, month: keyMonth, year: recYear });
      });
      return Array.from(map.values());
    });
  };

  // Payroll updates (status, advance)
  const handleUpdatePayrollStatus = (payrollId: string, status: PaymentStatus) => {
    // Lưu ý: trạng thái paymentStatus được gán trực tiếp
    // We can track paymentStatus overrides in state
    setEmployees(prev => [...prev]); // trigger recalculation
  };

  const handleUpdateAdvancePayment = (payrollId: string, amount: number) => {
    const p = payrolls.find(item => item.id === payrollId);
    if (!p) return;
    const empId = p.employeeId;
    const currentMonthKey = `${settings.currentYear}-${String(settings.currentMonth).padStart(2, '0')}`;
    const cleanAmount = Math.max(0, Number(amount) || 0);

    setSpecialAllowances(prev => {
      const existingIdx = prev.findIndex(
        a =>
          a.employeeId === empId &&
          ((a.id && a.id.startsWith('adv-')) || (a.name || '').toLowerCase().includes('tạm ứng')) &&
          (a.month === currentMonthKey || !a.month)
      );

      if (existingIdx >= 0) {
        if (cleanAmount === 0) {
          return prev.filter((_, i) => i !== existingIdx);
        }
        const copy = [...prev];
        copy[existingIdx] = {
          ...copy[existingIdx],
          month: currentMonthKey,
          amount: cleanAmount,
          isTaxable: false
        };
        return copy;
      }

      if (cleanAmount === 0) return prev;
      return [
        ...prev,
        {
          id: `adv-${empId}-${currentMonthKey}-${Date.now()}`,
          employeeId: empId,
          allowanceType: 'other',
          name: 'Tạm ứng lương trong tháng',
          amount: cleanAmount,
          isTaxable: false,
          month: currentMonthKey,
          note: 'Khấu trừ vào kỳ chi trả'
        }
      ];
    });
  };

  const handleReconnectGoogleDrive = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setDriveReconnectError('Thiết bị đang ngoại tuyến. Vui lòng kiểm tra kết nối Internet trước khi kết nối lại Google Drive.');
      return;
    }
    setIsReconnectingDrive(true);
    setDriveReconnectError(null);
    // Đảm bảo kết nối lại trong phiên làm việc không tự động tải đè dữ liệu đang sửa trên máy
    hasAutoLoadedOnStartupRef.current = true;
    try {
      const res = await googleSignIn();
      if (res) {
        setTokenRemainingMs(getGoogleTokenRemainingMs());
        setDriveConnectionAlert(null);
        setIsDriveBannerDismissed(false);
        setSyncState(prev => ({
          ...prev,
          isConnected: true,
          userEmail: res.user.email,
          syncMessage: 'Đã kết nối lại Google Drive thành công!'
        }));
        if (!syncState.spreadsheetId) {
          setIsSyncModalOpen(true);
        }
      }
    } catch (err: any) {
      console.error('Lỗi kết nối lại Google Drive:', err);
      setDriveReconnectError(
        err?.code === 'auth/popup-closed-by-user'
          ? 'Bạn đã đóng cửa sổ xác thực Google trước khi hoàn tất. Vui lòng bấm Kết nối lại để hoàn thành.'
          : `Không thể kết nối lại Google Drive: ${err?.message || 'Vui lòng thử lại.'}`
      );
    } finally {
      setIsReconnectingDrive(false);
    }
  }, [syncState.spreadsheetId]);

  const handleOpenPrintSlip = (empId?: string, empIds?: string[]) => {
    setSelectedSlipEmpId(empId);
    setSelectedSlipEmpIds(empIds);
    setIsPrintSlipOpen(true);
  };

  const canMonitorDrive = isAuthenticated && currentUserRole !== 'employee' && !isDemoMode;
  const isTokenExpiringSoon =
    syncState.isConnected &&
    Boolean(syncState.spreadsheetId) &&
    tokenRemainingMs > 0 &&
    tokenRemainingMs < 5 * 60 * 1000;
  const hasDriveConnectionIssue =
    canMonitorDrive &&
    (!isNetworkOnline ||
      Boolean(driveConnectionAlert) ||
      !syncState.isConnected ||
      !syncState.spreadsheetId ||
      isTokenExpiringSoon);

  const driveWarningConfig = useMemo(() => {
    if (!hasDriveConnectionIssue) return null;

    if (!isNetworkOnline) {
      return {
        severity: 'critical' as const,
        icon: 'offline' as const,
        title: 'Mất kết nối mạng — Đồng bộ Google Drive đang bị gián đoạn',
        description:
          'Thiết bị hiện không có kết nối Internet. Mọi dữ liệu bạn chỉnh sửa vẫn được giữ tạm trên trình duyệt; hãy kiểm tra đường truyền mạng và kết nối lại để đồng bộ liên tục.',
        primaryLabel: 'Thử kết nối lại Google Drive',
        actionMode: 'reconnect' as const
      };
    }

    if (driveConnectionAlert?.type === 'expired' || (!syncState.isConnected && Boolean(syncState.spreadsheetId))) {
      return {
        severity: 'critical' as const,
        icon: 'cloud-off' as const,
        title: 'Kết nối Google Drive đã hết phiên hoặc bị ngắt',
        description:
          driveConnectionAlert?.reason ||
          'Phiên kết nối tới Google Drive không còn hiệu lực. Vui lòng kết nối lại ngay để dữ liệu chấm công, ăn ca và bảng lương được đồng bộ liên tục.',
        primaryLabel: 'Kết nối lại Google Drive',
        actionMode: 'reconnect' as const
      };
    }

    if (driveConnectionAlert?.type === 'interrupted') {
      return {
        severity: 'critical' as const,
        icon: 'warning' as const,
        title: 'Kết nối Google Drive bị gián đoạn trong quá trình đồng bộ',
        description: driveConnectionAlert.reason,
        primaryLabel: 'Kết nối lại Google Drive',
        actionMode: 'reconnect' as const
      };
    }

    if (!syncState.isConnected) {
      return {
        severity: 'warning' as const,
        icon: 'cloud-off' as const,
        title: 'Chưa kết nối tài khoản Google Drive',
        description:
          'Phần mềm hiện chưa liên kết với Google Drive. Dữ liệu đang chỉ lưu tạm trên trình duyệt này — hãy kết nối Google Drive để đồng bộ an toàn và liên tục.',
        primaryLabel: 'Kết nối Google Drive ngay',
        actionMode: 'reconnect' as const
      };
    }

    if (!syncState.spreadsheetId) {
      return {
        severity: 'warning' as const,
        icon: 'link' as const,
        title: 'Chưa chọn hoặc khởi tạo bảng tính Google Sheets trên Drive',
        description:
          'Tài khoản Google đã đăng nhập nhưng chưa liên kết file bảng tính dữ liệu. Hãy mở hộp thoại đồng bộ để chọn hoặc tạo file Google Sheets.',
        primaryLabel: 'Chọn / Tạo bảng tính Drive',
        actionMode: 'open-sync' as const
      };
    }

    const minsLeft = Math.max(1, Math.ceil(tokenRemainingMs / 60000));
    return {
      severity: 'warning' as const,
      icon: 'warning' as const,
      title: `Phiên Google Drive sắp hết hạn (còn khoảng ${minsLeft} phút)`,
      description:
        'Phiên xác thực Google Drive chuẩn bị hết thời gian hiệu lực. Hãy gia hạn kết nối ngay để tránh gián đoạn khi bạn lưu và đồng bộ dữ liệu.',
      primaryLabel: 'Gia hạn kết nối Google Drive',
      actionMode: 'reconnect' as const
    };
  }, [
    hasDriveConnectionIssue,
    isNetworkOnline,
    driveConnectionAlert,
    syncState.isConnected,
    syncState.spreadsheetId,
    tokenRemainingMs
  ]);

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans text-slate-800">
      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        isOpenMobile={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        onOpenSyncModal={() => setIsSyncModalOpen(true)}
        onRequestLogout={() => setIsLogoutConfirmOpen(true)}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={handleToggleSidebarCollapse}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <Navbar
          settings={settings}
          syncState={syncState}
          onOpenSync={() => setIsSyncModalOpen(true)}
          onToggleSidebar={() => setIsMobileSidebarOpen(prev => !prev)}
          isSidebarCollapsed={isSidebarCollapsed}
          onToggleSidebarCollapse={handleToggleSidebarCollapse}
          employees={employees}
          onMonthChange={handleMonthChange}
          onOpenUserManagement={() => setActiveTab('users')}
          onOpenChangePassword={() => setIsChangePasswordOpen(true)}
          onOpenLoginModal={() => setIsLoginModalOpen(true)}
          onRequestLogout={() => setIsLogoutConfirmOpen(true)}
        />

        <main className="flex-1 w-full min-w-0 px-3 sm:px-4 lg:px-6 py-4 space-y-5">
          {driveWarningConfig && !isDriveBannerDismissed && (
            <div
              role="alert"
              className={`rounded-2xl border p-3.5 sm:p-4 shadow-xs transition-all ${
                driveWarningConfig.severity === 'critical'
                  ? 'bg-rose-50 border-rose-300 text-rose-950'
                  : 'bg-amber-50 border-amber-300 text-amber-950'
              }`}
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                      driveWarningConfig.severity === 'critical'
                        ? 'bg-rose-100 text-rose-700 border border-rose-200'
                        : 'bg-amber-100 text-amber-700 border border-amber-200'
                    }`}
                  >
                    {driveWarningConfig.icon === 'offline' && <WifiOff className="w-5 h-5" />}
                    {driveWarningConfig.icon === 'cloud-off' && <CloudOff className="w-5 h-5" />}
                    {driveWarningConfig.icon === 'link' && <Link2 className="w-5 h-5" />}
                    {driveWarningConfig.icon === 'warning' && <AlertTriangle className="w-5 h-5" />}
                  </div>
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-sm leading-snug">
                        {driveWarningConfig.title}
                      </span>
                      {syncState.spreadsheetName && (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-white/80 border border-slate-200 text-slate-700 truncate max-w-[260px]">
                          File: {syncState.spreadsheetName}
                        </span>
                      )}
                    </div>
                    <p
                      className={`text-xs leading-relaxed ${
                        driveWarningConfig.severity === 'critical' ? 'text-rose-800' : 'text-amber-800'
                      }`}
                    >
                      {driveWarningConfig.description}
                    </p>
                    {driveReconnectError && (
                      <p className="text-xs font-semibold text-rose-700 pt-0.5">
                        {driveReconnectError}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0 pl-12 lg:pl-0">
                  <button
                    type="button"
                    disabled={isReconnectingDrive}
                    onClick={() => {
                      if (driveWarningConfig.actionMode === 'open-sync') {
                        setIsSyncModalOpen(true);
                      } else {
                        handleReconnectGoogleDrive();
                      }
                    }}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white shadow-xs transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                      driveWarningConfig.severity === 'critical'
                        ? 'bg-rose-600 hover:bg-rose-700'
                        : 'bg-amber-600 hover:bg-amber-700'
                    }`}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isReconnectingDrive ? 'animate-spin' : ''}`} />
                    <span>{isReconnectingDrive ? 'Đang kết nối...' : driveWarningConfig.primaryLabel}</span>
                  </button>

                  {driveWarningConfig.actionMode !== 'open-sync' && (
                    <button
                      type="button"
                      onClick={() => setIsSyncModalOpen(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 transition-colors cursor-pointer"
                    >
                      Mở bảng đồng bộ
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setIsDriveBannerDismissed(true)}
                    title="Thu gọn thông báo này tạm thời"
                    className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-white/70 transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'dashboard' && (
            <DashboardView
              employees={employees}
              payrolls={payrolls}
              timekeepings={timekeepings}
              dependents={dependents}
              settings={settings}
              syncState={syncState}
              onOpenSync={() => setIsSyncModalOpen(true)}
              onNavigate={setActiveTab}
              onPrintPayroll={() => setIsPrintPayrollOpen(true)}
              onPrintAllSlips={() => handleOpenPrintSlip()}
            />
          )}

          {activeTab === 'my_payslip' && (
            <MyPayslipView
              employees={employees}
              payrolls={payrolls}
              timekeepings={timekeepings}
              settings={settings}
              onPrintSlip={handleOpenPrintSlip}
            />
          )}

          {activeTab === 'users' && (
            <UserManagementView employees={employees} />
          )}

          {activeTab === 'payroll' && (
            <PayrollView
              payrolls={payrolls}
              employees={employees}
              settings={settings}
              syncState={syncState}
              onOpenSync={() => setIsSyncModalOpen(true)}
              onPrintPayroll={(depId) => {
                setPrintPayrollDepartmentId(depId);
                setIsPrintPayrollOpen(true);
              }}
              onPrintSlip={handleOpenPrintSlip}
              onUpdatePayrollStatus={handleUpdatePayrollStatus}
              onUpdateAdvancePayment={handleUpdateAdvancePayment}
              onNavigateToAnnual={() => setActiveTab('annual_payroll')}
              onReorderEmployees={setEmployees}
            />
          )}

          {activeTab === 'annual_payroll' && (
            <AnnualPayrollView
              employees={employees}
              timekeepings={timekeepings}
              insurances={insurances}
              mealRegistrations={mealRegistrations}
              specialAllowances={specialAllowances}
              dependents={dependents}
              settings={settings}
              onReorderEmployees={setEmployees}
            />
          )}

          {activeTab === 'timekeeping' && (
            <TimekeepingView
              timekeepings={timekeepings}
              employees={employees}
              settings={settings}
              mealRegistrations={mealRegistrations}
              onUpdateTimekeeping={handleUpdateTimekeeping}
              onBatchUpdateTimekeeping={handleBatchUpdateTimekeeping}
              onMonthChange={handleMonthChange}
              onReorderEmployees={setEmployees}
            />
          )}

          {activeTab === 'employees' && (
            <EmployeesView
              employees={employees}
              departments={settings.departments}
              positions={settings.positions}
              settings={settings}
              insurances={insurances}
              onAddEmployee={handleAddEmployeeClick}
              onEditEmployee={handleEditEmployeeClick}
              onDeleteEmployee={handleDeleteEmployee}
              onImportEmployees={handleImportEmployees}
              onUpdateEmployeeSalary={handleUpdateEmployeeSalary}
              onUpdateEmployee={handleSaveEmployee}
              onUpdateSettings={setSettings}
              onReorderEmployees={setEmployees}
            />
          )}

          {activeTab === 'insurance' && (
            <InsuranceView
              insurances={insurances}
              employees={employees}
              settings={settings}
              onUpdateInsurance={handleUpdateInsurance}
              onUpdateSettings={setSettings}
              onReorderEmployees={setEmployees}
            />
          )}

          {activeTab === 'dependents' && (
            <DependentsView
              dependents={dependents}
              employees={employees}
              settings={settings}
              onAddDependent={handleAddDependent}
              onUpdateDependent={handleUpdateDependent}
              onDeleteDependent={handleDeleteDependent}
              onBatchAddDependents={handleBatchAddDependents}
            />
          )}

          {activeTab === 'meal' && (
            <MealView
              mealRegistrations={mealRegistrations}
              employees={employees}
              timekeepings={timekeepings}
              settings={settings}
              onUpdateMeal={handleUpdateMeal}
              onBatchUpdateMeals={handleBatchUpdateMeals}
              onReorderEmployees={setEmployees}
            />
          )}

          {activeTab === 'allowances' && (
            <AllowancesView
              specialAllowances={specialAllowances}
              employees={employees}
              settings={settings}
              onUpdateSettings={setSettings}
              onAddAllowance={handleAddAllowance}
              onUpdateAllowance={handleUpdateAllowance}
              onDeleteAllowance={handleDeleteAllowance}
              onBatchAddAllowances={handleBatchAddAllowances}
              onBatchUpsertAllowances={handleBatchUpsertAllowances}
            />
          )}

          {activeTab === 'tax' && (
            <TaxReportView
              payrolls={payrolls}
              employees={employees}
              settings={settings}
              timekeepings={timekeepings}
              insurances={insurances}
              mealRegistrations={mealRegistrations}
              specialAllowances={specialAllowances}
              dependents={dependents}
              onUpdateSettings={setSettings}
              onReorderEmployees={setEmployees}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsView
              settings={settings}
              onUpdateSettings={setSettings}
              syncState={syncState}
            />
          )}
        </main>
      </div>

      {/* Modals */}
      <GoogleSyncModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
        syncState={syncState}
        setSyncState={setSyncState}
        payrollData={fullPayrollData}
        onDataImported={handleDataImported}
      />

      <PrintSlipModal
        isOpen={isPrintSlipOpen}
        onClose={() => setIsPrintSlipOpen(false)}
        employees={employees}
        payrolls={payrolls}
        settings={settings}
        selectedEmployeeId={selectedSlipEmpId}
        initialSelectedEmployeeIds={selectedSlipEmpIds}
        month={`${settings.currentMonth}/${settings.currentYear}`}
      />

      <PrintPayrollModal
        isOpen={isPrintPayrollOpen}
        onClose={() => {
          setIsPrintPayrollOpen(false);
          setPrintPayrollDepartmentId(undefined);
        }}
        employees={employees}
        payrolls={payrolls}
        settings={settings}
        month={`${settings.currentMonth}/${settings.currentYear}`}
        initialDepartmentId={printPayrollDepartmentId}
      />

      <EmployeeModal
        isOpen={isEmployeeModalOpen}
        onClose={() => setIsEmployeeModalOpen(false)}
        onSave={handleSaveEmployee}
        departments={settings.departments}
        positions={settings.positions}
        employeeToEdit={employeeToEdit}
      />

      {/* Login & Security Modals */}
      <LoginModal
        isOpen={!isAuthenticated || isLoginModalOpen}
        onClose={() => {
          if (isAuthenticated) {
            setIsLoginModalOpen(false);
          }
        }}
        settings={settings}
        syncState={syncState}
        setSyncState={setSyncState}
        onApplyNewCompanyData={handleApplyNewCompanyData}
        onLoadDataFromSpreadsheet={handleLoadDataFromSpreadsheet}
        onResetToDemoData={handleResetToDemoData}
      />

      <ChangePasswordModal
        isOpen={isChangePasswordOpen}
        onClose={() => setIsChangePasswordOpen(false)}
      />

      <LogoutSyncConfirmModal
        isOpen={isLogoutConfirmOpen}
        onClose={() => setIsLogoutConfirmOpen(false)}
        syncState={syncState}
        setSyncState={setSyncState}
        payrollData={fullPayrollData}
        onDirectLogout={() => {
          setIsLogoutConfirmOpen(false);
          if (syncState.spreadsheetId && !syncState.isDemoMode) {
            saveDatabaseConnectionToStorage({
              id: syncState.spreadsheetId,
              name: syncState.spreadsheetName,
              url: syncState.spreadsheetUrl
            });
          }
          logout();
        }}
        onOpenSyncModal={() => {
          setIsLogoutConfirmOpen(false);
          setIsSyncModalOpen(true);
        }}
      />

      <ConfirmModal
        isOpen={deleteConfirmState.isOpen}
        title={deleteConfirmState.title}
        message={deleteConfirmState.message}
        onConfirm={deleteConfirmState.onConfirm}
        onCancel={() => setDeleteConfirmState(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthRoleProvider>
        <PayrollAppContent />
      </AuthRoleProvider>
    </ErrorBoundary>
  );
}
