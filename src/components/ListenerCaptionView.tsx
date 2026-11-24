import { useEffect, useRef, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { CaptionListenerPoller, type RelaySegment } from '../services/captionRelayClient';

interface ListenerCaptionViewProps {
  sessionId: string;
  targetLangName?: string;
}

// Zero-install congregant view opened by scanning the QR code from CaptionShareQR. Polls the
// lightweight caption relay instead of running any speech/translation pipeline itself, so it works
// on any phone's browser with no app download (the Church-Cap QR-distribution idea).
export function ListenerCaptionView({ sessionId, targetLangName }: ListenerCaptionViewProps) {
  const [segments, setSegments] = useState<RelaySegment[]>([]);
  const [isActive, setIsActive] = useState(true);
  const pollerRef = useRef<CaptionListenerPoller | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const poller = new CaptionListenerPoller(
      sessionId,
      (newSegments) => setSegments((prev) => [...prev, ...newSegments].slice(-60)),
      setIsActive
    );
    pollerRef.current = poller;
    poller.start();
    return () => poller.stop();
  }, [sessionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [segments]);

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
        <div className="text-sm font-bold text-sky-400">Sanctuary Live Captions</div>
        {!isActive && (
          <div className="flex items-center gap-1 text-xs text-amber-400">
            <WifiOff size={14} />
            <span>Waiting for broadcast…</span>
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
        {segments.length === 0 && (
          <div className="text-slate-500 text-sm text-center mt-10">
            Live captions{targetLangName ? ` (${targetLangName})` : ''} will appear here as soon as the
            speaker starts.
          </div>
        )}
        {segments.map((seg) => (
          <div key={seg.id} className="rounded-xl bg-slate-900/70 border border-slate-800 p-3">
            <div className="text-[11px] uppercase tracking-wide text-sky-400 mb-1">
              {seg.speakerLabel}
            </div>
            <div className="text-base leading-relaxed">{seg.translatedText}</div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
