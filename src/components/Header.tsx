import React from 'react';
import { Plus, Printer, FileSpreadsheet, Menu, ShieldCheck, Lock, Unlock, RefreshCw, QrCode, Smartphone } from 'lucide-react';
import { ViewType } from '../types';
import { AppLogo } from './common/AppLogo';

interface HeaderProps {
  currentView: ViewType;
  onOpenSubmitModal: () => void;
  onOpenPrintModal: () => void;
  onExportExcel: () => void;
  onMobileMenuToggle: () => void;
  isAdminUnlocked?: boolean;
  onAdminClick?: () => void;
  onForceSync?: () => void;
  isSyncing?: boolean;
  onOpenMobileConnect?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentView,
  onOpenSubmitModal,
  onOpenPrintModal,
  onExportExcel,
  onMobileMenuToggle,
  isAdminUnlocked,
  onAdminClick,
  onForceSync,
  isSyncing,
  onOpenMobileConnect
}) => {
  const titles: Record<ViewType, { title: string; subtitle: string }> = {
    overview: {
      title: 'Overview Ringkasan Aktifitas',
      subtitle: 'Dashboard Manajemen Operasional, Target & Penjadwalan Toko'
    },
    schedule: {
      title: 'Weekly Schedule (Shift, OPS & Try-On iPad)',
      subtitle: 'Jadwal Kerja Mingguan dan Alokasi Otomatis Host Harian'
    },
    'staff-overview': {
      title: 'Staff Overview & Progress Objective',
      subtitle: 'Rekapitulasi Target dan Pencapaian Objektif Staf Toko'
    },
    'proof-upload': {
      title: 'Upload Bukti Screenshot Kerja',
      subtitle: 'Simpan Foto Bukti di Google Drive Toko & Update Target Staf Otomatis'
    },
    cashier: {
      title: 'Monitor Sesi Staf (Akses Kasir Toko)',
      subtitle: 'Pantau Sesi Demo & Interaksi Pelanggan (iPhone Purchaser / Browser) Toko'
    },
    admin: {
      title: 'Area Admin Operasional',
      subtitle: 'Arsip Foto Bukti, Input Foto Baru, Upload Schedule Excel & Backup Data'
    },
    links: {
      title: 'Link Form Kerja Operasional',
      subtitle: 'Tautan Cepat Formulir Google & Portal Coaching'
    }
  };

  const currentMeta = titles[currentView] || titles.overview;

  return (
    <header className="liquid-glass-header px-4 sm:px-8 py-3.5 sticky top-0 z-20 flex items-center justify-between gap-4">
      <div className="flex items-center space-x-3.5 min-w-0">
        <button
          onClick={onMobileMenuToggle}
          className="lg:hidden p-2 text-zinc-600 hover:text-zinc-900 rounded-xl hover:bg-white/80 border border-transparent hover:border-white/60 transition shadow-2xs"
          aria-label="Toggle Navigation"
        >
          <Menu className="w-5 h-5" />
        </button>
        <AppLogo size="sm" className="hidden sm:flex" />
        <div className="min-w-0">
          <h2 className="text-base sm:text-lg font-bold tracking-tight text-zinc-900 truncate">
            {currentMeta.title}
          </h2>
        </div>
      </div>

      {/* Action Buttons in Apple Liquid Glass */}
      <div className="flex items-center space-x-2 shrink-0">
        {onOpenMobileConnect && (
          <button
            onClick={onOpenMobileConnect}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-blue-50/90 hover:bg-blue-100 text-blue-700 border border-blue-300 transition shadow-2xs backdrop-blur-md flex items-center space-x-1.5 cursor-pointer active:scale-95"
            title="Tampilkan QR Code untuk buka langsung di HP staf"
          >
            <Smartphone className="w-3.5 h-3.5 text-blue-600" />
            <span className="hidden sm:inline">Buka di HP</span>
            <QrCode className="w-3 h-3 text-blue-500" />
          </button>
        )}

        {onAdminClick && (
          <button
            onClick={onAdminClick}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition flex items-center space-x-1.5 ${
              currentView === 'admin'
                ? 'bg-amber-500 text-zinc-950 shadow-sm border border-amber-400'
                : isAdminUnlocked
                ? 'bg-amber-50/80 text-amber-800 border border-amber-300 hover:bg-amber-100 backdrop-blur-md shadow-2xs'
                : 'bg-white/80 text-zinc-800 border border-zinc-200/80 hover:bg-white backdrop-blur-md shadow-2xs'
            }`}
            title={isAdminUnlocked ? 'Area Admin (Terbuka)' : 'Buka Area Admin'}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
            <span className="hidden sm:inline">Admin</span>
            {isAdminUnlocked ? (
              <Unlock className="w-3 h-3 text-emerald-600" />
            ) : (
              <Lock className="w-3 h-3 text-zinc-400" />
            )}
          </button>
        )}

        {/* Live Realtime Cloud Sync Button */}
        {onForceSync && (
          <button
            onClick={onForceSync}
            disabled={isSyncing}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-50/90 text-emerald-800 border border-emerald-300 hover:bg-emerald-100/90 transition shadow-2xs backdrop-blur-md disabled:opacity-60 cursor-pointer active:scale-95"
            title="Sinkronkan schedule & foto bukti terbaru di perangkat ini"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-emerald-600 ${isSyncing ? 'animate-spin' : ''}`} />
            <span className="font-mono text-[11px] font-bold">
              {isSyncing ? 'Sync...' : 'Sync'}
            </span>
          </button>
        )}

        <button
          onClick={onOpenSubmitModal}
          className="bg-zinc-900 hover:bg-zinc-800 text-white px-3.5 py-1.5 rounded-xl text-xs font-semibold transition shadow-sm border border-white/20 flex items-center space-x-1.5"
          title="Catat penambahan aktivitas staf (+ Count cepat)"
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="hidden md:inline">Quick Record</span>
        </button>

        <button
          onClick={onOpenPrintModal}
          className="bg-white/80 hover:bg-white text-zinc-800 border border-zinc-200/80 px-3 py-1.5 rounded-xl text-xs font-medium transition shadow-2xs backdrop-blur-md flex items-center space-x-1.5"
          title="Cetak lembar briefing harian"
        >
          <Printer className="w-3.5 h-3.5" />
          <span className="hidden lg:inline">Print Briefing</span>
        </button>

        <button
          onClick={onExportExcel}
          className="bg-emerald-50/80 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 px-3 py-1.5 rounded-xl text-xs font-semibold transition shadow-2xs backdrop-blur-md flex items-center space-x-1.5"
          title="Export data ke file Excel (.xlsx)"
        >
          <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
          <span className="hidden xl:inline">Export Excel</span>
        </button>
      </div>
    </header>
  );
};
