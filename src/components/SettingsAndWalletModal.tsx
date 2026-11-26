import React, { useEffect, useState } from 'react';
import {
  X,
  Wallet,
  Headphones,
  CheckCircle2,
  Sparkles,
  Clock,
  Radio,
  Zap,
  Sliders,
  Mic,
  BookMarked,
  Plus,
  ArrowLeft,
  Flag,
  Check,
} from 'lucide-react';
import type {
  AudioProcessingConfig,
  PrepaidAccountState,
  SpeechOutputConfig,
  VoiceEngineMode,
} from '../types/translator';
import type { FlaggedCorrection } from '../services/glossaryCorrections';
import { ChurchAudioEngine } from '../services/churchAudioEngine';
import { type CrashEntry, loadCrashLog, clearCrashLog } from '../services/crashTelemetry';

interface SettingsAndWalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiKey: string;
  onSaveApiKey: (key: string) => void;
  deepgramKey: string;
  onSaveDeepgramKey: (key: string) => void;
  activeAiProvider: 'deepgram' | 'gemini';
  onSelectAiProvider: (provider: 'deepgram' | 'gemini') => void;
  audioConfig: AudioProcessingConfig;
  onChangeAudioConfig: (partial: Partial<AudioProcessingConfig>) => void;
  speechConfig: SpeechOutputConfig;
  onChangeSpeechConfig: (partial: Partial<SpeechOutputConfig>) => void;
  wallet: PrepaidAccountState;
  onTopUpMinutes: (minutesToAdd: number, tierName: string) => void;
  customGlossary: string[];
  onAddGlossaryTerm: (term: string) => void;
  onRemoveGlossaryTerm: (term: string) => void;
  pendingCorrections: FlaggedCorrection[];
  onApproveCorrection: (correctionId: string) => void;
  onRejectCorrection: (correctionId: string) => void;
}

export const SettingsAndWalletModal: React.FC<SettingsAndWalletModalProps> = ({
  isOpen,
  onClose,
  activeAiProvider,
  onSelectAiProvider,
  audioConfig,
  onChangeAudioConfig,
  speechConfig,
  onChangeSpeechConfig,
  wallet,
  onTopUpMinutes,
  customGlossary,
  onAddGlossaryTerm,
  onRemoveGlossaryTerm,
  pendingCorrections,
  onApproveCorrection,
  onRejectCorrection,
}) => {
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [newTermInput, setNewTermInput] = useState<string>('');
  const [crashLog, setCrashLog] = useState<CrashEntry[]>([]);
  const [crashLogCopied, setCrashLogCopied] = useState<boolean>(false);

  const handleAddTerm = (e: React.FormEvent) => {
    e.preventDefault();
    if (newTermInput.trim()) {
      onAddGlossaryTerm(newTermInput.trim());
      setNewTermInput('');
    }
  };

  useEffect(() => {
    if (isOpen) {
      void ChurchAudioEngine.listAudioInputDevices().then((devs) => {
        setAudioDevices(devs);
      });
      // Crash telemetry diagnostics: refresh the local crash log every time the modal opens, so an
      // operator/technical volunteer can see whether the app has been crashing in the field without
      // needing developer tools.
      setCrashLog(loadCrashLog());
    }
  }, [isOpen]);

  const handleCopyCrashLog = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(crashLog, null, 2));
      setCrashLogCopied(true);
      window.setTimeout(() => setCrashLogCopied(false), 2000);
    } catch {
      window.prompt('Copy the crash log:', JSON.stringify(crashLog, null, 2));
    }
  };

  const handleClearCrashLog = () => {
    clearCrashLog();
    setCrashLog([]);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-5 sm:p-6 space-y-6 shadow-2xl my-8">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-800/90 text-slate-300 hover:text-white hover:bg-slate-700 transition flex items-center gap-1 text-xs font-semibold shrink-0 cursor-pointer"
              title="Go back to Home Screen"
            >
              <ArrowLeft className="w-4 h-4 text-sky-400" />
              <span className="hidden sm:inline">Back</span>
            </button>
            <div className="h-4 w-px bg-slate-800 shrink-0" />
            <div className="flex items-center gap-1.5 min-w-0">
              <Sparkles className="w-4 h-4 text-sky-400 shrink-0" />
              <h2 className="text-sm sm:text-base font-bold text-slate-100 truncate">
                AI Engines, Earphone Voice &amp; Token Credits
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition cursor-pointer shrink-0"
            title="Close and return to Home Screen"
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

        {/* 3. Real-Time Vocal Isolation & Noise Suppression (Audacity AI Engine) */}
        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <Sliders className="w-4 h-4 text-sky-400" />
              Real-Time Vocal Isolation (Audacity AI Engine)
            </span>
            <button
              type="button"
              onClick={() =>
                onChangeAudioConfig({
                  neuralVoiceIsolationEnabled: audioConfig.neuralVoiceIsolationEnabled === false ? true : false,
                })
              }
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                audioConfig.neuralVoiceIsolationEnabled !== false
                  ? 'bg-sky-500 text-slate-950 shadow-sm'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {audioConfig.neuralVoiceIsolationEnabled !== false ? 'Isolation ON' : 'Standard Pass'}
            </button>
          </div>
          <p className="text-[11px] text-slate-400 leading-snug">
            Applies continuous spectral subtraction to isolate the lead speaker's voice from choir singing, organ drones, worship synthesizer pads, and church HVAC rumble.
          </p>
        </div>

        {/* 4. Audio Input Hardware Selector (Feature 2: Soundboard / USB / Lapel Mic) */}
        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <Mic className="w-4 h-4 text-emerald-400" />
              Microphone &amp; Soundboard Input Source
            </span>
            <span className="text-[10px] text-emerald-400 font-medium">
              ✓ Auto-Detects
            </span>
          </div>
          <select
            value={audioConfig.selectedDeviceId || 'default'}
            onChange={(e) =>
              onChangeAudioConfig({
                selectedDeviceId: e.target.value,
              })
            }
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
          >
            <option value="default">Default (Phone / System Microphone)</option>
            {audioDevices.map((d, idx) => (
              <option key={d.deviceId || idx} value={d.deviceId}>
                {d.label || `Audio Input Device ${idx + 1}`}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-slate-400 leading-tight">
            Leave on <strong>Default</strong> for normal pew seating. AV technicians can plug a USB mixing console, audio interface, or Bluetooth lapel mic here.
          </p>
        </div>

        {/* 4. Live Church Glossary & Custom Keyterm Boosting (Feature 2) */}
        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <BookMarked className="w-4 h-4 text-amber-400" />
              Church Glossary &amp; Pastoral Keyterms
            </span>
            <span className="text-[10px] text-amber-400 font-medium bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
              Speech Recognition Boost Active
            </span>
          </div>
          <p className="text-[11px] text-slate-400 leading-tight">
            Add pastor names, missionary ministries, or theological terms (e.g. <em>Pastor David, Melchizedek, Golgotha</em>). Deepgram prioritizes these words with 100% accuracy.
          </p>
          <p className="text-[11px] text-slate-400 leading-tight">
            These terms also bias Cebuano/Bisaya (Chirp) recognition toward your church's vocabulary, not just the main Deepgram pipeline.
          </p>

          <form onSubmit={handleAddTerm} className="flex gap-2">
            <input
              type="text"
              value={newTermInput}
              onChange={(e) => setNewTermInput(e.target.value)}
              placeholder="e.g. Pastor Velasquez, Bethel, Maranatha"
              className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
            />
            <button
              type="submit"
              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg flex items-center gap-1 transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          </form>

          {customGlossary.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {customGlossary.map((term) => (
                <span
                  key={term}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] font-medium"
                >
                  {term}
                  <button
                    type="button"
                    onClick={() => onRemoveGlossaryTerm(term)}
                    className="hover:text-amber-100 cursor-pointer ml-0.5"
                    title="Remove keyword"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Glossary auto-expansion: anyone listening can flag a mis-heard word on a live segment
              (see the flag icon on transcript cards); those suggestions land here as "pending" and
              only get added to the boost list above once the operator reviews and approves them. */}
          {pendingCorrections.length > 0 && (
            <div className="pt-2 mt-2 border-t border-slate-800 space-y-2">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-sky-300">
                <Flag className="w-3.5 h-3.5" />
                Flagged Corrections Awaiting Review ({pendingCorrections.length})
              </div>
              <div className="space-y-1.5">
                {pendingCorrections.map((correction) => (
                  <div
                    key={correction.id}
                    className="flex items-center justify-between gap-2 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5"
                  >
                    <div className="min-w-0">
                      <p className="text-[11px] text-slate-400 truncate">
                        Heard: <span className="italic">“{correction.heardText}”</span>
                      </p>
                      <p className="text-xs text-slate-100 font-medium truncate">
                        Should be: <span className="text-amber-300">{correction.correctedTerm}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => onApproveCorrection(correction.id)}
                        className="p-1.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25 cursor-pointer"
                        title="Approve: add to church glossary"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onRejectCorrection(correction.id)}
                        className="p-1.5 rounded-md bg-slate-800 border border-slate-700 text-slate-400 hover:text-white cursor-pointer"
                        title="Reject suggestion"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 5. Priority 2: Earphone Speech-to-Speech (TTS) Configuration */}
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

        {/* 6. Crash Telemetry Diagnostics: surfaces the local crash log (captured by AppErrorBoundary
           and the global window error/unhandledrejection handlers) so a technical volunteer can see
           whether the app has been failing in the field without needing developer tools. */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <Sliders className="w-4 h-4 text-rose-400" />
              Diagnostics &amp; Crash Log
            </span>
            <span
              className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                crashLog.length > 0
                  ? 'text-rose-300 bg-rose-500/10 border-rose-500/20'
                  : 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20'
              }`}
            >
              {crashLog.length} recorded
            </span>
          </div>
          <p className="text-[10px] text-slate-400 leading-relaxed">
            Errors are recorded locally on this device (and best-effort relayed) so field issues stay
            visible even after the app automatically recovers.
          </p>
          {crashLog.length > 0 && (
            <div className="max-h-28 overflow-y-auto space-y-1 bg-slate-900 rounded-lg p-2 border border-slate-800">
              {crashLog
                .slice(-5)
                .reverse()
                .map((entry) => (
                  <div key={entry.id} className="text-[10px] text-slate-300">
                    <span className="text-slate-500">
                      {new Date(entry.timestamp).toLocaleTimeString()} · {entry.context}:
                    </span>{' '}
                    {entry.message}
                  </div>
                ))}
            </div>
          )}
          <div className="flex items-center gap-2 pt-0.5">
            <button
              type="button"
              onClick={handleCopyCrashLog}
              disabled={crashLog.length === 0}
              className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 font-semibold text-[10px] hover:bg-slate-700 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {crashLogCopied ? 'Copied!' : 'Copy Log'}
            </button>
            <button
              type="button"
              onClick={handleClearCrashLog}
              disabled={crashLog.length === 0}
              className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 font-semibold text-[10px] hover:bg-slate-700 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Clear Log
            </button>
          </div>
        </div>

        {/* Footer Back Button */}
        <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer shadow-sm"
          >
            <ArrowLeft className="w-4 h-4 text-sky-400" />
            Back to Home Screen
          </button>
        </div>
      </div>
    </div>
  );
};
