import React, { useState, useRef, useMemo } from 'react';
import {
  CloudUpload,
  Image as ImageIcon,
  Send,
  Trash2,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Database,
  Clock,
  UserCheck,
  Search,
  Calendar,
  Download,
  Eye,
  X,
  RefreshCw,
  FolderOpen,
  ChevronRight,
  Loader2,
  Check,
  Sparkles,
  Headphones,
  Tablet,
  Watch,
  Presentation,
  ShoppingBag,
  Compass,
  Tag,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import {
  StaffMember,
  PhotoRecord,
  ActivityType,
  CustomerType
} from '../../types';
import { compressImageFile } from '../../utils/imageCompressor';
import { downloadPhotoRecord } from '../../utils/downloadHelper';
import { DrivePhotoImg } from '../common/DrivePhotoImg';

interface ProofUploadViewProps {
  staffList: StaffMember[];
  photos: PhotoRecord[];
  preselectedStaffId?: number;
  onSavePhoto: (
    staffId: number,
    activityType: ActivityType,
    note: string,
    photoBase64: string,
    customerType?: CustomerType,
    programCampaign?: string
  ) => Promise<{ success: boolean; driveSynced: boolean; message: string }>;
  onNavigateToAdmin: () => void;
  onForceSync?: () => Promise<void>;
  onOpenPhotoLightbox?: (photo: PhotoRecord) => void;
}

export const ProofUploadView: React.FC<ProofUploadViewProps> = ({
  staffList,
  photos,
  preselectedStaffId,
  onSavePhoto,
  onNavigateToAdmin,
  onForceSync,
  onOpenPhotoLightbox
}) => {
  // Upload Form States
  const [selectedStaffId, setSelectedStaffId] = useState<number>(
    preselectedStaffId || staffList[0]?.id || 1
  );

  // Default activity to Open Studio
  const [activityType, setActivityType] = useState<ActivityType>('OPS');

  // Customer Type for Try-On sessions: 'iPhone Purchaser' | 'Browser'
  const [customerType, setCustomerType] = useState<CustomerType>('iPhone Purchaser');

  // Program Campaign selector: Aksara, Samudra, Nirwana
  const [programCampaign, setProgramCampaign] = useState<string>('Aksara');

  const [note, setNote] = useState('');
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [photoFileName, setPhotoFileName] = useState('');
  const [compressionInfo, setCompressionInfo] = useState<{
    originalKb: number;
    compressedKb: number;
  } | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadStage, setUploadStage] = useState<'idle' | 'compressing' | 'uploading' | 'success'>('idle');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [lastUploaded, setLastUploaded] = useState<{
    id: number;
    staffName: string;
    activityType: ActivityType;
    note: string;
    timestamp: string;
    preview: string;
    customerType?: CustomerType;
    programCampaign?: string;
  } | null>(null);

  // Search & Filter States (category tab defaults to null so archive stays collapsed until clicked)
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | ActivityType | null>(null);
  const [dateFilter, setDateFilter] = useState('');
  const [staffFilter, setStaffFilter] = useState<'ALL' | string>('ALL');
  const [customerTypeFilter, setCustomerTypeFilter] = useState<'ALL' | CustomerType>('ALL');
  const [localLightboxPhoto, setLocalLightboxPhoto] = useState<PhotoRecord | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Keep selectedStaffId synced if staffList changes (e.g. schedule upload)
  React.useEffect(() => {
    if (staffList.length > 0) {
      if (!staffList.some((s) => s.id === selectedStaffId)) {
        setSelectedStaffId(preselectedStaffId || staffList[0].id);
      }
    }
  }, [staffList, preselectedStaffId, selectedStaffId]);

  // List of all staff who exist in schedule OR have uploaded photos
  const availableStaffFilterOptions = useMemo(() => {
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

  // Whether current selected activity is a Try-On activity
  const isTryOnActive =
    activityType === 'TryOn_iPad' ||
    activityType === 'TryOn_AirPods' ||
    activityType === 'TryOn_Watch' ||
    activityType === 'TryOn';

  // Category counts (Checklist removed from active counting)
  const opsCount = useMemo(
    () => photos.filter((p) => p.activityType === 'OPS').length,
    [photos]
  );
  const tryOnIpadCount = useMemo(
    () =>
      photos.filter(
        (p) =>
          p.activityType === 'TryOn_iPad' ||
          (p.activityType === 'TryOn' && (!p.programCampaign || p.programCampaign === 'Aksara'))
      ).length,
    [photos]
  );
  const tryOnAirPodsCount = useMemo(
    () =>
      photos.filter(
        (p) =>
          p.activityType === 'TryOn_AirPods' ||
          (p.activityType === 'TryOn' && p.programCampaign === 'Samudra')
      ).length,
    [photos]
  );
  const tryOnWatchCount = useMemo(
    () =>
      photos.filter(
        (p) =>
          p.activityType === 'TryOn_Watch' ||
          (p.activityType === 'TryOn' && p.programCampaign === 'Nirwana')
      ).length,
    [photos]
  );
  const weeklyCount = useMemo(
    () => photos.filter((p) => p.activityType === 'WeeklySeed').length,
    [photos]
  );

  // Image processing with auto-compression
  const processFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setFeedback({ type: 'error', message: 'Harap pilih file gambar (JPG, PNG, WebP).' });
      return;
    }

    setIsCompressing(true);
    setUploadStage('compressing');
    setPhotoFileName(file.name);
    setFeedback(null);

    try {
      const res = await compressImageFile(file);
      setPhotoBase64(res.base64);
      setCompressionInfo({
        originalKb: Math.round(res.originalSizeBytes / 1024),
        compressedKb: Math.round(res.compressedSizeBytes / 1024)
      });
      setUploadStage('idle');
    } catch (err) {
      setUploadStage('idle');
      setFeedback({
        type: 'error',
        message: 'Gagal mengompresi foto: ' + (err instanceof Error ? err.message : '')
      });
      setPhotoBase64(null);
    } finally {
      setIsCompressing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const handleSelectActivity = (type: ActivityType) => {
    setActivityType(type);
    if (type === 'TryOn_iPad') {
      setProgramCampaign('Aksara');
    } else if (type === 'TryOn_AirPods') {
      setProgramCampaign('Samudra');
    } else if (type === 'TryOn_Watch') {
      setProgramCampaign('Nirwana');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (staffList.length === 0) {
      setFeedback({
        type: 'error',
        message: 'Belum ada staf terdaftar di roster. Silakan unggah schedule toko di Area Admin terlebih dahulu.'
      });
      return;
    }

    if (!photoBase64) {
      setFeedback({ type: 'error', message: 'Silakan pilih foto screenshot terlebih dahulu.' });
      return;
    }

    setIsSubmitting(true);
    setUploadStage('uploading');
    setFeedback(null);

    const currentStaff = staffList.find((s) => s.id === selectedStaffId);
    const staffName = currentStaff ? currentStaff.name : 'Staf Toko';
    const now = new Date();
    const timeFormatted = `${now.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short'
    })}, ${now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`;

    const effectiveCustomerType = isTryOnActive ? customerType : undefined;
    const effectiveCampaign = isTryOnActive ? programCampaign : undefined;

    try {
      const res = await onSavePhoto(
        selectedStaffId,
        activityType,
        note.trim(),
        photoBase64,
        effectiveCustomerType,
        effectiveCampaign
      );

      // Smooth success transition
      setUploadStage('success');
      setFeedback({
        type: 'success',
        message: res.message
      });

      // Record last uploaded info for instant confirmation
      setLastUploaded({
        id: Date.now(),
        staffName,
        activityType,
        note: note.trim(),
        timestamp: timeFormatted,
        preview: photoBase64,
        customerType: effectiveCustomerType,
        programCampaign: effectiveCampaign
      });

      // Reset form
      setPhotoBase64(null);
      setPhotoFileName('');
      setCompressionInfo(null);
      setNote('');
      if (fileInputRef.current) fileInputRef.current.value = '';

      // Gracefully transition back from success button state to idle after 2.5 seconds
      setTimeout(() => {
        setUploadStage('idle');
      }, 2500);
    } catch (err: unknown) {
      setUploadStage('idle');
      const msg =
        err instanceof Error
          ? err.message
          : 'Gagal menyinkronkan foto bukti ke sistem cloud.';
      setFeedback({ type: 'error', message: msg });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper to trigger lightbox preview
  const handleOpenPhoto = (photo: PhotoRecord) => {
    if (onOpenPhotoLightbox) {
      onOpenPhotoLightbox(photo);
    } else {
      setLocalLightboxPhoto(photo);
    }
  };

  // Helper to download photo
  const handleDownloadPhoto = (photo: PhotoRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    void downloadPhotoRecord(photo);
  };

  // Helper to set date filter to today
  const handleSetTodayFilter = () => {
    const today = new Date().toISOString().slice(0, 10);
    setDateFilter(today);
  };

  // Toggle category tab open/closed
  const toggleCategoryTab = (cat: 'ALL' | ActivityType) => {
    setCategoryFilter((prev) => (prev === cat ? null : cat));
  };

  // Helper to reset all filters (collapses archive tabs back to closed)
  const handleResetFilters = () => {
    setSearchQuery('');
    setCategoryFilter(null);
    setDateFilter('');
    setStaffFilter('ALL');
    setCustomerTypeFilter('ALL');
  };

  const isArchiveOpen =
    categoryFilter !== null ||
    searchQuery.trim() !== '' ||
    dateFilter !== '' ||
    staffFilter !== 'ALL' ||
    customerTypeFilter !== 'ALL';

  const isFilterActive = isArchiveOpen;

  // Filtered photo records based on search query, category, date, staff, customerType
  const filteredPhotos = useMemo(() => {
    if (!isArchiveOpen) return [];
    return photos.filter((photo) => {
      // 1. Category Filter
      if (categoryFilter !== null && categoryFilter !== 'ALL') {
        if (categoryFilter === 'TryOn_iPad') {
          const isIpad =
            photo.activityType === 'TryOn_iPad' ||
            (photo.activityType === 'TryOn' &&
              (photo.programCampaign === 'Aksara' || !photo.programCampaign));
          if (!isIpad) return false;
        } else if (categoryFilter === 'TryOn_AirPods') {
          const isAirpods =
            photo.activityType === 'TryOn_AirPods' ||
            (photo.activityType === 'TryOn' && photo.programCampaign === 'Samudra');
          if (!isAirpods) return false;
        } else if (categoryFilter === 'TryOn_Watch') {
          const isWatch =
            photo.activityType === 'TryOn_Watch' ||
            (photo.activityType === 'TryOn' && photo.programCampaign === 'Nirwana');
          if (!isWatch) return false;
        } else if (photo.activityType !== categoryFilter) {
          return false;
        }
      }

      // 2. Customer Type Filter
      if (customerTypeFilter !== 'ALL') {
        if (photo.customerType !== customerTypeFilter) return false;
      }

      // 3. Staff Filter
      if (staffFilter !== 'ALL' && photo.staffName.toLowerCase() !== staffFilter.toLowerCase()) {
        return false;
      }

      // 4. Date Filter (YYYY-MM-DD from date input)
      if (dateFilter) {
        let matchesIsoDate = false;
        if (photo.id && !isNaN(Number(photo.id)) && Number(photo.id) > 1000000000000) {
          const photoIso = new Date(Number(photo.id)).toISOString().slice(0, 10);
          matchesIsoDate = photoIso === dateFilter;
        }

        const dateParts = dateFilter.split('-');
        const year = dateParts[0];
        const monthNum = parseInt(dateParts[1], 10);
        const dayNum = parseInt(dateParts[2], 10);
        const monthNamesIndo = [
          'Jan',
          'Feb',
          'Mar',
          'Apr',
          'Mei',
          'Jun',
          'Jul',
          'Agu',
          'Sep',
          'Okt',
          'Nov',
          'Des'
        ];
        const monthName = monthNamesIndo[monthNum - 1] || '';
        const daySearch = `${dayNum} ${monthName}`; // e.g. "4 Nov"

        const matchesTimestamp =
          photo.timestamp.includes(daySearch) ||
          photo.timestamp.includes(dateFilter) ||
          photo.timestamp.includes(year);

        if (!matchesIsoDate && !matchesTimestamp) {
          return false;
        }
      }

      // 5. Search query (search in date string, staff name, note, or activity)
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
    });
  }, [photos, isArchiveOpen, categoryFilter, customerTypeFilter, staffFilter, dateFilter, searchQuery]);

  // Badge helper
  const getActivityBadge = (photo: PhotoRecord) => {
    if (photo.activityType === 'OPS') {
      return {
        bg: 'bg-blue-500/10 text-blue-600 border-blue-500/30',
        dot: 'bg-blue-500',
        icon: <Presentation className="w-3 h-3 mr-1 text-blue-500" />,
        label: 'Open Studio'
      };
    }
    if (
      photo.activityType === 'TryOn_iPad' ||
      (photo.activityType === 'TryOn' && (!photo.programCampaign || photo.programCampaign === 'Aksara'))
    ) {
      return {
        bg: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30',
        dot: 'bg-emerald-500',
        icon: <Tablet className="w-3 h-3 mr-1 text-emerald-500" />,
        label: 'Try On iPad (Aksara)'
      };
    }
    if (
      photo.activityType === 'TryOn_AirPods' ||
      (photo.activityType === 'TryOn' && photo.programCampaign === 'Samudra')
    ) {
      return {
        bg: 'bg-purple-500/10 text-purple-600 border-purple-500/30',
        dot: 'bg-purple-500',
        icon: <Headphones className="w-3 h-3 mr-1 text-purple-500" />,
        label: 'Try On AirPods (Samudra)'
      };
    }
    if (
      photo.activityType === 'TryOn_Watch' ||
      (photo.activityType === 'TryOn' && photo.programCampaign === 'Nirwana')
    ) {
      return {
        bg: 'bg-rose-500/10 text-rose-600 border-rose-500/30',
        dot: 'bg-rose-500',
        icon: <Watch className="w-3 h-3 mr-1 text-rose-500" />,
        label: 'Try On Apple Watch (Nirwana)'
      };
    }
    if (photo.activityType === 'WeeklySeed') {
      return {
        bg: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/30',
        dot: 'bg-indigo-500',
        icon: <Sparkles className="w-3 h-3 mr-1 text-indigo-500" />,
        label: 'Weekly Sales'
      };
    }
    return {
      bg: 'bg-zinc-500/10 text-zinc-600 border-zinc-500/30',
      dot: 'bg-zinc-500',
      icon: <Tag className="w-3 h-3 mr-1 text-zinc-500" />,
      label: photo.activityType
    };
  };

  return (
    <div className="space-y-6">
      {/* Top Immersive Destination Banner */}
      <div className="relative overflow-hidden rounded-[28px] liquid-glass-dark text-white p-6 sm:p-7">
        <div className="absolute -right-20 -top-20 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -left-20 -bottom-20 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
          <div className="space-y-2">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-white/10 border border-white/15 backdrop-blur-md">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[11px] font-semibold tracking-wider uppercase text-zinc-300">
                Pusat Bukti Kerja Digimap
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
              Upload Screenshot &amp; Arsip Aktivitas
            </h2>
          </div>

          <div className="flex items-center space-x-2.5 shrink-0">
            {onForceSync && (
              <button
                onClick={onForceSync}
                className="bg-white/10 hover:bg-white/20 text-zinc-100 border border-white/20 px-4 py-2.5 rounded-2xl text-xs font-semibold transition backdrop-blur-md shadow-sm flex items-center space-x-2 active:scale-95"
                title="Sinkronisasi paksa cloud data"
              >
                <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
                <span>Sync Cloud</span>
              </button>
            )}

            <button
              onClick={onNavigateToAdmin}
              className="bg-amber-400 hover:bg-amber-300 text-zinc-950 font-bold px-4 py-2.5 rounded-2xl text-xs transition shadow-lg shadow-amber-500/25 flex items-center space-x-2 active:scale-95"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Area Admin</span>
            </button>
          </div>
        </div>

        {/* Live Metrics Bar */}
        <div className="relative z-10 mt-6 pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-4 text-zinc-300">
            <span className="flex items-center space-x-1.5">
              <Presentation className="w-3.5 h-3.5 text-blue-400" />
              <span>Open Studio: <strong className="text-white">{opsCount}</strong></span>
            </span>
            <span className="flex items-center space-x-1.5">
              <Tablet className="w-3.5 h-3.5 text-emerald-400" />
              <span>iPad (Aksara): <strong className="text-white">{tryOnIpadCount}</strong></span>
            </span>
            <span className="flex items-center space-x-1.5">
              <Headphones className="w-3.5 h-3.5 text-purple-400" />
              <span>AirPods (Samudra): <strong className="text-white">{tryOnAirPodsCount}</strong></span>
            </span>
            <span className="flex items-center space-x-1.5">
              <Watch className="w-3.5 h-3.5 text-rose-400" />
              <span>Watch (Nirwana): <strong className="text-white">{tryOnWatchCount}</strong></span>
            </span>
          </div>

          <div className="font-mono text-emerald-400 font-semibold text-[11px] bg-emerald-500/15 px-3 py-1 rounded-full border border-emerald-500/30 backdrop-blur-md">
            Total {photos.length} Bukti Drive Tersimpan
          </div>
        </div>
      </div>

      {/* Main Grid: Upload Form + Search & Filter Records */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Interactive Immersive Upload Form (5 cols on lg) */}
        <div className="lg:col-span-5 liquid-glass-card p-5 sm:p-6 rounded-[28px] space-y-5">
          <div className="flex items-center space-x-3 pb-3 border-b border-zinc-200/60">
            <div className="w-10 h-10 bg-zinc-950 text-white rounded-2xl flex items-center justify-center shrink-0 shadow-md">
              <CloudUpload className="w-5 h-5 text-emerald-400" />
            </div>
            <h3 className="font-bold text-zinc-900 text-sm">Upload Screenshot Baru</h3>
          </div>

          {feedback && (
            <div
              className={`p-3.5 rounded-2xl text-xs flex items-start justify-between ${
                feedback.type === 'success'
                  ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                  : 'bg-red-50 text-red-900 border border-red-200'
              }`}
            >
              <div className="flex items-start space-x-2.5">
                {feedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                )}
                <div className="leading-relaxed whitespace-pre-line text-[11px]">
                  {feedback.message}
                </div>
              </div>
              <button
                onClick={() => setFeedback(null)}
                className="text-[10px] text-zinc-500 hover:text-zinc-800 ml-2 font-medium shrink-0"
              >
                ✕
              </button>
            </div>
          )}

          {/* Last Upload Confirmation Card */}
          {lastUploaded && (
            <div className="p-3.5 bg-gradient-to-r from-emerald-50 via-teal-50/60 to-emerald-50 border border-emerald-300 rounded-2xl flex items-start justify-between gap-3 shadow-xs ring-1 ring-emerald-400/30 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="flex items-start space-x-3 min-w-0">
                <div className="relative group shrink-0">
                  <img
                    src={lastUploaded.preview}
                    alt="Preview"
                    className="w-12 h-12 rounded-xl object-cover border border-emerald-300 shadow-xs cursor-pointer group-hover:scale-105 transition"
                    onClick={() =>
                      handleOpenPhoto({
                        id: lastUploaded.id,
                        staffName: lastUploaded.staffName,
                        activityType: lastUploaded.activityType,
                        note: lastUploaded.note,
                        photoUrl: lastUploaded.preview,
                        timestamp: lastUploaded.timestamp,
                        syncedToDrive: false,
                        customerType: lastUploaded.customerType,
                        programCampaign: lastUploaded.programCampaign
                      })
                    }
                    title="Klik untuk memperbesar"
                  />
                  <div className="absolute inset-0 bg-black/20 rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition pointer-events-none">
                    <Eye className="w-3.5 h-3.5 text-white" />
                  </div>
                </div>
                <div className="text-[11px] min-w-0">
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="font-bold text-emerald-950 flex items-center">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 mr-1 inline" />
                      Tersimpan di Google Drive
                    </span>
                    <span className="text-[9px] font-mono px-1.5 py-0.5 bg-emerald-200/80 text-emerald-900 rounded font-semibold">
                      {lastUploaded.activityType}
                    </span>
                    {lastUploaded.customerType && (
                      <span className="text-[9px] px-1.5 py-0.5 bg-zinc-900 text-white rounded font-medium">
                        {lastUploaded.customerType}
                      </span>
                    )}
                  </div>
                  <p className="font-semibold text-zinc-800 truncate mt-0.5">
                    {lastUploaded.staffName}
                  </p>
                  <p className="text-[10px] text-zinc-500 truncate flex items-center">
                    <Clock className="w-3 h-3 text-emerald-600 mr-1" />
                    {lastUploaded.timestamp}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setLastUploaded(null)}
                className="text-[10px] text-zinc-400 hover:text-zinc-600 p-0.5"
                title="Tutup konfirmasi"
              >
                ✕
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            {/* Staff Selector */}
            <div>
              <label className="block font-semibold text-zinc-800 mb-1.5">
                Staf Toko Pengunggah
              </label>
              <select
                value={selectedStaffId}
                onChange={(e) => setSelectedStaffId(Number(e.target.value))}
                disabled={staffList.length === 0}
                className="w-full border border-zinc-300 rounded-2xl p-2.5 focus:ring-2 focus:ring-zinc-900 focus:outline-none bg-zinc-50/70 font-medium text-xs text-zinc-800 transition disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {staffList.length === 0 ? (
                  <option value={0}>Belum ada staf (Unggah schedule di Area Admin)</option>
                ) : (
                  staffList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.role || 'Staff'})
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Immersive Category Cards Selection (Open Studio, Try on iPad Aksara, Try on AirPods Samudra, Try on Apple Watch Nirwana) */}
            <div>
              <label className="block font-semibold text-zinc-800 mb-1.5">
                Pilih Kategori Aktivitas
              </label>
              <div className="grid grid-cols-2 gap-2">
                {/* 1. Open Studio */}
                <button
                  type="button"
                  onClick={() => handleSelectActivity('OPS')}
                  className={`p-3 rounded-2xl border text-left transition-all relative flex flex-col justify-between space-y-2 ${
                    activityType === 'OPS'
                      ? 'bg-blue-50/80 border-blue-500 ring-2 ring-blue-400/40 shadow-sm'
                      : 'bg-zinc-50/60 border-zinc-200 hover:border-zinc-300 hover:bg-zinc-100/60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div
                      className={`w-7 h-7 rounded-xl flex items-center justify-center ${
                        activityType === 'OPS'
                          ? 'bg-blue-600 text-white'
                          : 'bg-zinc-200 text-zinc-600'
                      }`}
                    >
                      <Presentation className="w-3.5 h-3.5" />
                    </div>
                    {activityType === 'OPS' && (
                      <span className="w-2 h-2 rounded-full bg-blue-600" />
                    )}
                  </div>
                  <div>
                    <h4 className="font-bold text-xs text-zinc-900">Open Studio</h4>
                    <span className="text-[10px] text-blue-700 font-medium block mt-0.5">
                      OPS (+1)
                    </span>
                  </div>
                </button>

                {/* 2. Try on iPad (Aksara) */}
                <button
                  type="button"
                  onClick={() => handleSelectActivity('TryOn_iPad')}
                  className={`p-3 rounded-2xl border text-left transition-all relative flex flex-col justify-between space-y-2 ${
                    activityType === 'TryOn_iPad'
                      ? 'bg-emerald-50/80 border-emerald-500 ring-2 ring-emerald-400/40 shadow-sm'
                      : 'bg-zinc-50/60 border-zinc-200 hover:border-zinc-300 hover:bg-zinc-100/60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div
                      className={`w-7 h-7 rounded-xl flex items-center justify-center ${
                        activityType === 'TryOn_iPad'
                          ? 'bg-emerald-600 text-white'
                          : 'bg-zinc-200 text-zinc-600'
                      }`}
                    >
                      <Tablet className="w-3.5 h-3.5" />
                    </div>
                    {activityType === 'TryOn_iPad' && (
                      <span className="w-2 h-2 rounded-full bg-emerald-600" />
                    )}
                  </div>
                  <div>
                    <h4 className="font-bold text-xs text-zinc-900">Try on iPad</h4>
                    <span className="text-[10px] text-emerald-700 font-medium block mt-0.5">
                      Aksara (+1)
                    </span>
                  </div>
                </button>

                {/* 3. Try on AirPods (Samudra) */}
                <button
                  type="button"
                  onClick={() => handleSelectActivity('TryOn_AirPods')}
                  className={`p-3 rounded-2xl border text-left transition-all relative flex flex-col justify-between space-y-2 ${
                    activityType === 'TryOn_AirPods'
                      ? 'bg-purple-50/80 border-purple-500 ring-2 ring-purple-400/40 shadow-sm'
                      : 'bg-zinc-50/60 border-zinc-200 hover:border-zinc-300 hover:bg-zinc-100/60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div
                      className={`w-7 h-7 rounded-xl flex items-center justify-center ${
                        activityType === 'TryOn_AirPods'
                          ? 'bg-purple-600 text-white'
                          : 'bg-zinc-200 text-zinc-600'
                      }`}
                    >
                      <Headphones className="w-3.5 h-3.5" />
                    </div>
                    {activityType === 'TryOn_AirPods' && (
                      <span className="w-2 h-2 rounded-full bg-purple-600" />
                    )}
                  </div>
                  <div>
                    <h4 className="font-bold text-xs text-zinc-900">Try on AirPods</h4>
                    <span className="text-[10px] text-purple-700 font-medium block mt-0.5">
                      Samudra (+1)
                    </span>
                  </div>
                </button>

                {/* 4. Try on Apple Watch (Nirwana) */}
                <button
                  type="button"
                  onClick={() => handleSelectActivity('TryOn_Watch')}
                  className={`p-3 rounded-2xl border text-left transition-all relative flex flex-col justify-between space-y-2 ${
                    activityType === 'TryOn_Watch'
                      ? 'bg-rose-50/80 border-rose-500 ring-2 ring-rose-400/40 shadow-sm'
                      : 'bg-zinc-50/60 border-zinc-200 hover:border-zinc-300 hover:bg-zinc-100/60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div
                      className={`w-7 h-7 rounded-xl flex items-center justify-center ${
                        activityType === 'TryOn_Watch'
                          ? 'bg-rose-600 text-white'
                          : 'bg-zinc-200 text-zinc-600'
                      }`}
                    >
                      <Watch className="w-3.5 h-3.5" />
                    </div>
                    {activityType === 'TryOn_Watch' && (
                      <span className="w-2 h-2 rounded-full bg-rose-600" />
                    )}
                  </div>
                  <div>
                    <h4 className="font-bold text-xs text-zinc-900">Try on Apple Watch</h4>
                    <span className="text-[10px] text-rose-700 font-medium block mt-0.5">
                      Nirwana (+1)
                    </span>
                  </div>
                </button>
              </div>

              {/* Weekly Sales Coach auxiliary option */}
              <div className="mt-2 text-right">
                <button
                  type="button"
                  onClick={() => handleSelectActivity('WeeklySeed')}
                  className={`text-[11px] font-medium transition inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg ${
                    activityType === 'WeeklySeed'
                      ? 'bg-indigo-600 text-white'
                      : 'text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100'
                  }`}
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Kategori Weekly Sales Coach</span>
                </button>
              </div>
            </div>

            {/* DEDICATED SECTION: TYPE CUSTOMER (iPhone Purchaser vs Browser) for Samudra & Nirwana / Aksara */}
            {isTryOnActive && (
              <div className="p-4 rounded-2xl bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950 text-white shadow-md border border-zinc-800 space-y-3 animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                      <UserCheck className="w-3.5 h-3.5" />
                    </div>
                    <h4 className="font-bold text-xs text-white">Tipe Customer Try-On</h4>
                  </div>
                  <span className="text-[9px] font-mono px-2 py-0.5 bg-emerald-500/20 text-emerald-300 rounded font-semibold">
                    REQUIRED
                  </span>
                </div>

                {/* Tactile Customer Type Toggle Cards */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setCustomerType('iPhone Purchaser')}
                    className={`p-3 rounded-xl border text-left transition-all flex items-center space-x-2.5 ${
                      customerType === 'iPhone Purchaser'
                        ? 'bg-emerald-500/20 border-emerald-400 text-white shadow-sm ring-1 ring-emerald-400/50'
                        : 'bg-zinc-800/80 border-zinc-700/80 text-zinc-300 hover:bg-zinc-800 hover:text-white'
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        customerType === 'iPhone Purchaser'
                          ? 'bg-emerald-500 text-zinc-950'
                          : 'bg-zinc-700 text-zinc-300'
                      }`}
                    >
                      <ShoppingBag className="w-4 h-4" />
                    </div>
                    <h5 className="font-bold text-xs leading-tight">iPhone Purchaser</h5>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCustomerType('Browser')}
                    className={`p-3 rounded-xl border text-left transition-all flex items-center space-x-2.5 ${
                      customerType === 'Browser'
                        ? 'bg-blue-500/20 border-blue-400 text-white shadow-sm ring-1 ring-blue-400/50'
                        : 'bg-zinc-800/80 border-zinc-700/80 text-zinc-300 hover:bg-zinc-800 hover:text-white'
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        customerType === 'Browser'
                          ? 'bg-blue-500 text-zinc-950'
                          : 'bg-zinc-700 text-zinc-300'
                      }`}
                    >
                      <Compass className="w-4 h-4" />
                    </div>
                    <h5 className="font-bold text-xs leading-tight">Browser</h5>
                  </button>
                </div>

                {/* Quick Campaign Selector Chips: Aksara, Samudra, Nirwana */}
                <div className="pt-2 border-t border-zinc-800/90 flex items-center justify-between gap-2">
                  <span className="text-[10px] text-zinc-400">Program Campaign:</span>
                  <div className="flex items-center space-x-1.5">
                    {['Aksara', 'Samudra', 'Nirwana'].map((camp) => (
                      <button
                        key={camp}
                        type="button"
                        onClick={() => setProgramCampaign(camp)}
                        className={`text-[10px] px-2.5 py-1 rounded-lg font-semibold transition ${
                          programCampaign === camp
                            ? 'bg-white text-zinc-950 shadow-xs'
                            : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        {camp}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Note Input */}
            <div>
              <label className="block font-semibold text-zinc-800 mb-1">
                Catatan Bukti (Opsional)
              </label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Contoh: Demo iPad Pro M4 / Audio Spatial Samudra"
                className="w-full border border-zinc-300 rounded-2xl p-2.5 focus:ring-2 focus:ring-zinc-900 focus:outline-none bg-zinc-50/70 text-xs transition"
              />
            </div>

            {/* Drop / Select Zone */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-zinc-300 hover:border-zinc-900 rounded-2xl p-4 text-center transition bg-zinc-50/70 cursor-pointer"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />

              {!photoBase64 ? (
                <div className="space-y-1.5 py-2">
                  <div className="w-10 h-10 rounded-2xl bg-zinc-100 flex items-center justify-center mx-auto text-zinc-500">
                    <ImageIcon className="w-5 h-5" />
                  </div>
                  <p className="text-xs font-semibold text-zinc-800">
                    {isCompressing ? 'Mengompresi Gambar...' : 'Pilih Screenshot / Foto Bukti'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2 flex flex-col items-center">
                  <div className="relative">
                    <img
                      src={photoBase64}
                      alt="Preview"
                      className="max-h-36 rounded-xl object-contain border border-zinc-300 shadow-xs"
                    />
                    {isSubmitting && (
                      <div className="absolute inset-0 bg-black/60 backdrop-blur-[1.5px] rounded-xl flex flex-col items-center justify-center text-white space-y-1 animate-in fade-in duration-150">
                        <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
                        <span className="text-[10px] font-semibold tracking-wide">
                          Mengunggah ke Drive...
                        </span>
                      </div>
                    )}
                  </div>
                  <p className="text-[11px] font-mono text-zinc-600 font-medium truncate max-w-[220px]">
                    {photoFileName}
                  </p>
                  {compressionInfo && (
                    <div className="text-[9px] bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-full font-mono">
                      ⚡ {compressionInfo.originalKb} KB ➔ {compressionInfo.compressedKb} KB
                    </div>
                  )}
                  {!isSubmitting && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPhotoBase64(null);
                        setPhotoFileName('');
                        setCompressionInfo(null);
                      }}
                      className="text-[10px] text-red-600 hover:underline flex items-center pt-0.5"
                    >
                      <Trash2 className="w-3 h-3 mr-0.5" /> Ganti Gambar
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Cloud Sync Progress Feedback */}
            {(uploadStage === 'uploading' || uploadStage === 'compressing') && (
              <div className="space-y-2 p-3.5 bg-zinc-950 text-white rounded-2xl text-xs shadow-lg border border-zinc-800 animate-in fade-in slide-in-from-bottom-1 duration-200">
                <div className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center space-x-2">
                    <Loader2 className="w-4 h-4 text-emerald-400 animate-spin shrink-0" />
                    <span className="font-semibold text-white">
                      {uploadStage === 'compressing'
                        ? 'Mengoptimasi resolusi foto...'
                        : 'Mengunggah ke Google Drive & menyimpan database...'}
                    </span>
                  </div>
                  <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold tracking-wider">
                    {uploadStage === 'compressing' ? 'COMPRESSING' : 'SYNCING'}
                  </span>
                </div>

                <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden relative">
                  <div className="h-full bg-gradient-to-r from-emerald-500 via-teal-300 to-emerald-400 rounded-full animate-pulse w-full" />
                </div>
              </div>
            )}

            {/* Subtle Success Transition Pill */}
            {uploadStage === 'success' && (
              <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-2xl text-xs flex items-center justify-between text-emerald-950 shadow-xs animate-in zoom-in-95 duration-200">
                <div className="flex items-center space-x-2.5">
                  <div className="w-6 h-6 bg-emerald-600 text-white rounded-full flex items-center justify-center shrink-0 shadow-2xs">
                    <Check className="w-4 h-4" />
                  </div>
                  <p className="font-bold text-xs">Tersimpan &amp; Tersinkron di Google Drive!</p>
                </div>
                <span className="text-[10px] bg-emerald-200/90 text-emerald-950 font-bold px-2 py-0.5 rounded-full font-mono">
                  ✓ SYNCED
                </span>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting || isCompressing || !photoBase64 || uploadStage === 'success'}
              className={`w-full px-4 py-3 rounded-2xl text-xs font-bold transition-all duration-300 flex items-center justify-center space-x-2 shadow-sm ${
                uploadStage === 'success'
                  ? 'bg-emerald-600 text-white border border-emerald-500 shadow-emerald-500/20 ring-2 ring-emerald-300 ring-offset-1 scale-[1.01]'
                  : uploadStage === 'uploading' || uploadStage === 'compressing'
                  ? 'bg-zinc-800 text-white cursor-wait opacity-95'
                  : isSubmitting || !photoBase64
                  ? 'bg-zinc-200 text-zinc-400 cursor-not-allowed'
                  : 'bg-zinc-950 hover:bg-zinc-800 text-white hover:shadow-lg active:scale-[0.99]'
              }`}
            >
              {uploadStage === 'success' ? (
                <>
                  <Check className="w-4 h-4 animate-in zoom-in duration-200" />
                  <span>✓ Berhasil Tersimpan di Drive!</span>
                </>
              ) : uploadStage === 'uploading' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                  <span>Mengunggah Bukti ke Drive...</span>
                </>
              ) : uploadStage === 'compressing' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                  <span>Mengompresi Resolusi Foto...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Kirim &amp; Sinkronkan Bukti</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Right Column: Search Bar, Category Filters & Records Directory (7 cols on lg) */}
        <div className="lg:col-span-7 space-y-4">
          {/* Search & Filters Container */}
          <div className="liquid-glass-card p-5 sm:p-6 rounded-[28px] space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h3 className="font-bold text-zinc-900 text-sm flex items-center space-x-2">
                <Search className="w-4 h-4 text-zinc-700" />
                <span>Penelusuran Arsip Foto Bukti</span>
              </h3>

              {isFilterActive && (
                <button
                  onClick={handleResetFilters}
                  className="text-[11px] text-red-600 hover:text-red-700 font-medium flex items-center space-x-1 self-start sm:self-auto bg-red-50 hover:bg-red-100 border border-red-200 px-3 py-1 rounded-xl transition"
                >
                  <X className="w-3 h-3" />
                  <span>Reset Filter</span>
                </button>
              )}
            </div>

            {/* Search Input Bar */}
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari tanggal (contoh: 4 Nov), tipe customer, nama staf, atau catatan..."
                className="w-full pl-10 pr-9 py-2.5 text-xs bg-zinc-50 border border-zinc-300 rounded-2xl focus:ring-2 focus:ring-zinc-900 focus:outline-none transition placeholder:text-zinc-400"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Date, Staff & Customer Type Secondary Filters */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
              {/* Date Filter */}
              <div className="flex items-center space-x-1.5 bg-zinc-50 p-1.5 rounded-2xl border border-zinc-200">
                <Calendar className="w-3.5 h-3.5 text-zinc-500 ml-1.5 shrink-0" />
                <input
                  type="date"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="text-xs bg-transparent border-0 focus:outline-none text-zinc-700 flex-1 min-w-0"
                  title="Pilih tanggal spesifik"
                />
                {dateFilter ? (
                  <button
                    onClick={() => setDateFilter('')}
                    className="text-[10px] text-zinc-400 hover:text-zinc-700 px-1"
                  >
                    ✕
                  </button>
                ) : (
                  <button
                    onClick={handleSetTodayFilter}
                    className="text-[10px] bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-100 font-semibold px-2 py-0.5 rounded-lg shadow-2xs shrink-0"
                  >
                    Hari Ini
                  </button>
                )}
              </div>

              {/* Staff Member Filter */}
              <div className="flex items-center space-x-1.5 bg-zinc-50 p-1.5 rounded-2xl border border-zinc-200">
                <UserCheck className="w-3.5 h-3.5 text-zinc-500 ml-1.5 shrink-0" />
                <select
                  value={staffFilter}
                  onChange={(e) => setStaffFilter(e.target.value)}
                  className="text-xs bg-transparent border-0 focus:outline-none text-zinc-700 flex-1 truncate font-medium"
                >
                  <option value="ALL">Semua Staf Toko</option>
                  {availableStaffFilterOptions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Customer Type Filter */}
              <div className="flex items-center space-x-1.5 bg-zinc-50 p-1.5 rounded-2xl border border-zinc-200">
                <ShoppingBag className="w-3.5 h-3.5 text-zinc-500 ml-1.5 shrink-0" />
                <select
                  value={customerTypeFilter}
                  onChange={(e) => setCustomerTypeFilter(e.target.value as 'ALL' | CustomerType)}
                  className="text-xs bg-transparent border-0 focus:outline-none text-zinc-700 flex-1 truncate font-medium"
                >
                  <option value="ALL">Semua Tipe Customer</option>
                  <option value="iPhone Purchaser">🛍️ iPhone Purchaser</option>
                  <option value="Browser">🔍 Browser</option>
                </select>
              </div>
            </div>

            {/* Vertical Spaced Category Filter Tabs (closed by default, each expands directly underneath) */}
            <div className="pt-2 border-t border-zinc-100 space-y-2.5">
              {[
                {
                  id: 'ALL' as const,
                  label: 'Semua Foto Bukti',
                  count: photos.length,
                  icon: <FolderOpen className="w-4 h-4" />,
                  activeBtn: 'bg-zinc-950 text-white',
                  inactiveBtn: 'bg-zinc-50 hover:bg-zinc-100 text-zinc-800',
                  activeBadge: 'bg-zinc-800 text-zinc-200',
                  inactiveBadge: 'bg-zinc-200 text-zinc-700',
                  borderCls: 'border-zinc-200/90'
                },
                {
                  id: 'OPS' as const,
                  label: 'Open Studio (OPS)',
                  count: opsCount,
                  icon: <Presentation className="w-4 h-4" />,
                  activeBtn: 'bg-blue-600 text-white',
                  inactiveBtn: 'bg-blue-50/60 hover:bg-blue-50 text-blue-900',
                  activeBadge: 'bg-blue-700 text-white',
                  inactiveBadge: 'bg-blue-100 text-blue-800',
                  borderCls: 'border-blue-200/80'
                },
                {
                  id: 'TryOn_iPad' as const,
                  label: 'Try On iPad (Aksara)',
                  count: tryOnIpadCount,
                  icon: <Tablet className="w-4 h-4" />,
                  activeBtn: 'bg-emerald-600 text-white',
                  inactiveBtn: 'bg-emerald-50/60 hover:bg-emerald-50 text-emerald-900',
                  activeBadge: 'bg-emerald-700 text-white',
                  inactiveBadge: 'bg-emerald-100 text-emerald-800',
                  borderCls: 'border-emerald-200/80'
                },
                {
                  id: 'TryOn_AirPods' as const,
                  label: 'Try On AirPods (Samudra)',
                  count: tryOnAirPodsCount,
                  icon: <Headphones className="w-4 h-4" />,
                  activeBtn: 'bg-purple-600 text-white',
                  inactiveBtn: 'bg-purple-50/60 hover:bg-purple-50 text-purple-900',
                  activeBadge: 'bg-purple-700 text-white',
                  inactiveBadge: 'bg-purple-100 text-purple-800',
                  borderCls: 'border-purple-200/80'
                },
                {
                  id: 'TryOn_Watch' as const,
                  label: 'Try On Watch (Nirwana)',
                  count: tryOnWatchCount,
                  icon: <Watch className="w-4 h-4" />,
                  activeBtn: 'bg-rose-600 text-white',
                  inactiveBtn: 'bg-rose-50/60 hover:bg-rose-50 text-rose-900',
                  activeBadge: 'bg-rose-700 text-white',
                  inactiveBadge: 'bg-rose-100 text-rose-800',
                  borderCls: 'border-rose-200/80'
                },
                {
                  id: 'WeeklySeed' as const,
                  label: 'Weekly Coach',
                  count: weeklyCount,
                  icon: <Sparkles className="w-4 h-4" />,
                  activeBtn: 'bg-indigo-600 text-white',
                  inactiveBtn: 'bg-indigo-50/60 hover:bg-indigo-50 text-indigo-900',
                  activeBadge: 'bg-indigo-700 text-white',
                  inactiveBadge: 'bg-indigo-100 text-indigo-800',
                  borderCls: 'border-indigo-200/80'
                }
              ].map((cat) => {
                const isOpen = categoryFilter === cat.id;
                return (
                  <div
                    key={cat.id}
                    className={`rounded-2xl border overflow-hidden transition ${cat.borderCls}`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleCategoryTab(cat.id)}
                      className={`w-full px-4 py-3 text-xs font-bold transition flex items-center justify-between cursor-pointer ${
                        isOpen ? cat.activeBtn : cat.inactiveBtn
                      }`}
                    >
                      <div className="flex items-center space-x-2.5 min-w-0">
                        {cat.icon}
                        <span className="truncate">{cat.label}</span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${
                            isOpen ? cat.activeBadge : cat.inactiveBadge
                          }`}
                        >
                          {cat.count}
                        </span>
                      </div>
                      {isOpen ? (
                        <ChevronUp className="w-4 h-4 shrink-0 opacity-85" />
                      ) : (
                        <ChevronDown className="w-4 h-4 shrink-0 opacity-60" />
                      )}
                    </button>

                    {isOpen && (
                      <div className="p-3.5 sm:p-4 bg-white/80 border-t border-zinc-200/60 space-y-3 animate-in fade-in duration-200">
                        <div className="flex items-center justify-between text-xs text-zinc-500">
                          <span className="font-medium">
                            Menampilkan <strong className="text-zinc-900">{filteredPhotos.length}</strong> foto
                          </span>
                        </div>

                        {filteredPhotos.length === 0 ? (
                          <div className="bg-zinc-50 p-8 rounded-2xl border border-zinc-200/80 text-center space-y-2.5">
                            <Search className="w-6 h-6 text-zinc-400 mx-auto" />
                            <h4 className="font-bold text-xs text-zinc-800">Tidak Ada Foto yang Cocok</h4>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[600px] overflow-y-auto pr-1">
                            {filteredPhotos.map((photo) => {
                              const badge = getActivityBadge(photo);
                              return (
                                <div
                                  key={photo.id}
                                  onClick={() => handleOpenPhoto(photo)}
                                  className="liquid-glass-card liquid-glass-card-hover rounded-[22px] overflow-hidden cursor-pointer group flex flex-col justify-between"
                                >
                                  <div>
                                    <div className="relative aspect-video bg-zinc-900 overflow-hidden">
                                      <DrivePhotoImg
                                        photo={photo}
                                        alt={photo.note || photo.activityType}
                                        className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                                      />
                                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-end justify-between p-3">
                                        <span className="text-[11px] text-white font-medium flex items-center space-x-1">
                                          <Eye className="w-3.5 h-3.5" />
                                          <span>Lihat Penuh</span>
                                        </span>
                                        <button
                                          onClick={(e) => handleDownloadPhoto(photo, e)}
                                          className="p-1.5 bg-white/90 hover:bg-white text-zinc-950 rounded-xl shadow-md transition"
                                          title="Download Foto"
                                        >
                                          <Download className="w-3.5 h-3.5" />
                                        </button>
                                      </div>

                                      <div className="absolute top-2.5 left-2.5 flex flex-wrap items-center gap-1.5">
                                        <span
                                          className={`inline-flex items-center px-2.5 py-1 rounded-xl text-[10px] font-bold border backdrop-blur-md shadow-sm ${badge.bg}`}
                                        >
                                          {badge.icon}
                                          {badge.label}
                                        </span>

                                        {photo.customerType && (
                                          <span
                                            className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[9px] font-bold border backdrop-blur-md shadow-sm ${
                                              photo.customerType === 'iPhone Purchaser'
                                                ? 'bg-emerald-500/90 text-white border-emerald-400'
                                                : 'bg-blue-500/90 text-white border-blue-400'
                                            }`}
                                          >
                                            {photo.customerType === 'iPhone Purchaser' ? (
                                              <ShoppingBag className="w-2.5 h-2.5 mr-1" />
                                            ) : (
                                              <Compass className="w-2.5 h-2.5 mr-1" />
                                            )}
                                            {photo.customerType}
                                          </span>
                                        )}

                                        {photo.programCampaign && (
                                          <span className="px-1.5 py-0.5 rounded-md text-[9px] font-mono font-semibold bg-zinc-900/80 text-zinc-200 border border-zinc-700 backdrop-blur-md">
                                            {photo.programCampaign}
                                          </span>
                                        )}
                                      </div>
                                    </div>

                                    <div className="p-4 space-y-2">
                                      <div className="flex items-start justify-between gap-1">
                                        <h4 className="font-bold text-xs text-zinc-900 truncate group-hover:text-emerald-700 transition">
                                          {photo.staffName}
                                        </h4>
                                        <span className="text-[10px] text-zinc-400 font-mono shrink-0 flex items-center">
                                          <Clock className="w-3 h-3 mr-1 text-zinc-400" />
                                          {photo.timestamp}
                                        </span>
                                      </div>

                                      {photo.note && (
                                        <p className="text-[11px] text-zinc-600 line-clamp-2 leading-relaxed bg-zinc-50 p-2.5 rounded-xl border border-zinc-100">
                                          {photo.note}
                                        </p>
                                      )}
                                    </div>
                                  </div>

                                  <div className="px-4 pb-3.5 pt-1.5 flex items-center justify-end text-[11px] border-t border-zinc-100">
                                    <button
                                      onClick={(e) => handleDownloadPhoto(photo, e)}
                                      className="text-zinc-700 hover:text-zinc-950 font-semibold inline-flex items-center space-x-1 hover:underline"
                                    >
                                      <Download className="w-3 h-3" />
                                      <span>Unduh</span>
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Search/Filter Results when user searches/filters without selecting a specific category tab */}
          {categoryFilter === null && isArchiveOpen && (
            <>
              <div className="flex items-center justify-between px-2 text-xs text-zinc-500">
                <span className="font-medium">
                  Menampilkan <strong className="text-zinc-900">{filteredPhotos.length}</strong> dari{' '}
                  {photos.length} total foto bukti
                </span>
                <span className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full font-medium">
                  Filter Aktif
                </span>
              </div>

              {filteredPhotos.length === 0 ? (
                <div className="bg-white p-10 rounded-3xl border border-zinc-200/90 text-center space-y-3">
                  <div className="w-14 h-14 bg-zinc-100 text-zinc-400 rounded-3xl flex items-center justify-center mx-auto">
                    <Search className="w-7 h-7" />
                  </div>
                  <h4 className="font-bold text-sm text-zinc-800">Tidak Ada Foto yang Cocok</h4>
                  <button
                    onClick={handleResetFilters}
                    className="bg-zinc-950 text-white hover:bg-zinc-800 text-xs font-semibold px-4 py-2.5 rounded-2xl transition shadow-xs inline-flex items-center space-x-2"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Tutup Filter</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[680px] overflow-y-auto pr-1">
                  {filteredPhotos.map((photo) => {
                    const badge = getActivityBadge(photo);
                    return (
                      <div
                        key={photo.id}
                        onClick={() => handleOpenPhoto(photo)}
                        className="liquid-glass-card liquid-glass-card-hover rounded-[24px] overflow-hidden cursor-pointer group flex flex-col justify-between"
                      >
                        <div>
                          <div className="relative aspect-video bg-zinc-900 overflow-hidden">
                            <DrivePhotoImg
                              photo={photo}
                              alt={photo.note || photo.activityType}
                              className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-end justify-between p-3">
                              <span className="text-[11px] text-white font-medium flex items-center space-x-1">
                                <Eye className="w-3.5 h-3.5" />
                                <span>Lihat Penuh</span>
                              </span>
                              <button
                                onClick={(e) => handleDownloadPhoto(photo, e)}
                                className="p-1.5 bg-white/90 hover:bg-white text-zinc-950 rounded-xl shadow-md transition"
                                title="Download Foto"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            <div className="absolute top-2.5 left-2.5 flex flex-wrap items-center gap-1.5">
                              <span
                                className={`inline-flex items-center px-2.5 py-1 rounded-xl text-[10px] font-bold border backdrop-blur-md shadow-sm ${badge.bg}`}
                              >
                                {badge.icon}
                                {badge.label}
                              </span>

                              {photo.customerType && (
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[9px] font-bold border backdrop-blur-md shadow-sm ${
                                    photo.customerType === 'iPhone Purchaser'
                                      ? 'bg-emerald-500/90 text-white border-emerald-400'
                                      : 'bg-blue-500/90 text-white border-blue-400'
                                  }`}
                                >
                                  {photo.customerType === 'iPhone Purchaser' ? (
                                    <ShoppingBag className="w-2.5 h-2.5 mr-1" />
                                  ) : (
                                    <Compass className="w-2.5 h-2.5 mr-1" />
                                  )}
                                  {photo.customerType}
                                </span>
                              )}

                              {photo.programCampaign && (
                                <span className="px-1.5 py-0.5 rounded-md text-[9px] font-mono font-semibold bg-zinc-900/80 text-zinc-200 border border-zinc-700 backdrop-blur-md">
                                  {photo.programCampaign}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="p-4 space-y-2">
                            <div className="flex items-start justify-between gap-1">
                              <h4 className="font-bold text-xs text-zinc-900 truncate group-hover:text-emerald-700 transition">
                                {photo.staffName}
                              </h4>
                              <span className="text-[10px] text-zinc-400 font-mono shrink-0 flex items-center">
                                <Clock className="w-3 h-3 mr-1 text-zinc-400" />
                                {photo.timestamp}
                              </span>
                            </div>

                            {photo.note && (
                              <p className="text-[11px] text-zinc-600 line-clamp-2 leading-relaxed bg-zinc-50 p-2.5 rounded-xl border border-zinc-100">
                                {photo.note}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="px-4 pb-3.5 pt-1.5 flex items-center justify-end text-[11px] border-t border-zinc-100">
                          <button
                            onClick={(e) => handleDownloadPhoto(photo, e)}
                            className="text-zinc-700 hover:text-zinc-950 font-semibold inline-flex items-center space-x-1 hover:underline"
                          >
                            <Download className="w-3 h-3" />
                            <span>Unduh</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* Bottom Link to Full Admin Archive */}
          <div className="bg-zinc-50 p-3.5 rounded-3xl border border-zinc-200/80 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center space-x-2 text-zinc-700 font-semibold">
              <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Area Admin</span>
            </div>
            <button
              onClick={onNavigateToAdmin}
              className="bg-white border border-zinc-300 hover:bg-zinc-100 text-zinc-900 font-bold px-3.5 py-1.5 rounded-xl transition shadow-xs flex items-center space-x-1.5 shrink-0"
            >
              <span>Buka Area Admin</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Local Fallback Lightbox Modal */}
      {localLightboxPhoto && !onOpenPhotoLightbox && (
        <div
          onClick={() => setLocalLightboxPhoto(null)}
          className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-3xl max-w-2xl w-full overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200"
          >
            <div className="p-4 border-b border-zinc-100 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-bold bg-zinc-950 text-white">
                  {localLightboxPhoto.activityType}
                </span>
                <h4 className="font-bold text-xs text-zinc-900">
                  {localLightboxPhoto.staffName}
                </h4>
                {localLightboxPhoto.customerType && (
                  <span className="px-2 py-0.5 rounded-md text-[9px] font-bold bg-emerald-100 text-emerald-800">
                    {localLightboxPhoto.customerType}
                  </span>
                )}
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={(e) => handleDownloadPhoto(localLightboxPhoto, e)}
                  className="p-1.5 text-zinc-600 hover:text-zinc-900 rounded-xl hover:bg-zinc-100"
                  title="Download Foto"
                >
                  <Download className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setLocalLightboxPhoto(null)}
                  className="p-1.5 text-zinc-400 hover:text-zinc-800 rounded-xl hover:bg-zinc-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="bg-zinc-950 p-2 flex items-center justify-center max-h-[70vh]">
              <DrivePhotoImg
                photo={localLightboxPhoto}
                alt={localLightboxPhoto.note}
                loading="eager"
                className="max-h-[65vh] object-contain rounded-2xl"
              />
            </div>
            {localLightboxPhoto.note && (
              <div className="p-3.5 text-xs text-zinc-600 bg-zinc-50 border-t border-zinc-100">
                <span className="font-semibold text-zinc-800">Catatan: </span>
                {localLightboxPhoto.note}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
