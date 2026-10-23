import React, { useState, useEffect } from 'react';
import { Sparkles, Check, ArrowRight } from 'lucide-react';
import confetti from 'canvas-confetti';
import { storageSync } from '../services/storageSync';
import type { NoteColor } from '../types/pinboard';
import { playJoinSuccessSound, playPinPopSound } from '../services/soundEffects';

interface MobileJoinProps {
  onJoinSuccess: () => void;
}

const COLOR_OPTIONS: { id: NoteColor; label: string; hex: string; bg: string }[] = [
  { id: 'pink', label: 'Rose', hex: '#E11D48', bg: 'bg-rose-500' },
  { id: 'blue', label: 'Teal', hex: '#0D9488', bg: 'bg-teal-500' },
  { id: 'orange', label: 'Amber', hex: '#D97706', bg: 'bg-amber-500' },
  { id: 'green', label: 'Emerald', hex: '#10B981', bg: 'bg-emerald-500' },
  { id: 'yellow', label: 'Sun', hex: '#EAB308', bg: 'bg-yellow-500' },
];

export const MobileJoin: React.FC<MobileJoinProps> = ({ onJoinSuccess }) => {
  const [householdId, setHouseholdId] = useState<string>(() => storageSync.getState().householdId);
  const [otpCode, setOtpCode] = useState<string>('');
  const [displayName, setDisplayName] = useState<string>('');
  const [selectedColor, setSelectedColor] = useState<NoteColor>('orange');
  const [isMagicQrPrefilled, setIsMagicQrPrefilled] = useState<boolean>(false);
  const [status, setStatus] = useState<'IDLE' | 'SUBMITTING' | 'WAITING_APPROVAL' | 'SUCCESS'>('IDLE');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const [householdState, setHouseholdState] = useState(storageSync.getState());
  const isFirstAdmin = householdState.members.length === 0 || !householdState.isConfigured;

  // Extract query parameters from Magic QR URL: ?hh=...&code=... or ?householdId=...&otp=... (handles both search and hash query strings)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search);
      const hashQuery = window.location.hash.includes('?') ? window.location.hash.split('?')[1] : '';
      const hashParams = new URLSearchParams(hashQuery);

      const hhParam = searchParams.get('hh') || searchParams.get('householdId') || hashParams.get('hh') || hashParams.get('householdId');
      const codeParam = searchParams.get('code') || searchParams.get('otp') || hashParams.get('code') || hashParams.get('otp');

      if (hhParam) {
        setHouseholdId(hhParam);
      }
      if (codeParam) {
        setOtpCode(codeParam.replace(/\D/g, ''));
        setIsMagicQrPrefilled(true);
      }
    }
  }, []);

  useEffect(() => {
    const unsub = storageSync.subscribe((newState) => {
      setHouseholdState(newState);
    });
    return unsub;
  }, []);

  // Listen for TV approvals if pending
  useEffect(() => {
    const unsubscribe = storageSync.subscribe((state) => {
      const session = storageSync.getSession();
      if (session && status === 'WAITING_APPROVAL') {
        const myMember = state.members.find((m) => m.id === session.memberId);
        if (myMember && myMember.status === 'APPROVED') {
          setStatus('SUCCESS');
          playJoinSuccessSound();
          confetti({ particleCount: 75, spread: 80, origin: { y: 0.6 } });
          setTimeout(() => {
            onJoinSuccess();
          }, 1000);
        }
      }
    });
    return unsubscribe;
  }, [onJoinSuccess, status]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!displayName.trim()) {
      setErrorMessage('Please enter your name.');
      return;
    }

    if (otpCode.length !== 6) {
      setErrorMessage('Please enter the full 6-digit passkey shown on the TV.');
      return;
    }

    setStatus('SUBMITTING');
    playPinPopSound();

    try {
      const result = await storageSync.joinHousehold(
        householdId,
        otpCode,
        displayName.trim(),
        selectedColor
      );

      if (!result.success) {
        setStatus('IDLE');
        setErrorMessage(result.error || 'Failed to join household.');
        return;
      }

      if (result.status === 'APPROVED') {
        setStatus('SUCCESS');
        playJoinSuccessSound();
        confetti({ particleCount: 60, spread: 70, origin: { y: 0.6 } });
        setTimeout(() => {
          onJoinSuccess();
        }, 900);
      } else {
        setStatus('WAITING_APPROVAL');
      }
    } catch (err: any) {
      setStatus('IDLE');
      setErrorMessage(err.message || 'Connection error. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col justify-center px-4 py-8 max-w-md mx-auto">
      {/* Header */}
      <div className="text-center mb-8">
        <div className={`inline-flex p-3 rounded-2xl border mb-3 ${
          isFirstAdmin
            ? 'bg-amber-400/20 border-amber-400/40 text-amber-300'
            : 'bg-amber-400/10 border-amber-400/20 text-amber-400'
        }`}>
          <Sparkles className="w-8 h-8" />
        </div>
        <h1 className="text-3xl font-black tracking-tight text-white">
          {isFirstAdmin ? '👑 Set Up Household Admin' : 'Join Household Board'}
        </h1>
      </div>

      {/* Join Form Card */}
      <div className="bg-stone-900 border border-white/10 p-6 rounded-3xl shadow-2xl">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Display Name Input */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-stone-400 mb-2">
              Your Name / Nickname
            </label>
            <input
              type="text"
              placeholder="e.g., Mom, Alex, Maya, Sam"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full bg-stone-950 border border-white/15 rounded-xl px-4 py-3.5 text-lg font-bold text-white placeholder-stone-600 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
              autoFocus
            />
          </div>

          {/* Avatar Color Picker */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-stone-400 mb-2">
              Choose Your Pin Color
            </label>
            <div className="flex items-center justify-between gap-2">
              {COLOR_OPTIONS.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => {
                    playPinPopSound();
                    setSelectedColor(c.id);
                  }}
                  className={`flex-1 py-3 rounded-xl flex items-center justify-center transition-all ${c.bg} ${
                    selectedColor === c.id
                      ? 'ring-4 ring-white shadow-lg scale-105'
                      : 'opacity-70 hover:opacity-100'
                  }`}
                >
                  {selectedColor === c.id && <Check className="w-5 h-5 text-white" />}
                </button>
              ))}
            </div>
          </div>

          {/* 6-Digit Passkey Input */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold uppercase tracking-wider text-stone-400">
                TV 6-Digit Passkey
              </label>
              {isMagicQrPrefilled && (
                <span className="text-[11px] text-emerald-400 font-bold">Auto-filled</span>
              )}
            </div>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="482910"
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
              disabled={isMagicQrPrefilled}
              className={`w-full bg-stone-950 border rounded-xl px-4 py-3.5 text-2xl font-mono font-bold tracking-widest text-center text-amber-400 focus:outline-none focus:border-amber-400 ${
                isMagicQrPrefilled
                  ? 'border-emerald-500/40 bg-emerald-950/20'
                  : 'border-white/15'
              }`}
            />
          </div>

          {errorMessage && (
            <div className="p-3 bg-rose-950/70 border border-rose-500/40 rounded-xl text-rose-300 text-xs font-semibold">
              {errorMessage}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={status === 'SUBMITTING' || status === 'WAITING_APPROVAL'}
            className="w-full bg-amber-400 hover:bg-amber-300 text-stone-950 py-4 rounded-xl font-extrabold text-lg flex items-center justify-center space-x-2 shadow-xl transition-all cursor-pointer disabled:opacity-50"
          >
            {status === 'SUBMITTING' ? (
              <span>Connecting to TV...</span>
            ) : status === 'WAITING_APPROVAL' ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-stone-950 border-t-transparent rounded-full animate-spin"></span>
                Waiting for TV Remote Approval...
              </span>
            ) : (
              <>
                <span>{isFirstAdmin ? '👑 Claim Admin & Activate TV' : 'Join Household Board'}</span>
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
