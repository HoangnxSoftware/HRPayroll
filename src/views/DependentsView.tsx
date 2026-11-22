import React, { useState, useRef, useMemo } from 'react';
import {
  Users,
  UserPlus,
  Trash2,
  Edit3,
  Download,
  Search,
  CheckCircle2,
  Upload,
  FileSpreadsheet,
  Printer,
  AlertTriangle,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  AlertCircle,
  History,
  Calendar,
  Clock,
  Plus,
  Save,
  ArrowRight,
  TrendingUp,
  Layers,
  Building2,
  X,
  ChevronDown,
  ChevronRight,
  Sparkles,
  PauseCircle
} from 'lucide-react';
import {
  Dependent,
  DependentDeductionPeriod,
  DependentDeductionStatus,
  Employee,
  RelationshipType,
  SystemSettings
} from '../types';
import {
  formatVND,
  formatNumber,
  getAvailableYears,
  getEffectiveDependentDeductionForMonth,
  countMonthsInPeriod,
  normalizeToMonthKey,
  syncDependentSummaryFromHistory
} from '../utils/payrollCalculator';
import { downloadDependentTemplate, readDependentExcel } from '../utils/excelHelper';
import * as XLSX from 'xlsx';
import { useAuthRole } from '../context/AuthRoleContext';
import { PrintDependentsModal } from '../components/PrintDependentsModal';

interface DependentsViewProps {
  dependents: Dependent[];
  employees: Employee[];
  settings?: SystemSettings;
  onAddDependent: (dependent: Dependent) => void;
  onUpdateDependent: (dependent: Dependent) => void;
  onDeleteDependent: (id: string) => void;
  onBatchAddDependents?: (deps: Dependent[]) => void;
}

export const DependentsView: React.FC<DependentsViewProps> = ({
  dependents,
  employees,
  settings,
  onAddDependent,
  onUpdateDependent,
  onDeleteDependent,
  onBatchAddDependents
}) => {
  const { canEditEmployees, canExportData } = useAuthRole();
  const [activeSubTab, setActiveSubTab] = useState<'list' | 'process'>('list');

  const currentWorkingYear = settings?.currentYear || new Date().getFullYear();
  const currentWorkingMonth = settings?.currentMonth || (new Date().getMonth() + 1);
  const currentWorkingMonthKey = `${currentWorkingYear}-${String(currentWorkingMonth).padStart(2, '0')}`;
  const defaultDeduction = settings?.dependentDeduction || 6200000;

  // State cho Tab 1: Danh sách NPT
  const [searchTerm, setSearchTerm] = useState('');
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDep, setEditingDep] = useState<Dependent | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [viewNotice, setViewNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState<Partial<Dependent>>({
    employeeId: '',
    fullName: '',
    taxCodeOrId: '',
    relationship: 'Con đẻ/Con nuôi',
    birthDate: '2018-01-01',
    startDate: currentWorkingMonthKey,
    endDate: '',
    deductionAmount: defaultDeduction,
    note: ''
  });

  const [empSearchQuery, setEmpSearchQuery] = useState('');
  const [isEmpSearchOpen, setIsEmpSearchOpen] = useState(false);

  // State cho Modal Quá Trình Tính Giảm Trừ NPT (từng người phụ thuộc)
  const [historyDepId, setHistoryDepId] = useState<string | null>(null);
  const historyDep = useMemo(
    () => (historyDepId ? dependents.find(d => d.id === historyDepId) || null : null),
    [dependents, historyDepId]
  );

  const [periodForm, setPeriodForm] = useState<{
    editingId: string | null;
    fromMonth: string;
    toMonth: string;
    isOngoing: boolean;
    status: DependentDeductionStatus;
    deductionAmount: number;
    note: string;
  }>({
    editingId: null,
    fromMonth: currentWorkingMonthKey,
    toMonth: '',
    isOngoing: true,
    status: 'active',
    deductionAmount: defaultDeduction,
    note: ''
  });
  const [historyFeedback, setHistoryFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [deletePeriodConfirm, setDeletePeriodConfirm] = useState<{
    isOpen: boolean;
    periodId: string | null;
    label: string;
  }>({ isOpen: false, periodId: null, label: '' });

  // State cho Tab 2: Quá trình tính giảm trừ cả năm (12 tháng)
  const [processYear, setProcessYear] = useState<number>(currentWorkingYear);
  const [processViewMode, setProcessViewMode] = useState<'by_employee' | 'by_dependent'>('by_employee');
  const [processDeptFilter, setProcessDeptFilter] = useState<string>('all');
  const [processSearchTerm, setProcessSearchTerm] = useState<string>('');
  const [onlyEmployeesWithDeps, setOnlyEmployeesWithDeps] = useState<boolean>(true);
  const [expandedEmpIds, setExpandedEmpIds] = useState<Set<string>>(new Set());

  // Modal Áp dụng mức giảm trừ mới hàng loạt theo giai đoạn
  const [isBulkRateModalOpen, setIsBulkRateModalOpen] = useState(false);
  const [bulkFromMonth, setBulkFromMonth] = useState<string>(`${currentWorkingYear}-01`);
  const [bulkNewAmount, setBulkNewAmount] = useState<number>(defaultDeduction);
  const [bulkPriorAmount, setBulkPriorAmount] = useState<number>(4400000);
  const [bulkNote, setBulkNote] = useState<string>('Điều chỉnh mức giảm trừ gia cảnh người phụ thuộc theo quy định mới');

  const empMap = useMemo(() => new Map(employees.map(e => [e.id, e])), [employees]);
  const depMap = useMemo(() => new Map((settings?.departments || []).map(d => [d.id, d.name])), [settings?.departments]);

  const showTempNotice = (type: 'success' | 'error', text: string) => {
    setViewNotice({ type, text });
    window.setTimeout(() => {
      setViewNotice(prev => (prev?.text === text ? null : prev));
    }, 4500);
  };

  const showHistoryNotice = (type: 'success' | 'error', text: string) => {
    setHistoryFeedback({ type, text });
    window.setTimeout(() => {
      setHistoryFeedback(prev => (prev?.text === text ? null : prev));
    }, 4000);
  };

  const matchingEmployees = useMemo(() => {
    const q = empSearchQuery.trim().toLowerCase();
    if (!q) return employees.slice(0, 25);
    return employees.filter(e => {
      const matchName = e.fullName.toLowerCase().includes(q);
      const matchCode = e.employeeCode.toLowerCase().includes(q);
      const matchCccd = e.idCardNumber ? e.idCardNumber.includes(q) : false;
      return matchName || matchCode || matchCccd;
    }).slice(0, 25);
  }, [employees, empSearchQuery]);

  // Tính tuổi chính xác bằng số
  const getNumericAge = (birthDateStr?: string): number | null => {
    if (!birthDateStr) return null;
    const b = new Date(birthDateStr);
    if (isNaN(b.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - b.getFullYear();
    const m = today.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < b.getDate())) {
      age--;
    }
    return age >= 0 ? age : null;
  };

  const calculateAge = (birthDateStr?: string) => {
    const age = getNumericAge(birthDateStr);
    return age !== null ? `${age} tuổi` : '—';
  };

  // Tập hợp các số CCCD NLĐ bị trùng lặp giữa các nhân viên khác nhau
  const duplicateEmpIdCards = useMemo(() => {
    const counts = new Map<string, number>();
    employees.forEach(e => {
      const cccd = (e.idCardNumber || '').trim();
      if (cccd) counts.set(cccd, (counts.get(cccd) || 0) + 1);
    });
    const dupSet = new Set<string>();
    counts.forEach((cnt, cccd) => {
      if (cnt > 1) dupSet.add(cccd);
    });
    return dupSet;
  }, [employees]);

  // Đếm và phát hiện trùng lặp CCCD/Mã số thuế của người phụ thuộc
  const duplicateDepCounts = useMemo(() => {
    const counts = new Map<string, number>();
    dependents.forEach(d => {
      const cccd = (d.taxCodeOrId || '').trim();
      if (cccd) counts.set(cccd, (counts.get(cccd) || 0) + 1);
    });
    return counts;
  }, [dependents]);

  const duplicateDepCards = useMemo(() => {
    const dupSet = new Set<string>();
    duplicateDepCounts.forEach((cnt, cccd) => {
      if (cnt > 1) dupSet.add(cccd);
    });
    return dupSet;
  }, [duplicateDepCounts]);

  const totalDuplicateDepRecords = useMemo(() => {
    return dependents.filter(d => {
      const cccd = (d.taxCodeOrId || '').trim();
      return cccd && duplicateDepCards.has(cccd);
    }).length;
  }, [dependents, duplicateDepCards]);

  const totalOver18Dependents = useMemo(() => {
    return dependents.filter(d => {
      const age = getNumericAge(d.birthDate);
      return age !== null && age >= 18;
    }).length;
  }, [dependents]);

  // State lọc cảnh báo và sắp xếp Tab 1
  const [filterDuplicateDepOnly, setFilterDuplicateDepOnly] = useState(false);
  const [filterOver18Only, setFilterOver18Only] = useState(false);

  type DependentSortField = 'none' | 'employee' | 'employeeCccd' | 'fullName' | 'taxCodeOrId' | 'birthDate' | 'deductionAmount';
  const [sortField, setSortField] = useState<DependentSortField>('none');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleToggleSort = (field: DependentSortField) => {
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

  const baseFilteredDependents = dependents.filter(dep => {
    const emp = empMap.get(dep.employeeId);
    const search = searchTerm.toLowerCase();
    const matchSearch =
      dep.fullName.toLowerCase().includes(search) ||
      dep.taxCodeOrId.toLowerCase().includes(search) ||
      (emp && emp.fullName.toLowerCase().includes(search)) ||
      (emp && emp.employeeCode.toLowerCase().includes(search)) ||
      (emp && emp.idCardNumber && emp.idCardNumber.toLowerCase().includes(search));

    const cccdClean = (dep.taxCodeOrId || '').trim();
    const isDupe = cccdClean ? duplicateDepCards.has(cccdClean) : false;
    const matchDuplicate = !filterDuplicateDepOnly || isDupe;

    const age = getNumericAge(dep.birthDate);
    const isOver18 = age !== null && age >= 18;
    const matchOver18 = !filterOver18Only || isOver18;

    return matchSearch && matchDuplicate && matchOver18;
  });

  const filteredDependents = useMemo(() => {
    if (sortField === 'none') return baseFilteredDependents;

    return [...baseFilteredDependents].sort((a, b) => {
      let cmp = 0;
      const empA = empMap.get(a.employeeId);
      const empB = empMap.get(b.employeeId);

      if (sortField === 'employee') {
        cmp = (empA?.fullName || '').localeCompare(empB?.fullName || '', 'vi');
      } else if (sortField === 'employeeCccd') {
        cmp = (empA?.idCardNumber || '').localeCompare(empB?.idCardNumber || '', 'vi', { numeric: true });
      } else if (sortField === 'fullName') {
        cmp = a.fullName.localeCompare(b.fullName, 'vi');
      } else if (sortField === 'taxCodeOrId') {
        cmp = (a.taxCodeOrId || '').localeCompare(b.taxCodeOrId || '', 'vi', { numeric: true });
      } else if (sortField === 'birthDate') {
        cmp = (a.birthDate || '').localeCompare(b.birthDate || '');
      } else if (sortField === 'deductionAmount') {
        const effA = getEffectiveDependentDeductionForMonth(a, currentWorkingMonth, currentWorkingYear, settings).amount;
        const effB = getEffectiveDependentDeductionForMonth(b, currentWorkingMonth, currentWorkingYear, settings).amount;
        cmp = effA - effB;
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [baseFilteredDependents, sortField, sortDirection, empMap, currentWorkingMonth, currentWorkingYear, settings]);

  // Helper lấy danh sách giai đoạn hiển thị cho 1 NPT (nếu chưa có deductionHistory thì suy diễn từ startDate/endDate)
  const getEffectivePeriodsList = (dep: Dependent): DependentDeductionPeriod[] => {
    if (dep.deductionHistory && dep.deductionHistory.length > 0) {
      return [...dep.deductionHistory].sort((a, b) =>
        normalizeToMonthKey(a.fromMonth).localeCompare(normalizeToMonthKey(b.fromMonth))
      );
    }
    return [];
  };

  // Mở Modal Quá trình giảm trừ NPT
  const handleOpenHistoryModal = (dep: Dependent) => {
    setHistoryDepId(dep.id);
    setHistoryFeedback(null);
    setDeletePeriodConfirm({ isOpen: false, periodId: null, label: '' });
    setPeriodForm({
      editingId: null,
      fromMonth: dep.startDate ? normalizeToMonthKey(dep.startDate) : currentWorkingMonthKey,
      toMonth: '',
      isOngoing: true,
      status: 'active',
      deductionAmount: dep.deductionAmount || defaultDeduction,
      note: ''
    });
  };

  // Khởi tạo nhanh quá trình từ hồ sơ hiện tại
  const handleInitializeHistoryFromRecord = (dep: Dependent) => {
    const startKey = dep.startDate ? normalizeToMonthKey(dep.startDate) : currentWorkingMonthKey;
    const endKey = dep.endDate ? normalizeToMonthKey(dep.endDate) : '';
    const initialPeriod: DependentDeductionPeriod = {
      id: `dh-${dep.id}-${Date.now()}`,
      fromMonth: startKey,
      toMonth: endKey,
      deductionAmount: dep.deductionAmount || defaultDeduction,
      status: 'active',
      note: dep.note || 'Khởi tạo quá trình giảm trừ theo hồ sơ đăng ký'
    };
    const synced = syncDependentSummaryFromHistory(dep, [initialPeriod], defaultDeduction);
    onUpdateDependent(synced);
    showHistoryNotice('success', 'Đã khởi tạo quá trình giảm trừ từ hồ sơ hiện có!');
  };

  // Tách nhanh 2 giai đoạn 4.4tr (trước 2026-01) -> 6.2tr (từ 2026-01)
  const handleQuickSplit2026 = (dep: Dependent) => {
    const startKey = dep.startDate ? normalizeToMonthKey(dep.startDate) : '2024-01';
    const splitMonth = `${currentWorkingYear > 2026 ? 2026 : currentWorkingYear}-01`;
    if (startKey >= splitMonth) {
      const singlePeriod: DependentDeductionPeriod = {
        id: `dh-${dep.id}-${Date.now()}`,
        fromMonth: startKey,
        toMonth: dep.endDate ? normalizeToMonthKey(dep.endDate) : '',
        deductionAmount: defaultDeduction,
        status: 'active',
        note: `Áp dụng mức giảm trừ ${formatVND(defaultDeduction)}/tháng`
      };
      onUpdateDependent(syncDependentSummaryFromHistory(dep, [singlePeriod], defaultDeduction));
      showHistoryNotice('success', 'Đã tạo giai đoạn giảm trừ theo mức hiện hành!');
      return;
    }

    const [sy, sm] = splitMonth.split('-').map(Number);
    const prevDate = new Date(sy, sm - 2, 1);
    const prevMonthEnd = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

    const periods: DependentDeductionPeriod[] = [
      {
        id: `dh-${dep.id}-pre-${Date.now()}`,
        fromMonth: startKey,
        toMonth: prevMonthEnd,
        deductionAmount: 4400000,
        status: 'active',
        note: 'Mức giảm trừ NPT giai đoạn trước (4.400.000 đ/tháng)'
      },
      {
        id: `dh-${dep.id}-cur-${Date.now() + 1}`,
        fromMonth: splitMonth,
        toMonth: dep.endDate && normalizeToMonthKey(dep.endDate) >= splitMonth ? normalizeToMonthKey(dep.endDate) : '',
        deductionAmount: defaultDeduction,
        status: 'active',
        note: `Điều chỉnh mức giảm trừ NPT mới (${formatVND(defaultDeduction)}/tháng)`
      }
    ];
    onUpdateDependent(syncDependentSummaryFromHistory(dep, periods, defaultDeduction));
    showHistoryNotice('success', `Đã tự động tách quá trình thành 2 giai đoạn (${startKey} → ${prevMonthEnd}: 4.4tr và ${splitMonth} → nay: ${formatVND(defaultDeduction)})!`);
  };

  // Lưu Thêm / Sửa giai đoạn trong Modal Quá trình
  const handleSavePeriod = (e: React.FormEvent) => {
    e.preventDefault();
    if (!historyDep) return;

    const fromKey = normalizeToMonthKey(periodForm.fromMonth);
    const toKey = periodForm.isOngoing ? '' : normalizeToMonthKey(periodForm.toMonth);

    if (!fromKey) {
      showHistoryNotice('error', 'Vui lòng chọn Tháng bắt đầu (YYYY-MM).');
      return;
    }
    if (!periodForm.isOngoing && !toKey) {
      showHistoryNotice('error', 'Vui lòng chọn Tháng kết thúc hoặc tích "Đang áp dụng đến nay".');
      return;
    }
    if (toKey && toKey < fromKey) {
      showHistoryNotice('error', 'Tháng kết thúc không được nhỏ hơn Tháng bắt đầu.');
      return;
    }

    const effectiveAmt =
      periodForm.status === 'paused' || periodForm.status === 'ended'
        ? 0
        : Math.max(0, Number(periodForm.deductionAmount) || 0);

    const currentHistory = [...(historyDep.deductionHistory || [])];
    const newItem: DependentDeductionPeriod = {
      id: periodForm.editingId || `dh-${historyDep.id}-${Date.now()}`,
      fromMonth: fromKey,
      toMonth: toKey,
      deductionAmount: effectiveAmt,
      status: periodForm.status,
      note: periodForm.note.trim()
    };

    let updatedHistory: DependentDeductionPeriod[];
    if (periodForm.editingId) {
      updatedHistory = currentHistory.map(p => (p.id === periodForm.editingId ? newItem : p));
    } else {
      // Nếu có giai đoạn cũ đang để "Đang áp dụng đến nay" và bắt đầu trước giai đoạn mới -> tự động đóng lại trước tháng bắt đầu mới
      const [fy, fm] = fromKey.split('-').map(Number);
      const prevEnd = new Date(fy, fm - 2, 1);
      const prevEndKey = `${prevEnd.getFullYear()}-${String(prevEnd.getMonth() + 1).padStart(2, '0')}`;
      updatedHistory = currentHistory.map(p => {
        if (!p.toMonth && normalizeToMonthKey(p.fromMonth) < fromKey) {
          return { ...p, toMonth: prevEndKey };
        }
        return p;
      });
      updatedHistory.push(newItem);
    }

    const syncedDep = syncDependentSummaryFromHistory(historyDep, updatedHistory, defaultDeduction);
    onUpdateDependent(syncedDep);
    showHistoryNotice('success', periodForm.editingId ? 'Đã cập nhật giai đoạn giảm trừ!' : 'Đã thêm giai đoạn giảm trừ mới!');

    setPeriodForm({
      editingId: null,
      fromMonth: currentWorkingMonthKey,
      toMonth: '',
      isOngoing: true,
      status: 'active',
      deductionAmount: defaultDeduction,
      note: ''
    });
  };

  const handleEditPeriodClick = (item: DependentDeductionPeriod) => {
    setPeriodForm({
      editingId: item.id,
      fromMonth: normalizeToMonthKey(item.fromMonth),
      toMonth: item.toMonth ? normalizeToMonthKey(item.toMonth) : '',
      isOngoing: !item.toMonth,
      status: item.status || ((Number(item.deductionAmount) || 0) > 0 ? 'active' : 'paused'),
      deductionAmount: Number(item.deductionAmount) || 0,
      note: item.note || ''
    });
  };

  const handleConfirmDeletePeriod = () => {
    if (!historyDep || !deletePeriodConfirm.periodId) return;
    const remaining = (historyDep.deductionHistory || []).filter(p => p.id !== deletePeriodConfirm.periodId);
    const synced = syncDependentSummaryFromHistory(historyDep, remaining, defaultDeduction);
    onUpdateDependent(synced);
    setDeletePeriodConfirm({ isOpen: false, periodId: null, label: '' });
    showHistoryNotice('success', 'Đã xóa giai đoạn khỏi quá trình giảm trừ.');
  };

  // Áp dụng giai đoạn mới hàng loạt cho toàn bộ NPT đang hiệu lực
  const handleApplyBulkRatePeriod = (e: React.FormEvent) => {
    e.preventDefault();
    const fromKey = normalizeToMonthKey(bulkFromMonth);
    if (!fromKey) {
      showTempNotice('error', 'Tháng bắt đầu áp dụng không hợp lệ.');
      return;
    }

    const [fy, fm] = fromKey.split('-').map(Number);
    const prevDate = new Date(fy, fm - 2, 1);
    const prevEndKey = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

    let updatedCount = 0;
    dependents.forEach(dep => {
      const depEnd = dep.endDate ? normalizeToMonthKey(dep.endDate) : '';
      // Bỏ qua những NPT đã kết thúc trước tháng áp dụng mới
      if (depEnd && depEnd < fromKey) return;

      const existing = [...(dep.deductionHistory || [])];
      let nextHistory: DependentDeductionPeriod[];

      if (existing.length === 0) {
        const startKey = dep.startDate ? normalizeToMonthKey(dep.startDate) : fromKey;
        if (startKey < fromKey) {
          nextHistory = [
            {
              id: `dh-${dep.id}-pre-${Date.now()}`,
              fromMonth: startKey,
              toMonth: prevEndKey,
              deductionAmount: bulkPriorAmount,
              status: 'active',
              note: `Mức giảm trừ giai đoạn trước (${formatVND(bulkPriorAmount)}/tháng)`
            },
            {
              id: `dh-${dep.id}-new-${Date.now() + 1}`,
              fromMonth: fromKey,
              toMonth: depEnd,
              deductionAmount: bulkNewAmount,
              status: 'active',
              note: bulkNote
            }
          ];
        } else {
          nextHistory = [
            {
              id: `dh-${dep.id}-new-${Date.now()}`,
              fromMonth: startKey,
              toMonth: depEnd,
              deductionAmount: bulkNewAmount,
              status: 'active',
              note: bulkNote
            }
          ];
        }
      } else {
        // Kiểm tra xem đã có giai đoạn bắt đầu đúng từ fromKey chưa
        const exactIdx = existing.findIndex(p => normalizeToMonthKey(p.fromMonth) === fromKey);
        if (exactIdx >= 0) {
          nextHistory = existing.map((p, idx) =>
            idx === exactIdx
              ? { ...p, deductionAmount: bulkNewAmount, status: 'active', note: bulkNote }
              : p
          );
        } else {
          nextHistory = existing.map(p => {
            const pFrom = normalizeToMonthKey(p.fromMonth);
            const pTo = p.toMonth ? normalizeToMonthKey(p.toMonth) : '';
            if (pFrom < fromKey && (!pTo || pTo >= fromKey)) {
              return { ...p, toMonth: prevEndKey };
            }
            return p;
          });
          nextHistory.push({
            id: `dh-${dep.id}-bulk-${Date.now()}`,
            fromMonth: fromKey,
            toMonth: depEnd,
            deductionAmount: bulkNewAmount,
            status: 'active',
            note: bulkNote
          });
        }
      }

      onUpdateDependent(syncDependentSummaryFromHistory(dep, nextHistory, bulkNewAmount));
      updatedCount++;
    });

    setIsBulkRateModalOpen(false);
    showTempNotice('success', `Đã cập nhật quá trình tính giảm trừ từ tháng ${fromKey} (${formatVND(bulkNewAmount)}/tháng) cho ${updatedCount} người phụ thuộc!`);
  };

  // Modal Thêm / Sửa Hồ Sơ NPT (Tab 1)
  const handleOpenAdd = () => {
    setEditingDep(null);
    setFormError(null);
    setEmpSearchQuery('');
    setIsEmpSearchOpen(false);
    setFormData({
      id: `dep-${Date.now()}`,
      employeeId: '',
      fullName: '',
      taxCodeOrId: '',
      relationship: 'Con đẻ/Con nuôi',
      birthDate: '2018-01-01',
      startDate: currentWorkingMonthKey,
      endDate: '',
      deductionAmount: defaultDeduction,
      note: ''
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (dep: Dependent) => {
    setEditingDep(dep);
    setFormError(null);
    setEmpSearchQuery('');
    setIsEmpSearchOpen(false);
    setFormData({
      ...dep,
      deductionAmount: dep.deductionAmount || defaultDeduction
    });
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!formData.employeeId) {
      setFormError('Vui lòng tìm kiếm và chọn Nhân viên liên quan!');
      return;
    }
    if (!formData.fullName || !formData.fullName.trim()) {
      setFormError('Vui lòng nhập Họ và tên người phụ thuộc!');
      return;
    }

    const startKey = formData.startDate ? normalizeToMonthKey(formData.startDate) : currentWorkingMonthKey;
    const endKey = formData.endDate ? normalizeToMonthKey(formData.endDate) : '';
    const amt = Number(formData.deductionAmount) || defaultDeduction;

    if (endKey && endKey < startKey) {
      setFormError('Tháng kết thúc giảm trừ không được nhỏ hơn tháng bắt đầu.');
      return;
    }

    let nextHistory = editingDep?.deductionHistory ? [...editingDep.deductionHistory] : undefined;
    if (!editingDep) {
      nextHistory = [
        {
          id: `dh-${formData.id || Date.now()}-1`,
          fromMonth: startKey,
          toMonth: endKey,
          deductionAmount: amt,
          status: 'active',
          note: formData.note || 'Đăng ký mới người phụ thuộc'
        }
      ];
    } else if (nextHistory && nextHistory.length === 1) {
      // Nếu mới có đúng 1 giai đoạn cơ bản, đồng bộ theo thông tin form đang sửa
      nextHistory = [
        {
          ...nextHistory[0],
          fromMonth: startKey,
          toMonth: endKey,
          deductionAmount: amt
        }
      ];
    }

    const item: Dependent = {
      id: formData.id || `dep-${Date.now()}`,
      employeeId: formData.employeeId,
      fullName: formData.fullName.trim(),
      taxCodeOrId: formData.taxCodeOrId || '',
      relationship: (formData.relationship as RelationshipType) || 'Con đẻ/Con nuôi',
      birthDate: formData.birthDate || '2018-01-01',
      startDate: startKey,
      endDate: endKey,
      deductionAmount: amt,
      deductionHistory: nextHistory,
      note: formData.note || ''
    };

    if (editingDep) {
      onUpdateDependent(item);
      showTempNotice('success', `Đã cập nhật hồ sơ người phụ thuộc "${item.fullName}".`);
    } else {
      onAddDependent(item);
      showTempNotice('success', `Đã đăng ký mới người phụ thuộc "${item.fullName}" và khởi tạo quá trình giảm trừ.`);
    }
    setIsModalOpen(false);
  };

  const handleExportExcel = () => {
    const rows = dependents.map((d, idx) => {
      const emp = empMap.get(d.employeeId);
      const effNow = getEffectiveDependentDeductionForMonth(d, currentWorkingMonth, currentWorkingYear, settings);
      const periods = getEffectivePeriodsList(d);
      const periodSummary = periods.length > 0
        ? periods
            .map(p => `${p.fromMonth}->${p.toMonth || 'nay'}: ${p.status === 'paused' ? 'Tạm ngừng' : formatVND(p.deductionAmount)}`)
            .join(' | ')
        : `${d.startDate}->${d.endDate || 'Hiện tại'}: ${formatVND(d.deductionAmount)}`;

      return {
        'STT': idx + 1,
        'Mã Nhân Viên': emp?.employeeCode || '',
        'Số CCCD NLĐ': emp?.idCardNumber || '',
        'Họ Tên Nhân Viên': emp?.fullName || '',
        'Họ Tên Người Phụ Thuộc': d.fullName,
        'CCCD / Mã Định Danh / MST NPT': d.taxCodeOrId,
        'Mối Quan Hệ': d.relationship,
        'Ngày Sinh': d.birthDate,
        'Tuổi': calculateAge(d.birthDate),
        'Bắt Đầu Giảm Trừ': d.startDate,
        'Kết Thúc Giảm Trừ': d.endDate || 'Hiện tại',
        [`Mức Giảm Trừ T${currentWorkingMonth}/${currentWorkingYear}`]: effNow.amount,
        'Quá Trình Tính Giảm Trừ': periodSummary,
        'Ghi Chú': d.note || ''
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Nguoi_Phu_Thuoc');
    XLSX.writeFile(wb, `Danh_Sach_Nguoi_Phu_Thuoc_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const imported = await readDependentExcel(file, employees);
      if (imported.length === 0) {
        showTempNotice('error', 'File không có dữ liệu người phụ thuộc hoặc không đúng định dạng!');
        return;
      }
      const enriched = imported.map(item => ({
        ...item,
        deductionHistory: [
          {
            id: `dh-${item.id}-imp`,
            fromMonth: normalizeToMonthKey(item.startDate) || currentWorkingMonthKey,
            toMonth: item.endDate ? normalizeToMonthKey(item.endDate) : '',
            deductionAmount: item.deductionAmount || defaultDeduction,
            status: 'active' as const,
            note: item.note || 'Nhập từ Excel'
          }
        ]
      }));

      if (onBatchAddDependents) {
        onBatchAddDependents(enriched);
      } else {
        enriched.forEach(item => onAddDependent(item));
      }
      showTempNotice('success', `Đã nhập thành công ${enriched.length} người phụ thuộc từ file Excel!`);
    } catch (err: any) {
      showTempNotice('error', `Lỗi khi đọc file Excel người phụ thuộc: ${err.message}`);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ====== TÍNH TOÁN DỮ LIỆU TAB 2: QUÁ TRÌNH TÍNH GIẢM TRỪ 12 THÁNG ======
  const dependentAnnualProcess = useMemo(() => {
    return dependents.map(dep => {
      const emp = empMap.get(dep.employeeId);
      const months: Record<number, ReturnType<typeof getEffectiveDependentDeductionForMonth>> = {};
      let activeMonthsCount = 0;
      let annualTotal = 0;
      let hasPausedInYear = false;
      let hasEndedOrExpiredInYear = false;

      for (let m = 1; m <= 12; m++) {
        const res = getEffectiveDependentDeductionForMonth(dep, m, processYear, settings);
        months[m] = res;
        if (res.isEligible) {
          activeMonthsCount++;
          annualTotal += res.amount;
        }
        if (res.status === 'paused') hasPausedInYear = true;
        if (res.status === 'ended' || res.status === 'expired') hasEndedOrExpiredInYear = true;
      }

      return {
        dependent: dep,
        employee: emp,
        departmentName: emp ? depMap.get(emp.departmentId) || '' : '',
        ageNum: getNumericAge(dep.birthDate),
        months,
        activeMonthsCount,
        annualTotal,
        hasPausedInYear,
        hasEndedOrExpiredInYear
      };
    });
  }, [dependents, empMap, depMap, processYear, settings]);

  const filteredProcessDependents = useMemo(() => {
    const q = processSearchTerm.trim().toLowerCase();
    return dependentAnnualProcess.filter(row => {
      const matchDept = processDeptFilter === 'all' || row.employee?.departmentId === processDeptFilter;
      const matchSearch =
        !q ||
        row.dependent.fullName.toLowerCase().includes(q) ||
        (row.dependent.taxCodeOrId || '').toLowerCase().includes(q) ||
        (row.employee?.fullName || '').toLowerCase().includes(q) ||
        (row.employee?.employeeCode || '').toLowerCase().includes(q) ||
        (row.employee?.idCardNumber || '').toLowerCase().includes(q);
      return matchDept && matchSearch;
    });
  }, [dependentAnnualProcess, processDeptFilter, processSearchTerm]);

  const employeeAnnualProcess = useMemo(() => {
    const q = processSearchTerm.trim().toLowerCase();
    return employees
      .filter(emp => {
        const matchDept = processDeptFilter === 'all' || emp.departmentId === processDeptFilter;
        const empDeps = dependentAnnualProcess.filter(d => d.dependent.employeeId === emp.id);
        if (onlyEmployeesWithDeps && empDeps.length === 0) return false;

        const matchSearch =
          !q ||
          emp.fullName.toLowerCase().includes(q) ||
          emp.employeeCode.toLowerCase().includes(q) ||
          (emp.idCardNumber || '').toLowerCase().includes(q) ||
          empDeps.some(
            d =>
              d.dependent.fullName.toLowerCase().includes(q) ||
              (d.dependent.taxCodeOrId || '').toLowerCase().includes(q)
          );
        return matchDept && matchSearch;
      })
      .map(emp => {
        const empDepRows = dependentAnnualProcess.filter(d => d.dependent.employeeId === emp.id);
        const monthlyAmounts: Record<number, number> = {};
        const monthlyCounts: Record<number, number> = {};
        const monthlyDetails: Record<number, { name: string; amount: number }[]> = {};
        let annualTotal = 0;
        let totalDepMonths = 0;

        for (let m = 1; m <= 12; m++) {
          let sumM = 0;
          let cntM = 0;
          const details: { name: string; amount: number }[] = [];
          empDepRows.forEach(dRow => {
            const eff = dRow.months[m];
            if (eff && eff.isEligible) {
              sumM += eff.amount;
              cntM++;
              totalDepMonths++;
              details.push({ name: dRow.dependent.fullName, amount: eff.amount });
            }
          });
          monthlyAmounts[m] = sumM;
          monthlyCounts[m] = cntM;
          monthlyDetails[m] = details;
          annualTotal += sumM;
        }

        return {
          employee: emp,
          departmentName: depMap.get(emp.departmentId) || '',
          depRows: empDepRows,
          monthlyAmounts,
          monthlyCounts,
          monthlyDetails,
          annualTotal,
          totalDepMonths
        };
      });
  }, [employees, dependentAnnualProcess, processDeptFilter, processSearchTerm, onlyEmployeesWithDeps, depMap]);

  // KPI cho Tab 2
  const processKpis = useMemo(() => {
    const activeDepsInYear = filteredProcessDependents.filter(d => d.activeMonthsCount > 0).length;
    const totalDepMonths = filteredProcessDependents.reduce((s, d) => s + d.activeMonthsCount, 0);
    const totalAnnualDeduction = filteredProcessDependents.reduce((s, d) => s + d.annualTotal, 0);
    const warningDepsCount = filteredProcessDependents.filter(
      d => (d.ageNum !== null && d.ageNum >= 18) || d.hasPausedInYear || d.hasEndedOrExpiredInYear
    ).length;
    return {
      totalRegistered: filteredProcessDependents.length,
      activeDepsInYear,
      totalDepMonths,
      totalAnnualDeduction,
      warningDepsCount
    };
  }, [filteredProcessDependents]);

  const toggleExpandEmployee = (empId: string) => {
    setExpandedEmpIds(prev => {
      const next = new Set(prev);
      if (next.has(empId)) next.delete(empId);
      else next.add(empId);
      return next;
    });
  };

  const handleExportProcessExcel = () => {
    const wb = XLSX.utils.book_new();

    const empSheetRows = employeeAnnualProcess.map((row, idx) => {
      const base: Record<string, any> = {
        'STT': idx + 1,
        'Mã NV': row.employee.employeeCode,
        'Số CCCD NLĐ': row.employee.idCardNumber || '',
        'Họ Tên Nhân Viên': row.employee.fullName,
        'Phòng Ban': row.departmentName,
        'Số NPT ĐK': row.depRows.length
      };
      for (let m = 1; m <= 12; m++) {
        base[`Tháng ${m}/${processYear}`] = row.monthlyAmounts[m] || 0;
      }
      base['Tổng Giảm Trừ Cả Năm (VNĐ)'] = row.annualTotal;
      return base;
    });
    const wsEmp = XLSX.utils.json_to_sheet(empSheetRows);
    XLSX.utils.book_append_sheet(wb, wsEmp, `Theo_NLD_${processYear}`);

    const depSheetRows = filteredProcessDependents.map((row, idx) => {
      const base: Record<string, any> = {
        'STT': idx + 1,
        'Mã NV': row.employee?.employeeCode || '',
        'Họ Tên NLĐ': row.employee?.fullName || '',
        'Họ Tên NPT': row.dependent.fullName,
        'CCCD/MST NPT': row.dependent.taxCodeOrId || '',
        'Mối Quan Hệ': row.dependent.relationship,
        'Tuổi': row.ageNum !== null ? row.ageNum : ''
      };
      for (let m = 1; m <= 12; m++) {
        base[`T${m}`] = row.months[m]?.isEligible ? row.months[m].amount : 0;
      }
      base['Số Tháng Giảm Trừ'] = row.activeMonthsCount;
      base['Tổng Giảm Trừ Năm (VNĐ)'] = row.annualTotal;
      return base;
    });
    const wsDep = XLSX.utils.json_to_sheet(depSheetRows);
    XLSX.utils.book_append_sheet(wb, wsDep, `Chi_Tiet_NPT_${processYear}`);

    XLSX.writeFile(wb, `Qua_Trinh_Giam_Tru_NPT_Nam_${processYear}.xlsx`);
  };

  return (
    <div className="space-y-6">
      {/* Sub-tabs Navigation Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-2 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveSubTab('list')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeSubTab === 'list'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Danh Sách & Hồ Sơ NPT ({dependents.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('process')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeSubTab === 'process'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Quá Trình Tính Giảm Trừ (12 Tháng)</span>
          </button>
        </div>

        <div className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 flex items-center gap-2">
          <Calendar className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span>
            Kỳ lương đang xem: <strong className="text-slate-900 font-mono">Tháng {currentWorkingMonth}/{currentWorkingYear}</strong> • Mức chuẩn:{' '}
            <strong className="text-emerald-700 font-mono">{formatVND(defaultDeduction)}</strong>/NPT/tháng
          </span>
        </div>
      </div>

      {viewNotice && (
        <div
          className={`p-3.5 rounded-xl text-xs font-semibold flex items-center justify-between gap-2 border animate-in fade-in ${
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
          <button
            type="button"
            onClick={() => setViewNotice(null)}
            className="p-1 hover:bg-white/70 rounded-lg cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ==================== TAB 1: DANH SÁCH & HỒ SƠ NPT ==================== */}
      {activeSubTab === 'list' && (
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div>
              <h2 className="text-xl font-black text-slate-900 tracking-tight">Danh Sách Người Phụ Thuộc Của NLĐ</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Quản lý hồ sơ giảm trừ gia cảnh thuế TNCN & theo dõi quá trình thay đổi mức giảm trừ theo từng giai đoạn (Mức hiện hành: {formatVND(defaultDeduction)} / người / tháng)
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
                    title="Nhập danh sách người phụ thuộc từ Excel"
                  >
                    <Upload className="w-4 h-4 text-slate-500" />
                    <span>Nhập Excel</span>
                  </button>

                  <button
                    onClick={downloadDependentTemplate}
                    className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition-colors cursor-pointer"
                    title="Tải mẫu Excel chuẩn người phụ thuộc"
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
                    title="In danh sách người phụ thuộc giảm trừ gia cảnh"
                  >
                    <Printer className="w-4 h-4 text-emerald-600" />
                    <span>In Danh Sách NPT</span>
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
                  onClick={handleOpenAdd}
                  className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Đăng Ký Người Phụ Thuộc</span>
                </button>
              )}
            </div>
          </div>

          {/* Search, Sort & Warning Filters */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs text-xs space-y-3">
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Tìm theo Tên NPT, Tên Nhân Viên, Mã NV, CCCD..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5">
                  <ArrowUpDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span className="font-bold text-slate-600 text-[11px] whitespace-nowrap">Sắp xếp:</span>
                  <select
                    value={sortField}
                    onChange={e => setSortField(e.target.value as any)}
                    className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none cursor-pointer"
                  >
                    <option value="none">Mặc định</option>
                    <option value="employee">Nhân viên liên quan</option>
                    <option value="employeeCccd">Số CCCD người lao động</option>
                    <option value="fullName">Họ và Tên NPT</option>
                    <option value="taxCodeOrId">CCCD / Mã số NPT</option>
                    <option value="birthDate">Ngày sinh / Tuổi</option>
                    <option value="deductionAmount">Mức giảm trừ</option>
                  </select>
                  {sortField !== 'none' && (
                    <button
                      type="button"
                      onClick={() => setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'))}
                      className="p-1 text-slate-600 hover:text-emerald-700 hover:bg-slate-200 rounded transition-colors cursor-pointer"
                      title={sortDirection === 'asc' ? 'Đang tăng dần (A → Z). Nhấn để giảm dần' : 'Đang giảm dần (Z → A). Nhấn để tăng dần'}
                    >
                      {sortDirection === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-emerald-600" /> : <ArrowDown className="w-3.5 h-3.5 text-emerald-600" />}
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setFilterDuplicateDepOnly(!filterDuplicateDepOnly)}
                  className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-colors cursor-pointer border text-xs ${
                    filterDuplicateDepOnly
                      ? 'bg-red-600 text-white border-red-700 shadow-2xs'
                      : totalDuplicateDepRecords > 0
                        ? 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
                        : 'bg-slate-100 text-slate-500 border-slate-200'
                  }`}
                  title="Lọc nhanh danh sách người phụ thuộc bị trùng CCCD hoặc Mã số thuế"
                >
                  <AlertTriangle className={`w-3.5 h-3.5 ${filterDuplicateDepOnly ? 'text-white' : totalDuplicateDepRecords > 0 ? 'text-red-600' : 'text-slate-400'}`} />
                  <span>Báo trùng CCCD/MST NPT {totalDuplicateDepRecords > 0 ? `(${totalDuplicateDepRecords})` : ''}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFilterOver18Only(!filterOver18Only)}
                  className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-colors cursor-pointer border text-xs ${
                    filterOver18Only
                      ? 'bg-amber-600 text-white border-amber-700 shadow-2xs'
                      : totalOver18Dependents > 0
                        ? 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                        : 'bg-slate-100 text-slate-500 border-slate-200'
                  }`}
                  title="Lọc nhanh người phụ thuộc từ 18 tuổi trở lên (cần xác minh điều kiện khuyết tật hoặc đang học ĐH/CĐ)"
                >
                  <AlertCircle className={`w-3.5 h-3.5 ${filterOver18Only ? 'text-white' : totalOver18Dependents > 0 ? 'text-amber-700' : 'text-slate-400'}`} />
                  <span>Cảnh báo NPT ≥ 18 tuổi {totalOver18Dependents > 0 ? `(${totalOver18Dependents})` : ''}</span>
                </button>
              </div>
            </div>

            {(filterDuplicateDepOnly || filterOver18Only || searchTerm) && (
              <div className="flex items-center justify-between p-2 bg-slate-50 rounded-lg text-[11px] text-slate-600">
                <span>
                  Đang lọc hiển thị <strong>{filteredDependents.length}</strong> / {dependents.length} người phụ thuộc.
                </span>
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setFilterDuplicateDepOnly(false);
                    setFilterOver18Only(false);
                  }}
                  className="text-emerald-700 hover:underline font-bold cursor-pointer"
                >
                  Xóa bộ lọc
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
                      title="Nhấn để sắp xếp theo Nhân Viên Liên Quan"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Nhân Viên Liên Quan</span>
                        {sortField === 'employee' ? (
                          sortDirection === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-emerald-600" /> : <ArrowDown className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-300 opacity-70" />
                        )}
                      </div>
                    </th>
                    <th
                      onClick={() => handleToggleSort('employeeCccd')}
                      className="px-4 py-3 cursor-pointer hover:bg-slate-100/80 transition-colors select-none"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Số CCCD NLĐ</span>
                        {sortField === 'employeeCccd' ? (
                          sortDirection === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-emerald-600" /> : <ArrowDown className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-300 opacity-70" />
                        )}
                      </div>
                    </th>
                    <th
                      onClick={() => handleToggleSort('fullName')}
                      className="px-4 py-3 cursor-pointer hover:bg-slate-100/80 transition-colors select-none"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Họ và Tên NPT</span>
                        {sortField === 'fullName' ? (
                          sortDirection === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-emerald-600" /> : <ArrowDown className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-300 opacity-70" />
                        )}
                      </div>
                    </th>
                    <th
                      onClick={() => handleToggleSort('taxCodeOrId')}
                      className="px-4 py-3 cursor-pointer hover:bg-slate-100/80 transition-colors select-none"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>CCCD / Mã Số NPT</span>
                        {sortField === 'taxCodeOrId' ? (
                          sortDirection === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-emerald-600" /> : <ArrowDown className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-300 opacity-70" />
                        )}
                      </div>
                    </th>
                    <th className="px-4 py-3">Mối Quan Hệ</th>
                    <th
                      onClick={() => handleToggleSort('birthDate')}
                      className="px-4 py-3 cursor-pointer hover:bg-slate-100/80 transition-colors select-none"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Ngày Sinh</span>
                        {sortField === 'birthDate' ? (
                          sortDirection === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-emerald-600" /> : <ArrowDown className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-300 opacity-70" />
                        )}
                      </div>
                    </th>
                    <th className="px-4 py-3 text-center">Tuổi & Cảnh Báo</th>
                    <th className="px-4 py-3">Quá Trình Giảm Trừ</th>
                    <th
                      onClick={() => handleToggleSort('deductionAmount')}
                      className="px-4 py-3 text-right cursor-pointer hover:bg-slate-100/80 transition-colors select-none"
                    >
                      <div className="flex items-center justify-end gap-1.5">
                        <span>Giảm Trừ (T{currentWorkingMonth}/{currentWorkingYear})</span>
                        {sortField === 'deductionAmount' ? (
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
                  {filteredDependents.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="px-6 py-8 text-center text-slate-400">
                        Chưa có người phụ thuộc nào được đăng ký.
                      </td>
                    </tr>
                  ) : (
                    filteredDependents.map(dep => {
                      const emp = empMap.get(dep.employeeId);
                      const isDuplicateEmpCccd = emp?.idCardNumber ? duplicateEmpIdCards.has(emp.idCardNumber.trim()) : false;
                      const isDuplicateDepCccd = dep.taxCodeOrId ? duplicateDepCards.has(dep.taxCodeOrId.trim()) : false;
                      const periods = getEffectivePeriodsList(dep);
                      const effNow = getEffectiveDependentDeductionForMonth(dep, currentWorkingMonth, currentWorkingYear, settings);

                      return (
                        <tr key={dep.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-4 py-3.5">
                            <div className="font-bold text-slate-900">{emp?.fullName || 'Không rõ'}</div>
                            <div className="font-mono text-[11px] text-emerald-700 font-semibold">{emp?.employeeCode}</div>
                          </td>
                          <td className="px-4 py-3.5 font-mono">
                            <div className="font-semibold text-slate-900">{emp?.idCardNumber || '—'}</div>
                            {isDuplicateEmpCccd && (
                              <span
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 font-extrabold text-[9px] mt-0.5 whitespace-nowrap shadow-2xs"
                                title="Số CCCD của người lao động này trùng với một mã nhân viên khác"
                              >
                                <AlertTriangle className="w-2.5 h-2.5 text-amber-700" />
                                Trùng CCCD
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 font-bold text-slate-800 text-sm">
                            {dep.fullName}
                          </td>
                          <td className="px-4 py-3.5 font-mono">
                            <div className={`font-semibold ${isDuplicateDepCccd ? 'text-red-700 font-black text-[13px]' : 'text-slate-800'}`}>
                              {dep.taxCodeOrId || '-'}
                            </div>
                            {isDuplicateDepCccd && (
                              <div className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded bg-red-100 text-red-900 border border-red-300 font-bold text-[10px] whitespace-nowrap shadow-2xs">
                                <AlertTriangle className="w-3 h-3 text-red-600 shrink-0" />
                                <span>BÁO TRÙNG CCCD/MST NPT ({duplicateDepCounts.get((dep.taxCodeOrId || '').trim())} hồ sơ)</span>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3.5">
                            <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded font-semibold text-[11px]">
                              {dep.relationship}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-slate-600 font-mono">
                            {dep.birthDate}
                          </td>
                          <td className="px-4 py-3.5 text-center font-mono">
                            {(() => {
                              const numAge = getNumericAge(dep.birthDate);
                              const isOver18 = numAge !== null && numAge >= 18;
                              return (
                                <div className="flex flex-col items-center">
                                  <span className={`font-bold ${isOver18 ? 'text-amber-950 font-black' : 'text-slate-700'}`}>
                                    {calculateAge(dep.birthDate)}
                                  </span>
                                  {isOver18 && (
                                    <span
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-950 border border-amber-300 font-extrabold text-[9px] mt-0.5 whitespace-nowrap shadow-2xs"
                                      title="Cảnh báo: Người phụ thuộc từ 18 tuổi trở lên. Theo quy định, con trên 18 tuổi chỉ được giảm trừ nếu bị khuyết tật không có khả năng lao động hoặc đang theo học đại học/cao đẳng."
                                    >
                                      <AlertCircle className="w-2.5 h-2.5 text-amber-700 shrink-0" />
                                      <span>≥ 18T (Cần xác minh)</span>
                                    </span>
                                  )}
                                </div>
                              );
                            })()}
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="font-mono text-slate-700">
                              <span>{dep.startDate}</span>
                              <span className="text-slate-400"> → </span>
                              <span>{dep.endDate || 'Hiện tại'}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleOpenHistoryModal(dep)}
                              className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-bold transition-colors cursor-pointer"
                              title="Nhấn để xem và thiết lập chi tiết quá trình tính giảm trừ qua từng giai đoạn"
                            >
                              <History className="w-3 h-3 text-emerald-600" />
                              <span>
                                {periods.length > 0 ? `${periods.length} giai đoạn` : 'Thiết lập quá trình'}
                              </span>
                            </button>
                          </td>
                          <td className="px-4 py-3.5 text-right font-mono">
                            <div className={`font-bold ${effNow.isEligible ? 'text-emerald-700' : 'text-slate-400 line-through'}`}>
                              {formatVND(effNow.isEligible ? effNow.amount : 0)}
                            </div>
                            <div className="mt-0.5">
                              {effNow.status === 'active' && (
                                <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                                  Đang giảm trừ
                                </span>
                              )}
                              {effNow.status === 'paused' && (
                                <span className="text-[10px] font-semibold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">
                                  Tạm ngừng
                                </span>
                              )}
                              {(effNow.status === 'ended' || effNow.status === 'expired') && (
                                <span className="text-[10px] font-semibold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded">
                                  Đã kết thúc
                                </span>
                              )}
                              {effNow.status === 'not_started' && (
                                <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                                  Chưa bắt đầu
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-slate-500 max-w-[180px] truncate" title={dep.note || ''}>
                            {dep.note || '-'}
                          </td>
                          <td className="px-4 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => handleOpenHistoryModal(dep)}
                                className="p-1.5 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded-lg cursor-pointer transition-colors"
                                title="Quá trình tính giảm trừ người phụ thuộc"
                              >
                                <History className="w-4 h-4" />
                              </button>
                              {canEditEmployees && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEdit(dep)}
                                    className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg cursor-pointer transition-colors"
                                    title="Chỉnh sửa hồ sơ người phụ thuộc"
                                  >
                                    <Edit3 className="w-4 h-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onDeleteDependent(dep.id);
                                    }}
                                    className="p-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg cursor-pointer transition-colors"
                                    title="Xóa người phụ thuộc"
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
        </div>
      )}

      {/* ==================== TAB 2: QUÁ TRÌNH TÍNH GIẢM TRỪ (12 THÁNG / NĂM) ==================== */}
      {activeSubTab === 'process' && (
        <div className="space-y-5 animate-in fade-in duration-150">
          {/* Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-black text-slate-900 tracking-tight">
                  Quá Trình Tính Giảm Trừ Người Phụ Thuộc Năm {processYear}
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                  {processKpis.activeDepsInYear} / {processKpis.totalRegistered} NPT phát sinh giảm trừ
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Theo dõi chi tiết số người phụ thuộc hợp lệ và mức giảm trừ gia cảnh từng tháng (T1–T12), làm căn cứ tính thuế TNCN hàng tháng & quyết toán thuế cả năm
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {canEditEmployees && (
                <button
                  type="button"
                  onClick={() => {
                    setBulkFromMonth(`${processYear}-01`);
                    setBulkNewAmount(defaultDeduction);
                    setIsBulkRateModalOpen(true);
                  }}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 font-bold text-xs rounded-xl transition-colors cursor-pointer"
                  title="Tự động tạo giai đoạn mức giảm trừ mới cho toàn bộ người phụ thuộc đang hiệu lực"
                >
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                  <span>Cập Nhật Giai Đoạn Mới Hàng Loạt</span>
                </button>
              )}

              {canExportData && (
                <button
                  type="button"
                  onClick={handleExportProcessExcel}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  <Download className="w-4 h-4 text-emerald-600" />
                  <span>Xuất Excel Quá Trình</span>
                </button>
              )}
            </div>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-slate-500 font-semibold uppercase tracking-wider block">Hồ Sơ NPT Hiệu Lực Năm</span>
              <div className="text-xl font-black text-slate-900 mt-1">
                {processKpis.activeDepsInYear} / {processKpis.totalRegistered} người
              </div>
              <span className="text-emerald-700 font-medium mt-0.5 block">
                Có phát sinh giảm trừ trong năm {processYear}
              </span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-slate-500 font-semibold uppercase tracking-wider block">Tổng Lượt Tháng Giảm Trừ</span>
              <div className="text-xl font-black font-mono text-slate-900 mt-1">
                {processKpis.totalDepMonths} lượt-tháng
              </div>
              <span className="text-slate-500 mt-0.5 block">
                Tổng số tháng đủ điều kiện tính thuế năm {processYear}
              </span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-slate-500 font-semibold uppercase tracking-wider block">Tổng Giảm Trừ NPT Cả Năm</span>
              <div className="text-xl font-black font-mono text-emerald-700 mt-1">
                {formatVND(processKpis.totalAnnualDeduction)}
              </div>
              <span className="text-slate-500 mt-0.5 block">
                Tính theo đúng mức từng giai đoạn trong năm
              </span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-slate-500 font-semibold uppercase tracking-wider block">Lưu Ý Rà Soát Hồ Sơ</span>
              <div className="text-xl font-black font-mono text-amber-700 mt-1">
                {processKpis.warningDepsCount} hồ sơ
              </div>
              <span className="text-slate-500 mt-0.5 block">
                NPT ≥ 18 tuổi, tạm ngừng hoặc hết hạn trong năm
              </span>
            </div>
          </div>

          {/* Filter & View Mode Toolbar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="text-xs font-bold text-slate-700">Năm:</span>
                <select
                  value={processYear}
                  onChange={e => setProcessYear(Number(e.target.value))}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-emerald-900 cursor-pointer focus:ring-2 focus:ring-emerald-500"
                >
                  {getAvailableYears(processYear).map(y => (
                    <option key={y} value={y}>Năm {y}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                <select
                  value={processDeptFilter}
                  onChange={e => setProcessDeptFilter(e.target.value)}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 cursor-pointer"
                >
                  <option value="all">Tất cả phòng ban</option>
                  {(settings?.departments || []).map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>

              <div className="relative min-w-[220px]">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Tìm theo Tên NLĐ, Mã NV, Tên NPT..."
                  value={processSearchTerm}
                  onChange={e => setProcessSearchTerm(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {processViewMode === 'by_employee' && (
                <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={onlyEmployeesWithDeps}
                    onChange={e => setOnlyEmployeesWithDeps(e.target.checked)}
                    className="rounded text-emerald-600 cursor-pointer"
                  />
                  <span>Chỉ hiện NV có đăng ký NPT</span>
                </label>
              )}
            </div>

            <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-semibold shrink-0 self-start xl:self-auto">
              <button
                type="button"
                onClick={() => setProcessViewMode('by_employee')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  processViewMode === 'by_employee'
                    ? 'bg-white text-emerald-800 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Theo Người Lao Động</span>
              </button>
              <button
                type="button"
                onClick={() => setProcessViewMode('by_dependent')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  processViewMode === 'by_dependent'
                    ? 'bg-white text-emerald-800 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Chi Tiết Từng NPT</span>
              </button>
            </div>
          </div>

          {/* Table View A: Theo Người Lao Động */}
          {processViewMode === 'by_employee' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-center border-collapse">
                  <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="p-2 border-r border-slate-200 w-9" rowSpan={2}>STT</th>
                      <th className="p-2 border-r border-slate-200 text-left min-w-[160px]" rowSpan={2}>Nhân Viên & Phòng Ban</th>
                      <th className="p-2 border-r border-slate-200 w-16" rowSpan={2}>NPT ĐK</th>
                      <th className="p-1 border-b border-slate-200 text-center bg-emerald-50 text-emerald-950 font-bold" colSpan={12}>
                        Quá Trình Tính Giảm Trừ Người Phụ Thuộc 12 Tháng Năm {processYear} (VNĐ)
                      </th>
                      <th className="p-2 border-l border-slate-200 min-w-[115px] bg-emerald-100 text-emerald-950 font-black" rowSpan={2}>
                        Tổng Giảm Trừ Năm
                      </th>
                    </tr>
                    <tr className="bg-slate-100 text-[10px] text-slate-600 font-semibold">
                      {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                        <th key={m} className="p-1.5 border-r border-slate-200 min-w-[74px]">
                          T{m}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {employeeAnnualProcess.length === 0 ? (
                      <tr>
                        <td colSpan={16} className="p-8 text-center text-slate-400">
                          Không có nhân viên nào có dữ liệu người phụ thuộc phù hợp bộ lọc.
                        </td>
                      </tr>
                    ) : (
                      employeeAnnualProcess.map((row, idx) => {
                        const isExpanded = expandedEmpIds.has(row.employee.id);
                        return (
                          <React.Fragment key={row.employee.id}>
                            <tr
                              onClick={() => row.depRows.length > 0 && toggleExpandEmployee(row.employee.id)}
                              className={`hover:bg-slate-50/90 transition-colors ${row.depRows.length > 0 ? 'cursor-pointer' : ''} ${
                                isExpanded ? 'bg-emerald-50/30' : ''
                              }`}
                            >
                              <td className="p-2 text-slate-400 font-mono border-r border-slate-100">{idx + 1}</td>
                              <td className="p-2 text-left border-r border-slate-100">
                                <div className="flex items-center gap-1.5">
                                  {row.depRows.length > 0 && (
                                    isExpanded
                                      ? <ChevronDown className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                      : <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                  )}
                                  <div className="min-w-0">
                                    <div className="font-bold text-slate-900 truncate">{row.employee.fullName}</div>
                                    <div className="text-[10px] text-slate-500 font-mono truncate">
                                      <span className="text-emerald-700 font-semibold">{row.employee.employeeCode}</span>
                                      {row.departmentName ? ` • ${row.departmentName}` : ''}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className="p-2 border-r border-slate-100">
                                <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-800 font-bold text-[11px]">
                                  {row.depRows.length}
                                </span>
                              </td>

                              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
                                const amt = row.monthlyAmounts[m] || 0;
                                const cnt = row.monthlyCounts[m] || 0;
                                const details = row.monthlyDetails[m] || [];
                                const tooltip = details.length > 0
                                  ? details.map(d => `${d.name}: ${formatVND(d.amount)}`).join('\n')
                                  : 'Không có NPT được tính giảm trừ trong tháng này';
                                return (
                                  <td
                                    key={m}
                                    title={tooltip}
                                    className="p-1.5 border-r border-slate-100 text-right font-mono align-middle"
                                  >
                                    {cnt > 0 ? (
                                      <div className="flex flex-col items-end">
                                        <span className="text-[11px] font-bold text-slate-900">{formatNumber(amt)}</span>
                                        <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1 rounded">
                                          {cnt} NPT
                                        </span>
                                      </div>
                                    ) : (
                                      <span className="text-slate-300">-</span>
                                    )}
                                  </td>
                                );
                              })}

                              <td className="p-2 font-mono text-right font-black text-emerald-800 bg-emerald-50/40">
                                {formatVND(row.annualTotal)}
                              </td>
                            </tr>

                            {/* Expanded sub-rows per dependent */}
                            {isExpanded && row.depRows.map(dRow => (
                              <tr key={dRow.dependent.id} className="bg-slate-50/90 text-[11px]">
                                <td className="p-1.5 border-r border-slate-200 text-center text-slate-400">↳</td>
                                <td className="p-2 pl-7 text-left border-r border-slate-200" colSpan={2}>
                                  <div className="flex items-center justify-between gap-2">
                                    <div>
                                      <span className="font-bold text-slate-800">{dRow.dependent.fullName}</span>
                                      <span className="ml-1.5 text-[10px] text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded font-semibold">
                                        {dRow.dependent.relationship}
                                      </span>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleOpenHistoryModal(dRow.dependent);
                                      }}
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white hover:bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold text-[10px] cursor-pointer shrink-0"
                                      title="Chỉnh sửa các giai đoạn tính giảm trừ của NPT này"
                                    >
                                      <History className="w-3 h-3" />
                                      <span>Quá trình</span>
                                    </button>
                                  </div>
                                </td>
                                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
                                  const eff = dRow.months[m];
                                  return (
                                    <td
                                      key={m}
                                      title={eff?.reason}
                                      className="p-1.5 border-r border-slate-200 text-right font-mono"
                                    >
                                      {eff?.isEligible ? (
                                        <span className="text-emerald-700 font-semibold">{formatNumber(eff.amount)}</span>
                                      ) : eff?.status === 'paused' ? (
                                        <span className="text-[9px] font-bold text-amber-700 bg-amber-100 px-1 rounded">Ngừng</span>
                                      ) : (
                                        <span className="text-slate-300">-</span>
                                      )}
                                    </td>
                                  );
                                })}
                                <td className="p-2 text-right font-mono font-bold text-emerald-700">
                                  {formatVND(dRow.annualTotal)}
                                </td>
                              </tr>
                            ))}
                          </React.Fragment>
                        );
                      })
                    )}

                    {/* Grand Total Row */}
                    {employeeAnnualProcess.length > 0 && (
                      <tr className="bg-slate-200 font-bold text-slate-900">
                        <td colSpan={3} className="p-2.5 text-center uppercase tracking-wide">
                          TỔNG CỘNG ({employeeAnnualProcess.length} NLĐ)
                        </td>
                        {Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
                          const mSum = employeeAnnualProcess.reduce((s, r) => s + (r.monthlyAmounts[m] || 0), 0);
                          return (
                            <td key={m} className="p-1.5 font-mono text-right text-[11px]">
                              {mSum > 0 ? formatNumber(mSum) : '-'}
                            </td>
                          );
                        })}
                        <td className="p-2.5 font-mono text-right font-black text-emerald-950 bg-emerald-200">
                          {formatVND(employeeAnnualProcess.reduce((s, r) => s + r.annualTotal, 0))}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-500 flex items-center justify-between flex-wrap gap-2">
                <span>Nhấp vào dòng nhân viên để mở rộng xem chi tiết từng người phụ thuộc qua 12 tháng.</span>
                <span>Rê chuột lên từng ô tháng để xem diễn giải người phụ thuộc được tính giảm trừ.</span>
              </div>
            </div>
          )}

          {/* Table View B: Chi Tiết Từng Người Phụ Thuộc */}
          {processViewMode === 'by_dependent' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-center border-collapse">
                  <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="p-2 border-r border-slate-200 w-9" rowSpan={2}>STT</th>
                      <th className="p-2 border-r border-slate-200 text-left min-w-[140px]" rowSpan={2}>Nhân Viên (NLĐ)</th>
                      <th className="p-2 border-r border-slate-200 text-left min-w-[150px]" rowSpan={2}>Người Phụ Thuộc</th>
                      <th className="p-1 border-b border-slate-200 text-center bg-emerald-50 text-emerald-950 font-bold" colSpan={12}>
                        Mức Giảm Trừ Từng Tháng Năm {processYear} (VNĐ)
                      </th>
                      <th className="p-2 border-l border-slate-200 w-16" rowSpan={2}>Số Tháng</th>
                      <th className="p-2 border-l border-slate-200 min-w-[110px] bg-emerald-100 text-emerald-950 font-black" rowSpan={2}>Tổng Năm</th>
                      <th className="p-2 border-l border-slate-200 w-20" rowSpan={2}>Quá Trình</th>
                    </tr>
                    <tr className="bg-slate-100 text-[10px] text-slate-600 font-semibold">
                      {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                        <th key={m} className="p-1.5 border-r border-slate-200 min-w-[68px]">
                          T{m}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredProcessDependents.length === 0 ? (
                      <tr>
                        <td colSpan={18} className="p-8 text-center text-slate-400">
                          Không có người phụ thuộc nào phù hợp bộ lọc.
                        </td>
                      </tr>
                    ) : (
                      filteredProcessDependents.map((row, idx) => {
                        const periods = getEffectivePeriodsList(row.dependent);
                        return (
                          <tr key={row.dependent.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="p-2 text-slate-400 font-mono border-r border-slate-100">{idx + 1}</td>
                            <td className="p-2 text-left border-r border-slate-100">
                              <div className="font-bold text-slate-900">{row.employee?.fullName || 'Không rõ'}</div>
                              <div className="font-mono text-[10px] text-emerald-700">{row.employee?.employeeCode}</div>
                            </td>
                            <td className="p-2 text-left border-r border-slate-100">
                              <div className="font-bold text-slate-900">{row.dependent.fullName}</div>
                              <div className="text-[10px] text-slate-500 flex items-center gap-1 flex-wrap mt-0.5">
                                <span className="px-1.5 py-0.2 bg-blue-50 text-blue-700 rounded font-semibold">
                                  {row.dependent.relationship}
                                </span>
                                {row.ageNum !== null && (
                                  <span className={row.ageNum >= 18 ? 'text-amber-700 font-bold' : ''}>
                                    • {row.ageNum}T
                                  </span>
                                )}
                                <span className="text-slate-400">
                                  • {periods.length > 0 ? `${periods.length} GĐ` : '1 GĐ'}
                                </span>
                              </div>
                            </td>

                            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
                              const eff = row.months[m];
                              return (
                                <td
                                  key={m}
                                  title={eff?.reason}
                                  className="p-1.5 border-r border-slate-100 text-right font-mono text-[11px]"
                                >
                                  {eff?.isEligible ? (
                                    <span className="font-semibold text-emerald-700">{formatNumber(eff.amount)}</span>
                                  ) : eff?.status === 'paused' ? (
                                    <span className="text-[9px] font-bold text-amber-800 bg-amber-100 px-1 py-0.5 rounded">Ngừng</span>
                                  ) : eff?.status === 'ended' ? (
                                    <span className="text-[9px] font-bold text-rose-700 bg-rose-50 px-1 py-0.5 rounded">Hết</span>
                                  ) : (
                                    <span className="text-slate-300">-</span>
                                  )}
                                </td>
                              );
                            })}

                            <td className="p-2 font-mono font-bold text-slate-800 border-r border-slate-100">
                              {row.activeMonthsCount}
                            </td>
                            <td className="p-2 font-mono text-right font-black text-emerald-800 bg-emerald-50/40 border-r border-slate-100">
                              {formatVND(row.annualTotal)}
                            </td>
                            <td className="p-2 text-center">
                              <button
                                type="button"
                                onClick={() => handleOpenHistoryModal(row.dependent)}
                                className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-[11px] font-bold cursor-pointer transition-colors"
                                title="Mở & điều chỉnh quá trình tính giảm trừ"
                              >
                                <History className="w-3.5 h-3.5" />
                                <span>Chi tiết</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}

                    {filteredProcessDependents.length > 0 && (
                      <tr className="bg-slate-200 font-bold text-slate-900">
                        <td colSpan={3} className="p-2.5 text-center uppercase tracking-wide">
                          TỔNG CỘNG ({filteredProcessDependents.length} NPT)
                        </td>
                        {Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
                          const mSum = filteredProcessDependents.reduce(
                            (s, r) => s + (r.months[m]?.isEligible ? r.months[m].amount : 0),
                            0
                          );
                          return (
                            <td key={m} className="p-1.5 font-mono text-right text-[11px]">
                              {mSum > 0 ? formatNumber(mSum) : '-'}
                            </td>
                          );
                        })}
                        <td className="p-2 font-mono text-center font-black">
                          {processKpis.totalDepMonths}
                        </td>
                        <td className="p-2.5 font-mono text-right font-black text-emerald-950 bg-emerald-200">
                          {formatVND(processKpis.totalAnnualDeduction)}
                        </td>
                        <td className="p-2"></td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================== MODAL QUÁ TRÌNH TÍNH GIẢM TRỪ NPT (TỪNG NGƯỜI) ==================== */}
      {historyDep && (() => {
        const linkedEmp = empMap.get(historyDep.employeeId);
        const periods = getEffectivePeriodsList(historyDep);
        const effCurrent = getEffectiveDependentDeductionForMonth(
          historyDep,
          currentWorkingMonth,
          currentWorkingYear,
          settings
        );
        const depAge = getNumericAge(historyDep.birthDate);

        // Tính tổng số tháng & tổng giá trị lũy kế của toàn bộ quá trình
        let totalProcessMonths = 0;
        let totalProcessValue = 0;
        periods.forEach(p => {
          const st = p.status || ((Number(p.deductionAmount) || 0) > 0 ? 'active' : 'paused');
          const mCount = countMonthsInPeriod(p.fromMonth, p.toMonth, currentWorkingMonthKey);
          if (st === 'active' && (Number(p.deductionAmount) || 0) > 0) {
            totalProcessMonths += mCount;
            totalProcessValue += mCount * (Number(p.deductionAmount) || 0);
          }
        });

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
            <div className="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150 max-h-[92vh] overflow-y-auto">
              {/* Modal Header */}
              <div className="flex items-start justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-emerald-100 rounded-xl text-emerald-700">
                    <History className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2 flex-wrap">
                      <span>Quá Trình Tính Giảm Trừ Người Phụ Thuộc</span>
                      <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-800 border border-blue-200 rounded font-bold">
                        {historyDep.fullName}
                      </span>
                      <span className="text-[11px] px-2 py-0.5 bg-slate-100 text-slate-700 rounded font-semibold">
                        {historyDep.relationship}
                      </span>
                      {depAge !== null && depAge >= 18 && (
                        <span className="text-[10px] px-2 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 rounded font-bold">
                          {depAge} tuổi (≥ 18T)
                        </span>
                      )}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      NLĐ liên quan: <strong className="text-slate-800">{linkedEmp?.fullName || 'Không rõ'}</strong> ({linkedEmp?.employeeCode || '—'}) • CCCD/MST NPT:{' '}
                      <span className="font-mono font-semibold text-slate-700">{historyDep.taxCodeOrId || 'Chưa cập nhật'}</span>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setHistoryDepId(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {historyFeedback && (
                <div
                  className={`mt-4 p-3 rounded-xl text-xs font-semibold flex items-center gap-2 border animate-in fade-in ${
                    historyFeedback.type === 'success'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-rose-50 border-rose-200 text-rose-800'
                  }`}
                >
                  {historyFeedback.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  )}
                  <span>{historyFeedback.text}</span>
                </div>
              )}

              <div className="mt-5 space-y-6 text-xs">
                {/* Card 1: Tổng quan & hiệu lực hiện tại */}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                  <div>
                    <span className="text-slate-500 block text-[11px]">Thời Gian Đăng Ký Tổng Quát:</span>
                    <div className="font-mono font-bold text-slate-900 text-sm mt-0.5">
                      {historyDep.startDate || '—'} → {historyDep.endDate || 'Hiện tại'}
                    </div>
                    <span className="text-[11px] text-slate-500 block mt-0.5">
                      Ngày sinh: {historyDep.birthDate || '—'} ({calculateAge(historyDep.birthDate)})
                    </span>
                  </div>

                  <div className="bg-white p-3 rounded-lg border border-slate-200">
                    <span className="text-slate-500 block text-[11px]">
                      Hiệu Lực Kỳ Lương T{currentWorkingMonth}/{currentWorkingYear}:
                    </span>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <span className={`text-base font-black font-mono ${effCurrent.isEligible ? 'text-emerald-700' : 'text-slate-500'}`}>
                        {formatVND(effCurrent.amount)}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                          effCurrent.status === 'active'
                            ? 'bg-emerald-100 text-emerald-800'
                            : effCurrent.status === 'paused'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {effCurrent.status === 'active'
                          ? 'Đang giảm trừ'
                          : effCurrent.status === 'paused'
                            ? 'Tạm ngừng'
                            : effCurrent.status === 'not_started'
                              ? 'Chưa bắt đầu'
                              : 'Đã kết thúc'}
                      </span>
                    </div>
                  </div>

                  <div className="bg-white p-3 rounded-lg border border-slate-200">
                    <span className="text-slate-500 block text-[11px]">Tổng Quá Trình (đến T{currentWorkingMonth}/{currentWorkingYear}):</span>
                    <div className="text-base font-black font-mono text-indigo-700 mt-0.5">
                      {periods.length > 0 ? formatVND(totalProcessValue) : 'Chưa tách giai đoạn'}
                    </div>
                    <span className="text-[11px] text-slate-500 block">
                      {periods.length > 0 ? `${totalProcessMonths} tháng giảm trừ qua ${periods.length} giai đoạn` : 'Bấm bên dưới để khởi tạo quá trình'}
                    </span>
                  </div>
                </div>

                {/* Quick Migration / Init Actions if no history yet */}
                {periods.length === 0 && canEditEmployees && (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div>
                      <div className="font-bold text-amber-950">Hồ sơ này chưa tách các giai đoạn quá trình tính giảm trừ</div>
                      <div className="text-[11px] text-amber-800 mt-0.5">
                        Bạn có thể khởi tạo nhanh từ thông tin hiện có ({historyDep.startDate} → {historyDep.endDate || 'nay'}) hoặc tách tự động mốc 4.400.000 đ → {formatVND(defaultDeduction)}.
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleInitializeHistoryFromRecord(historyDep)}
                        className="px-3 py-1.5 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 font-bold rounded-lg text-xs cursor-pointer transition-colors"
                      >
                        Khởi Tạo 1 Giai Đoạn
                      </button>
                      <button
                        type="button"
                        onClick={() => handleQuickSplit2026(historyDep)}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs cursor-pointer transition-colors flex items-center gap-1"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Tách Mốc 4.4tr → {formatNumber(defaultDeduction)}</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Card 2: Bảng danh sách các giai đoạn giảm trừ */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-bold text-slate-800 flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-emerald-600" />
                      <span>Chi Tiết Các Giai Đoạn Tính Giảm Trừ ({periods.length} giai đoạn)</span>
                    </h4>
                    <span className="text-[11px] text-slate-400">
                      Mỗi giai đoạn xác định rõ mức giảm trừ và hiệu lực áp dụng khi tính thuế TNCN
                    </span>
                  </div>

                  {deletePeriodConfirm.isOpen && (
                    <div className="mb-3 p-3 bg-rose-50 border border-rose-300 rounded-xl flex items-center justify-between gap-3">
                      <span className="text-xs font-bold text-rose-900">
                        Xác nhận xóa giai đoạn "{deletePeriodConfirm.label}" khỏi quá trình giảm trừ?
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setDeletePeriodConfirm({ isOpen: false, periodId: null, label: '' })}
                          className="px-3 py-1 bg-white border border-slate-300 text-slate-700 rounded-lg font-semibold cursor-pointer"
                        >
                          Hủy
                        </button>
                        <button
                          type="button"
                          onClick={handleConfirmDeletePeriod}
                          className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold cursor-pointer"
                        >
                          Xóa Giai Đoạn
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                        <tr>
                          <th className="px-3 py-2.5">Thời Gian (Từ - Đến)</th>
                          <th className="px-3 py-2.5 text-center">Trạng Thái</th>
                          <th className="px-3 py-2.5 text-right">Mức Giảm Trừ / Tháng</th>
                          <th className="px-3 py-2.5 text-center">Số Tháng</th>
                          <th className="px-3 py-2.5 text-right">Thành Tiền Giai Đoạn</th>
                          <th className="px-3 py-2.5">Căn Cứ / Lý Do</th>
                          {canEditEmployees && <th className="px-3 py-2.5 text-right">Thao Tác</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {periods.length === 0 ? (
                          <tr>
                            <td colSpan={canEditEmployees ? 7 : 6} className="px-4 py-6 text-center text-slate-400">
                              Chưa có giai đoạn chi tiết nào. Hãy thêm giai đoạn đầu tiên hoặc dùng nút khởi tạo bên trên!
                            </td>
                          </tr>
                        ) : (
                          periods.map(item => {
                            const isOngoing = !item.toMonth;
                            const status = item.status || ((Number(item.deductionAmount) || 0) > 0 ? 'active' : 'paused');
                            const mCount = countMonthsInPeriod(item.fromMonth, item.toMonth, currentWorkingMonthKey);
                            const stageTotal = status === 'active' ? mCount * (Number(item.deductionAmount) || 0) : 0;

                            return (
                              <tr key={item.id} className={`hover:bg-slate-50 transition-colors ${isOngoing && status === 'active' ? 'bg-emerald-50/30' : ''}`}>
                                <td className="px-3 py-2.5 font-mono font-semibold text-slate-800 whitespace-nowrap">
                                  <span className="inline-flex items-center gap-1">
                                    <span>{item.fromMonth}</span>
                                    <ArrowRight className="w-3 h-3 text-slate-400" />
                                    <span className={isOngoing ? 'text-emerald-700 font-bold' : ''}>
                                      {isOngoing ? 'Đến nay' : item.toMonth}
                                    </span>
                                  </span>
                                </td>
                                <td className="px-3 py-2.5 text-center whitespace-nowrap">
                                  {status === 'active' && (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                      Đang giảm trừ
                                    </span>
                                  )}
                                  {status === 'paused' && (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 inline-flex items-center gap-1">
                                      <PauseCircle className="w-3 h-3" />
                                      Tạm ngừng
                                    </span>
                                  )}
                                  {status === 'ended' && (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                                      Đã kết thúc
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-900">
                                  {formatVND(status === 'active' ? item.deductionAmount : 0)}
                                </td>
                                <td className="px-3 py-2.5 text-center font-mono text-slate-700">
                                  {mCount > 0 ? `${mCount} th` : '—'}
                                </td>
                                <td className="px-3 py-2.5 text-right font-mono font-bold text-emerald-700">
                                  {formatVND(stageTotal)}
                                </td>
                                <td className="px-3 py-2.5 text-slate-600 max-w-[200px] truncate" title={item.note || ''}>
                                  {item.note || <span className="text-slate-300 italic">-</span>}
                                </td>
                                {canEditEmployees && (
                                  <td className="px-3 py-2.5 text-right">
                                    <div className="flex items-center justify-end gap-1">
                                      <button
                                        type="button"
                                        onClick={() => handleEditPeriodClick(item)}
                                        className="p-1 text-blue-600 hover:bg-blue-50 rounded cursor-pointer"
                                        title="Sửa giai đoạn này"
                                      >
                                        <Edit3 className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setDeletePeriodConfirm({
                                            isOpen: true,
                                            periodId: item.id,
                                            label: `${item.fromMonth} → ${item.toMonth || 'Đến nay'}`
                                          })
                                        }
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

                {/* Card 3: Form Thêm / Sửa Giai Đoạn */}
                {canEditEmployees && (
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <h4 className="font-bold text-slate-900 mb-3 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        {periodForm.editingId ? <Edit3 className="w-4 h-4 text-blue-600" /> : <Plus className="w-4 h-4 text-emerald-600" />}
                        <span>{periodForm.editingId ? 'Chỉnh Sửa Giai Đoạn Giảm Trừ' : 'Thêm Giai Đoạn Tính Giảm Trừ Mới'}</span>
                      </span>
                      {periodForm.editingId && (
                        <button
                          type="button"
                          onClick={() =>
                            setPeriodForm({
                              editingId: null,
                              fromMonth: currentWorkingMonthKey,
                              toMonth: '',
                              isOngoing: true,
                              status: 'active',
                              deductionAmount: defaultDeduction,
                              note: ''
                            })
                          }
                          className="text-xs text-slate-500 hover:text-slate-800 underline cursor-pointer"
                        >
                          Hủy chế độ sửa
                        </button>
                      )}
                    </h4>

                    <form onSubmit={handleSavePeriod} className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Từ Tháng (Bắt đầu) *
                          </label>
                          <input
                            type="month"
                            required
                            value={periodForm.fromMonth}
                            onChange={e => setPeriodForm({ ...periodForm, fromMonth: e.target.value })}
                            className="w-full px-3 py-1.5 border border-slate-300 rounded-lg bg-white font-mono text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Đến Tháng (Kết thúc)
                          </label>
                          <input
                            type="month"
                            disabled={periodForm.isOngoing}
                            value={periodForm.toMonth}
                            onChange={e => setPeriodForm({ ...periodForm, toMonth: e.target.value })}
                            className={`w-full px-3 py-1.5 border border-slate-300 rounded-lg font-mono text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none ${
                              periodForm.isOngoing ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-white'
                            }`}
                          />
                          <label className="flex items-center gap-1.5 text-[11px] text-slate-700 mt-1 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={periodForm.isOngoing}
                              onChange={e => setPeriodForm({ ...periodForm, isOngoing: e.target.checked })}
                              className="rounded text-emerald-600 cursor-pointer"
                            />
                            <span>Đang áp dụng đến nay</span>
                          </label>
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Trạng Thái Giai Đoạn *
                          </label>
                          <select
                            value={periodForm.status}
                            onChange={e => {
                              const nextSt = e.target.value as DependentDeductionStatus;
                              setPeriodForm(prev => ({
                                ...prev,
                                status: nextSt,
                                deductionAmount:
                                  nextSt === 'active'
                                    ? (prev.deductionAmount > 0 ? prev.deductionAmount : defaultDeduction)
                                    : 0
                              }));
                            }}
                            className="w-full px-3 py-1.5 border border-slate-300 rounded-lg bg-white text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                          >
                            <option value="active">Đang tính giảm trừ</option>
                            <option value="paused">Tạm ngừng / Chuyển NNT khác</option>
                            <option value="ended">Đã kết thúc giảm trừ</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Mức Giảm Trừ (VNĐ/Tháng) *
                          </label>
                          <input
                            type="number"
                            required
                            min={0}
                            step={100000}
                            disabled={periodForm.status !== 'active'}
                            value={periodForm.status === 'active' ? periodForm.deductionAmount : 0}
                            onChange={e => setPeriodForm({ ...periodForm, deductionAmount: Number(e.target.value) })}
                            className={`w-full px-3 py-1.5 border border-slate-300 rounded-lg font-mono font-bold text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none ${
                              periodForm.status !== 'active' ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-white text-emerald-700'
                            }`}
                          />
                          {periodForm.status === 'active' && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              <button
                                type="button"
                                onClick={() => setPeriodForm({ ...periodForm, deductionAmount: 6200000 })}
                                className="px-1.5 py-0.5 text-[10px] font-bold bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded cursor-pointer"
                              >
                                6.2tr
                              </button>
                              <button
                                type="button"
                                onClick={() => setPeriodForm({ ...periodForm, deductionAmount: 4400000 })}
                                className="px-1.5 py-0.5 text-[10px] font-bold bg-slate-200 hover:bg-slate-300 text-slate-800 rounded cursor-pointer"
                              >
                                4.4tr
                              </button>
                              {defaultDeduction !== 6200000 && defaultDeduction !== 4400000 && (
                                <button
                                  type="button"
                                  onClick={() => setPeriodForm({ ...periodForm, deductionAmount: defaultDeduction })}
                                  className="px-1.5 py-0.5 text-[10px] font-bold bg-blue-100 hover:bg-blue-200 text-blue-800 rounded cursor-pointer"
                                >
                                  Cài đặt ({formatNumber(defaultDeduction)})
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Căn Cứ Pháp Lý / Lý Do Điều Chỉnh
                        </label>
                        <input
                          type="text"
                          placeholder="Ví dụ: Điều chỉnh tăng mức giảm trừ từ 2026; Tạm chuyển NPT cho vợ/chồng giảm trừ; Kết thúc học đại học..."
                          value={periodForm.note}
                          onChange={e => setPeriodForm({ ...periodForm, note: e.target.value })}
                          className="w-full px-3 py-1.5 border border-slate-300 rounded-lg bg-white text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                        />
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-200 gap-3 flex-wrap">
                        <span className="text-[11px] text-slate-500 italic">
                          * Hệ thống sẽ tự động tra cứu đúng giai đoạn khi tính Bảng lương tháng & Quyết toán thuế TNCN cả năm.
                        </span>

                        <button
                          type="submit"
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                        >
                          <Save className="w-4 h-4" />
                          <span>{periodForm.editingId ? 'Cập Nhật Giai Đoạn' : 'Lưu Giai Đoạn Mới'}</span>
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {/* Card 4: Dòng thời gian trực quan */}
                {periods.length > 0 && (
                  <div className="p-4 bg-white border border-slate-200 rounded-xl">
                    <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-1.5">
                      <TrendingUp className="w-4 h-4 text-emerald-600" />
                      <span>Diễn Biến Quá Trình Tính Giảm Trừ Theo Dòng Thời Gian</span>
                    </h4>
                    <div className="flex items-center gap-2.5 overflow-x-auto pb-2">
                      {periods.map(p => {
                        const status = p.status || ((Number(p.deductionAmount) || 0) > 0 ? 'active' : 'paused');
                        const isOngoing = !p.toMonth;
                        return (
                          <div
                            key={p.id}
                            className={`shrink-0 p-3 rounded-xl border text-xs min-w-[185px] max-w-[230px] ${
                              status === 'paused'
                                ? 'bg-amber-50 border-amber-300 text-amber-950'
                                : status === 'ended'
                                  ? 'bg-rose-50 border-rose-200 text-rose-950'
                                  : isOngoing
                                    ? 'bg-emerald-50 border-emerald-300 text-emerald-950 shadow-xs'
                                    : 'bg-slate-50 border-slate-200 text-slate-700'
                            }`}
                          >
                            <div className="text-[10px] text-slate-500 font-mono">
                              {p.fromMonth} → {isOngoing ? 'Nay' : p.toMonth}
                            </div>
                            <div className="text-sm font-black font-mono text-slate-900 mt-1">
                              {formatVND(status === 'active' ? p.deductionAmount : 0)}
                            </div>
                            <div className="text-[10px] text-slate-600 truncate mt-0.5" title={p.note || ''}>
                              {p.note || (status === 'paused' ? 'Tạm ngừng giảm trừ' : status === 'ended' ? 'Đã kết thúc' : 'Đang tính giảm trừ')}
                            </div>
                            <span
                              className={`inline-block mt-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                status === 'paused'
                                  ? 'bg-amber-200/80 text-amber-950'
                                  : status === 'ended'
                                    ? 'bg-rose-200/80 text-rose-950'
                                    : isOngoing
                                      ? 'bg-emerald-200/80 text-emerald-900'
                                      : 'bg-slate-200 text-slate-700'
                              }`}
                            >
                              {status === 'paused'
                                ? 'Tạm ngừng'
                                : status === 'ended'
                                  ? 'Kết thúc'
                                  : isOngoing
                                    ? 'Hiện hành'
                                    : 'Giai đoạn trước'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end pt-4 mt-6 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setHistoryDepId(null)}
                  className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ==================== MODAL CẬP NHẬT GIAI ĐOẠN HÀNG LOẠT ==================== */}
      {isBulkRateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-4 border border-slate-200 text-xs">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-bold text-slate-900">
                  Cập Nhật Giai Đoạn Mức Giảm Trừ Hàng Loạt
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsBulkRateModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleApplyBulkRatePeriod} className="space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed bg-indigo-50/70 border border-indigo-200 rounded-xl p-3">
                Công cụ này tự động tạo giai đoạn mới từ tháng được chọn cho toàn bộ Người phụ thuộc còn hiệu lực, đồng thời đóng giai đoạn trước đó tại tháng liền trước để giữ nguyên số liệu quyết toán cũ.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Áp Dụng Từ Tháng *</label>
                  <input
                    type="month"
                    required
                    value={bulkFromMonth}
                    onChange={e => setBulkFromMonth(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Mức Giảm Trừ Mới (VNĐ) *</label>
                  <input
                    type="number"
                    required
                    min={0}
                    step={100000}
                    value={bulkNewAmount}
                    onChange={e => setBulkNewAmount(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono font-bold text-emerald-700"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Mức Giảm Trừ Giai Đoạn Trước (nếu hồ sơ chưa có lịch sử)
                </label>
                <input
                  type="number"
                  min={0}
                  step={100000}
                  value={bulkPriorAmount}
                  onChange={e => setBulkPriorAmount(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Căn Cứ / Ghi Chú Giai Đoạn Mới</label>
                <input
                  type="text"
                  value={bulkNote}
                  onChange={e => setBulkNote(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsBulkRateModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold cursor-pointer"
                >
                  Áp Dụng Cho Tất Cả NPT Hiệu Lực
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== MODAL THÊM / SỬA HỒ SƠ NPT ==================== */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-4 border border-slate-200 text-xs max-h-[92vh] overflow-y-auto">
            <h3 className="text-base font-bold text-slate-900 border-b border-slate-200 pb-3">
              {editingDep ? 'Chỉnh Sửa Người Phụ Thuộc' : 'Đăng Ký Người Phụ Thuộc Mới'}
            </h3>

            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Nhân Viên Liên Quan *
                </label>
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

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Họ và Tên Người Phụ Thuộc *</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Nguyễn Minh Khang"
                  value={formData.fullName}
                  onChange={e => setFormData({ ...formData, fullName: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">CCCD / MST / Mã NPT</label>
                  <input
                    type="text"
                    placeholder="Mã số hoặc CCCD"
                    value={formData.taxCodeOrId}
                    onChange={e => setFormData({ ...formData, taxCodeOrId: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Mối Quan Hệ</label>
                  <select
                    value={formData.relationship}
                    onChange={e => setFormData({ ...formData, relationship: e.target.value as RelationshipType })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  >
                    <option value="Con đẻ/Con nuôi">Con đẻ / Con nuôi</option>
                    <option value="Vợ/Chồng">Vợ / Chồng</option>
                    <option value="Cha mẹ ruột">Cha mẹ ruột</option>
                    <option value="Cha mẹ vợ/chồng">Cha mẹ vợ / chồng</option>
                    <option value="Người không nơi nương tựa">Người không nơi nương tựa</option>
                    <option value="Khác">Khác</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Ngày Sinh</label>
                  <input
                    type="date"
                    value={formData.birthDate}
                    onChange={e => setFormData({ ...formData, birthDate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Bắt Đầu (YYYY-MM)</label>
                  <input
                    type="month"
                    value={formData.startDate}
                    onChange={e => setFormData({ ...formData, startDate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Kết Thúc (Nếu có)</label>
                  <input
                    type="month"
                    value={formData.endDate}
                    onChange={e => setFormData({ ...formData, endDate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Mức Giảm Trừ (VNĐ/tháng) *
                  <span className="text-emerald-700 font-normal ml-2">
                    (Mặc định từ cài đặt hệ thống: {formatVND(defaultDeduction)}/tháng)
                  </span>
                </label>
                <input
                  type="number"
                  step={100000}
                  value={formData.deductionAmount}
                  onChange={e => setFormData({ ...formData, deductionAmount: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono font-bold text-emerald-700"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Ghi Chú</label>
                <input
                  type="text"
                  placeholder="Ghi chú hồ sơ chứng minh..."
                  value={formData.note}
                  onChange={e => setFormData({ ...formData, note: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              {editingDep && (
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-600 flex items-center justify-between gap-2">
                  <span>Cần theo dõi nhiều mức giảm trừ hoặc tạm ngừng theo từng thời kỳ?</span>
                  <button
                    type="button"
                    onClick={() => {
                      setIsModalOpen(false);
                      handleOpenHistoryModal(editingDep);
                    }}
                    className="font-bold text-emerald-700 hover:underline cursor-pointer shrink-0"
                  >
                    Mở Quá Trình Giảm Trừ →
                  </button>
                </div>
              )}

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
                  Lưu Thông Tin
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal In Danh Sách Người Phụ Thuộc */}
      {settings && (
        <PrintDependentsModal
          isOpen={isPrintModalOpen}
          onClose={() => setIsPrintModalOpen(false)}
          dependents={dependents}
          employees={employees}
          settings={settings}
        />
      )}
    </div>
  );
};
