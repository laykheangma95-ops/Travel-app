import type { DestinationGuide } from '../schema';

export const singapore: DestinationGuide = {
  slug: 'singapore',
  city: { en: 'Singapore', km: 'សិង្ហបុរី' },
  country: { en: 'Singapore', km: 'សិង្ហបុរី' },
  countryCode: 'SG',
  esimCountrySlug: 'singapore',
  aliases: ['Singapore', 'សិង្ហបុរី', 'សិង្ហបូរី', 'SIN', 'Changi', 'Sentosa'],
  routeWeight: 8,
  directFlightMins: 125,

  geo: { lat: 1.35, lon: 103.82, timezone: 'Asia/Singapore', flightAltitude: 1.44 },

  arrival: {
    skyColor: '#1e3358',
    horizonColor: '#8fb6d6',
    intro: {
      en: 'Two hours from Phnom Penh, and everything works. Expensive by the hour, cheap by the day if you eat where Singaporeans eat.',
      km: 'ពីរម៉ោងពីភ្នំពេញ ហើយអ្វីៗដំណើរការល្អ។ ថ្លៃបើគិតជាម៉ោង តែថោកបើគិតជាថ្ងៃ ប្រសិនបើអ្នកញ៉ាំកន្លែងដែលជនជាតិសិង្ហបុរីញ៉ាំ។',
    },
  },

  basics: {
    lastVerified: '2026-08-03',
    currency: { code: 'SGD', name: { en: 'Singapore dollar', km: 'ដុល្លារសិង្ហបុរី' }, symbol: 'S$' },
    tenDollarsBuys: [
      { item: { en: 'Two hawker centre meals', km: 'អាហារនៅមណ្ឌលហូបចុកពីរមុខ' }, localPrice: 'S$9' },
      { item: { en: 'An MRT ride across town', km: 'ជិះ MRT ឆ្លងកាត់ទីក្រុង' }, localPrice: 'S$2.20' },
      { item: { en: 'A kopi and kaya toast', km: 'កាហ្វេ និងនំបុ័ង kaya' }, localPrice: 'S$4' },
    ],
    languages: [
      { en: 'English', km: 'អង់គ្លេស' },
      { en: 'Mandarin', km: 'ចិនកុកងឺ' },
      { en: 'Malay', km: 'ម៉ាឡេ' },
      { en: 'Tamil', km: 'តាមីល' },
    ],
    hello: { native: 'Hello', roman: 'English is everywhere' },
    thankYou: { native: 'Terima kasih', roman: 'te-ri-ma ka-sih' },
    plugTypes: ['G'],
    voltage: '230V · 50Hz',
    networks: [{ name: 'Singtel' }, { name: 'StarHub' }],
  },

  entry: {
    forPassport: 'KH',
    visa: {
      lastVerified: '2026-08-03',
      kind: 'visa-free',
      summary: {
        en: 'No visa needed. Cambodian passport holders are granted a short-term visit pass on arrival — the officer decides the length and stamps it in.',
        km: 'មិនត្រូវការទិដ្ឋាការទេ។ អ្នកកាន់លិខិតឆ្លងដែនកម្ពុជាទទួលបានប័ណ្ណទស្សនារយៈពេលខ្លីនៅពេលមកដល់ — មន្ត្រីជាអ្នកសម្រេចរយៈពេល ហើយបោះត្រា។',
      },
      maxStayDays: 30,
      costUsd: 0,
      applyUrl: 'https://www.ica.gov.sg/enter-depart/entry_requirements',
      source: {
        label: { en: 'Immigration & Checkpoints Authority', km: 'អាជ្ញាធរអន្តោប្រវេសន៍ និងច្រកត្រួតពិនិត្យ' },
        url: 'https://www.ica.gov.sg/enter-depart/entry_requirements',
      },
    },
    requirements: [
      {
        lastVerified: '2026-08-03',
        id: 'sg-arrival-card',
        title: { en: 'SG Arrival Card', km: 'ប័ណ្ណចូលសិង្ហបុរី (SGAC)' },
        detail: {
          en: 'Required before you arrive, including a short health declaration. Free through the ICA e-Service or the MyICA app — any site charging you for it is not the government.',
          km: 'ត្រូវការមុនពេលមកដល់ រួមទាំងសេចក្តីប្រកាសសុខភាពខ្លីមួយ។ ឥតគិតថ្លៃតាមសេវា ICA e-Service ឬកម្មវិធី MyICA — គេហទំព័រណាដែលគិតថ្លៃ មិនមែនជារបស់រដ្ឋាភិបាលទេ។',
        },
        mandatory: true,
        window: { opensDaysBefore: 3 },
        url: 'https://eservices.ica.gov.sg/sgarrivalcard',
        source: {
          label: { en: 'ICA Singapore', km: 'ICA សិង្ហបុរី' },
          url: 'https://eservices.ica.gov.sg/sgarrivalcard',
        },
      },
      {
        lastVerified: '2026-08-03',
        id: 'onward-ticket',
        title: { en: 'Onward ticket and an address', km: 'សំបុត្របន្តដំណើរ និងអាសយដ្ឋាន' },
        detail: {
          en: 'The arrival card asks where you are staying and when you leave. Have the hotel booking open before you fill it in.',
          km: 'ប័ណ្ណចូលសួរថាអ្នកស្នាក់នៅឯណា និងចេញដំណើរនៅពេលណា។ ត្រូវបើកការកក់សណ្ឋាគារមុនពេលបំពេញ។',
        },
        mandatory: true,
      },
      {
        lastVerified: '2026-08-03',
        id: 'know-whats-banned',
        title: { en: 'Know what is actually illegal here', km: 'ដឹងពីអ្វីដែលខុសច្បាប់នៅទីនេះ' },
        detail: {
          en: 'Chewing gum, e-cigarettes and shisha are prohibited, and the penalties are real. Drug offences carry the death penalty. This is not a country to test.',
          km: 'ស្ករកៅស៊ូ បារីអេឡិចត្រូនិក និងស៊ីសាត្រូវបានហាមឃាត់ ហើយទណ្ឌកម្មគឺពិតប្រាកដ។ បទល្មើសគ្រឿងញៀនអាចទទួលទោសប្រហារជីវិត។ នេះមិនមែនជាប្រទេសដែលគួរសាកល្បងទេ។',
        },
        mandatory: true,
      },
    ],
    passportValidity: { lastVerified: '2026-08-03', monthsBeyondStay: 6 },
    customs: {
      lastVerified: '2026-08-03',
      cashDeclareOverUsd: 14500,
      banned: [
        { en: 'Chewing gum', km: 'ស្ករកៅស៊ូ' },
        { en: 'E-cigarettes, vapes and shisha', km: 'បារីអេឡិចត្រូនិក និងស៊ីសា' },
        { en: 'Any duty-free cigarettes — there is no allowance at all', km: 'បារីគ្មានពន្ធ — គ្មានកូតាទាល់តែសោះ' },
      ],
    },
    emergency: {
      lastVerified: '2026-08-03',
      police: '999',
      ambulance: '995',
      fire: '995',
      khmerMission: {
        name: { en: 'Royal Embassy of Cambodia, Singapore', km: 'ស្ថានឯកអគ្គរាជទូតកម្ពុជា សិង្ហបុរី' },
        url: 'https://www.camemb-sg.com/',
        note: {
          en: 'Current address and consular hours are published on the embassy website. We list only what we can verify.',
          km: 'អាសយដ្ឋាន និងម៉ោងសេវាកុងស៊ុលបច្ចុប្បន្នមាននៅលើគេហទំព័រស្ថានទូត។ យើងរាយបញ្ជីតែអ្វីដែលយើងអាចផ្ទៀងផ្ទាត់បាន។',
        },
      },
    },
  },

  around: {
    lastVerified: '2026-08-03',
    fromAirport: [
      {
        mode: { en: 'Changi → city on the MRT', km: 'Changi → ទីក្រុងតាម MRT' },
        durationMins: 45,
        costLocal: 'S$2.50',
        costUsd: 1.9,
        note: {
          en: 'Tap in with the same card you tap everywhere else. One change at Tanah Merah.',
          km: 'ប៉ះកាតតែមួយដែលអ្នកប៉ះគ្រប់កន្លែង។ ប្តូរម្តងនៅ Tanah Merah។',
        },
      },
      {
        mode: { en: 'Taxi or Grab', km: 'តាក់ស៊ី ឬ Grab' },
        durationMins: 22,
        costLocal: 'S$25–35',
        costUsd: 24,
        note: { en: 'Surcharges apply from the airport and late at night.', km: 'មានថ្លៃបន្ថែមពីអាកាសយានដ្ឋាន និងពេលយប់ជ្រៅ។' },
      },
    ],
    transitCard: {
      name: 'SimplyGo',
      note: {
        en: 'You do not need a transit card at all — tap your ABA or Wing Visa card straight on the MRT and bus readers and it charges the fare. This is the easiest public transport in Asia for a Cambodian card.',
        km: 'អ្នកមិនចាំបាច់មានកាតធ្វើដំណើរទេ — គ្រាន់តែប៉ះកាត Visa របស់ ABA ឬ Wing នៅម៉ាស៊ីន MRT និងឡានក្រុង នោះវានឹងកាត់ថ្លៃ។ នេះជាប្រព័ន្ធដឹកជញ្ជូនសាធារណៈងាយស្រួលបំផុតនៅអាស៊ីសម្រាប់កាតកម្ពុជា។',
      },
      inPhoneWallet: true,
    },
    apps: [
      { name: 'Grab', purpose: { en: 'Rides and food, same account as home', km: 'ការធ្វើដំណើរ និងអាហារ គណនីដូចនៅផ្ទះ' } },
      { name: 'Google Maps', purpose: { en: 'MRT and bus routing, reliable to the minute', km: 'ការណែនាំផ្លូវ MRT និងឡានក្រុង ជឿជាក់បានគ្រប់នាទី' } },
    ],
    money: {
      cambodianCardAccepted: 'widely',
      khqrAccepted: false,
      khqrNote: {
        en: 'Cross-border QR between Cambodia and Singapore is not something to count on for paying merchants here. Your card works everywhere, so bring that.',
        km: 'QR ឆ្លងដែនរវាងកម្ពុជា និងសិង្ហបុរីមិនមែនជាអ្វីដែលគួរពឹងផ្អែកសម្រាប់បង់ប្រាក់នៅទីនេះទេ។ កាតរបស់អ្នកដំណើរការគ្រប់កន្លែង ដូច្នេះយកវាទៅ។',
      },
      cashCulture: {
        en: 'Almost everything takes a card, including hawker stalls now. Keep about S$20 in cash for the few that do not.',
        km: 'ស្ទើរតែគ្រប់កន្លែងទទួលកាត រួមទាំងតូបហូបចុកឥឡូវនេះ។ ទុកសាច់ប្រាក់ប្រហែល S$20 សម្រាប់កន្លែងខ្លះដែលមិនទទួល។',
      },
      tipping: {
        en: 'No tipping. A service charge is already on the bill in restaurants.',
        km: 'មិនឲ្យទឹកតែទេ។ ថ្លៃសេវាមានក្នុងវិក្កយបត្រភោជនីយដ្ឋានរួចហើយ។',
      },
    },
  },

  places: {
    lastVerified: '2026-08-03',
    list: [
      {
        kind: 'landmark',
        contentSlug: 'singapore:gardens-by-the-bay',
        name: { en: 'Gardens by the Bay after dark', km: 'Gardens by the Bay ពេលយប់' },
        why: {
          en: 'The outdoor gardens and the Supertree light show are free. The two conservatories are the part you pay for, and the Cloud Forest is worth it.',
          km: 'សួនក្រៅ និងការបញ្ចាំងពន្លឺ Supertree គឺឥតគិតថ្លៃ។ ផ្ទះកញ្ចក់ពីរគឺជាផ្នែកដែលត្រូវបង់ថ្លៃ ហើយ Cloud Forest មានតម្លៃណាស់។',
        },
        area: { en: 'Marina Bay', km: 'Marina Bay' },
        bestTime: { en: '19:45 or 20:45 for the light show', km: 'ម៉ោង ១៩:៤៥ ឬ ២០:៤៥ សម្រាប់ការបញ្ចាំងពន្លឺ' },
        roughCostUsd: 0,
      },
      {
        kind: 'popular-with-cambodians',
        contentSlug: 'singapore:mustafa-centre',
        name: { en: 'Mustafa Centre', km: 'មជ្ឈមណ្ឌល Mustafa' },
        why: {
          en: 'Open around the clock, and the reason half the suitcases leaving Changi are overweight. Electronics, gold, medicine, everything.',
          km: 'បើក ២៤ ម៉ោង ហើយជាមូលហេតុដែលវ៉ាលីពាក់កណ្តាលចេញពី Changi លើសទម្ងន់។ អេឡិចត្រូនិក មាស ថ្នាំ គ្រប់យ៉ាង។',
        },
        area: { en: 'Little India', km: 'Little India' },
        bestTime: { en: 'Late night, when it empties out', km: 'យប់ជ្រៅ ពេលមនុស្សតិច' },
        roughCostUsd: 0,
      },
      {
        kind: 'hidden-gem',
        contentSlug: 'singapore:pulau-ubin',
        name: { en: 'Pulau Ubin', km: 'កោះ Pulau Ubin' },
        why: {
          en: 'A ten-minute bumboat from Changi Village to the Singapore of the 1960s — dirt tracks, wild boar, rented bicycles, no skyline.',
          km: 'ទូកដប់នាទីពី Changi Village ទៅសិង្ហបុរីនៃទសវត្សរ៍ ១៩៦០ — ផ្លូវដី ជ្រូកព្រៃ កង់ជួល គ្មានអគារខ្ពស់។',
        },
        area: { en: 'North-east islands', km: 'កោះភាគឦសាន' },
        roughCostUsd: 4,
      },
    ],
  },
};
