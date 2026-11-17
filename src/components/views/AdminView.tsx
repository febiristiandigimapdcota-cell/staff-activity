import React, { useState, useRef } from 'react';
import {
  ShieldCheck,
  Lock,
  FileSpreadsheet,
  Download,
  Upload,
  Database,
  RefreshCw,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Sparkles,
  Search,
  Trash2,
  PlusCircle,
  FolderOpen,
  Filter,
  ExternalLink,
  Layers,
  Clock,
  Briefcase,
  Copy,
  Check,
  Activity,
  CalendarClock,
  RotateCcw,
  GraduationCap,
  ChevronDown,
  ChevronUp,
  Link2,
  Code2,
  CloudUpload,
  HardDrive
} from 'lucide-react';
import {
  StaffMember,
  PhotoRecord,
  AppConfig,
  ActivityType,
  CustomerType,
  EmsScheduleData,
  TrainingHoScheduleData
} from '../../types';
import { APPS_SCRIPT_SNIPPET } from '../../data/defaultData';
import { downloadCsvTemplate, exportBackupJson } from '../../utils/excelHelper';
import { compressImageFile } from '../../utils/imageCompressor';
import { downloadPhotoRecord } from '../../utils/downloadHelper';
import {
  DriveRestoreSummary,
  DrivePingResult,
  isValidAppsScriptUrl
} from '../../services/driveStorageService';
import {
  DEFAULT_TARGET_FOLDER_ID,
  DEFAULT_TARGET_FOLDER_URL,
  extractFolderId
} from '../../services/googleDriveService';
import { DrivePhotoImg } from '../common/DrivePhotoImg';
import { EmsSchedulePanel } from './EmsSchedulePanel';
import { TrainingHoPanel } from './TrainingHoPanel';

interface AdminViewProps {
  config: AppConfig;
  onUpdateConfig: (newConfig: AppConfig) => void;
  onLockAdmin: () => void;
  onUploadExcel: (file: File) => Promise<boolean>;
  staffList: StaffMember[];
  photos: PhotoRecord[];
  emsSchedule: EmsScheduleData | null;
  onSaveEmsSchedule: (ems: EmsScheduleData) => Promise<void>;
  trainingHoSchedule: TrainingHoScheduleData | null;
  onSaveTrainingHo: (data: TrainingHoScheduleData) => Promise<void>;
  onRestoreCloudData: () => Promise<DriveRestoreSummary>;
  onRestoreBackup: (jsonData: { staff: StaffMember[]; photos: PhotoRecord[]; config: AppConfig }) => void;
  onResetMonthlyTargets: () => Promise<{ resetAt: string; monthKey: string }>;
  targetResetAt?: string;
  onResetDefaults: () => Promise<void> | void;
  onOpenPhotoLightbox: (photo: PhotoRecord) => void;
  onAddAdminPhoto: (
    staffId: number,
    activityType: ActivityType,
    note: string,
    photoBase64: string,
    updateTarget: boolean,
    customerType?: CustomerType,
    programCampaign?: string
  ) => Promise<{ success: boolean; message: string }>;
  onDeletePhoto?: (photoId: number) => Promise<void>;
  onTestDriveConnection: (scriptUrl: string, folderIdOrUrl: string) => Promise<DrivePingResult>;
  onMigrateToDrive: (
    includeLegacyFirestore: boolean,
    onProgress?: (msg: string) => void
  ) => Promise<{ staffCount: number; photoCount: number }>;
}

export const AdminView: React.FC<AdminViewProps> = ({
  config,
  onUpdateConfig,
  onLockAdmin,
  onUploadExcel,
  staffList,
  photos,
  emsSchedule,
  onSaveEmsSchedule,
  trainingHoSchedule,
  onSaveTrainingHo,
  onRestoreCloudData,
  onRestoreBackup,
  onResetMonthlyTargets,
  targetResetAt,
  onResetDefaults,
  onOpenPhotoLightbox,
  onAddAdminPhoto,
  onDeletePhoto,
  onTestDriveConnection,
  onMigrateToDrive
}) => {
  // Navigation inside Admin (all tabs start collapsed for lightweight render)
  type AdminTabId =
    | 'photos'
    | 'input-photo'
    | 'ems-schedule'
    | 'training-ho'
    | 'admin-links'
    | 'excel'
    | 'settings';
  const [activeAdminTab, setActiveAdminTab] = useState<AdminTabId | null>(null);
  const toggleAdminTab = (tab: AdminTabId) => {
    setActiveAdminTab((prev) => (prev === tab ? null : tab));
  };
  const [isRestoringCloud, setIsRestoringCloud] = useState(false);
  const [cloudRestoreMsg, setCloudRestoreMsg] = useState<string | null>(null);
  const [isResettingTarget, setIsResettingTarget] = useState(false);
  const [targetResetMsg, setTargetResetMsg] = useState<string | null>(null);

  // Google Drive & Apps Script setup states
  const [scriptUrlDraft, setScriptUrlDraft] = useState(config.adminDriveScriptUrl || '');
  const [folderIdDraft, setFolderIdDraft] = useState(
    config.adminDriveFolderId || DEFAULT_TARGET_FOLDER_ID
  );
  const [isTestingDrive, setIsTestingDrive] = useState(false);
  const [drivePingResult, setDrivePingResult] = useState<DrivePingResult | null>(null);
  const [showAppsScriptCode, setShowAppsScriptCode] = useState(false);
  const [copiedScriptCode, setCopiedScriptCode] = useState(false);
  const [isMigratingDrive, setIsMigratingDrive] = useState(false);
  const [migrateProgress, setMigrateProgress] = useState<string | null>(null);
  const [migrateFeedback, setMigrateFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [confirmDeletePhotoId, setConfirmDeletePhotoId] = useState<number | null>(null);
  const [settingsFeedback, setSettingsFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  React.useEffect(() => {
    if (config.adminDriveScriptUrl) {
      setScriptUrlDraft((prev) => prev || config.adminDriveScriptUrl);
    }
    if (config.adminDriveFolderId) {
      setFolderIdDraft((prev) => prev || config.adminDriveFolderId || DEFAULT_TARGET_FOLDER_ID);
    }
  }, [config.adminDriveScriptUrl, config.adminDriveFolderId]);

  // Admin Operational Work Links
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
  const handleCopyLink = (id: string, url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedLinkId(id);
    setTimeout(() => setCopiedLinkId(null), 2500);
  };

  const ADMIN_WORK_LINKS = [
    {
      id: 'plan-and-result',
      name: 'Plan And Result',
      category: 'Evaluasi & Hasil Kerja',
      url: 'https://docs.google.com/forms/d/e/1FAIpQLSfBvwap7irqgw4cK_0vK0yklptpdsg9dcjQWnha3T_ddgXMUw/viewform',
      description: 'Formulir perencanaan kerja dan pencatatan hasil evaluasi operasional harian / mingguan toko.',
      badge: 'Google Forms',
      icon: <CheckCircle2 className="w-5 h-5 text-emerald-400" />,
      colorTheme: 'from-emerald-950/80 to-zinc-900 border-emerald-500/30 hover:border-emerald-500/60'
    },
    {
      id: 'ecosystem-mastery',
      name: 'Ecosystem Mastery Session',
      category: 'Pelatihan & Penugasan Tim',
      url: 'https://docs.google.com/forms/d/e/1FAIpQLSe8K1gHsP0auF1YougpKE5NK5_9qiEFSuV3Fn7ITF8cs1ojxA/viewform',
      description: 'Form dokumentasi dan evaluasi sesi Ecosystem Mastery tim toko untuk penguasaan ekosistem Apple.',
      badge: 'Google Forms',
      icon: <Layers className="w-5 h-5 text-blue-400" />,
      colorTheme: 'from-blue-950/80 to-zinc-900 border-blue-500/30 hover:border-blue-500/60'
    },
    {
      id: 'feedback-training',
      name: 'Feedback training New Staff',
      category: 'Onboarding & Pelatihan Staf',
      url: 'https://claude.ai/public/artifacts/ea4123c1-c45d-45b0-a855-76eadf21dd80',
      description: 'Modul artifact interaktif feedback & evaluasi pelatihan staf baru toko Digimap.',
      badge: 'Training Artifact',
      icon: <Sparkles className="w-5 h-5 text-purple-400" />,
      colorTheme: 'from-purple-950/80 to-zinc-900 border-purple-500/30 hover:border-purple-500/60'
    },
    {
      id: 'activity-performance',
      name: 'Activity performance',
      category: 'Portal Monitoring Toko',
      url: 'https://www.activityperformancehub.my.id',
      description: 'Portal web resmi monitoring dan rekapitulasi data performa aktivitas toko secara real-time.',
      badge: 'Web Portal',
      icon: <Activity className="w-5 h-5 text-amber-400" />,
      colorTheme: 'from-amber-950/80 to-zinc-900 border-amber-500/30 hover:border-amber-500/60'
    }
  ];

  // Password / PIN State
  const [pinInput, setPinInput] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [pinFeedback, setPinFeedback] = useState<string | null>(null);

  // Excel Upload State
  const [isUploading, setIsUploading] = useState(false);
  const [uploadFeedback, setUploadFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Photo Archive Filters
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [staffFilter, setStaffFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Admin Manual Photo Entry State
  const [inputStaffId, setInputStaffId] = useState<number>(staffList[0]?.id || 1);
  const [inputActivity, setInputActivity] = useState<ActivityType>('OPS');
  const [inputCustomerType, setInputCustomerType] = useState<CustomerType>('iPhone Purchaser');
  const [inputProgramCampaign, setInputProgramCampaign] = useState<string>('Aksara');
  const [inputNote, setInputNote] = useState('');
  const [inputPhotoBase64, setInputPhotoBase64] = useState<string | null>(null);
  const [inputFileName, setInputFileName] = useState('');
  const [inputUpdateTarget, setInputUpdateTarget] = useState(true);
  const [isSavingAdminPhoto, setIsSavingAdminPhoto] = useState(false);
  const [adminPhotoFeedback, setAdminPhotoFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);
  const adminPhotoFileRef = useRef<HTMLInputElement>(null);

  // Password submit handler
  const handleSavePin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinInput.trim().length < 3) {
      setSettingsFeedback({
        type: 'error',
        message: 'Silakan masukkan password baru minimal 3 karakter.'
      });
      return;
    }
    onUpdateConfig({
      ...config,
      adminPin: pinInput.trim()
    });
    setPinInput('');
    setPinFeedback('Password Admin berhasil diperbarui!');
    setTimeout(() => setPinFeedback(null), 3500);
  };

  // Drive Connection Test & Save Handler
  const handleConnectDriveAppsScript = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsTestingDrive(true);
    setDrivePingResult(null);
    try {
      const cleanFolderId = extractFolderId(folderIdDraft || DEFAULT_TARGET_FOLDER_ID);
      const res = await onTestDriveConnection(scriptUrlDraft.trim(), cleanFolderId);
      setDrivePingResult(res);
      if (res.rootFolderId) setFolderIdDraft(res.rootFolderId);
    } catch (err) {
      setDrivePingResult({
        success: false,
        message: err instanceof Error ? err.message : 'Gagal menghubungi Google Apps Script.'
      });
    } finally {
      setIsTestingDrive(false);
    }
  };

  // Copy Apps Script Code Handler
  const handleCopyAppsScriptCode = async () => {
    try {
      await navigator.clipboard.writeText(APPS_SCRIPT_SNIPPET);
      setCopiedScriptCode(true);
      setTimeout(() => setCopiedScriptCode(false), 3000);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = APPS_SCRIPT_SNIPPET;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopiedScriptCode(true);
      setTimeout(() => setCopiedScriptCode(false), 3000);
    }
  };

  // Migrate Local / Legacy Firestore Data to Google Drive
  const handleRunDriveMigration = async (includeLegacyFirestore: boolean) => {
    setIsMigratingDrive(true);
    setMigrateFeedback(null);
    setMigrateProgress('Memulai proses migrasi ke Google Drive...');
    try {
      const res = await onMigrateToDrive(includeLegacyFirestore, (msg) => setMigrateProgress(msg));
      setMigrateFeedback({
        type: 'success',
        message: `Migrasi selesai! ${res.staffCount} data staf & ${res.photoCount} foto bukti berhasil tersimpan di Google Drive.`
      });
    } catch (err) {
      setMigrateFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Migrasi gagal.'
      });
    } finally {
      setIsMigratingDrive(false);
      setMigrateProgress(null);
    }
  };

  // Excel schedule upload handler
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadFeedback(null);
    try {
      const ok = await onUploadExcel(file);
      if (ok) {
        setUploadFeedback({ type: 'success', message: `Berhasil mengimpor jadwal dari ${file.name}!` });
      } else {
        setUploadFeedback({ type: 'error', message: 'Format file tidak sesuai. Pastikan kolom sesuai template.' });
      }
    } catch {
      setUploadFeedback({ type: 'error', message: 'Gagal memproses file Excel/CSV.' });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Restore backup handler
  const handleBackupUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed.staff && Array.isArray(parsed.staff)) {
          onRestoreBackup(parsed);
          setSettingsFeedback({
            type: 'success',
            message: 'Backup JSON berhasil dipulihkan ke aplikasi & Google Drive!'
          });
        } else {
          setSettingsFeedback({
            type: 'error',
            message: 'Format file backup JSON tidak valid.'
          });
        }
      } catch {
        setSettingsFeedback({
          type: 'error',
          message: 'File JSON rusak atau tidak dapat dibaca.'
        });
      }
    };
    reader.readAsText(file);
  };

  // Admin Manual Photo Handlers
  const handleAdminPhotoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setAdminPhotoFeedback({ type: 'error', message: 'Harap pilih file gambar (JPG, PNG, WebP).' });
      return;
    }

    try {
      setInputFileName(file.name);
      const res = await compressImageFile(file);
      setInputPhotoBase64(res.base64);
      setAdminPhotoFeedback(null);
    } catch (err) {
      setAdminPhotoFeedback({
        type: 'error',
        message: 'Gagal memproses gambar: ' + (err instanceof Error ? err.message : '')
      });
    }
  };

  const handleAdminPhotoDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setAdminPhotoFeedback({ type: 'error', message: 'Harap pilih file gambar (JPG, PNG, WebP).' });
      return;
    }

    try {
      setInputFileName(file.name);
      const res = await compressImageFile(file);
      setInputPhotoBase64(res.base64);
      setAdminPhotoFeedback(null);
    } catch (err) {
      setAdminPhotoFeedback({
        type: 'error',
        message: 'Gagal memproses gambar: ' + (err instanceof Error ? err.message : '')
      });
    }
  };

  const handleAdminPhotoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputPhotoBase64) {
      setAdminPhotoFeedback({ type: 'error', message: 'Pilih atau drop file foto terlebih dahulu.' });
      return;
    }

    setIsSavingAdminPhoto(true);
    setAdminPhotoFeedback(null);

    try {
      const isTryOn =
        inputActivity === 'TryOn_iPad' ||
        inputActivity === 'TryOn_AirPods' ||
        inputActivity === 'TryOn_Watch' ||
        inputActivity === 'TryOn';

      const res = await onAddAdminPhoto(
        inputStaffId,
        inputActivity,
        inputNote.trim(),
        inputPhotoBase64,
        inputUpdateTarget,
        isTryOn ? inputCustomerType : undefined,
        isTryOn ? inputProgramCampaign : undefined
      );

      setAdminPhotoFeedback({
        type: 'success',
        message: res.message || 'Foto bukti berhasil disimpan ke database oleh Admin!'
      });

      // Reset form
      setInputPhotoBase64(null);
      setInputFileName('');
      setInputNote('');
      if (adminPhotoFileRef.current) adminPhotoFileRef.current.value = '';
    } catch (err) {
      setAdminPhotoFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Gagal menyimpan foto.'
      });
    } finally {
      setIsSavingAdminPhoto(false);
    }
  };

  // Helper to download image
  const handleDownloadPhoto = (photo: PhotoRecord) => {
    void downloadPhotoRecord(photo);
  };

  // Filtered Photos List
  const filteredPhotos = photos.filter((p) => {
    let matchesCategory = true;
    if (categoryFilter !== 'ALL') {
      if (categoryFilter === 'TryOn_iPad') {
        matchesCategory =
          p.activityType === 'TryOn_iPad' ||
          (p.activityType === 'TryOn' &&
            (!p.programCampaign || p.programCampaign === 'Aksara'));
      } else if (categoryFilter === 'TryOn_AirPods') {
        matchesCategory =
          p.activityType === 'TryOn_AirPods' ||
          (p.activityType === 'TryOn' && p.programCampaign === 'Samudra');
      } else if (categoryFilter === 'TryOn_Watch') {
        matchesCategory =
          p.activityType === 'TryOn_Watch' ||
          (p.activityType === 'TryOn' && p.programCampaign === 'Nirwana');
      } else {
        matchesCategory = p.activityType === categoryFilter;
      }
    }
    const matchesStaff = staffFilter === 'ALL' || p.staffName.toLowerCase() === staffFilter.toLowerCase();
    const matchesSearch =
      p.staffName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.note.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.customerType && p.customerType.toLowerCase().includes(searchQuery.toLowerCase())) ||
      p.timestamp.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesStaff && matchesSearch;
  });

  // Photo Counters
  const opsPhotoCount = photos.filter((p) => p.activityType === 'OPS').length;
  const tryOnIpadPhotoCount = photos.filter(
    (p) =>
      p.activityType === 'TryOn_iPad' ||
      (p.activityType === 'TryOn' && (!p.programCampaign || p.programCampaign === 'Aksara'))
  ).length;
  const tryOnAirPodsPhotoCount = photos.filter(
    (p) =>
      p.activityType === 'TryOn_AirPods' ||
      (p.activityType === 'TryOn' && p.programCampaign === 'Samudra')
  ).length;
  const tryOnWatchPhotoCount = photos.filter(
    (p) =>
      p.activityType === 'TryOn_Watch' ||
      (p.activityType === 'TryOn' && p.programCampaign === 'Nirwana')
  ).length;
  const weeklyPhotoCount = photos.filter((p) => p.activityType === 'WeeklySeed').length;

  // List of all staff who exist in schedule OR have uploaded photos
  const availableStaffOptions = React.useMemo(() => {
    const map = new Map<string, string>();
    staffList.forEach((s) => {
      if (s.name) map.set(s.name.trim().toLowerCase(), s.name.trim());
    });
    photos.forEach((p) => {
      if (p.staffName && !map.has(p.staffName.trim().toLowerCase())) {
        map.set(p.staffName.trim().toLowerCase(), p.staffName.trim());
      }
    });
    return Array.from(map.values()).sort((a, b) => a.localeCompare(b));
  }, [staffList, photos]);

  // Keep inputStaffId valid when staffList updates
  React.useEffect(() => {
    if (staffList.length > 0 && !staffList.some((s) => s.id === inputStaffId)) {
      setInputStaffId(staffList[0].id);
    }
  }, [staffList, inputStaffId]);

  return (
    <div className="space-y-6">
      <div className="liquid-glass-card p-5 sm:p-7 rounded-[28px] space-y-6">
        {/* Admin Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-zinc-200/60 gap-3">
          <h3 className="font-bold text-zinc-900 text-base sm:text-lg flex items-center text-amber-600">
            <ShieldCheck className="w-5 h-5 mr-2" />
            <span>Area Admin Operasional Toko</span>
          </h3>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              disabled={isResettingTarget}
              onClick={async () => {
                if (
                  confirm(
                    'Reset pencapaian target bulanan (OPS 81 / Try-On 190) & mingguan kembali ke 0 untuk pergantian bulan?\n\nFoto bukti yang sudah disubmit TIDAK akan dihapus.'
                  )
                ) {
                  setIsResettingTarget(true);
                  setTargetResetMsg(null);
                  try {
                    await onResetMonthlyTargets();
                    setTargetResetMsg('Target berhasil direset ke 0 di seluruh perangkat (foto bukti tetap aman).');
                  } catch (err) {
                    setTargetResetMsg(
                      `Gagal mereset target: ${err instanceof Error ? err.message : 'Periksa koneksi.'}`
                    );
                  } finally {
                    setIsResettingTarget(false);
                  }
                }
              }}
              className="bg-amber-50 hover:bg-amber-100 disabled:opacity-60 text-amber-900 border border-amber-300 px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer"
              title="Reset seluruh target bulanan & mingguan menjadi 0 (foto tidak terhapus)"
            >
              <RotateCcw className={`w-3.5 h-3.5 text-amber-700 ${isResettingTarget ? 'animate-spin' : ''}`} />
              <span>{isResettingTarget ? 'Mereset...' : 'Reset Target (0)'}</span>
            </button>
            <button
              onClick={onLockAdmin}
              className="bg-zinc-100 hover:bg-zinc-200 text-zinc-800 px-3.5 py-2 rounded-xl text-xs font-semibold transition flex items-center space-x-1.5 cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Kunci Area Admin</span>
            </button>
          </div>
        </div>

        {targetResetMsg && (
          <div className="p-3.5 rounded-xl bg-emerald-50 text-emerald-900 border border-emerald-200 text-xs font-semibold flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{targetResetMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => setTargetResetMsg(null)}
              className="text-[11px] underline ml-2 cursor-pointer"
            >
              Tutup
            </button>
          </div>
        )}

        {uploadFeedback && (
          <div
            className={`p-3.5 rounded-xl text-xs flex items-center justify-between ${
              uploadFeedback.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}
          >
            <span>{uploadFeedback.message}</span>
            <button
              onClick={() => setUploadFeedback(null)}
              className="text-[11px] underline ml-2 font-medium"
            >
              Tutup
            </button>
          </div>
        )}

        {/* Admin Navigation Tabs (termetakan vertikal, masing-masing punya space sendiri) */}
        <div className="space-y-3">
          {/* TAB 1: ARSIP FOTO BUKTI TERUPLOAD */}
          <div
            className={`rounded-2xl border overflow-hidden transition-all ${
              activeAdminTab === 'photos'
                ? 'border-zinc-900 shadow-sm bg-white'
                : 'border-zinc-200/80 bg-zinc-50/70 hover:bg-zinc-100/80'
            }`}
          >
            <button
              type="button"
              onClick={() => toggleAdminTab('photos')}
              className={`w-full px-4 py-3.5 text-xs font-semibold transition flex items-center justify-between gap-3 cursor-pointer ${
                activeAdminTab === 'photos'
                  ? 'bg-zinc-900 text-white'
                  : 'text-zinc-800'
              }`}
            >
              <span className="flex items-center space-x-2.5 min-w-0">
                <FolderOpen className="w-4 h-4 shrink-0" />
                <span className="truncate">Arsip Foto Bukti ({photos.length})</span>
              </span>
              {activeAdminTab === 'photos' ? (
                <ChevronUp className="w-4 h-4 shrink-0 opacity-85" />
              ) : (
                <ChevronDown className="w-4 h-4 shrink-0 opacity-60" />
              )}
            </button>

            {activeAdminTab === 'photos' && (
              <div className="p-4 sm:p-5 bg-white/95 border-t border-zinc-200/70">
                <div className="space-y-5">
            {/* Direct Info Banner on Google Drive Storage */}
            <div className="bg-zinc-900 text-white p-4 sm:p-5 rounded-2xl border border-zinc-800 space-y-3">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex items-center space-x-2">
                  <span className="p-1.5 bg-emerald-500/20 text-emerald-400 rounded-lg">
                    <HardDrive className="w-4 h-4" />
                  </span>
                  <div>
                    <h4 className="font-bold text-sm text-white">
                      Pusat Data Foto Screenshot (Google Drive)
                    </h4>
                    <span className="text-[11px] text-zinc-400">
                      {isValidAppsScriptUrl(config.adminDriveScriptUrl)
                        ? '✓ Terhubung via Google Apps Script Web App'
                        : 'Mode Lokal — Hubungkan Apps Script di Tab Pengaturan'}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <a
                    href={config.adminDriveFolderLink || config.adminDriveUrl || DEFAULT_TARGET_FOLDER_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-xs font-semibold px-3 py-2 rounded-xl transition flex items-center space-x-1.5"
                    title="Buka folder utama Google Drive"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Buka Google Drive</span>
                  </a>
                  {!isValidAppsScriptUrl(config.adminDriveScriptUrl) && (
                    <button
                      type="button"
                      onClick={() => setActiveAdminTab('settings')}
                      className="bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-bold px-3 py-2 rounded-xl transition flex items-center space-x-1.5 cursor-pointer"
                    >
                      <Link2 className="w-3.5 h-3.5" />
                      <span>Setup Apps Script</span>
                    </button>
                  )}
                  <button
                    onClick={() => setActiveAdminTab('input-photo')}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-3.5 py-2 rounded-xl transition flex items-center space-x-1.5 cursor-pointer"
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>Input Foto Manual</span>
                  </button>
                </div>
              </div>

              {/* 5 Category Counters */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 pt-2 border-t border-zinc-800 text-xs">
                <div className="bg-zinc-800/80 p-2.5 rounded-xl border border-zinc-700/60">
                  <span className="text-[10px] text-blue-400 font-semibold block">Open Studio (OPS)</span>
                  <span className="font-mono text-base font-bold text-white">{opsPhotoCount} File</span>
                </div>
                <div className="bg-zinc-800/80 p-2.5 rounded-xl border border-zinc-700/60">
                  <span className="text-[10px] text-emerald-400 font-semibold block">Try On iPad (Aksara)</span>
                  <span className="font-mono text-base font-bold text-white">{tryOnIpadPhotoCount} File</span>
                </div>
                <div className="bg-zinc-800/80 p-2.5 rounded-xl border border-zinc-700/60">
                  <span className="text-[10px] text-purple-400 font-semibold block">Try On AirPods (Samudra)</span>
                  <span className="font-mono text-base font-bold text-white">{tryOnAirPodsPhotoCount} File</span>
                </div>
                <div className="bg-zinc-800/80 p-2.5 rounded-xl border border-zinc-700/60">
                  <span className="text-[10px] text-rose-400 font-semibold block">Try On Watch (Nirwana)</span>
                  <span className="font-mono text-base font-bold text-white">{tryOnWatchPhotoCount} File</span>
                </div>
                <div className="bg-zinc-800/80 p-2.5 rounded-xl border border-zinc-700/60">
                  <span className="text-[10px] text-indigo-400 font-semibold block">Weekly Sales Coach</span>
                  <span className="font-mono text-base font-bold text-white">{weeklyPhotoCount} File</span>
                </div>
              </div>
            </div>

            {/* Quick Access Card for Admin Work Links */}
            <div className="bg-gradient-to-r from-blue-50/90 via-indigo-50/60 to-blue-50/90 border border-blue-200/90 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-blue-600 text-white rounded-xl shadow-xs shrink-0">
                  <Briefcase className="w-4 h-4" />
                </div>
                <h4 className="font-bold text-xs text-blue-950">
                  Tautan Cepat Pekerjaan Admin (4 Tautan)
                </h4>
              </div>
              <button
                onClick={() => setActiveAdminTab('admin-links')}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3.5 py-1.5 rounded-xl transition flex items-center space-x-1.5 shrink-0 shadow-xs"
              >
                <span>Buka Semua Tautan</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Filter & Search Bar */}
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-zinc-50 p-3.5 rounded-2xl border border-zinc-200/90 text-xs">
              <div className="flex items-center space-x-2 overflow-x-auto">
                <span className="text-[11px] font-semibold text-zinc-500 shrink-0 flex items-center">
                  <Filter className="w-3.5 h-3.5 mr-1" />
                  Kategori:
                </span>
                {[
                  { id: 'ALL', label: 'Semua' },
                  { id: 'OPS', label: 'Open Studio' },
                  { id: 'TryOn_iPad', label: 'iPad (Aksara)' },
                  { id: 'TryOn_AirPods', label: 'AirPods (Samudra)' },
                  { id: 'TryOn_Watch', label: 'Watch (Nirwana)' },
                  { id: 'WeeklySeed', label: 'Weekly Coach' }
                ].map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setCategoryFilter(cat.id)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition shrink-0 ${
                      categoryFilter === cat.id
                        ? 'bg-zinc-900 text-white'
                        : 'bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-100'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <select
                  value={staffFilter}
                  onChange={(e) => setStaffFilter(e.target.value)}
                  className="text-xs border border-zinc-300 rounded-xl p-2 bg-white focus:ring-1 focus:ring-zinc-900 focus:outline-none"
                >
                  <option value="ALL">Semua Staf Toko</option>
                  {availableStaffOptions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>

                <div className="relative w-full sm:w-56">
                  <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari nama / catatan..."
                    className="w-full pl-8 pr-3 py-2 rounded-xl border border-zinc-300 text-xs focus:ring-1 focus:ring-zinc-900 focus:outline-none bg-white"
                  />
                </div>
              </div>
            </div>

            {/* Photos Grid */}
            {filteredPhotos.length === 0 ? (
              <div className="text-center py-14 text-zinc-400 text-xs bg-zinc-50/60 rounded-2xl border border-dashed border-zinc-300">
                <FolderOpen className="w-10 h-10 mx-auto mb-2 text-zinc-300" />
                <p className="font-semibold text-zinc-700 text-sm">Tidak ada foto bukti yang sesuai kriteria</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredPhotos.map((photo) => {
                  const getCategoryBadge = (cat: string) => {
                    switch (cat) {
                      case 'OPS':
                        return { label: 'OPS', cls: 'bg-blue-100 text-blue-800 border-blue-200' };
                      case 'TryOn_iPad':
                        return { label: 'iPad (Aksara)', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
                      case 'TryOn_AirPods':
                        return { label: 'AirPods (Samudra)', cls: 'bg-purple-100 text-purple-800 border-purple-200' };
                      case 'TryOn_Watch':
                        return { label: 'Watch (Nirwana)', cls: 'bg-rose-100 text-rose-800 border-rose-200' };
                      case 'TryOn':
                        if (photo.programCampaign === 'Nirwana') {
                          return { label: 'Watch (Nirwana)', cls: 'bg-rose-100 text-rose-800 border-rose-200' };
                        }
                        if (photo.programCampaign === 'Samudra') {
                          return { label: 'AirPods (Samudra)', cls: 'bg-purple-100 text-purple-800 border-purple-200' };
                        }
                        return { label: 'Try On', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
                      case 'WeeklySeed':
                        return { label: 'Weekly Coach', cls: 'bg-indigo-100 text-indigo-800 border-indigo-200' };
                      default:
                        return { label: cat, cls: 'bg-zinc-100 text-zinc-800 border-zinc-200' };
                    }
                  };
                  const badge = getCategoryBadge(photo.activityType);

                  return (
                    <div
                      key={photo.id}
                      className="bg-white border border-zinc-200/90 rounded-2xl p-3.5 flex flex-col justify-between hover:border-zinc-400 transition shadow-xs group"
                    >
                      <div>
                        {/* Image Preview with click to zoom */}
                        <div
                          onClick={() => onOpenPhotoLightbox(photo)}
                          className="relative mb-3 overflow-hidden rounded-xl cursor-pointer bg-zinc-100"
                        >
                          <DrivePhotoImg
                            photo={photo}
                            alt={photo.note || photo.staffName}
                            className="w-full h-36 object-cover group-hover:scale-105 transition duration-200"
                          />
                          <div className="absolute top-2 left-2 flex flex-wrap items-center gap-1">
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-md font-mono font-bold border ${badge.cls}`}
                            >
                              {badge.label}
                            </span>
                            {photo.customerType && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-md font-bold bg-zinc-950 text-white shadow-xs">
                                {photo.customerType === 'iPhone Purchaser' ? '🛍️ iPhone' : '🔍 Browser'}
                              </span>
                            )}
                          </div>
                          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white text-xs font-semibold space-x-1">
                            <Eye className="w-4 h-4" />
                            <span>Lihat Penuh</span>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <h5 className="font-bold text-xs text-zinc-900 truncate">{photo.staffName}</h5>
                          {photo.note && (
                            <p className="text-[11px] text-zinc-500 line-clamp-2 leading-snug">
                              {photo.note}
                            </p>
                          )}
                          <div className="flex items-center justify-between text-[10px] text-zinc-400 font-mono pt-1">
                            <span className="flex items-center space-x-1">
                              <Clock className="w-3 h-3" />
                              <span>{photo.timestamp}</span>
                            </span>
                            {photo.syncedToDrive && (
                              <span className="text-[9px] text-emerald-700 font-sans font-semibold">
                                Drive
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="mt-3 pt-2.5 border-t border-zinc-100 flex items-center justify-between text-xs gap-2">
                        <button
                          onClick={() => handleDownloadPhoto(photo)}
                          className="text-[11px] text-zinc-700 hover:text-zinc-950 font-semibold flex items-center space-x-1 cursor-pointer"
                          title="Download file gambar ini"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Unduh</span>
                        </button>

                        <div className="flex items-center space-x-2.5">
                          {onDeletePhoto && (
                            confirmDeletePhotoId === photo.id ? (
                              <button
                                type="button"
                                onClick={() => {
                                  void onDeletePhoto(photo.id);
                                  setConfirmDeletePhotoId(null);
                                }}
                                className="text-[10px] px-2 py-0.5 rounded bg-red-600 text-white font-bold cursor-pointer"
                              >
                                Konfirmasi Hapus
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeletePhotoId(photo.id)}
                                className="text-[11px] text-red-600 hover:text-red-800 flex items-center space-x-0.5 cursor-pointer"
                                title="Hapus foto dari arsip"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )
                          )}
                          <button
                            onClick={() => onOpenPhotoLightbox(photo)}
                            className="text-[11px] text-zinc-700 hover:text-zinc-950 font-medium flex items-center space-x-1 cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Perbesar</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
                </div>
              </div>
            )}
          </div>

          {/* TAB 2: MASUKKAN FOTO BUKTI MANUAL OLEH ADMIN */}
          <div
            className={`rounded-2xl border overflow-hidden transition-all ${
              activeAdminTab === 'input-photo'
                ? 'border-emerald-700 shadow-sm bg-white'
                : 'border-emerald-200 bg-emerald-50/60 hover:bg-emerald-100/70'
            }`}
          >
            <button
              type="button"
              onClick={() => toggleAdminTab('input-photo')}
              className={`w-full px-4 py-3.5 text-xs font-semibold transition flex items-center justify-between gap-3 cursor-pointer ${
                activeAdminTab === 'input-photo'
                  ? 'bg-emerald-700 text-white'
                  : 'text-emerald-900'
              }`}
            >
              <span className="flex items-center space-x-2.5 min-w-0">
                <PlusCircle
                  className={`w-4 h-4 shrink-0 ${
                    activeAdminTab === 'input-photo' ? 'text-emerald-200' : 'text-emerald-700'
                  }`}
                />
                <span className="truncate">+ Masukkan Foto Baru (Admin)</span>
              </span>
              {activeAdminTab === 'input-photo' ? (
                <ChevronUp className="w-4 h-4 shrink-0 opacity-85" />
              ) : (
                <ChevronDown className="w-4 h-4 shrink-0 opacity-60" />
              )}
            </button>

            {activeAdminTab === 'input-photo' && (
              <div className="p-4 sm:p-5 bg-white/95 border-t border-emerald-200/70">
                <div className="max-w-2xl mx-auto space-y-5">
            <div className="p-4 bg-emerald-50/80 rounded-2xl border border-emerald-200 flex items-center space-x-3">
              <div className="p-2 bg-emerald-700 text-white rounded-xl shrink-0">
                <PlusCircle className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-sm text-emerald-950">
                Masukkan Foto Bukti Terupload (Admin Input)
              </h4>
            </div>

            {adminPhotoFeedback && (
              <div
                className={`p-3.5 rounded-xl text-xs flex items-center justify-between ${
                  adminPhotoFeedback.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-red-50 text-red-800 border border-red-200'
                }`}
              >
                <span>{adminPhotoFeedback.message}</span>
                <button
                  onClick={() => setAdminPhotoFeedback(null)}
                  className="text-[11px] underline ml-2 font-medium"
                >
                  Tutup
                </button>
              </div>
            )}

            <form onSubmit={handleAdminPhotoSubmit} className="space-y-4 text-xs bg-zinc-50/70 p-5 rounded-2xl border border-zinc-200">
              <div>
                <label className="block font-medium text-zinc-700 mb-1.5">
                  Pilih Staf yang Mengumpulkan Foto
                </label>
                <select
                  value={inputStaffId}
                  onChange={(e) => setInputStaffId(Number(e.target.value))}
                  className="w-full border border-zinc-300 rounded-xl p-2.5 focus:ring-1 focus:ring-zinc-900 focus:outline-none bg-white font-medium"
                >
                  {staffList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.role || 'Staff'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-medium text-zinc-700 mb-1.5">
                  Kategori Aktivitas Bukti
                </label>
                <select
                  value={inputActivity}
                  onChange={(e) => {
                    const val = e.target.value as ActivityType;
                    setInputActivity(val);
                    if (val === 'TryOn_iPad') setInputProgramCampaign('Aksara');
                    if (val === 'TryOn_AirPods') setInputProgramCampaign('Samudra');
                    if (val === 'TryOn_Watch') setInputProgramCampaign('Nirwana');
                  }}
                  className="w-full border border-zinc-300 rounded-xl p-2.5 focus:ring-1 focus:ring-zinc-900 focus:outline-none bg-white font-semibold text-zinc-800"
                >
                  <option value="OPS">🎬 Open Studio (OPS)</option>
                  <option value="TryOn_iPad">📱 Try on iPad (Aksara)</option>
                  <option value="TryOn_AirPods">🎧 Try on AirPods (Samudra)</option>
                  <option value="TryOn_Watch">⌚ Try on Apple Watch (Nirwana)</option>
                  <option value="WeeklySeed">🌱 Weekly Sales Coach</option>
                </select>
              </div>

              {/* Customer Type Selector if Try-on category */}
              {(inputActivity === 'TryOn_iPad' || inputActivity === 'TryOn_AirPods' || inputActivity === 'TryOn_Watch' || inputActivity === 'TryOn') && (
                <div className="p-3.5 bg-zinc-900 text-white rounded-xl space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-zinc-200">Tipe Pelanggan (Customer Type):</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                      REQUIRED
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setInputCustomerType('iPhone Purchaser')}
                      className={`p-2.5 rounded-lg border text-left text-xs font-medium transition flex items-center space-x-2 ${
                        inputCustomerType === 'iPhone Purchaser'
                          ? 'bg-emerald-600 border-emerald-500 text-white font-bold'
                          : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:text-white'
                      }`}
                    >
                      <span>🛍️</span>
                      <span>iPhone Purchaser</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setInputCustomerType('Browser')}
                      className={`p-2.5 rounded-lg border text-left text-xs font-medium transition flex items-center space-x-2 ${
                        inputCustomerType === 'Browser'
                          ? 'bg-blue-600 border-blue-500 text-white font-bold'
                          : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:text-white'
                      }`}
                    >
                      <span>🔍</span>
                      <span>Browser</span>
                    </button>
                  </div>
                  <div className="pt-2 border-t border-zinc-800 flex items-center justify-between text-[11px]">
                    <span className="text-zinc-400">Program Campaign:</span>
                    <div className="flex items-center space-x-1.5">
                      {['Aksara', 'Samudra', 'Nirwana'].map((camp) => (
                        <button
                          key={camp}
                          type="button"
                          onClick={() => setInputProgramCampaign(camp)}
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold transition ${
                            inputProgramCampaign === camp
                              ? 'bg-white text-zinc-950 font-bold'
                              : 'bg-zinc-800 text-zinc-400 hover:text-white'
                          }`}
                        >
                          {camp}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block font-medium text-zinc-700 mb-1.5">
                  Catatan / Keterangan Bukti
                </label>
                <input
                  type="text"
                  value={inputNote}
                  onChange={(e) => setInputNote(e.target.value)}
                  placeholder="Contoh: Bukti sesi 1 diunggah via chat PIC / Laporan demo iPad"
                  className="w-full border border-zinc-300 rounded-xl p-2.5 focus:ring-1 focus:ring-zinc-900 focus:outline-none bg-white"
                />
              </div>

              {/* Drag & Drop File Picker */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleAdminPhotoDrop}
                onClick={() => adminPhotoFileRef.current?.click()}
                className="border-2 border-dashed border-zinc-300 hover:border-zinc-800 rounded-2xl p-6 text-center transition bg-white cursor-pointer"
              >
                <input
                  ref={adminPhotoFileRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAdminPhotoFileChange}
                  className="hidden"
                />

                {!inputPhotoBase64 ? (
                  <div className="space-y-1.5">
                    <Upload className="w-7 h-7 text-zinc-400 mx-auto" />
                    <p className="text-xs font-semibold text-zinc-800">
                      Pilih Foto Screenshot
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 flex flex-col items-center">
                    <img
                      src={inputPhotoBase64}
                      alt="Preview"
                      className="max-h-48 rounded-xl object-contain border border-zinc-300 shadow-sm"
                    />
                    <p className="text-xs font-mono text-zinc-600 font-medium truncate max-w-xs">
                      {inputFileName}
                    </p>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setInputPhotoBase64(null);
                        setInputFileName('');
                      }}
                      className="text-[10px] text-red-600 hover:underline flex items-center"
                    >
                      <Trash2 className="w-3 h-3 mr-0.5" /> Ganti Foto
                    </button>
                  </div>
                )}
              </div>

              {/* Checkbox: Update Target Counter */}
              <label className="flex items-center space-x-2 pt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={inputUpdateTarget}
                  onChange={(e) => setInputUpdateTarget(e.target.checked)}
                  className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 w-4 h-4"
                />
                <span className="text-xs font-medium text-zinc-700">
                  Otomatis tambahkan +1 ke pencapaian target staf yang bersangkutan
                </span>
              </label>

              <button
                type="submit"
                disabled={isSavingAdminPhoto || !inputPhotoBase64}
                className="w-full bg-emerald-700 hover:bg-emerald-600 disabled:bg-zinc-300 text-white px-4 py-3 rounded-xl text-xs font-semibold transition shadow-md flex items-center justify-center space-x-2"
              >
                <PlusCircle className="w-4 h-4" />
                <span>
                  {isSavingAdminPhoto ? 'Mengunggah ke Google Drive...' : 'Simpan Foto ke Google Drive'}
                </span>
              </button>
            </form>
                </div>
              </div>
            )}
          </div>

          {/* TAB 3: EMS SCHEDULE */}
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => toggleAdminTab('ems-schedule')}
              className={`px-3.5 py-2.5 rounded-xl text-xs font-semibold transition inline-flex items-center space-x-2 cursor-pointer ${
                activeAdminTab === 'ems-schedule'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-indigo-50 text-indigo-800 border border-indigo-200 hover:bg-indigo-100'
              }`}
            >
              <CalendarClock className="w-4 h-4 shrink-0" />
              <span>EMS Schedule</span>
              {activeAdminTab === 'ems-schedule' ? (
                <ChevronUp className="w-3.5 h-3.5 opacity-80" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 opacity-60" />
              )}
            </button>

            {activeAdminTab === 'ems-schedule' && (
              <div className="pt-1">
                <EmsSchedulePanel
                  staffList={staffList}
                  emsSchedule={emsSchedule}
                  onSaveEmsSchedule={onSaveEmsSchedule}
                />
              </div>
            )}
          </div>

          {/* TAB 4: TRAINING HO */}
          <div
            className={`rounded-2xl border overflow-hidden transition-all ${
              activeAdminTab === 'training-ho'
                ? 'border-emerald-700 shadow-sm bg-white'
                : 'border-emerald-200 bg-emerald-50/60 hover:bg-emerald-100/70'
            }`}
          >
            <button
              type="button"
              onClick={() => toggleAdminTab('training-ho')}
              className={`w-full px-4 py-3.5 text-xs font-semibold transition flex items-center justify-between gap-3 cursor-pointer ${
                activeAdminTab === 'training-ho'
                  ? 'bg-emerald-700 text-white'
                  : 'text-emerald-900'
              }`}
            >
              <span className="flex items-center space-x-2.5 min-w-0">
                <GraduationCap className="w-4 h-4 shrink-0" />
                <span className="truncate">Training HO ({trainingHoSchedule?.items?.length || 0})</span>
              </span>
              {activeAdminTab === 'training-ho' ? (
                <ChevronUp className="w-4 h-4 shrink-0 opacity-85" />
              ) : (
                <ChevronDown className="w-4 h-4 shrink-0 opacity-60" />
              )}
            </button>

            {activeAdminTab === 'training-ho' && (
              <div className="p-4 sm:p-5 bg-white/95 border-t border-emerald-200/70">
                <TrainingHoPanel
                  trainingHoSchedule={trainingHoSchedule}
                  onSaveTrainingHo={onSaveTrainingHo}
                />
              </div>
            )}
          </div>

          {/* TAB 5: LINK-LINK PEKERJAAN ADMIN */}
          <div
            className={`rounded-2xl border overflow-hidden transition-all ${
              activeAdminTab === 'admin-links'
                ? 'border-blue-600 shadow-sm bg-white'
                : 'border-blue-200 bg-blue-50/60 hover:bg-blue-100/70'
            }`}
          >
            <button
              type="button"
              onClick={() => toggleAdminTab('admin-links')}
              className={`w-full px-4 py-3.5 text-xs font-semibold transition flex items-center justify-between gap-3 cursor-pointer ${
                activeAdminTab === 'admin-links'
                  ? 'bg-blue-600 text-white'
                  : 'text-blue-900'
              }`}
            >
              <span className="flex items-center space-x-2.5 min-w-0">
                <Briefcase
                  className={`w-4 h-4 shrink-0 ${
                    activeAdminTab === 'admin-links' ? 'text-blue-100' : 'text-blue-600'
                  }`}
                />
                <span className="truncate">Link Pekerjaan Admin (4 Tautan)</span>
              </span>
              {activeAdminTab === 'admin-links' ? (
                <ChevronUp className="w-4 h-4 shrink-0 opacity-85" />
              ) : (
                <ChevronDown className="w-4 h-4 shrink-0 opacity-60" />
              )}
            </button>

            {activeAdminTab === 'admin-links' && (
              <div className="p-4 sm:p-5 bg-white/95 border-t border-blue-200/70">
                <div className="space-y-4 max-w-4xl">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-200">
              <div className="flex items-center space-x-2">
                <Briefcase className="w-4 h-4 text-zinc-700" />
                <h3 className="font-bold text-sm text-zinc-900">
                  Tautan Pekerjaan Admin Toko
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600 font-bold">
                  4 Tautan
                </span>
              </div>
            </div>

            {/* Compact Link Rows */}
            <div className="space-y-2">
              {ADMIN_WORK_LINKS.map((linkItem) => (
                <div
                  key={linkItem.id}
                  className="bg-white rounded-2xl border border-zinc-200/90 hover:border-zinc-400 p-3 sm:p-3.5 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs hover:shadow-xs group"
                >
                  <div className="flex items-center space-x-3 min-w-0 flex-1">
                    <div className="w-8 h-8 rounded-xl bg-zinc-900 flex items-center justify-center shrink-0 shadow-2xs">
                      {linkItem.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center space-x-2">
                        <h4 className="font-bold text-xs sm:text-sm text-zinc-900 truncate group-hover:text-blue-600 transition">
                          {linkItem.name}
                        </h4>
                        <span className="text-[9px] font-mono px-2 py-0.5 rounded-md font-semibold bg-zinc-100 text-zinc-600 shrink-0">
                          {linkItem.badge}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end space-x-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-zinc-100">
                    <button
                      onClick={() => handleCopyLink(linkItem.id, linkItem.url)}
                      className="px-2.5 py-1.5 rounded-xl text-[11px] font-medium bg-zinc-100 hover:bg-zinc-200 text-zinc-700 transition flex items-center space-x-1"
                      title="Salin URL tautan"
                    >
                      {copiedLinkId === linkItem.id ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-600" />
                          <span className="text-emerald-700 font-bold">Tersalin</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3 text-zinc-500" />
                          <span>Salin</span>
                        </>
                      )}
                    </button>

                    <a
                      href={linkItem.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded-xl text-[11px] font-bold bg-zinc-900 hover:bg-zinc-800 text-white transition flex items-center space-x-1 shadow-2xs"
                    >
                      <span>Buka</span>
                      <ExternalLink className="w-3 h-3 text-blue-400" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
                </div>
              </div>
            )}
          </div>

          {/* TAB 6: UPLOAD SCHEDULE EXCEL */}
          <div
            className={`rounded-2xl border overflow-hidden transition-all ${
              activeAdminTab === 'excel'
                ? 'border-zinc-900 shadow-sm bg-white'
                : 'border-zinc-200/80 bg-zinc-50/70 hover:bg-zinc-100/80'
            }`}
          >
            <button
              type="button"
              onClick={() => toggleAdminTab('excel')}
              className={`w-full px-4 py-3.5 text-xs font-semibold transition flex items-center justify-between gap-3 cursor-pointer ${
                activeAdminTab === 'excel'
                  ? 'bg-zinc-900 text-white'
                  : 'text-zinc-800'
              }`}
            >
              <span className="flex items-center space-x-2.5 min-w-0">
                <FileSpreadsheet className="w-4 h-4 shrink-0" />
                <span className="truncate">Upload Schedule Excel</span>
              </span>
              {activeAdminTab === 'excel' ? (
                <ChevronUp className="w-4 h-4 shrink-0 opacity-85" />
              ) : (
                <ChevronDown className="w-4 h-4 shrink-0 opacity-60" />
              )}
            </button>

            {activeAdminTab === 'excel' && (
              <div className="p-4 sm:p-5 bg-white/95 border-t border-zinc-200/70">
                <div className="max-w-2xl mx-auto space-y-5">
            <div className="bg-zinc-50/80 p-5 rounded-2xl border border-zinc-200/90 space-y-4">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-zinc-900 text-white rounded-xl shadow-sm">
                  <FileSpreadsheet className="w-4 h-4" />
                </div>
                <h4 className="font-bold text-xs sm:text-sm text-zinc-900">
                  Upload Schedule Excel Mingguan
                </h4>
              </div>

              {/* Upload Drop Area */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-zinc-300 hover:border-zinc-800 rounded-xl p-6 text-center transition bg-white cursor-pointer group"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <Upload className="w-7 h-7 text-zinc-400 group-hover:text-zinc-900 mx-auto mb-2 transition" />
                <p className="text-xs font-bold text-zinc-800">
                  {isUploading ? 'Sedang Memproses...' : 'Upload File Schedule Baru (.xlsx / .csv)'}
                </p>
              </div>

              <div className="p-3.5 bg-white rounded-xl border border-zinc-200/80 text-[11px] text-zinc-600">
                <p className="font-semibold text-zinc-800">Format Kolom:</p>
                <p className="font-mono text-[10px] text-zinc-500">
                  Nama Staff | Role | Senin | Selasa | Rabu | Kamis | Jumat | Sabtu | Minggu
                </p>
              </div>

              <button
                onClick={downloadCsvTemplate}
                className="w-full bg-white border border-zinc-300 hover:bg-zinc-100 text-zinc-800 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition shadow-xs flex items-center justify-center space-x-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Template Format (.CSV)</span>
              </button>
            </div>
                </div>
              </div>
            )}
          </div>

          {/* TAB 7: RESET TARGET & KEAMANAN */}
          <div
            className={`rounded-2xl border overflow-hidden transition-all ${
              activeAdminTab === 'settings'
                ? 'border-zinc-900 shadow-sm bg-white'
                : 'border-zinc-200/80 bg-zinc-50/70 hover:bg-zinc-100/80'
            }`}
          >
            <button
              type="button"
              onClick={() => toggleAdminTab('settings')}
              className={`w-full px-4 py-3.5 text-xs font-semibold transition flex items-center justify-between gap-3 cursor-pointer ${
                activeAdminTab === 'settings'
                  ? 'bg-zinc-900 text-white'
                  : 'text-zinc-800'
              }`}
            >
              <span className="flex items-center space-x-2.5 min-w-0">
                <HardDrive className="w-4 h-4 shrink-0" />
                <span className="truncate">Google Drive, Apps Script &amp; Keamanan</span>
              </span>
              {activeAdminTab === 'settings' ? (
                <ChevronUp className="w-4 h-4 shrink-0 opacity-85" />
              ) : (
                <ChevronDown className="w-4 h-4 shrink-0 opacity-60" />
              )}
            </button>

            {activeAdminTab === 'settings' && (
              <div className="p-4 sm:p-5 bg-white/95 border-t border-zinc-200/70">
                <div className="space-y-6">
            {settingsFeedback && (
              <div
                className={`p-3.5 rounded-xl text-xs flex items-center justify-between ${
                  settingsFeedback.type === 'success'
                    ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                    : 'bg-red-50 text-red-900 border border-red-200'
                }`}
              >
                <span>{settingsFeedback.message}</span>
                <button
                  type="button"
                  onClick={() => setSettingsFeedback(null)}
                  className="text-[11px] underline ml-2 font-semibold cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            )}

            {/* Password Settings */}
            <div className="bg-zinc-50/80 p-5 rounded-2xl border border-zinc-200/90 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-zinc-900 text-white rounded-xl shadow-sm">
                  <KeyRound className="w-4 h-4" />
                </div>
                <h4 className="font-bold text-xs sm:text-sm text-zinc-900">
                  Ubah Password Akses Area Admin
                </h4>
              </div>

              <form onSubmit={handleSavePin} className="flex items-center space-x-2 w-full md:w-auto">
                <div className="relative">
                  <input
                    type={showPin ? 'text' : 'password'}
                    maxLength={40}
                    value={pinInput}
                    onChange={(e) => setPinInput(e.target.value)}
                    placeholder="Password baru..."
                    className="w-40 border border-zinc-300 rounded-xl py-2 pl-3 pr-8 text-xs font-mono tracking-wider text-left focus:ring-1 focus:ring-zinc-900 focus:outline-none bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPin(!showPin)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 transition"
                    tabIndex={-1}
                  >
                    {showPin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <button
                  type="submit"
                  className="bg-zinc-900 hover:bg-zinc-800 text-white px-4 py-2 rounded-xl text-xs font-semibold transition shadow-xs shrink-0 cursor-pointer"
                >
                  Simpan Password Baru
                </button>
              </form>
            </div>
            {pinFeedback && (
              <p className="text-[11px] text-emerald-600 font-semibold ml-1">
                ✓ {pinFeedback}
              </p>
            )}

            {/* Google Drive & Apps Script Integration Card */}
            <div className="bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-800 text-white p-5 sm:p-6 rounded-2xl border border-zinc-700/80 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center space-x-2.5">
                  <span className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl">
                    <HardDrive className="w-4 h-4" />
                  </span>
                  <div>
                    <h4 className="font-bold text-xs sm:text-sm text-white">
                      Integrasi Google Drive &amp; Apps Script (Database &amp; Foto)
                    </h4>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      Seluruh data schedule, target staf, EMS, Training HO, dan file foto tersimpan di Google Drive Anda tanpa kuota Firestore.
                    </p>
                  </div>
                </div>

                <a
                  href={config.adminDriveFolderLink || config.adminDriveUrl || DEFAULT_TARGET_FOLDER_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold px-3.5 py-2 rounded-xl text-xs transition shadow-md flex items-center justify-center space-x-1.5 shrink-0"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Buka Folder Drive</span>
                </a>
              </div>

              {/* Status pill */}
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <span
                  className={`px-2.5 py-1 rounded-lg font-semibold border ${
                    isValidAppsScriptUrl(config.adminDriveScriptUrl)
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  }`}
                >
                  {isValidAppsScriptUrl(config.adminDriveScriptUrl)
                    ? '✓ Web App Apps Script Terhubung'
                    : '⚠ Web App Apps Script Belum Terpasang (Mode Lokal)'}
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 font-mono text-[10px]">
                  Folder ID: {extractFolderId(folderIdDraft || DEFAULT_TARGET_FOLDER_ID)}
                </span>
              </div>

              {/* Form URL Web App & Folder ID */}
              <form onSubmit={handleConnectDriveAppsScript} className="space-y-3 pt-2 border-t border-zinc-800 text-xs">
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-300 mb-1">
                    URL Web App Google Apps Script (berakhiran /exec)
                  </label>
                  <input
                    type="url"
                    value={scriptUrlDraft}
                    onChange={(e) => setScriptUrlDraft(e.target.value)}
                    placeholder="https://script.google.com/macros/s/.../exec"
                    className="w-full bg-zinc-950/90 border border-zinc-700 rounded-xl px-3 py-2.5 text-xs font-mono text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-300 mb-1">
                      ID / Link Folder Utama Google Drive
                    </label>
                    <input
                      type="text"
                      value={folderIdDraft}
                      onChange={(e) => setFolderIdDraft(e.target.value)}
                      placeholder={DEFAULT_TARGET_FOLDER_ID}
                      className="w-full bg-zinc-950/90 border border-zinc-700 rounded-xl px-3 py-2.5 text-xs font-mono text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isTestingDrive || !scriptUrlDraft.trim()}
                    className="w-full bg-white hover:bg-zinc-100 disabled:bg-zinc-700 disabled:text-zinc-400 text-zinc-950 font-bold px-4 py-2.5 rounded-xl text-xs transition flex items-center justify-center space-x-2 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isTestingDrive ? 'animate-spin' : ''}`} />
                    <span>
                      {isTestingDrive ? 'Menghubungkan...' : 'Simpan & Test Koneksi Drive'}
                    </span>
                  </button>
                </div>
              </form>

              {/* Ping / Init result & subfolder quick links */}
              {drivePingResult && (
                <div
                  className={`p-3.5 rounded-xl text-xs space-y-2 border ${
                    drivePingResult.success
                      ? 'bg-emerald-950/70 border-emerald-500/40 text-emerald-200'
                      : 'bg-red-950/70 border-red-500/40 text-red-200'
                  }`}
                >
                  <div className="flex items-start space-x-2">
                    {drivePingResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    )}
                    <div className="space-y-1">
                      <p className="font-semibold">{drivePingResult.message}</p>
                      {drivePingResult.success && (
                        <p className="text-[11px] font-mono text-emerald-300/90">
                          Data Staf: {drivePingResult.staffCount ?? 0} | Foto Tersimpan: {drivePingResult.photoCount ?? 0}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {(drivePingResult?.subfolderLinks || config.adminSubfolderLinks) && (
                <div className="pt-2 border-t border-zinc-800 space-y-2">
                  <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block">
                    Subfolder Kategori Bukti di Google Drive:
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(drivePingResult?.subfolderLinks || config.adminSubfolderLinks || {}).map(
                      ([key, url]) => (
                        <a
                          key={key}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 flex items-center space-x-1 transition"
                        >
                          <FolderOpen className="w-3 h-3 text-emerald-400" />
                          <span>{key}</span>
                          <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                        </a>
                      )
                    )}
                  </div>
                </div>
              )}

              {/* Migration Tools: Local / Legacy Firestore -> Google Drive */}
              <div className="pt-3 border-t border-zinc-800 space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h5 className="text-xs font-bold text-zinc-100 flex items-center space-x-1.5">
                      <CloudUpload className="w-3.5 h-3.5 text-blue-400" />
                      <span>Migrasi Data ke Google Drive</span>
                    </h5>
                    <p className="text-[10px] text-zinc-400">
                      Unggah cache perangkat ini atau tarik data lama dari Firestore ke Google Drive secara bertahap.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={isMigratingDrive || !isValidAppsScriptUrl(config.adminDriveScriptUrl)}
                    onClick={() => void handleRunDriveMigration(false)}
                    className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 border border-zinc-600 text-white text-xs font-semibold px-3 py-2 rounded-xl transition flex items-center justify-center space-x-1.5 cursor-pointer"
                  >
                    <CloudUpload className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Upload Data Lokal ke Drive</span>
                  </button>
                  <button
                    type="button"
                    disabled={isMigratingDrive || !isValidAppsScriptUrl(config.adminDriveScriptUrl)}
                    onClick={() => void handleRunDriveMigration(true)}
                    className="bg-amber-500/20 hover:bg-amber-500/30 disabled:opacity-50 border border-amber-500/40 text-amber-200 text-xs font-semibold px-3 py-2 rounded-xl transition flex items-center justify-center space-x-1.5 cursor-pointer"
                  >
                    <Database className="w-3.5 h-3.5 text-amber-400" />
                    <span>Tarik Data Lama Firestore → Drive</span>
                  </button>
                </div>

                {migrateProgress && (
                  <p className="text-[11px] font-mono text-blue-300 animate-pulse">{migrateProgress}</p>
                )}
                {migrateFeedback && (
                  <div
                    className={`p-2.5 rounded-xl text-[11px] font-semibold border ${
                      migrateFeedback.type === 'success'
                        ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-200'
                        : 'bg-red-950/80 border-red-500/40 text-red-200'
                    }`}
                  >
                    {migrateFeedback.message}
                  </div>
                )}
              </div>

              {/* Collapsible Apps Script Code & Deployment Guide */}
              <div className="pt-3 border-t border-zinc-800 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAppsScriptCode((prev) => !prev)}
                    className="text-xs font-semibold text-zinc-200 hover:text-white flex items-center space-x-1.5 cursor-pointer"
                  >
                    <Code2 className="w-4 h-4 text-blue-400" />
                    <span>
                      {showAppsScriptCode
                        ? 'Sembunyikan Kode Google Apps Script'
                        : 'Lihat Kode & Panduan Deploy Google Apps Script'}
                    </span>
                    {showAppsScriptCode ? (
                      <ChevronUp className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleCopyAppsScriptCode()}
                    className="px-3 py-1.5 rounded-xl text-[11px] font-bold bg-blue-600 hover:bg-blue-500 text-white flex items-center space-x-1.5 transition cursor-pointer"
                  >
                    {copiedScriptCode ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Kode Tersalin!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Salin Kode Apps Script</span>
                      </>
                    )}
                  </button>
                </div>

                {showAppsScriptCode && (
                  <div className="space-y-3 pt-1">
                    <ol className="text-[11px] text-zinc-300 bg-zinc-950/70 p-3.5 rounded-xl border border-zinc-800 list-decimal list-inside space-y-1">
                      <li>
                        Buka <strong className="text-white">script.google.com</strong> di browser yang hanya login <strong className="text-amber-300">1 akun Google</strong> (gunakan Mode Incognito jika ada banyak akun, dan pastikan akun tersebut punya akses <strong className="text-white">Editor</strong> pada folder Drive tujuan).
                      </li>
                      <li>
                        Klik <strong className="text-white">Project Baru</strong>, hapus isi default, tempel seluruh kode di bawah, lalu simpan (<strong className="text-white">Ctrl+S</strong>).
                      </li>
                      <li>
                        Pilih fungsi <strong className="text-emerald-300">izinDrive</strong> di toolbar atas lalu klik <strong className="text-white">Run</strong> → klik <em>Review permissions → Advanced → Go to ... (unsafe)</em> → <strong className="text-amber-300">centang semua kotak izin Google Drive</strong> → <em>Allow</em>.
                      </li>
                      <li>
                        Klik <strong className="text-white">Terapkan (Deploy) → Deployment baru</strong> → pilih jenis <strong className="text-white">Aplikasi Web (Web app)</strong>.
                      </li>
                      <li>
                        Atur <em>Jalankan sebagai</em>: <strong className="text-emerald-300">Saya (Me)</strong> dan <em>Yang memiliki akses</em>: <strong className="text-emerald-300">Siapa saja (Anyone)</strong>.
                      </li>
                      <li>
                        Klik <strong className="text-white">Terapkan</strong>, lalu salin <strong className="text-white">URL Aplikasi Web (/exec)</strong> ke form di atas.
                      </li>
                    </ol>

                    <pre className="max-h-72 overflow-auto bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-[10px] font-mono text-emerald-200 leading-relaxed whitespace-pre">
                      {APPS_SCRIPT_SNIPPET}
                    </pre>
                  </div>
                )}
              </div>
            </div>

            {/* Google Drive Data Restore & Reconciliation Card */}
            <div className="bg-emerald-50/80 p-5 rounded-2xl border border-emerald-200/90 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h4 className="font-bold text-xs sm:text-sm text-emerald-950 flex items-center space-x-2">
                  <RefreshCw className={`w-4 h-4 text-emerald-600 ${isRestoringCloud ? 'animate-spin' : ''}`} />
                  <span>Pulihkan &amp; Rekonsiliasi Data dari Google Drive</span>
                </h4>

                <button
                  onClick={async () => {
                    setIsRestoringCloud(true);
                    setCloudRestoreMsg(null);
                    try {
                      const summary = await onRestoreCloudData();
                      setCloudRestoreMsg(
                        `Berhasil membaca ${summary.totalPhotosFound} foto & memulihkan ${summary.staffRestoredCount} data staf dari Google Drive.`
                      );
                    } catch (err) {
                      setCloudRestoreMsg(
                        `Gagal memulihkan data Drive: ${err instanceof Error ? err.message : 'Periksa koneksi internet.'}`
                      );
                    } finally {
                      setIsRestoringCloud(false);
                    }
                  }}
                  disabled={isRestoringCloud}
                  className="bg-emerald-700 hover:bg-emerald-600 disabled:bg-emerald-400 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition shadow-sm flex items-center justify-center space-x-2 shrink-0 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRestoringCloud ? 'animate-spin' : ''}`} />
                  <span>{isRestoringCloud ? 'Memulihkan Data...' : 'Pulihkan Data Drive Sekarang'}</span>
                </button>
              </div>

              {cloudRestoreMsg && (
                <div className="p-3 rounded-xl bg-white border border-emerald-200 text-xs font-semibold text-emerald-900 flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{cloudRestoreMsg}</span>
                </div>
              )}
            </div>

            {/* Monthly Target Reset Card */}
            <div className="bg-amber-50/90 p-5 rounded-2xl border border-amber-200 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <h4 className="font-bold text-xs sm:text-sm text-amber-950 flex items-center space-x-2">
                    <RotateCcw className={`w-4 h-4 text-amber-700 ${isResettingTarget ? 'animate-spin' : ''}`} />
                    <span>Reset Target Bulanan (Pergantian Bulan)</span>
                  </h4>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-amber-900">
                    <span className="px-2 py-0.5 rounded bg-white border border-amber-200 font-semibold">
                      Target OPS: 81 / Bulan
                    </span>
                    <span className="px-2 py-0.5 rounded bg-white border border-amber-200 font-semibold">
                      Target Try-On: 190 / Bulan
                    </span>
                    {targetResetAt && (
                      <span className="text-[10px] text-amber-700">
                        Reset terakhir: {new Date(targetResetAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isResettingTarget}
                  onClick={async () => {
                    if (
                      confirm(
                        'Reset seluruh pencapaian target (OPS 81 & Try-On 190) menjadi 0 untuk periode bulan baru?\n\nFoto bukti yang sudah masuk tetap aman di Arsip & Cloud.'
                      )
                    ) {
                      setIsResettingTarget(true);
                      setTargetResetMsg(null);
                      try {
                        await onResetMonthlyTargets();
                        setTargetResetMsg('Berhasil! Seluruh target bulanan & mingguan telah direset menjadi 0.');
                      } catch (err) {
                        setTargetResetMsg(
                          `Gagal mereset target: ${err instanceof Error ? err.message : 'Periksa koneksi.'}`
                        );
                      } finally {
                        setIsResettingTarget(false);
                      }
                    }
                  }}
                  className="bg-amber-600 hover:bg-amber-500 disabled:bg-amber-400 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition shadow-sm flex items-center justify-center space-x-2 shrink-0 cursor-pointer"
                >
                  <RotateCcw className={`w-3.5 h-3.5 ${isResettingTarget ? 'animate-spin' : ''}`} />
                  <span>{isResettingTarget ? 'Mereset Target...' : 'Reset Target Jadi 0'}</span>
                </button>
              </div>
            </div>

            {/* Data Backup & System Restore */}
            <div>
              <h4 className="font-bold text-xs sm:text-sm text-zinc-900 mb-3 flex items-center">
                <Database className="w-4 h-4 mr-1.5 text-zinc-700" />
                <span>Penyimpanan Lokal &amp; Backup Cadangan</span>
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  onClick={() => exportBackupJson({ staff: staffList, photos, config })}
                  className="bg-white border border-zinc-300 hover:bg-zinc-100 text-zinc-800 p-3 rounded-xl text-xs font-semibold transition shadow-xs flex items-center justify-center space-x-1.5"
                >
                  <Download className="w-3.5 h-3.5 text-zinc-600" />
                  <span>Download Backup JSON</span>
                </button>

                <button
                  onClick={() => backupInputRef.current?.click()}
                  className="bg-white border border-zinc-300 hover:bg-zinc-100 text-zinc-800 p-3 rounded-xl text-xs font-semibold transition shadow-xs flex items-center justify-center space-x-1.5"
                >
                  <input
                    ref={backupInputRef}
                    type="file"
                    accept=".json"
                    onChange={handleBackupUpload}
                    className="hidden"
                  />
                  <Upload className="w-3.5 h-3.5 text-zinc-600" />
                  <span>Restore dari File Backup</span>
                </button>

                <button
                  onClick={() => {
                    if (
                      confirm(
                        'Yakin ingin membersihkan & mereset seluruh data termasuk SEMUA foto bukti yang telah disubmit? Seluruh foto, jadwal, dan arsip performa akan dihapus permanen.'
                      )
                    ) {
                      void onResetDefaults();
                    }
                  }}
                  className="bg-white border border-red-200 hover:bg-red-50 text-red-700 p-3 rounded-xl text-xs font-semibold transition shadow-xs flex items-center justify-center space-x-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-red-600" />
                  <span>Bersihkan &amp; Reset Semua Data</span>
                </button>
              </div>
            </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
