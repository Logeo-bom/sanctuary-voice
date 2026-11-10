import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

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

    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(
      sourceLang
    )}&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(text.trim())}`;

    const upstreamRes = await fetch(url);
    if (!upstreamRes.ok) {
      return res.status(upstreamRes.status).json({
        translatedText: text,
        detectedLang: sourceLang !== 'auto' ? sourceLang : 'en',
      });
    }

    const data = await upstreamRes.json();
    let translatedText = text;
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
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal translation error';
    return res.status(500).json({ error: msg });
  }
}
