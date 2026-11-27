import React, { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { APP_UPDATE_READY_EVENT } from '../pwa/registerServiceWorker';

/** Small bottom banner offering a refresh after a new version of the app has been installed. */
export const AppUpdateBanner: React.FC = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const show = () => setVisible(true);
    window.addEventListener(APP_UPDATE_READY_EVENT, show);
    return () => window.removeEventListener(APP_UPDATE_READY_EVENT, show);
  }, []);

  if (!visible) return null;

  return (
    <div
      role="status"
      className="fixed left-1/2 -translate-x-1/2 z-[100] w-[calc(100%-2rem)] max-w-sm bg-slate-900 border border-sky-500/40 rounded-xl shadow-lg px-3 py-2 flex items-center gap-2"
      style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
    >
      <span className="text-[11px] text-slate-200 flex-1">A new version of SanctuaryVoice is ready.</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="px-2.5 py-1 rounded-lg bg-sky-500/20 border border-sky-500/50 text-sky-200 font-semibold text-[11px] flex items-center gap-1 cursor-pointer"
      >
        <RefreshCw className="w-3 h-3" />
        Refresh
      </button>
      <button
        type="button"
        aria-label="Dismiss update notice"
        onClick={() => setVisible(false)}
        className="p-1 text-slate-400 hover:text-slate-200 cursor-pointer"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
