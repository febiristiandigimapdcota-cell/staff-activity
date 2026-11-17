import React, { useState, useMemo } from 'react';
import {
  X,
  Video,
  Search,
  Calendar,
  ShoppingBag,
  Eye,
  Camera,
  ChevronRight,
  Tablet,
  Headphones,
  Watch,
  CheckCircle2,
  Download
} from 'lucide-react';
import { StaffMember, PhotoRecord } from '../../types';
import {
  STORE_OPS_MONTHLY_TARGET,
  STORE_TRYON_MONTHLY_TARGET
} from '../../data/defaultData';
import { isPhotoInActiveMonthlyPeriod, isTryOnActivity } from '../../utils/periodHelper';
import { TryOnDevicesIcon } from '../common/TryOnDevicesIcon';
import { DrivePhotoImg } from '../common/DrivePhotoImg';
import { downloadPhotoRecord } from '../../utils/downloadHelper';

interface ActivityProofModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialType: 'OPS' | 'TryOn';
  photos: PhotoRecord[];
  staffList: StaffMember[];
  targetResetAt?: string;
  onOpenPhotoLightbox: (photo: PhotoRecord) => void;
  onNavigateToUpload: () => void;
}

export const ActivityProofModal: React.FC<ActivityProofModalProps> = ({
  isOpen,
  onClose,
  initialType,
  photos,
  staffList,
  targetResetAt,
  onOpenPhotoLightbox,
  onNavigateToUpload
}) => {
  const [activeTab, setActiveTab] = useState<'OPS' | 'TryOn'>(initialType);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStaff, setSelectedStaff] = useState<string>('ALL');
  const [tryOnSubFilter, setTryOnSubFilter] = useState<'ALL' | 'iPad' | 'AirPods' | 'Watch' | 'Purchaser' | 'Browser'>('ALL');

  // Keep activeTab in sync with initialType when reopened
  React.useEffect(() => {
    if (isOpen) {
      setActiveTab(initialType);
      setSearchQuery('');
      setSelectedStaff('ALL');
      setTryOnSubFilter('ALL');
    }
  }, [isOpen, initialType]);

  // Filter photos by category
  const opsPhotos = useMemo(
    () => photos.filter((p) => p.activityType === 'OPS'),
    [photos]
  );

  const tryOnPhotos = useMemo(
    () =>
      photos.filter(
        (p) =>
          p.activityType === 'TryOn' ||
          p.activityType === 'TryOn_iPad' ||
          p.activityType === 'TryOn_AirPods' ||
          p.activityType === 'TryOn_Watch'
      ),
    [photos]
  );

  const activeMonthlyPhotos = useMemo(() => {
    const now = new Date();
    return photos.filter((p) => isPhotoInActiveMonthlyPeriod(p, now, targetResetAt));
  }, [photos, targetResetAt]);

  const totalOpsTarget = STORE_OPS_MONTHLY_TARGET;
  const totalOpsAch = useMemo(() => {
    const monthOpsPhotos = activeMonthlyPhotos.filter((p) => p.activityType === 'OPS').length;
    return Math.max(
      staffList.reduce((acc, s) => acc + (s.monthlyOps ?? 0), 0),
      monthOpsPhotos
    );
  }, [staffList, activeMonthlyPhotos]);

  const totalTryOnAch = useMemo(() => {
    const monthTryOnPhotos = activeMonthlyPhotos.filter((p) =>
      isTryOnActivity(p.activityType)
    ).length;
    return Math.max(
      staffList.reduce((acc, s) => acc + (s.monthlyTryOn ?? 0), 0),
      monthTryOnPhotos
    );
  }, [staffList, activeMonthlyPhotos]);

  // List of all staff who exist in schedule OR have uploaded photos
  const availableStaffOptions = useMemo(() => {
    const names = new Map<string, string>();
    staffList.forEach((s) => {
      if (s.name) names.set(s.name.trim().toLowerCase(), s.name.trim());
    });
    photos.forEach((p) => {
      if (p.staffName && !names.has(p.staffName.trim().toLowerCase())) {
        names.set(p.staffName.trim().toLowerCase(), p.staffName.trim());
      }
    });
    return Array.from(names.values()).sort((a, b) => a.localeCompare(b));
  }, [staffList, photos]);

  // Filtered list based on current active tab, search query, staff filter, sub-filters
  const displayedPhotos = useMemo(() => {
    const sourceList = activeTab === 'OPS' ? opsPhotos : tryOnPhotos;

    return sourceList.filter((photo) => {
      // 1. Staff filter
      if (selectedStaff !== 'ALL' && photo.staffName.toLowerCase() !== selectedStaff.toLowerCase()) {
        return false;
      }

      // 2. Try-On sub filter
      if (activeTab === 'TryOn' && tryOnSubFilter !== 'ALL') {
        if (tryOnSubFilter === 'iPad') {
          const isIpad =
            photo.activityType === 'TryOn_iPad' ||
            (photo.activityType === 'TryOn' &&
              (photo.programCampaign === 'Aksara' || !photo.programCampaign));
          if (!isIpad) return false;
        } else if (tryOnSubFilter === 'AirPods') {
          const isAirpods =
            photo.activityType === 'TryOn_AirPods' ||
            (photo.activityType === 'TryOn' && photo.programCampaign === 'Samudra');
          if (!isAirpods) return false;
        } else if (tryOnSubFilter === 'Watch') {
          const isWatch =
            photo.activityType === 'TryOn_Watch' ||
            (photo.activityType === 'TryOn' && photo.programCampaign === 'Nirwana');
          if (!isWatch) return false;
        } else if (tryOnSubFilter === 'Purchaser') {
          if (photo.customerType !== 'iPhone Purchaser') return false;
        } else if (tryOnSubFilter === 'Browser') {
          if (photo.customerType !== 'Browser') return false;
        }
      }

      // 3. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matches =
          photo.staffName.toLowerCase().includes(q) ||
          photo.note.toLowerCase().includes(q) ||
          (photo.customerType && photo.customerType.toLowerCase().includes(q)) ||
          (photo.programCampaign && photo.programCampaign.toLowerCase().includes(q)) ||
          photo.timestamp.toLowerCase().includes(q);
        if (!matches) return false;
      }

      return true;
    });
  }, [activeTab, opsPhotos, tryOnPhotos, selectedStaff, tryOnSubFilter, searchQuery]);

  if (!isOpen) return null;

  // Try-On sub-counts
  const purchaserCount = tryOnPhotos.filter((p) => p.customerType === 'iPhone Purchaser').length;
  const browserCount = tryOnPhotos.filter((p) => p.customerType === 'Browser').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      {/* Liquid Glass Apple VisionOS acrylic backdrop */}
      <div
        className="fixed inset-0 bg-zinc-950/40 backdrop-blur-2xl transition-opacity animate-in fade-in duration-300"
        onClick={onClose}
      />

      {/* Floating Apple Liquid Glass Modal Container */}
      <div className="relative w-full max-w-4xl bg-white/85 backdrop-blur-3xl border border-white/70 rounded-[28px] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.25),inset_0_1px_2px_rgba(255,255,255,0.95)] overflow-hidden flex flex-col max-h-[90vh] z-10 animate-in zoom-in-95 duration-200">
        
        {/* Top Liquid Specular Light Sheen */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-white/80 to-transparent pointer-events-none" />

        {/* Modal Header */}
        <div className="p-5 sm:p-6 pb-4 border-b border-zinc-200/60 bg-gradient-to-b from-white/60 to-white/30 backdrop-blur-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3.5">
            <div
              className={`w-12 h-11 rounded-2xl flex items-center justify-center shadow-sm border border-white/80 transition-all shrink-0 ${
                activeTab === 'OPS'
                  ? 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-blue-500/20'
                  : 'bg-gradient-to-br from-purple-500 to-pink-600 text-white shadow-purple-500/20'
              }`}
            >
              {activeTab === 'OPS' ? <Video className="w-5 h-5" /> : <TryOnDevicesIcon className="w-7 h-5" />}
            </div>
            <h3 className="font-bold text-base sm:text-lg text-zinc-900 tracking-tight">
              {activeTab === 'OPS' ? 'Dokumentasi Sesi Open Studio (OPS)' : 'Dokumentasi Try-On In-Store'}
            </h3>
          </div>

          <div className="flex items-center space-x-2 self-end sm:self-auto">
            {/* Segmented Liquid Glass Tab Switch */}
            <div className="p-1 bg-zinc-200/50 backdrop-blur-md rounded-2xl border border-white/60 flex items-center shadow-inner">
              <button
                onClick={() => setActiveTab('OPS')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center space-x-1.5 ${
                  activeTab === 'OPS'
                    ? 'bg-white text-zinc-900 shadow-sm border border-white/80'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                <Video className="w-3.5 h-3.5 text-blue-600" />
                <span>Open Studio</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full font-mono bg-blue-50 text-blue-700">
                  {opsPhotos.length}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('TryOn')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center space-x-1.5 ${
                  activeTab === 'TryOn'
                    ? 'bg-white text-zinc-900 shadow-sm border border-white/80'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                <TryOnDevicesIcon className="w-4 h-3 text-purple-600" />
                <span>Try-On</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full font-mono bg-purple-50 text-purple-700">
                  {tryOnPhotos.length}
                </span>
              </button>
            </div>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-zinc-100 hover:bg-zinc-200/80 text-zinc-500 hover:text-zinc-800 transition flex items-center justify-center border border-zinc-200/60"
              aria-label="Tutup Modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Quick KPI Metrics Strip in Liquid Glass */}
        <div className="px-5 sm:px-6 py-3 bg-zinc-50/50 border-b border-zinc-200/50 backdrop-blur-md grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="bg-white/70 backdrop-blur-md p-2.5 rounded-2xl border border-white/80 shadow-xs">
            <span className="text-[10px] text-zinc-400 block font-medium">Pencapaian Bulanan</span>
            <span className="font-bold text-zinc-900 text-sm font-mono mt-0.5 block">
              {activeTab === 'OPS'
                ? `${totalOpsAch} / ${totalOpsTarget} Sesi`
                : `${totalTryOnAch} / ${STORE_TRYON_MONTHLY_TARGET} Cust`}
            </span>
          </div>

          <div className="bg-white/70 backdrop-blur-md p-2.5 rounded-2xl border border-white/80 shadow-xs">
            <span className="text-[10px] text-zinc-400 block font-medium">Bukti Foto Drive</span>
            <span className="font-bold text-zinc-900 text-sm font-mono mt-0.5 block">
              {activeTab === 'OPS' ? opsPhotos.length : tryOnPhotos.length} Foto Tersimpan
            </span>
          </div>

          {activeTab === 'OPS' ? (
            <>
              <div className="bg-white/70 backdrop-blur-md p-2.5 rounded-2xl border border-white/80 shadow-xs">
                <span className="text-[10px] text-zinc-400 block font-medium">Target Rutin Harian</span>
                <span className="font-bold text-blue-600 text-sm font-mono mt-0.5 block">
                  3 Sesi / Hari
                </span>
              </div>
              <div className="bg-white/70 backdrop-blur-md p-2.5 rounded-2xl border border-white/80 shadow-xs">
                <span className="text-[10px] text-zinc-400 block font-medium">Target Mingguan</span>
                <span className="font-bold text-zinc-900 text-sm font-mono mt-0.5 block">
                  21 Sesi / Minggu
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="bg-white/70 backdrop-blur-md p-2.5 rounded-2xl border border-white/80 shadow-xs">
                <span className="text-[10px] text-zinc-400 block font-medium">iPhone Purchaser</span>
                <span className="font-bold text-emerald-600 text-sm font-mono mt-0.5 block">
                  {purchaserCount} Pembeli
                </span>
              </div>
              <div className="bg-white/70 backdrop-blur-md p-2.5 rounded-2xl border border-white/80 shadow-xs">
                <span className="text-[10px] text-zinc-400 block font-medium">Browser (Eksplorasi)</span>
                <span className="font-bold text-purple-600 text-sm font-mono mt-0.5 block">
                  {browserCount} Kunjungan
                </span>
              </div>
            </>
          )}
        </div>

        {/* Search & Filter Controls */}
        <div className="px-5 sm:px-6 py-3.5 border-b border-zinc-200/50 bg-white/40 backdrop-blur-md flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="flex-1 flex items-center space-x-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari nama staf, tanggal, atau catatan sesi..."
                className="w-full pl-9 pr-3 py-2 text-xs bg-white/70 border border-zinc-200/80 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 font-medium placeholder:text-zinc-400"
              />
            </div>

            <select
              value={selectedStaff}
              onChange={(e) => setSelectedStaff(e.target.value)}
              className="text-xs bg-white/70 border border-zinc-200/80 rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-zinc-900 font-medium text-zinc-700"
            >
              <option value="ALL">Semua Staf Toko</option>
              {availableStaffOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          {activeTab === 'TryOn' && (
            <div className="flex items-center space-x-1 overflow-x-auto pb-1 md:pb-0">
              <button
                onClick={() => setTryOnSubFilter('ALL')}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap transition ${
                  tryOnSubFilter === 'ALL'
                    ? 'bg-zinc-900 text-white shadow-xs'
                    : 'bg-white/60 text-zinc-600 hover:bg-white border border-zinc-200/60'
                }`}
              >
                Semua ({tryOnPhotos.length})
              </button>
              <button
                onClick={() => setTryOnSubFilter('Purchaser')}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap transition flex items-center space-x-1 ${
                  tryOnSubFilter === 'Purchaser'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200/60'
                }`}
              >
                <ShoppingBag className="w-3 h-3" />
                <span>iPhone Purchaser</span>
              </button>
              <button
                onClick={() => setTryOnSubFilter('Browser')}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap transition flex items-center space-x-1 ${
                  tryOnSubFilter === 'Browser'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200/60'
                }`}
              >
                <Search className="w-3 h-3" />
                <span>Browser</span>
              </button>
              <button
                onClick={() => setTryOnSubFilter('iPad')}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap transition flex items-center space-x-1 ${
                  tryOnSubFilter === 'iPad'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200/60'
                }`}
              >
                <Tablet className="w-3 h-3" />
                <span>iPad (Aksara)</span>
              </button>
              <button
                onClick={() => setTryOnSubFilter('AirPods')}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap transition flex items-center space-x-1 ${
                  tryOnSubFilter === 'AirPods'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200/60'
                }`}
              >
                <Headphones className="w-3 h-3" />
                <span>AirPods (Samudra)</span>
              </button>
              <button
                onClick={() => setTryOnSubFilter('Watch')}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap transition flex items-center space-x-1 ${
                  tryOnSubFilter === 'Watch'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200/60'
                }`}
              >
                <Watch className="w-3 h-3" />
                <span>Watch (Nirwana)</span>
              </button>
            </div>
          )}
        </div>

        {/* Photos Grid Container with Apple Liquid Glass Scrolling Canvas */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 bg-gradient-to-b from-white/20 via-zinc-50/20 to-white/30">
          {displayedPhotos.length === 0 ? (
            <div className="p-10 rounded-3xl bg-white/60 backdrop-blur-xl border border-white/80 text-center space-y-3.5 shadow-xs max-w-lg mx-auto my-6">
              <div className="w-14 h-14 rounded-3xl bg-gradient-to-tr from-zinc-100 to-white border border-zinc-200/60 flex items-center justify-center mx-auto text-zinc-400 shadow-sm">
                <Camera className="w-6 h-6" />
              </div>
              <h4 className="font-bold text-sm text-zinc-900">
                Belum Ada Foto Bukti {activeTab === 'OPS' ? 'Open Studio' : 'Try-On'}
              </h4>

              <div className="pt-2">
                <button
                  onClick={() => {
                    onClose();
                    onNavigateToUpload();
                  }}
                  className="bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold px-4 py-2.5 rounded-2xl transition shadow-sm inline-flex items-center space-x-2"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Unggah Foto Bukti Sekarang</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {displayedPhotos.map((photo) => {
                const isIpad =
                  photo.activityType === 'TryOn_iPad' ||
                  (photo.activityType === 'TryOn' && (!photo.programCampaign || photo.programCampaign === 'Aksara'));
                const isAirpods =
                  photo.activityType === 'TryOn_AirPods' ||
                  (photo.activityType === 'TryOn' && photo.programCampaign === 'Samudra');
                const isWatch =
                  photo.activityType === 'TryOn_Watch' ||
                  (photo.activityType === 'TryOn' && photo.programCampaign === 'Nirwana');

                return (
                  <div
                    key={photo.id}
                    onClick={() => onOpenPhotoLightbox(photo)}
                    className="group bg-white/75 hover:bg-white/95 backdrop-blur-xl rounded-[22px] border border-white/80 hover:border-zinc-300/80 shadow-[0_4px_20px_rgba(0,0,0,0.03),inset_0_1px_1px_rgba(255,255,255,0.8)] hover:shadow-[0_12px_32px_rgba(0,0,0,0.08)] transition-all duration-300 cursor-pointer overflow-hidden flex flex-col justify-between"
                  >
                    <div>
                      {/* Image Thumbnail with Apple Aspect Ratio */}
                      <div className="relative aspect-video bg-zinc-900 overflow-hidden">
                        <DrivePhotoImg
                          photo={photo}
                          alt={photo.note || photo.staffName}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          loading="lazy"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-between p-3">
                          <span className="text-[11px] text-white font-medium flex items-center space-x-1">
                            <Eye className="w-3.5 h-3.5" />
                            <span>Lihat Foto Penuh</span>
                          </span>
                          <span className="text-[10px] text-white/90 bg-black/40 backdrop-blur-md px-2 py-0.5 rounded-full border border-white/20">
                            ID #{photo.id.toString().slice(-4)}
                          </span>
                        </div>

                        {/* Top Overlay Badges */}
                        <div className="absolute top-2.5 left-2.5 flex flex-wrap gap-1">
                          {activeTab === 'OPS' ? (
                            <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-lg bg-blue-600/90 text-white backdrop-blur-md shadow-xs">
                              <Video className="w-2.5 h-2.5 mr-1" />
                              Open Studio
                            </span>
                          ) : (
                            <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-lg bg-purple-600/90 text-white backdrop-blur-md shadow-xs">
                              <TryOnDevicesIcon className="w-3.5 h-2.5 mr-1 text-white" />
                              Try-On
                            </span>
                          )}

                          {photo.customerType && (
                            <span
                              className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-lg backdrop-blur-md shadow-xs ${
                                photo.customerType === 'iPhone Purchaser'
                                  ? 'bg-emerald-600/90 text-white'
                                  : 'bg-zinc-800/80 text-zinc-100'
                              }`}
                            >
                              {photo.customerType === 'iPhone Purchaser' ? '🛍️ Purchaser' : '🔍 Browser'}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Photo Content Card Body */}
                      <div className="p-3.5 space-y-2">
                        {/* Staff Name & Uploader Identity */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <div className="w-6 h-6 rounded-full bg-zinc-900 text-white flex items-center justify-center font-bold text-[10px]">
                              {photo.staffName.charAt(0)}
                            </div>
                            <h5 className="font-bold text-xs text-zinc-900 leading-tight">
                              {photo.staffName}
                            </h5>
                          </div>

                          {/* Time */}
                          <span className="text-[10px] text-zinc-500 font-mono flex items-center">
                            <Calendar className="w-3 h-3 mr-1 text-zinc-400" />
                            {photo.timestamp}
                          </span>
                        </div>

                        {/* Note / Session detail */}
                        {photo.note && (
                          <p className="text-[11px] text-zinc-600 line-clamp-2 bg-zinc-50/70 p-2 rounded-xl border border-zinc-100">
                            {photo.note}
                          </p>
                        )}

                        {/* Device / Campaign tag if Try-On */}
                        {activeTab === 'TryOn' && (photo.programCampaign || isIpad || isAirpods || isWatch) && (
                          <div className="flex items-center gap-1 pt-1 text-[10px]">
                            {isIpad && (
                              <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-medium border border-blue-200/50">
                                iPad (Aksara)
                              </span>
                            )}
                            {isAirpods && (
                              <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-medium border border-indigo-200/50">
                                AirPods (Samudra)
                              </span>
                            )}
                            {isWatch && (
                              <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 font-medium border border-rose-200/50">
                                Apple Watch (Nirwana)
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Card Footer */}
                    <div className="px-3.5 py-2.5 bg-zinc-50/50 border-t border-zinc-100 text-[10px] text-zinc-500 flex items-center justify-between">
                      <span className="flex items-center text-emerald-600 font-medium">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        {photo.syncedToDrive ? 'Tersimpan di Drive' : 'Cache Lokal'}
                      </span>
                      <div className="flex items-center space-x-3">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void downloadPhotoRecord(photo);
                          }}
                          className="text-zinc-700 hover:text-zinc-950 font-semibold inline-flex items-center space-x-1 hover:underline cursor-pointer"
                          title="Download foto bukti ini"
                        >
                          <Download className="w-3 h-3" />
                          <span>Unduh</span>
                        </button>
                        <span className="group-hover:text-zinc-900 transition font-semibold flex items-center">
                          Buka <ChevronRight className="w-3 h-3 ml-0.5" />
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Bottom Footer */}
        <div className="p-4 px-6 bg-white/70 backdrop-blur-xl border-t border-zinc-200/60 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="text-zinc-500 text-[11px]">
            Menampilkan <strong className="text-zinc-900">{displayedPhotos.length}</strong> foto bukti sesi{' '}
            {activeTab === 'OPS' ? 'Open Studio' : 'Try-On'}.
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => {
                onClose();
                onNavigateToUpload();
              }}
              className="px-3.5 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200/80 text-zinc-800 font-semibold transition border border-zinc-200/80 flex items-center space-x-1.5"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Form Upload Bukti</span>
            </button>

            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-semibold transition shadow-xs"
            >
              Tutup Pop-up
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
