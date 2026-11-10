import React, { useState, useMemo } from 'react';
import { 
  FileSpreadsheet, 
  Printer, 
  Download, 
  Search, 
  CheckCircle2, 
  Clock, 
  Filter, 
  CreditCard, 
  ShieldCheck, 
  Receipt, 
  Utensils, 
  Cloud,
  ChevronRight,
  User,
  TrendingUp,
  AlertTriangle,
  AlertCircle,
  CheckSquare,
  Square,
  Lock,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Save
} from 'lucide-react';
import { 
  PayrollRecord, 
  Employee, 
  SystemSettings, 
  PaymentStatus, 
  GoogleSyncState 
} from '../types';
import { formatVND, isEmployeeActiveInMonth } from '../utils/payrollCalculator';
import { exportPayrollToExcel } from '../utils/excelHelper';
import { useAuthRole } from '../context/AuthRoleContext';

type PayrollSortField = 'default_employee_order' | 'employeeCode' | 'fullName' | 'idCardNumber' | 'department' | 'netSalary';

interface PayrollViewProps {
  payrolls: PayrollRecord[];
  employees: Employee[];
  settings: SystemSettings;
  syncState: GoogleSyncState;
  onOpenSync: () => void;
  onPrintPayroll: (departmentId?: string) => void;
  onPrintSlip: (employeeId?: string, initialSelectedIds?: string[]) => void;
  onUpdatePayrollStatus: (payrollId: string, status: PaymentStatus) => void;
  onUpdateAdvancePayment: (payrollId: string, amount: number) => void;
  onNavigateToAnnual?: () => void;
  onReorderEmployees?: (newEmployees: Employee[]) => void;
}

export const PayrollView: React.FC<PayrollViewProps> = ({
  payrolls,
  employees,
  settings,
  syncState,
  onOpenSync,
  onPrintPayroll,
  onPrintSlip,
  onUpdatePayrollStatus,
  onUpdateAdvancePayment,
  onNavigateToAnnual,
  onReorderEmployees
}) => {
  const { canApprovePayroll, canExportData, canEditEmployees, currentUserRole, selectedEmployeeIdForSelf } = useAuthRole();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [sortField, setSortField] = useState<PayrollSortField>('default_employee_order');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [advanceModal, setAdvanceModal] = useState<{ id: string; name: string; amount: number } | null>(null);
  const [selectedEmpIds, setSelectedEmpIds] = useState<Set<string>>(new Set());

  const empMap = new Map((employees || []).map(e => [e.id, e]));
  const depMap = new Map((settings?.departments || []).map(d => [d.id, d.name]));
  const posMap = new Map((settings?.positions || []).map(p => [p.id, p.name]));

  // Bản đồ chỉ số vị trí người lao động chuẩn tại Danh sách người lao động
  const empOrderMap = useMemo(() => {
    const map = new Map<string, number>();
    (employees || []).forEach((emp, index) => {
      map.set(emp.id, index);
    });
    return map;
  }, [employees]);

  // Tập hợp các số CCCD bị trùng lặp giữa các nhân viên khác nhau
  const duplicateIdCards = useMemo(() => {
    const counts = new Map<string, number>();
    employees.forEach(e => {
      const cccd = (e.idCardNumber || '').trim();
      if (cccd) {
        counts.set(cccd, (counts.get(cccd) || 0) + 1);
      }
    });
    const dupSet = new Set<string>();
    counts.forEach((cnt, cccd) => {
      if (cnt > 1) dupSet.add(cccd);
    });
    return dupSet;
  }, [employees]);

  // Nếu là vai trò Employee, chỉ xem phiếu lương của chính mình
  const displayPayrolls = currentUserRole === 'employee'
    ? payrolls.filter(p => p.employeeId === selectedEmployeeIdForSelf)
    : payrolls.filter(p => {
        const emp = empMap.get(p.employeeId);
        if (!emp || !isEmployeeActiveInMonth(emp, settings.currentMonth, settings.currentYear)) {
          return false;
        }
        const search = searchTerm.toLowerCase();
        const matchSearch = emp.fullName.toLowerCase().includes(search) || emp.employeeCode.toLowerCase().includes(search);
        const matchDep = filterDepartment === 'all' || emp.departmentId === filterDepartment;
        const matchStatus = filterStatus === 'all' || p.paymentStatus === filterStatus;
        return matchSearch && matchDep && matchStatus;
      });

  // Sắp xếp các bản ghi bảng lương: Mặc định theo đúng vị trí của người lao động trong Danh sách người lao động
  const sortedPayrolls = useMemo(() => {
    return [...displayPayrolls].sort((a, b) => {
      if (sortField === 'default_employee_order') {
        const orderA = empOrderMap.get(a.employeeId) ?? 999999;
        const orderB = empOrderMap.get(b.employeeId) ?? 999999;
        return orderA - orderB;
      }
      const empA = empMap.get(a.employeeId);
      const empB = empMap.get(b.employeeId);
      if (!empA || !empB) return 0;
      let cmp = 0;
      if (sortField === 'employeeCode') {
        cmp = empA.employeeCode.localeCompare(empB.employeeCode, 'vi', { numeric: true });
      } else if (sortField === 'fullName') {
        cmp = empA.fullName.localeCompare(empB.fullName, 'vi');
      } else if (sortField === 'idCardNumber') {
        cmp = (empA.idCardNumber || '').localeCompare(empB.idCardNumber || '', 'vi', { numeric: true });
      } else if (sortField === 'department') {
        const depA = depMap.get(empA.departmentId) || '';
        const depB = depMap.get(empB.departmentId) || '';
        cmp = depA.localeCompare(depB, 'vi');
      } else if (sortField === 'netSalary') {
        cmp = a.netSalary - b.netSalary;
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [displayPayrolls, sortField, sortDirection, empOrderMap, empMap, depMap]);

  // Thay đổi vị trí người lao động đồng bộ với Danh sách người lao động
  const handleMoveEmployee = (empId: string, direction: 'up' | 'down') => {
    const currentIndex = employees.findIndex(e => e.id === empId);
    if (currentIndex === -1) return;
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= employees.length) return;

    const newEmployees = [...employees];
    const [moved] = newEmployees.splice(currentIndex, 1);
    newEmployees.splice(targetIndex, 0, moved);

    setSortField('default_employee_order');
    onReorderEmployees?.(newEmployees);
  };

  const handleSaveCurrentSortAsDefault = () => {
    if (!onReorderEmployees) return;
    const sortedIds = sortedPayrolls.map(p => p.employeeId);
    const remaining = employees.filter(e => !sortedIds.includes(e.id));
    const newEmployees = [
      ...sortedIds.map(id => empMap.get(id)!).filter(Boolean),
      ...remaining
    ];
    onReorderEmployees(newEmployees);
    setSortField('default_employee_order');
  };

  // Totals
  const totalBase = payrolls.reduce((s, p) => s + p.baseSalary, 0);
  const totalGross = payrolls.reduce((s, p) => s + p.grossIncome, 0);
  const totalInsurance = payrolls.reduce((s, p) => s + p.totalInsuranceEmp, 0);
  const totalTax = payrolls.reduce((s, p) => s + p.personalIncomeTax, 0);
  const totalNet = payrolls.reduce((s, p) => s + p.netSalary, 0);

  const handleExportExcel = () => {
    exportPayrollToExcel(sortedPayrolls, employees, settings, `${settings.currentMonth}_${settings.currentYear}`);
  };

  const handleSaveAdvance = () => {
    if (!advanceModal) return;
    onUpdateAdvancePayment(advanceModal.id, advanceModal.amount);
    setAdvanceModal(null);
  };

  return (
    <div className="space-y-6">
      {/* Top Header Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight">
            Bảng Thanh Toán Lương & Thu Nhập Chi Tiết
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Tháng {settings.currentMonth}/{settings.currentYear} • Tự động tính toán theo 7 bậc thuế lũy tiến & trích trừ bảo hiểm xã hội 10.5%
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onOpenSync}
            className={`flex items-center gap-1.5 px-3 py-2 font-semibold text-xs rounded-xl transition-colors cursor-pointer ${
              syncState.isDemoMode 
                ? 'bg-rose-50 text-rose-800 border border-rose-200 hover:bg-rose-100'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
            title={syncState.isDemoMode ? "Đã khóa đồng bộ Google Sheets do đang dùng dữ liệu mẫu" : "Đồng bộ trực tiếp lên Google Sheets"}
          >
            {syncState.isDemoMode ? <Lock className="w-4 h-4 text-rose-600" /> : <Cloud className="w-4 h-4 text-emerald-600" />}
            <span>{syncState.isDemoMode ? 'Khóa Đồng Bộ' : 'Đồng Bộ Sheets'}</span>
          </button>

          {canExportData && (
            <button
              onClick={handleExportExcel}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-semibold text-xs rounded-xl transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4 text-emerald-600" />
              <span>Xuất Excel</span>
            </button>
          )}

          <button
            onClick={() => onPrintSlip(undefined, selectedEmpIds.size > 0 ? Array.from(selectedEmpIds) : undefined)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
            title="In phiếu lương hàng loạt (có chức năng chọn người lao động cần in)"
          >
            <Printer className="w-4 h-4 text-emerald-400" />
            <span>
              {selectedEmpIds.size > 0 ? `In Phiếu Lương Hàng Loạt (${selectedEmpIds.size})` : 'In Phiếu Lương Hàng Loạt'}
            </span>
          </button>

          <button
            onClick={() => onPrintPayroll(filterDepartment !== 'all' ? filterDepartment : undefined)}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>In Bảng Lương (A4)</span>
          </button>

          {onNavigateToAnnual && (
            <button
              onClick={onNavigateToAnnual}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 font-semibold text-xs rounded-xl transition-colors cursor-pointer"
              title="Xem Báo Cáo Lương Toàn Bộ Lao Động Cả Năm"
            >
              <TrendingUp className="w-4 h-4 text-indigo-600" />
              <span>Báo Cáo Năm</span>
            </button>
          )}
        </div>
      </div>

      {/* Banner thông báo tháng chưa chấm công */}
      {totalGross === 0 && payrolls.length > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-300 text-amber-950 rounded-2xl text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-black text-sm text-amber-900">
                Tháng {settings.currentMonth}/{settings.currentYear} chưa được chấm công
              </div>
              <p className="text-amber-800 text-xs mt-0.5">
                Bảng thanh toán lương tháng này chưa phát sinh ngày công thực tế (Tổng Gross = 0 đ). Vui lòng chuyển sang mục <strong>"Bảng Chấm Công"</strong> để thực hiện chấm công và nhấn <strong>"Cập Nhật Bảng Chấm Công"</strong>.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-slate-500 font-semibold uppercase tracking-wider block">Tổng Lương Cơ Bản</span>
          <div className="text-lg font-black font-mono text-slate-900 mt-1">
            {formatVND(totalBase)}
          </div>
          <span className="text-slate-400 mt-0.5 block">{payrolls.length} nhân sự</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-slate-500 font-semibold uppercase tracking-wider block">Tổng Thu Nhập (Gross)</span>
          <div className="text-lg font-black font-mono text-slate-900 mt-1">
            {formatVND(totalGross)}
          </div>
          <span className="text-slate-400 mt-0.5 block">Bao gồm OT & Phụ cấp</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-slate-500 font-semibold uppercase tracking-wider block">Trích Nộp BHXH (10.5%)</span>
          <div className="text-lg font-black font-mono text-red-600 mt-1">
            -{formatVND(totalInsurance)}
          </div>
          <span className="text-slate-400 mt-0.5 block">BHXH, BHYT, BHTN</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-slate-500 font-semibold uppercase tracking-wider block">Thuế TNCN Phải Nộp</span>
          <div className="text-lg font-black font-mono text-red-600 mt-1">
            -{formatVND(totalTax)}
          </div>
          <span className="text-slate-400 mt-0.5 block">Biểu thuế 7 bậc</span>
        </div>

        <div className="bg-gradient-to-br from-emerald-600 to-teal-700 text-white p-4 rounded-xl shadow-xs">
          <span className="text-emerald-100 font-semibold uppercase tracking-wider block">TỔNG THỰC LĨNH (NET)</span>
          <div className="text-xl font-black font-mono mt-1 text-white tracking-tight">
            {formatVND(totalNet)}
          </div>
          <span className="text-emerald-200 text-[11px] mt-0.5 block">Ngân sách chi trả thực tế</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      {currentUserRole !== 'employee' && (
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs grid grid-cols-1 md:grid-cols-5 gap-3 text-xs">
          <div className="md:col-span-2 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Tìm theo Tên nhân viên, Mã NV..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <select
              value={filterDepartment}
              onChange={e => setFilterDepartment(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            >
              <option value="all">Tất cả phòng ban</option>
              {(settings?.departments || []).map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="draft">Dự thảo</option>
              <option value="approved">Đã duyệt bảng lương</option>
              <option value="paid">Đã chuyển khoản</option>
            </select>
          </div>

          <div>
            <select
              value={sortField}
              onChange={e => setSortField(e.target.value as PayrollSortField)}
              className="w-full px-3 py-2 border border-emerald-300 bg-emerald-50/60 rounded-lg font-semibold text-emerald-950 focus:ring-2 focus:ring-emerald-500 focus:outline-none cursor-pointer"
            >
              <option value="default_employee_order">Thứ tự: Theo Danh sách người lao động</option>
              <option value="employeeCode">Sắp xếp theo Mã nhân viên</option>
              <option value="fullName">Sắp xếp theo Họ và tên</option>
              <option value="idCardNumber">Sắp xếp theo Số CCCD</option>
              <option value="department">Sắp xếp theo Phòng ban</option>
              <option value="netSalary">Sắp xếp theo Thực lĩnh (Net)</option>
            </select>
          </div>
        </div>
      )}

      {/* Banner Lưu thứ tự sắp xếp sang Danh sách người lao động */}
      {sortField !== 'default_employee_order' && canEditEmployees && onReorderEmployees && (
        <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs text-blue-900 animate-in fade-in">
          <div className="flex items-center gap-2">
            <ArrowUpDown className="w-4 h-4 text-blue-600 shrink-0" />
            <span>
              Đang xem bảng lương sắp xếp theo: <strong>{
                sortField === 'employeeCode' ? 'Mã nhân viên' :
                sortField === 'fullName' ? 'Họ và tên' :
                sortField === 'idCardNumber' ? 'Số CCCD' :
                sortField === 'department' ? 'Phòng ban' : 'Thực lĩnh (Net)'
              }</strong>.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSaveCurrentSortAsDefault}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-2xs transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Lưu thứ tự này làm vị trí mặc định cho Danh sách NV</span>
            </button>
            <button
              type="button"
              onClick={() => setSortField('default_employee_order')}
              className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-semibold rounded-lg transition-colors cursor-pointer"
            >
              Đặt lại theo Danh sách NV
            </button>
          </div>
        </div>
      )}

      {/* Batch Selection Banner */}
      {selectedEmpIds.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-emerald-50 border border-emerald-300 p-3.5 rounded-2xl text-xs text-emerald-950 shadow-xs">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-emerald-600 text-white rounded-lg shadow-2xs">
              <CheckSquare className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-emerald-950">
                Đã chọn {selectedEmpIds.size} / {sortedPayrolls.length} người lao động
              </span>
              <span className="text-emerald-700 ml-1.5 hidden sm:inline">
                để in phiếu lương hoặc xuất dữ liệu
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => onPrintSlip(undefined, Array.from(selectedEmpIds))}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>In {selectedEmpIds.size} Phiếu Lương Này</span>
            </button>
            <button
              onClick={() => {
                if (selectedEmpIds.size === sortedPayrolls.length) {
                  setSelectedEmpIds(new Set());
                } else {
                  setSelectedEmpIds(new Set(sortedPayrolls.map(p => p.employeeId)));
                }
              }}
              className="px-3 py-1.5 bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl font-semibold transition-colors cursor-pointer"
            >
              {selectedEmpIds.size === sortedPayrolls.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả đang lọc'}
            </button>
            <button
              onClick={() => setSelectedEmpIds(new Set())}
              className="px-2 py-1.5 text-slate-500 hover:text-slate-800 underline transition-colors cursor-pointer"
            >
              Hủy chọn
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-100 text-slate-700 uppercase font-bold border-b border-slate-300">
              <tr>
                <th className="w-10 px-3 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={sortedPayrolls.length > 0 && selectedEmpIds.size === sortedPayrolls.length}
                    onChange={() => {
                      if (selectedEmpIds.size === sortedPayrolls.length) {
                        setSelectedEmpIds(new Set());
                      } else {
                        setSelectedEmpIds(new Set(sortedPayrolls.map(p => p.employeeId)));
                      }
                    }}
                    title="Chọn / Bỏ chọn tất cả lao động đang hiển thị"
                    className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                  />
                </th>
                <th className="px-3 py-3">Mã NV / Vị Trí</th>
                <th className="px-3 py-3">Số CCCD</th>
                <th className="px-3 py-3">Họ và Tên</th>
                <th className="px-3 py-3">Phòng Ban</th>
                <th className="px-3 py-3">Hình Thức</th>
                <th className="px-3 py-3 text-right">Lương CB</th>
                <th className="px-3 py-3 text-center">Công / Giờ</th>
                <th className="px-3 py-3 text-right">Lương Chính</th>
                <th className="px-3 py-3 text-right">OT & Phụ Cấp</th>
                <th className="px-3 py-3 text-right font-black text-slate-900 bg-emerald-50">TỔNG GROSS</th>
                <th className="px-3 py-3 text-right text-red-600">
                  BHXH ({((settings.socialInsRateEmployee || 0) + (settings.healthInsRateEmployee || 0) + (settings.unemploymentInsRateEmployee || 0)).toFixed(1).replace(/\.0$/, '')}%)
                </th>
                <th className="px-3 py-3 text-right text-red-600">Thuế TNCN</th>
                <th className="px-3 py-3 text-right">Tạm Ứng</th>
                <th className="px-3 py-3 text-right font-black text-emerald-800 bg-teal-50">THỰC LĨNH (NET)</th>
                <th className="px-3 py-3 text-center">Trạng Thái</th>
                <th className="px-3 py-3 text-right">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedPayrolls.length === 0 ? (
                <tr>
                  <td colSpan={17} className="px-6 py-8 text-center text-slate-400">
                    Không có bản ghi bảng lương nào phù hợp.
                  </td>
                </tr>
              ) : (
                sortedPayrolls.map((p, pIdx) => {
                  const emp = empMap.get(p.employeeId);
                  const isDuplicateCccd = emp?.idCardNumber ? duplicateIdCards.has(emp.idCardNumber.trim()) : false;
                  const totalOtAndAllowances = p.otPayTaxable + p.otPayTaxExempt + p.taxableAllowances + p.taxExemptAllowances + p.mealAllowance;
                  const isRowSelected = selectedEmpIds.has(p.employeeId);

                  return (
                    <tr 
                      key={p.id} 
                      className={`transition-colors ${isRowSelected ? 'bg-emerald-50/70 hover:bg-emerald-50' : 'hover:bg-slate-50/80'}`}
                    >
                      <td className="w-10 px-3 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={isRowSelected}
                          onChange={() => {
                            setSelectedEmpIds(prev => {
                              const next = new Set(prev);
                              if (next.has(p.employeeId)) next.delete(p.employeeId);
                              else next.add(p.employeeId);
                              return next;
                            });
                          }}
                          title={`Chọn nhân viên ${emp?.fullName || ''}`}
                          className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                        />
                      </td>
                      <td className="px-3 py-3 font-mono">
                        <div className="flex items-center gap-1.5">
                          {canEditEmployees && onReorderEmployees && (
                            <div className="flex flex-col items-center gap-0.5 mr-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleMoveEmployee(p.employeeId, 'up')}
                                disabled={pIdx === 0}
                                title="Di chuyển lên trên (thay đổi vị trí người lao động)"
                                className="p-0.5 hover:bg-slate-200 disabled:opacity-30 disabled:pointer-events-none text-slate-400 hover:text-slate-800 rounded transition-colors cursor-pointer"
                              >
                                <ArrowUp className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleMoveEmployee(p.employeeId, 'down')}
                                disabled={pIdx === sortedPayrolls.length - 1}
                                title="Di chuyển xuống dưới (thay đổi vị trí người lao động)"
                                className="p-0.5 hover:bg-slate-200 disabled:opacity-30 disabled:pointer-events-none text-slate-400 hover:text-slate-800 rounded transition-colors cursor-pointer"
                              >
                                <ArrowDown className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                          <span className="font-bold text-slate-800">{emp?.employeeCode}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 font-mono">
                        <div className="font-semibold text-slate-900">
                          {emp?.idCardNumber || '—'}
                        </div>
                        {isDuplicateCccd && (
                          <span 
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 font-extrabold text-[9px] mt-0.5 whitespace-nowrap shadow-2xs"
                            title="Số CCCD này trùng với một lao động khác trong danh sách (khác Mã NV)"
                          >
                            <AlertTriangle className="w-2.5 h-2.5 text-amber-700" />
                            Trùng CCCD
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 font-bold text-slate-900">
                        <div className="flex items-center gap-1.5">
                          <span>{emp?.fullName}</span>
                          {p.effectiveWorkStatus === 'probation' && (
                            <span className="px-1 py-0.2 rounded bg-amber-100 text-amber-800 text-[9px] font-bold">Thử việc</span>
                          )}
                          {p.effectiveWorkStatus === 'transferred' && (
                            <span className="px-1 py-0.2 rounded bg-blue-100 text-blue-800 text-[9px] font-bold">Điều chuyển</span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 font-normal">{posMap.get(p.effectivePositionId || emp?.positionId || '')}</div>
                      </td>
                      <td className="px-3 py-3 text-slate-600">
                        {depMap.get(p.effectiveDepartmentId || emp?.departmentId || '')}
                      </td>
                      <td className="px-3 py-3">
                        <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200 whitespace-nowrap">
                          {(p.salaryBasis || emp?.salaryBasis) === 'monthly' ? 'Lương tháng' :
                           (p.salaryBasis || emp?.salaryBasis) === 'daily' ? 'Ngày công' :
                           (p.salaryBasis || emp?.salaryBasis) === 'hourly' ? 'Theo giờ' :
                           (p.salaryBasis || emp?.salaryBasis) === 'percent' ? `${emp?.salaryPercent || 100}% KPI` :
                           'Bộ phận'}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right font-mono font-medium">
                        <div>{formatVND(p.baseSalary)}</div>
                        {emp?.salaryBasis === 'hourly' && (
                          <div className="text-[10px] text-emerald-600 font-bold">
                            {formatVND(p.hourlyRateApplied || emp.hourlyRate || 0)}/h
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {emp?.salaryBasis === 'hourly' ? (
                          <div>
                            <span className="font-mono font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
                              {p.actualWorkHours ?? p.actualPaidDays * 8}h
                            </span>
                            <div className="text-[10px] text-slate-400 font-medium mt-0.5">({p.actualPaidDays} công)</div>
                          </div>
                        ) : emp?.salaryBasis === 'daily' ? (
                          <div>
                            <span className="font-bold text-emerald-800 font-mono text-sm">{p.actualPaidDays}</span>
                            <div className="text-[10px] text-slate-500 font-medium">ngày công</div>
                          </div>
                        ) : emp?.salaryBasis === 'percent' ? (
                          <div>
                            <span className="font-bold text-emerald-800 font-mono">{p.actualPaidDays}</span>
                            <span className="text-[10px] text-slate-400">/{p.standardDays}</span>
                            <div className="text-[10px] text-blue-600 font-semibold">{emp.salaryPercent || 100}% KPI</div>
                          </div>
                        ) : (
                          <div>
                            <span className="font-bold text-emerald-700 font-mono">{p.actualPaidDays}</span>
                            <span className="text-[10px] text-slate-400">/{p.standardDays}</span>
                          </div>
                        )}
                      </td>

                      <td className="px-3 py-3 text-right font-mono">
                        {formatVND(p.mainSalary)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-slate-700">
                        {formatVND(totalOtAndAllowances)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono font-bold bg-emerald-50 text-slate-900">
                        {formatVND(p.grossIncome)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-red-600">
                        -{formatVND(p.totalInsuranceEmp)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono font-bold text-red-600">
                        {p.personalIncomeTax > 0 ? `-${formatVND(p.personalIncomeTax)}` : '0 đ'}
                      </td>
                      <td className="px-3 py-3 text-right font-mono">
                        {canApprovePayroll ? (
                          <button
                            onClick={() => setAdvanceModal({ id: p.id, name: emp?.fullName || '', amount: p.advancePayment })}
                            className="text-blue-600 hover:underline cursor-pointer"
                          >
                            {p.advancePayment > 0 ? `-${formatVND(p.advancePayment)}` : '0 đ'}
                          </button>
                        ) : (
                          p.advancePayment > 0 ? `-${formatVND(p.advancePayment)}` : '-'
                        )}
                      </td>
                      <td className="px-3 py-3 text-right font-mono font-black text-sm text-emerald-800 bg-teal-50">
                        {formatVND(p.netSalary)}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                          p.paymentStatus === 'paid' ? 'bg-emerald-100 text-emerald-800' :
                          p.paymentStatus === 'approved' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {p.paymentStatus === 'paid' ? 'Đã thanh toán' :
                           p.paymentStatus === 'approved' ? 'Đã duyệt' : 'Dự thảo'}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => onPrintSlip(p.employeeId)}
                            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold rounded text-[11px] cursor-pointer"
                            title="In phiếu lương cá nhân"
                          >
                            Phiếu Lương
                          </button>

                          {canApprovePayroll && (
                            <select
                              value={p.paymentStatus}
                              onChange={e => onUpdatePayrollStatus(p.id, e.target.value as PaymentStatus)}
                              className="px-1.5 py-1 border border-slate-300 rounded text-[10px] font-semibold"
                            >
                              <option value="draft">Dự thảo</option>
                              <option value="approved">Duyệt</option>
                              <option value="paid">Đã chuyển khoản</option>
                            </select>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Advance Payment Modal */}
      {advanceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-4 border border-slate-200 text-xs">
            <h3 className="text-base font-bold text-slate-900 border-b border-slate-200 pb-2">
              Khấu Trừ Tạm Ứng Trong Tháng
            </h3>
            <p className="text-slate-600">
              Nhân viên: <strong className="text-slate-900">{advanceModal.name}</strong>
            </p>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Số tiền đã tạm ứng (VNĐ):</label>
              <input
                type="number"
                step={100000}
                value={advanceModal.amount}
                onChange={e => setAdvanceModal({ ...advanceModal, amount: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono font-bold text-slate-900"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setAdvanceModal(null)}
                className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg"
              >
                Hủy
              </button>
              <button
                onClick={handleSaveAdvance}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg shadow-xs"
              >
                Cập Nhật
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
