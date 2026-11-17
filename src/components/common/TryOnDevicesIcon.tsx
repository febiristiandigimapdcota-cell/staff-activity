import React from 'react';

interface TryOnDevicesIconProps {
  className?: string;
}

/**
 * Minimalist Apple-style multi-device vector icon: iPad + iPhone + Apple Watch.
 */
export const TryOnDevicesIcon: React.FC<TryOnDevicesIconProps> = ({
  className = 'w-6 h-5'
}) => {
  return (
    <svg
      viewBox="0 0 36 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* iPad (Back Left) */}
      <rect
        x="1.5"
        y="3"
        width="13.5"
        height="18.5"
        rx="2.3"
        stroke="currentColor"
        strokeWidth="1.7"
        fill="currentColor"
        fillOpacity="0.08"
      />
      <circle cx="8.25" cy="4.7" r="0.55" fill="currentColor" />
      <line
        x1="6"
        y1="19.6"
        x2="10.5"
        y2="19.6"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />

      {/* iPhone (Center Overlap) */}
      <rect
        x="11.5"
        y="6.2"
        width="10"
        height="17.8"
        rx="2.2"
        fill="white"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <rect
        x="11.5"
        y="6.2"
        width="10"
        height="17.8"
        rx="2.2"
        fill="currentColor"
        fillOpacity="0.1"
      />
      {/* Dynamic Island */}
      <rect x="14.7" y="7.9" width="3.6" height="1.1" rx="0.55" fill="currentColor" />
      {/* Home indicator */}
      <line
        x1="14.5"
        y1="22.1"
        x2="18.5"
        y2="22.1"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
      />

      {/* Apple Watch (Right Front) */}
      {/* Top & Bottom Straps */}
      <path
        d="M25.2 4.2H29.6L30.2 7.2H24.6L25.2 4.2Z"
        fill="currentColor"
        fillOpacity="0.22"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path
        d="M24.6 19.6H30.2L29.6 22.6H25.2L24.6 19.6Z"
        fill="currentColor"
        fillOpacity="0.22"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      {/* Watch Case */}
      <rect
        x="23.1"
        y="7.2"
        width="8.6"
        height="12.4"
        rx="2.6"
        fill="white"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <rect
        x="23.1"
        y="7.2"
        width="8.6"
        height="12.4"
        rx="2.6"
        fill="currentColor"
        fillOpacity="0.1"
      />
      {/* Digital Crown */}
      <rect x="31.7" y="10.1" width="1.5" height="2.9" rx="0.7" fill="currentColor" />
      {/* Side Button */}
      <rect x="31.7" y="14.4" width="1.1" height="2.2" rx="0.5" fill="currentColor" />
      {/* Minimal Watch Ring */}
      <circle
        cx="27.4"
        cy="13.4"
        r="2.1"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
};
