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
