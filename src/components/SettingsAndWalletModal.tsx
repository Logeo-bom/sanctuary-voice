import React, { useState } from 'react';
import {
  X,
  KeyRound,
  Wallet,
  Headphones,
  CheckCircle2,
  Sparkles,
  Clock,
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
  speechConfig: SpeechOutputConfig;
  onChangeSpeechConfig: (partial: Partial<SpeechOutputConfig>) => void;
  wallet: PrepaidAccountState;
  onTopUpMinutes: (minutesToAdd: number, tierName: string) => void;
}

export const SettingsAndWalletModal: React.FC<SettingsAndWalletModalProps> = ({
  isOpen,
  onClose,
  apiKey,
  onSaveApiKey,
  speechConfig,
  onChangeSpeechConfig,
  wallet,
  onTopUpMinutes,
}) => {
  const [draftKey, setDraftKey] = useState(apiKey);
  const [savedNotice, setSavedNotice] = useState(false);

  if (!isOpen) return null;

  const handleSaveKey = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveApiKey(draftKey.trim());
    setSavedNotice(true);
    window.setTimeout(() => setSavedNotice(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-5 sm:p-6 space-y-6 shadow-2xl my-8">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-sky-400" />
            <h2 className="text-base font-bold text-slate-100">
              AI Engine, Earphone Voice &amp; Pre-Paid Sanctuary Pass
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 1. Gemini API Key Configuration */}
        <form onSubmit={handleSaveKey} className="space-y-2.5">
          <div className="flex items-center justify-between">
            <label
              htmlFor="gemini-api-key-input"
              className="text-xs font-semibold text-slate-200 flex items-center gap-1.5"
            >
              <KeyRound className="w-4 h-4 text-sky-400" />
              Gemini 2.5 Flash API Key (Multimodal Stage Audio + Dialect Engine)
            </label>
            {apiKey ? (
              <span className="text-[11px] text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Key Active
              </span>
            ) : (
              <span className="text-[11px] text-amber-300">
                Optional for Demo • Required for Live Mic AI
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <input
              id="gemini-api-key-input"
              type="password"
              value={draftKey}
              onChange={(e) => setDraftKey(e.target.value)}
              placeholder="AIzaSy..."
              className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs transition"
            >
              {savedNotice ? 'Saved!' : 'Save Key'}
            </button>
          </div>
          <p className="text-[11px] text-slate-400">
            Processes DSP-boosted audio directly with Gemini 2.5 Flash to separate multiple speakers on stage, identify regional dialects, and ignore worship synth pads.
          </p>
        </form>

        {/* 2. Priority 2: Earphone Speech-to-Speech (TTS) Configuration */}
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
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
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
              <label className="block text-[11px] text-slate-300 mb-1">
                Voice Quality Engine
              </label>
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
                  Cloud Neural Voice (Natural, Fast — Default)
                </option>
                <option value="gemini-studio">
                  Gemini 2.5 Studio Voice (Requires Gemini Key)
                </option>
                <option value="device">Device Offline Voice</option>
              </select>
            </div>

            {speechConfig.voiceEngine === 'gemini-studio' && (
              <div>
                <label className="block text-[11px] text-slate-300 mb-1">
                  Gemini Studio Interpreter Voice
                </label>
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div>
              <div className="flex justify-between text-[11px] text-slate-300 mb-1">
                <span>Interpreter Speaking Speed</span>
                <span className="font-mono text-sky-400">
                  {speechConfig.speechRate.toFixed(2)}x
                </span>
              </div>
              <input
                type="range"
                min={0.85}
                max={1.35}
                step={0.05}
                value={speechConfig.speechRate}
                onChange={(e) =>
                  onChangeSpeechConfig({ speechRate: Number(e.target.value) })
                }
                className="w-full accent-emerald-400 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-[11px] text-slate-300 mb-1">
                <span>Earphone Volume</span>
                <span className="font-mono text-sky-400">
                  {Math.round(speechConfig.volume * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0.2}
                max={1.0}
                step={0.05}
                value={speechConfig.volume}
                onChange={(e) =>
                  onChangeSpeechConfig({ volume: Number(e.target.value) })
                }
                className="w-full accent-emerald-400 cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* 3. Pre-Paid Token Financing Pass (Bard's Business Model) */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-semibold text-slate-100">
                Pre-Paid Translation Minutes (Finances AI Tokens)
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
              className="p-2.5 rounded-xl border border-slate-800 hover:border-sky-500/50 bg-slate-900 text-left transition"
            >
              <div className="text-xs font-bold text-slate-100">+90 Minutes</div>
              <div className="text-[11px] text-sky-400 font-semibold">$1.99 Pre-Paid</div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                Covers 1 full church service
              </div>
            </button>

            <button
              type="button"
              onClick={() => onTopUpMinutes(360, 'Monthly Believer Pack')}
              className="p-2.5 rounded-xl border border-sky-500/40 hover:border-sky-400 bg-sky-500/10 text-left transition"
            >
              <div className="text-xs font-bold text-slate-100">+360 Minutes</div>
              <div className="text-[11px] text-sky-300 font-semibold">$5.99 Pre-Paid</div>
              <div className="text-[10px] text-slate-300 mt-0.5">
                4 Sunday sermons + fellowship
              </div>
            </button>

            <button
              type="button"
              onClick={() => onTopUpMinutes(1500, 'Visiting Congregation Pack')}
              className="p-2.5 rounded-xl border border-slate-800 hover:border-amber-500/50 bg-slate-900 text-left transition"
            >
              <div className="text-xs font-bold text-slate-100">+1,500 Minutes</div>
              <div className="text-[11px] text-amber-300 font-semibold">$19.99 Pre-Paid</div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                Conference / Mission trip pack
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
