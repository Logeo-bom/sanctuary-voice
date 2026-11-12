export interface LanguageOption {
  code: string;
  bcp47: string;
  name: string;
  nativeName: string;
  flag: string;
  dialectExamples: string[];
}

export type StageSeparationMode = 'split-windows' | 'lock-primary' | 'unified-stream';

export interface StageSpeaker {
  id: string;
  label: string;
  roleHint: 'main-speaker' | 'stage-interpreter' | 'worship-leader' | 'unknown';
  detectedLanguageCode: string;
  detectedLanguageName: string;
  detectedDialect?: string;
  accentColor: string;
  segmentCount: number;
  lastActiveAt: number;
  isIgnored: boolean;
}

export interface TranslationSegment {
  id: string;
  timestamp: number;
  speakerId: string;
  speakerLabel: string;
  sourceLanguageCode: string;
  sourceLanguageName: string;
  detectedDialect?: string;
  originalText: string;
  translatedText: string;
  targetLanguageCode: string;
  isFilteredOut: boolean;
  backgroundNoiseNote?: string;
  latencyMs: number;
}

export interface AudioProcessingConfig {
  bypassOsProcessing: boolean;
  preAmpGainDb: number;
  synthPadFilterEnabled: boolean;
  dynamicCompressorEnabled: boolean;
  highPassHz: number;
  chunkDurationSec: number;
  silenceGateDb: number;
  selectedDeviceId: string;
  audioSource?: 'mic' | 'tab';
}

export type VoiceEngineMode = 'neural-cloud' | 'gemini-studio' | 'device';

export interface SpeechOutputConfig {
  enabled: boolean;
  speechRate: number;
  pitch: number;
  volume: number;
  selectedVoiceURI: string;
  earphoneOnlyGuard: boolean;
  voiceEngine?: VoiceEngineMode;
  geminiVoiceName?: 'Aoede' | 'Charon' | 'Kore' | 'Fenrir';
}

export interface PrepaidAccountState {
  minutesRemaining: number;
  totalMinutesPurchased: number;
  sessionSecondsUsed: number;
  sessionTokensUsed: number;
  activeTierName: string;
}

export interface AudioMeterSnapshot {
  rmsDb: number;
  peakDb: number;
  normalizedLevel: number;
  isClipping: boolean;
  isVoiceDetected: boolean;
  frequencyBins: number[];
}

