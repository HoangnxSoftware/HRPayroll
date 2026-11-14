import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserRole, AppUser, RolePermissions } from '../types';
import { INITIAL_USERS } from '../data/initialData';

export const OFFICIAL_DEFAULT_ADMIN_PASSWORD = 'Joeblack0107@';
export const DEMO_DEFAULT_ADMIN_PASSWORD = '123';

interface AuthRoleContextType {
  users: AppUser[];
  currentUser: AppUser | null;
  isAuthenticated: boolean;
  authMode: 'official' | 'demo';
  validateCredentials: (username: string, password: string | undefined, isDemo: boolean) => { success: boolean; error?: string; user?: AppUser };
  login: (username: string, password?: string, isDemo?: boolean) => { success: boolean; error?: string };
  logout: () => void;
  resetOfficialAdminPassword: () => void;
  switchUser: (userId: string) => void;
  addUser: (user: AppUser) => void;
  updateUser: (user: AppUser) => void;
  deleteUser: (userId: string) => void;

  currentUserRole: UserRole;
  setCurrentUserRole: (role: UserRole) => void;
  selectedEmployeeIdForSelf: string;
  setSelectedEmployeeIdForSelf: (id: string) => void;

  // Quyền thao tác
  canEditSettings: boolean;
  canEditEmployees: boolean;
  canEditTimekeeping: boolean;
  canApprovePayroll: boolean;
  canExportData: boolean;

  // Quyền chi tiết
  canViewDashboard: boolean;
  canViewEmployees: boolean;
  canViewTimekeeping: boolean;
  canViewInsurance: boolean;
  canEditInsurance: boolean;
  canViewDependents: boolean;
  canEditDependents: boolean;
  canViewMeal: boolean;
  canEditMeal: boolean;
  canViewAllowances: boolean;
  canEditAllowances: boolean;
  canViewPayroll: boolean;
  canEditPayroll: boolean;
  canViewTaxReport: boolean;
  canSyncGoogleSheets: boolean;
  canManageUsers: boolean;

  roleLabel: string;
  roleDescription: string;
}

const AuthRoleContext = createContext<AuthRoleContextType | undefined>(undefined);

const DEMO_USERS_STORAGE_KEY = 'vietthanh_demo_users';
const OFFICIAL_USERS_STORAGE_KEY = 'vietthanh_official_users';
const LEGACY_USERS_STORAGE_KEY = 'vietthanh_payroll_users';
const CURRENT_USER_STORAGE_KEY = 'vietthanh_current_user';

const createInitialOfficialUsers = (): AppUser[] =>
  INITIAL_USERS.map(u =>
    u.username.toLowerCase() === 'admin'
      ? { ...u, password: OFFICIAL_DEFAULT_ADMIN_PASSWORD }
      : { ...u }
  );

const createInitialDemoUsers = (): AppUser[] =>
  INITIAL_USERS.map(u =>
    u.username.toLowerCase() === 'admin'
      ? { ...u, password: DEMO_DEFAULT_ADMIN_PASSWORD }
      : { ...u }
  );

export const AuthRoleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [authMode, setAuthMode] = useState<'official' | 'demo'>(() => {
    try {
      return localStorage.getItem('payroll_is_demo_mode') === 'true' ? 'demo' : 'official';
    } catch {
      return 'official';
    }
  });

  const [officialUsers, setOfficialUsers] = useState<AppUser[]>(() => {
    try {
      const saved = localStorage.getItem(OFFICIAL_USERS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.error('Failed to load official users from localStorage', e);
    }
    return createInitialOfficialUsers();
  });

  const [demoUsers, setDemoUsers] = useState<AppUser[]>(() => {
    try {
      const saved = localStorage.getItem(DEMO_USERS_STORAGE_KEY) || localStorage.getItem(LEGACY_USERS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((u: AppUser) =>
            u.username.toLowerCase() === 'admin' && !u.password
              ? { ...u, password: DEMO_DEFAULT_ADMIN_PASSWORD }
              : u
          );
        }
      }
    } catch (e) {
      console.error('Failed to load demo users from localStorage', e);
    }
    return createInitialDemoUsers();
  });

  const users = authMode === 'demo' ? demoUsers : officialUsers;

  // Khởi tạo currentUser = null để khi mở hoặc chạy phần mềm luôn hiện cửa sổ đăng nhập đầu tiên
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);

  // Lưu danh sách người dùng chính thức và demo vào localStorage khi thay đổi
  useEffect(() => {
    try {
      localStorage.setItem(OFFICIAL_USERS_STORAGE_KEY, JSON.stringify(officialUsers));
    } catch (e) {
      console.error('Failed to save official users', e);
    }
  }, [officialUsers]);

  useEffect(() => {
    try {
      localStorage.setItem(DEMO_USERS_STORAGE_KEY, JSON.stringify(demoUsers));
    } catch (e) {
      console.error('Failed to save demo users', e);
    }
  }, [demoUsers]);

  // Lưu phiên đăng nhập hiện tại
  useEffect(() => {
    try {
      if (currentUser) {
        localStorage.setItem(CURRENT_USER_STORAGE_KEY, JSON.stringify(currentUser));
      } else {
        localStorage.removeItem(CURRENT_USER_STORAGE_KEY);
      }
    } catch (e) {
      console.error('Failed to save currentUser', e);
    }
  }, [currentUser]);

  const [selectedEmployeeIdForSelf, setSelectedEmployeeIdForSelf] = useState<string>(() => {
    return currentUser?.employeeId || 'emp-004';
  });

  useEffect(() => {
    if (currentUser?.employeeId) {
      setSelectedEmployeeIdForSelf(currentUser.employeeId);
    }
  }, [currentUser]);

  const currentUserRole: UserRole = currentUser?.role || 'admin';

  const setActiveUsers = (updater: (prev: AppUser[]) => AppUser[], modeOverride?: 'official' | 'demo') => {
    const targetMode = modeOverride || authMode;
    if (targetMode === 'demo') {
      setDemoUsers(updater);
    } else {
      setOfficialUsers(updater);
    }
  };

  const setCurrentUserRole = (role: UserRole) => {
    if (currentUser) {
      const updated = { ...currentUser, role };
      setCurrentUser(updated);
      setActiveUsers(prev => prev.map(u => u.id === currentUser.id ? updated : u));
    }
  };

  const validateCredentials = (
    username: string,
    password: string | undefined,
    isDemo: boolean
  ): { success: boolean; error?: string; user?: AppUser } => {
    const cleanUsername = username.trim().toLowerCase();
    const pool = isDemo ? demoUsers : officialUsers;
    const foundUser = pool.find(
      u => u.username.toLowerCase() === cleanUsername || u.email.toLowerCase() === cleanUsername
    );

    if (!foundUser) {
      return { success: false, error: 'Tên đăng nhập hoặc Email không tồn tại trong hệ thống!' };
    }

    if (foundUser.status === 'locked') {
      return { success: false, error: 'Tài khoản này đã bị tạm khóa. Vui lòng liên hệ Quản trị viên!' };
    }

    const expectedPassword = foundUser.password ?? (
      foundUser.username.toLowerCase() === 'admin'
        ? (isDemo ? DEMO_DEFAULT_ADMIN_PASSWORD : OFFICIAL_DEFAULT_ADMIN_PASSWORD)
        : ''
    );
    const providedPassword = password ?? '';
    if (expectedPassword !== providedPassword) {
      return { success: false, error: 'Mật khẩu không chính xác. Vui lòng thử lại!' };
    }

    return { success: true, user: foundUser };
  };

  const login = (username: string, password?: string, isDemo?: boolean): { success: boolean; error?: string } => {
    const targetDemo = isDemo ?? (localStorage.getItem('payroll_is_demo_mode') === 'true');
    const targetMode: 'official' | 'demo' = targetDemo ? 'demo' : 'official';
    const check = validateCredentials(username, password, targetDemo);

    if (!check.success || !check.user) {
      return { success: false, error: check.error || 'Đăng nhập không thành công!' };
    }

    const updatedUser: AppUser = {
      ...check.user,
      lastLogin: new Date().toLocaleString('vi-VN', { hour12: false })
    };

    setAuthMode(targetMode);
    setCurrentUser(updatedUser);
    setActiveUsers(prev => prev.map(u => (u.id === updatedUser.id ? updatedUser : u)), targetMode);
    if (updatedUser.employeeId) {
      setSelectedEmployeeIdForSelf(updatedUser.employeeId);
    }
    return { success: true };
  };

  const logout = () => {
    setCurrentUser(null);
  };

  const resetOfficialAdminPassword = () => {
    setOfficialUsers(prev =>
      prev.map(u =>
        u.id === 'user-admin' || u.username.toLowerCase() === 'admin'
          ? { ...u, password: OFFICIAL_DEFAULT_ADMIN_PASSWORD }
          : u
      )
    );
  };

  const switchUser = (userId: string) => {
    const target = users.find(u => u.id === userId);
    if (target) {
      const updatedUser: AppUser = {
        ...target,
        lastLogin: new Date().toLocaleString('vi-VN', { hour12: false })
      };
      setCurrentUser(updatedUser);
      setActiveUsers(prev => prev.map(u => u.id === target.id ? updatedUser : u));
      if (target.employeeId) {
        setSelectedEmployeeIdForSelf(target.employeeId);
      }
    }
  };

  const addUser = (newUser: AppUser) => {
    setActiveUsers(prev => [...prev, newUser]);
  };

  const updateUser = (updatedUser: AppUser) => {
    setActiveUsers(prev => prev.map(u => u.id === updatedUser.id ? updatedUser : u));
    if (currentUser?.id === updatedUser.id) {
      setCurrentUser(updatedUser);
    }
  };

  const deleteUser = (userId: string) => {
    if (currentUser?.id === userId) {
      alert('Không thể xóa tài khoản đang đăng nhập!');
      return;
    }
    setActiveUsers(prev => prev.filter(u => u.id !== userId));
  };

  // Tính toán quyền hạn (Custom permissions overrides default role rules if specified)
  const custom = currentUser?.customPermissions || {};

  const canEditSettings = custom.canEditSettings ?? (currentUserRole === 'admin');
  const canManageUsers = custom.canManageUsers ?? (currentUserRole === 'admin');
  
  const canApprovePayroll = custom.canApprovePayroll ?? (currentUserRole === 'admin' || currentUserRole === 'accountant');
  const canEditPayroll = custom.canEditPayroll ?? (currentUserRole === 'admin' || currentUserRole === 'accountant' || currentUserRole === 'payroll');
  const canViewPayroll = custom.canViewPayroll ?? (currentUserRole !== 'employee');

  const canEditEmployees = custom.canEditEmployees ?? (currentUserRole === 'admin' || currentUserRole === 'accountant' || currentUserRole === 'payroll');
  const canViewEmployees = custom.canViewEmployees ?? (currentUserRole !== 'employee');

  const canEditTimekeeping = custom.canEditTimekeeping ?? (currentUserRole === 'admin' || currentUserRole === 'accountant' || currentUserRole === 'payroll');
  const canViewTimekeeping = custom.canViewTimekeeping ?? (currentUserRole !== 'employee');

  const canEditInsurance = custom.canEditInsurance ?? (currentUserRole === 'admin' || currentUserRole === 'accountant' || currentUserRole === 'payroll');
  const canViewInsurance = custom.canViewInsurance ?? (currentUserRole !== 'employee');

  const canEditDependents = custom.canEditDependents ?? (currentUserRole === 'admin' || currentUserRole === 'accountant' || currentUserRole === 'payroll');
  const canViewDependents = custom.canViewDependents ?? (currentUserRole !== 'employee');

  const canEditMeal = custom.canEditMeal ?? (currentUserRole === 'admin' || currentUserRole === 'accountant' || currentUserRole === 'payroll');
  const canViewMeal = custom.canViewMeal ?? (currentUserRole !== 'employee');

  const canEditAllowances = custom.canEditAllowances ?? (currentUserRole === 'admin' || currentUserRole === 'accountant' || currentUserRole === 'payroll');
  const canViewAllowances = custom.canViewAllowances ?? (currentUserRole !== 'employee');

  const canViewTaxReport = custom.canViewTaxReport ?? (currentUserRole !== 'employee');
  const canExportData = custom.canExportData ?? (currentUserRole !== 'employee');
  const canSyncGoogleSheets = custom.canSyncGoogleSheets ?? (currentUserRole === 'admin' || currentUserRole === 'accountant');
  const canViewDashboard = custom.canViewDashboard ?? (currentUserRole !== 'employee');

  const roleLabel = 
    currentUserRole === 'admin' ? 'Quản trị viên (Admin)' :
    currentUserRole === 'accountant' ? 'Kế toán trưởng (Chief Accountant)' :
    currentUserRole === 'payroll' ? 'Kế toán tiền lương (Payroll Officer)' : 'Người lao động (Employee)';

  const roleDescription =
    currentUserRole === 'admin' ? 'Toàn quyền cấu hình hệ thống, quản lý tài khoản & phân quyền, phê duyệt lương.' :
    currentUserRole === 'accountant' ? 'Phê duyệt bảng lương, chốt chi, xem báo cáo tài chính & thuế TNCN, xuất dữ liệu.' :
    currentUserRole === 'payroll' ? 'Chấm công, tính lương, cập nhật BHXH, phụ cấp, giảm trừ và in phiếu lương.' :
    'Xem bảng chấm công, phiếu lương chi tiết và thuế cá nhân của mình.';

  return (
    <AuthRoleContext.Provider
      value={{
        users,
        currentUser,
        isAuthenticated: !!currentUser,
        authMode,
        validateCredentials,
        login,
        logout,
        resetOfficialAdminPassword,
        switchUser,
        addUser,
        updateUser,
        deleteUser,

        currentUserRole,
        setCurrentUserRole,
        selectedEmployeeIdForSelf,
        setSelectedEmployeeIdForSelf,

        canEditSettings,
        canEditEmployees,
        canEditTimekeeping,
        canApprovePayroll,
        canExportData,

        canViewDashboard,
        canViewEmployees,
        canViewTimekeeping,
        canViewInsurance,
        canEditInsurance,
        canViewDependents,
        canEditDependents,
        canViewMeal,
        canEditMeal,
        canViewAllowances,
        canEditAllowances,
        canViewPayroll,
        canEditPayroll,
        canViewTaxReport,
        canSyncGoogleSheets,
        canManageUsers,

        roleLabel,
        roleDescription
      }}
    >
      {children}
    </AuthRoleContext.Provider>
  );
};

export const useAuthRole = () => {
  const context = useContext(AuthRoleContext);
  if (!context) {
    throw new Error('useAuthRole must be used within an AuthRoleProvider');
  }
  return context;
};
