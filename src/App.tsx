import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  StaffMember,
  PhotoRecord,
  AppConfig,
  ViewType,
  ActivityType,
  EmsScheduleData,
  TrainingHoScheduleData
} from './types';
import {
  INITIAL_APP_CONFIG,
  isDummyStaffRoster
} from './data/defaultData';
import {
  calculateOpsTargets,
  generateEmsWeeklySchedule,
  isEmsScheduleValidForStaffOnly,
  mergeTrainingHoWithRoster
} from './utils/scheduler';
import {
  parseExcelFile,
  parseCsvString,
  exportWeeklyRecapToExcel
} from './utils/excelHelper';
import {
  loadCachedSnapshotFromIdb,
  saveCachedPhotosToIdb,
  saveCachedScheduleToIdb,
  saveCachedEmsToIdb,
  saveCachedTrainingHoToIdb,
  saveCachedTargetResetToIdb,
  clearAllIdbCache,
  broadcastLocalSync,
  subscribeLocalSync
} from './utils/indexedDbCache';
import {
  getCurrentMonthKey,
  reconcileWeeklyAndMonthlyStaff
} from './utils/periodHelper';
import {
  uploadImageToDrive,
  DEFAULT_TARGET_FOLDER_ID,
  DEFAULT_TARGET_FOLDER_URL,
  extractFolderId
} from './services/googleDriveService';
import {
  getStoredAppsScriptUrl,
  setStoredAppsScriptUrl,
  getStoredFolderId,
  isValidAppsScriptUrl,
  hydrateAppsScriptUrlFromQuery,
  pingAndInitDriveDatabase,
  fetchDriveDeltaUpdates,
  saveScheduleToDrive,
  savePhotoToDrive,
  deletePhotoFromDrive,
  incrementStaffAchievementInDrive,
  saveEmsScheduleToDrive,
  saveTrainingHoToDrive,
  saveStoreConfigToDrive,
  resetMonthlyTargetsInDrive,
  restoreAndReconcileDriveData,
  clearAllDataInDrive,
  migrateDataToDrive,
  setCachedDriveImageDataUrl,
  DrivePingResult,
  DriveRestoreSummary
} from './services/driveStorageService';

import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { OverviewView } from './components/views/OverviewView';
import { ScheduleView } from './components/views/ScheduleView';
import { StaffOverviewView } from './components/views/StaffOverviewView';
import { ProofUploadView } from './components/views/ProofUploadView';
import { CashierMonitorView } from './components/views/CashierMonitorView';
import { AdminView } from './components/views/AdminView';
import { LinksView } from './components/views/LinksView';

import { AdminPinModal } from './components/modals/AdminPinModal';
import { SubmitRecordModal } from './components/modals/SubmitRecordModal';
import { DailyBriefPrintModal } from './components/modals/DailyBriefPrintModal';
import { PhotoLightboxModal } from './components/modals/PhotoLightboxModal';
import { MobileConnectModal } from './components/modals/MobileConnectModal';
import { MobileBottomNav } from './components/common/MobileBottomNav';
import { PWAInstallBanner } from './components/common/PWAInstallBanner';

const STORAGE_KEY_FOLDER_ID = 'activity_os_folder_id_v2.6';
const STORAGE_KEY_FOLDER_LINK = 'activity_os_folder_link_v2.6';
const STORAGE_KEY_ACTIVE_SCHEDULE = 'activity_os_active_schedule_v2.7';
const STORAGE_KEY_SCHEDULE_META = 'activity_os_schedule_meta_v2.7';
const STORAGE_KEY_TARGET_RESET_AT = 'activity_os_target_reset_at_v1';
const STORAGE_KEY_TRAINING_HO = 'activity_os_training_ho_v1';
const STORAGE_KEY_CONFIG = 'activity_os_config_v1';
const STORAGE_KEY_GAS_AUTH_TOKEN = 'staff_activity_drive_token';

export interface ScheduleMetaState {
  fileName: string;
  uploadedAt: string;
  isUsingPrevious: boolean;
  updatedAt?: string;
}

export default function App() {
  // Navigation & Admin State (Always starts locked and auto-locks on leaving Admin tab)
  const [currentView, setCurrentView] = useState<ViewType>('overview');
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobileConnectOpen, setIsMobileConnectOpen] = useState(false);
  const [dataStatus, setDataStatus] = useState<string>('Cache Lokal');

  // Active Schedule Metadata (Persisted across weeks & refreshes)
  const [scheduleMeta, setScheduleMeta] = useState<ScheduleMetaState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_SCHEDULE_META);
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      fileName: '',
      uploadedAt: '',
      isUsingPrevious: false
    };
  });

  // Core Data States (Loads cached uploaded schedule if exists; NEVER dummy like Rina Marlina)
  const [staffList, setStaffList] = useState<StaffMember[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_ACTIVE_SCHEDULE);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0 && !isDummyStaffRoster(parsed)) {
          return calculateOpsTargets(parsed);
        }
      }
    } catch {}
    return [];
  });

  const [photos, setPhotos] = useState<PhotoRecord[]>(() => {
    try {
      const cached = localStorage.getItem('activity_os_photos_cache_v2');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  const [config, setConfig] = useState<AppConfig>(() => {
    // Hydrate ?gas=... and ?folderId=... immediately on startup before reading config
    const queryGas = hydrateAppsScriptUrlFromQuery();
    const storedGas = queryGas || getStoredAppsScriptUrl();
    const storedFolderId = getStoredFolderId();
    const storedFolderLink = (() => {
      try {
        return localStorage.getItem(STORAGE_KEY_FOLDER_LINK) || DEFAULT_TARGET_FOLDER_URL;
      } catch {
        return DEFAULT_TARGET_FOLDER_URL;
      }
    })();

    try {
      const savedCfg = localStorage.getItem(STORAGE_KEY_CONFIG);
      if (savedCfg) {
        const parsed = JSON.parse(savedCfg) as Partial<AppConfig>;
        return {
          ...INITIAL_APP_CONFIG,
          ...parsed,
          adminDriveScriptUrl: storedGas || parsed.adminDriveScriptUrl || INITIAL_APP_CONFIG.adminDriveScriptUrl,
          adminDriveFolderId: storedFolderId || parsed.adminDriveFolderId || DEFAULT_TARGET_FOLDER_ID,
          adminDriveFolderLink: parsed.adminDriveFolderLink || storedFolderLink
        };
      }
    } catch {}

    return {
      ...INITIAL_APP_CONFIG,
      adminDriveScriptUrl: storedGas || INITIAL_APP_CONFIG.adminDriveScriptUrl,
      adminDriveFolderId: storedFolderId,
      adminDriveFolderLink: storedFolderLink
    };
  });

  const [emsSchedule, setEmsSchedule] = useState<EmsScheduleData | null>(() => {
    try {
      const cached = localStorage.getItem('activity_os_ems_schedule_v1');
      if (cached) return JSON.parse(cached);
    } catch {}
    return null;
  });
  const [trainingHoSchedule, setTrainingHoSchedule] = useState<TrainingHoScheduleData | null>(() => {
    try {
      const cached = localStorage.getItem(STORAGE_KEY_TRAINING_HO);
      if (cached) return JSON.parse(cached);
    } catch {}
    return null;
  });

  // Modal States
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [lightboxPhoto, setLightboxPhoto] = useState<PhotoRecord | null>(null);
  const [preselectedUploadStaffId, setPreselectedUploadStaffId] = useState<number | undefined>(undefined);

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncFeedbackBanner, setSyncFeedbackBanner] = useState<string | null>(null);
  const [driveNoticeDismissed, setDriveNoticeDismissed] = useState(false);
  const [currentMonthKey, setCurrentMonthKey] = useState<string>(() => getCurrentMonthKey());
  const [targetResetAt, setTargetResetAt] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY_TARGET_RESET_AT) || '';
    } catch {
      return '';
    }
  });

  // Refs to avoid stale closures inside listeners & background delta sync
  const photosRef = useRef<PhotoRecord[]>(photos);
  photosRef.current = photos;
  const staffListRef = useRef<StaffMember[]>(staffList);
  staffListRef.current = staffList;
  const scheduleMetaRef = useRef<ScheduleMetaState>(scheduleMeta);
  scheduleMetaRef.current = scheduleMeta;
  const targetResetAtRef = useRef<string>(targetResetAt);
  targetResetAtRef.current = targetResetAt;
  const emsScheduleRef = useRef<EmsScheduleData | null>(emsSchedule);
  emsScheduleRef.current = emsSchedule;
  const trainingHoRef = useRef<TrainingHoScheduleData | null>(trainingHoSchedule);
  trainingHoRef.current = trainingHoSchedule;
  const configRef = useRef<AppConfig>(config);
  configRef.current = config;
  const resetNonceRef = useRef<string>('');
  const lastSyncRunRef = useRef<number>(0);

  const mergeAndPersistPhotos = useCallback((incoming: PhotoRecord[], replaceAll: boolean) => {
    setPhotos((prev) => {
      let merged: PhotoRecord[];
      if (replaceAll) {
        merged = [...incoming].sort((a, b) => b.id - a.id);
      } else {
        const byId = new Map<number, PhotoRecord>();
        prev.forEach((p) => byId.set(p.id, p));
        incoming.forEach((p) => byId.set(p.id, p));
        merged = Array.from(byId.values()).sort((a, b) => b.id - a.id);
      }
      photosRef.current = merged;
      void saveCachedPhotosToIdb(merged);
      try {
        localStorage.setItem('activity_os_photos_cache_v2', JSON.stringify(merged.slice(0, 15)));
      } catch {}
      return merged;
    });
  }, []);

  const applySyncedSchedule = useCallback(
    (
      rawStaff: StaffMember[],
      metaState: ScheduleMetaState,
      nextEms?: EmsScheduleData | null
    ) => {
      if (rawStaff.length === 0 || isDummyStaffRoster(rawStaff)) return;
      const calculated = calculateOpsTargets(rawStaff);
      setStaffList(calculated);
      staffListRef.current = calculated;
      setScheduleMeta(metaState);
      scheduleMetaRef.current = metaState;

      if (nextEms) {
        setEmsSchedule(nextEms);
        void saveCachedEmsToIdb(nextEms);
        try {
          localStorage.setItem('activity_os_ems_schedule_v1', JSON.stringify(nextEms));
        } catch {}
      }

      void saveCachedScheduleToIdb(calculated, metaState, nextEms);
      try {
        localStorage.setItem(STORAGE_KEY_ACTIVE_SCHEDULE, JSON.stringify(calculated));
        localStorage.setItem(STORAGE_KEY_SCHEDULE_META, JSON.stringify(metaState));
      } catch {}
    },
    []
  );

  // Incremental delta sync via Google Drive + Apps Script Web App
  const runDeltaSync = useCallback(
    async (manual = false) => {
      const scriptUrl = (configRef.current.adminDriveScriptUrl || getStoredAppsScriptUrl()).trim();
      const folderId = extractFolderId(configRef.current.adminDriveFolderId || getStoredFolderId());

      if (!isValidAppsScriptUrl(scriptUrl)) {
        setDataStatus('Mode Lokal (Pasang Apps Script)');
        if (manual) {
          setSyncFeedbackBanner(
            'URL Google Apps Script belum dipasang. Buka Area Admin > Pengaturan Google Drive untuk menghubungkan.'
          );
          setTimeout(() => setSyncFeedbackBanner(null), 5000);
        }
        return;
      }

      const nowMs = Date.now();
      if (!manual && nowMs - lastSyncRunRef.current < 10000) {
        return;
      }
      lastSyncRunRef.current = nowMs;

      if (manual) {
        setIsSyncing(true);
        setDataStatus('Syncing Drive...');
      }

      try {
        const maxLocalPhotoId = photosRef.current.reduce(
          (max, p) => Math.max(max, Number(p.id) || 0),
          0
        );
        const currentScheduleStamp =
          scheduleMetaRef.current.updatedAt || scheduleMetaRef.current.uploadedAt || '';

        const res = await fetchDriveDeltaUpdates({
          scriptUrl,
          folderId,
          knownMaxPhotoId: maxLocalPhotoId,
          knownScheduleUpdatedAt: currentScheduleStamp,
          knownEmsUpdatedAt: emsScheduleRef.current?.updatedAt || '',
          knownTrainingHoUpdatedAt: trainingHoRef.current?.updatedAt || '',
          knownResetNonce: resetNonceRef.current,
          forceFull: manual
        });

        if (res.syncMeta?.resetNonce) {
          resetNonceRef.current = res.syncMeta.resetNonce;
        }
        const incomingResetAt =
          res.syncMeta?.lastTargetResetAt || res.scheduleMeta?.targetResetAt || '';
        if (incomingResetAt && incomingResetAt !== targetResetAtRef.current) {
          setTargetResetAt(incomingResetAt);
          targetResetAtRef.current = incomingResetAt;
          try {
            localStorage.setItem(STORAGE_KEY_TARGET_RESET_AT, incomingResetAt);
          } catch {}
        }

        if (res.resetDetected) {
          setStaffList([]);
          staffListRef.current = [];
          setPhotos([]);
          photosRef.current = [];
          setEmsSchedule(null);
          emsScheduleRef.current = null;
          setTrainingHoSchedule(null);
          trainingHoRef.current = null;
          setScheduleMeta({ fileName: '', uploadedAt: '', isUsingPrevious: false });
          void clearAllIdbCache();
          try {
            localStorage.removeItem(STORAGE_KEY_ACTIVE_SCHEDULE);
            localStorage.removeItem(STORAGE_KEY_SCHEDULE_META);
            localStorage.removeItem('activity_os_photos_cache_v2');
            localStorage.removeItem('activity_os_ems_schedule_v1');
            localStorage.removeItem(STORAGE_KEY_TRAINING_HO);
            localStorage.removeItem(STORAGE_KEY_TARGET_RESET_AT);
          } catch {}
          setDataStatus('Data Direset');
          if (manual) {
            setSyncFeedbackBanner('Data telah direset oleh Admin.');
            setTimeout(() => setSyncFeedbackBanner(null), 4000);
          }
          return;
        }

        let updatedSchedule = false;
        if (res.staff && res.staff.length > 0 && !isDummyStaffRoster(res.staff)) {
          const nextMeta: ScheduleMetaState = {
            fileName: res.scheduleMeta?.fileName || scheduleMetaRef.current.fileName || 'Schedule_Toko.xlsx',
            uploadedAt: res.scheduleMeta?.uploadedAt || scheduleMetaRef.current.uploadedAt || '',
            updatedAt: res.scheduleMeta?.updatedAt || res.syncMeta?.lastScheduleUpdatedAt || '',
            isUsingPrevious: true
          };
          applySyncedSchedule(res.staff, nextMeta, res.emsSchedule);
          updatedSchedule = true;
        } else if (res.emsSchedule) {
          setEmsSchedule(res.emsSchedule);
          emsScheduleRef.current = res.emsSchedule;
          void saveCachedEmsToIdb(res.emsSchedule);
          try {
            localStorage.setItem('activity_os_ems_schedule_v1', JSON.stringify(res.emsSchedule));
          } catch {}
        }

        if (res.trainingHo) {
          setTrainingHoSchedule(res.trainingHo);
          trainingHoRef.current = res.trainingHo;
          void saveCachedTrainingHoToIdb(res.trainingHo);
          try {
            localStorage.setItem(STORAGE_KEY_TRAINING_HO, JSON.stringify(res.trainingHo));
          } catch {}
        }

        if (res.config) {
          const mergedCfg: AppConfig = {
            ...configRef.current,
            ...res.config,
            adminDriveScriptUrl: scriptUrl,
            adminDriveFolderId: folderId
          };
          setConfig(mergedCfg);
          configRef.current = mergedCfg;
          try {
            localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(mergedCfg));
          } catch {}
        }

        if (res.isFullPhotoList) {
          mergeAndPersistPhotos(res.newPhotos, true);
        } else if (res.newPhotos.length > 0) {
          mergeAndPersistPhotos(res.newPhotos, false);
        }

        setDataStatus('Google Drive 🟢');

        if (manual) {
          const totalPhotos = res.isFullPhotoList
            ? res.newPhotos.length
            : photosRef.current.length;
          const summaryMsg = updatedSchedule
            ? `Tersinkron Google Drive: Schedule terbaru & ${totalPhotos} foto bukti`
            : res.newPhotos.length > 0
            ? `Tersinkron Google Drive: +${res.newPhotos.length} foto baru (Total ${totalPhotos})`
            : `Semua perangkat sudah sinkron dengan Google Drive (${totalPhotos} foto)`;
          setSyncFeedbackBanner(summaryMsg);
          setTimeout(() => setSyncFeedbackBanner(null), 4000);
        }
      } catch (e) {
        console.warn('Google Drive delta sync notice:', e);
        setDataStatus('Cache Lokal (Offline/Error Drive)');
        if (manual) {
          setSyncFeedbackBanner(
            `Gagal sinkron Google Drive: ${e instanceof Error ? e.message : 'Periksa URL Apps Script & koneksi.'}`
          );
          setTimeout(() => setSyncFeedbackBanner(null), 5000);
        }
      } finally {
        if (manual) {
          setIsSyncing(false);
        }
      }
    },
    [applySyncedSchedule, mergeAndPersistPhotos]
  );

  // Manual Force-Sync handler
  const handleForceSync = async () => {
    await runDeltaSync(true);
  };

  // Hydrate full IndexedDB cache immediately on mount (<20ms) & subscribe to cross-tab BroadcastChannel
  useEffect(() => {
    let active = true;
    void loadCachedSnapshotFromIdb().then((snap) => {
      if (!active || !snap) return;
      if (snap.photos.length > 0) {
        mergeAndPersistPhotos(snap.photos, snap.photos.length >= photosRef.current.length);
      }
      if (snap.staff.length > 0 && !isDummyStaffRoster(snap.staff) && staffListRef.current.length === 0) {
        const meta: ScheduleMetaState = snap.scheduleMeta || {
          fileName: 'Schedule_Toko.xlsx',
          uploadedAt: '',
          isUsingPrevious: true
        };
        applySyncedSchedule(snap.staff, meta, snap.emsSchedule);
        setDataStatus('Cache Lokal Siap');
      } else if (snap.emsSchedule) {
        setEmsSchedule((prev) => prev || snap.emsSchedule);
      }
      if (snap.trainingHo) {
        setTrainingHoSchedule((prev) => prev || snap.trainingHo);
      }
      if (snap.syncState?.resetNonce) {
        resetNonceRef.current = snap.syncState.resetNonce;
      }
      if (snap.syncState?.lastTargetResetAt && !targetResetAtRef.current) {
        setTargetResetAt(snap.syncState.lastTargetResetAt);
        targetResetAtRef.current = snap.syncState.lastTargetResetAt;
      }
    });

    const unsubCrossTab = subscribeLocalSync((msg) => {
      if (msg.type === 'PHOTOS_UPDATED') {
        mergeAndPersistPhotos(msg.photos, false);
      } else if (msg.type === 'SCHEDULE_UPDATED') {
        applySyncedSchedule(msg.staff, msg.scheduleMeta);
      } else if (msg.type === 'EMS_UPDATED') {
        setEmsSchedule(msg.emsSchedule);
      } else if (msg.type === 'TRAINING_HO_UPDATED') {
        setTrainingHoSchedule(msg.trainingHo);
        trainingHoRef.current = msg.trainingHo;
      } else if (msg.type === 'TARGET_RESET') {
        setTargetResetAt(msg.targetResetAt);
        targetResetAtRef.current = msg.targetResetAt;
        if (msg.staff.length > 0) {
          const calc = calculateOpsTargets(msg.staff);
          setStaffList(calc);
          staffListRef.current = calc;
        }
      } else if (msg.type === 'ALL_RESET') {
        setStaffList([]);
        setPhotos([]);
        setEmsSchedule(null);
        setTrainingHoSchedule(null);
        trainingHoRef.current = null;
        setScheduleMeta({ fileName: '', uploadedAt: '', isUsingPrevious: false });
        setTargetResetAt('');
        targetResetAtRef.current = '';
      }
    });

    // Automatic calendar month rollover watcher (detects midnight month transitions)
    const checkMonthRollover = () => {
      const nextKey = getCurrentMonthKey();
      setCurrentMonthKey((prev) => (prev !== nextKey ? nextKey : prev));
    };
    const monthTimer = window.setInterval(checkMonthRollover, 60000);
    window.addEventListener('focus', checkMonthRollover);

    return () => {
      active = false;
      unsubCrossTab();
      window.clearInterval(monthTimer);
      window.removeEventListener('focus', checkMonthRollover);
    };
  }, [applySyncedSchedule, mergeAndPersistPhotos]);

  // Google Drive Polling + Focus/Visibility/Online Auto-Sync (Zero Firestore reads!)
  useEffect(() => {
    void runDeltaSync(false);

    const pollInterval = window.setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        void runDeltaSync(false);
      }
    }, 15000);

    const handleVisibilityOrOnline = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        void runDeltaSync(false);
      }
    };
    window.addEventListener('online', handleVisibilityOrOnline);
    window.addEventListener('focus', handleVisibilityOrOnline);
    document.addEventListener('visibilitychange', handleVisibilityOrOnline);

    return () => {
      window.clearInterval(pollInterval);
      window.removeEventListener('online', handleVisibilityOrOnline);
      window.removeEventListener('focus', handleVisibilityOrOnline);
      document.removeEventListener('visibilitychange', handleVisibilityOrOnline);
    };
  }, [runDeltaSync, config.adminDriveScriptUrl, config.adminDriveFolderId]);

  // Navigation handlers
  const handleNavigate = (view: ViewType) => {
    if (view === 'admin') {
      if (!isAdminUnlocked) {
        setIsPinModalOpen(true);
        return;
      }
      setCurrentView('admin');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // Always lock Admin immediately when navigating to any other tab
    if (isAdminUnlocked) {
      sessionStorage.removeItem('activity_os_admin_unlocked');
      setIsAdminUnlocked(false);
    }
    setCurrentView(view);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAdminClick = () => {
    if (isAdminUnlocked) {
      setCurrentView('admin');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      setIsPinModalOpen(true);
    }
  };

  const handlePinSuccess = () => {
    setIsAdminUnlocked(true);
    setIsPinModalOpen(false);
    setCurrentView('admin');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleResetPinToDefault = async () => {
    const newConfig: AppConfig = { ...config, adminPin: 'admin' };
    setConfig(newConfig);
    configRef.current = newConfig;
    try {
      localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(newConfig));
    } catch {}
    try {
      await saveStoreConfigToDrive(newConfig);
    } catch (e) {
      console.warn('Failed to save reset pin to Google Drive:', e);
    }
    setIsAdminUnlocked(true);
    setIsPinModalOpen(false);
    setCurrentView('admin');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleLockAdmin = () => {
    sessionStorage.removeItem('activity_os_admin_unlocked');
    setIsAdminUnlocked(false);
    setCurrentView('overview');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Helper to apply local + Drive schedule updates consistently
  const commitScheduleUpdate = async (
    parsedStaff: StaffMember[],
    fileName: string,
    statusLabel: string
  ): Promise<boolean> => {
    const nowIso = new Date().toISOString();
    const calculated = calculateOpsTargets(parsedStaff);
    const prepared = reconcileWeeklyAndMonthlyStaff({
      staffList: calculated,
      previousStaffList: effectiveStaffListRef.current,
      photos,
      scheduleStartedAt: nowIso,
      targetResetAt: targetResetAtRef.current,
      resetWeekly: true
    });
    const metaState: ScheduleMetaState = {
      fileName,
      uploadedAt: nowIso,
      updatedAt: nowIso,
      isUsingPrevious: false
    };
    applySyncedSchedule(prepared, metaState);

    let finalStaff = prepared;
    const scriptUrl = (configRef.current.adminDriveScriptUrl || getStoredAppsScriptUrl()).trim();
    const folderId = extractFolderId(configRef.current.adminDriveFolderId || getStoredFolderId());

    if (isValidAppsScriptUrl(scriptUrl)) {
      try {
        const saved = await saveScheduleToDrive(prepared, metaState, {
          resetWeeklyTargets: true,
          targetResetAt: targetResetAtRef.current,
          scriptUrl,
          folderId
        });
        if (saved.staffList.length > 0) {
          finalStaff = calculateOpsTargets(saved.staffList);
        }
      } catch (e) {
        console.warn('Drive schedule save warning (saved locally):', e);
      }
    }

    let nextEms: EmsScheduleData | undefined;
    if (
      !emsSchedule ||
      !emsSchedule.isCustomized ||
      !isEmsScheduleValidForStaffOnly(emsSchedule, finalStaff)
    ) {
      nextEms = generateEmsWeeklySchedule(finalStaff);
      if (isValidAppsScriptUrl(scriptUrl)) {
        await saveEmsScheduleToDrive(nextEms, { scriptUrl, folderId }).catch(() => {});
      }
    }

    const nextTrainingHo = mergeTrainingHoWithRoster(finalStaff, trainingHoRef.current, nowIso);
    setTrainingHoSchedule(nextTrainingHo);
    trainingHoRef.current = nextTrainingHo;
    void saveCachedTrainingHoToIdb(nextTrainingHo);
    broadcastLocalSync({ type: 'TRAINING_HO_UPDATED', trainingHo: nextTrainingHo });
    try {
      localStorage.setItem(STORAGE_KEY_TRAINING_HO, JSON.stringify(nextTrainingHo));
    } catch {}
    if (isValidAppsScriptUrl(scriptUrl)) {
      await saveTrainingHoToDrive(nextTrainingHo, { scriptUrl, folderId }).catch(() => {});
    }

    applySyncedSchedule(finalStaff, metaState, nextEms);
    broadcastLocalSync({ type: 'SCHEDULE_UPDATED', staff: finalStaff, scheduleMeta: metaState });
    setDataStatus(isValidAppsScriptUrl(scriptUrl) ? `${statusLabel} (Drive) 🟢` : `${statusLabel} (Lokal)`);
    return true;
  };

  // Google Sheet Direct Sync -> Resets weekly schedule counters, preserves monthly achievements & all photos
  const handleSyncGoogleSheet = async (urlOrId: string): Promise<boolean> => {
    let sheetId = urlOrId.trim();
    const matches = urlOrId.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (matches && matches[1]) {
      sheetId = matches[1];
    }

    const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;

    try {
      const response = await fetch(csvUrl);
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const csvText = await response.text();
      const parsedStaff = parseCsvString(csvText);

      if (parsedStaff.length > 0) {
        return await commitScheduleUpdate(parsedStaff, 'Google Sheet Sync', 'Live Sheet Synced');
      }
      return false;
    } catch (err) {
      console.error('Google Sheet sync error:', err);
      return false;
    }
  };

  // Excel File Upload -> Resets weekly schedule counters, preserves monthly achievements & all photos
  const handleUploadExcel = async (file: File): Promise<boolean> => {
    try {
      const parsedStaff = await parseExcelFile(file);
      if (parsedStaff.length > 0) {
        return await commitScheduleUpdate(parsedStaff, file.name, 'File Excel Synced');
      }
      return false;
    } catch (err) {
      console.error('Excel parse error:', err);
      return false;
    }
  };

  // Helper: Increment local staff list optimistically (used for immediate UI & offline fallback)
  const applyLocalAchievementIncrement = useCallback(
    (staffId: number, activityType: ActivityType, count: number) => {
      const monthKey = getCurrentMonthKey();
      const updated = staffListRef.current.map((s) => {
        if (s.id !== staffId) return s;
        const isTry =
          activityType === 'TryOn' ||
          activityType === 'TryOn_iPad' ||
          activityType === 'TryOn_AirPods' ||
          activityType === 'TryOn_Watch';
        return {
          ...s,
          achOps: activityType === 'OPS' ? (s.achOps || 0) + count : s.achOps,
          achTryOn: isTry ? (s.achTryOn || 0) + count : s.achTryOn,
          achWeeklySeed:
            activityType === 'WeeklySeed' ? (s.achWeeklySeed || 0) + count : s.achWeeklySeed,
          achChecklist:
            activityType === 'Checklist' ? (s.achChecklist || 0) + count : s.achChecklist,
          monthKey,
          monthlyOps:
            activityType === 'OPS' ? (s.monthlyOps ?? s.achOps ?? 0) + count : s.monthlyOps,
          monthlyTryOn: isTry
            ? (s.monthlyTryOn ?? s.achTryOn ?? 0) + count
            : s.monthlyTryOn,
          monthlyWeeklySeed:
            activityType === 'WeeklySeed'
              ? (s.monthlyWeeklySeed ?? s.achWeeklySeed ?? 0) + count
              : s.monthlyWeeklySeed,
          monthlyChecklist:
            activityType === 'Checklist'
              ? (s.monthlyChecklist ?? s.achChecklist ?? 0) + count
              : s.monthlyChecklist
        };
      });
      const calc = calculateOpsTargets(updated);
      setStaffList(calc);
      staffListRef.current = calc;
      void saveCachedScheduleToIdb(calc, scheduleMetaRef.current);
      try {
        localStorage.setItem(STORAGE_KEY_ACTIVE_SCHEDULE, JSON.stringify(calc));
      } catch {}
    },
    []
  );

  // Shared Upload Photo Handler (used by Staff ProofUploadView & Admin Manual Input)
  const submitPhotoInternal = async (params: {
    staffId: number;
    activityType: ActivityType;
    note: string;
    photoBase64: string;
    updateTarget: boolean;
    customerType?: import('./types').CustomerType;
    programCampaign?: string;
    noteFallbackPrefix?: string;
  }): Promise<{ success: boolean; driveSynced: boolean; message: string }> => {
    const {
      staffId,
      activityType,
      note,
      photoBase64,
      updateTarget,
      customerType,
      programCampaign,
      noteFallbackPrefix
    } = params;

    const currentStaff =
      effectiveStaffListRef.current.find((s) => s.id === staffId) ||
      staffListRef.current.find((s) => s.id === staffId);
    const staffName = currentStaff ? currentStaff.name : 'Staf Toko';

    const now = new Date();
    const timeString = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    const dateString = now.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
    const formattedTimestamp = `${dateString}, ${timeString}`;

    const newRecord: PhotoRecord = {
      id: Date.now(),
      staffName,
      activityType,
      note: note || `${noteFallbackPrefix || activityType} - ${staffName}`,
      photoUrl: photoBase64,
      timestamp: formattedTimestamp,
      syncedToDrive: false,
      customerType,
      programCampaign
    };

    // Optimistic local + cross-tab cache update
    mergeAndPersistPhotos([newRecord], false);
    broadcastLocalSync({ type: 'PHOTOS_UPDATED', photos: [newRecord] });

    let achMsg = '';
    if (updateTarget && currentStaff) {
      if (activityType === 'OPS') {
        const nextVal = (currentStaff.monthlyOps ?? currentStaff.achOps ?? 0) + 1;
        achMsg = `Target OPS ${currentStaff.name} bertambah +1 sesi (Total bulan: ${nextVal})`;
      } else if (
        activityType === 'TryOn' ||
        activityType === 'TryOn_iPad' ||
        activityType === 'TryOn_AirPods' ||
        activityType === 'TryOn_Watch'
      ) {
        const nextVal = (currentStaff.monthlyTryOn ?? currentStaff.achTryOn ?? 0) + 1;
        const typeLabel =
          activityType === 'TryOn_iPad'
            ? 'Try On iPad (Aksara)'
            : activityType === 'TryOn_AirPods'
            ? 'Try On AirPods (Samudra)'
            : activityType === 'TryOn_Watch'
            ? 'Try On Apple Watch (Nirwana)'
            : 'Try On';
        const custInfo = customerType ? ` [${customerType}]` : '';
        achMsg = `${typeLabel}${custInfo} ${currentStaff.name} bertambah +1 (${nextVal} cust)`;
      } else if (activityType === 'WeeklySeed') {
        achMsg = `Weekly Sales Coach ${currentStaff.name} ter-record (+1)`;
      } else if (activityType === 'Checklist') {
        achMsg = `Daily Checklist ${currentStaff.name} ter-record (+1)`;
      }

      applyLocalAchievementIncrement(staffId, activityType, 1);
    }

    const scriptUrl = (configRef.current.adminDriveScriptUrl || getStoredAppsScriptUrl()).trim();
    const folderId = extractFolderId(configRef.current.adminDriveFolderId || getStoredFolderId());

    if (isValidAppsScriptUrl(scriptUrl)) {
      try {
        const savedRes = await savePhotoToDrive({
          photo: newRecord,
          staffId,
          base64Data: photoBase64,
          updateTarget,
          targetResetAt: targetResetAtRef.current,
          scriptUrl,
          folderId
        });

        const syncedPhoto: PhotoRecord = savedRes.photo
          ? {
              ...newRecord,
              ...savedRes.photo,
              syncedToDrive: true
            }
          : { ...newRecord, syncedToDrive: true };

        if (syncedPhoto.driveFileId && photoBase64.startsWith('data:')) {
          setCachedDriveImageDataUrl(syncedPhoto.driveFileId, photoBase64);
        }

        mergeAndPersistPhotos([syncedPhoto], false);
        broadcastLocalSync({ type: 'PHOTOS_UPDATED', photos: [syncedPhoto] });

        if (savedRes.staffList && savedRes.staffList.length > 0) {
          const calc = calculateOpsTargets(savedRes.staffList);
          setStaffList(calc);
          staffListRef.current = calc;
          void saveCachedScheduleToIdb(calc, scheduleMetaRef.current);
          try {
            localStorage.setItem(STORAGE_KEY_ACTIVE_SCHEDULE, JSON.stringify(calc));
          } catch {}
        }

        setDataStatus('Google Drive 🟢');
        return {
          success: true,
          driveSynced: true,
          message: `✅ Foto Bukti Berhasil Diunggah ke Google Drive!\n${achMsg}\nTersimpan di subfolder kategori & langsung tersinkron ke semua perangkat.`
        };
      } catch (driveErr) {
        console.warn('Apps Script Drive upload error (kept in local cache):', driveErr);
        return {
          success: true,
          driveSynced: false,
          message: `⚠️ Foto tersimpan di cache lokal (${driveErr instanceof Error ? driveErr.message : 'gagal konek Google Drive'}).\n${achMsg}`
        };
      }
    }

    // Optional OAuth token fallback if someone manually set drive token in localStorage
    const oauthToken = (() => {
      try {
        return localStorage.getItem(STORAGE_KEY_GAS_AUTH_TOKEN);
      } catch {
        return null;
      }
    })();

    if (oauthToken) {
      try {
        const safeName = `${activityType}_${staffName.replace(/[^a-zA-Z0-9]/g, '_')}_${newRecord.id}.jpg`;
        const uploaded = await uploadImageToDrive({
          filename: safeName,
          mimeType: 'image/jpeg',
          base64Data: photoBase64,
          staffName,
          activityType,
          note,
          accessToken: oauthToken,
          folderId
        });
        const driveRecord: PhotoRecord = {
          ...newRecord,
          syncedToDrive: true,
          driveFileId: uploaded.fileId,
          driveWebViewLink: uploaded.webViewLink
        };
        setCachedDriveImageDataUrl(uploaded.fileId, photoBase64);
        mergeAndPersistPhotos([driveRecord], false);
        return {
          success: true,
          driveSynced: true,
          message: `✅ Foto berhasil diunggah ke Google Drive!\n${achMsg}`
        };
      } catch {
        // fall through to local message
      }
    }

    return {
      success: true,
      driveSynced: false,
      message: `💾 Foto tersimpan di Cache Perangkat ini.\n${achMsg}\nCatatan: Pasang URL Apps Script di Area Admin agar foto otomatis terunggah ke Google Drive & terbaca di HP lain.`
    };
  };

  // Proof Photo Save Handler -> Google Drive via Apps Script
  const handleSavePhoto = async (
    staffId: number,
    activityType: ActivityType,
    note: string,
    photoBase64: string,
    customerType?: import('./types').CustomerType,
    programCampaign?: string
  ): Promise<{ success: boolean; driveSynced: boolean; message: string }> => {
    return submitPhotoInternal({
      staffId,
      activityType,
      note,
      photoBase64,
      updateTarget: true,
      customerType,
      programCampaign,
      noteFallbackPrefix: `${activityType} SS`
    });
  };

  // Admin Manual Photo Add Handler -> Google Drive via Apps Script
  const handleAddAdminPhoto = async (
    staffId: number,
    activityType: ActivityType,
    note: string,
    photoBase64: string,
    updateTarget: boolean,
    customerType?: import('./types').CustomerType,
    programCampaign?: string
  ): Promise<{ success: boolean; message: string }> => {
    const res = await submitPhotoInternal({
      staffId,
      activityType,
      note,
      photoBase64,
      updateTarget,
      customerType,
      programCampaign,
      noteFallbackPrefix: `Admin input: ${activityType}`
    });
    return {
      success: res.success,
      message: res.message
    };
  };

  // Delete Photo Handler -> Local + Google Drive JSON
  const handleDeletePhoto = async (photoId: number) => {
    const nextPhotos = photosRef.current.filter((p) => p.id !== photoId);
    mergeAndPersistPhotos(nextPhotos, true);
    if (lightboxPhoto?.id === photoId) {
      setLightboxPhoto(null);
    }

    const scriptUrl = (configRef.current.adminDriveScriptUrl || getStoredAppsScriptUrl()).trim();
    const folderId = extractFolderId(configRef.current.adminDriveFolderId || getStoredFolderId());
    if (isValidAppsScriptUrl(scriptUrl)) {
      try {
        const res = await deletePhotoFromDrive(photoId, { scriptUrl, folderId });
        if (res.photos) {
          mergeAndPersistPhotos(res.photos, true);
        }
      } catch (e) {
        console.warn('Failed deleting photo from Drive metadata:', e);
      }
    }
  };

  // Quick Record Submit -> Persists to Local + Google Drive
  const handleSubmitRecord = async (staffId: number, type: ActivityType, count: number) => {
    const currentStaff = effectiveStaffListRef.current.find((s) => s.id === staffId);
    if (!currentStaff) return;

    applyLocalAchievementIncrement(staffId, type, count);

    const scriptUrl = (configRef.current.adminDriveScriptUrl || getStoredAppsScriptUrl()).trim();
    const folderId = extractFolderId(configRef.current.adminDriveFolderId || getStoredFolderId());
    if (isValidAppsScriptUrl(scriptUrl)) {
      try {
        const res = await incrementStaffAchievementInDrive(
          currentStaff,
          type,
          count,
          targetResetAtRef.current,
          { scriptUrl, folderId }
        );
        if (res.staffList && res.staffList.length > 0) {
          const calc = calculateOpsTargets(res.staffList);
          setStaffList(calc);
          staffListRef.current = calc;
          void saveCachedScheduleToIdb(calc, scheduleMetaRef.current);
          try {
            localStorage.setItem(STORAGE_KEY_ACTIVE_SCHEDULE, JSON.stringify(calc));
          } catch {}
        }
      } catch (e) {
        console.warn('Drive incrementTarget warning:', e);
      }
    }
  };

  // Save EMS Schedule -> Persists locally + Google Drive
  const handleSaveEmsSchedule = async (ems: EmsScheduleData) => {
    setEmsSchedule(ems);
    emsScheduleRef.current = ems;
    void saveCachedEmsToIdb(ems);
    broadcastLocalSync({ type: 'EMS_UPDATED', emsSchedule: ems });
    try {
      localStorage.setItem('activity_os_ems_schedule_v1', JSON.stringify(ems));
    } catch {}
    const scriptUrl = (configRef.current.adminDriveScriptUrl || getStoredAppsScriptUrl()).trim();
    const folderId = extractFolderId(configRef.current.adminDriveFolderId || getStoredFolderId());
    if (isValidAppsScriptUrl(scriptUrl)) {
      await saveEmsScheduleToDrive(ems, { scriptUrl, folderId });
    }
  };

  // Save Training HO Schedule -> Persists locally + Google Drive
  const handleSaveTrainingHo = async (data: TrainingHoScheduleData) => {
    setTrainingHoSchedule(data);
    trainingHoRef.current = data;
    void saveCachedTrainingHoToIdb(data);
    broadcastLocalSync({ type: 'TRAINING_HO_UPDATED', trainingHo: data });
    try {
      localStorage.setItem(STORAGE_KEY_TRAINING_HO, JSON.stringify(data));
    } catch {}
    const scriptUrl = (configRef.current.adminDriveScriptUrl || getStoredAppsScriptUrl()).trim();
    const folderId = extractFolderId(configRef.current.adminDriveFolderId || getStoredFolderId());
    if (isValidAppsScriptUrl(scriptUrl)) {
      await saveTrainingHoToDrive(data, { scriptUrl, folderId });
    }
  };

  // Restore & Reconcile Google Drive Data
  const handleRestoreCloudData = async (): Promise<DriveRestoreSummary> => {
    const scriptUrl = (configRef.current.adminDriveScriptUrl || getStoredAppsScriptUrl()).trim();
    const folderId = extractFolderId(configRef.current.adminDriveFolderId || getStoredFolderId());
    if (!isValidAppsScriptUrl(scriptUrl)) {
      throw new Error('URL Apps Script belum terpasang. Simpan & hubungkan Google Drive terlebih dahulu.');
    }
    const summary = await restoreAndReconcileDriveData({ scriptUrl, folderId });
    if (summary.restoredStaffList.length > 0 && !isDummyStaffRoster(summary.restoredStaffList)) {
      const calc = calculateOpsTargets(summary.restoredStaffList);
      setStaffList(calc);
      staffListRef.current = calc;
      void saveCachedScheduleToIdb(calc, scheduleMetaRef.current);
      try {
        localStorage.setItem(STORAGE_KEY_ACTIVE_SCHEDULE, JSON.stringify(calc));
      } catch {}
    }
    if (summary.restoredPhotos.length > 0) {
      mergeAndPersistPhotos(summary.restoredPhotos, true);
    }
    setDataStatus('Drive Data Restored 🟢');
    return summary;
  };

  // Update Config -> Persists locally + Google Drive
  const handleUpdateConfig = async (newConfig: AppConfig) => {
    const cleanScript = (newConfig.adminDriveScriptUrl || '').trim();
    const cleanFolder = extractFolderId(newConfig.adminDriveFolderId || DEFAULT_TARGET_FOLDER_ID);
    const updatedCfg: AppConfig = {
      ...newConfig,
      adminDriveScriptUrl: cleanScript,
      adminDriveFolderId: cleanFolder
    };

    setConfig(updatedCfg);
    configRef.current = updatedCfg;
    setStoredAppsScriptUrl(cleanScript);
    try {
      localStorage.setItem(STORAGE_KEY_FOLDER_ID, cleanFolder);
      if (updatedCfg.adminDriveFolderLink) {
        localStorage.setItem(STORAGE_KEY_FOLDER_LINK, updatedCfg.adminDriveFolderLink);
      }
      localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(updatedCfg));
    } catch {}

    if (isValidAppsScriptUrl(cleanScript)) {
      await saveStoreConfigToDrive(updatedCfg, { scriptUrl: cleanScript, folderId: cleanFolder }).catch(
        (e) => console.warn('saveStoreConfigToDrive warning:', e)
      );
    }
  };

  // Admin: Test & Initialize Google Drive Apps Script Database
  const handleTestDriveConnection = async (
    scriptUrlInput: string,
    folderIdOrUrlInput: string
  ): Promise<DrivePingResult> => {
    const cleanScript = scriptUrlInput.trim();
    const cleanFolder = extractFolderId(folderIdOrUrlInput || DEFAULT_TARGET_FOLDER_ID);

    const ping = await pingAndInitDriveDatabase(cleanScript, cleanFolder);
    if (ping.success) {
      setStoredAppsScriptUrl(cleanScript);
      const nextFolderId = ping.rootFolderId || cleanFolder;
      const nextFolderLink = ping.rootFolderUrl || DEFAULT_TARGET_FOLDER_URL;

      const updatedCfg: AppConfig = {
        ...configRef.current,
        adminDriveScriptUrl: cleanScript,
        adminDriveFolderId: nextFolderId,
        adminDriveFolderLink: nextFolderLink,
        adminDriveUrl: nextFolderLink,
        adminSubfolderLinks: ping.subfolderLinks || configRef.current.adminSubfolderLinks
      };

      setConfig(updatedCfg);
      configRef.current = updatedCfg;
      try {
        localStorage.setItem(STORAGE_KEY_FOLDER_ID, nextFolderId);
        localStorage.setItem(STORAGE_KEY_FOLDER_LINK, nextFolderLink);
        localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(updatedCfg));
      } catch {}

      await saveStoreConfigToDrive(updatedCfg, {
        scriptUrl: cleanScript,
        folderId: nextFolderId
      }).catch(() => {});

      await runDeltaSync(true);
    }
    return ping;
  };

  // Admin: Migrate local data (and optionally legacy Firestore data) to Google Drive
  const handleMigrateToDrive = async (
    includeLegacyFirestore: boolean,
    onProgress?: (msg: string) => void
  ): Promise<{ staffCount: number; photoCount: number }> => {
    const scriptUrl = (configRef.current.adminDriveScriptUrl || getStoredAppsScriptUrl()).trim();
    const folderId = extractFolderId(configRef.current.adminDriveFolderId || getStoredFolderId());

    if (!isValidAppsScriptUrl(scriptUrl)) {
      throw new Error('Pasang dan simpan URL Google Apps Script Web App terlebih dahulu.');
    }

    let sourceStaff = [...staffListRef.current];
    let sourcePhotos = [...photosRef.current];
    let sourceMeta = scheduleMetaRef.current;
    let sourceEms = emsScheduleRef.current;
    let sourceTraining = trainingHoRef.current;

    if (includeLegacyFirestore) {
      onProgress?.('Mengambil data lama dari Cloud Firestore (sekali baca)...');
      try {
        const firestoreModule = await import('./services/firestoreService');
        const legacy = await firestoreModule.fetchLatestDataFromServer();
        if (legacy.staff && legacy.staff.length > 0 && !isDummyStaffRoster(legacy.staff)) {
          const mergedMap = new Map<string, StaffMember>();
          sourceStaff.forEach((s) => mergedMap.set(s.name.trim().toLowerCase(), s));
          legacy.staff.forEach((s) => {
            const k = s.name.trim().toLowerCase();
            if (!mergedMap.has(k)) mergedMap.set(k, s);
          });
          sourceStaff = calculateOpsTargets(Array.from(mergedMap.values()));
        }
        if (legacy.photos && legacy.photos.length > 0) {
          const pMap = new Map<number, PhotoRecord>();
          sourcePhotos.forEach((p) => pMap.set(p.id, p));
          legacy.photos.forEach((p) => {
            if (!pMap.has(p.id)) pMap.set(p.id, p);
          });
          sourcePhotos = Array.from(pMap.values()).sort((a, b) => b.id - a.id);
        }
        if (legacy.emsSchedule && !sourceEms) sourceEms = legacy.emsSchedule;
        if (legacy.trainingHo && !sourceTraining) sourceTraining = legacy.trainingHo;
      } catch (err) {
        throw new Error(
          `Gagal menarik data Firestore lama: ${err instanceof Error ? err.message : 'Kuota habis atau akses ditolak.'}`
        );
      }
    }

    const migrated = await migrateDataToDrive({
      scriptUrl,
      folderId,
      staffList: sourceStaff,
      scheduleMeta: sourceMeta,
      photos: sourcePhotos,
      emsSchedule: sourceEms,
      trainingHo: sourceTraining,
      config: configRef.current,
      onProgress
    });

    if (migrated.staffList.length > 0 && !isDummyStaffRoster(migrated.staffList)) {
      applySyncedSchedule(migrated.staffList, sourceMeta, sourceEms);
    }
    if (migrated.photos.length > 0) {
      mergeAndPersistPhotos(migrated.photos, true);
    }
    setDataStatus('Google Drive 🟢');
    return {
      staffCount: migrated.staffList.length,
      photoCount: migrated.photos.length
    };
  };

  // Restore complete backup -> Local + Google Drive
  const handleRestoreBackup = async (data: {
    staff: StaffMember[];
    photos: PhotoRecord[];
    config: AppConfig;
  }) => {
    const scriptUrl = (configRef.current.adminDriveScriptUrl || getStoredAppsScriptUrl()).trim();
    const folderId = extractFolderId(configRef.current.adminDriveFolderId || getStoredFolderId());

    const calc =
      data.staff && Array.isArray(data.staff) ? calculateOpsTargets(data.staff) : staffListRef.current;

    if (calc.length > 0 && !isDummyStaffRoster(calc)) {
      applySyncedSchedule(calc, {
        fileName: 'Backup JSON Restore',
        uploadedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isUsingPrevious: true
      });
    }
    if (data.photos && Array.isArray(data.photos)) {
      mergeAndPersistPhotos(data.photos, false);
    }
    if (data.config) {
      await handleUpdateConfig({
        ...data.config,
        adminDriveScriptUrl: scriptUrl || data.config.adminDriveScriptUrl || '',
        adminDriveFolderId: folderId || data.config.adminDriveFolderId
      });
    }

    if (isValidAppsScriptUrl(scriptUrl)) {
      await migrateDataToDrive({
        scriptUrl,
        folderId,
        staffList: calc,
        photos: data.photos || [],
        config: data.config || configRef.current
      }).catch((e) => console.warn('Drive backup push warning:', e));
    }
    setDataStatus('Backup Restored');
  };

  // Admin: Reset Monthly & Weekly Target Counters to 0 WITHOUT deleting submitted photos
  const handleResetMonthlyTargets = async (): Promise<{ resetAt: string; monthKey: string }> => {
    const scriptUrl = (configRef.current.adminDriveScriptUrl || getStoredAppsScriptUrl()).trim();
    const folderId = extractFolderId(configRef.current.adminDriveFolderId || getStoredFolderId());

    let resetAt = new Date().toISOString();
    const monthKey = getCurrentMonthKey();
    let updatedStaff: StaffMember[] = staffListRef.current.map((s) => ({
      ...s,
      achOps: 0,
      achTryOn: 0,
      achWeeklySeed: 0,
      achChecklist: 0,
      monthKey,
      monthlyOps: 0,
      monthlyTryOn: 0,
      monthlyWeeklySeed: 0,
      monthlyChecklist: 0,
      monthlyResetAt: resetAt
    }));

    if (isValidAppsScriptUrl(scriptUrl)) {
      const res = await resetMonthlyTargetsInDrive({ scriptUrl, folderId });
      resetAt = res.resetAt;
      if (res.updatedStaff.length > 0) {
        updatedStaff = res.updatedStaff;
      }
    }

    const calc = calculateOpsTargets(updatedStaff);
    setTargetResetAt(resetAt);
    targetResetAtRef.current = resetAt;
    try {
      localStorage.setItem(STORAGE_KEY_TARGET_RESET_AT, resetAt);
    } catch {}
    setStaffList(calc);
    staffListRef.current = calc;
    const nextMeta = { ...scheduleMetaRef.current, updatedAt: resetAt };
    setScheduleMeta(nextMeta);
    scheduleMetaRef.current = nextMeta;
    void saveCachedTargetResetToIdb(resetAt, calc);
    broadcastLocalSync({
      type: 'TARGET_RESET',
      targetResetAt: resetAt,
      monthKey,
      staff: calc
    });
    setDataStatus('Target Direset (0) 🟢');
    return { resetAt, monthKey };
  };

  // Reset schedule, submitted photos & archived data (only when Bersihkan & Reset is pressed)
  const handleResetDefaults = async () => {
    const emptyMeta: ScheduleMetaState = { fileName: '', uploadedAt: '', isUsingPrevious: false };
    setStaffList([]);
    staffListRef.current = [];
    setPhotos([]);
    photosRef.current = [];
    setEmsSchedule(null);
    emsScheduleRef.current = null;
    setTrainingHoSchedule(null);
    trainingHoRef.current = null;
    setLightboxPhoto(null);
    setScheduleMeta(emptyMeta);
    scheduleMetaRef.current = emptyMeta;
    setTargetResetAt('');
    targetResetAtRef.current = '';
    void clearAllIdbCache();
    broadcastLocalSync({ type: 'ALL_RESET' });
    try {
      localStorage.removeItem(STORAGE_KEY_ACTIVE_SCHEDULE);
      localStorage.removeItem(STORAGE_KEY_SCHEDULE_META);
      localStorage.removeItem('activity_os_photos_cache_v2');
      localStorage.removeItem('activity_os_ems_schedule_v1');
      localStorage.removeItem(STORAGE_KEY_TRAINING_HO);
      localStorage.removeItem(STORAGE_KEY_TARGET_RESET_AT);
    } catch {}

    const scriptUrl = (configRef.current.adminDriveScriptUrl || getStoredAppsScriptUrl()).trim();
    const folderId = extractFolderId(configRef.current.adminDriveFolderId || getStoredFolderId());
    if (isValidAppsScriptUrl(scriptUrl)) {
      await clearAllDataInDrive({ scriptUrl, folderId }).catch((e) =>
        console.warn('clearAllDataInDrive warning:', e)
      );
      await saveStoreConfigToDrive(
        {
          ...INITIAL_APP_CONFIG,
          adminDriveScriptUrl: scriptUrl,
          adminDriveFolderId: folderId
        },
        { scriptUrl, folderId }
      ).catch(() => {});
    }

    setDataStatus('Data Direset');
    setSyncFeedbackBanner('Semua data schedule dan foto bukti telah dibersihkan & direset.');
    setTimeout(() => setSyncFeedbackBanner(null), 5000);
  };

  // Real-time reconciled staffList separating active schedule weekly vs monthly period totals
  const effectiveStaffList = useMemo(
    () =>
      reconcileWeeklyAndMonthlyStaff({
        staffList,
        previousStaffList: staffList,
        photos,
        scheduleStartedAt: scheduleMeta.uploadedAt,
        targetResetAt,
        now: new Date()
      }),
    [staffList, photos, scheduleMeta.uploadedAt, targetResetAt, currentMonthKey]
  );
  const effectiveStaffListRef = useRef<StaffMember[]>(effectiveStaffList);
  effectiveStaffListRef.current = effectiveStaffList;

  // Automatically combine roster /TRP & /TRS codes with saved manual Training HO schedules
  const effectiveTrainingHoSchedule = useMemo(
    () =>
      mergeTrainingHoWithRoster(
        effectiveStaffList,
        trainingHoSchedule,
        scheduleMeta.uploadedAt
      ),
    [effectiveStaffList, trainingHoSchedule, scheduleMeta.uploadedAt]
  );

  // Current day index for print brief
  const now = new Date();
  let currentDayIndex = now.getDay() - 1;
  if (currentDayIndex === -1) currentDayIndex = 6;

  return (
    <div className="flex min-h-[100dvh] h-[100dvh] overflow-hidden bg-[#f5f5f7] relative">
      {/* Apple Liquid Glass Ambient Light Canvas */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-[15%] -left-[10%] w-[55vw] h-[55vw] rounded-full bg-gradient-to-br from-blue-400/12 to-cyan-300/10 blur-[130px]" />
        <div className="absolute top-[20%] -right-[15%] w-[50vw] h-[50vw] rounded-full bg-gradient-to-br from-purple-400/10 to-pink-300/8 blur-[140px]" />
        <div className="absolute -bottom-[20%] left-[25%] w-[60vw] h-[50vw] rounded-full bg-gradient-to-tr from-emerald-400/8 to-sky-300/10 blur-[150px]" />
      </div>

      {/* Sidebar */}
      <Sidebar
        currentView={currentView}
        onNavigate={handleNavigate}
        isAdminUnlocked={isAdminUnlocked}
        onAdminClick={handleAdminClick}
        dataStatus={dataStatus}
        isMobileOpen={isMobileMenuOpen}
        onMobileClose={() => setIsMobileMenuOpen(false)}
        onOpenMobileConnect={() => setIsMobileConnectOpen(true)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-y-auto relative z-10">
        {/* PWA & Mobile Installation / In-App Browser Guidance Banner */}
        <PWAInstallBanner />

        {/* Header */}
        <Header
          currentView={currentView}
          onOpenSubmitModal={() => setIsSubmitModalOpen(true)}
          onOpenPrintModal={() => setIsPrintModalOpen(true)}
          onExportExcel={() => exportWeeklyRecapToExcel(effectiveStaffList, photos)}
          onMobileMenuToggle={() => setIsMobileMenuOpen(true)}
          isAdminUnlocked={isAdminUnlocked}
          onAdminClick={handleAdminClick}
          onForceSync={handleForceSync}
          isSyncing={isSyncing}
          onOpenMobileConnect={() => setIsMobileConnectOpen(true)}
        />

        {/* View Router */}
        <main className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl w-full mx-auto pb-40 sm:pb-44 md:pb-16">
          {(syncFeedbackBanner || (!isValidAppsScriptUrl(config.adminDriveScriptUrl) && !driveNoticeDismissed)) && (
            <div
              className={`rounded-2xl px-4 py-2.5 text-xs font-medium flex flex-wrap items-center justify-between gap-3 border shadow-2xs ${
                syncFeedbackBanner
                  ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                  : 'bg-amber-50 text-amber-900 border-amber-300'
              }`}
            >
              <span>
                {syncFeedbackBanner ||
                  'Penyimpanan saat ini memakai Cache Lokal. Hubungkan Google Apps Script di Area Admin agar seluruh data & foto tersinkron ke Google Drive.'}
              </span>
              <div className="flex items-center space-x-3 shrink-0">
                {!syncFeedbackBanner && !isValidAppsScriptUrl(config.adminDriveScriptUrl) && (
                  <button
                    type="button"
                    onClick={handleAdminClick}
                    className="text-[11px] font-bold bg-amber-900 text-white px-2.5 py-1 rounded-lg hover:bg-amber-800 transition cursor-pointer"
                  >
                    Setup Google Drive
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (syncFeedbackBanner) {
                      setSyncFeedbackBanner(null);
                    } else {
                      setDriveNoticeDismissed(true);
                    }
                  }}
                  className="text-[11px] font-bold underline shrink-0 cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </div>
          )}

          {currentView === 'overview' && (
            <OverviewView
              staffList={effectiveStaffList}
              photos={photos}
              onNavigate={handleNavigate}
              onSyncGoogleSheet={handleSyncGoogleSheet}
              scheduleStatus={dataStatus}
              scheduleMeta={scheduleMeta}
              targetResetAt={targetResetAt}
              trainingHoSchedule={effectiveTrainingHoSchedule}
              onOpenPhotoLightbox={(photo) => setLightboxPhoto(photo)}
            />
          )}

          {currentView === 'schedule' && (
            <ScheduleView
              staffList={effectiveStaffList}
              scheduleMeta={scheduleMeta}
              onOpenPrintModal={() => setIsPrintModalOpen(true)}
              onNavigateToAdmin={handleAdminClick}
              onForceSync={handleForceSync}
              isSyncing={isSyncing}
            />
          )}

          {currentView === 'staff-overview' && (
            <StaffOverviewView
              staffList={effectiveStaffList}
              photos={photos}
              targetResetAt={targetResetAt}
              onNavigate={handleNavigate}
              onSelectStaffForUpload={(id) => setPreselectedUploadStaffId(id)}
            />
          )}

          {currentView === 'proof-upload' && (
            <ProofUploadView
              staffList={effectiveStaffList}
              photos={photos}
              preselectedStaffId={preselectedUploadStaffId}
              onSavePhoto={handleSavePhoto}
              onNavigateToAdmin={handleAdminClick}
              onForceSync={handleForceSync}
              onOpenPhotoLightbox={(photo) => setLightboxPhoto(photo)}
            />
          )}

          {currentView === 'cashier' && (
            <CashierMonitorView
              staffList={effectiveStaffList}
              photos={photos}
              onOpenPhotoLightbox={(photo) => setLightboxPhoto(photo)}
              onForceSync={handleForceSync}
            />
          )}

          {currentView === 'links' && <LinksView />}

          {currentView === 'admin' && isAdminUnlocked && (
            <AdminView
              config={config}
              onUpdateConfig={handleUpdateConfig}
              onLockAdmin={handleLockAdmin}
              onUploadExcel={handleUploadExcel}
              staffList={effectiveStaffList}
              photos={photos}
              emsSchedule={emsSchedule}
              onSaveEmsSchedule={handleSaveEmsSchedule}
              trainingHoSchedule={effectiveTrainingHoSchedule}
              onSaveTrainingHo={handleSaveTrainingHo}
              onRestoreCloudData={handleRestoreCloudData}
              onRestoreBackup={handleRestoreBackup}
              onResetMonthlyTargets={handleResetMonthlyTargets}
              targetResetAt={targetResetAt}
              onResetDefaults={handleResetDefaults}
              onOpenPhotoLightbox={(photo) => setLightboxPhoto(photo)}
              onAddAdminPhoto={handleAddAdminPhoto}
              onDeletePhoto={handleDeletePhoto}
              onTestDriveConnection={handleTestDriveConnection}
              onMigrateToDrive={handleMigrateToDrive}
            />
          )}

          {/* Mobile clearance spacer so lowest tabs never sit hidden behind fixed MobileBottomNav */}
          <div className="h-12 md:hidden" aria-hidden="true" />
        </main>
      </div>

      {/* Modals */}
      <AdminPinModal
        isOpen={isPinModalOpen}
        onClose={() => setIsPinModalOpen(false)}
        onSuccess={handlePinSuccess}
        onResetToDefault={handleResetPinToDefault}
        expectedPin={config.adminPin || 'admin'}
      />

      <SubmitRecordModal
        isOpen={isSubmitModalOpen}
        onClose={() => setIsSubmitModalOpen(false)}
        staffList={effectiveStaffList}
        onSubmitRecord={handleSubmitRecord}
      />

      <DailyBriefPrintModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        staffList={effectiveStaffList}
        dayIndex={currentDayIndex}
      />

      <PhotoLightboxModal
        photo={lightboxPhoto}
        onClose={() => setLightboxPhoto(null)}
      />

      {/* Floating Mobile Bottom Navigation Bar (Optimized for One-Handed Smartphone Thumb Reach) */}
      <MobileBottomNav
        currentView={currentView}
        onNavigate={handleNavigate}
        onOpenMobileConnect={() => setIsMobileConnectOpen(true)}
        photoCount={photos.length}
      />

      {/* Instant Mobile QR Code & Link Sharing Modal */}
      <MobileConnectModal
        isOpen={isMobileConnectOpen}
        onClose={() => setIsMobileConnectOpen(false)}
        scriptUrl={config.adminDriveScriptUrl}
        folderId={config.adminDriveFolderId}
      />
    </div>
  );
}
