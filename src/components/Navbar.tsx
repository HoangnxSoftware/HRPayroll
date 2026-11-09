import React from 'react';
import { 
  Building2, 
  ShieldCheck, 
  Cloud, 
  Calendar, 
  ExternalLink, 
  UserCircle2, 
  ChevronDown,
  Menu,
  CheckCircle2,
  FileSpreadsheet,
  LogIn,
  Lock,
  AlertTriangle,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react';
import { SystemSettings, GoogleSyncState, UserRole, Employee } from '../types';
import { useAuthRole } from '../context/AuthRoleContext';
import { UserProfileMenu } from './UserProfileMenu';
import { getAvailableYears } from '../utils/payrollCalculator';

interface NavbarProps {
  settings: SystemSettings;
  syncState: GoogleSyncState;
  onOpenSync: () => void;
  onToggleSidebar: () => void;
  isSidebarCollapsed?: boolean;
  onToggleSidebarCollapse?: () => void;
  employees: Employee[];
  onMonthChange: (month: number, year: number) => void;
  onOpenUserManagement: () => void;
  onOpenChangePassword: () => void;
  onOpenLoginModal: () => void;
  onRequestLogout?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  settings,
  syncState,
  onOpenSync,
  onToggleSidebar,
  isSidebarCollapsed = false,
  onToggleSidebarCollapse,
  employees,
  onMonthChange,
  onOpenUserManagement,
  onOpenChangePassword,
  onOpenLoginModal,
  onRequestLogout
}) => {
  const { 
    currentUser,
    currentUserRole, 
    setCurrentUserRole, 
    selectedEmployeeIdForSelf, 
    setSelectedEmployeeIdForSelf, 
    roleLabel 
  } = useAuthRole();

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-2xs">
      <div className="px-3 sm:px-4 lg:px-6 py-2.5 flex items-center justify-between gap-3 sm:gap-4">
        {/* Left: Mobile Toggle, Desktop Toggle & Brand Unit */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            onClick={onToggleSidebar}
            className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl lg:hidden cursor-pointer shrink-0"
            title="Mở menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          {onToggleSidebarCollapse && (
            <button
              onClick={onToggleSidebarCollapse}
              title={isSidebarCollapsed ? "Mở rộng thanh menu (Ctrl+B)" : "Thu gọn menu để mở rộng tối đa không gian làm việc (Ctrl+B)"}
              className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-200/80 rounded-xl cursor-pointer transition-colors shrink-0"
            >
              {isSidebarCollapsed ? (
                <>
                  <PanelLeftOpen className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="font-semibold text-[11px] text-slate-700">Mở rộng menu</span>
                </>
              ) : (
                <>
                  <PanelLeftClose className="w-4 h-4 text-slate-500 shrink-0" />
                  <span className="font-semibold text-[11px] text-slate-600">Thu gọn</span>
                </>
              )}
            </button>
          )}

          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-xs shrink-0">
              <Building2 className="w-4.5 h-4.5 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="font-extrabold text-slate-900 text-sm sm:text-base leading-tight truncate">
                  {settings.companyName}
                </h1>
                <span className="hidden sm:inline-block px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-full shrink-0">
                  MST: {settings.taxCode}
                </span>
              </div>
              <div className="text-[11px] text-slate-500 hidden md:block truncate">
                Phần mềm Quản lý Tiền lương & Nhân sự Doanh nghiệp
              </div>
            </div>
          </div>
        </div>

        {/* Right: Controls & Security Role */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Month / Year selector */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-semibold text-slate-700">
            <Calendar className="w-3.5 h-3.5 text-slate-500 ml-1.5 mr-1" />
            <select
              value={settings.currentMonth}
              onChange={e => onMonthChange(Number(e.target.value), settings.currentYear)}
              className="bg-transparent border-none text-xs font-bold text-slate-900 focus:outline-none cursor-pointer pr-1"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                <option key={m} value={m}>Tháng {m}</option>
              ))}
            </select>
            <span className="text-slate-400">/</span>
            <select
              value={settings.currentYear}
              onChange={e => {
                if (e.target.value === 'custom') {
                  const input = window.prompt('Nhập năm làm việc muốn chuyển tới (VD: 2022, 2030):', String(settings.currentYear));
                  const yr = parseInt(input || '', 10);
                  if (yr >= 1990 && yr <= 2100) {
                    onMonthChange(settings.currentMonth, yr);
                  }
                  return;
                }
                onMonthChange(settings.currentMonth, Number(e.target.value));
              }}
              className="bg-transparent border-none text-xs font-bold text-slate-900 focus:outline-none cursor-pointer pl-1"
            >
              {getAvailableYears(settings.currentYear).map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
              <option value="custom">+ Năm khác...</option>
            </select>
          </div>

          {/* Google Sheets Sync Pill */}
          {currentUserRole !== 'employee' && (
            <button
              onClick={onOpenSync}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                syncState.isDemoMode
                  ? 'bg-red-50 text-red-800 border-red-300 hover:bg-red-100'
                  : syncState.isConnected
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                    : 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
              }`}
              title={
                syncState.isDemoMode
                  ? 'Dữ liệu mẫu nội bộ: Đã KHÓA đồng bộ Google Sheets để bảo vệ cơ sở dữ liệu'
                  : syncState.isConnected 
                    ? `Google Sheets: ${syncState.spreadsheetName || syncState.userEmail}` 
                    : 'Kết nối Google Sheets'
              }
            >
              {syncState.isDemoMode ? <Lock className="w-3.5 h-3.5 text-red-600" /> : <Cloud className="w-3.5 h-3.5" />}
              <span className="hidden md:inline max-w-[160px] truncate">
                {syncState.isDemoMode 
                  ? 'Dữ liệu mẫu (Khóa sync)' 
                  : syncState.isConnected 
                    ? (syncState.spreadsheetName || 'Google Sheets') 
                    : 'Lưu Google Drive'}
              </span>
              <span className={`w-2 h-2 rounded-full ${syncState.isDemoMode ? 'bg-red-500 ring-2 ring-red-200' : syncState.isConnected ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
            </button>
          )}

          {/* If Employee mode and has multiple staff options, allow switching employee preview */}
          {currentUserRole === 'employee' && (
            <select
              value={selectedEmployeeIdForSelf}
              onChange={e => setSelectedEmployeeIdForSelf(e.target.value)}
              className="px-2 py-1.5 bg-emerald-50 border border-emerald-300 rounded-xl text-xs font-bold text-emerald-900 focus:outline-none cursor-pointer max-w-[130px]"
              title="Chọn nhân viên để xem phiếu lương"
            >
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.fullName}</option>
              ))}
            </select>
          )}

          {/* User Profile & RBAC Dropdown Menu */}
          <div className="pl-1 border-l border-slate-200">
            <UserProfileMenu
              onOpenUserManagement={onOpenUserManagement}
              onOpenChangePassword={onOpenChangePassword}
              onOpenLoginModal={onOpenLoginModal}
              onRequestLogout={onRequestLogout}
            />
          </div>
        </div>
      </div>
    </header>
  );
};

