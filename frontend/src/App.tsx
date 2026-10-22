import { useState, useEffect } from 'react';
import { TvScreensaver } from './pages/TvScreensaver';
import { TvBoardApp } from './pages/TvBoardApp';
import { TvInitialSetup } from './components/TvInitialSetup';
import { MobileJoin } from './pages/MobileJoin';
import { MobileApp } from './pages/MobileApp';
import { storageSync } from './services/storageSync';
import type { MemberSession } from './types/pinboard';
import {
  Tv,
  Smartphone,
  Mic,
  RotateCcw,
  EyeOff,
  Radio,
  Sparkles,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { playJoinSuccessSound, playPinPopSound } from './services/soundEffects';

type AppRoute = 'tv_screensaver' | 'tv_board' | 'mobile_join' | 'mobile_app';

export function App() {
  const [route, setRoute] = useState<AppRoute>('tv_board');
  const [householdState, setHouseholdState] = useState(storageSync.getState());
  const [, setSession] = useState<MemberSession | null>(storageSync.getSession());
  // Only enable dev panel in Vite development mode, OR if explicitly requested via ?dev=true in URL
  const isDevMode = import.meta.env.DEV || (typeof window !== 'undefined' && window.location.search.includes('dev=true'));
  const [showDevBar, setShowDevBar] = useState<boolean>(isDevMode);
  const [voiceInput, setVoiceInput] = useState<string>('');
  const [showVoiceModal, setShowVoiceModal] = useState<boolean>(false);

  // Subscribe to storageSync for live state updates across tabs/windows
  useEffect(() => {
    const unsubscribe = storageSync.subscribe((newState) => {
      setHouseholdState(newState);
    });
    return () => unsubscribe();
  }, []);

  // Initialize route based on URL path
  useEffect(() => {
    const handleLocationChange = () => {
      const path = window.location.pathname;
      const currentSession = storageSync.getSession();
      setSession(currentSession);

      if (path === '/tv/screensaver') {
        setRoute('tv_screensaver');
      } else if (path === '/tv' || path.startsWith('/tv/board') || path === '/') {
        setRoute('tv_board');
      } else if (path === '/mobile' || path.startsWith('/mobile/app')) {
        if (!currentSession) {
          setRoute('mobile_join');
        } else {
          setRoute('mobile_app');
        }
      } else if (path === '/join') {
        setRoute('mobile_join');
      } else {
        setRoute('tv_board');
      }
    };

    handleLocationChange();
    window.addEventListener('popstate', handleLocationChange);
    return () => window.removeEventListener('popstate', handleLocationChange);
  }, []);

  // Keyboard shortcut: Press 'H' to toggle floating dev bar if isDevMode
  useEffect(() => {
    if (!isDevMode) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        (e.key === 'h' || e.key === 'H') &&
        !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)
      ) {
        setShowDevBar((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDevMode]);

  const navigateTo = (newRoute: AppRoute, urlPath: string) => {
    playPinPopSound();
    setRoute(newRoute);
    window.history.pushState({}, '', urlPath);
  };

  const handleSimulateAlexaVoice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!voiceInput.trim()) return;

    playPinPopSound();
    const prompt = voiceInput.trim();

    // Check if voice command contains groceries
    if (
      prompt.toLowerCase().includes('milk') ||
      prompt.toLowerCase().includes('eggs') ||
      prompt.toLowerCase().includes('grocery') ||
      prompt.toLowerCase().includes('groceries') ||
      prompt.toLowerCase().includes('avocados') ||
      prompt.toLowerCase().includes('butter')
    ) {
      storageSync.addChecklistItem('note_groceries_01', prompt, 'Voice Alexa', 'Alexa Echo');
    } else {
      // Create sticky reminder
      storageSync.addNote({
        type: 'STICKY',
        title: `🎙️ Alexa: "${prompt}"`,
        content: `Transcribed from living room Echo at ${new Date().toLocaleTimeString()}`,
        color: 'yellow',
        magnet: 'blue-star',
        rotationDeg: (Math.random() * 3 - 1.5),
        createdByMemberId: 'alexa_echo',
        pinned: true,
      });
    }

    setVoiceInput('');
    setShowVoiceModal(false);
    playJoinSuccessSound();
    confetti({ particleCount: 50, spread: 70, origin: { y: 0.6 } });
  };

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100">
      {/* Active Screen View */}
      {route === 'tv_screensaver' && (
        <TvScreensaver onOpenApp={() => navigateTo('tv_board', '/tv')} />
      )}

      {route === 'tv_board' && (
        !householdState.isConfigured || householdState.members.length === 0 ? (
          <TvInitialSetup onSetupComplete={() => navigateTo('tv_board', '/tv')} />
        ) : (
          <TvBoardApp onBackToScreensaver={() => navigateTo('tv_screensaver', '/tv/screensaver')} />
        )
      )}

      {route === 'mobile_join' && (
        <MobileJoin
          onJoinSuccess={() => {
            setSession(storageSync.getSession());
            navigateTo('mobile_app', '/mobile');
          }}
        />
      )}

      {route === 'mobile_app' && (
        <MobileApp
          onLogout={() => {
            setSession(null);
            navigateTo('mobile_join', '/join');
          }}
        />
      )}

      {/* Collapsible Floating Dev Switcher Bar (Only rendered in local development or with ?dev=true) */}
      {isDevMode && showDevBar && (
        <aside
          aria-label="Development switcher"
          className="fixed bottom-4 left-4 z-50 bg-stone-900/90 backdrop-blur-md border border-white/20 p-2.5 rounded-2xl shadow-2xl flex items-center space-x-2 text-xs font-bold"
        >
          <div className="flex items-center space-x-1 pr-2 border-r border-white/10 text-amber-400">
            <Radio className="w-3.5 h-3.5 animate-pulse text-emerald-400" />
            <span className="uppercase tracking-wider text-[10px]">Dev Nav</span>
          </div>

          <button
            onClick={() => navigateTo('tv_screensaver', '/tv/screensaver')}
            className={`px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer ${
              route === 'tv_screensaver'
                ? 'bg-amber-400 text-stone-950 font-black shadow-md'
                : 'text-stone-300 hover:text-white hover:bg-stone-800'
            }`}
          >
            <Tv className="w-3.5 h-3.5" />
            <span>TV Screensaver</span>
          </button>

          <button
            onClick={() => navigateTo('tv_board', '/tv')}
            className={`px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer ${
              route === 'tv_board'
                ? 'bg-amber-400 text-stone-950 font-black shadow-md'
                : 'text-stone-300 hover:text-white hover:bg-stone-800'
            }`}
          >
            <Tv className="w-3.5 h-3.5" />
            <span>TV 10-Foot Board</span>
          </button>

          <button
            onClick={() => navigateTo('mobile_join', '/join')}
            className={`px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer ${
              route === 'mobile_join'
                ? 'bg-amber-400 text-stone-950 font-black shadow-md'
                : 'text-stone-300 hover:text-white hover:bg-stone-800'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Mobile Join (QR)</span>
          </button>

          <button
            onClick={() => navigateTo('mobile_app', '/mobile')}
            className={`px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer ${
              route === 'mobile_app'
                ? 'bg-amber-400 text-stone-950 font-black shadow-md'
                : 'text-stone-300 hover:text-white hover:bg-stone-800'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Mobile Companion</span>
          </button>

          <div className="h-4 w-[1px] bg-white/20 mx-1"></div>

          {/* Simulate Alexa Button */}
          <button
            onClick={() => {
              playPinPopSound();
              setShowVoiceModal(true);
            }}
            className="px-2.5 py-1.5 rounded-xl bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 border border-purple-500/40 flex items-center gap-1.5 cursor-pointer"
            title="Simulate incoming Alexa voice intent"
          >
            <Mic className="w-3.5 h-3.5 text-purple-400" />
            <span>Alexa Voice</span>
          </button>

          {/* Fresh Setup Button */}
          <button
            onClick={() => {
              playPinPopSound();
              storageSync.startFreshHouseholdSetup();
              navigateTo('tv_board', '/tv');
              confetti({ particleCount: 40, spread: 60, origin: { y: 0.9 } });
            }}
            className="px-2.5 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/40 text-amber-300 border border-amber-500/40 flex items-center gap-1.5 cursor-pointer"
            title="Start Fresh Household Setup (QR Landing Flow)"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Setup Flow</span>
          </button>

          {/* Reset Seed Button */}
          <button
            onClick={() => {
              playPinPopSound();
              storageSync.resetToDefaults();
              confetti({ particleCount: 30, spread: 50, origin: { y: 0.9 } });
            }}
            className="p-1.5 rounded-xl text-stone-400 hover:text-white hover:bg-stone-800"
            title="Reset Board to Seed Data"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {/* Hide Hint */}
          <button
            onClick={() => setShowDevBar(false)}
            className="p-1.5 rounded-xl text-stone-500 hover:text-stone-300"
            title="Hide Dev Bar (Press 'H' to unhide)"
          >
            <EyeOff className="w-3.5 h-3.5" />
          </button>
        </aside>
      )}

      {/* Simulate Alexa Voice Modal */}
      {showVoiceModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-purple-500/30 rounded-3xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center space-x-3 text-purple-400 mb-3">
              <div className="p-2.5 rounded-2xl bg-purple-500/10 border border-purple-500/20">
                <Mic className="w-6 h-6 text-purple-400" />
              </div>
              <div>
                <h3 className="text-lg font-black text-white">Simulate Alexa Voice Skill</h3>
                <span className="text-xs text-purple-300">Custom Skill: "pin board"</span>
              </div>
            </div>

            <form onSubmit={handleSimulateAlexaVoice} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-stone-400 mb-1">
                  What did you say to Alexa?
                </label>
                <input
                  type="text"
                  placeholder='e.g., "Add oat milk and avocados to the grocery list"'
                  value={voiceInput}
                  onChange={(e) => setVoiceInput(e.target.value)}
                  className="w-full bg-stone-950 border border-white/15 rounded-xl p-3 text-white text-base focus:outline-none focus:border-purple-400"
                  autoFocus
                />
              </div>

              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={() => setShowVoiceModal(false)}
                  className="flex-1 py-3 bg-stone-800 text-stone-300 rounded-xl font-bold text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-bold text-sm shadow-lg"
                >
                  Speak to Alexa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
