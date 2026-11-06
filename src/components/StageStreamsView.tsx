import React from 'react';
import {
  Columns,
  Lock,
  ListFilter,
  Volume2,
  VolumeX,
  Check,
  Sparkles,
  Headphones,
  Globe,
} from 'lucide-react';
import type {
  StageSeparationMode,
  StageSpeaker,
  TranslationSegment,
} from '../types/translator';

interface StageStreamsViewProps {
  separationMode: StageSeparationMode;
  onChangeSeparationMode: (mode: StageSeparationMode) => void;
  speakers: StageSpeaker[];
  segments: TranslationSegment[];
  preferredSourceLang: string;
  onSelectPreferredSourceLang: (langCode: string) => void;
  onToggleIgnoreSpeaker: (speakerId: string) => void;
  onFocusSingleSpeaker: (speakerId: string) => void;
  onReplaySegmentAudio: (segment: TranslationSegment) => void;
  showOriginalTranscript: boolean;
  onToggleOriginalTranscript: () => void;
  fontSizeScale: 'normal' | 'large' | 'xl';
  onChangeFontSizeScale: (scale: 'normal' | 'large' | 'xl') => void;
}

export const StageStreamsView: React.FC<StageStreamsViewProps> = ({
  separationMode,
  onChangeSeparationMode,
  speakers,
  segments,
  preferredSourceLang,
  onSelectPreferredSourceLang,
  onToggleIgnoreSpeaker,
  onFocusSingleSpeaker,
  onReplaySegmentAudio,
  showOriginalTranscript,
  onToggleOriginalTranscript,
  fontSizeScale,
  onChangeFontSizeScale,
}) => {
  const textSizeClass =
    fontSizeScale === 'xl'
      ? 'text-2xl leading-relaxed'
      : fontSizeScale === 'large'
        ? 'text-xl leading-relaxed'
        : 'text-base leading-relaxed';

  const visibleSegments = segments.filter((seg) => {
    const spk = speakers.find((s) => s.id === seg.speakerId);
    if (spk?.isIgnored) return false;
    if (
      preferredSourceLang !== 'auto' &&
      seg.sourceLanguageCode.toLowerCase() !== preferredSourceLang.toLowerCase()
    ) {
      return false;
    }
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Multi-Voice & Language Separation Control Bar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3.5 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <Columns className="w-4 h-4 text-sky-400" />
              Stage Multi-Language &amp; Voice Separation
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Keeps Speaker A and On-Stage Translator B apart — view in separate windows or lock onto one voice
            </p>
          </div>

          {/* 3 Layout Modes */}
          <div className="inline-flex rounded-xl bg-slate-950 p-1 border border-slate-800">
            <button
              type="button"
              onClick={() => onChangeSeparationMode('split-windows')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition ${separationMode === 'split-windows'
                ? 'bg-sky-500 text-slate-950 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
                }`}
            >
              <Columns className="w-3.5 h-3.5" />
              Separate Windows
            </button>
            <button
              type="button"
              onClick={() => onChangeSeparationMode('lock-primary')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition ${separationMode === 'lock-primary'
                ? 'bg-sky-500 text-slate-950 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
                }`}
            >
              <Lock className="w-3.5 h-3.5" />
              Focus Preferred Voice
            </button>
            <button
              type="button"
              onClick={() => onChangeSeparationMode('unified-stream')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition ${separationMode === 'unified-stream'
                ? 'bg-sky-500 text-slate-950 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
                }`}
            >
              <ListFilter className="w-3.5 h-3.5" />
              Unified Feed
            </button>
          </div>
        </div>

        {/* Detected Voices on Stage Pills */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Detected Stage Voices &amp; Dialects ({speakers.length})</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onToggleOriginalTranscript}
                className="text-xs text-sky-400 hover:text-sky-300 underline cursor-pointer"
              >
                {showOriginalTranscript ? 'Hide Original Speech' : 'Show Original Speech'}
              </button>
              <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg px-1.5 py-0.5 gap-1">
                {(['normal', 'large', 'xl'] as const).map((sz) => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => onChangeFontSizeScale(sz)}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${fontSizeScale === sz
                      ? 'bg-slate-800 text-sky-400'
                      : 'text-slate-400 hover:text-slate-200'
                      }`}
                  >
                    {sz}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {speakers.length === 0 ? (
            <div className="text-xs text-slate-400 bg-slate-950/70 border border-slate-800/80 rounded-xl p-3 flex items-center justify-between">
              <span>
                Waiting for stage voices... As soon as a speaker or stage translator talks, their voice and dialect will be isolated here.
              </span>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {speakers.map((spk) => (
                <div
                  key={spk.id}
                  className={`flex items-center justify-between p-3 rounded-xl border transition ${spk.isIgnored
                    ? 'bg-slate-950/50 border-slate-800/60 opacity-60'
                    : 'bg-slate-950 border-slate-800'
                    }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: spk.accentColor }}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold text-slate-100 truncate">
                          {spk.label}
                        </span>
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-sky-300 font-medium">
                          {spk.detectedLanguageName} ({spk.detectedLanguageCode.toUpperCase()})
                        </span>
                        {spk.detectedDialect && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                            Dialect: {spk.detectedDialect}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {spk.isIgnored
                          ? 'Ignored — Muted in earphones & hidden'
                          : `Active • ${spk.segmentCount} translated phrases`}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    <button
                      type="button"
                      onClick={() => onFocusSingleSpeaker(spk.id)}
                      title="Only translate this speaker and ignore all others on stage"
                      className="px-2.5 py-1.5 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/40 text-sky-300 text-[11px] font-semibold flex items-center gap-1 transition"
                    >
                      <Check className="w-3 h-3" />
                      Only This Voice
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggleIgnoreSpeaker(spk.id)}
                      className={`p-1.5 rounded-lg border transition ${spk.isIgnored
                        ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                        : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-600'
                        }`}
                      title={spk.isIgnored ? 'Unmute this stage voice' : 'Ignore/Mute this stage voice'}
                    >
                      {spk.isIgnored ? (
                        <VolumeX className="w-3.5 h-3.5" />
                      ) : (
                        <Volume2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* LIVE TRANSLATION WINDOWS */}
      {separationMode === 'split-windows' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(speakers.length > 0
            ? speakers
            : [
              {
                id: 'speaker_1',
                label: 'Window 1 • Primary Stage Speaker (Lang A)',
                roleHint: 'main-speaker' as const,
                detectedLanguageCode: 'en',
                detectedLanguageName: 'Auto-Detecting',
                detectedDialect: 'Regional Dialect Engine Ready',
                accentColor: '#38bdf8',
                segmentCount: 0,
                lastActiveAt: 0,
                isIgnored: false,
              },
              {
                id: 'speaker_2',
                label: 'Window 2 • Stage Interpreter / Second Voice (Lang B)',
                roleHint: 'stage-interpreter' as const,
                detectedLanguageCode: 'fr',
                detectedLanguageName: 'Auto-Detecting',
                detectedDialect: 'Multi-Voice Separation Ready',
                accentColor: '#fbbf24',
                segmentCount: 0,
                lastActiveAt: 0,
                isIgnored: false,
              },
            ]
          ).map((spk) => {
            const speakerSegments = segments.filter((s) => s.speakerId === spk.id);
            return (
              <div
                key={spk.id}
                className={`bg-slate-900 border rounded-2xl flex flex-col overflow-hidden shadow-xl transition ${spk.isIgnored
                  ? 'border-slate-800/60 opacity-50'
                  : 'border-slate-800'
                  }`}
              >
                {/* Window Header */}
                <div
                  className="px-4 py-3 border-b border-slate-800 flex items-center justify-between"
                  style={{
                    background: `linear-gradient(90deg, ${spk.accentColor}18 0%, rgba(15,23,42,0.95) 100%)`,
                  }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: spk.accentColor }}
                    />
                    <div className="truncate">
                      <div className="text-xs font-bold text-slate-100 truncate">
                        {spk.label}
                      </div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                        <Globe className="w-3 h-3 text-sky-400" />
                        <span>{spk.detectedLanguageName}</span>
                        {spk.detectedDialect && (
                          <span className="text-amber-300">• {spk.detectedDialect}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onToggleIgnoreSpeaker(spk.id)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition ${spk.isIgnored
                      ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                      : 'bg-slate-950/90 border-slate-700 text-slate-300 hover:text-white'
                      }`}
                  >
                    {spk.isIgnored ? 'Ignored (Tap to Enable)' : 'Active Window'}
                  </button>
                </div>

                {/* Window Phrases */}
                <div className="p-4 space-y-3 min-h-[260px] max-h-[460px] overflow-y-auto">
                  {speakerSegments.length === 0 ? (
                    <div className="h-48 flex flex-col items-center justify-center text-center text-slate-500 text-xs px-4">
                      <Sparkles className="w-6 h-6 text-slate-600 mb-2" />
                      <p>
                        Translated sentences for <strong>{spk.label}</strong> will stream in this isolated window.
                      </p>
                    </div>
                  ) : (
                    speakerSegments.map((seg, idx) => {
                      const isLatest = idx === speakerSegments.length - 1;
                      return (
                        <div
                          key={seg.id}
                          className={`p-3.5 rounded-xl border transition ${isLatest
                            ? 'bg-slate-950 border-sky-500/40 shadow-md'
                            : 'bg-slate-950/60 border-slate-800/80'
                            }`}
                        >
                          {showOriginalTranscript && (
                            <div className="text-xs text-slate-400 italic mb-1.5 pb-1.5 border-b border-slate-800/80 flex items-start justify-between gap-2">
                              <span>“{seg.originalText}”</span>
                              {seg.detectedDialect && (
                                <span className="text-[10px] not-italic px-1.5 py-0.5 rounded bg-slate-900 text-amber-300 shrink-0">
                                  {seg.detectedDialect}
                                </span>
                              )}
                            </div>
                          )}
                          <p className={`${textSizeClass} font-semibold text-slate-100`}>
                            {seg.translatedText}
                          </p>
                          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                            <span>
                              {new Date(seg.timestamp).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                              })}
                              {seg.backgroundNoiseNote
                                ? ` • ${seg.backgroundNoiseNote}`
                                : ''}
                            </span>
                            <button
                              type="button"
                              onClick={() => onReplaySegmentAudio(seg)}
                              className="inline-flex items-center gap-1 text-sky-400 hover:text-sky-300 font-medium"
                            >
                              <Headphones className="w-3 h-3" />
                              Speak in Earphones
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Single Locked Voice or Unified Feed Window */
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4 min-h-[320px] max-h-[540px] overflow-y-auto shadow-xl">
          {separationMode === 'lock-primary' && (
            <div className="bg-sky-500/10 border border-sky-500/30 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 text-xs text-sky-200">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-sky-400 shrink-0" />
                <span>
                  <strong>Focused Single-Language Mode:</strong> Ignoring redundant on-stage translations so you only read and hear the primary message.
                </span>
              </div>
              <select
                value={preferredSourceLang}
                onChange={(e) => onSelectPreferredSourceLang(e.target.value)}
                className="bg-slate-950 border border-sky-500/40 rounded-lg px-2.5 py-1 text-xs text-slate-100"
              >
                <option value="auto">Follow Unmuted Stage Voice(s)</option>
                <option value="en">Only Translate English Speaker</option>
                <option value="fr">Only Translate French Speaker</option>
                <option value="es">Only Translate Spanish Speaker</option>
                <option value="no">Only Translate Norwegian Speaker</option>
                <option value="de">Only Translate German Speaker</option>
              </select>
            </div>
          )}

          {visibleSegments.length === 0 ? (
            <div className="h-56 flex flex-col items-center justify-center text-center text-slate-400 space-y-2">
              <Headphones className="w-8 h-8 text-sky-400/70" />
              <div className="text-sm font-medium text-slate-200">
                Ready for Live Sanctuary Speech
              </div>
              <p className="text-xs text-slate-400 max-w-md">
                Tap <strong>Start Live Translation</strong> above to capture the church stage with your microphone, or tap <strong>Run Multi-Language Stage Demo</strong> to test dual-language preacher + interpreter separation immediately.
              </p>
            </div>
          ) : (
            visibleSegments.map((seg, idx) => {
              const spk = speakers.find((s) => s.id === seg.speakerId);
              const isLatest = idx === visibleSegments.length - 1;
              return (
                <div
                  key={seg.id}
                  className={`p-4 rounded-2xl border transition ${isLatest
                    ? 'bg-slate-950 border-sky-500/50 shadow-lg'
                    : 'bg-slate-950/70 border-slate-800'
                    }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: spk?.accentColor || '#38bdf8' }}
                      />
                      <span className="text-xs font-bold text-slate-200">
                        {seg.speakerLabel}
                      </span>
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-sky-300">
                        from {seg.sourceLanguageName}
                      </span>
                      {seg.detectedDialect && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                          {seg.detectedDialect}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => onReplaySegmentAudio(seg)}
                      className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1 font-medium"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                      Replay in Earphones
                    </button>
                  </div>

                  {showOriginalTranscript && (
                    <p className="text-xs text-slate-400 italic mb-2">
                      “{seg.originalText}”
                    </p>
                  )}

                  <p className={`${textSizeClass} font-semibold text-white`}>
                    {seg.translatedText}
                  </p>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
