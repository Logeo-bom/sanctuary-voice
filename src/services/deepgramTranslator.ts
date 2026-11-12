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
  deepgramApiKey?: string;
  sourceLanguageCode?: string; // 'pt', 'en', 'es', or 'auto'
}): Promise<DeepgramTranslationResult> {
  const t0 = performance.now();
  const cleanMime = params.mimeType.split(';')[0] || 'audio/webm';

  // Call serverless proxy endpoint to avoid browser CORS restrictions
  const endpoint = '/api/deepgram-transcribe';

  const headers: Record<string, string> = {
    'x-source-lang': params.sourceLanguageCode || 'auto',
    'x-target-lang': params.targetLanguageCode || 'en',
    'Content-Type': cleanMime,
  };

  if (params.deepgramApiKey && params.deepgramApiKey.trim()) {
    headers['x-deepgram-key'] = params.deepgramApiKey.trim();
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: params.audioBlob,
  });

  if (response.ok) {
    const data = await response.json();
    return {
      utterances: data.utterances || [],
      latencyMs: Math.round(performance.now() - t0),
    };
  }

  const errData = await response.text();
  throw new Error(`Translation Proxy Error (${response.status}): ${errData.slice(0, 150)}`);
}

