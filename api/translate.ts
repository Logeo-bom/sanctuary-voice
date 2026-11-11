import type { VercelRequest, VercelResponse } from '@vercel/node';

// Map common ISO codes to DeepL expected target format (e.g. EN -> EN-US, PT -> PT-BR)
function normalizeDeepLTarget(targetLang: string): string {
  const code = targetLang.toUpperCase();
  if (code === 'EN') return 'EN-US';
  if (code === 'PT') return 'PT-BR';
  return code;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-deepl-key');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const text = (req.body?.text || req.query?.text || '') as string;
    const sourceLang = (req.body?.sl || req.query?.sl || 'auto') as string;
    const targetLang = (req.body?.tl || req.query?.tl || 'en') as string;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: 'Missing text parameter' });
    }

    const trimmedText = text.trim();

    // 1. Check for DeepL API Key (either from backend env var or request header)
    const deeplKey =
      process.env.DEEPL_API_KEY ||
      (req.headers['x-deepl-key'] as string) ||
      '';

    if (deeplKey) {
      try {
        const isFreeTier = deeplKey.endsWith(':fx');
        const deeplEndpoint = isFreeTier
          ? 'https://api-free.deepl.com/v2/translate'
          : 'https://api.deepl.com/v2/translate';

        const deeplTarget = normalizeDeepLTarget(targetLang);
        const payload: Record<string, unknown> = {
          text: [trimmedText],
          target_lang: deeplTarget,
        };

        if (sourceLang && sourceLang !== 'auto') {
          payload.source_lang = sourceLang.toUpperCase();
        }

        const deeplRes = await fetch(deeplEndpoint, {
          method: 'POST',
          headers: {
            Authorization: `DeepL-Auth-Key ${deeplKey.trim()}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (deeplRes.ok) {
          const deeplData = await deeplRes.json();
          const translatedText = deeplData?.translations?.[0]?.text;
          const detectedLang = deeplData?.translations?.[0]?.detected_source_language?.toLowerCase() || (sourceLang !== 'auto' ? sourceLang : 'en');

          if (translatedText) {
            return res.status(200).json({
              translatedText,
              detectedLang,
              provider: 'deepl',
            });
          }
        } else {
          console.warn('DeepL request failed, falling back to Google Cloud:', deeplRes.status);
        }
      } catch (deeplErr) {
        console.warn('DeepL error, falling back:', deeplErr);
      }
    }

    // 2. High-performance fallback: Google Neural translation pipeline
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(
      sourceLang
    )}&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(trimmedText)}`;

    const upstreamRes = await fetch(url);
    if (!upstreamRes.ok) {
      return res.status(upstreamRes.status).json({
        translatedText: trimmedText,
        detectedLang: sourceLang !== 'auto' ? sourceLang : 'en',
        provider: 'fallback-verbatim',
      });
    }

    const data = await upstreamRes.json();
    let translatedText = trimmedText;
    if (Array.isArray(data?.[0])) {
      translatedText = data[0].map((part: [string]) => part[0]).join('');
    }
    const detectedLang =
      typeof data?.[2] === 'string'
        ? data[2]
        : sourceLang !== 'auto'
        ? sourceLang
        : 'en';

    return res.status(200).json({
      translatedText,
      detectedLang,
      provider: 'google-neural',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal translation error';
    return res.status(500).json({ error: msg });
  }
}
