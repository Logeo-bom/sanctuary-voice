// Thin client for the QR-code local caption distribution feature (see api/caption-relay.ts).
// On the operator/main device, publishSegment() pushes new translated segments under a session id.
// On a congregant's device that scanned the QR code, ListenerPoller polls for new segments and
// renders them with zero app install — mirroring Church-Cap's "scan the QR, view captions on your
// own phone" distribution model, but reusing our existing deployed web app instead of a bespoke
// local server.

const RELAY_ENDPOINT = '/api/caption-relay';
const POLL_INTERVAL_MS = 1500;

export interface RelaySegmentPayload {
  id?: string;
  speakerLabel: string;
  originalText: string;
  translatedText: string;
  sourceLanguageName: string;
}

export interface RelaySegment extends RelaySegmentPayload {
  id: string;
  timestamp: number;
}

export function createCaptionSessionId(): string {
  return `svc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function buildListenerShareUrl(sessionId: string, targetLangCode: string): string {
  const url = new URL(window.location.href);
  url.search = '';
  url.searchParams.set('listen', sessionId);
  url.searchParams.set('lang', targetLangCode);
  return url.toString();
}

/**
 * OBS/ProPresenter browser-source output (Church-Cap/DilMesh-inspired): builds a URL to the
 * transparent, chrome-free caption overlay (see BroadcastOverlayView) that can be added directly
 * as an OBS "Browser Source" or ProPresenter web overlay for in-building screens/streaming, as an
 * alternative distribution channel to the per-listener QR view above.
 */
export function buildBroadcastOverlayUrl(sessionId: string, targetLangCode: string): string {
  const url = new URL(window.location.href);
  url.search = '';
  url.searchParams.set('obs', sessionId);
  url.searchParams.set('lang', targetLangCode);
  return url.toString();
}

export async function publishCaptionSegment(
  sessionId: string,
  segment: RelaySegmentPayload
): Promise<void> {
  try {
    await fetch(RELAY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, segment }),
    });
  } catch {
    // Best-effort: dropping a caption from the shared QR view should never interrupt the main service.
  }
}

export class CaptionListenerPoller {
  private sessionId: string;
  private onSegments: (segments: RelaySegment[]) => void;
  private onActiveChange?: (active: boolean) => void;
  private sinceTimestamp = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    sessionId: string,
    onSegments: (segments: RelaySegment[]) => void,
    onActiveChange?: (active: boolean) => void
  ) {
    this.sessionId = sessionId;
    this.onSegments = onSegments;
    this.onActiveChange = onActiveChange;
  }

  start(): void {
    this.poll();
    this.timer = setInterval(() => this.poll(), POLL_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async poll(): Promise<void> {
    try {
      const res = await fetch(
        `${RELAY_ENDPOINT}?sessionId=${encodeURIComponent(this.sessionId)}&since=${this.sinceTimestamp}`
      );
      if (!res.ok) return;
      const data = await res.json();
      this.onActiveChange?.(Boolean(data.active));
      const segments: RelaySegment[] = data.segments || [];
      if (segments.length > 0) {
        this.sinceTimestamp = segments[segments.length - 1].timestamp;
        this.onSegments(segments);
      }
    } catch {
      // Silently retry on next tick; transient network hiccups shouldn't disrupt the listener view.
    }
  }
}
