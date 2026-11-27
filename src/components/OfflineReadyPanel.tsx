import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Download, Package, Trash2, WifiOff } from 'lucide-react';
import { SUPPORTED_LANGUAGES } from '../constants/languages';
import {
  MISSION_PACKS,
  type MissionPackDirection,
  findMissionPackForLanguages,
  getMissionPackLanguages,
} from '../constants/missionPacks';
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
  /** Switches the app's Speaker 1 / translate-to languages when a mission pack is set up. */
  onApplyLanguages?: (sourceLangCode: string, targetLangCode: string) => void;
}

const CURRENT_SETTINGS = 'current';

function languageName(code: string): string {
  if (code === 'auto') return 'Auto-detect';
  return SUPPORTED_LANGUAGES.find((l) => l.code === code)?.name || code.toUpperCase();
}

/** Free browser storage for this site in MB, or null when the browser can't tell us. */
async function estimateFreeStorageMb(): Promise<number | null> {
  try {
    const estimate = await navigator.storage?.estimate?.();
    if (!estimate || typeof estimate.quota !== 'number') return null;
    return Math.max(0, Math.floor((estimate.quota - (estimate.usage || 0)) / (1024 * 1024)));
  } catch {
    return null;
  }
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

export const OfflineReadyPanel: React.FC<OfflineReadyPanelProps> = ({
  sourceLangCode,
  targetLangCode,
  onApplyLanguages,
}) => {
  const [, forceRender] = useState(0);
  const initialMatch = useMemo(() => findMissionPackForLanguages(sourceLangCode, targetLangCode), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [packId, setPackId] = useState<string>(initialMatch?.pack.id ?? CURRENT_SETTINGS);
  const [direction, setDirection] = useState<MissionPackDirection>(initialMatch?.direction ?? 'local-to-english');
  const [freeStorageMb, setFreeStorageMb] = useState<number | null>(null);
  const [packError, setPackError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeOfflineReadiness(() => forceRender((n) => n + 1));
    void verifyOfflineModelCache();
    void estimateFreeStorageMb().then(setFreeStorageMb);
    return unsubscribe;
  }, []);

  const pack = MISSION_PACKS.find((p) => p.id === packId) ?? null;
  const { sourceLangCode: offlineSource, targetLangCode: offlineTarget } = pack
    ? getMissionPackLanguages(pack, direction)
    : { sourceLangCode, targetLangCode };

  const whisperModelId = getWhisperModelIdForLanguage(offlineSource);
  const whisperStatus = getOfflineModelStatus(whisperModelId);
  const nllbStatus = getOfflineModelStatus(NLLB_MODEL_ID);
  const neuralPairSupported = isNllbLanguageSupported(offlineSource) && isNllbLanguageSupported(offlineTarget);
  const allReady = whisperStatus.state === 'ready' && nllbStatus.state === 'ready';
  const anyDownloading = whisperStatus.state === 'downloading' || nllbStatus.state === 'downloading';

  const missingSizeMb =
    (whisperStatus.state === 'ready' ? 0 : getOfflineModelApproxSizeMb(whisperModelId) ?? 0) +
    (nllbStatus.state === 'ready' ? 0 : getOfflineModelApproxSizeMb(NLLB_MODEL_ID) ?? 0);
  const notEnoughSpace = freeStorageMb !== null && missingSizeMb > freeStorageMb;
  const languagesDiffer = !!pack && (offlineSource !== sourceLangCode || offlineTarget !== targetLangCode);

  const setUpPack = async () => {
    setPackError(null);
    if (languagesDiffer) onApplyLanguages?.(offlineSource, offlineTarget);
    try {
      // One at a time so a slow phone connection isn't split across two large downloads.
      if (whisperStatus.state !== 'ready') await downloadWhisperModel(offlineSource);
      if (nllbStatus.state !== 'ready') await downloadNllbModel();
    } catch {
      setPackError('Pack download stopped. Check the internet connection and tap again to continue.');
    } finally {
      void estimateFreeStorageMb().then(setFreeStorageMb);
    }
  };

  let packButtonLabel = `Download pack (~${missingSizeMb} MB)`;
  if (allReady) packButtonLabel = languagesDiffer ? 'Use this pack' : 'Pack ready';
  else if (languagesDiffer) packButtonLabel = `Use & download (~${missingSizeMb} MB)`;

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

      <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 space-y-2">
        <label className="block space-y-1">
          <span className="text-[11px] font-semibold text-slate-200 flex items-center gap-1.5">
            <Package className="w-3.5 h-3.5 text-sky-300" />
            Mission pack
          </span>
          <select
            aria-label="Mission pack"
            value={packId}
            onChange={(e) => {
              setPackId(e.target.value);
              setPackError(null);
            }}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-[11px] text-slate-200"
          >
            <option value={CURRENT_SETTINGS}>
              Current languages ({languageName(sourceLangCode)} → {languageName(targetLangCode)})
            </option>
            {MISSION_PACKS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.region} – {p.localLangName}
              </option>
            ))}
          </select>
        </label>

        {pack && (
          <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Who is speaking">
            {(
              [
                ['local-to-english', `${pack.localLangName} speaker → English`],
                ['english-to-local', `English speaker → ${pack.localLangName}`],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={direction === value}
                onClick={() => setDirection(value)}
                className={`px-2 py-1.5 rounded-lg border text-[10px] font-semibold leading-tight transition cursor-pointer ${
                  direction === value
                    ? 'bg-sky-500/15 border-sky-500/50 text-sky-200'
                    : 'bg-slate-950 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {pack && (
          <>
            <button
              type="button"
              onClick={() => void setUpPack()}
              disabled={anyDownloading || (allReady && !languagesDiffer) || (!allReady && notEnoughSpace)}
              className="w-full px-2.5 py-1.5 rounded-lg bg-sky-500/15 border border-sky-500/40 text-sky-200 font-semibold text-[11px] hover:bg-sky-500/25 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
            >
              {allReady ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />}
              {anyDownloading ? 'Downloading…' : packButtonLabel}
            </button>
            {languagesDiffer && (
              <p className="text-[10px] text-slate-400 leading-tight">
                This sets Speaker 1 to {languageName(offlineSource)} and translates to {languageName(offlineTarget)}.
              </p>
            )}
          </>
        )}

        {freeStorageMb !== null && (
          <p className={`text-[10px] leading-tight ${notEnoughSpace ? 'text-rose-300' : 'text-slate-500'}`}>
            {notEnoughSpace
              ? `Not enough space: needs ~${missingSizeMb} MB, about ${freeStorageMb} MB available. Free up space on this device first.`
              : `About ${freeStorageMb >= 1024 ? `${(freeStorageMb / 1024).toFixed(1)} GB` : `${freeStorageMb} MB`} available for offline files.`}
          </p>
        )}
        {packError && <p className="text-[10px] text-rose-300 leading-tight">{packError}</p>}
      </div>

      <ModelRow
        label="Speech recognition"
        detail={whisperModelId}
        sizeMb={getOfflineModelApproxSizeMb(whisperModelId)}
        status={whisperStatus}
        onDownload={() => {
          void downloadWhisperModel(offlineSource).catch(() => {});
        }}
        onRemove={() => {
          void removeWhisperModel(offlineSource).catch((err) => {
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
        Open this app once with internet after each update; after that it opens without internet too. For the best experience, add it to your home screen (browser menu → Install app / Add to Home screen).
      </p>
    </div>
  );
};
