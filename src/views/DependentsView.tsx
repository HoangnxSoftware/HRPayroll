import React, { useState, useRef, useMemo } from 'react';
import { Users, UserPlus, Trash2, Edit3, Download, Search, CheckCircle2, ShieldAlert, Upload, FileSpreadsheet, Printer, AlertTriangle, ArrowUpDown, ArrowUp, ArrowDown, Filter, AlertCircle } from 'lucide-react';
import { Dependent, Employee, RelationshipType, SystemSettings } from '../types';
import { formatVND } from '../utils/payrollCalculator';
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
  const [searchTerm, setSearchTerm] = useState('');
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDep, setEditingDep] = useState<Dependent | null>(null);
  const [importNotification, setImportNotification] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const defaultDeduction = settings?.dependentDeduction || 4400000;

  const [formData, setFormData] = useState<Partial<Dependent>>({
    employeeId: '',
    fullName: '',
    taxCodeOrId: '',
    relationship: 'Con đẻ/Con nuôi',
    birthDate: '2018-01-01',
    startDate: '2024-01',
    endDate: '',
    deductionAmount: defaultDeduction,
    note: ''
  });

  const [empSearchQuery, setEmpSearchQuery] = useState('');
  const [isEmpSearchOpen, setIsEmpSearchOpen] = useState(false);

  const empMap = useMemo(() => new Map(employees.map(e => [e.id, e])), [employees]);
  const depMap = useMemo(() => new Map((settings?.departments || []).map(d => [d.id, d.name])), [settings?.departments]);

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
    if (!birthDateStr) return '—';
    const b = new Date(birthDateStr);
    if (isNaN(b.getTime())) return '—';
    const today = new Date();
    let age = today.getFullYear() - b.getFullYear();
    const m = today.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < b.getDate())) {
      age--;
    }
    return age >= 0 ? `${age} tuổi` : '—';
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

  // Đếm tổng số người phụ thuộc bị trùng CCCD/MST
  const totalDuplicateDepRecords = useMemo(() => {
    return dependents.filter(d => {
      const cccd = (d.taxCodeOrId || '').trim();
      return cccd && duplicateDepCards.has(cccd);
    }).length;
  }, [dependents, duplicateDepCards]);

  // Đếm số người phụ thuộc trên 18 tuổi
  const totalOver18Dependents = useMemo(() => {
    return dependents.filter(d => {
      const age = getNumericAge(d.birthDate);
      return age !== null && age >= 18;
    }).length;
  }, [dependents]);

  // State lọc cảnh báo và sắp xếp
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

  const sortedDependents = useMemo(() => {
    if (sortField === 'none') return baseFilteredDependents;

    return [...baseFilteredDependents].sort((a, b) => {
      let cmp = 0;
      const empA = empMap.get(a.employeeId);
      const empB = empMap.get(b.employeeId);

      if (sortField === 'employee') {
        const nameA = empA?.fullName || '';
        const nameB = empB?.fullName || '';
        cmp = nameA.localeCompare(nameB, 'vi');
      } else if (sortField === 'employeeCccd') {
        const cccdA = empA?.idCardNumber || '';
        const cccdB = empB?.idCardNumber || '';
        cmp = cccdA.localeCompare(cccdB, 'vi', { numeric: true });
      } else if (sortField === 'fullName') {
        cmp = a.fullName.localeCompare(b.fullName, 'vi');
      } else if (sortField === 'taxCodeOrId') {
        cmp = (a.taxCodeOrId || '').localeCompare(b.taxCodeOrId || '', 'vi', { numeric: true });
      } else if (sortField === 'birthDate') {
        cmp = (a.birthDate || '').localeCompare(b.birthDate || '');
      } else if (sortField === 'deductionAmount') {
        cmp = (a.deductionAmount || 0) - (b.deductionAmount || 0);
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [baseFilteredDependents, sortField, sortDirection, empMap]);

  const filteredDependents = sortedDependents;

  const handleOpenAdd = () => {
    setEditingDep(null);
    setEmpSearchQuery('');
    setIsEmpSearchOpen(false);
    setFormData({
      id: `dep-${Date.now()}`,
      employeeId: '',
      fullName: '',
      taxCodeOrId: '',
      relationship: 'Con đẻ/Con nuôi',
      birthDate: '2018-01-01',
      startDate: '2024-01',
      endDate: '',
      deductionAmount: defaultDeduction,
      note: ''
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (dep: Dependent) => {
    setEditingDep(dep);
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
    if (!formData.employeeId) {
      alert('Vui lòng tìm kiếm và chọn Nhân viên liên quan!');
      return;
    }
    if (!formData.fullName) {
      alert('Vui lòng nhập Họ và tên người phụ thuộc!');
      return;
    }

    const item: Dependent = {
      id: formData.id || `dep-${Date.now()}`,
      employeeId: formData.employeeId,
      fullName: formData.fullName || '',
      taxCodeOrId: formData.taxCodeOrId || '',
      relationship: formData.relationship as RelationshipType || 'Con đẻ/Con nuôi',
      birthDate: formData.birthDate || '2018-01-01',
      startDate: formData.startDate || '2024-01',
      endDate: formData.endDate || '',
      deductionAmount: Number(formData.deductionAmount) || defaultDeduction,
      note: formData.note || ''
    };

    if (editingDep) {
      onUpdateDependent(item);
    } else {
      onAddDependent(item);
    }
    setIsModalOpen(false);
  };

  const handleExportExcel = () => {
    const rows = dependents.map((d, idx) => {
      const emp = empMap.get(d.employeeId);
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
        'Mức Giảm Trừ (VNĐ/tháng)': d.deductionAmount,
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
        alert('File không có dữ liệu người phụ thuộc hoặc không đúng định dạng!');
        return;
      }
      if (onBatchAddDependents) {
        onBatchAddDependents(imported);
      } else {
        imported.forEach(item => onAddDependent(item));
      }
      setImportNotification(`Đã nhập thành công ${imported.length} người phụ thuộc từ file Excel!`);
      setTimeout(() => setImportNotification(null), 4000);
    } catch (err: any) {
      alert(`Lỗi khi đọc file Excel người phụ thuộc: ${err.message}`);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight">Danh Sách Người Phụ Thuộc Của NLĐ</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Quản lý đăng ký giảm trừ gia cảnh thuế TNCN (Mức chuẩn: 4.400.000 VNĐ / người / tháng)
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

      {importNotification && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>{importNotification}</span>
        </div>
      )}

      {/* Search, Sort & Warning Filters */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs text-xs space-y-3">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Search Input */}
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

          {/* Sắp xếp & Nút cảnh báo */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Sắp xếp */}
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
                  onClick={() => setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')}
                  className="p-1 text-slate-600 hover:text-emerald-700 hover:bg-slate-200 rounded transition-colors"
                  title={sortDirection === 'asc' ? 'Đang tăng dần (A → Z). Nhấn để giảm dần' : 'Đang giảm dần (Z → A). Nhấn để tăng dần'}
                >
                  {sortDirection === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-emerald-600" /> : <ArrowDown className="w-3.5 h-3.5 text-emerald-600" />}
                </button>
              )}
            </div>

            {/* Lọc cảnh báo trùng CCCD/MST người phụ thuộc */}
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

            {/* Lọc cảnh báo người phụ thuộc trên 18 tuổi */}
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
              className="text-emerald-700 hover:underline font-bold"
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
                  title="Nhấn để sắp xếp theo Số CCCD Người Lao Động"
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
                  title="Nhấn để sắp xếp theo Họ và Tên NPT"
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
                  title="Nhấn để sắp xếp theo CCCD / Mã Số NPT"
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
                  title="Nhấn để sắp xếp theo Ngày Sinh"
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
                <th className="px-4 py-3">Thời Gian Giảm Trừ</th>
                <th className="px-4 py-3 text-right">Mức Giảm Trừ</th>
                <th className="px-4 py-3">Ghi Chú</th>
                <th className="px-4 py-3 text-right">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredDependents.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-6 py-8 text-center text-slate-400">
                    Chưa có người phụ thuộc nào được đăng ký.
                  </td>
                </tr>
              ) : (
                filteredDependents.map(dep => {
                  const emp = empMap.get(dep.employeeId);
                  const isDuplicateEmpCccd = emp?.idCardNumber ? duplicateEmpIdCards.has(emp.idCardNumber.trim()) : false;
                  const isDuplicateDepCccd = dep.taxCodeOrId ? duplicateDepCards.has(dep.taxCodeOrId.trim()) : false;

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
                      <td className="px-4 py-3.5 font-mono text-slate-700">
                        <span>{dep.startDate}</span>
                        <span className="text-slate-400"> đến </span>
                        <span>{dep.endDate || 'Hiện tại'}</span>
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono font-bold text-emerald-700">
                        {formatVND(dep.deductionAmount)}
                      </td>
                      <td className="px-4 py-3.5 text-slate-500">
                        {dep.note || '-'}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        {canEditEmployees && (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleOpenEdit(dep)}
                              className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg cursor-pointer"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteDependent(dep.id);
                              }}
                              className="p-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg cursor-pointer"
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

      {/* Modal Add / Edit */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-4 border border-slate-200 text-xs">
            <h3 className="text-base font-bold text-slate-900 border-b border-slate-200 pb-3">
              {editingDep ? 'Chỉnh Sửa Người Phụ Thuộc' : 'Đăng Ký Người Phụ Thuộc Mới'}
            </h3>

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

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold"
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
