import React from 'react';
import type { MagnetStyle } from '../types/pinboard';

interface PinGraphicProps {
  magnet?: MagnetStyle;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const PinGraphic: React.FC<PinGraphicProps> = ({
  magnet = 'red-dot',
  size = 'md',
  className = '',
}) => {
  if (magnet === 'washi-tape') {
    const tapeWidth = size === 'lg' ? 'w-24 h-6 -mt-3' : size === 'sm' ? 'w-14 h-4 -mt-2' : 'w-18 h-5 -mt-2.5';
    return (
      <div className={`relative flex items-center justify-center select-none pointer-events-none z-10 ${className}`}>
        <div
          className={`${tapeWidth} bg-amber-200/85 backdrop-blur-[1px] shadow-sm rotate-[-1.5deg] border-y border-amber-300/40`}
          style={{
            clipPath: 'polygon(3% 0%, 100% 0%, 97% 100%, 0% 100%)',
            backgroundImage:
              'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(217, 119, 6, 0.25) 4px, rgba(217, 119, 6, 0.25) 7px)',
          }}
        />
      </div>
    );
  }

  if (magnet === 'blue-star') {
    const starSize = size === 'lg' ? 'w-8 h-8' : size === 'sm' ? 'w-4 h-4' : 'w-6 h-6';
    return (
      <div className={`relative flex items-center justify-center select-none pointer-events-none z-10 ${className}`}>
        {/* Soft shadow */}
        <div className="absolute top-1 w-4 h-4 bg-black/25 rounded-full blur-[2px]" />
        <svg
          viewBox="0 0 24 24"
          className={`${starSize} drop-shadow-md transition-transform hover:scale-105`}
        >
          <defs>
            <linearGradient id="blueStarGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#38BDF8" />
              <stop offset="50%" stopColor="#2563EB" />
              <stop offset="100%" stopColor="#1E3A8A" />
            </linearGradient>
            <filter id="starShadow" x="-10%" y="-10%" width="130%" height="130%">
              <feDropShadow dx="0" dy="1.5" stdDeviation="1" floodColor="#000" floodOpacity="0.3" />
            </filter>
          </defs>
          <polygon
            points="12,1.5 15.3,8.5 23,9.5 17.5,14.8 19,22.5 12,18.8 5,22.5 6.5,14.8 1,9.5 8.7,8.5"
            fill="url(#blueStarGrad)"
            stroke="#1D4ED8"
            strokeWidth="0.75"
            filter="url(#starShadow)"
          />
          {/* Subtle star highlight facet */}
          <polygon
            points="12,3 14.5,8.8 20,9.6 15.8,13.6 12,11.5"
            fill="rgba(255,255,255,0.45)"
          />
        </svg>
      </div>
    );
  }

  if (magnet === 'brass-pin') {
    const headSize = size === 'lg' ? 'w-7 h-7' : size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';
    const innerSize = size === 'lg' ? 'w-4 h-4' : size === 'sm' ? 'w-2 h-2' : 'w-3 h-3';
    return (
      <div className={`relative flex items-center justify-center select-none pointer-events-none z-10 ${className}`}>
        {/* Needle shadow sticking into corkboard */}
        <div className="absolute top-1.5 left-1/2 -translate-x-1/2 w-4 h-4 bg-black/35 rounded-full blur-[1.5px]" />
        {/* Brass outer rim with metallic gradient */}
        <div
          className={`${headSize} rounded-full bg-gradient-to-br from-amber-100 via-amber-400 to-amber-700 p-[1.5px] shadow-[0_3px_6px_rgba(0,0,0,0.35)] border border-amber-600/80 flex items-center justify-center relative`}
        >
          {/* Inner metallic dome with specular glint */}
          <div
            className={`${innerSize} rounded-full bg-gradient-to-tr from-amber-600 via-amber-300 to-amber-100 shadow-inner flex items-center justify-center`}
          >
            <div className="w-1 h-1 rounded-full bg-white/90 shadow-sm" />
          </div>
        </div>
      </div>
    );
  }

  // Default: 'red-dot' (3D Glossy Dome Magnet)
  const dotSize = size === 'lg' ? 'w-7 h-7' : size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';
  return (
    <div className={`relative flex items-center justify-center select-none pointer-events-none z-10 ${className}`}>
      {/* Magnet drop shadow */}
      <div className="absolute top-1 left-1/2 -translate-x-1/2 w-4 h-4 bg-black/35 rounded-full blur-[1.5px]" />
      {/* 3D Glossy dome */}
      <div
        className={`${dotSize} rounded-full bg-gradient-to-br from-rose-500 via-red-600 to-rose-950 shadow-[0_3px_6px_rgba(0,0,0,0.35)] border border-red-500/80 relative overflow-hidden flex items-center justify-center`}
      >
        {/* Top-left specular bubble glare */}
        <div className="absolute top-0.5 left-1 w-2.5 h-1.5 rounded-full bg-white/60 blur-[0.3px]" />
        {/* Bottom subtle rim reflection */}
        <div className="absolute bottom-0.5 right-1 w-2 h-1 rounded-full bg-red-400/30" />
      </div>
    </div>
  );
};
