import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  Gift,
  Plus,
  Trash2,
  Edit3,
  Download,
  Search,
  CheckCircle2,
  Upload,
  FileSpreadsheet,
  Printer,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Calendar,
  ListChecks,
  Users,
  Layers,
  AlertTriangle,
  X,
  CheckSquare,
  Square,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import {
  SpecialAllowance,
  AllowanceCatalogItem,
  AllowanceType,
  Employee,
  SystemSettings,
  WorkStatus
} from '../types';
import { formatVND } from '../utils/payrollCalculator';
import { downloadAllowanceTemplate, readAllowanceExcel } from '../utils/excelHelper';
import { DEFAULT_ALLOWANCE_CATALOG } from '../data/initialData';
import * as XLSX from 'xlsx';
import { useAuthRole } from '../context/AuthRoleContext';
import { PrintAllowancesModal } from '../components/PrintAllowancesModal';

interface AllowancesViewProps {
  specialAllowances: SpecialAllowance[];
  employees: Employee[];
  settings?: SystemSettings;
  onUpdateSettings?: React.Dispatch<React.SetStateAction<SystemSettings>>;
  onAddAllowance: (allowance: SpecialAllowance) => void;
  onUpdateAllowance: (allowance: SpecialAllowance) => void;
  onDeleteAllowance: (id: string) => void;
  onBatchAddAllowances?: (items: SpecialAllowance[]) => void;
  onBatchUpsertAllowances?: (
    items: SpecialAllowance[],
    mode?: 'overwrite' | 'skip' | 'append'
  ) => void;
}

const ALLOWANCE_TYPE_LABELS: Record<AllowanceType, string> = {
  responsibility: 'Phụ cấp trách nhiệm',
  hazardous: 'Phụ cấp độc hại / nặng nhọc',
  travel_gas: 'Phụ cấp xăng xe / đi lại',
  phone: 'Phụ cấp điện thoại / liên lạc',
  uniform: 'Phụ cấp trang phục',
  concurrent: 'Phụ cấp kiêm nhiệm',
  seniority: 'Phụ cấp thâm niên',
  attendance: 'Phụ cấp chuyên cần',
  housing: 'Phụ cấp nhà ở / lưu trú',
  other: 'Phụ cấp khác'
};

const WORK_STATUS_LABELS: Record<WorkStatus, string> = {
  active: 'Đang làm việc',
  probation: 'Thử việc',
  maternity: 'Nghỉ thai sản',
  transferred: 'Điều chuyển',
  resigned: 'Đã nghỉ việc'
};

const expandMonthRange = (fromMonth: string, toMonth: string): string[] => {
  if (!/^\d{4}-\d{2}$/.test(fromMonth)) return [];
  if (!/^\d{4}-\d{2}$/.test(toMonth) || toMonth < fromMonth) return [fromMonth];
  const [fy, fm] = fromMonth.split('-').map(Number);
  const [ty, tm] = toMonth.split('-').map(Number);
  const result: string[] = [];
  let y = fy;
  let m = fm;
  while ((y < ty || (y === ty && m <= tm)) && result.length < 24) {
    result.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return result;
};

const formatMonthVN = (ym: string) => {
  if (!ym || !ym.includes('-')) return ym;
  const [y, m] = ym.split('-');
  return `T${m}/${y}`;
};

export const AllowancesView: React.FC<AllowancesViewProps> = ({
  specialAllowances,
  employees,
  settings,
  onUpdateSettings,
  onAddAllowance,
  onUpdateAllowance,
  onDeleteAllowance,
  onBatchAddAllowances,
  onBatchUpsertAllowances
}) => {
  const { canEditEmployees, canExportData } = useAuthRole();

  const defaultMonth = `${settings?.currentYear || 2026}-${String(settings?.currentMonth || 9).padStart(2, '0')}`;

  // Sub-tab switcher: 'applied' = Bảng phụ cấp đã áp dụng theo tháng | 'catalog' = Danh sách các khoản phụ cấp & Áp dụng hàng loạt
  const [activeSubTab, setActiveSubTab] = useState<'applied' | 'catalog'>('applied');

  // Shared inline notices (tránh dùng window.alert)
  const [viewNotice, setViewNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const showNotice = (type: 'success' | 'error', text: string) => {
    setViewNotice({ type, text });
  };

  // ==================== STATE CHO TAB 1 (PHỤ CẤP ĐÃ ÁP DỤNG) ====================
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMonth, setFilterMonth] = useState<string>('all');

  type AllowanceSortField = 'none' | 'employee' | 'taxClassification' | 'month' | 'amount' | 'name';
  const [sortField, setSortField] = useState<AllowanceSortField>('none');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<SpecialAllowance | null>(null);
  const [empSearchQuery, setEmpSearchQuery] = useState('');
  const [isEmpSearchOpen, setIsEmpSearchOpen] = useState(false);
  const [singleFormError, setSingleFormError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState<Partial<SpecialAllowance>>({
    employeeId: '',
    allowanceType: 'responsibility',
    catalogId: '',
    name: 'Phụ cấp trách nhiệm',
    amount: 1000000,
    isTaxable: true,
    month: defaultMonth,
    note: ''
  });

  // ==================== DANH MỤC CÁC KHOẢN PHỤ CẤP ====================
  const allowanceCatalog: AllowanceCatalogItem[] = useMemo(() => {
    if (settings && Array.isArray(settings.allowanceCatalog)) {
      return settings.allowanceCatalog;
    }
    return DEFAULT_ALLOWANCE_CATALOG;
  }, [settings]);

  const updateCatalog = (updater: (prev: AllowanceCatalogItem[]) => AllowanceCatalogItem[]) => {
    if (!onUpdateSettings) {
      showNotice('error', 'Không thể cập nhật danh mục vì thiếu hàm lưu cấu hình hệ thống.');
      return;
    }
    onUpdateSettings(prev => {
      const current = Array.isArray(prev.allowanceCatalog) ? prev.allowanceCatalog : DEFAULT_ALLOWANCE_CATALOG;
      return {
        ...prev,
        allowanceCatalog: updater(current)
      };
    });
  };

  // ==================== STATE CHO TAB 2 (DANH SÁCH PHỤ CẤP & ÁP DỤNG HÀNG LOẠT) ====================
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogTaxFilter, setCatalogTaxFilter] = useState<'all' | 'taxable' | 'exempt'>('all');
  const [isCatalogModalOpen, setIsCatalogModalOpen] = useState(false);
  const [editingCatalogItem, setEditingCatalogItem] = useState<AllowanceCatalogItem | null>(null);
  const [catalogFormError, setCatalogFormError] = useState<string | null>(null);
  const [deleteCatalogConfirmId, setDeleteCatalogConfirmId] = useState<string | null>(null);

  const [catalogForm, setCatalogForm] = useState<Partial<AllowanceCatalogItem>>({
    code: '',
    name: '',
    allowanceType: 'other',
    defaultAmount: 500000,
    isTaxable: true,
    targetSummary: '',
    note: '',
    isActive: true
  });

  // Bulk apply workspace state
  const bulkSectionRef = useRef<HTMLDivElement>(null);
  const firstActiveCatalog = useMemo(
    () => allowanceCatalog.find(c => c.isActive !== false) || allowanceCatalog[0] || null,
    [allowanceCatalog]
  );

  const [bulkCatalogId, setBulkCatalogId] = useState<string>(firstActiveCatalog?.id || '');
  const [bulkAmount, setBulkAmount] = useState<number>(firstActiveCatalog?.defaultAmount ?? 1000000);
  const [bulkIsTaxable, setBulkIsTaxable] = useState<boolean>(firstActiveCatalog?.isTaxable ?? true);
  const [bulkNote, setBulkNote] = useState<string>(firstActiveCatalog?.note || '');
  const [bulkMonthMode, setBulkMonthMode] = useState<'single' | 'range'>('single');
  const [bulkSingleMonth, setBulkSingleMonth] = useState<string>(defaultMonth);
  const [bulkFromMonth, setBulkFromMonth] = useState<string>(defaultMonth);
  const [bulkToMonth, setBulkToMonth] = useState<string>(defaultMonth);
  const [bulkDuplicateMode, setBulkDuplicateMode] = useState<'overwrite' | 'skip' | 'append'>('overwrite');

  // Bulk target filters & selected employees
  const [targetDeptFilter, setTargetDeptFilter] = useState<string>('all');
  const [targetPosFilter, setTargetPosFilter] = useState<string>('all');
  const [targetStatusFilter, setTargetStatusFilter] = useState<'active_probation' | 'active' | 'probation' | 'all'>('active_probation');
  const [targetSearch, setTargetSearch] = useState<string>('');
  const [selectedEmpIds, setSelectedEmpIds] = useState<string[]>([]);
  const [customEmpAmounts, setCustomEmpAmounts] = useState<Record<string, number>>({});

  // Sync bulkCatalogId if selected catalog item disappears or initializes lazily
  useEffect(() => {
    if (!bulkCatalogId && firstActiveCatalog) {
      setBulkCatalogId(firstActiveCatalog.id);
      setBulkAmount(firstActiveCatalog.defaultAmount);
      setBulkIsTaxable(firstActiveCatalog.isTaxable);
      setBulkNote(firstActiveCatalog.note || '');
    }
  }, [bulkCatalogId, firstActiveCatalog]);

  const selectedCatalogItem = useMemo(
    () => allowanceCatalog.find(c => c.id === bulkCatalogId) || null,
    [allowanceCatalog, bulkCatalogId]
  );

  const handleSelectCatalogForBulk = (item: AllowanceCatalogItem, scrollToBulk = false) => {
    setBulkCatalogId(item.id);
    setBulkAmount(item.defaultAmount);
    setBulkIsTaxable(item.isTaxable);
    setBulkNote(item.note || '');
    setCustomEmpAmounts({});
    if (scrollToBulk && bulkSectionRef.current) {
      bulkSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Maps
  const empMap = useMemo(() => new Map(employees.map(e => [e.id, e])), [employees]);
  const depMap = useMemo(
    () => new Map((settings?.departments || []).map(d => [d.id, d.name])),
    [settings?.departments]
  );
  const posMap = useMemo(
    () => new Map((settings?.positions || []).map(p => [p.id, p.name])),
    [settings?.positions]
  );

  // ==================== TABS & SORTING LOGIC (TAB 1) ====================
  const handleToggleSort = (field: AllowanceSortField) => {
    if (sortField === field) {
      if (sortDirection === 'asc') setSortDirection('desc');
      else {
        setSortField('none');
        setSortDirection('asc');
      }
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    set.add(defaultMonth);
    specialAllowances.forEach(a => {
      if (a.month) set.add(a.month);
    });
    return Array.from(set).sort().reverse();
  }, [specialAllowances, defaultMonth]);

  const matchingEmployees = useMemo(() => {
    const q = empSearchQuery.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(e =>
      e.fullName.toLowerCase().includes(q) ||
      e.employeeCode.toLowerCase().includes(q) ||
      (e.idCardNumber && e.idCardNumber.toLowerCase().includes(q)) ||
      (depMap.get(e.departmentId) || '').toLowerCase().includes(q)
    );
  }, [employees, empSearchQuery, depMap]);

  const baseFilteredAllowances = useMemo(() => {
    const search = searchTerm.toLowerCase();
    return specialAllowances.filter(a => {
      const emp = empMap.get(a.employeeId);
      const matchSearch =
        a.name.toLowerCase().includes(search) ||
        (emp && emp.fullName.toLowerCase().includes(search)) ||
        (emp && emp.employeeCode.toLowerCase().includes(search));

      const matchMonth = filterMonth === 'all' || a.month === filterMonth;
      return matchSearch && matchMonth;
    });
  }, [specialAllowances, empMap, searchTerm, filterMonth]);

  const sortedAllowances = useMemo(() => {
    if (sortField === 'none') return baseFilteredAllowances;

    return [...baseFilteredAllowances].sort((a, b) => {
      let cmp = 0;
      const empA = empMap.get(a.employeeId);
      const empB = empMap.get(b.employeeId);

      if (sortField === 'employee') {
        cmp = (empA?.fullName || '').localeCompare(empB?.fullName || '', 'vi');
      } else if (sortField === 'taxClassification') {
        cmp = (a.isTaxable ? 1 : 0) - (b.isTaxable ? 1 : 0);
      } else if (sortField === 'month') {
        cmp = (a.month || '').localeCompare(b.month || '');
      } else if (sortField === 'amount') {
        cmp = (a.amount || 0) - (b.amount || 0);
      } else if (sortField === 'name') {
        cmp = a.name.localeCompare(b.name, 'vi');
      }

      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [baseFilteredAllowances, sortField, sortDirection, empMap]);

  const filteredAllowances = sortedAllowances;

  const totalTaxable = useMemo(
    () => baseFilteredAllowances.filter(a => a.isTaxable).reduce((sum, a) => sum + a.amount, 0),
    [baseFilteredAllowances]
  );
  const totalExempt = useMemo(
    () => baseFilteredAllowances.filter(a => !a.isTaxable).reduce((sum, a) => sum + a.amount, 0),
    [baseFilteredAllowances]
  );

  // ==================== TAB 1 CRUD HANDLERS ====================
  const handleOpenAdd = () => {
    setEditingItem(null);
    setEmpSearchQuery('');
    setIsEmpSearchOpen(false);
    setSingleFormError(null);
    setFormData({
      id: `allow-${Date.now()}`,
      employeeId: '',
      allowanceType: 'responsibility',
      catalogId: '',
      name: 'Phụ cấp trách nhiệm',
      amount: 1000000,
      isTaxable: true,
      month: filterMonth !== 'all' ? filterMonth : defaultMonth,
      note: ''
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item: SpecialAllowance) => {
    setEditingItem(item);
    setEmpSearchQuery('');
    setIsEmpSearchOpen(false);
    setSingleFormError(null);
    setFormData(item);
    setIsModalOpen(true);
  };

  const handleSubmitSingle = (e: React.FormEvent) => {
    e.preventDefault();
    setSingleFormError(null);

    if (!formData.employeeId) {
      setSingleFormError('Vui lòng tìm và chọn Nhân Viên Được Hưởng!');
      return;
    }
    if (!formData.name || !formData.name.trim()) {
      setSingleFormError('Vui lòng nhập Tên Khoản Phụ Cấp.');
      return;
    }
    if (!formData.amount || Number(formData.amount) <= 0) {
      setSingleFormError('Số tiền phụ cấp phải lớn hơn 0.');
      return;
    }

    const item: SpecialAllowance = {
      id: formData.id || `allow-${Date.now()}`,
      employeeId: formData.employeeId,
      allowanceType: formData.allowanceType || 'other',
      catalogId: formData.catalogId || undefined,
      name: formData.name.trim(),
      amount: Number(formData.amount) || 0,
      isTaxable: Boolean(formData.isTaxable),
      month: formData.month || defaultMonth,
      note: formData.note || ''
    };

    if (editingItem) {
      onUpdateAllowance(item);
      showNotice('success', `Đã cập nhật khoản phụ cấp "${item.name}" cho ${empMap.get(item.employeeId)?.fullName || 'nhân viên'}.`);
    } else {
      onAddAllowance(item);
      showNotice('success', `Đã thêm khoản phụ cấp "${item.name}" cho ${empMap.get(item.employeeId)?.fullName || 'nhân viên'}.`);
    }
    setIsModalOpen(false);
  };

  const handleExportExcel = () => {
    const rows = specialAllowances.map((a, idx) => {
      const emp = empMap.get(a.employeeId);
      return {
        'STT': idx + 1,
        'Mã Nhân Viên': emp?.employeeCode || '',
        'Họ Tên Nhân Viên': emp?.fullName || '',
        'Tên Khoản Phụ Cấp': a.name,
        'Số Tiền (VNĐ)': a.amount,
        'Tính Thuế TNCN': a.isTaxable ? 'Có tính thuế' : 'Miễn thuế',
        'Tháng Áp Dụng': a.month,
        'Ghi Chú': a.note || ''
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Phu_Cap_Dac_Thu');
    XLSX.writeFile(wb, `Danh_Sach_Phu_Cap_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const imported = await readAllowanceExcel(file, employees);
      if (imported.length === 0) {
        showNotice('error', 'File Excel không có dữ liệu phụ cấp hoặc không đúng định dạng.');
        return;
      }
      if (onBatchAddAllowances) {
        onBatchAddAllowances(imported);
      } else {
        imported.forEach(item => onAddAllowance(item));
      }
      showNotice('success', `Đã nhập thành công ${imported.length} khoản phụ cấp đặc thù từ file Excel!`);
    } catch (err: any) {
      showNotice('error', `Lỗi khi đọc file Excel phụ cấp: ${err?.message || 'Không xác định'}`);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ==================== TAB 2: CATALOG FILTER & CRUD ====================
  const filteredCatalog = useMemo(() => {
    const q = catalogSearch.trim().toLowerCase();
    return allowanceCatalog.filter(item => {
      const matchSearch =
        !q ||
        item.code.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q) ||
        (item.targetSummary || '').toLowerCase().includes(q) ||
        (item.note || '').toLowerCase().includes(q);
      const matchTax =
        catalogTaxFilter === 'all' ||
        (catalogTaxFilter === 'taxable' && item.isTaxable) ||
        (catalogTaxFilter === 'exempt' && !item.isTaxable);
      return matchSearch && matchTax;
    });
  }, [allowanceCatalog, catalogSearch, catalogTaxFilter]);

  const handleOpenAddCatalog = () => {
    setEditingCatalogItem(null);
    setCatalogFormError(null);
    const nextCodeNum = allowanceCatalog.length + 1;
    setCatalogForm({
      id: `alw-cat-${Date.now()}`,
      code: `PC-${String(nextCodeNum).padStart(2, '0')}`,
      name: '',
      allowanceType: 'other',
      defaultAmount: 500000,
      isTaxable: true,
      targetSummary: '',
      note: '',
      isActive: true
    });
    setIsCatalogModalOpen(true);
  };

  const handleOpenEditCatalog = (item: AllowanceCatalogItem) => {
    setEditingCatalogItem(item);
    setCatalogFormError(null);
    setCatalogForm({ ...item });
    setIsCatalogModalOpen(true);
  };

  const handleSubmitCatalog = (e: React.FormEvent) => {
    e.preventDefault();
    setCatalogFormError(null);

    const code = (catalogForm.code || '').trim().toUpperCase();
    const name = (catalogForm.name || '').trim();
    const defaultAmount = Math.max(0, Number(catalogForm.defaultAmount) || 0);

    if (!code) {
      setCatalogFormError('Vui lòng nhập Mã khoản phụ cấp.');
      return;
    }
    if (!name) {
      setCatalogFormError('Vui lòng nhập Tên khoản phụ cấp.');
      return;
    }

    const savedItem: AllowanceCatalogItem = {
      id: editingCatalogItem?.id || catalogForm.id || `alw-cat-${Date.now()}`,
      code,
      name,
      allowanceType: catalogForm.allowanceType || 'other',
      defaultAmount,
      isTaxable: Boolean(catalogForm.isTaxable),
      targetSummary: (catalogForm.targetSummary || '').trim(),
      note: (catalogForm.note || '').trim(),
      isActive: catalogForm.isActive !== false
    };

    updateCatalog(prev => {
      if (editingCatalogItem) {
        return prev.map(c => (c.id === savedItem.id ? savedItem : c));
      }
      return [...prev, savedItem];
    });

    if (bulkCatalogId === savedItem.id || !bulkCatalogId) {
      setBulkCatalogId(savedItem.id);
      setBulkAmount(savedItem.defaultAmount);
      setBulkIsTaxable(savedItem.isTaxable);
      setBulkNote(savedItem.note || '');
    }

    setIsCatalogModalOpen(false);
    showNotice(
      'success',
      editingCatalogItem
        ? `Đã cập nhật khoản phụ cấp "${savedItem.name}" trong danh mục.`
        : `Đã thêm mới khoản phụ cấp "${savedItem.name}" vào danh mục.`
    );
  };

  const handleConfirmDeleteCatalog = (id: string) => {
    const target = allowanceCatalog.find(c => c.id === id);
    updateCatalog(prev => prev.filter(c => c.id !== id));
    setDeleteCatalogConfirmId(null);
    if (bulkCatalogId === id) {
      const next = allowanceCatalog.find(c => c.id !== id);
      if (next) {
        handleSelectCatalogForBulk(next, false);
      } else {
        setBulkCatalogId('');
      }
    }
    showNotice('success', `Đã xóa khoản phụ cấp "${target?.name || id}" khỏi danh mục.`);
  };

  // ==================== TAB 2: BULK TARGET FILTERING & APPLY ====================
  const targetMonths = useMemo(() => {
    if (bulkMonthMode === 'single') {
      return /^\d{4}-\d{2}$/.test(bulkSingleMonth) ? [bulkSingleMonth] : [defaultMonth];
    }
    return expandMonthRange(bulkFromMonth, bulkToMonth);
  }, [bulkMonthMode, bulkSingleMonth, bulkFromMonth, bulkToMonth, defaultMonth]);

  const filteredTargetEmployees = useMemo(() => {
    const q = targetSearch.trim().toLowerCase();
    return employees.filter(emp => {
      if (targetStatusFilter === 'active_probation') {
        if (emp.workStatus !== 'active' && emp.workStatus !== 'probation') return false;
      } else if (targetStatusFilter !== 'all') {
        if (emp.workStatus !== targetStatusFilter) return false;
      }
      if (targetDeptFilter !== 'all' && emp.departmentId !== targetDeptFilter) return false;
      if (targetPosFilter !== 'all' && emp.positionId !== targetPosFilter) return false;
      if (q) {
        const deptName = (depMap.get(emp.departmentId) || '').toLowerCase();
        const posName = (posMap.get(emp.positionId) || '').toLowerCase();
        const hit =
          emp.fullName.toLowerCase().includes(q) ||
          emp.employeeCode.toLowerCase().includes(q) ||
          (emp.idCardNumber && emp.idCardNumber.toLowerCase().includes(q)) ||
          deptName.includes(q) ||
          posName.includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [employees, targetStatusFilter, targetDeptFilter, targetPosFilter, targetSearch, depMap, posMap]);

  const selectedTargetSet = useMemo(() => new Set(selectedEmpIds), [selectedEmpIds]);

  const handleToggleSelectEmp = (empId: string) => {
    setSelectedEmpIds(prev =>
      prev.includes(empId) ? prev.filter(id => id !== empId) : [...prev, empId]
    );
  };

  const handleSelectAllFiltered = () => {
    const filteredIds = filteredTargetEmployees.map(e => e.id);
    setSelectedEmpIds(prev => Array.from(new Set([...prev, ...filteredIds])));
  };

  const handleDeselectAllFiltered = () => {
    const filteredSet = new Set(filteredTargetEmployees.map(e => e.id));
    setSelectedEmpIds(prev => prev.filter(id => !filteredSet.has(id)));
  };

  const handleSelectManagers = () => {
    const managerIds = filteredTargetEmployees
      .filter(e => {
        const posName = (posMap.get(e.positionId) || '').toLowerCase();
        return (
          posName.includes('giám đốc') ||
          posName.includes('kế toán trưởng') ||
          posName.includes('trưởng phòng') ||
          posName.includes('quản đốc')
        );
      })
      .map(e => e.id);
    setSelectedEmpIds(prev => Array.from(new Set([...prev, ...managerIds])));
  };

  const getEmployeeEffectiveBulkAmount = (empId: string): number => {
    if (customEmpAmounts[empId] !== undefined) {
      return Math.max(0, Number(customEmpAmounts[empId]) || 0);
    }
    return Math.max(0, Number(bulkAmount) || 0);
  };

  // Kiểm tra nhân viên đã có khoản phụ cấp đang chọn trong tháng áp dụng hay chưa
  const existingMatchesByEmployee = useMemo(() => {
    const map = new Map<string, SpecialAllowance[]>();
    if (!selectedCatalogItem) return map;
    const catNameLower = selectedCatalogItem.name.trim().toLowerCase();
    const targetMonthSet = new Set(targetMonths);

    specialAllowances.forEach(sa => {
      if ((sa.id && sa.id.startsWith('adv-')) || (sa.name || '').toLowerCase().includes('tạm ứng')) return;
      if (!targetMonthSet.has(sa.month)) return;
      const sameCatalog = sa.catalogId && sa.catalogId === selectedCatalogItem.id;
      const sameName = (sa.name || '').trim().toLowerCase() === catNameLower;
      if (sameCatalog || sameName) {
        const list = map.get(sa.employeeId) || [];
        list.push(sa);
        map.set(sa.employeeId, list);
      }
    });

    return map;
  }, [specialAllowances, selectedCatalogItem, targetMonths]);

  // Tổng kinh phí dự kiến 1 tháng cho các đối tượng đang chọn
  const selectedMonthlyBudget = useMemo(() => {
    return selectedEmpIds.reduce((sum, empId) => {
      if (!empMap.has(empId)) return sum;
      return sum + getEmployeeEffectiveBulkAmount(empId);
    }, 0);
  }, [selectedEmpIds, empMap, customEmpAmounts, bulkAmount]);

  const handleApplyBulkAllowances = () => {
    if (!canEditEmployees) return;

    if (!selectedCatalogItem) {
      showNotice('error', 'Vui lòng chọn hoặc tạo một khoản phụ cấp trong danh sách trước khi áp dụng.');
      return;
    }
    if (targetMonths.length === 0) {
      showNotice('error', 'Tháng áp dụng không hợp lệ. Vui lòng kiểm tra lại.');
      return;
    }
    const validSelectedIds = selectedEmpIds.filter(id => empMap.has(id));
    if (validSelectedIds.length === 0) {
      showNotice('error', 'Vui lòng tích chọn ít nhất 1 nhân viên để áp dụng phụ cấp hàng loạt.');
      return;
    }

    const baseAmount = Math.max(0, Number(bulkAmount) || 0);
    const anyZero = validSelectedIds.some(id => getEmployeeEffectiveBulkAmount(id) <= 0);
    if (baseAmount <= 0 && anyZero) {
      showNotice('error', 'Mức phụ cấp được hưởng phải lớn hơn 0 VNĐ.');
      return;
    }

    const stamp = Date.now();
    const itemsToApply: SpecialAllowance[] = [];

    validSelectedIds.forEach((empId, empIdx) => {
      const empAmt = getEmployeeEffectiveBulkAmount(empId);
      if (empAmt <= 0) return;
      targetMonths.forEach((m, mIdx) => {
        itemsToApply.push({
          id: `allow-bulk-${stamp}-${empIdx}-${mIdx}`,
          employeeId: empId,
          month: m,
          allowanceType: selectedCatalogItem.allowanceType || 'other',
          catalogId: selectedCatalogItem.id,
          name: selectedCatalogItem.name,
          amount: empAmt,
          isTaxable: bulkIsTaxable,
          note: bulkNote.trim() || selectedCatalogItem.note || ''
        });
      });
    });

    if (itemsToApply.length === 0) {
      showNotice('error', 'Không có bản ghi phụ cấp hợp lệ nào để áp dụng.');
      return;
    }

    // Tính số lượng tạo mới / cập nhật / bỏ qua từ dữ liệu hiện tại để thông báo chính xác
    const normalizedName = selectedCatalogItem.name.trim().toLowerCase();
    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    itemsToApply.forEach(item => {
      const exists = specialAllowances.some(existing => {
        if ((existing.id && existing.id.startsWith('adv-')) || (existing.name || '').toLowerCase().includes('tạm ứng')) {
          return false;
        }
        if (existing.employeeId !== item.employeeId || existing.month !== item.month) return false;
        if (item.catalogId && existing.catalogId && existing.catalogId === item.catalogId) return true;
        return (existing.name || '').trim().toLowerCase() === normalizedName;
      });
      if (exists) {
        if (bulkDuplicateMode === 'overwrite') updatedCount += 1;
        else if (bulkDuplicateMode === 'skip') skippedCount += 1;
        else createdCount += 1;
      } else {
        createdCount += 1;
      }
    });

    if (onBatchUpsertAllowances) {
      onBatchUpsertAllowances(itemsToApply, bulkDuplicateMode);
    } else if (onBatchAddAllowances) {
      onBatchAddAllowances(itemsToApply);
    } else {
      itemsToApply.forEach(item => onAddAllowance(item));
    }

    const monthSummary =
      targetMonths.length === 1
        ? `Tháng ${targetMonths[0].split('-')[1]}/${targetMonths[0].split('-')[0]}`
        : `${targetMonths.length} tháng (${formatMonthVN(targetMonths[0])} → ${formatMonthVN(targetMonths[targetMonths.length - 1])})`;

    showNotice(
      'success',
      `Đã áp dụng "${selectedCatalogItem.name}" cho ${validSelectedIds.length} nhân viên trong ${monthSummary}: Tạo mới ${createdCount}, Cập nhật ${updatedCount}, Bỏ qua ${skippedCount} bản ghi.`
    );
  };

  // Thống kê nhanh cho Tab 2
  const catalogStats = useMemo(() => {
    const activeCount = allowanceCatalog.filter(c => c.isActive !== false).length;
    const taxableCount = allowanceCatalog.filter(c => c.isTaxable).length;
    const exemptCount = allowanceCatalog.filter(c => !c.isTaxable).length;
    const appliedInCurrentMonth = specialAllowances.filter(
      a => a.month === defaultMonth && !(a.id || '').startsWith('adv-')
    ).length;
    return { activeCount, taxableCount, exemptCount, appliedInCurrentMonth };
  }, [allowanceCatalog, specialAllowances, defaultMonth]);

  return (
    <div className="space-y-6">
      {/* Sub-Tab Switcher */}
      <div className="bg-white p-2.5 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveSubTab('applied')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeSubTab === 'applied'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Gift className="w-4 h-4" />
            <span>Bảng Phụ Cấp Đã Áp Dụng (Theo Tháng)</span>
            <span
              className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono ${
                activeSubTab === 'applied' ? 'bg-emerald-700/80 text-white' : 'bg-slate-200 text-slate-700'
              }`}
            >
              {specialAllowances.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('catalog')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeSubTab === 'catalog'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <ListChecks className="w-4 h-4" />
            <span>Danh Sách Các Khoản Phụ Cấp & Áp Dụng Hàng Loạt</span>
            <span
              className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono ${
                activeSubTab === 'catalog' ? 'bg-emerald-700/80 text-white' : 'bg-slate-200 text-slate-700'
              }`}
            >
              {allowanceCatalog.length}
            </span>
          </button>
        </div>

        <div className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 flex items-center gap-2">
          <Calendar className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span>
            Kỳ lương hiện tại: <strong className="text-slate-900 font-mono">{formatMonthVN(defaultMonth)}</strong>
          </span>
        </div>
      </div>

      {/* Inline Notification Banner */}
      {viewNotice && (
        <div
          className={`p-3.5 rounded-xl text-xs font-semibold flex items-center justify-between gap-3 border animate-in fade-in ${
            viewNotice.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {viewNotice.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{viewNotice.text}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {viewNotice.type === 'success' && activeSubTab === 'catalog' && (
              <button
                type="button"
                onClick={() => {
                  setFilterMonth(targetMonths[0] || 'all');
                  setActiveSubTab('applied');
                }}
                className="px-2.5 py-1 bg-white border border-emerald-300 text-emerald-800 rounded-lg hover:bg-emerald-100 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
              >
                <span>Xem Bảng Đã Áp Dụng</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setViewNotice(null)}
              className="p-1 hover:bg-white/70 rounded-lg cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ==================== TAB 1: BẢNG PHỤ CẤP ĐÃ ÁP DỤNG THEO THÁNG ==================== */}
      {activeSubTab === 'applied' && (
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div>
              <h2 className="text-xl font-black text-slate-900 tracking-tight">Phụ Cấp Đặc Thù Theo Tháng</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Quản lý các khoản phụ cấp trách nhiệm, chuyên cần, độc hại, xăng xe công tác... Phân loại tính thuế & miễn thuế TNCN
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
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
                    title="Nhập danh sách phụ cấp từ Excel"
                  >
                    <Upload className="w-4 h-4 text-slate-500" />
                    <span>Nhập Excel</span>
                  </button>

                  <button
                    onClick={downloadAllowanceTemplate}
                    className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition-colors cursor-pointer"
                    title="Tải mẫu Excel chuẩn phụ cấp đặc thù"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                    <span>Tải Mẫu Excel</span>
                  </button>
                </>
              )}

              {canExportData && (
                <>
                  <button
                    onClick={() => setIsPrintModalOpen(true)}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 font-semibold text-xs rounded-xl transition-colors cursor-pointer"
                    title="In bảng tổng hợp các khoản phụ cấp đặc thù"
                  >
                    <Printer className="w-4 h-4 text-emerald-600" />
                    <span>In Phụ Cấp Đặc Thù</span>
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
                <>
                  <button
                    type="button"
                    onClick={() => setActiveSubTab('catalog')}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 font-bold text-xs rounded-xl transition-colors cursor-pointer"
                    title="Mở danh sách các khoản phụ cấp để chọn đối tượng áp dụng hàng loạt"
                  >
                    <Users className="w-4 h-4 text-indigo-600" />
                    <span>Áp Dụng Hàng Loạt</span>
                  </button>

                  <button
                    onClick={handleOpenAdd}
                    className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Thêm Phụ Cấp Mới</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-slate-500 font-semibold uppercase tracking-wider block">
                Tổng Khoản Phụ Cấp {filterMonth !== 'all' ? `(${formatMonthVN(filterMonth)})` : ''}
              </span>
              <div className="text-xl font-black text-slate-900 mt-1">
                {formatVND(totalTaxable + totalExempt)}
              </div>
              <span className="text-slate-400 mt-0.5 block">{baseFilteredAllowances.length} khoản đang hiển thị</span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-slate-500 font-semibold uppercase tracking-wider block">Phụ Cấp Phải Tính Thuế TNCN</span>
              <div className="text-xl font-black font-mono text-red-600 mt-1">
                {formatVND(totalTaxable)}
              </div>
              <span className="text-slate-400 mt-0.5 block">Trách nhiệm, chuyên cần, hiệu quả...</span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-slate-500 font-semibold uppercase tracking-wider block">Phụ Cấp Miễn Thuế TNCN</span>
              <div className="text-xl font-black font-mono text-emerald-700 mt-1">
                {formatVND(totalExempt)}
              </div>
              <span className="text-slate-400 mt-0.5 block">Xăng xe công tác, trang phục, độc hại...</span>
            </div>
          </div>

          {/* Search, Lọc theo tháng & Sắp xếp */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs text-xs space-y-3">
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Tìm theo Tên Phụ Cấp, Tên Nhân Viên, Mã NV..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5">
                  <Calendar className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="font-bold text-slate-600 text-[11px] whitespace-nowrap">Tháng áp dụng:</span>
                  <select
                    value={filterMonth}
                    onChange={e => setFilterMonth(e.target.value)}
                    className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none cursor-pointer"
                  >
                    <option value="all">Tất cả các tháng ({specialAllowances.length})</option>
                    {availableMonths.map(m => (
                      <option key={m} value={m}>
                        Tháng {m.split('-')[1]}/{m.split('-')[0]}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5">
                  <ArrowUpDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span className="font-bold text-slate-600 text-[11px] whitespace-nowrap">Sắp xếp:</span>
                  <select
                    value={sortField}
                    onChange={e => setSortField(e.target.value as any)}
                    className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none cursor-pointer"
                  >
                    <option value="none">Mặc định</option>
                    <option value="employee">Nhân viên hưởng</option>
                    <option value="taxClassification">Phân loại thuế TNCN</option>
                    <option value="month">Tháng áp dụng</option>
                    <option value="amount">Số tiền phụ cấp</option>
                    <option value="name">Tên khoản phụ cấp</option>
                  </select>
                  {sortField !== 'none' && (
                    <button
                      type="button"
                      onClick={() => setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'))}
                      className="p-1 text-slate-600 hover:text-emerald-700 hover:bg-slate-200 rounded transition-colors"
                      title={sortDirection === 'asc' ? 'Đang tăng dần (A → Z). Nhấn để giảm dần' : 'Đang giảm dần (Z → A). Nhấn để tăng dần'}
                    >
                      {sortDirection === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-emerald-600" /> : <ArrowDown className="w-3.5 h-3.5 text-emerald-600" />}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {(filterMonth !== 'all' || searchTerm || sortField !== 'none') && (
              <div className="flex items-center justify-between p-2 bg-slate-50 rounded-lg text-[11px] text-slate-600">
                <span>
                  Đang hiển thị <strong>{filteredAllowances.length}</strong> / {specialAllowances.length} khoản phụ cấp
                  {filterMonth !== 'all' && <> cho <strong>Tháng {filterMonth.split('-')[1]}/{filterMonth.split('-')[0]}</strong></>}.
                </span>
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setFilterMonth('all');
                    setSortField('none');
                  }}
                  className="text-emerald-700 hover:underline font-bold"
                >
                  Xóa bộ lọc & sắp xếp
                </button>
              </div>
            )}
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 uppercase font-semibold border-b border-slate-200">
                  <tr>
                    <th
                      onClick={() => handleToggleSort('employee')}
                      className="px-4 py-3 cursor-pointer hover:bg-slate-100/80 transition-colors select-none"
                      title="Nhấn để sắp xếp theo Nhân Viên Hưởng"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Nhân Viên Hưởng</span>
                        {sortField === 'employee' ? (
                          sortDirection === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-emerald-600" /> : <ArrowDown className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-300 opacity-70" />
                        )}
                      </div>
                    </th>
                    <th
                      onClick={() => handleToggleSort('name')}
                      className="px-4 py-3 cursor-pointer hover:bg-slate-100/80 transition-colors select-none"
                      title="Nhấn để sắp xếp theo Tên Khoản Phụ Cấp"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Tên Khoản Phụ Cấp</span>
                        {sortField === 'name' ? (
                          sortDirection === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-emerald-600" /> : <ArrowDown className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-300 opacity-70" />
                        )}
                      </div>
                    </th>
                    <th
                      onClick={() => handleToggleSort('amount')}
                      className="px-4 py-3 text-right cursor-pointer hover:bg-slate-100/80 transition-colors select-none"
                      title="Nhấn để sắp xếp theo Số Tiền"
                    >
                      <div className="flex items-center justify-end gap-1.5">
                        <span>Số Tiền (VNĐ)</span>
                        {sortField === 'amount' ? (
                          sortDirection === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-emerald-600" /> : <ArrowDown className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-300 opacity-70" />
                        )}
                      </div>
                    </th>
                    <th
                      onClick={() => handleToggleSort('taxClassification')}
                      className="px-4 py-3 text-center cursor-pointer hover:bg-slate-100/80 transition-colors select-none"
                      title="Nhấn để sắp xếp theo Phân Loại Thuế TNCN"
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        <span>Phân Loại Thuế TNCN</span>
                        {sortField === 'taxClassification' ? (
                          sortDirection === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-emerald-600" /> : <ArrowDown className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-300 opacity-70" />
                        )}
                      </div>
                    </th>
                    <th
                      onClick={() => handleToggleSort('month')}
                      className="px-4 py-3 font-mono cursor-pointer hover:bg-slate-100/80 transition-colors select-none"
                      title="Nhấn để sắp xếp theo Tháng Áp Dụng"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Tháng Áp Dụng</span>
                        {sortField === 'month' ? (
                          sortDirection === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-emerald-600" /> : <ArrowDown className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-300 opacity-70" />
                        )}
                      </div>
                    </th>
                    <th className="px-4 py-3">Ghi Chú</th>
                    <th className="px-4 py-3 text-right">Thao Tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAllowances.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center text-slate-400">
                        Chưa có khoản phụ cấp đặc thù nào được ghi nhận.
                      </td>
                    </tr>
                  ) : (
                    filteredAllowances.map(item => {
                      const emp = empMap.get(item.employeeId);
                      return (
                        <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-4 py-3.5">
                            <div className="font-bold text-slate-900">{emp?.fullName}</div>
                            <div className="font-mono text-[11px] text-emerald-700">{emp?.employeeCode}</div>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="font-bold text-slate-800 text-sm">{item.name}</div>
                            {item.allowanceType && (
                              <div className="text-[10px] text-slate-500 mt-0.5">
                                {ALLOWANCE_TYPE_LABELS[item.allowanceType] || 'Phụ cấp khác'}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-right font-mono font-bold text-slate-900">
                            {formatVND(item.amount)}
                          </td>
                          <td className="px-4 py-3.5 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                                item.isTaxable ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {item.isTaxable ? 'Có tính thuế TNCN' : 'Miễn thuế TNCN'}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 font-mono text-slate-600">{item.month}</td>
                          <td className="px-4 py-3.5 text-slate-500">{item.note || '-'}</td>
                          <td className="px-4 py-3.5 text-right">
                            {canEditEmployees && (
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => handleOpenEdit(item)}
                                  className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg cursor-pointer"
                                  title="Chỉnh sửa"
                                >
                                  <Edit3 className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={e => {
                                    e.stopPropagation();
                                    onDeleteAllowance(item.id);
                                  }}
                                  className="p-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg cursor-pointer"
                                  title="Xóa khoản phụ cấp"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
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
        </div>
      )}

      {/* ==================== TAB 2: DANH SÁCH CÁC KHOẢN PHỤ CẤP & ÁP DỤNG HÀNG LOẠT ==================== */}
      {activeSubTab === 'catalog' && (
        <div className="space-y-6">
          {/* Header Danh Sách Khoản Phụ Cấp */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div>
              <h2 className="text-xl font-black text-slate-900 tracking-tight">
                Danh Sách Các Khoản Phụ Cấp & Áp Dụng Hàng Loạt
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Thiết lập danh mục các khoản phụ cấp chuẩn của đơn vị, mức phụ cấp được hưởng và chọn đối tượng nhân viên áp dụng hàng loạt theo tháng
              </p>
            </div>

            {canEditEmployees && (
              <button
                type="button"
                onClick={handleOpenAddCatalog}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>Thêm Khoản Phụ Cấp Vào Danh Mục</span>
              </button>
            )}
          </div>

          {/* 4 KPI Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-slate-500 font-semibold uppercase tracking-wider block">Khoản Phụ Cấp Trong Danh Mục</span>
              <div className="text-xl font-black text-slate-900 mt-1">{allowanceCatalog.length} khoản</div>
              <span className="text-slate-400 mt-0.5 block">{catalogStats.activeCount} khoản đang kích hoạt</span>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-slate-500 font-semibold uppercase tracking-wider block">Khoản Có Tính Thuế TNCN</span>
              <div className="text-xl font-black text-red-600 mt-1">{catalogStats.taxableCount} khoản</div>
              <span className="text-slate-400 mt-0.5 block">Trách nhiệm, chuyên cần, kiêm nhiệm...</span>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-slate-500 font-semibold uppercase tracking-wider block">Khoản Miễn Thuế TNCN</span>
              <div className="text-xl font-black text-emerald-700 mt-1">{catalogStats.exemptCount} khoản</div>
              <span className="text-slate-400 mt-0.5 block">Xăng xe, điện thoại, trang phục, độc hại...</span>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-slate-500 font-semibold uppercase tracking-wider block">Đã Áp Dụng Kỳ {formatMonthVN(defaultMonth)}</span>
              <div className="text-xl font-black text-indigo-700 mt-1">{catalogStats.appliedInCurrentMonth} lượt</div>
              <span className="text-slate-400 mt-0.5 block">Số lượt nhân viên đang hưởng tháng này</span>
            </div>
          </div>

          {/* PHẦN 1: BẢNG DANH SÁCH CÁC KHOẢN PHỤ CẤP */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/70">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-600" />
                <h3 className="text-sm font-black text-slate-900">1. Danh Sách Các Khoản Phụ Cấp</h3>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    placeholder="Tìm mã hoặc tên khoản phụ cấp..."
                    value={catalogSearch}
                    onChange={e => setCatalogSearch(e.target.value)}
                    className="pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none w-56"
                  />
                </div>

                <select
                  value={catalogTaxFilter}
                  onChange={e => setCatalogTaxFilter(e.target.value as any)}
                  className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white font-semibold text-slate-700 focus:outline-none cursor-pointer"
                >
                  <option value="all">Tất cả chế độ thuế</option>
                  <option value="taxable">Có tính thuế TNCN</option>
                  <option value="exempt">Miễn thuế TNCN</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 uppercase font-semibold border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Mã PC</th>
                    <th className="px-4 py-3">Tên Khoản Phụ Cấp & Phân Loại</th>
                    <th className="px-4 py-3 text-right">Mức Phụ Cấp Mặc Định</th>
                    <th className="px-4 py-3 text-center">Thuế TNCN</th>
                    <th className="px-4 py-3">Đối Tượng Dự Kiến / Ghi Chú</th>
                    <th className="px-4 py-3 text-center">Trạng Thái</th>
                    <th className="px-4 py-3 text-right">Thao Tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredCatalog.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center text-slate-400">
                        Chưa có khoản phụ cấp nào phù hợp trong danh mục.
                      </td>
                    </tr>
                  ) : (
                    filteredCatalog.map(item => {
                      const isSelectedForBulk = bulkCatalogId === item.id;
                      return (
                        <tr
                          key={item.id}
                          className={`transition-colors ${
                            isSelectedForBulk ? 'bg-emerald-50/60' : 'hover:bg-slate-50/80'
                          }`}
                        >
                          <td className="px-4 py-3 font-mono font-bold text-emerald-800 whitespace-nowrap">
                            {item.code}
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-bold text-slate-900 text-sm">{item.name}</div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              {ALLOWANCE_TYPE_LABELS[item.allowanceType] || 'Phụ cấp khác'}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-black text-slate-900 whitespace-nowrap">
                            {formatVND(item.defaultAmount)}
                            <span className="text-[10px] font-normal text-slate-400 block">/tháng</span>
                          </td>
                          <td className="px-4 py-3 text-center whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                                item.isTaxable ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {item.isTaxable ? 'Có tính thuế TNCN' : 'Miễn thuế TNCN'}
                            </span>
                          </td>
                          <td className="px-4 py-3 max-w-xs">
                            {item.targetSummary && (
                              <div className="font-semibold text-slate-700">{item.targetSummary}</div>
                            )}
                            {item.note && <div className="text-[11px] text-slate-500 mt-0.5">{item.note}</div>}
                            {!item.targetSummary && !item.note && <span className="text-slate-400">-</span>}
                          </td>
                          <td className="px-4 py-3 text-center whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                                item.isActive !== false
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-slate-100 text-slate-500 border border-slate-200'
                              }`}
                            >
                              {item.isActive !== false ? 'Đang áp dụng' : 'Tạm ngưng'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              {canEditEmployees && (
                                <button
                                  type="button"
                                  onClick={() => handleSelectCatalogForBulk(item, true)}
                                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer ${
                                    isSelectedForBulk
                                      ? 'bg-emerald-600 text-white shadow-2xs'
                                      : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200'
                                  }`}
                                  title="Chọn khoản phụ cấp này để thiết lập đối tượng áp dụng hàng loạt bên dưới"
                                >
                                  <Users className="w-3.5 h-3.5" />
                                  <span>{isSelectedForBulk ? 'Đang chọn áp dụng' : 'Áp Dụng Hàng Loạt'}</span>
                                </button>
                              )}

                              {canEditEmployees && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditCatalog(item)}
                                    className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg cursor-pointer"
                                    title="Chỉnh sửa khoản phụ cấp"
                                  >
                                    <Edit3 className="w-4 h-4" />
                                  </button>

                                  {deleteCatalogConfirmId === item.id ? (
                                    <div className="flex items-center gap-1 bg-rose-50 border border-rose-200 px-1.5 py-1 rounded-lg">
                                      <button
                                        type="button"
                                        onClick={() => handleConfirmDeleteCatalog(item.id)}
                                        className="px-1.5 py-0.5 bg-rose-600 text-white rounded text-[10px] font-bold cursor-pointer"
                                      >
                                        Xác nhận xóa
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setDeleteCatalogConfirmId(null)}
                                        className="px-1.5 py-0.5 bg-white text-slate-600 border border-slate-200 rounded text-[10px] font-semibold cursor-pointer"
                                      >
                                        Hủy
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setDeleteCatalogConfirmId(item.id)}
                                      className="p-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg cursor-pointer"
                                      title="Xóa khỏi danh mục"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  )}
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

          {/* PHẦN 2: THIẾT LẬP ÁP DỤNG PHỤ CẤP HÀNG LOẠT */}
          <div
            ref={bulkSectionRef}
            className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden"
          >
            <div className="p-5 border-b border-slate-200 bg-gradient-to-r from-emerald-50/80 via-white to-indigo-50/60 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-600" />
                  <h3 className="text-base font-black text-slate-900">
                    2. Thiết Lập Áp Dụng Phụ Cấp Hàng Loạt Cho Đối Tượng Nhân Viên
                  </h3>
                </div>
                <p className="text-xs text-slate-600 mt-0.5">
                  Chọn khoản phụ cấp từ danh mục, điều chỉnh mức phụ cấp được hưởng, tháng áp dụng và tích chọn hàng loạt nhân viên thụ hưởng
                </p>
              </div>

              {selectedCatalogItem && (
                <div className="px-3 py-1.5 rounded-xl bg-white border border-emerald-200 text-xs flex items-center gap-2 shrink-0">
                  <span className="text-slate-500">Đang chọn:</span>
                  <span className="font-mono font-bold text-emerald-700">{selectedCatalogItem.code}</span>
                  <span className="font-bold text-slate-900">{selectedCatalogItem.name}</span>
                </div>
              )}
            </div>

            <div className="p-5 space-y-6 text-xs">
              {/* Bước 1: Thông số khoản phụ cấp, mức hưởng, tháng áp dụng */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 bg-slate-50/80 p-4 rounded-xl border border-slate-200">
                {/* Chọn khoản phụ cấp */}
                <div className="lg:col-span-4 space-y-1.5">
                  <label className="block font-bold text-slate-700">Khoản Phụ Cấp Áp Dụng *</label>
                  <select
                    value={bulkCatalogId}
                    onChange={e => {
                      const found = allowanceCatalog.find(c => c.id === e.target.value);
                      if (found) handleSelectCatalogForBulk(found, false);
                    }}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none cursor-pointer"
                  >
                    {allowanceCatalog.length === 0 && <option value="">-- Chưa có khoản phụ cấp nào --</option>}
                    {allowanceCatalog.map(c => (
                      <option key={c.id} value={c.id}>
                        [{c.code}] {c.name} — {formatVND(c.defaultAmount)}
                      </option>
                    ))}
                  </select>
                  {selectedCatalogItem && (
                    <div className="text-[11px] text-slate-500">
                      Loại: <strong>{ALLOWANCE_TYPE_LABELS[selectedCatalogItem.allowanceType]}</strong> •{' '}
                      {selectedCatalogItem.targetSummary || 'Theo danh sách tích chọn bên dưới'}
                    </div>
                  )}
                </div>

                {/* Mức phụ cấp được hưởng */}
                <div className="lg:col-span-4 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-slate-700">Mức Phụ Cấp Được Hưởng (VNĐ/tháng) *</label>
                    {selectedCatalogItem && (
                      <button
                        type="button"
                        onClick={() => {
                          setBulkAmount(selectedCatalogItem.defaultAmount);
                          setCustomEmpAmounts({});
                        }}
                        className="text-[11px] font-bold text-emerald-700 hover:underline cursor-pointer"
                      >
                        Theo mặc định ({formatVND(selectedCatalogItem.defaultAmount)})
                      </button>
                    )}
                  </div>
                  <input
                    type="number"
                    min={0}
                    step={50000}
                    value={bulkAmount}
                    onChange={e => setBulkAmount(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono font-black text-emerald-700 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                  <div className="flex flex-wrap items-center gap-1">
                    {[500000, 1000000, 1500000, 2000000, 3000000].map(preset => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setBulkAmount(preset)}
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold border transition-colors cursor-pointer ${
                          bulkAmount === preset
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        {(preset / 1000000).toFixed(preset % 1000000 === 0 ? 0 : 1)}tr
                      </button>
                    ))}
                    {Object.keys(customEmpAmounts).length > 0 && (
                      <button
                        type="button"
                        onClick={() => setCustomEmpAmounts({})}
                        className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 cursor-pointer ml-auto"
                      >
                        Đưa toàn bộ về mức chung
                      </button>
                    )}
                  </div>
                </div>

                {/* Tháng áp dụng */}
                <div className="lg:col-span-4 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-slate-700">Tháng Áp Dụng *</label>
                    <div className="flex items-center gap-1 bg-white border border-slate-300 rounded-lg p-0.5">
                      <button
                        type="button"
                        onClick={() => setBulkMonthMode('single')}
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold cursor-pointer ${
                          bulkMonthMode === 'single' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        1 Tháng
                      </button>
                      <button
                        type="button"
                        onClick={() => setBulkMonthMode('range')}
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold cursor-pointer ${
                          bulkMonthMode === 'range' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        Nhiều Tháng
                      </button>
                    </div>
                  </div>

                  {bulkMonthMode === 'single' ? (
                    <input
                      type="month"
                      value={bulkSingleMonth}
                      onChange={e => setBulkSingleMonth(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-[10px] text-slate-500 block mb-0.5">Từ tháng</span>
                        <input
                          type="month"
                          value={bulkFromMonth}
                          onChange={e => setBulkFromMonth(e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono font-bold text-slate-900"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 block mb-0.5">Đến tháng</span>
                        <input
                          type="month"
                          value={bulkToMonth}
                          onChange={e => setBulkToMonth(e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono font-bold text-slate-900"
                        />
                      </div>
                    </div>
                  )}

                  <div className="text-[11px] text-slate-600">
                    Sẽ áp dụng cho <strong>{targetMonths.length} tháng</strong>:{' '}
                    <span className="font-mono text-emerald-700 font-semibold">
                      {targetMonths.slice(0, 4).map(formatMonthVN).join(', ')}
                      {targetMonths.length > 4 ? ` ... (+${targetMonths.length - 4})` : ''}
                    </span>
                  </div>
                </div>

                {/* Chế độ Thuế TNCN, Xử lý trùng & Ghi chú */}
                <div className="lg:col-span-4 space-y-1.5">
                  <label className="block font-bold text-slate-700">Chế Độ Tính Thuế TNCN</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setBulkIsTaxable(true)}
                      className={`px-3 py-2 rounded-lg border font-bold text-xs cursor-pointer transition-colors ${
                        bulkIsTaxable
                          ? 'bg-red-50 border-red-300 text-red-800'
                          : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      Có tính thuế TNCN
                    </button>
                    <button
                      type="button"
                      onClick={() => setBulkIsTaxable(false)}
                      className={`px-3 py-2 rounded-lg border font-bold text-xs cursor-pointer transition-colors ${
                        !bulkIsTaxable
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                          : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      Miễn thuế TNCN
                    </button>
                  </div>
                </div>

                <div className="lg:col-span-4 space-y-1.5">
                  <label className="block font-bold text-slate-700">Nếu NV Đã Có Khoản Này Trong Tháng</label>
                  <select
                    value={bulkDuplicateMode}
                    onChange={e => setBulkDuplicateMode(e.target.value as any)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-semibold text-slate-800 focus:outline-none cursor-pointer"
                  >
                    <option value="overwrite">Cập nhật / Ghi đè mức mới (Khuyên dùng)</option>
                    <option value="skip">Bỏ qua nhân viên đã có trong tháng</option>
                    <option value="append">Thêm thành một khoản mới song song</option>
                  </select>
                </div>

                <div className="lg:col-span-4 space-y-1.5">
                  <label className="block font-bold text-slate-700">Ghi Chú / Căn Cứ Áp Dụng</label>
                  <input
                    type="text"
                    placeholder="VD: Theo Quyết định điều chỉnh phụ cấp tháng..."
                    value={bulkNote}
                    onChange={e => setBulkNote(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Bước 2: Lựa chọn đối tượng được áp dụng hàng loạt */}
              <div className="space-y-3">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-indigo-600" />
                    <h4 className="font-black text-slate-900 text-sm">
                      Lựa Chọn Đối Tượng Được Áp Dụng Hàng Loạt
                    </h4>
                    <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-bold text-[11px]">
                      Đã chọn {selectedEmpIds.filter(id => empMap.has(id)).length} / {employees.length} NV
                    </span>
                  </div>

                  {/* Quick select action buttons */}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSelectAllFiltered}
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg font-bold text-[11px] cursor-pointer"
                    >
                      <CheckSquare className="w-3.5 h-3.5" />
                      <span>Chọn tất cả đang lọc ({filteredTargetEmployees.length})</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleSelectManagers}
                      className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 rounded-lg font-bold text-[11px] cursor-pointer"
                    >
                      + Chọn Cán Bộ Quản Lý
                    </button>

                    <button
                      type="button"
                      onClick={handleDeselectAllFiltered}
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold text-[11px] cursor-pointer"
                    >
                      <Square className="w-3.5 h-3.5" />
                      <span>Bỏ chọn đang lọc</span>
                    </button>

                    {selectedEmpIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedEmpIds([])}
                        className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg font-semibold text-[11px] cursor-pointer"
                      >
                        Xóa toàn bộ đã chọn
                      </button>
                    )}
                  </div>
                </div>

                {/* Bộ lọc đối tượng */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      placeholder="Tìm Tên NV, Mã NV, CCCD..."
                      value={targetSearch}
                      onChange={e => setTargetSearch(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>

                  <select
                    value={targetDeptFilter}
                    onChange={e => setTargetDeptFilter(e.target.value)}
                    className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-semibold text-slate-700 focus:outline-none cursor-pointer"
                  >
                    <option value="all">Tất cả Phòng Ban</option>
                    {(settings?.departments || []).map(d => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>

                  <select
                    value={targetPosFilter}
                    onChange={e => setTargetPosFilter(e.target.value)}
                    className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-semibold text-slate-700 focus:outline-none cursor-pointer"
                  >
                    <option value="all">Tất cả Chức Vụ</option>
                    {(settings?.positions || []).map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>

                  <select
                    value={targetStatusFilter}
                    onChange={e => setTargetStatusFilter(e.target.value as any)}
                    className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-semibold text-slate-700 focus:outline-none cursor-pointer"
                  >
                    <option value="active_probation">Đang làm việc & Thử việc</option>
                    <option value="active">Chỉ nhân viên Chính thức</option>
                    <option value="probation">Chỉ nhân viên Thử việc</option>
                    <option value="all">Tất cả trạng thái nhân sự</option>
                  </select>
                </div>

                {/* Bảng danh sách đối tượng tích chọn */}
                <div className="border border-slate-200 rounded-xl overflow-hidden max-h-96 overflow-y-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-100 text-slate-600 uppercase font-semibold sticky top-0 z-10 border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2.5 w-10 text-center">
                          <input
                            type="checkbox"
                            checked={
                              filteredTargetEmployees.length > 0 &&
                              filteredTargetEmployees.every(e => selectedTargetSet.has(e.id))
                            }
                            onChange={e => {
                              if (e.target.checked) handleSelectAllFiltered();
                              else handleDeselectAllFiltered();
                            }}
                            className="w-4 h-4 accent-emerald-600 cursor-pointer rounded"
                            title="Chọn / Bỏ chọn tất cả nhân viên đang hiển thị"
                          />
                        </th>
                        <th className="px-3 py-2.5">Nhân Viên</th>
                        <th className="px-3 py-2.5">Phòng Ban</th>
                        <th className="px-3 py-2.5">Chức Vụ</th>
                        <th className="px-3 py-2.5 text-center">Trạng Thái</th>
                        <th className="px-3 py-2.5 text-right">Mức Phụ Cấp Hưởng (VNĐ/tháng)</th>
                        <th className="px-3 py-2.5 text-center">Hiện Có Tại Kỳ Chọn</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredTargetEmployees.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-6 py-8 text-center text-slate-400">
                            Không có nhân viên nào khớp với bộ lọc đối tượng.
                          </td>
                        </tr>
                      ) : (
                        filteredTargetEmployees.map(emp => {
                          const isChecked = selectedTargetSet.has(emp.id);
                          const effectiveAmt = getEmployeeEffectiveBulkAmount(emp.id);
                          const hasCustomAmt = customEmpAmounts[emp.id] !== undefined;
                          const existingMatches = existingMatchesByEmployee.get(emp.id) || [];

                          return (
                            <tr
                              key={emp.id}
                              onClick={() => handleToggleSelectEmp(emp.id)}
                              className={`transition-colors cursor-pointer ${
                                isChecked ? 'bg-emerald-50/70' : 'hover:bg-slate-50'
                              }`}
                            >
                              <td className="px-3 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => handleToggleSelectEmp(emp.id)}
                                  className="w-4 h-4 accent-emerald-600 cursor-pointer rounded"
                                />
                              </td>
                              <td className="px-3 py-2.5">
                                <div className="font-bold text-slate-900">{emp.fullName}</div>
                                <div className="font-mono text-[11px] text-emerald-700">{emp.employeeCode}</div>
                              </td>
                              <td className="px-3 py-2.5 text-slate-700">
                                {depMap.get(emp.departmentId) || '-'}
                              </td>
                              <td className="px-3 py-2.5 text-slate-700">
                                {posMap.get(emp.positionId) || '-'}
                              </td>
                              <td className="px-3 py-2.5 text-center whitespace-nowrap">
                                <span
                                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                    emp.workStatus === 'active'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : emp.workStatus === 'probation'
                                      ? 'bg-amber-100 text-amber-800'
                                      : 'bg-slate-100 text-slate-600'
                                  }`}
                                >
                                  {WORK_STATUS_LABELS[emp.workStatus] || emp.workStatus}
                                </span>
                              </td>
                              <td
                                className="px-3 py-2.5 text-right"
                                onClick={e => e.stopPropagation()}
                              >
                                <div className="inline-flex items-center gap-1 justify-end">
                                  <input
                                    type="number"
                                    min={0}
                                    step={50000}
                                    disabled={!isChecked}
                                    value={effectiveAmt}
                                    onChange={e => {
                                      const val = Math.max(0, Number(e.target.value) || 0);
                                      setCustomEmpAmounts(prev => ({ ...prev, [emp.id]: val }));
                                    }}
                                    className={`w-32 px-2 py-1 text-right font-mono font-bold rounded-lg border text-xs focus:outline-none ${
                                      isChecked
                                        ? hasCustomAmt
                                          ? 'bg-amber-50 border-amber-300 text-amber-900 focus:ring-2 focus:ring-amber-400'
                                          : 'bg-white border-emerald-300 text-emerald-800 focus:ring-2 focus:ring-emerald-500'
                                        : 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'
                                    }`}
                                    title={isChecked ? 'Có thể sửa mức riêng cho nhân viên này nếu khác mức chung' : 'Tích chọn nhân viên để điều chỉnh'}
                                  />
                                </div>
                              </td>
                              <td className="px-3 py-2.5 text-center whitespace-nowrap">
                                {existingMatches.length > 0 ? (
                                  <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-800 border border-blue-200 font-semibold text-[10px]">
                                    Đã có {existingMatches.length} kỳ ({formatVND(existingMatches[0].amount)})
                                  </span>
                                ) : (
                                  <span className="text-[11px] text-slate-400">Chưa có</span>
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

              {/* Thanh Tổng Hợp & Xác Nhận Áp Dụng Hàng Loạt */}
              <div className="bg-slate-900 text-white rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Đối Tượng Đã Chọn</span>
                    <strong className="text-base font-black text-emerald-400">
                      {selectedEmpIds.filter(id => empMap.has(id)).length} nhân viên
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Số Tháng Áp Dụng</span>
                    <strong className="text-base font-black text-white">{targetMonths.length} tháng</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Tổng Bản Ghi Xử Lý</span>
                    <strong className="text-base font-black text-indigo-300">
                      {selectedEmpIds.filter(id => empMap.has(id)).length * targetMonths.length} lượt
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Tổng Ngân Sách / Tháng</span>
                    <strong className="text-base font-black font-mono text-amber-300">
                      {formatVND(selectedMonthlyBudget)}
                    </strong>
                  </div>
                </div>

                {canEditEmployees && (
                  <button
                    type="button"
                    onClick={handleApplyBulkAllowances}
                    disabled={!selectedCatalogItem || selectedEmpIds.filter(id => empMap.has(id)).length === 0}
                    className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-400 text-slate-950 font-black text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed shrink-0"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Áp Dụng Phụ Cấp Hàng Loạt</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL THÊM / SỬA KHOẢN PHỤ CẤP ĐƠN LẺ (TAB 1) ==================== */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4 border border-slate-200 text-xs max-h-[92vh] overflow-y-auto">
            <h3 className="text-base font-bold text-slate-900 border-b border-slate-200 pb-3">
              {editingItem ? 'Chỉnh Sửa Phụ Cấp Đặc Thù' : 'Thêm Khoản Phụ Cấp Mới'}
            </h3>

            {singleFormError && (
              <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{singleFormError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitSingle} className="space-y-4">
              {/* Tìm chọn nhân viên */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nhân Viên Được Hưởng *</label>
                {formData.employeeId && empMap.get(formData.employeeId) ? (
                  <div className="flex items-center justify-between p-3 bg-emerald-50 border border-emerald-300 rounded-xl">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white font-bold flex items-center justify-center text-xs shadow-xs">
                        {empMap.get(formData.employeeId)?.fullName.slice(0, 1) || 'NV'}
                      </div>
                      <div>
                        <div className="font-bold text-slate-900 text-xs flex items-center gap-2">
                          <span>{empMap.get(formData.employeeId)?.fullName}</span>
                          <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-emerald-200/80 text-emerald-950 font-bold">
                            {empMap.get(formData.employeeId)?.employeeCode}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-600 font-mono mt-0.5">
                          Số CCCD: <strong className="text-slate-800">{empMap.get(formData.employeeId)?.idCardNumber || 'Chưa cập nhật'}</strong>
                          {empMap.get(formData.employeeId)?.departmentId && ` • Phòng ban: ${depMap.get(empMap.get(formData.employeeId)!.departmentId) || ''}`}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setFormData({ ...formData, employeeId: '' });
                        setEmpSearchQuery('');
                        setIsEmpSearchOpen(true);
                      }}
                      className="px-3 py-1.5 text-xs font-bold text-emerald-800 bg-white hover:bg-emerald-100 border border-emerald-300 rounded-lg cursor-pointer transition-colors shadow-2xs"
                    >
                      Đổi Nhân Viên
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <div className="relative">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        placeholder="Tìm theo Tên NV, Số CCCD hoặc Mã NV..."
                        value={empSearchQuery}
                        onFocus={() => setIsEmpSearchOpen(true)}
                        onChange={e => {
                          setEmpSearchQuery(e.target.value);
                          setIsEmpSearchOpen(true);
                        }}
                        className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg font-medium text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      />
                    </div>

                    {isEmpSearchOpen && (
                      <div className="absolute z-30 top-full left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-2xl divide-y divide-slate-100">
                        {matchingEmployees.length === 0 ? (
                          <div className="p-3 text-center text-slate-400 text-xs">
                            Không tìm thấy nhân viên nào phù hợp
                          </div>
                        ) : (
                          matchingEmployees.map(e => (
                            <div
                              key={e.id}
                              onClick={() => {
                                setFormData({ ...formData, employeeId: e.id });
                                setIsEmpSearchOpen(false);
                                setEmpSearchQuery('');
                              }}
                              className="p-2.5 hover:bg-emerald-50/80 cursor-pointer transition-colors flex items-center justify-between text-xs"
                            >
                              <div>
                                <div className="font-bold text-slate-900">
                                  {e.fullName}
                                  <span className="ml-2 font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold">
                                    {e.employeeCode}
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                                  CCCD: <strong className="text-slate-800">{e.idCardNumber || '—'}</strong>
                                  {e.departmentId && ` • ${depMap.get(e.departmentId) || ''}`}
                                </div>
                              </div>
                              <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-1 rounded-lg">
                                Chọn
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Chọn nhanh từ Danh sách các khoản phụ cấp */}
              {allowanceCatalog.length > 0 && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Chọn Nhanh Từ Danh Sách Các Khoản Phụ Cấp
                  </label>
                  <select
                    value={formData.catalogId || ''}
                    onChange={e => {
                      const cat = allowanceCatalog.find(c => c.id === e.target.value);
                      if (cat) {
                        setFormData(prev => ({
                          ...prev,
                          catalogId: cat.id,
                          allowanceType: cat.allowanceType,
                          name: cat.name,
                          amount: cat.defaultAmount,
                          isTaxable: cat.isTaxable,
                          note: cat.note || prev.note
                        }));
                      } else {
                        setFormData(prev => ({ ...prev, catalogId: '' }));
                      }
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-50 font-semibold text-slate-800 cursor-pointer"
                  >
                    <option value="">-- Nhập thủ công hoặc chọn từ danh mục --</option>
                    {allowanceCatalog.map(cat => (
                      <option key={cat.id} value={cat.id}>
                        [{cat.code}] {cat.name} ({formatVND(cat.defaultAmount)})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Tên Khoản Phụ Cấp *</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Phụ cấp trách nhiệm dự án"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Loại Phụ Cấp</label>
                  <select
                    value={formData.allowanceType || 'other'}
                    onChange={e => setFormData({ ...formData, allowanceType: e.target.value as AllowanceType })}
                    className="w-full px-2.5 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    {(Object.keys(ALLOWANCE_TYPE_LABELS) as AllowanceType[]).map(k => (
                      <option key={k} value={k}>
                        {ALLOWANCE_TYPE_LABELS[k]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Số Tiền Phụ Cấp (VNĐ) *</label>
                  <input
                    type="number"
                    required
                    step={50000}
                    value={formData.amount}
                    onChange={e => setFormData({ ...formData, amount: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono font-bold text-emerald-700"
                  />
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                <span className="block font-semibold text-slate-700">Quy Định Tính Thuế TNCN *</span>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="isTaxable"
                    checked={formData.isTaxable === true}
                    onChange={() => setFormData({ ...formData, isTaxable: true })}
                    className="text-emerald-600"
                  />
                  <span>Có tính vào thu nhập chịu thuế TNCN (trách nhiệm, chuyên cần, chức vụ...)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="isTaxable"
                    checked={formData.isTaxable === false}
                    onChange={() => setFormData({ ...formData, isTaxable: false })}
                    className="text-emerald-600"
                  />
                  <span>Được miễn thuế TNCN (khoán công tác phí, điện thoại, trang phục, độc hại...)</span>
                </label>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Tháng Áp Dụng (YYYY-MM)</label>
                <input
                  type="month"
                  value={formData.month}
                  onChange={e => setFormData({ ...formData, month: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Ghi Chú</label>
                <input
                  type="text"
                  placeholder="Ghi chú căn cứ phê duyệt..."
                  value={formData.note}
                  onChange={e => setFormData({ ...formData, note: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold cursor-pointer"
                >
                  Lưu Phụ Cấp
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== MODAL THÊM / SỬA KHOẢN PHỤ CẤP TRONG DANH MỤC (TAB 2) ==================== */}
      {isCatalogModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-4 border border-slate-200 text-xs max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                {editingCatalogItem ? 'Chỉnh Sửa Khoản Phụ Cấp Trong Danh Mục' : 'Thêm Khoản Phụ Cấp Mới Vào Danh Mục'}
              </h3>
              <button
                type="button"
                onClick={() => setIsCatalogModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {catalogFormError && (
              <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{catalogFormError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitCatalog} className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Mã Khoản PC *</label>
                  <input
                    type="text"
                    required
                    placeholder="VD: PC-TN"
                    value={catalogForm.code || ''}
                    onChange={e => setCatalogForm({ ...catalogForm, code: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono font-bold uppercase"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">Tên Khoản Phụ Cấp *</label>
                  <input
                    type="text"
                    required
                    placeholder="VD: Phụ cấp trách nhiệm tổ trưởng"
                    value={catalogForm.name || ''}
                    onChange={e => setCatalogForm({ ...catalogForm, name: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-semibold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Phân Loại Phụ Cấp</label>
                  <select
                    value={catalogForm.allowanceType || 'other'}
                    onChange={e => setCatalogForm({ ...catalogForm, allowanceType: e.target.value as AllowanceType })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    {(Object.keys(ALLOWANCE_TYPE_LABELS) as AllowanceType[]).map(k => (
                      <option key={k} value={k}>
                        {ALLOWANCE_TYPE_LABELS[k]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Mức Phụ Cấp Mặc Định (VNĐ) *</label>
                  <input
                    type="number"
                    min={0}
                    step={50000}
                    required
                    value={catalogForm.defaultAmount ?? 0}
                    onChange={e => setCatalogForm({ ...catalogForm, defaultAmount: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono font-bold text-emerald-700"
                  />
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                <span className="block font-semibold text-slate-700">Quy Định Thuế TNCN Mặc Định *</span>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="catalogIsTaxable"
                    checked={catalogForm.isTaxable === true}
                    onChange={() => setCatalogForm({ ...catalogForm, isTaxable: true })}
                    className="text-emerald-600"
                  />
                  <span>Có tính thuế TNCN</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="catalogIsTaxable"
                    checked={catalogForm.isTaxable === false}
                    onChange={() => setCatalogForm({ ...catalogForm, isTaxable: false })}
                    className="text-emerald-600"
                  />
                  <span>Miễn thuế TNCN (theo định mức quy chế / quy định thuế)</span>
                </label>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Đối Tượng Hưởng Dự Kiến</label>
                <input
                  type="text"
                  placeholder="VD: Cán bộ quản lý, Trưởng phòng, Toàn bộ công nhân xưởng..."
                  value={catalogForm.targetSummary || ''}
                  onChange={e => setCatalogForm({ ...catalogForm, targetSummary: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Ghi Chú / Căn Cứ Quy Chế</label>
                <input
                  type="text"
                  placeholder="VD: Theo Quy chế lương thưởng số..."
                  value={catalogForm.note || ''}
                  onChange={e => setCatalogForm({ ...catalogForm, note: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={catalogForm.isActive !== false}
                  onChange={e => setCatalogForm({ ...catalogForm, isActive: e.target.checked })}
                  className="w-4 h-4 accent-emerald-600 rounded"
                />
                <span>Đang kích hoạt sử dụng trong danh mục</span>
              </label>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsCatalogModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold cursor-pointer"
                >
                  {editingCatalogItem ? 'Cập Nhật Khoản Phụ Cấp' : 'Thêm Vào Danh Mục'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal In Danh Sách Phụ Cấp Đặc Thù */}
      {settings && (
        <PrintAllowancesModal
          isOpen={isPrintModalOpen}
          onClose={() => setIsPrintModalOpen(false)}
          specialAllowances={specialAllowances}
          employees={employees}
          settings={settings}
          initialMonth={filterMonth !== 'all' ? filterMonth : undefined}
        />
      )}
    </div>
  );
};
