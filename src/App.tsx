import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
import { getCurrentUser } from './services/authService';
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
  const { currentUser, isAuthenticated, currentUserRole, logout } = useAuthRole();
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
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

  // Check existing Google Auth session on mount
  useEffect(() => {
    const user = getCurrentUser();
    if (user) {
      setSyncState(prev => ({
        ...prev,
        isConnected: true,
        userEmail: user.email
      }));
    }
  }, []);

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
    } catch (err) {
      console.error('Lỗi khi nạp dữ liệu từ Google Sheets:', err);
      throw err;
    }
  };

  // Tự động đồng bộ từ Google Sheets nếu đã kết nối trước đó (chỉ chạy khi không ở chế độ dữ liệu mẫu)
  useEffect(() => {
    const isDemo = syncState.isDemoMode || localStorage.getItem('payroll_is_demo_mode') === 'true';
    if (!isDemo && syncState.isConnected && syncState.spreadsheetId) {
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
      const idx = prev.findIndex(i => i.id === ins.id);
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
    // Update allowance with negative or advance
    const empId = p.employeeId;
    const existingAdvance = specialAllowances.find(a => a.employeeId === empId && a.name.includes('Tạm ứng'));
    if (existingAdvance) {
      setSpecialAllowances(prev => prev.map(a => a.id === existingAdvance.id ? { ...a, amount } : a));
    } else {
      setSpecialAllowances(prev => [
        ...prev,
        {
          id: `adv-${Date.now()}`,
          employeeId: empId,
          name: 'Tạm ứng lương trong tháng',
          amount: amount,
          isTaxable: false,
          month: `${settings.currentYear}-${String(settings.currentMonth).padStart(2, '0')}`,
          note: 'Khấu trừ vào kỳ chi trả'
        }
      ]);
    }
  };

  const handleOpenPrintSlip = (empId?: string, empIds?: string[]) => {
    setSelectedSlipEmpId(empId);
    setSelectedSlipEmpIds(empIds);
    setIsPrintSlipOpen(true);
  };

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
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <Navbar
          settings={settings}
          syncState={syncState}
          onOpenSync={() => setIsSyncModalOpen(true)}
          onToggleSidebar={() => setIsMobileSidebarOpen(prev => !prev)}
          employees={employees}
          onMonthChange={handleMonthChange}
          onOpenUserManagement={() => setActiveTab('users')}
          onOpenChangePassword={() => setIsChangePasswordOpen(true)}
          onOpenLoginModal={() => setIsLoginModalOpen(true)}
          onRequestLogout={() => setIsLogoutConfirmOpen(true)}
        />

        <main className="flex-1 p-4 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
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
            />
          )}

          {activeTab === 'insurance' && (
            <InsuranceView
              insurances={insurances}
              employees={employees}
              settings={settings}
              onUpdateInsurance={handleUpdateInsurance}
              onUpdateSettings={setSettings}
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
            />
          )}

          {activeTab === 'allowances' && (
            <AllowancesView
              specialAllowances={specialAllowances}
              employees={employees}
              settings={settings}
              onAddAllowance={handleAddAllowance}
              onUpdateAllowance={handleUpdateAllowance}
              onDeleteAllowance={handleDeleteAllowance}
              onBatchAddAllowances={handleBatchAddAllowances}
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
            />
          )}

          {activeTab === 'settings' && (
            <SettingsView
              settings={settings}
              onUpdateSettings={setSettings}
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
