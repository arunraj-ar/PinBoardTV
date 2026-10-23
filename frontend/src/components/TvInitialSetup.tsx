import React, { useState, useEffect, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  Sparkles,
  Mic,
  Edit3,
  ShieldCheck,
  Smartphone,
  CheckCircle,
  Tv,
  ArrowRight,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { storageSync } from '../services/storageSync';
import { playPinPopSound, playDpadNavSound, playJoinSuccessSound } from '../services/soundEffects';
import { HouseholdNameModal } from './HouseholdNameModal';
import type { HouseholdState } from '../types/pinboard';

interface TvInitialSetupProps {
  onSetupComplete: () => void;
}

export const TvInitialSetup: React.FC<TvInitialSetupProps> = ({ onSetupComplete }) => {
  const [state, setState] = useState<HouseholdState>(storageSync.getState());
  const [showNameModal, setShowNameModal] = useState<boolean>(false);
  const [focusIndex, setFocusIndex] = useState<number>(0);
  // Focus items:
  // 0: [ ✏️ Change Household Name ]
  // 1: [ 🎙️ Speak Name with Remote ]
  // 2: [ 🚀 Skip / Go to Board ] (if desired, or dev shortcut)

  const [connectedAdminName, setConnectedAdminName] = useState<string | null>(null);

  // Subscribe to storageSync for updates (e.g. admin joined via mobile)
  useEffect(() => {
    const initialCount = storageSync.getState().members.length;

    const unsubscribe = storageSync.subscribe((newState, event) => {
      setState(newState);

      // Check if first member / admin joined
      if (
        newState.members &&
        newState.members.length > 0 &&
        (newState.members.length > initialCount || event?.type === 'MEMBER_JOIN_REQUESTED')
      ) {
        const adminMember = newState.members[newState.members.length - 1];
        setConnectedAdminName(adminMember.name);
        playJoinSuccessSound();
        confetti({
          particleCount: 80,
          spread: 90,
          origin: { y: 0.5 },
        });

        // Transition to live board after brief celebratory animation
        const timer = setTimeout(() => {
          storageSync.setIsConfigured(true);
          onSetupComplete();
        }, 2200);

        return () => clearTimeout(timer);
      }
    });

    return () => unsubscribe();
  }, [onSetupComplete]);

  // Auto-refresh OTP if sitting on setup screen and passkey is expiring (or already expired)
  useEffect(() => {
    const checkOtpExpiry = () => {
      const current = storageSync.getState();
      if (!current.isConfigured && (!current.currentOtp || !current.otpExpiresAt || Date.now() >= current.otpExpiresAt - 30000)) {
        storageSync.rotateOtp();
      }
    };

    checkOtpExpiry();
    const interval = setInterval(checkOtpExpiry, 15000);
    return () => clearInterval(interval);
  }, []);

  // Magic QR pairing URL
  const magicQrUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/join?hh=${encodeURIComponent(state.householdId)}&code=${encodeURIComponent(state.currentOtp)}`
    : `https://pinboardtv.local/join?hh=${state.householdId}&code=${state.currentOtp}`;

  // Remote D-Pad Navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // If modal is open, let modal handle keys
      if (showNameModal) return;

      if (e.key === 'v' || e.key === 'V') {
        e.preventDefault();
        playPinPopSound();
        setShowNameModal(true);
        return;
      }

      const maxFocus = state.members.length > 0 ? 2 : 1;

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        playDpadNavSound();
        setFocusIndex((prev) => (prev < maxFocus ? prev + 1 : 0));
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        playDpadNavSound();
        setFocusIndex((prev) => (prev > 0 ? prev - 1 : maxFocus));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        playPinPopSound();
        if (focusIndex === 0 || focusIndex === 1) {
          setShowNameModal(true);
        } else if (focusIndex === 2) {
          storageSync.setIsConfigured(true);
          onSetupComplete();
        }
      }
    },
    [showNameModal, focusIndex, state.members.length, onSetupComplete]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleSaveHouseholdName = (newName: string) => {
    storageSync.setHouseholdName(newName);
    setState(storageSync.getState());
  };

  return (
    <main
      id="tv-initial-setup-page"
      aria-label="Household Initial Setup Landing Page"
      className="relative w-screen h-screen overflow-hidden bg-gradient-to-br from-stone-950 via-stone-900 to-amber-950 text-stone-100 flex flex-col justify-between p-12 select-none"
    >
      {/* Background ambient glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[700px] h-[700px] bg-amber-500/10 rounded-full blur-[140px] pointer-events-none" />

      {/* Top Header: TV Brand & Household Name configuration */}
      <header className="relative z-10 flex items-center justify-between border-b border-white/10 pb-6">
        <div className="flex items-center space-x-4">
          <div className="w-14 h-14 rounded-2xl bg-amber-400 text-stone-950 flex items-center justify-center shadow-lg font-black text-2xl">
            <Tv className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-black uppercase tracking-widest text-amber-400 bg-amber-400/15 border border-amber-400/30 px-3 py-1 rounded-full">
                Step 1 of 1 • New Household Setup
              </span>
            </div>
            <h1 className="text-3xl font-black text-white tracking-tight mt-1 flex items-center gap-3">
              <span>{state.householdName}</span>
            </h1>
          </div>
        </div>

        {/* Action Buttons to Set / Change Household Name from TV */}
        <div className="flex items-center space-x-4">
          <button
            onClick={() => {
              playPinPopSound();
              setShowNameModal(true);
            }}
            className={`px-5 py-3 rounded-2xl font-black text-base flex items-center gap-2.5 transition-all cursor-pointer shadow-lg ${
              focusIndex === 0
                ? 'bg-amber-400 text-stone-950 scale-105 ring-4 ring-amber-300 ring-offset-4 ring-offset-stone-950'
                : 'bg-stone-800/90 text-stone-200 hover:bg-stone-700 border border-white/10'
            }`}
          >
            <Edit3 className="w-5 h-5" />
            <span>Rename Household</span>
          </button>

          <button
            onClick={() => {
              playPinPopSound();
              setShowNameModal(true);
            }}
            className={`px-5 py-3 rounded-2xl font-black text-base flex items-center gap-2.5 transition-all cursor-pointer shadow-lg ${
              focusIndex === 1
                ? 'bg-purple-500 text-white scale-105 ring-4 ring-purple-400 ring-offset-4 ring-offset-stone-950'
                : 'bg-stone-800/90 text-purple-300 hover:bg-stone-700 border border-purple-500/30'
            }`}
          >
            <Mic className="w-5 h-5" />
            <span>Speak Name (Remote)</span>
          </button>

          {state.members.length > 0 && (
            <button
              onClick={() => {
                playPinPopSound();
                storageSync.setIsConfigured(true);
                onSetupComplete();
              }}
              className={`px-5 py-3 rounded-2xl font-black text-base flex items-center gap-2.5 transition-all cursor-pointer shadow-lg ${
                focusIndex === 2
                  ? 'bg-emerald-400 text-stone-950 scale-105 ring-4 ring-emerald-300 ring-offset-4 ring-offset-stone-950'
                  : 'bg-stone-800/90 text-emerald-300 hover:bg-stone-700 border border-emerald-500/30'
              }`}
            >
              <ArrowRight className="w-5 h-5" />
              <span>Go to Board</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Center Stage: Giant QR Code Landing Page */}
      <div className="relative z-10 flex-1 flex flex-row items-center justify-center gap-16 py-6">
        {/* Left Side: Step Instructions */}
        <div className="flex-1 max-w-xl space-y-6">
          <div className="inline-flex items-center space-x-2 bg-amber-400/20 text-amber-300 border border-amber-400/40 px-4 py-1.5 rounded-full text-sm font-black uppercase tracking-wider">
            <Sparkles className="w-4 h-4 text-amber-300" />
            <span>Zero Typing Setup</span>
          </div>

          <h2 className="text-5xl font-black text-white tracking-tight leading-tight">
            Scan to Create Your Household
          </h2>

          <p className="text-xl text-stone-300 leading-relaxed font-medium">
            Scan the QR code with your phone camera. You will automatically become the{' '}
            <span className="text-amber-400 font-bold">Household Admin</span> with full control over notes, lists, and members.
          </p>

          <div className="space-y-4 pt-2">
            <div className="flex items-center space-x-4 bg-stone-900/80 border border-white/10 p-4 rounded-2xl">
              <div className="w-10 h-10 rounded-xl bg-amber-400/20 text-amber-400 flex items-center justify-center font-black">
                1
              </div>
              <div className="text-base text-stone-200">
                Open camera app on your iPhone or Android
              </div>
            </div>

            <div className="flex items-center space-x-4 bg-stone-900/80 border border-white/10 p-4 rounded-2xl">
              <div className="w-10 h-10 rounded-xl bg-amber-400/20 text-amber-400 flex items-center justify-center font-black">
                2
              </div>
              <div className="text-base text-stone-200">
                Point at the QR code and tap the link
              </div>
            </div>

            <div className="flex items-center space-x-4 bg-stone-900/80 border border-white/10 p-4 rounded-2xl">
              <div className="w-10 h-10 rounded-xl bg-amber-400/20 text-amber-400 flex items-center justify-center font-black">
                3
              </div>
              <div className="text-base text-stone-200">
                Enter your name to activate the TV PinBoard
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Giant QR Code Card */}
        <div className="flex flex-col items-center justify-center">
          <div className="relative bg-white p-7 rounded-3xl shadow-[0_0_90px_rgba(245,158,11,0.3)] border-4 border-amber-400 transition-transform">
            <QRCodeSVG value={magicQrUrl} size={360} level="M" />
            <div className="absolute -top-3.5 -right-3.5 bg-amber-500 text-stone-950 px-3.5 py-1 rounded-full text-xs font-black uppercase tracking-wider shadow-lg flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Admin Key</span>
            </div>
          </div>

          {/* Passkey Display */}
          <div className="mt-5 text-center">
            <span className="text-xs font-bold text-stone-400 uppercase tracking-widest block mb-1">
              Manual 6-Digit Passkey
            </span>
            <div className="text-5xl font-mono font-black text-amber-400 tracking-widest drop-shadow-md">
              {state.currentOtp.slice(0, 3)} - {state.currentOtp.slice(3)}
            </div>
          </div>
        </div>
      </div>

      {/* Footer Bar: Remote Navigation Hint & Admin Success Overlay */}
      <footer className="relative z-10 flex items-center justify-between border-t border-white/10 pt-4 text-sm text-stone-400 font-medium">
        <div className="flex items-center space-x-6">
          <span className="flex items-center gap-2">
            <span className="bg-stone-800 text-stone-200 px-2 py-0.5 rounded text-xs font-mono font-bold">◄ ►</span>
            Navigate
          </span>
          <span className="flex items-center gap-2">
            <span className="bg-stone-800 text-stone-200 px-2 py-0.5 rounded text-xs font-mono font-bold">OK</span>
            Select
          </span>
          <span className="flex items-center gap-2">
            <span className="bg-purple-900 text-purple-200 px-2 py-0.5 rounded text-xs font-mono font-bold">V</span>
            Voice Input
          </span>
        </div>

        <div className="flex items-center space-x-2 text-stone-300">
          <Smartphone className="w-4 h-4 text-amber-400" />
          <span>Works on all phone browsers • Same Wi-Fi auto-verified</span>
        </div>
      </footer>

      {/* Connected Admin Celebration Overlay */}
      {connectedAdminName && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex flex-col items-center justify-center p-8 animate-in fade-in zoom-in-95 duration-300">
          <div className="w-24 h-24 rounded-full bg-emerald-500/20 border-4 border-emerald-400 text-emerald-400 flex items-center justify-center mb-6 shadow-2xl">
            <CheckCircle className="w-14 h-14" />
          </div>
          <span className="text-base font-black uppercase tracking-widest text-emerald-400 bg-emerald-400/10 border border-emerald-400/30 px-4 py-1 rounded-full mb-3">
            Admin Activated
          </span>
          <h2 className="text-5xl font-black text-white text-center mb-2">
            Welcome, {connectedAdminName}!
          </h2>
          <p className="text-xl text-stone-300 text-center max-w-lg mb-8">
            Your phone is now connected as the primary household admin. Launching your PinBoard...
          </p>
          <div className="flex items-center space-x-2 text-amber-400 font-black text-lg">
            <span>Loading PinBoard</span>
            <ArrowRight className="w-5 h-5 animate-pulse" />
          </div>
        </div>
      )}

      {/* Household Name Change Modal */}
      <HouseholdNameModal
        isOpen={showNameModal}
        currentName={state.householdName}
        onSave={handleSaveHouseholdName}
        onClose={() => setShowNameModal(false)}
      />
    </main>
  );
};
