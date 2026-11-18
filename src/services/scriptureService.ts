export interface ScriptureReference {
  rawMatch: string;
  book: string;
  chapter: number;
  verseStart: number;
  verseEnd?: number;
}

export interface ScriptureData {
  reference: string;
  translation: string;
  text: string;
}

const BIBLE_BOOKS: Record<string, string[]> = {
  Genesis: ['genesis', 'gen', '창세기', 'gênesis', 'genes'],
  Exodus: ['exodus', 'exo', '출애굽기', 'êxodo'],
  Psalms: ['psalms', 'psalm', 'psa', '시편', 'salmos', 'salmo'],
  Proverbs: ['proverbs', 'proverb', 'pro', '잠언', 'provérbios'],
  Matthew: ['matthew', 'matt', 'mat', '마태복음', 'mateus'],
  John: ['john', 'jhn', '요한복음', 'joão', 'juan'],
  Romans: ['romans', 'rom', '로마서', 'romanos'],
  '1 Corinthians': ['1 corinthians', '1 cor', '고린도전서', '1 coríntios'],
  '2 Corinthians': ['2 corinthians', '2 cor', '고린도후서', '2 coríntios'],
  Galatians: ['galatians', 'gal', '갈라디아서', 'gálatas'],
  Ephesians: ['ephesians', 'eph', '에베소서', 'efésios'],
  Philippians: ['philippians', 'php', 'phil', '빌립보서', 'filipenses'],
  Colossians: ['colossians', 'col', '골로새서', 'colossenses'],
  Hebrews: ['hebrews', 'heb', '히브리서', 'hebreus'],
  Revelation: ['revelation', 'rev', '요한계시록', 'apocalipse'],
};

export function detectScriptureReferences(text: string): ScriptureReference[] {
  if (!text || text.length < 4) return [];

  const results: ScriptureReference[] = [];
  const clean = text.toLowerCase();

  for (const [canonicalBook, aliases] of Object.entries(BIBLE_BOOKS)) {
    for (const alias of aliases) {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(
        `\\b${escaped}\\b\\s*(?:chapter\\s*)?(\\d{1,3})(?:[:\\s]|\\s*verse\\s*|장\\s*)(\\d{1,3})(?:[-~](\\d{1,3}))?`,
        'i'
      );

      const match = clean.match(pattern);
      if (match) {
        const chapter = parseInt(match[1], 10);
        const verseStart = parseInt(match[2], 10);
        const verseEnd = match[3] ? parseInt(match[3], 10) : undefined;

        if (chapter > 0 && verseStart > 0) {
          results.push({
            rawMatch: match[0],
            book: canonicalBook,
            chapter,
            verseStart,
            verseEnd,
          });
          break;
        }
      }
    }
  }

  return results;
}

export async function fetchScriptureVerse(ref: ScriptureReference, targetLang: string): Promise<ScriptureData | null> {
  const query = `${ref.book} ${ref.chapter}:${ref.verseStart}${ref.verseEnd ? `-${ref.verseEnd}` : ''}`;
  try {
    const res = await fetch(`https://bible-api.com/${encodeURIComponent(query)}?translation=web`);
    if (res.ok) {
      const data = await res.json();
      if (data?.text) {
        return {
          reference: data.reference || query,
          translation: 'World English Bible (Public Domain)',
          text: data.text.replace(/\s+/g, ' ').trim(),
        };
      }
    }
  } catch {
    // Graceful fallback
  }

  return {
    reference: query,
    translation: targetLang.toUpperCase(),
    text: `Scripture passage referenced: ${query}`,
  };
}
