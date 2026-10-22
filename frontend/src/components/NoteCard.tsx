import React from 'react';
import { CheckCircle2, Circle } from 'lucide-react';
import type { PinNote } from '../types/pinboard';

export interface NoteCardProps {
  note: PinNote;
  isFocused?: boolean;
  onClick?: () => void;
  interactive?: boolean;
  density?: 'spacious' | 'compact';
}

export const NoteCard: React.FC<NoteCardProps> = ({
  note,
  isFocused = false,
  onClick,
  interactive = true,
  density = 'compact',
}) => {
  const isSpacious = density === 'spacious';
  const rotationAngle =
    typeof note.rotationDeg === 'number' && !isNaN(note.rotationDeg)
      ? note.rotationDeg
      : (note.id.charCodeAt(note.id.length - 1) % 5 - 2) * 0.8;

  if (note.type === 'POLAROID') {
    return (
      <div
        onClick={onClick}
        data-focused={isFocused}
        style={{
          transform: isFocused
            ? `scale(${isSpacious ? 1.025 : 1.03}) rotate(${rotationAngle}deg)`
            : `rotate(${rotationAngle}deg)`,
          transformOrigin: 'center center',
        }}
        className={`polaroid-shadow bg-white text-stone-900 rounded-sm flex flex-col justify-between transform transition-all h-full ${
          isSpacious ? 'p-4 pb-6' : 'p-3 pb-4'
        } ${
          isFocused ? 'z-30 shadow-2xl ring-4 ring-amber-400 ring-offset-2 ring-offset-stone-900 shadow-[0_0_24px_rgba(251,191,36,0.4)]' : ''
        } ${interactive ? 'cursor-pointer' : ''}`}
      >
        <div
          className={`w-full flex-1 overflow-hidden bg-stone-100 rounded-xs relative ${
            isSpacious ? 'mb-3 min-h-[160px]' : 'mb-2 min-h-[115px]'
          }`}
        >
          <img
            src={note.imageUrl}
            alt={note.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
          {/* Pushpin at top */}
          <div
            className={`absolute left-1/2 -translate-x-1/2 rounded-full bg-red-600 shadow-md border-2 border-white ${
              isSpacious ? 'top-2 w-5 h-5' : 'top-1.5 w-4 h-4'
            }`}
          />
        </div>
        <p
          className={`font-handwriting text-stone-800 text-center leading-tight px-1 line-clamp-2 ${
            isSpacious ? 'text-2xl' : 'text-lg'
          }`}
        >
          {note.content || note.title}
        </p>
      </div>
    );
  }

  const bgColor =
    note.color === 'yellow'
      ? 'bg-amber-100 text-amber-950 border-amber-300'
      : note.color === 'pink'
      ? 'bg-rose-100 text-rose-950 border-rose-300'
      : note.color === 'blue'
      ? 'bg-sky-100 text-sky-950 border-sky-300'
      : note.color === 'green'
      ? 'bg-lime-100 text-lime-950 border-lime-300'
      : 'bg-orange-100 text-orange-950 border-orange-300';

  const magnetColor =
    note.magnet === 'blue-star'
      ? 'bg-blue-600 border-blue-800 ring-blue-300'
      : note.magnet === 'brass-pin'
      ? 'bg-amber-600 border-amber-800 ring-amber-300'
      : note.magnet === 'washi-tape'
      ? 'bg-emerald-600 border-emerald-800 ring-emerald-300'
      : 'bg-red-600 border-red-800 ring-red-300';

  // Sizing rule: Spacious mode (<=8 notes) shows up to 5 items; Compact mode (9-15 notes) shows up to 3 items
  const items = note.items || [];
  const maxDisplayItems = isSpacious ? 5 : 3;
  const isCollapsed = items.length > maxDisplayItems;
  const displayedItems = isCollapsed ? items.slice(0, maxDisplayItems - 1) : items;

  return (
    <div
      onClick={onClick}
      data-focused={isFocused}
      style={{
        transform: isFocused
          ? `scale(${isSpacious ? 1.025 : 1.03}) rotate(${rotationAngle}deg)`
          : `rotate(${rotationAngle}deg)`,
        transformOrigin: 'center center',
      }}
      className={`paper-shadow dogear-folded ${bgColor} border-2 flex flex-col justify-between transform transition-all h-full ${
        isSpacious ? 'p-5 sm:p-6 rounded-2xl' : 'p-3.5 sm:p-4 rounded-xl'
      } ${
        isFocused ? 'z-30 shadow-2xl ring-4 ring-amber-400 ring-offset-2 ring-offset-stone-900 shadow-[0_0_24px_rgba(251,191,36,0.4)]' : ''
      } ${interactive ? 'cursor-pointer' : ''}`}
    >
      <div>
        {/* Magnet / Pushpin Graphic */}
        <div className={`flex justify-center ${isSpacious ? '-mt-3 mb-2.5' : '-mt-2 mb-1.5'}`}>
          <div
            className={`rounded-full shadow-md border ring-2 ${magnetColor} ${
              isSpacious ? 'w-5 h-5' : 'w-3.5 h-3.5'
            }`}
          />
        </div>

        {/* Note Title */}
        <h3
          className={`font-black leading-snug tracking-tight border-b border-black/10 ${
            isSpacious
              ? 'text-xl sm:text-2xl mb-2.5 pb-1.5 line-clamp-2'
              : 'text-base sm:text-lg mb-1.5 pb-1 line-clamp-1'
          }`}
        >
          {note.title}
        </h3>

        {/* Sticky Note Content */}
        {note.content && (
          <p
            className={`text-stone-900/90 whitespace-pre-wrap leading-relaxed font-sans ${
              isSpacious
                ? 'text-sm sm:text-base mb-2.5 line-clamp-5'
                : 'text-xs sm:text-sm mb-1.5 line-clamp-4'
            }`}
          >
            {note.content}
          </p>
        )}

        {/* Checklist Items */}
        {items.length > 0 && (
          <div className={isSpacious ? 'space-y-2 mb-2.5' : 'space-y-1.5 mb-1.5'}>
            {displayedItems.map((item) => (
              <div
                key={item.id}
                className={`flex items-center space-x-2 ${
                  isSpacious ? 'text-sm sm:text-base' : 'text-xs sm:text-sm'
                }`}
              >
                {item.done ? (
                  <CheckCircle2
                    className={`text-emerald-700 fill-emerald-100 shrink-0 ${
                      isSpacious ? 'w-5 h-5' : 'w-3.5 h-3.5'
                    }`}
                  />
                ) : (
                  <Circle
                    className={`text-stone-400 shrink-0 ${
                      isSpacious ? 'w-5 h-5' : 'w-3.5 h-3.5'
                    }`}
                  />
                )}
                <span
                  className={`truncate flex-1 ${
                    item.done
                      ? 'line-through opacity-50 font-normal text-stone-600'
                      : 'font-bold text-stone-950'
                  }`}
                >
                  {item.text}
                </span>
                {item.category && (
                  <span
                    className={`font-bold bg-black/10 rounded-full text-black/70 shrink-0 ${
                      isSpacious ? 'text-xs px-2 py-0.5' : 'text-[10px] px-1.5 py-0.5'
                    }`}
                  >
                    {item.category}
                  </span>
                )}
              </div>
            ))}
            {isCollapsed && (
              <div
                className={`font-bold text-stone-600 bg-black/5 rounded-md ${
                  isSpacious ? 'text-xs px-2.5 py-1' : 'text-[11px] px-2 py-0.5'
                }`}
              >
                +{items.length - (maxDisplayItems - 1)} more items
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer Info */}
      {note.assignedToName && (
        <div
          className={`border-t border-black/10 flex items-center justify-between font-bold text-stone-700 ${
            isSpacious ? 'mt-2 pt-2 text-xs' : 'mt-1 pt-1 text-[11px]'
          }`}
        >
          <span className="bg-black/10 px-2 py-0.5 rounded-full">
            👤 {note.assignedToName}
          </span>
          {note.priority === 'HIGH' && (
            <span
              className={`bg-rose-500/15 text-rose-800 px-1.5 py-0.5 rounded-full font-extrabold ${
                isSpacious ? 'text-xs' : 'text-[10px]'
              }`}
            >
              Priority
            </span>
          )}
        </div>
      )}
    </div>
  );
};
