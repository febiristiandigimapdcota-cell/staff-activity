import React, { useState } from 'react';
import {
  RotateCcw,
  Video,
  Users,
  FileSpreadsheet,
  ArrowRight,
  CheckCircle2,
  Calendar,
  AlertCircle,
  Eye,
  ChevronRight,
  GraduationCap,
  Clock,
  User,
  Sun,
  Sunset,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { StaffMember, PhotoRecord, ViewType, TrainingHoScheduleData, TrainingHoItem } from '../../types';
import {
  STORE_OPS_MONTHLY_TARGET,
  STORE_TRYON_MONTHLY_TARGET,
  DAYS_ID
} from '../../data/defaultData';
import {
  getDailyOpsSessions,
  getTrainingSessionGroup,
  isAutoTrainingDescription
} from '../../utils/scheduler';
import { isPhotoInActiveMonthlyPeriod, isTryOnActivity } from '../../utils/periodHelper';
import { ActivityProofModal } from '../modals/ActivityProofModal';
import { TryOnDevicesIcon } from '../common/TryOnDevicesIcon';

const formatTrainingDate = (isoDate: string): string => {
  const parsed = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return parsed.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
};

const getLocalIsoDate = (d: Date = new Date()): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

interface OverviewViewProps {
  staffList: StaffMember[];
  photos: PhotoRecord[];
  onNavigate: (view: ViewType) => void;
  onSyncGoogleSheet: (urlOrId: string) => Promise<boolean>;
  scheduleStatus: string;
  scheduleMeta?: {
    fileName: string;
    uploadedAt: string;
    isUsingPrevious: boolean;
  };
  targetResetAt?: string;
  trainingHoSchedule?: TrainingHoScheduleData | null;
  onOpenPhotoLightbox?: (photo: PhotoRecord) => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  staffList,
  photos,
  onNavigate,
  onSyncGoogleSheet,
  scheduleStatus,
  scheduleMeta,
  targetResetAt,
  trainingHoSchedule,
  onOpenPhotoLightbox
}) => {
  const [sheetInput, setSheetInput] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Pop-up modal state for inspecting uploaded photos and staff for OPS / TryOn
  const [proofModalType, setProofModalType] = useState<'OPS' | 'TryOn' | null>(null);
  // Collapsible bottom tabs (closed by default for fast initial render)
  const [activeBottomTab, setActiveBottomTab] = useState<'ops' | 'training-ho' | null>(null);
  const toggleBottomTab = (tab: 'ops' | 'training-ho') => {
    setActiveBottomTab((prev) => (prev === tab ? null : tab));
  };

  const now = new Date();
  const currentMonthShort = now.toLocaleDateString('id-ID', { month: 'short' });

  // Total cloud photos (all uploaded proofs preserved)
  const opsPhotoCount = photos.filter((p) => p.activityType === 'OPS').length;
  const tryOnPhotoCount = photos.filter((p) => isTryOnActivity(p.activityType)).length;

  // Monthly active period photos (respects calendar month & Admin monthly target reset)
  const activeMonthlyPhotos = photos.filter((p) =>
    isPhotoInActiveMonthlyPeriod(p, now, targetResetAt)
  );
  const monthlyOpsPhotoCount = activeMonthlyPhotos.filter((p) => p.activityType === 'OPS').length;
  const monthlyTryOnPhotoCount = activeMonthlyPhotos.filter((p) =>
    isTryOnActivity(p.activityType)
  ).length;

  // Monthly Targets on Front Overview: OPS = 81 / month, Try-On = 190 / month
  const totalOpsTarget = STORE_OPS_MONTHLY_TARGET;
  const totalOpsAch = Math.max(
    staffList.reduce((acc, s) => acc + (s.monthlyOps ?? 0), 0),
    monthlyOpsPhotoCount
  );
  const totalTryOnAch = Math.max(
    staffList.reduce((acc, s) => acc + (s.monthlyTryOn ?? 0), 0),
    monthlyTryOnPhotoCount
  );
  const activeStaffCount = staffList.length;

  const opsPercent = totalOpsTarget > 0 ? Math.min(100, Math.round((totalOpsAch / totalOpsTarget) * 100)) : 0;
  const tryOnPercent = Math.min(100, Math.round((totalTryOnAch / STORE_TRYON_MONTHLY_TARGET) * 100));

  // Today's day index
  let dayIdx = now.getDay() - 1;
  if (dayIdx === -1) dayIdx = 6;
  const todayOps = getDailyOpsSessions(staffList, dayIdx);

  // Training HO state & day selection
  const todayIso = getLocalIsoDate(now);
  const trainingHoItems = React.useMemo(() => {
    const raw = trainingHoSchedule?.items || [];
    return [...raw].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.time.localeCompare(b.time);
    });
  }, [trainingHoSchedule]);

  const [selectedTrainingDayIdx, setSelectedTrainingDayIdx] = useState<number>(dayIdx);
  const [hasPickedTrainingDay, setHasPickedTrainingDay] = useState(false);

  React.useEffect(() => {
    if (hasPickedTrainingDay) return;
    if (trainingHoItems.length === 0) {
      setSelectedTrainingDayIdx(dayIdx);
      return;
    }
    const todayMatch = trainingHoItems.find((it) => it.dayIndex === dayIdx);
    if (todayMatch) {
      setSelectedTrainingDayIdx(dayIdx);
      return;
    }
    const upcomingMatch = trainingHoItems.find((it) => it.date >= todayIso) || trainingHoItems[0];
    if (upcomingMatch) {
      setSelectedTrainingDayIdx(upcomingMatch.dayIndex);
    }
  }, [trainingHoItems, dayIdx, todayIso, hasPickedTrainingDay]);

  const selectedDayTrainingItems = trainingHoItems.filter(
    (it) => it.dayIndex === selectedTrainingDayIdx
  );
  const morningTrainingItems = selectedDayTrainingItems.filter(
    (it) => getTrainingSessionGroup(it) === 'TRP'
  );
  const afternoonTrainingItems = selectedDayTrainingItems.filter(
    (it) => getTrainingSessionGroup(it) === 'TRS'
  );

  const handleSync = async () => {
    if (!sheetInput.trim()) {
      setSyncFeedback({ type: 'error', message: 'Silakan tempelkan link atau ID Google Sheet terlebih dahulu.' });
      return;
    }
    setIsSyncing(true);
    setSyncFeedback(null);
    try {
      const ok = await onSyncGoogleSheet(sheetInput.trim());
      if (ok) {
        setSyncFeedback({ type: 'success', message: 'Sinkronisasi data Google Sheet berhasil!' });
        setSheetInput('');
      } else {
        setSyncFeedback({
          type: 'error',
          message: 'Gagal mengambil data. Pastikan Sheet diatur "Publikasikan ke Web" sebagai CSV.'
        });
      }
    } catch {
      setSyncFeedback({ type: 'error', message: 'Koneksi gagal. Periksa URL atau koneksi internet Anda.' });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Quick Sync Google Sheet Bar - Apple Liquid Glass Style */}
      <div className="liquid-glass-card rounded-[24px] p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm border border-white/80">
        <div className="flex items-center space-x-3.5">
          <div className="w-10 h-10 bg-zinc-900 text-white rounded-2xl shadow-sm flex items-center justify-center shrink-0 border border-white/20">
            <RotateCcw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
          </div>
          <div className="flex items-center space-x-2">
            <h3 className="font-bold text-zinc-900 text-xs sm:text-sm">Sync Cepat Google Sheets</h3>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/80 text-zinc-600 border border-zinc-200/50 shadow-2xs">
              Live Cloud
            </span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center space-y-2 sm:space-y-0 sm:space-x-2 w-full md:w-auto">
          <input
            type="text"
            value={sheetInput}
            onChange={(e) => setSheetInput(e.target.value)}
            placeholder="Paste Link / ID Google Sheet..."
            className="w-full md:w-80 text-xs bg-white/70 border border-zinc-200/80 rounded-xl p-2.5 focus:ring-1 focus:ring-zinc-900 focus:outline-none placeholder:text-zinc-400 font-medium"
          />
          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-400 text-white px-4 py-2.5 rounded-xl text-xs font-semibold transition shrink-0 shadow-xs flex items-center justify-center space-x-1.5"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Syncing...' : 'Sync Data'}</span>
          </button>
        </div>
      </div>

      {syncFeedback && (
        <div
          className={`p-3.5 rounded-2xl text-xs flex items-center justify-between backdrop-blur-md shadow-xs animate-in fade-in duration-200 ${
            syncFeedback.type === 'success'
              ? 'bg-emerald-50/90 text-emerald-900 border border-emerald-200/80'
              : 'bg-red-50/90 text-red-900 border border-red-200/80'
          }`}
        >
          <div className="flex items-center space-x-2">
            {syncFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span className="font-medium">{syncFeedback.message}</span>
          </div>
          <button
            onClick={() => setSyncFeedback(null)}
            className="text-[11px] underline ml-2 font-semibold hover:opacity-80"
          >
            Tutup
          </button>
        </div>
      )}

      {/* 4 Metric Overview Cards in Apple Liquid Glass */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        
        {/* OPS Card - Interactive Click to Open Proof Photos & Staff Pop-up */}
        <div
          onClick={() => setProofModalType('OPS')}
          className="liquid-glass-card liquid-glass-card-hover rounded-[26px] p-5 cursor-pointer relative overflow-hidden group flex flex-col justify-between"
          title="Klik untuk membuka pop-up foto bukti dan staf yang menyelesaikan sesi OPS"
        >
          {/* Subtle Liquid Glow Accent */}
          <div className="absolute -top-12 -right-12 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl pointer-events-none group-hover:bg-blue-500/20 transition-all duration-500" />

          <div>
            <div className="flex justify-between items-start">
              <div>
                <div className="flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-500 inline-block shadow-xs" />
                  <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                    Target OPS Bulanan
                  </p>
                </div>
                <h3 className="text-2xl font-bold text-zinc-900 mt-1 font-mono tracking-tight">
                  {totalOpsAch} / {totalOpsTarget}{' '}
                  <span className="text-xs text-zinc-400 font-normal">Sesi</span>
                </h3>
              </div>

              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-100 text-blue-700 flex items-center justify-center border border-blue-200/60 shadow-xs group-hover:scale-110 transition-transform duration-300">
                <Video className="w-5 h-5" />
              </div>
            </div>

            {/* Progress Bar with Liquid Reflection */}
            <div className="mt-4">
              <div className="flex justify-between text-xs text-zinc-500 mb-1.5 font-mono">
                <span className="text-[11px]">Bulan {currentMonthShort} (Target {totalOpsTarget})</span>
                <span className="font-bold text-zinc-900">{opsPercent}%</span>
              </div>
              <div className="w-full bg-zinc-200/60 rounded-full h-2.5 overflow-hidden p-0.5 border border-white/60 shadow-inner">
                <div
                  className="bg-gradient-to-r from-blue-600 to-indigo-600 h-full rounded-full transition-all duration-700 shadow-xs"
                  style={{ width: `${opsPercent}%` }}
                />
              </div>
            </div>
          </div>

          {/* Interactive Pop-up Trigger Hint */}
          <div className="mt-4 pt-3 border-t border-zinc-200/50 flex items-center justify-between text-xs">
            <span className="text-[11px] text-blue-700 font-semibold flex items-center group-hover:underline">
              <Eye className="w-3.5 h-3.5 mr-1" />
              <span>Buka Foto & Staf</span>
            </span>
            <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200/60">
              {opsPhotoCount} Foto Cloud
            </span>
          </div>
        </div>

        {/* Try-On Card - Interactive Click to Open Proof Photos & Staff Pop-up */}
        <div
          onClick={() => setProofModalType('TryOn')}
          className="liquid-glass-card liquid-glass-card-hover rounded-[26px] p-5 cursor-pointer relative overflow-hidden group flex flex-col justify-between"
          title="Klik untuk membuka pop-up foto bukti dan staf yang menyelesaikan sesi Try-On"
        >
          {/* Subtle Liquid Glow Accent */}
          <div className="absolute -top-12 -right-12 w-32 h-32 bg-purple-500/10 rounded-full blur-2xl pointer-events-none group-hover:bg-purple-500/20 transition-all duration-500" />

          <div>
            <div className="flex justify-between items-start">
              <div>
                <div className="flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full bg-purple-500 inline-block shadow-xs" />
                  <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                    Target Try-On Bulanan
                  </p>
                </div>
                <h3 className="text-2xl font-bold text-zinc-900 mt-1 font-mono tracking-tight">
                  {totalTryOnAch} / {STORE_TRYON_MONTHLY_TARGET}{' '}
                  <span className="text-xs text-zinc-400 font-normal">Cust</span>
                </h3>
              </div>

              <div className="w-12 h-10 rounded-2xl bg-gradient-to-br from-purple-50 to-pink-100 text-purple-700 flex items-center justify-center border border-purple-200/60 shadow-xs group-hover:scale-110 transition-transform duration-300 shrink-0">
                <TryOnDevicesIcon className="w-9 h-7" />
              </div>
            </div>

            {/* Progress Bar with Liquid Reflection */}
            <div className="mt-4">
              <div className="flex justify-between text-xs text-zinc-500 mb-1.5 font-mono">
                <span className="text-[11px]">Bulan {currentMonthShort} (Target {STORE_TRYON_MONTHLY_TARGET})</span>
                <span className="font-bold text-zinc-900">{tryOnPercent}%</span>
              </div>
              <div className="w-full bg-zinc-200/60 rounded-full h-2.5 overflow-hidden p-0.5 border border-white/60 shadow-inner">
                <div
                  className="bg-gradient-to-r from-purple-600 to-pink-600 h-full rounded-full transition-all duration-700 shadow-xs"
                  style={{ width: `${tryOnPercent}%` }}
                />
              </div>
            </div>
          </div>

          {/* Interactive Pop-up Trigger Hint */}
          <div className="mt-4 pt-3 border-t border-zinc-200/50 flex items-center justify-between text-xs">
            <span className="text-[11px] text-purple-700 font-semibold flex items-center group-hover:underline">
              <Eye className="w-3.5 h-3.5 mr-1" />
              <span>Buka Foto & Staf</span>
            </span>
            <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200/60">
              {tryOnPhotoCount} Foto Cloud
            </span>
          </div>
        </div>

        {/* Staff Active Card */}
        <div
          onClick={() => onNavigate('staff-overview')}
          className="liquid-glass-card liquid-glass-card-hover rounded-[26px] p-5 cursor-pointer flex flex-col justify-between group"
        >
          <div>
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                  Staff On-Roster
                </p>
                <h3 className="text-2xl font-bold text-zinc-900 mt-1 font-mono">
                  {activeStaffCount} <span className="text-xs text-zinc-400 font-normal">Personil</span>
                </h3>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-zinc-100 text-zinc-800 flex items-center justify-center border border-zinc-200/60 shadow-xs group-hover:bg-zinc-900 group-hover:text-white transition">
                <Users className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-4">
              <p className="text-[11px] text-zinc-500 font-medium">
                Shifts:{' '}
                <span className="px-1.5 py-0.5 rounded bg-white text-zinc-800 font-semibold text-[10px] border border-zinc-200/60 mr-1">
                  P
                </span>
                <span className="px-1.5 py-0.5 rounded bg-white text-zinc-800 font-semibold text-[10px] border border-zinc-200/60 mr-1">
                  MD
                </span>
                <span className="px-1.5 py-0.5 rounded bg-white text-zinc-800 font-semibold text-[10px] border border-zinc-200/60">
                  S
                </span>
              </p>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-zinc-200/50 flex items-center justify-between text-xs">
            <span className="text-[11px] text-zinc-600 font-semibold flex items-center group-hover:text-zinc-900 transition">
              <span>Buka Staff Overview</span>
              <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
            </span>
          </div>
        </div>

        {/* Schedule Status Card */}
        <div className="liquid-glass-card rounded-[26px] p-5 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                  Data Schedule
                </p>
                <h3 className="text-xs font-bold text-zinc-800 mt-1 truncate max-w-[170px]" title={scheduleMeta?.fileName || scheduleStatus}>
                  {scheduleMeta?.fileName
                    ? scheduleMeta.fileName
                    : staffList.length > 0
                    ? 'Schedule Sebelumnya (Aktif)'
                    : 'Belum Ada Schedule'}
                </h3>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-zinc-100 text-zinc-800 flex items-center justify-center border border-zinc-200/60 shadow-xs">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-zinc-200/50">
            <button
              onClick={() => onNavigate('admin')}
              className="text-xs font-semibold text-zinc-900 hover:text-zinc-600 transition flex items-center space-x-1 cursor-pointer"
            >
              <span>Upload Schedule (Admin)</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Vertical Spaced Tabs (each tab has its own space and opens directly underneath) */}
      <div className="space-y-3.5">
        {/* Tab 1: Host Open Studio (OPS) Hari Ini */}
        <div className="liquid-glass-card rounded-[24px] overflow-hidden border border-white/80 shadow-sm">
          <button
            type="button"
            onClick={() => toggleBottomTab('ops')}
            className={`w-full px-5 py-4 flex items-center justify-between text-left transition cursor-pointer ${
              activeBottomTab === 'ops'
                ? 'bg-zinc-900 text-white'
                : 'bg-white/60 hover:bg-white/90 text-zinc-900'
            }`}
          >
            <div className="flex items-center space-x-3 min-w-0">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                  activeBottomTab === 'ops'
                    ? 'bg-blue-500/20 text-blue-300 border-blue-400/30'
                    : 'bg-blue-50 text-blue-600 border-blue-200/70'
                }`}
              >
                <Calendar className="w-4 h-4" />
              </div>
              <div className="flex flex-wrap items-center gap-2 min-w-0">
                <span className="font-bold text-xs sm:text-sm truncate">
                  Host Open Studio (OPS) Hari Ini — {DAYS_ID[dayIdx]}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                    activeBottomTab === 'ops'
                      ? 'bg-white/15 text-blue-200'
                      : 'bg-blue-50 text-blue-700 border border-blue-200/60'
                  }`}
                >
                  {todayOps.length} Sesi
                </span>
              </div>
            </div>
            {activeBottomTab === 'ops' ? (
              <ChevronUp className="w-4 h-4 shrink-0 opacity-85" />
            ) : (
              <ChevronDown className="w-4 h-4 shrink-0 opacity-60" />
            )}
          </button>

          {activeBottomTab === 'ops' && (
            <div className="p-5 sm:p-6 border-t border-zinc-200/60 space-y-4 animate-in fade-in duration-200">
              <div className="flex justify-end">
                <button
                  onClick={() => onNavigate('schedule')}
                  className="text-xs font-semibold text-zinc-700 hover:text-zinc-950 flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-white/75 hover:bg-white border border-zinc-200/60 transition shadow-2xs cursor-pointer"
                >
                  <span>Jadwal Lengkap &amp; 6 Sesi Try-On</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {staffList.length === 0 ? (
                <div className="p-8 text-center flex flex-col items-center justify-center space-y-3 bg-white/40 rounded-2xl border border-white/80">
                  <FileSpreadsheet className="w-8 h-8 text-zinc-400" />
                  <p className="text-sm font-semibold text-zinc-800">
                    Belum ada jadwal staf di roster
                  </p>
                  <button
                    onClick={() => onNavigate('admin')}
                    className="px-4 py-2 bg-zinc-900 text-white rounded-xl text-xs font-semibold hover:bg-black transition cursor-pointer"
                  >
                    Buka Area Admin
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {todayOps.map((session, idx) => (
                    <div
                      key={idx}
                      className="p-4 rounded-[20px] bg-white/70 backdrop-blur-md border border-white/90 shadow-[0_2px_12px_rgba(0,0,0,0.02)] hover:shadow-md transition-all flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex justify-between items-center text-[10px] font-mono text-zinc-500 mb-1.5">
                          <span className="font-bold text-zinc-700 uppercase tracking-wide px-2 py-0.5 rounded-md bg-zinc-100 border border-zinc-200/50">
                            {session.title}
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-semibold border border-blue-200/50">
                            {session.time}
                          </span>
                        </div>
                        <h5 className="font-bold text-sm text-zinc-900 mt-2">{session.host}</h5>
                      </div>
                      <div className="mt-3 pt-2.5 border-t border-zinc-200/40 flex justify-between items-center text-[11px] text-zinc-500">
                        <span>Shift:</span>
                        <span className="font-bold text-zinc-800 bg-white px-2 py-0.5 rounded-md border border-zinc-200/60">
                          {session.shift}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Tab 2: Training HO */}
        <div className="liquid-glass-card rounded-[24px] overflow-hidden border border-white/80 shadow-sm">
          <button
            type="button"
            onClick={() => toggleBottomTab('training-ho')}
            className={`w-full px-5 py-4 flex items-center justify-between text-left transition cursor-pointer ${
              activeBottomTab === 'training-ho'
                ? 'bg-emerald-700 text-white'
                : 'bg-white/60 hover:bg-emerald-50/70 text-zinc-900'
            }`}
          >
            <div className="flex items-center space-x-3 min-w-0">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                  activeBottomTab === 'training-ho'
                    ? 'bg-white/15 text-emerald-100 border-white/25'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200/70'
                }`}
              >
                <GraduationCap className="w-4 h-4" />
              </div>
              <div className="flex flex-wrap items-center gap-2 min-w-0">
                <span className="font-bold text-xs sm:text-sm truncate">Training HO</span>
                {trainingHoItems.length > 0 && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                      activeBottomTab === 'training-ho'
                        ? 'bg-white/20 text-white'
                        : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    }`}
                  >
                    {trainingHoItems.length} Jadwal
                  </span>
                )}
              </div>
            </div>
            {activeBottomTab === 'training-ho' ? (
              <ChevronUp className="w-4 h-4 shrink-0 opacity-85" />
            ) : (
              <ChevronDown className="w-4 h-4 shrink-0 opacity-60" />
            )}
          </button>

          {activeBottomTab === 'training-ho' && (
            <div className="p-5 sm:p-6 border-t border-zinc-200/60 space-y-4 animate-in fade-in duration-200">
              <div className="flex flex-wrap items-center justify-between gap-2">
                {/* 7-Day Selector highlighting scheduled Training HO day(s) */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {DAYS_ID.map((dayName, idx) => {
                    const isSelected = selectedTrainingDayIdx === idx;
                    const isToday = dayIdx === idx;
                    const hasTraining = trainingHoItems.some((it) => it.dayIndex === idx);
                    return (
                      <button
                        key={dayName}
                        type="button"
                        onClick={() => {
                          setHasPickedTrainingDay(true);
                          setSelectedTrainingDayIdx(idx);
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all flex items-center space-x-1.5 cursor-pointer ${
                          isSelected
                            ? 'bg-zinc-900 text-white shadow-sm font-semibold'
                            : hasTraining
                            ? 'bg-emerald-50 text-emerald-900 border border-emerald-300 font-semibold hover:bg-emerald-100'
                            : 'bg-white/75 text-zinc-600 border border-zinc-200/80 hover:bg-white'
                        }`}
                      >
                        {hasTraining && (
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isSelected ? 'bg-emerald-400' : 'bg-emerald-600'
                            }`}
                          />
                        )}
                        <span>{dayName}</span>
                        {isToday && (
                          <span
                            className={`text-[9px] px-1.5 py-0.2 rounded font-bold ${
                              isSelected ? 'bg-white/20 text-white' : 'bg-zinc-200/80 text-zinc-700'
                            }`}
                          >
                            Hari Ini
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={() => onNavigate('admin')}
                  className="text-xs font-semibold text-zinc-700 hover:text-zinc-950 flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-white/70 hover:bg-white border border-zinc-200/60 transition shadow-2xs cursor-pointer"
                >
                  <span>Atur Jadwal (Admin)</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {selectedDayTrainingItems.length === 0 ? (
                <div className="p-6 text-center bg-white/45 rounded-2xl border border-white/80 space-y-2.5">
                  <GraduationCap className="w-7 h-7 text-zinc-300 mx-auto" />
                  <p className="text-xs font-semibold text-zinc-700">
                    Tidak ada jadwal Training HO pada hari {DAYS_ID[selectedTrainingDayIdx]}
                  </p>
                  {trainingHoItems.length > 0 && (
                    <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1">
                      <span className="text-[11px] text-zinc-500">Jadwal tersedia:</span>
                      {trainingHoItems.map((it) => (
                        <button
                          key={it.id}
                          type="button"
                          onClick={() => {
                            setHasPickedTrainingDay(true);
                            setSelectedTrainingDayIdx(it.dayIndex);
                          }}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 transition cursor-pointer"
                        >
                          {it.dayName}, {formatTrainingDate(it.date)} ({it.time})
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {[
                    {
                      key: 'TRP' as const,
                      title: 'Training Pagi',
                      items: morningTrainingItems,
                      icon: <Sun className="w-4 h-4 text-amber-600" />,
                      containerCls: 'bg-amber-50/45 border-amber-200/80',
                      headerBadgeCls: 'bg-amber-100 text-amber-800 border-amber-200',
                      cardBorderCls: 'border-amber-200/70'
                    },
                    {
                      key: 'TRS' as const,
                      title: 'Training Siang',
                      items: afternoonTrainingItems,
                      icon: <Sunset className="w-4 h-4 text-emerald-700" />,
                      containerCls: 'bg-emerald-50/45 border-emerald-200/80',
                      headerBadgeCls: 'bg-emerald-100 text-emerald-800 border-emerald-200',
                      cardBorderCls: 'border-emerald-200/70'
                    }
                  ].map((group) => (
                    <div
                      key={group.key}
                      className={`rounded-[22px] p-4 border space-y-3 ${group.containerCls}`}
                    >
                      <div className="flex items-center justify-between pb-2.5 border-b border-zinc-200/60">
                        <div className="flex items-center space-x-2">
                          <div className="w-7 h-7 rounded-xl bg-white border border-zinc-200/70 flex items-center justify-center shadow-2xs">
                            {group.icon}
                          </div>
                          <h5 className="font-bold text-xs sm:text-sm text-zinc-900">
                            {group.title}
                          </h5>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${group.headerBadgeCls}`}
                        >
                          {group.items.length} Peserta
                        </span>
                      </div>

                      {group.items.length === 0 ? (
                        <p className="text-[11px] text-zinc-400 text-center py-4">
                          Tidak ada {group.title}
                        </p>
                      ) : (
                        <div className="space-y-2.5">
                          {group.items.map((item: TrainingHoItem) => {
                            const customTopic =
                              item.topic && !isAutoTrainingDescription(item.topic) ? item.topic : null;
                            return (
                              <div
                                key={item.id}
                                className={`p-3.5 rounded-2xl bg-white/85 backdrop-blur-md border ${group.cardBorderCls} shadow-2xs space-y-2`}
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  {item.staffName ? (
                                    <div className="flex items-center space-x-1.5 text-xs font-bold text-zinc-900 min-w-0">
                                      <User className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
                                      <span className="truncate">{item.staffName}</span>
                                      {item.staffRole && (
                                        <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-zinc-100 text-zinc-600 border border-zinc-200 shrink-0">
                                          {item.staffRole}
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-xs font-bold text-zinc-900">
                                      {customTopic || group.title}
                                    </span>
                                  )}

                                  <span className="px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-800 text-[10px] font-mono font-bold border border-zinc-200/80 flex items-center space-x-1 shrink-0">
                                    <Clock className="w-3 h-3 text-zinc-500" />
                                    <span>{item.time}</span>
                                  </span>
                                </div>

                                {item.staffName && customTopic && (
                                  <p className="text-xs font-semibold text-zinc-700">{customTopic}</p>
                                )}

                                <div className="pt-2 border-t border-zinc-100 flex items-center justify-between text-[10px] font-mono text-zinc-500">
                                  <span className="font-bold text-zinc-700">{item.dayName}</span>
                                  <span>{formatTrainingDate(item.date)}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Pop-up Modal for Uploaded Photos & Staff Details */}
      <ActivityProofModal
        isOpen={proofModalType !== null}
        onClose={() => setProofModalType(null)}
        initialType={proofModalType || 'OPS'}
        photos={photos}
        staffList={staffList}
        targetResetAt={targetResetAt}
        onOpenPhotoLightbox={(photo) => {
          if (onOpenPhotoLightbox) {
            onOpenPhotoLightbox(photo);
          }
        }}
        onNavigateToUpload={() => onNavigate('proof-upload')}
      />
    </div>
  );
};

