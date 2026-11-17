import React from 'react';
import {
  PieChart,
  CalendarDays,
  Contact,
  CloudUpload,
  Link2,
  ShieldCheck,
  Lock,
  Unlock,
  Layers,
  X,
  Receipt,
  Smartphone,
  QrCode
} from 'lucide-react';
import { ViewType } from '../types';
import { AppLogo } from './common/AppLogo';

interface SidebarProps {
  currentView: ViewType;
  onNavigate: (view: ViewType) => void;
  isAdminUnlocked: boolean;
  onAdminClick: () => void;
  dataStatus: string;
  isMobileOpen: boolean;
  onMobileClose: () => void;
  onOpenMobileConnect?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onNavigate,
  isAdminUnlocked,
  onAdminClick,
  dataStatus,
  isMobileOpen,
  onMobileClose,
  onOpenMobileConnect
}) => {
  const navItems = [
    { id: 'overview' as ViewType, label: 'Overview Ringkasan', icon: PieChart },
    { id: 'schedule' as ViewType, label: 'Weekly Schedule', icon: CalendarDays },
    { id: 'staff-overview' as ViewType, label: 'Staff Overview', icon: Contact },
    { id: 'proof-upload' as ViewType, label: 'Upload Bukti / SS', icon: CloudUpload },
    { id: 'cashier' as ViewType, label: 'Monitor Kasir', icon: Receipt },
    { id: 'links' as ViewType, label: 'Link Operasional', icon: Link2 }
  ];

  return (
    <>
      {/* Mobile backdrop */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 lg:hidden"
          onClick={onMobileClose}
        />
      )}

      <aside
        className={`fixed lg:static top-0 bottom-0 left-0 w-64 liquid-glass-sidebar text-zinc-300 flex flex-col justify-between shrink-0 z-40 transition-transform duration-200 ease-in-out ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div>
          {/* Header Logo */}
          <div className="p-5 border-b border-white/10 flex items-center justify-between">
            <AppLogo size="md" showText={true} />
            <div className="flex items-center space-x-1">
              <span className="text-[9px] font-semibold tracking-wider text-zinc-400 uppercase bg-white/10 backdrop-blur-md px-2 py-0.5 rounded-full border border-white/15">
                PRO
              </span>
              <button
                onClick={onMobileClose}
                className="lg:hidden p-1 text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Navigation Links with Apple Frosted Glass Pills */}
          <nav className="p-3 space-y-1.5 text-xs font-medium">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onNavigate(item.id);
                    onMobileClose();
                  }}
                  className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-2xl transition duration-200 ${
                    isActive
                      ? 'bg-white/15 text-white shadow-[0_4px_16px_rgba(0,0,0,0.3),inset_0_1px_1px_rgba(255,255,255,0.25)] border border-white/20 font-semibold backdrop-blur-md'
                      : 'hover:bg-white/10 hover:text-white text-zinc-400 border border-transparent'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-blue-400' : 'text-zinc-400'}`} />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}

            {/* Buka di HP (Scan QR Code) */}
            {onOpenMobileConnect && (
              <button
                onClick={() => {
                  onOpenMobileConnect();
                  onMobileClose();
                }}
                className="w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-2xl transition duration-200 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 font-medium cursor-pointer"
              >
                <Smartphone className="w-4 h-4 shrink-0 text-blue-400" />
                <span className="truncate">Buka di HP (Scan QR)</span>
              </button>
            )}

            {/* Admin Area Button */}
            <div className="pt-3 border-t border-white/10 my-2">
              <button
                onClick={() => {
                  onAdminClick();
                  onMobileClose();
                }}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl transition duration-200 ${
                  currentView === 'admin'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-400/30 shadow-[0_4px_16px_rgba(245,158,11,0.15)] font-semibold'
                    : 'text-amber-400/90 hover:bg-white/10 border border-transparent'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <ShieldCheck className="w-4 h-4 shrink-0 text-amber-400" />
                  <span className="font-semibold truncate">Area Admin</span>
                </div>
                {isAdminUnlocked ? (
                  <Unlock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                ) : (
                  <Lock className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                )}
              </button>
            </div>
          </nav>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 text-[11px] text-zinc-400 bg-black/20 backdrop-blur-md">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-zinc-400">Status Data:</span>
            <span className="px-2.5 py-0.5 rounded-full bg-white/10 border border-white/15 text-zinc-200 font-mono text-[10px] truncate max-w-[130px] backdrop-blur-xs">
              {dataStatus}
            </span>
          </div>
          <div className="text-[10px] text-zinc-400 pt-2 border-t border-white/10 flex items-center justify-between">
            <span>Digimap Toko</span>
            <span className="font-mono font-medium text-zinc-200">Febiristian 2026</span>
          </div>
        </div>
      </aside>
    </>
  );
};
