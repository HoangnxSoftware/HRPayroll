import React, { useState } from 'react';
import { Printer, X, CalendarCheck, Clock, Utensils } from 'lucide-react';
import { Employee, TimekeepingRecord, SystemSettings, MealRegistration } from '../types';
import { isEmployeeActiveInMonth } from '../utils/payrollCalculator';

interface PrintTimekeepingModalProps {
  isOpen: boolean;
  onClose: () => void;
  timekeepings: TimekeepingRecord[];
  employees: Employee[];
  settings: SystemSettings;
  mealRegistrations?: MealRegistration[];
  customMonth?: number;
  customYear?: number;
  initialMode?: 'general' | 'overtime' | 'meals';
}

export const PrintTimekeepingModal: React.FC<PrintTimekeepingModalProps> = ({
  isOpen,
  onClose,
  timekeepings,
  employees,
  settings,
  mealRegistrations = [],
  customMonth,
  customYear,
  initialMode = 'general'
}) => {
  const [printMode, setPrintMode] = useState<'general' | 'overtime' | 'meals'>(initialMode);

  React.useEffect(() => {
    if (isOpen) {
      setPrintMode(initialMode);
    }
  }, [isOpen, initialMode]);

  if (!isOpen) return null;

  const year = customYear ?? settings.currentYear;
  const month = customMonth ?? settings.currentMonth;
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  const daysInMonth = new Date(year, month, 0).getDate();
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const depMap = new Map(settings.departments.map(d => [d.id, d.name]));
  const mealMap = new Map(mealRegistrations.map(m => [m.employeeId, m]));
  const tkMap = new Map(
    timekeepings
      .filter(t => String(t.month) === monthKey || (Number(t.month) === month && (!t.year || t.year === year)) || (!t.month && month === settings.currentMonth && year === settings.currentYear))
      .map(t => [t.employeeId, t])
  );

  // Check weekend / holiday
  const isWeekendDay = (day: number) => {
    const d = new Date(year, month - 1, day);
    return d.getDay() === 0; // Chủ nhật
  };
  const isSaturday = (day: number) => {
    const d = new Date(year, month - 1, day);
    return d.getDay() === 6; // Thứ 7
  };
  const isHoliday = (day: number) => {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return settings.holidays.some(h => h.date === dateStr);
  };

  const shiftLabelMap: Record<string, string> = {
    ca_hanh_chinh: 'Hành chính (08:00 - 17:00)',
    ca_sang: 'Ca Sáng (06:00 - 14:00)',
    ca_chieu: 'Ca Chiều (14:00 - 22:00)',
    ca_toi: 'Ca Tối (18:00 - 22:00)',
    ca_1: 'Ca 1 (06:00 - 14:00)',
    ca_2: 'Ca 2 (14:00 - 22:00)',
    ca_3: 'Ca 3 (22:00 - 06:00)',
    ca_gay: 'Ca Gãy (10:00 - 14:00 & 17:00 - 21:00)'
  };

  // Chỉ in danh sách người lao động đang làm việc trong tháng
  const activeEmployees = employees.filter(e => isEmployeeActiveInMonth(e, month, year));

  // Tập hợp các bản ghi làm thêm giờ chi tiết cho bảng Nhật ký làm thêm
  const otLogRows: any[] = [];
  let otIndex = 1;
  activeEmployees.forEach(emp => {
    const t = tkMap.get(emp.id);
    if (!t?.days) return;

    for (let d = 1; d <= daysInMonth; d++) {
      const dayData = t.days[d];
      if (!dayData) continue;

      const otNormal = dayData.otNormalHours || 0;
      const otWeekend = dayData.otWeekendHours || 0;
      const otHoliday = dayData.otHolidayHours || 0;
      const totalOt = otNormal + otWeekend + otHoliday;

      if (totalOt > 0 || (dayData.otStartTime && dayData.otEndTime)) {
        const dayOfWeek = new Date(year, month - 1, d).getDay();
        const dowStr = dayOfWeek === 0 ? 'Chủ nhật' : `Thứ ${dayOfWeek + 1}`;

        otLogRows.push({
          idx: otIndex++,
          day: d,
          dateFormatted: `${String(d).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`,
          dowStr,
          emp,
          shift: dayData.shift ? (shiftLabelMap[dayData.shift] || dayData.shift) : 'Hành chính',
          timeRange: (dayData.otStartTime && dayData.otEndTime)
            ? `${dayData.otStartTime} - ${dayData.otEndTime}`
            : (totalOt > 0 ? `${totalOt}h` : '-'),
          otNormal,
          otWeekend,
          otHoliday,
          totalOt,
          reason: dayData.otReason || 'Hoàn thành tiến độ công việc',
          mealStatus: dayData.hadMeal || dayData.mealDinner ? 'Có suất ăn' : 'Không'
        });
      }
    }
  });

  // Summaries
  let grandTotalWorkDays = 0;
  let grandTotalPaidLeave = 0;
  let grandTotalHolidayDays = 0;
  let grandTotalUnpaidLeave = 0;
  let grandTotalOtNormal = 0;
  let grandTotalOtWeekend = 0;
  let grandTotalOtHoliday = 0;
  let grandTotalMeals = 0;

  activeEmployees.forEach(e => {
    const t = tkMap.get(e.id);
    if (!t) return;
    grandTotalWorkDays += t.actualWorkDays || 0;
    grandTotalPaidLeave += t.paidLeaveDays || 0;
    grandTotalHolidayDays += t.holidayDays || 0;
    grandTotalUnpaidLeave += t.unpaidLeaveDays || 0;
    grandTotalOtNormal += t.totalOtNormalHours || 0;
    grandTotalOtWeekend += t.totalOtWeekendHours || 0;
    grandTotalOtHoliday += t.totalOtHolidayHours || 0;
    grandTotalMeals += t.totalMeals || 0;
  });

  const grandOtHoursAll = grandTotalOtNormal + grandTotalOtWeekend + grandTotalOtHoliday;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-2 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-[98vw] max-h-[96vh] flex flex-col overflow-hidden">
        {/* Top Control Bar */}
        <div className="px-6 py-3.5 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3 print:hidden shrink-0">
          <div className="flex items-center gap-2.5">
            <CalendarCheck className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="font-bold text-base flex items-center gap-2">
                <span>In Báo Cáo Chấm Công</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-normal">
                  Tháng {month}/{year}
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Khổ giấy A4 Ngang (Landscape) • {activeEmployees.length} nhân sự hoạt động
              </p>
            </div>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="flex items-center bg-slate-800 p-1 rounded-xl border border-slate-700 text-xs">
            <button
              onClick={() => setPrintMode('general')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                printMode === 'general' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-300 hover:text-white'
              }`}
            >
              <CalendarCheck className="w-4 h-4" />
              <span>1. Bảng Chấm Công Tháng</span>
            </button>
            <button
              onClick={() => setPrintMode('overtime')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                printMode === 'overtime' ? 'bg-orange-600 text-white shadow-xs' : 'text-slate-300 hover:text-white'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>2. Nhật Ký Làm Thêm Giờ ({otLogRows.length} lượt)</span>
            </button>
            <button
              onClick={() => setPrintMode('meals')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                printMode === 'meals' ? 'bg-teal-600 text-white shadow-xs' : 'text-slate-300 hover:text-white'
              }`}
            >
              <Utensils className="w-4 h-4" />
              <span>3. Bảng Chấm Công Ăn Ca</span>
            </button>
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
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 cursor-pointer transition-colors"
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
                size: landscape;
                margin: 6mm 4mm;
              }
              body {
                visibility: hidden;
              }
              #timekeeping-print-sheet, #timekeeping-print-sheet * {
                visibility: visible;
              }
              #timekeeping-print-sheet {
                position: absolute;
                left: 0;
                top: 0;
                width: 100%;
              }
            }
          `}} />

          <div id="timekeeping-print-sheet" className="bg-white mx-auto p-6 rounded-xl shadow-xs print:shadow-none print:p-1 max-w-[1550px] border border-slate-200 print:border-none text-slate-900 text-[10px]">
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
                <div className="text-xs font-semibold text-slate-800">Kỳ theo dõi: Tháng {month}/{year}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  Ngày in: {new Date().toLocaleDateString('vi-VN')}
                </div>
                <div className="text-[10px] text-emerald-700 font-bold mt-0.5">
                  Ngày công chuẩn: {settings.standardWorkDays} công / tháng
                </div>
              </div>
            </div>

            {/* ======================================================== */}
            {/* VIEW 1: BẢNG CHẤM CÔNG THÁNG (LƯỚI 1 - 31)               */}
            {/* ======================================================== */}
            {printMode === 'general' && (
              <>
                {/* Title */}
                <div className="text-center my-3">
                  <h1 className="text-base sm:text-lg font-black uppercase tracking-wide text-slate-900">
                    BẢNG CHẤM CÔNG VÀ THEO DÕI LÀM THÊM GIỜ (OT)
                  </h1>
                  <p className="text-[11px] text-slate-600 italic mt-0.5">
                    Tháng {month} năm {year} (Tổng số nhân sự: {activeEmployees.length} người)
                  </p>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse border border-slate-400 text-center text-[9px] print:text-[8px]">
                    <thead className="bg-slate-100 font-bold text-slate-900">
                      <tr>
                        <th rowSpan={2} className="border border-slate-400 p-1 w-7">STT</th>
                        <th rowSpan={2} className="border border-slate-400 p-1 min-w-[55px]">Mã NV</th>
                        <th rowSpan={2} className="border border-slate-400 p-1 text-center min-w-[80px]">Số CCCD</th>
                        <th rowSpan={2} className="border border-slate-400 p-1 text-left min-w-[120px]">Họ và Tên</th>
                        <th rowSpan={2} className="border border-slate-400 p-1 text-left min-w-[80px]">Phòng Ban</th>
                        <th colSpan={daysInMonth} className="border border-slate-400 p-0.5">
                          Các ngày trong tháng {month}/{year}
                        </th>
                        <th colSpan={4} className="border border-slate-400 p-0.5 bg-emerald-50 text-emerald-950">
                          Quy Ra Công
                        </th>
                        <th colSpan={3} className="border border-slate-400 p-0.5 bg-orange-50 text-orange-950">
                          Giờ Tăng Ca (OT)
                        </th>
                        <th rowSpan={2} className="border border-slate-400 p-0.5 bg-teal-50 text-teal-950 w-8">
                          Ăn Ca
                        </th>
                      </tr>
                      <tr>
                        {daysArray.map(day => {
                          const isSun = isWeekendDay(day);
                          const isSat = isSaturday(day);
                          const isHol = isHoliday(day);
                          let headerBg = 'bg-slate-50';
                          if (isHol) headerBg = 'bg-red-200 text-red-900 font-black';
                          else if (isSun) headerBg = 'bg-red-100 text-red-800';
                          else if (isSat) headerBg = 'bg-blue-50 text-blue-800';

                          return (
                            <th key={day} className={`border border-slate-400 p-0.5 min-w-[18px] ${headerBg}`}>
                              <div>{day}</div>
                              <div className="text-[7.5px] font-normal">{isSun ? 'CN' : isSat ? 'T7' : ''}</div>
                            </th>
                          );
                        })}
                        <th className="border border-slate-400 p-0.5 w-7 bg-emerald-50">Làm</th>
                        <th className="border border-slate-400 p-0.5 w-7 bg-emerald-50">Phép</th>
                        <th className="border border-slate-400 p-0.5 w-7 bg-emerald-50">Lễ</th>
                        <th className="border border-slate-400 p-0.5 w-7 bg-emerald-50">Nghỉ</th>

                        <th className="border border-slate-400 p-0.5 w-8 bg-orange-50">150%</th>
                        <th className="border border-slate-400 p-0.5 w-8 bg-orange-50">200%</th>
                        <th className="border border-slate-400 p-0.5 w-8 bg-orange-50">300%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeEmployees.map((emp, idx) => {
                        const tk = tkMap.get(emp.id);

                        return (
                          <tr key={emp.id} className="hover:bg-slate-50">
                            <td className="border border-slate-400 p-0.5 font-mono">{idx + 1}</td>
                            <td className="border border-slate-400 p-0.5 font-mono font-semibold">{emp.employeeCode}</td>
                            <td className="border border-slate-400 p-0.5 font-mono text-[8px]">{emp.idCardNumber}</td>
                            <td className="border border-slate-400 p-0.5 text-left font-bold text-slate-900 whitespace-nowrap">
                              {emp.fullName}
                            </td>
                            <td className="border border-slate-400 p-0.5 text-left text-slate-600 whitespace-nowrap">
                              {depMap.get(emp.departmentId) || ''}
                            </td>

                            {/* Days 1 -> daysInMonth */}
                            {daysArray.map(day => {
                              const dayData = tk?.days?.[day];
                              const sym = dayData?.symbol || '';
                              const ot = (dayData?.otNormalHours || 0) + (dayData?.otWeekendHours || 0) + (dayData?.otHolidayHours || 0);

                              const isSun = isWeekendDay(day);
                              const isSat = isSaturday(day);
                              const isHol = isHoliday(day);

                              let cellBg = '';
                              if (isHol) cellBg = 'bg-red-50 text-red-700 font-bold';
                              else if (isSun) cellBg = 'bg-red-50/50 text-slate-400';
                              else if (isSat) cellBg = 'bg-slate-50/40';

                              return (
                                <td key={day} className={`border border-slate-400 p-0.5 ${cellBg}`}>
                                  <div>{sym}</div>
                                  {ot > 0 && (
                                    <div className="text-[7px] text-orange-600 font-bold">+{ot}h</div>
                                  )}
                                </td>
                              );
                            })}

                            {/* Totals */}
                            <td className="border border-slate-400 p-0.5 font-bold bg-emerald-50/50 text-slate-900">
                              {tk?.actualWorkDays ?? 0}
                            </td>
                            <td className="border border-slate-400 p-0.5 text-slate-700">
                              {tk?.paidLeaveDays || '-'}
                            </td>
                            <td className="border border-slate-400 p-0.5 text-slate-700">
                              {tk?.holidayDays || '-'}
                            </td>
                            <td className="border border-slate-400 p-0.5 text-slate-700">
                              {tk?.unpaidLeaveDays || '-'}
                            </td>

                            <td className="border border-slate-400 p-0.5 font-mono text-orange-700">
                              {tk?.totalOtNormalHours ? tk.totalOtNormalHours.toFixed(1) : '-'}
                            </td>
                            <td className="border border-slate-400 p-0.5 font-mono text-orange-700">
                              {tk?.totalOtWeekendHours ? tk.totalOtWeekendHours.toFixed(1) : '-'}
                            </td>
                            <td className="border border-slate-400 p-0.5 font-mono text-orange-700">
                              {tk?.totalOtHolidayHours ? tk.totalOtHolidayHours.toFixed(1) : '-'}
                            </td>

                            <td className="border border-slate-400 p-0.5 font-bold text-teal-800 bg-teal-50/50">
                              {tk?.totalMeals ?? 0}
                            </td>
                          </tr>
                        );
                      })}

                      {/* Summary row */}
                      <tr className="bg-slate-200 font-bold text-slate-900">
                        <td colSpan={5} className="border border-slate-400 p-1 text-center uppercase">
                          TỔNG CỘNG ({activeEmployees.length} Nhân Sự)
                        </td>
                        <td colSpan={daysInMonth} className="border border-slate-400 p-1 text-slate-600 text-left pl-2">
                          Ngày công chuẩn: {settings.standardWorkDays} ngày
                        </td>
                        <td className="border border-slate-400 p-1 bg-emerald-100 font-black">{grandTotalWorkDays.toFixed(1)}</td>
                        <td className="border border-slate-400 p-1">{grandTotalPaidLeave.toFixed(1)}</td>
                        <td className="border border-slate-400 p-1">{grandTotalHolidayDays.toFixed(1)}</td>
                        <td className="border border-slate-400 p-1">{grandTotalUnpaidLeave.toFixed(1)}</td>
                        <td className="border border-slate-400 p-1 bg-orange-100 font-mono">{grandTotalOtNormal.toFixed(1)}</td>
                        <td className="border border-slate-400 p-1 bg-orange-100 font-mono">{grandTotalOtWeekend.toFixed(1)}</td>
                        <td className="border border-slate-400 p-1 bg-orange-100 font-mono">{grandTotalOtHoliday.toFixed(1)}</td>
                        <td className="border border-slate-400 p-1 bg-teal-100 font-black">{grandTotalMeals}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Legend notes */}
                <div className="mt-3 p-2 bg-slate-50 border border-slate-300 rounded text-[9px] text-slate-600 flex flex-wrap gap-x-4 gap-y-1">
                  <span className="font-bold text-slate-800">Quy ước ký hiệu:</span>
                  <span><strong>X</strong>: Đi làm cả ngày</span>
                  <span><strong>1/2X</strong>: Làm nửa ngày (0.5 công)</span>
                  <span><strong>P</strong>: Nghỉ phép năm hưởng lương</span>
                  <span><strong>L</strong>: Nghỉ lễ, tết hưởng lương</span>
                  <span><strong>O</strong>: Nghỉ ốm đau hưởng BHXH</span>
                  <span><strong>TS</strong>: Thai sản</span>
                  <span><strong>K</strong>: Nghỉ không lương</span>
                  <span><strong>+Nh</strong>: Số giờ làm thêm ngoài giờ</span>
                </div>
              </>
            )}

            {/* ======================================================== */}
            {/* VIEW 2: NHẬT KÝ LÀM THÊM GIỜ (OT) CHI TIẾT                */}
            {/* ======================================================== */}
            {printMode === 'overtime' && (
              <>
                {/* Title */}
                <div className="text-center my-3">
                  <h1 className="text-base sm:text-lg font-black uppercase tracking-wide text-slate-900">
                    NHẬT KÝ THEO DÕI LÀM THÊM GIỜ (TĂNG CA - OT)
                  </h1>
                  <p className="text-[11px] text-slate-600 italic mt-0.5">
                    Tháng {month} năm {year} (Tổng số lượt làm thêm: {otLogRows.length} lượt • Tổng giờ OT: {grandOtHoursAll.toFixed(1)} giờ)
                  </p>
                </div>

                {/* Highlights */}
                <div className="grid grid-cols-4 gap-2 mb-3 p-2 bg-orange-50/60 border border-orange-200 rounded text-[10px]">
                  <div>
                    <span className="text-slate-500">Tổng giờ OT ngày thường (150%):</span>{' '}
                    <strong className="text-orange-950 font-bold">{grandTotalOtNormal.toFixed(1)} giờ</strong>
                  </div>
                  <div>
                    <span className="text-slate-500">Tổng giờ OT cuối tuần (200%):</span>{' '}
                    <strong className="text-orange-950 font-bold">{grandTotalOtWeekend.toFixed(1)} giờ</strong>
                  </div>
                  <div>
                    <span className="text-slate-500">Tổng giờ OT ngày Lễ (300%):</span>{' '}
                    <strong className="text-orange-950 font-bold">{grandTotalOtHoliday.toFixed(1)} giờ</strong>
                  </div>
                  <div>
                    <span className="text-slate-500">TỔNG GIỜ LÀM THÊM:</span>{' '}
                    <strong className="text-orange-700 font-mono font-black text-xs">{grandOtHoursAll.toFixed(1)} giờ</strong>
                  </div>
                </div>

                {/* Overtime Table */}
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse border border-slate-400 text-center text-[9px] print:text-[8px]">
                    <thead className="bg-slate-100 font-bold text-slate-900">
                      <tr>
                        <th className="border border-slate-400 p-1 w-8">STT</th>
                        <th className="border border-slate-400 p-1 w-20">Ngày</th>
                        <th className="border border-slate-400 p-1 w-16">Thứ</th>
                        <th className="border border-slate-400 p-1 w-20">Mã NV</th>
                        <th className="border border-slate-400 p-1 text-left min-w-[130px]">Họ và Tên</th>
                        <th className="border border-slate-400 p-1 text-left min-w-[90px]">Phòng Ban</th>
                        <th className="border border-slate-400 p-1 text-left min-w-[90px]">Ca Chính</th>
                        <th className="border border-slate-400 p-1 min-w-[90px] bg-orange-50">Khung Giờ OT</th>
                        <th className="border border-slate-400 p-1 w-14 bg-orange-50">Thường</th>
                        <th className="border border-slate-400 p-1 w-14 bg-orange-50">Cuối Tuần</th>
                        <th className="border border-slate-400 p-1 w-14 bg-orange-50">Ngày Lễ</th>
                        <th className="border border-slate-400 p-1 w-16 bg-orange-100 font-bold text-orange-950">Tổng Giờ</th>
                        <th className="border border-slate-400 p-1 text-left min-w-[140px]">Nội Dung / Lý Do Tăng Ca</th>
                        <th className="border border-slate-400 p-1 w-20">Suất Cơm OT</th>
                        <th className="border border-slate-400 p-1 w-24">Ký Xác Nhận</th>
                      </tr>
                    </thead>
                    <tbody>
                      {otLogRows.length === 0 ? (
                        <tr>
                          <td colSpan={15} className="border border-slate-400 p-6 text-center text-slate-400 italic">
                            Không có dữ liệu làm thêm giờ phát sinh trong tháng {month}/{year}
                          </td>
                        </tr>
                      ) : (
                        otLogRows.map(row => (
                          <tr key={`${row.emp.id}-${row.day}`} className="hover:bg-slate-50">
                            <td className="border border-slate-400 p-1 font-mono">{row.idx}</td>
                            <td className="border border-slate-400 p-1 font-mono font-bold">{row.dateFormatted}</td>
                            <td className="border border-slate-400 p-1 text-slate-600">{row.dowStr}</td>
                            <td className="border border-slate-400 p-1 font-mono font-semibold">{row.emp.employeeCode}</td>
                            <td className="border border-slate-400 p-1 text-left font-bold text-slate-900 whitespace-nowrap">{row.emp.fullName}</td>
                            <td className="border border-slate-400 p-1 text-left text-slate-600 whitespace-nowrap">{depMap.get(row.emp.departmentId) || ''}</td>
                            <td className="border border-slate-400 p-1 text-left text-slate-700 whitespace-nowrap">{row.shift}</td>
                            <td className="border border-slate-400 p-1 font-mono font-semibold text-orange-900 bg-orange-50/40">{row.timeRange}</td>
                            <td className="border border-slate-400 p-1 font-mono">{row.otNormal > 0 ? row.otNormal.toFixed(1) : '-'}</td>
                            <td className="border border-slate-400 p-1 font-mono">{row.otWeekend > 0 ? row.otWeekend.toFixed(1) : '-'}</td>
                            <td className="border border-slate-400 p-1 font-mono">{row.otHoliday > 0 ? row.otHoliday.toFixed(1) : '-'}</td>
                            <td className="border border-slate-400 p-1 font-mono font-black text-orange-700 bg-orange-100/60">{row.totalOt.toFixed(1)}</td>
                            <td className="border border-slate-400 p-1 text-left text-slate-700">{row.reason}</td>
                            <td className="border border-slate-400 p-1 text-slate-700">{row.mealStatus}</td>
                            <td className="border border-slate-400 p-1"></td>
                          </tr>
                        ))
                      )}

                      {/* Summary Row */}
                      {otLogRows.length > 0 && (
                        <tr className="bg-slate-200 font-bold text-slate-900">
                          <td colSpan={8} className="border border-slate-400 p-1 text-center uppercase">
                            TỔNG CỘNG ({otLogRows.length} lượt làm thêm giờ)
                          </td>
                          <td className="border border-slate-400 p-1 bg-orange-100 font-mono">{grandTotalOtNormal.toFixed(1)}</td>
                          <td className="border border-slate-400 p-1 bg-orange-100 font-mono">{grandTotalOtWeekend.toFixed(1)}</td>
                          <td className="border border-slate-400 p-1 bg-orange-100 font-mono">{grandTotalOtHoliday.toFixed(1)}</td>
                          <td className="border border-slate-400 p-1 bg-orange-200 font-mono font-black text-orange-900">{grandOtHoursAll.toFixed(1)}</td>
                          <td colSpan={3} className="border border-slate-400 p-1 text-slate-500 italic text-left pl-2">
                            Khống chế trần miễn thuế: 40 giờ/tháng & 200 giờ/năm theo Bộ luật Lao động
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* ======================================================== */}
            {/* VIEW 3: BẢNG CHẤM CÔNG ĂN CA (TRƯA / CHIỀU / TỐI)         */}
            {/* ======================================================== */}
            {printMode === 'meals' && (
              <>
                {/* Title */}
                <div className="text-center my-3">
                  <h1 className="text-base sm:text-lg font-black uppercase tracking-wide text-slate-900">
                    BẢNG CHẤM CÔNG VÀ THEO DÕI SUẤT ĂN CA
                  </h1>
                  <p className="text-[11px] text-slate-600 italic mt-0.5">
                    Tháng {month} năm {year} (Tổng số suất ăn phục vụ trong tháng: {grandTotalMeals} suất)
                  </p>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse border border-slate-400 text-center text-[9px] print:text-[8px]">
                    <thead className="bg-slate-100 font-bold text-slate-900">
                      <tr>
                        <th className="border border-slate-400 p-1 w-8">STT</th>
                        <th className="border border-slate-400 p-1 w-20">Mã NV</th>
                        <th className="border border-slate-400 p-1 text-left min-w-[130px]">Họ và Tên</th>
                        <th className="border border-slate-400 p-1 text-left min-w-[90px]">Phòng Ban</th>
                        <th className="border border-slate-400 p-1 w-24">Hình Thức</th>
                        {daysArray.map(day => (
                          <th key={day} className="border border-slate-400 p-0.5 min-w-[17px]">
                            {day}
                          </th>
                        ))}
                        <th className="border border-slate-400 p-1 w-10 bg-teal-50">Trưa</th>
                        <th className="border border-slate-400 p-1 w-10 bg-teal-50">Chiều</th>
                        <th className="border border-slate-400 p-1 w-10 bg-teal-50">Tối</th>
                        <th className="border border-slate-400 p-1 w-12 bg-teal-100 font-bold text-teal-950">Tổng Suất</th>
                        <th className="border border-slate-400 p-1 w-24">Ký Nhận</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeEmployees.map((emp, idx) => {
                        const tk = tkMap.get(emp.id);
                        const reg = mealMap.get(emp.id);
                        const effectivePlan = reg?.mealType || (reg?.planType === 'registered' ? 'canteen' : reg?.planType) || 'canteen';

                        return (
                          <tr key={emp.id} className="hover:bg-slate-50">
                            <td className="border border-slate-400 p-0.5 font-mono">{idx + 1}</td>
                            <td className="border border-slate-400 p-0.5 font-mono font-semibold">{emp.employeeCode}</td>
                            <td className="border border-slate-400 p-0.5 text-left font-bold text-slate-900 whitespace-nowrap">{emp.fullName}</td>
                            <td className="border border-slate-400 p-0.5 text-left text-slate-600 whitespace-nowrap">{depMap.get(emp.departmentId) || ''}</td>
                            <td className="border border-slate-400 p-0.5 text-[8px]">
                              <span className={`px-1 py-0.2 rounded font-bold ${effectivePlan === 'canteen' ? 'bg-emerald-100 text-emerald-800' : effectivePlan === 'cash' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-500'}`}>
                                {effectivePlan === 'canteen' ? 'Tại bếp' : effectivePlan === 'cash' ? 'Tiền mặt' : 'Không ăn'}
                              </span>
                            </td>

                            {daysArray.map(day => {
                              const dayData = tk?.days?.[day];
                              let badge = '-';
                              if (dayData) {
                                const parts: string[] = [];
                                if (dayData.mealLunch) parts.push('T');
                                if (dayData.mealAfternoon) parts.push('C');
                                if (dayData.mealDinner) parts.push('Tối');
                                badge = parts.length > 0 ? parts.join('+') : (dayData.hadMeal || dayData.mealEaten ? '1' : '-');
                              }
                              return (
                                <td key={day} className={`border border-slate-400 p-0.5 ${badge !== '-' ? 'bg-teal-50 font-bold text-teal-800' : 'text-slate-300'}`}>
                                  {badge}
                                </td>
                              );
                            })}

                            <td className="border border-slate-400 p-0.5 font-mono text-teal-900">{tk?.totalMealsLunch || 0}</td>
                            <td className="border border-slate-400 p-0.5 font-mono text-teal-900">{tk?.totalMealsAfternoon || 0}</td>
                            <td className="border border-slate-400 p-0.5 font-mono text-teal-900">{tk?.totalMealsDinner || 0}</td>
                            <td className="border border-slate-400 p-0.5 font-mono font-black text-teal-950 bg-teal-100/70">{tk?.totalMeals ?? 0}</td>
                            <td className="border border-slate-400 p-0.5"></td>
                          </tr>
                        );
                      })}

                      {/* Summary Row */}
                      <tr className="bg-slate-200 font-bold text-slate-900">
                        <td colSpan={5} className="border border-slate-400 p-1 text-center uppercase">
                          TỔNG CỘNG
                        </td>
                        <td colSpan={daysInMonth} className="border border-slate-400 p-1 text-slate-600 text-left pl-2">
                          Tổng số người được phục vụ: {activeEmployees.length} nhân sự
                        </td>
                        <td className="border border-slate-400 p-1 bg-teal-100 font-mono">
                          {activeEmployees.reduce((sum, e) => sum + (tkMap.get(e.id)?.totalMealsLunch || 0), 0)}
                        </td>
                        <td className="border border-slate-400 p-1 bg-teal-100 font-mono">
                          {activeEmployees.reduce((sum, e) => sum + (tkMap.get(e.id)?.totalMealsAfternoon || 0), 0)}
                        </td>
                        <td className="border border-slate-400 p-1 bg-teal-100 font-mono">
                          {activeEmployees.reduce((sum, e) => sum + (tkMap.get(e.id)?.totalMealsDinner || 0), 0)}
                        </td>
                        <td className="border border-slate-400 p-1 bg-teal-200 font-mono font-black text-teal-950">
                          {grandTotalMeals}
                        </td>
                        <td className="border border-slate-400 p-1"></td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="mt-2 text-[8px] text-slate-500 italic">
                  * Ký hiệu: T = Suất trưa | C = Suất chiều | Tối = Suất ca đêm/tăng ca tối | 1 = 01 suất chuẩn
                </div>
              </>
            )}

            {/* Signatures */}
            <div className="grid grid-cols-4 gap-4 text-center mt-6 pt-4 text-xs border-t border-slate-300">
              <div>
                <div className="font-bold uppercase text-slate-900">NGƯỜI LẬP BIỂU</div>
                <div className="text-[10px] text-slate-500 italic mt-0.5">(Ký, ghi rõ họ tên)</div>
                <div className="h-14 flex items-end justify-center font-semibold text-slate-700">
                  {settings.reportPreparerName}
                </div>
              </div>
              <div>
                <div className="font-bold uppercase text-slate-900">PHỤ TRÁCH BỘ PHẬN</div>
                <div className="text-[10px] text-slate-500 italic mt-0.5">(Ký, ghi rõ họ tên)</div>
                <div className="h-14"></div>
              </div>
              <div>
                <div className="font-bold uppercase text-slate-900">KẾ TOÁN TRƯỞNG</div>
                <div className="text-[10px] text-slate-500 italic mt-0.5">(Ký, ghi rõ họ tên)</div>
                <div className="h-14 flex items-end justify-center font-semibold text-slate-700">
                  {settings.chiefAccountantName}
                </div>
              </div>
              <div>
                <div className="font-bold uppercase text-slate-900">GIÁM ĐỐC DOANH NGHIỆP</div>
                <div className="text-[10px] text-slate-500 italic mt-0.5">(Ký, đóng dấu)</div>
                <div className="h-14"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
