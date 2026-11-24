import { useEffect, useRef, useState } from 'react';
import { CaptionListenerPoller, type RelaySegment } from '../services/captionRelayClient';

interface BroadcastOverlayViewProps {
  sessionId: string;
  targetLangName?: string;
}

// OBS/ProPresenter browser-source output (Church-Cap/DilMesh-inspired): a transparent, chrome-free
// caption overlay meant to be captured as an OBS "Browser Source" or embedded as a ProPresenter web
// overlay for in-building screens/streaming — a separate distribution channel from the per-listener
// QR view (ListenerCaptionView), which is designed for individual phones instead of a shared screen.
// Reuses the same lightweight caption relay/poller; renders only the single most recent segment in
// large, high-contrast text so it stays legible when keyed over video or projected on a stage screen.
export function BroadcastOverlayView({ sessionId, targetLangName }: BroadcastOverlayViewProps) {
  const [latestSegment, setLatestSegment] = useState<RelaySegment | null>(null);
  const pollerRef = useRef<CaptionListenerPoller | null>(null);

  useEffect(() => {
    const poller = new CaptionListenerPoller(sessionId, (newSegments) => {
      if (newSegments.length > 0) {
        setLatestSegment(newSegments[newSegments.length - 1]);
      }
    });
    pollerRef.current = poller;
    poller.start();
    return () => poller.stop();
  }, [sessionId]);

  // OBS browser sources (and most ProPresenter web overlays) key out transparency based on the
  // actual page background, not just this component's own styling — override the app-wide dark
  // `body` background (see index.css) for the lifetime of this view, and restore it on unmount so
  // the normal operator UI keeps its usual background.
  useEffect(() => {
    const previousBodyBg = document.body.style.background;
    const previousHtmlBg = document.documentElement.style.background;
    document.body.style.background = 'transparent';
    document.documentElement.style.background = 'transparent';
    return () => {
      document.body.style.background = previousBodyBg;
      document.documentElement.style.background = previousHtmlBg;
    };
  }, []);

  return (
    <div className="min-h-screen w-full flex items-end justify-center bg-transparent p-6">
      <div className="max-w-4xl w-full flex flex-col items-center gap-2 pb-6">
        {latestSegment && (
          <div className="text-[11px] uppercase tracking-widest font-bold text-sky-300 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
            {latestSegment.speakerLabel}
            {targetLangName ? ` · ${targetLangName}` : ''}
          </div>
        )}
        <div
          className="text-center text-3xl md:text-5xl font-extrabold text-white leading-snug"
          style={{ textShadow: '0 2px 10px rgba(0,0,0,0.95), 0 0 2px rgba(0,0,0,0.95)' }}
        >
          {latestSegment?.translatedText || ''}
        </div>
      </div>
    </div>
  );
}
