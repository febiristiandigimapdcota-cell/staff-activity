import React from 'react';
import {
  LayoutDashboard,
  Camera,
  Calendar,
  Users,
  Store,
  QrCode
} from 'lucide-react';
import { ViewType } from '../../types';

interface MobileBottomNavProps {
  currentView: ViewType;
  onNavigate: (view: ViewType) => void;
  onOpenMobileConnect: () => void;
  photoCount?: number;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  currentView,
  onNavigate,
  onOpenMobileConnect,
  photoCount = 0
}) => {
  const navItems = [
    {
      id: 'overview' as ViewType,
      label: 'Ringkasan',
      icon: LayoutDashboard
    },
    {
      id: 'proof-upload' as ViewType,
      label: 'Upload SS',
      icon: Camera,
      isPrimary: true
    },
    {
      id: 'schedule' as ViewType,
      label: 'Roster',
      icon: Calendar
    },
    {
      id: 'staff-overview' as ViewType,
      label: 'Staf',
      icon: Users
    },
    {
      id: 'cashier' as ViewType,
      label: 'Kasir',
      icon: Store
    }
  ];

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/85 backdrop-blur-xl border-t border-zinc-200/80 shadow-[0_-4px_24px_rgba(0,0,0,0.06)] px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      aria-label="Mobile Navigation"
    >
      <div className="flex items-center justify-around max-w-lg mx-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;

          if (item.isPrimary) {
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className="flex flex-col items-center justify-center -mt-4 relative group cursor-pointer focus:outline-none"
              >
                <div
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-200 shadow-md ${
                    isActive
                      ? 'bg-blue-600 text-white ring-4 ring-blue-500/30 scale-105'
                      : 'bg-zinc-950 text-white hover:bg-zinc-800'
                  }`}
                >
                  <Icon className="w-5 h-5 text-emerald-300" />
                  {photoCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center ring-2 ring-white">
                      {photoCount > 99 ? '99+' : photoCount}
                    </span>
                  )}
                </div>
                <span
                  className={`text-[10px] mt-1 font-semibold tracking-tight transition ${
                    isActive ? 'text-blue-600 font-bold' : 'text-zinc-600'
                  }`}
                >
                  {item.label}
                </span>
              </button>
            );
          }

          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`flex-1 py-1 px-2 flex flex-col items-center justify-center rounded-xl transition cursor-pointer focus:outline-none ${
                isActive
                  ? 'text-blue-600 font-bold'
                  : 'text-zinc-500 hover:text-zinc-900 font-medium'
              }`}
            >
              <div className="relative">
                <Icon className={`w-4 h-4 transition ${isActive ? 'scale-110 text-blue-600' : ''}`} />
                {isActive && (
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-blue-600 shadow-xs" />
                )}
              </div>
              <span className="text-[10px] mt-1 truncate max-w-[64px]">
                {item.label}
              </span>
            </button>
          );
        })}

        {/* Quick QR Connect Button */}
        <button
          onClick={onOpenMobileConnect}
          className="flex-1 py-1 px-2 flex flex-col items-center justify-center text-zinc-500 hover:text-zinc-900 rounded-xl transition cursor-pointer focus:outline-none"
          title="Buka QR Code untuk HP lain"
        >
          <QrCode className="w-4 h-4 text-zinc-500" />
          <span className="text-[10px] mt-1 truncate">
            Share
          </span>
        </button>
      </div>
    </nav>
  );
};
