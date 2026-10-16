import React, { useState, useEffect, useMemo } from 'react';
import { 
  Utensils, 
  Download, 
  Edit2, 
  Check, 
  X, 
  Printer, 
  Calendar, 
  Users, 
  Sparkles, 
  Layers, 
  Sun, 
  Sunset, 
  Moon, 
  Clock, 
  CheckCircle2, 
  Filter,
  DollarSign,
  Search,
  CheckSquare,
  Square,
  Calculator,
  UserCheck
} from 'lucide-react';
import { MealRegistration, Employee, SystemSettings, MealType, TimekeepingRecord } from '../types';
import { formatVND, getAvailableYears } from '../utils/payrollCalculator';
import * as XLSX from 'xlsx';
import { useAuthRole } from '../context/AuthRoleContext';
import { PrintMealModal } from '../components/PrintMealModal';

interface MealViewProps {
  mealRegistrations: MealRegistration[];
  employees: Employee[];
  timekeepings: TimekeepingRecord[];
  settings: SystemSettings;
  onUpdateMeal: (updated: MealRegistration) => void;
  onBatchUpdateMeals?: (meals: MealRegistration[]) => void;
}

export const MealView: React.FC<MealViewProps> = ({
  mealRegistrations,
  employees,
  timekeepings,
  settings,
  onUpdateMeal,
  onBatchUpdateMeals
}) => {
  const { canEditEmployees, canExportData } = useAuthRole();
  const currentMonthStr = `${settings.currentYear}-${String(settings.currentMonth).padStart(2, '0')}`;
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthStr);
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);

  useEffect(() => {
    setSelectedMonth(`${settings.currentYear}-${String(settings.currentMonth).padStart(2, '0')}`);
  }, [settings.currentYear, settings.currentMonth]);

  const [selYearStr, selMonthStr] = selectedMonth.split('-');
  const selYear = Number(selYearStr) || settings.currentYear;
  const selMonth = Number(selMonthStr) || settings.currentMonth;
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);

  // Row inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{
    mealType: MealType;
    cashMethod: 'fixed' | 'by_attendance';
    ratePerMeal: number;
    monthlyAllowance: number;
    registerLunch: boolean;
    registerAfternoon: boolean;
    registerDinner: boolean;
    note: string;
  }>({
    mealType: 'canteen',
    cashMethod: 'fixed',
    ratePerMeal: settings.standardMealPerDay || 35000,
    monthlyAllowance: settings.monthlyMealFlatRate || 1200000,
    registerLunch: true,
    registerAfternoon: false,
    registerDinner: false,
    note: ''
  });

  // Batch registration modal state
  const [batchForm, setBatchForm] = useState<{
    targetType: 'all' | 'department' | 'selected';
    departmentId: string;
    mealType: MealType;
    cashMethod: 'fixed' | 'by_attendance';
    ratePerMeal: number;
    monthlyAllowance: number;
    registerLunch: boolean;
    registerAfternoon: boolean;
    registerDinner: boolean;
    note: string;
  }>({
    targetType: 'all',
    departmentId: settings.departments[0]?.id || '',
    mealType: 'canteen',
    cashMethod: 'fixed',
    ratePerMeal: settings.standardMealPerDay || 35000,
    monthlyAllowance: settings.monthlyMealFlatRate || 1200000,
    registerLunch: true,
    registerAfternoon: false,
    registerDinner: false,
    note: ''
  });

  const empMap = useMemo(() => new Map(employees.map(e => [e.id, e])), [employees]);
  const depMap = useMemo(() => new Map(settings.departments.map(d => [d.id, d.name])), [settings.departments]);
  const posMap = useMemo(() => new Map(settings.positions.map(p => [p.id, p.name])), [settings.positions]);

  // Lọc timekeeping theo tháng đang chọn
  const tkListForMonth = useMemo(() => {
    return timekeepings.filter(t => String(t.month) === selectedMonth || String(t.month) === String(settings.currentMonth));
  }, [timekeepings, selectedMonth, settings.currentMonth]);

  const tkMap = useMemo(() => new Map(tkListForMonth.map(t => [t.employeeId, t])), [tkListForMonth]);

  // Tìm bản ghi đăng ký ăn ca của nhân viên theo tháng đang chọn
  const getEmployeeMealReg = (empId: string): MealRegistration => {
    const found = mealRegistrations.find(
      m => m.employeeId === empId && (m.month === selectedMonth || (!m.month && selectedMonth === currentMonthStr))
    );
    if (found) return found;

    return {
      id: `meal-${empId}-${selectedMonth}`,
      employeeId: empId,
      month: selectedMonth,
      planType: 'registered',
      mealType: 'canteen',
      cashMethod: 'fixed',
      ratePerMeal: settings.standardMealPerDay || 35000,
      monthlyAllowance: settings.monthlyMealFlatRate || 1200000,
      registerLunch: true,
      registerAfternoon: false,
      registerDinner: false,
      note: ''
    };
  };

  const startEdit = (m: MealRegistration) => {
    setEditingId(m.id);
    const effectiveMealType = (m.mealType || (m.planType === 'registered' ? 'canteen' : m.planType) || 'canteen') as MealType;
    setEditValues({
      mealType: effectiveMealType,
      cashMethod: m.cashMethod || 'fixed',
      ratePerMeal: m.ratePerMeal ?? m.customRatePerMeal ?? settings.standardMealPerDay ?? 35000,
      monthlyAllowance: m.monthlyAllowance ?? m.monthlyFlatAmount ?? settings.monthlyMealFlatRate ?? 1200000,
      registerLunch: m.registerLunch !== undefined ? m.registerLunch : true,
      registerAfternoon: m.registerAfternoon ?? false,
      registerDinner: m.registerDinner ?? false,
      note: m.note || ''
    });
  };

  const saveEdit = (m: MealRegistration) => {
    const updated: MealRegistration = {
      ...m,
      month: selectedMonth,
      mealType: editValues.mealType,
      planType: editValues.mealType === 'canteen' ? 'registered' : editValues.mealType === 'cash' ? 'cash' : 'none',
      cashMethod: editValues.mealType === 'cash' ? editValues.cashMethod : undefined,
      ratePerMeal: Number(editValues.ratePerMeal) || 0,
      customRatePerMeal: Number(editValues.ratePerMeal) || 0,
      monthlyAllowance: Number(editValues.monthlyAllowance) || 0,
      monthlyFlatAmount: Number(editValues.monthlyAllowance) || 0,
      registerLunch: editValues.registerLunch,
      registerAfternoon: editValues.registerAfternoon,
      registerDinner: editValues.registerDinner,
      note: editValues.note
    };
    onUpdateMeal(updated);
    setEditingId(null);
  };

  // Mở modal đăng ký nhanh cho các nhân sự đã tick chọn
  const handleOpenBatchModalForSelected = () => {
    if (selectedEmployeeIds.length === 0) return;
    setBatchForm(prev => ({
      ...prev,
      targetType: 'selected'
    }));
    setIsBatchModalOpen(true);
  };

  // Áp dụng đăng ký hàng loạt theo tháng
  const handleApplyBatchRegistration = (e: React.FormEvent) => {
    e.preventDefault();
    const targetEmployees = employees.filter(e => {
      if (batchForm.targetType === 'selected') {
        return selectedEmployeeIds.includes(e.id);
      }
      if (batchForm.targetType === 'all') return true;
      return e.departmentId === batchForm.departmentId;
    });

    if (targetEmployees.length === 0) {
      alert('Không có nhân sự nào phù hợp với phạm vi áp dụng đã chọn.');
      return;
    }

    const updatedList: MealRegistration[] = targetEmployees.map(emp => {
      const existing = getEmployeeMealReg(emp.id);
      return {
        ...existing,
        month: selectedMonth,
        mealType: batchForm.mealType,
        planType: batchForm.mealType === 'canteen' ? 'registered' : batchForm.mealType === 'cash' ? 'cash' : 'none',
        cashMethod: batchForm.mealType === 'cash' ? batchForm.cashMethod : undefined,
        ratePerMeal: Number(batchForm.ratePerMeal) || 0,
        customRatePerMeal: Number(batchForm.ratePerMeal) || 0,
        monthlyAllowance: Number(batchForm.monthlyAllowance) || 0,
        monthlyFlatAmount: Number(batchForm.monthlyAllowance) || 0,
        registerLunch: batchForm.registerLunch,
        registerAfternoon: batchForm.registerAfternoon,
        registerDinner: batchForm.registerDinner,
        note: batchForm.note
      };
    });

    if (onBatchUpdateMeals) {
      onBatchUpdateMeals(updatedList);
    } else {
      updatedList.forEach(m => onUpdateMeal(m));
    }

    setIsBatchModalOpen(false);
  };

  // Lọc danh sách nhân viên theo phòng ban & tìm kiếm
  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => {
      if (selectedDepartment !== 'all' && emp.departmentId !== selectedDepartment) {
        return false;
      }
      if (searchTerm.trim()) {
        const term = searchTerm.trim().toLowerCase();
        const deptName = depMap.get(emp.departmentId)?.toLowerCase() || '';
        const posName = posMap.get(emp.positionId)?.toLowerCase() || '';
        const match = emp.fullName.toLowerCase().includes(term) ||
                      emp.employeeCode.toLowerCase().includes(term) ||
                      deptName.includes(term) ||
                      posName.includes(term);
        if (!match) return false;
      }
      return true;
    });
  }, [employees, selectedDepartment, searchTerm, depMap, posMap]);

  // Toggle selection
  const isAllFilteredSelected = filteredEmployees.length > 0 && filteredEmployees.every(e => selectedEmployeeIds.includes(e.id));
  const isSomeFilteredSelected = filteredEmployees.some(e => selectedEmployeeIds.includes(e.id)) && !isAllFilteredSelected;

  const handleToggleSelectAll = () => {
    const currentFilteredIds = filteredEmployees.map(e => e.id);
    if (isAllFilteredSelected) {
      setSelectedEmployeeIds(prev => prev.filter(id => !currentFilteredIds.includes(id)));
    } else {
      setSelectedEmployeeIds(prev => Array.from(new Set([...prev, ...currentFilteredIds])));
    }
  };

  const handleToggleSelectOne = (empId: string) => {
    setSelectedEmployeeIds(prev => 
      prev.includes(empId) ? prev.filter(id => id !== empId) : [...prev, empId]
    );
  };

  // Tính tổng số liệu theo tháng đang chọn
  let totalCanteenMealsAll = 0;
  let totalLunchMeals = 0;
  let totalAfternoonMeals = 0;
  let totalDinnerMeals = 0;
  let totalCashMealExpense = 0;
  let totalRegisteredEmployees = 0;

  filteredEmployees.forEach(emp => {
    const reg = getEmployeeMealReg(emp.id);
    const tk = tkMap.get(emp.id);
    const effectiveType = reg.mealType || (reg.planType === 'registered' ? 'canteen' : reg.planType) || 'canteen';
    const effectiveRate = reg.ratePerMeal ?? reg.customRatePerMeal ?? settings.standardMealPerDay ?? 35000;
    const effectiveAllowance = reg.monthlyAllowance ?? reg.monthlyFlatAmount ?? settings.monthlyMealFlatRate ?? 1200000;
    const actualMeals = tk?.totalMeals ?? 0;

    if (effectiveType === 'canteen') {
      const meals = actualMeals;
      totalCanteenMealsAll += meals;
      totalLunchMeals += tk?.totalMealsLunch ?? meals;
      totalAfternoonMeals += tk?.totalMealsAfternoon ?? 0;
      totalDinnerMeals += tk?.totalMealsDinner ?? 0;
      totalRegisteredEmployees++;
    } else if (effectiveType === 'cash') {
      const cashCost = reg.cashMethod === 'by_attendance' ? actualMeals * effectiveRate : effectiveAllowance;
      totalCashMealExpense += cashCost;
      totalRegisteredEmployees++;
    }
  });

  // Xuất file Excel chi tiết
  const handleExportExcel = () => {
    const rows = filteredEmployees.map((emp, idx) => {
      const reg = getEmployeeMealReg(emp.id);
      const tk = tkMap.get(emp.id);
      const effectiveMealType = reg.mealType || (reg.planType === 'registered' ? 'canteen' : reg.planType) || 'canteen';
      const effectiveRate = reg.ratePerMeal ?? reg.customRatePerMeal ?? settings.standardMealPerDay ?? 35000;
      const effectiveAllowance = reg.monthlyAllowance ?? reg.monthlyFlatAmount ?? settings.monthlyMealFlatRate ?? 1200000;
      const actualMeals = tk?.totalMeals ?? 0;

      const registeredMealsList = [];
      if (reg.registerLunch !== false) registeredMealsList.push('Trưa');
      if (reg.registerAfternoon) registeredMealsList.push('Chiều');
      if (reg.registerDinner) registeredMealsList.push('Tối');

      const cashCost = reg.cashMethod === 'by_attendance' ? actualMeals * effectiveRate : effectiveAllowance;
      const cost = effectiveMealType === 'canteen' ? actualMeals * effectiveRate :
                   effectiveMealType === 'cash' ? cashCost : 0;

      const methodLabel = effectiveMealType === 'canteen' 
        ? 'Ăn tại bếp căng tin' 
        : effectiveMealType === 'cash' 
          ? (reg.cashMethod === 'by_attendance' ? 'Nhận tiền mặt (Theo chấm công)' : 'Nhận tiền mặt (Số tự điền)')
          : 'Không ăn';

      return {
        'STT': idx + 1,
        'Mã Nhân Viên': emp.employeeCode,
        'Họ và Tên': emp.fullName,
        'Phòng Ban': depMap.get(emp.departmentId) || '',
        'Tháng Áp Dụng': selectedMonth,
        'Hình Thức': methodLabel,
        'Cách Tính Tiền Mặt': effectiveMealType === 'cash' ? (reg.cashMethod === 'by_attendance' ? 'Theo chấm công thực tế' : 'Số tự điền cố định') : '-',
        'Bữa Đăng Ký': registeredMealsList.join(', ') || 'Chưa đăng ký',
        'ĐK Ăn Trưa': reg.registerLunch !== false ? 'Có' : 'Không',
        'ĐK Ăn Chiều': reg.registerAfternoon ? 'Có' : 'Không',
        'ĐK Ăn Tối': reg.registerDinner ? 'Có' : 'Không',
        'Thực Tế Bữa Trưa (Suất)': tk?.totalMealsLunch || 0,
        'Thực Tế Bữa Chiều (Suất)': tk?.totalMealsAfternoon || 0,
        'Thực Tế Bữa Tối (Suất)': tk?.totalMealsDinner || 0,
        'Tổng Suất Ăn Thực Tế': actualMeals,
        'Đơn Giá / Suất (VNĐ)': effectiveRate,
        'Mức Tiền Khoán (VNĐ)': effectiveMealType === 'cash' ? cashCost : 0,
        'Thành Tiền Chi Phí (VNĐ)': cost,
        'Ghi Chú': reg.note || ''
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Dang_Ky_An_Ca');
    XLSX.writeFile(wb, `Dang_Ky_An_Ca_${selectedMonth}.xlsx`);
  };

  return (
    <div className="space-y-5">
      {/* Header & Month Selector */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-black text-slate-900 tracking-tight">Quản Lý Đăng Ký Ăn Ca (Trưa / Chiều / Tối)</h2>
            <span className="px-2.5 py-0.5 bg-teal-100 text-teal-800 rounded-full font-bold text-xs font-mono">
              {selectedMonth}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Đăng ký suất ăn ca linh hoạt: Ăn tại bếp hoặc nhận tiền mặt (tự điền hoặc tính theo bữa chấm công thực tế)
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Month / Year Selector */}
          <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 text-xs">
            <Calendar className="w-4 h-4 text-slate-500" />
            <span className="font-semibold text-slate-700">Kỳ Quản Lý:</span>
            <select
              value={selMonth}
              onChange={e => setSelectedMonth(`${selYear}-${String(e.target.value).padStart(2, '0')}`)}
              className="bg-transparent font-bold text-slate-900 focus:outline-none cursor-pointer pr-1"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                <option key={m} value={m}>Tháng {m}</option>
              ))}
            </select>
            <span className="text-slate-400 font-bold">/</span>
            <select
              value={selYear}
              onChange={e => {
                if (e.target.value === 'custom') {
                  const input = window.prompt('Nhập năm quản lý ăn ca (VD: 2022, 2030):', String(selYear));
                  const yr = parseInt(input || '', 10);
                  if (yr >= 1990 && yr <= 2100) {
                    setSelectedMonth(`${yr}-${String(selMonth).padStart(2, '0')}`);
                  }
                  return;
                }
                setSelectedMonth(`${Number(e.target.value)}-${String(selMonth).padStart(2, '0')}`);
              }}
              className="bg-transparent font-bold text-slate-900 focus:outline-none cursor-pointer pl-1"
            >
              {getAvailableYears(selYear).map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
              <option value="custom">+ Khác...</option>
            </select>
          </div>

          {canEditEmployees && (
            <button
              onClick={() => {
                setBatchForm(prev => ({
                  ...prev,
                  targetType: selectedEmployeeIds.length > 0 ? 'selected' : 'all'
                }));
                setIsBatchModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
              title="Đăng ký nhanh cho toàn bộ nhân sự, theo phòng ban hoặc theo nhân viên đã chọn"
            >
              <Layers className="w-4 h-4" />
              <span>Đăng Ký Nhanh Hàng Loạt</span>
            </button>
          )}

          {canExportData && (
            <>
              <button
                onClick={() => setIsPrintModalOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 font-semibold text-xs rounded-xl transition-colors cursor-pointer"
                title="In danh sách đăng ký và sử dụng suất ăn ca"
              >
                <Printer className="w-4 h-4 text-emerald-600" />
                <span>In Danh Sách</span>
              </button>

              <button
                onClick={handleExportExcel}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-semibold text-xs rounded-xl transition-colors cursor-pointer"
              >
                <Download className="w-4 h-4 text-emerald-600" />
                <span>Xuất Excel</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-slate-500 font-semibold uppercase tracking-wider block">Suất Ăn Phục Vụ Tại Bếp</span>
            <div className="text-2xl font-black font-mono text-amber-700 mt-1">
              {totalCanteenMealsAll} <span className="text-sm font-normal text-slate-500">suất</span>
            </div>
            <div className="text-[11px] text-amber-800 font-medium mt-1 flex items-center gap-2">
              <span>☀️ Trưa: <strong>{totalLunchMeals}</strong></span>
              <span>•</span>
              <span>🌤️ Chiều: <strong>{totalAfternoonMeals}</strong></span>
              <span>•</span>
              <span>🌙 Tối: <strong>{totalDinnerMeals}</strong></span>
            </div>
          </div>
          <div className="p-3 bg-amber-50 text-amber-700 rounded-xl">
            <Utensils className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-slate-500 font-semibold uppercase tracking-wider block">Chi Phí Trợ Cấp Tiền Mặt</span>
            <div className="text-2xl font-black font-mono text-emerald-700 mt-1">
              {formatVND(totalCashMealExpense)}
            </div>
            <span className="text-slate-400 mt-0.5 block">Chi trả kèm theo bảng thanh toán lương</span>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <DollarSign className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-slate-500 font-semibold uppercase tracking-wider block">Nhân Sự Đăng Ký Ăn Ca</span>
            <div className="text-2xl font-black font-mono text-blue-700 mt-1">
              {totalRegisteredEmployees} / {employees.length} <span className="text-sm font-normal text-slate-500">người</span>
            </div>
            <span className="text-blue-600 mt-0.5 block font-medium">Áp dụng trong {selectedMonth}</span>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <Users className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-slate-500 font-semibold uppercase tracking-wider block">Định Mức Miễn Thuế TNCN</span>
            <div className="text-lg font-bold text-slate-900 mt-1">
              {formatVND(settings.monthlyMealFlatRate || 1200000)} / tháng
            </div>
            <span className="text-slate-400 mt-0.5 block">Tối đa 1.200.000 đ/tháng được miễn thuế</span>
          </div>
          <div className="p-3 bg-teal-50 text-teal-600 rounded-xl">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Search, Filter & Multi-Select Action Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3 text-xs">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Tìm kiếm người lao động theo họ tên, mã NV, phòng ban, chức vụ..."
              className="w-full pl-9 pr-8 py-2 border border-slate-300 rounded-xl font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-xs bg-slate-50/50 focus:bg-white transition-all"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
                title="Xóa tìm kiếm"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Department Filter */}
            <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
              <Filter className="w-3.5 h-3.5 text-slate-500" />
              <span className="font-semibold text-slate-700">Phòng Ban:</span>
              <select
                value={selectedDepartment}
                onChange={e => setSelectedDepartment(e.target.value)}
                className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer pr-1"
              >
                <option value="all">Tất cả phòng ban ({employees.length} người)</option>
                {settings.departments.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            {(searchTerm || selectedDepartment !== 'all') && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setSelectedDepartment('all');
                }}
                className="px-2.5 py-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                title="Xóa bộ lọc"
              >
                Đặt lại lọc
              </button>
            )}

            <span className="text-slate-500 font-medium ml-1">
              Hiển thị: <strong>{filteredEmployees.length}</strong> / {employees.length} nhân sự
            </span>
          </div>
        </div>

        {/* Selected Employees Quick Action Banner */}
        {selectedEmployeeIds.length > 0 && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 bg-teal-50 border border-teal-200 rounded-xl animate-in fade-in duration-150">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-teal-600 text-white font-black text-xs flex items-center justify-center">
                {selectedEmployeeIds.length}
              </span>
              <span className="font-bold text-teal-950">
                Đã chọn {selectedEmployeeIds.length} người lao động
              </span>
              <span className="text-slate-500 text-[11px]">
                (sẵn sàng đăng ký nhanh hàng loạt bữa ăn & hình thức chi trả)
              </span>
            </div>

            <div className="flex items-center gap-2">
              {canEditEmployees && (
                <button
                  type="button"
                  onClick={handleOpenBatchModalForSelected}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-lg shadow-xs cursor-pointer text-xs transition-colors"
                >
                  <UserCheck className="w-4 h-4" />
                  <span>Đăng ký nhanh cho {selectedEmployeeIds.length} người đã chọn</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedEmployeeIds([])}
                className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg font-semibold cursor-pointer text-xs"
              >
                Bỏ chọn
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-slate-600 uppercase font-semibold border-b border-slate-200">
              <tr>
                <th className="px-3 py-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={isAllFilteredSelected}
                    ref={input => {
                      if (input) input.indeterminate = isSomeFilteredSelected;
                    }}
                    onChange={handleToggleSelectAll}
                    className="w-4 h-4 text-teal-600 rounded cursor-pointer"
                    title="Chọn hoặc bỏ chọn tất cả nhân viên đang hiển thị"
                  />
                </th>
                <th className="px-4 py-3">Mã NV</th>
                <th className="px-4 py-3">Họ và Tên</th>
                <th className="px-4 py-3">Phòng Ban</th>
                <th className="px-4 py-3">Hình Thức Đăng Ký</th>
                <th className="px-4 py-3 bg-teal-50/50 text-teal-900">Bữa Ăn Đăng Ký (Trưa/Chiều/Tối)</th>
                <th className="px-4 py-3 text-center">Bữa Thực Tế (Từ Chấm Công)</th>
                <th className="px-4 py-3 text-right">Đơn Giá / Suất</th>
                <th className="px-4 py-3 text-right">Tiền Khoán (Tiền Mặt)</th>
                <th className="px-4 py-3 text-right font-bold text-emerald-900">Chi Phí Hưởng</th>
                <th className="px-4 py-3">Ghi Chú</th>
                <th className="px-4 py-3 text-right">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-4 py-8 text-center text-slate-400">
                    Không tìm thấy nhân viên nào phù hợp với điều kiện tìm kiếm.
                  </td>
                </tr>
              ) : (
                filteredEmployees.map(emp => {
                  const reg = getEmployeeMealReg(emp.id);
                  const tk = tkMap.get(emp.id);
                  const actualMeals = tk?.totalMeals ?? 0;
                  const isEditing = editingId === reg.id;
                  const isSelected = selectedEmployeeIds.includes(emp.id);

                  const effectiveType = reg.mealType || (reg.planType === 'registered' ? 'canteen' : reg.planType) || 'canteen';
                  const effectiveRate = reg.ratePerMeal ?? reg.customRatePerMeal ?? settings.standardMealPerDay ?? 35000;
                  const effectiveAllowance = reg.monthlyAllowance ?? reg.monthlyFlatAmount ?? settings.monthlyMealFlatRate ?? 1200000;
                  const isByAttendance = reg.cashMethod === 'by_attendance';

                  const cashCost = isByAttendance ? actualMeals * effectiveRate : effectiveAllowance;
                  const currentCost = effectiveType === 'canteen' ? actualMeals * effectiveRate :
                                      effectiveType === 'cash' ? cashCost : 0;

                  return (
                    <tr 
                      key={emp.id} 
                      className={`${
                        isSelected ? "bg-teal-50/40" : isEditing ? "bg-amber-50/60" : "hover:bg-slate-50/80 transition-colors"
                      }`}
                    >
                      {/* Checkbox select */}
                      <td className="px-3 py-3.5 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelectOne(emp.id)}
                          className="w-4 h-4 text-teal-600 rounded cursor-pointer"
                        />
                      </td>

                      <td className="px-4 py-3.5 font-mono font-bold text-slate-900">{emp.employeeCode}</td>
                      <td className="px-4 py-3.5 font-bold text-slate-800">{emp.fullName}</td>
                      <td className="px-4 py-3.5 text-slate-600">{depMap.get(emp.departmentId)}</td>

                      {/* Hình thức */}
                      <td className="px-4 py-3.5">
                        {isEditing ? (
                          <select
                            value={editValues.mealType}
                            onChange={e => setEditValues({ ...editValues, mealType: e.target.value as MealType })}
                            className="px-2.5 py-1.5 border border-amber-300 rounded font-bold text-slate-800 bg-white"
                          >
                            <option value="canteen">Ăn tại bếp căng tin</option>
                            <option value="cash">Nhận tiền mặt</option>
                            <option value="none">Không đăng ký ăn</option>
                          </select>
                        ) : (
                          <div>
                            <span className={`inline-block px-2 py-0.5 rounded-full font-bold text-[11px] ${
                              effectiveType === 'canteen' ? 'bg-amber-100 text-amber-800' :
                              effectiveType === 'cash' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                            }`}>
                              {effectiveType === 'canteen' ? 'Ăn tại bếp' : effectiveType === 'cash' ? 'Tiền mặt' : 'Không ăn'}
                            </span>
                            {effectiveType === 'cash' && (
                              <span className="block text-[10px] text-emerald-700 font-semibold mt-0.5">
                                {isByAttendance ? '• Theo bữa chấm công' : '• Số tự điền cố định'}
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Bữa đăng ký (Trưa / Chiều / Tối) */}
                      <td className="px-4 py-3.5 bg-teal-50/20">
                        {isEditing ? (
                          <div className="flex items-center gap-2">
                            <label className="flex items-center gap-1 font-semibold text-slate-700 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={editValues.registerLunch}
                                onChange={e => setEditValues({ ...editValues, registerLunch: e.target.checked })}
                                className="w-3.5 h-3.5 text-emerald-600 rounded"
                              />
                              <span>☀️ Trưa</span>
                            </label>
                            <label className="flex items-center gap-1 font-semibold text-slate-700 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={editValues.registerAfternoon}
                                onChange={e => setEditValues({ ...editValues, registerAfternoon: e.target.checked })}
                                className="w-3.5 h-3.5 text-blue-600 rounded"
                              />
                              <span>🌤️ Chiều</span>
                            </label>
                            <label className="flex items-center gap-1 font-semibold text-slate-700 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={editValues.registerDinner}
                                onChange={e => setEditValues({ ...editValues, registerDinner: e.target.checked })}
                                className="w-3.5 h-3.5 text-purple-600 rounded"
                              />
                              <span>🌙 Tối</span>
                            </label>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {reg.registerLunch !== false && (
                              <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded font-semibold text-[10px]">
                                ☀️ Trưa
                              </span>
                            )}
                            {reg.registerAfternoon && (
                              <span className="px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded font-semibold text-[10px]">
                                🌤️ Chiều
                              </span>
                            )}
                            {reg.registerDinner && (
                              <span className="px-1.5 py-0.5 bg-purple-100 text-purple-800 rounded font-semibold text-[10px]">
                                🌙 Tối
                              </span>
                            )}
                            {reg.registerLunch === false && !reg.registerAfternoon && !reg.registerDinner && (
                              <span className="text-slate-400 italic">Không chọn bữa</span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Bữa thực tế từ chấm công */}
                      <td className="px-4 py-3.5 text-center">
                        <div className="font-extrabold font-mono text-slate-900">
                          {effectiveType !== 'none' ? `${actualMeals} suất` : '-'}
                        </div>
                        {effectiveType !== 'none' && (tk?.totalMealsLunch || tk?.totalMealsAfternoon || tk?.totalMealsDinner) ? (
                          <div className="text-[10px] text-teal-700 mt-0.5 font-medium">
                            Trưa: {tk.totalMealsLunch || 0} • Chiều: {tk.totalMealsAfternoon || 0} • Tối: {tk.totalMealsDinner || 0}
                          </div>
                        ) : null}
                      </td>

                      {/* Đơn giá */}
                      <td className="px-4 py-3.5 text-right font-mono">
                        {isEditing ? (
                          <input
                            type="number"
                            value={editValues.ratePerMeal}
                            onChange={e => setEditValues({ ...editValues, ratePerMeal: Number(e.target.value) })}
                            className="w-24 px-2 py-1 border border-amber-300 rounded text-right font-bold"
                            placeholder="Đơn giá"
                          />
                        ) : (
                          (effectiveType === 'canteen' || (effectiveType === 'cash' && isByAttendance)) ? (
                            formatVND(effectiveRate)
                          ) : (
                            <span className="text-slate-400 font-sans">-</span>
                          )
                        )}
                      </td>

                      {/* Tiền khoán (Tiền mặt) có 2 cách nhập */}
                      <td className="px-4 py-3.5 text-right font-mono">
                        {isEditing ? (
                          editValues.mealType === 'cash' ? (
                            <div className="space-y-1.5 text-left inline-block min-w-[200px]">
                              {/* 2 cách nhập */}
                              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-[10px]">
                                <button
                                  type="button"
                                  onClick={() => setEditValues({ ...editValues, cashMethod: 'fixed' })}
                                  className={`flex-1 py-1 px-1.5 rounded font-bold transition-all text-center cursor-pointer ${
                                    editValues.cashMethod === 'fixed'
                                      ? 'bg-white text-emerald-800 shadow-xs'
                                      : 'text-slate-600 hover:text-slate-900'
                                  }`}
                                >
                                  1. Tự điền
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditValues({ ...editValues, cashMethod: 'by_attendance' })}
                                  className={`flex-1 py-1 px-1.5 rounded font-bold transition-all text-center cursor-pointer ${
                                    editValues.cashMethod === 'by_attendance'
                                      ? 'bg-white text-emerald-800 shadow-xs'
                                      : 'text-slate-600 hover:text-slate-900'
                                  }`}
                                >
                                  2. Theo chấm công
                                </button>
                              </div>

                              {editValues.cashMethod === 'fixed' ? (
                                <div>
                                  <input
                                    type="number"
                                    value={editValues.monthlyAllowance}
                                    onChange={e => setEditValues({ ...editValues, monthlyAllowance: Number(e.target.value) })}
                                    className="w-full px-2 py-1 border border-amber-300 rounded text-right font-bold"
                                    placeholder="Số tiền tự điền"
                                  />
                                  <span className="text-[10px] text-slate-500 block text-right font-sans">Mức khoán cố định</span>
                                </div>
                              ) : (
                                <div className="p-1.5 bg-emerald-50 rounded border border-emerald-200 text-[10px] font-sans">
                                  <div className="font-bold text-emerald-900 flex items-center justify-between">
                                    <span>{actualMeals} bữa × {formatVND(editValues.ratePerMeal)}</span>
                                  </div>
                                  <div className="font-mono font-bold text-emerald-800 text-right mt-0.5">
                                    = {formatVND(actualMeals * editValues.ratePerMeal)}
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400 font-sans">-</span>
                          )
                        ) : (
                          effectiveType === 'cash' ? (
                            isByAttendance ? (
                              <div>
                                <div className="font-bold text-emerald-800 font-mono">
                                  {formatVND(actualMeals * effectiveRate)}
                                </div>
                                <div className="text-[10px] text-slate-500 font-sans">
                                  {actualMeals} bữa × {formatVND(effectiveRate)}
                                </div>
                              </div>
                            ) : (
                              <div>
                                <div className="font-bold text-slate-900 font-mono">
                                  {formatVND(effectiveAllowance)}
                                </div>
                                <div className="text-[10px] text-slate-400 font-sans">
                                  Số tự điền
                                </div>
                              </div>
                            )
                          ) : (
                            <span className="text-slate-400 font-sans">-</span>
                          )
                        )}
                      </td>

                      {/* Chi phí hưởng */}
                      <td className="px-4 py-3.5 text-right font-mono font-black text-emerald-700">
                        {formatVND(currentCost)}
                      </td>

                      {/* Ghi chú */}
                      <td className="px-4 py-3.5 text-slate-500">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editValues.note}
                            onChange={e => setEditValues({ ...editValues, note: e.target.value })}
                            className="w-full px-2 py-1 border border-amber-300 rounded"
                            placeholder="Ghi chú"
                          />
                        ) : (
                          reg.note || '-'
                        )}
                      </td>

                      {/* Thao tác */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        {canEditEmployees && (
                          <div className="flex items-center justify-end gap-1">
                            {isEditing ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => saveEdit(reg)}
                                  className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-semibold text-[11px] shadow-xs cursor-pointer"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Lưu</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingId(null)}
                                  className="flex items-center gap-1 px-2.5 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded font-semibold text-[11px] cursor-pointer"
                                >
                                  <X className="w-3.5 h-3.5" />
                                  <span>Hủy</span>
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => startEdit(reg)}
                                className="flex items-center gap-1 px-2 py-1 text-blue-600 hover:bg-blue-50 rounded font-semibold text-[11px] cursor-pointer"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                                <span>Sửa</span>
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Batch Registration Modal */}
      {isBatchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-4 border border-slate-200 text-xs animate-in fade-in zoom-in-95 duration-150 my-6">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Layers className="w-5 h-5 text-teal-600" />
                  <span>Đăng Ký Ăn Ca Hàng Loạt - {selectedMonth}</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Áp dụng nhanh đăng ký bữa ăn và hình thức chi trả (tiền mặt tự điền hoặc theo chấm công)
                </p>
              </div>
              <button
                onClick={() => setIsBatchModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleApplyBatchRegistration} className="space-y-4">
              {/* 1. Phạm vi áp dụng */}
              <div className="space-y-2">
                <label className="block font-bold text-slate-800">1. Đối Tượng Áp Dụng *</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {selectedEmployeeIds.length > 0 && (
                    <label className={`p-2.5 rounded-xl border flex items-center gap-2 cursor-pointer transition-all ${
                      batchForm.targetType === 'selected' ? 'border-teal-500 bg-teal-50/70 ring-2 ring-teal-500/20' : 'border-slate-200'
                    }`}>
                      <input
                        type="radio"
                        name="batchTarget"
                        checked={batchForm.targetType === 'selected'}
                        onChange={() => setBatchForm({ ...batchForm, targetType: 'selected' })}
                        className="w-4 h-4 text-teal-600"
                      />
                      <div>
                        <span className="font-bold text-teal-900 block">Đã chọn ({selectedEmployeeIds.length})</span>
                        <span className="text-[10px] text-teal-700">Các nhân viên được tick chọn</span>
                      </div>
                    </label>
                  )}

                  <label className={`p-2.5 rounded-xl border flex items-center gap-2 cursor-pointer transition-all ${
                    batchForm.targetType === 'all' ? 'border-teal-500 bg-teal-50/70 ring-2 ring-teal-500/20' : 'border-slate-200'
                  }`}>
                    <input
                      type="radio"
                      name="batchTarget"
                      checked={batchForm.targetType === 'all'}
                      onChange={() => setBatchForm({ ...batchForm, targetType: 'all' })}
                      className="w-4 h-4 text-teal-600"
                    />
                    <div>
                      <span className="font-bold text-slate-900 block">Tất cả ({employees.length})</span>
                      <span className="text-[10px] text-slate-500">Toàn bộ công ty</span>
                    </div>
                  </label>

                  <label className={`p-2.5 rounded-xl border flex items-center gap-2 cursor-pointer transition-all ${
                    batchForm.targetType === 'department' ? 'border-teal-500 bg-teal-50/70 ring-2 ring-teal-500/20' : 'border-slate-200'
                  }`}>
                    <input
                      type="radio"
                      name="batchTarget"
                      checked={batchForm.targetType === 'department'}
                      onChange={() => setBatchForm({ ...batchForm, targetType: 'department' })}
                      className="w-4 h-4 text-teal-600"
                    />
                    <div>
                      <span className="font-bold text-slate-900 block">Phòng ban</span>
                      <span className="text-[10px] text-slate-500">Theo đơn vị cụ thể</span>
                    </div>
                  </label>
                </div>

                {batchForm.targetType === 'department' && (
                  <select
                    value={batchForm.departmentId}
                    onChange={e => setBatchForm({ ...batchForm, departmentId: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-semibold mt-1"
                  >
                    {settings.departments.map(d => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* 2. Hình thức chi trả */}
              <div>
                <label className="block font-bold text-slate-800 mb-1.5">2. Hình Thức Chi Trả Ăn Ca *</label>
                <select
                  value={batchForm.mealType}
                  onChange={e => setBatchForm({ ...batchForm, mealType: e.target.value as MealType })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold text-slate-800"
                >
                  <option value="canteen">Ăn tại bếp căng tin tập thể</option>
                  <option value="cash">Chi trả trợ cấp tiền mặt</option>
                  <option value="none">Không đăng ký ăn</option>
                </select>
              </div>

              {/* Chi tiết cho Nhận tiền mặt: 2 cách nhập */}
              {batchForm.mealType === 'cash' && (
                <div className="p-3.5 bg-emerald-50/80 rounded-xl border border-emerald-200 space-y-3">
                  <div className="flex items-center gap-1.5 text-emerald-950 font-bold">
                    <DollarSign className="w-4 h-4 text-emerald-600" />
                    <span>Cách Nhập Tiền Khoán (Tiền Mặt) *</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <label className={`p-3 rounded-lg border flex items-start gap-2.5 cursor-pointer bg-white transition-all ${
                      batchForm.cashMethod === 'fixed' ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-slate-200'
                    }`}>
                      <input
                        type="radio"
                        name="batchCashMethod"
                        checked={batchForm.cashMethod === 'fixed'}
                        onChange={() => setBatchForm({ ...batchForm, cashMethod: 'fixed' })}
                        className="mt-0.5 text-emerald-600"
                      />
                      <div>
                        <div className="font-bold text-slate-900">1. Số tự điền</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Nhập số tiền cố định chi trả hàng tháng (VD: 1.200.000 đ)
                        </div>
                      </div>
                    </label>

                    <label className={`p-3 rounded-lg border flex items-start gap-2.5 cursor-pointer bg-white transition-all ${
                      batchForm.cashMethod === 'by_attendance' ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-slate-200'
                    }`}>
                      <input
                        type="radio"
                        name="batchCashMethod"
                        checked={batchForm.cashMethod === 'by_attendance'}
                        onChange={() => setBatchForm({ ...batchForm, cashMethod: 'by_attendance' })}
                        className="mt-0.5 text-emerald-600"
                      />
                      <div>
                        <div className="font-bold text-slate-900">2. Theo bữa thực tế</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Bữa thực tế (từ chấm công) × Đơn giá/Suất
                        </div>
                      </div>
                    </label>
                  </div>

                  {batchForm.cashMethod === 'fixed' ? (
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Mức tiền khoán tự điền (VNĐ/tháng)</label>
                      <input
                        type="number"
                        value={batchForm.monthlyAllowance}
                        onChange={e => setBatchForm({ ...batchForm, monthlyAllowance: Number(e.target.value) })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono font-bold bg-white"
                        placeholder="VD: 1200000"
                      />
                      <span className="text-[11px] text-slate-500 mt-0.5 block">
                        Số tiền này sẽ được chi trả cố định trong bảng thanh toán lương.
                      </span>
                    </div>
                  ) : (
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Đơn giá / Suất ăn áp dụng (VNĐ/suất)</label>
                      <input
                        type="number"
                        value={batchForm.ratePerMeal}
                        onChange={e => setBatchForm({ ...batchForm, ratePerMeal: Number(e.target.value) })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono font-bold bg-white"
                        placeholder="VD: 35000"
                      />
                      <p className="text-[11px] text-emerald-800 mt-1 font-medium bg-emerald-100/60 p-2 rounded-lg">
                        💡 <strong>Cơ chế tự động:</strong> Tiền khoán tiền mặt mỗi nhân viên sẽ được tự động tính = <strong>(Số bữa ăn thực tế từ bảng chấm công) × {formatVND(batchForm.ratePerMeal)}</strong>.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Chi tiết cho Ăn tại bếp: Đơn giá / suất */}
              {batchForm.mealType === 'canteen' && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Đơn Giá / Suất Ăn (Bếp Căng Tin)</label>
                  <input
                    type="number"
                    value={batchForm.ratePerMeal}
                    onChange={e => setBatchForm({ ...batchForm, ratePerMeal: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono font-bold"
                  />
                  <span className="text-[11px] text-slate-500 mt-0.5 block">
                    Đơn giá làm căn cứ tính chi phí suất ăn phục vụ tại bếp.
                  </span>
                </div>
              )}

              {/* 3. Tích chọn bữa ăn */}
              <div className="p-3.5 bg-teal-50/70 rounded-xl border border-teal-200 space-y-2">
                <label className="block font-bold text-teal-950">3. Đăng Ký Các Bữa Ăn Trong Ngày *</label>
                <div className="grid grid-cols-3 gap-2">
                  <label className={`p-2.5 rounded-lg border flex items-center justify-between cursor-pointer bg-white ${
                    batchForm.registerLunch ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-slate-200'
                  }`}>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={batchForm.registerLunch}
                        onChange={e => setBatchForm({ ...batchForm, registerLunch: e.target.checked })}
                        className="w-4 h-4 text-emerald-600 rounded"
                      />
                      <span className="font-bold text-slate-900">☀️ Trưa</span>
                    </div>
                  </label>

                  <label className={`p-2.5 rounded-lg border flex items-center justify-between cursor-pointer bg-white ${
                    batchForm.registerAfternoon ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-slate-200'
                  }`}>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={batchForm.registerAfternoon}
                        onChange={e => setBatchForm({ ...batchForm, registerAfternoon: e.target.checked })}
                        className="w-4 h-4 text-blue-600 rounded"
                      />
                      <span className="font-bold text-slate-900">🌤️ Chiều</span>
                    </div>
                  </label>

                  <label className={`p-2.5 rounded-lg border flex items-center justify-between cursor-pointer bg-white ${
                    batchForm.registerDinner ? 'border-purple-500 ring-2 ring-purple-500/20' : 'border-slate-200'
                  }`}>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={batchForm.registerDinner}
                        onChange={e => setBatchForm({ ...batchForm, registerDinner: e.target.checked })}
                        className="w-4 h-4 text-purple-600 rounded"
                      />
                      <span className="font-bold text-slate-900">🌙 Tối</span>
                    </div>
                  </label>
                </div>
              </div>

              {/* 4. Ghi chú */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">4. Ghi Chú Đăng Ký</label>
                <input
                  type="text"
                  value={batchForm.note}
                  onChange={e => setBatchForm({ ...batchForm, note: e.target.value })}
                  placeholder="Ghi chú áp dụng (VD: Đăng ký ăn ca tháng mới)"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                />
              </div>

              {/* Footer buttons */}
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsBatchModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl cursor-pointer"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Áp Dụng Đăng Ký</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Print Modal */}
      <PrintMealModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        mealRegistrations={mealRegistrations.filter(m => m.month === selectedMonth || (!m.month && selectedMonth === currentMonthStr))}
        employees={filteredEmployees}
        timekeepings={tkListForMonth}
        settings={{
          ...settings,
          currentMonth: Number(selectedMonth.split('-')[1]) || settings.currentMonth,
          currentYear: Number(selectedMonth.split('-')[0]) || settings.currentYear
        }}
      />
    </div>
  );
};
