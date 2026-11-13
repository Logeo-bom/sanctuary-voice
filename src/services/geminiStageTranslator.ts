import { SUPPORTED_LANGUAGES } from '../constants/languages';

export interface GeminiStageUtterance {
  speakerId: string;
  speakerLabel: string;
  roleHint: 'main-speaker' | 'stage-interpreter' | 'worship-leader' | 'unknown';
  sourceLanguageCode: string;
  sourceLanguageName: string;
  detectedDialect: string;
  originalText: string;
  translatedText: string;
  backgroundNoiseNote?: string;
}

export interface GeminiTranslationResult {
  utterances: GeminiStageUtterance[];
  tokensEstimated: number;
  latencyMs: number;
}

const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        const base64 = reader.result.split(',')[1] || '';
        resolve(base64);
      } else {
        reject(new Error('Failed to encode audio chunk'));
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function translateChurchStageAudioChunk(params: {
  audioBlob: Blob;
  mimeType: string;
  targetLanguageCode: string;
  preferredSourceLanguageCode: string; // 'auto' or specific ISO code
  recentContext: string[];
  apiKey?: string;
  modelName?: string;
}): Promise<GeminiTranslationResult> {
  const startTime = performance.now();
  const base64Audio = await blobToBase64(params.audioBlob);
  const cleanMime = params.mimeType.split(';')[0] || 'audio/webm';

  // 1. Try serverless backend proxy endpoint first (/api/gemini-translate)
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (params.apiKey && params.apiKey.trim()) {
      headers['x-gemini-key'] = params.apiKey.trim();
    }

    const serverlessRes = await fetch('/api/gemini-translate', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        audioBase64: base64Audio,
        mimeType: cleanMime,
        targetLanguageCode: params.targetLanguageCode,
        preferredSourceLanguageCode: params.preferredSourceLanguageCode,
        recentContext: params.recentContext,
        modelName: params.modelName,
      }),
    });

    if (serverlessRes.ok) {
      const data = await serverlessRes.json();
      return {
        utterances: data.utterances || [],
        tokensEstimated: data.tokensEstimated || 0,
        latencyMs: Math.round(performance.now() - startTime),
      };
    }

    // If serverless returned an error and no client key is provided, throw the backend error
    if (!params.apiKey || !params.apiKey.trim()) {
      const errText = await serverlessRes.text();
      throw new Error(`Gemini Serverless Error (${serverlessRes.status}): ${errText.slice(0, 180)}`);
    }
  } catch (backendErr) {
    if (!params.apiKey || !params.apiKey.trim()) {
      throw backendErr;
    }
  }

  // 2. Direct browser fallback if client API key was explicitly provided
  const targetLang =
    SUPPORTED_LANGUAGES.find((l) => l.code === params.targetLanguageCode)?.name ||
    params.targetLanguageCode;

  const preferredLangObj = SUPPORTED_LANGUAGES.find(
    (l) => l.code === params.preferredSourceLanguageCode
  );

  const recentContextBlock =
    params.recentContext.length > 0
      ? `Recent sermon context for continuity:\n${params.recentContext.slice(-6).join('\n')}`
      : 'Start of live church stage stream.';

  const systemInstruction = `You are a specialized real-time Church Sanctuary Simultaneous Interpreter AI.
You listen to live audio captured from a user's mobile phone inside a church (often from weak loudspeakers, distant seating, or with background worship synth pads).

CRITICAL CHALLENGES YOU MUST SOLVE:
1. MULTIPLE VOICES & LANGUAGES ON STAGE:
   - Often Speaker 1 preaches in Language A (e.g. English, Korean, Portuguese) and Speaker 2 (an on-stage interpreter) translates into Language B (e.g. French or Spanish) right after.
   - Separate each voice/language into its own item in the "utterances" array. Never merge two different speakers or languages into one utterance.
   - Assign consistent speakerId ("speaker_1" for the primary preacher, "speaker_2" for the second voice/stage interpreter).
2. DIALECTS & ACCENTS:
   - Accurately recognize strong regional dialects (e.g., Swiss French including "septante/huitante/nonante" vs Canadian French; Southern US or Scottish or West African English vs Oxford English; Swiss German; Norwegian dialects).
   - Identify the specific dialect in "detectedDialect".
3. FULL-SENTENCE SYNTHESIS & CONTINUOUS NARRATIVE FLOW:
   - Preachers frequently speak in long, multi-clause thoughts and oratorical structures (especially in languages like Korean, Japanese, German, or Portuguese where key verbs or conjunctions arrive at the end of clauses).
   - Synthesize longer, complete, and grammatically fluent sentences in ${targetLang} rather than short fragmented or choppy word-for-word snippets.
   - Use the provided recent sermon context to resolve dangling clauses and maintain continuous narrative flow. Connect dependent clauses smoothly so the listener hears natural, coherent theological sentences (similar to professional church broadcast subtitles) while preserving the full original meaning without omitting substance.
4. THEOLOGICAL & BIBLICAL ACCURACY:
   - Translate idioms, scripture references, biblical concepts, and church terminology naturally and accurately into ${targetLang} (ISO: ${params.targetLanguageCode}).
5. NOISE & SYNTH IMMUNITY:
   - Ignore background worship synth pads, organ chords, coughs, or room reverb. If only music, silence, or unintelligible room noise is present, return an empty "utterances": [] array. Never hallucinate text on silence.
${
  preferredLangObj
    ? `6. USER SOURCE PREFERENCE HINT: The user prefers hearing from ${preferredLangObj.name} (${preferredLangObj.code}), though you should still tag every detected speaker's true sourceLanguageCode accurately so the UI can filter or split them.`
    : ''
}`;

  const model = params.modelName || DEFAULT_GEMINI_MODEL;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent((params.apiKey || '').trim())}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: systemInstruction }],
      },
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: cleanMime,
                data: base64Audio,
              },
            },
            {
              text: `${recentContextBlock}\n\nTask: Transcribe and translate any spoken speech in this audio chunk into natural, full-sentence ${targetLang}. Synthesize complete grammatical thoughts rather than choppy fragments, seamlessly continuing from the recent context. Return strict JSON matching the schema.`,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.15,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            utterances: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  speakerId: { type: 'STRING' },
                  speakerLabel: { type: 'STRING' },
                  roleHint: {
                    type: 'STRING',
                    enum: ['main-speaker', 'stage-interpreter', 'worship-leader', 'unknown'],
                  },
                  sourceLanguageCode: { type: 'STRING' },
                  sourceLanguageName: { type: 'STRING' },
                  detectedDialect: { type: 'STRING' },
                  originalText: { type: 'STRING' },
                  translatedText: { type: 'STRING' },
                  backgroundNoiseNote: { type: 'STRING' },
                },
                required: [
                  'speakerId',
                  'speakerLabel',
                  'roleHint',
                  'sourceLanguageCode',
                  'sourceLanguageName',
                  'detectedDialect',
                  'originalText',
                  'translatedText',
                ],
              },
            },
          },
          required: ['utterances'],
        },
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API Error (${response.status}): ${errText.slice(0, 180)}`);
  }

  const data = await response.json();
  const rawJsonText =
    data?.candidates?.[0]?.content?.parts?.[0]?.text || '{"utterances":[]}';
  const parsed = JSON.parse(rawJsonText) as { utterances?: GeminiStageUtterance[] };
  const utterances = (parsed.utterances || []).filter(
    (u) => u.originalText && u.originalText.trim().length > 1
  );

  const totalTokens =
    data?.usageMetadata?.totalTokenCount ||
    Math.round(params.audioBlob.size / 120) + utterances.length * 45;

  return {
    utterances,
    tokensEstimated: totalTokens,
    latencyMs: Math.round(performance.now() - startTime),
  };
}

