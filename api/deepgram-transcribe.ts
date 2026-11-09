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
    const rawApiKey = (req.headers['x-deepgram-key'] as string) || '';
    const authHeader = req.headers['authorization'] || '';
    const apiKey = rawApiKey || authHeader.replace(/^Token\s+/i, '').replace(/^Bearer\s+/i, '').trim();

    if (!apiKey) {
      return res.status(400).json({ error: 'Missing Deepgram API key in x-deepgram-key header' });
    }

    const sourceLang = (req.headers['x-source-lang'] as string) || 'auto';
    const targetLang = (req.headers['x-target-lang'] as string) || 'en';
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

    const deepgramUrl = `https://api.deepgram.com/v1/listen?model=nova-2&diarize=true&punctuate=true&smart_format=true${langQuery}`;

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
    const detectedLang =
      channels?.detected_language || (sourceLang !== 'auto' ? sourceLang : 'en');
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

    const translateHelper = async (text: string, src: string, tgt: string) => {
      if (src.toLowerCase() === tgt.toLowerCase()) return text;
      try {
        const transUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(
          src
        )}&tl=${encodeURIComponent(tgt)}&dt=t&q=${encodeURIComponent(text)}`;
        const gRes = await fetch(transUrl);
        if (!gRes.ok) return text;
        const gData = (await gRes.json()) as Array<Array<[string]>>;
        if (Array.isArray(gData?.[0])) {
          return gData[0].map((part) => part[0]).join('');
        }
        return text;
      } catch {
        return text;
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
          const translatedText = await translateHelper(originalText, detectedLang, targetLang);
          utterances.push({
            speakerId: `speaker_${speakerNum + 1}`,
            speakerLabel: speakerNum === 0 ? 'Speaker 1 (Pulpit PA)' : `Speaker ${speakerNum + 1} (Audience/Floor)`,
            sourceLanguageCode: detectedLang,
            sourceLanguageName: detectedLang.toUpperCase(),
            originalText,
            translatedText,
            backgroundNoiseNote: speakerNum > 0 ? 'Filtered Ambient/Congregation Voice' : undefined,
            latencyMs: Date.now() - t0,
          });
        }
      }
    } else {
      const singleTranscript =
        channels?.alternatives?.[0]?.transcript?.trim() || '';
      if (singleTranscript.length > 0) {
        const translatedText = await translateHelper(singleTranscript, detectedLang, targetLang);
        utterances.push({
          speakerId: 'speaker_1',
          speakerLabel: 'Speaker 1 (Pulpit PA)',
          sourceLanguageCode: detectedLang,
          sourceLanguageName: detectedLang.toUpperCase(),
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
