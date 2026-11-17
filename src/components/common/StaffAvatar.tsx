import React from 'react';

interface StaffAvatarProps {
  name: string;
  photoUrl?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  onClick?: () => void;
}

const SIZE_CLASSES: Record<NonNullable<StaffAvatarProps['size']>, string> = {
  xs: 'w-6 h-6 text-[9px] rounded-lg',
  sm: 'w-8 h-8 text-[10px] rounded-xl',
  md: 'w-10 h-10 text-xs rounded-2xl',
  lg: 'w-12 h-12 text-sm rounded-2xl',
  xl: 'w-16 h-16 text-base rounded-2xl'
};

export const StaffAvatar: React.FC<StaffAvatarProps> = ({
  name,
  photoUrl,
  size = 'sm',
  className = '',
  onClick
}) => {
  const cleanName = (name || 'ST').trim();
  const initials = cleanName
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'ST';

  const sizeCls = SIZE_CLASSES[size];
  const interactiveCls = onClick ? 'cursor-pointer hover:ring-2 hover:ring-blue-400 transition' : '';

  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={cleanName}
        onClick={onClick}
        className={`${sizeCls} object-cover object-top shrink-0 border border-zinc-200/80 shadow-xs bg-zinc-100 ${interactiveCls} ${className}`}
      />
    );
  }

  return (
    <div
      onClick={onClick}
      className={`${sizeCls} bg-zinc-900 text-white font-mono font-bold flex items-center justify-center shrink-0 border border-white/20 shadow-xs select-none ${interactiveCls} ${className}`}
    >
      {initials}
    </div>
  );
};
