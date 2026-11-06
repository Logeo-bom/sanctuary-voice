import React from 'react';
import {
  Sliders,
  ShieldAlert,
  Music,
  Gauge,
  Mic,
  Volume2,
  CheckCircle2,
} from 'lucide-react';
import type { AudioMeterSnapshot, AudioProcessingConfig } from '../types/translator';

interface AcousticControlPanelProps {
  config: AudioProcessingConfig;
  meter: AudioMeterSnapshot;
  isListening: boolean;
  inputDevices: MediaDeviceInfo[];
  onChangeConfig: (partial: Partial<AudioProcessingConfig>) => void;
}

export const AcousticControlPanel: React.FC<AcousticControlPanelProps> = ({
  config,
  meter,
  isListening,
  inputDevices,
  onChangeConfig,
}) => {
  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-4 shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-sky-400" />
          <h3 className="text-sm font-semibold text-slate-100">
            Back-Row & Sanctuary Acoustics DSP
          </h3>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span
            className={`px-2.5 py-0.5 rounded-full font-medium flex items-center gap-1.5 ${
              !isListening
                ? 'bg-slate-800 text-slate-400'
                : meter.isVoiceDetected
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                !isListening
                  ? 'bg-slate-500'
                  : meter.isVoiceDetected
                  ? 'bg-emerald-400 animate-pulse'
                  : 'bg-amber-400'
              }`}
            />
            {!isListening
              ? 'Mic Standby'
              : meter.isVoiceDetected
              ? 'Vocal Formants Locked'
              : 'Filtering Room / Synth'}
          </span>
          <span className="font-mono text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
            {isListening ? `${meter.rmsDb} dB` : '-- dB'}
          </span>
        </div>
      </div>

      {/* Live 16-Band Vocal Formant Spectrum & Level Bar */}
      <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3 space-y-2">
        <div className="flex items-end justify-between gap-1 h-10 px-1">
          {meter.frequencyBins.map((val, idx) => {
            const isVocalZone = idx >= 2 && idx <= 11;
            const heightPct = isListening ? Math.max(8, Math.round(val * 100)) : 8;
            return (
              <div
                key={idx}
                className="flex-1 flex flex-col items-center justify-end h-full"
              >
                <div
                  style={{ height: `${heightPct}%` }}
                  className={`w-full rounded-t transition-all duration-75 ${
                    !isListening
                      ? 'bg-slate-800'
                      : meter.isClipping
                      ? 'bg-rose-500'
                      : isVocalZone && meter.isVoiceDetected
                      ? 'bg-sky-400'
                      : 'bg-slate-600'
                  }`}
                />
              </div>
            );
          })}
        </div>
        <div className="flex justify-between text-[11px] text-slate-400">
          <span>Low Rumble Cut (&lt;{config.highPassHz}Hz)</span>
          <span className="text-sky-400 font-medium">
            Human Voice Band (300Hz – 3.4kHz)
          </span>
          <span>High Air</span>
        </div>
      </div>

      {/* Pre-Amp Gain Boost Slider for Weak Church Loudspeakers */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <label
            htmlFor="preamp-gain-slider"
            className="text-slate-300 font-medium flex items-center gap-1.5"
          >
            <Volume2 className="w-3.5 h-3.5 text-sky-400" />
            Weak Loudspeaker Pre-Amp Gain Boost
          </label>
          <span className="font-mono font-semibold text-sky-300 bg-sky-500/10 border border-sky-500/30 px-2 py-0.5 rounded">
            +{config.preAmpGainDb} dB ({Math.pow(10, config.preAmpGainDb / 20).toFixed(1)}x)
          </span>
        </div>
        <input
          id="preamp-gain-slider"
          type="range"
          min={0}
          max={24}
          step={1}
          value={config.preAmpGainDb}
          onChange={(e) =>
            onChangeConfig({ preAmpGainDb: Number(e.target.value) })
          }
          className="w-full accent-sky-400 cursor-pointer h-2 bg-slate-800 rounded-lg"
        />
        <div className="flex justify-between text-[11px] text-slate-400">
          <span>0 dB (Front Row)</span>
          <span>+12 dB (Middle Pew)</span>
          <span>+24 dB (Back Row / Weak PA)</span>
        </div>
      </div>

      {/* 3 Hardware & Acoustic Challenge Toggles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <button
          type="button"
          onClick={() =>
            onChangeConfig({ bypassOsProcessing: !config.bypassOsProcessing })
          }
          className={`p-3 rounded-xl border text-left transition flex flex-col justify-between gap-1.5 ${
            config.bypassOsProcessing
              ? 'bg-sky-500/15 border-sky-500/50 text-slate-100'
              : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between w-full">
            <ShieldAlert
              className={`w-4 h-4 ${
                config.bypassOsProcessing ? 'text-sky-400' : 'text-slate-500'
              }`}
            />
            {config.bypassOsProcessing && (
              <CheckCircle2 className="w-3.5 h-3.5 text-sky-400" />
            )}
          </div>
          <div>
            <div className="text-xs font-semibold">Bypass OS Noise Gate</div>
            <div className="text-[11px] text-slate-400 leading-tight mt-0.5">
              Stops Android from muting distant stage speakers
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() =>
            onChangeConfig({
              synthPadFilterEnabled: !config.synthPadFilterEnabled,
            })
          }
          className={`p-3 rounded-xl border text-left transition flex flex-col justify-between gap-1.5 ${
            config.synthPadFilterEnabled
              ? 'bg-amber-500/15 border-amber-500/50 text-slate-100'
              : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between w-full">
            <Music
              className={`w-4 h-4 ${
                config.synthPadFilterEnabled ? 'text-amber-400' : 'text-slate-500'
              }`}
            />
            {config.synthPadFilterEnabled && (
              <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />
            )}
          </div>
          <div>
            <div className="text-xs font-semibold">Synth Pad Ducking EQ</div>
            <div className="text-[11px] text-slate-400 leading-tight mt-0.5">
              Cuts 280Hz worship keys &amp; boosts 2.4kHz voice clarity
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() =>
            onChangeConfig({
              dynamicCompressorEnabled: !config.dynamicCompressorEnabled,
            })
          }
          className={`p-3 rounded-xl border text-left transition flex flex-col justify-between gap-1.5 ${
            config.dynamicCompressorEnabled
              ? 'bg-emerald-500/15 border-emerald-500/50 text-slate-100'
              : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between w-full">
            <Gauge
              className={`w-4 h-4 ${
                config.dynamicCompressorEnabled
                  ? 'text-emerald-400'
                  : 'text-slate-500'
              }`}
            />
            {config.dynamicCompressorEnabled && (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            )}
          </div>
          <div>
            <div className="text-xs font-semibold">Whisper-to-Shout Leveler</div>
            <div className="text-[11px] text-slate-400 leading-tight mt-0.5">
              6:1 dynamic compressor balances soft prayer &amp; loud preaching
            </div>
          </div>
        </button>
      </div>

      {/* Microphone Hardware Source Picker & Chunk Latency */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
        <div>
          <label
            htmlFor="mic-device-select"
            className="block text-[11px] text-slate-400 mb-1 flex items-center gap-1"
          >
            <Mic className="w-3 h-3 text-slate-400" />
            Stage Capture Microphone (Keep on Phone Mic when using Earphones)
          </label>
          <select
            id="mic-device-select"
            value={config.selectedDeviceId}
            onChange={(e) =>
              onChangeConfig({ selectedDeviceId: e.target.value })
            }
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
          >
            <option value="default">Default Handset Far-Field Mic</option>
            {inputDevices.map((d, i) => (
              <option key={d.deviceId || i} value={d.deviceId}>
                {d.label || `Microphone ${i + 1}`}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="chunk-duration-select"
            className="block text-[11px] text-slate-400 mb-1"
          >
            Translation Phrase Window (Speed vs Context)
          </label>
          <select
            id="chunk-duration-select"
            value={config.chunkDurationSec}
            onChange={(e) =>
              onChangeConfig({ chunkDurationSec: Number(e.target.value) })
            }
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
          >
            <option value={3}>3.0 sec (Ultra-Fast Simultaneous)</option>
            <option value={4}>4.0 sec (Balanced Sermon Flow - Recommended)</option>
            <option value={6}>6.0 sec (Full Sentence Dialect Context)</option>
          </select>
        </div>
      </div>
    </div>
  );
};
