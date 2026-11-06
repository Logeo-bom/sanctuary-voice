import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const text = ((req.query.q as string) || '').trim();
    const lang = ((req.query.tl as string) || 'en').trim();

    if (!text) {
      return res.status(400).send('Missing text parameter');
    }

    const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(
      text.slice(0, 200)
    )}&tl=${encodeURIComponent(lang)}&client=tw-ob`;

    const upstream = await fetch(ttsUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      },
    });

    if (!upstream.ok) {
      return res.status(upstream.status).send('TTS upstream error');
    }

    const arrayBuffer = await upstream.arrayBuffer();
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.status(200).send(Buffer.from(arrayBuffer));
  } catch (err) {
    return res.status(500).send(err instanceof Error ? err.message : 'Internal error');
  }
}
