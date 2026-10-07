import React, { useState } from 'react';
import { Printer, X, ShieldCheck, Download } from 'lucide-react';
import { Employee, InsuranceRecord, SystemSettings } from '../types';
import { formatVND } from '../utils/payrollCalculator';
import * as XLSX from 'xlsx';

export interface AnnualEmployeeInsuranceData {
  employee: Employee;
  insurance: InsuranceRecord | null;
  departmentName: string;
  positionName: string;
  isParticipatingYear: boolean;
  activeMonthsCount: number;
  monthlySalary: { [month: number]: number };
  monthlyEmpTotal: { [month: number]: number };
  monthlyErTotal: { [month: number]: number };
  monthlyGrandTotal: { [month: number]: number };
  
  totalInsuranceSalaryYear: number;
  totalSocEmpYear: number;
  totalMedEmpYear: number;
  totalUnempEmpYear: number;
  totalEmpYear: number;
  
  totalSocErYear: number;
  totalMedErYear: number;
  totalUnempErYear: number;
  totalUnionErYear: number;
  totalErYear: number;
  
  totalContributionYear: number;
  avgMonthlyContribution: number;
}

interface PrintAnnualInsuranceModalProps {
  isOpen: boolean;
  onClose: () => void;
  annualData: AnnualEmployeeInsuranceData[];
  year: number;
  settings: SystemSettings;
}

export const PrintAnnualInsuranceModal: React.FC<PrintAnnualInsuranceModalProps> = ({
  isOpen,
  onClose,
  annualData,
  year,
  settings,
}) => {
  const [printViewMode, setPrintViewMode] = useState<'12_months' | 'funds_breakdown'>('12_months');

  // Tập hợp các số CCCD bị trùng lặp - Phải gọi hook TRƯỚC mọi return để tuân thủ React Rules of Hooks
  const duplicateIdCards = React.useMemo(() => {
    const counts = new Map<string, number>();
    annualData.forEach(d => {
      const cccd = (d.employee?.idCardNumber || '').trim();
      if (cccd) counts.set(cccd, (counts.get(cccd) || 0) + 1);
    });
    const dupSet = new Set<string>();
    counts.forEach((cnt, cccd) => {
      if (cnt > 1) dupSet.add(cccd);
    });
    return dupSet;
  }, [annualData]);

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  // Grand totals across company
  const grandSalaryAll = annualData.reduce((sum, d) => sum + (d.totalInsuranceSalaryYear || 0), 0);
  const grandEmpSocAll = annualData.reduce((sum, d) => sum + (d.totalSocEmpYear || 0), 0);
  const grandEmpMedAll = annualData.reduce((sum, d) => sum + (d.totalMedEmpYear || 0), 0);
  const grandEmpUnempAll = annualData.reduce((sum, d) => sum + (d.totalUnempEmpYear || 0), 0);
  const grandEmpTotalAll = annualData.reduce((sum, d) => sum + (d.totalEmpYear || 0), 0);

  const grandErSocAll = annualData.reduce((sum, d) => sum + (d.totalSocErYear || 0), 0);
  const grandErMedAll = annualData.reduce((sum, d) => sum + (d.totalMedErYear || 0), 0);
  const grandErUnempAll = annualData.reduce((sum, d) => sum + (d.totalUnempErYear || 0), 0);
  const grandErUnionAll = annualData.reduce((sum, d) => sum + (d.totalUnionErYear || 0), 0);
  const grandErTotalAll = annualData.reduce((sum, d) => sum + (d.totalErYear || 0), 0);

  const grandTotalAll = annualData.reduce((sum, d) => sum + (d.totalContributionYear || 0), 0);
  const participatingCount = annualData.filter(d => d.isParticipatingYear).length;

  // Monthly totals across company (Tổng nộp từng tháng)
  const monthlyTotals: { [month: number]: number } = {};
  const monthlySalaryTotals: { [month: number]: number } = {};
  for (let m = 1; m <= 12; m++) {
    monthlyTotals[m] = annualData.reduce((sum, d) => sum + (d.monthlyGrandTotal?.[m] || 0), 0);
    monthlySalaryTotals[m] = annualData.reduce((sum, d) => sum + (d.monthlySalary?.[m] || 0), 0);
  }

  const empTotalRate = Number(((settings.socialInsRateEmployee || 8) + (settings.healthInsRateEmployee || 1.5) + (settings.unemploymentInsRateEmployee || 1)).toFixed(2));
  const erTotalRate = Number(((settings.socialInsRateEmployer || 17.5) + (settings.healthInsRateEmployer || 3) + (settings.unemploymentInsRateEmployer || 1) + (settings.tradeUnionRateEmployer || 2)).toFixed(2));
  const totalAllRate = Number((empTotalRate + erTotalRate).toFixed(2));

  const handleExportExcel = () => {
    // Sheet 1: 12 Tháng trích nộp
    const sheet1Rows = [
      [settings.companyName.toUpperCase()],
      [`Địa chỉ: ${settings.address}`],
      [`Mã số thuế: ${settings.taxCode} | Điện thoại: ${settings.phoneNumber}`],
      [],
      [`BÁO CÁO TỔNG HỢP TRÍCH NỘP BẢO HIỂM XÃ HỘI CẢ NĂM ${year} (THEO 12 THÁNG)`],
      [`Tỷ lệ chuẩn: NLĐ ${empTotalRate}% • Doanh nghiệp ${erTotalRate}% (Tổng ${totalAllRate}%)`],
      [],
      [
        'STT',
        'Mã NV',
        'Số CCCD',
        'Họ và Tên',
        'Phòng Ban',
        'T1',
        'T2',
        'T3',
        'T4',
        'T5',
        'T6',
        'T7',
        'T8',
        'T9',
        'T10',
        'T11',
        'T12',
        'Tổng Quỹ Lương Năm',
        'Tổng NLĐ Đóng',
        'Tổng DN Đóng',
        'Tổng Nộp Cả Năm',
        'Bình Quân / Tháng'
      ],
      ...annualData.map((row, idx) => [
        idx + 1,
        row.employee.employeeCode,
        row.employee.idCardNumber || '',
        row.employee.fullName,
        row.departmentName,
        row.monthlyGrandTotal[1] || 0,
        row.monthlyGrandTotal[2] || 0,
        row.monthlyGrandTotal[3] || 0,
        row.monthlyGrandTotal[4] || 0,
        row.monthlyGrandTotal[5] || 0,
        row.monthlyGrandTotal[6] || 0,
        row.monthlyGrandTotal[7] || 0,
        row.monthlyGrandTotal[8] || 0,
        row.monthlyGrandTotal[9] || 0,
        row.monthlyGrandTotal[10] || 0,
        row.monthlyGrandTotal[11] || 0,
        row.monthlyGrandTotal[12] || 0,
        row.totalInsuranceSalaryYear,
        row.totalEmpYear,
        row.totalErYear,
        row.totalContributionYear,
        Math.round(row.avgMonthlyContribution)
      ]),
      [
        'TỔNG CỘNG TOÀN CÔNG TY',
        '',
        '',
        '',
        '',
        monthlyTotals[1] || 0,
        monthlyTotals[2] || 0,
        monthlyTotals[3] || 0,
        monthlyTotals[4] || 0,
        monthlyTotals[5] || 0,
        monthlyTotals[6] || 0,
        monthlyTotals[7] || 0,
        monthlyTotals[8] || 0,
        monthlyTotals[9] || 0,
        monthlyTotals[10] || 0,
        monthlyTotals[11] || 0,
        monthlyTotals[12] || 0,
        grandSalaryAll,
        grandEmpTotalAll,
        grandErTotalAll,
        grandTotalAll,
        Math.round(grandTotalAll / 12)
      ],
      [],
      [],
      ['NGƯỜI LẬP BIỂU', '', '', 'KẾ TOÁN TRƯỞNG', '', '', '', '', '', '', '', '', '', '', 'GIÁM ĐỐC DOANH NGHIỆP'],
      ['(Ký, ghi rõ họ tên)', '', '', '(Ký, ghi rõ họ tên)', '', '', '', '', '', '', '', '', '', '', '(Ký, đóng dấu, ghi rõ họ tên)'],
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
        '',
        '',
        settings.directorName || 'Nguyễn Văn Thành'
      ]
    ];

    // Sheet 2: Chi tiết các quỹ
    const sheet2Rows = [
      [settings.companyName.toUpperCase()],
      [`Địa chỉ: ${settings.address}`],
      [`Mã số thuế: ${settings.taxCode} | Điện thoại: ${settings.phoneNumber}`],
      [],
      [`BÁO CÁO CHI TIẾT CÁC QUỸ BẢO HIỂM XÃ HỘI CẢ NĂM ${year}`],
      [],
      [
        'STT',
        'Mã NV',
        'Số CCCD',
        'Họ và Tên',
        'Phòng Ban',
        'Tổng Quỹ Lương Năm',
        `BHXH NLĐ (${settings.socialInsRateEmployee || 8}%)`,
        `BHYT NLĐ (${settings.healthInsRateEmployee || 1.5}%)`,
        `BHTN NLĐ (${settings.unemploymentInsRateEmployee || 1}%)`,
        'Tổng NLĐ Trích Nộp',
        `BHXH DN (${settings.socialInsRateEmployer || 17.5}%)`,
        `BHYT DN (${settings.healthInsRateEmployer || 3}%)`,
        `BHTN DN (${settings.unemploymentInsRateEmployer || 1}%)`,
        `KPCĐ DN (${settings.tradeUnionRateEmployer || 2}%)`,
        'Tổng DN Đóng',
        'TỔNG CỘNG NỘP CƠ QUAN BHXH'
      ],
      ...annualData.map((row, idx) => [
        idx + 1,
        row.employee.employeeCode,
        row.employee.idCardNumber || '',
        row.employee.fullName,
        row.departmentName,
        row.totalInsuranceSalaryYear,
        row.totalSocEmpYear,
        row.totalMedEmpYear,
        row.totalUnempEmpYear,
        row.totalEmpYear,
        row.totalSocErYear,
        row.totalMedErYear,
        row.totalUnempErYear,
        row.totalUnionErYear,
        row.totalErYear,
        row.totalContributionYear
      ]),
      [
        'TỔNG CỘNG TOÀN CÔNG TY',
        '',
        '',
        '',
        '',
        grandSalaryAll,
        grandEmpSocAll,
        grandEmpMedAll,
        grandEmpUnempAll,
        grandEmpTotalAll,
        grandErSocAll,
        grandErMedAll,
        grandErUnempAll,
        grandErUnionAll,
        grandErTotalAll,
        grandTotalAll
      ]
    ];

    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.aoa_to_sheet(sheet1Rows);
    const ws2 = XLSX.utils.aoa_to_sheet(sheet2Rows);
    XLSX.utils.book_append_sheet(wb, ws1, `BHXH_12_Thang_${year}`);
    XLSX.utils.book_append_sheet(wb, ws2, `Chi_Tiet_Cac_Quy_${year}`);
    XLSX.writeFile(wb, `Bao_Cao_Trich_Nop_BHXH_Ca_Nam_${year}.xlsx`);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 print:p-0 print:bg-white">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-[98vw] max-h-[96vh] flex flex-col overflow-hidden print:border-none print:shadow-none print:max-h-none print:max-w-none">
        {/* Header Modal Bar (Hidden on print) */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-slate-200 bg-slate-50 rounded-t-2xl print:hidden shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-purple-100 text-purple-700 rounded-lg">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-base">Xem Trước Bản In: Báo Cáo Đóng BHXH Cả Năm {year}</h3>
              <p className="text-xs text-slate-500">Khổ giấy A4 Ngang (Landscape) • Tổng hợp 12 tháng trích nộp BHXH, BHYT, BHTN & KPCĐ</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* View Mode Toggle */}
            <div className="flex items-center bg-slate-200 p-0.5 rounded-lg text-xs font-semibold">
              <button
                type="button"
                onClick={() => setPrintViewMode('12_months')}
                className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                  printViewMode === '12_months' 
                    ? 'bg-white text-purple-800 shadow-xs' 
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                12 Tháng Nộp
              </button>
              <button
                type="button"
                onClick={() => setPrintViewMode('funds_breakdown')}
                className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                  printViewMode === 'funds_breakdown' 
                    ? 'bg-white text-purple-800 shadow-xs' 
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Chi Tiết Các Quỹ
              </button>
            </div>

            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold text-sm rounded-xl shadow-md shadow-purple-600/20 transition-all cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>In Ngay / Lưu PDF</span>
            </button>
            <button
              onClick={handleExportExcel}
              className="flex items-center gap-2 px-4 py-2 bg-purple-800 hover:bg-purple-900 text-white font-semibold text-sm rounded-xl shadow-md shadow-purple-900/20 transition-all cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Kết Xuất Excel</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Paper Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-100 print:bg-white print:p-0">
          <style dangerouslySetInnerHTML={{ __html: `
            @media print {
              @page {
                size: A4 landscape;
                margin: 6mm 4mm;
              }
              body {
                visibility: hidden;
                background: white !important;
              }
              #annual-insurance-print-sheet, #annual-insurance-print-sheet * {
                visibility: visible;
              }
              #annual-insurance-print-sheet {
                position: absolute;
                left: 0;
                top: 0;
                width: 100% !important;
                max-width: 100% !important;
                display: block !important;
                margin: 0 !important;
                padding: 0 !important;
                border: none !important;
                box-shadow: none !important;
                background: white !important;
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
                padding: 2px 1px !important;
                min-width: 0 !important;
              }
              .print\\:hidden {
                display: none !important;
              }
            }
          `}} />

          <div id="annual-insurance-print-sheet" className="bg-white mx-auto p-6 rounded-xl shadow-xs print:shadow-none print:p-0 max-w-[1550px] print:max-w-none print:w-full border border-slate-200 print:border-none text-slate-900 text-[10px] print:text-[8.5px]">
            {/* Enterprise Header */}
            <div className="flex justify-between items-start border-b border-slate-300 pb-3 mb-3">
              <div>
                <div className="font-black text-xs uppercase tracking-wide text-slate-900">
                  {settings.companyName}
                </div>
                <div className="text-[11px] text-slate-600 mt-0.5">Địa chỉ: {settings.address}</div>
                <div className="text-[11px] text-slate-600">
                  Mã số thuế: <strong className="font-mono text-slate-900">{settings.taxCode}</strong>
                  {settings.phoneNumber && ` | Điện thoại: ${settings.phoneNumber}`}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs font-semibold text-slate-800">Báo cáo: Cả năm {year}</div>
                <div className="text-[10px] text-purple-800 font-bold mt-0.5">
                  Tỷ lệ chuẩn: NLĐ {empTotalRate}% • Doanh nghiệp {erTotalRate}% (Tổng {totalAllRate}%)
                </div>
              </div>
            </div>

            {/* Title */}
            <div className="text-center my-3">
              <h1 className="text-base sm:text-lg font-black uppercase tracking-wide text-slate-900">
                BÁO CÁO TỔNG HỢP TRÍCH NỘP BẢO HIỂM XÃ HỘI CẢ NĂM {year}
              </h1>
              <p className="text-[11px] text-slate-600 italic mt-0.5">
                (Theo dõi tổng quỹ lương căn cứ đóng, số tiền NLĐ trích nộp và Doanh nghiệp đóng BHXH, BHYT, BHTN & KPCĐ 12 tháng)
              </p>
            </div>

            {/* Highlights */}
            <div className="grid grid-cols-4 gap-2 mb-3 p-2 bg-slate-50 border border-slate-300 rounded text-[10px]">
              <div>
                <span className="text-slate-500">Số lao động tham gia:</span>{' '}
                <strong className="text-slate-900 font-bold">{participatingCount} / {annualData.length} người</strong>
              </div>
              <div>
                <span className="text-slate-500">Tổng quỹ lương đóng năm:</span>{' '}
                <strong className="text-slate-900 font-mono font-bold">{formatVND(grandSalaryAll)}</strong>
              </div>
              <div>
                <span className="text-red-700 font-medium">Tổng NLĐ trích nộp:</span>{' '}
                <strong className="text-red-700 font-mono font-bold">{formatVND(grandEmpTotalAll)}</strong>
              </div>
              <div>
                <span className="text-purple-900 font-bold">Tổng nộp cơ quan BHXH:</span>{' '}
                <strong className="text-purple-900 font-mono font-black">{formatVND(grandTotalAll)}</strong>
              </div>
            </div>

            {/* Table: View Mode 1 - 12 Months Contributions */}
            {printViewMode === '12_months' && (
              <div className="overflow-x-auto my-2">
                <table className="w-full border-collapse border border-slate-400 text-center">
                  <thead>
                    <tr className="bg-slate-100 font-bold text-slate-800">
                      <th className="border border-slate-400 p-1 w-7" rowSpan={2}>STT</th>
                      <th className="border border-slate-400 p-1 w-16" rowSpan={2}>Mã NV</th>
                      <th className="border border-slate-400 p-1 text-center min-w-[85px]" rowSpan={2}>Số CCCD</th>
                      <th className="border border-slate-400 p-1 text-left min-w-[120px]" rowSpan={2}>Họ và Tên</th>
                      <th className="border border-slate-400 p-1 text-left min-w-[90px]" rowSpan={2}>Phòng Ban</th>
                      <th className="border border-slate-400 p-1 text-center" colSpan={12}>
                        Số Tiền Trích Nộp BHXH Từng Tháng Trong Năm {year} (VNĐ)
                      </th>
                      <th className="border border-slate-400 p-1 min-w-[90px] bg-slate-50" rowSpan={2}>Tổng Quỹ Lương Năm</th>
                      <th className="border border-slate-400 p-1 min-w-[80px] bg-red-50 text-red-950" rowSpan={2}>Tổng NLĐ Đóng</th>
                      <th className="border border-slate-400 p-1 min-w-[80px] bg-blue-50 text-blue-950" rowSpan={2}>Tổng DN Đóng</th>
                      <th className="border border-slate-400 p-1 min-w-[95px] bg-purple-50 text-purple-950 font-black" rowSpan={2}>
                        Tổng Nộp Cả Năm
                      </th>
                      <th className="border border-slate-400 p-1 min-w-[75px] bg-purple-50 text-purple-950" rowSpan={2}>
                        Bình Quân / Tháng
                      </th>
                    </tr>
                    <tr className="bg-slate-50 font-semibold text-slate-700 text-[10px]">
                      <th className="border border-slate-400 p-0.5 w-14 print:w-auto">T1</th>
                      <th className="border border-slate-400 p-0.5 w-14 print:w-auto">T2</th>
                      <th className="border border-slate-400 p-0.5 w-14 print:w-auto">T3</th>
                      <th className="border border-slate-400 p-0.5 w-14 print:w-auto">T4</th>
                      <th className="border border-slate-400 p-0.5 w-14 print:w-auto">T5</th>
                      <th className="border border-slate-400 p-0.5 w-14 print:w-auto">T6</th>
                      <th className="border border-slate-400 p-0.5 w-14 print:w-auto">T7</th>
                      <th className="border border-slate-400 p-0.5 w-14 print:w-auto">T8</th>
                      <th className="border border-slate-400 p-0.5 w-14 print:w-auto">T9</th>
                      <th className="border border-slate-400 p-0.5 w-14 print:w-auto">T10</th>
                      <th className="border border-slate-400 p-0.5 w-14 print:w-auto">T11</th>
                      <th className="border border-slate-400 p-0.5 w-14 print:w-auto">T12</th>
                    </tr>
                  </thead>
                  <tbody>
                    {annualData.length === 0 ? (
                      <tr>
                        <td colSpan={22} className="border border-slate-400 p-8 text-center text-slate-500 font-medium">
                          Chưa có dữ liệu trích nộp BHXH năm {year}. Hãy kiểm tra danh sách nhân sự hoặc bộ lọc phòng ban!
                        </td>
                      </tr>
                    ) : (
                      annualData.map((row, idx) => {
                      const isDuplicateCccd = row.employee.idCardNumber ? duplicateIdCards.has(row.employee.idCardNumber.trim()) : false;

                      return (
                        <tr key={row.employee.id} className="hover:bg-slate-50">
                          <td className="border border-slate-400 p-1">{idx + 1}</td>
                          <td className="border border-slate-400 p-1 font-mono font-bold text-slate-800">{row.employee.employeeCode}</td>
                          <td className="border border-slate-400 p-1 font-mono text-center">
                            <div className="font-semibold">{row.employee.idCardNumber || '—'}</div>
                            {isDuplicateCccd && (
                              <span className="text-[8px] font-bold text-amber-800 bg-amber-100 px-1 py-0.2 rounded block mt-0.5 print:border print:border-amber-400">
                                *Trùng CCCD
                              </span>
                            )}
                          </td>
                          <td className="border border-slate-400 p-1 text-left font-bold text-slate-900">{row.employee.fullName}</td>
                          <td className="border border-slate-400 p-1 text-left text-slate-700">{row.departmentName}</td>

                          {/* 12 Months */}
                          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => {
                            const val = row.monthlyGrandTotal[m];
                            return (
                              <td key={m} className="border border-slate-400 p-1 font-mono text-right text-[10px]">
                                {val ? formatVND(val) : <span className="text-slate-300">-</span>}
                              </td>
                            );
                          })}

                          <td className="border border-slate-400 p-1 font-mono text-right text-slate-800">
                            {formatVND(row.totalInsuranceSalaryYear)}
                          </td>
                          <td className="border border-slate-400 p-1 font-mono text-right font-semibold text-red-700">
                            {formatVND(row.totalEmpYear)}
                          </td>
                          <td className="border border-slate-400 p-1 font-mono text-right text-blue-700">
                            {formatVND(row.totalErYear)}
                          </td>
                          <td className="border border-slate-400 p-1 font-mono text-right font-black text-purple-900 bg-purple-50/40">
                            {formatVND(row.totalContributionYear)}
                          </td>
                          <td className="border border-slate-400 p-1 font-mono text-right font-semibold text-slate-800">
                            {formatVND(Math.round(row.avgMonthlyContribution))}
                          </td>
                        </tr>
                      );
                    }))}

                    {/* Grand Total Row */}
                    <tr className="bg-slate-200 font-bold text-slate-900">
                      <td colSpan={5} className="border border-slate-400 p-1 text-center uppercase tracking-wide">
                        TỔNG CỘNG TOÀN CÔNG TY
                      </td>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => (
                        <td key={m} className="border border-slate-400 p-1 font-mono text-right text-[10px]">
                          {monthlyTotals[m] ? formatVND(monthlyTotals[m]) : '-'}
                        </td>
                      ))}
                      <td className="border border-slate-400 p-1 font-mono text-right font-black">
                        {formatVND(grandSalaryAll)}
                      </td>
                      <td className="border border-slate-400 p-1 font-mono text-right font-black text-red-700">
                        {formatVND(grandEmpTotalAll)}
                      </td>
                      <td className="border border-slate-400 p-1 font-mono text-right font-black text-blue-700">
                        {formatVND(grandErTotalAll)}
                      </td>
                      <td className="border border-slate-400 p-1 font-mono text-right font-black text-purple-950 bg-purple-100">
                        {formatVND(grandTotalAll)}
                      </td>
                      <td className="border border-slate-400 p-1 font-mono text-right font-bold">
                        {formatVND(Math.round(grandTotalAll / 12))}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* Table: View Mode 2 - Detailed Funds Breakdown */}
            {printViewMode === 'funds_breakdown' && (
              <div className="overflow-x-auto my-2">
                <table className="w-full border-collapse border border-slate-400 text-center">
                  <thead>
                    <tr className="bg-slate-100 font-bold text-slate-900">
                      <th rowSpan={2} className="border border-slate-400 p-1 w-7">STT</th>
                      <th rowSpan={2} className="border border-slate-400 p-1 min-w-[55px]">Mã NV</th>
                      <th rowSpan={2} className="border border-slate-400 p-1 min-w-[85px] text-center">Số CCCD</th>
                      <th rowSpan={2} className="border border-slate-400 p-1 text-left min-w-[120px]">Họ và Tên</th>
                      <th rowSpan={2} className="border border-slate-400 p-1 text-left min-w-[90px]">Phòng Ban</th>
                      <th rowSpan={2} className="border border-slate-400 p-1 w-12 text-center">Số Tháng</th>
                      <th rowSpan={2} className="border border-slate-400 p-1 text-right min-w-[90px] bg-slate-200">
                        Tổng Quỹ Lương Năm
                      </th>
                      <th colSpan={4} className="border border-slate-400 p-0.5 bg-red-50 text-red-950">
                        Người Lao Động Đóng Cả Năm
                      </th>
                      <th colSpan={5} className="border border-slate-400 p-0.5 bg-blue-50 text-blue-950">
                        Doanh Nghiệp Đóng Cả Năm
                      </th>
                      <th rowSpan={2} className="border border-slate-400 p-1 min-w-[95px] bg-purple-100 text-purple-950 font-black">
                        Tổng Nộp Cả Năm
                      </th>
                    </tr>
                    <tr className="text-[9px]">
                      {/* Emp */}
                      <th className="border border-slate-400 p-0.5 bg-red-50 text-red-950">BHXH {settings.socialInsRateEmployee}%</th>
                      <th className="border border-slate-400 p-0.5 bg-red-50 text-red-950">BHYT {settings.healthInsRateEmployee}%</th>
                      <th className="border border-slate-400 p-0.5 bg-red-50 text-red-950">BHTN {settings.unemploymentInsRateEmployee}%</th>
                      <th className="border border-slate-400 p-0.5 bg-red-100 text-red-950 font-black">Cộng NLĐ</th>
                      {/* Er */}
                      <th className="border border-slate-400 p-0.5 bg-blue-50 text-blue-950">BHXH {settings.socialInsRateEmployer}%</th>
                      <th className="border border-slate-400 p-0.5 bg-blue-50 text-blue-950">BHYT {settings.healthInsRateEmployer}%</th>
                      <th className="border border-slate-400 p-0.5 bg-blue-50 text-blue-950">BHTN {settings.unemploymentInsRateEmployer}%</th>
                      <th className="border border-slate-400 p-0.5 bg-blue-50 text-blue-950">KPCĐ {settings.tradeUnionRateEmployer}%</th>
                      <th className="border border-slate-400 p-0.5 bg-blue-100 text-blue-950 font-black">Cộng DN</th>
                    </tr>
                  </thead>
                  <tbody>
                    {annualData.length === 0 ? (
                      <tr>
                        <td colSpan={17} className="border border-slate-400 p-8 text-center text-slate-500 font-medium">
                          Chưa có dữ liệu trích nộp BHXH năm {year}. Hãy kiểm tra danh sách nhân sự hoặc bộ lọc phòng ban!
                        </td>
                      </tr>
                    ) : (
                      annualData.map((row, idx) => {
                      const isDuplicateCccd = row.employee.idCardNumber ? duplicateIdCards.has(row.employee.idCardNumber.trim()) : false;

                      return (
                        <tr key={row.employee.id} className="hover:bg-slate-50">
                          <td className="border border-slate-400 p-0.5">{idx + 1}</td>
                          <td className="border border-slate-400 p-0.5 font-mono font-semibold">{row.employee.employeeCode}</td>
                          <td className="border border-slate-400 p-0.5 font-mono text-center">
                            <div>{row.employee.idCardNumber || '-'}</div>
                            {isDuplicateCccd && (
                              <span className="text-[7px] font-bold text-amber-800 bg-amber-100 px-1 py-0.2 rounded block mt-0.5 print:border print:border-amber-400">
                                *Trùng CCCD
                              </span>
                            )}
                          </td>
                          <td className="border border-slate-400 p-0.5 text-left font-bold text-slate-900 truncate">{row.employee.fullName}</td>
                          <td className="border border-slate-400 p-0.5 text-left text-slate-600 truncate">{row.departmentName}</td>
                          <td className="border border-slate-400 p-0.5 font-mono text-center">{row.activeMonthsCount}</td>
                          <td className="border border-slate-400 p-0.5 text-right font-mono font-semibold bg-slate-50">
                            {formatVND(row.totalInsuranceSalaryYear)}
                          </td>

                          {/* Emp */}
                          <td className="border border-slate-400 p-0.5 text-right font-mono">{formatVND(row.totalSocEmpYear)}</td>
                          <td className="border border-slate-400 p-0.5 text-right font-mono">{formatVND(row.totalMedEmpYear)}</td>
                          <td className="border border-slate-400 p-0.5 text-right font-mono">{formatVND(row.totalUnempEmpYear)}</td>
                          <td className="border border-slate-400 p-0.5 text-right font-mono font-bold text-red-700 bg-red-50/50">
                            {formatVND(row.totalEmpYear)}
                          </td>

                          {/* Er */}
                          <td className="border border-slate-400 p-0.5 text-right font-mono">{formatVND(row.totalSocErYear)}</td>
                          <td className="border border-slate-400 p-0.5 text-right font-mono">{formatVND(row.totalMedErYear)}</td>
                          <td className="border border-slate-400 p-0.5 text-right font-mono">{formatVND(row.totalUnempErYear)}</td>
                          <td className="border border-slate-400 p-0.5 text-right font-mono">{formatVND(row.totalUnionErYear)}</td>
                          <td className="border border-slate-400 p-0.5 text-right font-mono font-bold text-blue-800 bg-blue-50/50">
                            {formatVND(row.totalErYear)}
                          </td>

                          {/* Total */}
                          <td className="border border-slate-400 p-0.5 text-right font-mono font-black text-purple-900 bg-purple-50">
                            {formatVND(row.totalContributionYear)}
                          </td>
                        </tr>
                      );
                    }))}

                    {/* Summary row */}
                    <tr className="bg-slate-200 font-bold text-slate-900">
                      <td colSpan={6} className="border border-slate-400 p-1 text-center uppercase">
                        TỔNG CỘNG ({participatingCount} người tham gia)
                      </td>
                      <td className="border border-slate-400 p-1 text-right font-mono font-black">
                        {formatVND(grandSalaryAll)}
                      </td>
                      <td className="border border-slate-400 p-1 text-right font-mono">{formatVND(grandEmpSocAll)}</td>
                      <td className="border border-slate-400 p-1 text-right font-mono">{formatVND(grandEmpMedAll)}</td>
                      <td className="border border-slate-400 p-1 text-right font-mono">{formatVND(grandEmpUnempAll)}</td>
                      <td className="border border-slate-400 p-1 text-right font-mono font-black text-red-700 bg-red-100">
                        {formatVND(grandEmpTotalAll)}
                      </td>

                      <td className="border border-slate-400 p-1 text-right font-mono">{formatVND(grandErSocAll)}</td>
                      <td className="border border-slate-400 p-1 text-right font-mono">{formatVND(grandErMedAll)}</td>
                      <td className="border border-slate-400 p-1 text-right font-mono">{formatVND(grandErUnempAll)}</td>
                      <td className="border border-slate-400 p-1 text-right font-mono">{formatVND(grandErUnionAll)}</td>
                      <td className="border border-slate-400 p-1 text-right font-mono font-black text-blue-800 bg-blue-100">
                        {formatVND(grandErTotalAll)}
                      </td>

                      <td className="border border-slate-400 p-1 text-right font-mono font-black text-purple-900 bg-purple-200">
                        {formatVND(grandTotalAll)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* Signature Area */}
            <div className="grid grid-cols-3 gap-6 text-center mt-6 pt-4 text-xs font-semibold print:text-[9px]">
              <div>
                <p className="uppercase text-slate-800 font-bold">Người Lập Biểu</p>
                <p className="text-[10px] text-slate-500 italic mb-10">(Ký, ghi rõ họ tên)</p>
                <p className="text-slate-900 font-bold text-xs">{settings.reportPreparerName || 'Phạm Hồng Phúc'}</p>
                <p className="text-slate-500 font-medium text-[10px]">Chuyên viên Nhân sự / BHXH</p>
              </div>
              <div>
                <p className="uppercase text-slate-800 font-bold">Kế Toán Trưởng</p>
                <p className="text-[10px] text-slate-500 italic mb-10">(Ký, ghi rõ họ tên)</p>
                <p className="text-slate-900 font-bold text-xs">{settings.chiefAccountantName || 'Trần Thị Thu Hương'}</p>
                <p className="text-slate-500 font-medium text-[10px]">Kế toán trưởng</p>
              </div>
              <div>
                <p className="uppercase text-slate-800 font-bold">Giám Đốc Doanh Nghiệp</p>
                <p className="text-[10px] text-slate-500 italic mb-10">(Ký, đóng dấu, ghi rõ họ tên)</p>
                <p className="text-slate-900 font-bold text-xs">{settings.directorName || 'Nguyễn Văn Thành'}</p>
                <p className="text-slate-500 font-medium text-[10px]">Đại diện theo pháp luật</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
