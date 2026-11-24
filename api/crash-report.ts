import type { VercelRequest, VercelResponse } from '@vercel/node';

// Lightweight crash telemetry relay, mirroring the same in-memory pattern used by
// `api/caption-relay.ts`. The client (`src/services/crashTelemetry.ts`) always persists crashes to
// localStorage first (so nothing is lost even if this endpoint is unreachable, e.g. a missionary
// fully offline in the field) and only makes a single best-effort attempt to POST here. This keeps
// a short rolling buffer of the most recent crash reports across all clients visible in one place,
// without needing a database for what is, in practice, a low-volume diagnostic signal.

interface CrashReport {
  id: string;
  message: string;
  stack?: string;
  context: string;
  timestamp: number;
  userAgent: string;
  url: string;
}

const MAX_REPORTS = 200;
const REPORT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Module-level array survives across invocations on the same warm lambda instance only - this is a
// diagnostic convenience, not a durable store.
const reports: CrashReport[] = [];

function pruneExpiredReports(): void {
  const cutoff = Date.now() - REPORT_TTL_MS;
  while (reports.length > 0 && reports[0].timestamp < cutoff) {
    reports.shift();
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  pruneExpiredReports();

  if (req.method === 'POST') {
    const entry = req.body?.entry as Partial<CrashReport> | undefined;
    if (!entry || typeof entry.message !== 'string') {
      return res.status(400).json({ error: 'Missing crash entry payload' });
    }

    reports.push({
      id: entry.id || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      message: entry.message.slice(0, 2000),
      stack: typeof entry.stack === 'string' ? entry.stack.slice(0, 4000) : undefined,
      context: typeof entry.context === 'string' ? entry.context.slice(0, 200) : 'unknown',
      timestamp: typeof entry.timestamp === 'number' ? entry.timestamp : Date.now(),
      userAgent: typeof entry.userAgent === 'string' ? entry.userAgent.slice(0, 300) : 'unknown',
      url: typeof entry.url === 'string' ? entry.url.slice(0, 500) : 'unknown',
    });
    if (reports.length > MAX_REPORTS) {
      reports.splice(0, reports.length - MAX_REPORTS);
    }

    return res.status(200).json({ ok: true });
  }

  if (req.method === 'GET') {
    // Minimal read-back for ops/debugging - not exposed in the app UI, just a manual diagnostic aid.
    return res.status(200).json({ reports, count: reports.length });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
