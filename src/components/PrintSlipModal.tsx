import React, { useRef, useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  Printer, 
  X, 
  CheckCircle, 
  Search, 
  CheckSquare, 
  Square, 
  Users, 
  Filter, 
  AlertCircle,
  Building2,
  DollarSign,
  Download
} from 'lucide-react';
import { Employee, PayrollRecord, SystemSettings } from '../types';
import { formatVND } from '../utils/payrollCalculator';
import * as XLSX from 'xlsx';

interface SinglePayslipCardProps {
  emp: Employee;
  p: PayrollRecord;
  settings: SystemSettings;
  depMap: Map<string, string>;
  posMap: Map<string, string>;
  isPrint?: boolean;
}

const SinglePayslipCard: React.FC<SinglePayslipCardProps> = ({
  emp,
  p,
  settings,
  depMap,
  posMap,
  isPrint = false
}) => {
  return (
    <div className={`payslip-content w-full ${isPrint ? 'text-[10px]' : 'text-xs text-slate-800'}`}>
      {/* Header */}
      <div className="border-b-2 border-slate-900 pb-2 mb-2.5">
        <div className="flex justify-between items-start">
          <div>
            <div className="font-bold text-xs uppercase tracking-wider text-slate-600">{settings.companyName}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Địa chỉ: {settings.address}</div>
            <div className="text-[11px] text-slate-500">Mã số thuế: {settings.taxCode} | ĐT: {settings.phoneNumber}</div>
          </div>
          <div className="text-right">
            <div className="text-xs font-semibold px-2 py-0.5 bg-slate-100 rounded border border-slate-300 inline-block font-mono">
              MÃ NV: {emp.employeeCode}
            </div>
          </div>
        </div>

        <div className="text-center mt-2">
          <h2 className="text-lg font-extrabold text-slate-900 uppercase tracking-wide">
            PHIẾU THANH TOÁN LƯƠNG
          </h2>
          <p className="text-xs font-semibold text-emerald-700 italic mt-0.5">
            Tháng {settings.currentMonth} năm {settings.currentYear}
          </p>
        </div>
      </div>

      {/* Employee Info Grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 bg-slate-50 p-2.5 rounded-lg border border-slate-200 mb-2.5">
        <div>
          <span className="text-slate-500">Họ và tên:</span>{' '}
          <span className="font-bold text-slate-900 uppercase">{emp.fullName}</span>
        </div>
        <div>
          <span className="text-slate-500">Số CCCD:</span>{' '}
          <span className="font-mono font-medium">{emp.idCardNumber}</span>
        </div>
        <div>
          <span className="text-slate-500">Phòng ban:</span>{' '}
          <span className="font-semibold text-slate-800">{depMap.get(p.effectiveDepartmentId || emp.departmentId) || '-'}</span>
        </div>
        <div>
          <span className="text-slate-500">Chức vụ:</span>{' '}
          <span className="font-semibold text-slate-800">{posMap.get(p.effectivePositionId || emp.positionId) || '-'}</span>
        </div>
        <div>
          <span className="text-slate-500">Hình thức lương:</span>{' '}
          <span className="font-semibold text-slate-800">
            {(p.salaryBasis || emp.salaryBasis) === 'hourly' ? `Lương theo giờ (${formatVND(p.hourlyRateApplied || emp.hourlyRate || 0)}/h)` : (
              (p.salaryBasis || emp.salaryBasis) === 'daily' ? 'Theo ngày công' : (
                (p.salaryBasis || emp.salaryBasis) === 'percent' ? `Theo % KPI (${emp.salaryPercent || 100}%)` : 'Lương tháng cố định'
              )
            )}
          </span>
        </div>
        <div>
          <span className="text-slate-500">Ngày công chuẩn:</span>{' '}
          <span className="font-medium">{p.standardDays} ngày</span>
        </div>
        <div>
          <span className="text-slate-500">
            {emp.salaryBasis === 'hourly' ? 'Số giờ làm việc thực tế:' : 'Ngày công hưởng lương:'}
          </span>{' '}
          <span className="font-bold text-emerald-700">
            {emp.salaryBasis === 'hourly' 
              ? `${p.actualWorkHours ?? p.actualPaidDays * 8} giờ (${p.actualPaidDays} công)` 
              : `${p.actualPaidDays} ngày`}
          </span>
        </div>
        <div>
          <span className="text-slate-500">Số tài khoản:</span>{' '}
          <span className="font-mono font-semibold">{emp.bankAccount || 'Tiền mặt'}</span>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <span className="text-slate-500">Ngân hàng:</span>{' '}
          <span className="font-medium">{emp.bankName || '-'}</span>
        </div>
      </div>

      {/* Two-Column Salary breakdown */}
      <div className="grid grid-cols-2 gap-2.5 mb-2.5">
        {/* Left: CÁC KHOẢN THU NHẬP */}
        <div className="border border-slate-300 rounded-lg overflow-hidden flex flex-col justify-between">
          <div>
            <div className="bg-slate-800 text-white px-2.5 py-1.5 font-bold uppercase tracking-wider text-[10px] flex justify-between">
              <span>I. CÁC KHOẢN THU NHẬP</span>
              <span>SỐ TIỀN (VNĐ)</span>
            </div>
            <div className="p-2 space-y-1">
              <div className="flex justify-between border-b border-slate-100 pb-0.5">
                <span className="text-slate-600">
                  {emp.salaryBasis === 'hourly' ? '1. Đơn giá lương / giờ' : '1. Lương cơ bản / thỏa thuận'}
                </span>
                <span className="font-mono">
                  {emp.salaryBasis === 'hourly' ? `${formatVND(p.hourlyRateApplied || emp.hourlyRate || 0)}/h` : formatVND(p.baseSalary)}
                </span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-0.5">
                <span className="text-slate-600">
                  {emp.salaryBasis === 'hourly' ? '2. Lương chính theo giờ' : '2. Lương chính theo ngày công'}
                </span>
                <span className="font-mono font-medium">{formatVND(p.mainSalary)}</span>
              </div>

              <div className="flex justify-between border-b border-slate-100 pb-0.5">
                <span className="text-slate-600">3. Làm thêm giờ (chịu thuế)</span>
                <span className="font-mono">{formatVND(p.otPayTaxable)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-0.5">
                <span className="text-slate-600">4. Làm thêm giờ (miễn thuế)</span>
                <span className="font-mono">{formatVND(p.otPayTaxExempt)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-0.5">
                <span className="text-slate-600">5. Phụ cấp tính thuế TNCN</span>
                <span className="font-mono">{formatVND(p.taxableAllowances)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-0.5">
                <span className="text-slate-600">6. Phụ cấp miễn thuế (đi lại...)</span>
                <span className="font-mono">{formatVND(p.taxExemptAllowances)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-0.5">
                <span className="text-slate-600">7. Tiền ăn trưa / ăn ca</span>
                <span className="font-mono">{formatVND(p.mealAllowance)}</span>
              </div>
            </div>
          </div>
          <div className="bg-emerald-50 px-2.5 py-1.5 font-bold text-emerald-900 border-t border-emerald-200 flex justify-between">
            <span>TỔNG THU NHẬP (GROSS):</span>
            <span className="font-mono font-extrabold text-xs">{formatVND(p.grossIncome)}</span>
          </div>
        </div>

        {/* Right: TRÍCH NỘP & GIẢM TRỪ */}
        <div className="border border-slate-300 rounded-lg overflow-hidden flex flex-col justify-between">
          <div>
            <div className="bg-slate-800 text-white px-2.5 py-1.5 font-bold uppercase tracking-wider text-[10px] flex justify-between">
              <span>II. KHẤU TRỪ & THUẾ TNCN</span>
              <span>SỐ TIỀN (VNĐ)</span>
            </div>
            <div className="p-2 space-y-1">
              <div className="flex justify-between border-b border-slate-100 pb-0.5">
                <span className="text-slate-600">1. BHXH NLĐ đóng ({settings.socialInsRateEmployee}%)</span>
                <span className="font-mono">{formatVND(p.socialInsuranceEmp)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-0.5">
                <span className="text-slate-600">2. BHYT NLĐ đóng ({settings.healthInsRateEmployee}%)</span>
                <span className="font-mono">{formatVND(p.healthInsuranceEmp)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-0.5">
                <span className="text-slate-600">3. BHTN NLĐ đóng ({settings.unemploymentInsRateEmployee}%)</span>
                <span className="font-mono">{formatVND(p.unempInsuranceEmp)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-0.5 bg-amber-50/50 px-1 rounded">
                <span className="font-semibold text-slate-700">
                  Tổng trích BHXH ({((settings.socialInsRateEmployee || 0) + (settings.healthInsRateEmployee || 0) + (settings.unemploymentInsRateEmployee || 0)).toFixed(1).replace(/\.0$/, '')}%)
                </span>
                <span className="font-mono font-semibold text-red-600">-{formatVND(p.totalInsuranceEmp)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-0.5">
                <span className="text-slate-600">4. Giảm trừ bản thân & NPT ({p.dependentCount} người)</span>
                <span className="font-mono text-slate-500">{formatVND(p.personalDeduction + p.dependentDeduction)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-0.5">
                <span className="text-slate-600">5. Thu nhập tính thuế TNCN</span>
                <span className="font-mono text-slate-700">{formatVND(p.assessableIncome)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-0.5 bg-red-50/50 px-1 rounded">
                <span className="font-semibold text-slate-700">6. Thuế TNCN phải nộp</span>
                <span className="font-mono font-semibold text-red-600">-{formatVND(p.personalIncomeTax)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-0.5">
                <span className="text-slate-600">7. Tạm ứng / Khấu trừ khác</span>
                <span className="font-mono text-red-600">-{formatVND(p.advancePayment + p.mealDeduction + p.otherDeductions)}</span>
              </div>
            </div>
          </div>
          <div className="bg-red-50 px-2.5 py-1.5 font-bold text-red-900 border-t border-red-200 flex justify-between">
            <span>TỔNG CÁC KHOẢN TRÍCH TRỪ:</span>
            <span className="font-mono font-extrabold text-xs">
              -{formatVND(p.totalInsuranceEmp + p.personalIncomeTax + p.advancePayment + p.mealDeduction + p.otherDeductions)}
            </span>
          </div>
        </div>
      </div>

      {/* THỰC LĨNH BOX (NET SALARY) */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white p-3 rounded-xl flex items-center justify-between shadow-xs mb-2.5">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-emerald-100 font-semibold">
            SỐ TIỀN THỰC LĨNH (NET SALARY)
          </div>
          <div className="text-[10px] text-emerald-200 mt-0.5">
            (Tổng thu nhập trừ Bảo hiểm, Thuế TNCN và các khoản tạm ứng/khấu trừ)
          </div>
        </div>
        <div className="text-right">
          <div className="text-xl font-black font-mono tracking-tight">
            {formatVND(p.netSalary)}
          </div>
          <div className="text-[10px] text-emerald-100 flex items-center gap-1 justify-end mt-0.5">
            <CheckCircle className="w-3 h-3" />
            <span>Chuyển khoản qua số TK: {emp.bankAccount || 'Tiền mặt'}</span>
          </div>
        </div>
      </div>

      {/* Signatures */}
      <div className="grid grid-cols-3 text-center text-xs pt-2 border-t border-slate-200 gap-3">
        <div>
          <div className="font-bold text-slate-800">NGƯỜI LẬP BIỂU</div>
          <div className="text-slate-400 italic text-[10px] mt-0.5">(Ký, ghi rõ họ tên)</div>
          <div className="h-12 flex items-end justify-center font-semibold text-slate-700">
            {settings.reportPreparerName}
          </div>
        </div>
        <div>
          <div className="font-bold text-slate-800">KẾ TOÁN TRƯỞNG</div>
          <div className="text-slate-400 italic text-[10px] mt-0.5">(Ký, ghi rõ họ tên)</div>
          <div className="h-12 flex items-end justify-center font-semibold text-slate-700">
            {settings.chiefAccountantName}
          </div>
        </div>
        <div>
          <div className="font-bold text-slate-800">NGƯỜI LAO ĐỘNG</div>
          <div className="text-slate-400 italic text-[10px] mt-0.5">(Ký xác nhận)</div>
          <div className="h-12 flex items-end justify-center font-semibold text-slate-700">
            {emp.fullName}
          </div>
        </div>
      </div>
    </div>
  );
};

interface PrintSlipModalProps {
  isOpen: boolean;
  onClose: () => void;
  employees: Employee[];
  payrolls: PayrollRecord[];
  settings: SystemSettings;
  selectedEmployeeId?: string; // Nếu chọn 1 người thì in 1 người, nếu không thì in hàng loạt
  initialSelectedEmployeeIds?: string[]; // Danh sách lao động được chọn từ bảng lương
  month: string;
}

export const PrintSlipModal: React.FC<PrintSlipModalProps> = ({
  isOpen,
  onClose,
  employees,
  payrolls,
  settings,
  selectedEmployeeId,
  initialSelectedEmployeeIds,
  month
}) => {
  const printAreaRef = useRef<HTMLDivElement>(null);

  const empPayrollMap = useMemo(() => new Map(payrolls.map(p => [p.employeeId, p])), [payrolls]);
  const depMap = useMemo(() => new Map(settings.departments.map(d => [d.id, d.name])), [settings.departments]);
  const posMap = useMemo(() => new Map(settings.positions.map(p => [p.id, p.name])), [settings.positions]);

  // Danh sách các nhân viên có dữ liệu bảng lương trong tháng
  const availableEmployees = useMemo(() => {
    return employees.filter(e => empPayrollMap.has(e.id));
  }, [employees, empPayrollMap]);

  // State các nhân viên được chọn để in
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    if (selectedEmployeeId) {
      return new Set([selectedEmployeeId]);
    }
    if (initialSelectedEmployeeIds && initialSelectedEmployeeIds.length > 0) {
      return new Set(initialSelectedEmployeeIds);
    }
    return new Set(availableEmployees.map(e => e.id));
  });

  // State tìm kiếm & lọc bộ phận trong hộp chọn
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDep, setFilterDep] = useState('all');
  const [isSelectionExpanded, setIsSelectionExpanded] = useState(true);

  // Khi modal mở hoặc danh sách khởi tạo thay đổi
  useEffect(() => {
    if (isOpen) {
      if (selectedEmployeeId) {
        setSelectedIds(new Set([selectedEmployeeId]));
      } else if (initialSelectedEmployeeIds && initialSelectedEmployeeIds.length > 0) {
        setSelectedIds(new Set(initialSelectedEmployeeIds));
      } else {
        setSelectedIds(new Set(availableEmployees.map(e => e.id)));
      }
      setSearchQuery('');
      setFilterDep('all');
    }
  }, [isOpen, selectedEmployeeId, initialSelectedEmployeeIds, availableEmployees]);

  // Lọc danh sách nhân viên trong bảng chọn
  const filteredAvailableEmployees = useMemo(() => {
    return availableEmployees.filter(emp => {
      const matchDep = filterDep === 'all' || emp.departmentId === filterDep;
      const q = searchQuery.toLowerCase().trim();
      const matchSearch = !q || 
        emp.fullName.toLowerCase().includes(q) || 
        emp.employeeCode.toLowerCase().includes(q) ||
        (emp.idCardNumber && emp.idCardNumber.includes(q));
      return matchDep && matchSearch;
    });
  }, [availableEmployees, filterDep, searchQuery]);

  // Các thao tác chọn
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(availableEmployees.map(e => e.id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const selectOnlyFiltered = () => {
    setSelectedIds(new Set(filteredAvailableEmployees.map(e => e.id)));
  };

  // Các nhân viên sẽ thực tế được in (theo thứ tự ban đầu)
  const targetEmployees = useMemo(() => {
    if (selectedEmployeeId) {
      return employees.filter(e => e.id === selectedEmployeeId);
    }
    return availableEmployees.filter(e => selectedIds.has(e.id));
  }, [selectedEmployeeId, employees, availableEmployees, selectedIds]);

  // Tổng tiền thực lĩnh của các phiếu lương được chọn
  const totalSelectedNet = useMemo(() => {
    return targetEmployees.reduce((sum, emp) => {
      const p = empPayrollMap.get(emp.id);
      return sum + (p?.netSalary || 0);
    }, 0);
  }, [targetEmployees, empPayrollMap]);

  if (!isOpen) return null;

  const handlePrint = () => {
    if (targetEmployees.length === 0) {
      return;
    }
    window.print();
  };

  const handleExportExcel = () => {
    if (targetEmployees.length === 0) return;
    const wb = XLSX.utils.book_new();

    targetEmployees.forEach(emp => {
      const p = empPayrollMap.get(emp.id);
      if (!p) return;
      const depName = depMap.get(emp.departmentId) || 'Chưa phân phòng';
      const posName = posMap.get(emp.positionId) || 'Nhân viên';
      const totalOt = (p.otPayTaxable || 0) + (p.otPayTaxExempt || 0);

      const rows: any[][] = [
        [settings.companyName.toUpperCase()],
        [`Địa chỉ: ${settings.address}`],
        [`Mã số thuế: ${settings.taxCode} | SĐT: ${settings.phoneNumber}`],
        [],
        ['PHIẾU THANH TOÁN LƯƠNG & THU NHẬP'],
        [`Kỳ chi trả: Tháng ${month} / ${settings.currentYear}`],
        [],
        ['THÔNG TIN NGƯỜI LAO ĐỘNG'],
        ['Họ và tên:', emp.fullName, '', 'Mã nhân viên:', emp.employeeCode],
        ['Số CCCD:', emp.idCardNumber || '—', '', 'Phòng ban:', depName],
        ['Chức vụ:', posName, '', 'Số tài khoản:', emp.bankAccount || 'Tiền mặt'],
        ['Ngân hàng:', emp.bankName || '—', '', 'Hình thức lương:', emp.salaryBasis === 'hourly' ? 'Theo giờ' : 'Lương tháng'],
        [],
        ['I. CÁC KHOẢN THU NHẬP', 'SỐ TIỀN (VNĐ)', '', 'II. CÁC KHOẢN KHẤU TRỪ', 'SỐ TIỀN (VNĐ)'],
        ['1. Lương cơ bản / thỏa thuận', emp.baseSalary, '', '1. BHXH trừ lương (8%)', p.socialInsuranceEmp],
        ['2. Lương chính theo công / giờ', p.mainSalary, '', '2. BHYT trừ lương (1.5%)', p.healthInsuranceEmp],
        ['3. Làm thêm giờ chịu thuế', p.otPayTaxable, '', '3. BHTN trừ lương (1%)', p.unempInsuranceEmp],
        ['4. Làm thêm giờ miễn thuế', p.otPayTaxExempt, '', '4. Tổng BHXH khấu trừ', p.totalInsuranceEmp],
        ['5. Phụ cấp tính thuế TNCN', p.taxableAllowances, '', '5. Thuế TNCN khấu trừ', p.personalIncomeTax],
        ['6. Phụ cấp miễn thuế', p.taxExemptAllowances, '', '6. Các khoản giảm trừ khác', p.otherDeductions || 0],
        ['7. Tiền ăn trưa / ăn ca', p.mealAllowance, '', '', ''],
        ['TỔNG THU NHẬP (GROSS)', p.grossIncome, '', 'TỔNG CÁC KHOẢN TRỪ', p.totalInsuranceEmp + p.personalIncomeTax + (p.otherDeductions || 0)],
        [],
        ['III. LƯƠNG THỰC LĨNH (NET)', p.netSalary],
        ['(Bằng chữ)', ''],
        [],
        ['IV. BẢO HIỂM DOANH NGHIỆP ĐÓNG', ''],
        ['BHXH Doanh nghiệp (17.5%)', p.socialInsuranceEmployer],
        ['BHYT Doanh nghiệp (3%)', p.healthInsuranceEmployer],
        ['BHTN Doanh nghiệp (1%)', p.unempInsuranceEmployer],
        ['Kinh phí Công đoàn (2%)', p.tradeUnionEmployer],
        ['Tổng DN đóng thêm', p.totalInsuranceEmployer],
        [],
        ['NGƯỜI NHẬN LƯƠNG', '', '', 'KẾ TOÁN TRƯỞNG', 'GIÁM ĐỐC'],
        ['(Ký, ghi rõ họ tên)', '', '', '(Ký, ghi rõ họ tên)', '(Ký tên, đóng dấu)'],
        [],
        [],
        [emp.fullName, '', '', settings.chiefAccountantName || '', settings.directorName || '']
      ];

      const ws = XLSX.utils.aoa_to_sheet(rows);
      // Clean sheet title (max 31 chars, no invalid chars)
      const safeCode = (emp.employeeCode || emp.fullName).replace(/[:\\\/\?\*\[\]]/g, '').slice(0, 25);
      const sheetTitle = `${safeCode}_T${String(month).replace(/\//g, '_')}`.slice(0, 31);
      XLSX.utils.book_append_sheet(wb, ws, sheetTitle);
    });

    const safeMonth = String(month).replace(/\//g, '_');
    XLSX.writeFile(wb, `Phieu_Luong_Thang_${safeMonth}_${settings.currentYear}.xlsx`);
  };

  const isBatchMode = !selectedEmployeeId;

  return (
    <div className="print-slip-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
      <div className="print-slip-modal-dialog bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-5xl w-full max-h-[94vh] flex flex-col overflow-hidden">
        {/* Modal Top Header */}
        <div className="px-5 py-3.5 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base flex items-center gap-2">
                <span>{selectedEmployeeId ? 'In Phiếu Lương Cá Nhân' : 'In Phiếu Lương Hàng Loạt'}</span>
                {isBatchMode && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold">
                    Đã chọn {targetEmployees.length} / {availableEmployees.length} người
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-400">
                Kỳ chi trả: Tháng {month} • Công ty: {settings.companyName}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              disabled={targetEmployees.length === 0}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer ${
                targetEmployees.length > 0 
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white active:scale-95' 
                  : 'bg-slate-700 text-slate-400 cursor-not-allowed opacity-60'
              }`}
            >
              <Printer className="w-4 h-4" />
              <span>In Phiếu Lương ({targetEmployees.length})</span>
            </button>
            <button
              onClick={handleExportExcel}
              disabled={targetEmployees.length === 0}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer ${
                targetEmployees.length > 0 
                  ? 'bg-emerald-700 hover:bg-emerald-800 text-white active:scale-95' 
                  : 'bg-slate-700 text-slate-400 cursor-not-allowed opacity-60'
              }`}
              title="Kết xuất phiếu lương các nhân viên đã chọn ra file Excel"
            >
              <Download className="w-4 h-4" />
              <span>Kết Xuất Excel</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              title="Đóng cửa sổ"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Batch Selection Drawer / Panel (Only in Batch Mode) */}
        {isBatchMode && (
          <div className="bg-slate-50 border-b border-slate-200 px-5 py-3 text-xs space-y-2.5 print:hidden">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-bold text-slate-800 uppercase tracking-wider text-[11px]">
                <Users className="w-4 h-4 text-emerald-600" />
                <span>Chọn người lao động cần in ({selectedIds.size}/{availableEmployees.length})</span>
                <span className="text-slate-400 font-normal normal-case">
                  • Tổng thực lĩnh: <strong className="font-mono text-emerald-700">{formatVND(totalSelectedNet)}</strong>
                </span>
              </div>

              {/* Quick Select Buttons */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={selectAll}
                  className="px-2.5 py-1 bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-300 rounded-lg font-bold text-[11px] transition-colors cursor-pointer"
                >
                  Chọn tất cả ({availableEmployees.length})
                </button>
                <button
                  onClick={deselectAll}
                  className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-600 border border-slate-300 rounded-lg font-medium text-[11px] transition-colors cursor-pointer"
                >
                  Bỏ chọn tất cả
                </button>
                {searchQuery || filterDep !== 'all' ? (
                  <button
                    onClick={selectOnlyFiltered}
                    className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-300 rounded-lg font-bold text-[11px] transition-colors cursor-pointer"
                  >
                    Chỉ chọn kết quả lọc ({filteredAvailableEmployees.length})
                  </button>
                ) : null}
                <button
                  onClick={() => setIsSelectionExpanded(prev => !prev)}
                  className="text-slate-500 hover:text-slate-800 px-1.5 py-1 text-[11px] underline cursor-pointer"
                >
                  {isSelectionExpanded ? 'Thu gọn bộ chọn ▲' : 'Mở rộng bộ chọn ▼'}
                </button>
              </div>
            </div>

            {/* Filter controls & List */}
            {isSelectionExpanded && (
              <div className="space-y-2 pt-1">
                {/* Search & Dep Filter */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      placeholder="Tìm theo tên, mã NV hoặc CCCD..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div className="w-48">
                    <select
                      value={filterDep}
                      onChange={e => setFilterDep(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    >
                      <option value="all">Tất cả phòng ban ({settings.departments.length})</option>
                      {settings.departments.map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Employee Checkboxes Grid */}
                <div className="bg-white border border-slate-200 rounded-xl p-2.5 max-h-40 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-1.5">
                  {filteredAvailableEmployees.length === 0 ? (
                    <div className="col-span-full py-4 text-center text-slate-400 text-xs">
                      Không tìm thấy lao động nào phù hợp với bộ lọc
                    </div>
                  ) : (
                    filteredAvailableEmployees.map(emp => {
                      const isChecked = selectedIds.has(emp.id);
                      const p = empPayrollMap.get(emp.id);
                      return (
                        <label
                          key={emp.id}
                          className={`flex items-center gap-2 p-1.5 rounded-lg border text-xs cursor-pointer transition-colors select-none ${
                            isChecked
                              ? 'bg-emerald-50/80 border-emerald-300 text-slate-900 font-semibold'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleSelect(emp.id)}
                            className="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500 rounded-xs"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[11px] leading-tight flex items-center justify-between">
                              <span className="font-bold">{emp.fullName}</span>
                              <span className="font-mono text-[10px] text-slate-400 ml-1">{emp.employeeCode}</span>
                            </div>
                            <div className="text-[10px] text-slate-400 truncate flex items-center justify-between">
                              <span>{depMap.get(emp.departmentId) || '—'}</span>
                              {p && (
                                <span className="font-mono text-emerald-700 font-medium ml-1">
                                  {formatVND(p.netSalary)}
                                </span>
                              )}
                            </div>
                          </div>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Screen Preview Slips Content */}
        <div ref={printAreaRef} className="print-slip-scroll-area p-6 overflow-y-auto space-y-8 bg-slate-100 flex-1">
          <div className="space-y-8 w-full">
            {targetEmployees.length === 0 ? (
              <div className="bg-white rounded-2xl p-12 text-center border border-dashed border-slate-300 max-w-md mx-auto space-y-3">
                <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <h4 className="text-base font-bold text-slate-800">Chưa chọn người lao động nào</h4>
                <p className="text-xs text-slate-500">
                  Vui lòng tích chọn người lao động ở danh sách phía trên hoặc bấm "Chọn tất cả" để in phiếu lương.
                </p>
                <button
                  onClick={selectAll}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Chọn tất cả ({availableEmployees.length} lao động)
                </button>
              </div>
            ) : (
              targetEmployees.map(emp => {
                const p = empPayrollMap.get(emp.id);
                if (!p) return null;

                return (
                  <div 
                    key={emp.id} 
                    className="bg-white p-6 sm:p-7 rounded-xl shadow-xs border border-slate-300 max-w-3xl mx-auto text-slate-800 text-xs"
                  >
                    <SinglePayslipCard 
                      emp={emp} 
                      p={p} 
                      settings={settings} 
                      depMap={depMap} 
                      posMap={posMap} 
                      isPrint={false} 
                    />
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* DEDICATED PRINT PORTAL ATTACHED DIRECTLY TO DOCUMENT BODY */}
      {createPortal(
        <div id="payslips-batch-print-portal" className="hidden print:block">
          <style dangerouslySetInnerHTML={{ __html: `
            @media print {
              @page {
                size: A4 portrait;
                margin: 7mm 7mm 7mm 7mm;
              }

              /* Hide the entire application in #root to avoid any interference from modal/overflow wrappers */
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
              }

              #payslips-batch-print-portal {
                display: block !important;
                position: static !important;
                width: 100% !important;
                margin: 0 !important;
                padding: 0 !important;
                background: white !important;
              }

              .payslip-page {
                display: block !important;
                position: static !important;
                width: 100% !important;
                max-width: 100% !important;
                page-break-after: always !important;
                break-after: page !important;
                page-break-inside: avoid !important;
                break-inside: avoid !important;
                box-sizing: border-box !important;
                margin: 0 !important;
                padding: 2mm 3mm !important;
                border: none !important;
                box-shadow: none !important;
                background: white !important;
              }

              .payslip-page:last-child {
                page-break-after: auto !important;
                break-after: auto !important;
              }
            }
          `}} />

          {targetEmployees.map(emp => {
            const p = empPayrollMap.get(emp.id);
            if (!p) return null;

            return (
              <div key={emp.id} className="payslip-page">
                <SinglePayslipCard 
                  emp={emp} 
                  p={p} 
                  settings={settings} 
                  depMap={depMap} 
                  posMap={posMap} 
                  isPrint={true} 
                />
              </div>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
};
