import { useEffect, useRef, useState } from 'react';
import { X, QrCode, Copy, Check } from 'lucide-react';
import QRCode from 'qrcode';

interface CaptionShareQRProps {
  shareUrl: string;
  onClose: () => void;
}

// Church-Cap-inspired "scan the QR code, view captions on your own phone" modal. Zero install:
// the congregant's phone camera scans the code and opens the app's read-only listener view
// (see ListenerCaptionView) in their own browser.
export function CaptionShareQR({ shareUrl, onClose }: CaptionShareQRProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, shareUrl, {
        width: 240,
        margin: 2,
        color: { dark: '#0f172a', light: '#f8fafc' },
      }).catch(() => {});
    }
  }, [shareUrl]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable; user can still read/select the link manually.
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-sky-500/30 rounded-2xl p-6 max-w-sm w-full flex flex-col items-center gap-4">
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2 text-sky-400 font-bold">
            <QrCode size={18} />
            <span>Share Live Captions</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X size={20} />
          </button>
        </div>
        <canvas ref={canvasRef} className="rounded-lg bg-slate-50 p-2" />
        <p className="text-xs text-slate-400 text-center">
          Scan this code to view live captions on your own device — no app install required.
        </p>
        <button
          onClick={handleCopy}
          className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 w-full justify-center"
        >
          {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
          {copied ? 'Link copied' : 'Copy link instead'}
        </button>
      </div>
    </div>
  );
}
