import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  Mic,
  Headphones,
  VolumeX,
  Settings,
  Square,
  Volume2,
  Signal,
  Wifi,
  BatteryCharging,
  Sparkles,
  Check,
  Rows2,
  Trash2,
  Tv,
  AlignLeft,
  LayoutGrid,
  Radio,
  Maximize2,
  Minimize2,
  Activity,
  Zap,
  BookOpen,
  ArrowLeft,
  ChevronDown,
  Users,
  User,
  X,
  WifiOff,
  QrCode,
  Flag,
} from 'lucide-react';
import { App as CapApp } from '@capacitor/app';
import type {
  AudioMeterSnapshot,
  AudioProcessingConfig,
  PrepaidAccountState,
  SpeechOutputConfig,
  StageSpeaker,
  TranslationSegment,
} from './types/translator';
import {
  SPEAKER_PALETTE,
  SUPPORTED_LANGUAGES,
} from './constants/languages';
import { ChurchAudioEngine, preloadWhisperModel } from './services/churchAudioEngine';
import { EarphoneSpeechEngine } from './services/earphoneSpeechEngine';
import { translateChurchStageAudioChunk } from './services/geminiStageTranslator';
import { transcribeAndTranslateWithDeepgram } from './services/deepgramTranslator';
import { DeepgramLiveWebSocket } from './services/deepgramLiveWebSocket';
import { BrowserLiveSpeechFallback } from './services/browserLiveFallback';
import { OfflineEdgeTranslator, preloadNllbModel } from './services/offlineEdgeTranslator';
import { SettingsAndWalletModal } from './components/SettingsAndWalletModal';
import {
  detectScriptureReferences,
  fetchScriptureVerse,
  type ScriptureData,
} from './services/scriptureService';
import {
  createCaptionSessionId,
  buildListenerShareUrl,
  buildBroadcastOverlayUrl,
  publishCaptionSegment,
} from './services/captionRelayClient';
import { CaptionShareQR } from './components/CaptionShareQR';
import { ListenerCaptionView } from './components/ListenerCaptionView';
import { BroadcastOverlayView } from './components/BroadcastOverlayView';
import {
  type FlaggedCorrection,
  loadFlaggedCorrections,
  saveFlaggedCorrections,
  createFlaggedCorrection,
} from './services/glossaryCorrections';
import { recordCrash } from './services/crashTelemetry';
import {
  type SessionSnapshot,
  saveSessionSnapshot,
  loadRecoverableSessionSnapshot,
  clearSessionSnapshot,
} from './services/sessionRecovery';

const STORAGE_KEY_GEMINI = 'sanctuary_voice_gemini_key_v1';
const STORAGE_KEY_DEEPGRAM = 'sanctuary_voice_deepgram_key_v1';
const STORAGE_KEY_AI_PROVIDER = 'sanctuary_voice_ai_provider_v1';
const STORAGE_KEY_SPEECH_CONFIG = 'sanctuary_voice_speech_config_v1';
const STORAGE_KEY_SOURCE_LANG = 'sanctuary_voice_source_lang_v1';
const STORAGE_KEY_TARGET_LANG = 'sanctuary_voice_target_lang_v1';
const STORAGE_KEY_CHURCH_GLOSSARY = 'sanctuary_voice_church_glossary_v1';

// Automatic connectivity-health probe (missionary/remote-venue design, replacing the old manual
// "Offline Sanctuary Mode" toggle): `navigator.onLine` only reflects the OS's link-layer state, which
// can be `true` even when the actual network is too slow/unstable for Deepgram's WebSocket or the
// translate APIs to work ("online but unusable"). This does a short, timed network round-trip to our
// own serverless origin; any settled HTTP response (even a 404/405) proves the network path is
// actually usable, while a timeout or thrown fetch error means it isn't. Never throws.
async function probeCloudConnectivity(timeoutMs = 4000): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  if (typeof fetch === 'undefined') return true;
  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      await fetch('/api/deepgram-token', {
        method: 'HEAD',
        cache: 'no-store',
        signal: controller.signal,
      });
      return true;
    } finally {
      window.clearTimeout(timer);
    }
  } catch {
    return false;
  }
}

export function App() {
  // QR-code local caption distribution: if this page was opened by scanning the share QR code
  // (CaptionShareQR), it carries a `?listen=<sessionId>` param — render the zero-install read-only
  // listener view instead of the full operator app.
  const [listenerSessionId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('listen');
  });
  const [listenerLangCode] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('lang');
  });
  // OBS/ProPresenter browser-source output (Church-Cap/DilMesh-inspired): if this page was opened
  // with a `?obs=<sessionId>` param (added as an OBS Browser Source or ProPresenter web overlay),
  // render the transparent chrome-free caption overlay instead of the full operator app.
  const [obsSessionId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('obs');
  });

  const [speaker1SourceLang, setSpeaker1SourceLang] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY_SOURCE_LANG) || 'auto';
  });
  const [targetLangCode, setTargetLangCode] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY_TARGET_LANG) || 'no';
  });
  const [speakers, setSpeakers] = useState<StageSpeaker[]>(() => {
    const initialSource = localStorage.getItem(STORAGE_KEY_SOURCE_LANG) || 'auto';
    const initialTarget = localStorage.getItem(STORAGE_KEY_TARGET_LANG) || 'no';
    const sourceMeta = SUPPORTED_LANGUAGES.find((l) => l.code === initialSource);
    const targetMeta = SUPPORTED_LANGUAGES.find((l) => l.code === initialTarget);

    return [
      {
        id: 'speaker_1',
        label: 'Speaker 1',
        roleHint: 'main-speaker',
        detectedLanguageCode: initialSource,
        detectedLanguageName: initialSource === 'auto' ? 'Auto' : sourceMeta?.name || initialSource,
        detectedDialect: 'Main Stage Voice',
        accentColor: '#38bdf8',
        segmentCount: 0,
        lastActiveAt: 0,
        isIgnored: false,
      },
      {
        id: 'speaker_2',
        label: 'Translator 2',
        roleHint: 'stage-interpreter',
        detectedLanguageCode: initialTarget,
        detectedLanguageName: targetMeta?.name || initialTarget,
        detectedDialect: 'Stage Interpreter',
        accentColor: '#fbbf24',
        segmentCount: 0,
        lastActiveAt: 0,
        isIgnored: false,
      },
    ];
  });
  const [segments, setSegments] = useState<TranslationSegment[]>([]);

  // Voice filter: 'all' | 'auto' | 'split' | 'speaker_1' | 'speaker_2'
  const [voiceViewMode, setVoiceViewMode] = useState<string>('all');
  const [activeSpeakerId, setActiveSpeakerId] = useState<string>('speaker_1');
  const [displayStyle, setDisplayStyle] = useState<'continuous' | 'cards' | 'live'>('continuous');
  const [showOriginalText, setShowOriginalText] = useState<boolean>(true);
  const [fontSizeScale, setFontSizeScale] = useState<'normal' | 'large' | 'xl'>('normal');

  // Simple 1-tap Back-Row Boost: 'normal' (+2dB) | 'pew' (+12dB) | 'back-row' (+22dB)
  const [boostPreset, setBoostPreset] = useState<'normal' | 'pew' | 'back-row'>('pew');

  const [audioConfig, setAudioConfig] = useState<AudioProcessingConfig>({
    bypassOsProcessing: true,
    preAmpGainDb: 12,
    synthPadFilterEnabled: true,
    dynamicCompressorEnabled: true,
    highPassHz: 90,
    chunkDurationSec: 4,
    silenceGateDb: -48,
    selectedDeviceId: 'default',
    neuralVoiceIsolationEnabled: true,
  });

  const [meter, setMeter] = useState<AudioMeterSnapshot>({
    rmsDb: -70,
    peakDb: -70,
    normalizedLevel: 0,
    isClipping: false,
    isVoiceDetected: false,
    frequencyBins: new Array(16).fill(0.05),
  });

  const [speechConfig, setSpeechConfig] = useState<SpeechOutputConfig>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_SPEECH_CONFIG);
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      enabled: true,
      speechRate: 1.05,
      pitch: 1.0,
      volume: 1.0,
      selectedVoiceURI: '',
      earphoneOnlyGuard: true,
      voiceEngine: 'neural-cloud',
      geminiVoiceName: 'Aoede',
    };
  });

  const [wallet, setWallet] = useState<PrepaidAccountState>({
    minutesRemaining: 180,
    totalMinutesPurchased: 180,
    sessionSecondsUsed: 0,
    sessionTokensUsed: 0,
    activeTierName: 'Pre-Paid Sanctuary Pass',
  });

  const [apiKey, setApiKey] = useState<string>(() => {
    const envKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
    return localStorage.getItem(STORAGE_KEY_GEMINI) || envKey || '';
  });

  const [deepgramKey, setDeepgramKey] = useState<string>(() => {
    const envKey = import.meta.env.VITE_DEEPGRAM_API_KEY as string | undefined;
    return localStorage.getItem(STORAGE_KEY_DEEPGRAM) || envKey || '';
  });

  const [aiProvider, setAiProvider] = useState<'deepgram' | 'gemini'>('deepgram');

  const [isListening, setIsListening] = useState<boolean>(false);
  const [isProcessingChunk, setIsProcessingChunk] = useState<boolean>(false);
  const [liveInterimText, setLiveInterimText] = useState<string>('');
  const [isFocusMode, setIsFocusMode] = useState<boolean>(false);
  const [isFinishingQueue, setIsFinishingQueue] = useState<boolean>(false);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isVoiceSelectorOpen, setIsVoiceSelectorOpen] = useState<boolean>(false);
  const [activeScripture, setActiveScripture] = useState<ScriptureData | null>(null);
  const [isScriptureExpanded, setIsScriptureExpanded] = useState<boolean>(false);
  const [customChurchGlossary, setCustomChurchGlossary] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_CHURCH_GLOSSARY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return ['Pastor Velasquez', 'Hallelujah', 'Maranatha', 'Sanctuary'];
  });
  const customChurchGlossaryRef = useRef<string[]>(customChurchGlossary);
  const [flaggedCorrections, setFlaggedCorrections] = useState<FlaggedCorrection[]>(() =>
    loadFlaggedCorrections()
  );

  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  });
  const [isOfflineEdgeActive, setIsOfflineEdgeActive] = useState<boolean>(false);
  // Automatic connectivity-health mode (Church Presenter-inspired "offline-first", missionary use
  // case): replaces the old manually-operated "Offline Sanctuary Mode" button. A background probe
  // (see `probeCloudConnectivity`/the connectivity-health effect below) continuously decides whether
  // the cloud pipeline (Deepgram/Gemini) is actually usable — not just whether `navigator.onLine` is
  // true — and silently routes audio through the on-device Whisper/NLLB-200 pipeline when it isn't.
  // This is purely an informational status for the UI; nothing the operator has to press.
  const [connectionMode, setConnectionMode] = useState<'cloud' | 'offline' | 'checking'>('checking');
  const connectionModeRef = useRef<'cloud' | 'offline' | 'checking'>(connectionMode);
  // Automatic session recovery: if a previous tab was mid-service when it crashed/reloaded, this
  // holds the recoverable snapshot so a "Resume previous session?" banner can be shown and let the
  // operator restart with one tap instead of reconfiguring languages/view mode from scratch.
  const [recoverableSnapshot, setRecoverableSnapshot] = useState<SessionSnapshot | null>(() =>
    loadRecoverableSessionSnapshot()
  );
  // QR-code local caption distribution (Church-Cap-inspired): a short-lived session id that the main
  // device publishes segments under, so a congregant's phone can scan a QR code and view captions
  // in their own browser with zero install.
  const [captionShareSessionId, setCaptionShareSessionId] = useState<string | null>(null);
  const [isShareQrOpen, setIsShareQrOpen] = useState<boolean>(false);
  // Consolidated "Share" menu: previously "Share QR" and "Broadcast Overlay" were two separate,
  // similarly-styled buttons sitting side by side with jargon-y labels, which was confusing for
  // non-technical operators (no cue for which one to use, or that one targets individual phones
  // while the other targets a projector/stream). Grouped under one plain-language entry point.
  const [isShareMenuOpen, setIsShareMenuOpen] = useState<boolean>(false);
  const captionShareSessionIdRef = useRef<string | null>(captionShareSessionId);

  const consecutiveFailuresRef = useRef<number>(0);
  const finishingQueueTimerRef = useRef<number | null>(null);
  const listeningSessionIdRef = useRef<number>(0);
  const recentSpokenRef = useRef<Array<{ text: string; at: number }>>([]);
  const restQueueRef = useRef<Promise<void>>(Promise.resolve());
  const restPendingRef = useRef<number>(0);
  const lastWebSocketActivityRef = useRef<number>(0);

  const audioEngineRef = useRef<ChurchAudioEngine | null>(null);
  const speechEngineRef = useRef<EarphoneSpeechEngine | null>(null);
  const fallbackEngineRef = useRef<BrowserLiveSpeechFallback | null>(null);
  const offlineEdgeEngineRef = useRef<OfflineEdgeTranslator | null>(null);
  const deepgramWsRef = useRef<DeepgramLiveWebSocket | null>(null);
  const feedEndRef = useRef<HTMLDivElement | null>(null);

  const speakersRef = useRef<StageSpeaker[]>(speakers);
  const speaker1LangRef = useRef<string>(speaker1SourceLang);
  const targetLangRef = useRef<string>(targetLangCode);
  const voiceViewModeRef = useRef<string>(voiceViewMode);
  const apiKeyRef = useRef<string>(apiKey);
  const deepgramKeyRef = useRef<string>(deepgramKey);
  const aiProviderRef = useRef<'deepgram' | 'gemini'>(aiProvider);
  const segmentsRef = useRef<TranslationSegment[]>(segments);
  const isSettingsOpenRef = useRef<boolean>(isSettingsOpen);
  const isVoiceSelectorOpenRef = useRef<boolean>(isVoiceSelectorOpen);
  const isScriptureExpandedRef = useRef<boolean>(isScriptureExpanded);
  const activeScriptureRef = useRef<ScriptureData | null>(activeScripture);
  const isFocusModeRef = useRef<boolean>(isFocusMode);
  const isListeningRef = useRef<boolean>(isListening);

  useEffect(() => {
    speakersRef.current = speakers;
  }, [speakers]);

  useEffect(() => {
    speaker1LangRef.current = speaker1SourceLang;
  }, [speaker1SourceLang]);

  useEffect(() => {
    targetLangRef.current = targetLangCode;
  }, [targetLangCode]);

  useEffect(() => {
    voiceViewModeRef.current = voiceViewMode;
  }, [voiceViewMode]);

  useEffect(() => {
    apiKeyRef.current = apiKey;
  }, [apiKey]);

  useEffect(() => {
    deepgramKeyRef.current = deepgramKey;
  }, [deepgramKey]);

  useEffect(() => {
    aiProviderRef.current = aiProvider;
  }, [aiProvider]);

  useEffect(() => {
    segmentsRef.current = segments;
  }, [segments]);

  useEffect(() => {
    isSettingsOpenRef.current = isSettingsOpen;
  }, [isSettingsOpen]);

  useEffect(() => {
    isVoiceSelectorOpenRef.current = isVoiceSelectorOpen;
  }, [isVoiceSelectorOpen]);

  useEffect(() => {
    isScriptureExpandedRef.current = isScriptureExpanded;
  }, [isScriptureExpanded]);

  useEffect(() => {
    activeScriptureRef.current = activeScripture;
  }, [activeScripture]);

  useEffect(() => {
    isFocusModeRef.current = isFocusMode;
  }, [isFocusMode]);

  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  useEffect(() => {
    customChurchGlossaryRef.current = customChurchGlossary;
  }, [customChurchGlossary]);

  useEffect(() => {
    connectionModeRef.current = connectionMode;
  }, [connectionMode]);

  useEffect(() => {
    captionShareSessionIdRef.current = captionShareSessionId;
  }, [captionShareSessionId]);

  // Sync browser history state when opening modals so browser/swipe back button works
  useEffect(() => {
    if (isSettingsOpen) {
      window.history.pushState({ modal: 'settings' }, '');
    }
  }, [isSettingsOpen]);

  // Native Mobile & Device Hardware Back Button / Navigation Key Support
  useEffect(() => {
    let removeListener: (() => void) | undefined;

    const setupCapacitorBackButton = async () => {
      try {
        const handler = await CapApp.addListener('backButton', ({ canGoBack }) => {
          if (isVoiceSelectorOpenRef.current) {
            setIsVoiceSelectorOpen(false);
          } else if (isSettingsOpenRef.current) {
            setIsSettingsOpen(false);
          } else if (isScriptureExpandedRef.current) {
            setIsScriptureExpanded(false);
          } else if (activeScriptureRef.current) {
            setActiveScripture(null);
          } else if (isFocusModeRef.current) {
            setIsFocusMode(false);
          } else if (isListeningRef.current) {
            audioEngineRef.current?.stop();
            audioEngineRef.current = null;
            deepgramWsRef.current?.close();
            deepgramWsRef.current = null;
            fallbackEngineRef.current?.stop();
            fallbackEngineRef.current = null;
            offlineEdgeEngineRef.current?.stop();
            offlineEdgeEngineRef.current = null;
            speechEngineRef.current?.stopAll();
            setLiveInterimText('');
            setIsListening(false);
            setIsOfflineEdgeActive(false);
          } else if (canGoBack) {
            window.history.back();
          } else {
            void CapApp.exitApp();
          }
        });
        removeListener = () => {
          void handler.remove();
        };
      } catch (err) {
        console.debug('Capacitor App backButton listener not active in web environment:', err);
      }
    };

    void setupCapacitorBackButton();

    const handlePopState = () => {
      if (isVoiceSelectorOpenRef.current) {
        setIsVoiceSelectorOpen(false);
      } else if (isSettingsOpenRef.current) {
        setIsSettingsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isVoiceSelectorOpenRef.current) {
          setIsVoiceSelectorOpen(false);
        } else if (isSettingsOpenRef.current) {
          setIsSettingsOpen(false);
        } else if (isScriptureExpandedRef.current) {
          setIsScriptureExpanded(false);
        } else if (activeScriptureRef.current) {
          setActiveScripture(null);
        } else if (isFocusModeRef.current) {
          setIsFocusMode(false);
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      if (removeListener) removeListener();
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  useEffect(() => {
    speechEngineRef.current = new EarphoneSpeechEngine(speechConfig);
    return () => {
      speechEngineRef.current?.stopAll();
      audioEngineRef.current?.stop();
      fallbackEngineRef.current?.stop();
    };
  }, [speechConfig]);

  useEffect(() => {
    fallbackEngineRef.current?.setLanguages(speaker1SourceLang, targetLangCode);
    offlineEdgeEngineRef.current?.setLanguages(speaker1SourceLang, targetLangCode);
  }, [speaker1SourceLang, targetLangCode]);

  // Network State Tracker: reacts instantly to OS-level online/offline events. This catches the
  // "fully offline" case immediately; the periodic probe effect below additionally catches the
  // "online but unusable" case that these browser events can't detect.
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setErrorNotice(null);
      if (isOfflineEdgeActive) {
        setIsOfflineEdgeActive(false);
        offlineEdgeEngineRef.current?.stop();
      }
      setConnectionMode('checking');
    };
    const handleOffline = () => {
      setIsOnline(false);
      setConnectionMode('offline');
      setErrorNotice('Offline mode: device network disconnected. Running local on-device speech model.');
      if (isListening && !isOfflineEdgeActive) {
        setIsOfflineEdgeActive(true);
        deepgramWsRef.current?.close();
        deepgramWsRef.current = null;
        if (!offlineEdgeEngineRef.current) {
          offlineEdgeEngineRef.current = new OfflineEdgeTranslator(
            speaker1LangRef.current,
            targetLangRef.current,
            (ev) => {
              upsertSpeakerAndAppendSegment({
                speakerId: 'speaker_1',
                speakerLabel: 'Speaker 1 (Offline Sanctuary Edge)',
                roleHint: 'main-speaker',
                sourceLanguageCode: ev.sourceLanguageCode,
                sourceLanguageName: ev.sourceLanguageName,
                originalText: ev.originalText,
                translatedText: ev.translatedText,
                latencyMs: ev.latencyMs,
              });
            }
          );
        }
        offlineEdgeEngineRef.current.start();
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      offlineEdgeEngineRef.current?.stop();
    };
  }, [isListening, isOfflineEdgeActive]);

  // Eager offline-model pre-caching (missionary/remote-venue design): as soon as the app has ANY
  // connectivity — on first load, or the moment connectivity returns after being offline — silently
  // start downloading the on-device Whisper + NLLB-200 models in the background. By the time a
  // missionary actually reaches a location with no internet at all, the fallback models are already
  // cached locally and don't themselves need a network call to become available.
  useEffect(() => {
    if (!isOnline) return;
    const idleHandle = window.setTimeout(() => {
      preloadWhisperModel();
      preloadNllbModel();
    }, 1500);
    return () => window.clearTimeout(idleHandle);
  }, [isOnline]);

  // Continuous connectivity-health probe (replaces the old manual "Offline Sanctuary Mode" toggle).
  // While a service is live, periodically verifies the cloud pipeline is actually reachable (not just
  // `navigator.onLine`) and automatically engages/disengages the audio engine's on-device Whisper
  // fallback accordingly — no operator action required, and it recovers back to cloud mode on its own
  // once connectivity genuinely returns.
  useEffect(() => {
    if (!isListening) return;

    let cancelled = false;
    const runProbe = async () => {
      const healthy = await probeCloudConnectivity();
      if (cancelled) return;
      setConnectionMode(healthy ? 'cloud' : 'offline');
      audioEngineRef.current?.setForceOffline(!healthy);
    };

    void runProbe();
    const intervalId = window.setInterval(() => void runProbe(), 20000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [isListening]);

  // Automatic session recovery: continuously persist just the configuration needed to resume a live
  // service (languages, view mode) while listening is active, so a crash/reload/force-close mid-
  // service doesn't force the operator to reconfigure everything from scratch. Also saves on
  // `beforeunload` as a last-chance write for abrupt tab closes. Intentionally does NOT persist the
  // transcript itself (ephemeral, regenerated live) - only enough to safely restart listening.
  useEffect(() => {
    const persist = () => {
      saveSessionSnapshot({
        wasListening: isListening,
        speaker1SourceLang,
        targetLangCode,
        voiceViewMode,
        displayStyle,
      });
    };
    if (isListening) {
      persist();
      window.addEventListener('beforeunload', persist);
      return () => window.removeEventListener('beforeunload', persist);
    }
  }, [isListening, speaker1SourceLang, targetLangCode, voiceViewMode, displayStyle]);

  const handleResumeSession = useCallback(async () => {
    if (!recoverableSnapshot) return;
    setSpeaker1SourceLang(recoverableSnapshot.speaker1SourceLang);
    localStorage.setItem(STORAGE_KEY_SOURCE_LANG, recoverableSnapshot.speaker1SourceLang);
    speaker1LangRef.current = recoverableSnapshot.speaker1SourceLang;
    setTargetLangCode(recoverableSnapshot.targetLangCode);
    localStorage.setItem(STORAGE_KEY_TARGET_LANG, recoverableSnapshot.targetLangCode);
    targetLangRef.current = recoverableSnapshot.targetLangCode;
    setVoiceViewMode(recoverableSnapshot.voiceViewMode);
    voiceViewModeRef.current = recoverableSnapshot.voiceViewMode;
    setDisplayStyle(recoverableSnapshot.displayStyle);
    setRecoverableSnapshot(null);
    try {
      await toggleLiveMicrophone();
    } catch (err) {
      recordCrash(err, 'session-recovery-resume');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recoverableSnapshot]);

  const handleDismissRecovery = useCallback(() => {
    setRecoverableSnapshot(null);
    clearSessionSnapshot();
  }, []);

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [segments.length]);

  // Update Speaker 1 badge language when user changes Speaker 1 dropdown
  const handleChangeSpeaker1Language = (newLangCode: string) => {
    setSpeaker1SourceLang(newLangCode);
    localStorage.setItem(STORAGE_KEY_SOURCE_LANG, newLangCode);
    speaker1LangRef.current = newLangCode;

    // If live WebSocket is running, seamlessly reconnect with the new language (raw PCM needs no mic restart)
    if (deepgramWsRef.current && isListening) {
      void deepgramWsRef.current.reconnectWithLanguage(
        newLangCode,
        targetLangRef.current,
        customChurchGlossaryRef.current
      );
    } else if (deepgramWsRef.current) {
      deepgramWsRef.current.setLanguages(
        newLangCode,
        targetLangRef.current,
        customChurchGlossaryRef.current
      );
    }

    const langMeta = SUPPORTED_LANGUAGES.find((l) => l.code === newLangCode);
    setSpeakers((prev) =>
      prev.map((s) =>
        s.id === 'speaker_1'
          ? {
              ...s,
              detectedLanguageCode: newLangCode,
              detectedLanguageName:
                newLangCode === 'auto' ? 'Auto' : langMeta?.name || newLangCode,
            }
          : s
      )
    );
  };

  const handleChangeTargetLanguage = (newTargetCode: string) => {
    setTargetLangCode(newTargetCode);
    localStorage.setItem(STORAGE_KEY_TARGET_LANG, newTargetCode);
    targetLangRef.current = newTargetCode;
    speechEngineRef.current?.stopAll();

    const targetLangMeta = SUPPORTED_LANGUAGES.find((l) => l.code === newTargetCode);
    setSpeakers((prev) =>
      prev.map((s) =>
        s.id === 'speaker_2'
          ? {
              ...s,
              detectedLanguageCode: newTargetCode,
              detectedLanguageName: targetLangMeta?.name || newTargetCode,
            }
          : s
      )
    );

    setSegments((prev) =>
      prev.map((seg) => ({
        ...seg,
        targetLanguageCode: newTargetCode,
      }))
    );
  };

  const handleAddGlossaryTerm = (term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;
    setCustomChurchGlossary((prev) => {
      if (prev.includes(trimmed)) return prev;
      const updated = [...prev, trimmed];
      localStorage.setItem(STORAGE_KEY_CHURCH_GLOSSARY, JSON.stringify(updated));
      return updated;
    });
    // Dynamically notify live WebSocket if running
    if (deepgramWsRef.current) {
      deepgramWsRef.current.setLanguages(speaker1SourceLang, targetLangCode, [...customChurchGlossary, trimmed]);
    }
  };

  const handleRemoveGlossaryTerm = (term: string) => {
    setCustomChurchGlossary((prev) => {
      const updated = prev.filter((t) => t !== term);
      localStorage.setItem(STORAGE_KEY_CHURCH_GLOSSARY, JSON.stringify(updated));
      return updated;
    });
    // Dynamically notify live WebSocket if running
    if (deepgramWsRef.current) {
      const updated = customChurchGlossary.filter((t) => t !== term);
      deepgramWsRef.current.setLanguages(speaker1SourceLang, targetLangCode, updated);
    }
  };

  // Glossary auto-expansion, step 1: anyone can flag a mis-heard/mis-translated segment and suggest
  // the correct term. Flags start as "pending" and are never auto-applied to the live glossary —
  // see handleApproveCorrection below for the reviewed, operator-gated step that actually expands it.
  const handleFlagSegmentCorrection = (segment: TranslationSegment) => {
    const suggestion = window.prompt(
      `What should "${segment.originalText}" have said? (e.g. correct spelling of a name or theological term)`
    );
    const trimmed = suggestion?.trim();
    if (!trimmed) return;
    setFlaggedCorrections((prev) => {
      const updated = [
        ...prev,
        createFlaggedCorrection({
          segmentId: segment.id,
          speakerLabel: segment.speakerLabel,
          heardText: segment.originalText,
          correctedTerm: trimmed,
        }),
      ];
      saveFlaggedCorrections(updated);
      return updated;
    });
  };

  // Glossary auto-expansion, step 2: operator review. Approving a flagged correction adds the
  // suggested term to the same `customChurchGlossary` keyword-boost list used for manual entries —
  // it only grows the static glossary, it never fine-tunes or retrains any speech/translation model.
  const handleApproveCorrection = (correctionId: string) => {
    const correction = flaggedCorrections.find((c) => c.id === correctionId);
    if (!correction) return;
    handleAddGlossaryTerm(correction.correctedTerm);
    setFlaggedCorrections((prev) => {
      const updated = prev.map((c) =>
        c.id === correctionId ? { ...c, status: 'approved' as const } : c
      );
      saveFlaggedCorrections(updated);
      return updated;
    });
  };

  const handleRejectCorrection = (correctionId: string) => {
    setFlaggedCorrections((prev) => {
      const updated = prev.map((c) =>
        c.id === correctionId ? { ...c, status: 'rejected' as const } : c
      );
      saveFlaggedCorrections(updated);
      return updated;
    });
  };

  const handleSaveApiKey = (newKey: string) => {
    setApiKey(newKey);
    if (newKey) {
      localStorage.setItem(STORAGE_KEY_GEMINI, newKey);
      setErrorNotice(null);
    } else {
      localStorage.removeItem(STORAGE_KEY_GEMINI);
    }
  };

  const handleSaveDeepgramKey = (newKey: string) => {
    setDeepgramKey(newKey);
    if (newKey) {
      localStorage.setItem(STORAGE_KEY_DEEPGRAM, newKey);
      setErrorNotice(null);
    } else {
      localStorage.removeItem(STORAGE_KEY_DEEPGRAM);
    }
  };

  const handleSelectAiProvider = (provider: 'deepgram' | 'gemini') => {
    setAiProvider(provider);
    localStorage.setItem(STORAGE_KEY_AI_PROVIDER, provider);
  };

  const cycleDistanceBoost = () => {
    const next =
      boostPreset === 'normal'
        ? 'pew'
        : boostPreset === 'pew'
        ? 'back-row'
        : 'normal';
    setBoostPreset(next);
    const gainDb = next === 'normal' ? 2 : next === 'pew' ? 12 : 22;
    setAudioConfig((prev) => {
      const updated = { ...prev, preAmpGainDb: gainDb };
      audioEngineRef.current?.updateConfig({ preAmpGainDb: gainDb });
      return updated;
    });
  };

  const upsertSpeakerAndAppendSegment = useCallback(
    (params: {
      speakerId: string;
      speakerLabel: string;
      roleHint: 'main-speaker' | 'stage-interpreter' | 'worship-leader' | 'unknown';
      sourceLanguageCode: string;
      sourceLanguageName: string;
      detectedDialect?: string;
      originalText: string;
      translatedText: string;
      provider?: 'deepl' | 'gemini' | 'google-neural';
      backgroundNoiseNote?: string;
      latencyMs: number;
    }) => {
      const currentSpeakers = [...speakersRef.current];
      let speaker = currentSpeakers.find((s) => s.id === params.speakerId);

      if (!speaker) {
        const colorIndex = currentSpeakers.length % SPEAKER_PALETTE.length;
        const targetMeta = SUPPORTED_LANGUAGES.find((l) => l.code === targetLangRef.current);
        const speaker1Meta = SUPPORTED_LANGUAGES.find((l) => l.code === speaker1LangRef.current);
        speaker = {
          id: params.speakerId,
          label:
            params.speakerId === 'speaker_1'
              ? 'Speaker 1'
              : params.speakerId === 'speaker_2'
              ? 'Translator 2'
              : params.speakerLabel,
          roleHint: params.roleHint,
          detectedLanguageCode:
            params.speakerId === 'speaker_2'
              ? targetLangRef.current
              : params.speakerId === 'speaker_1' && speaker1LangRef.current !== 'auto'
              ? speaker1LangRef.current
              : params.sourceLanguageCode,
          detectedLanguageName:
            params.speakerId === 'speaker_2'
              ? targetMeta?.name || targetLangRef.current
              : params.speakerId === 'speaker_1' && speaker1LangRef.current !== 'auto'
              ? speaker1Meta?.name || speaker1LangRef.current
              : params.sourceLanguageName,
          detectedDialect: params.detectedDialect,
          accentColor: SPEAKER_PALETTE[colorIndex],
          segmentCount: 1,
          lastActiveAt: Date.now(),
          isIgnored: false,
        };
        currentSpeakers.push(speaker);
      } else {
        const targetMeta = SUPPORTED_LANGUAGES.find((l) => l.code === targetLangRef.current);
        const speaker1Meta = SUPPORTED_LANGUAGES.find((l) => l.code === speaker1LangRef.current);
        speaker = {
          ...speaker,
          detectedLanguageCode:
            params.speakerId === 'speaker_2'
              ? targetLangRef.current
              : params.speakerId === 'speaker_1' && speaker1LangRef.current !== 'auto'
              ? speaker1LangRef.current
              : params.sourceLanguageCode || speaker.detectedLanguageCode,
          detectedLanguageName:
            params.speakerId === 'speaker_2'
              ? targetMeta?.name || targetLangRef.current
              : params.speakerId === 'speaker_1' && speaker1LangRef.current !== 'auto'
              ? speaker1Meta?.name || speaker1LangRef.current
              : params.sourceLanguageName || speaker.detectedLanguageName,
          detectedDialect: params.detectedDialect || speaker.detectedDialect,
          segmentCount: speaker.segmentCount + 1,
          lastActiveAt: Date.now(),
        };
        const idx = currentSpeakers.findIndex((s) => s.id === params.speakerId);
        currentSpeakers[idx] = speaker;
      }

      setSpeakers(currentSpeakers);
      if (!speaker.isIgnored) {
        setActiveSpeakerId(params.speakerId);
      }

      const mode = voiceViewModeRef.current;
      const isMutedByLock =
        speaker.isIgnored ||
        (mode !== 'all' && mode !== 'split' && mode !== 'auto' && mode !== params.speakerId);

      const newSegment: TranslationSegment = {
        id: `seg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        timestamp: Date.now(),
        speakerId: params.speakerId,
        speakerLabel: speaker.label,
        sourceLanguageCode: params.sourceLanguageCode,
        sourceLanguageName: params.sourceLanguageName,
        detectedDialect: params.detectedDialect,
        originalText: params.originalText,
        translatedText: params.translatedText,
        targetLanguageCode: targetLangRef.current,
        provider: params.provider,
        isFilteredOut: isMutedByLock,
        backgroundNoiseNote: params.backgroundNoiseNote,
        latencyMs: params.latencyMs,
      };

      // Global duplicate guard: prevent adding consecutive identical segments
      const prevSegments = segmentsRef.current;
      const lastSegment = prevSegments.length > 0 ? prevSegments[prevSegments.length - 1] : null;
      if (lastSegment) {
        const normIncoming = params.originalText.trim().toLowerCase().replace(/^[.,?!;\s]+|[.,?!;\s]+$/g, '');
        const normLast = lastSegment.originalText.trim().toLowerCase().replace(/^[.,?!;\s]+|[.,?!;\s]+$/g, '');
        const timeDiff = Date.now() - lastSegment.timestamp;
        if (normIncoming && normIncoming === normLast && timeDiff < 8000) {
          return;
        }
      }

      setSegments((prev) => [...prev, newSegment]);

      // QR-code local caption distribution (Church-Cap-inspired): if the operator has an active
      // share session, publish this segment so any congregant's phone that scanned the QR code
      // (see CaptionShareQR / ListenerCaptionView) sees it appear within ~1.5s, with zero install.
      if (captionShareSessionIdRef.current && !isMutedByLock) {
        void publishCaptionSegment(captionShareSessionIdRef.current, {
          id: newSegment.id,
          speakerLabel: newSegment.speakerLabel,
          originalText: newSegment.originalText,
          translatedText: newSegment.translatedText,
          sourceLanguageName: newSegment.sourceLanguageName,
        });
      }

      // Detect scripture citations in real time across original and translated text
      const detectedRefs = [
        ...detectScriptureReferences(params.originalText),
        ...detectScriptureReferences(params.translatedText),
      ];
      if (detectedRefs.length > 0) {
        const primaryRef = detectedRefs[0];
        void fetchScriptureVerse(primaryRef, targetLangRef.current).then((data) => {
          if (data) {
            setActiveScripture(data);
            setIsScriptureExpanded(false);
          }
        });
      }

      const shouldSpeakInEarphones = !isMutedByLock && speechEngineRef.current;

      if (shouldSpeakInEarphones && speechEngineRef.current) {
        speechEngineRef.current.speakTranslation(
          params.translatedText,
          targetLangRef.current,
          false,
          apiKeyRef.current
        );
      }
    },
    []
  );

  const processAudioChunk = useCallback(
    async (audioBlob: Blob, mimeType: string, durationMs: number, sessionId: number) => {
      const activeProvider = aiProviderRef.current;
      const currentDgKey = deepgramKeyRef.current;
      const currentGeminiKey = apiKeyRef.current;

      if (sessionId !== listeningSessionIdRef.current || !isListeningRef.current) {
        return;
      }

      // Redundancy watchdog: If live WebSocket is actively producing translations within last 4.5 seconds,
      // skip REST chunk to avoid double-translation
      const timeSinceWs = Date.now() - lastWebSocketActivityRef.current;
      const isWsActivelyProducing = Boolean(deepgramWsRef.current?.isConnected() && timeSinceWs < 4500);
      if (isWsActivelyProducing) {
        return;
      }
      // 1. Process with Deepgram Nova-2 as Primary (Serverless backend proxy or client key)
      if (activeProvider === 'deepgram') {
        setIsProcessingChunk(true);
        let deepgramFailed = false;
        let deepgramError = '';

        try {
          const result = await transcribeAndTranslateWithDeepgram({
            audioBlob,
            mimeType,
            targetLanguageCode: targetLangRef.current,
            deepgramApiKey: currentDgKey || undefined,
            sourceLanguageCode: speaker1LangRef.current,
            customChurchGlossary: customChurchGlossaryRef.current,
          });

          if (result.utterances && result.utterances.length > 0) {
            setWallet((prev) => {
              const addedSec = Math.round(durationMs / 1000);
              const totalSec = prev.sessionSecondsUsed + addedSec;
              return {
                ...prev,
                sessionSecondsUsed: totalSec,
                minutesRemaining: Math.max(0, prev.totalMinutesPurchased - Math.floor(totalSec / 60)),
              };
            });

            for (const utt of result.utterances) {
              upsertSpeakerAndAppendSegment({
                speakerId: utt.speakerId,
                speakerLabel: utt.speakerLabel,
                roleHint: utt.speakerId === 'speaker_1' ? 'main-speaker' : 'worship-leader',
                sourceLanguageCode: utt.sourceLanguageCode,
                sourceLanguageName: utt.sourceLanguageName,
                detectedDialect: utt.detectedDialect,
                originalText: utt.originalText,
                translatedText: utt.translatedText,
                provider: 'deepl',
                backgroundNoiseNote: utt.backgroundNoiseNote,
                latencyMs: utt.latencyMs,
              });
            }
            consecutiveFailuresRef.current = 0;
            setErrorNotice(null);
            setIsProcessingChunk(false);
            return;
          } else {
            // Silence or pause in speech: natural gap between preacher sentences (not an error)
            consecutiveFailuresRef.current = 0;
            setErrorNotice(null);
            setIsProcessingChunk(false);
            return;
          }
        } catch (err) {
          deepgramFailed = true;
          deepgramError = err instanceof Error ? err.message : 'Deepgram request failed';
          console.warn('[Deepgram Chunk Error]:', deepgramError);
        }

        // Automatic Fallback to Google Gemini 2.5 Flash if Deepgram network request failed
        if (deepgramFailed) {
          try {
            const recentContext = segmentsRef.current
              .slice(-6)
              .map(
                (s) =>
                  `[${s.speakerLabel || 'Speaker'}]: "${s.originalText}" -> "${s.translatedText}"`
              );

            const geminiResult = await translateChurchStageAudioChunk({
              audioBlob,
              mimeType,
              targetLanguageCode: targetLangRef.current,
              preferredSourceLanguageCode: speaker1LangRef.current,
              recentContext,
              apiKey: currentGeminiKey || undefined,
            });

            if (geminiResult.utterances && geminiResult.utterances.length > 0) {
              setWallet((prev) => {
                const addedSec = Math.round(durationMs / 1000);
                const totalSec = prev.sessionSecondsUsed + addedSec;
                return {
                  ...prev,
                  sessionSecondsUsed: totalSec,
                  sessionTokensUsed: prev.sessionTokensUsed + geminiResult.tokensEstimated,
                  minutesRemaining: Math.max(
                    0,
                    prev.totalMinutesPurchased - Math.floor(totalSec / 60)
                  ),
                };
              });

              for (const utt of geminiResult.utterances) {
                upsertSpeakerAndAppendSegment({
                  speakerId: utt.speakerId || 'speaker_1',
                  speakerLabel: utt.speakerLabel || 'Speaker 1',
                  roleHint: utt.roleHint || 'main-speaker',
                  sourceLanguageCode: utt.sourceLanguageCode || 'en',
                  sourceLanguageName: utt.sourceLanguageName || 'English',
                  detectedDialect: utt.detectedDialect,
                  originalText: utt.originalText,
                  translatedText: utt.translatedText,
                  provider: 'gemini',
                  backgroundNoiseNote: utt.backgroundNoiseNote,
                  latencyMs: geminiResult.latencyMs,
                });
              }
              consecutiveFailuresRef.current = 0;
              setErrorNotice(null);
            }
          } catch (geminiErr) {
            consecutiveFailuresRef.current += 1;
            console.warn('[Pipeline Fallback Handshake]:', { deepgramError, geminiErr });
            // Only alert the user if 6 consecutive audio chunks completely fail with actual error
            if (consecutiveFailuresRef.current >= 6) {
              const cleanErr = deepgramError || (geminiErr instanceof Error ? geminiErr.message : '');
              setErrorNotice(cleanErr ? cleanErr.slice(0, 140) : 'Connecting to live stage feed...');
            }
          }
        }

        setIsProcessingChunk(false);
        return;
      }

      // 2. Process with Gemini 2.5 Flash directly if explicitly selected
      if (activeProvider === 'gemini') {
        setIsProcessingChunk(true);
        try {
          const recentContext = segmentsRef.current
            .slice(-6)
            .map(
              (s) =>
                `[${s.speakerLabel || 'Speaker'}]: "${s.originalText}" -> "${s.translatedText}"`
            );

          const result = await translateChurchStageAudioChunk({
            audioBlob,
            mimeType,
            targetLanguageCode: targetLangRef.current,
            preferredSourceLanguageCode: speaker1LangRef.current,
            recentContext,
            apiKey: currentGeminiKey || undefined,
          });

          setWallet((prev) => {
            const addedSec = Math.round(durationMs / 1000);
            const totalSec = prev.sessionSecondsUsed + addedSec;
            return {
              ...prev,
              sessionSecondsUsed: totalSec,
              sessionTokensUsed: prev.sessionTokensUsed + result.tokensEstimated,
              minutesRemaining: Math.max(
                0,
                prev.totalMinutesPurchased - Math.floor(totalSec / 60)
              ),
            };
          });

          for (const utt of result.utterances) {
            upsertSpeakerAndAppendSegment({
              speakerId: utt.speakerId || 'speaker_1',
              speakerLabel: utt.speakerLabel || 'Speaker 1',
              roleHint: utt.roleHint || 'main-speaker',
              sourceLanguageCode: utt.sourceLanguageCode || 'en',
              sourceLanguageName: utt.sourceLanguageName || 'English',
              detectedDialect: utt.detectedDialect,
              originalText: utt.originalText,
              translatedText: utt.translatedText,
              backgroundNoiseNote: utt.backgroundNoiseNote,
              latencyMs: result.latencyMs,
            });
          }
          consecutiveFailuresRef.current = 0;
          setErrorNotice(null);
        } catch (err) {
          consecutiveFailuresRef.current += 1;
          console.warn('[Gemini Direct Error]:', err);
          const rawMsg = err instanceof Error ? err.message : String(err);
          const isQuota = rawMsg.includes('429') || rawMsg.toLowerCase().includes('quota') || rawMsg.toLowerCase().includes('resource_exhausted');
          
          if (isQuota) {
            // Auto-fallback silently to Deepgram so streaming never stops for the user
            console.log('[Auto-Fallback] Gemini quota reached, automatically engaging Deepgram stream.');
            setAiProvider('deepgram');
            aiProviderRef.current = 'deepgram';
            try {
              localStorage.setItem(STORAGE_KEY_AI_PROVIDER, 'deepgram');
            } catch {}
            // Retry this current chunk immediately via Deepgram
            try {
              const retryDg = await transcribeAndTranslateWithDeepgram({
                audioBlob,
                mimeType,
                targetLanguageCode: targetLangRef.current,
                deepgramApiKey: currentDgKey || undefined,
                sourceLanguageCode: speaker1LangRef.current,
              });
              if (retryDg.utterances && retryDg.utterances.length > 0) {
                for (const utt of retryDg.utterances) {
                  upsertSpeakerAndAppendSegment({
                    speakerId: utt.speakerId,
                    speakerLabel: utt.speakerLabel,
                    roleHint: utt.speakerId === 'speaker_1' ? 'main-speaker' : 'worship-leader',
                    sourceLanguageCode: utt.sourceLanguageCode,
                    sourceLanguageName: utt.sourceLanguageName,
                    detectedDialect: utt.detectedDialect,
                    originalText: utt.originalText,
                    translatedText: utt.translatedText,
                    backgroundNoiseNote: utt.backgroundNoiseNote,
                    latencyMs: utt.latencyMs,
                  });
                }
                consecutiveFailuresRef.current = 0;
                setErrorNotice(null);
              }
            } catch {
              // Ignore fallback retry errors
            }
          } else if (consecutiveFailuresRef.current >= 3) {
            setErrorNotice(rawMsg.slice(0, 160));
          }
        } finally {
          setIsProcessingChunk(false);
        }
      }
    },
    [upsertSpeakerAndAppendSegment]
  );

  const handleAudioChunkReady = useCallback(
    (audioBlob: Blob, mimeType: string, durationMs: number) => {
      if (!isListeningRef.current) {
        return;
      }
      const sessionId = listeningSessionIdRef.current;
      if (restPendingRef.current >= 3) {
        return;
      }
      restPendingRef.current += 1;
      restQueueRef.current = restQueueRef.current
        .then(() => processAudioChunk(audioBlob, mimeType, durationMs, sessionId))
        .catch(() => {})
        .finally(() => {
          restPendingRef.current = Math.max(0, restPendingRef.current - 1);
        });
    },
    [processAudioChunk]
  );

  const toggleLiveMicrophone = async () => {
    if (isListening) {
      // Immediately invalidate any in-flight REST requests so nothing fires after Stop
      listeningSessionIdRef.current += 1;
      isListeningRef.current = false;
      recentSpokenRef.current = [];
      restQueueRef.current = Promise.resolve();
      restPendingRef.current = 0;
      // Signal user that any final audio chunk in flight is finishing cleanly
      setIsFinishingQueue(true);
      if (finishingQueueTimerRef.current !== null) {
        window.clearTimeout(finishingQueueTimerRef.current);
      }
      finishingQueueTimerRef.current = window.setTimeout(() => {
        setIsFinishingQueue(false);
      }, 3500);

      audioEngineRef.current?.stop();
      audioEngineRef.current = null;
      deepgramWsRef.current?.close();
      deepgramWsRef.current = null;
      fallbackEngineRef.current?.stop();
      fallbackEngineRef.current = null;
      offlineEdgeEngineRef.current?.stop();
      offlineEdgeEngineRef.current = null;
      speechEngineRef.current?.stopAll();
      setLiveInterimText('');
      setIsListening(false);
      setIsOfflineEdgeActive(false);
      // Intentional stop: clear the recovery snapshot so a "Resume previous session?" banner
      // doesn't incorrectly appear later for a session the operator deliberately ended.
      clearSessionSnapshot();
      return;
    }

    try {
      setErrorNotice(null);
      // Unlock mobile browser speech playback on user gesture
      speechEngineRef.current?.unlockAudio();

      // Automatic connectivity-health check (replaces the old manual "Offline Sanctuary Mode" toggle):
      // always attempt the cloud pipeline first for best accuracy, but verify it's actually reachable
      // (not just `navigator.onLine`) before committing to it. If the network is down or unusably
      // slow, start directly in the fully local pipeline — no operator action required, which matters
      // for missionaries/remote venues who won't know to flip a switch before the service starts.
      setConnectionMode('checking');
      const cloudHealthyAtStart = await probeCloudConnectivity();
      setConnectionMode(cloudHealthyAtStart ? 'cloud' : 'offline');
      if (!cloudHealthyAtStart) {
        setIsOfflineEdgeActive(true);
        if (!offlineEdgeEngineRef.current) {
          offlineEdgeEngineRef.current = new OfflineEdgeTranslator(
            speaker1LangRef.current,
            targetLangRef.current,
            (ev) => {
              upsertSpeakerAndAppendSegment({
                speakerId: 'speaker_1',
                speakerLabel: 'Speaker 1 (Offline Sanctuary Edge)',
                roleHint: 'main-speaker',
                sourceLanguageCode: ev.sourceLanguageCode,
                sourceLanguageName: ev.sourceLanguageName,
                originalText: ev.originalText,
                translatedText: ev.translatedText,
                latencyMs: ev.latencyMs,
              });
            }
          );
        }
        offlineEdgeEngineRef.current.start();
        setIsListening(true);
        return;
      }

      // If Deepgram is selected, connect direct low-latency WebSocket (using serverless token or stored key)
      if (aiProviderRef.current === 'deepgram') {
        try {
          const wsClient = new DeepgramLiveWebSocket(
            deepgramKeyRef.current || '',
            speaker1LangRef.current,
            targetLangRef.current,
            (seg) => {
              lastWebSocketActivityRef.current = Date.now();
              upsertSpeakerAndAppendSegment({
                speakerId: seg.speakerId,
                speakerLabel: seg.speakerLabel,
                roleHint: seg.speakerId === 'speaker_1' ? 'main-speaker' : 'worship-leader',
                sourceLanguageCode: seg.sourceLanguageCode,
                sourceLanguageName: seg.sourceLanguageName,
                originalText: seg.originalText,
                translatedText: seg.translatedText,
                provider: seg.provider,
                latencyMs: seg.latencyMs,
              });
            },
            (err) => {
              setErrorNotice(err);
            },
            (interim) => {
              setLiveInterimText(interim);
            },
            customChurchGlossaryRef.current
          );

          await wsClient.connect();
          deepgramWsRef.current = wsClient;
        } catch (wsErr) {
          console.warn('Deepgram WebSocket connection failed, falling back to REST chunking:', wsErr);
          deepgramWsRef.current = null;
        }
      }

      const engine = new ChurchAudioEngine(
        audioConfig,
        (blob, mime, dur) => {
          // Complete 3.5s standalone audio chunk with full container headers for Gemini / REST
          void handleAudioChunkReady(blob, mime, dur);
        },
        (snapshot) => setMeter(snapshot),
        () => {
          setIsListening(false);
          audioEngineRef.current = null;
          deepgramWsRef.current?.close();
          deepgramWsRef.current = null;
        },
        (pcmBuffer) => {
          // Instant 16kHz raw linear16 PCM frames for Deepgram Live WebSocket
          if (deepgramWsRef.current) {
            deepgramWsRef.current.sendAudio(pcmBuffer);
          }
        },
        (text, dur) => {
          // Offline Whisper fallback result: the network is down, so translate using the same
          // lightweight offline lexicon as "Offline Sanctuary Mode" instead of hitting a translate API.
          const srcLang = speaker1LangRef.current;
          const tgtLang = targetLangRef.current;
          if (!offlineEdgeEngineRef.current) {
            offlineEdgeEngineRef.current = new OfflineEdgeTranslator(srcLang, tgtLang, () => {});
          }
          const translated = offlineEdgeEngineRef.current.translateOffline(text, srcLang, tgtLang);
          const srcMeta = SUPPORTED_LANGUAGES.find((l) => l.code === srcLang);
          upsertSpeakerAndAppendSegment({
            speakerId: 'speaker_1',
            speakerLabel: 'Speaker 1 (Offline Whisper Fallback)',
            roleHint: 'main-speaker',
            sourceLanguageCode: srcLang,
            sourceLanguageName: srcMeta?.name || srcLang.toUpperCase(),
            originalText: text,
            translatedText: translated,
            latencyMs: dur,
          });
        }
      );
      await engine.start(audioConfig.audioSource || 'mic');
      audioEngineRef.current = engine;

      setIsListening(true);
    } catch (err) {
      recordCrash(err, 'toggleLiveMicrophone-start');
      const isMobile =
        typeof navigator !== 'undefined' &&
        /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
      const rawMsg = err instanceof Error ? err.message : '';
      const isPermissionDenied =
        rawMsg.toLowerCase().includes('permission denied') ||
        rawMsg.toLowerCase().includes('notallowederror') ||
        rawMsg.toLowerCase().includes('cancelled') ||
        rawMsg.toLowerCase().includes('canceled');

      let msg = rawMsg;
      if (audioConfig.audioSource === 'tab') {
        if (isMobile) {
          msg =
            'TAB / Online Sermon direct audio capture is only available on Desktop browsers (Chrome, Edge, Brave). On mobile devices, please use "Mic (Room)".';
        } else if (isPermissionDenied) {
          msg =
            'Tab audio capture was cancelled or denied. Please ensure you select a tab on desktop and check "Share tab audio", or switch to "Mic (Room)".';
        } else {
          msg = msg || 'Browser tab audio capture was cancelled or failed.';
        }
      } else {
        if (isPermissionDenied) {
          msg =
            'Microphone permission was denied. Please allow microphone access in your browser settings to listen.';
        } else {
          msg = msg || 'Microphone capture failed.';
        }
      }
      setErrorNotice(msg);
    }
  };

  const toggleIgnoreSpeaker = useCallback((speakerId: string) => {
    setSpeakers((prev) =>
      prev.map((s) =>
        s.id === speakerId ? { ...s, isIgnored: !s.isIgnored } : s
      )
    );
    speechEngineRef.current?.stopAll();
  }, []);

  // Design reference (not literal code): LiveKit's `live-translated-captioning` example lets every
  // listener independently "subscribe" to the language track they personally want, while a single
  // shared Deepgram + translation pipeline keeps producing segments for all tracks upstream. We mirror
  // that shape here on the client instead of over WebRTC data tracks:
  //   - `segments` / `speakers` = the single shared upstream stream (one DeepgramLiveWebSocket feeding
  //     both Speaker 1 and Speaker 2/Translator tracks, same as LiveKit's one-room-many-tracks model).
  //   - `voiceViewMode` = this listener's local "subscription" choice ('all' | 'auto' | 'split' |
  //     a specific speakerId), analogous to a LiveKit participant picking a track SID to subscribe to.
  //   - `visibleSegments` below is the per-listener projection/filter over the shared stream, i.e. the
  //     client-side equivalent of LiveKit's per-subscriber track selection, without needing a WebRTC SFU.
  // If we ever outgrow in-browser filtering (e.g. true multi-device fan-out), this is the seam where a
  // real per-listener subscription transport (LiveKit rooms/tracks or a lightweight pub/sub channel per
  // voiceViewMode) would slot in without changing how speakers/segments are produced.
  const visibleSegments = useMemo(() => {
    const ignoredIds = new Set(speakers.filter((s) => s.isIgnored).map((s) => s.id));
    const activeSegments = segments.filter((s) => !ignoredIds.has(s.speakerId));
    if (voiceViewMode === 'all' || voiceViewMode === 'split') {
      return activeSegments;
    }
    if (voiceViewMode === 'auto') {
      return activeSegments.filter((s) => s.speakerId === activeSpeakerId);
    }
    // Isolate a single speaker/language track for this listener (per-listener subscription projection)
    return activeSegments.filter((s) => s.speakerId === voiceViewMode);
  }, [segments, speakers, voiceViewMode, activeSpeakerId]);

  const currentVoiceModeMeta = useMemo(() => {
    if (voiceViewMode === 'all') {
      return {
        label: 'All Voices (Combined)',
        shortLabel: 'All Voices',
        color: '#38bdf8',
        tag: 'Combined',
      };
    }
    if (voiceViewMode === 'auto') {
      return {
        label: 'Auto-Follow Active',
        shortLabel: 'Auto-Follow',
        color: '#818cf8',
        tag: 'Smart',
      };
    }
    if (voiceViewMode === 'split') {
      return {
        label: '2-Window Split View',
        shortLabel: '2 Windows',
        color: '#fbbf24',
        tag: 'Dual',
      };
    }
    const matchedSpeaker = speakers.find((s) => s.id === voiceViewMode);
    if (matchedSpeaker) {
      const code =
        matchedSpeaker.id === 'speaker_1'
          ? speaker1SourceLang === 'auto'
            ? 'Auto'
            : speaker1SourceLang.toUpperCase()
          : matchedSpeaker.id === 'speaker_2'
          ? targetLangCode.toUpperCase()
          : (matchedSpeaker.detectedLanguageCode || '').toUpperCase();
      return {
        label: `${matchedSpeaker.label} (${code})`,
        shortLabel: matchedSpeaker.label,
        color: matchedSpeaker.accentColor,
        tag: 'Isolated',
        isIgnored: matchedSpeaker.isIgnored,
      };
    }
    return {
      label: 'All Voices',
      shortLabel: 'All Voices',
      color: '#38bdf8',
      tag: 'Combined',
    };
  }, [voiceViewMode, speakers, speaker1SourceLang, targetLangCode]);

  const textSizeClass =
    fontSizeScale === 'xl'
      ? 'text-xl leading-relaxed'
      : fontSizeScale === 'large'
      ? 'text-lg leading-relaxed'
      : 'text-base leading-relaxed';

  const originalTextSizeClass =
    fontSizeScale === 'xl'
      ? 'text-xs'
      : fontSizeScale === 'large'
      ? 'text-[11px]'
      : 'text-[10px]';

  const renderContinuousStream = (
    segmentList: TranslationSegment[],
    isCompact = false
  ) => {
    const turns: Array<{
      speakerId: string;
      speakerLabel: string;
      accentColor: string;
      sourceLanguageCode: string;
      sourceLanguageName?: string;
      detectedDialect?: string;
      timestamp: number;
      segments: TranslationSegment[];
    }> = [];

    for (const seg of segmentList) {
      const spk = speakers.find((s) => s.id === seg.speakerId);
      const lastTurn = turns[turns.length - 1];
      if (lastTurn && lastTurn.speakerId === seg.speakerId) {
        lastTurn.segments.push(seg);
      } else {
        turns.push({
          speakerId: seg.speakerId,
          speakerLabel: seg.speakerLabel || spk?.label || 'Speaker',
          accentColor: spk?.accentColor || '#38bdf8',
          sourceLanguageCode: seg.sourceLanguageCode,
          sourceLanguageName: seg.sourceLanguageName,
          detectedDialect: seg.detectedDialect || spk?.detectedDialect,
          timestamp: seg.timestamp,
          segments: [seg],
        });
      }
    }

    return (
      <div className="space-y-3.5">
        {turns.map((turn, tIdx) => {
          const isLatestTurn = tIdx === turns.length - 1;
          const fullTurnTranslation = turn.segments
            .map((s) => s.translatedText)
            .join(' ');

          return (
            <div
              key={`turn_${turn.speakerId}_${turn.timestamp}_${tIdx}`}
              className={`rounded-2xl transition-all duration-300 overflow-hidden ${
                isLatestTurn
                  ? 'bg-slate-900/90 border border-sky-500/30 shadow-lg'
                  : 'bg-slate-900/60 border border-slate-800/80 hover:border-slate-700/80'
              } ${isCompact ? 'p-3' : 'p-3.5'}`}
            >
              {/* Speaker Header Bar */}
              <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-slate-800/80">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                      isLatestTurn && isListening ? 'animate-pulse ring-2 ring-sky-400' : ''
                    }`}
                    style={{ backgroundColor: turn.accentColor }}
                  />
                  <span className="text-xs font-bold text-slate-100 truncate">
                    {turn.speakerLabel}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-800 text-sky-300 font-semibold uppercase shrink-0">
                    {turn.sourceLanguageCode}
                  </span>
                  {turn.detectedDialect && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 font-medium truncate hidden sm:inline">
                      {turn.detectedDialect}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] text-slate-500">
                    {new Date(turn.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      speechEngineRef.current?.speakTranslation(
                        fullTurnTranslation,
                        targetLangRef.current,
                        true,
                        apiKeyRef.current
                      )
                    }
                    className="p-1 rounded-md bg-slate-800 text-slate-400 hover:text-sky-300 hover:bg-slate-700 transition cursor-pointer"
                    title="Speak entire speaker turn in earphones"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Continuous Flowing Transcript */}
              <div className={`${textSizeClass} font-medium text-slate-100 space-y-2`}>
                <div className="leading-relaxed">
                  {turn.segments.map((seg) => (
                    <span
                      key={seg.id}
                      onClick={() =>
                        speechEngineRef.current?.speakTranslation(
                          seg.translatedText,
                          seg.targetLanguageCode,
                          true,
                          apiKeyRef.current
                        )
                      }
                      className="inline-block mr-1.5 mb-1 cursor-pointer group hover:bg-sky-500/15 hover:text-sky-200 rounded px-1.5 py-0.5 transition"
                      title="Tap to speak this sentence in earphones"
                    >
                      <span className="font-semibold text-white">{seg.translatedText}</span>
                      {showOriginalText && seg.originalText && (
                        <span
                          className={`block not-italic text-slate-400/90 italic ${originalTextSizeClass} font-normal mt-0.5 group-hover:text-slate-300`}
                        >
                          “{seg.originalText}”
                        </span>
                      )}
                    </span>
                  ))}
                  {isLatestTurn && isListening && liveInterimText && (
                    <span className="inline-block mr-1.5 mb-1 px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-300 font-normal italic animate-pulse">
                      {liveInterimText}...
                    </span>
                  )}
                  {isLatestTurn && isListening && (
                    <span className="inline-flex items-center ml-1">
                      <span className="w-1.5 h-3.5 bg-sky-400 animate-pulse inline-block align-middle rounded-sm" />
                    </span>
                  )}
                </div>

                {/* Real-time Acoustic Waveform Activity Indicator */}
                {isLatestTurn && isListening && (
                  <div className="pt-2 mt-1 border-t border-slate-800/60 flex items-center gap-2">
                    <Activity className="w-3.5 h-3.5 text-sky-400 animate-pulse shrink-0" />
                    <div className="flex items-center gap-0.5 h-3">
                      {[0.3, 0.7, 0.4, 0.9, 0.6, 0.2, 0.8, 0.5, 0.3].map((h, i) => (
                        <span
                          key={i}
                          className="w-1 bg-sky-400/80 rounded-full transition-all duration-150"
                          style={{
                            height: meter.isVoiceDetected
                              ? `${Math.max(3, Math.min(12, Math.round(h * 12 * (meter.normalizedLevel + 0.5))))}px`
                              : '3px',
                            opacity: meter.isVoiceDetected ? 1 : 0.3,
                          }}
                        />
                      ))}
                    </div>
                    <span className="text-[10px] text-slate-400 font-medium">
                      {meter.isVoiceDetected ? 'Stage Audio Active' : 'Waiting for Speech'}
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderLiveView = (segs: TranslationSegment[]) => {
    const targetSpeakerId = voiceViewMode === 'all' || voiceViewMode === 'auto' ? activeSpeakerId : voiceViewMode;
    const activeSpk = speakers.find((s) => s.id === targetSpeakerId) || speakers[0];
    const spkSegments = segs.filter((s) => s.speakerId === activeSpk?.id);
    const recentSegments = spkSegments.slice(-4);
    const latestSegment = recentSegments[recentSegments.length - 1];

    const textSizeClass =
      fontSizeScale === 'large'
        ? 'text-2xl sm:text-3xl'
        : fontSizeScale === 'xl'
        ? 'text-3xl sm:text-4xl'
        : 'text-xl sm:text-2xl';

    const originalTextSizeClass =
      fontSizeScale === 'large'
        ? 'text-sm'
        : fontSizeScale === 'xl'
        ? 'text-base'
        : 'text-xs';

    return (
      <div className="h-full flex flex-col justify-between py-2 space-y-4">
        {/* Focused Active Speaker Card */}
        <div className="flex-1 bg-gradient-to-b from-slate-900/95 to-slate-950 border border-sky-500/30 rounded-3xl p-5 flex flex-col justify-between shadow-2xl relative overflow-hidden">
          {/* Top Status & Speaker Banner */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
            <div className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-full animate-pulse shadow-sm"
                style={{ backgroundColor: activeSpk?.accentColor || '#38bdf8' }}
              />
              <span className="text-xs font-bold text-white tracking-wide">
                {activeSpk?.label || 'Speaker 1'} ({activeSpk?.detectedLanguageCode.toUpperCase()})
              </span>
              <span className="text-[10px] text-sky-300 font-semibold bg-sky-500/15 border border-sky-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-ping" />
                Live Teleprompter
              </span>
            </div>

            {latestSegment && (
              <button
                type="button"
                onClick={() =>
                  speechEngineRef.current?.speakTranslation(
                    latestSegment.translatedText,
                    latestSegment.targetLanguageCode,
                    true,
                    apiKeyRef.current
                  )
                }
                className="p-1.5 rounded-full bg-slate-800/80 text-slate-300 hover:text-sky-400 transition cursor-pointer"
                title="Speak in earphones"
              >
                <Volume2 className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Teleprompter Big Text Area */}
          <div className="my-auto py-4 space-y-3">
            {showOriginalText && latestSegment?.originalText && (
              <p className={`text-slate-400 italic ${originalTextSizeClass} leading-relaxed`}>
                “{latestSegment.originalText}”
              </p>
            )}

            <div className={`${textSizeClass} font-bold text-white leading-tight tracking-tight`}>
              {recentSegments.length > 0 ? (
                <>
                  {recentSegments.slice(0, -1).map((s) => (
                    <span key={s.id} className="text-slate-400/90 font-normal mr-2">
                      {s.translatedText}
                    </span>
                  ))}
                  <span className="text-white drop-shadow-sm">
                    {latestSegment?.translatedText}
                  </span>
                </>
              ) : (
                <span className="text-slate-500 font-normal italic text-lg">
                  Listening for stage speech...
                </span>
              )}

              {/* Live interim preview */}
              {isListening && liveInterimText && (
                <span className="text-sky-300 font-normal italic ml-2 animate-pulse">
                  {liveInterimText}...
                </span>
              )}
              {isListening && (
                <span className="inline-block w-2 h-5 bg-sky-400 animate-pulse ml-1.5 align-middle rounded-sm" />
              )}
            </div>
          </div>

          {/* Bottom Live Acoustic Waveform Status */}
          <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-sky-400 animate-pulse shrink-0" />
              <div className="flex items-center gap-0.5 h-3">
                {[0.4, 0.8, 0.5, 1.0, 0.7, 0.3, 0.9, 0.6, 0.4].map((h, i) => (
                  <span
                    key={i}
                    className="w-1 bg-sky-400/80 rounded-full transition-all duration-150"
                    style={{
                      height: meter.isVoiceDetected
                        ? `${Math.max(3, Math.min(12, Math.round(h * 12 * (meter.normalizedLevel + 0.5))))}px`
                        : '3px',
                      opacity: meter.isVoiceDetected ? 1 : 0.3,
                    }}
                  />
                ))}
              </div>
              <span className="text-[11px] font-medium text-slate-300">
                {meter.isVoiceDetected ? 'Vocal Wave Active' : 'Listening...'}
              </span>
            </div>

            <span className="text-[10px] text-slate-500">
              {recentSegments.length} turns spoken
            </span>
          </div>
        </div>
      </div>
    );
  };

  const renderSegmentCard = (seg: TranslationSegment, compact = false) => {
    const spk = speakers.find((s) => s.id === seg.speakerId);
    return (
      <div
        key={seg.id}
        onClick={() =>
          speechEngineRef.current?.speakTranslation(
            seg.translatedText,
            seg.targetLanguageCode,
            true,
            apiKeyRef.current
          )
        }
        className={`rounded-2xl bg-slate-900/90 border border-slate-800/90 hover:border-slate-700 transition cursor-pointer ${
          compact ? 'p-3' : 'p-4'
        }`}
      >
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-1.5">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: spk?.accentColor || '#38bdf8' }}
            />
            <span className="text-[11px] font-semibold text-slate-300">
              {seg.speakerLabel} ({seg.sourceLanguageCode.toUpperCase()})
            </span>
            {seg.detectedDialect && (
              <span className="text-[10px] text-amber-300/90 bg-amber-500/10 px-1.5 py-0.5 rounded">
                {seg.detectedDialect}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span
              onClick={(e) => {
                e.stopPropagation();
                handleFlagSegmentCorrection(seg);
              }}
              title="Flag a mis-heard word to improve the church glossary"
              className="inline-flex"
            >
              <Flag className="w-3.5 h-3.5 text-slate-600 hover:text-amber-400" />
            </span>
            <Volume2 className="w-3.5 h-3.5 text-slate-500 hover:text-sky-400" />
          </div>
        </div>

        {showOriginalText && (
          <p className={`text-slate-400 mb-1.5 italic ${originalTextSizeClass}`}>
            “{seg.originalText}”
          </p>
        )}

        <p
          className={`${
            compact ? 'text-base' : textSizeClass
          } font-semibold text-white leading-snug`}
        >
          {seg.translatedText}
        </p>
      </div>
    );
  };

  if (listenerSessionId) {
    const langMeta = SUPPORTED_LANGUAGES.find((l) => l.code === listenerLangCode);
    return <ListenerCaptionView sessionId={listenerSessionId} targetLangName={langMeta?.name} />;
  }

  if (obsSessionId) {
    const langMeta = SUPPORTED_LANGUAGES.find((l) => l.code === listenerLangCode);
    return <BroadcastOverlayView sessionId={obsSessionId} targetLangName={langMeta?.name} />;
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center sm:p-6">
      {/* ANDROID PHONE MOCKUP FRAME */}
      <div className="w-full sm:w-[400px] h-screen sm:h-[820px] bg-slate-950 sm:rounded-[46px] sm:border-[10px] sm:border-slate-800 sm:shadow-[0_25px_70px_rgba(0,0,0,0.85)] flex flex-col overflow-hidden relative select-none">
        {/* Android Top Camera Punch-Hole & Status Bar */}
        <div className="px-6 pt-2.5 pb-1.5 flex items-center justify-between text-[11px] text-slate-300 font-medium bg-slate-950 shrink-0">
          <span>09:41</span>
          <div className="w-3.5 h-3.5 rounded-full bg-black border border-slate-800 hidden sm:block" />
          <div className="flex items-center gap-1.5 text-slate-400">
            <Signal className="w-3 h-3" />
            <Wifi className="w-3 h-3" />
            <BatteryCharging className="w-3.5 h-3.5 text-emerald-400" />
          </div>
        </div>

        {/* Clean App Header inside Phone */}
        <header className="px-4 py-2.5 flex items-center justify-between border-b border-slate-900 shrink-0">
          <div className="flex items-center gap-2">
            {isFocusMode && (
              <button
                type="button"
                onClick={() => setIsFocusMode(false)}
                className="p-1 -ml-1 rounded-lg bg-slate-900 border border-slate-800 text-sky-400 hover:text-white flex items-center gap-1 text-[11px] font-semibold transition cursor-pointer"
                title="Back to Home Screen"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>
            )}
            <span className="w-2.5 h-2.5 rounded-full bg-sky-400" />
            <span className="font-bold text-sm text-white tracking-tight">
              SanctuaryVoice
            </span>
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-sky-950/80 border border-sky-800/60 text-sky-300 font-medium">
              Sanctuary Net
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIsFocusMode((prev) => !prev)}
              className={`p-1.5 rounded-full transition cursor-pointer ${
                isFocusMode
                  ? 'bg-sky-500 text-slate-950 shadow-sm'
                  : 'bg-slate-900 text-slate-400 hover:text-white'
              }`}
              title={isFocusMode ? 'Show controls' : 'Pew Focus Mode (Full Screen Subtitles)'}
            >
              {isFocusMode ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>

            {segments.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  speechEngineRef.current?.stopAll();
                  setSegments([]);
                }}
                className="p-1.5 rounded-full bg-slate-900 text-slate-400 hover:text-white cursor-pointer"
                title="Clear captions"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="p-1.5 rounded-full bg-slate-900 text-slate-300 hover:text-white cursor-pointer"
              title="Settings & Pre-Paid Minutes"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Source (Speaker 1) & Target ("Translate to") Language Selectors */}
        {!isFocusMode && (
          <div className="px-4 py-2.5 bg-slate-900/60 border-b border-slate-900 grid grid-cols-2 gap-2 shrink-0 animate-in fade-in duration-200">
            <div>
              <label className="block text-[10px] text-slate-400 font-medium mb-1">
                Speaker 1 Language:
              </label>
              <select
                value={speaker1SourceLang}
                onChange={(e) => handleChangeSpeaker1Language(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-white focus:outline-none focus:border-sky-500"
              >
                <option value="auto">✨ Auto-Detect (EN/EU)</option>
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.flag} {lang.name}
                  </option>
                ))}
              </select>
              {speaker1SourceLang === 'auto' && (
                <p className="text-[9px] text-amber-400/90 mt-1 leading-tight">
                  Tip: Pick Korean, Tagalog, or Chinese directly for best accuracy.
                </p>
              )}
            </div>

            <div>
              <label className="block text-[10px] text-sky-400 font-semibold mb-1">
                Translate To (My Earphones):
              </label>
              <select
                value={targetLangCode}
                onChange={(e) => handleChangeTargetLanguage(e.target.value)}
                className="w-full bg-slate-900 border border-sky-500/40 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-white focus:outline-none focus:border-sky-400"
              >
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.flag} {lang.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Compact Stage Voice Selection Bar (Option 2) */}
        {!isFocusMode && (
          <div className="px-3.5 py-1.5 bg-slate-950 border-b border-slate-900 flex items-center justify-between gap-2 shrink-0 animate-in fade-in duration-200">
            {/* Compact Dropdown Trigger */}
            <button
              type="button"
              onClick={() => setIsVoiceSelectorOpen(true)}
              className="px-2.5 py-1 rounded-full bg-slate-900 hover:bg-slate-800/90 border border-slate-800 hover:border-slate-700 text-slate-200 text-[11px] font-semibold flex items-center gap-1.5 transition cursor-pointer max-w-[68%] shrink-0 shadow-sm"
              title="Click to select stage voice channel, isolate preacher, or toggle 2-window view"
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: currentVoiceModeMeta.color }}
              />
              <span className="truncate">
                {currentVoiceModeMeta.label}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0 ml-0.5" />
            </button>

            {/* Stage Speaker Activity Status / Active Channel Info */}
            <div className="flex items-center gap-1.5 overflow-hidden text-[10px] text-slate-400">
              {isListening ? (
                <div className="flex items-center gap-1 bg-slate-900/80 px-2 py-0.5 rounded-md border border-slate-800/80 truncate">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                  <span className="truncate text-slate-300">
                    Live: {speakers.find((s) => s.id === activeSpeakerId)?.label || 'Speaker 1'}
                  </span>
                </div>
              ) : (
                <span className="text-[10px] text-slate-500 truncate">
                  {speakers.length} Voices Detected
                </span>
              )}
            </div>
          </div>
        )}

        {/* Voice Channel Dropdown Modal / Bottom Sheet */}
        {isVoiceSelectorOpen && (
          <div
            className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
            onClick={() => setIsVoiceSelectorOpen(false)}
          >
            <div
              className="bg-slate-900 border border-slate-800 rounded-t-2xl sm:rounded-2xl max-w-md w-full p-4 sm:p-5 space-y-4 shadow-2xl max-h-[85vh] overflow-y-auto animate-in slide-in-from-bottom-4 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400">
                    <Mic className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-100 leading-tight">
                      Stage Voice Channel
                    </h3>
                    <p className="text-[10px] text-slate-400">
                      Select voice feed to follow, isolate, or split
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsVoiceSelectorOpen(false)}
                  className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition cursor-pointer"
                  title="Close channel selector"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Options List */}
              <div className="space-y-1.5">
                {/* 1. All Voices (Combined) */}
                <button
                  type="button"
                  onClick={() => {
                    setVoiceViewMode('all');
                    speechEngineRef.current?.stopAll();
                    setIsVoiceSelectorOpen(false);
                  }}
                  className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between transition cursor-pointer ${
                    voiceViewMode === 'all'
                      ? 'bg-sky-500/10 border-sky-500/50 text-white'
                      : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700 text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-sky-400/20 text-sky-400 flex items-center justify-center shrink-0">
                      <Users className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold flex items-center gap-1.5">
                        <span>✨ All Voices (Combined Stream)</span>
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-sky-400/20 text-sky-300 font-normal">
                          Default
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-tight mt-0.5">
                        Streams both speakers with color-coded badges
                      </p>
                    </div>
                  </div>
                  {voiceViewMode === 'all' && (
                    <Check className="w-4 h-4 text-sky-400 shrink-0" />
                  )}
                </button>

                {/* 2. Auto-Follow Active Speaker */}
                <button
                  type="button"
                  onClick={() => {
                    setVoiceViewMode('auto');
                    speechEngineRef.current?.stopAll();
                    setIsVoiceSelectorOpen(false);
                  }}
                  className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between transition cursor-pointer ${
                    voiceViewMode === 'auto'
                      ? 'bg-indigo-500/10 border-indigo-500/50 text-white'
                      : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700 text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-indigo-400/20 text-indigo-400 flex items-center justify-center shrink-0">
                      <Sparkles className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold">
                        ⚡ Auto-Follow Active Voice
                      </div>
                      <p className="text-[10px] text-slate-400 leading-tight mt-0.5">
                        Switches focus automatically to whichever person is speaking
                      </p>
                    </div>
                  </div>
                  {voiceViewMode === 'auto' && (
                    <Check className="w-4 h-4 text-indigo-400 shrink-0" />
                  )}
                </button>

                {/* Individual Speaker Channels */}
                <div className="pt-1 pb-0.5">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1 mb-1">
                    Isolate Individual Speaker
                  </div>
                </div>

                {speakers.map((spk) => {
                  const isSelected = voiceViewMode === spk.id;
                  const isActiveSpeaking = activeSpeakerId === spk.id;
                  const displayCode =
                    spk.id === 'speaker_1'
                      ? speaker1SourceLang === 'auto'
                        ? 'Auto-Detect'
                        : speaker1SourceLang.toUpperCase()
                      : spk.id === 'speaker_2'
                      ? targetLangCode.toUpperCase()
                      : (spk.detectedLanguageCode || '').toUpperCase();

                  const subtitleText =
                    spk.id === 'speaker_1'
                      ? 'Lead Preacher / Pulpit Mic'
                      : spk.id === 'speaker_2'
                      ? 'Stage Interpreter / Co-Speaker'
                      : `Voice Channel ${spk.label}`;

                  return (
                    <div
                      key={spk.id}
                      className={`p-2.5 rounded-xl border flex items-center justify-between transition ${
                        isSelected
                          ? 'bg-sky-500/10 border-sky-500/50 text-white'
                          : spk.isIgnored
                          ? 'bg-slate-950/40 border-slate-800/40 text-slate-500 opacity-70'
                          : 'bg-slate-950/60 border-slate-800/80 text-slate-300'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          if (spk.isIgnored) {
                            toggleIgnoreSpeaker(spk.id);
                          }
                          setVoiceViewMode(spk.id);
                          speechEngineRef.current?.stopAll();
                          setIsVoiceSelectorOpen(false);
                        }}
                        className="flex items-center gap-2.5 flex-1 text-left cursor-pointer min-w-0 mr-2"
                      >
                        <div
                          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 relative"
                          style={{ backgroundColor: `${spk.accentColor}20`, color: spk.accentColor }}
                        >
                          <User className="w-3.5 h-3.5" />
                          {isActiveSpeaking && isListening && !spk.isIgnored && (
                            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold flex items-center gap-1.5 truncate">
                            <span className={spk.isIgnored ? 'line-through' : ''}>
                              {spk.label} ({displayCode})
                            </span>
                            {spk.isIgnored && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300">
                                Muted
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-400 leading-tight mt-0.5 truncate">
                            {subtitleText}
                          </p>
                        </div>
                      </button>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* Mute/Unmute Action */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleIgnoreSpeaker(spk.id);
                          }}
                          className={`p-1.5 rounded-lg border text-[10px] font-semibold flex items-center gap-1 transition cursor-pointer ${
                            spk.isIgnored
                              ? 'bg-rose-500/20 border-rose-500/40 text-rose-300 hover:bg-rose-500/30'
                              : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white hover:bg-slate-700'
                          }`}
                          title={spk.isIgnored ? `Unmute ${spk.label}` : `Mute ${spk.label}`}
                        >
                          {spk.isIgnored ? (
                            <>
                              <VolumeX className="w-3 h-3 text-rose-400" />
                              <span>Unmute</span>
                            </>
                          ) : (
                            <>
                              <Volume2 className="w-3 h-3" />
                              <span>Mute</span>
                            </>
                          )}
                        </button>
                        {isSelected && !spk.isIgnored && (
                          <Check className="w-4 h-4 text-sky-400 shrink-0 ml-1" />
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* 2 Windows Split View */}
                <div className="pt-1 pb-0.5">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1 mb-1">
                    Multi-Window Layout
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setVoiceViewMode('split');
                    speechEngineRef.current?.stopAll();
                    setIsVoiceSelectorOpen(false);
                  }}
                  className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between transition cursor-pointer ${
                    voiceViewMode === 'split'
                      ? 'bg-amber-500/10 border-amber-500/50 text-white'
                      : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700 text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-amber-400/20 text-amber-400 flex items-center justify-center shrink-0">
                      <Rows2 className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold">
                        🪟 2-Window Split View
                      </div>
                      <p className="text-[10px] text-slate-400 leading-tight mt-0.5">
                        Side-by-side columns for Lead Preacher and Stage Interpreter
                      </p>
                    </div>
                  </div>
                  {voiceViewMode === 'split' && (
                    <Check className="w-4 h-4 text-amber-400 shrink-0" />
                  )}
                </button>
              </div>

              {/* Modal Footer */}
              <div className="pt-2 border-t border-slate-800 flex justify-end">
                <button
                  type="button"
                  onClick={() => setIsVoiceSelectorOpen(false)}
                  className="w-full py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Focus Mode Sticky Banner */}
        {isFocusMode && (
          <div className="px-3.5 py-1 bg-slate-900/90 border-b border-sky-500/30 flex items-center justify-between text-[11px] text-slate-300 shrink-0">
            <span className="flex items-center gap-1.5 text-sky-300 font-semibold text-[10px]">
              <Sparkles className="w-3 h-3" /> Focus View: {speaker1SourceLang.toUpperCase()} → {targetLangCode.toUpperCase()}
            </span>
            <button
              type="button"
              onClick={() => setIsFocusMode(false)}
              className="text-[10px] text-slate-400 hover:text-white underline cursor-pointer"
            >
              Show Controls
            </button>
          </div>
        )}

        {/* Reading Controls Toolbar: Continuous vs Cards, Original Language Toggle, Font Size */}
        <div className="px-3.5 py-1.5 bg-slate-950/80 border-b border-slate-900/80 flex items-center justify-between text-[11px] text-slate-400 shrink-0">
          <div className="flex items-center gap-1 bg-slate-900/90 p-0.5 rounded-lg border border-slate-800">
            <button
              type="button"
              onClick={() => setDisplayStyle('continuous')}
              className={`px-2 py-0.5 rounded-md text-[10px] font-semibold flex items-center gap-1 transition cursor-pointer ${
                displayStyle === 'continuous'
                  ? 'bg-sky-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Continuous live transcript flow"
            >
              <AlignLeft className="w-3 h-3" />
              Continuous
            </button>
            <button
              type="button"
              onClick={() => setDisplayStyle('live')}
              className={`px-2 py-0.5 rounded-md text-[10px] font-semibold flex items-center gap-1 transition cursor-pointer ${
                displayStyle === 'live'
                  ? 'bg-sky-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Focused Live Teleprompter for active speaker"
            >
              <Tv className="w-3 h-3" />
              Live
            </button>
            <button
              type="button"
              onClick={() => setDisplayStyle('cards')}
              className={`px-2 py-0.5 rounded-md text-[10px] font-semibold flex items-center gap-1 transition cursor-pointer ${
                displayStyle === 'cards'
                  ? 'bg-sky-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Individual segment cards"
            >
              <LayoutGrid className="w-3 h-3" />
              Cards
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowOriginalText((prev) => !prev)}
              className={`text-[10px] px-2 py-0.5 rounded-md border transition cursor-pointer ${
                showOriginalText
                  ? 'bg-slate-900 border-sky-500/40 text-sky-300 font-medium'
                  : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-400'
              }`}
              title="Toggle original church speech subtitles"
            >
              {showOriginalText ? 'Original: ON' : 'Original: OFF'}
            </button>

            <div className="flex items-center bg-slate-900 border border-slate-800 rounded-md p-0.5 gap-0.5">
              {(['normal', 'large', 'xl'] as const).map((sz) => (
                <button
                  key={sz}
                  type="button"
                  onClick={() => setFontSizeScale(sz)}
                  className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase transition cursor-pointer ${
                    fontSizeScale === sz
                      ? 'bg-slate-800 text-sky-400'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {sz === 'normal' ? 'A' : sz === 'large' ? 'A+' : 'A++'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Smart Floating Scripture Banner */}
        {activeScripture && (
          <div className="mx-4 mt-2 bg-gradient-to-r from-amber-950/80 via-slate-900 to-amber-950/70 border border-amber-500/40 rounded-2xl p-3 shadow-xl animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between gap-2 mb-1">
              <div
                onClick={() => setIsScriptureExpanded((prev) => !prev)}
                className="flex items-center gap-1.5 cursor-pointer flex-1"
              >
                <BookOpen className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="text-xs font-bold text-amber-300">
                  {activeScripture.reference}
                </span>
                <span className="text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded-full font-medium">
                  {activeScripture.translation}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    speechEngineRef.current?.speakTranslation(
                      `${activeScripture.reference}. ${activeScripture.text}`,
                      targetLangRef.current,
                      true,
                      apiKeyRef.current
                    )
                  }
                  className="p-1 rounded-md text-amber-300 hover:text-white cursor-pointer"
                  title="Read verse in earphones"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setActiveScripture(null)}
                  className="p-1 rounded-md text-slate-400 hover:text-white cursor-pointer"
                  title="Dismiss"
                >
                  ✕
                </button>
              </div>
            </div>

            <p
              onClick={() => setIsScriptureExpanded((prev) => !prev)}
              className={`text-xs text-amber-100/90 leading-relaxed cursor-pointer ${
                isScriptureExpanded ? '' : 'line-clamp-2'
              }`}
            >
              “{activeScripture.text}”
            </p>
          </div>
        )}

        {/* Automatic Session Recovery Banner: shown after a crash/reload/force-close interrupted a
           live service, letting the operator resume with one tap instead of reconfiguring languages
           and view mode from scratch. */}
        {recoverableSnapshot && !isListening && (
          <div className="mx-4 mt-2 p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/30 text-[11px] text-sky-200 flex flex-col gap-1.5 shadow-sm">
            <span className="leading-snug font-medium">
              It looks like your last service was interrupted. Resume where you left off?
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleResumeSession()}
                className="px-2.5 py-1 rounded-lg bg-sky-500 text-slate-950 font-bold text-[10px] flex items-center gap-1 shadow hover:bg-sky-400 transition cursor-pointer"
              >
                <Mic className="w-3 h-3" />
                Resume Previous Session
              </button>
              <button
                type="button"
                onClick={handleDismissRecovery}
                className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 font-semibold text-[10px] hover:bg-slate-700 transition cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Finishing In-Flight Queue Pill */}
        {isFinishingQueue && (
          <div className="mx-4 mt-2 px-3 py-1.5 rounded-xl bg-sky-500/10 border border-sky-500/30 text-[11px] text-sky-300 flex items-center justify-between animate-in fade-in duration-150">
            <span className="flex items-center gap-1.5 font-medium">
              <span className="w-2 h-2 rounded-full bg-sky-400 animate-ping" />
              Finalizing last translated sentence...
            </span>
          </div>
        )}

        {/* Error Notice if any */}
        {errorNotice && (
          <div className="mx-4 mt-2 p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-[11px] text-rose-200 flex flex-col gap-1.5 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <span className="leading-snug flex-1">{errorNotice}</span>
              <button
                type="button"
                onClick={() => setErrorNotice(null)}
                className="text-rose-300 font-bold px-1 hover:text-white shrink-0 cursor-pointer"
              >
                ✕
              </button>
            </div>
            {errorNotice.includes('Deepgram') && (
              <button
                type="button"
                onClick={() => {
                  handleSelectAiProvider('deepgram');
                  setErrorNotice(null);
                }}
                className="self-start px-2.5 py-1 rounded-lg bg-sky-500 text-slate-950 font-bold text-[10px] flex items-center gap-1 shadow hover:bg-sky-400 transition cursor-pointer"
              >
                <Zap className="w-3 h-3" />
                Switch to Deepgram (Recommended)
              </button>
            )}
            {audioConfig.audioSource === 'tab' && (
              <button
                type="button"
                onClick={() => {
                  setAudioConfig((prev) => ({ ...prev, audioSource: 'mic' }));
                  setErrorNotice(null);
                }}
                className="self-start px-2.5 py-1 rounded-lg bg-sky-500 text-slate-950 font-bold text-[10px] flex items-center gap-1 shadow hover:bg-sky-400 transition cursor-pointer"
              >
                <Mic className="w-3 h-3" />
                Switch to Mic (Room)
              </button>
            )}
          </div>
        )}

        {/* Tab Audio Streaming Active Banner */}
        {isListening && audioConfig.audioSource === 'tab' && (
          <div className="mx-4 mt-2 px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-[11px] text-emerald-300 flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Direct TAB / Online Sermon Stream Active (Pristine Digital Audio)
            </span>
          </div>
        )}

        {/* MAIN TRANSLATION READER AREA */}
        <main className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {/* Offline Warning Banner if connection drops */}
          {!isOnline && (
            <div className="mx-4 mt-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center justify-between text-xs text-amber-300">
              <span className="flex items-center gap-1.5 font-medium">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                Offline Sanctuary Mode (Local On-Device Engine)
              </span>
              <span className="text-[10px] text-amber-400/80">No Internet Required</span>
            </div>
          )}

          {/* Real-time Diagnostics Badge when listening */}
          {isListening && (
            <div className="px-2.5 py-1 bg-slate-900/90 border border-slate-800 rounded-lg flex items-center justify-between text-[10px] text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${isOfflineEdgeActive ? 'bg-amber-400 animate-pulse' : meter.isVoiceDetected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                {isOfflineEdgeActive
                  ? 'Offline Sanctuary Mode Active'
                  : meter.isVoiceDetected
                  ? 'Voice Detected'
                  : 'Listening for Voice...'} {!isOfflineEdgeActive && `(${meter.rmsDb} dB)`}
              </span>
              <span>
                Engine: {isOfflineEdgeActive ? 'On-Device NPU/Edge' : deepgramWsRef.current ? 'Live WebSocket + DeepL' : 'Direct REST'}
              </span>
            </div>
          )}

          {visibleSegments.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-6 space-y-3">
              <div className="w-14 h-14 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center">
                <Headphones className="w-6 h-6 text-sky-400" />
              </div>
              <div className="space-y-1">
                <h2 className="text-base font-bold text-white">
                  {voiceViewMode === 'auto'
                    ? 'Auto-Follow Active Speaker'
                    : voiceViewMode === 'speaker_1'
                    ? 'Continuous Stream • Speaker 1'
                    : voiceViewMode === 'speaker_2'
                    ? 'Continuous Stream • Translator 2'
                    : voiceViewMode === 'split'
                    ? '2-Window Split Mode Ready'
                    : 'Ready in Church (Continuous Stream)'}
                </h2>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Put your earphones on and tap the microphone below or switch to TAB / Online Sermon to stream live church audio.
                </p>
              </div>
            </div>
          ) : voiceViewMode === 'split' && speakers.length >= 2 ? (
            /* 2-Window Split View (Top Window: Speaker 1, Bottom Window: Translator 2) */
            <div className="h-full flex flex-col gap-3">
              {speakers.slice(0, 2).map((spk) => {
                const spkSegments = segments.filter((s) => s.speakerId === spk.id);
                const displayName =
                  spk.id === 'speaker_1'
                    ? speaker1SourceLang === 'auto'
                      ? 'Auto-Detect'
                      : SUPPORTED_LANGUAGES.find((l) => l.code === speaker1SourceLang)?.name || speaker1SourceLang
                    : spk.id === 'speaker_2'
                    ? SUPPORTED_LANGUAGES.find((l) => l.code === targetLangCode)?.name || targetLangCode
                    : spk.detectedLanguageName;

                return (
                  <div
                    key={spk.id}
                    className="flex-1 bg-slate-900/40 border border-slate-800 rounded-2xl flex flex-col overflow-hidden"
                  >
                    <div className="px-3 py-1.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-1.5 font-bold text-slate-200">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            activeSpeakerId === spk.id && isListening ? 'animate-pulse' : ''
                          }`}
                          style={{ backgroundColor: spk.accentColor }}
                        />
                        {spk.label} • {displayName}
                      </div>
                      <button
                        type="button"
                        onClick={() => setVoiceViewMode(spk.id)}
                        className="text-sky-400 font-semibold cursor-pointer hover:underline"
                      >
                        Only This Voice
                      </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
                      {spkSegments.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-center text-slate-500 text-xs">
                          Waiting for {spk.label}...
                        </div>
                      ) : displayStyle === 'continuous' ? (
                        renderContinuousStream(spkSegments, true)
                      ) : displayStyle === 'live' ? (
                        renderLiveView(spkSegments)
                      ) : (
                        spkSegments.map((seg) => renderSegmentCard(seg, true))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Clean Single Scrollable Feed (Continuous Stream or Cards) */
            <>
              {voiceViewMode !== 'all' && (
                <div className="flex items-center justify-between px-2.5 py-1.5 bg-sky-500/10 border border-sky-500/25 rounded-xl text-xs text-sky-200">
                  <div className="flex items-center gap-1.5 font-medium">
                    <Radio className="w-3.5 h-3.5 text-sky-400 animate-pulse" />
                    <span>
                      {voiceViewMode === 'auto'
                        ? `Auto-Following: ${speakers.find((s) => s.id === activeSpeakerId)?.label || 'Active Speaker'}`
                        : `Viewing: ${speakers.find((s) => s.id === voiceViewMode)?.label || voiceViewMode}`}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setVoiceViewMode('all')}
                    className="text-sky-400 font-bold hover:text-white cursor-pointer"
                  >
                    Show All
                  </button>
                </div>
              )}

              {displayStyle === 'continuous' ? (
                renderContinuousStream(visibleSegments)
              ) : displayStyle === 'live' ? (
                renderLiveView(visibleSegments)
              ) : (
                visibleSegments.map((seg) => renderSegmentCard(seg))
              )}
              <div ref={feedEndRef} />
            </>
          )}
        </main>

        {/* SIMPLE 3-BUTTON THUMB BAR AT BOTTOM OF ANDROID PHONE */}
        <footer className="px-5 pt-2.5 pb-5 bg-slate-950/95 border-t border-slate-900 shrink-0">
          {/* Quick Audio Source Selector: Physical Mic vs TAB / Online Sermon */}
          <div className="flex items-center justify-center mb-2">
            <div className="inline-flex bg-slate-900/90 border border-slate-800 rounded-full p-0.5 shadow-inner">
              <button
                type="button"
                onClick={() => {
                  if (isListening && (audioConfig.audioSource || 'mic') !== 'mic') {
                    audioEngineRef.current?.stop();
                    setIsListening(false);
                  }
                  setAudioConfig((prev) => ({ ...prev, audioSource: 'mic' }));
                  setErrorNotice(null);
                }}
                className={`px-3 py-1 rounded-full text-[10px] font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                  (audioConfig.audioSource || 'mic') === 'mic'
                    ? 'bg-sky-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Mic className="w-3 h-3" />
                Mic (Room)
              </button>

              <button
                type="button"
                onClick={() => {
                  if (isListening && audioConfig.audioSource !== 'tab') {
                    audioEngineRef.current?.stop();
                    setIsListening(false);
                  }
                  setAudioConfig((prev) => ({ ...prev, audioSource: 'tab' }));
                  setErrorNotice(null);
                }}
                className={`px-3 py-1 rounded-full text-[10px] font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                  audioConfig.audioSource === 'tab'
                    ? 'bg-emerald-400 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Capture browser tab audio directly (Desktop Chrome/Edge/Brave)"
              >
                <Tv className="w-3 h-3" />
                TAB / Online (Desktop)
              </button>
            </div>
          </div>

          {/* Automatic Connection Mode status & QR Caption Share (Church Presenter / Church-Cap-inspired).
              Connection mode is detected automatically (see `probeCloudConnectivity`) and is purely
              informational — there is nothing to press here, which matters for missionaries/remote
              venues who won't know to flip a manual switch before a service starts. */}
          <div className="flex items-center gap-2 mt-2">
            <div
              title="Automatically detected: switches to the on-device Whisper + translation pipeline whenever the cloud connection is down or unusable, and back to cloud whenever it recovers."
              className={`flex-1 px-3 py-1.5 rounded-full text-[10px] font-semibold flex items-center justify-center gap-1.5 border ${
                connectionMode === 'offline'
                  ? 'bg-amber-400/20 border-amber-400/50 text-amber-300'
                  : connectionMode === 'checking'
                  ? 'bg-slate-900 border-slate-800 text-slate-400'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              }`}
            >
              {connectionMode === 'offline' ? (
                <WifiOff className="w-3 h-3" />
              ) : (
                <Wifi className="w-3 h-3" />
              )}
              {connectionMode === 'offline'
                ? 'Offline Mode (Local On-Device Engine)'
                : connectionMode === 'checking'
                ? 'Checking Connection…'
                : 'Cloud Mode'}
            </div>
            {/* Consolidated "Share" menu (plain-language renaming + grouping): replaces the former
               two side-by-side "Share QR" / "Broadcast Overlay" buttons, which looked like variants
               of the same thing and required the operator to already know jargon like "OBS" or
               "overlay" to pick the right one. One entry point now exposes both distribution
               channels with self-explanatory labels describing *where* captions end up. */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsShareMenuOpen((prev) => !prev)}
                title="Share the live captions with congregants' phones, or send them to a projector/stream."
                className={`px-3 py-1.5 rounded-full text-[10px] font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer border ${
                  isShareMenuOpen
                    ? 'bg-slate-800 border-slate-700 text-slate-100'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <QrCode className="w-3 h-3" />
                Share
                <ChevronDown className={`w-3 h-3 transition-transform ${isShareMenuOpen ? 'rotate-180' : ''}`} />
              </button>
              {isShareMenuOpen && (
                <div className="absolute right-0 bottom-full mb-2 w-60 rounded-xl border border-slate-800 bg-slate-900 shadow-xl z-20 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => {
                      if (!captionShareSessionId) {
                        setCaptionShareSessionId(createCaptionSessionId());
                      }
                      setIsShareQrOpen(true);
                      setIsShareMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-2.5 flex items-start gap-2.5 hover:bg-slate-800 transition cursor-pointer"
                  >
                    <QrCode className="w-4 h-4 text-sky-400 mt-0.5 shrink-0" />
                    <span>
                      <span className="block text-xs font-semibold text-slate-100">Share to Phones</span>
                      <span className="block text-[10px] text-slate-400 mt-0.5">
                        Congregants scan a QR code to follow captions on their own phone — no app install.
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const sessionId = captionShareSessionId || createCaptionSessionId();
                      if (!captionShareSessionId) {
                        setCaptionShareSessionId(sessionId);
                      }
                      const overlayUrl = buildBroadcastOverlayUrl(sessionId, targetLangCode);
                      try {
                        await navigator.clipboard.writeText(overlayUrl);
                        setErrorNotice('Screen/stream link copied — add it as an OBS Browser Source or ProPresenter web overlay.');
                      } catch {
                        window.prompt('Copy this screen/stream overlay URL:', overlayUrl);
                      }
                      setIsShareMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-2.5 flex items-start gap-2.5 hover:bg-slate-800 transition cursor-pointer border-t border-slate-800"
                  >
                    <Tv className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                    <span>
                      <span className="block text-xs font-semibold text-slate-100">Send to Screen/Stream</span>
                      <span className="block text-[10px] text-slate-400 mt-0.5">
                        Copies a link for a projector, OBS, or ProPresenter — shows the latest caption only.
                      </span>
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between">
            {/* Left Button: Earphones Audio ON / OFF */}
            <button
              type="button"
              onClick={() => {
                const next = !speechConfig.enabled;
                setSpeechConfig((prev) => ({ ...prev, enabled: next }));
                speechEngineRef.current?.updateConfig({ enabled: next });
              }}
              className="flex flex-col items-center gap-1 w-20 cursor-pointer"
            >
              <div
                className={`w-11 h-11 rounded-full flex items-center justify-center border transition ${
                  speechConfig.enabled
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                    : 'bg-slate-900 border-slate-800 text-slate-500'
                }`}
              >
                {speechConfig.enabled ? (
                  <Headphones className="w-5 h-5" />
                ) : (
                  <VolumeX className="w-5 h-5" />
                )}
              </div>
              <span className="text-[10px] font-medium text-slate-400">
                {speechConfig.enabled ? 'Audio ON' : 'Text Only'}
              </span>
            </button>

            {/* Center Primary Microphone / Tab Audio / Stop Button */}
            <div className="flex flex-col items-center">
              <button
                type="button"
                onClick={toggleLiveMicrophone}
                className={`w-16 h-16 rounded-full flex items-center justify-center shadow-xl transition transform active:scale-95 cursor-pointer relative ${
                  isListening
                    ? 'bg-rose-500 text-slate-950 shadow-rose-500/30'
                    : audioConfig.audioSource === 'tab'
                    ? 'bg-emerald-400 text-slate-950 shadow-emerald-500/30'
                    : 'bg-sky-500 text-slate-950 shadow-sky-500/30'
                }`}
              >
                {isListening && meter.isVoiceDetected && (
                  <span className="absolute inset-0 rounded-full border-2 border-rose-400 animate-ping opacity-40" />
                )}
                {isProcessingChunk ? (
                  <Sparkles className="w-7 h-7 animate-spin" />
                ) : isListening ? (
                  <Square className="w-6 h-6 fill-current" />
                ) : audioConfig.audioSource === 'tab' ? (
                  <Tv className="w-7 h-7" />
                ) : (
                  <Mic className="w-7 h-7" />
                )}
              </button>
              <span className="text-[11px] font-semibold text-slate-200 mt-1">
                {isListening
                  ? audioConfig.audioSource === 'tab'
                    ? 'Stop Tab Stream'
                    : 'Tap to Stop Mic'
                  : audioConfig.audioSource === 'tab'
                  ? 'Capture Tab Audio'
                  : 'Tap to Listen'}
              </span>
            </div>

            {/* Right Button: 1-Tap Back-Row Mic Boost */}
            <button
              type="button"
              onClick={cycleDistanceBoost}
              className="flex flex-col items-center gap-1 w-20 cursor-pointer"
              title="Tap to boost weak church loudspeakers when sitting far back"
            >
              <div
                className={`w-11 h-11 rounded-full flex items-center justify-center border text-xs font-bold transition ${
                  boostPreset === 'back-row'
                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                    : boostPreset === 'pew'
                    ? 'bg-sky-500/15 border-sky-500/40 text-sky-300'
                    : 'bg-slate-900 border-slate-800 text-slate-400'
                }`}
              >
                +{audioConfig.preAmpGainDb}dB
              </div>
              <span className="text-[10px] font-medium text-slate-400">
                {boostPreset === 'back-row'
                  ? 'Back Row Max'
                  : boostPreset === 'pew'
                  ? 'Pew Boost'
                  : 'Front Row'}
              </span>
            </button>
          </div>

          {/* Android Home Gesture Pill */}
          <div className="w-28 h-1 bg-slate-800 rounded-full mx-auto mt-4 hidden sm:block" />
        </footer>

        {/* Settings & Pre-Paid Wallet Modal */}
        <SettingsAndWalletModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          apiKey={apiKey}
          onSaveApiKey={handleSaveApiKey}
          deepgramKey={deepgramKey}
          onSaveDeepgramKey={handleSaveDeepgramKey}
          activeAiProvider={aiProvider}
          onSelectAiProvider={handleSelectAiProvider}
          audioConfig={audioConfig}
          onChangeAudioConfig={(partial) => {
            setAudioConfig((prev) => {
              const updated = { ...prev, ...partial };
              audioEngineRef.current?.updateConfig(partial);
              return updated;
            });
          }}
          speechConfig={speechConfig}
          onChangeSpeechConfig={(partial) => {
            setSpeechConfig((prev) => {
              const updated = { ...prev, ...partial };
              speechEngineRef.current?.updateConfig(partial);
              try {
                localStorage.setItem(STORAGE_KEY_SPEECH_CONFIG, JSON.stringify(updated));
              } catch {}
              return updated;
            });
          }}
          wallet={wallet}
          onTopUpMinutes={(mins, tier) =>
            setWallet((prev) => ({
              ...prev,
              minutesRemaining: prev.minutesRemaining + mins,
              totalMinutesPurchased: prev.totalMinutesPurchased + mins,
              activeTierName: tier,
            }))
          }
          customGlossary={customChurchGlossary}
          onAddGlossaryTerm={handleAddGlossaryTerm}
          onRemoveGlossaryTerm={handleRemoveGlossaryTerm}
          pendingCorrections={flaggedCorrections.filter((c) => c.status === 'pending')}
          onApproveCorrection={handleApproveCorrection}
          onRejectCorrection={handleRejectCorrection}
        />

        {/* QR-Code Live Caption Share Modal */}
        {isShareQrOpen && captionShareSessionId && (
          <CaptionShareQR
            shareUrl={buildListenerShareUrl(captionShareSessionId, targetLangCode)}
            onClose={() => setIsShareQrOpen(false)}
          />
        )}
      </div>
    </div>
  );
}

export default App;
