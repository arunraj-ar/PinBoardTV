import React, { useEffect, useState } from 'react';
import { Tv } from 'lucide-react';
import { storageSync } from '../services/storageSync';
import type { HouseholdState } from '../types/pinboard';
import { playPinPopSound, playDpadNavSound } from '../services/soundEffects';
import { NoteCard } from '../components/NoteCard';
import { organizeNotesIntoPages } from '../services/aiNoteOrganizer';

interface TvScreensaverProps {
  onOpenApp: () => void;
}

export const TvScreensaver: React.FC<TvScreensaverProps> = ({ onOpenApp }) => {
  const [state, setState] = useState<HouseholdState>(storageSync.getHouseholdState());
  const [isButtonFocused, setIsButtonFocused] = useState<boolean>(false);
  const [currentPage, setCurrentPage] = useState<number>(0);

  useEffect(() => {
    const unsubscribe = storageSync.subscribe((newState) => {
      setState(newState);
    });
    return unsubscribe;
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
  // - ArrowDown/ArrowUp highlights the bottom launch button
  // - ArrowLeft/ArrowRight cycles through slides manually
  // - OK/Enter launches app
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        playDpadNavSound();
        setIsButtonFocused(true);
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
  }, [onOpenApp, totalPages]);

  return (
    <div
      className={`relative w-screen h-screen overflow-hidden select-none animate-pixel-shift flex flex-col justify-between ${
        state.theme === 'slate' ? 'slateboard-canvas' : 'corkboard-canvas'
      } vignette-overlay`}
    >
      {/* Exact Same Pinboard Canvas as Main App (Avoiding the Title Bar) */}
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
              {pageNotes.map((note) => (
                <NoteCard
                  key={note.id}
                  note={note}
                  density={isCompact ? 'compact' : 'spacious'}
                  interactive={false}
                  isFocused={false}
                />
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
          title="Launch PinBoardTV"
        >
          <Tv className="w-6 h-6 group-hover:scale-110 transition-transform text-current" />
          <span>Launch PinBoardTV</span>
        </button>
      </footer>
    </div>
  );
};
