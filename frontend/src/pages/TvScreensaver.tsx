import React, { useEffect, useState } from 'react';
import { Tv, LogOut } from 'lucide-react';
import { storageSync } from '../services/storageSync';
import type { HouseholdState } from '../types/pinboard';
import { playPinPopSound, playDpadNavSound } from '../services/soundEffects';
import { NoteCard } from '../components/NoteCard';
import { organizeNotesIntoPages } from '../services/aiNoteOrganizer';
import { voiceService } from '../services/voiceService';

interface TvScreensaverProps {
  onOpenApp: () => void;
}

export const TvScreensaver: React.FC<TvScreensaverProps> = ({ onOpenApp }) => {
  const [state, setState] = useState<HouseholdState>(storageSync.getHouseholdState());
  const [isButtonFocused, setIsButtonFocused] = useState<boolean>(false);
  const [showExitDialog, setShowExitDialog] = useState<boolean>(false);
  const [exitDialogFocusIndex, setExitDialogFocusIndex] = useState<number>(0); // 0: Cancel, 1: Exit App
  const [currentPage, setCurrentPage] = useState<number>(0);
  const [jitterOffset, setJitterOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Listen for storage changes and wake events (Alexa, mobile sync, note created)
  useEffect(() => {
    const unsubscribe = storageSync.subscribe((newState, event) => {
      setState(newState);
      if (event && (event.type === 'WAKE_BOARD' || event.type === 'NOTE_CREATED')) {
        onOpenApp();
      }
    });
    return unsubscribe;
  }, [onOpenApp]);

  // Listen for direct native wake triggers
  useEffect(() => {
    const handleWake = () => {
      onOpenApp();
    };
    window.addEventListener('pinboard:wake', handleWake);
    return () => window.removeEventListener('pinboard:wake', handleWake);
  }, [onOpenApp]);

  // Continuous anti-burn-in coordinate shift: gently shifts layout anchor every 20 seconds
  useEffect(() => {
    const jitterInterval = setInterval(() => {
      const angles = [0, 45, 90, 135, 180, 225, 270, 315];
      const angle = angles[Math.floor(Math.random() * angles.length)] * (Math.PI / 180);
      const distance = 6 + Math.random() * 8;
      setJitterOffset({
        x: Math.round(Math.cos(angle) * distance),
        y: Math.round(Math.sin(angle) * distance),
      });
    }, 20000);
    return () => clearInterval(jitterInterval);
  }, []);

  // AI Heterogeneous note pagination (15 pins per page, guaranteed diversity)
  const pages = organizeNotesIntoPages(state.notes, 15);
  const totalPages = Math.max(1, pages.length);
  const cols = totalPages > 1 || state.notes.length > 8 ? 5 : 4;
  const isCompact = cols === 5;

  // 30-Second Automatic Slideshow loop between pages
  useEffect(() => {
    if (totalPages <= 1) return;
    const interval = setInterval(() => {
      setCurrentPage((prev) => (prev + 1) % totalPages);
    }, 30000); // exactly 30s as requested
    return () => clearInterval(interval);
  }, [totalPages]);

  // Remote key navigation:
  // - Back (Escape / Backspace / KeyCode 4): Prompt Exit Confirmation Dialog
  // - ArrowDown/ArrowUp: Highlights the bottom Launch button
  // - ArrowLeft/ArrowRight: Cycles through slides manually
  // - OK/Enter: Activates focused action
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. Exit Confirmation Dialog Navigation
      if (showExitDialog) {
        if (e.key === 'Escape' || e.key === 'Backspace' || e.keyCode === 27 || e.keyCode === 4) {
          e.preventDefault();
          playPinPopSound();
          setShowExitDialog(false);
          return;
        }

        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          playDpadNavSound();
          setExitDialogFocusIndex(0);
        } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          playDpadNavSound();
          setExitDialogFocusIndex(1);
        } else if (e.key === 'Enter' || e.key === 'Select' || e.keyCode === 13) {
          e.preventDefault();
          playPinPopSound();
          if (exitDialogFocusIndex === 0) {
            setShowExitDialog(false);
          } else {
            voiceService.exitApp();
          }
        }
        return;
      }

      // 2. Fire TV Remote Back button -> Prompt exit confirmation
      if (e.key === 'Escape' || e.key === 'Backspace' || e.keyCode === 27 || e.keyCode === 4) {
        e.preventDefault();
        playPinPopSound();
        setShowExitDialog(true);
        setExitDialogFocusIndex(0);
        return;
      }

      // 3. Screensaver Ambient Navigation
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        playDpadNavSound();
        setIsButtonFocused(true);
      } else if (e.key === 'ArrowUp') {
        if (isButtonFocused) {
          e.preventDefault();
          playDpadNavSound();
          setIsButtonFocused(false);
        }
      } else if (e.key === 'ArrowRight') {
        if (totalPages > 1) {
          e.preventDefault();
          playDpadNavSound();
          setCurrentPage((prev) => (prev + 1) % totalPages);
        }
      } else if (e.key === 'ArrowLeft') {
        if (totalPages > 1) {
          e.preventDefault();
          playDpadNavSound();
          setCurrentPage((prev) => (prev - 1 + totalPages) % totalPages);
        }
      } else if (e.key === 'Enter' || e.key === 'Select' || e.keyCode === 13) {
        e.preventDefault();
        playPinPopSound();
        onOpenApp();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onOpenApp, totalPages, isButtonFocused, showExitDialog, exitDialogFocusIndex]);

  return (
    <div
      className={`relative w-screen h-screen overflow-hidden select-none animate-pixel-shift flex flex-col justify-between ${
        state.theme === 'slate' ? 'slateboard-canvas' : 'corkboard-canvas'
      } vignette-overlay`}
      style={{
        transform: `translate3d(${jitterOffset.x}px, ${jitterOffset.y}px, 0)`,
        transition: 'transform 3.5s cubic-bezier(0.25, 1, 0.5, 1)',
      }}
    >
      {/* Exact Same Pinboard Canvas as Main App (Avoiding the Title Bar) with Anti-Burn-In Floating Cards */}
      <main className="flex-1 pt-8 pb-2 flex flex-col justify-center w-full overflow-hidden relative">
        <div
          className="flex transition-transform duration-700 ease-in-out h-[82vh] w-full"
          style={{ transform: `translateX(-${currentPage * 100}%)` }}
        >
          {pages.map((pageNotes, pIdx) => (
            <div
              key={`screensaver_page_${pIdx}`}
              className="w-full h-full shrink-0 px-8 grid gap-3.5"
              style={{
                gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${cols === 5 ? 3 : 2}, minmax(0, 1fr))`,
              }}
            >
              {pageNotes.map((note, cardIdx) => (
                <div
                  key={note.id}
                  className="screensaver-card-drift h-full w-full"
                  style={{
                    animationDelay: `${(cardIdx % 5) * 1.6}s`,
                  }}
                >
                  <NoteCard
                    note={note}
                    density={isCompact ? 'compact' : 'spacious'}
                    interactive={false}
                    isFocused={false}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      </main>

      {/* Bottom Floating Ambient Launch Button & Slide Progress */}
      <footer className="w-full pb-6 pt-1 flex flex-col items-center justify-center shrink-0 z-20 space-y-2.5">
        {totalPages > 1 && (
          <div className="flex items-center space-x-2.5 bg-black/55 backdrop-blur-md px-4 py-1 rounded-full border border-white/15 text-xs font-bold text-stone-300 shadow-md">
            <span className="text-amber-300">
              Slide {currentPage + 1} of {totalPages}
            </span>
            <div className="flex items-center space-x-1.5 pl-2 border-l border-white/20">
              {pages.map((_, dotIdx) => (
                <span
                  key={dotIdx}
                  className={`rounded-full transition-all duration-300 ${
                    dotIdx === currentPage
                      ? 'w-4 h-1.5 bg-amber-400'
                      : 'w-1.5 h-1.5 bg-white/30'
                  }`}
                />
              ))}
            </div>
          </div>
        )}

        <button
          onClick={() => {
            playPinPopSound();
            onOpenApp();
          }}
          data-focused={isButtonFocused}
          className={`tv-focus-target group flex items-center space-x-3 px-8 py-3.5 rounded-2xl font-bold text-xl transition-all cursor-pointer border-2 ${
            isButtonFocused
              ? 'ring-4 ring-amber-400 bg-amber-400 text-stone-950 font-black scale-105 shadow-[0_0_35px_rgba(251,191,36,0.6)] border-amber-300'
              : 'bg-stone-950/80 backdrop-blur-md text-stone-200 hover:text-white hover:bg-stone-900 border-white/20 shadow-2xl'
          }`}
          title="Launch PinBoard TV"
        >
          <Tv className="w-6 h-6 group-hover:scale-110 transition-transform text-current" />
          <span>Launch PinBoard TV</span>
        </button>
      </footer>

      {/* 10-FOOT CONFIRMATION MODAL: Exit PinBoard TV */}
      {showExitDialog && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-8 animate-in fade-in duration-200"
          onClick={() => setShowExitDialog(false)}
        >
          <div
            className="bg-stone-900 border-4 border-amber-400/80 rounded-3xl p-10 max-w-xl w-full text-center shadow-[0_0_80px_rgba(251,191,36,0.3)] animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-amber-400/20 border-2 border-amber-400 flex items-center justify-center text-amber-300">
              <LogOut className="w-10 h-10" />
            </div>

            <h3 className="text-3xl font-black text-white mb-3">
              Exit PinBoard TV?
            </h3>

            <p className="text-lg text-stone-300 mb-8 leading-relaxed">
              Are you sure you want to exit PinBoard TV and return to your Fire TV Home Screen?
            </p>

            <div className="flex items-center justify-center gap-4">
              <button
                onClick={() => {
                  playPinPopSound();
                  setShowExitDialog(false);
                }}
                data-focused={exitDialogFocusIndex === 0}
                className={`flex-1 py-4 px-6 rounded-2xl font-bold text-xl transition-all cursor-pointer border-2 ${
                  exitDialogFocusIndex === 0
                    ? 'ring-4 ring-amber-400 bg-amber-400 text-stone-950 font-black border-amber-300 shadow-xl'
                    : 'bg-stone-800 text-stone-300 border-white/10 hover:bg-stone-700'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  playPinPopSound();
                  voiceService.exitApp();
                }}
                data-focused={exitDialogFocusIndex === 1}
                className={`flex-1 py-4 px-6 rounded-2xl font-bold text-xl transition-all cursor-pointer border-2 ${
                  exitDialogFocusIndex === 1
                    ? 'ring-4 ring-rose-500 bg-rose-600 text-white font-black border-rose-400 shadow-xl'
                    : 'bg-rose-950/40 text-rose-300 border-rose-500/30 hover:bg-rose-900/60'
                }`}
              >
                Exit App
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
