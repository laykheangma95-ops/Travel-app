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
    // Explore lost its bottom-nav tab to the store. These are the links that
    // keep the editorial layer reachable — see BottomNavigation.tsx.
    'nav.explore': 'Explore destinations',
    'nav.exploreHint': 'Guides, visas and real prices',
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
    'nav.account': 'Account',
    'nav.dashboard': 'Dashboard',
    'nav.settings': 'Settings',
    'nav.adminPanel': 'Admin Panel',
    'nav.signOut': 'Sign Out',
    'nav.signedInAs': 'Signed in as',
    // Sign-in and sign-up failures. Each one names what the traveller should do
    // next — an error they cannot act on is the same as no error at all.
    'auth.error.providerUnavailable':
      'This sign-in method is not available yet. Please use your email address instead.',
    'auth.error.phoneUnavailable':
      'Phone sign-in is not available yet. Please use your email address — it works even with no mobile signal.',
    'auth.error.badCredentials': 'That email or password is not right. Please check and try again.',
    'auth.error.emailNotConfirmed':
      'Please confirm your email first. Check your inbox for the message we sent you.',
    'auth.error.codeExpired': 'That code has expired. Ask for a new one and try again.',
    'auth.error.codeInvalid': 'That code is not correct. Please check it and try again.',
    'auth.error.tooMany': 'Too many attempts. Please wait a few minutes and try again.',
    'auth.error.emailTaken':
      'An account already exists with this email. Try signing in instead.',
    // Hero
    'hero.badge': "Cambodia's First Travel Super App 🇰🇭",
    'hero.t1': 'Travel',
    'hero.t2': ' Confidently',
    'hero.t3': 'Stay Connected.',
    'hero.sub':
      'eSIM for the routes Cambodians fly. Real-time flight alerts. Step-by-step airport guidance. All in Khmer.',
    'hero.ctaEsim': 'Get Your eSIM',
    'hero.ctaFlight': 'Track My Flight',
    'hero.stat1': 'Khmer-first guidance',
    'hero.stat2': '24/7 Khmer Support',
    'hero.stat3': 'Instant Delivery',
    // Features
    'features.eyebrow': 'Why Domner',
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
    'testi.eyebrow': 'Travelers trust Domner',
    'testi.title': 'Stories from the road',
    // CTA
    'cta.title': 'Ready for your next trip?',
    'cta.sub': 'Everything you need before you fly, in Khmer.',
    'cta.checklist': 'Am I Ready? Checklist',
    // Footer
    'footer.tagline': "Cambodia's first travel super app. Travel confidently — stay connected, in Khmer.",
    'footer.esim': 'eSIM',
    'footer.destinations': 'Destinations',
    'footer.explore': 'Explore destinations',
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

    // ── Homepage v3 — the journey ──
    'v3.greet.morning': 'Good morning',
    'v3.greet.afternoon': 'Good afternoon',
    'v3.greet.evening': 'Good evening',
    'v3.greet.night': 'Still awake',
    'v3.title': 'Where are you traveling next?',
    'v3.sub': 'Every journey begins with a name.',
    'v3.searchPlaceholder': 'Search country, city or destination…',
    'v3.searchLabel': 'Search for a destination',
    'v3.suggestions': 'Destination suggestions',
    'v3.continue': 'continue',
    'v3.clear': 'Clear search',
    'v3.explore': 'Or press a lit city on the globe.',
    'v3.soundOn': 'Sound on',
    'v3.soundOff': 'Sound off',
    'v3.back': 'Back to the globe',
    'v3.direct': 'direct from Phnom Penh',
    'v3.oneStop': 'one stop from Phnom Penh',
    'v3.guideReady': 'Full guide',
    'v3.guideSoon': 'Guide coming soon',
    // The homepage search sells plans, so every row is priced.
    'v3.esimFrom': 'eSIM from',
    'v3.esimExpress': 'eSIM · buy now',
    'v3.noResults': 'Nothing matched that.',
    'v3.noGuideTitle': "We haven't written this guide yet.",
    'v3.noGuideBody':
      "We write each destination properly or not at all, and this one isn't ready. If we sell an eSIM for it, you can still get connected today.",
    'v3.noGuideCta': 'See eSIM plans',
    // Chapters
    'v3.ch1.eyebrow': 'Arrival',
    'v3.ch2.eyebrow': 'The basics',
    'v3.ch2.title': 'What money, power and signal look like',
    'v3.ch3.eyebrow': 'Getting in',
    'v3.ch3.title': 'With a Cambodian passport',
    'v3.ch4.eyebrow': 'Getting around',
    'v3.ch4.title': 'From the airport, and after',
    'v3.ch5.eyebrow': 'Why you go',
    'v3.ch5.title': 'Worth the flight',
    'v3.ch6.eyebrow': 'One last thing',
    'v3.ch6.title': 'Staying connected',
    // The folded chapters. Everything that is not the eSIM lives behind one of
    // these, opened by name.
    // The eSIM chapter is no longer last, so it can no longer be introduced as
    // the last thing. The old key stays for anyone still pointing at it.
    'v3.esim.eyebrow': 'First things first',
    'v3.more.eyebrow': 'If you want it',
    'v3.more.title': 'Everything else about this place',
    'v3.more.hint': 'Tap any of these to open it.',
    'v3.fold.basics': 'Money, power, signal',
    'v3.fold.entry': 'Visa and entry',
    'v3.fold.around': 'Airport and transport',
    'v3.fold.places': 'Places worth going',
    'v3.fold.show': 'Show',
    'v3.fold.hide': 'Hide',
    // Field labels
    'v3.currency': 'Currency',
    'v3.power': 'Power',
    'v3.network': 'Network',
    'v3.buys': 'Ten dollars buys',
    'v3.language': 'Language',
    'v3.updatedDaily': 'Updated daily',
    'v3.indicative': 'indicative rate',
    'v3.verified': 'Verified',
    'v3.source': 'Source',
    'v3.confirmFirst': 'This changes — confirm before you book',
    'v3.beforeYouFly': 'Before you fly',
    'v3.required': 'Required',
    'v3.recommended': 'Recommended',
    'v3.ifWrong': 'If something goes wrong',
    'v3.police': 'Police',
    'v3.ambulance': 'Ambulance',
    'v3.fire': 'Fire',
    'v3.passport': 'Passport validity',
    'v3.customs': 'Do not bring',
    'v3.declareCash': 'Declare cash over',
    'v3.fromAirport': 'From the airport',
    'v3.transitCard': 'Getting around town',
    'v3.inWallet': 'Works in your phone',
    'v3.notInWallet': 'Physical card only',
    'v3.apps': 'Apps people actually use',
    'v3.yourCard': 'Your Cambodian card',
    'v3.cardWidely': 'Accepted widely',
    'v3.cardSometimes': 'Accepted sometimes',
    'v3.cardRarely': 'Rarely accepted',
    'v3.khqrYes': 'KHQR works here',
    'v3.khqrNo': 'KHQR does not work here',
    'v3.tipping': 'Tipping',
    'v3.hiddenGem': 'Hidden gem',
    'v3.landmark': 'Landmark',
    'v3.popularKh': 'Popular with Cambodians',
    // Recommendation
    'v3.rec.title': 'Recommended for you',
    'v3.rec.days': 'days',
    'v3.rec.typical': 'Typical use over',
    'v3.rec.disclaimer': 'Typical use, not a guarantee. Tap a line to change it.',
    'v3.rec.buy': 'Get this eSIM',
    'v3.rec.added': 'Added — go to cart',
    'v3.rec.tripLength': 'Different trip length?',
    'v3.rec.headroom': 'Spare',
    'v3.rec.total': 'Estimated use',
    'v3.rec.why': 'Why this plan',
    // Trust
    'v3.trust.title': 'What you can hold us to',
    'v3.trust.refund':
      'If we do not deliver your QR code within 2 hours of payment, or the eSIM will not activate and support cannot fix it, you get a full refund.',
    'v3.trust.khmer': 'Support answers in Khmer, on Telegram or email.',
    'v3.trust.pay': 'Pay in USD by card, or with ABA PayWay and KHQR.',
    'v3.trust.noContract': 'No contract, no subscription, no auto-renewal.',
    'v3.trust.policy': 'Read the refund policy',
  },
  km: {
    // Brand
    'brand.word': 'ដំណើរ',
    'brand.kicker': 'DOMNER',
    // Navbar
    'nav.esim': 'eSIM',
    'nav.buyEsim': 'ទិញ eSIM',
    'nav.destinations': 'គោលដៅ',
    'nav.explore': 'ស្វែងរកគោលដៅ',
    'nav.exploreHint': 'មគ្គុទ្ទេសក៍ ទិដ្ឋាការ និងតម្លៃពិត',
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
    'nav.account': 'គណនី',
    'nav.dashboard': 'ផ្ទាំងគ្រប់គ្រង',
    'nav.settings': 'ការកំណត់',
    'nav.adminPanel': 'ផ្ទាំងអ្នកគ្រប់គ្រង',
    'nav.signOut': 'ចាកចេញ',
    'nav.signedInAs': 'បានចូលក្នុងនាម',
    // ការចូល និងការចុះឈ្មោះមិនបានសម្រេច
    'auth.error.providerUnavailable':
      'វិធីចូលនេះមិនទាន់មានទេ។ សូមប្រើអាសយដ្ឋានអ៊ីមែលរបស់អ្នកជំនួសវិញ។',
    'auth.error.phoneUnavailable':
      'ការចូលដោយលេខទូរស័ព្ទមិនទាន់មានទេ។ សូមប្រើអ៊ីមែល — វាដំណើរការទោះបីគ្មានសេវាទូរស័ព្ទក៏ដោយ។',
    'auth.error.badCredentials': 'អ៊ីមែល ឬពាក្យសម្ងាត់មិនត្រឹមត្រូវទេ។ សូមពិនិត្យ ហើយព្យាយាមម្តងទៀត។',
    'auth.error.emailNotConfirmed':
      'សូមបញ្ជាក់អ៊ីមែលរបស់អ្នកជាមុនសិន។ សូមពិនិត្យប្រអប់សំបុត្ររបស់អ្នក។',
    'auth.error.codeExpired': 'លេខកូដនេះផុតកំណត់ហើយ។ សូមស្នើសុំលេខកូដថ្មី។',
    'auth.error.codeInvalid': 'លេខកូដមិនត្រឹមត្រូវទេ។ សូមពិនិត្យ ហើយព្យាយាមម្តងទៀត។',
    'auth.error.tooMany': 'ព្យាយាមច្រើនដងពេក។ សូមរង់ចាំពីរបីនាទី ហើយព្យាយាមម្តងទៀត។',
    'auth.error.emailTaken': 'មានគណនីរួចហើយជាមួយអ៊ីមែលនេះ។ សូមព្យាយាមចូលគណនីវិញ។',
    // Hero
    'hero.badge': 'កម្មវិធីធ្វើដំណើរដំបូងគេរបស់កម្ពុជា 🇰🇭',
    'hero.t1': 'ធ្វើដំណើរ',
    'hero.t2': 'ដោយទំនុកចិត្ត',
    'hero.t3': 'រក្សាការតភ្ជាប់ជានិច្ច។',
    'hero.sub':
      'eSIM សម្រាប់ផ្លូវដែលខ្មែរធ្វើដំណើរ។ ការជូនដំណឹងជើងហោះហើរភ្លាមៗ។ ការណែនាំនៅអាកាសយានដ្ឋានជាជំហានៗ។ ទាំងអស់ជាភាសាខ្មែរ។',
    'hero.ctaEsim': 'ទិញ eSIM របស់អ្នក',
    'hero.ctaFlight': 'តាមដានជើងហោះហើរ',
    'hero.stat1': 'ការណែនាំជាភាសាខ្មែរ',
    'hero.stat2': 'ជំនួយភាសាខ្មែរ 24/7',
    'hero.stat3': 'ដឹកជញ្ជូនភ្លាមៗ',
    // Features
    'features.eyebrow': 'ហេតុអ្វីជ្រើសរើស Domner',
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
    'testi.eyebrow': 'អ្នកដំណើរទុកចិត្ត Domner',
    'testi.title': 'រឿងរ៉ាវពីដំណើរ',
    // CTA
    'cta.title': 'ត្រៀមខ្លួនសម្រាប់ដំណើរបន្ទាប់ហើយឬនៅ?',
    'cta.sub': 'អ្វីៗគ្រប់យ៉ាងដែលអ្នកត្រូវការមុនហោះហើរ ជាភាសាខ្មែរ។',
    'cta.checklist': 'បញ្ជីត្រៀមធ្វើដំណើរ',
    // Footer
    'footer.tagline': 'កម្មវិធីធ្វើដំណើរដំបូងគេរបស់កម្ពុជា។ ធ្វើដំណើរដោយទំនុកចិត្ត — ជាភាសាខ្មែរ។',
    'footer.esim': 'eSIM',
    'footer.destinations': 'គោលដៅ',
    'footer.explore': 'ស្វែងរកគោលដៅ',
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

    // ── Homepage v3 — the journey ──
    'v3.greet.morning': 'អរុណសួស្តី',
    'v3.greet.afternoon': 'ទិវាសួស្តី',
    'v3.greet.evening': 'សាយណ្ហសួស្តី',
    'v3.greet.night': 'នៅភ្ញាក់ដឹងខ្លួន',
    'v3.title': 'តើអ្នកនឹងធ្វើដំណើរទៅណាបន្ទាប់?',
    'v3.sub': 'រាល់ដំណើរចាប់ផ្តើមពីឈ្មោះមួយ។',
    'v3.searchPlaceholder': 'ស្វែងរកប្រទេស ទីក្រុង ឬគោលដៅ…',
    'v3.searchLabel': 'ស្វែងរកគោលដៅ',
    'v3.suggestions': 'គោលដៅដែលស្នើ',
    'v3.continue': 'បន្តទៀត',
    'v3.clear': 'សម្អាតការស្វែងរក',
    'v3.explore': 'ឬចុចលើទីក្រុងដែលភ្លឺនៅលើផែនដី។',
    'v3.soundOn': 'បើកសំឡេង',
    'v3.soundOff': 'បិទសំឡេង',
    'v3.back': 'ត្រឡប់ទៅផែនដី',
    'v3.direct': 'ហោះផ្ទាល់ពីភ្នំពេញ',
    'v3.oneStop': 'ឈប់ម្តងពីភ្នំពេញ',
    'v3.guideReady': 'មគ្គុទ្ទេសក៍ពេញលេញ',
    'v3.guideSoon': 'មគ្គុទ្ទេសក៍នឹងមកដល់ឆាប់ៗ',
    'v3.esimFrom': 'eSIM ចាប់ពី',
    'v3.esimExpress': 'eSIM · ទិញឥឡូវ',
    'v3.noResults': 'រកមិនឃើញអ្វីត្រូវគ្នាទេ។',
    'v3.noGuideTitle': 'យើងមិនទាន់សរសេរមគ្គុទ្ទេសក៍នេះទេ។',
    'v3.noGuideBody':
      'យើងសរសេរគោលដៅនីមួយៗឲ្យបានត្រឹមត្រូវ ឬមិនសរសេរទាល់តែសោះ ហើយគោលដៅនេះមិនទាន់រួចរាល់។ ប្រសិនបើយើងលក់ eSIM សម្រាប់ទីនោះ អ្នកនៅតែអាចតភ្ជាប់បានថ្ងៃនេះ។',
    'v3.noGuideCta': 'មើលគម្រោង eSIM',
    // Chapters
    'v3.ch1.eyebrow': 'ការមកដល់',
    'v3.ch2.eyebrow': 'មូលដ្ឋានគ្រឹះ',
    'v3.ch2.title': 'រូបិយប័ណ្ណ ចរន្តអគ្គិសនី និងសញ្ញា',
    'v3.ch3.eyebrow': 'ការចូលប្រទេស',
    'v3.ch3.title': 'ជាមួយលិខិតឆ្លងដែនកម្ពុជា',
    'v3.ch4.eyebrow': 'ការធ្វើដំណើរ',
    'v3.ch4.title': 'ពីអាកាសយានដ្ឋាន និងបន្ទាប់មក',
    'v3.ch5.eyebrow': 'ហេតុអ្វីត្រូវទៅ',
    'v3.ch5.title': 'សមនឹងជើងហោះហើរ',
    'v3.ch6.eyebrow': 'រឿងចុងក្រោយ',
    'v3.ch6.title': 'ការតភ្ជាប់',
    'v3.esim.eyebrow': 'រឿងសំខាន់មុនគេ',
    'v3.more.eyebrow': 'បើអ្នកចង់ដឹង',
    'v3.more.title': 'រឿងផ្សេងទៀតអំពីទីនេះ',
    'v3.more.hint': 'ចុចលើមួយណាក៏បាន ដើម្បីបើកមើល។',
    'v3.fold.basics': 'លុយ ភ្លើង សេវាទូរស័ព្ទ',
    'v3.fold.entry': 'ទិដ្ឋាការ និងការចូលប្រទេស',
    'v3.fold.around': 'អាកាសយានដ្ឋាន និងការធ្វើដំណើរ',
    'v3.fold.places': 'កន្លែងគួរទៅ',
    'v3.fold.show': 'បង្ហាញ',
    'v3.fold.hide': 'លាក់',
    // Field labels
    'v3.currency': 'រូបិយប័ណ្ណ',
    'v3.power': 'ចរន្តអគ្គិសនី',
    'v3.network': 'បណ្តាញ',
    'v3.buys': 'ដប់ដុល្លារទិញបាន',
    'v3.language': 'ភាសា',
    'v3.updatedDaily': 'ធ្វើបច្ចុប្បន្នភាពប្រចាំថ្ងៃ',
    'v3.indicative': 'អត្រាប្រហាក់ប្រហែល',
    'v3.verified': 'ផ្ទៀងផ្ទាត់',
    'v3.source': 'ប្រភព',
    'v3.confirmFirst': 'ព័ត៌មាននេះប្រែប្រួល — សូមបញ្ជាក់មុនកក់',
    'v3.beforeYouFly': 'មុនពេលហោះហើរ',
    'v3.required': 'ចាំបាច់',
    'v3.recommended': 'គួរធ្វើ',
    'v3.ifWrong': 'ប្រសិនបើមានបញ្ហា',
    'v3.police': 'ប៉ូលិស',
    'v3.ambulance': 'រថពេទ្យ',
    'v3.fire': 'ពន្លត់អគ្គិភ័យ',
    'v3.passport': 'សុពលភាពលិខិតឆ្លងដែន',
    'v3.customs': 'កុំយកទៅ',
    'v3.declareCash': 'ត្រូវប្រកាសសាច់ប្រាក់លើសពី',
    'v3.fromAirport': 'ពីអាកាសយានដ្ឋាន',
    'v3.transitCard': 'ការធ្វើដំណើរក្នុងទីក្រុង',
    'v3.inWallet': 'ដំណើរការក្នុងទូរស័ព្ទ',
    'v3.notInWallet': 'កាតរូបវន្តតែប៉ុណ្ណោះ',
    'v3.apps': 'កម្មវិធីដែលគេប្រើពិតប្រាកដ',
    'v3.yourCard': 'កាតកម្ពុជារបស់អ្នក',
    'v3.cardWidely': 'ទទួលយកយ៉ាងទូលំទូលាយ',
    'v3.cardSometimes': 'ទទួលយកខ្លះ',
    'v3.cardRarely': 'កម្រទទួលយក',
    'v3.khqrYes': 'KHQR ដំណើរការនៅទីនេះ',
    'v3.khqrNo': 'KHQR មិនដំណើរការនៅទីនេះទេ',
    'v3.tipping': 'ការឲ្យទឹកតែ',
    'v3.hiddenGem': 'កន្លែងសម្ងាត់',
    'v3.landmark': 'ទីតាំងល្បី',
    'v3.popularKh': 'ពេញនិយមក្នុងចំណោមខ្មែរ',
    // Recommendation
    'v3.rec.title': 'ណែនាំសម្រាប់អ្នក',
    'v3.rec.days': 'ថ្ងៃ',
    'v3.rec.typical': 'ការប្រើប្រាស់ធម្មតាក្នុងរយៈពេល',
    'v3.rec.disclaimer': 'ជាការប្រើប្រាស់ធម្មតា មិនមែនការធានាទេ។ ចុចលើជួរណាមួយដើម្បីផ្លាស់ប្តូរ។',
    'v3.rec.buy': 'យក eSIM នេះ',
    'v3.rec.added': 'បានបន្ថែម — ទៅកន្ត្រក',
    'v3.rec.tripLength': 'រយៈពេលដំណើរផ្សេង?',
    'v3.rec.headroom': 'បម្រុង',
    'v3.rec.total': 'ការប្រើប្រាស់ប៉ាន់ស្មាន',
    'v3.rec.why': 'ហេតុអ្វីជ្រើសគម្រោងនេះ',
    // Trust
    'v3.trust.title': 'អ្វីដែលអ្នកអាចទុកចិត្តលើយើង',
    'v3.trust.refund':
      'ប្រសិនបើយើងមិនផ្ញើកូដ QR ជូនអ្នកក្នុងរយៈពេល ២ ម៉ោងបន្ទាប់ពីការទូទាត់ ឬ eSIM មិនដំណើរការ ហើយក្រុមជំនួយមិនអាចជួសជុលបាន អ្នកទទួលបានការសងប្រាក់វិញពេញលេញ។',
    'v3.trust.khmer': 'ក្រុមជំនួយឆ្លើយជាភាសាខ្មែរ តាម Telegram ឬអ៊ីមែល។',
    'v3.trust.pay': 'ទូទាត់ជាដុល្លារដោយកាត ឬតាម ABA PayWay និង KHQR។',
    'v3.trust.noContract': 'គ្មានកិច្ចសន្យា គ្មានការជាវ គ្មានការបន្តដោយស្វ័យប្រវត្តិ។',
    'v3.trust.policy': 'អានគោលការណ៍សងប្រាក់វិញ',
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

/**
 * Pick the right half of a bilingual value from the content layer
 * (`content/schema.ts` → `Bi`). Curated destination facts are stored bilingual
 * rather than keyed, because they are content rather than interface copy — but
 * they still resolve through the language the visitor chose here.
 */
export function useBi(): (value: { en: string; km: string }) => string {
  const { lang } = useLang();
  return (value) => value[lang] || value.en;
}
