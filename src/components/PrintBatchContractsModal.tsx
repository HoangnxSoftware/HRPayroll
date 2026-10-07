import React, { useState, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  FileText, 
  Printer, 
  X, 
  Users, 
  Edit3, 
  RotateCcw, 
  CheckCircle2, 
  AlertTriangle, 
  Sliders, 
  Eye, 
  Calendar, 
  Building2, 
  Search,
  CheckSquare,
  Square,
  Sparkles,
  Info,
  Download
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Employee, Department, Position, SystemSettings, WorkHistoryItem, InsuranceRecord } from '../types';
import { 
  TEMPLATE_VARIABLES, 
  fillDocumentTemplate, 
  getSavedContractTemplate, 
  getSavedCommitmentTemplate, 
  saveContractTemplate, 
  saveCommitmentTemplate, 
  resetContractTemplate, 
  resetCommitmentTemplate,
  numberToWordsVietnamese
} from '../utils/documentTemplates';

export type DocumentType = 'contract' | 'commitment' | 'both';

export interface PeriodContractOverride {
  item: WorkHistoryItem;
  matchedInsSalary: number;
}

interface PrintBatchContractsModalProps {
  isOpen: boolean;
  onClose: () => void;
  employees: Employee[];
  departments: Department[];
  positions: Position[];
  settings: SystemSettings;
  onUpdateSettings?: (newSettings: SystemSettings) => void;
  initialSelectedEmployeeIds?: string[];
  initialDocType?: DocumentType;
  periodOverride?: PeriodContractOverride | null;
  insurances?: InsuranceRecord[];
}

export const PrintBatchContractsModal: React.FC<PrintBatchContractsModalProps> = ({
  isOpen,
  onClose,
  employees,
  departments,
  positions,
  settings,
  onUpdateSettings,
  initialSelectedEmployeeIds,
  initialDocType = 'contract',
  periodOverride = null,
  insurances = [],
}) => {
  if (!isOpen) return null;

  // Active view: 'print' (in hàng loạt) hoặc 'template' (chỉnh sửa mẫu)
  const [activeTab, setActiveTab] = useState<'print' | 'template'>('print');
  
  // Document Type to print
  const [docType, setDocType] = useState<DocumentType>(initialDocType);

  // Giai đoạn công tác được chọn cho nhân viên đơn lẻ (nếu có lịch sử quá trình làm việc)
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(() => {
    return periodOverride?.item?.id || null;
  });

  // Selected employee IDs for batch printing
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    if (initialSelectedEmployeeIds && initialSelectedEmployeeIds.length > 0) {
      return new Set(initialSelectedEmployeeIds);
    }
    // Mặc định chọn tất cả nhân viên đang có
    return new Set(employees.map(e => e.id));
  });

  // Search in selection list
  const [searchFilter, setSearchFilter] = useState('');

  // Document parameters
  const [signDate, setSignDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [contractType, setContractType] = useState<string>('Hợp đồng lao động xác định thời hạn (12 tháng)');
  const [representativeName, setRepresentativeName] = useState<string>(settings.directorName || 'Nguyễn Văn Thành');

  // Templates in memory
  const [contractTemplate, setContractTemplate] = useState<string>(() => getSavedContractTemplate(settings));
  const [commitmentTemplate, setCommitmentTemplate] = useState<string>(() => getSavedCommitmentTemplate(settings));

  // Template editor state
  const [editingDocType, setEditingDocType] = useState<'contract' | 'commitment'>('contract');
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [previewEmployeeIndex, setPreviewEmployeeIndex] = useState(0);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Duplicate CCCD detection
  const duplicateCccdMap = useMemo(() => {
    const counts = new Map<string, number>();
    employees.forEach(emp => {
      const cccd = (emp.idCardNumber || '').trim();
      if (cccd) counts.set(cccd, (counts.get(cccd) || 0) + 1);
    });
    return counts;
  }, [employees]);

  const depMap = useMemo(() => new Map(departments.map(d => [d.id, d.name])), [departments]);
  const posMap = useMemo(() => new Map(positions.map(p => [p.id, p.name])), [positions]);

  // Filtered employees in selection list
  const filteredList = useMemo(() => {
    return employees.filter(emp => {
      const query = searchFilter.toLowerCase().trim();
      if (!query) return true;
      return (
        emp.fullName.toLowerCase().includes(query) ||
        emp.employeeCode.toLowerCase().includes(query) ||
        (emp.idCardNumber && emp.idCardNumber.includes(query)) ||
        (depMap.get(emp.departmentId) || '').toLowerCase().includes(query)
      );
    });
  }, [employees, searchFilter, depMap]);

  // Selected employees list
  const selectedEmployees = useMemo(() => {
    return employees.filter(e => selectedIds.has(e.id));
  }, [employees, selectedIds]);

  // Đối chiếu giai đoạn làm việc & mức đóng BHXH
  const effectivePeriodOverride = useMemo<PeriodContractOverride | null>(() => {
    if (selectedEmployees.length !== 1) return null;
    const targetEmp = selectedEmployees[0];
    if (!targetEmp.workHistory || targetEmp.workHistory.length === 0) {
      return periodOverride || null;
    }

    if (selectedPeriodId) {
      const foundItem = targetEmp.workHistory.find(
        (wh, idx) => (wh.id || `wh-${idx}`) === selectedPeriodId
      );
      if (foundItem) {
        // Đối chiếu mức đóng BHXH từ Quá trình & Mức đóng BHXH
        const matchingIns = insurances?.find(i => i.employeeId === targetEmp.id);
        let matchedIns = matchingIns?.insuranceSalary || foundItem.baseSalary;
        if (matchingIns?.history && matchingIns.history.length > 0) {
          const periodMonth = foundItem.fromMonth.slice(0, 7);
          const foundHist = matchingIns.history.find(h => {
            if (h.fromMonth <= periodMonth) {
              if (!h.toMonth || h.toMonth >= periodMonth) return true;
            }
            return false;
          }) || matchingIns.history[matchingIns.history.length - 1];
          if (foundHist) {
            matchedIns = foundHist.salary;
          }
        }
        return {
          item: foundItem,
          matchedInsSalary: matchedIns
        };
      }
    }

    return periodOverride || null;
  }, [selectedEmployees, selectedPeriodId, periodOverride, insurances]);

  // Danh sách các trang văn bản chuẩn bị cho cả Preview trên màn hình và Dedicated Print Portal
  const printDocuments = useMemo(() => {
    const items: Array<{
      key: string;
      docType: 'contract' | 'commitment';
      employee: Employee;
      empIndex: number;
      title: string;
      html: string;
      isPeriod: boolean;
      periodInfo?: { fromMonth: string; toMonth?: string; matchedInsSalary: number };
    }> = [];

    const activeOverride = effectivePeriodOverride || periodOverride;
    const isSingle = selectedEmployees.length === 1;

    selectedEmployees.forEach((emp, empIdx) => {
      const isPeriod = Boolean(activeOverride && isSingle);
      const targetDepId = isPeriod ? activeOverride!.item.departmentId : emp.departmentId;
      const targetPosId = isPeriod ? activeOverride!.item.positionId : emp.positionId;
      const depName = depMap.get(targetDepId) || 'Bộ phận chuyên môn';
      const posName = posMap.get(targetPosId) || 'Nhân viên';
      const resolvedContractType = isPeriod 
        ? (activeOverride!.item.workStatus === 'probation' 
            ? 'Hợp đồng lao động thử việc (02 tháng)' 
            : 'Hợp đồng lao động xác định thời hạn')
        : contractType;

      const fillOptions = {
        contractType: resolvedContractType,
        signDate: isPeriod 
          ? (activeOverride!.item.fromMonth.length === 7 ? `${activeOverride!.item.fromMonth}-01` : activeOverride!.item.fromMonth) 
          : signDate,
        departmentName: depName,
        positionName: posName,
        representativeName,
        customBaseSalary: isPeriod ? activeOverride!.item.baseSalary : undefined,
        insuranceSalary: isPeriod ? activeOverride!.matchedInsSalary : undefined,
        customStartDate: isPeriod ? activeOverride!.item.fromMonth : undefined,
      };

      if (docType === 'contract' || docType === 'both') {
        items.push({
          key: `contract-${emp.id}-${empIdx}`,
          docType: 'contract',
          employee: emp,
          empIndex: empIdx,
          title: `HỢP ĐỒNG LAO ĐỘNG: ${emp.fullName} (${emp.employeeCode})`,
          html: fillDocumentTemplate(contractTemplate, emp, settings, fillOptions),
          isPeriod,
          periodInfo: isPeriod ? {
            fromMonth: activeOverride!.item.fromMonth,
            toMonth: activeOverride!.item.toMonth,
            matchedInsSalary: activeOverride!.matchedInsSalary
          } : undefined
        });
      }

      if (docType === 'commitment' || docType === 'both') {
        items.push({
          key: `commitment-${emp.id}-${empIdx}`,
          docType: 'commitment',
          employee: emp,
          empIndex: empIdx,
          title: `CAM KẾT THU NHẬP (MẪU 08/CK-TNCN): ${emp.fullName} (${emp.employeeCode})`,
          html: fillDocumentTemplate(commitmentTemplate, emp, settings, fillOptions),
          isPeriod: false
        });
      }
    });

    return items;
  }, [selectedEmployees, docType, effectivePeriodOverride, periodOverride, depMap, posMap, contractType, signDate, representativeName, contractTemplate, commitmentTemplate, settings]);

  // Toggle selection
  const toggleEmployee = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(employees.map(e => e.id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const selectFiltered = () => {
    setSelectedIds(new Set(filteredList.map(e => e.id)));
  };

  const selectOnlyProbation = () => {
    setSelectedIds(new Set(employees.filter(e => e.workStatus === 'probation').map(e => e.id)));
  };

  const selectOnlyActive = () => {
    setSelectedIds(new Set(employees.filter(e => e.workStatus === 'active').map(e => e.id)));
  };

  // Insert variable into template editor
  const handleInsertVariable = (variableKey: string) => {
    if (!textareaRef.current) return;
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentVal = editingDocType === 'contract' ? contractTemplate : commitmentTemplate;
    const newVal = currentVal.substring(0, start) + variableKey + currentVal.substring(end);
    
    if (editingDocType === 'contract') {
      setContractTemplate(newVal);
    } else {
      setCommitmentTemplate(newVal);
    }

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + variableKey.length, start + variableKey.length);
    }, 50);
  };

  // Save current template
  const handleSaveTemplate = () => {
    if (editingDocType === 'contract') {
      saveContractTemplate(contractTemplate);
    } else {
      saveCommitmentTemplate(commitmentTemplate);
    }

    // Save into systemSettings if callback is provided
    if (onUpdateSettings) {
      const updatedSettings: SystemSettings = {
        ...settings,
        documentTemplates: {
          ...settings.documentTemplates,
          contractTemplate,
          commitmentTemplate,
          defaultContractType: contractType,
          lastUpdated: new Date().toISOString()
        }
      };
      onUpdateSettings(updatedSettings);
    }

    setSaveNotice(`Đã lưu thành công ${editingDocType === 'contract' ? 'Mẫu Hợp đồng lao động' : 'Mẫu Bản cam kết thu nhập'}!`);
    setTimeout(() => setSaveNotice(null), 3500);
  };

  // Reset to default
  const handleResetTemplate = () => {
    const isContract = editingDocType === 'contract';
    const confirmMsg = `Bạn có chắc chắn muốn khôi phục lại mẫu ${isContract ? 'Hợp đồng lao động' : 'Bản cam kết thu nhập'} chuẩn mặc định? Mọi tùy chỉnh trước đó sẽ bị xóa.`;
    if (!window.confirm(confirmMsg)) return;

    if (isContract) {
      const reset = resetContractTemplate();
      setContractTemplate(reset);
    } else {
      const reset = resetCommitmentTemplate();
      setCommitmentTemplate(reset);
    }

    setSaveNotice('Đã khôi phục về mẫu chuẩn của hệ thống!');
    setTimeout(() => setSaveNotice(null), 3500);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportExcel = () => {
    const depMap = new Map(departments.map(d => [d.id, d.name]));
    const posMap = new Map(positions.map(p => [p.id, p.name]));

    const excelRows = [
      [settings.companyName.toUpperCase()],
      [`Địa chỉ: ${settings.address}`],
      [`Mã số thuế: ${settings.taxCode} | Điện thoại: ${settings.phoneNumber}`],
      [],
      [`DANH SÁCH & CHI TIẾT HỢP ĐỒNG LAO ĐỘNG VÀ BẢN CAM KẾT THU NHẬP`],
      [`Loại văn bản: ${docType === 'contract' ? 'Hợp đồng lao động' : docType === 'commitment' ? 'Bản cam kết thu nhập (Mẫu 08/CK-TNCN)' : 'Cả hai (HĐLĐ & Bản cam kết)'} • Số lượng: ${selectedEmployees.length} nhân sự`],
      [],
      [
        'STT',
        'Mã NV',
        'Họ và Tên',
        'Giới Tính',
        'Ngày Sinh',
        'Số CCCD',
        'Ngày Cấp',
        'Nơi Cấp',
        'Địa Chỉ Thường Trú',
        'Số Điện Thoại',
        'Email',
        'Phòng Ban',
        'Chức Vụ',
        'Loại Hợp Đồng',
        'Ngày Bắt Đầu Làm',
        'Mức Lương Cơ Bản (VNĐ)',
        'Lương Bằng Chữ',
        'Mức Lương Đóng BHXH (Đối Chiếu)',
        'Hình Thức Trả Lương',
        'Đại Diện Bên A Ký',
        'Ngày Ký Văn Bản'
      ],
      ...selectedEmployees.map((emp, idx) => {
        const isPeriod = effectivePeriodOverride && effectivePeriodOverride.item && selectedEmployees.length === 1;
        const targetDepId = isPeriod ? effectivePeriodOverride!.item.departmentId : emp.departmentId;
        const targetPosId = isPeriod ? effectivePeriodOverride!.item.positionId : emp.positionId;
        const depName = depMap.get(targetDepId) || 'Bộ phận chuyên môn';
        const posName = posMap.get(targetPosId) || 'Nhân viên';
        const baseSal = isPeriod ? effectivePeriodOverride!.item.baseSalary : emp.baseSalary;
        const insSal = isPeriod ? effectivePeriodOverride!.matchedInsSalary : (emp.baseSalary || 0);
        const resolvedContractType = isPeriod 
          ? (effectivePeriodOverride!.item.workStatus === 'probation' 
              ? 'Hợp đồng lao động thử việc (02 tháng)' 
              : 'Hợp đồng lao động xác định thời hạn')
          : contractType;

        return [
          idx + 1,
          emp.employeeCode,
          emp.fullName,
          emp.gender || 'Nam',
          emp.birthDate || '',
          emp.idCardNumber || '',
          emp.issueDate || '',
          emp.issuePlace || '',
          emp.address || '',
          emp.phoneNumber || '',
          emp.email || '',
          depName,
          posName,
          resolvedContractType,
          isPeriod ? effectivePeriodOverride!.item.fromMonth : emp.startDate,
          baseSal,
          numberToWordsVietnamese(baseSal),
          insSal,
          emp.salaryBasis === 'monthly' ? 'Lương tháng' : 'Theo ngày công',
          representativeName,
          isPeriod ? effectivePeriodOverride!.item.fromMonth : signDate
        ];
      }),
      [],
      [],
      ['NGƯỜI LẬP BIỂU', '', '', '', 'KẾ TOÁN TRƯỞNG', '', '', '', 'ĐẠI DIỆN NGƯỜI SỬ DỤNG LAO ĐỘNG'],
      ['(Ký, ghi rõ họ tên)', '', '', '', '(Ký, ghi rõ họ tên)', '', '', '', '(Ký, đóng dấu, ghi rõ họ tên)'],
      [],
      [],
      [
        settings.reportPreparerName || 'Phạm Hồng Phúc',
        '',
        '',
        '',
        settings.chiefAccountantName || 'Trần Thị Thu Hương',
        '',
        '',
        '',
        representativeName || settings.directorName || 'Nguyễn Văn Thành'
      ]
    ];

    const ws = XLSX.utils.aoa_to_sheet(excelRows);
    ws['!cols'] = [
      { wch: 6 },
      { wch: 12 },
      { wch: 24 },
      { wch: 10 },
      { wch: 12 },
      { wch: 16 },
      { wch: 12 },
      { wch: 25 },
      { wch: 30 },
      { wch: 14 },
      { wch: 22 },
      { wch: 22 },
      { wch: 18 },
      { wch: 30 },
      { wch: 14 },
      { wch: 18 },
      { wch: 30 },
      { wch: 18 },
      { wch: 18 },
      { wch: 22 },
      { wch: 14 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'HopDong_CamKet');
    XLSX.writeFile(wb, `Danh_Sach_Hop_Dong_Cam_Ket_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const sampleEmployee = employees[previewEmployeeIndex] || employees[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto print:p-0 print:m-0 print:bg-white print:static print:overflow-visible print:block print:h-auto print:max-h-none print:w-full print:inset-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-[98vw] xl:max-w-7xl h-[95vh] flex flex-col overflow-hidden print:border-none print:shadow-none print:rounded-none print:p-0 print:m-0 print:static print:overflow-visible print:block print:h-auto print:max-h-none print:w-full">
        
        {/* Top Control Bar (Hidden on Print) */}
        <div className="px-5 py-3.5 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3 shrink-0 print:hidden">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-600/30 text-emerald-400 rounded-xl border border-emerald-500/30">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-base text-white">In Hàng Loạt Hợp Đồng Lao Động & Cam Kết Thu Nhập</h3>
                <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold rounded-full">
                  Mẫu Chuẩn & Tùy Biến
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Cho phép chọn nhiều nhân viên, tự động điền thông tin định danh, số CCCD, mức lương và in hàng loạt chuẩn khổ A4
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* View Mode Tabs */}
            <div className="flex items-center bg-slate-800 p-1 rounded-xl border border-slate-700 text-xs">
              <button
                onClick={() => setActiveTab('print')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                  activeTab === 'print'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Printer className="w-4 h-4" />
                <span>Xem & In Hàng Loạt ({selectedEmployees.length})</span>
              </button>

              <button
                onClick={() => setActiveTab('template')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                  activeTab === 'template'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Edit3 className="w-4 h-4" />
                <span>Chỉnh Sửa Mẫu Văn Bản</span>
              </button>
            </div>

            {activeTab === 'print' && (
              <>
                <button
                  onClick={handleExportExcel}
                  disabled={selectedEmployees.length === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
                  title="Kết xuất danh sách và chi tiết hợp đồng lao động / bản cam kết thu nhập ra Excel"
                >
                  <Download className="w-4 h-4" />
                  <span>Kết Xuất Excel</span>
                </button>
                <button
                  onClick={handlePrint}
                  disabled={selectedEmployees.length === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
                  title="In ngay tất cả tài liệu đã chọn ra máy in hoặc lưu PDF"
                >
                  <Printer className="w-4 h-4" />
                  <span>In Ngay / Lưu PDF ({selectedEmployees.length * (docType === 'both' ? 2 : 1)} bản)</span>
                </button>
              </>
            )}

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              title="Đóng modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* TAB 1: IN HÀNG LOẠT (SELECTION & PRINT PREVIEW) */}
        {activeTab === 'print' && (
          <div className="flex-1 flex flex-col lg:flex-row overflow-hidden print:overflow-visible print:block print:h-auto print:max-h-none print:p-0 print:m-0">
            {/* Left Sidebar: Controls & Employee Batch Selector (Hidden on print) */}
            <div className="w-full lg:w-96 bg-slate-50 border-r border-slate-200 flex flex-col shrink-0 overflow-y-auto print:hidden p-4 space-y-4">
              
              {/* Document Type Selector */}
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-2">
                <label className="text-xs font-bold text-slate-800 uppercase tracking-wider block">
                  1. Loại Văn Bản Cần In
                </label>
                <div className="grid grid-cols-1 gap-2">
                  <label className={`flex items-start gap-2.5 p-2 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
                    docType === 'contract' ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-bold' : 'bg-slate-50/50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}>
                    <input
                      type="radio"
                      name="batch_doc_type"
                      checked={docType === 'contract'}
                      onChange={() => setDocType('contract')}
                      className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                    />
                    <div>
                      <div className="font-bold">Hợp đồng lao động</div>
                      <div className="text-[11px] text-slate-500 font-normal">HĐLĐ theo Bộ luật Lao động 2019</div>
                    </div>
                  </label>

                  <label className={`flex items-start gap-2.5 p-2 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
                    docType === 'commitment' ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-bold' : 'bg-slate-50/50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}>
                    <input
                      type="radio"
                      name="batch_doc_type"
                      checked={docType === 'commitment'}
                      onChange={() => setDocType('commitment')}
                      className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                    />
                    <div>
                      <div className="font-bold">Bản cam kết thu nhập</div>
                      <div className="text-[11px] text-slate-500 font-normal">Mẫu số 08/CK-TNCN theo TT 111/2013</div>
                    </div>
                  </label>

                  <label className={`flex items-start gap-2.5 p-2 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
                    docType === 'both' ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-bold' : 'bg-slate-50/50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}>
                    <input
                      type="radio"
                      name="batch_doc_type"
                      checked={docType === 'both'}
                      onChange={() => setDocType('both')}
                      className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                    />
                    <div>
                      <div className="font-bold">Cả hai (Bộ hồ sơ đầy đủ)</div>
                      <div className="text-[11px] text-slate-500 font-normal">In cả HĐLĐ và Bản Cam kết thu nhập</div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Document Parameters */}
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-3 text-xs">
                <label className="text-xs font-bold text-slate-800 uppercase tracking-wider block">
                  2. Thông Tin Chung Áp Dụng
                </label>

                <div>
                  <label className="text-slate-600 font-medium block mb-1">Ngày ký kết văn bản:</label>
                  <div className="relative">
                    <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                    <input
                      type="date"
                      value={signDate}
                      onChange={e => setSignDate(e.target.value)}
                      className="w-full pl-8 pr-2.5 py-1.5 border border-slate-300 rounded-lg font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>

                {docType !== 'commitment' && (
                  <div>
                    <label className="text-slate-600 font-medium block mb-1">Loại hợp đồng áp dụng:</label>
                    <select
                      value={contractType}
                      onChange={e => setContractType(e.target.value)}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    >
                      <option value="Hợp đồng lao động xác định thời hạn (12 tháng)">Xác định thời hạn (12 tháng)</option>
                      <option value="Hợp đồng lao động xác định thời hạn (24 tháng)">Xác định thời hạn (24 tháng)</option>
                      <option value="Hợp đồng lao động xác định thời hạn (36 tháng)">Xác định thời hạn (36 tháng)</option>
                      <option value="Hợp đồng lao động không xác định thời hạn">Không xác định thời hạn</option>
                      <option value="Hợp đồng lao động thử việc (02 tháng)">Thử việc (02 tháng)</option>
                      <option value="Hợp đồng lao động thời vụ / theo mùa">Thời vụ / Theo mùa</option>
                    </select>
                  </div>
                )}

                <div>
                  <label className="text-slate-600 font-medium block mb-1">Đại diện Người sử dụng LĐ ký:</label>
                  <input
                    type="text"
                    value={representativeName}
                    onChange={e => setRepresentativeName(e.target.value)}
                    placeholder="Tên Giám đốc / Đại diện"
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none font-medium"
                  />
                </div>

                {/* Chọn in theo từng giai đoạn trong Quá Trình Làm Việc */}
                {selectedEmployees.length === 1 && selectedEmployees[0].workHistory && selectedEmployees[0].workHistory.length > 0 && (
                  <div className="p-2.5 bg-emerald-50/70 rounded-xl border border-emerald-300 space-y-1.5 animate-in fade-in">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold text-emerald-950 uppercase tracking-wide">
                        In Theo Giai Đoạn Công Tác:
                      </label>
                      <span className="text-[10px] text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded font-semibold">
                        {selectedEmployees[0].workHistory.length} giai đoạn
                      </span>
                    </div>
                    <select
                      value={selectedPeriodId || 'current'}
                      onChange={e => setSelectedPeriodId(e.target.value === 'current' ? null : e.target.value)}
                      className="w-full px-2.5 py-1.5 border border-emerald-400 rounded-lg text-xs bg-white text-emerald-950 font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    >
                      <option value="current">Giai đoạn hiện tại (Hồ sơ chính thức)</option>
                      {selectedEmployees[0].workHistory.map((wh, idx) => {
                        const pos = posMap.get(wh.positionId) || 'Nhân viên';
                        return (
                          <option key={wh.id || `wh-${idx}`} value={wh.id || `wh-${idx}`}>
                            {wh.fromMonth} → {wh.toMonth || 'Đến nay'} ({pos} - {new Intl.NumberFormat('vi-VN').format(wh.baseSalary)} đ)
                          </option>
                        );
                      })}
                    </select>
                    {effectivePeriodOverride && (
                      <p className="text-[11px] text-emerald-800 leading-snug">
                        ✓ Đối chiếu mức đóng BHXH: <strong className="font-mono font-bold text-emerald-950">{new Intl.NumberFormat('vi-VN').format(effectivePeriodOverride.matchedInsSalary)} đ</strong>
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Batch Employee Selection List */}
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-2.5 flex-1 flex flex-col text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 uppercase tracking-wider">
                    3. Danh Sách NLĐ ({selectedEmployees.length}/{employees.length})
                  </span>
                  <div className="flex items-center gap-1 text-[11px]">
                    <button
                      onClick={selectAll}
                      className="text-emerald-700 hover:underline font-bold cursor-pointer"
                    >
                      Tất cả
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      onClick={deselectAll}
                      className="text-slate-500 hover:underline cursor-pointer"
                    >
                      Bỏ chọn
                    </button>
                  </div>
                </div>

                {/* Quick Filters */}
                <div className="flex flex-wrap gap-1 text-[10px]">
                  <button
                    onClick={selectOnlyActive}
                    className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded cursor-pointer"
                  >
                    Chính thức
                  </button>
                  <button
                    onClick={selectOnlyProbation}
                    className="px-2 py-0.5 bg-amber-50 hover:bg-amber-100 text-amber-800 font-medium rounded border border-amber-200 cursor-pointer"
                  >
                    Thử việc
                  </button>
                  {searchFilter && (
                    <button
                      onClick={selectFiltered}
                      className="px-2 py-0.5 bg-blue-50 text-blue-700 font-bold rounded border border-blue-200 cursor-pointer"
                    >
                      Chọn kết quả lọc ({filteredList.length})
                    </button>
                  )}
                </div>

                {/* Search */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                  <input
                    type="text"
                    placeholder="Tìm tên, mã NV, số CCCD..."
                    value={searchFilter}
                    onChange={e => setSearchFilter(e.target.value)}
                    className="w-full pl-7 pr-2.5 py-1.5 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                {/* Employees List */}
                <div className="border border-slate-200 rounded-lg overflow-y-auto max-h-56 divide-y divide-slate-100">
                  {filteredList.length === 0 ? (
                    <div className="p-4 text-center text-slate-400 text-xs">
                      Không tìm thấy nhân viên phù hợp
                    </div>
                  ) : (
                    filteredList.map(emp => {
                      const isSelected = selectedIds.has(emp.id);
                      const isDupeCccd = (duplicateCccdMap.get((emp.idCardNumber || '').trim()) || 0) > 1;

                      return (
                        <div
                          key={emp.id}
                          onClick={() => toggleEmployee(emp.id)}
                          className={`p-2 flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                            isSelected ? 'bg-emerald-50/70 hover:bg-emerald-100/60' : 'hover:bg-slate-50'
                          } ${isDupeCccd ? 'border-l-4 border-l-red-500' : ''}`}
                        >
                          <div className="flex items-center gap-2 overflow-hidden">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}} // Controlled by div onClick
                              className="rounded text-emerald-600 focus:ring-emerald-500 shrink-0"
                            />
                            <div className="truncate">
                              <div className="font-bold text-slate-900 truncate flex items-center gap-1.5">
                                <span>{emp.fullName}</span>
                                <span className="font-mono text-[10px] text-slate-500 font-normal">
                                  ({emp.employeeCode})
                                </span>
                              </div>
                              <div className="text-[10px] text-slate-500 truncate flex items-center gap-1.5">
                                <span>{depMap.get(emp.departmentId) || 'Phòng ban'}</span>
                                {isDupeCccd && (
                                  <span className="text-red-600 font-bold bg-red-100 px-1 rounded flex items-center gap-0.5">
                                    <AlertTriangle className="w-2.5 h-2.5" />
                                    CCCD trùng
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          
                          <div className="text-right shrink-0">
                            <span className="text-[10px] font-mono text-slate-600 block">
                              {new Intl.NumberFormat('vi-VN').format(emp.baseSalary || 0)} đ
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Right Area: Document Live Preview & Print Paper */}
            <div className="flex-1 bg-slate-200/90 overflow-y-auto p-4 sm:p-6 print:p-0 print:m-0 print:bg-white print:overflow-visible print:block print:h-auto print:max-h-none flex flex-col items-center">
              
              {selectedEmployees.length === 0 ? (
                <div className="my-auto text-center p-8 bg-white rounded-2xl border border-slate-300 shadow-md max-w-md">
                  <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <h4 className="font-bold text-base text-slate-800">Chưa chọn người lao động nào</h4>
                  <p className="text-xs text-slate-500 mt-1">
                    Vui lòng tích chọn ít nhất 01 người lao động từ danh sách bên trái để xem trước và in hàng loạt hợp đồng / cam kết thu nhập.
                  </p>
                  <button
                    onClick={selectAll}
                    className="mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer transition-colors"
                  >
                    Chọn Tất Cả Nhân Viên
                  </button>
                </div>
              ) : (
                <div id="contracts-batch-preview-area" className="w-full max-w-[210mm] space-y-8" style={{ fontFamily: "Calibri, 'Segoe UI', Candara, 'Liberation Sans', Arial, sans-serif" }}>
                  
                  {/* Notice banner on preview mode */}
                  <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs flex items-center justify-between shadow-2xs">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>
                        Đang hiển thị bản xem trước cho <strong>{selectedEmployees.length}</strong> nhân sự ({printDocuments.length} văn bản • Khổ A4 chuẩn • Font Calibri). Nhấp <strong>In Ngay / Lưu PDF</strong> để xuất tài liệu.
                      </span>
                    </div>
                    <button
                      onClick={handlePrint}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-2xs cursor-pointer text-xs flex items-center gap-1.5 shrink-0"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>In Ngay</span>
                    </button>
                  </div>

                  {/* Render each employee's document page(s) for live preview */}
                  {printDocuments.map((doc) => (
                    <div 
                      key={doc.key}
                      className="bg-white shadow-xl rounded-xl sm:rounded-2xl p-8 sm:p-12 border border-slate-300" 
                      style={{ fontFamily: "Calibri, 'Segoe UI', Candara, 'Liberation Sans', Arial, sans-serif" }}
                    >
                      <div className="flex items-center justify-between border-b pb-2 mb-4 text-xs text-slate-400">
                        <span className="font-mono font-bold text-slate-600">
                          #{doc.empIndex + 1} - {doc.title}
                          {doc.isPeriod && doc.periodInfo && (
                            <span className="ml-2 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-sans">
                              Giai đoạn: {doc.periodInfo.fromMonth} → {doc.periodInfo.toMonth || 'Đến nay'} • Mức đóng BHXH đối chiếu: {new Intl.NumberFormat('vi-VN').format(doc.periodInfo.matchedInsSalary)} đ
                            </span>
                          )}
                        </span>
                        <span className="bg-slate-100 px-2 py-0.5 rounded text-[11px] font-medium text-slate-700">
                          Khổ A4 Dọc • Font Calibri
                        </span>
                      </div>

                      <div 
                        style={{ fontFamily: "Calibri, 'Segoe UI', Candara, 'Liberation Sans', Arial, sans-serif" }}
                        dangerouslySetInnerHTML={{ 
                          __html: doc.html 
                        }} 
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: CHỈNH SỬA MẪU VĂN BẢN (TEMPLATE EDITOR) */}
        {activeTab === 'template' && (
          <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
            {/* Left Area: Template Code / Textarea Editor */}
            <div className="flex-1 flex flex-col border-r border-slate-200 overflow-hidden bg-slate-50">
              
              {/* Header Editor Controls */}
              <div className="p-4 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-2">
                  <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
                    <button
                      onClick={() => setEditingDocType('contract')}
                      className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                        editingDocType === 'contract'
                          ? 'bg-emerald-600 text-white shadow-2xs'
                          : 'text-slate-700 hover:text-slate-900'
                      }`}
                    >
                      Mẫu Hợp Đồng Lao Động
                    </button>
                    <button
                      onClick={() => setEditingDocType('commitment')}
                      className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                        editingDocType === 'commitment'
                          ? 'bg-emerald-600 text-white shadow-2xs'
                          : 'text-slate-700 hover:text-slate-900'
                      }`}
                    >
                      Mẫu Cam Kết Thu Nhập (08/CK-TNCN)
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleResetTemplate}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-red-50 text-slate-700 hover:text-red-700 border border-slate-300 hover:border-red-300 font-semibold text-xs rounded-xl transition-colors cursor-pointer"
                    title="Khôi phục mẫu chuẩn ban đầu"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Khôi Phục Mẫu Chuẩn</span>
                  </button>

                  <button
                    onClick={handleSaveTemplate}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Lưu Mẫu Này</span>
                  </button>
                </div>
              </div>

              {saveNotice && (
                <div className="mx-4 mt-3 p-3 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-xl text-xs font-semibold flex items-center gap-2 animate-in fade-in">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>{saveNotice}</span>
                </div>
              )}

              {/* Dynamic Variables Chips Toolbar */}
              <div className="p-3 bg-white/70 border-b border-slate-200">
                <div className="text-[11px] font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                  <span>Nhấp vào biến bên dưới để chèn vào vị trí con trỏ trong mẫu:</span>
                  <span className="text-slate-400 font-normal">Hệ thống sẽ tự động thay bằng dữ liệu thực khi in</span>
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
                  {TEMPLATE_VARIABLES.map(v => (
                    <button
                      key={v.key}
                      onClick={() => handleInsertVariable(v.key)}
                      title={`${v.description} (Ví dụ: ${v.example})`}
                      className="px-2 py-1 bg-slate-100 hover:bg-emerald-50 text-slate-800 hover:text-emerald-800 border border-slate-200 hover:border-emerald-300 rounded-lg text-[11px] font-mono font-medium transition-colors cursor-pointer shadow-2xs"
                    >
                      <span className="text-emerald-600 font-bold">+</span> {v.key}
                    </button>
                  ))}
                </div>
              </div>

              {/* Textarea for Template Editing */}
              <div className="flex-1 p-4 flex flex-col overflow-hidden">
                <label className="text-xs font-bold text-slate-700 mb-1 block">
                  Nội dung mẫu văn bản ({editingDocType === 'contract' ? 'Hợp đồng lao động' : 'Bản cam kết thu nhập'} - hỗ trợ thẻ HTML cơ bản):
                </label>
                <textarea
                  ref={textareaRef}
                  value={editingDocType === 'contract' ? contractTemplate : commitmentTemplate}
                  onChange={e => {
                    if (editingDocType === 'contract') setContractTemplate(e.target.value);
                    else setCommitmentTemplate(e.target.value);
                  }}
                  placeholder="Nhập nội dung mẫu văn bản..."
                  className="flex-1 w-full p-4 font-mono text-xs text-slate-900 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none resize-none leading-relaxed shadow-inner"
                />
              </div>
            </div>

            {/* Right Area: Real-Time Preview with Selected Employee */}
            <div className="w-full lg:w-1/2 bg-slate-100 flex flex-col overflow-hidden border-t lg:border-t-0">
              <div className="p-3 bg-white border-b border-slate-200 flex items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-emerald-600" />
                  <span className="font-bold text-xs text-slate-800">Xem Trước Trực Tiếp Mẫu Với Nhân Viên:</span>
                </div>
                <select
                  value={previewEmployeeIndex}
                  onChange={e => setPreviewEmployeeIndex(Number(e.target.value))}
                  className="text-xs px-2.5 py-1 border border-slate-300 rounded-lg font-medium max-w-xs truncate focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {employees.map((emp, idx) => (
                    <option key={emp.id} value={idx}>
                      {emp.fullName} ({emp.employeeCode} - {emp.idCardNumber})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex justify-center">
                <div className="w-full max-w-[210mm] bg-white shadow-xl rounded-xl p-8 border border-slate-300" style={{ fontFamily: "Calibri, 'Segoe UI', Candara, 'Liberation Sans', Arial, sans-serif" }}>
                  {sampleEmployee ? (
                    <div 
                      style={{ fontFamily: "Calibri, 'Segoe UI', Candara, 'Liberation Sans', Arial, sans-serif" }}
                      dangerouslySetInnerHTML={{ 
                        __html: fillDocumentTemplate(
                          editingDocType === 'contract' ? contractTemplate : commitmentTemplate,
                          sampleEmployee,
                          settings,
                          {
                            contractType,
                            signDate,
                            departmentName: depMap.get(sampleEmployee.departmentId),
                            positionName: posMap.get(sampleEmployee.positionId),
                            representativeName
                          }
                        ) 
                      }} 
                    />
                  ) : (
                    <div className="p-6 text-center text-slate-400 text-xs">
                      Không có dữ liệu nhân viên để xem trước.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* DEDICATED PRINT PORTAL ATTACHED DIRECTLY TO DOCUMENT BODY */}
      {createPortal(
        <div id="contracts-batch-print-portal" className="hidden print:block">
          <style dangerouslySetInnerHTML={{ __html: `
            @media print {
              @page {
                size: A4 portrait;
                margin: 15mm 15mm 15mm 15mm;
              }

              /* Hide the entire application inside #root to avoid any interference from modal/overflow/fixed wrappers */
              #root {
                display: none !important;
              }

              html, body {
                visibility: visible !important;
                background: white !important;
                color: black !important;
                margin: 0 !important;
                padding: 0 !important;
                height: auto !important;
                min-height: auto !important;
                overflow: visible !important;
                font-family: Calibri, 'Segoe UI', Candara, 'Liberation Sans', Arial, sans-serif !important;
              }

              #contracts-batch-print-portal {
                display: block !important;
                position: static !important;
                width: 100% !important;
                margin: 0 !important;
                padding: 0 !important;
                background: white !important;
                font-family: Calibri, 'Segoe UI', Candara, 'Liberation Sans', Arial, sans-serif !important;
              }

              .contract-print-page {
                display: block !important;
                position: static !important;
                width: 100% !important;
                max-width: 100% !important;
                page-break-after: always !important;
                break-after: page !important;
                page-break-inside: auto !important;
                break-inside: auto !important;
                box-sizing: border-box !important;
                margin: 0 !important;
                padding: 0 !important;
                border: none !important;
                box-shadow: none !important;
                background: white !important;
                font-family: Calibri, 'Segoe UI', Candara, 'Liberation Sans', Arial, sans-serif !important;
              }

              .contract-print-page:last-child {
                page-break-after: auto !important;
                break-after: auto !important;
              }

              .contract-document, 
              .commitment-document,
              .contract-document *, 
              .commitment-document *,
              .contract-print-page,
              .contract-print-page * {
                font-family: Calibri, 'Segoe UI', Candara, 'Liberation Sans', Arial, sans-serif !important;
                color: black !important;
              }

              .contract-document, 
              .commitment-document {
                font-size: 13pt !important;
                line-height: 1.55 !important;
              }

              .break-inside-avoid,
              .contract-signature-block {
                page-break-inside: avoid !important;
                break-inside: avoid !important;
              }

              .print\\:hidden {
                display: none !important;
              }
            }
          `}} />

          {printDocuments.map((doc, idx) => (
            <div 
              key={`portal-${doc.key}`}
              className={`contract-print-page ${idx === printDocuments.length - 1 ? 'is-last-document' : ''}`}
              style={{ fontFamily: "Calibri, 'Segoe UI', Candara, 'Liberation Sans', Arial, sans-serif" }}
            >
              <div 
                style={{ fontFamily: "Calibri, 'Segoe UI', Candara, 'Liberation Sans', Arial, sans-serif" }}
                dangerouslySetInnerHTML={{ __html: doc.html }} 
              />
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
};
