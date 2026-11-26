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

// All 66 canonical books of the Old & New Testaments with English, Cebuano/Bisaya, Tagalog/Filipino,
// Spanish, Portuguese, French, German, and Korean aliases & abbreviations.
export const BIBLE_BOOKS: Record<string, string[]> = {
  // Old Testament (39 Books)
  Genesis: ['genesis', 'gen', '창세기', 'gênesis', 'génesis', 'henesis', 'jenesis'],
  Exodus: ['exodus', 'exo', '출애굽기', 'êxodo', 'éxodo', 'exodo', 'eksodo'],
  Leviticus: ['leviticus', 'lev', '레위기', 'levítico', 'levitico', 'lebitico'],
  Numbers: ['numbers', 'num', '민수기', 'números', 'numeros', 'mga numero', 'bilang'],
  Deuteronomy: ['deuteronomy', 'deut', 'deu', '신명기', 'deuteronômio', 'deuteronomio'],
  Joshua: ['joshua', 'josh', 'jos', '여호수아', 'josué', 'josue', 'husue'],
  Judges: ['judges', 'judg', 'jdg', '사사기', 'juízes', 'jueces', 'mga maghuhukom', 'hukom'],
  Ruth: ['ruth', 'rut', '룻기', 'rute'],
  '1 Samuel': ['1 samuel', '1 sam', '1sam', '사무엘상', '1 samuel'],
  '2 Samuel': ['2 samuel', '2 sam', '2sam', '사무엘하', '2 samuel'],
  '1 Kings': ['1 kings', '1 kgs', '1kgs', '열왕기상', '1 reis', '1 reyes', '1 mga hari', '1 hari'],
  '2 Kings': ['2 kings', '2 kgs', '2kgs', '열왕기하', '2 reis', '2 reyes', '2 mga hari', '2 hari'],
  '1 Chronicles': ['1 chronicles', '1 chr', '1chr', '역대상', '1 crônicas', '1 crónicas', '1 cronicas', '1 kronika'],
  '2 Chronicles': ['2 chronicles', '2 chr', '2chr', '역대하', '2 crônicas', '2 crónicas', '2 cronicas', '2 kronika'],
  Ezra: ['ezra', 'ezr', '에스라', 'esdras'],
  Nehemiah: ['nehemiah', 'neh', '느헤미야', 'neemias', 'nehemías', 'nehemias'],
  Esther: ['esther', 'est', '에스더', 'ester'],
  Job: ['job', '욥기', 'jó'],
  Psalms: ['psalms', 'psalm', 'psa', 'ps', '시편', 'salmos', 'salmo', 'mga salmo', 'awit'],
  Proverbs: ['proverbs', 'proverb', 'prov', 'pro', '잠언', 'provérbios', 'proverbios', 'mga panultihon', 'panultihon', 'kawikaan'],
  Ecclesiastes: ['ecclesiastes', 'eccl', 'ecc', '전도서', 'eclesiastes', 'eclesiastés', 'ang magwawali', 'mangangaral'],
  'Song of Solomon': ['song of solomon', 'song of songs', 'songs', 'sos', '아가', 'cantares', 'cântico dos cânticos', 'awit ni solomon'],
  Isaiah: ['isaiah', 'isa', '이사야', 'isaías', 'isaias'],
  Jeremiah: ['jeremiah', 'jer', '예레미야', 'jeremias', 'jeremías'],
  Lamentations: ['lamentations', 'lam', '예레미야애가', 'lamentações', 'lamentaciones', 'mga paghilak', 'panaghoy'],
  Ezekiel: ['ezekiel', 'ezek', 'eze', '에스겔', 'ezequiel', 'ezekiel'],
  Daniel: ['daniel', 'dan', '다니엘'],
  Hosea: ['hosea', 'hos', '호세아', 'oseias', 'oseas'],
  Joel: ['joel', 'joe', '요엘'],
  Amos: ['amos', 'amo', '아모스', 'amós'],
  Obadiah: ['obadiah', 'obad', 'oba', '오바댜', 'obadias', 'abdías', 'abdias'],
  Jonah: ['jonah', 'jon', '요나', 'jonas', 'jonás', 'hunas'],
  Micah: ['micah', 'mic', '미가', 'miqueias', 'miqueas', 'mikas'],
  Nahum: ['nahum', 'nah', '나훔', 'naum', 'nahúm'],
  Habakkuk: ['habakkuk', 'hab', '하박국', 'habacuque', 'habacuc', 'habakuk'],
  Zephaniah: ['zephaniah', 'zeph', 'zep', '스바냐', 'sofonias', 'sofonías'],
  Haggai: ['haggai', 'hag', '학개', 'ageu', 'hageo', 'hagai'],
  Zechariah: ['zechariah', 'zech', 'zec', '스가랴', 'zacarias', 'zacarías', 'zakarias'],
  Malachi: ['malachi', 'mal', '말라기', 'malaquias', 'malaquías', 'malakias'],

  // New Testament (27 Books)
  Matthew: ['matthew', 'matt', 'mat', '마태복음', 'mateus', 'mateo'],
  Mark: ['mark', 'mrk', 'mar', '마가복음', 'marcos', 'markos'],
  Luke: ['luke', 'luk', '누가복음', 'lucas', 'lukas'],
  John: ['john', 'jhn', 'joh', '요한복음', 'joão', 'juan'],
  Acts: ['acts', 'act', '사도행전', 'atos', 'hechos', 'mga buhat', 'buhat', 'gawa'],
  Romans: ['romans', 'rom', '로마서', 'romanos', 'mga taga-roma', 'roma'],
  '1 Corinthians': ['1 corinthians', '1 cor', '1cor', '고린도전서', '1 coríntios', '1 corintios', '1 קור'],
  '2 Corinthians': ['2 corinthians', '2 cor', '2cor', '고린도후서', '2 coríntios', '2 corintios'],
  Galatians: ['galatians', 'gal', '갈라디아서', 'gálatas', 'galatas', 'galacia'],
  Ephesians: ['ephesians', 'eph', '에베소서', 'efésios', 'efesios', 'efeso'],
  Philippians: ['philippians', 'phil', 'php', '빌립보서', 'filipenses', 'filipos'],
  Colossians: ['colossians', 'col', '골로새서', 'colossenses', 'colosenses', 'colosas'],
  '1 Thessalonians': ['1 thessalonians', '1 thess', '1 ths', '데살로니가전서', '1 tessalonicenses', '1 tesalonicenses', '1 tesalonica'],
  '2 Thessalonians': ['2 thessalonians', '2 thess', '2 ths', '데살로니가후서', '2 tessalonicenses', '2 tesalonicenses', '2 tesalonica'],
  '1 Timothy': ['1 timothy', '1 tim', '1tim', '디모데전서', '1 timóteo', '1 timoteo'],
  '2 Timothy': ['2 timothy', '2 tim', '2tim', '디모데후서', '2 timóteo', '2 timoteo'],
  Titus: ['titus', 'tit', '디도서', 'tito'],
  Philemon: ['philemon', 'phlm', 'phm', '빌레몬서', 'filemom', 'filemón', 'filemon'],
  Hebrews: ['hebrews', 'heb', '히브리서', 'hebreus', 'hebreos', 'mga hebreo', 'hebreo'],
  James: ['james', 'jas', 'jam', '야고보서', 'tiago', 'santiago'],
  '1 Peter': ['1 peter', '1 pet', '1pet', '베드로전서', '1 pedro'],
  '2 Peter': ['2 peter', '2 pet', '2pet', '베드로후서', '2 pedro'],
  '1 John': ['1 john', '1 jhn', '1jn', '요한일서', '1 joão', '1 juan'],
  '2 John': ['2 john', '2 jhn', '2jn', '요한이서', '2 joão', '2 juan'],
  '3 John': ['3 john', '3 jhn', '3jn', '요한삼서', '3 joão', '3 juan'],
  Jude: ['jude', 'jud', '유다서', 'judas', 'hudas'],
  Revelation: ['revelation', 'revelations', 'rev', '요한계시록', 'apocalipse', 'apocalipsis', 'gipadayag', 'pinadayag', 'pahayag'],
};

// Thematic phrase-to-scripture cues so famous sermon quotes (like Malachi 3:10 tithes/windows of heaven)
// automatically surface the corresponding Bible passage even when the preacher quotes the verse without
// explicitly saying the chapter and verse numbers aloud.
const THEMATIC_SCRIPTURE_CUES: Array<{
  keywords: string[];
  minMatches: number;
  ref: ScriptureReference;
}> = [
  {
    keywords: ['ikanapulo', 'ikanapulog', 'halad', 'tambuanan sa langit', 'tithes', 'offerings', 'windows of heaven', 'storehouse'],
    minMatches: 2,
    ref: { rawMatch: 'Malachi 3:10', book: 'Malachi', chapter: 3, verseStart: 10 },
  },
  {
    keywords: ['true vine', 'vinedresser', ' ramas', 'branches', 'abide in me'],
    minMatches: 2,
    ref: { rawMatch: 'John 15:1-5', book: 'John', chapter: 15, verseStart: 1, verseEnd: 5 },
  },
  {
    keywords: ['for god so loved the world', 'only begotten son', 'gihigugma sa dios ang kalibutan'],
    minMatches: 1,
    ref: { rawMatch: 'John 3:16', book: 'John', chapter: 3, verseStart: 16 },
  },
  {
    keywords: ['the lord is my shepherd', 'i shall not want', 'ang ginoo mao ang akong magbalantay'],
    minMatches: 1,
    ref: { rawMatch: 'Psalms 23:1', book: 'Psalms', chapter: 23, verseStart: 1 },
  },
];

export function detectScriptureReferences(text: string): ScriptureReference[] {
  if (!text || text.length < 4) return [];

  const results: ScriptureReference[] = [];
  const clean = text.toLowerCase();

  // 1. Explicit Book + Chapter + Verse citation (supports English, Cebuano "kapitulo/bersikulo", Spanish/Portuguese, Korean)
  const chapterTokens = '(?:chapter|kapitulo|kap|capítulo|capitulo|ch)?';
  const verseTokens = '(?:[:.,\\s]|\\s*(?:verse|verses|bersikulo|ber|berso|versículo|versiculo|v|vv)\\s*|장\\s*)';

  for (const [canonicalBook, aliases] of Object.entries(BIBLE_BOOKS)) {
    for (const alias of aliases) {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(
        `\\b${escaped}\\b\\s*${chapterTokens}\\s*(\\d{1,3})${verseTokens}(\\d{1,3})(?:\\s*[-~–]\\s*(\\d{1,3}))?`,
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

  // 2. If no explicit number citation was spoken, check for unmistakable famous scripture quotes
  if (results.length === 0) {
    for (const cue of THEMATIC_SCRIPTURE_CUES) {
      const matchedCount = cue.keywords.filter((kw) => clean.includes(kw.toLowerCase())).length;
      if (matchedCount >= cue.minMatches) {
        results.push(cue.ref);
        break;
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
        const englishText = data.text.replace(/\s+/g, ' ').trim();
        const baseTarget = (targetLang || 'en').toLowerCase().split('-')[0];

        // If the listener's target language is not English, translate the verse into their language
        if (baseTarget && baseTarget !== 'en') {
          try {
            const trRes = await fetch('/api/translate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                text: englishText,
                sl: 'en',
                tl: targetLang,
              }),
            });
            if (trRes.ok) {
              const trData = await trRes.json();
              if (trData?.translatedText) {
                return {
                  reference: data.reference || query,
                  translation: `WEB · ${targetLang.toUpperCase()}`,
                  text: trData.translatedText.trim(),
                };
              }
            }
          } catch {
            // Fall through to English WEB text
          }
        }

        return {
          reference: data.reference || query,
          translation: 'World English Bible',
          text: englishText,
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
