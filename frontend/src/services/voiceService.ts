/**
 * Speech Recognition service for PinBoardTV
 * Bridges Fire TV Alexa Voice Remote / Browser Web Speech API
 */

interface SpeechRecognitionEvent {
  results: {
    [index: number]: {
      [index: number]: {
        transcript: string;
      };
    };
  };
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: (event: { error: string }) => void;
  onend: () => void;
}

declare global {
  interface Window {
    AndroidTVBridge?: {
      getMetrics?: () => string;
      showKeyboard?: (currentText: string, title?: string) => void;
      requestVoiceInput?: (prompt?: string) => void;
      exitApp?: () => void;
    };
    TVMetricsBridge?: {
      getMetrics?: () => string;
      showKeyboard?: (currentText: string, title?: string) => void;
      requestVoiceInput?: (prompt?: string) => void;
      exitApp?: () => void;
    };
    onNativeKeyboardInput?: (text: string) => void;
    onNativeVoiceInput?: (text: string) => void;
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  }
}

class VoiceService {
  private recognition: SpeechRecognitionInstance | null = null;
  private isListening = false;

  constructor() {
    if (typeof window !== 'undefined') {
      const SpeechRecognitionClass =
        window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognitionClass) {
        this.recognition = new SpeechRecognitionClass();
        this.recognition.continuous = false;
        this.recognition.interimResults = false;
        this.recognition.lang = 'en-US';
      }
    }
  }

  public isTvApp(): boolean {
    if (typeof window === 'undefined') return false;
    return Boolean(window.AndroidTVBridge || window.TVMetricsBridge);
  }

  public isSupported(): boolean {
    return this.isTvApp() || this.recognition !== null;
  }

  /**
   * Launch native TV virtual keyboard (Fire TV / Android TV soft keyboard dialog with mic dictation)
   */
  public showTvKeyboard(
    currentText: string,
    title: string = 'Set Household Name',
    onResult?: (text: string) => void
  ): boolean {
    if (typeof window === 'undefined') return false;
    const bridge = window.AndroidTVBridge || window.TVMetricsBridge;
    if (bridge && typeof bridge.showKeyboard === 'function') {
      if (onResult) {
        window.onNativeKeyboardInput = (text: string) => {
          onResult(text);
        };
      }
      bridge.showKeyboard(currentText, title);
      return true;
    }
    return false;
  }

  /**
   * Cleanly exit the PinBoard TV application to the Fire TV Home Screen
   */
  public exitApp(): void {
    if (typeof window === 'undefined') return;
    const bridge = window.AndroidTVBridge || window.TVMetricsBridge;
    if (bridge && typeof bridge.exitApp === 'function') {
      bridge.exitApp();
    } else {
      try {
        window.close();
      } catch {
        // Fallback
      }
    }
  }

  public startListening(
    onResult: (transcript: string) => void,
    onError?: (error: string) => void,
    onEnd?: () => void
  ): boolean {
    if (typeof window === 'undefined') return false;

    // 1. Fire TV / Android TV remote mic via native speech recognition bridge
    const bridge = window.AndroidTVBridge || window.TVMetricsBridge;
    if (bridge && typeof bridge.requestVoiceInput === 'function') {
      this.isListening = true;
      window.onNativeVoiceInput = (transcript: string) => {
        this.isListening = false;
        if (transcript && transcript.trim()) {
          onResult(transcript.trim());
        } else if (onEnd) {
          onEnd();
        }
      };

      try {
        bridge.requestVoiceInput('Speak into remote mic or say "Add milk to groceries"...');
        return true;
      } catch (e) {
        console.warn('Native speech request failed, falling back to Web Speech / keyboard', e);
      }
    }

    // 2. Web Speech API fallback for desktop / browser
    if (this.recognition) {
      if (this.isListening) {
        this.stopListening();
      }

      this.recognition.onresult = (event: SpeechRecognitionEvent) => {
        const transcript = event.results[0]?.[0]?.transcript || '';
        this.isListening = false;
        onResult(transcript);
      };

      this.recognition.onerror = (event: { error: string }) => {
        this.isListening = false;
        if (onError) onError(event.error);
      };

      this.recognition.onend = () => {
        this.isListening = false;
        if (onEnd) onEnd();
      };

      try {
        this.recognition.start();
        this.isListening = true;
        return true;
      } catch (e) {
        this.isListening = false;
        if (onError) onError(e instanceof Error ? e.message : 'Failed to start speech recognition');
        return false;
      }
    }

    if (onError) onError('Voice input is not supported in this environment.');
    return false;
  }

  public stopListening(): void {
    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop();
      } catch {
        // Ignore errors on stopping
      }
    }
    this.isListening = false;
  }
}

export const voiceService = new VoiceService();
