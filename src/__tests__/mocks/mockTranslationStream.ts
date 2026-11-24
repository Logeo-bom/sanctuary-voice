import type { TranslationSegment, StageSpeaker } from '../../types/translator';

export const mockStageSpeakers: StageSpeaker[] = [
  {
    id: 'speaker_1',
    label: 'Speaker 1 (Lead Preacher)',
    roleHint: 'main-speaker',
    detectedLanguageCode: 'en',
    detectedLanguageName: 'English',
    accentColor: '#38bdf8',
    segmentCount: 5,
    lastActiveAt: Date.now(),
    isIgnored: false,
  },
  {
    id: 'speaker_2',
    label: 'Speaker 2 (Stage Interpreter)',
    roleHint: 'stage-interpreter',
    detectedLanguageCode: 'es',
    detectedLanguageName: 'Spanish',
    accentColor: '#fbbf24',
    segmentCount: 4,
    lastActiveAt: Date.now(),
    isIgnored: false,
  },
];

export const mockTranslationSegments: TranslationSegment[] = [
  {
    id: 'seg-1',
    timestamp: Date.now() - 10000,
    speakerId: 'speaker_1',
    speakerLabel: 'Speaker 1 (Lead Preacher)',
    sourceLanguageCode: 'en',
    sourceLanguageName: 'English',
    originalText: 'Grace and peace be multiplied unto you all today.',
    translatedText: 'Gracia y paz os sean multiplicadas a todos hoy.',
    targetLanguageCode: 'es',
    provider: 'deepl',
    isFilteredOut: false,
    latencyMs: 140,
  },
  {
    id: 'seg-2',
    timestamp: Date.now() - 7000,
    speakerId: 'speaker_1',
    speakerLabel: 'Speaker 1 (Lead Preacher)',
    sourceLanguageCode: 'en',
    sourceLanguageName: 'English',
    originalText: 'Open your hearts to the living Word.',
    translatedText: 'Abrid vuestros corazones a la Palabra viva.',
    targetLanguageCode: 'es',
    provider: 'deepl',
    isFilteredOut: false,
    latencyMs: 120,
  },
  {
    id: 'seg-3',
    timestamp: Date.now() - 4000,
    speakerId: 'speaker_2',
    speakerLabel: 'Speaker 2 (Stage Interpreter)',
    sourceLanguageCode: 'es',
    sourceLanguageName: 'Spanish',
    originalText: 'Abrid vuestros corazones a la palabra de Dios.',
    translatedText: 'Open your hearts to the word of God.',
    targetLanguageCode: 'en',
    provider: 'deepl',
    isFilteredOut: false,
    latencyMs: 110,
  },
  {
    id: 'seg-4',
    timestamp: Date.now() - 1000,
    speakerId: 'speaker_1',
    speakerLabel: 'Speaker 1 (Lead Preacher)',
    sourceLanguageCode: 'en',
    sourceLanguageName: 'English',
    originalText: 'Let us pray together in faith.',
    translatedText: 'Oremos juntos en fe.',
    targetLanguageCode: 'es',
    provider: 'deepl',
    isFilteredOut: false,
    latencyMs: 135,
  },
];

export function createMockDeepgramMessage(
  transcript: string,
  speaker = 0,
  isFinal = true,
  speechFinal = true
) {
  const words = transcript.split(' ').map((word, idx) => ({
    word,
    start: idx * 0.3,
    end: idx * 0.3 + 0.28,
    confidence: 0.98,
    speaker,
    punctuated_word: word,
  }));

  return {
    type: 'Results',
    channel_index: [0, 1],
    duration: 1.5,
    start: 0.0,
    is_final: isFinal,
    speech_final: speechFinal,
    channel: {
      alternatives: [
        {
          transcript,
          confidence: 0.98,
          words,
          languages: ['en'],
        },
      ],
    },
  };
}
