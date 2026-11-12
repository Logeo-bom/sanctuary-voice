import type { LanguageOption } from '../types/translator';

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  {
    code: 'en',
    bcp47: 'en-US',
    name: 'English',
    nativeName: 'English',
    flag: '🇬🇧',
    dialectExamples: ['Southern US', 'Oxford / RP', 'Scottish', 'West African', 'Australian'],
  },
  {
    code: 'pt',
    bcp47: 'pt-BR',
    name: 'Portuguese',
    nativeName: 'Português',
    flag: '🇧🇷',
    dialectExamples: ['Brazilian (Paulista / Carioca / Nordestino)', 'European', 'Angolan'],
  },
  {
    code: 'no',
    bcp47: 'nb-NO',
    name: 'Norwegian',
    nativeName: 'Norsk',
    flag: '🇳🇴',
    dialectExamples: ['Bokmål', 'Nynorsk', 'Vestlandsk', 'Trøndersk', 'Nordnorsk'],
  },
  {
    code: 'tl',
    bcp47: 'fil-PH',
    name: 'Tagalog / Filipino',
    nativeName: 'Filipino',
    flag: '🇵🇭',
    dialectExamples: ['Manila / Taglish', 'Batangas', 'Bulacan'],
  },
  {
    code: 'fr',
    bcp47: 'fr-FR',
    name: 'French',
    nativeName: 'Français',
    flag: '🇫🇷',
    dialectExamples: ['Swiss French (Romand)', 'Canadian / Québécois', 'Metropolitan', 'West African'],
  },
  {
    code: 'es',
    bcp47: 'es-ES',
    name: 'Spanish',
    nativeName: 'Español',
    flag: '🇪🇸',
    dialectExamples: ['Latin American', 'Castilian', 'Rioplatense', 'Caribbean'],
  },
  {
    code: 'de',
    bcp47: 'de-DE',
    name: 'German',
    nativeName: 'Deutsch',
    flag: '🇩🇪',
    dialectExamples: ['Swiss German (Schwiizerdütsch)', 'Standard Hochdeutsch', 'Austrian', 'Bavarian'],
  },
  {
    code: 'uk',
    bcp47: 'uk-UA',
    name: 'Ukrainian',
    nativeName: 'Українська',
    flag: '🇺🇦',
    dialectExamples: ['Central', 'Western / Halychyna', 'Surzhyk-tolerant'],
  },
  {
    code: 'ko',
    bcp47: 'ko-KR',
    name: 'Korean',
    nativeName: '한국어',
    flag: '🇰🇷',
    dialectExamples: ['Seoul Standard', 'Gyeongsang', 'Jeolla'],
  },
  {
    code: 'sw',
    bcp47: 'sw-KE',
    name: 'Swahili',
    nativeName: 'Kiswahili',
    flag: '🇰🇪',
    dialectExamples: ['Kenyan / Sheng', 'Tanzanian Standard', 'Congolese Kingwana'],
  },
  {
    code: 'ar',
    bcp47: 'ar-SA',
    name: 'Arabic',
    nativeName: 'العربية',
    flag: '🌍',
    dialectExamples: ['Levantine', 'Egyptian', 'Modern Standard', 'Gulf'],
  },
  {
    code: 'zh',
    bcp47: 'zh-CN',
    name: 'Mandarin Chinese',
    nativeName: '中文',
    flag: '🇨🇳',
    dialectExamples: ['Mainland Putonghua', 'Taiwanese Guoyu', 'Malaysian / Singaporean'],
  },
];

export const SPEAKER_PALETTE = [
  '#38bdf8', // Sky Blue - Speaker 1 (Pulpit Pastor)
  '#fbbf24', // Amber - Translator 2 / Shouting Congregation member
  '#34d399', // Emerald - Speaker 3
  '#c084fc', // Purple - Speaker 4
];
