import React, { useEffect, useState } from 'react';
import { KeyRound, X } from 'lucide-react';
import {
  CHIRP_ACCESS_CODE_REQUIRED_EVENT,
  clearChirpAccessCode,
  hasChirpAccessCode,
  isChirpAccessCodeSaved,
  setChirpAccessCode,
} from '../services/googleChirpTranslator';

const CodeForm: React.FC<{ onSaved: () => void; autoFocus?: boolean }> = ({ onSaved, autoFocus }) => {
  const [code, setCode] = useState('');
  const [remember, setRemember] = useState(false);

  return (
    <form
      className="space-y-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!code.trim()) return;
        setChirpAccessCode(code, remember);
        setCode('');
        onSaved();
      }}
    >
      <div className="flex gap-1.5">
        <input
          type="password"
          autoComplete="off"
          autoFocus={autoFocus}
          aria-label="Chirp operator access code"
          placeholder="Operator access code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="flex-1 min-w-0 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-[11px] text-slate-200"
        />
        <button
          type="submit"
          disabled={!code.trim()}
          className="px-2.5 py-1.5 rounded-lg bg-sky-500/20 border border-sky-500/50 text-sky-200 font-semibold text-[11px] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Save
        </button>
      </div>
      <label className="flex items-center gap-1.5 text-[10px] text-slate-400">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        Remember on this device (anyone using this phone can then use Chirp)
      </label>
    </form>
  );
};

/**
 * Non-blocking card shown when Chirp (online Cebuano/Bisaya) needs the operator access code.
 * Replaces the old window.prompt(), which froze the page and the live captions until answered.
 */
export const ChirpAccessCodePrompt: React.FC = () => {
  const [state, setState] = useState<{ visible: boolean; invalid: boolean }>({ visible: false, invalid: false });

  useEffect(() => {
    const show = (event: Event) => {
      const invalid = !!(event as CustomEvent<{ invalid?: boolean }>).detail?.invalid;
      setState({ visible: true, invalid });
    };
    window.addEventListener(CHIRP_ACCESS_CODE_REQUIRED_EVENT, show);
    return () => window.removeEventListener(CHIRP_ACCESS_CODE_REQUIRED_EVENT, show);
  }, []);

  if (!state.visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Chirp access code"
      className="fixed left-1/2 -translate-x-1/2 z-[90] w-[calc(100%-2rem)] max-w-sm bg-slate-900 border border-amber-500/40 rounded-xl shadow-lg p-3 space-y-2"
      style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }}
    >
      <div className="flex items-start gap-2">
        <KeyRound className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
        <p className="text-[11px] text-slate-200 flex-1 leading-snug">
          {state.invalid
            ? 'That Chirp access code was not accepted. Enter the correct operator code.'
            : 'Online Cebuano/Bisaya captions need the operator access code.'}
        </p>
        <button
          type="button"
          aria-label="Close access code prompt"
          onClick={() => setState((s) => ({ ...s, visible: false }))}
          className="p-0.5 text-slate-400 hover:text-slate-200 cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <CodeForm autoFocus onSaved={() => setState({ visible: false, invalid: false })} />
    </div>
  );
};

/** Settings row: shows whether a code is set or saved, and lets the operator change or forget it. */
export const ChirpAccessCodeSettings: React.FC = () => {
  const [, refresh] = useState(0);
  const saved = isChirpAccessCodeSaved();
  const active = hasChirpAccessCode();

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
          <KeyRound className="w-4 h-4 text-amber-300" />
          Chirp access code (Cebuano/Bisaya online)
        </span>
        <span className={`text-[10px] font-semibold ${active ? 'text-emerald-400' : 'text-slate-500'}`}>
          {saved ? 'Saved on this device' : active ? 'Set for this session' : 'Not set'}
        </span>
      </div>
      <p className="text-[10px] text-slate-400 leading-relaxed">
        Not needed offline. Without the code, online Bisaya captions pause until it is entered.
      </p>
      <CodeForm onSaved={() => refresh((n) => n + 1)} />
      {active && (
        <button
          type="button"
          onClick={() => {
            clearChirpAccessCode();
            refresh((n) => n + 1);
          }}
          className="px-2 py-1 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 font-semibold text-[10px] cursor-pointer"
        >
          Forget code
        </button>
      )}
    </div>
  );
};
