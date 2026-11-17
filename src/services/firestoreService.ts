import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  getDocFromServer,
  getDocsFromServer,
  getDocs,
  query,
  where,
  orderBy,
  writeBatch,
  increment,
  Firestore,
  Unsubscribe
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  StaffMember,
  PhotoRecord,
  AppConfig,
  ActivityType,
  EmsScheduleData,
  StaffStatsRecord,
  TrainingHoScheduleData,
  TrainingHoItem,
  StaffProfile
} from '../types';
import { isDummyStaffRoster } from '../data/defaultData';
import {
  getCurrentMonthKey,
  isPhotoInActiveMonthlyPeriod,
  isPhotoInCurrentScheduleWeek,
  extractValidMonthlyCounters,
  countPhotosByStaff,
  isTryOnActivity,
  normalizeStaffKey
} from '../utils/periodHelper';
import { auth } from './firebaseAuth';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

let dbInstance: Firestore;
try {
  // App-level IndexedDB + BroadcastChannel handles offline caching & cross-tab sync,
  // avoiding Firestore SDK's persistentMultipleTabManager race conditions (b815 / removeAndCleanupTarget).
  dbInstance = initializeFirestore(
    app,
    {
      localCache: memoryLocalCache(),
      experimentalAutoDetectLongPolling: true
    },
    firebaseConfig.firestoreDatabaseId
  );
} catch {
  dbInstance = getFirestore(app, firebaseConfig.firestoreDatabaseId);
}
export const db = dbInstance;

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
  };
}

type QuotaStatusListener = (isQuotaExceeded: boolean, message?: string) => void;
const quotaListeners = new Set<QuotaStatusListener>();
let lastQuotaExceededState = false;

export function subscribeToQuotaStatus(listener: QuotaStatusListener): () => void {
  quotaListeners.add(listener);
  if (lastQuotaExceededState) {
    listener(true, 'Kuota baca harian Cloud Firestore tercapai.');
  }
  return () => {
    quotaListeners.delete(listener);
  };
}

function notifyQuotaRecovered() {
  if (lastQuotaExceededState) {
    lastQuotaExceededState = false;
    quotaListeners.forEach((l) => l(false));
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errMsg = error instanceof Error ? error.message : String(error);
  const errInfo: FirestoreErrorInfo = {
    error: errMsg,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
    },
    operationType,
    path
  };
  console.warn('Firestore Notice:', JSON.stringify(errInfo));

  const lower = errMsg.toLowerCase();
  if (lower.includes('quota exceeded') || lower.includes('resource-exhausted')) {
    lastQuotaExceededState = true;
    quotaListeners.forEach((l) => l(true, errMsg));
  }
}

export async function testFirestoreConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'config', 'connection_test'));
    return true;
  } catch {
    return false;
  }
}

export function subscribeToStaff(
  onData: (staff: StaffMember[]) => void
): Unsubscribe {
  try {
    const colRef = collection(db, 'staff');

    return onSnapshot(
      colRef,
      async (snapshot) => {
        if (snapshot.empty) {
          onData([]);
          return;
        }

        const currentMonthKey = getCurrentMonthKey();
        const list: StaffMember[] = [];
        snapshot.forEach((d) => {
          const data = d.data();
          let parsedShifts = ['OFF', 'OFF', 'OFF', 'OFF', 'OFF', 'OFF', 'OFF'];
          if (Array.isArray(data.shifts)) {
            parsedShifts = data.shifts;
          } else if (typeof data.shifts === 'string') {
            try {
              const parsed = JSON.parse(data.shifts);
              if (Array.isArray(parsed)) {
                parsedShifts = parsed;
              } else if (typeof parsed === 'string') {
                try {
                  const secondParse = JSON.parse(parsed);
                  if (Array.isArray(secondParse)) parsedShifts = secondParse;
                } catch {
                  parsedShifts = parsed.split(',');
                }
              }
            } catch {
              parsedShifts = data.shifts.split(',');
            }
          }

          const rawMonthKey = typeof data.monthKey === 'string' ? data.monthKey : '';
          const isSameMonth = !rawMonthKey || rawMonthKey === currentMonthKey;

          list.push({
            id: Number(data.id),
            name: data.name,
            role: data.role || 'Specialist',
            shifts: parsedShifts,
            targetOps: Number(data.targetOps) || 0,
            achOps: Number(data.achOps) || 0,
            achTryOn: Number(data.achTryOn) || 0,
            achWeeklySeed: Number(data.achWeeklySeed) || 0,
            achChecklist: Number(data.achChecklist) || 0,
            monthKey: currentMonthKey,
            monthlyOps: isSameMonth
              ? (data.monthlyOps !== undefined ? Number(data.monthlyOps) || 0 : Number(data.achOps) || 0)
              : 0,
            monthlyTryOn: isSameMonth
              ? (data.monthlyTryOn !== undefined ? Number(data.monthlyTryOn) || 0 : Number(data.achTryOn) || 0)
              : 0,
            monthlyWeeklySeed: isSameMonth
              ? (data.monthlyWeeklySeed !== undefined ? Number(data.monthlyWeeklySeed) || 0 : Number(data.achWeeklySeed) || 0)
              : 0,
            monthlyChecklist: isSameMonth
              ? (data.monthlyChecklist !== undefined ? Number(data.monthlyChecklist) || 0 : Number(data.achChecklist) || 0)
              : 0,
            monthlyResetAt: isSameMonth && typeof data.monthlyResetAt === 'string' ? data.monthlyResetAt : undefined
          });
        });

        // Detect and clean up dummy example staff (e.g. Rina Marlina & friends)
        if (isDummyStaffRoster(list)) {
          console.log('Dummy sample staff detected, purging from Firestore...');
          try {
            const batch = writeBatch(db);
            snapshot.docs.forEach((docSnap) => batch.delete(docSnap.ref));
            await batch.commit();
          } catch (e) {
            console.warn('Failed to clean dummy staff from Firestore:', e);
          }
          onData([]);
          return;
        }

        list.sort((a, b) => a.id - b.id);
        onData(list);
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, 'staff');
      }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, 'staff');
    return () => {};
  }
}

export function subscribeToPhotos(
  onData: (photos: PhotoRecord[], meta: { fromCache: boolean }) => void
): Unsubscribe {
  try {
    const colRef = collection(db, 'photos');

    return onSnapshot(
      colRef,
      (snapshot) => {
        if (!snapshot.metadata.fromCache) {
          notifyQuotaRecovered();
        }
        const list: PhotoRecord[] = [];
        snapshot.forEach((d) => {
          const data = d.data();
          list.push({
            id: Number(data.id) || 0,
            staffName: data.staffName || 'Staf Toko',
            activityType: data.activityType || 'OPS',
            note: data.note || '',
            photoUrl: data.photoUrl || '',
            timestamp: data.timestamp || '',
            syncedToDrive: Boolean(data.syncedToDrive),
            driveFileId: data.driveFileId,
            driveWebViewLink: data.driveWebViewLink,
            customerType: data.customerType || undefined,
            programCampaign: data.programCampaign || undefined
          });
        });
        // Sort descending by ID (newest first)
        list.sort((a, b) => b.id - a.id);
        onData(list, { fromCache: snapshot.metadata.fromCache });
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, 'photos');
      }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, 'photos');
    return () => {};
  }
}

export function subscribeToConfig(onData: (config: AppConfig) => void): Unsubscribe {
  try {
    const docRef = doc(db, 'config', 'store');

    return onSnapshot(
      docRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          const rawPin = data.adminPin;
          const adminPin = (!rawPin || rawPin === '1234') ? 'admin' : rawPin;
          
          let driveUrl = data.adminDriveUrl;
          if (!driveUrl || driveUrl.includes('1_byBZcKJq9gRQbrHOsOVIRlPZQzVwPn2') || driveUrl.includes('my-drive')) {
            driveUrl = 'https://drive.google.com/drive/folders/1k274pmYI5tvjYyyY6KwRqkTghZl8TpUB?usp=share_link';
          }

          let subfolderLinks: Record<string, string> | undefined = undefined;
          if (data.adminSubfolderLinks) {
            if (typeof data.adminSubfolderLinks === 'string') {
              try {
                subfolderLinks = JSON.parse(data.adminSubfolderLinks);
              } catch {
                subfolderLinks = undefined;
              }
            } else if (typeof data.adminSubfolderLinks === 'object') {
              subfolderLinks = data.adminSubfolderLinks;
            }
          }

          onData({
            adminPin,
            adminDriveUrl: driveUrl,
            adminDriveScriptUrl: data.adminDriveScriptUrl || '',
            adminDriveFolderId: data.adminDriveFolderId || '1k274pmYI5tvjYyyY6KwRqkTghZl8TpUB',
            adminDriveFolderLink: driveUrl,
            adminSubfolderLinks: subfolderLinks
          });
        }
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, 'config/store');
      }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, 'config/store');
    return () => {};
  }
}

export async function saveStaffMemberToFirestore(staff: StaffMember): Promise<void> {
  const docPath = `staff/staff_${staff.id}`;
  try {
    const shiftsToStore = Array.isArray(staff.shifts)
      ? JSON.stringify(staff.shifts)
      : (typeof staff.shifts === 'string' ? staff.shifts : JSON.stringify([]));

    const docRef = doc(db, 'staff', `staff_${staff.id}`);
    const nowIso = new Date().toISOString();
    const currentMonthKey = getCurrentMonthKey();
    const validMonthly = extractValidMonthlyCounters(staff, currentMonthKey);

    await setDoc(
      docRef,
      {
        id: staff.id,
        name: staff.name,
        role: staff.role || 'Specialist',
        shifts: shiftsToStore,
        targetOps: staff.targetOps || 0,
        achOps: staff.achOps || 0,
        achTryOn: staff.achTryOn || 0,
        achWeeklySeed: staff.achWeeklySeed || 0,
        achChecklist: staff.achChecklist || 0,
        monthKey: currentMonthKey,
        monthlyOps: validMonthly.ops,
        monthlyTryOn: validMonthly.tryOn,
        monthlyWeeklySeed: validMonthly.seed,
        monthlyChecklist: validMonthly.checklist,
        ...(staff.monthlyResetAt ? { monthlyResetAt: staff.monthlyResetAt } : {}),
        updatedAt: nowIso
      },
      { merge: true }
    );

    const normKey = normalizeStaffKey(staff.name);
    if (normKey) {
      await setDoc(
        doc(db, 'config', 'staff_stats_archive'),
        {
          stats: {
            [normKey]: {
              name: staff.name.trim(),
              achOps: staff.achOps || 0,
              achTryOn: staff.achTryOn || 0,
              achWeeklySeed: staff.achWeeklySeed || 0,
              achChecklist: staff.achChecklist || 0,
              monthKey: currentMonthKey,
              monthlyOps: validMonthly.ops,
              monthlyTryOn: validMonthly.tryOn,
              monthlyWeeklySeed: validMonthly.seed,
              monthlyChecklist: validMonthly.checklist,
              ...(staff.monthlyResetAt ? { monthlyResetAt: staff.monthlyResetAt } : {}),
              updatedAt: nowIso
            }
          },
          updatedAt: nowIso
        },
        { merge: true }
      ).catch(() => {});
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
    throw error;
  }
}

/**
 * Atomically increments BOTH weekly counter (current schedule) AND monthly counter (current calendar month).
 * On calendar month rollover (`staff.monthKey !== currentMonthKey`), monthly counters reset cleanly to 0 + count.
 */
export async function incrementStaffAchievementInFirestore(
  staff: StaffMember,
  activityType: ActivityType,
  count = 1,
  activeTargetResetAt?: string
): Promise<void> {
  const docPath = `staff/staff_${staff.id}`;
  try {
    const docRef = doc(db, 'staff', `staff_${staff.id}`);
    const nowIso = new Date().toISOString();
    const currentMonthKey = getCurrentMonthKey();

    const validMonthly = extractValidMonthlyCounters(staff, currentMonthKey, activeTargetResetAt);
    const isSameMonthAndCycle =
      staff.monthKey === currentMonthKey &&
      (!activeTargetResetAt ||
        getCurrentMonthKey(new Date(Date.parse(activeTargetResetAt))) !== currentMonthKey ||
        staff.monthlyResetAt === activeTargetResetAt);

    const fieldUpdate: Record<string, unknown> = {
      updatedAt: nowIso,
      monthKey: currentMonthKey,
      ...(activeTargetResetAt ? { monthlyResetAt: activeTargetResetAt } : {})
    };

    let nextMonthlyOps = validMonthly.ops;
    let nextMonthlyTryOn = validMonthly.tryOn;
    let nextMonthlySeed = validMonthly.seed;
    let nextMonthlyChecklist = validMonthly.checklist;

    let nextWeeklyOps = staff.achOps || 0;
    let nextWeeklyTryOn = staff.achTryOn || 0;
    let nextWeeklySeed = staff.achWeeklySeed || 0;
    let nextWeeklyChecklist = staff.achChecklist || 0;

    if (activityType === 'OPS') {
      fieldUpdate.achOps = increment(count);
      nextWeeklyOps += count;
      nextMonthlyOps += count;
      fieldUpdate.monthlyOps = isSameMonthAndCycle ? increment(count) : count;
      if (!isSameMonthAndCycle) {
        fieldUpdate.monthlyTryOn = 0;
        fieldUpdate.monthlyWeeklySeed = 0;
        fieldUpdate.monthlyChecklist = 0;
      }
    } else if (isTryOnActivity(activityType)) {
      fieldUpdate.achTryOn = increment(count);
      nextWeeklyTryOn += count;
      nextMonthlyTryOn += count;
      fieldUpdate.monthlyTryOn = isSameMonthAndCycle ? increment(count) : count;
      if (!isSameMonthAndCycle) {
        fieldUpdate.monthlyOps = 0;
        fieldUpdate.monthlyWeeklySeed = 0;
        fieldUpdate.monthlyChecklist = 0;
      }
    } else if (activityType === 'WeeklySeed') {
      fieldUpdate.achWeeklySeed = increment(count);
      nextWeeklySeed += count;
      nextMonthlySeed += count;
      fieldUpdate.monthlyWeeklySeed = isSameMonthAndCycle ? increment(count) : count;
      if (!isSameMonthAndCycle) {
        fieldUpdate.monthlyOps = 0;
        fieldUpdate.monthlyTryOn = 0;
        fieldUpdate.monthlyChecklist = 0;
      }
    } else if (activityType === 'Checklist') {
      fieldUpdate.achChecklist = increment(count);
      nextWeeklyChecklist += count;
      nextMonthlyChecklist += count;
      fieldUpdate.monthlyChecklist = isSameMonthAndCycle ? increment(count) : count;
      if (!isSameMonthAndCycle) {
        fieldUpdate.monthlyOps = 0;
        fieldUpdate.monthlyTryOn = 0;
        fieldUpdate.monthlyWeeklySeed = 0;
      }
    }

    await setDoc(docRef, fieldUpdate, { merge: true });

    const normKey = normalizeStaffKey(staff.name);
    if (normKey) {
      await setDoc(
        doc(db, 'config', 'staff_stats_archive'),
        {
          stats: {
            [normKey]: {
              name: staff.name.trim(),
              achOps: nextWeeklyOps,
              achTryOn: nextWeeklyTryOn,
              achWeeklySeed: nextWeeklySeed,
              achChecklist: nextWeeklyChecklist,
              monthKey: currentMonthKey,
              monthlyOps: nextMonthlyOps,
              monthlyTryOn: nextMonthlyTryOn,
              monthlyWeeklySeed: nextMonthlySeed,
              monthlyChecklist: nextMonthlyChecklist,
              ...(activeTargetResetAt ? { monthlyResetAt: activeTargetResetAt } : {}),
              updatedAt: nowIso
            }
          },
          updatedAt: nowIso
        },
        { merge: true }
      ).catch(() => {});
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
    throw error;
  }
}

export interface ActiveScheduleMeta {
  staffList: StaffMember[];
  fileName: string;
  uploadedAt: string;
  updatedAt: string;
  targetResetAt?: string;
  fromCache?: boolean;
}

export function subscribeToActiveSchedule(
  onData: (meta: ActiveScheduleMeta | null) => void
): Unsubscribe {
  try {
    const docRef = doc(db, 'config', 'active_schedule');
    return onSnapshot(
      docRef,
      (snapshot) => {
        if (!snapshot.metadata.fromCache) {
          notifyQuotaRecovered();
        }
        if (snapshot.exists()) {
          const data = snapshot.data();
          let parsedStaff: StaffMember[] = [];
          if (typeof data.staffList === 'string') {
            try {
              parsedStaff = JSON.parse(data.staffList);
            } catch {}
          } else if (Array.isArray(data.staffList)) {
            parsedStaff = data.staffList;
          }
          onData({
            staffList: parsedStaff,
            fileName: data.fileName || '',
            uploadedAt: data.uploadedAt || '',
            updatedAt: data.updatedAt || data.uploadedAt || '',
            targetResetAt: data.targetResetAt || '',
            fromCache: snapshot.metadata.fromCache
          });
        } else {
          onData(null);
        }
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, 'config/active_schedule');
      }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, 'config/active_schedule');
    return () => {};
  }
}

export interface CloudSyncMeta {
  lastScheduleUpdatedAt: string;
  lastPhotoId: number;
  lastPhotoUpdatedAt: string;
  lastEmsUpdatedAt: string;
  lastTrainingHoUpdatedAt?: string;
  lastStaffProfilesUpdatedAt?: string;
  lastTargetResetAt?: string;
  targetMonthKey?: string;
  scheduleFileName: string;
  resetNonce: string;
  updatedAt: string;
}

export function subscribeToSyncMeta(
  onData: (meta: CloudSyncMeta) => void
): Unsubscribe {
  try {
    const docRef = doc(db, 'config', 'sync_meta');
    return onSnapshot(
      docRef,
      (snapshot) => {
        if (!snapshot.metadata.fromCache) {
          notifyQuotaRecovered();
        }
        if (snapshot.exists()) {
          const d = snapshot.data();
          onData({
            lastScheduleUpdatedAt: d.lastScheduleUpdatedAt || '',
            lastPhotoId: Number(d.lastPhotoId) || 0,
            lastPhotoUpdatedAt: d.lastPhotoUpdatedAt || '',
            lastEmsUpdatedAt: d.lastEmsUpdatedAt || '',
            lastTrainingHoUpdatedAt: d.lastTrainingHoUpdatedAt || '',
            lastStaffProfilesUpdatedAt: d.lastStaffProfilesUpdatedAt || '',
            lastTargetResetAt: d.lastTargetResetAt || '',
            targetMonthKey: d.targetMonthKey || '',
            scheduleFileName: d.scheduleFileName || '',
            resetNonce: d.resetNonce || '',
            updatedAt: d.updatedAt || ''
          });
        }
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, 'config/sync_meta');
      }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, 'config/sync_meta');
    return () => {};
  }
}

export async function saveAllStaffToFirestore(
  staffList: StaffMember[],
  meta?: { fileName?: string; uploadedAt?: string },
  options?: { resetWeeklyTargets?: boolean; targetResetAt?: string }
): Promise<StaffMember[]> {
  const resetWeeklyTargets = options?.resetWeeklyTargets ?? true;
  try {
    const now = new Date();
    const nowIso = now.toISOString();
    const currentMonthKey = getCurrentMonthKey(now);
    const uploadedAtIso = meta?.uploadedAt || nowIso;

    // 1. Fetch existing staff, stats archive, sync_meta, and photos from server
    const [existingSnap, archiveSnap, photosSnap, syncSnap] = await Promise.all([
      getDocsFromServer(collection(db, 'staff')).catch(() => null),
      getDocFromServer(doc(db, 'config', 'staff_stats_archive')).catch(() => null),
      getDocsFromServer(collection(db, 'photos')).catch(() => null),
      getDocFromServer(doc(db, 'config', 'sync_meta')).catch(() => null)
    ]);

    const effectiveTargetResetAt =
      options?.targetResetAt ||
      (syncSnap && syncSnap.exists() ? String(syncSnap.data()?.lastTargetResetAt || '') : '');

    const archiveStats: Record<string, StaffStatsRecord> = {};
    if (archiveSnap && archiveSnap.exists()) {
      const data = archiveSnap.data();
      if (data?.stats && typeof data.stats === 'object') {
        Object.entries(data.stats).forEach(([k, v]) => {
          if (v && typeof v === 'object') {
            archiveStats[k] = v as StaffStatsRecord;
          }
        });
      }
    }

    const allPhotos: PhotoRecord[] = [];
    if (photosSnap && !photosSnap.empty) {
      photosSnap.docs.forEach((pDoc) => {
        const p = pDoc.data();
        allPhotos.push({
          id: Number(p.id) || 0,
          staffName: String(p.staffName || ''),
          activityType: (p.activityType as ActivityType) || 'OPS',
          note: String(p.note || ''),
          photoUrl: '',
          timestamp: String(p.timestamp || ''),
          syncedToDrive: Boolean(p.syncedToDrive)
        });
      });
    }

    const monthlyPhotoCountsByName = countPhotosByStaff(allPhotos, (p) =>
      isPhotoInActiveMonthlyPeriod(p, now, effectiveTargetResetAt)
    );
    const weeklyPhotoCountsByName = countPhotosByStaff(allPhotos, (p) =>
      resetWeeklyTargets ? false : isPhotoInCurrentScheduleWeek(p, uploadedAtIso, now, effectiveTargetResetAt)
    );

    const existingAchMap = new Map<
      string,
      {
        achOps: number;
        achTryOn: number;
        achWeeklySeed: number;
        achChecklist: number;
        monthlyOps: number;
        monthlyTryOn: number;
        monthlyWeeklySeed: number;
        monthlyChecklist: number;
        monthKey: string;
        monthlyResetAt?: string;
      }
    >();
    const previousRosterSnapshot: StaffMember[] = [];

    const batch = writeBatch(db);

    if (existingSnap && !existingSnap.empty) {
      existingSnap.docs.forEach((docSnap) => {
        const d = docSnap.data();
        if (d.name) {
          const nameLower = String(d.name).trim().toLowerCase();
          const normKey = normalizeStaffKey(String(d.name));

          const prevDocMonthly = extractValidMonthlyCounters(
            {
              monthKey: typeof d.monthKey === 'string' ? d.monthKey : undefined,
              monthlyOps: d.monthlyOps !== undefined ? Number(d.monthlyOps) : undefined,
              monthlyTryOn: d.monthlyTryOn !== undefined ? Number(d.monthlyTryOn) : undefined,
              monthlyWeeklySeed: d.monthlyWeeklySeed !== undefined ? Number(d.monthlyWeeklySeed) : undefined,
              monthlyChecklist: d.monthlyChecklist !== undefined ? Number(d.monthlyChecklist) : undefined,
              monthlyResetAt: typeof d.monthlyResetAt === 'string' ? d.monthlyResetAt : undefined,
              achOps: Number(d.achOps) || 0,
              achTryOn: Number(d.achTryOn) || 0,
              achWeeklySeed: Number(d.achWeeklySeed) || 0,
              achChecklist: Number(d.achChecklist) || 0
            },
            currentMonthKey,
            effectiveTargetResetAt
          );

          const prevArch = archiveStats[normKey];
          const prevArchMonthly = extractValidMonthlyCounters(
            prevArch,
            currentMonthKey,
            effectiveTargetResetAt
          );

          const mergedMonthlyOps = Math.max(prevDocMonthly.ops, prevArchMonthly.ops);
          const mergedMonthlyTryOn = Math.max(prevDocMonthly.tryOn, prevArchMonthly.tryOn);
          const mergedMonthlySeed = Math.max(prevDocMonthly.seed, prevArchMonthly.seed);
          const mergedMonthlyChecklist = Math.max(prevDocMonthly.checklist, prevArchMonthly.checklist);

          existingAchMap.set(nameLower, {
            achOps: Number(d.achOps) || 0,
            achTryOn: Number(d.achTryOn) || 0,
            achWeeklySeed: Number(d.achWeeklySeed) || 0,
            achChecklist: Number(d.achChecklist) || 0,
            monthlyOps: mergedMonthlyOps,
            monthlyTryOn: mergedMonthlyTryOn,
            monthlyWeeklySeed: mergedMonthlySeed,
            monthlyChecklist: mergedMonthlyChecklist,
            monthKey: currentMonthKey,
            monthlyResetAt: effectiveTargetResetAt || (typeof d.monthlyResetAt === 'string' ? d.monthlyResetAt : undefined)
          });

          archiveStats[normKey] = {
            name: String(d.name).trim(),
            achOps: resetWeeklyTargets ? 0 : (Number(d.achOps) || 0),
            achTryOn: resetWeeklyTargets ? 0 : (Number(d.achTryOn) || 0),
            achWeeklySeed: resetWeeklyTargets ? 0 : (Number(d.achWeeklySeed) || 0),
            achChecklist: resetWeeklyTargets ? 0 : (Number(d.achChecklist) || 0),
            monthKey: currentMonthKey,
            monthlyOps: mergedMonthlyOps,
            monthlyTryOn: mergedMonthlyTryOn,
            monthlyWeeklySeed: mergedMonthlySeed,
            monthlyChecklist: mergedMonthlyChecklist,
            ...(effectiveTargetResetAt ? { monthlyResetAt: effectiveTargetResetAt } : {}),
            updatedAt: nowIso
          };

          let parsedShifts = ['OFF', 'OFF', 'OFF', 'OFF', 'OFF', 'OFF', 'OFF'];
          if (Array.isArray(d.shifts)) parsedShifts = d.shifts;
          else if (typeof d.shifts === 'string') {
            try {
              const p = JSON.parse(d.shifts);
              if (Array.isArray(p)) parsedShifts = p;
            } catch {}
          }
          previousRosterSnapshot.push({
            id: Number(d.id) || 0,
            name: String(d.name),
            role: String(d.role || 'Specialist'),
            shifts: parsedShifts,
            targetOps: Number(d.targetOps) || 0,
            achOps: Number(d.achOps) || 0,
            achTryOn: Number(d.achTryOn) || 0,
            achWeeklySeed: Number(d.achWeeklySeed) || 0,
            achChecklist: Number(d.achChecklist) || 0,
            monthKey: currentMonthKey,
            monthlyOps: mergedMonthlyOps,
            monthlyTryOn: mergedMonthlyTryOn,
            monthlyWeeklySeed: mergedMonthlySeed,
            monthlyChecklist: mergedMonthlyChecklist
          });
        }
        batch.delete(docSnap.ref);
      });
    }

    // 2. Save new schedule: weekly counters reset on schedule upload, while monthly counters are preserved for currentMonthKey
    const reconciledList: StaffMember[] = staffList.map((staff) => {
      const docRef = doc(db, 'staff', `staff_${staff.id}`);
      const shiftsToStore = Array.isArray(staff.shifts)
        ? JSON.stringify(staff.shifts)
        : (typeof staff.shifts === 'string' ? staff.shifts : JSON.stringify([]));

      const normLower = staff.name.trim().toLowerCase();
      const normKey = normalizeStaffKey(staff.name);
      const existing = existingAchMap.get(normLower);
      const archived = archiveStats[normKey];
      const archivedMonthly = extractValidMonthlyCounters(archived, currentMonthKey, effectiveTargetResetAt);
      const incomingMonthly = extractValidMonthlyCounters(staff, currentMonthKey, effectiveTargetResetAt);
      const monthPhotoCnt = monthlyPhotoCountsByName.get(normLower);
      const weekPhotoCnt = weeklyPhotoCountsByName.get(normLower);

      const achOps = resetWeeklyTargets ? 0 : Math.max(staff.achOps || 0, weekPhotoCnt?.ops || 0);
      const achTryOn = resetWeeklyTargets ? 0 : Math.max(staff.achTryOn || 0, weekPhotoCnt?.tryOn || 0);
      const achWeeklySeed = resetWeeklyTargets ? 0 : Math.max(staff.achWeeklySeed || 0, weekPhotoCnt?.seed || 0);
      const achChecklist = resetWeeklyTargets ? 0 : Math.max(staff.achChecklist || 0, weekPhotoCnt?.checklist || 0);

      const monthlyOps = Math.max(
        incomingMonthly.ops,
        existing?.monthlyOps || 0,
        archivedMonthly.ops,
        monthPhotoCnt?.ops || 0,
        achOps
      );
      const monthlyTryOn = Math.max(
        incomingMonthly.tryOn,
        existing?.monthlyTryOn || 0,
        archivedMonthly.tryOn,
        monthPhotoCnt?.tryOn || 0,
        achTryOn
      );
      const monthlyWeeklySeed = Math.max(
        incomingMonthly.seed,
        existing?.monthlyWeeklySeed || 0,
        archivedMonthly.seed,
        monthPhotoCnt?.seed || 0,
        achWeeklySeed
      );
      const monthlyChecklist = Math.max(
        incomingMonthly.checklist,
        existing?.monthlyChecklist || 0,
        archivedMonthly.checklist,
        monthPhotoCnt?.checklist || 0,
        achChecklist
      );

      archiveStats[normKey] = {
        name: staff.name.trim(),
        achOps,
        achTryOn,
        achWeeklySeed,
        achChecklist,
        monthKey: currentMonthKey,
        monthlyOps,
        monthlyTryOn,
        monthlyWeeklySeed,
        monthlyChecklist,
        ...(effectiveTargetResetAt ? { monthlyResetAt: effectiveTargetResetAt } : {}),
        updatedAt: nowIso
      };

      batch.set(docRef, {
        id: staff.id,
        name: staff.name,
        role: staff.role || 'Specialist',
        shifts: shiftsToStore,
        targetOps: staff.targetOps || 0,
        achOps,
        achTryOn,
        achWeeklySeed,
        achChecklist,
        monthKey: currentMonthKey,
        monthlyOps,
        monthlyTryOn,
        monthlyWeeklySeed,
        monthlyChecklist,
        ...(effectiveTargetResetAt ? { monthlyResetAt: effectiveTargetResetAt } : {}),
        updatedAt: nowIso
      });

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
        monthlyResetAt: effectiveTargetResetAt || staff.monthlyResetAt
      };
    });

    // 3. Persist permanent staff stats archive (month-aware)
    batch.set(
      doc(db, 'config', 'staff_stats_archive'),
      {
        stats: archiveStats,
        updatedAt: nowIso
      },
      { merge: true }
    );

    // 4. Persist active schedule snapshot in config/active_schedule & config/sync_meta
    const activeScheduleRef = doc(db, 'config', 'active_schedule');
    batch.set(
      activeScheduleRef,
      {
        staffList: JSON.stringify(reconciledList),
        fileName: meta?.fileName || 'Schedule_Uploaded.xlsx',
        uploadedAt: uploadedAtIso,
        targetResetAt: effectiveTargetResetAt || '',
        updatedAt: nowIso
      },
      { merge: true }
    );

    batch.set(
      doc(db, 'config', 'sync_meta'),
      {
        lastScheduleUpdatedAt: nowIso,
        scheduleFileName: meta?.fileName || 'Schedule_Uploaded.xlsx',
        updatedAt: nowIso
      },
      { merge: true }
    );

    // 5. Save previous roster to schedule_history if non-empty
    if (previousRosterSnapshot.length > 0 && !isDummyStaffRoster(previousRosterSnapshot)) {
      const historyRef = doc(db, 'config', 'schedule_history');
      const existingHistSnap = await getDocFromServer(historyRef).catch(() => null);
      let entries: Array<{ savedAt: string; staffList: StaffMember[] }> = [];
      if (existingHistSnap && existingHistSnap.exists()) {
        const d = existingHistSnap.data();
        if (typeof d.entries === 'string') {
          try {
            entries = JSON.parse(d.entries);
          } catch {}
        } else if (Array.isArray(d.entries)) {
          entries = d.entries;
        }
      }
      entries = [{ savedAt: nowIso, staffList: previousRosterSnapshot }, ...entries].slice(0, 5);
      batch.set(historyRef, { entries: JSON.stringify(entries), updatedAt: nowIso }, { merge: true });
    }

    await batch.commit();
    notifyQuotaRecovered();
    return reconciledList;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'staff_batch');
    throw error;
  }
}

/**
 * Resets monthly AND weekly target progress counters to 0 across all devices WITHOUT deleting any submitted photos or active schedule.
 * Used at the start of a new month or manually by Admin.
 */
export async function resetMonthlyTargetsInFirestore(
  currentStaffList: StaffMember[]
): Promise<{ resetAt: string; monthKey: string; updatedStaff: StaffMember[] }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const currentMonthKey = getCurrentMonthKey(now);

  try {
    const [staffSnap, archiveSnap, activeSnap] = await Promise.all([
      getDocsFromServer(collection(db, 'staff')).catch(() => getDocs(collection(db, 'staff')).catch(() => null)),
      getDocFromServer(doc(db, 'config', 'staff_stats_archive')).catch(() => null),
      getDocFromServer(doc(db, 'config', 'active_schedule')).catch(() => null)
    ]);

    const batch = writeBatch(db);
    const updatedStaff: StaffMember[] = [];

    if (staffSnap && !staffSnap.empty) {
      staffSnap.docs.forEach((docSnap) => {
        const d = docSnap.data();
        let parsedShifts = ['OFF', 'OFF', 'OFF', 'OFF', 'OFF', 'OFF', 'OFF'];
        if (Array.isArray(d.shifts)) parsedShifts = d.shifts;
        else if (typeof d.shifts === 'string') {
          try {
            const p = JSON.parse(d.shifts);
            if (Array.isArray(p)) parsedShifts = p;
          } catch {}
        }

        batch.set(
          docSnap.ref,
          {
            achOps: 0,
            achTryOn: 0,
            achWeeklySeed: 0,
            achChecklist: 0,
            monthKey: currentMonthKey,
            monthlyOps: 0,
            monthlyTryOn: 0,
            monthlyWeeklySeed: 0,
            monthlyChecklist: 0,
            monthlyResetAt: nowIso,
            updatedAt: nowIso
          },
          { merge: true }
        );

        updatedStaff.push({
          id: Number(d.id) || 0,
          name: String(d.name || ''),
          role: String(d.role || 'Specialist'),
          shifts: parsedShifts,
          targetOps: Number(d.targetOps) || 0,
          achOps: 0,
          achTryOn: 0,
          achWeeklySeed: 0,
          achChecklist: 0,
          monthKey: currentMonthKey,
          monthlyOps: 0,
          monthlyTryOn: 0,
          monthlyWeeklySeed: 0,
          monthlyChecklist: 0,
          monthlyResetAt: nowIso
        });
      });
      updatedStaff.sort((a, b) => a.id - b.id);
    } else if (currentStaffList.length > 0) {
      currentStaffList.forEach((staff) => {
        const docRef = doc(db, 'staff', `staff_${staff.id}`);
        const shiftsToStore = Array.isArray(staff.shifts) ? JSON.stringify(staff.shifts) : '[]';
        batch.set(
          docRef,
          {
            id: staff.id,
            name: staff.name,
            role: staff.role || 'Specialist',
            shifts: shiftsToStore,
            targetOps: staff.targetOps || 0,
            achOps: 0,
            achTryOn: 0,
            achWeeklySeed: 0,
            achChecklist: 0,
            monthKey: currentMonthKey,
            monthlyOps: 0,
            monthlyTryOn: 0,
            monthlyWeeklySeed: 0,
            monthlyChecklist: 0,
            monthlyResetAt: nowIso,
            updatedAt: nowIso
          },
          { merge: true }
        );
        updatedStaff.push({
          ...staff,
          achOps: 0,
          achTryOn: 0,
          achWeeklySeed: 0,
          achChecklist: 0,
          monthKey: currentMonthKey,
          monthlyOps: 0,
          monthlyTryOn: 0,
          monthlyWeeklySeed: 0,
          monthlyChecklist: 0,
          monthlyResetAt: nowIso
        });
      });
    }

    // Zero all entries in archive while retaining staff keys
    const resetArchiveStats: Record<string, StaffStatsRecord> = {};
    if (archiveSnap && archiveSnap.exists()) {
      const data = archiveSnap.data();
      if (data?.stats && typeof data.stats === 'object') {
        Object.entries(data.stats).forEach(([k, v]) => {
          if (v && typeof v === 'object') {
            const prev = v as StaffStatsRecord;
            resetArchiveStats[k] = {
              name: prev.name,
              achOps: 0,
              achTryOn: 0,
              achWeeklySeed: 0,
              achChecklist: 0,
              monthKey: currentMonthKey,
              monthlyOps: 0,
              monthlyTryOn: 0,
              monthlyWeeklySeed: 0,
              monthlyChecklist: 0,
              monthlyResetAt: nowIso,
              updatedAt: nowIso
            };
          }
        });
      }
    }
    updatedStaff.forEach((s) => {
      const k = normalizeStaffKey(s.name);
      if (k && !resetArchiveStats[k]) {
        resetArchiveStats[k] = {
          name: s.name.trim(),
          achOps: 0,
          achTryOn: 0,
          achWeeklySeed: 0,
          achChecklist: 0,
          monthKey: currentMonthKey,
          monthlyOps: 0,
          monthlyTryOn: 0,
          monthlyWeeklySeed: 0,
          monthlyChecklist: 0,
          monthlyResetAt: nowIso,
          updatedAt: nowIso
        };
      }
    });

    batch.set(
      doc(db, 'config', 'staff_stats_archive'),
      {
        stats: resetArchiveStats,
        updatedAt: nowIso
      }
    );

    if (activeSnap && activeSnap.exists()) {
      batch.set(
        doc(db, 'config', 'active_schedule'),
        {
          staffList: JSON.stringify(updatedStaff),
          targetResetAt: nowIso,
          updatedAt: nowIso
        },
        { merge: true }
      );
    }

    batch.set(
      doc(db, 'config', 'sync_meta'),
      {
        lastTargetResetAt: nowIso,
        targetMonthKey: currentMonthKey,
        lastScheduleUpdatedAt: nowIso,
        updatedAt: nowIso
      },
      { merge: true }
    );

    await batch.commit();
    notifyQuotaRecovered();
    return { resetAt: nowIso, monthKey: currentMonthKey, updatedStaff };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'reset_monthly_targets');
    throw error;
  }
}

export async function savePhotoToFirestore(photo: PhotoRecord): Promise<void> {
  const docPath = `photos/photo_${photo.id}`;
  try {
    // Firestore max document size is 1,048,576 bytes.
    // Check if payload exceeds 950KB and warn.
    if (photo.photoUrl && photo.photoUrl.length > 950000) {
      throw new Error('Ukuran foto terlalu besar untuk disimpan ke cloud (maksimal 950KB). Silakan kompres foto.');
    }

    const nowIso = new Date().toISOString();
    const batch = writeBatch(db);
    const docRef = doc(db, 'photos', `photo_${photo.id}`);
    const dataToSave: Record<string, unknown> = {
      id: photo.id,
      staffName: photo.staffName,
      activityType: photo.activityType,
      note: photo.note,
      photoUrl: photo.photoUrl,
      timestamp: photo.timestamp,
      syncedToDrive: Boolean(photo.syncedToDrive),
      driveFileId: photo.driveFileId || '',
      driveWebViewLink: photo.driveWebViewLink || '',
      createdAt: nowIso
    };
    if (photo.customerType) dataToSave.customerType = photo.customerType;
    if (photo.programCampaign) dataToSave.programCampaign = photo.programCampaign;

    batch.set(docRef, dataToSave);
    batch.set(
      doc(db, 'config', 'sync_meta'),
      {
        lastPhotoId: photo.id,
        lastPhotoUpdatedAt: nowIso,
        updatedAt: nowIso
      },
      { merge: true }
    );

    await batch.commit();
    notifyQuotaRecovered();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
    throw error;
  }
}

export async function deletePhotoFromFirestore(photoId: number): Promise<void> {
  const docPath = `photos/photo_${photoId}`;
  try {
    const docRef = doc(db, 'photos', `photo_${photoId}`);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
    throw error;
  }
}

/**
 * Clears all submitted photos, staff roster documents, schedule archives, and EMS schedule.
 * Intended ONLY for explicit Admin "Bersihkan & Reset" action.
 */
export async function clearAllDataInFirestore(): Promise<{ deletedPhotos: number; deletedStaff: number }> {
  const nowIso = new Date().toISOString();
  let deletedPhotos = 0;
  let deletedStaff = 0;

  try {
    const photoSnap = await getDocsFromServer(collection(db, 'photos')).catch(() => getDocs(collection(db, 'photos')));
    const photoDocs = photoSnap.docs;
    for (let i = 0; i < photoDocs.length; i += 400) {
      const batch = writeBatch(db);
      const chunk = photoDocs.slice(i, i + 400);
      chunk.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      deletedPhotos += chunk.length;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, 'photos');
    throw error;
  }

  try {
    const staffSnap = await getDocsFromServer(collection(db, 'staff')).catch(() => getDocs(collection(db, 'staff')));
    const staffDocs = staffSnap.docs;
    for (let i = 0; i < staffDocs.length; i += 400) {
      const batch = writeBatch(db);
      const chunk = staffDocs.slice(i, i + 400);
      chunk.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      deletedStaff += chunk.length;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, 'staff');
    throw error;
  }

  try {
    const configBatch = writeBatch(db);
    configBatch.set(doc(db, 'config', 'active_schedule'), {
      staffList: '[]',
      fileName: '',
      uploadedAt: '',
      updatedAt: nowIso
    });
    configBatch.set(doc(db, 'config', 'staff_stats_archive'), {
      stats: {},
      updatedAt: nowIso
    });
    configBatch.set(doc(db, 'config', 'schedule_history'), {
      entries: '[]',
      updatedAt: nowIso
    });
    configBatch.set(doc(db, 'config', 'ems_schedule'), {
      days: '[]',
      generatedAt: '',
      updatedAt: nowIso,
      isCustomized: false
    });
    configBatch.set(doc(db, 'config', 'training_ho'), {
      items: '[]',
      updatedAt: nowIso
    });
    configBatch.set(doc(db, 'config', 'sync_meta'), {
      lastScheduleUpdatedAt: nowIso,
      lastPhotoId: 0,
      lastPhotoUpdatedAt: nowIso,
      lastEmsUpdatedAt: nowIso,
      lastTrainingHoUpdatedAt: nowIso,
      lastStaffProfilesUpdatedAt: nowIso,
      lastTargetResetAt: nowIso,
      targetMonthKey: getCurrentMonthKey(),
      scheduleFileName: '',
      resetNonce: nowIso,
      updatedAt: nowIso
    });
    await configBatch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'config');
    throw error;
  }

  return { deletedPhotos, deletedStaff };
}

/**
 * EMS Schedule Cloud Persistence & Real-time Subscription
 */
export function subscribeToEmsSchedule(
  onData: (ems: EmsScheduleData | null) => void
): Unsubscribe {
  try {
    const docRef = doc(db, 'config', 'ems_schedule');
    return onSnapshot(
      docRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          let days = data.days;
          if (typeof days === 'string') {
            try {
              days = JSON.parse(days);
            } catch {
              days = [];
            }
          }
          if (Array.isArray(days)) {
            onData({
              days,
              generatedAt: data.generatedAt || '',
              updatedAt: data.updatedAt || '',
              isCustomized: Boolean(data.isCustomized)
            });
            return;
          }
        }
        onData(null);
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, 'config/ems_schedule');
      }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, 'config/ems_schedule');
    return () => {};
  }
}

export async function saveEmsScheduleToFirestore(ems: EmsScheduleData): Promise<void> {
  const docPath = 'config/ems_schedule';
  try {
    const nowIso = new Date().toISOString();
    const batch = writeBatch(db);
    batch.set(doc(db, 'config', 'ems_schedule'), {
      days: JSON.stringify(ems.days),
      generatedAt: ems.generatedAt || nowIso,
      updatedAt: nowIso,
      isCustomized: Boolean(ems.isCustomized)
    });
    batch.set(
      doc(db, 'config', 'sync_meta'),
      {
        lastEmsUpdatedAt: nowIso,
        lastScheduleUpdatedAt: nowIso,
        updatedAt: nowIso
      },
      { merge: true }
    );
    await batch.commit();
    notifyQuotaRecovered();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
    throw error;
  }
}

/**
 * Training HO Schedule Cloud Persistence & Real-time Subscription
 */
export function subscribeToTrainingHo(
  onData: (trainingHo: TrainingHoScheduleData | null) => void
): Unsubscribe {
  try {
    const docRef = doc(db, 'config', 'training_ho');
    return onSnapshot(
      docRef,
      (snapshot) => {
        if (!snapshot.metadata.fromCache) {
          notifyQuotaRecovered();
        }
        if (snapshot.exists()) {
          const data = snapshot.data();
          let items: TrainingHoItem[] = [];
          if (typeof data.items === 'string') {
            try {
              const parsed = JSON.parse(data.items);
              if (Array.isArray(parsed)) items = parsed;
            } catch {
              items = [];
            }
          } else if (Array.isArray(data.items)) {
            items = data.items;
          }
          onData({
            items,
            updatedAt: data.updatedAt || ''
          });
          return;
        }
        onData(null);
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, 'config/training_ho');
      }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, 'config/training_ho');
    return () => {};
  }
}

export async function saveTrainingHoToFirestore(trainingHo: TrainingHoScheduleData): Promise<void> {
  const docPath = 'config/training_ho';
  try {
    const nowIso = new Date().toISOString();
    const batch = writeBatch(db);
    batch.set(doc(db, 'config', 'training_ho'), {
      items: JSON.stringify(trainingHo.items),
      updatedAt: nowIso
    });
    batch.set(
      doc(db, 'config', 'sync_meta'),
      {
        lastTrainingHoUpdatedAt: nowIso,
        lastScheduleUpdatedAt: nowIso,
        updatedAt: nowIso
      },
      { merge: true }
    );
    await batch.commit();
    notifyQuotaRecovered();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
    throw error;
  }
}

/**
 * Staff On Duty Master Profiles (Photo, NIK, Email, Work Tenure) Cloud Sync
 */
function mapDocToStaffProfile(idFallback: string, data: Record<string, unknown>): StaffProfile {
  return {
    id: String(data.id || idFallback),
    name: String(data.name || ''),
    role: data.role ? String(data.role) : 'Staff',
    photoUrl: String(data.photoUrl || ''),
    nik: String(data.nik || ''),
    email: String(data.email || ''),
    joinDate: data.joinDate ? String(data.joinDate) : '',
    workTenure: data.workTenure ? String(data.workTenure) : '',
    updatedAt: String(data.updatedAt || '')
  };
}

export function subscribeToStaffProfiles(
  onData: (profiles: StaffProfile[], meta: { fromCache: boolean }) => void
): Unsubscribe {
  try {
    const colRef = collection(db, 'staff_profiles');
    return onSnapshot(
      colRef,
      (snapshot) => {
        if (!snapshot.metadata.fromCache) {
          notifyQuotaRecovered();
        }
        const list: StaffProfile[] = [];
        snapshot.forEach((d) => {
          const item = mapDocToStaffProfile(d.id, d.data() as Record<string, unknown>);
          if (item.name) list.push(item);
        });
        list.sort((a, b) => a.name.localeCompare(b.name));
        onData(list, { fromCache: snapshot.metadata.fromCache });
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, 'staff_profiles');
      }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, 'staff_profiles');
    return () => {};
  }
}

export async function saveStaffProfileToFirestore(profile: StaffProfile): Promise<void> {
  const safeId = (profile.id || `sp_${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  const docPath = `staff_profiles/${safeId}`;
  try {
    const nowIso = new Date().toISOString();
    const payload = {
      id: safeId,
      name: profile.name.trim().slice(0, 100),
      role: (profile.role || 'Staff').trim().slice(0, 60),
      photoUrl: (profile.photoUrl || '').slice(0, 400000),
      nik: (profile.nik || '').trim().slice(0, 50),
      email: (profile.email || '').trim().slice(0, 150),
      joinDate: (profile.joinDate || '').trim().slice(0, 20),
      workTenure: (profile.workTenure || '').trim().slice(0, 100),
      updatedAt: nowIso
    };
    const batch = writeBatch(db);
    batch.set(doc(db, 'staff_profiles', safeId), payload);
    batch.set(
      doc(db, 'config', 'sync_meta'),
      {
        lastStaffProfilesUpdatedAt: nowIso,
        updatedAt: nowIso
      },
      { merge: true }
    );
    await batch.commit();
    notifyQuotaRecovered();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
    throw error;
  }
}

export async function deleteStaffProfileFromFirestore(profileId: string): Promise<void> {
  const safeId = profileId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  const docPath = `staff_profiles/${safeId}`;
  try {
    const nowIso = new Date().toISOString();
    const batch = writeBatch(db);
    batch.delete(doc(db, 'staff_profiles', safeId));
    batch.set(
      doc(db, 'config', 'sync_meta'),
      {
        lastStaffProfilesUpdatedAt: nowIso,
        updatedAt: nowIso
      },
      { merge: true }
    );
    await batch.commit();
    notifyQuotaRecovered();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
    throw error;
  }
}

/**
 * Restores and reconciles all previously uploaded photos, archived staff achievements,
 * and backup schedules directly from Google Cloud Firestore.
 */
export interface CloudRestoreSummary {
  totalPhotosFound: number;
  staffRestoredCount: number;
  recoveredRosterFromBackup: boolean;
  restoredStaffList: StaffMember[];
  restoredPhotos: PhotoRecord[];
}

export async function restoreAndReconcileCloudData(): Promise<CloudRestoreSummary> {
  const now = new Date();
  const nowIso = now.toISOString();
  const currentMonthKey = getCurrentMonthKey(now);
  const [staffSnap, photosSnap, archiveSnap, activeSnap, historySnap, syncSnap] = await Promise.all([
    getDocsFromServer(collection(db, 'staff')).catch(() => null),
    getDocsFromServer(collection(db, 'photos')).catch(() => null),
    getDocFromServer(doc(db, 'config', 'staff_stats_archive')).catch(() => null),
    getDocFromServer(doc(db, 'config', 'active_schedule')).catch(() => null),
    getDocFromServer(doc(db, 'config', 'schedule_history')).catch(() => null),
    getDocFromServer(doc(db, 'config', 'sync_meta')).catch(() => null)
  ]);

  const effectiveTargetResetAt =
    syncSnap && syncSnap.exists() ? String(syncSnap.data()?.lastTargetResetAt || '') : '';
  const scheduleUploadedAt =
    activeSnap && activeSnap.exists() ? String(activeSnap.data()?.uploadedAt || '') : '';

  const photosList: PhotoRecord[] = [];
  if (photosSnap && !photosSnap.empty) {
    photosSnap.forEach((d) => {
      const data = d.data();
      photosList.push({
        id: Number(data.id) || 0,
        staffName: data.staffName || 'Staf Toko',
        activityType: data.activityType || 'OPS',
        note: data.note || '',
        photoUrl: data.photoUrl || '',
        timestamp: data.timestamp || '',
        syncedToDrive: Boolean(data.syncedToDrive),
        driveFileId: data.driveFileId || '',
        driveWebViewLink: data.driveWebViewLink || '',
        customerType: data.customerType || undefined,
        programCampaign: data.programCampaign || undefined
      });
    });
    photosList.sort((a, b) => b.id - a.id);
  }

  let staffList: StaffMember[] = [];
  if (staffSnap && !staffSnap.empty) {
    staffSnap.forEach((d) => {
      const data = d.data();
      let parsedShifts = ['OFF', 'OFF', 'OFF', 'OFF', 'OFF', 'OFF', 'OFF'];
      if (Array.isArray(data.shifts)) parsedShifts = data.shifts;
      else if (typeof data.shifts === 'string') {
        try {
          const parsed = JSON.parse(data.shifts);
          if (Array.isArray(parsed)) parsedShifts = parsed;
        } catch {
          parsedShifts = data.shifts.split(',');
        }
      }
      const rawMonthKey = typeof data.monthKey === 'string' ? data.monthKey : '';
      const isSameMonth = !rawMonthKey || rawMonthKey === currentMonthKey;
      staffList.push({
        id: Number(data.id),
        name: data.name,
        role: data.role || 'Specialist',
        shifts: parsedShifts,
        targetOps: Number(data.targetOps) || 0,
        achOps: Number(data.achOps) || 0,
        achTryOn: Number(data.achTryOn) || 0,
        achWeeklySeed: Number(data.achWeeklySeed) || 0,
        achChecklist: Number(data.achChecklist) || 0,
        monthKey: currentMonthKey,
        monthlyOps: isSameMonth ? (data.monthlyOps !== undefined ? Number(data.monthlyOps) || 0 : Number(data.achOps) || 0) : 0,
        monthlyTryOn: isSameMonth ? (data.monthlyTryOn !== undefined ? Number(data.monthlyTryOn) || 0 : Number(data.achTryOn) || 0) : 0,
        monthlyWeeklySeed: isSameMonth ? (data.monthlyWeeklySeed !== undefined ? Number(data.monthlyWeeklySeed) || 0 : Number(data.achWeeklySeed) || 0) : 0,
        monthlyChecklist: isSameMonth ? (data.monthlyChecklist !== undefined ? Number(data.monthlyChecklist) || 0 : Number(data.achChecklist) || 0) : 0,
        monthlyResetAt: isSameMonth && typeof data.monthlyResetAt === 'string' ? data.monthlyResetAt : undefined
      });
    });
    staffList.sort((a, b) => a.id - b.id);
  }

  let recoveredRosterFromBackup = false;
  if (staffList.length === 0 || isDummyStaffRoster(staffList)) {
    if (activeSnap && activeSnap.exists()) {
      const d = activeSnap.data();
      let parsed: StaffMember[] = [];
      if (typeof d.staffList === 'string') {
        try {
          parsed = JSON.parse(d.staffList);
        } catch {}
      } else if (Array.isArray(d.staffList)) {
        parsed = d.staffList;
      }
      if (parsed.length > 0 && !isDummyStaffRoster(parsed)) {
        staffList = parsed;
        recoveredRosterFromBackup = true;
      }
    }

    if ((staffList.length === 0 || isDummyStaffRoster(staffList)) && historySnap && historySnap.exists()) {
      const d = historySnap.data();
      let entries: Array<{ savedAt: string; staffList: StaffMember[] }> = [];
      if (typeof d.entries === 'string') {
        try {
          entries = JSON.parse(d.entries);
        } catch {}
      } else if (Array.isArray(d.entries)) {
        entries = d.entries;
      }
      const validEntry = entries.find((e) => e.staffList && e.staffList.length > 0 && !isDummyStaffRoster(e.staffList));
      if (validEntry) {
        staffList = validEntry.staffList;
        recoveredRosterFromBackup = true;
      }
    }
  }

  const archiveStats: Record<string, StaffStatsRecord> = {};
  if (archiveSnap && archiveSnap.exists()) {
    const data = archiveSnap.data();
    if (data?.stats && typeof data.stats === 'object') {
      Object.entries(data.stats).forEach(([k, v]) => {
        if (v && typeof v === 'object') {
          archiveStats[k] = v as StaffStatsRecord;
        }
      });
    }
  }

  const weeklyPhotoCounts = countPhotosByStaff(photosList, (p) =>
    isPhotoInCurrentScheduleWeek(p, scheduleUploadedAt, now, effectiveTargetResetAt)
  );
  const monthlyPhotoCounts = countPhotosByStaff(photosList, (p) =>
    isPhotoInActiveMonthlyPeriod(p, now, effectiveTargetResetAt)
  );

  const batch = writeBatch(db);
  let staffRestoredCount = 0;

  const reconciledStaff = staffList.map((staff) => {
    const normLower = staff.name.trim().toLowerCase();
    const normKey = normalizeStaffKey(staff.name);
    const archived = archiveStats[normKey];
    const weekCnt = weeklyPhotoCounts.get(normLower);
    const monthCnt = monthlyPhotoCounts.get(normLower);

    const selfMonthly = extractValidMonthlyCounters(staff, currentMonthKey, effectiveTargetResetAt);
    const archMonthly = extractValidMonthlyCounters(archived, currentMonthKey, effectiveTargetResetAt);

    const achOps = Math.max(staff.achOps || 0, weekCnt?.ops || 0);
    const achTryOn = Math.max(staff.achTryOn || 0, weekCnt?.tryOn || 0);
    const achWeeklySeed = Math.max(staff.achWeeklySeed || 0, weekCnt?.seed || 0);
    const achChecklist = Math.max(staff.achChecklist || 0, weekCnt?.checklist || 0);

    const monthlyOps = Math.max(selfMonthly.ops, archMonthly.ops, monthCnt?.ops || 0, achOps);
    const monthlyTryOn = Math.max(selfMonthly.tryOn, archMonthly.tryOn, monthCnt?.tryOn || 0, achTryOn);
    const monthlyWeeklySeed = Math.max(selfMonthly.seed, archMonthly.seed, monthCnt?.seed || 0, achWeeklySeed);
    const monthlyChecklist = Math.max(selfMonthly.checklist, archMonthly.checklist, monthCnt?.checklist || 0, achChecklist);

    if (
      achOps !== (staff.achOps || 0) ||
      achTryOn !== (staff.achTryOn || 0) ||
      monthlyOps !== (staff.monthlyOps || 0) ||
      monthlyTryOn !== (staff.monthlyTryOn || 0) ||
      recoveredRosterFromBackup
    ) {
      staffRestoredCount += 1;
    }

    archiveStats[normKey] = {
      name: staff.name.trim(),
      achOps,
      achTryOn,
      achWeeklySeed,
      achChecklist,
      monthKey: currentMonthKey,
      monthlyOps,
      monthlyTryOn,
      monthlyWeeklySeed,
      monthlyChecklist,
      ...(effectiveTargetResetAt ? { monthlyResetAt: effectiveTargetResetAt } : {}),
      updatedAt: nowIso
    };

    const shiftsToStore = Array.isArray(staff.shifts)
      ? JSON.stringify(staff.shifts)
      : (typeof staff.shifts === 'string' ? staff.shifts : JSON.stringify([]));

    batch.set(
      doc(db, 'staff', `staff_${staff.id}`),
      {
        id: staff.id,
        name: staff.name,
        role: staff.role || 'Specialist',
        shifts: shiftsToStore,
        targetOps: staff.targetOps || 0,
        achOps,
        achTryOn,
        achWeeklySeed,
        achChecklist,
        monthKey: currentMonthKey,
        monthlyOps,
        monthlyTryOn,
        monthlyWeeklySeed,
        monthlyChecklist,
        ...(effectiveTargetResetAt ? { monthlyResetAt: effectiveTargetResetAt } : {}),
        updatedAt: nowIso
      },
      { merge: true }
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
      monthlyResetAt: effectiveTargetResetAt || staff.monthlyResetAt
    };
  });

  if (Object.keys(archiveStats).length > 0) {
    batch.set(
      doc(db, 'config', 'staff_stats_archive'),
      { stats: archiveStats, updatedAt: nowIso },
      { merge: true }
    );
  }

  if (reconciledStaff.length > 0) {
    batch.set(
      doc(db, 'config', 'active_schedule'),
      {
        staffList: JSON.stringify(reconciledStaff),
        updatedAt: nowIso
      },
      { merge: true }
    );
  }

  await batch.commit();

  return {
    totalPhotosFound: photosList.length,
    staffRestoredCount,
    recoveredRosterFromBackup,
    restoredStaffList: reconciledStaff,
    restoredPhotos: photosList
  };
}

/**
 * Incremental & low-cost sync: checks tiny config/sync_meta first (~200B),
 * then downloads ONLY new photos (id > knownMaxPhotoId) and updated schedule if changed.
 */
export interface IncrementalSyncResult {
  staff: StaffMember[] | null;
  scheduleMeta: { fileName: string; uploadedAt: string; updatedAt: string; targetResetAt?: string } | null;
  newPhotos: PhotoRecord[];
  isFullPhotoList: boolean;
  emsSchedule: EmsScheduleData | null;
  trainingHo: TrainingHoScheduleData | null;
  staffProfiles: StaffProfile[] | null;
  syncMeta: CloudSyncMeta | null;
  resetDetected: boolean;
  nothingNew: boolean;
}

function mapDocToPhoto(data: Record<string, unknown>): PhotoRecord {
  return {
    id: Number(data.id) || 0,
    staffName: String(data.staffName || 'Staf Toko'),
    activityType: (data.activityType as ActivityType) || 'OPS',
    note: String(data.note || ''),
    photoUrl: String(data.photoUrl || ''),
    timestamp: String(data.timestamp || ''),
    syncedToDrive: Boolean(data.syncedToDrive),
    driveFileId: String(data.driveFileId || ''),
    driveWebViewLink: String(data.driveWebViewLink || ''),
    customerType: (data.customerType as PhotoRecord['customerType']) || undefined,
    programCampaign: data.programCampaign ? String(data.programCampaign) : undefined
  };
}

export async function fetchIncrementalUpdatesFromServer(options: {
  knownMaxPhotoId: number;
  knownScheduleUpdatedAt: string;
  knownStaffProfilesUpdatedAt?: string;
  knownResetNonce?: string;
  forceFull?: boolean;
}): Promise<IncrementalSyncResult> {
  const {
    knownMaxPhotoId,
    knownScheduleUpdatedAt,
    knownStaffProfilesUpdatedAt = '',
    knownResetNonce = '',
    forceFull = false
  } = options;

  let syncMeta: CloudSyncMeta | null = null;
  try {
    const syncSnap = await getDocFromServer(doc(db, 'config', 'sync_meta'));
    notifyQuotaRecovered();
    if (syncSnap.exists()) {
      const d = syncSnap.data();
      syncMeta = {
        lastScheduleUpdatedAt: d.lastScheduleUpdatedAt || '',
        lastPhotoId: Number(d.lastPhotoId) || 0,
        lastPhotoUpdatedAt: d.lastPhotoUpdatedAt || '',
        lastEmsUpdatedAt: d.lastEmsUpdatedAt || '',
        lastTrainingHoUpdatedAt: d.lastTrainingHoUpdatedAt || '',
        lastStaffProfilesUpdatedAt: d.lastStaffProfilesUpdatedAt || '',
        lastTargetResetAt: d.lastTargetResetAt || '',
        targetMonthKey: d.targetMonthKey || '',
        scheduleFileName: d.scheduleFileName || '',
        resetNonce: d.resetNonce || '',
        updatedAt: d.updatedAt || ''
      };
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, 'config/sync_meta');
    throw err;
  }

  // Detect explicit Admin Reset from another device
  if (syncMeta?.resetNonce && knownResetNonce && syncMeta.resetNonce !== knownResetNonce) {
    return {
      staff: [],
      scheduleMeta: { fileName: '', uploadedAt: '', updatedAt: syncMeta.resetNonce },
      newPhotos: [],
      isFullPhotoList: true,
      emsSchedule: null,
      trainingHo: null,
      staffProfiles: null,
      syncMeta,
      resetDetected: true,
      nothingNew: false
    };
  }

  const needScheduleFetch =
    forceFull ||
    !syncMeta ||
    !knownScheduleUpdatedAt ||
    (Boolean(syncMeta.lastScheduleUpdatedAt) && syncMeta.lastScheduleUpdatedAt !== knownScheduleUpdatedAt);

  const needPhotoFetch =
    forceFull ||
    !syncMeta ||
    knownMaxPhotoId === 0 ||
    syncMeta.lastPhotoId > knownMaxPhotoId;

  const needStaffProfilesFetch =
    forceFull ||
    (Boolean(syncMeta?.lastStaffProfilesUpdatedAt) &&
      syncMeta?.lastStaffProfilesUpdatedAt !== knownStaffProfilesUpdatedAt);

  if (!needScheduleFetch && !needPhotoFetch && !needStaffProfilesFetch) {
    return {
      staff: null,
      scheduleMeta: null,
      newPhotos: [],
      isFullPhotoList: false,
      emsSchedule: null,
      trainingHo: null,
      staffProfiles: null,
      syncMeta,
      resetDetected: false,
      nothingNew: true
    };
  }

  let staff: StaffMember[] | null = null;
  let scheduleMeta: { fileName: string; uploadedAt: string; updatedAt: string; targetResetAt?: string } | null = null;
  let emsSchedule: EmsScheduleData | null = null;
  let trainingHo: TrainingHoScheduleData | null = null;
  let staffProfiles: StaffProfile[] | null = null;
  const newPhotos: PhotoRecord[] = [];
  let isFullPhotoList = false;

  if (needScheduleFetch) {
    try {
      const [activeSnap, emsSnap, trainingHoSnap] = await Promise.all([
        getDocFromServer(doc(db, 'config', 'active_schedule')),
        getDocFromServer(doc(db, 'config', 'ems_schedule')).catch(() => null),
        getDocFromServer(doc(db, 'config', 'training_ho')).catch(() => null)
      ]);
      if (activeSnap.exists()) {
        const d = activeSnap.data();
        let parsed: StaffMember[] = [];
        if (typeof d.staffList === 'string') {
          try {
            parsed = JSON.parse(d.staffList);
          } catch {}
        } else if (Array.isArray(d.staffList)) {
          parsed = d.staffList;
        }
        staff = parsed.sort((a, b) => a.id - b.id);
        scheduleMeta = {
          fileName: d.fileName || '',
          uploadedAt: d.uploadedAt || '',
          updatedAt: d.updatedAt || d.uploadedAt || '',
          targetResetAt: d.targetResetAt || syncMeta?.lastTargetResetAt || ''
        };
      }
      if (emsSnap && emsSnap.exists()) {
        const data = emsSnap.data();
        let days = data.days;
        if (typeof days === 'string') {
          try {
            days = JSON.parse(days);
          } catch {
            days = [];
          }
        }
        if (Array.isArray(days)) {
          emsSchedule = {
            days,
            generatedAt: data.generatedAt || '',
            updatedAt: data.updatedAt || '',
            isCustomized: Boolean(data.isCustomized)
          };
        }
      }
      if (trainingHoSnap && trainingHoSnap.exists()) {
        const data = trainingHoSnap.data();
        let items: TrainingHoItem[] = [];
        if (typeof data.items === 'string') {
          try {
            const parsed = JSON.parse(data.items);
            if (Array.isArray(parsed)) items = parsed;
          } catch {
            items = [];
          }
        } else if (Array.isArray(data.items)) {
          items = data.items;
        }
        trainingHo = {
          items,
          updatedAt: data.updatedAt || ''
        };
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, 'config/active_schedule');
      throw err;
    }

    if (!staff || staff.length === 0) {
      try {
        const currentMonthKey = getCurrentMonthKey();
        const staffSnap = await getDocsFromServer(collection(db, 'staff'));
        const list: StaffMember[] = [];
        staffSnap.forEach((d) => {
          const data = d.data();
          let parsedShifts = ['OFF', 'OFF', 'OFF', 'OFF', 'OFF', 'OFF', 'OFF'];
          if (Array.isArray(data.shifts)) parsedShifts = data.shifts;
          else if (typeof data.shifts === 'string') {
            try {
              const p = JSON.parse(data.shifts);
              if (Array.isArray(p)) parsedShifts = p;
            } catch {
              parsedShifts = data.shifts.split(',');
            }
          }
          const rawMonthKey = typeof data.monthKey === 'string' ? data.monthKey : '';
          const isSameMonth = !rawMonthKey || rawMonthKey === currentMonthKey;
          list.push({
            id: Number(data.id),
            name: data.name,
            role: data.role || 'Specialist',
            shifts: parsedShifts,
            targetOps: Number(data.targetOps) || 0,
            achOps: Number(data.achOps) || 0,
            achTryOn: Number(data.achTryOn) || 0,
            achWeeklySeed: Number(data.achWeeklySeed) || 0,
            achChecklist: Number(data.achChecklist) || 0,
            monthKey: currentMonthKey,
            monthlyOps: isSameMonth ? (data.monthlyOps !== undefined ? Number(data.monthlyOps) || 0 : Number(data.achOps) || 0) : 0,
            monthlyTryOn: isSameMonth ? (data.monthlyTryOn !== undefined ? Number(data.monthlyTryOn) || 0 : Number(data.achTryOn) || 0) : 0,
            monthlyWeeklySeed: isSameMonth ? (data.monthlyWeeklySeed !== undefined ? Number(data.monthlyWeeklySeed) || 0 : Number(data.achWeeklySeed) || 0) : 0,
            monthlyChecklist: isSameMonth ? (data.monthlyChecklist !== undefined ? Number(data.monthlyChecklist) || 0 : Number(data.achChecklist) || 0) : 0,
            monthlyResetAt: isSameMonth && typeof data.monthlyResetAt === 'string' ? data.monthlyResetAt : undefined
          });
        });
        list.sort((a, b) => a.id - b.id);
        if (list.length > 0) staff = list;
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, 'staff');
      }
    }
  }

  if (needPhotoFetch) {
    try {
      if (!forceFull && knownMaxPhotoId > 0) {
        const deltaQ = query(
          collection(db, 'photos'),
          where('id', '>', knownMaxPhotoId),
          orderBy('id', 'asc')
        );
        const photoSnap = await getDocsFromServer(deltaQ);
        photoSnap.forEach((d) => {
          newPhotos.push(mapDocToPhoto(d.data() as Record<string, unknown>));
        });
        isFullPhotoList = false;
      } else {
        const photoSnap = await getDocsFromServer(collection(db, 'photos'));
        photoSnap.forEach((d) => {
          newPhotos.push(mapDocToPhoto(d.data() as Record<string, unknown>));
        });
        newPhotos.sort((a, b) => b.id - a.id);
        isFullPhotoList = true;
      }
      notifyQuotaRecovered();
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, 'photos');
      throw err;
    }
  }

  if (needStaffProfilesFetch) {
    try {
      const profilesSnap = await getDocsFromServer(collection(db, 'staff_profiles'));
      const list: StaffProfile[] = [];
      profilesSnap.forEach((d) => {
        const item = mapDocToStaffProfile(d.id, d.data() as Record<string, unknown>);
        if (item.name) list.push(item);
      });
      list.sort((a, b) => a.name.localeCompare(b.name));
      staffProfiles = list;
      notifyQuotaRecovered();
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, 'staff_profiles');
    }
  }

  return {
    staff,
    scheduleMeta,
    newPhotos,
    isFullPhotoList,
    emsSchedule,
    trainingHo,
    staffProfiles,
    syncMeta,
    resetDetected: false,
    nothingNew: false
  };
}

/**
 * Force-fetches the latest state from Google Cloud Firestore directly.
 */
export async function fetchLatestDataFromServer(): Promise<{
  staff: StaffMember[];
  photos: PhotoRecord[];
  emsSchedule: EmsScheduleData | null;
  trainingHo: TrainingHoScheduleData | null;
}> {
  const res = await fetchIncrementalUpdatesFromServer({
    knownMaxPhotoId: 0,
    knownScheduleUpdatedAt: '',
    forceFull: true
  });
  return {
    staff: res.staff || [],
    photos: res.newPhotos,
    emsSchedule: res.emsSchedule,
    trainingHo: res.trainingHo
  };
}

export async function saveStoreConfigToFirestore(config: AppConfig): Promise<void> {
  const docPath = 'config/store';
  try {
    const docRef = doc(db, 'config', 'store');
    await setDoc(
      docRef,
      {
        adminPin: config.adminPin || 'admin',
        adminDriveUrl: config.adminDriveUrl || 'https://drive.google.com/drive/folders/1k274pmYI5tvjYyyY6KwRqkTghZl8TpUB?usp=share_link',
        adminDriveScriptUrl: config.adminDriveScriptUrl || '',
        adminDriveFolderId: config.adminDriveFolderId || '1k274pmYI5tvjYyyY6KwRqkTghZl8TpUB',
        adminDriveFolderLink: config.adminDriveFolderLink || config.adminDriveUrl || 'https://drive.google.com/drive/folders/1k274pmYI5tvjYyyY6KwRqkTghZl8TpUB?usp=share_link',
        adminSubfolderLinks: config.adminSubfolderLinks ? JSON.stringify(config.adminSubfolderLinks) : '',
        updatedAt: new Date().toISOString()
      },
      { merge: true }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}
