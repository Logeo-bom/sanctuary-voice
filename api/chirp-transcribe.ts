import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import { isLowConfidenceSegment } from '../src/utils/transcriptUtils';

// Google Cloud Speech-to-Text v2 "Chirp 2" integration. Unlike Deepgram/Gemini (already wired into
// this app), Chirp 2 officially supports Cebuano/Bisaya (`ceb-PH`) and 100+ other languages,
// including several under-resourced regional/Visayan languages Deepgram has no acoustic model for
// at all - see `src/constants/chirpLanguages.ts` for the language routing. Chirp 2 is cloud-only
// (no on-device/offline mode exists for it), so it plugs into the existing "Cloud Mode" REST-chunk
// pipeline in `App.tsx`, parallel to the Deepgram/Gemini REST fallbacks, not the live WebSocket path.
//
// Auth: Google Cloud Speech-to-Text v2 requires an OAuth2 Bearer token (no simple API key support
// for this API), so this endpoint self-signs a short-lived JWT with a service account's private key
// and exchanges it for an access token via Google's token endpoint - no extra npm dependency needed
// (uses Node's built-in `crypto`), consistent with this project's lightweight-dependency approach.

interface GoogleServiceAccountKey {
  client_email: string;
  private_key: string;
  project_id: string;
}

export function selectChirpTranscript(results: Array<{
  alternatives?: Array<{ transcript?: string; confidence?: number }>;
}>): { transcript: string; confidence: number | undefined } {
  const accepted = results
    .map((result) => result?.alternatives?.[0])
    .filter((alternative): alternative is { transcript?: string; confidence?: number } =>
      !!alternative?.transcript?.trim() && !isLowConfidenceSegment(alternative.confidence));
  const transcript = accepted.map((alternative) => alternative.transcript!.trim()).join(' ');
  const confidence = accepted.length > 0 && accepted.every((alternative) =>
    typeof alternative.confidence === 'number' && Number.isFinite(alternative.confidence))
    ? Math.min(...accepted.map((alternative) => alternative.confidence!))
    : undefined;
  return { transcript, confidence };
}

function base64url(input: Buffer | string): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function loadServiceAccount(): GoogleServiceAccountKey | null {
  const raw = process.env.GOOGLE_CHIRP_SERVICE_ACCOUNT_KEY || '';
  if (!raw.trim()) return null;
  try {
    const jsonStr = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf-8');
    const parsed = JSON.parse(jsonStr);
    if (!parsed?.client_email || !parsed?.private_key) return null;
    return parsed as GoogleServiceAccountKey;
  } catch {
    return null;
  }
}

async function mintGoogleAccessToken(serviceAccount: GoogleServiceAccountKey): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    iat: nowSec,
    exp: nowSec + 3600,
  };

  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(serviceAccount.private_key);
  const assertion = `${signingInput}.${base64url(signature)}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    throw new Error(`Google OAuth token exchange failed (${tokenRes.status}): ${errText.slice(0, 200)}`);
  }

  const tokenData = await tokenRes.json();
  if (!tokenData?.access_token) {
    throw new Error('Google OAuth token response missing access_token');
  }
  return tokenData.access_token as string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const accessCode = process.env.CHIRP_OPERATOR_ACCESS_CODE || '';
  if (Buffer.byteLength(accessCode, 'utf8') < 32) {
    return res.status(503).json({ error: 'Chirp access is not configured.' });
  }
  const authorization = req.headers.authorization;
  const supplied = typeof authorization === 'string' && authorization.startsWith('Bearer ')
    ? authorization.slice(7) : '';
  const expectedHash = crypto.createHash('sha256').update(accessCode).digest();
  const suppliedHash = crypto.createHash('sha256').update(supplied).digest();
  if (!crypto.timingSafeEqual(expectedHash, suppliedHash)) {
    return res.status(401).json({ error: 'Invalid Chirp access code.' });
  }

  try {
    const audioBase64 = req.body?.audioBase64;
    const languageCode = req.body?.languageCode || 'ceb-PH';
    const location = process.env.GOOGLE_CHIRP_LOCATION || 'us-central1';

    if (typeof audioBase64 !== 'string' || !audioBase64 || audioBase64.length > 1500000 ||
        audioBase64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(audioBase64)) {
      return res.status(400).json({ error: 'Invalid or oversized audio.' });
    }
    if (languageCode !== 'ceb-PH') {
      return res.status(400).json({ error: 'Unsupported language.' });
    }

    const serviceAccount = loadServiceAccount();
    if (!serviceAccount) {
      return res.status(500).json({
        error:
          'Chirp 2 is not configured. Set GOOGLE_CHIRP_SERVICE_ACCOUNT_KEY (a base64-encoded Google Cloud service account JSON key with Cloud Speech-to-Text API access) in the server environment.',
      });
    }

    const projectId = process.env.GOOGLE_CHIRP_PROJECT_ID || serviceAccount.project_id;
    const accessToken = await mintGoogleAccessToken(serviceAccount);

    const recognizeUrl = `https://${location}-speech.googleapis.com/v2/projects/${projectId}/locations/${location}/recognizers/_:recognize`;

    const sttRes = await fetch(recognizeUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        config: {
          autoDecodingConfig: {},
          languageCodes: [languageCode],
          model: 'chirp_2',
          features: { enableAutomaticPunctuation: true },
        },
        content: audioBase64,
      }),
    });

    if (!sttRes.ok) {
      const errText = await sttRes.text();
      return res.status(sttRes.status).json({ error: `Chirp 2 request failed: ${errText.slice(0, 300)}` });
    }

    const data = await sttRes.json();
    const results = Array.isArray(data?.results) ? data.results : [];
    const { transcript, confidence } = selectChirpTranscript(results);

    return res.status(200).json({
      transcript,
      confidence: typeof confidence === 'number' ? confidence : undefined,
      languageCode,
      provider: 'google-chirp-2',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal Chirp 2 transcription error';
    return res.status(500).json({ error: message });
  }
}
