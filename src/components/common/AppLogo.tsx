import React from 'react';

interface AppLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  className?: string;
  subtext?: string;
}

export const AppLogo: React.FC<AppLogoProps> = ({
  size = 'md',
  showText = false,
  className = '',
  subtext = 'Store Operations'
}) => {
  const sizeMap = {
    xs: { box: 'w-6 h-6', img: 'w-6 h-6', text: 'text-xs', sub: 'text-[9px]' },
    sm: { box: 'w-8 h-8', img: 'w-8 h-8', text: 'text-xs', sub: 'text-[10px]' },
    md: { box: 'w-10 h-10', img: 'w-10 h-10', text: 'text-sm', sub: 'text-[10px]' },
    lg: { box: 'w-12 h-12', img: 'w-12 h-12', text: 'text-base', sub: 'text-xs' },
    xl: { box: 'w-16 h-16', img: 'w-16 h-16', text: 'text-lg', sub: 'text-xs' }
  };

  const currentSize = sizeMap[size] || sizeMap.md;

  return (
    <div className={`flex items-center space-x-3 ${className}`}>
      {/* 3D Apple Liquid Glass Logo Icon */}
      <div className="relative group shrink-0">
        {/* Ambient Glow */}
        <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-blue-500/30 to-emerald-500/30 blur-md opacity-70 group-hover:opacity-100 transition duration-300 pointer-events-none" />

        <div className={`${currentSize.box} relative rounded-2xl overflow-hidden shadow-lg border border-white/30 bg-zinc-950 flex items-center justify-center`}>
          <img
            src="/app-logo.png"
            alt="Staff Activity Negative Space Logo"
            className={`${currentSize.img} object-cover transform group-hover:scale-105 transition duration-300`}
            loading="eager"
          />
        </div>

        {/* Live Operational Pulse Dot */}
        <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 border border-zinc-900"></span>
        </span>
      </div>

      {/* Brand Typography */}
      {showText && (
        <div className="min-w-0">
          <h1 className={`font-black tracking-wider text-white uppercase font-mono ${currentSize.text} leading-tight truncate`}>
            STAFF ACTIVITY
          </h1>
        </div>
      )}
    </div>
  );
};
