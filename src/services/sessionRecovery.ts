// Automatic session recovery: if the browser tab crashes, reloads, or is force-closed mid-service
// (common on older sanctuary tablets/kiosks running for 1-2 hours), persist just enough state to
// `localStorage` so the operator can resume the live session in one tap instead of reconfiguring
// languages/glossary/view mode from scratch. This is intentionally lightweight - it does not try to
// restore the in-flight transcript/segments (those are ephemeral and re-generated live), only the
// *configuration* needed to immediately restart listening the way it was left.

export interface SessionSnapshot {
  wasListening: boolean;
  speaker1SourceLang: string;
  targetLangCode: string;
  voiceViewMode: string;
  displayStyle: 'continuous' | 'cards' | 'live';
  savedAt: number;
}

const STORAGE_KEY_SESSION_SNAPSHOT = 'sanctuary_voice_session_snapshot_v1';
// A stale snapshot (e.g. from last week) shouldn't prompt a "resume?" banner - only offer recovery
// for a session that was plausibly interrupted a short time ago (same service, same sitting).
const SNAPSHOT_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

export function saveSessionSnapshot(snapshot: Omit<SessionSnapshot, 'savedAt'>): void {
  try {
    const full: SessionSnapshot = { ...snapshot, savedAt: Date.now() };
    localStorage.setItem(STORAGE_KEY_SESSION_SNAPSHOT, JSON.stringify(full));
  } catch {
    // Non-fatal: recovery is a convenience, not a hard requirement.
  }
}

/**
 * Returns the last saved session snapshot if it exists, was marked as actively listening, and is
 * recent enough to plausibly be the same interrupted service - otherwise `null`.
 */
export function loadRecoverableSessionSnapshot(): SessionSnapshot | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SESSION_SNAPSHOT);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionSnapshot;
    if (!parsed || !parsed.wasListening) return null;
    if (Date.now() - parsed.savedAt > SNAPSHOT_MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearSessionSnapshot(): void {
  try {
    localStorage.removeItem(STORAGE_KEY_SESSION_SNAPSHOT);
  } catch {
    // Ignore.
  }
}
