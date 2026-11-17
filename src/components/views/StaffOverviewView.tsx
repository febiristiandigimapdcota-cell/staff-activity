import React, { useState, useMemo } from 'react';
import {
  Video,
  Search,
  ArrowUpDown,
  Calendar,
  Flame,
  List,
  LayoutGrid,
  ShieldCheck,
  Lock,
  Users
} from 'lucide-react';
import { StaffMember, PhotoRecord, ViewType } from '../../types';
import { TryOnDevicesIcon } from '../common/TryOnDevicesIcon';
import {
  getCurrentMonthKey,
  isPhotoInActiveMonthlyPeriod,
  extractValidMonthlyCounters,
  isTryOnActivity
} from '../../utils/periodHelper';
import { isShiftOff, isStaffRole, parseTrainingShiftCode } from '../../utils/scheduler';

interface StaffOverviewViewProps {
  staffList: StaffMember[];
  photos: PhotoRecord[];
  targetResetAt?: string;
  onNavigate?: (view: ViewType) => void;
  onSelectStaffForUpload?: (staffId: number) => void;
}

export const StaffOverviewView: React.FC<StaffOverviewViewProps> = ({
  staffList,
  photos,
  targetResetAt,
  onNavigate
}) => {
  // View mode: 'list' as primary requested view, with optional 'grid'
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'id' | 'monthly' | 'weekly-ops' | 'name'>('monthly');

  // Current calendar month for monthly submission calculation
  const now = new Date();
  const currentMonthKey = getCurrentMonthKey(now);
  const currentMonthName = now.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  const currentMonthShort = now.toLocaleDateString('id-ID', { month: 'short' });

  // Strictly filter to personnel with role "Staff"
  const staffOnlyList = useMemo(
    () => staffList.filter((s) => isStaffRole(s.role)),
    [staffList]
  );

  const staffOnlyNameSet = useMemo(
    () => new Set(staffOnlyList.map((s) => s.name.trim().toLowerCase())),
    [staffOnlyList]
  );

  const staffOnlyPhotoCount = useMemo(
    () => photos.filter((p) => staffOnlyNameSet.has(p.staffName.trim().toLowerCase())).length,
    [photos, staffOnlyNameSet]
  );

  // Compute metrics per staff (Staff role only)
  const staffMetrics = useMemo(() => {
    return staffOnlyList.map((staff) => {
      const staffPhotos = photos.filter(
        (p) => p.staffName.trim().toLowerCase() === staff.name.trim().toLowerCase()
      );

      // Active monthly period photos submitted by this staff
      const monthlyPhotos = staffPhotos.filter((p) =>
        isPhotoInActiveMonthlyPeriod(p, now, targetResetAt)
      );
      const monthlyPhotoCount = monthlyPhotos.length;

      const monthlyOpsPhotos = monthlyPhotos.filter((p) => p.activityType === 'OPS').length;
      const monthlyTryOnPhotos = monthlyPhotos.filter((p) => isTryOnActivity(p.activityType)).length;
      const monthlySeedPhotos = monthlyPhotos.filter((p) => p.activityType === 'WeeklySeed').length;

      const validMonthly = extractValidMonthlyCounters(staff, currentMonthKey, targetResetAt);

      const monthlyOps = Math.max(validMonthly.ops, monthlyOpsPhotos);
      const monthlyTryOn = Math.max(validMonthly.tryOn, monthlyTryOnPhotos);
      const monthlySeed = Math.max(validMonthly.seed, monthlySeedPhotos);
      const monthlyTotal = Math.max(
        monthlyOps + monthlyTryOn + monthlySeed,
        monthlyPhotoCount
      );

      // Weekly Target & Achievement (resets on schedule change)
      const weeklyOpsTarget = staff.targetOps || 0;
      const weeklyOpsAch = staff.achOps || 0;
      const weeklyOpsPct =
        weeklyOpsTarget > 0 ? Math.min(100, Math.round((weeklyOpsAch / weeklyOpsTarget) * 100)) : 0;

      const weeklyTryOnTarget = staff.targetTryOn ?? 0;
      const weeklyTryOnAch = staff.achTryOn || 0;
      const weeklyTryOnPct =
        weeklyTryOnTarget > 0
          ? Math.min(100, Math.round((weeklyTryOnAch / weeklyTryOnTarget) * 100))
          : 0;

      // Monthly benchmark target per staff
      const monthlyTarget = 16;
      const monthlyPct = Math.min(100, Math.round((monthlyTotal / monthlyTarget) * 100));

      // Active shifts in 7 days
      const activeWorkDays = staff.shifts.filter((s) => !isShiftOff(s)).length;

      return {
        ...staff,
        allTimePhotosCount: staffPhotos.length,
        monthlyPhotoCount,
        monthlyTotal,
        monthlyOps,
        monthlyTryOn,
        monthlySeed,
        monthlyPct,
        monthlyTarget,
        weeklyOpsTarget,
        weeklyOpsAch,
        weeklyOpsPct,
        weeklyTryOnTarget,
        weeklyTryOnAch,
        weeklyTryOnPct,
        activeWorkDays
      };
    });
  }, [staffOnlyList, photos, currentMonthKey, targetResetAt]);

  // Filter & Sort
  const filteredStaff = useMemo(() => {
    let result = [...staffMetrics];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.role && s.role.toLowerCase().includes(q)) ||
          `#00${s.id}`.includes(q)
      );
    }

    result.sort((a, b) => {
      if (sortBy === 'monthly') {
        return b.monthlyTotal - a.monthlyTotal;
      }
      if (sortBy === 'weekly-ops') {
        return b.weeklyOpsAch - a.weeklyOpsAch;
      }
      if (sortBy === 'name') {
        return a.name.localeCompare(b.name);
      }
      return a.id - b.id;
    });

    return result;
  }, [staffMetrics, searchQuery, sortBy]);

  // Global store counters for role Staff (monthly totals synced cleanly)
  const totalCompletedSessionsStore = staffMetrics.reduce(
    (acc, s) => acc + s.monthlyTotal,
    0
  );
  const totalWeeklyOpsAchStore = staffOnlyList.reduce((acc, s) => acc + (s.achOps || 0), 0);
  const totalWeeklyOpsTargetStore = staffOnlyList.reduce((acc, s) => acc + (s.targetOps || 0), 0);

  return (
    <div className="space-y-6">
      {/* Top Banner with Month Context & Apple Dark Titanium Glass */}
      <div className="liquid-glass-sidebar p-5 sm:p-7 rounded-[28px] border border-white/10 text-white space-y-4 shadow-xl relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-white/10 border border-white/15 backdrop-blur-md">
              <Calendar className="w-3 h-3 text-emerald-400" />
              <span className="text-[11px] font-semibold tracking-wider uppercase text-zinc-200">
                Periode Bulan: {currentMonthName}
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white flex flex-wrap items-center gap-2">
              <span>Staff Overview &amp; Progres Pen-submitan</span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-200 border border-blue-400/30 font-mono">
                Khusus Role: Staff
              </span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono">
                Realtime Sync
              </span>
            </h2>
          </div>

          <div className="flex items-center space-x-2.5 shrink-0 relative z-10">
            <div className="flex items-center space-x-2 text-xs bg-white/10 backdrop-blur-md text-zinc-200 px-3.5 py-2 rounded-2xl border border-white/15 font-mono shadow-xs">
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              <span>Pengeditan Target di Area Admin</span>
            </div>
          </div>
        </div>

        {/* Store Level Quick Stats */}
        <div className="relative z-10 pt-3 border-t border-white/10 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="bg-white/10 backdrop-blur-md p-3 rounded-2xl border border-white/10 flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/30">
              <Flame className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] text-zinc-400 font-medium">Total Sesi Selesai</p>
              <p className="font-mono text-base font-bold text-white">
                {totalCompletedSessionsStore} <span className="text-xs text-zinc-400 font-normal">Sesi</span>
              </p>
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-md p-3 rounded-2xl border border-white/10 flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0 border border-blue-500/30">
              <Video className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] text-zinc-400 font-medium">OPS Toko Minggu Ini</p>
              <p className="font-mono text-base font-bold text-white">
                {totalWeeklyOpsAchStore} / {totalWeeklyOpsTargetStore}
              </p>
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-md p-3 rounded-2xl border border-white/10 flex items-center space-x-3">
            <div className="w-10 h-9 rounded-xl bg-purple-500/20 text-purple-300 flex items-center justify-center shrink-0 border border-purple-500/30">
              <TryOnDevicesIcon className="w-6 h-4" />
            </div>
            <div>
              <p className="text-[10px] text-zinc-400 font-medium">Role Staff Aktif</p>
              <p className="font-mono text-base font-bold text-white">
                {staffOnlyList.length} <span className="text-xs text-zinc-400 font-normal">Personil</span>
              </p>
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-md p-3 rounded-2xl border border-white/10 flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/30">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] text-zinc-400 font-medium">Bukti Foto Staff</p>
              <p className="font-mono text-base font-bold text-white">
                {staffOnlyPhotoCount} <span className="text-xs text-zinc-400 font-normal">Total Bukti</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Staff Container: List View by Default in Apple Liquid Glass */}
      <div className="liquid-glass-card rounded-[28px] p-5 sm:p-6 shadow-sm border border-white/80 space-y-5">
        {/* Control Bar: Search, Sort & View Mode Toggle */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pb-4 border-b border-zinc-200/60 text-xs">
          <div className="flex items-center space-x-2 flex-1 max-w-md">
            <div className="relative w-full">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari nama staf..."
                className="w-full pl-9 pr-3 py-2 text-xs bg-white/70 border border-zinc-200/80 rounded-2xl focus:ring-1 focus:ring-zinc-900 focus:outline-none placeholder:text-zinc-400 font-medium"
              />
            </div>
          </div>

          <div className="flex items-center space-x-2.5">
            {/* Sort Dropdown */}
            <div className="flex items-center space-x-1.5 bg-white/70 border border-zinc-200/80 px-3 py-1.5 rounded-2xl backdrop-blur-xs">
              <ArrowUpDown className="w-3.5 h-3.5 text-zinc-500" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-transparent border-0 text-xs font-semibold text-zinc-800 focus:outline-none cursor-pointer"
              >
                <option value="monthly">Urutkan: Sesi 1 Bulan Terbanyak</option>
                <option value="weekly-ops">Urutkan: OPS Minggu Ini Terbanyak</option>
                <option value="id">Urutkan: ID Roster Toko</option>
                <option value="name">Urutkan: Nama Staf (A-Z)</option>
              </select>
            </div>

            {/* List vs Grid Toggle */}
            <div className="flex items-center bg-zinc-200/50 p-1 rounded-2xl border border-white/60 backdrop-blur-md shadow-inner">
              <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-xl transition ${
                  viewMode === 'list'
                    ? 'bg-white text-zinc-900 shadow-xs font-bold border border-white/80'
                    : 'text-zinc-500 hover:text-zinc-800'
                }`}
                title="Tampilan List (Tabel Progres)"
              >
                <List className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-xl transition ${
                  viewMode === 'grid'
                    ? 'bg-white text-zinc-900 shadow-xs font-bold border border-white/80'
                    : 'text-zinc-500 hover:text-zinc-800'
                }`}
                title="Tampilan Kartu (Grid)"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* TABULAR LIST VIEW (CLEAN READ-ONLY MONITORING WITHOUT ACTION COLUMN) */}
        {viewMode === 'list' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-200/70 text-[11px] font-bold text-zinc-400 uppercase tracking-wider bg-white/50 backdrop-blur-md">
                  <th className="py-3.5 px-4 rounded-l-2xl">Staf Toko</th>
                  <th className="py-3.5 px-3">Jadwal Shift</th>
                  <th className="py-3.5 px-3 min-w-[180px]">Progres Mingguan (OPS)</th>
                  <th className="py-3.5 px-3 min-w-[160px]">Try-On Mingguan</th>
                  <th className="py-3.5 px-4 min-w-[240px] bg-emerald-500/10 border-l border-emerald-500/20 rounded-r-2xl">
                    <span className="flex items-center space-x-1 text-emerald-950 font-black">
                      <Flame className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Total Pen-submitan 1 Bulan</span>
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200/40 text-xs">
                {filteredStaff.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 px-4 text-center">
                      <div className="flex flex-col items-center justify-center space-y-2">
                        <Users className="w-8 h-8 text-zinc-400" />
                        <p className="text-sm font-semibold text-zinc-700">
                          Belum ada personil role Staff di roster
                        </p>
                        {onNavigate && (
                          <button
                            onClick={() => onNavigate('admin')}
                            className="mt-2 px-4 py-2 bg-zinc-900 text-white rounded-xl text-xs font-semibold hover:bg-black transition cursor-pointer"
                          >
                            Buka Area Admin
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredStaff.map((staff) => {
                    const initials = staff.name
                      .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase();

                  return (
                    <tr
                      key={staff.id}
                      className="hover:bg-white/70 transition-colors group"
                    >
                      {/* 1. Staf Info */}
                      <td className="py-4 px-4">
                        <div className="flex items-center space-x-3">
                          <div className="w-9 h-9 rounded-xl bg-zinc-900 text-white font-mono font-bold text-xs flex items-center justify-center shrink-0 shadow-xs border border-white/20">
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-bold text-xs text-zinc-900 truncate group-hover:text-emerald-700 transition">
                              {staff.name}
                            </h4>
                            <div className="flex items-center space-x-1.5 text-[10px] text-zinc-400 font-mono">
                              <span>#00{staff.id}</span>
                              <span>•</span>
                              <span className="text-zinc-600 font-sans">{staff.role || 'Specialist'}</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* 2. Jadwal Shift */}
                      <td className="py-4 px-3">
                        <div className="space-y-1">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-white/70 text-zinc-700 border border-zinc-200/80 shadow-2xs">
                            {staff.activeWorkDays} Hari Kerja
                          </span>
                          <div className="flex space-x-0.5">
                            {staff.shifts.map((s, i) => {
                              const isOff = isShiftOff(s);
                              const hasTraining = Boolean(parseTrainingShiftCode(s));
                              return (
                                <span
                                  key={i}
                                  className={`w-3.5 h-3.5 rounded text-[8px] font-mono font-bold flex items-center justify-center ${
                                    hasTraining
                                      ? 'bg-emerald-600 text-white'
                                      : isOff
                                      ? 'bg-zinc-200/70 text-zinc-400'
                                      : 'bg-zinc-900 text-white'
                                  }`}
                                  title={`Hari ${i + 1}: ${s}`}
                                >
                                  {hasTraining ? 'T' : isOff ? '·' : s[0]}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      </td>

                      {/* 3. Progres Mingguan OPS */}
                      <td className="py-4 px-3">
                        <div className="space-y-1.5">
                          <div className="flex justify-between items-center text-xs">
                            <span className="font-bold text-zinc-900 font-mono">
                              {staff.weeklyOpsAch} / {staff.weeklyOpsTarget} Sesi
                            </span>
                            <span
                              className={`text-[10px] font-mono font-bold ${
                                staff.weeklyOpsPct >= 100 ? 'text-emerald-600' : 'text-zinc-600'
                              }`}
                            >
                              {staff.weeklyOpsPct}%
                            </span>
                          </div>
                          <div className="w-full bg-zinc-200/60 rounded-full h-2 overflow-hidden border border-white/60 shadow-inner">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                staff.weeklyOpsPct >= 100
                                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500'
                                  : staff.weeklyOpsPct >= 50
                                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600'
                                  : 'bg-zinc-800'
                              }`}
                              style={{ width: `${staff.weeklyOpsPct}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* 4. Progres Mingguan Try-On */}
                      <td className="py-4 px-3">
                        <div className="space-y-1.5">
                          <div className="flex justify-between items-center text-xs">
                            <span className="font-bold text-zinc-900 font-mono">
                              {staff.weeklyTryOnAch} Cust
                            </span>
                            <span className="text-[10px] font-mono font-bold text-purple-700">
                              {staff.weeklyTryOnPct}%
                            </span>
                          </div>
                          <div className="w-full bg-zinc-200/60 rounded-full h-2 overflow-hidden border border-white/60 shadow-inner">
                            <div
                              className="h-full bg-gradient-to-r from-purple-600 to-pink-600 rounded-full transition-all duration-500"
                              style={{ width: `${staff.weeklyTryOnPct}%` }}
                            />
                          </div>
                          <p className="text-[10px] text-zinc-400">
                            Target: {staff.weeklyTryOnTarget} / minggu
                          </p>
                        </div>
                      </td>

                      {/* 5. TOTAL PEN-SUBMITAN DALAM 1 BULAN (AKURAT DENGAN ATAU TANPA FOTO) */}
                      <td className="py-4 px-4 bg-emerald-500/10 border-l border-emerald-500/20">
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-600 text-white shadow-2xs font-mono">
                              <Flame className="w-3 h-3 text-amber-300" />
                              <span>{staff.monthlyTotal} Sesi Selesai ({currentMonthShort})</span>
                            </span>
                            <span className="text-[10px] font-mono text-emerald-800 font-semibold">
                              {staff.monthlyPhotoCount} Foto Bukti
                            </span>
                          </div>

                          {/* Horizontal progress bar for monthly activity */}
                          <div className="w-full bg-emerald-200/60 rounded-full h-2 overflow-hidden border border-white/60 shadow-inner">
                            <div
                              className="h-full bg-gradient-to-r from-emerald-600 to-teal-500 rounded-full transition-all duration-500"
                              style={{ width: `${staff.monthlyPct}%` }}
                            />
                          </div>

                          {/* Monthly Breakdown Chips */}
                          <div className="flex flex-wrap items-center gap-1 text-[9px] font-mono">
                            <span className="px-1.5 py-0.5 rounded bg-white/80 border border-emerald-200 text-emerald-950 font-semibold shadow-2xs">
                              OPS: {staff.monthlyOps}
                            </span>
                            <span className="px-1.5 py-0.5 rounded bg-white/80 border border-emerald-200 text-emerald-950 font-semibold shadow-2xs">
                              Try-On: {staff.monthlyTryOn}
                            </span>
                            {staff.monthlySeed > 0 && (
                              <span className="px-1.5 py-0.5 rounded bg-white/80 border border-emerald-200 text-emerald-950 font-semibold shadow-2xs">
                                Coach: {staff.monthlySeed}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                }))}
              </tbody>
            </table>
          </div>
        ) : (
          /* CARD GRID VIEW (ALTERNATIVE VIEW IN APPLE LIQUID GLASS) */
          filteredStaff.length === 0 ? (
            <div className="py-12 px-4 text-center">
              <div className="flex flex-col items-center justify-center space-y-2">
                <Users className="w-8 h-8 text-zinc-400" />
                <p className="text-sm font-semibold text-zinc-700">
                  Belum ada personil role Staff di roster
                </p>
                {onNavigate && (
                  <button
                    onClick={() => onNavigate('admin')}
                    className="mt-2 px-4 py-2 bg-zinc-900 text-white rounded-xl text-xs font-semibold hover:bg-black transition cursor-pointer"
                  >
                    Buka Area Admin
                  </button>
                )}
              </div>
            </div>
          ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {filteredStaff.map((staff) => {
              const initials = staff.name
                .split(' ')
                .map((n) => n[0])
                .join('')
                .slice(0, 2)
                .toUpperCase();

              return (
                <div
                  key={staff.id}
                  className="liquid-glass-card liquid-glass-card-hover rounded-[24px] p-5 border border-white/80 shadow-xs space-y-4 flex flex-col justify-between"
                >
                  <div className="space-y-3.5">
                    {/* Header */}
                    <div className="flex items-start justify-between pb-3.5 border-b border-zinc-200/60">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-zinc-900 text-white font-bold rounded-2xl flex items-center justify-center text-xs tracking-wider shadow-sm font-mono border border-white/20">
                          {initials}
                        </div>
                        <div>
                          <h4 className="font-bold text-sm text-zinc-900">{staff.name}</h4>
                          <div className="flex items-center space-x-2 text-[10px] text-zinc-500">
                            <span className="font-mono">#00{staff.id}</span>
                            <span>·</span>
                            <span>{staff.role || 'Specialist'}</span>
                          </div>
                        </div>
                      </div>

                      {/* Monthly Highlight Badge */}
                      <span className="px-2.5 py-1 bg-emerald-600 text-white rounded-xl text-[10px] font-mono font-bold flex items-center shadow-xs">
                        <Flame className="w-3 h-3 mr-1 text-amber-300" />
                        <span>{staff.monthlyTotal} Sesi ({currentMonthShort})</span>
                      </span>
                    </div>

                    {/* Section 1: Total Pen-submitan 1 Bulan */}
                    <div className="p-3 bg-emerald-500/10 rounded-2xl border border-emerald-500/20 space-y-1.5 backdrop-blur-xs">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-emerald-950 flex items-center space-x-1">
                          <Flame className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Total Sesi Bulan Ini</span>
                        </span>
                        <span className="font-mono font-bold text-emerald-900 text-xs">
                          {staff.monthlyTotal} Sesi ({staff.monthlyPhotoCount} Foto)
                        </span>
                      </div>
                      <div className="w-full bg-emerald-200/60 rounded-full h-2 overflow-hidden border border-white/60">
                        <div
                          className="bg-gradient-to-r from-emerald-600 to-teal-500 h-2 rounded-full transition-all duration-500"
                          style={{ width: `${staff.monthlyPct}%` }}
                        />
                      </div>
                      <div className="flex justify-between items-center text-[10px] text-emerald-800 font-mono">
                        <span>{staff.monthlyOps} OPS · {staff.monthlyTryOn} Try-On</span>
                      </div>
                    </div>

                    {/* Section 2: Progress Mingguan OPS */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-medium text-zinc-700 flex items-center">
                          <Video className="w-3.5 h-3.5 mr-1.5 text-blue-600" />
                          <span>Target OPS Mingguan</span>
                        </span>
                        <span className="font-bold text-zinc-900 font-mono">
                          {staff.weeklyOpsAch} / {staff.weeklyOpsTarget} Sesi
                        </span>
                      </div>
                      <div className="w-full bg-zinc-200/80 rounded-full h-2 overflow-hidden border border-white/60">
                        <div
                          className="bg-gradient-to-r from-blue-600 to-indigo-600 h-2 rounded-full transition-all duration-500"
                          style={{ width: `${staff.weeklyOpsPct}%` }}
                        />
                      </div>
                    </div>

                    {/* Section 3: Try-On Customer */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-medium text-zinc-700 flex items-center">
                          <TryOnDevicesIcon className="w-5 h-3.5 mr-1.5 text-purple-600" />
                          <span>Try-On Customer Mingguan</span>
                        </span>
                        <span className="font-bold text-zinc-900 font-mono">
                          {staff.weeklyTryOnAch} / {staff.weeklyTryOnTarget} Sesi
                        </span>
                      </div>
                      <div className="w-full bg-zinc-200/80 rounded-full h-2 overflow-hidden border border-white/60">
                        <div
                          className="bg-gradient-to-r from-purple-600 to-pink-600 h-2 rounded-full transition-all duration-500"
                          style={{ width: `${staff.weeklyTryOnPct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          )
        )}
      </div>
    </div>
  );
};
