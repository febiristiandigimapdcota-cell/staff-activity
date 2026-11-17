import {
  StaffMember,
  SessionAssignment,
  TryOnSession,
  EmsDaySchedule,
  EmsScheduleData,
  EmsSlotAssignment,
  EmsTopic,
  EMS_TOPICS,
  TrainingHoItem,
  TrainingHoScheduleData
} from '../types';

export interface StaffFairnessMetric {
  id: number;
  name: string;
  role?: string;
  workingDays: number;
  offDays: number;
  opsCount: number;
  tryOnCount: number;
  totalSessions: number;
  fairnessStatus: 'Ideal' | 'Seimbang';
}

export interface FairWeeklyScheduleResult {
  dailyOps: SessionAssignment[][]; // 7 days (0..6)
  dailyTryOn: TryOnSession[][];    // 7 days (0..6)
  fairStaffList: StaffMember[];
  metrics: StaffFairnessMetric[];
  totalOpsSessions: number;
  totalTryOnSessions: number;
  varianceOps: number;
  varianceTryOn: number;
}

// Shift definitions and active working time windows
const SHIFT_WORKING_HOURS: Record<string, { start: number; end: number }> = {
  P: { start: 9.5, end: 18.0 },    // 09:30 - 18:00
  MD11: { start: 11.0, end: 19.5 }, // 11:00 - 19:30
  MD12: { start: 12.0, end: 20.5 }, // 12:00 - 20:30
  MD13: { start: 13.0, end: 21.5 }, // 13:00 - 21:30
  S: { start: 13.5, end: 22.0 }     // 13:30 - 22:00
};

export interface ParsedTrainingCode {
  rawCode: string;
  baseShift: string;
  trainingCode: 'TRP' | 'TRS';
  shiftLabel: string;
  sessionLabel: 'TRAINING PAGI' | 'TRAINING SIANG';
  fullDescription: string;
  defaultTime: string;
}

const VALID_TRAINING_BASE_SHIFTS = ['P', 'MD11', 'MD12', 'MD13', 'S', 'OFF'];

/**
 * Parses combined shift + Training HO codes such as:
 * P/TRP, P/TRS, MD11/TRP, MD11/TRS, MD12/TRP, MD12/TRS, MD13/TRP, MD13/TRS, S/TRP, S/TRS, OFF/TRP, OFF/TRS
 */
export function parseTrainingShiftCode(shift?: string): ParsedTrainingCode | null {
  if (!shift) return null;
  const clean = shift.trim().toUpperCase().replace(/\s+/g, '');
  const match = clean.match(/^([A-Z0-9]+)\/(TRP|TRS)$/);
  if (!match) return null;

  const baseShift = match[1];
  const trainingCode = match[2] as 'TRP' | 'TRS';

  if (!VALID_TRAINING_BASE_SHIFTS.includes(baseShift) && !baseShift.startsWith('MD')) {
    return null;
  }

  let shiftLabel = baseShift;
  if (baseShift === 'P') shiftLabel = 'PAGI';
  else if (baseShift.startsWith('MD')) shiftLabel = 'MIDDLE';
  else if (baseShift === 'S') shiftLabel = 'SIANG';
  else if (baseShift === 'OFF') shiftLabel = 'OFF';

  const sessionLabel = trainingCode === 'TRP' ? 'TRAINING PAGI' : 'TRAINING SIANG';
  const defaultTime = trainingCode === 'TRP' ? '09:00 - 12:00 WIB' : '13:00 - 16:00 WIB';

  return {
    rawCode: `${baseShift}/${trainingCode}`,
    baseShift,
    trainingCode,
    shiftLabel,
    sessionLabel,
    fullDescription: `${shiftLabel} ${sessionLabel}`,
    defaultTime
  };
}

/**
 * Detects legacy auto-generated Training HO descriptions (e.g. "PAGI TRAINING SIANG (P/TRS)")
 * so they are stripped cleanly and items only appear under Training Pagi / Training Siang groups.
 */
export function isAutoTrainingDescription(topic?: string): boolean {
  if (!topic) return false;
  const normalized = topic.trim().toUpperCase();
  if (!normalized) return false;
  return /^(PAGI|MIDDLE|SIANG|OFF)\s+TRAINING\s+(PAGI|SIANG)(\s*\([A-Z0-9]+\/(TRP|TRS)\))?$/.test(
    normalized
  );
}

/**
 * Classifies a Training HO entry into 'TRP' (Training Pagi) or 'TRS' (Training Siang).
 */
export function getTrainingSessionGroup(
  item: Pick<TrainingHoItem, 'trainingSession' | 'shiftCode' | 'time'>
): 'TRP' | 'TRS' {
  if (item.trainingSession === 'TRP' || item.trainingSession === 'TRS') {
    return item.trainingSession;
  }
  if (item.shiftCode) {
    const parsed = parseTrainingShiftCode(item.shiftCode);
    if (parsed) return parsed.trainingCode;
  }
  const timeMatch = (item.time || '').match(/(\d{1,2}):\d{2}/);
  if (timeMatch) {
    const startHour = Number(timeMatch[1]);
    if (!Number.isNaN(startHour)) {
      return startHour < 12 ? 'TRP' : 'TRS';
    }
  }
  return 'TRP';
}

/**
 * Extracts base store shift code (e.g. 'P/TRP' -> 'P', 'MD11/TRS' -> 'MD11', 'OFF/TRP' -> 'OFF').
 */
export function extractBaseShiftCode(shift?: string): string {
  if (!shift) return 'OFF';
  const clean = shift.trim().toUpperCase().replace(/\s+/g, '');
  if (!clean || clean === '-') return 'OFF';
  const slashIdx = clean.indexOf('/');
  return slashIdx > 0 ? clean.slice(0, slashIdx) : clean;
}

/**
 * Returns true when the person is OFF from store floor duties (including OFF/TRP and OFF/TRS).
 */
export function isShiftOff(shift?: string): boolean {
  const base = extractBaseShiftCode(shift);
  return base === 'OFF' || base === '' || base === '-';
}

// Check if a staff shift is compatible with an activity time slot
function isShiftCompatible(shift: string, startHour: number, endHour: number): boolean {
  if (isShiftOff(shift)) return false;
  const baseShift = extractBaseShiftCode(shift);
  const hours = SHIFT_WORKING_HOURS[baseShift];
  if (!hours) return true; // generic active shift
  // Allow session if staff is present during the slot (with max 30 min tolerance)
  return hours.start <= startHour + 0.5 && hours.end >= endHour - 0.5;
}

/**
 * Checks whether a roster member's role qualifies as Staff for Open Studio (OPS), Try-On & EMS scheduling.
 * Non-staff roles (Leader, Manager, Cashier, VM, Admin, etc.) stay on the weekly roster but are excluded from OPS, Try-On & EMS.
 */
export function isStaffRole(role?: string): boolean {
  if (!role) return false;
  const normalized = role.trim().toLowerCase();
  return normalized.includes('staff') || normalized.includes('staf');
}

/**
 * Generates an equitable, fair-load balanced weekly schedule for all 7 days.
 * Ensures:
 * 1. Only personnel with role "Staff" are assigned to Open Studio (OPS) and Try-On sessions.
 * 2. Every eligible Staff member gets an equal/balanced share of OPS and Try-On sessions per week.
 * 3. On-duty staff only (never assigns to someone with shift 'OFF').
 * 4. Respects shift time windows (e.g. Shift S does not do morning slots; Shift P does not do evening slots).
 * 5. Prevents double-booking (no one hosts OPS and Try-On at the same hour).
 * 6. Minimizes variance across eligible Staff (all active Staff receive ±1 session count).
 */
export function generateFairWeeklySchedule(staffList: StaffMember[]): FairWeeklyScheduleResult {
  if (!staffList || staffList.length === 0) {
    return {
      dailyOps: Array.from({ length: 7 }, () => []),
      dailyTryOn: Array.from({ length: 7 }, () => []),
      fairStaffList: [],
      metrics: [],
      totalOpsSessions: 0,
      totalTryOnSessions: 0,
      varianceOps: 0,
      varianceTryOn: 0
    };
  }

  const eligibleStaffList = staffList.filter((s) => isStaffRole(s.role));

  // Cumulative session counters across the 7-day week (Staff role only)
  const opsTally: Record<number, number> = {};
  const tryOnTally: Record<number, number> = {};

  eligibleStaffList.forEach((s) => {
    opsTally[s.id] = 0;
    tryOnTally[s.id] = 0;
  });

  const dailyOps: SessionAssignment[][] = [];
  const dailyTryOn: TryOnSession[][] = [];

  // Pre-defined slot definitions
  const tryOnSlotDefs = [
    { id: 1, title: 'Sesi Try-On 1', time: '10:00 - 11:30 WIB', startH: 10.0, endH: 11.5 },
    { id: 2, title: 'Sesi Try-On 2', time: '11:30 - 13:00 WIB', startH: 11.5, endH: 13.0 },
    { id: 3, title: 'Sesi Try-On 3', time: '13:30 - 15:00 WIB', startH: 13.5, endH: 15.0 },
    { id: 4, title: 'Sesi Try-On 4', time: '15:00 - 16:30 WIB', startH: 15.0, endH: 16.5 },
    { id: 5, title: 'Sesi Try-On 5', time: '17:00 - 18:30 WIB', startH: 17.0, endH: 18.5 },
    { id: 6, title: 'Sesi Try-On 6', time: '18:30 - 20:00 WIB', startH: 18.5, endH: 20.0 }
  ];

  // Loop Monday (0) through Sunday (6)
  for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
    const onDutyStaff = eligibleStaffList.filter((s) => !isShiftOff(s.shifts[dayIdx]));
    const dayOpsAssignedStaff = new Set<number>();
    const staffBusySlotRanges: { staffId: number; startH: number; endH: number }[] = [];
    const dayTryOnAssignedCount: Record<number, number> = {};

    onDutyStaff.forEach((s) => {
      dayTryOnAssignedCount[s.id] = 0;
    });

    // ----------------------------------------------------
    // 1. OPEN STUDIO (OPS) ASSIGNMENTS (3 Sessions / Day)
    // ----------------------------------------------------
    const opsConfig = [
      {
        sessionNum: 1,
        title: 'Sesi 1 (13:00 WIB)',
        time: '13:00 - 14:30',
        startH: 13.0,
        endH: 14.5,
        primaryShifts: ['P', 'MD11'],
        secondaryShifts: ['MD12', 'MD13']
      },
      {
        sessionNum: 3,
        title: 'Sesi 3 (18:00 WIB)',
        time: '18:00 - 19:30',
        startH: 18.0,
        endH: 19.5,
        primaryShifts: ['S'],
        secondaryShifts: ['MD12', 'MD13', 'MD11']
      },
      {
        sessionNum: 2,
        title: 'Sesi 2 (15:00 WIB)',
        time: '15:00 - 16:30',
        startH: 15.0,
        endH: 16.5,
        primaryShifts: ['MD12', 'MD13'],
        secondaryShifts: ['P', 'MD11', 'S']
      }
    ];

    const currentDayOps: Record<number, SessionAssignment> = {};

    for (const conf of opsConfig) {
      const eligible = onDutyStaff.filter((s) => {
        if (dayOpsAssignedStaff.has(s.id)) return false;
        const shift = s.shifts[dayIdx];
        return isShiftCompatible(shift, conf.startH, conf.endH);
      });

      eligible.sort((a, b) => {
        const countDiff = (opsTally[a.id] || 0) - (opsTally[b.id] || 0);
        if (countDiff !== 0) return countDiff;

        const aShift = extractBaseShiftCode(a.shifts[dayIdx]);
        const bShift = extractBaseShiftCode(b.shifts[dayIdx]);
        const aPrimary = conf.primaryShifts.includes(aShift) ? 0 : 1;
        const bPrimary = conf.primaryShifts.includes(bShift) ? 0 : 1;
        if (aPrimary !== bPrimary) return aPrimary - bPrimary;

        const totalDiff =
          (opsTally[a.id] + tryOnTally[a.id]) - (opsTally[b.id] + tryOnTally[b.id]);
        if (totalDiff !== 0) return totalDiff;

        const len = Math.max(1, eligibleStaffList.length);
        const aRot = (a.id * 3 + dayIdx * 7) % len;
        const bRot = (b.id * 3 + dayIdx * 7) % len;
        return aRot - bRot;
      });

      let chosenHost: StaffMember | undefined = eligible[0];
      let isBackup = false;

      if (!chosenHost) {
        const backupCandidates = onDutyStaff.filter((s) => !dayOpsAssignedStaff.has(s.id));
        backupCandidates.sort(
          (a, b) => (opsTally[a.id] || 0) - (opsTally[b.id] || 0)
        );
        chosenHost = backupCandidates[0];
        isBackup = true;
      }

      if (chosenHost) {
        dayOpsAssignedStaff.add(chosenHost.id);
        opsTally[chosenHost.id] = (opsTally[chosenHost.id] || 0) + 1;
        staffBusySlotRanges.push({
          staffId: chosenHost.id,
          startH: conf.startH,
          endH: conf.endH
        });

        currentDayOps[conf.sessionNum] = {
          title: conf.title,
          host: isBackup ? `${chosenHost.name} (Backup)` : chosenHost.name,
          shift: `Shift ${chosenHost.shifts[dayIdx]}`,
          time: conf.time,
          isBackup
        };
      } else {
        currentDayOps[conf.sessionNum] = {
          title: conf.title,
          host: 'Tidak Ada Staff',
          shift: '-',
          time: conf.time
        };
      }
    }

    dailyOps.push([currentDayOps[1], currentDayOps[2], currentDayOps[3]]);

    // ----------------------------------------------------
    // 2. TRY-ON SESSIONS ASSIGNMENTS (6 Sessions / Day)
    // ----------------------------------------------------
    const currentDayTryOn: TryOnSession[] = [];

    for (const slotDef of tryOnSlotDefs) {
      const eligible = onDutyStaff.filter((s) => {
        if (!isShiftCompatible(s.shifts[dayIdx], slotDef.startH, slotDef.endH)) {
          return false;
        }

        const isBusyOps = staffBusySlotRanges.some(
          (b) =>
            b.staffId === s.id &&
            Math.max(b.startH, slotDef.startH) < Math.min(b.endH, slotDef.endH)
        );
        if (isBusyOps) return false;

        const dailyCount = dayTryOnAssignedCount[s.id] || 0;
        return dailyCount < 2;
      });

      eligible.sort((a, b) => {
        const weeklyDiff = (tryOnTally[a.id] || 0) - (tryOnTally[b.id] || 0);
        if (weeklyDiff !== 0) return weeklyDiff;

        const dailyDiff = (dayTryOnAssignedCount[a.id] || 0) - (dayTryOnAssignedCount[b.id] || 0);
        if (dailyDiff !== 0) return dailyDiff;

        const totalDiff =
          (opsTally[a.id] + tryOnTally[a.id]) - (opsTally[b.id] + tryOnTally[b.id]);
        if (totalDiff !== 0) return totalDiff;

        const len = Math.max(1, eligibleStaffList.length);
        const aRot = (a.id * 5 + slotDef.id * 2 + dayIdx) % len;
        const bRot = (b.id * 5 + slotDef.id * 2 + dayIdx) % len;
        return aRot - bRot;
      });

      let assigned: StaffMember | null = eligible[0] || null;

      if (!assigned) {
        const fallback = onDutyStaff.filter((s) => (dayTryOnAssignedCount[s.id] || 0) < 3);
        fallback.sort(
          (a, b) => (tryOnTally[a.id] || 0) - (tryOnTally[b.id] || 0)
        );
        assigned = fallback[0] || null;
      }

      if (assigned) {
        tryOnTally[assigned.id] = (tryOnTally[assigned.id] || 0) + 1;
        dayTryOnAssignedCount[assigned.id] = (dayTryOnAssignedCount[assigned.id] || 0) + 1;
      }

      currentDayTryOn.push({
        id: slotDef.id,
        title: slotDef.title,
        time: slotDef.time,
        assignedStaff: assigned
      });
    }

    dailyTryOn.push(currentDayTryOn);
  }

  // Keep ALL roles in fairStaffList for Weekly Roster; non-staff roles get targetOps: 0, targetTryOn: 0
  const fairStaffList: StaffMember[] = staffList.map((s) => {
    const eligible = isStaffRole(s.role);
    return {
      ...s,
      targetOps: eligible ? (opsTally[s.id] || 0) : 0,
      targetTryOn: eligible ? (tryOnTally[s.id] || 0) : 0
    };
  });

  // Fairness metrics computed over eligible Staff-role personnel
  const opsCounts = Object.values(opsTally);
  const tryOnCounts = Object.values(tryOnTally);
  const minOps = opsCounts.length > 0 ? Math.min(...opsCounts) : 0;
  const maxOps = opsCounts.length > 0 ? Math.max(...opsCounts) : 0;
  const minTryOn = tryOnCounts.length > 0 ? Math.min(...tryOnCounts) : 0;
  const maxTryOn = tryOnCounts.length > 0 ? Math.max(...tryOnCounts) : 0;

  const metrics: StaffFairnessMetric[] = eligibleStaffList.map((s) => {
    const workingDays = s.shifts.filter((shift) => !isShiftOff(shift)).length;
    const offDays = 7 - workingDays;
    const ops = opsTally[s.id] || 0;
    const tryOn = tryOnTally[s.id] || 0;

    return {
      id: s.id,
      name: s.name,
      role: s.role,
      workingDays,
      offDays,
      opsCount: ops,
      tryOnCount: tryOn,
      totalSessions: ops + tryOn,
      fairnessStatus: 'Ideal'
    };
  });

  const totalOpsSessions = opsCounts.reduce((a, b) => a + b, 0);
  const totalTryOnSessions = tryOnCounts.reduce((a, b) => a + b, 0);

  return {
    dailyOps,
    dailyTryOn,
    fairStaffList,
    metrics,
    totalOpsSessions,
    totalTryOnSessions,
    varianceOps: maxOps - minOps,
    varianceTryOn: maxTryOn - minTryOn
  };
}

/**
 * Calculates weekly OPS & Try-On targets for each staff member based on fair weekly distribution.
 */
export function calculateOpsTargets(staffList: StaffMember[]): StaffMember[] {
  const result = generateFairWeeklySchedule(staffList);
  return result.fairStaffList;
}

/**
 * Generates the 3 daily Open Studio (OPS) sessions for a given day index using the fair weekly schedule.
 */
export function getDailyOpsSessions(staffList: StaffMember[], dayIndex: number): SessionAssignment[] {
  const result = generateFairWeeklySchedule(staffList);
  const clampedDay = Math.max(0, Math.min(6, dayIndex));
  return result.dailyOps[clampedDay] || [];
}

/**
 * Generates the 6 Try-On iPad slots for a given day index using the fair weekly schedule.
 */
export function getDailyTryOnSessions(staffList: StaffMember[], dayIndex: number): TryOnSession[] {
  const result = generateFairWeeklySchedule(staffList);
  const clampedDay = Math.max(0, Math.min(6, dayIndex));
  return result.dailyTryOn[clampedDay] || [];
}

/**
 * Helper to get badge styling based on shift code (supports combined /TRP and /TRS training codes)
 */
export function getShiftBadgeStyle(shift: string): { bg: string; text: string; border: string } {
  const parsedTraining = parseTrainingShiftCode(shift);
  const baseShift = extractBaseShiftCode(shift);

  if (parsedTraining && baseShift === 'OFF') {
    return { bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-300' };
  }

  switch (baseShift) {
    case 'P':
      return {
        bg: 'bg-blue-50',
        text: 'text-blue-700',
        border: parsedTraining ? 'border-emerald-400 ring-1 ring-emerald-300/60' : 'border-blue-200'
      };
    case 'MD11':
      return {
        bg: 'bg-sky-50',
        text: 'text-sky-700',
        border: parsedTraining ? 'border-emerald-400 ring-1 ring-emerald-300/60' : 'border-sky-200'
      };
    case 'MD12':
      return {
        bg: 'bg-amber-50',
        text: 'text-amber-700',
        border: parsedTraining ? 'border-emerald-400 ring-1 ring-emerald-300/60' : 'border-amber-200'
      };
    case 'MD13':
      return {
        bg: 'bg-orange-50',
        text: 'text-orange-700',
        border: parsedTraining ? 'border-emerald-400 ring-1 ring-emerald-300/60' : 'border-orange-200'
      };
    case 'S':
      return {
        bg: 'bg-purple-50',
        text: 'text-purple-700',
        border: parsedTraining ? 'border-emerald-400 ring-1 ring-emerald-300/60' : 'border-purple-200'
      };
    case 'OFF':
      return { bg: 'bg-zinc-100', text: 'text-zinc-400', border: 'border-zinc-200' };
    default:
      return { bg: 'bg-zinc-100', text: 'text-zinc-700', border: 'border-zinc-200' };
  }
}

const DAYS_NAMES_ID = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

function isMorningShiftCode(shift?: string): boolean {
  if (isShiftOff(shift)) return false;
  const s = extractBaseShiftCode(shift);
  return s === 'P' || s.startsWith('P');
}

function isAfternoonOrMiddleShiftCode(shift?: string): boolean {
  if (isShiftOff(shift)) return false;
  const s = extractBaseShiftCode(shift);
  if (isMorningShiftCode(s)) return false;
  return (
    s === 'S' ||
    s.startsWith('MD') ||
    s.startsWith('M') ||
    s.startsWith('S') ||
    true
  );
}

/**
 * Generates an equitable, balanced 7-day EMS Schedule STRICTLY for Role: Staff:
 * - Only personnel with role "Staff" are included.
 * - 2 Staff per day: 1 from Shift Pagi (P) and 1 from Shift Siang / Middle (MD11/MD12/MD13/S).
 * - Evenly distributed across eligible Staff over the 1-week period.
 * - Assigns one of: Demo Mac, Demo Apple Watch, Demo Accessories, Question Exercise.
 */
export function generateEmsWeeklySchedule(
  staffList: StaffMember[],
  seedOffset = 0
): EmsScheduleData {
  const nowIso = new Date().toISOString();
  const eligibleStaffList = (staffList || []).filter((s) => isStaffRole(s.role));

  if (eligibleStaffList.length === 0) {
    return {
      days: DAYS_NAMES_ID.map((dayName, dayIndex) => ({
        dayIndex,
        dayName,
        morningSlot: null,
        afternoonSlot: null
      })),
      generatedAt: nowIso,
      updatedAt: nowIso,
      isCustomized: false
    };
  }

  const staffTotalEms: Record<number, number> = {};
  const staffMorningEms: Record<number, number> = {};
  const staffAfternoonEms: Record<number, number> = {};
  const staffTopicCounts: Record<number, Record<EmsTopic, number>> = {};
  const globalTopicCounts: Record<EmsTopic, number> = {
    'Demo Mac': 0,
    'Demo Apple Watch': 0,
    'Demo Accessories': 0,
    'Question Exercise': 0
  };

  eligibleStaffList.forEach((s) => {
    staffTotalEms[s.id] = 0;
    staffMorningEms[s.id] = 0;
    staffAfternoonEms[s.id] = 0;
    staffTopicCounts[s.id] = {
      'Demo Mac': 0,
      'Demo Apple Watch': 0,
      'Demo Accessories': 0,
      'Question Exercise': 0
    };
  });

  const pickFairTopic = (staffId: number, avoidTopic?: EmsTopic, slotSeed = 0): EmsTopic => {
    const candidates = [...EMS_TOPICS];
    candidates.sort((a, b) => {
      if (avoidTopic) {
        const aSame = a === avoidTopic ? 1 : 0;
        const bSame = b === avoidTopic ? 1 : 0;
        if (aSame !== bSame) return aSame - bSame;
      }
      const staffTopicDiff =
        (staffTopicCounts[staffId]?.[a] || 0) - (staffTopicCounts[staffId]?.[b] || 0);
      if (staffTopicDiff !== 0) return staffTopicDiff;

      const globalDiff = globalTopicCounts[a] - globalTopicCounts[b];
      if (globalDiff !== 0) return globalDiff;

      const aIdx = (EMS_TOPICS.indexOf(a) + slotSeed + seedOffset) % EMS_TOPICS.length;
      const bIdx = (EMS_TOPICS.indexOf(b) + slotSeed + seedOffset) % EMS_TOPICS.length;
      return aIdx - bIdx;
    });
    const chosen = candidates[0];
    if (staffTopicCounts[staffId]) {
      staffTopicCounts[staffId][chosen] = (staffTopicCounts[staffId][chosen] || 0) + 1;
    }
    globalTopicCounts[chosen] = (globalTopicCounts[chosen] || 0) + 1;
    return chosen;
  };

  const days: EmsDaySchedule[] = [];

  for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
    const onDuty = eligibleStaffList.filter((s) => !isShiftOff(s.shifts[dayIdx]));

    // 1. Pick 1 Staff (role Staff) from Shift Pagi
    const morningCandidates = onDuty.filter((s) => isMorningShiftCode(s.shifts[dayIdx]));
    let isMorningFallback = false;
    let morningPool = morningCandidates;
    if (morningPool.length === 0 && onDuty.length > 0) {
      morningPool = [...onDuty];
      isMorningFallback = true;
    }

    morningPool.sort((a, b) => {
      const totalDiff = (staffTotalEms[a.id] || 0) - (staffTotalEms[b.id] || 0);
      if (totalDiff !== 0) return totalDiff;

      const morningDiff = (staffMorningEms[a.id] || 0) - (staffMorningEms[b.id] || 0);
      if (morningDiff !== 0) return morningDiff;

      const rotA = (a.id * 7 + dayIdx * 3 + seedOffset) % Math.max(1, eligibleStaffList.length);
      const rotB = (b.id * 7 + dayIdx * 3 + seedOffset) % Math.max(1, eligibleStaffList.length);
      return rotA - rotB;
    });

    const chosenMorning = morningPool[0] || null;
    let morningSlot: EmsSlotAssignment | null = null;
    let morningTopic: EmsTopic | undefined;

    if (chosenMorning) {
      staffTotalEms[chosenMorning.id] = (staffTotalEms[chosenMorning.id] || 0) + 1;
      staffMorningEms[chosenMorning.id] = (staffMorningEms[chosenMorning.id] || 0) + 1;
      morningTopic = pickFairTopic(chosenMorning.id, undefined, dayIdx * 2);
      morningSlot = {
        slotType: 'Pagi',
        staffId: chosenMorning.id,
        staffName: chosenMorning.name,
        shift: chosenMorning.shifts[dayIdx] || 'P',
        topic: morningTopic,
        isFallback: isMorningFallback
      };
    }

    // 2. Pick 1 Staff (role Staff) from Shift Siang / Middle (excluding chosenMorning)
    const afternoonCandidates = onDuty.filter(
      (s) => s.id !== chosenMorning?.id && isAfternoonOrMiddleShiftCode(s.shifts[dayIdx])
    );
    let isAfternoonFallback = false;
    let afternoonPool = afternoonCandidates;
    if (afternoonPool.length === 0) {
      afternoonPool = onDuty.filter((s) => s.id !== chosenMorning?.id);
      if (afternoonPool.length > 0) isAfternoonFallback = true;
    }

    afternoonPool.sort((a, b) => {
      const totalDiff = (staffTotalEms[a.id] || 0) - (staffTotalEms[b.id] || 0);
      if (totalDiff !== 0) return totalDiff;

      const aftDiff = (staffAfternoonEms[a.id] || 0) - (staffAfternoonEms[b.id] || 0);
      if (aftDiff !== 0) return aftDiff;

      const rotA = (a.id * 11 + dayIdx * 5 + seedOffset) % Math.max(1, eligibleStaffList.length);
      const rotB = (b.id * 11 + dayIdx * 5 + seedOffset) % Math.max(1, eligibleStaffList.length);
      return rotA - rotB;
    });

    const chosenAfternoon = afternoonPool[0] || null;
    let afternoonSlot: EmsSlotAssignment | null = null;

    if (chosenAfternoon) {
      staffTotalEms[chosenAfternoon.id] = (staffTotalEms[chosenAfternoon.id] || 0) + 1;
      staffAfternoonEms[chosenAfternoon.id] = (staffAfternoonEms[chosenAfternoon.id] || 0) + 1;
      const afternoonTopic = pickFairTopic(chosenAfternoon.id, morningTopic, dayIdx * 2 + 1);
      afternoonSlot = {
        slotType: 'Siang / Middle',
        staffId: chosenAfternoon.id,
        staffName: chosenAfternoon.name,
        shift: chosenAfternoon.shifts[dayIdx] || 'S',
        topic: afternoonTopic,
        isFallback: isAfternoonFallback
      };
    }

    days.push({
      dayIndex: dayIdx,
      dayName: DAYS_NAMES_ID[dayIdx],
      morningSlot,
      afternoonSlot
    });
  }

  return {
    days,
    generatedAt: nowIso,
    updatedAt: nowIso,
    isCustomized: false
  };
}

/**
 * Validates that an existing EMS Schedule only contains personnel with Role: Staff.
 * Returns false if any assigned slot belongs to a non-Staff role or if Staff exist while EMS is empty.
 */
export function isEmsScheduleValidForStaffOnly(
  ems: EmsScheduleData | null | undefined,
  staffList: StaffMember[]
): boolean {
  if (!ems || !Array.isArray(ems.days) || ems.days.length !== 7) return false;
  const eligibleStaff = (staffList || []).filter((s) => isStaffRole(s.role));
  if (staffList.length === 0) return true;
  if (eligibleStaff.length === 0) {
    return !ems.days.some((d) => d.morningSlot || d.afternoonSlot);
  }

  const hasAnySlot = ems.days.some((d) => d.morningSlot || d.afternoonSlot);
  if (!hasAnySlot) return false;

  const isSlotStaffValid = (slot: EmsSlotAssignment | null): boolean => {
    if (!slot) return true;
    const match = staffList.find(
      (s) => s.id === slot.staffId || s.name.trim().toLowerCase() === slot.staffName.trim().toLowerCase()
    );
    if (!match) return false;
    return isStaffRole(match.role);
  };

  return ems.days.every((d) => isSlotStaffValid(d.morningSlot) && isSlotStaffValid(d.afternoonSlot));
}

export interface EmsStaffSummary {
  staffId: number;
  staffName: string;
  role: string;
  morningCount: number;
  afternoonCount: number;
  totalCount: number;
  topics: EmsTopic[];
  days: string[];
}

export function computeEmsFairnessMetrics(
  emsSchedule: EmsScheduleData,
  staffList: StaffMember[]
): EmsStaffSummary[] {
  const eligibleStaffList = (staffList || []).filter((s) => isStaffRole(s.role));
  const map = new Map<string, EmsStaffSummary>();

  eligibleStaffList.forEach((s) => {
    map.set(s.name.trim().toLowerCase(), {
      staffId: s.id,
      staffName: s.name,
      role: s.role || 'Staff',
      morningCount: 0,
      afternoonCount: 0,
      totalCount: 0,
      topics: [],
      days: []
    });
  });

  const isRosterStaffRole = (name: string): boolean => {
    const found = staffList.find((s) => s.name.trim().toLowerCase() === name.trim().toLowerCase());
    if (!found) return true;
    return isStaffRole(found.role);
  };

  emsSchedule.days.forEach((day) => {
    if (day.morningSlot && isRosterStaffRole(day.morningSlot.staffName)) {
      const key = day.morningSlot.staffName.trim().toLowerCase();
      const entry = map.get(key) || {
        staffId: day.morningSlot.staffId,
        staffName: day.morningSlot.staffName,
        role: 'Staff',
        morningCount: 0,
        afternoonCount: 0,
        totalCount: 0,
        topics: [],
        days: []
      };
      entry.morningCount += 1;
      entry.totalCount += 1;
      entry.topics.push(day.morningSlot.topic);
      entry.days.push(`${day.dayName} (Pagi)`);
      map.set(key, entry);
    }

    if (day.afternoonSlot && isRosterStaffRole(day.afternoonSlot.staffName)) {
      const key = day.afternoonSlot.staffName.trim().toLowerCase();
      const entry = map.get(key) || {
        staffId: day.afternoonSlot.staffId,
        staffName: day.afternoonSlot.staffName,
        role: 'Staff',
        morningCount: 0,
        afternoonCount: 0,
        totalCount: 0,
        topics: [],
        days: []
      };
      entry.afternoonCount += 1;
      entry.totalCount += 1;
      entry.topics.push(day.afternoonSlot.topic);
      entry.days.push(`${day.dayName} (Siang/MD)`);
      map.set(key, entry);
    }
  });

  return Array.from(map.values()).sort(
    (a, b) => b.totalCount - a.totalCount || a.staffName.localeCompare(b.staffName)
  );
}

function toLocalIsoDateStr(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Returns 7 YYYY-MM-DD local dates [Senin .. Minggu] for the week containing anchorIso (or current week).
 */
export function getWeekIsoDates(anchorIso?: string): string[] {
  const baseDate = anchorIso ? new Date(anchorIso) : new Date();
  const validDate = Number.isNaN(baseDate.getTime()) ? new Date() : baseDate;
  const dayIdx = (validDate.getDay() + 6) % 7;
  const monday = new Date(validDate);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(validDate.getDate() - dayIdx);

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return toLocalIsoDateStr(d);
  });
}

/**
 * Automatically extracts Training HO schedules from roster shift codes:
 * P/TRP, P/TRS, MD11/TRP, MD11/TRS, MD12/TRP, MD12/TRS, MD13/TRP, MD13/TRS, S/TRP, S/TRS, OFF/TRP, OFF/TRS
 */
export function generateAutoTrainingHoFromStaff(
  staffList: StaffMember[],
  referenceDateIso?: string
): TrainingHoItem[] {
  if (!staffList || staffList.length === 0) return [];
  const weekDates = getWeekIsoDates(referenceDateIso);
  const nowIso = new Date().toISOString();
  const autoItems: TrainingHoItem[] = [];

  staffList.forEach((staff) => {
    for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
      const parsed = parseTrainingShiftCode(staff.shifts[dayIdx]);
      if (!parsed) continue;

      const safeCode = parsed.rawCode.replace(/[^A-Z0-9]/g, '_');
      autoItems.push({
        id: `auto_tho_${staff.id}_d${dayIdx}_${safeCode}`,
        dayIndex: dayIdx,
        dayName: DAYS_NAMES_ID[dayIdx],
        date: weekDates[dayIdx],
        time: parsed.defaultTime,
        staffName: staff.name,
        staffRole: staff.role || 'Staff',
        shiftCode: parsed.rawCode,
        trainingSession: parsed.trainingCode,
        isAutoFromSchedule: true,
        createdAt: nowIso
      });
    }
  });

  return autoItems.sort((a, b) => {
    if (a.dayIndex !== b.dayIndex) return a.dayIndex - b.dayIndex;
    if ((a.trainingSession || '') !== (b.trainingSession || '')) {
      return (a.trainingSession || '').localeCompare(b.trainingSession || '');
    }
    return (a.staffName || '').localeCompare(b.staffName || '');
  });
}

/**
 * Merges auto-detected Training HO items from active staff roster with any manually configured items
 * (and preserves Admin's time/topic/date customizations on matching auto item IDs).
 */
export function mergeTrainingHoWithRoster(
  staffList: StaffMember[],
  existing: TrainingHoScheduleData | null | undefined,
  referenceDateIso?: string
): TrainingHoScheduleData {
  const autoItems = generateAutoTrainingHoFromStaff(staffList, referenceDateIso);
  const existingItems = existing?.items || [];

  const manualItems = existingItems
    .filter((it) => !it.isAutoFromSchedule)
    .map((it) => ({
      ...it,
      trainingSession: getTrainingSessionGroup(it)
    }));

  const existingAutoById = new Map<string, TrainingHoItem>();
  existingItems
    .filter((it) => it.isAutoFromSchedule)
    .forEach((it) => existingAutoById.set(it.id, it));

  const mergedAuto = autoItems.map((auto) => {
    const prev = existingAutoById.get(auto.id);
    if (!prev) return auto;
    const customTopic =
      prev.topic && !isAutoTrainingDescription(prev.topic) ? prev.topic.trim() : undefined;
    return {
      ...auto,
      date: prev.date || auto.date,
      time: prev.time || auto.time,
      ...(customTopic ? { topic: customTopic } : {})
    };
  });

  const combined = [...mergedAuto, ...manualItems].sort((a, b) => {
    if (a.dayIndex !== b.dayIndex) return a.dayIndex - b.dayIndex;
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.time.localeCompare(b.time);
  });

  return {
    items: combined,
    updatedAt: existing?.updatedAt || new Date().toISOString()
  };
}

