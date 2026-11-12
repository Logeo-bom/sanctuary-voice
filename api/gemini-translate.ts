import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

const SUPPORTED_LANGUAGES_MAP: Record<string, string> = {
  no: 'Norwegian',
  en: 'English',
  fr: 'French',
  es: 'Spanish',
  de: 'German',
  pt: 'Portuguese',
  uk: 'Ukrainian',
  tl: 'Tagalog / Filipino',
  ko: 'Korean',
  sw: 'Swahili',
  ar: 'Arabic',
  zh: 'Chinese (Mandarin)',
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-gemini-key');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const rawApiKey =
      process.env.GEMINI_API_KEY ||
      process.env.VITE_GEMINI_API_KEY ||
      (req.headers['x-gemini-key'] as string) ||
      '';
    const authHeader = req.headers['authorization'] || '';
    const apiKey =
      rawApiKey ||
      authHeader.replace(/^Token\s+/i, '').replace(/^Bearer\s+/i, '').trim();

    if (!apiKey) {
      return res.status(400).json({
        error:
          'Missing GEMINI_API_KEY. Configure GEMINI_API_KEY in Vercel project environment variables.',
      });
    }

    const {
      audioBase64,
      mimeType = 'audio/webm',
      targetLanguageCode = 'en',
      preferredSourceLanguageCode = 'auto',
      recentContext = [],
      modelName,
    } = req.body || {};

    if (!audioBase64 || typeof audioBase64 !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid audioBase64 payload' });
    }

    const targetLang = SUPPORTED_LANGUAGES_MAP[targetLanguageCode] || targetLanguageCode;
    const preferredLangName =
      preferredSourceLanguageCode !== 'auto'
        ? SUPPORTED_LANGUAGES_MAP[preferredSourceLanguageCode] || preferredSourceLanguageCode
        : null;

    const recentContextBlock =
      Array.isArray(recentContext) && recentContext.length > 0
        ? `Recent sermon context for continuity:\n${recentContext.slice(-3).join('\n')}`
        : 'Start of live church stage stream.';

    const systemInstruction = `You are a specialized real-time Church Sanctuary Simultaneous Interpreter AI.
You listen to live audio captured from a user's mobile phone inside a church (often from weak loudspeakers, distant seating, or with background worship synth pads).

CRITICAL CHALLENGES YOU MUST SOLVE:
1. MULTIPLE VOICES & LANGUAGES ON STAGE:
   - Often Speaker 1 preaches in Language A (e.g. Korean, English, Portuguese) and Speaker 2 (an on-stage interpreter) translates into Language B (e.g. French or Spanish) right after.
   - Separate each voice/language into its own item in the "utterances" array. Never merge two different speakers or languages into one utterance.
   - Assign consistent speakerId ("speaker_1" for the primary preacher, "speaker_2" for the second voice/stage interpreter).
2. DIALECTS & ACCENTS:
   - Accurately recognize strong regional dialects (e.g. Swiss French, Korean dialects, Southern US English, Portuguese).
   - Identify the specific dialect in "detectedDialect".
3. THEOLOGICAL & BIBLICAL ACCURACY:
   - Translate idioms, scripture references, and church terminology naturally and accurately into ${targetLang} (ISO: ${targetLanguageCode}).
4. NOISE & SYNTH IMMUNITY:
   - Ignore background worship synth pads, organ chords, coughs, or room reverb. If only music, silence, or unintelligible room noise is present, return an empty "utterances": [] array. Never hallucinate text on silence.
${
  preferredLangName
    ? `5. USER SOURCE PREFERENCE HINT: The user prefers hearing from ${preferredLangName} (${preferredSourceLanguageCode}), though you should still tag every detected speaker's true sourceLanguageCode accurately so the UI can filter or split them.`
    : ''
}`;

    const cleanMime = mimeType.split(';')[0] || 'audio/webm';
    const modelsToTry = [modelName, 'gemini-2.5-flash', 'gemini-1.5-flash'].filter(Boolean) as string[];

    let lastError = '';
    const startTime = Date.now();

    for (const model of modelsToTry) {
      try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
          model
        )}:generateContent?key=${encodeURIComponent(apiKey.trim())}`;

        const geminiRes = await fetch(endpoint, {
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
                      data: audioBase64,
                    },
                  },
                  {
                    text: `${recentContextBlock}\n\nTranscribe and translate any spoken speech in this audio chunk into ${targetLang}. Return strict JSON matching the schema.`,
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

        if (!geminiRes.ok) {
          const errText = await geminiRes.text();
          lastError = `Gemini upstream error (${model}): ${errText.slice(0, 200)}`;
          continue;
        }

        const data = await geminiRes.json();
        const rawJsonText =
          data?.candidates?.[0]?.content?.parts?.[0]?.text || '{"utterances":[]}';
        const parsed = JSON.parse(rawJsonText) as {
          utterances?: Array<{
            speakerId: string;
            speakerLabel: string;
            roleHint: 'main-speaker' | 'stage-interpreter' | 'worship-leader' | 'unknown';
            sourceLanguageCode: string;
            sourceLanguageName: string;
            detectedDialect: string;
            originalText: string;
            translatedText: string;
            backgroundNoiseNote?: string;
          }>;
        };

        const utterances = (parsed.utterances || []).filter(
          (u) => u.originalText && u.originalText.trim().length > 1
        );

        const totalTokens =
          data?.usageMetadata?.totalTokenCount ||
          Math.round(audioBase64.length / 150) + utterances.length * 45;

        return res.status(200).json({
          utterances,
          tokensEstimated: totalTokens,
          latencyMs: Date.now() - startTime,
        });
      } catch (tryErr) {
        lastError = tryErr instanceof Error ? tryErr.message : String(tryErr);
      }
    }

    return res.status(502).json({ error: lastError || 'All Gemini model endpoints failed' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return res.status(500).json({ error: message });
  }
}
