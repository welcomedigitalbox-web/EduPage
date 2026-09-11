/**
 * Staff type addresses by hand — "မန္တလေး", "ချမ်းအေးသာစံ", "တာမွေ",
 * "မြောက်ဒဂုံ" — with no city field and no spelling discipline. This turns
 * that free text into a township and a region so a spreadsheet can group by
 * them.
 *
 * It never rewrites what was typed: the original address stays, and the clean
 * values arrive as extra columns. A guess that cannot be made is left blank
 * rather than filled with something plausible.
 */

export interface CleanAddress {
  /** State or region, in English — 'Yangon', 'Shan', 'Ayeyarwady'. */
  region: string;
  /** The same, as Myanmar writes it — 'ရန်ကုန်တိုင်းဒေသကြီး', 'ရှမ်းပြည်နယ်'. */
  regionMm: string;
  /** City or town, when the address named one rather than a township. */
  city: string;
  /** Canonical township name, or ''. */
  township: string;
  matched: boolean;
}

/** The 7 regions, 7 states and the union territory, in both scripts. */
const REGION_MM: Record<string, string> = {
  Yangon: 'ရန်ကုန်တိုင်းဒေသကြီး',
  Mandalay: 'မန္တလေးတိုင်းဒေသကြီး',
  Sagaing: 'စစ်ကိုင်းတိုင်းဒေသကြီး',
  Bago: 'ပဲခူးတိုင်းဒေသကြီး',
  Magway: 'မကွေးတိုင်းဒေသကြီး',
  Ayeyarwady: 'ဧရာဝတီတိုင်းဒေသကြီး',
  Tanintharyi: 'တနင်္သာရီတိုင်းဒေသကြီး',
  Shan: 'ရှမ်းပြည်နယ်',
  Mon: 'မွန်ပြည်နယ်',
  Kayin: 'ကရင်ပြည်နယ်',
  Kayah: 'ကယားပြည်နယ်',
  Rakhine: 'ရခိုင်ပြည်နယ်',
  Chin: 'ချင်းပြည်နယ်',
  Kachin: 'ကချင်ပြည်နယ်',
  Naypyitaw: 'နေပြည်တော်',
};

/** Canonical name → every spelling seen in the wild. Order matters only in
 *  that longer keys are tried first, so "မြောက်ဥက္ကလာပ" beats "ဥက္ကလာပ". */
const YANGON: Record<string, string[]> = {
  'တာမွေ': ['တာမွေ', 'တာမွေမြို့နယ်'],
  'မြောက်ဒဂုံ': ['မြောက်ဒဂုံ', 'ဒဂုံမြောက်', 'ဒဂုံမြို့သစ်မြောက်', 'north dagon'],
  'တောင်ဒဂုံ': ['တောင်ဒဂုံ', 'ဒဂုံတောင်', 'ဒဂုံမြို့သစ်တောင်', 'south dagon'],
  'အရှေ့ဒဂုံ': ['အရှေ့ဒဂုံ', 'ဒဂုံအရှေ့', 'ဒဂုံမြို့သစ်အရှေ့', 'east dagon'],
  'ဒဂုံဆိပ်ကမ်း': ['ဒဂုံဆိပ်ကမ်း', 'ဆိပ်ကမ်းဒဂုံ', 'dagon seikkan'],
  'မြောက်ဥက္ကလာပ': ['မြောက်ဥက္ကလာပ', 'ဥက္ကလာပမြောက်', 'north okkalapa'],
  'တောင်ဥက္ကလာပ': ['တောင်ဥက္ကလာပ', 'ဥက္ကလာပတောင်', 'south okkalapa'],
  'သင်္ဃန်းကျွန်း': ['သင်္ဃန်းကျွန်း', 'သဃ်န်းကျွန်း', 'thingangyun'],
  'မရမ်းကုန်း': ['မရမ်းကုန်း', 'mayangone'],
  'ကမာရွတ်': ['ကမာရွတ်', 'kamayut'],
  'အင်းစိန်': ['အင်းစိန်', 'insein'],
  'လှိုင်': ['လှိုင်မြို့နယ်', 'လှိုင်', 'hlaing'],
  'လှိုင်သာယာ': ['လှိုင်သာယာ', 'hlaingtharyar', 'hlaing tharyar'],
  'ရွှေပြည်သာ': ['ရွှေပြည်သာ', 'shwepyithar'],
  'မင်္ဂလာဒုံ': ['မင်္ဂလာဒုံ', 'mingaladon'],
  'ဒဂုံ': ['ဒဂုံမြို့နယ်'],
  'ကျောက်တံတား': ['ကျောက်တံတား', 'kyauktada'],
  'ပန်းဘဲတန်း': ['ပန်းဘဲတန်း', 'pabedan'],
  'လသာ': ['လသာ', 'latha'],
  'လမ်းမတော်': ['လမ်းမတော်', 'lanmadaw'],
  'အလုံ': ['အလုံ', 'ahlone'],
  'ကြည့်မြင်တိုင်': ['ကြည့်မြင်တိုင်', 'kyimyindaing'],
  'စမ်းချောင်း': ['စမ်းချောင်း', 'sanchaung'],
  'ဗဟန်း': ['ဗဟန်း', 'bahan'],
  'ရန်ကင်း': ['ရန်ကင်း', 'yankin'],
  'မင်္ဂလာတောင်ညွန့်': ['မင်္ဂလာတောင်ညွန့်', 'မင်္ဂလာတောင်ညွန့်မြို့နယ်'],
  'ဒေါပုံ': ['ဒေါပုံ', 'dawbon'],
  'သာကေတ': ['သာကေတ', 'thaketa'],
  'ပဇုန်တောင်': ['ပုဇွန်တောင်', 'ပဇုန်တောင်', 'pazundaung'],
  'ဗိုလ်တထောင်': ['ဗိုလ်တထောင်', 'botahtaung'],
  'ဆိပ်ကြီးခနောင်တို': ['ဆိပ်ကြီးခနောင်တို', 'seikkyi'],
  'ဒလ': ['ဒလမြို့နယ်', 'ဒလ'],
  'သန်လျင်': ['သန်လျင်', 'thanlyin'],
  'ကျောက်တန်း': ['ကျောက်တန်း'],
  'ခရမ်း': ['ခရမ်းမြို့နယ်'],
  'တွံတေး': ['တွံတေး'],
  'လှည်းကူး': ['လှည်းကူး'],
  'ထန်းတပင်': ['ထန်းတပင်'],
  'ဟဲဂျီ': ['ဟဲဂျီ'],
};

const MANDALAY: Record<string, string[]> = {
  'ချမ်းအေးသာစံ': ['ချမ်းအေးသာစံ', 'ချမ်းအေးသာဇံ', 'chanayethazan'],
  'မဟာအောင်မြေ': ['မဟာအောင်မြေ', 'mahaaungmye', 'maha aung mye'],
  'ချမ်းမြသာစည်': ['ချမ်းမြသာစည်', 'chanmyathazi'],
  'အောင်မြေသာစံ': ['အောင်မြေသာစံ', 'aungmyaythazan'],
  'ပြည်ကြီးတံခွန်': ['ပြည်ကြီးတံခွန်', 'pyigyidagun', 'pyigyitagon'],
  'အမရပူရ': ['အမရပူရ', 'amarapura'],
  'ပါတိတ်': ['ပါတိတ်'],
  'ပုသိမ်ကြီး': ['ပုသိမ်ကြီး', 'patheingyi'],
};

/** Cities and towns outside the two big cities, each with the state or region
 *  it sits in — the whole point of the exercise is that "မော်လမြိုင်" should
 *  report Mon State without anyone typing "မွန်ပြည်နယ်". */
const CITIES: Record<string, { region: string; aliases: string[] }> = {
  'နေပြည်တော်':   { region: 'Naypyitaw',   aliases: ['နေပြည်တော်', 'naypyitaw', 'nay pyi taw', 'npt'] },
  'ပျဉ်းမနား':     { region: 'Naypyitaw',   aliases: ['ပျဉ်းမနား', 'pyinmana'] },
  'မော်လမြိုင်':    { region: 'Mon',         aliases: ['မော်လမြိုင်', 'mawlamyine', 'moulmein'] },
  'သထုံ':         { region: 'Mon',         aliases: ['သထုံ', 'thaton'] },
  'ကျိုက်ထို':      { region: 'Mon',         aliases: ['ကျိုက်ထို', 'kyaikto'] },
  'မုဒုံ':          { region: 'Mon',         aliases: ['မုဒုံ', 'mudon'] },
  'ပုသိမ်':        { region: 'Ayeyarwady',  aliases: ['ပုသိမ်', 'pathein'] },
  'ဟင်္သာတ':      { region: 'Ayeyarwady',  aliases: ['ဟင်္သာတ', 'hinthada'] },
  'မအူပင်':       { region: 'Ayeyarwady',  aliases: ['မအူပင်', 'maubin'] },
  'ဖျာပုံ':        { region: 'Ayeyarwady',  aliases: ['ဖျာပုံ', 'pyapon'] },
  'မြောင်းမြ':     { region: 'Ayeyarwady',  aliases: ['မြောင်းမြ', 'myaungmya'] },
  'လပွတ္တာ':       { region: 'Ayeyarwady',  aliases: ['လပွတ္တာ', 'labutta'] },
  'ကျိုက်လတ်':     { region: 'Ayeyarwady',  aliases: ['ကျိုက်လတ်', 'kyaiklat'] },
  'ဘိုကလေး':      { region: 'Ayeyarwady',  aliases: ['ဘိုကလေး', 'bogale'] },
  'ပဲခူး':         { region: 'Bago',        aliases: ['ပဲခူး', 'bago', 'pegu'] },
  'တောင်ငူ':      { region: 'Bago',        aliases: ['တောင်ငူ', 'taungoo', 'toungoo'] },
  'ပြည်':          { region: 'Bago',        aliases: ['ပြည်မြို့', 'pyay', 'prome'] },
  'သာယာဝတီ':    { region: 'Bago',        aliases: ['သာယာဝတီ', 'thayarwady'] },
  'ညောင်လေးပင်':  { region: 'Bago',        aliases: ['ညောင်လေးပင်', 'nyaunglebin'] },
  'တောင်ကြီး':    { region: 'Shan',        aliases: ['တောင်ကြီး', 'taunggyi'] },
  'ကလော':        { region: 'Shan',        aliases: ['ကလော', 'kalaw'] },
  'အောင်ပန်း':     { region: 'Shan',        aliases: ['အောင်ပန်း', 'aungban'] },
  'လားရှိုး':       { region: 'Shan',        aliases: ['လားရှိုး', 'lashio'] },
  'မူဆယ်':        { region: 'Shan',        aliases: ['မူဆယ်', 'muse'] },
  'ကျိုင်းတုံ':      { region: 'Shan',        aliases: ['ကျိုင်းတုံ', 'kengtung'] },
  'တာချီလိတ်':     { region: 'Shan',        aliases: ['တာချီလိတ်', 'tachileik'] },
  'ညောင်ရွှေ':      { region: 'Shan',        aliases: ['ညောင်ရွှေ', 'nyaungshwe'] },
  'သီပေါ':        { region: 'Shan',        aliases: ['သီပေါ', 'hsipaw'] },
  'မုံရွာ':          { region: 'Sagaing',     aliases: ['မုံရွာ', 'monywa'] },
  'စစ်ကိုင်း':       { region: 'Sagaing',     aliases: ['စစ်ကိုင်း', 'sagaing'] },
  'ရွှေဘို':        { region: 'Sagaing',     aliases: ['ရွှေဘို', 'shwebo'] },
  'ကလေး':        { region: 'Sagaing',     aliases: ['ကလေးမြို့', 'kalay', 'kalaymyo'] },
  'တမူး':         { region: 'Sagaing',     aliases: ['တမူး', 'tamu'] },
  'ကသာ':         { region: 'Sagaing',     aliases: ['ကသာ', 'katha'] },
  'မကွေး':        { region: 'Magway',      aliases: ['မကွေး', 'magway', 'magwe'] },
  'ပခုက္ကူ':        { region: 'Magway',      aliases: ['ပခုက္ကူ', 'pakokku'] },
  'အောင်လံ':      { region: 'Magway',      aliases: ['အောင်လံ', 'aunglan'] },
  'ချောက်':        { region: 'Magway',      aliases: ['ချောက်မြို့', 'ချောက်', 'chauk'] },
  'ရေနံချောင်း':    { region: 'Magway',      aliases: ['ရေနံချောင်း', 'yenangyaung'] },
  'ထားဝယ်':       { region: 'Tanintharyi', aliases: ['ထားဝယ်', 'dawei', 'tavoy'] },
  'မြိတ်':          { region: 'Tanintharyi', aliases: ['မြိတ်', 'myeik', 'mergui'] },
  'ကော့သောင်း':   { region: 'Tanintharyi', aliases: ['ကော့သောင်း', 'kawthaung'] },
  'ဘားအံ':        { region: 'Kayin',       aliases: ['ဘားအံ', 'hpa-an', 'hpaan', 'pa-an'] },
  'မြဝတီ':        { region: 'Kayin',       aliases: ['မြဝတီ', 'myawaddy'] },
  'ကော့ကရိတ်':    { region: 'Kayin',       aliases: ['ကော့ကရိတ်', 'kawkareik'] },
  'လွိုင်ကော်':      { region: 'Kayah',       aliases: ['လွိုင်ကော်', 'loikaw'] },
  'စစ်တွေ':        { region: 'Rakhine',     aliases: ['စစ်တွေ', 'sittwe'] },
  'ကျောက်ဖြူ':     { region: 'Rakhine',     aliases: ['ကျောက်ဖြူ', 'kyaukphyu'] },
  'သံတွဲ':         { region: 'Rakhine',     aliases: ['သံတွဲ', 'thandwe'] },
  'ငပလီ':         { region: 'Rakhine',     aliases: ['ငပလီ', 'ngapali'] },
  'ဘူးသီးတောင်':   { region: 'Rakhine',     aliases: ['ဘူးသီးတောင်', 'buthidaung'] },
  'မြစ်ကြီးနား':    { region: 'Kachin',      aliases: ['မြစ်ကြီးနား', 'myitkyina'] },
  'ဗန်းမော်':      { region: 'Kachin',      aliases: ['ဗန်းမော်', 'bhamo'] },
  'ပူတာအို':       { region: 'Kachin',      aliases: ['ပူတာအို', 'putao'] },
  'ဟားခါး':       { region: 'Chin',        aliases: ['ဟားခါး', 'hakha'] },
  'ဖလမ်း':        { region: 'Chin',        aliases: ['ဖလမ်း', 'falam'] },
  'တီးတိန်':       { region: 'Chin',        aliases: ['တီးတိန်', 'tedim'] },
  'မိတ္ထီလာ':       { region: 'Mandalay',    aliases: ['မိတ္ထီလာ', 'meiktila'] },
  'ပြင်ဦးလွင်':     { region: 'Mandalay',    aliases: ['ပြင်ဦးလွင်', 'pyinoolwin', 'pyin oo lwin', 'maymyo'] },
  'ကျောက်ဆည်':   { region: 'Mandalay',    aliases: ['ကျောက်ဆည်', 'kyaukse'] },
  'မြင်းခြံ':       { region: 'Mandalay',    aliases: ['မြင်းခြံ', 'myingyan'] },
  'ညောင်ဦး':      { region: 'Mandalay',    aliases: ['ညောင်ဦး', 'nyaung-u', 'bagan', 'ပုဂံ'] },
  'ပျော်ဘွယ်':     { region: 'Mandalay',    aliases: ['ပျော်ဘွယ်', 'pyawbwe'] },
  'ရမည်းသင်း':    { region: 'Mandalay',    aliases: ['ရမည်းသင်း', 'yamethin'] },
  'မလှိုင်':        { region: 'Mandalay',    aliases: ['မလှိုင်', 'madaya'] },
};

const CITY_WORDS = [
  { region: 'Yangon', words: ['ရန်ကုန်', 'yangon', 'ygn', 'rangoon'] },
  { region: 'Mandalay', words: ['မန္တလေး', 'မန္တလေး', 'mandalay', 'mdy'] },
];

/** Strip the decorations that make two identical addresses look different. */
function normalise(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[၊။,./\-_()\[\]]/g, ' ')
    .replace(/မြို့နယ်|မြို့|တိုက်နယ်/g, (m) => ` ${m} `)
    .replace(/\s+/g, ' ')
    .trim();
}

function findIn(hay: string, table: Record<string, string[]>): string {
  // Longest alias first so "မြောက်ဥက္ကလာပ" is not swallowed by "ဥက္ကလာပ".
  const pairs = Object.entries(table)
    .flatMap(([canon, aliases]) => aliases.map((a) => [canon, a.toLowerCase()] as const))
    .sort((a, b) => b[1].length - a[1].length);
  // Second pass with every space removed catches the forms that punctuation
  // split apart — "ဒဂုံမြို့သစ်(မြောက်)" against the alias written solid.
  const tight = hay.replace(/\s+/g, '');
  for (const [canon, alias] of pairs) {
    if (hay.includes(alias) || tight.includes(alias.replace(/\s+/g, ''))) return canon;
  }
  return '';
}

function out(region: string, city: string, township: string): CleanAddress {
  return {
    region,
    regionMm: REGION_MM[region] ?? '',
    city,
    township,
    matched: true,
  };
}

export function cleanAddress(raw: string | null | undefined): CleanAddress {
  const text = normalise(raw ?? '');
  if (!text) return { region: '', regionMm: '', city: '', township: '', matched: false };

  // A township is the stronger signal: an address that says "တာမွေ" is in
  // Yangon whether or not the word "ရန်ကုန်" appears anywhere in it.
  const yangon = findIn(text, YANGON);
  if (yangon) return out('Yangon', 'ရန်ကုန်', yangon);

  const mandalay = findIn(text, MANDALAY);
  if (mandalay) return out('Mandalay', 'မန္တလေး', mandalay);

  const city = findIn(text, Object.fromEntries(
    Object.entries(CITIES).map(([k, v]) => [k, v.aliases])
  ));
  if (city) return out(CITIES[city].region, city, '');

  for (const { region, words } of CITY_WORDS) {
    if (words.some((w) => text.includes(w))) return out(region, '', '');
  }

  // Last resort: the address named only the state or region itself
  // ("ရှမ်းပြည်နယ်", "ဧရာဝတီတိုင်း", "Mon State").
  const tight = text.replace(/\s+/g, '');
  for (const [en, mm] of Object.entries(REGION_MM)) {
    const stem = mm.replace(/တိုင်းဒေသကြီး|ပြည်နယ်/, '');
    if (tight.includes(mm.replace(/\s+/g, '')) || tight.includes(stem)
        || text.includes(en.toLowerCase())) {
      return out(en, '', '');
    }
  }

  return { region: '', regionMm: '', city: '', township: '', matched: false };
}
