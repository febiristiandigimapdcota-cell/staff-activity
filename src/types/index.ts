export type ShiftType = 'P' | 'MD11' | 'MD12' | 'MD13' | 'S' | 'OFF' | string;

export interface StaffMember {
  id: number;
  name: string;
  role?: string;
  shifts: ShiftType[]; // 7 days: 0 = Senin ... 6 = Minggu
  targetOps: number;
  targetTryOn?: number;
  achOps: number;
  achTryOn: number;
  achWeeklySeed?: number;
  achChecklist?: number;
  monthKey?: string;
  monthlyOps?: number;
  monthlyTryOn?: number;
  monthlyWeeklySeed?: number;
  monthlyChecklist?: number;
  monthlyResetAt?: string;
}

export interface StaffProfile {
  id: string;
  name: string;
  role?: string;
  photoUrl: string;
  nik: string;
  email: string;
  joinDate?: string;
  workTenure?: string;
  updatedAt: string;
}

export type CustomerType = 'iPhone Purchaser' | 'Browser';

export type ActivityType =
  | 'OPS'
  | 'TryOn'
  | 'TryOn_iPad'
  | 'TryOn_AirPods'
  | 'TryOn_Watch'
  | 'WeeklySeed'
  | 'Checklist';

export interface PhotoRecord {
  id: number;
  staffName: string;
  activityType: ActivityType;
  note: string;
  photoUrl: string; // Base64 data URL
  timestamp: string;
  syncedToDrive: boolean;
  driveFileId?: string;
  driveWebViewLink?: string;
  customerType?: CustomerType;
  programCampaign?: string;
}

export interface AppConfig {
  adminPin: string;
  adminDriveUrl: string;
  adminDriveScriptUrl: string;
  adminDriveFolderId?: string;
  adminDriveFolderLink?: string;
  adminSubfolderLinks?: Record<string, string>;
}

export interface SessionAssignment {
  title: string;
  host: string;
  shift: string;
  time: string;
  isBackup?: boolean;
}

export interface TryOnSession {
  id: number;
  title: string;
  time: string;
  assignedStaff: StaffMember | null;
}

export type ViewType = 'overview' | 'schedule' | 'staff-overview' | 'proof-upload' | 'cashier' | 'admin' | 'links';

export type EmsTopic =
  | 'Demo Mac'
  | 'Demo Apple Watch'
  | 'Demo Accessories'
  | 'Question Exercise';

export const EMS_TOPICS: EmsTopic[] = [
  'Demo Mac',
  'Demo Apple Watch',
  'Demo Accessories',
  'Question Exercise'
];

export interface EmsSlotAssignment {
  slotType: 'Pagi' | 'Siang / Middle';
  staffId: number;
  staffName: string;
  shift: string;
  topic: EmsTopic;
  isFallback?: boolean;
}

export interface EmsDaySchedule {
  dayIndex: number; // 0 = Senin ... 6 = Minggu
  dayName: string;
  morningSlot: EmsSlotAssignment | null;
  afternoonSlot: EmsSlotAssignment | null;
}

export interface EmsScheduleData {
  days: EmsDaySchedule[];
  generatedAt: string;
  updatedAt: string;
  isCustomized?: boolean;
}

export interface StaffStatsRecord {
  name: string;
  achOps: number;
  achTryOn: number;
  achWeeklySeed: number;
  achChecklist: number;
  monthKey?: string;
  monthlyOps?: number;
  monthlyTryOn?: number;
  monthlyWeeklySeed?: number;
  monthlyChecklist?: number;
  monthlyResetAt?: string;
  updatedAt: string;
}

export interface TrainingHoItem {
  id: string;
  dayIndex: number; // 0 = Senin ... 6 = Minggu
  dayName: string;  // 'Senin' ... 'Minggu'
  date: string;     // YYYY-MM-DD
  time: string;     // e.g. '09:00 - 12:00 WIB'
  topic?: string;
  staffName?: string;
  staffRole?: string;
  shiftCode?: string; // e.g. 'P/TRP', 'MD11/TRS', 'OFF/TRP'
  trainingSession?: 'TRP' | 'TRS';
  isAutoFromSchedule?: boolean;
  createdAt?: string;
}

export interface TrainingHoScheduleData {
  items: TrainingHoItem[];
  updatedAt: string;
}

