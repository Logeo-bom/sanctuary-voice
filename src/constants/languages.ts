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
    code: 'pt',
    bcp47: 'pt-BR',
    name: 'Portuguese',
    nativeName: 'Português',
    flag: '🇧🇷',
    dialectExamples: ['Brazilian (Paulista / Carioca / Nordestino)', 'European', 'Angolan'],
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
  '#38bdf8', // Sky Blue - Speaker 1
  '#fbbf24', // Amber - Translator 2
  '#34d399', // Emerald - Speaker 3
  '#c084fc', // Purple - Speaker 4
];

export interface StageSimulationPreset {
  id: string;
  title: string;
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
    id: 'bilingual-preacher-interpreter',
    title: 'Dual-Stage: Southern US Preacher + Swiss French Interpreter (over Synth Pad)',
    description:
      'Simulates Bard’s core test case: Speaker 1 preaches in Southern American English while Translator 2 translates on stage into Swiss French, with a worship synth pad playing softly.',
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
          ko: '지금 잘 들으십시오. 폭풍이 여러분의 배 주위에 몰아쳐도 하나님의 은혜는 여러분이 가라앉게 두지 않을 것입니다.',
          sw: 'Sikilizeni kwa makini sasa — hata dhoruba inapovuma kuzunguka mashua yako, neema haitakuacha uzame.',
          ar: 'استمعوا جيداً الآن — حتى عندما تعصف العاصفة حول قاربكم، فإن النعمة لن تدعكم تغرقون.',
          zh: '大家现在仔细听——即使暴风雨在你的船周围肆虐，恩典也绝不会让你沉没。',
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
          ko: '잘 들어보세요 — 폭풍우가 배를 세차게 때릴 때에도 하나님의 은혜는 단 일 초도 여러분을 놓지 않으십니다.',
          sw: 'Sikilizeni sasa — hata wakati dhoruba inapopiga mashua kwa nguvu, neema ya Mungu haikuachi hata kwa sekunde moja.',
          ar: 'اسمعوا الآن — حتى عندما تضرب العاصفة القارب بقوة، فإن نعمة الله لا تترككم ولا لثانية واحدة.',
          zh: '现在请听——即使暴风雨猛烈击打船只，上帝的恩典也一秒钟都不会放开你。',
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
          ko: '바울의 로마서 8장을 펴십시오. 그러므로 이제 성령 안에서 행하는 자에게는 결코 정죄함이 없습니다.',
          sw: 'Fungueni waraka wa Paulo kwa Warumi sura ya nane: sasa basi hakuna hukumu ya adhabu juu yao체 waendao kwa جinsi ya Roho.',
          ar: 'افتحوا رسالة بولس إلى أهل رومية الإصحاح الثامن: إذاً لا شيء من الدينونة الآن على الذين يسلكون في الروح.',
          zh: '请翻开保罗达罗马人书第八章：如今那些在圣灵里行事的人，就不定罪了。',
        },
      },
      {
        speakerId: 'speaker_2',
        speakerLabel: 'Translator 2',
        sourceLanguageCode: 'fr',
        sourceLanguageName: 'French',
        detectedDialect: 'Swiss French (Vaudois/Romand)',
        originalText:
          "Prenez voir Romains chapitre huitante... euh huit : il n'y a donc plus aucune condamnation pour ceux qui marchent selon l'Esprit.",
        backgroundNoiseNote: 'Synth Swell + Distant PA Echo',
        translations: {
          no: 'Slå opp i Romerbrevet kapittel åtte: det er derfor ikke lenger noen fordømmelse for dem som vandrer etter Ånden.',
          en: 'Turn to Romans chapter eight: there is therefore no longer any condemnation for those who walk according to the Spirit.',
          tl: 'Tingnan natin ang Roma kabanata walo: kaya wala nang kahatulan pa para sa mga namumuhay ayon sa Espiritu.',
          fr: "Prenez Romains chapitre huit : il n'y a donc plus aucune condamnation pour ceux qui marchent selon l'Esprit.",
          es: 'Busquen Romanos capítulo ocho: por tanto, ya no hay ninguna condenación para los que caminan según el Espíritu.',
          de: 'Nehmt Römer Kapitel acht: Es gibt also keine Verdammnis mehr für die, welche nach dem Geist wandeln.',
          pt: 'Pegue Romanos capítulo oito: portanto, não há mais nenhuma condenação para aqueles que andam segundo o Espírito.',
          uk: 'Візьміть Римлян восьмий розділ: отже, немає більше жодного осуду для тих, хто ходить за Духом.',
          ko: '로마서 8장을 보십시오. 성령을 따라 행하는 사람들에게는 더 이상 아무런 정죄함이 없습니다.',
          sw: 'Geukieni Warumi sura ya nane: kwa hiyo sasa hakuna tena hukumu kwa wale wanaotembea kwa kufuata Roho.',
          ar: 'انتقلوا إلى رومية الإصحاح الثامن: لم يعد هناك أي دينونة للذين يسلكون بحسب الروح.',
          zh: '请看罗马书第八章：因此，那些随从圣灵而行的人，就不再被定罪了。',
        },
      },
    ],
  },
];
