import { 
  SystemSettings, 
  Employee, 
  Dependent, 
  InsuranceRecord, 
  MealRegistration, 
  SpecialAllowance, 
  TimekeepingRecord 
} from '../types';
import { 
  INITIAL_SETTINGS, 
  INITIAL_EMPLOYEES, 
  INITIAL_DEPENDENTS, 
  INITIAL_INSURANCES, 
  INITIAL_MEAL_REGISTRATIONS, 
  INITIAL_SPECIAL_ALLOWANCES, 
  INITIAL_TIMEKEEPINGS 
} from '../data/initialData';

/**
 * Đảm bảo cài đặt hệ thống (SystemSettings) luôn luôn đầy đủ các trường bắt buộc,
 * đặc biệt là danh mục phòng ban (departments) và chức vụ (positions), biểu thuế.
 * Tuyệt đối không bao giờ trả về null/undefined hoặc thiếu mảng.
 */
export function sanitizeSettings(incoming?: Partial<SystemSettings> | null): SystemSettings {
  if (!incoming || typeof incoming !== 'object') {
    return { ...INITIAL_SETTINGS };
  }

  const base = { ...INITIAL_SETTINGS, ...incoming };

  // Đảm bảo departments là mảng hợp lệ và không rỗng
  if (!Array.isArray(base.departments) || base.departments.length === 0) {
    base.departments = INITIAL_SETTINGS.departments;
  }

  // Đảm bảo positions là mảng hợp lệ và không rỗng
  if (!Array.isArray(base.positions) || base.positions.length === 0) {
    base.positions = INITIAL_SETTINGS.positions;
  }

  // Đảm bảo holidays là mảng hợp lệ
  if (!Array.isArray(base.holidays)) {
    base.holidays = INITIAL_SETTINGS.holidays || [];
  }

  // Đảm bảo taxBrackets là mảng hợp lệ và không rỗng
  if (!Array.isArray(base.taxBrackets) || base.taxBrackets.length === 0) {
    base.taxBrackets = INITIAL_SETTINGS.taxBrackets;
  }

  // Đảm bảo monthlyStandardConfigs là object hợp lệ
  if (!base.monthlyStandardConfigs || typeof base.monthlyStandardConfigs !== 'object') {
    base.monthlyStandardConfigs = INITIAL_SETTINGS.monthlyStandardConfigs;
  }

  // Đảm bảo taxExemptionRules là object hợp lệ
  if (!base.taxExemptionRules || typeof base.taxExemptionRules !== 'object') {
    base.taxExemptionRules = INITIAL_SETTINGS.taxExemptionRules;
  }

  if (!base.companyName || !base.companyName.trim()) {
    base.companyName = INITIAL_SETTINGS.companyName;
  }

  if (typeof base.currentMonth !== 'number' || base.currentMonth < 1 || base.currentMonth > 12) {
    base.currentMonth = INITIAL_SETTINGS.currentMonth || 9;
  }

  if (typeof base.currentYear !== 'number' || base.currentYear < 2000) {
    base.currentYear = INITIAL_SETTINGS.currentYear || 2026;
  }

  return base;
}

/**
 * Đảm bảo danh sách nhân viên luôn là mảng hợp lệ
 */
export function sanitizeEmployees(incoming?: any): Employee[] {
  if (!Array.isArray(incoming)) {
    return INITIAL_EMPLOYEES;
  }
  return incoming.filter(e => e && typeof e === 'object' && e.id && e.fullName);
}

/**
 * Đảm bảo danh sách người phụ thuộc luôn là mảng hợp lệ
 */
export function sanitizeDependents(incoming?: any): Dependent[] {
  if (!Array.isArray(incoming)) {
    return INITIAL_DEPENDENTS;
  }
  return incoming.filter(d => d && typeof d === 'object' && d.id);
}

/**
 * Đảm bảo danh sách bảo hiểm luôn là mảng hợp lệ
 */
export function sanitizeInsurances(incoming?: any): InsuranceRecord[] {
  if (!Array.isArray(incoming)) {
    return INITIAL_INSURANCES;
  }
  return incoming.filter(i => i && typeof i === 'object' && i.id);
}

/**
 * Đảm bảo danh sách ăn ca luôn là mảng hợp lệ
 */
export function sanitizeMealRegistrations(incoming?: any): MealRegistration[] {
  if (!Array.isArray(incoming)) {
    return INITIAL_MEAL_REGISTRATIONS;
  }
  return incoming.filter(m => m && typeof m === 'object' && m.id);
}

/**
 * Đảm bảo danh sách phụ cấp đặc thù luôn là mảng hợp lệ
 */
export function sanitizeSpecialAllowances(incoming?: any): SpecialAllowance[] {
  if (!Array.isArray(incoming)) {
    return INITIAL_SPECIAL_ALLOWANCES;
  }
  return incoming.filter(a => a && typeof a === 'object' && a.id);
}

/**
 * Đảm bảo danh sách chấm công luôn là mảng hợp lệ
 */
export function sanitizeTimekeepings(incoming?: any): TimekeepingRecord[] {
  if (!Array.isArray(incoming)) {
    return INITIAL_TIMEKEEPINGS;
  }
  return incoming.filter(t => t && typeof t === 'object' && t.id);
}
