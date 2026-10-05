import React, { useState, useEffect, useMemo } from 'react';
import { Printer, X, FileSpreadsheet, Building, Layers, Download } from 'lucide-react';
import { Employee, PayrollRecord, SystemSettings, Department } from '../types';
import { formatVND } from '../utils/payrollCalculator';
import * as XLSX from 'xlsx';

interface PrintPayrollModalProps {
  isOpen: boolean;
  onClose: () => void;
  employees: Employee[];
  payrolls: PayrollRecord[];
  settings: SystemSettings;
  month: string;
  initialDepartmentId?: string;
}

export const PrintPayrollModal: React.FC<PrintPayrollModalProps> = ({
  isOpen,
  onClose,
  employees = [],
  payrolls = [],
  settings,
  month,
  initialDepartmentId
}) => {
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>(initialDepartmentId || 'all');
  const [printMode, setPrintMode] = useState<'single' | 'all_by_department'>('single');

  // Đảm bảo tất cả React Hooks được gọi vô điều kiện trước bất kỳ lệnh return nào
  useEffect(() => {
    if (isOpen) {
      setSelectedDepartmentId(initialDepartmentId || 'all');
    }
  }, [isOpen, initialDepartmentId]);

  const empMap = useMemo(() => new Map((employees || []).map(e => [e.id, e])), [employees]);
  const depMap = useMemo(() => new Map((settings?.departments || []).map(d => [d.id, d.name])), [settings?.departments]);
  const posMap = useMemo(() => new Map((settings?.positions || []).map(p => [p.id, p.name])), [settings?.positions]);

  // Tập hợp các số CCCD bị trùng lặp
  const duplicateIdCards = useMemo(() => {
    const counts = new Map<string, number>();
    (employees || []).forEach(e => {
      const cccd = String(e?.idCardNumber || '').trim();
      if (cccd) counts.set(cccd, (counts.get(cccd) || 0) + 1);
    });
    const dupSet = new Set<string>();
    counts.forEach((cnt, cccd) => {
      if (cnt > 1) dupSet.add(cccd);
    });
    return dupSet;
  }, [employees]);

  // Danh sách các phòng ban kèm bảng lương của từng phòng
  const departmentsWithPayrolls = useMemo(() => {
    const map = new Map<string, { department: Department; payrolls: PayrollRecord[] }>();
    
    (settings?.departments || []).forEach(dep => {
      map.set(dep.id, { department: dep, payrolls: [] });
    });

    const otherPayrolls: PayrollRecord[] = [];

    (payrolls || []).forEach(p => {
      const emp = empMap.get(p.employeeId);
      const depId = p.effectiveDepartmentId || emp?.departmentId;
      if (depId && map.has(depId)) {
        map.get(depId)!.payrolls.push(p);
      } else {
        otherPayrolls.push(p);
      }
    });

    const list: { department: Department; payrolls: PayrollRecord[] }[] = [];
    map.forEach(item => {
      if (item.payrolls.length > 0) {
        list.push(item);
      }
    });

    if (otherPayrolls.length > 0) {
      list.push({
        department: {
          id: 'other',
          code: 'KHAC',
          name: 'Bộ Phận Khác / Chưa Phân Phòng',
          managerName: '',
          description: ''
        },
        payrolls: otherPayrolls
      });
    }

    return list;
  }, [settings?.departments, payrolls, empMap]);

  const selectedDept = useMemo(() => {
    return (settings?.departments || []).find(d => d.id === selectedDepartmentId);
  }, [settings?.departments, selectedDepartmentId]);

  const currentPayrolls = useMemo(() => {
    if (selectedDepartmentId === 'all') return payrolls || [];
    return (payrolls || []).filter(p => {
      const emp = empMap.get(p.employeeId);
      return emp?.departmentId === selectedDepartmentId;
    });
  }, [selectedDepartmentId, payrolls, empMap]);

  // QUAN TRỌNG: Chỉ return null sau khi tất cả React Hooks đã được thực thi
  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleExportExcel = () => {
    const targetPayrolls = currentPayrolls;
    const excelRows = [
      [settings.companyName.toUpperCase()],
      [`Địa chỉ: ${settings.address}`],
      [`Mã số thuế: ${settings.taxCode} | Điện thoại: ${settings.phoneNumber}`],
      [],
      [`BẢNG THANH TOÁN LƯƠNG & THU NHẬP - THÁNG ${month}/${settings.currentYear}`],
      [selectedDept ? `Phòng ban: ${selectedDept.name}` : 'Toàn bộ doanh nghiệp'],
      [],
      [
        'STT',
        'Mã NV',
        'Số CCCD',
        'Họ và Tên',
        'Phòng Ban',
        'Chức Vụ',
        'Lương Cơ Bản',
        'Công Chuẩn',
        'Công Thực Tế',
        'Lương Thời Gian',
        'Làm Thêm Giờ (OT)',
        'Ăn Ca & Phụ Cấp',
        'Tổng Thu Nhập (Gross)',
        'BHXH Trừ Lương (10.5%)',
        'Thuế TNCN',
        'Giảm Trừ Khác',
        'Lương Thực Lĩnh (Net)',
        'BHXH DN Đóng',
        'Ký Nhận'
      ],
      ...targetPayrolls.map((p, idx) => {
        const emp = empMap.get(p.employeeId);
        const dep = (settings.departments || []).find(d => d.id === emp?.departmentId);
        const pos = (settings.positions || []).find(pos => pos.id === emp?.positionId);
        const totalOt = (p.otPayTaxable || 0) + (p.otPayTaxExempt || 0);
        const totalAllowances = (p.taxableAllowances || 0) + (p.taxExemptAllowances || 0) + (p.mealAllowance || 0);
        return [
          idx + 1,
          emp?.employeeCode || '',
          emp?.idCardNumber || '',
          emp?.fullName || '',
          dep?.name || '',
          pos?.name || '',
          Number(emp?.baseSalary) || Number(p.baseSalary) || 0,
          p.standardDays || settings.standardWorkDays || 24,
          p.actualWorkDays || 0,
          p.mainSalary || 0,
          totalOt,
          totalAllowances,
          p.grossIncome || 0,
          p.totalInsuranceEmp || 0,
          p.personalIncomeTax || 0,
          p.otherDeductions || 0,
          p.netSalary || 0,
          p.totalInsuranceEmployer || 0,
          ''
        ];
      }),
      [
        'TỔNG CỘNG',
        '',
        '',
        '',
        '',
        '',
        targetPayrolls.reduce((sum, p) => {
          const emp = empMap.get(p.employeeId);
          return sum + (Number(emp?.baseSalary) || Number(p.baseSalary) || 0);
        }, 0),
        '',
        targetPayrolls.reduce((sum, p) => sum + (p.actualWorkDays || 0), 0),
        targetPayrolls.reduce((sum, p) => sum + (p.mainSalary || 0), 0),
        targetPayrolls.reduce((sum, p) => sum + (p.otPayTaxable || 0) + (p.otPayTaxExempt || 0), 0),
        targetPayrolls.reduce((sum, p) => sum + (p.taxableAllowances || 0) + (p.taxExemptAllowances || 0) + (p.mealAllowance || 0), 0),
        targetPayrolls.reduce((sum, p) => sum + (p.grossIncome || 0), 0),
        targetPayrolls.reduce((sum, p) => sum + (p.totalInsuranceEmp || 0), 0),
        targetPayrolls.reduce((sum, p) => sum + (p.personalIncomeTax || 0), 0),
        targetPayrolls.reduce((sum, p) => sum + (p.otherDeductions || 0), 0),
        targetPayrolls.reduce((sum, p) => sum + (p.netSalary || 0), 0),
        targetPayrolls.reduce((sum, p) => sum + (p.totalInsuranceEmployer || 0), 0),
        ''
      ],
      [],
      [],
      ['NGƯỜI LẬP BIỂU', '', '', 'KẾ TOÁN TRƯỞNG', '', '', '', '', '', '', '', '', 'GIÁM ĐỐC DOANH NGHIỆP'],
      ['(Ký, ghi rõ họ tên)', '', '', '(Ký, ghi rõ họ tên)', '', '', '', '', '', '', '', '', '(Ký, đóng dấu, ghi rõ họ tên)'],
      [],
      [],
      [
        settings.reportPreparerName || 'Phạm Hồng Phúc',
        '',
        '',
        settings.chiefAccountantName || 'Trần Thị Thu Hương',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        settings.directorName || 'Nguyễn Văn Thành'
      ]
    ];

    const ws = XLSX.utils.aoa_to_sheet(excelRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Bang_Luong');
    const safeMonth = String(month).replace(/\//g, '_');
    XLSX.writeFile(wb, `Bang_Luong_Thang_${safeMonth}_${settings.currentYear}.xlsx`);
  };

  /**
   * Render bảng lương hoàn chỉnh cho một đơn vị / phòng ban
   */
  const renderPayrollSheet = (
    sheetPayrolls: PayrollRecord[],
    department?: Department,
    isPageBreak = false
  ) => {
    const totalBaseSalary = sheetPayrolls.reduce((sum, p) => {
      const emp = empMap.get(p.employeeId);
      return sum + (Number(emp?.baseSalary) || Number(p.baseSalary) || 0);
    }, 0);
    const totalMainSalary = sheetPayrolls.reduce((sum, p) => sum + (Number(p.mainSalary) || 0), 0);
    const totalOT = sheetPayrolls.reduce((sum, p) => sum + (Number(p.otPayTaxable) || 0) + (Number(p.otPayTaxExempt) || 0), 0);
    const totalGross = sheetPayrolls.reduce((sum, p) => sum + (Number(p.grossIncome) || 0), 0);
    const totalInsuranceEmp = sheetPayrolls.reduce((sum, p) => sum + (Number(p.totalInsuranceEmp) || 0), 0);
    const totalTax = sheetPayrolls.reduce((sum, p) => sum + (Number(p.personalIncomeTax) || 0), 0);
    const totalNet = sheetPayrolls.reduce((sum, p) => sum + (Number(p.netSalary) || 0), 0);
    const totalCompanyInsurance = sheetPayrolls.reduce((sum, p) => sum + (Number(p.totalInsuranceEmployer) || 0), 0);

    return (
      <div 
        key={department ? department.id : 'all'} 
        className={`p-4 bg-white rounded-lg border border-slate-200 shadow-2xs print:border-none print:shadow-none print:p-0 ${
          isPageBreak ? 'page-break mb-10 print:mb-0' : ''
        }`}
      >
        {/* Header info */}
        <div className="flex justify-between items-start mb-4">
          <div>
            <div className="font-bold text-xs uppercase text-slate-800">{settings?.companyName || ''}</div>
            <div className="text-[11px] text-slate-500">Mã số thuế: {settings?.taxCode || ''}</div>
            <div className="text-[11px] text-slate-500">Địa chỉ: {settings?.address || ''}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-700 font-semibold">
              Kỳ tính lương: Tháng {settings?.currentMonth || ''}/{settings?.currentYear || ''}
            </div>
            {department && (
              <div className="text-xs font-bold text-emerald-800 mt-0.5">
                Phòng ban: {department.name}
              </div>
            )}
          </div>
        </div>

        <div className="text-center mb-5">
          <h1 className="text-lg font-extrabold uppercase tracking-wide text-slate-900">
            BẢNG THANH TOÁN TIỀN LƯƠNG & CÁC KHOẢN TRÍCH THEO LƯƠNG
          </h1>
          <p className="text-xs italic text-slate-600 font-medium mt-0.5">
            {department ? (
              <>
                Bộ phận / Phòng ban: <strong>{department.name}</strong> • Tháng {settings?.currentMonth} năm {settings?.currentYear} - Ngày công chuẩn: {settings?.standardWorkDays || 24} ngày ({sheetPayrolls.length} nhân viên)
              </>
            ) : (
              <>
                Tháng {settings?.currentMonth} năm {settings?.currentYear} - Ngày công chuẩn: {settings?.standardWorkDays || 24} ngày (Toàn đơn vị: {sheetPayrolls.length} nhân viên)
              </>
            )}
          </p>
        </div>

        {/* Table */}
        <table className="w-full border-collapse border border-slate-400 text-center text-[10px]">
          <thead className="bg-slate-100 font-bold text-slate-900">
            <tr>
              <th rowSpan={2} className="border border-slate-400 p-1">STT</th>
              <th rowSpan={2} className="border border-slate-400 p-1">Mã NV</th>
              <th rowSpan={2} className="border border-slate-400 p-1 text-center min-w-[85px]">Số CCCD</th>
              <th rowSpan={2} className="border border-slate-400 p-1 text-left min-w-[110px]">Họ và Tên</th>
              <th rowSpan={2} className="border border-slate-400 p-1 text-left min-w-[80px]">Chức Vụ</th>
              <th rowSpan={2} className="border border-slate-400 p-1 min-w-[85px] bg-slate-200/70">Hình thức lương</th>
              <th rowSpan={2} className="border border-slate-400 p-1">Lương CB (HĐ)</th>
              <th rowSpan={2} className="border border-slate-400 p-1 min-w-[70px]">Công / Giờ / KPI</th>
              <th colSpan={4} className="border border-slate-400 p-1 bg-emerald-50">CÁC KHOẢN THU NHẬP</th>
              <th rowSpan={2} className="border border-slate-400 p-1 bg-emerald-100 font-black">TỔNG GROSS</th>
              <th colSpan={3} className="border border-slate-400 p-1 bg-amber-50">
                TRÍCH NỘP BHXH NLĐ ({((settings?.socialInsRateEmployee || 0) + (settings?.healthInsRateEmployee || 0) + (settings?.unemploymentInsRateEmployee || 0)).toFixed(1).replace(/\.0$/, '')}%)
              </th>
              <th colSpan={2} className="border border-slate-400 p-1 bg-blue-50">THUẾ TNCN</th>
              <th rowSpan={2} className="border border-slate-400 p-1">Tạm ứng</th>
              <th rowSpan={2} className="border border-slate-400 p-1 bg-teal-100 font-black">THỰC LĨNH</th>
              <th rowSpan={2} className="border border-slate-400 p-1 min-w-[70px]">Ký nhận</th>
            </tr>
            <tr>
              <th className="border border-slate-400 p-1">Lương chính</th>
              <th className="border border-slate-400 p-1">Làm thêm</th>
              <th className="border border-slate-400 p-1">Phụ cấp</th>
              <th className="border border-slate-400 p-1">Tiền ăn</th>
              <th className="border border-slate-400 p-1">BHXH({settings?.socialInsRateEmployee || 8}%)</th>
              <th className="border border-slate-400 p-1">BHYT({settings?.healthInsRateEmployee || 1.5}%)</th>
              <th className="border border-slate-400 p-1">BHTN({settings?.unemploymentInsRateEmployee || 1}%)</th>
              <th className="border border-slate-400 p-1">TN Chịu thuế</th>
              <th className="border border-slate-400 p-1 text-red-600 font-bold">Thuế TNCN</th>
            </tr>
          </thead>
          <tbody>
            {sheetPayrolls.map((p, idx) => {
              const emp = empMap.get(p.employeeId);
              const isDuplicateCccd = emp?.idCardNumber ? duplicateIdCards.has(String(emp.idCardNumber).trim()) : false;

              return (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="border border-slate-300 p-1 font-mono">{idx + 1}</td>
                  <td className="border border-slate-300 p-1 font-mono font-bold">{emp?.employeeCode || ''}</td>
                  <td className="border border-slate-300 p-1 font-mono text-center">
                    <div className="font-semibold">{emp?.idCardNumber || '—'}</div>
                    {isDuplicateCccd && (
                      <span className="text-[8px] font-bold text-amber-800 bg-amber-100 px-1 py-0.2 rounded block mt-0.5 print:border print:border-amber-400">
                        *Trùng CCCD
                      </span>
                    )}
                  </td>
                  <td className="border border-slate-300 p-1 text-left font-semibold">{emp?.fullName || ''}</td>
                  <td className="border border-slate-300 p-1 text-left">{posMap.get(p.effectivePositionId || emp?.positionId || '') || ''}</td>
                  <td className="border border-slate-300 p-1 text-left font-medium text-slate-800">
                    {(p.salaryBasis || emp?.salaryBasis) === 'monthly' ? 'Lương tháng' :
                     (p.salaryBasis || emp?.salaryBasis) === 'daily' ? 'Theo ngày công' :
                     (p.salaryBasis || emp?.salaryBasis) === 'hourly' ? 'Theo giờ' :
                     (p.salaryBasis || emp?.salaryBasis) === 'percent' ? `Theo KPI (${emp?.salaryPercent || 100}%)` :
                     'Theo bộ phận'}
                  </td>
                  <td className="border border-slate-300 p-1 text-right font-mono">{formatVND(p.baseSalary)}</td>
                  <td className="border border-slate-300 p-1 text-center font-bold text-emerald-900">
                    {emp?.salaryBasis === 'hourly' ? (
                      <div className="leading-tight">
                        <span className="font-mono text-emerald-950 font-black">{p.actualWorkHours ?? (p.actualPaidDays * 8)}</span>
                        <span className="text-[8.5px] font-semibold text-slate-500 block">giờ làm</span>
                      </div>
                    ) : emp?.salaryBasis === 'daily' ? (
                      <div className="leading-tight">
                        <span className="font-mono text-emerald-950 font-black">{p.actualPaidDays}</span>
                        <span className="text-[8.5px] font-semibold text-slate-500 block">ngày công</span>
                      </div>
                    ) : emp?.salaryBasis === 'percent' ? (
                      <div className="leading-tight">
                        <span className="font-mono text-emerald-950 font-black">{p.actualPaidDays} công</span>
                        <span className="text-[8.5px] font-bold text-blue-600 block">{emp.salaryPercent || 100}% KPI</span>
                      </div>
                    ) : (
                      <div className="leading-tight">
                        <span className="font-mono text-emerald-950 font-black">{p.actualPaidDays}</span>
                        <span className="text-[8.5px] font-semibold text-slate-500 block">ngày công</span>
                      </div>
                    )}
                  </td>
                  <td className="border border-slate-300 p-1 text-right font-mono">{formatVND(p.mainSalary)}</td>
                  <td className="border border-slate-300 p-1 text-right font-mono">{formatVND(p.otPayTaxable + p.otPayTaxExempt)}</td>
                  <td className="border border-slate-300 p-1 text-right font-mono">{formatVND(p.taxableAllowances + p.taxExemptAllowances)}</td>
                  <td className="border border-slate-300 p-1 text-right font-mono">{formatVND(p.mealAllowance)}</td>
                  <td className="border border-slate-300 p-1 text-right font-mono font-bold bg-emerald-50 text-emerald-950">
                    {formatVND(p.grossIncome)}
                  </td>
                  <td className="border border-slate-300 p-1 text-right font-mono text-slate-600">{formatVND(p.socialInsuranceEmp)}</td>
                  <td className="border border-slate-300 p-1 text-right font-mono text-slate-600">{formatVND(p.healthInsuranceEmp)}</td>
                  <td className="border border-slate-300 p-1 text-right font-mono text-slate-600">{formatVND(p.unempInsuranceEmp)}</td>
                  <td className="border border-slate-300 p-1 text-right font-mono text-slate-600">{formatVND(p.taxableIncome)}</td>
                  <td className="border border-slate-300 p-1 text-right font-mono font-bold text-red-600">{formatVND(p.personalIncomeTax)}</td>
                  <td className="border border-slate-300 p-1 text-right font-mono">{p.advancePayment > 0 ? formatVND(p.advancePayment) : '-'}</td>
                  <td className="border border-slate-300 p-1 text-right font-mono font-black bg-teal-50 text-emerald-900">
                    {formatVND(p.netSalary)}
                  </td>
                  <td className="border border-slate-300 p-1 text-slate-300 italic">Chuyển khoản</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-800 text-slate-900">
            <tr>
              <td colSpan={6} className="border border-slate-400 p-1.5 text-center uppercase">
                {department ? `TỔNG CỘNG (${department.name})` : 'TỔNG CỘNG'}
              </td>
              <td className="border border-slate-400 p-1.5 text-right font-mono">{formatVND(totalBaseSalary)}</td>
              <td className="border border-slate-400 p-1.5">-</td>
              <td className="border border-slate-400 p-1.5 text-right font-mono">{formatVND(totalMainSalary)}</td>
              <td className="border border-slate-400 p-1.5 text-right font-mono">{formatVND(totalOT)}</td>
              <td className="border border-slate-400 p-1.5 text-right font-mono">-</td>
              <td className="border border-slate-400 p-1.5 text-right font-mono">-</td>
              <td className="border border-slate-400 p-1.5 text-right font-mono font-black bg-emerald-100 text-emerald-950">
                {formatVND(totalGross)}
              </td>
              <td colSpan={3} className="border border-slate-400 p-1.5 text-right font-mono text-red-700">
                {formatVND(totalInsuranceEmp)}
              </td>
              <td className="border border-slate-400 p-1.5">-</td>
              <td className="border border-slate-400 p-1.5 text-right font-mono font-bold text-red-700">
                {formatVND(totalTax)}
              </td>
              <td className="border border-slate-400 p-1.5">-</td>
              <td className="border border-slate-400 p-1.5 text-right font-mono font-black bg-teal-100 text-emerald-950">
                {formatVND(totalNet)}
              </td>
              <td className="border border-slate-400 p-1.5"></td>
            </tr>
          </tfoot>
        </table>

        {/* Note on Enterprise Insurance Cost */}
        <div className="mt-3 flex justify-between items-center text-[10px] text-slate-600 bg-slate-50 p-2 rounded border border-slate-200">
          <div>
            <span className="font-semibold text-slate-800">Chi phí BHXH, BHYT, BHTN, KPCĐ người sử dụng lao động chịu (23.5%):</span>{' '}
            <span className="font-mono font-bold text-slate-900">{formatVND(totalCompanyInsurance)}</span>
          </div>
          <div>
            <span className="font-semibold text-slate-800">
              {department ? `Tổng ngân sách lương & BH (${department.name}):` : 'Tổng ngân sách chi trả lương & bảo hiểm toàn doanh nghiệp:'}
            </span>{' '}
            <span className="font-mono font-black text-emerald-800">{formatVND(totalGross + totalCompanyInsurance)}</span>
          </div>
        </div>

        {/* Signatures */}
        {department ? (
          <div className="grid grid-cols-4 text-center text-xs mt-6 pt-4 border-t border-slate-300">
            <div>
              <div className="font-bold text-slate-800 uppercase">TRƯỞNG BỘ PHẬN</div>
              <div className="text-slate-400 italic text-[10px] mt-0.5">(Ký, ghi rõ họ tên)</div>
              <div className="h-16 flex items-end justify-center font-bold text-slate-700">
                {department.managerName || 'Trưởng phòng'}
              </div>
            </div>
            <div>
              <div className="font-bold text-slate-800 uppercase">NGƯỜI LẬP BIỂU</div>
              <div className="text-slate-400 italic text-[10px] mt-0.5">(Ký, ghi rõ họ tên)</div>
              <div className="h-16 flex items-end justify-center font-bold text-slate-700">
                {settings?.reportPreparerName || ''}
              </div>
            </div>
            <div>
              <div className="font-bold text-slate-800 uppercase">KẾ TOÁN TRƯỞNG</div>
              <div className="text-slate-400 italic text-[10px] mt-0.5">(Ký, ghi rõ họ tên)</div>
              <div className="h-16 flex items-end justify-center font-bold text-slate-700">
                {settings?.chiefAccountantName || ''}
              </div>
            </div>
            <div>
              <div className="font-bold text-slate-800 uppercase">GIÁM ĐỐC ĐƠN VỊ</div>
              <div className="text-slate-400 italic text-[10px] mt-0.5">(Ký tên, đóng dấu)</div>
              <div className="h-16 flex items-end justify-center font-bold text-slate-700">
                {settings?.directorName || ''}
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 text-center text-xs mt-6 pt-4 border-t border-slate-300">
            <div>
              <div className="font-bold text-slate-800 uppercase">NGƯỜI LẬP BIỂU</div>
              <div className="text-slate-400 italic text-[10px] mt-0.5">(Ký, ghi rõ họ tên)</div>
              <div className="h-16 flex items-end justify-center font-bold text-slate-700">
                {settings?.reportPreparerName || ''}
              </div>
            </div>
            <div>
              <div className="font-bold text-slate-800 uppercase">KẾ TOÁN TRƯỞNG</div>
              <div className="text-slate-400 italic text-[10px] mt-0.5">(Ký, ghi rõ họ tên)</div>
              <div className="h-16 flex items-end justify-center font-bold text-slate-700">
                {settings?.chiefAccountantName || ''}
              </div>
            </div>
            <div>
              <div className="font-bold text-slate-800 uppercase">GIÁM ĐỐC ĐƠN VỊ</div>
              <div className="text-slate-400 italic text-[10px] mt-0.5">(Ký tên, đóng dấu)</div>
              <div className="h-16 flex items-end justify-center font-bold text-slate-700">
                {settings?.directorName || ''}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-2 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-[96vw] max-h-[96vh] flex flex-col overflow-hidden">
        {/* Top Control Bar */}
        <div className="px-6 py-3.5 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3 print:hidden shrink-0">
          <div className="flex items-center gap-2.5">
            <FileSpreadsheet className="w-5 h-5 text-emerald-400 shrink-0" />
            <div>
              <h3 className="font-bold text-base leading-tight">In Bảng Thanh Toán Lương</h3>
              <p className="text-xs text-slate-400">
                Khổ giấy A4 Ngang (Landscape) • Tháng {month}
              </p>
            </div>
          </div>

          {/* Department Selection & Printing Options */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Bộ lọc phòng ban */}
            <div className="flex items-center gap-1.5 bg-slate-800/90 px-3 py-1.5 rounded-xl border border-slate-700">
              <Building className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="text-xs text-slate-300 font-medium whitespace-nowrap">In theo phòng ban:</span>
              <select
                value={selectedDepartmentId}
                onChange={(e) => setSelectedDepartmentId(e.target.value)}
                className="bg-slate-950 text-white text-xs border border-slate-600 rounded-lg px-2.5 py-1 focus:outline-hidden focus:ring-1 focus:ring-emerald-500 cursor-pointer font-medium"
              >
                <option value="all">Tất cả phòng ban ({payrolls.length} người)</option>
                {(settings?.departments || []).map(dep => {
                  const count = (payrolls || []).filter(p => empMap.get(p.employeeId)?.departmentId === dep.id).length;
                  return (
                    <option key={dep.id} value={dep.id}>
                      {dep.name} ({count} người)
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Chế độ in khi chọn Tất cả phòng ban */}
            {selectedDepartmentId === 'all' && (
              <div className="flex items-center gap-1 bg-slate-800/90 p-1 rounded-xl border border-slate-700 text-xs">
                <button
                  type="button"
                  onClick={() => setPrintMode('single')}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                    printMode === 'single'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-300 hover:text-white hover:bg-slate-700'
                  }`}
                  title="In gộp toàn bộ công ty vào 1 bảng chung"
                >
                  Gộp toàn công ty
                </button>
                <button
                  type="button"
                  onClick={() => setPrintMode('all_by_department')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                    printMode === 'all_by_department'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-300 hover:text-white hover:bg-slate-700'
                  }`}
                  title="In tách riêng từng phòng ban, tự động ngắt trang A4 cho mỗi phòng"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Tách riêng từng phòng (Tách trang)</span>
                </button>
              </div>
            )}

            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-semibold shadow-xs cursor-pointer transition-colors"
            >
              <Printer className="w-4 h-4" />
              <span>In Ngay / Lưu PDF</span>
            </button>

            <button
              onClick={handleExportExcel}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-sm font-semibold shadow-xs cursor-pointer transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Kết Xuất Excel</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Payroll Sheet Container */}
        <div className="p-6 overflow-x-auto overflow-y-auto bg-slate-100 text-slate-800 text-[11px] print:p-0 print:bg-white flex-1">
          <style dangerouslySetInnerHTML={{ __html: `
            @media print {
              @page {
                size: A4 landscape;
                margin: 8mm;
              }
              body * {
                visibility: hidden;
              }
              #payroll-print-container, #payroll-print-container * {
                visibility: visible;
              }
              #payroll-print-container {
                position: absolute;
                left: 0;
                top: 0;
                width: 100%;
              }
              .page-break {
                page-break-after: always;
                break-after: page;
              }
            }
          `}} />

          <div id="payroll-print-container" className="space-y-6 print:space-y-0">
            {selectedDepartmentId !== 'all' ? (
              // In 1 phòng ban cụ thể đã chọn
              renderPayrollSheet(currentPayrolls, selectedDept, false)
            ) : printMode === 'all_by_department' ? (
              // In tách riêng từng phòng ban (mỗi phòng 1 bảng, tự động tách trang A4)
              departmentsWithPayrolls.map((deptItem, idx) =>
                renderPayrollSheet(
                  deptItem.payrolls,
                  deptItem.department,
                  idx < departmentsWithPayrolls.length - 1
                )
              )
            ) : (
              // In gộp toàn công ty
              renderPayrollSheet(payrolls, undefined, false)
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
