/**
 * "Mission packs" for the Offline Ready panel: a missionary picks where they are going instead of
 * having to know which on-device model files that language needs. Each pack names the local
 * language; the panel combines it with English in either direction (local preacher → English, or
 * English preacher → local language) and works out the speech + translation files to download.
 */
export interface MissionPack {
  id: string;
  /** Where the pack is used, shown to the missionary. */
  region: string;
  /** App language code of the local language (must exist in SUPPORTED_LANGUAGES). */
  localLangCode: string;
  localLangName: string;
}

export const MISSION_PACKS: MissionPack[] = [
  { id: 'ph-bisaya', region: 'Philippines (Visayas / Mindanao)', localLangCode: 'ceb', localLangName: 'Cebuano / Bisaya' },
  { id: 'ph-tagalog', region: 'Philippines (Luzon / Manila)', localLangCode: 'tl', localLangName: 'Tagalog' },
  { id: 'latam-spanish', region: 'Latin America / Spain', localLangCode: 'es', localLangName: 'Spanish' },
  { id: 'brazil-portuguese', region: 'Brazil / Portugal', localLangCode: 'pt', localLangName: 'Portuguese' },
  { id: 'east-africa-swahili', region: 'East Africa', localLangCode: 'sw', localLangName: 'Swahili' },
  { id: 'indonesia', region: 'Indonesia', localLangCode: 'id', localLangName: 'Indonesian' },
  { id: 'korea', region: 'Korea', localLangCode: 'ko', localLangName: 'Korean' },
  { id: 'francophone', region: 'France / West & Central Africa', localLangCode: 'fr', localLangName: 'French' },
  { id: 'india-hindi', region: 'India', localLangCode: 'hi', localLangName: 'Hindi' },
  { id: 'ukraine', region: 'Ukraine', localLangCode: 'uk', localLangName: 'Ukrainian' },
];

export type MissionPackDirection = 'local-to-english' | 'english-to-local';

export function getMissionPackLanguages(
  pack: MissionPack,
  direction: MissionPackDirection
): { sourceLangCode: string; targetLangCode: string } {
  return direction === 'local-to-english'
    ? { sourceLangCode: pack.localLangCode, targetLangCode: 'en' }
    : { sourceLangCode: 'en', targetLangCode: pack.localLangCode };
}

/** Finds the pack (and direction) matching the app's current languages, if any. */
export function findMissionPackForLanguages(
  sourceLangCode: string,
  targetLangCode: string
): { pack: MissionPack; direction: MissionPackDirection } | null {
  const src = (sourceLangCode || '').toLowerCase().split('-')[0];
  const tgt = (targetLangCode || '').toLowerCase().split('-')[0];
  const fromLocal = MISSION_PACKS.find((p) => p.localLangCode === src);
  if (fromLocal) return { pack: fromLocal, direction: 'local-to-english' };
  if (src === 'en') {
    const toLocal = MISSION_PACKS.find((p) => p.localLangCode === tgt);
    if (toLocal) return { pack: toLocal, direction: 'english-to-local' };
  }
  return null;
}
