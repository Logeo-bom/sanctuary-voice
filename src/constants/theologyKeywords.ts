// Universal theological vocabulary terms for keyword boosting in Deepgram
export const THEOLOGICAL_KEYWORDS: Record<string, string[]> = {
  ko: [
    '하나님', '예수님', '성령님', '은혜', '구원', '기도', '할렐루야', '아멘',
    '말씀', '믿음', '부활', '십자가', '복음', '찬양', '천국', '성경', '주님',
    '요한복음', '로마서', '창세기', '마태복음'
  ],
  en: [
    'God', 'Jesus', 'Christ', 'Holy Spirit', 'Lord', 'Grace', 'Salvation', 'Prayer',
    'Hallelujah', 'Amen', 'Scripture', 'Faith', 'Resurrection', 'Cross', 'Gospel',
    'Worship', 'Heaven', 'Sanctuary', 'Romans', 'Genesis', 'Matthew', 'John'
  ],
  es: [
    'Dios', 'Jesús', 'Cristo', 'Espíritu Santo', 'Señor', 'Gracia', 'Salvación', 'Oración',
    'Aleluya', 'Amén', 'Palabra', 'Fe', 'Resurrección', 'Cruz', 'Evangelio',
    'Adoración', 'Cielo', 'Santuario', 'Romanos', 'Génesis', 'Mateo', 'Juan'
  ],
  pt: [
    'Deus', 'Jesus', 'Cristo', 'Espírito Santo', 'Senhor', 'Graça', 'Salvação', 'Oração',
    'Aleluia', 'Amém', 'Palavra', 'Fé', 'Ressurreição', 'Cruz', 'Evangelho',
    'Adoração', 'Céu', 'Santuário', 'Romanos', 'Gênesis', 'Mateus', 'João'
  ],
  no: [
    'Gud', 'Jesus', 'Kristus', 'Hellige Ånd', 'Herre', 'Nåde', 'Frelse', 'Bønn',
    'Halleluja', 'Amen', 'Ordet', 'Tro', 'Oppstandelse', 'Kors', 'Evangelium',
    'Lovsang', 'Himmel', 'Helligdom', 'Romerne', 'Første Mosebok'
  ],
  tl: [
    'Diyos', 'Hesus', 'Kristo', 'Espiritu Santo', 'Panginoon', 'Biyaya', 'Kaligtasan', 'Panalangin',
    'Aleluya', 'Amen', 'Salita', 'Pananampalataya', 'Muling Pagkabuhay', 'Krus', 'Ebanghelyo',
    'Pagsamba', 'Langit', 'Santuwaryo'
  ]
};

export function getKeywordsForLanguage(langCode: string): string[] {
  const code = (langCode || 'en').toLowerCase().split('-')[0];
  const specific = THEOLOGICAL_KEYWORDS[code] || [];
  const english = THEOLOGICAL_KEYWORDS.en;
  // Combine language-specific + English church words
  return Array.from(new Set([...specific, ...english])).slice(0, 35);
}
