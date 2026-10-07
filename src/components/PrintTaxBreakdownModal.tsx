import React from 'react';
import { Printer, X, ShieldCheck, Download, Receipt } from 'lucide-react';
import { Employee, PayrollRecord, SystemSettings } from '../types';
import { formatVND } from '../utils/payrollCalculator';
import * as XLSX from 'xlsx';

interface PrintTaxBreakdownModalProps {
  isOpen: boolean;
  onClose: () => void;
  employees: Employee[];
  payrolls: PayrollRecord[];
  settings: SystemSettings;
  month: string;
}

export const PrintTaxBreakdownModal: React.FC<PrintTaxBreakdownModalProps> = ({
  isOpen,
  onClose,
  employees,
  payrolls,
  settings,
  month
}) => {
  if (!isOpen) return null;

  const empMap = new Map(employees.map(e => [e.id, e]));
  const depMap = new Map(settings.departments.map(d => [d.id, d.name]));

  // Tính toán các tổng số
  const mealCap = settings.taxExemptionRules?.mealExemptMonthlyCap ?? settings.monthlyMealFlatRate ?? 1200000;

  const totalMainSalary = payrolls.reduce((sum, p) => sum + p.mainSalary, 0);
  const totalOtTaxable = payrolls.reduce((sum, p) => sum + p.otPayTaxable, 0);
  const totalAllowancesTaxable = payrolls.reduce((sum, p) => sum + p.taxableAllowances, 0);
  const totalMealTaxable = payrolls.reduce((sum, p) => {
    const mealTaxable = p.mealTaxable !== undefined ? p.mealTaxable : Math.max(0, (p.mealAllowance || 0) - mealCap);
    return sum + mealTaxable;
  }, 0);
  const totalTaxableIncome = payrolls.reduce((sum, p) => sum + p.taxableIncome, 0);

  const totalOtExempt = payrolls.reduce((sum, p) => sum + p.otPayTaxExempt, 0);
  const totalMealExempt = payrolls.reduce((sum, p) => {
    const mealExempt = p.mealTaxExempt !== undefined ? p.mealTaxExempt : Math.min(p.mealAllowance || 0, mealCap);
    return sum + mealExempt;
  }, 0);
  const totalAllowancesExempt = payrolls.reduce((sum, p) => sum + p.taxExemptAllowances, 0);
  const totalExemptIncome = totalOtExempt + totalMealExempt + totalAllowancesExempt;
  const totalGrossIncome = payrolls.reduce((sum, p) => sum + p.grossIncome, 0);

  const handlePrint = () => {
    window.print();
  };

  const handleExportExcel = () => {
    const excelRows = [
      [settings.companyName.toUpperCase()],
      [`Địa chỉ: ${settings.address}`],
      [`Mã số thuế: ${settings.taxCode} | Điện thoại: ${settings.phoneNumber}`],
      [],
      [`BÁO CÁO BÓC TÁCH THU NHẬP CHỊU THUẾ & MIỄN THUẾ TNCN - THÁNG ${month}/${settings.currentYear}`],
      ['(Phân định chi tiết thành phần chịu thuế và miễn thuế theo Luật Thuế TNCN và Bộ luật Lao động)'],
      [],
      [
        `Tổng số lao động: ${payrolls.length} người`,
        `Tổng thu nhập Gross: ${formatVND(totalGrossIncome)}`,
        `Tổng thu nhập chịu thuế: ${formatVND(totalTaxableIncome)}`,
        `Tổng thu nhập miễn thuế: ${formatVND(totalExemptIncome)}`
      ],
      [],
      [
        'STT',
        'Mã NV',
        'Họ và Tên',
        'Phòng Ban',
        'Lương Thời Gian',
        'OT Tính Thuế (100%)',
        'Phụ Cấp Chịu Thuế',
        'Ăn Ca Tính Thuế',
        'TỔNG CHỊU THUẾ [1]',
        'OT Vượt Mức Miễn Thuế',
        'Ăn Ca Miễn Thuế',
        'Phụ Cấp Miễn Thuế',
        'TỔNG MIỄN THUẾ [2]',
        'TỔNG THU NHẬP GROSS [3]=[1]+[2]'
      ],
      ...payrolls.map((p, idx) => {
        const emp = empMap.get(p.employeeId);
        const mealTaxable = p.mealTaxable !== undefined ? p.mealTaxable : Math.max(0, (p.mealAllowance || 0) - mealCap);
        const mealExempt = p.mealTaxExempt !== undefined ? p.mealTaxExempt : Math.min(p.mealAllowance || 0, mealCap);
        const totalExempt = p.otPayTaxExempt + mealExempt + p.taxExemptAllowances;

        return [
          idx + 1,
          emp?.employeeCode || '',
          emp?.fullName || '',
          depMap.get(emp?.departmentId || '') || '',
          p.mainSalary,
          p.otPayTaxable,
          p.taxableAllowances,
          mealTaxable,
          p.taxableIncome,
          p.otPayTaxExempt,
          mealExempt,
          p.taxExemptAllowances,
          totalExempt,
          p.grossIncome
        ];
      }),
      [
        'TỔNG CỘNG TOÀN CÔNG TY',
        '',
        '',
        '',
        totalMainSalary,
        totalOtTaxable,
        totalAllowancesTaxable,
        totalMealTaxable,
        totalTaxableIncome,
        totalOtExempt,
        totalMealExempt,
        totalAllowancesExempt,
        totalExemptIncome,
        totalGrossIncome
      ],
      [],
      [],
      ['NGƯỜI LẬP BIỂU', '', '', 'KẾ TOÁN TRƯỞNG', '', '', '', '', '', '', '', 'NGƯỜI ĐẠI DIỆN PHÁP LUẬT'],
      ['(Ký, ghi rõ họ tên)', '', '', '(Ký, ghi rõ họ tên)', '', '', '', '', '', '', '', '(Ký, đóng dấu, ghi rõ họ tên)'],
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
        settings.directorName || 'Nguyễn Văn Thành'
      ]
    ];

    const ws = XLSX.utils.aoa_to_sheet(excelRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Boc_Tach_Thu_Nhap');
    XLSX.writeFile(wb, `Bao_Cao_Boc_Tach_Thu_Nhap_Thang_${month}_${settings.currentYear}.xlsx`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-2 overflow-y-auto print:p-0 print:m-0 print:bg-white print:static print:overflow-visible print:block print:h-auto print:max-h-none print:w-full print:inset-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-[96vw] max-h-[96vh] flex flex-col overflow-hidden print:border-none print:shadow-none print:rounded-none print:p-0 print:m-0 print:static print:overflow-visible print:block print:h-auto print:max-h-none print:w-full">
        {/* Top Control Bar (Hidden when printing) */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between print:hidden shrink-0">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="font-bold text-base">In Báo Cáo Bóc Tách Thu Nhập Chịu Thuế & Miễn Thuế</h3>
              <p className="text-xs text-slate-400">
                Khổ giấy A4 Ngang (Landscape) • Tháng {month}/{settings.currentYear} • {payrolls.length} nhân sự
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-semibold shadow-xs cursor-pointer transition-colors"
            >
              <Printer className="w-4 h-4" />
              <span>In Ngay / Lưu PDF</span>
            </button>
            <button
              onClick={handleExportExcel}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl text-sm font-semibold shadow-xs cursor-pointer transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Kết Xuất Excel</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 cursor-pointer transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Paper Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-slate-100 print:bg-white print:p-0 print:m-0 print:overflow-visible print:block print:h-auto print:max-h-none">
          <style dangerouslySetInnerHTML={{ __html: `
            @media print {
              @page {
                size: A4 landscape;
                margin: 6mm 4mm;
              }
              html, body {
                overflow: visible !important;
                height: auto !important;
                min-height: 100% !important;
                background: white !important;
                margin: 0 !important;
                padding: 0 !important;
              }
              body * {
                visibility: hidden;
              }
              #tax-breakdown-print-sheet, #tax-breakdown-print-sheet * {
                visibility: visible;
              }
              #tax-breakdown-print-sheet {
                position: absolute !important;
                left: 0 !important;
                top: 0 !important;
                width: 100% !important;
                max-width: 100% !important;
                display: block !important;
                margin: 0 !important;
                padding: 0 !important;
                border: none !important;
                box-shadow: none !important;
                background: white !important;
                overflow: visible !important;
              }
              table {
                font-size: 6.8pt !important;
                width: 100% !important;
                border-collapse: collapse !important;
              }
              thead {
                display: table-header-group !important;
              }
              tr {
                break-inside: avoid !important;
                page-break-inside: avoid !important;
              }
              th, td {
                padding: 2.5px 1.5px !important;
                min-width: 0 !important;
              }
              .print\\:hidden {
                display: none !important;
              }
            }
          `}} />

          <div id="tax-breakdown-print-sheet" className="bg-white mx-auto p-6 sm:p-8 rounded-xl shadow-xs print:shadow-none print:p-0 print:m-0 max-w-[1400px] print:max-w-none print:w-full border border-slate-200 print:border-none text-slate-900 print:text-[8.5px]">
            {/* Enterprise Header */}
            <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4 mb-4">
              <div>
                <h1 className="font-black text-sm uppercase tracking-wide text-slate-900">
                  {settings.companyName}
                </h1>
                <p className="text-xs text-slate-600 mt-0.5">Địa chỉ: {settings.address}</p>
                <div className="flex gap-4 text-xs text-slate-600 mt-0.5">
                  <p>Mã số thuế: <strong className="font-mono text-slate-900">{settings.taxCode}</strong></p>
                  <p>Điện thoại: {settings.phoneNumber}</p>
                </div>
              </div>
              <div className="text-right text-[11px] text-slate-600">
                <span className="font-semibold block text-slate-700">Kỳ tính thuế: Tháng {month} / {settings.currentYear}</span>
                <span className="text-[10px] text-emerald-800 font-bold block mt-0.5">Bóc tách thuế TNCN</span>
              </div>
            </div>

            {/* Document Title */}
            <div className="text-center my-4">
              <h2 className="text-xl font-black uppercase tracking-tight text-slate-900">
                BẢNG BÓC TÁCH THU NHẬP CHỊU THUẾ & THU NHẬP MIỄN THUẾ
              </h2>
              <p className="text-xs text-slate-600 font-medium italic mt-0.5">
                (Phân định chi tiết từng khoản thu nhập theo Luật Thuế TNCN và Bộ luật Lao động • Tháng {month}/{settings.currentYear})
              </p>
            </div>

            {/* Summary Highlights */}
            <div className="grid grid-cols-4 gap-3 my-4 p-3 bg-slate-50 border border-slate-300 rounded-lg text-xs print:text-[10px]">
              <div>
                <span className="text-slate-500 block">Số người lao động:</span>
                <strong className="text-slate-900 font-bold">{payrolls.length} người</strong>
              </div>
              <div>
                <span className="text-amber-800 block font-semibold">Tổng thu nhập chịu thuế:</span>
                <strong className="text-amber-900 font-mono font-bold">{formatVND(totalTaxableIncome)}</strong>
              </div>
              <div>
                <span className="text-emerald-700 block font-semibold">Tổng thu nhập miễn thuế:</span>
                <strong className="text-emerald-800 font-mono font-bold">{formatVND(totalExemptIncome)}</strong>
              </div>
              <div>
                <span className="text-slate-700 block font-semibold">Tổng thu nhập phát sinh (Gross):</span>
                <strong className="text-slate-900 font-mono font-black">{formatVND(totalGrossIncome)}</strong>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-slate-400 text-[10px] print:text-[8px] text-left">
                <thead>
                  <tr className="bg-slate-200 text-slate-900 text-center font-bold">
                    <th colSpan={4} className="border border-slate-400 p-1.5">I. THÔNG TIN NHÂN SỰ</th>
                    <th colSpan={5} className="border border-slate-400 p-1.5 bg-amber-100 text-amber-950">II. THU NHẬP CHỊU THUẾ</th>
                    <th colSpan={4} className="border border-slate-400 p-1.5 bg-emerald-100 text-emerald-950">III. THU NHẬP MIỄN THUẾ</th>
                    <th className="border border-slate-400 p-1.5 bg-slate-300 text-slate-950">IV. TỔNG TN</th>
                  </tr>
                  <tr className="bg-slate-100 text-slate-800 text-center font-semibold text-[9px] print:text-[7.5px]">
                    <th className="border border-slate-400 p-1 w-8">STT</th>
                    <th className="border border-slate-400 p-1 w-16">Mã NV</th>
                    <th className="border border-slate-400 p-1 min-w-[130px] text-left">Họ và Tên</th>
                    <th className="border border-slate-400 p-1 min-w-[90px] text-left">Phòng Ban</th>

                    {/* Chịu thuế */}
                    <th className="border border-slate-400 p-1 min-w-[75px] bg-amber-50 text-right">Lương Thời Gian</th>
                    <th className="border border-slate-400 p-1 min-w-[70px] bg-amber-50 text-right">OT Tính Thuế</th>
                    <th className="border border-slate-400 p-1 min-w-[70px] bg-amber-50 text-right">Phụ Cấp Chịu Thuế</th>
                    <th className="border border-slate-400 p-1 min-w-[70px] bg-amber-50 text-right">Ăn Ca Chịu Thuế</th>
                    <th className="border border-slate-400 p-1 min-w-[85px] bg-amber-100 font-bold text-amber-950 text-right">TỔNG CHỊU THUẾ</th>

                    {/* Miễn thuế */}
                    <th className="border border-slate-400 p-1 min-w-[75px] bg-emerald-50 text-right">OT Miễn Thuế</th>
                    <th className="border border-slate-400 p-1 min-w-[70px] bg-emerald-50 text-right">Ăn Ca Miễn Thuế</th>
                    <th className="border border-slate-400 p-1 min-w-[70px] bg-emerald-50 text-right">Phụ Cấp Miễn Thuế</th>
                    <th className="border border-slate-400 p-1 min-w-[85px] bg-emerald-100 font-bold text-emerald-950 text-right">TỔNG MIỄN THUẾ</th>

                    {/* Gross */}
                    <th className="border border-slate-400 p-1 min-w-[85px] font-bold bg-slate-200 text-right">TỔNG THU NHẬP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-300">
                  {payrolls.map((p, idx) => {
                    const emp = empMap.get(p.employeeId);
                    const mealTaxable = p.mealTaxable !== undefined ? p.mealTaxable : Math.max(0, (p.mealAllowance || 0) - mealCap);
                    const mealExempt = p.mealTaxExempt !== undefined ? p.mealTaxExempt : Math.min(p.mealAllowance || 0, mealCap);
                    const totalExempt = p.otPayTaxExempt + mealExempt + p.taxExemptAllowances;

                    return (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className="border border-slate-400 p-1 text-center font-mono">{idx + 1}</td>
                        <td className="border border-slate-400 p-1 font-mono font-bold text-slate-800">{emp?.employeeCode}</td>
                        <td className="border border-slate-400 p-1 text-left font-bold text-slate-900">{emp?.fullName}</td>
                        <td className="border border-slate-400 p-1 text-left text-slate-600">{depMap.get(emp?.departmentId || '') || '-'}</td>

                        <td className="border border-slate-400 p-1 text-right font-mono bg-amber-50/20">{formatVND(p.mainSalary)}</td>
                        <td className="border border-slate-400 p-1 text-right font-mono bg-amber-50/20">{formatVND(p.otPayTaxable)}</td>
                        <td className="border border-slate-400 p-1 text-right font-mono bg-amber-50/20">{formatVND(p.taxableAllowances)}</td>
                        <td className="border border-slate-400 p-1 text-right font-mono bg-amber-50/20">{formatVND(mealTaxable)}</td>
                        <td className="border border-slate-400 p-1 text-right font-mono font-bold text-amber-950 bg-amber-50/60">{formatVND(p.taxableIncome)}</td>

                        <td className="border border-slate-400 p-1 text-right font-mono bg-emerald-50/20 text-emerald-900">{formatVND(p.otPayTaxExempt)}</td>
                        <td className="border border-slate-400 p-1 text-right font-mono bg-emerald-50/20 text-emerald-900">{formatVND(mealExempt)}</td>
                        <td className="border border-slate-400 p-1 text-right font-mono bg-emerald-50/20 text-emerald-900">{formatVND(p.taxExemptAllowances)}</td>
                        <td className="border border-slate-400 p-1 text-right font-mono font-bold text-emerald-950 bg-emerald-50/60">{formatVND(totalExempt)}</td>

                        <td className="border border-slate-400 p-1 text-right font-mono font-black text-slate-900 bg-slate-50">{formatVND(p.grossIncome)}</td>
                      </tr>
                    );
                  })}

                  {/* Grand total row */}
                  <tr className="bg-slate-200 font-bold text-slate-900">
                    <td colSpan={4} className="border border-slate-400 p-1.5 text-center uppercase tracking-wider">
                      TỔNG CỘNG TOÀN CÔNG TY
                    </td>
                    <td className="border border-slate-400 p-1 text-right font-mono bg-amber-100/50">{formatVND(totalMainSalary)}</td>
                    <td className="border border-slate-400 p-1 text-right font-mono bg-amber-100/50">{formatVND(totalOtTaxable)}</td>
                    <td className="border border-slate-400 p-1 text-right font-mono bg-amber-100/50">{formatVND(totalAllowancesTaxable)}</td>
                    <td className="border border-slate-400 p-1 text-right font-mono bg-amber-100/50">{formatVND(totalMealTaxable)}</td>
                    <td className="border border-slate-400 p-1 text-right font-mono font-black text-amber-950 bg-amber-200/60">{formatVND(totalTaxableIncome)}</td>

                    <td className="border border-slate-400 p-1 text-right font-mono bg-emerald-100/50 text-emerald-950">{formatVND(totalOtExempt)}</td>
                    <td className="border border-slate-400 p-1 text-right font-mono bg-emerald-100/50 text-emerald-950">{formatVND(totalMealExempt)}</td>
                    <td className="border border-slate-400 p-1 text-right font-mono bg-emerald-100/50 text-emerald-950">{formatVND(totalAllowancesExempt)}</td>
                    <td className="border border-slate-400 p-1 text-right font-mono font-black text-emerald-950 bg-emerald-200/60">{formatVND(totalExemptIncome)}</td>

                    <td className="border border-slate-400 p-1 text-right font-mono font-black text-slate-950 bg-slate-300">{formatVND(totalGrossIncome)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Signatures */}
            <div className="grid grid-cols-3 gap-8 text-center text-xs mt-8 pt-4 border-t border-slate-300 break-inside-avoid">
              <div>
                <p className="font-bold uppercase text-slate-900">Người Lập Biểu</p>
                <p className="text-[10px] text-slate-500 italic mt-0.5">(Ký, ghi rõ họ tên)</p>
                <div className="h-16"></div>
                <p className="font-bold text-slate-800">{settings.reportPreparerName || 'Phạm Hồng Phúc'}</p>
              </div>
              <div>
                <p className="font-bold uppercase text-slate-900">Kế Toán Trưởng</p>
                <p className="text-[10px] text-slate-500 italic mt-0.5">(Ký, ghi rõ họ tên)</p>
                <div className="h-16"></div>
                <p className="font-bold text-slate-800">{settings.chiefAccountantName || 'Trần Thị Thu Hương'}</p>
              </div>
              <div>
                <p className="font-bold uppercase text-slate-900">Người đại diện pháp luật</p>
                <p className="text-[10px] text-slate-500 italic mt-0.5">(Ký, đóng dấu, ghi rõ họ tên)</p>
                <div className="h-16"></div>
                <p className="font-bold text-slate-800">{settings.directorName || 'Nguyễn Văn Thành'}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
