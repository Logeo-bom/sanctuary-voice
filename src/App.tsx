import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Mic,
  Headphones,
  VolumeX,
  Settings,
  Play,
  Square,
  Volume2,
  Signal,
  Wifi,
  BatteryCharging,
  Sparkles,
  Check,
  Rows2,
  Trash2,
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
  STAGE_SIMULATION_PRESETS,
  SUPPORTED_LANGUAGES,
} from './constants/languages';
import { ChurchAudioEngine } from './services/churchAudioEngine';
import { EarphoneSpeechEngine } from './services/earphoneSpeechEngine';
import { translateChurchStageAudioChunk } from './services/geminiStageTranslator';
import { transcribeAndTranslateWithDeepgram } from './services/deepgramTranslator';
import { BrowserLiveSpeechFallback } from './services/browserLiveFallback';
import { SettingsAndWalletModal } from './components/SettingsAndWalletModal';

const STORAGE_KEY_GEMINI = 'sanctuary_voice_gemini_key_v1';
const STORAGE_KEY_DEEPGRAM = 'sanctuary_voice_deepgram_key_v1';
const STORAGE_KEY_AI_PROVIDER = 'sanctuary_voice_ai_provider_v1';
const STORAGE_KEY_SPEECH_CONFIG = 'sanctuary_voice_speech_config_v1';

const DEFAULT_STAGE_SPEAKERS: StageSpeaker[] = [
  {
    id: 'speaker_1',
    label: 'Speaker 1',
    roleHint: 'main-speaker',
    detectedLanguageCode: 'en',
    detectedLanguageName: 'English',
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
    detectedLanguageCode: 'fr',
    detectedLanguageName: 'French',
    detectedDialect: 'Stage Interpreter',
    accentColor: '#fbbf24',
    segmentCount: 0,
    lastActiveAt: 0,
    isIgnored: false,
  },
];

export function App() {
  const [speaker1SourceLang, setSpeaker1SourceLang] = useState<string>('en');
  const [targetLangCode, setTargetLangCode] = useState<string>('tl');
  const [speakers, setSpeakers] = useState<StageSpeaker[]>(DEFAULT_STAGE_SPEAKERS);
  const [segments, setSegments] = useState<TranslationSegment[]>([]);

  // Simple voice filter: 'all' | 'split' | 'speaker_1' | 'speaker_2'
  const [voiceViewMode, setVoiceViewMode] = useState<string>('all');

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

  const [selectedPresetIndex, setSelectedPresetIndex] = useState<number>(0);

  const [isListening, setIsListening] = useState<boolean>(false);
  const [isProcessingChunk, setIsProcessingChunk] = useState<boolean>(false);
  const [isSimulatingStage, setIsSimulatingStage] = useState<boolean>(false);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  const audioEngineRef = useRef<ChurchAudioEngine | null>(null);
  const speechEngineRef = useRef<EarphoneSpeechEngine | null>(null);
  const fallbackEngineRef = useRef<BrowserLiveSpeechFallback | null>(null);
  const simulationTimerRef = useRef<number | null>(null);
  const feedEndRef = useRef<HTMLDivElement | null>(null);

  const speakersRef = useRef<StageSpeaker[]>(speakers);
  speakersRef.current = speakers;
  const speaker1LangRef = useRef<string>(speaker1SourceLang);
  speaker1LangRef.current = speaker1SourceLang;
  const targetLangRef = useRef<string>(targetLangCode);
  targetLangRef.current = targetLangCode;
  const voiceViewModeRef = useRef<string>(voiceViewMode);
  voiceViewModeRef.current = voiceViewMode;
  const apiKeyRef = useRef<string>(apiKey);
  apiKeyRef.current = apiKey;
  const deepgramKeyRef = useRef<string>(deepgramKey);
  deepgramKeyRef.current = deepgramKey;
  const aiProviderRef = useRef<'deepgram' | 'gemini'>(aiProvider);
  aiProviderRef.current = aiProvider;
  const segmentsRef = useRef<TranslationSegment[]>(segments);
  segmentsRef.current = segments;

  useEffect(() => {
    speechEngineRef.current = new EarphoneSpeechEngine(speechConfig);
    return () => {
      speechEngineRef.current?.stopAll();
      audioEngineRef.current?.stop();
      fallbackEngineRef.current?.stop();
      if (simulationTimerRef.current) {
        window.clearInterval(simulationTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    fallbackEngineRef.current?.setLanguages(speaker1SourceLang, targetLangCode);
  }, [speaker1SourceLang, targetLangCode]);

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [segments.length]);

  // Update Speaker 1 badge language when user changes Speaker 1 dropdown
  const handleChangeSpeaker1Language = (newLangCode: string) => {
    setSpeaker1SourceLang(newLangCode);
    const langMeta = SUPPORTED_LANGUAGES.find((l) => l.code === newLangCode);
    setSpeakers((prev) =>
      prev.map((s) =>
        s.id === 'speaker_1'
          ? {
              ...s,
              detectedLanguageCode: newLangCode === 'auto' ? 'en' : newLangCode,
              detectedLanguageName:
                newLangCode === 'auto' ? 'Auto' : langMeta?.name || newLangCode,
            }
          : s
      )
    );
  };

  // Re-translate existing demo segments immediately when user switches Target Language
  const handleChangeTargetLanguage = (newTargetCode: string) => {
    setTargetLangCode(newTargetCode);
    targetLangRef.current = newTargetCode;
    speechEngineRef.current?.stopAll();

    const preset = STAGE_SIMULATION_PRESETS[0];
    setSegments((prev) => {
      const updated = prev.map((seg) => {
        const matchingPresetStep = preset.steps.find(
          (st) => st.originalText === seg.originalText
        );
        if (matchingPresetStep) {
          return {
            ...seg,
            targetLanguageCode: newTargetCode,
            translatedText:
              matchingPresetStep.translations[newTargetCode] ||
              matchingPresetStep.translations.en ||
              seg.translatedText,
          };
        }
        return { ...seg, targetLanguageCode: newTargetCode };
      });

      // Speak the most recent visible segment in the newly chosen language
      const latest = updated[updated.length - 1];
      if (latest && speechEngineRef.current) {
        speechEngineRef.current.speakTranslation(
          latest.translatedText,
          newTargetCode,
          false,
          apiKeyRef.current
        );
      }
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
      backgroundNoiseNote?: string;
      latencyMs: number;
    }) => {
      const currentSpeakers = [...speakersRef.current];
      let speaker = currentSpeakers.find((s) => s.id === params.speakerId);

      if (!speaker) {
        const colorIndex = currentSpeakers.length % SPEAKER_PALETTE.length;
        speaker = {
          id: params.speakerId,
          label:
            params.speakerId === 'speaker_1'
              ? 'Speaker 1'
              : params.speakerId === 'speaker_2'
              ? 'Translator 2'
              : params.speakerLabel,
          roleHint: params.roleHint,
          detectedLanguageCode: params.sourceLanguageCode,
          detectedLanguageName: params.sourceLanguageName,
          detectedDialect: params.detectedDialect,
          accentColor: SPEAKER_PALETTE[colorIndex],
          segmentCount: 1,
          lastActiveAt: Date.now(),
          isIgnored: false,
        };
        currentSpeakers.push(speaker);
      } else {
        speaker = {
          ...speaker,
          detectedLanguageCode:
            params.sourceLanguageCode || speaker.detectedLanguageCode,
          detectedLanguageName:
            params.sourceLanguageName || speaker.detectedLanguageName,
          detectedDialect: params.detectedDialect || speaker.detectedDialect,
          segmentCount: speaker.segmentCount + 1,
          lastActiveAt: Date.now(),
        };
        const idx = currentSpeakers.findIndex((s) => s.id === params.speakerId);
        currentSpeakers[idx] = speaker;
      }

      setSpeakers(currentSpeakers);

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

      setSegments((prev) => [...prev, newSegment]);

      // In stage simulation mode, only translate and speak Speaker 1.
      // Translator 2 (the stage interpreter) is never spoken into earphones.
      const isSimulation = isSimulatingStage;
      const isTargetSpeaker = !isSimulation || params.speakerId === 'speaker_1';
      const shouldSpeakInEarphones =
        !isMutedByLock &&
        isTargetSpeaker &&
        speechEngineRef.current;

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

      // 1. Process with Deepgram Nova-2 (Uses $200 free credit, <300ms diarization)
      if (activeProvider === 'deepgram' && currentDgKey) {
        setIsProcessingChunk(true);
        try {
          const result = await transcribeAndTranslateWithDeepgram({
            audioBlob,
            mimeType,
            targetLanguageCode: targetLangRef.current,
            deepgramApiKey: currentDgKey,
            sourceLanguageCode: speaker1LangRef.current,
          });

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
        } catch (err) {
          setErrorNotice(err instanceof Error ? err.message : 'Deepgram translation failed');
        } finally {
          setIsProcessingChunk(false);
        }
        return;
      }

      // 2. Process with Gemini 2.5 Flash if Gemini is selected and key present
      if (activeProvider === 'gemini' && currentGeminiKey) {
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
            apiKey: currentGeminiKey,
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
    if (isSimulatingStage) {
      stopStageSimulation();
      return;
    }

    if (isListening) {
      audioEngineRef.current?.stop();
      audioEngineRef.current = null;
      fallbackEngineRef.current?.stop();
      fallbackEngineRef.current = null;
      speechEngineRef.current?.stopAll();
      setIsListening(false);
      return;
    }

    try {
      setErrorNotice(null);
      const engine = new ChurchAudioEngine(
        audioConfig,
        handleAudioChunkReady,
        (snapshot) => setMeter(snapshot)
      );
      await engine.start();
      audioEngineRef.current = engine;

      if (!apiKeyRef.current && BrowserLiveSpeechFallback.isSupported()) {
        const fb = new BrowserLiveSpeechFallback(
          speaker1LangRef.current,
          targetLangRef.current,
          (ev) => {
            upsertSpeakerAndAppendSegment({
              speakerId: 'speaker_1',
              speakerLabel: 'Speaker 1',
              roleHint: 'main-speaker',
              sourceLanguageCode: ev.sourceLanguageCode,
              sourceLanguageName: ev.sourceLanguageName,
              originalText: ev.originalText,
              translatedText: ev.translatedText,
              latencyMs: ev.latencyMs,
            });
          }
        );
        fb.start();
        fallbackEngineRef.current = fb;
      }

      setIsListening(true);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Microphone permission denied.';
      setErrorNotice(msg);
    }
  };

  const toggleStageDemo = () => {
    if (isListening) {
      audioEngineRef.current?.stop();
      fallbackEngineRef.current?.stop();
      setIsListening(false);
    }
    if (isSimulatingStage) {
      stopStageSimulation();
      return;
    }

    const preset = STAGE_SIMULATION_PRESETS[selectedPresetIndex % STAGE_SIMULATION_PRESETS.length];
    setIsSimulatingStage(true);
    setErrorNotice(null);

    let stepIndex = 0;
    const runStep = () => {
      const step = preset.steps[stepIndex % preset.steps.length];
      const translated =
        step.translations[targetLangRef.current] ||
        step.translations.en ||
        step.originalText;

      setMeter({
        rmsDb: -16 + Math.round(Math.random() * 5),
        peakDb: -6,
        normalizedLevel: 0.75,
        isClipping: false,
        isVoiceDetected: true,
        frequencyBins: new Array(16).fill(0.5),
      });

      upsertSpeakerAndAppendSegment({
        speakerId: step.speakerId,
        speakerLabel: step.speakerLabel,
        roleHint:
          step.speakerId === 'speaker_1' ? 'main-speaker' : 'worship-leader',
        sourceLanguageCode: step.sourceLanguageCode,
        sourceLanguageName: step.sourceLanguageName,
        detectedDialect: step.detectedDialect,
        originalText: step.originalText,
        translatedText: translated,
        backgroundNoiseNote: step.backgroundNoiseNote,
        latencyMs: 520,
      });

      stepIndex++;
    };

    runStep();
    simulationTimerRef.current = window.setInterval(runStep, 4600);
  };

  const stopStageSimulation = () => {
    if (simulationTimerRef.current !== null) {
      window.clearInterval(simulationTimerRef.current);
      simulationTimerRef.current = null;
    }
    speechEngineRef.current?.stopAll();
    setIsSimulatingStage(false);
    setMeter((prev) => ({
      ...prev,
      rmsDb: -70,
      isVoiceDetected: false,
    }));
  };

  const visibleSegments =
    voiceViewMode === 'all' || voiceViewMode === 'split'
      ? segments
      : segments.filter((s) => s.speakerId === voiceViewMode);

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

        <p className="text-xs text-slate-400 mb-1.5 line-clamp-2">
          {seg.originalText}
        </p>

        <p
          className={`${
            compact ? 'text-base' : 'text-lg'
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
            <select
              value={selectedPresetIndex}
              onChange={(e) => {
                setSelectedPresetIndex(Number(e.target.value));
                if (isSimulatingStage) stopStageSimulation();
              }}
              className="bg-slate-900 border border-slate-800 text-[10px] font-semibold text-slate-300 rounded-lg px-2 py-1 max-w-[125px] truncate"
              title="Select church simulation test case"
            >
              {STAGE_SIMULATION_PRESETS.map((p, i) => (
                <option key={p.id} value={i}>
                  {p.badge}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={toggleStageDemo}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer ${
                isSimulatingStage
                  ? 'bg-amber-400 text-slate-950'
                  : 'bg-slate-900 text-amber-300 border border-amber-500/30'
              }`}
            >
              {isSimulatingStage ? (
                <>
                  <Square className="w-2.5 h-2.5 fill-current" />
                  Stop
                </>
              ) : (
                <>
                  <Play className="w-2.5 h-2.5 fill-current" />
                  Demo
                </>
              )}
            </button>

            {segments.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  speechEngineRef.current?.stopAll();
                  setSegments([]);
                }}
                className="p-1.5 rounded-full bg-slate-900 text-slate-400 hover:text-white"
                title="Clear captions"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="p-1.5 rounded-full bg-slate-900 text-slate-300 hover:text-white"
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
        <div className="px-3.5 py-2 bg-slate-950 border-b border-slate-900 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
          <button
            type="button"
            onClick={() => setVoiceViewMode('all')}
            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold shrink-0 transition cursor-pointer ${
              voiceViewMode === 'all'
                ? 'bg-sky-500 text-slate-950'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200'
            }`}
          >
            All Voices
          </button>

          {speakers.map((spk) => {
            const isSelected = voiceViewMode === spk.id;
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
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: spk.accentColor }}
                />
                {spk.label} ({spk.detectedLanguageCode.toUpperCase()})
                {isSelected && <Check className="w-3 h-3" />}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() =>
              setVoiceViewMode(voiceViewMode === 'split' ? 'all' : 'split')
            }
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

        {/* Error Notice if any */}
        {errorNotice && (
          <div className="mx-4 mt-2 p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-[11px] text-rose-200 flex items-center justify-between">
            <span className="truncate">{errorNotice}</span>
            <button
              type="button"
              onClick={() => setErrorNotice(null)}
              className="text-rose-300 font-bold ml-2"
            >
              ✕
            </button>
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
                  {voiceViewMode === 'speaker_1'
                    ? 'Locked onto Speaker 1'
                    : voiceViewMode === 'speaker_2'
                    ? 'Locked onto Translator 2'
                    : voiceViewMode === 'split'
                    ? '2-Window Split Mode Ready'
                    : 'Ready in Church'}
                </h2>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Put your earphones on and tap the microphone below, or tap{' '}
                  <strong className="text-amber-300">Stage Demo</strong> at the
                  top to hear live Tagalog / Norwegian / multi-language translation.
                </p>
              </div>
            </div>
          ) : voiceViewMode === 'split' && speakers.length >= 2 ? (
            /* 2-Window Split View (Top Window: Speaker 1, Bottom Window: Translator 2) */
            <div className="h-full flex flex-col gap-3">
              {speakers.slice(0, 2).map((spk) => {
                const spkSegments = segments.filter((s) => s.speakerId === spk.id);
                return (
                  <div
                    key={spk.id}
                    className="flex-1 bg-slate-900/40 border border-slate-800 rounded-2xl flex flex-col overflow-hidden"
                  >
                    <div className="px-3 py-1.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-1.5 font-bold text-slate-200">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: spk.accentColor }}
                        />
                        {spk.label} • {spk.detectedLanguageName}
                      </div>
                      <button
                        type="button"
                        onClick={() => setVoiceViewMode(spk.id)}
                        className="text-sky-400 font-semibold cursor-pointer"
                      >
                        Only This Voice
                      </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
                      {spkSegments.map((seg) => renderSegmentCard(seg, true))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Clean Single Scrollable Feed */
            <>
              {visibleSegments.map((seg) => renderSegmentCard(seg))}
              <div ref={feedEndRef} />
            </>
          )}
        </main>

        {/* SIMPLE 3-BUTTON THUMB BAR AT BOTTOM OF ANDROID PHONE */}
        <footer className="px-5 pt-3 pb-5 bg-slate-950/95 border-t border-slate-900 shrink-0">
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

            {/* Center Primary Microphone / Stop Button */}
            <div className="flex flex-col items-center">
              <button
                type="button"
                onClick={toggleLiveMicrophone}
                className={`w-16 h-16 rounded-full flex items-center justify-center shadow-xl transition transform active:scale-95 cursor-pointer relative ${
                  isListening || isSimulatingStage
                    ? 'bg-rose-500 text-slate-950 shadow-rose-500/30'
                    : 'bg-sky-500 text-slate-950 shadow-sky-500/30'
                }`}
              >
                {(isListening || isSimulatingStage) && meter.isVoiceDetected && (
                  <span className="absolute inset-0 rounded-full border-2 border-rose-400 animate-ping opacity-40" />
                )}
                {isProcessingChunk ? (
                  <Sparkles className="w-7 h-7 animate-spin" />
                ) : isListening || isSimulatingStage ? (
                  <Square className="w-6 h-6 fill-current" />
                ) : (
                  <Mic className="w-7 h-7" />
                )}
              </button>
              <span className="text-[11px] font-semibold text-slate-200 mt-1">
                {isSimulatingStage
                  ? 'Tap to Stop Demo'
                  : isListening
                  ? 'Tap to Stop Mic'
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
