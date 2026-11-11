import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-deepgram-key');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // 1. Read from server-side environment variable first (Zero user configuration),
    // then fallback to client-provided key
    const rawApiKey =
      process.env.DEEPGRAM_API_KEY ||
      (req.headers['x-deepgram-key'] as string) ||
      '';
    const authHeader = req.headers['authorization'] || '';
    const apiKey = rawApiKey || authHeader.replace(/^Token\s+/i, '').replace(/^Bearer\s+/i, '').trim();

    if (!apiKey) {
      return res.status(400).json({ error: 'Missing Deepgram API key. Configure DEEPGRAM_API_KEY in Vercel or pass x-deepgram-key.' });
    }

    // Call Deepgram's official grant endpoint to mint a short-lived browser JWT
    const response = await fetch('https://api.deepgram.com/v1/auth/grant', {
      method: 'POST',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ttl_seconds: 60 }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({
        error: `Deepgram Token Grant Error: ${errText.slice(0, 200)}`,
      });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return res.status(500).json({ error: message });
  }
}
