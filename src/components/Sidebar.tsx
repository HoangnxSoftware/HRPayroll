import React from 'react';
import { 
  LayoutDashboard, 
  Settings, 
  Users, 
  UserCheck, 
  ShieldCheck, 
  Utensils, 
  Gift, 
  CalendarCheck, 
  FileSpreadsheet, 
  Receipt, 
  Cloud,
  X,
  UserCog,
  LogOut,
  TrendingUp,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { useAuthRole } from '../context/AuthRoleContext';

interface SidebarProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  onOpenSyncModal: () => void;
  onRequestLogout?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  isOpenMobile,
  onCloseMobile,
  onOpenSyncModal,
  onRequestLogout,
  isCollapsed = false,
  onToggleCollapse
}) => {
  const { 
    currentUserRole, 
    roleLabel, 
    canManageUsers,
    canViewPayroll,
    canViewTimekeeping,
    canViewEmployees,
    canViewInsurance,
    canViewDependents,
    canViewMeal,
    canViewAllowances,
    canViewTaxReport,
    canEditSettings
  } = useAuthRole();

  // Danh mục điều hướng động theo vai trò (RBAC Navigation)
  let navItems: { id: string; label: string; icon: any }[] = [];

  if (currentUserRole === 'employee') {
    navItems = [
      { id: 'my_payslip', label: 'Phiếu Lương Của Tôi', icon: FileSpreadsheet },
      { id: 'timekeeping', label: 'Bảng Công Cá Nhân', icon: CalendarCheck },
    ];
  } else {
    navItems = [
      { id: 'dashboard', label: 'Tổng Quan Bảng Lương', icon: LayoutDashboard },
      canViewPayroll ? { id: 'payroll', label: 'Bảng Thanh Toán Lương', icon: FileSpreadsheet } : null,
      canViewPayroll ? { id: 'annual_payroll', label: 'Báo Cáo Lương Cả Năm', icon: TrendingUp } : null,
      canViewTimekeeping ? { id: 'timekeeping', label: 'Bảng Chấm Công & OT', icon: CalendarCheck } : null,
      canViewEmployees ? { id: 'employees', label: 'Danh Sách Người Lao Động', icon: Users } : null,
      canViewInsurance ? { id: 'insurance', label: 'Bảo Hiểm Xã Hội (BHXH)', icon: ShieldCheck } : null,
      canViewDependents ? { id: 'dependents', label: 'Người Phụ Thuộc (Thuế)', icon: UserCheck } : null,
      canViewMeal ? { id: 'meal', label: 'Đăng Ký Ăn Ca / Trưa', icon: Utensils } : null,
      canViewAllowances ? { id: 'allowances', label: 'Phụ Cấp Đặc Thù', icon: Gift } : null,
      canViewTaxReport ? { id: 'tax', label: 'Báo Cáo Thuế TNCN', icon: Receipt } : null,
      canManageUsers ? { id: 'users', label: 'Phân Quyền & Người Dùng', icon: UserCog } : null,
      canEditSettings ? { id: 'settings', label: 'Cài Đặt Hệ Thống', icon: Settings } : null,
    ].filter(Boolean) as { id: string; label: string; icon: any }[];
  }

  const handleItemClick = (id: string) => {
    onSelectTab(id);
    onCloseMobile();
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpenMobile && (
        <div 
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-black/50 lg:hidden backdrop-blur-2xs"
        />
      )}

      {/* Sidebar Container */}
      <aside className={`
        fixed top-0 bottom-0 left-0 z-50 bg-slate-900 text-slate-300 flex flex-col transition-all duration-200 ease-in-out lg:static lg:translate-x-0
        ${isOpenMobile ? 'translate-x-0' : '-translate-x-full'}
        ${isCollapsed ? 'w-72 lg:w-20' : 'w-72'}
      `}>
        {/* Brand Top Header */}
        <div className={`border-b border-slate-800 flex items-center ${
          isCollapsed ? 'p-3.5 justify-center' : 'p-5 justify-between'
        }`}>
          {!isCollapsed ? (
            <>
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-emerald-500 flex items-center justify-center text-slate-950 font-black shrink-0">
                  L
                </div>
                <div className="min-w-0">
                  <span className="font-extrabold text-white text-base tracking-tight block truncate">PAYROLL PRO</span>
                  <span className="text-[11px] text-emerald-400 font-medium block truncate">Hệ thống Tiền lương & Thuế</span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {onToggleCollapse && (
                  <button 
                    onClick={onToggleCollapse}
                    title="Thu gọn menu để mở rộng không gian làm việc (Ctrl+B)"
                    className="hidden lg:flex p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                )}
                <button 
                  onClick={onCloseMobile}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg lg:hidden cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </>
          ) : (
            <button
              onClick={onToggleCollapse}
              title="Mở rộng menu để xem chi tiết (Ctrl+B)"
              className="w-10 h-10 rounded-xl bg-emerald-500 hover:bg-emerald-400 flex items-center justify-center text-slate-950 font-black shadow-xs cursor-pointer transition-transform active:scale-95 group relative"
            >
              <span className="group-hover:opacity-0 transition-opacity">L</span>
              <ChevronRight className="w-5 h-5 hidden group-hover:block absolute text-slate-950" />
            </button>
          )}
        </div>

        {/* Current Active Role Badge */}
        {!isCollapsed ? (
          <div className="px-5 py-3 bg-slate-950/60 border-b border-slate-800 text-[11px]">
            <span className="text-slate-500 block uppercase tracking-wider font-semibold">Quyền truy cập hiện tại:</span>
            <span className="font-bold text-emerald-300 mt-0.5 block truncate">{roleLabel}</span>
          </div>
        ) : (
          <div className="py-2.5 flex justify-center bg-slate-950/60 border-b border-slate-800" title={`Quyền truy cập: ${roleLabel}`}>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 ring-4 ring-emerald-500/20" />
          </div>
        )}

        {/* Navigation Links */}
        <nav className="flex-1 p-2.5 space-y-1 overflow-y-auto text-xs font-semibold">
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleItemClick(item.id)}
                title={item.label}
                className={`w-full flex items-center rounded-xl transition-all cursor-pointer ${
                  isCollapsed ? 'justify-center p-3' : 'gap-3 px-3.5 py-2.5 text-left'
                } ${
                  isActive
                    ? 'bg-emerald-600 text-white font-bold shadow-xs'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/70'
                }`}
              >
                <Icon className={`w-4.5 h-4.5 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                {!isCollapsed && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* Footer: Google Sheets Sync & Logout Buttons */}
        <div className={`border-t border-slate-800 bg-slate-950/40 space-y-2 ${
          isCollapsed ? 'p-2' : 'p-4'
        }`}>
          {currentUserRole !== 'employee' && (
            <button
              onClick={() => {
                onOpenSyncModal();
                onCloseMobile();
              }}
              title="Google Drive / Sheets"
              className={`w-full flex items-center justify-center bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                isCollapsed ? 'p-2.5' : 'gap-2 p-2.5'
              }`}
            >
              <Cloud className="w-4 h-4 text-emerald-400 shrink-0" />
              {!isCollapsed && <span className="truncate">Google Drive / Sheets</span>}
            </button>
          )}

          {onRequestLogout && (
            <button
              onClick={() => {
                onCloseMobile();
                onRequestLogout();
              }}
              title="Đăng xuất & Thoát"
              className={`w-full flex items-center justify-center bg-red-950/30 hover:bg-red-900/40 text-red-300 hover:text-red-200 border border-red-500/20 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                isCollapsed ? 'p-2.5' : 'gap-2 p-2'
              }`}
            >
              <LogOut className="w-3.5 h-3.5 shrink-0" />
              {!isCollapsed && <span className="truncate">Đăng xuất & Thoát</span>}
            </button>
          )}
        </div>
      </aside>
    </>
  );
};

