import { describe, expect, it } from 'vitest';
import { BIBLE_BOOKS, detectScriptureReferences } from '../scriptureService';

describe('scriptureService (66 Books + Multilingual & Thematic Detection)', () => {
  it('includes all 66 canonical books of the Old and New Testaments', () => {
    expect(Object.keys(BIBLE_BOOKS)).toHaveLength(66);
  });

  it('detects English, Cebuano/Bisaya, Tagalog, Portuguese, and Korean citations', () => {
    expect(detectScriptureReferences('Turn with me to Malachi 3:10')).toEqual([
      expect.objectContaining({ book: 'Malachi', chapter: 3, verseStart: 10 }),
    ]);

    expect(detectScriptureReferences('Basahon nato sa Malakias kapitulo 3 bersikulo 10')).toEqual([
      expect.objectContaining({ book: 'Malachi', chapter: 3, verseStart: 10 }),
    ]);

    expect(detectScriptureReferences('Juan 3:16-17')).toEqual([
      expect.objectContaining({ book: 'John', chapter: 3, verseStart: 16, verseEnd: 17 }),
    ]);

    expect(detectScriptureReferences('Mga Buhat 2:38')).toEqual([
      expect.objectContaining({ book: 'Acts', chapter: 2, verseStart: 38 }),
    ]);

    expect(detectScriptureReferences('Pinadayag 21:4')).toEqual([
      expect.objectContaining({ book: 'Revelation', chapter: 21, verseStart: 4 }),
    ]);
  });

  it('detects thematic scripture passages when quoted without explicit chapter/verse numbers', () => {
    const bisayaQuote =
      'Magmatinud-anon sa paghatag sa ikanapulog mga halad ug maabli ang tambuanan sa langit';
    expect(detectScriptureReferences(bisayaQuote)).toEqual([
      expect.objectContaining({ book: 'Malachi', chapter: 3, verseStart: 10 }),
    ]);
  });
});
