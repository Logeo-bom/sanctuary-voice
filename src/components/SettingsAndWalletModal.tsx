import React from 'react';
import {
  X,
  Wallet,
  Headphones,
  CheckCircle2,
  Sparkles,
  Clock,
  Radio,
  Zap,
} from 'lucide-react';
import type {
  PrepaidAccountState,
  SpeechOutputConfig,
  VoiceEngineMode,
} from '../types/translator';

interface SettingsAndWalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiKey: string;
  onSaveApiKey: (key: string) => void;
  deepgramKey: string;
  onSaveDeepgramKey: (key: string) => void;
  activeAiProvider: 'deepgram' | 'gemini';
  onSelectAiProvider: (provider: 'deepgram' | 'gemini') => void;
  speechConfig: SpeechOutputConfig;
  onChangeSpeechConfig: (partial: Partial<SpeechOutputConfig>) => void;
  wallet: PrepaidAccountState;
  onTopUpMinutes: (minutesToAdd: number, tierName: string) => void;
}

export const SettingsAndWalletModal: React.FC<SettingsAndWalletModalProps> = ({
  isOpen,
  onClose,
  activeAiProvider,
  onSelectAiProvider,
  speechConfig,
  onChangeSpeechConfig,
  wallet,
  onTopUpMinutes,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-5 sm:p-6 space-y-6 shadow-2xl my-8">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-sky-400" />
            <h2 className="text-base font-bold text-slate-100">
              AI Engines, Earphone Voice &amp; Token Credits
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 1. Primary AI Engine Switcher (Deepgram Primary + Gemini Fallback vs Gemini Direct) */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
            <Radio className="w-4 h-4 text-sky-400" />
            Live Church Speech-to-Text &amp; Translation Engine
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onSelectAiProvider('deepgram')}
              className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                activeAiProvider === 'deepgram'
                  ? 'bg-sky-500/15 border-sky-400 text-white shadow-lg'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-sky-300 flex items-center gap-1">
                  <Zap className="w-3.5 h-3.5" /> Deepgram + Gemini Fallback
                </span>
                {activeAiProvider === 'deepgram' && (
                  <CheckCircle2 className="w-3.5 h-3.5 text-sky-400" />
                )}
              </div>
              <p className="text-[11px] text-slate-400 leading-tight">
                Sub-300ms ultra-low latency • <strong>Deepgram Nova-2 primary</strong> with automatic <strong>Gemini 2.5 Flash fallback</strong>
              </p>
            </button>

            <button
              type="button"
              onClick={() => onSelectAiProvider('gemini')}
              className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                activeAiProvider === 'gemini'
                  ? 'bg-emerald-500/15 border-emerald-400 text-white shadow-lg'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-emerald-300 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5" /> Gemini 2.5 Flash Only
                </span>
                {activeAiProvider === 'gemini' && (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                )}
              </div>
              <p className="text-[11px] text-slate-400 leading-tight">
                Direct multimodal raw audio pipeline • Handles complex biblical idioms &amp; regional accents
              </p>
            </button>
          </div>
        </div>

        {/* 2. Cloud Server Connection Status (Clean, Production-Ready) */}
        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-sky-400" />
              Cloud AI Infrastructure
            </span>
            <span className="text-[11px] text-emerald-400 flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" /> Server Connected
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400">
            <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/80">
              <div className="font-semibold text-slate-300 mb-0.5">Deepgram &amp; DeepL</div>
              <div>Managed Server-Side</div>
            </div>
            <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/80">
              <div className="font-semibold text-slate-300 mb-0.5">Gemini 2.5 Flash</div>
              <div>Managed Server-Side</div>
            </div>
          </div>
          <p className="text-[11px] text-slate-400">
            Zero setup required for congregation members. Live audio streams securely through your dedicated church backend.
          </p>
        </div>

        {/* 4. Priority 2: Earphone Speech-to-Speech (TTS) Configuration */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Headphones className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-semibold text-slate-100">
                Priority 2: Earphone Speech-to-Speech Output
              </span>
            </div>
            <button
              type="button"
              onClick={() =>
                onChangeSpeechConfig({ enabled: !speechConfig.enabled })
              }
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                speechConfig.enabled
                  ? 'bg-emerald-500 text-slate-950'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {speechConfig.enabled ? 'Earphone Voice ON' : 'Text Only (Muted)'}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] text-slate-300 font-medium">
                  Voice Quality Engine
                </label>
                <span className="text-[10px] text-emerald-400 font-medium">
                  ✓ Auto-saved
                </span>
              </div>
              <select
                value={speechConfig.voiceEngine || 'neural-cloud'}
                onChange={(e) =>
                  onChangeSpeechConfig({
                    voiceEngine: e.target.value as VoiceEngineMode,
                  })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
              >
                <option value="neural-cloud">
                  Cloud Neural Voice (Natural Female — Free)
                </option>
                <option value="gemini-studio">
                  Gemini 2.5 Studio Voice (Requires Gemini Key)
                </option>
                <option value="device">Device Offline Voice</option>
              </select>
            </div>

            {speechConfig.voiceEngine === 'gemini-studio' && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] text-slate-300 font-medium">
                    Gemini Studio Interpreter Voice
                  </label>
                  <span className="text-[10px] text-emerald-400 font-medium">
                    ✓ Auto-saved
                  </span>
                </div>
                <select
                  value={speechConfig.geminiVoiceName || 'Aoede'}
                  onChange={(e) =>
                    onChangeSpeechConfig({
                      geminiVoiceName: e.target.value as
                        | 'Aoede'
                        | 'Charon'
                        | 'Kore'
                        | 'Fenrir',
                    })
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                >
                  <option value="Aoede">Aoede (Warm Female Interpreter)</option>
                  <option value="Charon">Charon (Calm Pastor Male)</option>
                  <option value="Kore">Kore (Clear Neutral Female)</option>
                  <option value="Fenrir">Fenrir (Deep Resonant Male)</option>
                </select>
              </div>
            )}
          </div>
        </div>

        {/* 5. Pre-Paid Token Financing Pass (Bard's Business Model) */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-semibold text-slate-100">
                Pre-Paid Translation Minutes (Token Financing)
              </span>
            </div>
            <span className="text-xs font-bold text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 rounded-full flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {wallet.minutesRemaining} mins remaining
            </span>
          </div>

          <div className="text-[11px] text-slate-400 flex flex-wrap justify-between gap-2 border-b border-slate-800/80 pb-2.5">
            <span>Active Pass: {wallet.activeTierName}</span>
            <span>Session AI Tokens: {wallet.sessionTokensUsed.toLocaleString()}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => onTopUpMinutes(90, 'Single Service Pass')}
              className="p-2.5 rounded-xl border border-slate-800 hover:border-sky-500/50 bg-slate-900 text-left transition cursor-pointer"
            >
              <div className="text-xs font-bold text-slate-100">+90 Minutes</div>
              <div className="text-[11px] text-sky-400 font-semibold">$1.99 Pre-Paid</div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                1 full church service
              </div>
            </button>

            <button
              type="button"
              onClick={() => onTopUpMinutes(360, 'Monthly Believer Pack')}
              className="p-2.5 rounded-xl border border-sky-500/40 hover:border-sky-400 bg-sky-500/10 text-left transition cursor-pointer"
            >
              <div className="text-xs font-bold text-slate-100">+360 Minutes</div>
              <div className="text-[11px] text-sky-300 font-semibold">$5.99 Pre-Paid</div>
              <div className="text-[10px] text-slate-300 mt-0.5">
                4 Sunday services
              </div>
            </button>

            <button
              type="button"
              onClick={() => onTopUpMinutes(1500, 'Visiting Congregation Pack')}
              className="p-2.5 rounded-xl border border-slate-800 hover:border-amber-500/50 bg-slate-900 text-left transition cursor-pointer"
            >
              <div className="text-xs font-bold text-slate-100">+1,500 Minutes</div>
              <div className="text-[11px] text-amber-300 font-semibold">$19.99 Pre-Paid</div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                Mission trip / conference
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
