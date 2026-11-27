import React, { useEffect, useState } from 'react';
import { CheckCircle2, Download, Trash2, WifiOff } from 'lucide-react';
import {
  downloadWhisperModel,
  getWhisperModelIdForLanguage,
  removeWhisperModel,
} from '../services/churchAudioEngine';
import {
  NLLB_MODEL_ID,
  downloadNllbModel,
  isNllbLanguageSupported,
  removeNllbModel,
} from '../services/offlineEdgeTranslator';
import {
  type OfflineModelStatus,
  getOfflineModelApproxSizeMb,
  getOfflineModelStatus,
  subscribeOfflineReadiness,
  verifyOfflineModelCache,
} from '../services/offlineReadiness';

interface OfflineReadyPanelProps {
  sourceLangCode: string;
  targetLangCode: string;
}

interface ModelRowProps {
  label: string;
  detail: string;
  sizeMb?: number;
  status: OfflineModelStatus;
  onDownload: () => void;
  onRemove: () => void;
}

const ModelRow: React.FC<ModelRowProps> = ({ label, detail, sizeMb, status, onDownload, onRemove }) => (
  <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 space-y-1.5">
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <div className="text-[11px] font-semibold text-slate-200">{label}</div>
        <div className="text-[10px] text-slate-500 truncate">
          {detail} {sizeMb !== undefined && <span>(~{sizeMb} MB)</span>}
        </div>
      </div>
      {status.state === 'ready' && (
        <div className="flex items-center gap-2 shrink-0">
          <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Downloaded
          </span>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${label} model`}
            className="px-2 py-1 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 font-semibold text-[10px] hover:bg-rose-500/20 transition cursor-pointer flex items-center gap-1"
          >
            <Trash2 className="w-3 h-3" />
            Remove
          </button>
        </div>
      )}
      {status.state === 'downloading' && (
        <span className="text-[10px] font-semibold text-sky-300 shrink-0">
          Downloading {status.progress}%
        </span>
      )}
      {(status.state === 'missing' || status.state === 'error') && (
        <button
          type="button"
          onClick={onDownload}
          className="px-2.5 py-1 rounded-lg bg-sky-500/15 border border-sky-500/40 text-sky-300 font-semibold text-[10px] hover:bg-sky-500/25 transition cursor-pointer flex items-center gap-1 shrink-0"
        >
          <Download className="w-3 h-3" />
          {status.state === 'error' ? 'Retry' : 'Download'}
        </button>
      )}
    </div>
    {status.state === 'downloading' && (
      <div
        className="h-1.5 rounded-full bg-slate-800 overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={status.progress}
      >
        <div className="h-full bg-sky-400 transition-all" style={{ width: `${status.progress}%` }} />
      </div>
    )}
    {status.state === 'error' && (
      <p className="text-[10px] text-rose-300 leading-tight">
        Download failed. Check the internet connection and try again.
      </p>
    )}
  </div>
);

export const OfflineReadyPanel: React.FC<OfflineReadyPanelProps> = ({ sourceLangCode, targetLangCode }) => {
  const [, forceRender] = useState(0);

  useEffect(() => {
    const unsubscribe = subscribeOfflineReadiness(() => forceRender((n) => n + 1));
    void verifyOfflineModelCache();
    return unsubscribe;
  }, []);

  const whisperModelId = getWhisperModelIdForLanguage(sourceLangCode);
  const whisperStatus = getOfflineModelStatus(whisperModelId);
  const nllbStatus = getOfflineModelStatus(NLLB_MODEL_ID);
  const neuralPairSupported = isNllbLanguageSupported(sourceLangCode) && isNllbLanguageSupported(targetLangCode);
  const allReady = whisperStatus.state === 'ready' && nllbStatus.state === 'ready';

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
          <WifiOff className="w-4 h-4 text-emerald-400" />
          Offline Ready
        </span>
        <span
          className={`text-[10px] font-semibold ${allReady ? 'text-emerald-400' : 'text-amber-300'}`}
        >
          {allReady ? 'Models downloaded' : 'Not ready yet'}
        </span>
      </div>
      <p className="text-[10px] text-slate-400 leading-relaxed">
        Downloads start only when you tap Download. Sizes are approximate; actual storage use may vary.
        Check again after changing the spoken language, since some languages use a different speech model.
      </p>

      <ModelRow
        label="Speech recognition"
        detail={whisperModelId}
        sizeMb={getOfflineModelApproxSizeMb(whisperModelId)}
        status={whisperStatus}
        onDownload={() => {
          void downloadWhisperModel(sourceLangCode).catch(() => {});
        }}
        onRemove={() => {
          void removeWhisperModel(sourceLangCode).catch((err) => {
            console.warn('[OfflineReadyPanel] Could not remove speech model:', err);
          });
        }}
      />
      <ModelRow
        label="Translation"
        detail={NLLB_MODEL_ID}
        sizeMb={getOfflineModelApproxSizeMb(NLLB_MODEL_ID)}
        status={nllbStatus}
        onDownload={() => {
          void downloadNllbModel().catch(() => {});
        }}
        onRemove={() => {
          void removeNllbModel().catch((err) => {
            console.warn('[OfflineReadyPanel] Could not remove translation model:', err);
          });
        }}
      />

      {!neuralPairSupported && (
        <p className="text-[10px] text-amber-300 leading-tight">
          The selected language pair is not covered by the offline translation model. Offline translation
          will use a small built-in word list, so expect rough results.
        </p>
      )}
      <p className="text-[10px] text-slate-500 leading-tight">
        Keep this app open when going offline. Reloading the page without internet may not work yet.
      </p>
    </div>
  );
};
