import React, { useState, useEffect, useRef } from 'react';
import { Home, Mic, Check, X, Keyboard } from 'lucide-react';
import { voiceService } from '../services/voiceService';
import { playPinPopSound, playDpadNavSound, playJoinSuccessSound } from '../services/soundEffects';

export interface HouseholdNameModalProps {
  isOpen: boolean;
  currentName: string;
  onSave: (newName: string) => void;
  onClose: () => void;
}

const PRESET_NAMES = [
  'Living Room Family Hub',
  'Kitchen Command Center',
  'Our Family Pinboard',
  'The Cozy Cottage',
  'Beach House Notes',
];

export type ModalFocusTarget =
  | 'close'
  | 'voice'
  | 'input'
  | 'preset_0'
  | 'preset_1'
  | 'preset_2'
  | 'preset_3'
  | 'preset_4'
  | 'cancel'
  | 'save';

export const HouseholdNameModal: React.FC<HouseholdNameModalProps> = ({
  isOpen,
  currentName,
  onSave,
  onClose,
}) => {
  const [nameInput, setNameInput] = useState<string>(currentName);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [focusTarget, setFocusTarget] = useState<ModalFocusTarget>('input');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setNameInput(currentName);
      setFocusTarget('input');
      setIsListening(false);
    }
  }, [isOpen, currentName]);

  // Listen for native TV virtual keyboard and remote speech input
  useEffect(() => {
    if (!isOpen) return;

    window.onNativeKeyboardInput = (text: string) => {
      if (text && text.trim()) {
        setNameInput(text.trim());
        playJoinSuccessSound();
      }
    };

    window.onNativeVoiceInput = (text: string) => {
      setIsListening(false);
      const cleaned = text
        .trim()
        .replace(/^(?:change|set|rename|name)(?:\s+(?:the|our))?\s+(?:household|board|hub)?\s*(?:name)?\s+(?:to|as)\s+/i, '')
        .replace(/^["']|["']$/g, '');
      if (cleaned) {
        setNameInput(cleaned);
        playJoinSuccessSound();
      }
    };

    return () => {
      window.onNativeKeyboardInput = undefined;
      window.onNativeVoiceInput = undefined;
    };
  }, [isOpen]);

  // Launch Fire TV / Android TV virtual keyboard or focus input
  const handleLaunchKeyboard = () => {
    playPinPopSound();
    const launched = voiceService.showTvKeyboard(nameInput, 'Set Household Name', (val) => {
      if (val && val.trim()) {
        setNameInput(val.trim());
        playJoinSuccessSound();
      }
    });
    if (!launched) {
      inputRef.current?.focus();
    }
  };

  // Voice remote mic integration
  const handleStartVoice = () => {
    playPinPopSound();
    setIsListening(true);
    voiceService.startListening((transcript) => {
      setIsListening(false);
      // Clean up common voice prefixes
      const cleaned = transcript
        .trim()
        .replace(/^(?:change|set|rename|name)(?:\s+(?:the|our))?\s+(?:household|board|hub)?\s*(?:name)?\s+(?:to|as)\s+/i, '')
        .replace(/^["']|["']$/g, '');
      if (cleaned) {
        setNameInput(cleaned);
        playJoinSuccessSound();
      }
    });
  };

  const handleSave = () => {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    playJoinSuccessSound();
    onSave(trimmed);
    onClose();
  };

  // Remote key navigation: 2D Spatial Grid
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Back / Escape key handling
      if (e.key === 'Escape' || e.key === 'Backspace' || e.keyCode === 27 || e.keyCode === 4) {
        e.preventDefault();
        playPinPopSound();
        if (isListening) {
          voiceService.stopListening();
          setIsListening(false);
        } else {
          onClose();
        }
        return;
      }

      // Voice trigger key 'v' / 'V'
      if (e.key === 'v' || e.key === 'V') {
        if (!(e.target instanceof HTMLInputElement)) {
          e.preventDefault();
          handleStartVoice();
          return;
        }
      }

      // 2D Spatial Grid Navigation: ArrowUp
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        playDpadNavSound();
        if (focusTarget === 'close') {
          // At top-most
          return;
        } else if (focusTarget === 'voice') {
          setFocusTarget('close');
        } else if (focusTarget === 'input') {
          setFocusTarget('voice');
        } else if (focusTarget === 'preset_0' || focusTarget === 'preset_1') {
          setFocusTarget('input');
        } else if (focusTarget === 'preset_2') {
          setFocusTarget('preset_0');
        } else if (focusTarget === 'preset_3') {
          setFocusTarget('preset_1');
        } else if (focusTarget === 'preset_4') {
          setFocusTarget('preset_2');
        } else if (focusTarget === 'cancel') {
          setFocusTarget('preset_4');
        } else if (focusTarget === 'save') {
          setFocusTarget('preset_3');
        }
        return;
      }

      // 2D Spatial Grid Navigation: ArrowDown
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        playDpadNavSound();
        if (focusTarget === 'close') {
          setFocusTarget('voice');
        } else if (focusTarget === 'voice') {
          setFocusTarget('input');
        } else if (focusTarget === 'input') {
          setFocusTarget('preset_0');
        } else if (focusTarget === 'preset_0') {
          setFocusTarget('preset_2');
        } else if (focusTarget === 'preset_1') {
          setFocusTarget('preset_3');
        } else if (focusTarget === 'preset_2') {
          setFocusTarget('preset_4');
        } else if (focusTarget === 'preset_3') {
          setFocusTarget('save');
        } else if (focusTarget === 'preset_4') {
          setFocusTarget('cancel');
        } else if (focusTarget === 'cancel' || focusTarget === 'save') {
          // At bottom
          return;
        }
        return;
      }

      // 2D Spatial Grid Navigation: ArrowLeft
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (focusTarget === 'preset_1') {
          playDpadNavSound();
          setFocusTarget('preset_0');
        } else if (focusTarget === 'preset_3') {
          playDpadNavSound();
          setFocusTarget('preset_2');
        } else if (focusTarget === 'save') {
          playDpadNavSound();
          setFocusTarget('cancel');
        } else if (focusTarget === 'close') {
          playDpadNavSound();
          setFocusTarget('voice');
        }
        return;
      }

      // 2D Spatial Grid Navigation: ArrowRight
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (focusTarget === 'preset_0') {
          playDpadNavSound();
          setFocusTarget('preset_1');
        } else if (focusTarget === 'preset_2') {
          playDpadNavSound();
          setFocusTarget('preset_3');
        } else if (focusTarget === 'preset_4') {
          playDpadNavSound();
          setFocusTarget('save');
        } else if (focusTarget === 'cancel') {
          playDpadNavSound();
          setFocusTarget('save');
        } else if (focusTarget === 'voice') {
          playDpadNavSound();
          setFocusTarget('close');
        }
        return;
      }

      // Action: Enter / Select
      if (e.key === 'Enter' || e.key === 'Select' || e.keyCode === 13) {
        e.preventDefault();
        if (focusTarget === 'close') {
          playPinPopSound();
          onClose();
        } else if (focusTarget === 'voice') {
          handleStartVoice();
        } else if (focusTarget === 'input') {
          handleLaunchKeyboard();
        } else if (focusTarget === 'preset_0') {
          playPinPopSound();
          setNameInput(PRESET_NAMES[0]);
        } else if (focusTarget === 'preset_1') {
          playPinPopSound();
          setNameInput(PRESET_NAMES[1]);
        } else if (focusTarget === 'preset_2') {
          playPinPopSound();
          setNameInput(PRESET_NAMES[2]);
        } else if (focusTarget === 'preset_3') {
          playPinPopSound();
          setNameInput(PRESET_NAMES[3]);
        } else if (focusTarget === 'preset_4') {
          playPinPopSound();
          setNameInput(PRESET_NAMES[4]);
        } else if (focusTarget === 'save') {
          handleSave();
        } else if (focusTarget === 'cancel') {
          playPinPopSound();
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, focusTarget, nameInput, isListening, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-8 animate-in fade-in duration-150">
      <div className="w-full max-w-2xl bg-stone-900 border-4 border-amber-400 rounded-3xl p-8 shadow-2xl text-left relative flex flex-col justify-between">
        {/* Header with D-Pad Navigable Close Button */}
        <div className="flex items-center justify-between border-b border-white/15 pb-4 mb-5">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-400/20 border border-amber-400/40 flex items-center justify-center text-amber-400">
              <Home className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-3xl font-black text-white tracking-tight">Set Household Name</h2>
              <p className="text-stone-400 text-sm font-medium">
                Change what appears on the TV board and mobile companion
              </p>
            </div>
          </div>

          {/* D-Pad Navigable Close Button */}
          <button
            onClick={() => {
              playPinPopSound();
              onClose();
            }}
            data-focused={focusTarget === 'close'}
            className={`p-2.5 rounded-xl transition-all cursor-pointer border-2 ${
              focusTarget === 'close'
                ? 'ring-4 ring-amber-400 bg-amber-400 text-stone-950 font-black border-amber-300 shadow-[0_0_20px_rgba(251,191,36,0.5)]'
                : 'bg-stone-800 text-stone-400 hover:text-white hover:bg-stone-750 border-white/10'
            }`}
            title="Close modal (or press Back)"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Alexa Skill & Remote Mic Banner */}
        <div className="mb-5 p-3.5 bg-gradient-to-r from-amber-400/15 via-amber-500/10 to-transparent border border-amber-400/30 rounded-2xl flex items-center space-x-3 text-stone-200 text-sm shadow-inner">
          <span className="text-2xl shrink-0">🎙️</span>
          <div>
            <span className="text-amber-400 font-bold block text-xs uppercase tracking-wider">Alexa Voice Skill Available</span>
            <span className="text-stone-300 text-xs sm:text-sm">
              Say to Alexa: <span className="text-white font-bold">"Alexa, tell PinBoard TV to rename household to [Name]"</span> or press <span className="text-amber-300 font-bold">"V"</span> for remote mic.
            </span>
          </div>
        </div>

        {/* Voice Trigger Button */}
        <div className="mb-5">
          <button
            onClick={handleStartVoice}
            data-focused={focusTarget === 'voice'}
            className={`w-full py-4 px-6 rounded-2xl font-bold text-lg flex items-center justify-center space-x-3 transition-all cursor-pointer border-2 ${
              focusTarget === 'voice'
                ? 'ring-4 ring-amber-400 bg-amber-400 text-stone-950 font-black shadow-[0_0_24px_rgba(251,191,36,0.4)] border-amber-300'
                : isListening
                ? 'bg-purple-600 text-white ring-4 ring-purple-400 animate-pulse border-purple-400 shadow-[0_0_24px_rgba(168,85,247,0.4)]'
                : 'bg-stone-800/90 hover:bg-stone-800 text-stone-200 border-white/10'
            }`}
          >
            <Mic className={`w-6 h-6 ${focusTarget === 'voice' ? 'text-stone-950' : 'text-amber-400'}`} />
            <span>
              {isListening
                ? 'Listening... Speak household name now'
                : 'Speak Name with Remote Mic (or press "V")'}
            </span>
          </button>
        </div>

        {/* Text Input Field with Virtual Keyboard Action */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-stone-400">
              Household Name (Press OK to Open Virtual Keyboard)
            </label>
            <button
              type="button"
              onClick={handleLaunchKeyboard}
              className="text-xs font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1.5 cursor-pointer bg-stone-800 px-2.5 py-1 rounded-lg border border-white/10"
            >
              <Keyboard className="w-3.5 h-3.5" />
              <span>Launch Keyboard</span>
            </button>
          </div>
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onClick={handleLaunchKeyboard}
              data-focused={focusTarget === 'input'}
              placeholder="e.g., Living Room Family Hub"
              className={`w-full bg-stone-950 text-white px-5 py-4 rounded-2xl text-2xl font-black transition-all border-2 focus:outline-none pr-14 ${
                focusTarget === 'input'
                  ? 'ring-4 ring-amber-400 border-amber-400 bg-stone-950 text-white shadow-[0_0_24px_rgba(251,191,36,0.35)]'
                  : 'border-white/20'
              }`}
            />
            <button
              type="button"
              onClick={handleLaunchKeyboard}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-400 hover:text-amber-400 p-2"
              title="Launch TV Soft Keyboard"
            >
              <Keyboard className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Quick Presets: 2D Spatial Grid (2 Columns) */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2.5">
            <span className="block text-xs font-bold uppercase tracking-wider text-stone-400">
              Quick Family Presets (Select to use)
            </span>
            <span className="text-xs text-stone-500 font-medium">Use D-pad ◄ ► ▲ ▼ to navigate</span>
          </div>
          <div className="grid grid-cols-2 gap-3 p-1">
            {PRESET_NAMES.map((preset, idx) => {
              const targetKey = `preset_${idx}` as ModalFocusTarget;
              const isSelected = nameInput === preset;
              const isFocused = focusTarget === targetKey;

              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    playPinPopSound();
                    setNameInput(preset);
                    setFocusTarget(targetKey);
                  }}
                  data-focused={isFocused}
                  className={`p-3.5 rounded-xl text-left font-bold text-sm transition-all cursor-pointer border-2 flex items-center justify-between ${
                    isFocused
                      ? 'ring-4 ring-amber-400 bg-amber-400 text-stone-950 font-black border-amber-300 shadow-[0_0_20px_rgba(251,191,36,0.4)]'
                      : isSelected
                      ? 'bg-amber-400/20 text-amber-300 border-amber-400/60 font-black'
                      : 'bg-stone-800/90 text-stone-300 hover:bg-stone-800 border-white/10'
                  }`}
                >
                  <span className="truncate block mr-2">🏠 {preset}</span>
                  {isSelected && (
                    <Check className={`w-4 h-4 shrink-0 stroke-[3] ${isFocused ? 'text-stone-950' : 'text-amber-400'}`} />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Action Buttons: Standard Color Theme */}
        <div className="flex items-center space-x-4 pt-4 border-t border-white/15">
          <button
            onClick={() => {
              playPinPopSound();
              onClose();
            }}
            data-focused={focusTarget === 'cancel'}
            className={`flex-1 py-4 rounded-xl font-bold text-base transition-all cursor-pointer border-2 ${
              focusTarget === 'cancel'
                ? 'ring-4 ring-amber-400 bg-amber-400 text-stone-950 font-black border-amber-300 shadow-[0_0_20px_rgba(251,191,36,0.35)]'
                : 'bg-stone-800/90 hover:bg-stone-800 text-stone-300 border-white/10'
            }`}
          >
            Cancel
          </button>

          <button
            onClick={handleSave}
            data-focused={focusTarget === 'save'}
            className={`flex-1 py-4 rounded-xl font-bold text-base transition-all cursor-pointer border-2 flex items-center justify-center space-x-2 ${
              focusTarget === 'save'
                ? 'ring-4 ring-amber-400 bg-amber-400 text-stone-950 font-black border-amber-300 shadow-[0_0_24px_rgba(251,191,36,0.45)]'
                : 'bg-amber-500 hover:bg-amber-400 text-stone-950 font-black border-amber-500 shadow-md'
            }`}
          >
            <Check className="w-5 h-5 stroke-[3]" />
            <span>Save Household Name</span>
          </button>
        </div>
      </div>
    </div>
  );
};

