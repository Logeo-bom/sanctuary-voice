import type { LanguageOption, StageSpeaker } from '../types/translator';

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

export interface StageSimulationPreset {
  id: string;
  title: string;
  badge: string;
  description: string;
  speakers: StageSpeaker[];
  steps: Array<{
    speakerId: string;
    speakerLabel: string;
    sourceLanguageCode: string;
    sourceLanguageName: string;
    detectedDialect: string;
    originalText: string;
    backgroundNoiseNote?: string;
    translations: Record<string, string>;
  }>;
}

export const STAGE_SIMULATION_PRESETS: StageSimulationPreset[] = [
  {
    id: 'brazilian-church-test',
    title: 'Brazilian Church: Preacher in Portuguese + Shouting in the Spirit Filtered',
    badge: 'Bard’s Sunday Visit',
    description:
      'Solves Bard’s exact challenge from Sunday: Pastor preaches in Brazilian Portuguese on the PA while a lady in the congregation sings and shouts in the spirit. Shouting is recognized as non-pastor speech and muted in the listener’s earphones.',
    speakers: [
      {
        id: 'speaker_1',
        label: 'Pastor (Pulpit PA)',
        roleHint: 'main-speaker',
        detectedLanguageCode: 'pt',
        detectedLanguageName: 'Portuguese',
        detectedDialect: 'Brazilian Portuguese (Preaching)',
        accentColor: '#38bdf8',
        segmentCount: 0,
        lastActiveAt: Date.now(),
        isIgnored: false,
      },
      {
        id: 'speaker_2',
        label: 'Lady Shouting / In the Spirit (Floor)',
        roleHint: 'worship-leader',
        detectedLanguageCode: 'pt',
        detectedLanguageName: 'Ecstatic Prayer',
        detectedDialect: 'Pentecostal Glossolalia / Singing',
        accentColor: '#fbbf24',
        segmentCount: 0,
        lastActiveAt: Date.now(),
        isIgnored: true, // Muted by default so listener only hears sermon!
      },
    ],
    steps: [
      {
        speakerId: 'speaker_1',
        speakerLabel: 'Pastor (Pulpit PA)',
        sourceLanguageCode: 'pt',
        sourceLanguageName: 'Portuguese',
        detectedDialect: 'Brazilian Portuguese',
        originalText:
          'Abram a palavra de Deus no livro dos Salmos, capítulo vinte e três: o Senhor é o meu pastor e nada me faltará!',
        backgroundNoiseNote: 'Church PA Acoustics + Pre-Amp +12dB',
        translations: {
          no: 'Slå opp i Guds ord i Salmenes bok, kapittel tjuetre: Herren er min hyrde, jeg mangler ingenting!',
          en: 'Open the word of God in the book of Psalms, chapter twenty-three: the Lord is my shepherd, I shall not want!',
          tl: 'Buksan ninyo ang salita ng Diyos sa aklat ng Mga Awit, kabanata dalawampu’t tatlo: Ang Panginoon ang aking pastol, hindi ako magkukulang!',
          fr: "Ouvrez la parole de Dieu dans le livre des Psaumes, chapitre vingt-trois : l'Éternel est mon berger, je ne manquerai de rien !",
          es: 'Abran la palabra de Dios en el libro de los Salmos, capítulo veintitrés: ¡El Señor es mi pastor, nada me faltará!',
          de: 'Schlagt das Wort Gottes im Buch der Psalmen auf, Kapitel dreiundzwanzig: Der Herr ist mein Hirte, mir wird nichts mangeln!',
          pt: 'Abram a palavra de Deus no livro dos Salmos, capítulo vinte e três: o Senhor é o meu pastor e nada me faltará!',
          uk: 'Відкрийте слово Боже в книзі Псалмів, двадцять третій розділ: Господь — мій пастир, я ні в чому не матиму потреби!',
        },
      },
      {
        speakerId: 'speaker_2',
        speakerLabel: 'Lady Shouting / In the Spirit (Floor)',
        sourceLanguageCode: 'pt',
        sourceLanguageName: 'Ecstatic Prayer',
        detectedDialect: 'Singing in the Spirit (Non-Lexical)',
        originalText:
          'Glória a Deus! Aleluia! Rabashanda lamana... Ele é santo, Ele é digno!',
        backgroundNoiseNote: 'Congregation Shouting Filtered • Muted in Earphones',
        translations: {
          no: '[Menighetsrop/Åndelig lovprisning filtrert bort]',
          en: '[Congregation shouting / singing in the spirit filtered out]',
          tl: '[Pagsigaw/panalangin sa espiritu ay sinala at hindi pinatugtog]',
          fr: '[Cris de louange dans l’esprit filtrés]',
          es: '[Clamor en el espíritu filtrado]',
          de: '[Gemeinderufe im Geist herausgefiltert]',
          pt: '[Clamor da congregação no espírito filtrado]',
          uk: '[Вигуки та молитва в дусі відфільтровані]',
        },
      },
      {
        speakerId: 'speaker_1',
        speakerLabel: 'Pastor (Pulpit PA)',
        sourceLanguageCode: 'pt',
        sourceLanguageName: 'Portuguese',
        detectedDialect: 'Brazilian Portuguese',
        originalText:
          'Ainda que eu ande pelo vale da sombra da morte, não temerei mal algum, porque a Tua graça está comigo!',
        backgroundNoiseNote: 'Pre-Amp +12dB • Synth Pad Ducked',
        translations: {
          no: 'Selv om jeg går i dødsskyggens dal, frykter jeg intet ondt, for Din nåde er med meg!',
          en: 'Even though I walk through the valley of the shadow of death, I will fear no evil, for Your grace is with me!',
          tl: 'Kahit lumakad man ako sa libis ng lilim ng kamatayan, hindi ako matatakot sa anumang kasamaan, sapagkat ang Iyong biyaya ay sumasaakin!',
          fr: "Même quand je marche dans la vallée de l'ombre de la mort, je ne crains aucun mal, car Ta grâce est avec moi !",
          es: '¡Aunque ande en valle de sombra de muerte, no temeré mal alguno, porque Tu gracia está conmigo!',
          de: 'Und ob ich schon wanderte im finstern Tal, fürchte ich kein Unglück, denn Deine Gnade ist bei mir!',
          pt: 'Ainda que eu ande pelo vale da sombra da morte, não temerei mal algum, porque a Tua graça está comigo!',
          uk: 'Навіть якщо я піду долиною смертної тіні, не побоюся зла, бо Твоя благодать зі мною!',
        },
      },
    ],
  },
  {
    id: 'bilingual-preacher-interpreter',
    title: 'Dual-Stage: Southern US Preacher + Swiss French Interpreter',
    badge: 'Dual-Language Stage',
    description:
      'Speaker 1 preaches in Southern American English while Translator 2 translates on stage into Swiss French, with a worship synth pad playing softly.',
    speakers: [
      {
        id: 'speaker_1',
        label: 'Speaker 1',
        roleHint: 'main-speaker',
        detectedLanguageCode: 'en',
        detectedLanguageName: 'English',
        detectedDialect: 'Southern US English',
        accentColor: '#38bdf8',
        segmentCount: 0,
        lastActiveAt: Date.now(),
        isIgnored: false,
      },
      {
        id: 'speaker_2',
        label: 'Translator 2',
        roleHint: 'stage-interpreter',
        detectedLanguageCode: 'fr',
        detectedLanguageName: 'French',
        detectedDialect: 'Swiss French (Romand)',
        accentColor: '#fbbf24',
        segmentCount: 0,
        lastActiveAt: Date.now(),
        isIgnored: false,
      },
    ],
    steps: [
      {
        speakerId: 'speaker_1',
        speakerLabel: 'Speaker 1',
        sourceLanguageCode: 'en',
        sourceLanguageName: 'English',
        detectedDialect: 'Southern US English',
        originalText:
          "Y'all listen close now — even when the storm's ragin' round your boat, grace ain't gonna let you sink.",
        backgroundNoiseNote: 'Warm Synth Pad (70Hz-400Hz filtered)',
        translations: {
          no: 'Hør godt etter nå — selv når stormen raser rundt båten din, vil ikke nåden la deg synke.',
          en: "Listen closely now — even when the storm is raging around your boat, grace won't let you sink.",
          tl: 'Makinig kayong mabuti ngayon — kahit humahagupit ang bagyo sa paligid ng inyong bangka, hindi hahayaan ng biyaya ng Diyos na kayo ay lumubog.',
          fr: 'Écoutez bien maintenant — même quand la tempête fait rage autour de votre barque, la grâce ne vous laissera pas couler.',
          es: 'Escuchen bien ahora: incluso cuando la tormenta arrecia alrededor de su barca, la gracia no dejará que se hundan.',
          de: 'Hört jetzt gut zu – selbst wenn der Sturm um euer Boot tobt, wird die Gnade euch nicht sinken lassen.',
          pt: 'Ouçam com atenção agora — mesmo quando a tempestade estiver rugindo ao redor do seu barco, a graça não vai deixar você afundar.',
          uk: 'Слухайте уважно зараз — навіть коли буря вирує навколо вашого човна, благодать не дасть вам потонути.',
        },
      },
      {
        speakerId: 'speaker_2',
        speakerLabel: 'Translator 2',
        sourceLanguageCode: 'fr',
        sourceLanguageName: 'French',
        detectedDialect: 'Swiss French (Vaudois/Romand)',
        originalText:
          "Écoutez voir maintenant — même quand l'orage tape fort contre la barque, la grâce de Dieu vous lâche pas une seconde.",
        backgroundNoiseNote: 'Warm Synth Pad + Room Reverb',
        translations: {
          no: 'Hør etter nå — selv når uværet slår hardt mot båten, slipper ikke Guds nåde deg et eneste sekund.',
          en: 'Listen now — even when the storm beats hard against the boat, the grace of God does not let you go for a second.',
          tl: 'Pakinggan ninyo ngayon — kahit malakas ang hampas ng unos sa bangka, hindi kayo bibitawan ng biyaya ng Diyos kahit isang segundo.',
          fr: "Écoutez bien maintenant — même quand l'orage frappe fort contre la barque, la grâce de Dieu ne vous lâche pas une seconde.",
          es: 'Escuchen ahora: incluso cuando la tormenta golpea fuerte contra la barca, la gracia de Dios no los suelta ni un segundo.',
          de: 'Hört jetzt zu – selbst wenn das Gewitter hart gegen das Boot schlägt, lässt Gottes Gnade euch keine Sekunde los.',
          pt: 'Ouçam agora — mesmo quando a tempestade bate forte contra o barco, a graça de Deus não te solta nem por um segundo.',
          uk: 'Послухайте зараз — навіть коли гроза сильно б’є об човен, Божа благодать не відпускає вас ні на секунду.',
        },
      },
      {
        speakerId: 'speaker_1',
        speakerLabel: 'Speaker 1',
        sourceLanguageCode: 'en',
        sourceLanguageName: 'English',
        detectedDialect: 'Southern US English',
        originalText:
          "Open up Paul's letter to the Romans chapter eight: there is therefore now no condemnation for those who walk in the Spirit.",
        backgroundNoiseNote: 'Synth Swell + Distant PA Echo',
        translations: {
          no: 'Slå opp i Paulus’ brev til romerne kapittel åtte: Det er derfor nå ingen fordømmelse for dem som vandrer i Ånden.',
          en: "Open up Paul's letter to the Romans chapter eight: there is therefore now no condemnation for those who walk in the Spirit.",
          tl: 'Buksan ninyo ang sulat ni Pablo sa mga Taga-Roma kabanata walo: kaya nga ngayon ay wala nang hatol sa mga lumalakad ayon sa Espiritu.',
          fr: "Ouvrez l'épître de Paul aux Romains, chapitre huit : il n'y a donc maintenant aucune condamnation pour ceux qui marchent selon l'Esprit.",
          es: 'Abran la carta de Pablo a los Romanos, capítulo ocho: ahora, pues, ninguna condenación hay para los que andan en el Espíritu.',
          de: 'Schlagt den Brief des Paulus an die Römer Kapitel acht auf: So gibt es jetzt keine Verdammnis mehr für die, welche im Geist wandeln.',
          pt: 'Abram a carta de Paulo aos Romanos, capítulo oito: portanto, agora já não há condenação para os que caminham no Espírito.',
          uk: 'Відкрийте послання Павла до Римлян, восьмий розділ: отже, немає тепер жодного осуду тим, які ходять у Дусі.',
        },
      },
    ],
  },
];
