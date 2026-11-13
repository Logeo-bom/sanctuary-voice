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
} from 'lucide-react';
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
import { ChurchAudioEngine } from './services/churchAudioEngine';
import { EarphoneSpeechEngine } from './services/earphoneSpeechEngine';
import { translateChurchStageAudioChunk } from './services/geminiStageTranslator';
import { transcribeAndTranslateWithDeepgram } from './services/deepgramTranslator';
import { DeepgramLiveWebSocket } from './services/deepgramLiveWebSocket';
import { BrowserLiveSpeechFallback } from './services/browserLiveFallback';
import { SettingsAndWalletModal } from './components/SettingsAndWalletModal';

const STORAGE_KEY_GEMINI = 'sanctuary_voice_gemini_key_v1';
const STORAGE_KEY_DEEPGRAM = 'sanctuary_voice_deepgram_key_v1';
const STORAGE_KEY_AI_PROVIDER = 'sanctuary_voice_ai_provider_v1';
const STORAGE_KEY_SPEECH_CONFIG = 'sanctuary_voice_speech_config_v1';
const STORAGE_KEY_SOURCE_LANG = 'sanctuary_voice_source_lang_v1';
const STORAGE_KEY_TARGET_LANG = 'sanctuary_voice_target_lang_v1';

export function App() {
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
  const [displayStyle, setDisplayStyle] = useState<'continuous' | 'cards'>('continuous');
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

  const [aiProvider, setAiProvider] = useState<'deepgram' | 'gemini'>(() => {
    return (localStorage.getItem(STORAGE_KEY_AI_PROVIDER) as 'deepgram' | 'gemini') || 'deepgram';
  });

  const [isListening, setIsListening] = useState<boolean>(false);
  const [isProcessingChunk, setIsProcessingChunk] = useState<boolean>(false);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  const audioEngineRef = useRef<ChurchAudioEngine | null>(null);
  const speechEngineRef = useRef<EarphoneSpeechEngine | null>(null);
  const fallbackEngineRef = useRef<BrowserLiveSpeechFallback | null>(null);
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
    speechEngineRef.current = new EarphoneSpeechEngine(speechConfig);
    return () => {
      speechEngineRef.current?.stopAll();
      audioEngineRef.current?.stop();
      fallbackEngineRef.current?.stop();
    };
  }, [speechConfig]);

  useEffect(() => {
    fallbackEngineRef.current?.setLanguages(speaker1SourceLang, targetLangCode);
  }, [speaker1SourceLang, targetLangCode]);

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [segments.length]);

  // Update Speaker 1 badge language when user changes Speaker 1 dropdown
  const handleChangeSpeaker1Language = (newLangCode: string) => {
    setSpeaker1SourceLang(newLangCode);
    localStorage.setItem(STORAGE_KEY_SOURCE_LANG, newLangCode);
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
      setActiveSpeakerId(params.speakerId);

      const mode = voiceViewModeRef.current;
      const isMutedByLock =
        mode !== 'all' && mode !== 'split' && mode !== params.speakerId;

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

  const handleAudioChunkReady = useCallback(
    async (audioBlob: Blob, mimeType: string, durationMs: number) => {
      const activeProvider = aiProviderRef.current;
      const currentDgKey = deepgramKeyRef.current;
      const currentGeminiKey = apiKeyRef.current;

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
                backgroundNoiseNote: utt.backgroundNoiseNote,
                latencyMs: utt.latencyMs,
              });
            }
            setErrorNotice(null);
            setIsProcessingChunk(false);
            return;
          } else {
            // No utterances returned from Deepgram, try Gemini fallback
            deepgramFailed = true;
          }
        } catch (err) {
          deepgramFailed = true;
          deepgramError = err instanceof Error ? err.message : 'Deepgram request failed';
        }

        // Automatic Fallback to Google Gemini 2.5 Flash if Deepgram failed or returned empty
        if (deepgramFailed) {
          try {
            const recentContext = segmentsRef.current
              .slice(-3)
              .map((s) => `${s.speakerLabel}: ${s.originalText}`);

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
                  backgroundNoiseNote: utt.backgroundNoiseNote,
                  latencyMs: geminiResult.latencyMs,
                });
              }
              setErrorNotice(null);
            }
          } catch (geminiErr) {
            const geminiMsg =
              geminiErr instanceof Error ? geminiErr.message : 'Gemini fallback failed';
            // Only show notice if both engines failed
            if (deepgramError) {
              setErrorNotice(`Deepgram: ${deepgramError} | Gemini: ${geminiMsg}`);
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
            .slice(-3)
            .map((s) => `${s.speakerLabel}: ${s.originalText}`);

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
          setErrorNotice(null);
        } catch (err) {
          const msg =
            err instanceof Error ? err.message : 'Translation request failed';
          setErrorNotice(msg);
        } finally {
          setIsProcessingChunk(false);
        }
      }
    },
    [upsertSpeakerAndAppendSegment]
  );

  const toggleLiveMicrophone = async () => {
    if (isListening) {
      audioEngineRef.current?.stop();
      audioEngineRef.current = null;
      deepgramWsRef.current?.close();
      deepgramWsRef.current = null;
      fallbackEngineRef.current?.stop();
      fallbackEngineRef.current = null;
      speechEngineRef.current?.stopAll();
      setIsListening(false);
      return;
    }

    try {
      setErrorNotice(null);

      // If Deepgram is selected, connect direct low-latency WebSocket (using serverless token or stored key)
      if (aiProviderRef.current === 'deepgram') {
        try {
          const wsClient = new DeepgramLiveWebSocket(
            deepgramKeyRef.current || '',
            speaker1LangRef.current,
            targetLangRef.current,
            (seg) => {
              upsertSpeakerAndAppendSegment({
                speakerId: seg.speakerId,
                speakerLabel: seg.speakerLabel,
                roleHint: seg.speakerId === 'speaker_1' ? 'main-speaker' : 'worship-leader',
                sourceLanguageCode: seg.sourceLanguageCode,
                sourceLanguageName: seg.sourceLanguageName,
                originalText: seg.originalText,
                translatedText: seg.translatedText,
                latencyMs: seg.latencyMs,
              });
            },
            (err) => {
              setErrorNotice(err);
            }
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
          if (deepgramWsRef.current) {
            deepgramWsRef.current.sendAudio(blob);
          } else {
            void handleAudioChunkReady(blob, mime, dur);
          }
        },
        (snapshot) => setMeter(snapshot),
        () => {
          setIsListening(false);
          audioEngineRef.current = null;
          deepgramWsRef.current?.close();
          deepgramWsRef.current = null;
        }
      );
      await engine.start(audioConfig.audioSource || 'mic');
      audioEngineRef.current = engine;

      setIsListening(true);
    } catch (err) {
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

  const visibleSegments = useMemo(() => {
    if (voiceViewMode === 'all' || voiceViewMode === 'split') {
      return segments;
    }
    if (voiceViewMode === 'auto') {
      return segments.filter((s) => s.speakerId === activeSpeakerId);
    }
    return segments.filter((s) => s.speakerId === voiceViewMode);
  }, [segments, voiceViewMode, activeSpeakerId]);

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
                  {isLatestTurn && isListening && (
                    <span className="inline-flex items-center ml-1">
                      <span className="w-1.5 h-3.5 bg-sky-400 animate-pulse inline-block align-middle rounded-sm" />
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
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
          <Volume2 className="w-3.5 h-3.5 text-slate-500 hover:text-sky-400 shrink-0" />
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
            <span className="w-2.5 h-2.5 rounded-full bg-sky-400" />
            <span className="font-bold text-sm text-white tracking-tight">
              SanctuaryVoice
            </span>
          </div>

          <div className="flex items-center gap-1.5">
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
        <div className="px-4 py-2.5 bg-slate-900/60 border-b border-slate-900 grid grid-cols-2 gap-2 shrink-0">
          <div>
            <label className="block text-[10px] text-slate-400 font-medium mb-1">
              Speaker 1 Language:
            </label>
            <select
              value={speaker1SourceLang}
              onChange={(e) => handleChangeSpeaker1Language(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-white focus:outline-none focus:border-sky-500"
            >
              <option value="auto">✨ Auto-Detect</option>
              {SUPPORTED_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.flag} {lang.name}
                </option>
              ))}
            </select>
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

        {/* Always-Visible Stage Voice Selection Bar */}
        <div className="px-3.5 py-2 bg-slate-950 border-b border-slate-900 flex items-center justify-between gap-1.5 shrink-0">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {/* Auto-Follow Pill */}
            <button
              type="button"
              onClick={() => {
                setVoiceViewMode('auto');
                speechEngineRef.current?.stopAll();
              }}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold shrink-0 flex items-center gap-1 transition cursor-pointer ${
                voiceViewMode === 'auto'
                  ? 'bg-gradient-to-r from-sky-400 to-indigo-500 text-slate-950 shadow-sm'
                  : 'bg-slate-900 text-slate-300 border border-slate-800 hover:border-slate-700'
              }`}
              title="Automatically switches and displays whichever stage speaker is speaking"
            >
              <Sparkles className="w-3 h-3" />
              Auto-Follow
              {voiceViewMode === 'auto' && <Check className="w-3 h-3" />}
            </button>

            {/* All Voices Pill */}
            <button
              type="button"
              onClick={() => {
                setVoiceViewMode('all');
                speechEngineRef.current?.stopAll();
              }}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold shrink-0 transition cursor-pointer ${
                voiceViewMode === 'all'
                  ? 'bg-sky-500 text-slate-950'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200'
              }`}
            >
              All Voices
            </button>

            {/* Dynamic Speaker Pills */}
            {speakers.map((spk) => {
              const isSelected = voiceViewMode === spk.id;
              const isActiveSpeaking = activeSpeakerId === spk.id;
              const displayCode =
                spk.id === 'speaker_1'
                  ? speaker1SourceLang === 'auto'
                    ? 'Auto'
                    : speaker1SourceLang.toUpperCase()
                  : spk.id === 'speaker_2'
                  ? targetLangCode.toUpperCase()
                  : (spk.detectedLanguageCode || '').toUpperCase();

              return (
                <button
                  key={spk.id}
                  type="button"
                  onClick={() => {
                    setVoiceViewMode(isSelected ? 'all' : spk.id);
                    speechEngineRef.current?.stopAll();
                  }}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-semibold shrink-0 flex items-center gap-1 transition cursor-pointer ${
                    isSelected
                      ? 'bg-sky-500 text-slate-950'
                      : 'bg-slate-900 text-slate-300 border border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isActiveSpeaking && isListening ? 'animate-pulse ring-2 ring-sky-400' : ''
                    }`}
                    style={{ backgroundColor: spk.accentColor }}
                  />
                  {spk.label} ({displayCode})
                  {isSelected && <Check className="w-3 h-3" />}
                </button>
              );
            })}

            {/* 2 Windows Split Pill */}
            <button
              type="button"
              onClick={() => {
                setVoiceViewMode(voiceViewMode === 'split' ? 'all' : 'split');
                speechEngineRef.current?.stopAll();
              }}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold shrink-0 flex items-center gap-1 transition cursor-pointer ${
                voiceViewMode === 'split'
                  ? 'bg-amber-400 text-slate-950'
                  : 'bg-slate-900 text-slate-300 border border-slate-800 hover:border-slate-700'
              }`}
            >
              <Rows2 className="w-3 h-3" />
              2 Windows
            </button>
          </div>
        </div>

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
          {segments.length === 0 ? (
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
        />
      </div>
    </div>
  );
}

export default App;
