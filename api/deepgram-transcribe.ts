import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-deepgram-key, x-target-lang, x-source-lang');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const rawApiKey =
      process.env.DEEPGRAM_API_KEY ||
      (req.headers['x-deepgram-key'] as string) ||
      '';
    const authHeader = req.headers['authorization'] || '';
    const apiKey = rawApiKey || authHeader.replace(/^Token\s+/i, '').replace(/^Bearer\s+/i, '').trim();

    if (!apiKey) {
      return res.status(400).json({ error: 'Missing Deepgram API key in environment or header' });
    }

    const sourceLang = (req.headers['x-source-lang'] as string) || 'auto';
    const targetLang = (req.headers['x-target-lang'] as string) || 'en';
    const customGlossaryRaw = (req.headers['x-custom-glossary'] as string) || '';
    const translationContextRaw = (req.headers['x-translation-context'] as string) || '';
    let translationContext = '';
    if (translationContextRaw) {
      try {
        translationContext = decodeURIComponent(translationContextRaw).trim().slice(0, 600);
      } catch {}
    }
    const contentType = req.headers['content-type'] || 'audio/webm';

    // Collect binary stream
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    const audioBuffer = Buffer.concat(chunks);

    if (audioBuffer.length < 50) {
      return res.status(400).json({ error: 'Audio payload too small or empty' });
    }

    const langQuery =
      sourceLang && sourceLang !== 'auto'
        ? `&language=${encodeURIComponent(sourceLang)}`
        : '&detect_language=true';

    // Model selection: nova-2 for single pinned language, nova-3 for multilingual auto-detection
    const modelName = sourceLang === 'auto' ? 'nova-3' : 'nova-2';
    const autoLangParam = sourceLang === 'auto' ? '&language=multi' : langQuery;

    // Parse custom church keyterms if passed
    let extraParams = '';
    if (customGlossaryRaw) {
      try {
        const terms = decodeURIComponent(customGlossaryRaw).split(',').map((t) => t.trim()).filter((t) => t.length > 0);
        if (modelName === 'nova-3') {
          extraParams = terms.map((t) => `&keyterm=${encodeURIComponent(t)}`).join('');
        } else {
          const singleWords = terms.flatMap((t) => t.split(/\s+/)).filter((t) => t.length > 1);
          extraParams = singleWords.map((t) => `&keywords=${encodeURIComponent(t)}:2`).join('');
        }
      } catch {}
    }

    const deepgramUrl = `https://api.deepgram.com/v1/listen?model=${modelName}&diarize=true&punctuate=true&smart_format=true${autoLangParam}${extraParams}`;

    const dgResponse = await fetch(deepgramUrl, {
      method: 'POST',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': contentType,
      },
      body: audioBuffer,
    });

    if (!dgResponse.ok) {
      const errText = await dgResponse.text();
      return res.status(dgResponse.status).json({
        error: `Deepgram API upstream error: ${errText.slice(0, 200)}`,
      });
    }

    const data = await dgResponse.json();
    const channels = data?.results?.channels?.[0];

    // Detect language from Deepgram channel or words
    let deepgramDetected = channels?.detected_language as string | undefined;
    if (!deepgramDetected && channels?.alternatives?.[0]?.words?.length) {
      const langCounts: Record<string, number> = {};
      for (const w of channels.alternatives[0].words) {
        if (w.language) {
          langCounts[w.language] = (langCounts[w.language] || 0) + 1;
        }
      }
      const sortedLangs = Object.entries(langCounts).sort((a, b) => b[1] - a[1]);
      if (sortedLangs.length > 0) {
        deepgramDetected = sortedLangs[0][0];
      }
    }

    const initialSourceLang =
      deepgramDetected || (sourceLang !== 'auto' ? sourceLang : 'auto');
    const paragraphs =
      channels?.alternatives?.[0]?.paragraphs?.paragraphs || [];

    const utterances: Array<{
      speakerId: string;
      speakerLabel: string;
      sourceLanguageCode: string;
      sourceLanguageName: string;
      detectedDialect?: string;
      originalText: string;
      translatedText: string;
      backgroundNoiseNote?: string;
      latencyMs: number;
    }> = [];

    const t0 = Date.now();

    const deeplKey =
      process.env.DEEPL_API_KEY ||
      (req.headers['x-deepl-key'] as string) ||
      '';

    const translateHelper = async (
      text: string,
      src: string,
      tgt: string
    ): Promise<{ translated: string; lang: string }> => {
      // If source language is known and matches target, no translation needed
      if (src !== 'auto' && src.toLowerCase() === tgt.toLowerCase()) {
        return { translated: text, lang: src };
      }

      // 1. Try DeepL API first if key exists
      if (deeplKey) {
        try {
          const isFreeTier = deeplKey.endsWith(':fx');
          const deeplEndpoint = isFreeTier
            ? 'https://api-free.deepl.com/v2/translate'
            : 'https://api.deepl.com/v2/translate';

          let deeplTarget = tgt.toUpperCase();
          if (deeplTarget === 'EN') deeplTarget = 'EN-US';
          if (deeplTarget === 'PT') deeplTarget = 'PT-BR';

          const deeplPayload: Record<string, unknown> = {
            text: [text],
            target_lang: deeplTarget,
          };
          if (src && src !== 'auto') {
            deeplPayload.source_lang = src.toUpperCase();
          }
          if (translationContext.length > 0) {
            deeplPayload.context = translationContext;
          }

          const deeplRes = await fetch(deeplEndpoint, {
            method: 'POST',
            headers: {
              Authorization: `DeepL-Auth-Key ${deeplKey.trim()}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(deeplPayload),
          });

          if (deeplRes.ok) {
            const deeplData = await deeplRes.json();
            const translated = deeplData?.translations?.[0]?.text;
            const detected =
              deeplData?.translations?.[0]?.detected_source_language?.toLowerCase() ||
              (src !== 'auto' ? src : 'en');
            if (translated) {
              return { translated, lang: detected };
            }
          }
        } catch {
          // Fall through to Google Translate fallback
        }
      }

      // 2. High-performance fallback: Google Neural translation with auto-detection
      try {
        const transUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(
          src || 'auto'
        )}&tl=${encodeURIComponent(tgt)}&dt=t&q=${encodeURIComponent(text)}`;
        const gRes = await fetch(transUrl);
        if (gRes.ok) {
          const gData = (await gRes.json()) as Array<Array<[string]>>;
          let translated = text;
          if (Array.isArray(gData?.[0])) {
            translated = gData[0].map((part) => part[0]).join('');
          }
          const detected =
            typeof (gData as unknown[])?.[2] === 'string'
              ? ((gData as unknown[])[2] as string)
              : src !== 'auto'
              ? src
              : 'en';
          return { translated, lang: detected };
        }
        return { translated: text, lang: src !== 'auto' ? src : 'en' };
      } catch {
        return { translated: text, lang: src !== 'auto' ? src : 'en' };
      }
    };

    if (paragraphs.length > 0) {
      for (const p of paragraphs) {
        const speakerNum = p.speaker ?? 0;
        const originalText = (p.sentences || [])
          .map((s: { text: string }) => s.text)
          .join(' ')
          .trim();

        if (originalText.length > 0) {
          const { translated: translatedText, lang: finalLang } =
            await translateHelper(originalText, initialSourceLang, targetLang);
          utterances.push({
            speakerId: `speaker_${speakerNum + 1}`,
            speakerLabel:
              speakerNum === 0
                ? 'Speaker 1 (Pulpit PA)'
                : `Speaker ${speakerNum + 1} (Audience/Floor)`,
            sourceLanguageCode: finalLang,
            sourceLanguageName: finalLang.toUpperCase(),
            originalText,
            translatedText,
            backgroundNoiseNote:
              speakerNum > 0 ? 'Filtered Ambient/Congregation Voice' : undefined,
            latencyMs: Date.now() - t0,
          });
        }
      }
    } else {
      const singleTranscript =
        channels?.alternatives?.[0]?.transcript?.trim() || '';
      if (singleTranscript.length > 0) {
        const { translated: translatedText, lang: finalLang } =
          await translateHelper(singleTranscript, initialSourceLang, targetLang);
        utterances.push({
          speakerId: 'speaker_1',
          speakerLabel: 'Speaker 1 (Pulpit PA)',
          sourceLanguageCode: finalLang,
          sourceLanguageName: finalLang.toUpperCase(),
          originalText: singleTranscript,
          translatedText,
          latencyMs: Date.now() - t0,
        });
      }
    }

    return res.status(200).json({
      utterances,
      latencyMs: Date.now() - t0,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return res.status(500).json({ error: message });
  }
}
