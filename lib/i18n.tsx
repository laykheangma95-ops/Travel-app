'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Lang = 'en' | 'km';

// UI dictionary. English is the source of truth; Khmer mirrors every key.
const dicts = {
  en: {
    // Brand
    'brand.word': 'Domner',
    'brand.kicker': 'TRAVEL',
    // Navbar
    'nav.esim': 'eSIM',
    'nav.buyEsim': 'Buy eSIM',
    'nav.destinations': 'Destinations',
    'nav.myEsims': 'My eSIMs',
    'nav.flights': 'Flights',
    'nav.flightTracker': 'Flight Tracker',
    'nav.airportBoard': 'Airport Live Board',
    'nav.savedFlights': 'Saved Flights',
    'nav.tools': 'Travel Tools',
    'nav.checklist': 'Am I Ready? Checklist',
    'nav.airportGuide': 'Airport Guide',
    'nav.emergency': 'Emergency Phrases',
    'nav.support': 'Support',
    'nav.signIn': 'Sign In',
    'nav.getStarted': 'Get Started',
    // Hero
    'hero.badge': "Cambodia's First Travel Super App 🇰🇭",
    'hero.t1': 'Travel',
    'hero.t2': ' Confidently',
    'hero.t3': 'Stay Connected.',
    'hero.sub':
      'eSIM for 150+ countries. Real-time flight alerts. Step-by-step airport guidance. All in Khmer.',
    'hero.ctaEsim': 'Get Your eSIM',
    'hero.ctaFlight': 'Track My Flight',
    'hero.stat1': '150+ Countries',
    'hero.stat2': '24/7 Khmer Support',
    'hero.stat3': 'Instant Delivery',
    // Home — first screen (globe + greeting + search, nothing else)
    'home.greet.morning': 'Good Morning',
    'home.greet.afternoon': 'Good Afternoon',
    'home.greet.evening': 'Good Evening',
    'home.ask': 'Where are you travelling next?',
    'home.sub': 'The smarter way to explore the world.',
    'home.search.placeholder': 'Search country, city or destination…',
    'home.search.label': 'Search for a destination',
    'home.search.none': 'No destination matches that yet.',
    'home.search.hint': 'Or begin with',
    'home.search.clear': 'Clear search',
    'home.back': 'Back to the globe',
    'home.scrollCue': 'Scroll to explore',
    'home.flyingTo': 'Flying to',
    // Home — destination journey chapters
    'j.ch1': 'Arrival',
    'j.now': 'Right now in',
    'j.localTime': 'Local time',
    'j.weather': 'Weather',
    'j.seasonal': 'Typical for the season',
    'j.liveNow': 'Live',
    'j.ch2': 'The essentials',
    'j.ch2title': 'What you need to know first',
    'j.currency': 'Currency',
    'j.language': 'Language',
    'j.adapter': 'Power',
    'j.internet': 'Internet',
    'j.perUsd': 'per US$1',
    'j.ch3': 'Arrive prepared',
    'j.ch3title': 'Everything answered before you land',
    'j.entry': 'Entry requirements',
    'j.entryNote':
      'Guidance for a Cambodian passport. Rules change — always confirm with the embassy before you fly.',
    'j.safety': 'Safety',
    'j.emergency': 'Emergency numbers',
    'j.watch': 'Watch out for',
    'j.tips': 'Good to know',
    'j.ch4': 'Getting around',
    'j.ch4title': 'How people actually move here',
    'j.transport': 'Transport',
    'j.apps': 'Apps worth installing',
    'j.payments': 'Paying for things',
    'j.localTip': 'Local wisdom',
    'j.ch5': 'Inspiration',
    'j.ch5title': 'What you will remember',
    'j.trending': 'Trending now',
    'j.gems': 'Hidden gems',
    'j.alert': 'Travel alert',
    'j.ch6': 'One last thing',
    'j.ch6title': 'Stay connected the moment you land',
    'j.esimWhy':
      'You know the time, the money, the rules and the road. The only thing left is a phone that already works when the wheels touch down — no queue, no kiosk, no roaming bill.',
    'j.esimFrom': 'From',
    'j.esimPerDay': 'per day',
    'j.esimCta': 'See plans',
    'j.esimTrack': 'Track a flight there',
    'j.explore': 'Explore somewhere else',
    'j.networks': 'Runs on',
    // Features
    'features.eyebrow': 'Why Domer',
    'features.title': 'Everything a Cambodian traveler needs',
    'features.desc': 'Three tools that work together, from booking to landing.',
    'features.learnMore': 'Learn more',
    'feature1.name': 'eSIM in 3 Minutes',
    'feature1.desc': 'Buy, install, connect. No physical SIM needed.',
    'feature2.name': 'Flight Guardian',
    'feature2.desc': 'Real-time alerts before the airline tells you.',
    'feature3.name': 'Airport Companion',
    'feature3.desc': 'Step-by-step guide in Khmer at every stage.',
    // How it works
    'how.eyebrow': 'How it works',
    'how.title': 'From your sofa to your destination',
    'how.step1': "Tell us where you're going",
    'how.step2': 'Get your eSIM + flight setup',
    'how.step3': 'We guide you at the airport',
    'how.step4': 'Arrive safely and confidently',
    // Destinations
    'dest.eyebrow': 'Popular destinations',
    'dest.title': 'Where are you flying next?',
    'dest.desc': 'Instant eSIM delivery for the routes Cambodians travel most.',
    'dest.viewAll': 'View all destinations',
    'dest.from': 'From',
    'dest.viewPlans': 'View Plans',
    // Testimonials
    'testi.eyebrow': 'Travelers trust Domer',
    'testi.title': 'Stories from the road',
    // CTA
    'cta.title': 'Ready for your next trip?',
    'cta.sub': 'Join thousands of Cambodian travelers who fly with confidence.',
    'cta.checklist': 'Am I Ready? Checklist',
    // Footer
    'footer.tagline': "Cambodia's first travel super app. Travel confidently — stay connected, in Khmer.",
    'footer.esim': 'eSIM',
    'footer.destinations': 'Destinations',
    'footer.how': 'How it works',
    'footer.install': 'Install guide',
    'footer.faq': 'FAQ',
    'footer.tools': 'Travel Tools',
    'footer.tracker': 'Flight Tracker',
    'footer.checklist': 'Am I Ready? Checklist',
    'footer.guide': 'Airport Guide',
    'footer.phrases': 'Emergency Phrases',
    'footer.support': 'Support',
    'footer.khmerSupport': '24/7 Khmer Support',
    'footer.contact': 'Contact',
    'footer.affiliate': 'Affiliate Program',
    'footer.about': 'About',
    'footer.privacy': 'Privacy Policy',
    'footer.terms': 'Terms',
    'footer.refunds': 'Refunds',
    'footer.prices': 'All prices in USD',
  },
  km: {
    // Brand
    'brand.word': 'ដំណើរ',
    'brand.kicker': 'DOMNER',
    // Navbar
    'nav.esim': 'eSIM',
    'nav.buyEsim': 'ទិញ eSIM',
    'nav.destinations': 'គោលដៅ',
    'nav.myEsims': 'eSIM របស់ខ្ញុំ',
    'nav.flights': 'ជើងហោះហើរ',
    'nav.flightTracker': 'តាមដានជើងហោះហើរ',
    'nav.airportBoard': 'ផ្ទាំងព័ត៌មានអាកាសយានដ្ឋាន',
    'nav.savedFlights': 'ជើងហោះហើរបានរក្សាទុក',
    'nav.tools': 'ឧបករណ៍ធ្វើដំណើរ',
    'nav.checklist': 'បញ្ជីត្រៀមធ្វើដំណើរ',
    'nav.airportGuide': 'មគ្គុទ្ទេសក៍អាកាសយានដ្ឋាន',
    'nav.emergency': 'ឃ្លាបន្ទាន់',
    'nav.support': 'ជំនួយ',
    'nav.signIn': 'ចូលគណនី',
    'nav.getStarted': 'ចាប់ផ្តើម',
    // Hero
    'hero.badge': 'កម្មវិធីធ្វើដំណើរដំបូងគេរបស់កម្ពុជា 🇰🇭',
    'hero.t1': 'ធ្វើដំណើរ',
    'hero.t2': 'ដោយទំនុកចិត្ត',
    'hero.t3': 'រក្សាការតភ្ជាប់ជានិច្ច។',
    'hero.sub':
      'eSIM សម្រាប់ជាង 150 ប្រទេស។ ការជូនដំណឹងជើងហោះហើរភ្លាមៗ។ ការណែនាំនៅអាកាសយានដ្ឋានជាជំហានៗ។ ទាំងអស់ជាភាសាខ្មែរ។',
    'hero.ctaEsim': 'ទិញ eSIM របស់អ្នក',
    'hero.ctaFlight': 'តាមដានជើងហោះហើរ',
    'hero.stat1': '150+ ប្រទេស',
    'hero.stat2': 'ជំនួយភាសាខ្មែរ 24/7',
    'hero.stat3': 'ដឹកជញ្ជូនភ្លាមៗ',
    // Home — first screen (globe + greeting + search, nothing else)
    'home.greet.morning': 'អរុណសួស្តី',
    'home.greet.afternoon': 'ទិវាសួស្តី',
    'home.greet.evening': 'សាយ័ណ្ហសួស្តី',
    'home.ask': 'តើអ្នកនឹងធ្វើដំណើរទៅណាបន្ទាប់?',
    'home.sub': 'មធ្យោបាយឆ្លាតវៃជាងក្នុងការស្វែងយល់ពិភពលោក។',
    'home.search.placeholder': 'ស្វែងរកប្រទេស ទីក្រុង ឬគោលដៅ…',
    'home.search.label': 'ស្វែងរកគោលដៅ',
    'home.search.none': 'មិនទាន់មានគោលដៅត្រូវនឹងពាក្យនេះទេ។',
    'home.search.hint': 'ឬចាប់ផ្តើមជាមួយ',
    'home.search.clear': 'សម្អាតការស្វែងរក',
    'home.back': 'ត្រឡប់ទៅផែនដីវិញ',
    'home.scrollCue': 'រំកិលចុះដើម្បីស្វែងយល់',
    'home.flyingTo': 'កំពុងហោះទៅ',
    // Home — destination journey chapters
    'j.ch1': 'ការមកដល់',
    'j.now': 'ឥឡូវនេះនៅ',
    'j.localTime': 'ម៉ោងក្នុងតំបន់',
    'j.weather': 'អាកាសធាតុ',
    'j.seasonal': 'ធម្មតាសម្រាប់រដូវនេះ',
    'j.liveNow': 'ផ្ទាល់',
    'j.ch2': 'ចំណេះដឹងសំខាន់',
    'j.ch2title': 'អ្វីដែលអ្នកត្រូវដឹងមុនគេ',
    'j.currency': 'រូបិយប័ណ្ណ',
    'j.language': 'ភាសា',
    'j.adapter': 'ចរន្តអគ្គិសនី',
    'j.internet': 'អ៊ីនធឺណិត',
    'j.perUsd': 'ក្នុង ១ ដុល្លារ',
    'j.ch3': 'ត្រៀមខ្លួនមុនទៅដល់',
    'j.ch3title': 'ចម្លើយគ្រប់យ៉ាង មុនពេលអ្នកចុះចត',
    'j.entry': 'លក្ខខណ្ឌចូលប្រទេស',
    'j.entryNote':
      'ព័ត៌មានសម្រាប់លិខិតឆ្លងដែនកម្ពុជា។ ច្បាប់អាចផ្លាស់ប្តូរ — សូមផ្ទៀងផ្ទាត់ជាមួយស្ថានទូតជានិច្ចមុនពេលហោះហើរ។',
    'j.safety': 'សុវត្ថិភាព',
    'j.emergency': 'លេខទូរស័ព្ទបន្ទាន់',
    'j.watch': 'ប្រយ័ត្នចំពោះ',
    'j.tips': 'គួរដឹង',
    'j.ch4': 'ការធ្វើដំណើរក្នុងស្រុក',
    'j.ch4title': 'របៀបដែលអ្នកស្រុកធ្វើដំណើរពិតប្រាកដ',
    'j.transport': 'មធ្យោបាយធ្វើដំណើរ',
    'j.apps': 'កម្មវិធីគួរដំឡើង',
    'j.payments': 'ការទូទាត់ប្រាក់',
    'j.localTip': 'ប្រាជ្ញាអ្នកស្រុក',
    'j.ch5': 'ការបំផុសគំនិត',
    'j.ch5title': 'អ្វីដែលអ្នកនឹងចងចាំ',
    'j.trending': 'កំពុងពេញនិយម',
    'j.gems': 'ទីកន្លែងសម្ងាត់',
    'j.alert': 'ការជូនដំណឹងធ្វើដំណើរ',
    'j.ch6': 'រឿងចុងក្រោយមួយ',
    'j.ch6title': 'នៅតភ្ជាប់ភ្លាមៗ ពេលអ្នកចុះចត',
    'j.esimWhy':
      'អ្នកដឹងម៉ោង ដឹងលុយ ដឹងច្បាប់ និងដឹងផ្លូវហើយ។ នៅសល់តែទូរស័ព្ទដែលដំណើរការភ្លាមៗពេលកង់យន្តហោះប៉ះដី — គ្មានជួរ គ្មានតូប គ្មានវិក្កយបត្រ roaming។',
    'j.esimFrom': 'ចាប់ពី',
    'j.esimPerDay': 'ក្នុងមួយថ្ងៃ',
    'j.esimCta': 'មើលគម្រោង',
    'j.esimTrack': 'តាមដានជើងហោះហើរទៅទីនោះ',
    'j.explore': 'ស្វែងរកគោលដៅផ្សេងទៀត',
    'j.networks': 'ដំណើរការលើ',
    // Features
    'features.eyebrow': 'ហេតុអ្វីជ្រើសរើស Domer',
    'features.title': 'អ្វីៗគ្រប់យ៉ាងដែលអ្នកដំណើរខ្មែរត្រូវការ',
    'features.desc': 'ឧបករណ៍បីដែលធ្វើការជាមួយគ្នា ពីការកក់រហូតដល់ការចុះចត។',
    'features.learnMore': 'ស្វែងយល់បន្ថែម',
    'feature1.name': 'eSIM ក្នុងរយៈពេល 3 នាទី',
    'feature1.desc': 'ទិញ ដំឡើង ភ្ជាប់ — មិនត្រូវការស៊ីមកាតទេ។',
    'feature2.name': 'អ្នកការពារជើងហោះហើរ',
    'feature2.desc': 'ការជូនដំណឹងភ្លាមៗ មុនក្រុមហ៊ុនអាកាសចរណ៍ប្រាប់អ្នក។',
    'feature3.name': 'ដៃគូអាកាសយានដ្ឋាន',
    'feature3.desc': 'ការណែនាំជាជំហានៗជាភាសាខ្មែរ គ្រប់ដំណាក់កាល។',
    // How it works
    'how.eyebrow': 'របៀបដំណើរការ',
    'how.title': 'ពីផ្ទះអ្នក ទៅដល់គោលដៅ',
    'how.step1': 'ប្រាប់យើងថាអ្នកទៅណា',
    'how.step2': 'ទទួល eSIM និងការរៀបចំជើងហោះហើរ',
    'how.step3': 'យើងណែនាំអ្នកនៅអាកាសយានដ្ឋាន',
    'how.step4': 'ទៅដល់ដោយសុវត្ថិភាព និងទំនុកចិត្ត',
    // Destinations
    'dest.eyebrow': 'គោលដៅពេញនិយម',
    'dest.title': 'តើអ្នកហោះទៅណាបន្ទាប់?',
    'dest.desc': 'eSIM ដឹកជញ្ជូនភ្លាមៗ សម្រាប់ផ្លូវដែលប្រជាជនខ្មែរធ្វើដំណើរច្រើនបំផុត។',
    'dest.viewAll': 'មើលគោលដៅទាំងអស់',
    'dest.from': 'ចាប់ពី',
    'dest.viewPlans': 'មើលគម្រោង',
    // Testimonials
    'testi.eyebrow': 'អ្នកដំណើរទុកចិត្ត Domer',
    'testi.title': 'រឿងរ៉ាវពីដំណើរ',
    // CTA
    'cta.title': 'ត្រៀមខ្លួនសម្រាប់ដំណើរបន្ទាប់ហើយឬនៅ?',
    'cta.sub': 'ចូលរួមជាមួយអ្នកដំណើរខ្មែររាប់ពាន់នាក់ ដែលហោះហើរដោយទំនុកចិត្ត។',
    'cta.checklist': 'បញ្ជីត្រៀមធ្វើដំណើរ',
    // Footer
    'footer.tagline': 'កម្មវិធីធ្វើដំណើរដំបូងគេរបស់កម្ពុជា។ ធ្វើដំណើរដោយទំនុកចិត្ត — ជាភាសាខ្មែរ។',
    'footer.esim': 'eSIM',
    'footer.destinations': 'គោលដៅ',
    'footer.how': 'របៀបដំណើរការ',
    'footer.install': 'របៀបដំឡើង',
    'footer.faq': 'សំណួរញឹកញាប់',
    'footer.tools': 'ឧបករណ៍ធ្វើដំណើរ',
    'footer.tracker': 'តាមដានជើងហោះហើរ',
    'footer.checklist': 'បញ្ជីត្រៀមធ្វើដំណើរ',
    'footer.guide': 'មគ្គុទ្ទេសក៍អាកាសយានដ្ឋាន',
    'footer.phrases': 'ឃ្លាបន្ទាន់',
    'footer.support': 'ជំនួយ',
    'footer.khmerSupport': 'ជំនួយភាសាខ្មែរ 24/7',
    'footer.contact': 'ទំនាក់ទំនង',
    'footer.affiliate': 'កម្មវិធីសម្ព័ន្ធ',
    'footer.about': 'អំពីយើង',
    'footer.privacy': 'គោលការណ៍ឯកជនភាព',
    'footer.terms': 'លក្ខខណ្ឌ',
    'footer.refunds': 'ការសងប្រាក់វិញ',
    'footer.prices': 'គ្រប់តម្លៃជាដុល្លារអាមេរិក',
  },
} as const;

export type DictKey = keyof typeof dicts.en;

interface LangContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: DictKey) => string;
}

const LangContext = createContext<LangContextValue>({
  lang: 'en',
  setLang: () => undefined,
  t: (key) => dicts.en[key],
});

/** Shared with the server layout, which reads this cookie to set <html lang>. */
export const LANG_COOKIE = 'domner-lang';

function persistLang(lang: Lang): void {
  try {
    localStorage.setItem(LANG_COOKIE, lang);
  } catch {
    // Private browsing can refuse localStorage; the cookie below still works.
  }
  // A cookie (not just localStorage) so the SERVER knows the language too and
  // can render <html lang="km"> in the initial HTML. Search engines and screen
  // readers only ever see that first response — a value applied later by an
  // effect is invisible to them.
  document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=31536000; samesite=lax`;
}

export function LanguageProvider({
  children,
  initialLang = 'en',
}: {
  children: ReactNode;
  /** Read from the cookie during SSR so the first paint is already correct. */
  initialLang?: Lang;
}) {
  const [lang, setLangState] = useState<Lang>(initialLang);

  // Reconcile with a stored preference set before cookies existed, and keep
  // the cookie fresh so its expiry rolls forward on every visit.
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(LANG_COOKIE);
    } catch {
      saved = null;
    }
    const next = saved === 'km' || saved === 'en' ? saved : initialLang;
    setLangState(next);
    persistLang(next);
  }, [initialLang]);

  // Reflect the language on <html> and switch body font for Khmer.
  useEffect(() => {
    document.documentElement.lang = lang;
    document.body.classList.toggle('lang-km', lang === 'km');
  }, [lang]);

  const setLang = (l: Lang) => {
    setLangState(l);
    persistLang(l);
  };

  const t = (key: DictKey) => dicts[lang][key] ?? dicts.en[key];

  return <LangContext.Provider value={{ lang, setLang, t }}>{children}</LangContext.Provider>;
}

export function useLang(): LangContextValue {
  return useContext(LangContext);
}
