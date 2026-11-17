import {
  StaffMember,
  PhotoRecord,
  AppConfig,
  ActivityType,
  EmsScheduleData,
  TrainingHoScheduleData
} from '../types';
import { DEFAULT_TARGET_FOLDER_ID, DEFAULT_TARGET_FOLDER_URL, extractFolderId } from './googleDriveService';

const STORAGE_KEY_GAS_URL = 'activity_os_gas_url_v1';
const STORAGE_KEY_FOLDER_ID = 'activity_os_folder_id_v2.6';

export interface DriveSyncMeta {
  lastScheduleUpdatedAt: string;
  lastPhotoId: number;
  lastPhotoUpdatedAt: string;
  lastEmsUpdatedAt: string;
  lastTrainingHoUpdatedAt?: string;
  lastTargetResetAt?: string;
  targetMonthKey?: string;
  scheduleFileName: string;
  resetNonce: string;
  updatedAt: string;
}

export interface DriveDeltaSyncResult {
  staff: StaffMember[] | null;
  scheduleMeta: { fileName: string; uploadedAt: string; updatedAt: string; targetResetAt?: string } | null;
  newPhotos: PhotoRecord[];
  isFullPhotoList: boolean;
  emsSchedule: EmsScheduleData | null;
  trainingHo: TrainingHoScheduleData | null;
  config: Partial<AppConfig> | null;
  syncMeta: DriveSyncMeta | null;
  resetDetected: boolean;
  nothingNew: boolean;
}

export interface DrivePingResult {
  success: boolean;
  message: string;
  rootFolderId?: string;
  rootFolderName?: string;
  rootFolderUrl?: string;
  dbFileId?: string;
  photosFileId?: string;
  staffCount?: number;
  photoCount?: number;
  subfolderLinks?: Record<string, string>;
}

export interface DriveRestoreSummary {
  totalPhotosFound: number;
  staffRestoredCount: number;
  recoveredRosterFromBackup: boolean;
  restoredStaffList: StaffMember[];
  restoredPhotos: PhotoRecord[];
}

// In-memory cache of fetched Drive image dataUrls to avoid repeated Apps Script calls
const driveImageDataUrlCache = new Map<string, string>();
const inFlightImageRequests = new Map<string, Promise<string | null>>();

export function getStoredAppsScriptUrl(): string {
  try {
    const envUrl = (import.meta as { env?: Record<string, string> }).env?.VITE_APPS_SCRIPT_URL;
    const saved = localStorage.getItem(STORAGE_KEY_GAS_URL);
    if (saved && saved.trim()) return saved.trim();
    if (envUrl && envUrl.trim()) return envUrl.trim();
  } catch {}
  return '';
}

export function setStoredAppsScriptUrl(url: string): void {
  const clean = url.trim();
  try {
    if (clean) {
      localStorage.setItem(STORAGE_KEY_GAS_URL, clean);
    } else {
      localStorage.removeItem(STORAGE_KEY_GAS_URL);
    }
  } catch {}
}

export function getStoredFolderId(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_FOLDER_ID);
    if (saved && saved.trim()) return extractFolderId(saved);
  } catch {}
  return DEFAULT_TARGET_FOLDER_ID;
}

export function isValidAppsScriptUrl(url?: string | null): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  return /^https:\/\/script\.google\.com\/macros\/s\/[a-zA-Z0-9_-]+\/exec/.test(trimmed);
}

/**
 * Resolves ?gas=... or ?scriptUrl=... query parameter from URL (e.g. from QR Code / Share link).
 * Automatically persists it so staff phones connect seamlessly without manual setup.
 */
export function hydrateAppsScriptUrlFromQuery(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const gasParam = params.get('gas') || params.get('scriptUrl');
    const folderParam = params.get('folderId');

    if (folderParam && folderParam.trim()) {
      localStorage.setItem(STORAGE_KEY_FOLDER_ID, extractFolderId(folderParam));
    }

    if (gasParam && isValidAppsScriptUrl(gasParam)) {
      const clean = gasParam.trim();
      setStoredAppsScriptUrl(clean);
      return clean;
    }
  } catch {}
  return null;
}

async function callAppsScriptGet<T = Record<string, unknown>>(
  scriptUrl: string,
  params: Record<string, string | number | boolean | undefined>
): Promise<T> {
  const cleanUrl = scriptUrl.trim();
  if (!isValidAppsScriptUrl(cleanUrl)) {
    throw new Error('URL Google Apps Script Web App tidak valid (harus berakhiran /exec).');
  }

  const url = new URL(cleanUrl);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) {
      url.searchParams.set(k, String(v));
    }
  });

  const res = await fetch(url.toString(), {
    method: 'GET',
    redirect: 'follow'
  });

  if (!res.ok) {
    throw new Error(`Google Apps Script HTTP ${res.status}`);
  }

  const text = await res.text();
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('Respons Google Apps Script bukan JSON. Pastikan akses Web App diatur ke "Siapa saja (Anyone)".');
  }

  if (json.result === 'error') {
    throw new Error(String(json.message || 'Apps Script error'));
  }

  return json as T;
}

async function callAppsScriptPost<T = Record<string, unknown>>(
  scriptUrl: string,
  payload: Record<string, unknown>
): Promise<T> {
  const cleanUrl = scriptUrl.trim();
  if (!isValidAppsScriptUrl(cleanUrl)) {
    throw new Error('URL Google Apps Script Web App tidak valid (harus berakhiran /exec).');
  }

  // Use text/plain;charset=utf-8 to avoid CORS preflight OPTIONS on Apps Script Web Apps
  const res = await fetch(cleanUrl, {
    method: 'POST',
    redirect: 'follow',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8'
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    throw new Error(`Google Apps Script HTTP ${res.status}`);
  }

  const text = await res.text();
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('Respons Google Apps Script bukan JSON. Pastikan akses Web App diatur ke "Siapa saja (Anyone)".');
  }

  if (json.result === 'error') {
    throw new Error(String(json.message || 'Apps Script error'));
  }

  return json as T;
}

export async function pingAndInitDriveDatabase(
  scriptUrl?: string,
  folderIdOrUrl?: string
): Promise<DrivePingResult> {
  const targetScript = (scriptUrl || getStoredAppsScriptUrl()).trim();
  const targetFolder = extractFolderId(folderIdOrUrl || getStoredFolderId());

  if (!isValidAppsScriptUrl(targetScript)) {
    return {
      success: false,
      message: 'URL Web App Google Apps Script belum diisi atau formatnya belum sesuai (harus berakhiran /exec).'
    };
  }

  try {
    const res = await callAppsScriptPost<{
      result: string;
      message?: string;
      usedFallback?: boolean;
      rootFolderId: string;
      rootFolderName: string;
      rootFolderUrl: string;
      dbFileId: string;
      photosFileId: string;
      staffCount: number;
      photoCount: number;
      subfolderLinks?: Record<string, string>;
    }>(targetScript, {
      action: 'init',
      folderId: targetFolder
    });

    return {
      success: true,
      message:
        res.usedFallback && res.message
          ? res.message
          : `Terhubung ke Google Drive "${res.rootFolderName}"! Database JSON & 4 subfolder bukti siap digunakan.`,
      rootFolderId: res.rootFolderId,
      rootFolderName: res.rootFolderName,
      rootFolderUrl: res.rootFolderUrl || DEFAULT_TARGET_FOLDER_URL,
      dbFileId: res.dbFileId,
      photosFileId: res.photosFileId,
      staffCount: res.staffCount,
      photoCount: res.photoCount,
      subfolderLinks: res.subfolderLinks
    };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : String(err)
    };
  }
}

export async function fetchDriveDeltaUpdates(options: {
  scriptUrl?: string;
  folderId?: string;
  knownMaxPhotoId: number;
  knownScheduleUpdatedAt: string;
  knownEmsUpdatedAt?: string;
  knownTrainingHoUpdatedAt?: string;
  knownResetNonce?: string;
  forceFull?: boolean;
}): Promise<DriveDeltaSyncResult> {
  const targetScript = (options.scriptUrl || getStoredAppsScriptUrl()).trim();
  const targetFolder = extractFolderId(options.folderId || getStoredFolderId());

  const res = await callAppsScriptGet<{
    resetDetected?: boolean;
    nothingNew?: boolean;
    staffList?: StaffMember[] | null;
    scheduleMeta?: { fileName: string; uploadedAt: string; updatedAt: string; targetResetAt?: string } | null;
    newPhotos?: PhotoRecord[];
    isFullPhotoList?: boolean;
    emsSchedule?: EmsScheduleData | null;
    trainingHo?: TrainingHoScheduleData | null;
    config?: Partial<AppConfig> | null;
    syncMeta?: DriveSyncMeta | null;
  }>(targetScript, {
    action: 'sync',
    folderId: targetFolder,
    knownMaxPhotoId: options.knownMaxPhotoId,
    knownScheduleUpdatedAt: options.knownScheduleUpdatedAt,
    knownEmsUpdatedAt: options.knownEmsUpdatedAt || '',
    knownTrainingHoUpdatedAt: options.knownTrainingHoUpdatedAt || '',
    knownResetNonce: options.knownResetNonce || '',
    forceFull: options.forceFull ? 'true' : 'false',
    _t: Date.now()
  });

  const sortedPhotos = Array.isArray(res.newPhotos)
    ? [...res.newPhotos].sort((a, b) => Number(b.id) - Number(a.id))
    : [];

  return {
    staff: Array.isArray(res.staffList) ? res.staffList : null,
    scheduleMeta: res.scheduleMeta || null,
    newPhotos: sortedPhotos,
    isFullPhotoList: Boolean(res.isFullPhotoList),
    emsSchedule: res.emsSchedule || null,
    trainingHo: res.trainingHo || null,
    config: res.config || null,
    syncMeta: res.syncMeta || null,
    resetDetected: Boolean(res.resetDetected),
    nothingNew: Boolean(res.nothingNew)
  };
}

export async function saveScheduleToDrive(
  staffList: StaffMember[],
  meta?: { fileName?: string; uploadedAt?: string },
  options?: { resetWeeklyTargets?: boolean; targetResetAt?: string; scriptUrl?: string; folderId?: string }
): Promise<{ staffList: StaffMember[]; syncMeta?: DriveSyncMeta }> {
  const targetScript = (options?.scriptUrl || getStoredAppsScriptUrl()).trim();
  const targetFolder = extractFolderId(options?.folderId || getStoredFolderId());

  const res = await callAppsScriptPost<{
    staffList: StaffMember[];
    syncMeta?: DriveSyncMeta;
  }>(targetScript, {
    action: 'saveSchedule',
    folderId: targetFolder,
    staffList,
    meta,
    resetWeeklyTargets: options?.resetWeeklyTargets ?? true,
    targetResetAt: options?.targetResetAt || ''
  });

  return {
    staffList: Array.isArray(res.staffList) ? res.staffList : staffList,
    syncMeta: res.syncMeta
  };
}

export async function savePhotoToDrive(params: {
  photo: PhotoRecord;
  staffId: number;
  base64Data: string;
  mimeType?: string;
  filename?: string;
  updateTarget?: boolean;
  targetResetAt?: string;
  scriptUrl?: string;
  folderId?: string;
}): Promise<{ photo: PhotoRecord; staffList: StaffMember[]; syncMeta?: DriveSyncMeta }> {
  const targetScript = (params.scriptUrl || getStoredAppsScriptUrl()).trim();
  const targetFolder = extractFolderId(params.folderId || getStoredFolderId());

  const cleanBase64 = params.base64Data.includes(',')
    ? params.base64Data.split(',')[1]
    : params.base64Data;

  const detectedMime =
    params.mimeType ||
    (params.base64Data.startsWith('data:')
      ? params.base64Data.slice(5, params.base64Data.indexOf(';'))
      : 'image/jpeg');

  const safeStaff = (params.photo.staffName || 'Staf').replace(/[^a-zA-Z0-9_-]+/g, '_');
  const ext = detectedMime.includes('png') ? 'png' : detectedMime.includes('webp') ? 'webp' : 'jpg';
  const filename = params.filename || `${params.photo.activityType}_${safeStaff}_${params.photo.id}.${ext}`;

  const res = await callAppsScriptPost<{
    photo: PhotoRecord;
    staffList: StaffMember[];
    syncMeta?: DriveSyncMeta;
  }>(targetScript, {
    action: 'savePhoto',
    folderId: targetFolder,
    photo: {
      ...params.photo,
      photoUrl: '' // Do not duplicate huge base64 inside metadata JSON
    },
    staffId: params.staffId,
    base64: cleanBase64,
    mimeType: detectedMime,
    filename,
    updateTarget: params.updateTarget ?? true,
    targetResetAt: params.targetResetAt || ''
  });

  // Cache local data URL for immediate smooth rendering on this device
  if (res.photo?.driveFileId && params.base64Data.startsWith('data:')) {
    driveImageDataUrlCache.set(res.photo.driveFileId, params.base64Data);
  }

  return {
    photo: res.photo,
    staffList: Array.isArray(res.staffList) ? res.staffList : [],
    syncMeta: res.syncMeta
  };
}

export async function deletePhotoFromDrive(
  photoId: number,
  options?: { scriptUrl?: string; folderId?: string }
): Promise<{ photos: PhotoRecord[]; syncMeta?: DriveSyncMeta }> {
  const targetScript = (options?.scriptUrl || getStoredAppsScriptUrl()).trim();
  const targetFolder = extractFolderId(options?.folderId || getStoredFolderId());

  const res = await callAppsScriptPost<{ photos: PhotoRecord[]; syncMeta?: DriveSyncMeta }>(
    targetScript,
    {
      action: 'deletePhoto',
      folderId: targetFolder,
      photoId
    }
  );

  return {
    photos: Array.isArray(res.photos) ? res.photos : [],
    syncMeta: res.syncMeta
  };
}

export async function incrementStaffAchievementInDrive(
  staff: StaffMember,
  activityType: ActivityType,
  count = 1,
  activeTargetResetAt?: string,
  options?: { scriptUrl?: string; folderId?: string }
): Promise<{ staffList: StaffMember[]; syncMeta?: DriveSyncMeta }> {
  const targetScript = (options?.scriptUrl || getStoredAppsScriptUrl()).trim();
  const targetFolder = extractFolderId(options?.folderId || getStoredFolderId());

  const res = await callAppsScriptPost<{ staffList: StaffMember[]; syncMeta?: DriveSyncMeta }>(
    targetScript,
    {
      action: 'incrementTarget',
      folderId: targetFolder,
      staffId: staff.id,
      staffName: staff.name,
      activityType,
      count,
      targetResetAt: activeTargetResetAt || ''
    }
  );

  return {
    staffList: Array.isArray(res.staffList) ? res.staffList : [],
    syncMeta: res.syncMeta
  };
}

export async function saveEmsScheduleToDrive(
  ems: EmsScheduleData,
  options?: { scriptUrl?: string; folderId?: string }
): Promise<void> {
  const targetScript = (options?.scriptUrl || getStoredAppsScriptUrl()).trim();
  const targetFolder = extractFolderId(options?.folderId || getStoredFolderId());

  await callAppsScriptPost(targetScript, {
    action: 'saveEms',
    folderId: targetFolder,
    emsSchedule: ems
  });
}

export async function saveTrainingHoToDrive(
  trainingHo: TrainingHoScheduleData,
  options?: { scriptUrl?: string; folderId?: string }
): Promise<void> {
  const targetScript = (options?.scriptUrl || getStoredAppsScriptUrl()).trim();
  const targetFolder = extractFolderId(options?.folderId || getStoredFolderId());

  await callAppsScriptPost(targetScript, {
    action: 'saveTrainingHo',
    folderId: targetFolder,
    trainingHo
  });
}

export async function saveStoreConfigToDrive(
  config: AppConfig,
  options?: { scriptUrl?: string; folderId?: string }
): Promise<void> {
  const targetScript = (options?.scriptUrl || config.adminDriveScriptUrl || getStoredAppsScriptUrl()).trim();
  const targetFolder = extractFolderId(options?.folderId || config.adminDriveFolderId || getStoredFolderId());

  if (!isValidAppsScriptUrl(targetScript)) return;

  await callAppsScriptPost(targetScript, {
    action: 'saveConfig',
    folderId: targetFolder,
    config: {
      adminPin: config.adminPin || 'admin',
      adminDriveFolderId: targetFolder,
      adminDriveUrl: config.adminDriveUrl || DEFAULT_TARGET_FOLDER_URL,
      adminDriveFolderLink: config.adminDriveFolderLink || config.adminDriveUrl || DEFAULT_TARGET_FOLDER_URL,
      adminSubfolderLinks: config.adminSubfolderLinks || undefined
    }
  });
}

export async function resetMonthlyTargetsInDrive(options?: {
  scriptUrl?: string;
  folderId?: string;
}): Promise<{ resetAt: string; monthKey: string; updatedStaff: StaffMember[] }> {
  const targetScript = (options?.scriptUrl || getStoredAppsScriptUrl()).trim();
  const targetFolder = extractFolderId(options?.folderId || getStoredFolderId());

  const res = await callAppsScriptPost<{
    resetAt: string;
    monthKey: string;
    updatedStaff: StaffMember[];
  }>(targetScript, {
    action: 'resetTargets',
    folderId: targetFolder
  });

  return {
    resetAt: res.resetAt || new Date().toISOString(),
    monthKey: res.monthKey || '',
    updatedStaff: Array.isArray(res.updatedStaff) ? res.updatedStaff : []
  };
}

export async function restoreAndReconcileDriveData(options?: {
  scriptUrl?: string;
  folderId?: string;
}): Promise<DriveRestoreSummary> {
  const targetScript = (options?.scriptUrl || getStoredAppsScriptUrl()).trim();
  const targetFolder = extractFolderId(options?.folderId || getStoredFolderId());

  const res = await callAppsScriptPost<DriveRestoreSummary>(targetScript, {
    action: 'restoreAndReconcile',
    folderId: targetFolder
  });

  return {
    totalPhotosFound: Number(res.totalPhotosFound) || 0,
    staffRestoredCount: Number(res.staffRestoredCount) || 0,
    recoveredRosterFromBackup: Boolean(res.recoveredRosterFromBackup),
    restoredStaffList: Array.isArray(res.restoredStaffList) ? res.restoredStaffList : [],
    restoredPhotos: Array.isArray(res.restoredPhotos) ? res.restoredPhotos : []
  };
}

export async function clearAllDataInDrive(options?: {
  scriptUrl?: string;
  folderId?: string;
}): Promise<{ deletedPhotos: number; deletedStaff: number }> {
  const targetScript = (options?.scriptUrl || getStoredAppsScriptUrl()).trim();
  const targetFolder = extractFolderId(options?.folderId || getStoredFolderId());

  const res = await callAppsScriptPost<{ deletedPhotos: number; deletedStaff: number }>(
    targetScript,
    {
      action: 'clearAll',
      folderId: targetFolder
    }
  );

  return {
    deletedPhotos: Number(res.deletedPhotos) || 0,
    deletedStaff: Number(res.deletedStaff) || 0
  };
}

/**
 * Migrates existing local or legacy Firestore data into Google Drive in safe batches
 * (uploads 5 base64 photos per batch so Apps Script execution time limits are never exceeded).
 */
export async function migrateDataToDrive(params: {
  scriptUrl?: string;
  folderId?: string;
  staffList: StaffMember[];
  scheduleMeta?: { fileName?: string; uploadedAt?: string; updatedAt?: string; isUsingPrevious?: boolean };
  photos: PhotoRecord[];
  emsSchedule?: EmsScheduleData | null;
  trainingHo?: TrainingHoScheduleData | null;
  config?: AppConfig;
  onProgress?: (msg: string) => void;
}): Promise<{ staffList: StaffMember[]; photos: PhotoRecord[] }> {
  const targetScript = (params.scriptUrl || getStoredAppsScriptUrl()).trim();
  const targetFolder = extractFolderId(params.folderId || getStoredFolderId());

  params.onProgress?.('Mengirim data schedule, target & konfigurasi ke Google Drive...');

  let latestStaff: StaffMember[] = params.staffList;
  let latestPhotos: PhotoRecord[] = [];

  // Step 1: Send non-photo DB state first
  const baseRes = await callAppsScriptPost<{ staffList?: StaffMember[]; photos?: PhotoRecord[] }>(
    targetScript,
    {
      action: 'migrateBatch',
      folderId: targetFolder,
      staffList: params.staffList,
      scheduleMeta: params.scheduleMeta,
      emsSchedule: params.emsSchedule,
      trainingHo: params.trainingHo,
      config: params.config
        ? {
            adminPin: params.config.adminPin || 'admin',
            adminDriveFolderId: targetFolder,
            adminDriveUrl: params.config.adminDriveUrl || DEFAULT_TARGET_FOLDER_URL
          }
        : undefined,
      photos: []
    }
  );
  if (Array.isArray(baseRes.staffList)) latestStaff = baseRes.staffList;
  if (Array.isArray(baseRes.photos)) latestPhotos = baseRes.photos;

  // Step 2: Upload photos in chunks of 4
  const chunkSize = 4;
  for (let i = 0; i < params.photos.length; i += chunkSize) {
    const chunk = params.photos.slice(i, i + chunkSize);
    params.onProgress?.(
      `Mengunggah foto ke Google Drive (${Math.min(i + chunk.length, params.photos.length)}/${params.photos.length})...`
    );
    const chunkRes = await callAppsScriptPost<{ photos?: PhotoRecord[] }>(targetScript, {
      action: 'migrateBatch',
      folderId: targetFolder,
      photos: chunk
    });
    if (Array.isArray(chunkRes.photos)) {
      latestPhotos = chunkRes.photos;
    }
  }

  return {
    staffList: latestStaff,
    photos: latestPhotos
  };
}

/**
 * Fetches an image directly as base64 DataURL from Apps Script when Drive thumbnail URL is blocked
 * (e.g. private Google Workspace domain restrictions).
 */
export async function fetchDriveImageBase64(
  fileId: string,
  scriptUrl?: string
): Promise<string | null> {
  if (!fileId) return null;
  if (driveImageDataUrlCache.has(fileId)) {
    return driveImageDataUrlCache.get(fileId) || null;
  }
  const existing = inFlightImageRequests.get(fileId);
  if (existing) return existing;

  const targetScript = (scriptUrl || getStoredAppsScriptUrl()).trim();
  if (!isValidAppsScriptUrl(targetScript)) return null;

  const promise = callAppsScriptGet<{ dataUrl?: string }>(targetScript, {
    action: 'getImage',
    fileId
  })
    .then((res) => {
      if (res.dataUrl) {
        driveImageDataUrlCache.set(fileId, res.dataUrl);
        return res.dataUrl;
      }
      return null;
    })
    .catch(() => null)
    .finally(() => {
      inFlightImageRequests.delete(fileId);
    });

  inFlightImageRequests.set(fileId, promise);
  return promise;
}

export function getCachedDriveImageDataUrl(fileId?: string): string | null {
  if (!fileId) return null;
  return driveImageDataUrlCache.get(fileId) || null;
}

export function setCachedDriveImageDataUrl(fileId: string, dataUrl: string): void {
  if (fileId && dataUrl) {
    driveImageDataUrlCache.set(fileId, dataUrl);
  }
}
