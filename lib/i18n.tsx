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
    'footer.prices': 'All prices in USD',

    // ── Corner Map (ជ្រុង) — docs/corner-map-spec.md ──────────────────────
    'corner.title': 'Corner',
    'corner.tagline': 'What this place looks like right now.',
    'corner.search': 'Search corners',
    'corner.searchPlaceholder': 'Café, temple, market…',
    'corner.back': 'Back',
    'corner.close': 'Close',
    'corner.myMap': 'My map',
    'corner.locating': 'Finding your corner…',
    'corner.locationDenied': 'Location is off, so this is Phnom Penh for now.',
    // Filters (§5.1)
    'corner.filter.live': 'Live now',
    'corner.filter.food': 'Food',
    'corner.filter.coffee': 'Coffee',
    'corner.filter.temples': 'Temples',
    'corner.filter.openLate': 'Open late',
    'corner.filter.clear': 'Clear filters',
    // Freshness (§2)
    'corner.live': 'LIVE',
    'corner.minAgo': '{n} MIN AGO',
    'corner.hoursAgo': '{n} h ago',
    'corner.daysAgo': '{n} d ago',
    'corner.justNow': 'JUST NOW',
    'corner.lastSeen': 'Last seen {when}',
    'corner.noShotsYet': 'No shots yet',
    // Sheet (§5.2)
    'corner.nearYou': 'NEAR YOU',
    'corner.liveCount': '{n} LIVE',
    'corner.cornerCount': '{n} corners',
    'corner.save': 'Save to my map',
    'corner.saved': 'Saved',
    'corner.unsave': 'Remove from my map',
    'corner.directions': 'Directions',
    'corner.shotCount': '{n} shots',
    'corner.expand': 'Expand',
    'corner.collapse': 'Collapse',
    // Report (§5.2, §7)
    'corner.report': 'Report',
    'corner.report.title': 'Why report this shot?',
    'corner.report.person': 'Shows a person',
    'corner.report.unsafe': 'Unsafe or harmful',
    'corner.report.spam': 'Spam',
    'corner.report.wrongPlace': 'Wrong place',
    'corner.report.other': 'Something else',
    'corner.report.done': 'Reported. Thank you.',
    'corner.report.cancel': 'Cancel',
    // Capture (§5.3)
    'corner.capture': 'Capture',
    'corner.capture.choose': 'Take or choose a photo',
    'corner.capture.retake': 'Choose another',
    'corner.capture.venue': 'Which place is this?',
    'corner.capture.venueHint': 'Shots attach to a place, never to your exact location.',
    'corner.capture.venueRequired': 'Pick a corner before posting.',
    'corner.capture.venueSearch': 'Search for a place',
    'corner.capture.noVenues': 'No corners nearby. Try searching.',
    'corner.capture.caption': 'Caption',
    'corner.capture.captionOptional': 'Optional, 140 characters',
    'corner.capture.post': 'Post to this corner',
    'corner.capture.posting': 'Posting…',
    'corner.capture.failed': 'That did not post. Try again.',
    'corner.capture.held': 'Corner Map is for places. Try a shot of the spot itself.',
    'corner.capture.minor': 'Posting opens at 18. You can still explore every corner.',
    'corner.capture.signIn': 'Sign in to post a shot.',
    'corner.capture.exifNote': 'Location and camera data are stripped before your photo is stored.',
    // Empty states (§5.1, §5.4)
    'corner.empty.title': 'No shots near you yet.',
    'corner.empty.cta': 'Be the first corner.',
    'corner.myMap.empty': 'Nothing saved yet.',
    'corner.myMap.emptyCta': 'Corners you save land here.',
    'corner.myMap.yourShots': 'Your shots',
    'corner.myMap.savedCorners': 'Saved corners',
    'corner.view.map': 'Map',
    'corner.view.grid': 'Grid',
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
    'footer.prices': 'គ្រប់តម្លៃជាដុល្លារអាមេរិក',

    // ── Corner Map (ជ្រុង) ────────────────────────────────────────────────
    // Khmer runs 15–25% longer than English — every label that uses these is
    // laid out to flex, never to a fixed width (§8).
    'corner.title': 'ជ្រុង',
    'corner.tagline': 'មើលថាកន្លែងនេះមានលក្ខណៈយ៉ាងណានៅពេលនេះ។',
    'corner.search': 'ស្វែងរកជ្រុង',
    'corner.searchPlaceholder': 'ហាងកាហ្វេ វត្ត ផ្សារ…',
    'corner.back': 'ត្រឡប់ក្រោយ',
    'corner.close': 'បិទ',
    'corner.myMap': 'ផែនទីរបស់ខ្ញុំ',
    'corner.locating': 'កំពុងស្វែងរកទីតាំងរបស់អ្នក…',
    'corner.locationDenied': 'ទីតាំងត្រូវបានបិទ ដូច្នេះបង្ហាញភ្នំពេញជាមុនសិន។',
    // Filters (§5.1)
    'corner.filter.live': 'កំពុងផ្សាយ',
    'corner.filter.food': 'អាហារ',
    'corner.filter.coffee': 'កាហ្វេ',
    'corner.filter.temples': 'វត្តអារាម',
    'corner.filter.openLate': 'បើកយប់',
    'corner.filter.clear': 'សម្អាតតម្រង',
    // Freshness (§2)
    'corner.live': 'ថ្មីៗ',
    'corner.minAgo': '{n} នាទីមុន',
    'corner.hoursAgo': '{n} ម៉ោងមុន',
    'corner.daysAgo': '{n} ថ្ងៃមុន',
    'corner.justNow': 'អម្បាញ់មិញ',
    'corner.lastSeen': 'ឃើញចុងក្រោយ {when}',
    'corner.noShotsYet': 'មិនទាន់មានរូបភាព',
    // Sheet (§5.2)
    'corner.nearYou': 'នៅជិតអ្នក',
    'corner.liveCount': 'ថ្មីៗ {n}',
    'corner.cornerCount': 'ជ្រុង {n}',
    'corner.save': 'រក្សាទុកក្នុងផែនទីរបស់ខ្ញុំ',
    'corner.saved': 'បានរក្សាទុក',
    'corner.unsave': 'ដកចេញពីផែនទីរបស់ខ្ញុំ',
    'corner.directions': 'ទិសដៅ',
    'corner.shotCount': 'រូបភាព {n}',
    'corner.expand': 'ពង្រីក',
    'corner.collapse': 'បង្រួម',
    // Report (§5.2, §7)
    'corner.report': 'រាយការណ៍',
    'corner.report.title': 'ហេតុអ្វីរាយការណ៍រូបភាពនេះ?',
    'corner.report.person': 'មានមនុស្សនៅក្នុងរូប',
    'corner.report.unsafe': 'គ្រោះថ្នាក់ ឬបង្កគ្រោះថ្នាក់',
    'corner.report.spam': 'សារឥតបានការ',
    'corner.report.wrongPlace': 'ខុសទីកន្លែង',
    'corner.report.other': 'មូលហេតុផ្សេងទៀត',
    'corner.report.done': 'បានរាយការណ៍។ សូមអរគុណ។',
    'corner.report.cancel': 'បោះបង់',
    // Capture (§5.3)
    'corner.capture': 'ថតរូប',
    'corner.capture.choose': 'ថត ឬជ្រើសរើសរូបភាព',
    'corner.capture.retake': 'ជ្រើសរើសរូបផ្សេង',
    'corner.capture.venue': 'តើនេះជាកន្លែងណា?',
    'corner.capture.venueHint': 'រូបភាពភ្ជាប់ទៅទីកន្លែង មិនមែនទីតាំងពិតប្រាកដរបស់អ្នកឡើយ។',
    'corner.capture.venueRequired': 'សូមជ្រើសរើសជ្រុងមុននឹងបង្ហោះ។',
    'corner.capture.venueSearch': 'ស្វែងរកទីកន្លែង',
    'corner.capture.noVenues': 'គ្មានជ្រុងនៅជិតទេ។ សូមសាកល្បងស្វែងរក។',
    'corner.capture.caption': 'អត្ថបទពិពណ៌នា',
    'corner.capture.captionOptional': 'ស្រេចចិត្ត ១៤០ តួអក្សរ',
    'corner.capture.post': 'បង្ហោះទៅជ្រុងនេះ',
    'corner.capture.posting': 'កំពុងបង្ហោះ…',
    'corner.capture.failed': 'បង្ហោះមិនបានសម្រេច។ សូមព្យាយាមម្តងទៀត។',
    'corner.capture.held': 'ជ្រុងគឺសម្រាប់ទីកន្លែង។ សូមសាកល្បងថតរូបកន្លែងនោះផ្ទាល់។',
    'corner.capture.minor': 'ការបង្ហោះចាប់ផ្តើមពីអាយុ ១៨ ឆ្នាំ។ អ្នកនៅតែអាចរុករកគ្រប់ជ្រុងបាន។',
    'corner.capture.signIn': 'សូមចូលគណនីដើម្បីបង្ហោះរូបភាព។',
    'corner.capture.exifNote': 'ទិន្នន័យទីតាំង និងកាមេរ៉ាត្រូវបានលុបចេញ មុនពេលរក្សាទុករូបភាពរបស់អ្នក។',
    // Empty states (§5.1, §5.4)
    'corner.empty.title': 'មិនទាន់មានរូបភាពនៅជិតអ្នកទេ។',
    'corner.empty.cta': 'ក្លាយជាជ្រុងដំបូងទៅ។',
    'corner.myMap.empty': 'មិនទាន់មានអ្វីរក្សាទុកទេ។',
    'corner.myMap.emptyCta': 'ជ្រុងដែលអ្នករក្សាទុកនឹងមកនៅទីនេះ។',
    'corner.myMap.yourShots': 'រូបភាពរបស់អ្នក',
    'corner.myMap.savedCorners': 'ជ្រុងដែលបានរក្សាទុក',
    'corner.view.map': 'ផែនទី',
    'corner.view.grid': 'ក្រឡាចត្រង្គ',
  },
} as const;

export type DictKey = keyof typeof dicts.en;

/** Values substituted into `{placeholder}` tokens, e.g. t('corner.liveCount', { n: 3 }). */
export type TVars = Record<string, string | number>;

interface LangContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: DictKey, vars?: TVars) => string;
}

function interpolate(template: string, vars?: TVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match
  );
}

const LangContext = createContext<LangContextValue>({
  lang: 'en',
  setLang: () => undefined,
  t: (key, vars) => interpolate(dicts.en[key], vars),
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en');

  // Restore saved choice after mount (avoids SSR hydration mismatch).
  useEffect(() => {
    const saved = localStorage.getItem('domner-lang');
    if (saved === 'km' || saved === 'en') setLangState(saved);
  }, []);

  // Reflect the language on <html> and switch body font for Khmer.
  useEffect(() => {
    document.documentElement.lang = lang;
    document.body.classList.toggle('lang-km', lang === 'km');
  }, [lang]);

  const setLang = (l: Lang) => {
    setLangState(l);
    localStorage.setItem('domner-lang', l);
  };

  const t = (key: DictKey, vars?: TVars) => interpolate(dicts[lang][key] ?? dicts.en[key], vars);

  return <LangContext.Provider value={{ lang, setLang, t }}>{children}</LangContext.Provider>;
}

export function useLang(): LangContextValue {
  return useContext(LangContext);
}
