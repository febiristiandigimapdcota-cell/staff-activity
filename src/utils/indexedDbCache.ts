import {
  PhotoRecord,
  StaffMember,
  StaffProfile,
  EmsScheduleData,
  TrainingHoScheduleData
} from '../types';

const DB_NAME = 'activity_os_cache_v3';
const DB_VERSION = 1;
const STORE_NAME = 'kv';
const CHANNEL_NAME = 'activity_os_cross_tab_sync';

export interface CachedScheduleMeta {
  fileName: string;
  uploadedAt: string;
  isUsingPrevious: boolean;
  updatedAt?: string;
}

export interface CachedSyncState {
  lastPhotoId: number;
  lastScheduleUpdatedAt: string;
  lastTargetResetAt?: string;
  resetNonce?: string;
  lastSyncedAt?: string;
}

export interface CachedSnapshot {
  photos: PhotoRecord[];
  staff: StaffMember[];
  scheduleMeta: CachedScheduleMeta | null;
  emsSchedule: EmsScheduleData | null;
  trainingHo: TrainingHoScheduleData | null;
  staffProfiles: StaffProfile[];
  syncState: CachedSyncState | null;
}

export type CrossTabSyncMessage =
  | { type: 'PHOTOS_UPDATED'; photos: PhotoRecord[] }
  | { type: 'SCHEDULE_UPDATED'; staff: StaffMember[]; scheduleMeta: CachedScheduleMeta }
  | { type: 'EMS_UPDATED'; emsSchedule: EmsScheduleData }
  | { type: 'TRAINING_HO_UPDATED'; trainingHo: TrainingHoScheduleData }
  | { type: 'STAFF_PROFILES_UPDATED'; staffProfiles: StaffProfile[] }
  | { type: 'TARGET_RESET'; targetResetAt: string; monthKey: string; staff: StaffMember[] }
  | { type: 'ALL_RESET' };

function openCacheDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbGet<T>(db: IDBDatabase, key: string): Promise<T | null> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbPut(db: IDBDatabase, entries: Array<[string, unknown]>): Promise<void> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      for (const [k, v] of entries) {
        store.put(v, k);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function loadCachedSnapshotFromIdb(): Promise<CachedSnapshot | null> {
  const db = await openCacheDb();
  if (!db) return null;
  try {
    const [photos, staff, scheduleMeta, emsSchedule, trainingHo, staffProfiles, syncState] =
      await Promise.all([
        idbGet<PhotoRecord[]>(db, 'photos'),
        idbGet<StaffMember[]>(db, 'staff'),
        idbGet<CachedScheduleMeta>(db, 'scheduleMeta'),
        idbGet<EmsScheduleData>(db, 'emsSchedule'),
        idbGet<TrainingHoScheduleData>(db, 'trainingHo'),
        idbGet<StaffProfile[]>(db, 'staffProfiles'),
        idbGet<CachedSyncState>(db, 'syncState')
      ]);
    return {
      photos: Array.isArray(photos) ? photos : [],
      staff: Array.isArray(staff) ? staff : [],
      scheduleMeta: scheduleMeta || null,
      emsSchedule: emsSchedule || null,
      trainingHo: trainingHo || null,
      staffProfiles: Array.isArray(staffProfiles) ? staffProfiles : [],
      syncState: syncState || null
    };
  } finally {
    db.close();
  }
}

export async function saveCachedPhotosToIdb(photos: PhotoRecord[]): Promise<void> {
  const db = await openCacheDb();
  if (!db) return;
  try {
    const maxId = photos.reduce((max, p) => Math.max(max, Number(p.id) || 0), 0);
    const existingSync = await idbGet<CachedSyncState>(db, 'syncState');
    const nextSync: CachedSyncState = {
      lastPhotoId: Math.max(maxId, existingSync?.lastPhotoId || 0),
      lastScheduleUpdatedAt: existingSync?.lastScheduleUpdatedAt || '',
      lastTargetResetAt: existingSync?.lastTargetResetAt || '',
      resetNonce: existingSync?.resetNonce || '',
      lastSyncedAt: new Date().toISOString()
    };
    await idbPut(db, [
      ['photos', photos],
      ['syncState', nextSync]
    ]);
  } finally {
    db.close();
  }
}

export async function saveCachedScheduleToIdb(
  staff: StaffMember[],
  scheduleMeta: CachedScheduleMeta,
  emsSchedule?: EmsScheduleData | null
): Promise<void> {
  const db = await openCacheDb();
  if (!db) return;
  try {
    const existingSync = await idbGet<CachedSyncState>(db, 'syncState');
    const entries: Array<[string, unknown]> = [
      ['staff', staff],
      ['scheduleMeta', scheduleMeta],
      [
        'syncState',
        {
          lastPhotoId: existingSync?.lastPhotoId || 0,
          lastScheduleUpdatedAt: scheduleMeta.updatedAt || scheduleMeta.uploadedAt || new Date().toISOString(),
          lastTargetResetAt: existingSync?.lastTargetResetAt || '',
          resetNonce: existingSync?.resetNonce || '',
          lastSyncedAt: new Date().toISOString()
        } satisfies CachedSyncState
      ]
    ];
    if (emsSchedule !== undefined) {
      entries.push(['emsSchedule', emsSchedule]);
    }
    await idbPut(db, entries);
  } finally {
    db.close();
  }
}

export async function saveCachedTargetResetToIdb(
  targetResetAt: string,
  staff: StaffMember[]
): Promise<void> {
  const db = await openCacheDb();
  if (!db) return;
  try {
    const existingSync = await idbGet<CachedSyncState>(db, 'syncState');
    await idbPut(db, [
      ['staff', staff],
      [
        'syncState',
        {
          lastPhotoId: existingSync?.lastPhotoId || 0,
          lastScheduleUpdatedAt: existingSync?.lastScheduleUpdatedAt || '',
          lastTargetResetAt: targetResetAt,
          resetNonce: existingSync?.resetNonce || '',
          lastSyncedAt: new Date().toISOString()
        } satisfies CachedSyncState
      ]
    ]);
  } finally {
    db.close();
  }
}

export async function saveCachedEmsToIdb(emsSchedule: EmsScheduleData | null): Promise<void> {
  const db = await openCacheDb();
  if (!db) return;
  try {
    await idbPut(db, [['emsSchedule', emsSchedule]]);
  } finally {
    db.close();
  }
}

export async function saveCachedTrainingHoToIdb(trainingHo: TrainingHoScheduleData | null): Promise<void> {
  const db = await openCacheDb();
  if (!db) return;
  try {
    await idbPut(db, [['trainingHo', trainingHo]]);
  } finally {
    db.close();
  }
}

export async function saveCachedStaffProfilesToIdb(profiles: StaffProfile[]): Promise<void> {
  const db = await openCacheDb();
  if (!db) return;
  try {
    await idbPut(db, [['staffProfiles', profiles]]);
  } finally {
    db.close();
  }
}

export async function clearAllIdbCache(): Promise<void> {
  const db = await openCacheDb();
  if (!db) return;
  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } finally {
    db.close();
  }
}

export function broadcastLocalSync(message: CrossTabSyncMessage): void {
  if (typeof BroadcastChannel === 'undefined') return;
  try {
    const ch = new BroadcastChannel(CHANNEL_NAME);
    ch.postMessage(message);
    ch.close();
  } catch {
    // Ignore restricted contexts
  }
}

export function subscribeLocalSync(onMessage: (msg: CrossTabSyncMessage) => void): () => void {
  if (typeof BroadcastChannel === 'undefined') return () => {};
  try {
    const ch = new BroadcastChannel(CHANNEL_NAME);
    ch.onmessage = (event) => {
      if (event?.data && typeof event.data === 'object') {
        onMessage(event.data as CrossTabSyncMessage);
      }
    };
    return () => ch.close();
  } catch {
    return () => {};
  }
}
