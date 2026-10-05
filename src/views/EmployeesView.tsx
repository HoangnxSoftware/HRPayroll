import React, { useState, useRef, useMemo, useEffect } from 'react';
import { 
  Users, 
  UserPlus, 
  Search, 
  Filter, 
  Download, 
  Upload, 
  Edit3, 
  Trash2, 
  FileSpreadsheet, 
  CheckCircle2, 
  CreditCard,
  Building,
  Phone,
  Mail,
  Printer,
  Check,
  X,
  AlertTriangle,
  FileText,
  History,
  Clock,
  Plus,
  Save,
  TrendingUp
} from 'lucide-react';
import { Employee, Department, Position, SystemSettings, WorkHistoryItem, WorkStatus, SalaryCalculationBasis, InsuranceRecord } from '../types';
import { formatVND, getEmployeeWorkStatusDetails, syncEmployeeWorkHistory } from '../utils/payrollCalculator';
import { exportEmployeesToExcel, downloadEmployeeTemplate, readEmployeeExcel } from '../utils/excelHelper';
import { useAuthRole } from '../context/AuthRoleContext';
import { PrintEmployeesModal } from '../components/PrintEmployeesModal';
import { PrintBatchContractsModal, DocumentType } from '../components/PrintBatchContractsModal';

interface EmployeesViewProps {
  employees: Employee[];
  departments: Department[];
  positions: Position[];
  settings?: SystemSettings;
  insurances?: InsuranceRecord[];
  onAddEmployee: () => void;
  onEditEmployee: (employee: Employee) => void;
  onDeleteEmployee: (id: string) => void;
  onImportEmployees: (newEmployees: Partial<Employee>[]) => void;
  onUpdateEmployeeSalary?: (employeeId: string, newSalary: number) => void;
  onUpdateEmployee?: (employee: Employee) => void;
  onUpdateSettings?: (newSettings: SystemSettings) => void;
}

export const EmployeesView: React.FC<EmployeesViewProps> = ({
  employees,
  departments,
  positions,
  settings,
  insurances,
  onAddEmployee,
  onEditEmployee,
  onDeleteEmployee,
  onImportEmployees,
  onUpdateEmployeeSalary,
  onUpdateEmployee,
  onUpdateSettings
}) => {
  const { canEditEmployees, canExportData } = useAuthRole();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterDuplicateCccdOnly, setFilterDuplicateCccdOnly] = useState(false);
  const [importNotification, setImportNotification] = useState<string | null>(null);

  // In hàng loạt hợp đồng lao động & cam kết thu nhập
  const [isBatchContractsModalOpen, setIsBatchContractsModalOpen] = useState(false);
  const [batchModalSelectedIds, setBatchModalSelectedIds] = useState<string[]>([]);
  const [batchModalInitialDocType, setBatchModalInitialDocType] = useState<DocumentType>('contract');
  const [selectedEmpIds, setSelectedEmpIds] = useState<Set<string>>(new Set());
  const [periodContractOverride, setPeriodContractOverride] = useState<{
    item: WorkHistoryItem;
    matchedInsSalary: number;
  } | null>(null);

  // Chỉnh sửa nhanh mức lương đến hàng đơn vị (vd: 525.454 hoặc 525454)
  const [editingSalaryEmpId, setEditingSalaryEmpId] = useState<string | null>(null);
  const [salaryInputText, setSalaryInputText] = useState<string>('');

  // 1. PHÁT HIỆN LAO ĐỘNG TRÙNG SỐ CĂN CƯỚC CÔNG DÂN (CCCD)
  const duplicateCccdMap = useMemo(() => {
    const counts = new Map<string, number>();
    employees.forEach(emp => {
      const cccd = (emp.idCardNumber || '').trim();
      if (cccd) {
        counts.set(cccd, (counts.get(cccd) || 0) + 1);
      }
    });
    return counts;
  }, [employees]);

  const duplicateCccdSet = useMemo(() => {
    const set = new Set<string>();
    duplicateCccdMap.forEach((count, cccd) => {
      if (count > 1) set.add(cccd);
    });
    return set;
  }, [duplicateCccdMap]);

  const totalDuplicateEmployees = useMemo(() => {
    return employees.filter(e => {
      const cccd = (e.idCardNumber || '').trim();
      return cccd && duplicateCccdSet.has(cccd);
    }).length;
  }, [employees, duplicateCccdSet]);

  const startEditSalary = (emp: Employee) => {
    setEditingSalaryEmpId(emp.id);
    setSalaryInputText(new Intl.NumberFormat('vi-VN').format(emp.baseSalary || 0));
  };

  const cancelEditSalary = () => {
    setEditingSalaryEmpId(null);
    setSalaryInputText('');
  };

  const saveEditSalary = (empId: string) => {
    const digitsOnly = salaryInputText.replace(/[^\d]/g, '');
    const newSalary = digitsOnly ? parseInt(digitsOnly, 10) : 0;
    if (onUpdateEmployeeSalary) {
      onUpdateEmployeeSalary(empId, newSalary);
    } else {
      const target = employees.find(e => e.id === empId);
      if (target) {
        onEditEmployee({ ...target, baseSalary: newSalary });
      }
    }
    setEditingSalaryEmpId(null);
  };

  const depMap = new Map(departments.map(d => [d.id, d.name]));
  const posMap = new Map(positions.map(p => [p.id, p.name]));

  // Quản lý quá trình làm việc / lịch sử công tác qua các thời kỳ (tương tự Quá trình đóng BHXH)
  const [workHistoryTarget, setWorkHistoryTarget] = useState<Employee | null>(null);
  const [workHistoryForm, setWorkHistoryForm] = useState<{
    editingId: string | null;
    fromMonth: string;
    toMonth: string;
    isOngoing: boolean;
    departmentId: string;
    positionId: string;
    workStatus: WorkStatus;
    salaryBasis: SalaryCalculationBasis;
    baseSalary: number;
    salaryPercent: number;
    hourlyRate: number;
    transferLocation: string;
    note: string;
  }>({
    editingId: null,
    fromMonth: new Date().toISOString().slice(0, 7),
    toMonth: '',
    isOngoing: true,
    departmentId: departments[0]?.id || '',
    positionId: positions[0]?.id || '',
    workStatus: 'active',
    salaryBasis: 'monthly',
    baseSalary: 10000000,
    salaryPercent: 100,
    hourlyRate: 50000,
    transferLocation: '',
    note: ''
  });
  const [workHistorySuccessMsg, setWorkHistorySuccessMsg] = useState<string | null>(null);
  const [deleteWorkHistoryModal, setDeleteWorkHistoryModal] = useState<{
    isOpen: boolean;
    itemId: string | null;
    itemIndex: number | null;
    periodLabel: string;
  }>({
    isOpen: false,
    itemId: null,
    itemIndex: null,
    periodLabel: ''
  });

  useEffect(() => {
    if (workHistoryTarget) {
      const fresh = employees.find(e => e.id === workHistoryTarget.id);
      if (fresh && fresh !== workHistoryTarget) {
        setWorkHistoryTarget(fresh);
      }
    }
  }, [employees]);

  const targetHistory: WorkHistoryItem[] = useMemo(() => {
    if (!workHistoryTarget) return [];
    if (workHistoryTarget.workHistory && workHistoryTarget.workHistory.length > 0) {
      return [...workHistoryTarget.workHistory].sort((a, b) => (a.fromMonth || '').localeCompare(b.fromMonth || ''));
    }
    return [];
  }, [workHistoryTarget]);

  const resetWorkHistoryForm = () => {
    if (!workHistoryTarget) return;
    setWorkHistoryForm({
      editingId: null,
      fromMonth: new Date().toISOString().slice(0, 7),
      toMonth: '',
      isOngoing: true,
      departmentId: workHistoryTarget.departmentId || departments[0]?.id || '',
      positionId: workHistoryTarget.positionId || positions[0]?.id || '',
      workStatus: workHistoryTarget.workStatus || 'active',
      salaryBasis: workHistoryTarget.salaryBasis || 'monthly',
      baseSalary: workHistoryTarget.baseSalary || 10000000,
      salaryPercent: workHistoryTarget.salaryPercent ?? 100,
      hourlyRate: workHistoryTarget.hourlyRate || 50000,
      transferLocation: workHistoryTarget.transferLocation || '',
      note: ''
    });
  };

  const handleOpenWorkHistory = (emp: Employee) => {
    setWorkHistoryTarget(emp);
    setWorkHistorySuccessMsg(null);
    setWorkHistoryForm({
      editingId: null,
      fromMonth: emp.startDate ? emp.startDate.slice(0, 7) : new Date().toISOString().slice(0, 7),
      toMonth: '',
      isOngoing: true,
      departmentId: emp.departmentId || departments[0]?.id || '',
      positionId: emp.positionId || positions[0]?.id || '',
      workStatus: emp.workStatus || 'active',
      salaryBasis: emp.salaryBasis || 'monthly',
      baseSalary: emp.baseSalary || 10000000,
      salaryPercent: emp.salaryPercent ?? 100,
      hourlyRate: emp.hourlyRate || 50000,
      transferLocation: emp.transferLocation || '',
      note: ''
    });
  };

  const handleEditWorkHistoryItem = (item: WorkHistoryItem) => {
    setWorkHistoryForm({
      editingId: item.id,
      fromMonth: item.fromMonth ? item.fromMonth.slice(0, 7) : '',
      toMonth: item.toMonth ? item.toMonth.slice(0, 7) : '',
      isOngoing: !item.toMonth,
      departmentId: item.departmentId,
      positionId: item.positionId,
      workStatus: item.workStatus,
      salaryBasis: item.salaryBasis,
      baseSalary: item.baseSalary,
      salaryPercent: item.salaryPercent ?? 100,
      hourlyRate: item.hourlyRate || 50000,
      transferLocation: item.transferLocation || '',
      note: item.note || ''
    });
    setWorkHistorySuccessMsg(null);
  };

  const handleSaveWorkHistoryItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!workHistoryTarget) return;

    const newItem: WorkHistoryItem = {
      id: workHistoryForm.editingId || `wh-${workHistoryTarget.id}-${Date.now()}`,
      fromMonth: workHistoryForm.fromMonth,
      toMonth: workHistoryForm.isOngoing ? undefined : (workHistoryForm.toMonth || undefined),
      departmentId: workHistoryForm.departmentId,
      positionId: workHistoryForm.positionId,
      workStatus: workHistoryForm.workStatus,
      salaryBasis: workHistoryForm.salaryBasis,
      baseSalary: Number(workHistoryForm.baseSalary) || 0,
      salaryPercent: Number(workHistoryForm.salaryPercent) || 100,
      hourlyRate: Number(workHistoryForm.hourlyRate) || 0,
      transferLocation: workHistoryForm.transferLocation || undefined,
      note: workHistoryForm.note || undefined
    };

    const currentHistory = workHistoryTarget.workHistory ? [...workHistoryTarget.workHistory] : [];
    let updatedHistory: WorkHistoryItem[] = [];

    if (workHistoryForm.editingId) {
      updatedHistory = currentHistory.map(h => h.id === workHistoryForm.editingId ? newItem : h);
    } else {
      updatedHistory = [...currentHistory, newItem];
    }

    updatedHistory.sort((a, b) => (a.fromMonth || '').localeCompare(b.fromMonth || ''));

    // Tự động kiểm tra và thêm trạng thái chính thức kế tiếp nếu giai đoạn thử việc/điều chuyển/thai sản vừa lưu đã kết thúc
    const autoSyncedHistory = syncEmployeeWorkHistory({
      ...workHistoryTarget,
      workHistory: updatedHistory
    });

    // Nếu giai đoạn này đang áp dụng đến nay -> cập nhật thông tin hiện hành của nhân viên
    let updatedEmp: Employee = {
      ...workHistoryTarget,
      workHistory: autoSyncedHistory
    };

    if (workHistoryForm.isOngoing) {
      updatedEmp = {
        ...updatedEmp,
        departmentId: newItem.departmentId,
        positionId: newItem.positionId,
        workStatus: newItem.workStatus,
        salaryBasis: newItem.salaryBasis,
        baseSalary: newItem.baseSalary,
        salaryPercent: newItem.salaryPercent,
        hourlyRate: newItem.hourlyRate,
        transferLocation: newItem.transferLocation
      };
    }

    setWorkHistoryTarget(updatedEmp);
    if (onUpdateEmployee) {
      onUpdateEmployee(updatedEmp);
    }

    setWorkHistorySuccessMsg(workHistoryForm.editingId ? 'Đã cập nhật giai đoạn thành công!' : 'Đã thêm mới giai đoạn công tác thành công!');
    resetWorkHistoryForm();
    setTimeout(() => setWorkHistorySuccessMsg(null), 3000);
  };

  const handleRequestDeleteWorkHistoryItem = (item: WorkHistoryItem, index: number) => {
    setDeleteWorkHistoryModal({
      isOpen: true,
      itemId: item.id || `wh-${index}`,
      itemIndex: index,
      periodLabel: `${item.fromMonth} → ${item.toMonth || 'Đến nay'} (${posMap.get(item.positionId) || item.positionId})`
    });
  };

  const confirmDeleteWorkHistoryItem = () => {
    if (!workHistoryTarget) return;
    const { itemId, itemIndex } = deleteWorkHistoryModal;
    if (!itemId && itemIndex === null) return;

    const currentHistory = workHistoryTarget.workHistory ? [...workHistoryTarget.workHistory] : [];
    const updatedHistory = currentHistory.filter((h, idx) => {
      if (itemId && h.id) return h.id !== itemId;
      if (itemIndex !== null) return idx !== itemIndex;
      return true;
    });

    const updatedEmp: Employee = {
      ...workHistoryTarget,
      workHistory: updatedHistory
    };

    setWorkHistoryTarget(updatedEmp);
    if (onUpdateEmployee) {
      onUpdateEmployee(updatedEmp);
    }

    setDeleteWorkHistoryModal({ isOpen: false, itemId: null, itemIndex: null, periodLabel: '' });
    setWorkHistorySuccessMsg('Đã xóa giai đoạn quá trình làm việc thành công!');
    setTimeout(() => setWorkHistorySuccessMsg(null), 3000);
  };

  // In Hợp đồng lao động theo từng giai đoạn & đối chiếu mức đóng BHXH
  const handlePrintContractForPeriod = (item: WorkHistoryItem) => {
    if (!workHistoryTarget) return;
    // Đối chiếu mức đóng BHXH trong Quá trình & Mức đóng BHXH
    const matchingIns = insurances?.find(i => i.employeeId === workHistoryTarget.id);
    let matchedInsSalary = matchingIns?.insuranceSalary || item.baseSalary;
    if (matchingIns?.history && matchingIns.history.length > 0) {
      const periodMonth = item.fromMonth.slice(0, 7);
      const foundHist = matchingIns.history.find(h => {
        if (h.fromMonth <= periodMonth) {
          if (!h.toMonth || h.toMonth >= periodMonth) return true;
        }
        return false;
      }) || matchingIns.history[matchingIns.history.length - 1];
      if (foundHist) {
        matchedInsSalary = foundHist.salary;
      }
    }

    setPeriodContractOverride({
      item,
      matchedInsSalary
    });
    setBatchModalSelectedIds([workHistoryTarget.id]);
    setBatchModalInitialDocType('contract');
    setIsBatchContractsModalOpen(true);
  };

  const filteredEmployees = employees.filter(emp => {
    const matchSearch = 
      emp.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.employeeCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.idCardNumber.includes(searchTerm) ||
      (emp.phoneNumber && emp.phoneNumber.includes(searchTerm));

    const matchDep = filterDepartment === 'all' || emp.departmentId === filterDepartment;
    const matchStatus = filterStatus === 'all' || emp.workStatus === filterStatus;
    const matchDupe = !filterDuplicateCccdOnly || duplicateCccdSet.has((emp.idCardNumber || '').trim());

    return matchSearch && matchDep && matchStatus && matchDupe;
  });

  const toggleSelectEmp = (id: string) => {
    setSelectedEmpIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllFiltered = () => {
    if (selectedEmpIds.size === filteredEmployees.length && filteredEmployees.length > 0) {
      setSelectedEmpIds(new Set());
    } else {
      setSelectedEmpIds(new Set(filteredEmployees.map(e => e.id)));
    }
  };

  const handleOpenBatchPrint = (employeeIds?: string[], docType: DocumentType = 'contract') => {
    if (employeeIds && employeeIds.length > 0) {
      setBatchModalSelectedIds(employeeIds);
    } else if (selectedEmpIds.size > 0) {
      setBatchModalSelectedIds(Array.from(selectedEmpIds));
    } else {
      setBatchModalSelectedIds(filteredEmployees.map(e => e.id));
    }
    setBatchModalInitialDocType(docType);
    setIsBatchContractsModalOpen(true);
  };

  const handleExportExcel = () => {
    exportEmployeesToExcel(filteredEmployees, departments, positions);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const imported = await readEmployeeExcel(file);
      onImportEmployees(imported);
      setImportNotification(`Đã nhập thành công ${imported.length} nhân viên từ file Excel!`);
      setTimeout(() => setImportNotification(null), 4000);
    } catch (err: any) {
      alert(`Lỗi khi đọc file Excel: ${err.message}`);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight">Hồ Sơ & Danh Sách Người Lao Động</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Quản lý thông tin định danh, CCCD, chức vụ, mức lương và mã nhân viên tự động
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Hidden File Input for Excel Import */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".xlsx, .xls, .csv"
            className="hidden"
          />

          {canEditEmployees && (
            <>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition-colors cursor-pointer"
                title="Nhập danh sách từ Excel"
              >
                <Upload className="w-4 h-4 text-slate-500" />
                <span>Nhập Excel</span>
              </button>

              <button
                onClick={downloadEmployeeTemplate}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition-colors cursor-pointer"
                title="Tải mẫu Excel chuẩn để nhập liệu"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                <span>Tải Mẫu Excel</span>
              </button>
            </>
          )}

          {canExportData && (
            <>
              {/* In Hàng Loạt Hợp Đồng Lao Động & Bản Cam Kết Thu Nhập */}
              <button
                onClick={() => handleOpenBatchPrint()}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
                title="In hàng loạt Hợp đồng lao động, Bản cam kết thu nhập theo mẫu (có thể chỉnh sửa mẫu)"
              >
                <FileText className="w-4 h-4" />
                <span>In Hợp Đồng & Cam Kết</span>
              </button>

              <button
                onClick={() => setIsPrintModalOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 font-semibold text-xs rounded-xl transition-colors cursor-pointer"
                title="In danh sách người lao động"
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

          {canEditEmployees && (
            <button
              onClick={onAddEmployee}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>Thêm Nhân Viên</span>
            </button>
          )}
        </div>
      </div>

      {importNotification && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>{importNotification}</span>
        </div>
      )}

      {/* CẢNH BÁO BÔI ĐỎ LAO ĐỘNG TRÙNG SỐ CĂN CƯỚC CÔNG DÂN (CCCD) */}
      {totalDuplicateEmployees > 0 && (
        <div className="p-4 bg-red-50 border-2 border-red-300 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs text-red-950 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-red-600 text-white rounded-xl shadow-xs shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-sm text-red-900 flex items-center gap-2">
                <span>Cảnh báo: Có {totalDuplicateEmployees} người lao động trùng số Căn cước công dân (CCCD)!</span>
                <span className="px-2 py-0.5 bg-red-200 text-red-900 font-bold rounded-full text-[11px] border border-red-300">
                  Đã bôi đỏ trên danh sách
                </span>
              </div>
              <p className="text-[11px] text-red-700 mt-0.5">
                Các hồ sơ trùng số CCCD có thể gây sai sót khi kê khai Thuế TNCN, đóng BHXH hoặc ký hợp đồng lao động. Hãy kiểm tra và điều chỉnh kịp thời.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFilterDuplicateCccdOnly(!filterDuplicateCccdOnly)}
              className={`px-3.5 py-2 rounded-xl font-bold transition-all cursor-pointer text-xs flex items-center gap-1.5 shadow-2xs ${
                filterDuplicateCccdOnly 
                  ? 'bg-red-700 text-white hover:bg-red-800' 
                  : 'bg-white hover:bg-red-100 text-red-800 border border-red-300'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>{filterDuplicateCccdOnly ? 'Xem tất cả nhân viên' : `Chỉ xem ${totalDuplicateEmployees} người trùng CCCD`}</span>
            </button>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs grid grid-cols-1 md:grid-cols-5 gap-3 text-xs">
        <div className="md:col-span-2 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Tìm theo Tên, Mã NV, Số CCCD, Số điện thoại..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          />
        </div>

        <div>
          <select
            value={filterDepartment}
            onChange={e => setFilterDepartment(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          >
            <option value="all">Tất cả phòng ban</option>
            {departments.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>

        <div>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="active">Đang làm việc</option>
            <option value="probation">Thử việc</option>
            <option value="resigned">Đã nghỉ việc</option>
            <option value="transferred">Điều chuyển</option>
            <option value="maternity">Nghỉ thai sản</option>
          </select>
        </div>

        {/* Lọc nhanh lao động trùng CCCD */}
        <div>
          <button
            type="button"
            onClick={() => setFilterDuplicateCccdOnly(!filterDuplicateCccdOnly)}
            className={`w-full px-3 py-2 rounded-lg font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer border text-xs ${
              filterDuplicateCccdOnly
                ? 'bg-red-600 text-white border-red-700 shadow-2xs'
                : totalDuplicateEmployees > 0
                  ? 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
                  : 'bg-slate-100 text-slate-500 border-slate-200'
            }`}
            title="Lọc nhanh danh sách người lao động trùng số Căn cước công dân"
          >
            <AlertTriangle className={`w-3.5 h-3.5 ${filterDuplicateCccdOnly ? 'text-white' : totalDuplicateEmployees > 0 ? 'text-red-600' : 'text-slate-400'}`} />
            <span>Trùng CCCD {totalDuplicateEmployees > 0 ? `(${totalDuplicateEmployees})` : ''}</span>
          </button>
        </div>
      </div>

      {/* Thanh tác vụ chọn hàng loạt (Batch Action Bar) */}
      {selectedEmpIds.size > 0 && (
        <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs text-emerald-950 shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-bold">
              Đã tích chọn <strong>{selectedEmpIds.size}</strong> người lao động
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => handleOpenBatchPrint(Array.from(selectedEmpIds), 'contract')}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-2xs transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>In Hợp Đồng ({selectedEmpIds.size})</span>
            </button>
            <button
              onClick={() => handleOpenBatchPrint(Array.from(selectedEmpIds), 'commitment')}
              className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-lg shadow-2xs transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>In Cam Kết Thu Nhập ({selectedEmpIds.size})</span>
            </button>
            <button
              onClick={() => handleOpenBatchPrint(Array.from(selectedEmpIds), 'both')}
              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg shadow-2xs transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>In Cả Bộ Hồ Sơ ({selectedEmpIds.size})</span>
            </button>
            <button
              onClick={() => setSelectedEmpIds(new Set())}
              className="px-2.5 py-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 rounded-lg transition-colors cursor-pointer font-medium"
            >
              Bỏ chọn
            </button>
          </div>
        </div>
      )}

      {/* Employees Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-slate-600 uppercase font-semibold border-b border-slate-200">
              <tr>
                <th className="w-10 px-3 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={filteredEmployees.length > 0 && selectedEmpIds.size === filteredEmployees.length}
                    onChange={selectAllFiltered}
                    className="rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    title="Chọn tất cả danh sách đang hiển thị để in hàng loạt"
                  />
                </th>
                <th className="px-4 py-3">Mã NV</th>
                <th className="px-4 py-3">Họ và Tên</th>
                <th className="px-4 py-3">
                  <div>Số CCCD / Mã Số Thuế TNCN</div>
                  <div className="text-[10px] font-normal text-emerald-600 normal-case">MST TNCN chính là số CCCD</div>
                </th>
                <th className="px-4 py-3">Số Điện Thoại</th>
                <th className="px-4 py-3">Phòng Ban & Chức Vụ</th>
                <th className="px-4 py-3">Trạng Thái</th>
                <th className="px-4 py-3">Hình Thức Lương</th>
                <th className="px-4 py-3 text-right">
                  <div>Lương Cơ Bản / HĐ</div>
                  <div className="text-[10px] font-normal text-slate-400 lowercase">hàng đơn vị (vd: 525.454)</div>
                </th>
                <th className="px-4 py-3 text-center min-w-[125px]">Quá Trình Làm Việc</th>
                <th className="px-4 py-3">Số Tài Khoản NH</th>
                <th className="px-4 py-3 text-right">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-6 py-8 text-center text-slate-400">
                    Không tìm thấy nhân viên nào phù hợp với bộ lọc tìm kiếm.
                  </td>
                </tr>
              ) : (
                filteredEmployees.map(emp => {
                  const cccdClean = (emp.idCardNumber || '').trim();
                  const isDupeCccd = cccdClean ? duplicateCccdSet.has(cccdClean) : false;
                  const dupeCount = cccdClean ? duplicateCccdMap.get(cccdClean) || 0 : 0;
                  const isSelected = selectedEmpIds.has(emp.id);

                  return (
                    <tr 
                      key={emp.id} 
                      className={`transition-colors ${
                        isDupeCccd
                          ? 'bg-red-50/90 hover:bg-red-100/90 border-l-4 border-l-red-600 text-red-950 font-medium'
                          : isSelected
                            ? 'bg-emerald-50/70 hover:bg-emerald-100/60'
                            : 'hover:bg-slate-50/80'
                      }`}
                    >
                      {/* Checkbox for batch printing */}
                      <td className="px-3 py-3.5 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectEmp(emp.id)}
                          className="rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                        />
                      </td>

                      <td className="px-4 py-3.5 font-mono font-bold text-slate-900">
                        <span className={`px-2 py-1 rounded border text-slate-800 ${isDupeCccd ? 'bg-red-100 border-red-300 font-black text-red-900' : 'bg-slate-100 border-slate-200'}`}>
                          {emp.employeeCode}
                        </span>
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                          <span>{emp.fullName}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                            emp.gender === 'Nữ'
                              ? 'bg-rose-50 text-rose-700 border-rose-200' 
                              : emp.gender === 'Khác'
                                ? 'bg-purple-50 text-purple-700 border-purple-200'
                                : 'bg-sky-50 text-sky-700 border-sky-200'
                          }`}>
                            {emp.gender || 'Nam'}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                          <span>Quốc tịch: <strong className="text-slate-700 font-medium">{emp.nationality || 'Việt Nam'}</strong></span>
                          <span>• Sinh: {emp.birthDate}</span>
                          {emp.email && <span className="truncate max-w-[120px]">• {emp.email}</span>}
                        </div>
                      </td>

                      {/* Cột Số Căn Cước (CCCD) - Bôi đỏ nổi bật khi trùng */}
                      <td className="px-4 py-3.5 font-mono">
                        <div className={isDupeCccd ? 'text-red-700 font-black text-[13px] tracking-wide' : 'text-slate-800 font-semibold'}>
                          {emp.idCardNumber}
                        </div>
                        {isDupeCccd && (
                          <div className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 bg-red-100 text-red-800 border border-red-300 rounded font-sans font-bold text-[10px]">
                            <AlertTriangle className="w-3 h-3 text-red-600 shrink-0" />
                            <span>Trùng CCCD/MST ({dupeCount} mã NV - Tự động tính gộp thuế TNCN cả năm)</span>
                          </div>
                        )}
                        <div className="text-[10px] text-slate-400 mt-0.5">Cấp: {emp.issueDate}</div>
                      </td>

                      <td className="px-4 py-3.5">
                        {emp.phoneNumber ? (
                          <a 
                            href={`tel:${emp.phoneNumber}`}
                            className="inline-flex items-center gap-1 font-mono font-semibold text-slate-800 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 px-2 py-1 rounded border border-slate-200 transition-colors"
                          >
                            <Phone className="w-3 h-3 text-emerald-600 shrink-0" />
                            <span>{emp.phoneNumber}</span>
                          </a>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">Chưa cập nhật</span>
                        )}
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-slate-800">{depMap.get(emp.departmentId) || '-'}</div>
                        <div className="text-slate-500 text-[11px]">{posMap.get(emp.positionId) || '-'}</div>
                      </td>

                      <td className="px-4 py-3.5">
                        {(() => {
                          const statusInfo = getEmployeeWorkStatusDetails(emp);
                          return (
                            <div>
                              <span className={`inline-block px-2 py-0.5 rounded-full font-bold text-[10px] uppercase border ${statusInfo.colorClass}`}>
                                {statusInfo.label}
                              </span>
                              {statusInfo.details && (
                                <div className="text-[10px] text-slate-600 font-mono mt-0.5">
                                  {statusInfo.details}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </td>

                      <td className="px-4 py-3.5">
                        <span className="font-medium text-slate-700">
                          {emp.salaryBasis === 'monthly' ? 'Lương tháng' :
                           emp.salaryBasis === 'daily' ? 'Theo ngày công' :
                           emp.salaryBasis === 'percent' ? `Theo % (${emp.salaryPercent || 100}%)` : 'Theo bộ phận'}
                        </span>
                      </td>

                      {editingSalaryEmpId === emp.id ? (
                        <td className="px-2 py-2 text-right bg-emerald-50/70 border-y border-emerald-200" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            <div className="flex flex-col items-end">
                              <input
                                type="text"
                                autoFocus
                                value={salaryInputText}
                                onChange={e => setSalaryInputText(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') saveEditSalary(emp.id);
                                  if (e.key === 'Escape') cancelEditSalary();
                                }}
                                placeholder="VD: 525.454"
                                className="w-32 px-2 py-1 text-right font-mono font-bold text-xs bg-white border-2 border-emerald-500 rounded-lg focus:outline-none shadow-xs"
                                title="Nhập mức lương đến hàng đơn vị (vd: 525.454 hoặc 525454)"
                              />
                              <span className="text-[10px] text-emerald-800 font-mono mt-0.5 font-bold">
                                ={formatVND(parseInt(salaryInputText.replace(/[^\d]/g, '') || '0', 10))}
                              </span>
                            </div>
                            <div className="flex flex-col gap-1">
                              <button
                                type="button"
                                onClick={() => saveEditSalary(emp.id)}
                                className="p-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded cursor-pointer transition-colors shadow-xs"
                                title="Lưu mức lương mới (Enter)"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={cancelEditSalary}
                                className="p-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded cursor-pointer transition-colors"
                                title="Hủy (Esc)"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </td>
                      ) : (
                        <td 
                          className={`px-4 py-3.5 text-right font-mono font-bold text-slate-900 group ${canEditEmployees ? 'cursor-pointer hover:bg-emerald-50/60 transition-colors' : ''}`}
                          onClick={() => {
                            if (canEditEmployees) startEditSalary(emp);
                          }}
                          title={canEditEmployees ? "Nhấp để sửa nhanh mức lương đến hàng đơn vị (vd: 525.454)" : undefined}
                        >
                          <div className="inline-flex items-center justify-end gap-1.5">
                            <span>{formatVND(emp.baseSalary)}</span>
                            {canEditEmployees && (
                              <span className="opacity-0 group-hover:opacity-100 text-emerald-600 transition-opacity p-0.5 hover:bg-emerald-100 rounded">
                                <Edit3 className="w-3 h-3" />
                              </span>
                            )}
                          </div>
                        </td>
                      )}

                      {/* Cột Quá Trình Làm Việc / Lịch Sử Công Tác */}
                      <td className="px-4 py-3.5 text-center">
                        <button
                          type="button"
                          onClick={() => handleOpenWorkHistory(emp)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors cursor-pointer"
                          title="Xem và quản lý Quá trình làm việc / Lịch sử công tác qua các thời kỳ"
                        >
                          <History className="w-3.5 h-3.5 text-emerald-600" />
                          <span>{(emp.workHistory && emp.workHistory.length > 0) ? `${emp.workHistory.length} giai đoạn` : 'Thiết lập'}</span>
                        </button>
                      </td>

                      <td className="px-4 py-3.5 font-mono text-slate-600">
                        {emp.bankAccount ? (
                          <div>
                            <div className="font-semibold text-slate-800">{emp.bankAccount}</div>
                            <div className="text-[10px] text-slate-400 truncate max-w-[120px]">{emp.bankName}</div>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Tiền mặt</span>
                        )}
                      </td>

                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* Nút in Hợp đồng / Cam kết riêng cho từng nhân viên */}
                          <button
                            onClick={() => handleOpenBatchPrint([emp.id], 'contract')}
                            className="p-1.5 text-emerald-700 hover:text-emerald-900 hover:bg-emerald-100 rounded-lg transition-colors cursor-pointer"
                            title="In Hợp đồng lao động & Cam kết thu nhập cho nhân viên này"
                          >
                            <FileText className="w-4 h-4" />
                          </button>

                          {canEditEmployees && (
                            <>
                              <button
                                onClick={() => onEditEmployee(emp)}
                                className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                                title="Sửa thông tin nhân viên"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => onDeleteEmployee(emp.id)}
                                className="p-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                                title="Xóa nhân viên"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
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

      {/* Modal In Danh Sách Người Lao Động */}
      {settings && (
        <PrintEmployeesModal
          isOpen={isPrintModalOpen}
          onClose={() => setIsPrintModalOpen(false)}
          employees={filteredEmployees.length ? filteredEmployees : employees}
          departments={departments}
          positions={positions}
          settings={settings}
        />
      )}

      {/* Modal In Hàng Loạt Hợp Đồng Lao Động & Bản Cam Kết Thu Nhập (Mẫu tùy biến) */}
      {settings && (
        <PrintBatchContractsModal
          isOpen={isBatchContractsModalOpen}
          onClose={() => {
            setIsBatchContractsModalOpen(false);
            setPeriodContractOverride(null);
          }}
          employees={employees}
          departments={departments}
          positions={positions}
          settings={settings}
          onUpdateSettings={onUpdateSettings}
          initialSelectedEmployeeIds={batchModalSelectedIds}
          initialDocType={batchModalInitialDocType}
          periodOverride={periodContractOverride}
        />
      )}

      {/* Modal Quá Trình Làm Việc / Lịch Sử Công Tác (Tương tự Quá trình đóng BHXH) */}
      {workHistoryTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-100 rounded-xl text-emerald-700">
                  <History className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <span>Quá Trình Làm Việc & Lịch Sử Công Tác</span>
                    <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-mono font-bold">
                      {workHistoryTarget.employeeCode}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    Ghi nhận chức vụ, phòng ban, trạng thái công việc, hình thức tính lương và mức lương cơ bản qua các thời kỳ
                  </p>
                </div>
              </div>
              <button
                onClick={() => setWorkHistoryTarget(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Notification */}
            {workHistorySuccessMsg && (
              <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{workHistorySuccessMsg}</span>
              </div>
            )}

            <div className="mt-5 space-y-6 text-xs">
              {/* Card 1: Thông tin nhân viên hiện tại & Tự động đồng bộ */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full md:w-auto">
                  <div>
                    <span className="text-[11px] text-slate-500 block">Họ và tên</span>
                    <strong className="text-slate-900 font-bold text-sm">{workHistoryTarget.fullName}</strong>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 block">Số CCCD / MST</span>
                    <span className="font-mono text-slate-800 font-semibold">{workHistoryTarget.idCardNumber || '—'}</span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 block">Phòng ban & Chức vụ</span>
                    <span className="text-slate-800 font-medium">
                      {depMap.get(workHistoryTarget.departmentId)} - {posMap.get(workHistoryTarget.positionId)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 block">Lương cơ bản hiện hành</span>
                    <span className="font-mono text-emerald-700 font-bold">{formatVND(workHistoryTarget.baseSalary)}</span>
                  </div>
                </div>
              </div>

              {/* Card 2: Danh sách các giai đoạn quá trình làm việc */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                <div className="p-3 bg-slate-100/70 border-b border-slate-200 font-bold text-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-emerald-600" />
                    <span>Các Giai Đoạn Công Tác & Diễn Biến Chức Vụ ({targetHistory.length})</span>
                  </div>
                  <span className="text-[11px] font-normal text-slate-500">
                    Sắp xếp theo thứ tự thời gian từ trước đến nay
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2 w-10 text-center">STT</th>
                        <th className="px-3 py-2 min-w-[130px]">Thời Gian</th>
                        <th className="px-3 py-2 min-w-[140px]">Phòng Ban & Chức Vụ</th>
                        <th className="px-3 py-2 min-w-[110px]">Trạng Thái</th>
                        <th className="px-3 py-2 min-w-[110px]">Hình Thức Lương</th>
                        <th className="px-3 py-2 text-right min-w-[110px]">Lương Cơ Bản (VNĐ)</th>
                        <th className="px-3 py-2 min-w-[120px]">Chi Nhánh / Ghi Chú</th>
                        <th className="px-3 py-2 text-center min-w-[90px]">Tình Trạng</th>
                        {canEditEmployees && <th className="px-3 py-2 text-right w-20">Thao Tác</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {targetHistory.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="p-6 text-center text-slate-400">
                            Chưa có giai đoạn nào được ghi nhận. Hãy thêm giai đoạn mới ở form bên dưới.
                          </td>
                        </tr>
                      ) : (
                        targetHistory.map((item, idx) => {
                          const isOngoing = !item.toMonth;
                          const depName = depMap.get(item.departmentId) || item.departmentId;
                          const posName = posMap.get(item.positionId) || item.positionId;
                          return (
                            <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                              <td className="px-3 py-2.5 text-center text-slate-400 font-mono">{idx + 1}</td>
                              <td className="px-3 py-2.5 font-mono font-bold text-slate-800">
                                {item.fromMonth} → {item.toMonth || 'Đến nay'}
                              </td>
                              <td className="px-3 py-2.5">
                                <div className="font-semibold text-slate-900">{posName}</div>
                                <div className="text-[11px] text-slate-500">{depName}</div>
                              </td>
                              <td className="px-3 py-2.5">
                                <span className={`inline-block px-2 py-0.5 rounded-full font-bold text-[10px] ${
                                  item.workStatus === 'probation' ? 'bg-amber-100 text-amber-800' :
                                  item.workStatus === 'transferred' ? 'bg-blue-100 text-blue-800' :
                                  item.workStatus === 'maternity' ? 'bg-purple-100 text-purple-800' :
                                  item.workStatus === 'resigned' ? 'bg-rose-100 text-rose-800' :
                                  'bg-emerald-100 text-emerald-800'
                                }`}>
                                  {item.workStatus === 'probation' ? 'Thử việc' :
                                   item.workStatus === 'transferred' ? 'Điều chuyển' :
                                   item.workStatus === 'maternity' ? 'Nghỉ thai sản' :
                                   item.workStatus === 'resigned' ? 'Đã nghỉ việc' : 'Chính thức'}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-slate-700">
                                <div>
                                  {item.salaryBasis === 'monthly' ? 'Lương tháng' :
                                   item.salaryBasis === 'daily' ? 'Ngày công' :
                                   item.salaryBasis === 'hourly' ? 'Theo giờ' :
                                   item.salaryBasis === 'percent' ? `Theo KPI (${item.salaryPercent ?? 100}%)` : 'Theo bộ phận'}
                                </div>
                                {item.salaryBasis === 'hourly' && item.hourlyRate ? (
                                  <div className="text-[10px] text-slate-400 font-mono">{formatVND(item.hourlyRate)}/h</div>
                                ) : null}
                              </td>
                              <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-900">
                                {formatVND(item.baseSalary)}
                              </td>
                              <td className="px-3 py-2.5 text-slate-600">
                                {item.transferLocation && (
                                  <div className="font-medium text-blue-700">Đến: {item.transferLocation}</div>
                                )}
                                <div className="text-[11px] text-slate-500 truncate max-w-[150px]" title={item.note}>
                                  {item.note || '—'}
                                </div>
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  isOngoing ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                                }`}>
                                  {isOngoing ? 'Đang áp dụng' : 'Đã kết thúc'}
                                </span>
                              </td>
                              {canEditEmployees && (
                                <td className="px-3 py-2.5 text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handlePrintContractForPeriod(item);
                                      }}
                                      className="p-1.5 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded-lg cursor-pointer transition-colors"
                                      title="In Hợp đồng lao động theo giai đoạn này (Đối chiếu mức đóng BHXH)"
                                    >
                                      <Printer className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleEditWorkHistoryItem(item);
                                      }}
                                      className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg cursor-pointer transition-colors"
                                      title="Sửa giai đoạn này"
                                    >
                                      <Edit3 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRequestDeleteWorkHistoryItem(item, idx);
                                      }}
                                      className="p-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg cursor-pointer transition-colors"
                                      title="Xóa giai đoạn này"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                              )}
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Card 3: Form Thêm / Sửa giai đoạn */}
              {canEditEmployees && (
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <h4 className="font-bold text-slate-900 mb-3 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      {workHistoryForm.editingId ? <Edit3 className="w-4 h-4 text-blue-600" /> : <Plus className="w-4 h-4 text-emerald-600" />}
                      <span>{workHistoryForm.editingId ? 'Chỉnh Sửa Giai Đoạn Quá Trình Làm Việc' : 'Thêm Mới Giai Đoạn Quá Trình Làm Việc'}</span>
                    </span>
                    {workHistoryForm.editingId && (
                      <button
                        type="button"
                        onClick={resetWorkHistoryForm}
                        className="text-xs text-slate-500 hover:text-slate-800 underline cursor-pointer"
                      >
                        Hủy chế độ sửa
                      </button>
                    )}
                  </h4>

                  <form onSubmit={handleSaveWorkHistoryItem} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Từ Tháng (Bắt đầu) *
                        </label>
                        <input
                          type="month"
                          required
                          value={workHistoryForm.fromMonth}
                          onChange={e => setWorkHistoryForm({ ...workHistoryForm, fromMonth: e.target.value })}
                          className="w-full px-3 py-1.5 border border-slate-300 rounded-lg bg-white font-mono text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Đến Tháng (Kết thúc)
                        </label>
                        <input
                          type="month"
                          disabled={workHistoryForm.isOngoing}
                          value={workHistoryForm.toMonth}
                          onChange={e => setWorkHistoryForm({ ...workHistoryForm, toMonth: e.target.value })}
                          className={`w-full px-3 py-1.5 border border-slate-300 rounded-lg font-mono text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none ${
                            workHistoryForm.isOngoing ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-white'
                          }`}
                        />
                        <label className="flex items-center gap-1.5 text-[11px] text-slate-700 mt-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={workHistoryForm.isOngoing}
                            onChange={e => setWorkHistoryForm({ ...workHistoryForm, isOngoing: e.target.checked })}
                            className="rounded text-emerald-600 cursor-pointer"
                          />
                          <span>Đang áp dụng đến nay</span>
                        </label>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Phòng Ban *
                        </label>
                        <select
                          value={workHistoryForm.departmentId}
                          onChange={e => setWorkHistoryForm({ ...workHistoryForm, departmentId: e.target.value })}
                          className="w-full px-3 py-1.5 border border-slate-300 rounded-lg bg-white text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                        >
                          {departments.map(d => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Chức Vụ *
                        </label>
                        <select
                          value={workHistoryForm.positionId}
                          onChange={e => setWorkHistoryForm({ ...workHistoryForm, positionId: e.target.value })}
                          className="w-full px-3 py-1.5 border border-slate-300 rounded-lg bg-white text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                        >
                          {positions.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Trạng Thái Công Việc *
                        </label>
                        <select
                          value={workHistoryForm.workStatus}
                          onChange={e => setWorkHistoryForm({ ...workHistoryForm, workStatus: e.target.value as WorkStatus })}
                          className="w-full px-3 py-1.5 border border-slate-300 rounded-lg bg-white text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                        >
                          <option value="active">Chính thức (Đang làm việc)</option>
                          <option value="probation">Thử việc</option>
                          <option value="transferred">Điều chuyển công tác</option>
                          <option value="maternity">Nghỉ thai sản</option>
                          <option value="resigned">Đã nghỉ việc</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Hình Thức Lương *
                        </label>
                        <select
                          value={workHistoryForm.salaryBasis}
                          onChange={e => setWorkHistoryForm({ ...workHistoryForm, salaryBasis: e.target.value as SalaryCalculationBasis })}
                          className="w-full px-3 py-1.5 border border-slate-300 rounded-lg bg-white text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                        >
                          <option value="monthly">Lương tháng cố định</option>
                          <option value="daily">Theo ngày công thực tế</option>
                          <option value="hourly">Theo giờ (Hourly)</option>
                          <option value="percent">Theo % KPI</option>
                          <option value="department">Theo bộ phận</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Mức Lương Cơ Bản (VNĐ) *
                        </label>
                        <input
                          type="number"
                          required
                          step={1}
                          min={0}
                          value={workHistoryForm.baseSalary}
                          onChange={e => setWorkHistoryForm({ ...workHistoryForm, baseSalary: Number(e.target.value) })}
                          className="w-full px-3 py-1.5 border border-slate-300 rounded-lg bg-white font-mono font-bold text-slate-900 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                        />
                        <span className="text-[10px] text-emerald-700 mt-0.5 block font-mono">
                          {formatVND(workHistoryForm.baseSalary)} (đến hàng đơn vị)
                        </span>
                      </div>

                      {workHistoryForm.workStatus === 'transferred' ? (
                        <div>
                          <label className="block text-[11px] font-semibold text-blue-700 mb-1">
                            Đơn Vị / Chi Nhánh Đến
                          </label>
                          <input
                            type="text"
                            placeholder="Ví dụ: Chi nhánh Đà Nẵng"
                            value={workHistoryForm.transferLocation}
                            onChange={e => setWorkHistoryForm({ ...workHistoryForm, transferLocation: e.target.value })}
                            className="w-full px-3 py-1.5 border border-blue-300 rounded-lg bg-white text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                          />
                        </div>
                      ) : (
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            % Lương Hưởng
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={1}
                            value={workHistoryForm.salaryPercent}
                            onChange={e => setWorkHistoryForm({ ...workHistoryForm, salaryPercent: Number(e.target.value) })}
                            className="w-full px-3 py-1.5 border border-slate-300 rounded-lg bg-white font-mono text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                          />
                        </div>
                      )}

                      <div className="md:col-span-4">
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Lý Do / Quyết Định Bổ Nhiệm, Nâng Lương, Điều Chuyển
                        </label>
                        <input
                          type="text"
                          placeholder="Ví dụ: Quyết định bổ nhiệm số 12/QĐ-TGĐ, hoàn thành thời gian thử việc..."
                          value={workHistoryForm.note}
                          onChange={e => setWorkHistoryForm({ ...workHistoryForm, note: e.target.value })}
                          className="w-full px-3 py-1.5 border border-slate-300 rounded-lg bg-white text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                      <span className="text-[11px] text-slate-500 italic">
                        * Quá trình làm việc này sẽ tự động đồng bộ vào Bảng chấm công và Bảng lương của các tháng tương ứng.
                      </span>

                      <button
                        type="submit"
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <Save className="w-4 h-4" />
                        <span>{workHistoryForm.editingId ? 'Cập Nhật Giai Đoạn' : 'Lưu Giai Đoạn Mới'}</span>
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Card 4: Trực quan hóa diễn biến quá trình làm việc */}
              {targetHistory.length > 0 && (
                <div className="p-4 bg-white border border-slate-200 rounded-xl">
                  <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4 text-emerald-600" />
                    <span>Diễn Biến Quá Trình Công Tác & Chức Vụ Theo Dòng Thời Gian</span>
                  </h4>
                  <div className="flex items-center gap-2 overflow-x-auto pb-2">
                    {targetHistory.map((h, i) => (
                      <div
                        key={h.id}
                        className={`shrink-0 p-3 rounded-xl border text-xs min-w-[200px] ${
                          !h.toMonth 
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-medium shadow-xs' 
                            : 'bg-slate-50 border-slate-200 text-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                          <span>{h.fromMonth} → {!h.toMonth ? 'Nay' : h.toMonth}</span>
                          <span className={`px-1.5 py-0.2 rounded font-bold text-[9px] ${
                            h.workStatus === 'probation' ? 'bg-amber-100 text-amber-800' :
                            h.workStatus === 'transferred' ? 'bg-blue-100 text-blue-800' :
                            h.workStatus === 'maternity' ? 'bg-purple-100 text-purple-800' :
                            h.workStatus === 'resigned' ? 'bg-rose-100 text-rose-800' :
                            'bg-emerald-100 text-emerald-800'
                          }`}>
                            {h.workStatus === 'probation' ? 'Thử việc' :
                             h.workStatus === 'transferred' ? 'Điều chuyển' :
                             h.workStatus === 'maternity' ? 'Thai sản' :
                             h.workStatus === 'resigned' ? 'Nghỉ việc' : 'Chính thức'}
                          </span>
                        </div>
                        <div className="text-sm font-black text-slate-900 mt-1">
                          {posMap.get(h.positionId) || h.positionId}
                        </div>
                        <div className="text-[11px] text-slate-600">
                          {depMap.get(h.departmentId) || h.departmentId}
                        </div>
                        <div className="text-[11px] font-mono font-bold text-emerald-700 mt-1">
                          {formatVND(h.baseSalary)}
                        </div>
                        <div className="text-[10px] text-slate-500 truncate mt-0.5">
                          {h.note || (h.transferLocation ? `Đến: ${h.transferLocation}` : 'Quá trình công tác')}
                        </div>
                        {!h.toMonth && (
                          <span className="inline-block mt-1 text-[9px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded">
                            Hiện hành
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end pt-4 mt-6 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setWorkHistoryTarget(null)}
                className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl transition-colors cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog: Xóa Giai Đoạn Quá Trình Làm Việc */}
      {deleteWorkHistoryModal.isOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 bg-rose-100 text-rose-600 rounded-xl">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-sm">Xác Nhận Xóa Giai Đoạn Công Tác</h4>
                <p className="text-xs text-slate-500">Thao tác này sẽ loại bỏ giai đoạn khỏi quá trình làm việc</p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl mb-4 text-xs text-slate-700">
              Bạn có chắc chắn muốn xóa giai đoạn: <strong className="text-slate-900 font-semibold">{deleteWorkHistoryModal.periodLabel}</strong> không?
            </div>

            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setDeleteWorkHistoryModal({ isOpen: false, itemId: null, itemIndex: null, periodLabel: '' })}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                Hủy Bỏ
              </button>
              <button
                type="button"
                onClick={confirmDeleteWorkHistoryItem}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>Xác Nhận Xóa</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
