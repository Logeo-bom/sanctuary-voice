import { SUPPORTED_LANGUAGES } from '../constants/languages';

export interface DeepgramUtterance {
  speakerId: string;
  speakerLabel: string;
  sourceLanguageCode: string;
  sourceLanguageName: string;
  detectedDialect?: string;
  originalText: string;
  translatedText: string;
  backgroundNoiseNote?: string;
  latencyMs: number;
}

export interface DeepgramTranslationResult {
  utterances: DeepgramUtterance[];
  latencyMs: number;
}

export async function transcribeAndTranslateWithDeepgram(params: {
  audioBlob: Blob;
  mimeType: string;
  targetLanguageCode: string;
  deepgramApiKey: string;
  sourceLanguageCode?: string; // 'pt', 'en', 'es', or 'auto'
}): Promise<DeepgramTranslationResult> {
  const t0 = performance.now();
  const cleanMime = params.mimeType.split(';')[0] || 'audio/webm';

  // Call serverless proxy endpoint to avoid browser CORS restrictions
  const endpoint = '/api/deepgram-transcribe';

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'x-deepgram-key': params.deepgramApiKey.trim(),
        'x-source-lang': params.sourceLanguageCode || 'auto',
        'x-target-lang': params.targetLanguageCode || 'en',
        'Content-Type': cleanMime,
      },
      body: params.audioBlob,
    });

    if (response.ok) {
      const data = await response.json();
      return {
        utterances: data.utterances || [],
        latencyMs: Math.round(performance.now() - t0),
      };
    }
  } catch {
    // If proxy call fails, fall through to direct call
  }

  // Direct endpoint fallback (when in non-browser or CORS-enabled environments)
  const langQuery =
    params.sourceLanguageCode && params.sourceLanguageCode !== 'auto'
      ? `&language=${encodeURIComponent(params.sourceLanguageCode)}`
      : '&detect_language=true';

  const deepgramUrl = `https://api.deepgram.com/v1/listen?model=nova-2&diarize=true&punctuate=true&smart_format=true${langQuery}`;

  const response = await fetch(deepgramUrl, {
    method: 'POST',
    headers: {
      Authorization: `Token ${params.deepgramApiKey.trim()}`,
      'Content-Type': cleanMime,
    },
    body: params.audioBlob,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Deepgram API Error (${response.status}): ${errText.slice(0, 160)}`);
  }

  const data = await response.json();
  const channels = data?.results?.channels?.[0];
  const detectedLang =
    channels?.detected_language || params.sourceLanguageCode || 'pt';
  const paragraphs =
    channels?.alternatives?.[0]?.paragraphs?.paragraphs || [];

  const utterances: DeepgramUtterance[] = [];

  if (paragraphs.length > 0) {
    for (const p of paragraphs) {
      const speakerNum = p.speaker ?? 0;
      const originalText = (p.sentences || [])
        .map((s: { text: string }) => s.text)
        .join(' ')
        .trim();

      if (originalText.length > 1) {
        const translatedText = await translateTextFast(
          originalText,
          detectedLang,
          params.targetLanguageCode
        );

        const speakerLabel =
          speakerNum === 0 ? 'Speaker 1 (Pulpit PA)' : `Speaker ${speakerNum + 1} (Audience/Floor)`;

        utterances.push({
          speakerId: `speaker_${speakerNum + 1}`,
          speakerLabel,
          sourceLanguageCode: detectedLang,
          sourceLanguageName:
            SUPPORTED_LANGUAGES.find((l) => l.code === detectedLang)?.name ||
            detectedLang.toUpperCase(),
          detectedDialect: detectedLang === 'pt' ? 'Brazilian Portuguese' : undefined,
          originalText,
          translatedText,
          backgroundNoiseNote:
            speakerNum > 0 ? 'Filtered Congregation Shouting/Singing' : undefined,
          latencyMs: Math.round(performance.now() - t0),
        });
      }
    }
  } else {
    // Single speaker fallback transcript
    const singleTranscript =
      channels?.alternatives?.[0]?.transcript?.trim() || '';
    if (singleTranscript.length > 1) {
      const translatedText = await translateTextFast(
        singleTranscript,
        detectedLang,
        params.targetLanguageCode
      );
      utterances.push({
        speakerId: 'speaker_1',
        speakerLabel: 'Speaker 1 (Pulpit PA)',
        sourceLanguageCode: detectedLang,
        sourceLanguageName:
          SUPPORTED_LANGUAGES.find((l) => l.code === detectedLang)?.name ||
          detectedLang.toUpperCase(),
        detectedDialect: detectedLang === 'pt' ? 'Brazilian Portuguese' : undefined,
        originalText: singleTranscript,
        translatedText,
        latencyMs: Math.round(performance.now() - t0),
      });
    }
  }

  return {
    utterances,
    latencyMs: Math.round(performance.now() - t0),
  };
}

async function translateTextFast(
  text: string,
  sourceLang: string,
  targetLang: string
): Promise<string> {
  if (sourceLang.toLowerCase() === targetLang.toLowerCase()) return text;
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(
      sourceLang
    )}&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url);
    if (!res.ok) return text;
    const data = (await res.json()) as Array<Array<[string]>>;
    if (Array.isArray(data?.[0])) {
      return data[0].map((part) => part[0]).join('');
    }
    return text;
  } catch {
    return text;
  }
}

