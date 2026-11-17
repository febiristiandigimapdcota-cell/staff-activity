import { PhotoRecord, StaffMember, StaffStatsRecord } from '../types';

const ID_MONTH_MAP: Record<string, number> = {
  jan: 0,
  januari: 0,
  january: 0,
  feb: 1,
  februari: 1,
  february: 1,
  mar: 2,
  maret: 2,
  march: 2,
  apr: 3,
  april: 3,
  mei: 4,
  may: 4,
  jun: 5,
  juni: 5,
  june: 5,
  jul: 6,
  juli: 6,
  july: 6,
  agu: 7,
  agust: 7,
  agustus: 7,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  okt: 9,
  oktober: 9,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  des: 11,
  desember: 11,
  dec: 11,
  december: 11
};

export function normalizeStaffKey(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
}

export function isTryOnActivity(activityType: string): boolean {
  return (
    activityType === 'TryOn' ||
    activityType === 'TryOn_iPad' ||
    activityType === 'TryOn_AirPods' ||
    activityType === 'TryOn_Watch'
  );
}

/**
 * Returns canonical calendar month key: e.g. "2026-11".
 */
export function getCurrentMonthKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Checks strictly whether a photo belongs to the current calendar month.
 * Never leaks previous months' photos into current month totals.
 */
export function isPhotoInCurrentMonth(photo: PhotoRecord, referenceDate: Date = new Date()): boolean {
  const refYear = referenceDate.getFullYear();
  const refMonth = referenceDate.getMonth();

  const numericId = Number(photo.id);
  if (Number.isFinite(numericId) && numericId > 1_000_000_000_000) {
    const d = new Date(numericId);
    if (!isNaN(d.getTime())) {
      return d.getFullYear() === refYear && d.getMonth() === refMonth;
    }
  }

  if (photo.timestamp) {
    const lower = photo.timestamp.toLowerCase();
    const yearMatch = lower.match(/\b(20\d{2})\b/);
    if (yearMatch && Number(yearMatch[1]) !== refYear) {
      return false;
    }

    const tokens = lower.replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);
    for (const token of tokens) {
      if (token in ID_MONTH_MAP) {
        return ID_MONTH_MAP[token] === refMonth;
      }
    }
  }

  return false;
}

/**
 * Checks whether a photo counts toward the ACTIVE monthly target period.
 * - Must belong to current calendar month (`isPhotoInCurrentMonth`).
 * - If Admin executed "Reset Target" (`targetResetAt`) during the current month (or later),
 *   only photos uploaded at/after `targetResetAt` count toward the newly reset monthly targets,
 *   while all historical photos remain safely preserved in the gallery archive!
 */
export function isPhotoInActiveMonthlyPeriod(
  photo: PhotoRecord,
  referenceDate: Date = new Date(),
  targetResetAt?: string
): boolean {
  if (!isPhotoInCurrentMonth(photo, referenceDate)) {
    return false;
  }

  if (targetResetAt) {
    const resetMs = Date.parse(targetResetAt);
    if (Number.isFinite(resetMs) && resetMs > 0) {
      const monthStartMs = new Date(
        referenceDate.getFullYear(),
        referenceDate.getMonth(),
        1,
        0,
        0,
        0,
        0
      ).getTime();
      if (resetMs >= monthStartMs) {
        const numericId = Number(photo.id);
        return Number.isFinite(numericId) && numericId >= resetMs;
      }
    }
  }

  return true;
}

/**
 * Checks whether a photo was uploaded during the active weekly schedule cycle.
 * Respects both `scheduleStartedAt` AND `targetResetAt` (whichever is later).
 */
export function isPhotoInCurrentScheduleWeek(
  photo: PhotoRecord,
  scheduleStartedAt?: string,
  referenceDate: Date = new Date(),
  targetResetAt?: string
): boolean {
  const numericId = Number(photo.id);
  const schedMs = scheduleStartedAt ? Date.parse(scheduleStartedAt) : NaN;
  const resetMs = targetResetAt ? Date.parse(targetResetAt) : NaN;
  const effectiveStartMs = Math.max(
    Number.isFinite(schedMs) ? schedMs : 0,
    Number.isFinite(resetMs) ? resetMs : 0
  );

  if (effectiveStartMs > 0) {
    return Number.isFinite(numericId) && numericId > 1_000_000_000_000 && numericId >= effectiveStartMs;
  }

  if (Number.isFinite(numericId) && numericId > 1_000_000_000_000) {
    const d = new Date(numericId);
    const day = referenceDate.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(referenceDate);
    monday.setHours(0, 0, 0, 0);
    monday.setDate(referenceDate.getDate() + diffToMonday);
    const nextMonday = new Date(monday);
    nextMonday.setDate(monday.getDate() + 7);
    return d.getTime() >= monday.getTime() && d.getTime() < nextMonday.getTime();
  }

  return false;
}

export interface ActivityCounts {
  ops: number;
  tryOn: number;
  seed: number;
  checklist: number;
}

export function countPhotosByStaff(
  photos: PhotoRecord[],
  filterFn: (photo: PhotoRecord) => boolean
): Map<string, ActivityCounts> {
  const map = new Map<string, ActivityCounts>();
  photos.forEach((p) => {
    if (!filterFn(p)) return;
    const norm = (p.staffName || '').trim().toLowerCase();
    if (!norm) return;
    const curr = map.get(norm) || { ops: 0, tryOn: 0, seed: 0, checklist: 0 };
    if (p.activityType === 'OPS') curr.ops += 1;
    else if (isTryOnActivity(p.activityType)) curr.tryOn += 1;
    else if (p.activityType === 'WeeklySeed') curr.seed += 1;
    else if (p.activityType === 'Checklist') curr.checklist += 1;
    map.set(norm, curr);
  });
  return map;
}

/**
 * Computes sanitized monthly counters for a staff member in `currentMonthKey`.
 * Automatically resets to 0 if stored records belong to an earlier calendar month OR
 * if `targetResetAt` occurred after the record's `monthlyResetAt`.
 */
export function extractValidMonthlyCounters(
  source: Partial<StaffMember> | Partial<StaffStatsRecord> | undefined,
  currentMonthKey: string,
  targetResetAt?: string
): ActivityCounts {
  if (!source) return { ops: 0, tryOn: 0, seed: 0, checklist: 0 };

  const storedMonthKey = 'monthKey' in source ? source.monthKey : undefined;
  if (storedMonthKey && storedMonthKey !== currentMonthKey) {
    return { ops: 0, tryOn: 0, seed: 0, checklist: 0 };
  }

  if (targetResetAt) {
    const resetMs = Date.parse(targetResetAt);
    const resetMonthKey = Number.isFinite(resetMs) ? getCurrentMonthKey(new Date(resetMs)) : '';
    if (resetMonthKey === currentMonthKey) {
      const sourceResetAt = 'monthlyResetAt' in source ? source.monthlyResetAt : undefined;
      const sourceResetMs = sourceResetAt ? Date.parse(sourceResetAt) : NaN;
      if (!Number.isFinite(sourceResetMs) || sourceResetMs < resetMs) {
        return { ops: 0, tryOn: 0, seed: 0, checklist: 0 };
      }
    }
  }

  const hasExplicitMonthly =
    'monthlyOps' in source &&
    (source.monthlyOps !== undefined ||
      source.monthlyTryOn !== undefined ||
      source.monthlyWeeklySeed !== undefined ||
      source.monthlyChecklist !== undefined);

  if (hasExplicitMonthly) {
    const s = source as Partial<StaffMember>;
    return {
      ops: Number(s.monthlyOps) || 0,
      tryOn: Number(s.monthlyTryOn) || 0,
      seed: Number(s.monthlyWeeklySeed) || 0,
      checklist: Number(s.monthlyChecklist) || 0
    };
  }

  return {
    ops: Number(source.achOps) || 0,
    tryOn: Number(source.achTryOn) || 0,
    seed: Number(source.achWeeklySeed) || 0,
    checklist: Number(source.achChecklist) || 0
  };
}

/**
 * Reconciles weekly & monthly counters cleanly:
 * - Weekly counters (`achOps`, `achTryOn`, etc.) reset on schedule upload OR Admin target reset.
 * - Monthly counters (`monthlyOps`, `monthlyTryOn`, etc.) persist across weekly schedule uploads in the
 *   same month and reset automatically on calendar month change OR Admin target reset.
 */
export function reconcileWeeklyAndMonthlyStaff(params: {
  staffList: StaffMember[];
  previousStaffList?: StaffMember[];
  photos: PhotoRecord[];
  scheduleStartedAt?: string;
  targetResetAt?: string;
  now?: Date;
  resetWeekly?: boolean;
}): StaffMember[] {
  const {
    staffList,
    previousStaffList = staffList,
    photos,
    scheduleStartedAt,
    targetResetAt,
    now = new Date(),
    resetWeekly = false
  } = params;

  const currentMonthKey = getCurrentMonthKey(now);
  const weeklyPhotosByStaff = countPhotosByStaff(photos, (p) =>
    resetWeekly ? false : isPhotoInCurrentScheduleWeek(p, scheduleStartedAt, now, targetResetAt)
  );
  const monthlyPhotosByStaff = countPhotosByStaff(photos, (p) =>
    isPhotoInActiveMonthlyPeriod(p, now, targetResetAt)
  );

  const prevByName = new Map<string, StaffMember>();
  previousStaffList.forEach((s) => {
    if (s.name) prevByName.set(s.name.trim().toLowerCase(), s);
  });

  // Also check if weekly stored fields are stale relative to targetResetAt
  const resetMs = targetResetAt ? Date.parse(targetResetAt) : NaN;
  const resetMonthKey = Number.isFinite(resetMs) ? getCurrentMonthKey(new Date(resetMs)) : '';

  return staffList.map((staff) => {
    const norm = staff.name.trim().toLowerCase();
    const prev = prevByName.get(norm);
    const weekPhotoCnt = weeklyPhotosByStaff.get(norm);
    const monthPhotoCnt = monthlyPhotosByStaff.get(norm);

    const isStaleFromTargetReset =
      Number.isFinite(resetMs) &&
      resetMonthKey === currentMonthKey &&
      (!staff.monthlyResetAt || !Number.isFinite(Date.parse(staff.monthlyResetAt)) || Date.parse(staff.monthlyResetAt) < resetMs);

    const achOps = resetWeekly || isStaleFromTargetReset ? (weekPhotoCnt?.ops || 0) : Math.max(staff.achOps || 0, weekPhotoCnt?.ops || 0);
    const achTryOn = resetWeekly || isStaleFromTargetReset ? (weekPhotoCnt?.tryOn || 0) : Math.max(staff.achTryOn || 0, weekPhotoCnt?.tryOn || 0);
    const achWeeklySeed = resetWeekly || isStaleFromTargetReset ? (weekPhotoCnt?.seed || 0) : Math.max(staff.achWeeklySeed || 0, weekPhotoCnt?.seed || 0);
    const achChecklist = resetWeekly || isStaleFromTargetReset ? (weekPhotoCnt?.checklist || 0) : Math.max(staff.achChecklist || 0, weekPhotoCnt?.checklist || 0);

    const selfMonthly = extractValidMonthlyCounters(staff, currentMonthKey, targetResetAt);
    const prevMonthly = extractValidMonthlyCounters(prev, currentMonthKey, targetResetAt);

    const monthlyOps = Math.max(
      selfMonthly.ops,
      prevMonthly.ops,
      achOps,
      monthPhotoCnt?.ops || 0
    );
    const monthlyTryOn = Math.max(
      selfMonthly.tryOn,
      prevMonthly.tryOn,
      achTryOn,
      monthPhotoCnt?.tryOn || 0
    );
    const monthlyWeeklySeed = Math.max(
      selfMonthly.seed,
      prevMonthly.seed,
      achWeeklySeed,
      monthPhotoCnt?.seed || 0
    );
    const monthlyChecklist = Math.max(
      selfMonthly.checklist,
      prevMonthly.checklist,
      achChecklist,
      monthPhotoCnt?.checklist || 0
    );

    return {
      ...staff,
      achOps,
      achTryOn,
      achWeeklySeed,
      achChecklist,
      monthKey: currentMonthKey,
      monthlyOps,
      monthlyTryOn,
      monthlyWeeklySeed,
      monthlyChecklist,
      monthlyResetAt: staff.monthlyResetAt || targetResetAt || undefined
    };
  });
}
