import React, { useState, useMemo } from 'react';
import {
  Store,
  ShoppingBag,
  Compass,
  Search,
  Calendar,
  Clock,
  User,
  Eye,
  CheckCircle2,
  Filter,
  RefreshCw,
  Sparkles,
  Tablet,
  Headphones,
  Presentation,
  Receipt,
  Download,
  Check,
  ChevronRight,
  ShieldCheck,
  Tag,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { StaffMember, PhotoRecord, CustomerType, ActivityType } from '../../types';
import { downloadPhotoRecord } from '../../utils/downloadHelper';
import { DrivePhotoImg } from '../common/DrivePhotoImg';

interface CashierMonitorViewProps {
  staffList: StaffMember[];
  photos: PhotoRecord[];
  onOpenPhotoLightbox?: (photo: PhotoRecord) => void;
  onForceSync?: () => Promise<void>;
}

export const CashierMonitorView: React.FC<CashierMonitorViewProps> = ({
  staffList,
  photos,
  onOpenPhotoLightbox,
  onForceSync
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [customerFilter, setCustomerFilter] = useState<'ALL' | CustomerType | null>(null);
  const [activityFilter, setActivityFilter] = useState<'ALL' | ActivityType>('ALL');
  const [dateFilter, setDateFilter] = useState<string>(''); // YYYY-MM-DD or empty
  const [onlyToday, setOnlyToday] = useState(false);

  const toggleCustomerTab = (tab: 'ALL' | CustomerType) => {
    setCustomerFilter((prev) => (prev === tab ? null : tab));
  };

  const isSessionListOpen =
    customerFilter !== null || onlyToday || dateFilter !== '' || searchQuery.trim() !== '';

  // Today's date string
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // Filtered photos tailored for cashier monitoring
  const filteredSessions = useMemo(() => {
    if (!isSessionListOpen) return [];
    return photos.filter((photo) => {
      // 1. Date Filter
      if (onlyToday) {
        let isToday = false;
        if (photo.id && !isNaN(Number(photo.id)) && Number(photo.id) > 1000000000000) {
          isToday = new Date(Number(photo.id)).toISOString().slice(0, 10) === todayStr;
        }
        if (!isToday && photo.timestamp) {
          const now = new Date();
          const day = now.getDate();
          const monthShort = now.toLocaleDateString('id-ID', { month: 'short' });
          isToday = photo.timestamp.includes(`${day} ${monthShort}`);
        }
        if (!isToday) return false;
      } else if (dateFilter) {
        let matches = false;
        if (photo.id && !isNaN(Number(photo.id)) && Number(photo.id) > 1000000000000) {
          matches = new Date(Number(photo.id)).toISOString().slice(0, 10) === dateFilter;
        }
        if (!matches && photo.timestamp) {
          matches = photo.timestamp.includes(dateFilter);
        }
        if (!matches) return false;
      }

      // 2. Customer Type Filter
      if (customerFilter !== null && customerFilter !== 'ALL') {
        if (photo.customerType !== customerFilter) return false;
      }

      // 3. Activity Type Filter
      if (activityFilter !== 'ALL') {
        if (activityFilter === 'TryOn_iPad') {
          const isIpad =
            photo.activityType === 'TryOn_iPad' ||
            (photo.activityType === 'TryOn' && (!photo.programCampaign || photo.programCampaign === 'Aksara'));
          if (!isIpad) return false;
        } else if (activityFilter === 'TryOn_AirPods') {
          const isAirpods =
            photo.activityType === 'TryOn_AirPods' ||
            (photo.activityType === 'TryOn' && photo.programCampaign === 'Samudra');
          if (!isAirpods) return false;
        } else if (activityFilter === 'TryOn_Watch') {
          const isWatch =
            photo.activityType === 'TryOn_Watch' ||
            (photo.activityType === 'TryOn' && photo.programCampaign === 'Nirwana');
          if (!isWatch) return false;
        } else if (photo.activityType !== activityFilter) {
          return false;
        }
      }

      // 4. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesQuery =
          photo.staffName.toLowerCase().includes(q) ||
          photo.note.toLowerCase().includes(q) ||
          photo.activityType.toLowerCase().includes(q) ||
          (photo.customerType && photo.customerType.toLowerCase().includes(q)) ||
          (photo.programCampaign && photo.programCampaign.toLowerCase().includes(q)) ||
          photo.timestamp.toLowerCase().includes(q);

        if (!matchesQuery) return false;
      }

      return true;
    }).sort((a, b) => Number(b.id || 0) - Number(a.id || 0));
  }, [photos, isSessionListOpen, customerFilter, activityFilter, dateFilter, onlyToday, searchQuery, todayStr]);

  // Group filtered sessions by day for clear visual separation & easier cashier reconciliation
  const groupedSessionsByDay = useMemo(() => {
    interface DaySessionGroup {
      dayKey: string;
      dayLabel: string;
      dayName: string;
      formattedDate: string;
      relativeTag?: string; // 'Hari Ini' | 'Kemarin' | ''
      sessions: PhotoRecord[];
      buyerCount: number;
      browserCount: number;
      opsCount: number;
    }

    const groups: { [key: string]: DaySessionGroup } = {};
    const groupOrder: string[] = [];

    const now = new Date();
    const todayIso = now.toISOString().slice(0, 10);
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const yesterdayIso = yesterday.toISOString().slice(0, 10);

    filteredSessions.forEach((session) => {
      let dayKey = '';
      let dayName = '';
      let formattedDate = '';
      let relativeTag = '';

      if (session.id && !isNaN(Number(session.id)) && Number(session.id) > 1000000000000) {
        const d = new Date(Number(session.id));
        dayKey = d.toISOString().slice(0, 10);
        dayName = d.toLocaleDateString('id-ID', { weekday: 'long' });
        formattedDate = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
        if (dayKey === todayIso) relativeTag = 'Hari Ini';
        else if (dayKey === yesterdayIso) relativeTag = 'Kemarin';
      } else if (session.timestamp) {
        const datePart = session.timestamp.split(',')[0].trim();
        dayKey = datePart;
        formattedDate = datePart;
        const todayDayMonth = `${now.getDate()} ${now.toLocaleDateString('id-ID', { month: 'short' })}`;
        if (datePart.includes(todayDayMonth)) {
          relativeTag = 'Hari Ini';
        }
      } else {
        dayKey = 'unknown';
        formattedDate = 'Waktu Lainnya';
      }

      if (!groups[dayKey]) {
        groups[dayKey] = {
          dayKey,
          dayLabel: dayName ? `${dayName}, ${formattedDate}` : formattedDate,
          dayName,
          formattedDate,
          relativeTag,
          sessions: [],
          buyerCount: 0,
          browserCount: 0,
          opsCount: 0
        };
        groupOrder.push(dayKey);
      }

      groups[dayKey].sessions.push(session);
      if (session.customerType === 'iPhone Purchaser') {
        groups[dayKey].buyerCount++;
      } else if (session.customerType === 'Browser') {
        groups[dayKey].browserCount++;
      }
      if (session.activityType === 'OPS') {
        groups[dayKey].opsCount++;
      }
    });

    return groupOrder.map((k) => groups[k]);
  }, [filteredSessions]);

  // Cashier counters
  const totalBuyerCount = useMemo(
    () => photos.filter((p) => p.customerType === 'iPhone Purchaser').length,
    [photos]
  );
  const totalBrowserCount = useMemo(
    () => photos.filter((p) => p.customerType === 'Browser').length,
    [photos]
  );
  const totalOpsCount = useMemo(
    () => photos.filter((p) => p.activityType === 'OPS').length,
    [photos]
  );

  const getCashierDescription = (photo: PhotoRecord) => {
    if (photo.activityType === 'OPS') {
      return {
        title: 'Open Studio (OPS Session)',
        badge: '🎬 Sesi OPS Studio',
        badgeCls: 'bg-blue-100 text-blue-800 border-blue-200'
      };
    }

    if (
      photo.activityType === 'TryOn_iPad' ||
      (photo.activityType === 'TryOn' && (!photo.programCampaign || photo.programCampaign === 'Aksara'))
    ) {
      if (photo.customerType === 'iPhone Purchaser') {
        return {
          title: 'Try On iPad (Aksara) — iPhone Purchaser',
          badge: '🛍️ Try On: iPhone Purchaser',
          badgeCls: 'bg-emerald-100 text-emerald-900 border-emerald-300 font-bold'
        };
      }
      return {
        title: 'Try On iPad (Aksara) — Browser',
        badge: '🔍 Try On: Browser / Buyer',
        badgeCls: 'bg-blue-100 text-blue-900 border-blue-300'
      };
    }

    if (
      photo.activityType === 'TryOn_AirPods' ||
      (photo.activityType === 'TryOn' && photo.programCampaign === 'Samudra')
    ) {
      if (photo.customerType === 'iPhone Purchaser') {
        return {
          title: 'Try On AirPods (Samudra) — iPhone Purchaser',
          badge: '🛍️ Try On: iPhone Purchaser',
          badgeCls: 'bg-emerald-100 text-emerald-900 border-emerald-300 font-bold'
        };
      }
      return {
        title: 'Try On AirPods (Samudra) — Browser',
        badge: '🔍 Try On: Browser / Buyer',
        badgeCls: 'bg-purple-100 text-purple-900 border-purple-300'
      };
    }

    if (
      photo.activityType === 'TryOn_Watch' ||
      (photo.activityType === 'TryOn' && photo.programCampaign === 'Nirwana')
    ) {
      if (photo.customerType === 'iPhone Purchaser') {
        return {
          title: 'Try On Apple Watch (Nirwana) — iPhone Purchaser',
          badge: '🛍️ Try On: iPhone Purchaser',
          badgeCls: 'bg-emerald-100 text-emerald-900 border-emerald-300 font-bold'
        };
      }
      return {
        title: 'Try On Apple Watch (Nirwana) — Browser',
        badge: '🔍 Try On: Browser / Buyer',
        badgeCls: 'bg-rose-100 text-rose-900 border-rose-300'
      };
    }

    return {
      title: photo.note || photo.activityType,
      badge: photo.activityType,
      badgeCls: 'bg-zinc-100 text-zinc-800 border-zinc-200'
    };
  };

  return (
    <div className="space-y-6">
      {/* Top Cashier Terminal Banner */}
      <div className="liquid-glass-dark text-white p-5 sm:p-6 rounded-[28px] space-y-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-white/10 border border-white/15 backdrop-blur-md">
              <Receipt className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-[11px] font-semibold tracking-wider uppercase text-zinc-300">
                Akses Kasir Toko Digimap
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center space-x-2">
              <span>Monitor Pekerjaan &amp; Sesi Demo Staf</span>
            </h2>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            {onForceSync && (
              <button
                onClick={onForceSync}
                className="bg-white/10 hover:bg-white/20 text-zinc-200 border border-white/20 px-3.5 py-2 rounded-2xl text-xs font-semibold transition backdrop-blur-md flex items-center space-x-1.5 active:scale-95"
                title="Refresh data real-time"
              >
                <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
                <span>Sync Kasir</span>
              </button>
            )}
            <div className="px-3.5 py-2 bg-emerald-500/15 border border-emerald-500/30 rounded-2xl text-emerald-400 text-xs font-mono font-bold flex items-center space-x-1.5 backdrop-blur-md">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Realtime POS Live</span>
            </div>
          </div>
        </div>

        {/* 4 Cashier Summary Counter Cards */}
        <div className="pt-3 border-t border-white/10 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="bg-white/10 backdrop-blur-md p-3 rounded-2xl border border-white/10 flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/30">
              <ShoppingBag className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] text-zinc-400 font-medium">iPhone Purchaser</p>
              <p className="font-mono text-base font-bold text-white">
                {totalBuyerCount} <span className="text-xs text-emerald-400 font-normal">Customer</span>
              </p>
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-md p-3 rounded-2xl border border-white/10 flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0 border border-blue-500/30">
              <Compass className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] text-zinc-400 font-medium">Browser / Buyer</p>
              <p className="font-mono text-base font-bold text-white">
                {totalBrowserCount} <span className="text-xs text-blue-400 font-normal">Customer</span>
              </p>
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-md p-3 rounded-2xl border border-white/10 flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center shrink-0 border border-purple-500/30">
              <Presentation className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] text-zinc-400 font-medium">Open Studio (OPS)</p>
              <p className="font-mono text-base font-bold text-white">
                {totalOpsCount} <span className="text-xs text-zinc-400 font-normal">Sesi</span>
              </p>
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-md p-3 rounded-2xl border border-white/10 flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/30">
              <Receipt className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] text-zinc-400 font-medium">Total Aktivitas Staf</p>
              <p className="font-mono text-base font-bold text-white">
                {photos.length} <span className="text-xs text-zinc-400 font-normal">Sesi Tercatat</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Container: Search, Quick Filters & Activity Log */}
      <div className="liquid-glass-card p-5 sm:p-6 rounded-[28px] space-y-5">
        {/* Search & Cashier Filters */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pb-3 border-b border-zinc-100">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari nama staf, catatan produk, atau tipe customer..."
                className="w-full pl-9 pr-3 py-2 text-xs bg-zinc-50 border border-zinc-300 rounded-2xl focus:ring-2 focus:ring-zinc-900 focus:outline-none"
              />
            </div>

            {/* Quick Today Shortcut */}
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setOnlyToday(!onlyToday)}
                className={`px-3 py-1.5 rounded-2xl text-xs font-semibold transition flex items-center space-x-1.5 ${
                  onlyToday
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 border border-zinc-200'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Hari Ini Saja</span>
              </button>

              <div className="flex items-center space-x-1.5 bg-zinc-50 border border-zinc-200 p-1 rounded-2xl text-xs">
                <Calendar className="w-3.5 h-3.5 text-zinc-500 ml-1.5 shrink-0" />
                <input
                  type="date"
                  value={dateFilter}
                  onChange={(e) => {
                    setDateFilter(e.target.value);
                    if (e.target.value) setOnlyToday(false);
                  }}
                  className="bg-transparent border-0 text-xs text-zinc-700 focus:outline-none"
                  title="Pilih tanggal spesifik"
                />
                {dateFilter && (
                  <button
                    onClick={() => setDateFilter('')}
                    className="text-[10px] text-zinc-400 hover:text-zinc-700 px-1"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Vertical Spaced Customer Type Tabs (closed by default, each opens directly underneath) */}
          <div className="space-y-2.5 pt-1">
            {[
              {
                id: 'ALL' as const,
                label: 'Semua Aktivitas',
                count: photos.length,
                icon: <Receipt className="w-4 h-4" />,
                activeBtn: 'bg-zinc-900 text-white',
                inactiveBtn: 'bg-zinc-50 hover:bg-zinc-100 text-zinc-800',
                activeBadge: 'bg-white/15 text-zinc-200',
                inactiveBadge: 'bg-zinc-200 text-zinc-700',
                borderCls: 'border-zinc-200/90'
              },
              {
                id: 'iPhone Purchaser' as const,
                label: 'iPhone Purchaser',
                count: totalBuyerCount,
                icon: <ShoppingBag className="w-4 h-4" />,
                activeBtn: 'bg-emerald-600 text-white',
                inactiveBtn: 'bg-emerald-50/70 hover:bg-emerald-50 text-emerald-900',
                activeBadge: 'bg-emerald-700 text-white',
                inactiveBadge: 'bg-emerald-100 text-emerald-800',
                borderCls: 'border-emerald-200/80'
              },
              {
                id: 'Browser' as const,
                label: 'Browser / Buyer',
                count: totalBrowserCount,
                icon: <Compass className="w-4 h-4" />,
                activeBtn: 'bg-blue-600 text-white',
                inactiveBtn: 'bg-blue-50/70 hover:bg-blue-50 text-blue-900',
                activeBadge: 'bg-blue-700 text-white',
                inactiveBadge: 'bg-blue-100 text-blue-800',
                borderCls: 'border-blue-200/80'
              }
            ].map((tab) => {
              const isOpen = customerFilter === tab.id;
              return (
                <div
                  key={tab.id}
                  className={`rounded-2xl border overflow-hidden transition ${tab.borderCls}`}
                >
                  <button
                    type="button"
                    onClick={() => toggleCustomerTab(tab.id)}
                    className={`w-full px-4 py-3 text-xs font-bold transition flex items-center justify-between cursor-pointer ${
                      isOpen ? tab.activeBtn : tab.inactiveBtn
                    }`}
                  >
                    <div className="flex items-center space-x-2.5 min-w-0">
                      {tab.icon}
                      <span className="truncate">{tab.label}</span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${
                          isOpen ? tab.activeBadge : tab.inactiveBadge
                        }`}
                      >
                        {tab.count}
                      </span>
                    </div>
                    {isOpen ? (
                      <ChevronUp className="w-4 h-4 shrink-0 opacity-85" />
                    ) : (
                      <ChevronDown className="w-4 h-4 shrink-0 opacity-60" />
                    )}
                  </button>

                  {isOpen && (
                    <div className="p-3.5 sm:p-4 bg-white/75 border-t border-zinc-200/60 space-y-4 animate-in fade-in duration-200">
                      <div className="flex items-center justify-between text-xs text-zinc-500 px-1">
                        <span>
                          Menampilkan <strong className="text-zinc-900">{filteredSessions.length}</strong> sesi
                        </span>
                      </div>

                      {groupedSessionsByDay.length === 0 ? (
                        <div className="text-center py-10 bg-zinc-50/60 rounded-2xl border border-dashed border-zinc-200/80 space-y-2">
                          <Store className="w-7 h-7 mx-auto text-zinc-300" />
                          <p className="text-xs font-semibold text-zinc-700">
                            Tidak ada sesi yang sesuai filter
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-6 pt-1">
                          {groupedSessionsByDay.map((group) => (
                            <div key={group.dayKey} className="space-y-3">
                              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-white/80 backdrop-blur-md border border-zinc-200/70 shadow-2xs">
                                <div className="flex items-center space-x-3">
                                  <div className="w-8 h-8 rounded-xl bg-zinc-900 text-white flex items-center justify-center shadow-xs shrink-0">
                                    <Calendar className="w-4 h-4 text-emerald-400" />
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <h4 className="font-bold text-xs sm:text-sm text-zinc-900 tracking-tight">
                                      {group.dayLabel}
                                    </h4>
                                    {group.relativeTag && (
                                      <span
                                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono border ${
                                          group.relativeTag === 'Hari Ini'
                                            ? 'bg-emerald-500/15 text-emerald-800 border-emerald-500/30'
                                            : 'bg-blue-500/15 text-blue-800 border-blue-500/30'
                                        }`}
                                      >
                                        {group.relativeTag === 'Hari Ini' && (
                                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block mr-1 animate-pulse" />
                                        )}
                                        {group.relativeTag}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
                                  <span className="px-2.5 py-1 rounded-xl bg-zinc-100 text-zinc-700 font-semibold border border-zinc-200/60 shadow-2xs">
                                    Total {group.sessions.length} Sesi
                                  </span>
                                  {group.buyerCount > 0 && (
                                    <span className="px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-800 font-semibold border border-emerald-200 flex items-center space-x-1 shadow-2xs">
                                      <ShoppingBag className="w-3 h-3 text-emerald-600" />
                                      <span>{group.buyerCount} iPhone Purchaser</span>
                                    </span>
                                  )}
                                  {group.browserCount > 0 && (
                                    <span className="px-2.5 py-1 rounded-xl bg-blue-50 text-blue-800 font-semibold border border-blue-200 flex items-center space-x-1 shadow-2xs">
                                      <Compass className="w-3 h-3 text-blue-600" />
                                      <span>{group.browserCount} Browser</span>
                                    </span>
                                  )}
                                  {group.opsCount > 0 && (
                                    <span className="px-2.5 py-1 rounded-xl bg-purple-50 text-purple-800 font-semibold border border-purple-200 flex items-center space-x-1 shadow-2xs">
                                      <Presentation className="w-3 h-3 text-purple-600" />
                                      <span>{group.opsCount} OPS</span>
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="divide-y divide-zinc-200/50 border border-zinc-200/70 rounded-[22px] overflow-hidden shadow-xs bg-white">
                                {group.sessions.map((session) => {
                                  const cashierInfo = getCashierDescription(session);
                                  return (
                                    <div
                                      key={session.id}
                                      className="p-4 hover:bg-zinc-50/70 transition flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                                    >
                                      <div className="flex items-start space-x-3.5 min-w-0">
                                        <div
                                          onClick={() => onOpenPhotoLightbox && onOpenPhotoLightbox(session)}
                                          className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-2xl overflow-hidden bg-zinc-900 shrink-0 cursor-pointer group border border-zinc-200 shadow-2xs"
                                          title="Klik untuk memperbesar foto bukti"
                                        >
                                          <DrivePhotoImg
                                            photo={session}
                                            alt={session.note || session.activityType}
                                            className="w-full h-full object-cover group-hover:scale-110 transition duration-300"
                                          />
                                          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white">
                                            <Eye className="w-4 h-4" />
                                          </div>
                                        </div>

                                        <div className="space-y-1 min-w-0">
                                          <div className="flex flex-wrap items-center gap-1.5">
                                            <span
                                              className={`text-[11px] px-2.5 py-0.5 rounded-lg border font-semibold ${cashierInfo.badgeCls}`}
                                            >
                                              {cashierInfo.badge}
                                            </span>

                                            {session.programCampaign && (
                                              <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-zinc-900 text-white font-bold">
                                                {session.programCampaign}
                                              </span>
                                            )}

                                            <span className="text-[10px] text-zinc-400 font-mono flex items-center">
                                              <Clock className="w-3 h-3 mr-1" />
                                              {session.timestamp}
                                            </span>
                                          </div>

                                          <h4 className="font-bold text-xs sm:text-sm text-zinc-900 mt-1">
                                            {cashierInfo.title}
                                          </h4>

                                          {session.note && (
                                            <p className="text-[11px] text-zinc-700 bg-zinc-50/90 p-2 rounded-xl border border-zinc-200/80 font-mono">
                                              Catatan: {session.note}
                                            </p>
                                          )}

                                          <div className="flex items-center space-x-2 text-[11px] text-zinc-500 pt-0.5">
                                            <User className="w-3 h-3 text-zinc-400" />
                                            <span>
                                              Spesialis Toko: <strong className="text-zinc-900">{session.staffName}</strong>
                                            </span>
                                          </div>
                                        </div>
                                      </div>

                                      <div className="flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto shrink-0 gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-zinc-100">
                                        <div className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-semibold shadow-2xs">
                                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                          <span>Sesi Tercatat</span>
                                        </div>

                                        <div className="flex items-center space-x-3">
                                          <button
                                            type="button"
                                            onClick={() => void downloadPhotoRecord(session)}
                                            className="text-xs text-zinc-700 hover:text-zinc-950 font-semibold flex items-center space-x-1 hover:underline cursor-pointer"
                                            title="Download foto bukti sesi ini"
                                          >
                                            <Download className="w-3.5 h-3.5" />
                                            <span>Unduh</span>
                                          </button>

                                          {onOpenPhotoLightbox && (
                                            <button
                                              type="button"
                                              onClick={() => onOpenPhotoLightbox(session)}
                                              className="text-xs text-zinc-600 hover:text-zinc-900 font-medium flex items-center space-x-1 hover:underline cursor-pointer"
                                            >
                                              <Eye className="w-3 h-3" />
                                              <span>Lihat Bukti Foto</span>
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Sessions list when user filters via Search/Today/Date without clicking a tab */}
        {customerFilter === null && isSessionListOpen && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-zinc-500 px-1">
            <span>
              Menampilkan <strong className="text-zinc-900">{filteredSessions.length}</strong> sesi
            </span>
          </div>

          {groupedSessionsByDay.length === 0 ? (
            <div className="text-center py-12 bg-white/40 rounded-3xl border border-dashed border-zinc-200/80 space-y-2">
              <Store className="w-8 h-8 mx-auto text-zinc-300" />
              <p className="text-xs font-semibold text-zinc-700">Tidak ada sesi yang sesuai filter</p>
            </div>
          ) : (
            <div className="space-y-7 sm:space-y-8 pt-1">
              {groupedSessionsByDay.map((group) => (
                <div key={group.dayKey} className="space-y-3.5">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-white/75 backdrop-blur-md border border-white/80 shadow-xs">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-xl bg-zinc-900 text-white flex items-center justify-center shadow-xs shrink-0">
                        <Calendar className="w-4 h-4 text-emerald-400" />
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-bold text-xs sm:text-sm text-zinc-900 tracking-tight">
                          {group.dayLabel}
                        </h4>
                        {group.relativeTag && (
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono border ${
                              group.relativeTag === 'Hari Ini'
                                ? 'bg-emerald-500/15 text-emerald-800 border-emerald-500/30'
                                : 'bg-blue-500/15 text-blue-800 border-blue-500/30'
                            }`}
                          >
                            {group.relativeTag === 'Hari Ini' && (
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block mr-1 animate-pulse" />
                            )}
                            {group.relativeTag}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
                      <span className="px-2.5 py-1 rounded-xl bg-zinc-100 text-zinc-700 font-semibold border border-zinc-200/60 shadow-2xs">
                        Total {group.sessions.length} Sesi
                      </span>
                      {group.buyerCount > 0 && (
                        <span className="px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-800 font-semibold border border-emerald-200 flex items-center space-x-1 shadow-2xs">
                          <ShoppingBag className="w-3 h-3 text-emerald-600" />
                          <span>{group.buyerCount} iPhone Purchaser</span>
                        </span>
                      )}
                      {group.browserCount > 0 && (
                        <span className="px-2.5 py-1 rounded-xl bg-blue-50 text-blue-800 font-semibold border border-blue-200 flex items-center space-x-1 shadow-2xs">
                          <Compass className="w-3 h-3 text-blue-600" />
                          <span>{group.browserCount} Browser</span>
                        </span>
                      )}
                      {group.opsCount > 0 && (
                        <span className="px-2.5 py-1 rounded-xl bg-purple-50 text-purple-800 font-semibold border border-purple-200 flex items-center space-x-1 shadow-2xs">
                          <Presentation className="w-3 h-3 text-purple-600" />
                          <span>{group.opsCount} OPS</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="divide-y divide-zinc-200/50 border border-white/80 rounded-[26px] overflow-hidden shadow-xs bg-white/80 backdrop-blur-md">
                    {group.sessions.map((session) => {
                      const cashierInfo = getCashierDescription(session);

                      return (
                        <div
                          key={session.id}
                          className="p-4 sm:p-5 hover:bg-white/95 transition flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                        >
                          <div className="flex items-start space-x-3.5 min-w-0">
                            <div
                              onClick={() => onOpenPhotoLightbox && onOpenPhotoLightbox(session)}
                              className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-2xl overflow-hidden bg-zinc-900 shrink-0 cursor-pointer group border border-zinc-200 shadow-2xs"
                              title="Klik untuk memperbesar foto bukti"
                            >
                              <DrivePhotoImg
                                photo={session}
                                alt={session.note || session.activityType}
                                className="w-full h-full object-cover group-hover:scale-110 transition duration-300"
                              />
                              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white">
                                <Eye className="w-4 h-4" />
                              </div>
                            </div>

                            <div className="space-y-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span
                                  className={`text-[11px] px-2.5 py-0.5 rounded-lg border font-semibold ${cashierInfo.badgeCls}`}
                                >
                                  {cashierInfo.badge}
                                </span>

                                {session.programCampaign && (
                                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-zinc-900 text-white font-bold">
                                    {session.programCampaign}
                                  </span>
                                )}

                                <span className="text-[10px] text-zinc-400 font-mono flex items-center">
                                  <Clock className="w-3 h-3 mr-1" />
                                  {session.timestamp}
                                </span>
                              </div>

                              <h4 className="font-bold text-xs sm:text-sm text-zinc-900 mt-1">
                                {cashierInfo.title}
                              </h4>

                              {session.note && (
                                <p className="text-[11px] text-zinc-700 bg-zinc-50/90 p-2 rounded-xl border border-zinc-200/80 font-mono">
                                  Catatan: {session.note}
                                </p>
                              )}

                              <div className="flex items-center space-x-2 text-[11px] text-zinc-500 pt-0.5">
                                <User className="w-3 h-3 text-zinc-400" />
                                <span>
                                  Spesialis Toko: <strong className="text-zinc-900">{session.staffName}</strong>
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto shrink-0 gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-zinc-100">
                            <div className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-semibold shadow-2xs">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Sesi Tercatat</span>
                            </div>

                            <div className="flex items-center space-x-3">
                              <button
                                type="button"
                                onClick={() => void downloadPhotoRecord(session)}
                                className="text-xs text-zinc-700 hover:text-zinc-950 font-semibold flex items-center space-x-1 hover:underline cursor-pointer"
                                title="Download foto bukti sesi ini"
                              >
                                <Download className="w-3.5 h-3.5" />
                                <span>Unduh</span>
                              </button>

                              {onOpenPhotoLightbox && (
                                <button
                                  type="button"
                                  onClick={() => onOpenPhotoLightbox(session)}
                                  className="text-xs text-zinc-600 hover:text-zinc-900 font-medium flex items-center space-x-1 hover:underline cursor-pointer"
                                >
                                  <Eye className="w-3 h-3" />
                                  <span>Lihat Bukti Foto</span>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  );
};
