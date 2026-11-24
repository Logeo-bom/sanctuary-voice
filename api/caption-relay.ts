import type { VercelRequest, VercelResponse } from '@vercel/node';

// Church-Cap-inspired QR-code local caption distribution: the main listening device (operator's
// laptop/tablet) POSTs the latest live segments here under a short-lived session id, and any
// congregant's phone that scans the QR code simply GETs the same session id to view captions,
// with zero install and zero app download. This is a lightweight in-memory relay (not a database),
// so it only guarantees delivery within a single warm serverless instance/session lifetime — fine
// for a single live service, but segments are lost on cold start. For a fully offline/local-only
// deployment (no internet at all), this endpoint can be swapped for a tiny LAN HTTP server running
// on the operator's own machine using the same request/response contract below.

interface RelaySegment {
  id: string;
  speakerLabel: string;
  originalText: string;
  translatedText: string;
  sourceLanguageName: string;
  timestamp: number;
}

interface RelaySession {
  segments: RelaySegment[];
  updatedAt: number;
}

const MAX_SEGMENTS_PER_SESSION = 40;
const SESSION_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours, generous for a single service/event

// Module-level map survives across invocations on the same warm lambda instance.
const sessions = new Map<string, RelaySession>();

function pruneExpiredSessions(): void {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (now - session.updatedAt > SESSION_TTL_MS) {
      sessions.delete(id);
    }
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  pruneExpiredSessions();

  const sessionId = (req.body?.sessionId || req.query?.sessionId || '') as string;
  if (!sessionId || typeof sessionId !== 'string' || sessionId.length > 64) {
    return res.status(400).json({ error: 'Missing or invalid sessionId' });
  }

  if (req.method === 'POST') {
    const segment = req.body?.segment as Partial<RelaySegment> | undefined;
    if (!segment || typeof segment.translatedText !== 'string') {
      return res.status(400).json({ error: 'Missing segment payload' });
    }

    const existing = sessions.get(sessionId) || { segments: [], updatedAt: 0 };
    existing.segments.push({
      id: segment.id || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      speakerLabel: segment.speakerLabel || 'Speaker',
      originalText: segment.originalText || '',
      translatedText: segment.translatedText,
      sourceLanguageName: segment.sourceLanguageName || '',
      timestamp: Date.now(),
    });
    if (existing.segments.length > MAX_SEGMENTS_PER_SESSION) {
      existing.segments = existing.segments.slice(-MAX_SEGMENTS_PER_SESSION);
    }
    existing.updatedAt = Date.now();
    sessions.set(sessionId, existing);

    return res.status(200).json({ ok: true, count: existing.segments.length });
  }

  if (req.method === 'GET') {
    const since = Number(req.query?.since || 0);
    const session = sessions.get(sessionId);
    if (!session) {
      return res.status(200).json({ segments: [], active: false });
    }
    const segments = since > 0 ? session.segments.filter((s) => s.timestamp > since) : session.segments;
    return res.status(200).json({ segments, active: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
