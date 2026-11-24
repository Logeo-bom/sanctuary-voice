// Glossary auto-expansion from flagged corrections ("Phase 1 learning", see earlier research notes
// on Church-Cap/GoGospelNow/DilMesh). A listener or the operator can flag a transcript segment that
// mis-heard a theological term, pastor's name, or local ministry name, and suggest the correct
// spelling. Flagged corrections are stored locally as "pending" — they do NOT get added to the live
// `customChurchGlossary` keyword-boost list automatically. An admin/operator must review and approve
// each one first (see SettingsAndWalletModal), which protects against a single bad flag (typo, troll,
// genuine mishearing) silently degrading recognition for the whole congregation. Nothing here trains
// or fine-tunes any model — approved corrections simply become entries in the same static glossary
// array already passed to Deepgram's keyword-boosting.

export interface FlaggedCorrection {
  id: string;
  segmentId: string;
  speakerLabel: string;
  heardText: string;
  correctedTerm: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
}

const STORAGE_KEY = 'sanctuary_voice_flagged_corrections_v1';
const MAX_STORED_CORRECTIONS = 100;

export function loadFlaggedCorrections(): FlaggedCorrection[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // Corrupt/unavailable storage: start fresh rather than crashing the app.
  }
  return [];
}

export function saveFlaggedCorrections(corrections: FlaggedCorrection[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(corrections.slice(-MAX_STORED_CORRECTIONS)));
  } catch {
    // Best-effort persistence only; flagging should never interrupt the live service.
  }
}

export function createFlaggedCorrection(params: {
  segmentId: string;
  speakerLabel: string;
  heardText: string;
  correctedTerm: string;
}): FlaggedCorrection {
  return {
    id: `flag_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    segmentId: params.segmentId,
    speakerLabel: params.speakerLabel,
    heardText: params.heardText,
    correctedTerm: params.correctedTerm,
    status: 'pending',
    createdAt: Date.now(),
  };
}
