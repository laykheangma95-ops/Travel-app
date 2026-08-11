import type { DestinationGuide } from '../schema';

// ─────────────────────────────────────────────────────────────────────────────
// Bangkok is the hardest file in this folder and the most important one.
//
// As of August 2026 the Cambodia–Thailand land border has been closed to
// travellers since 2025, and the visa-exempt stay granted to Cambodian
// passport holders has moved more than once — sources currently disagree
// between 7, 14 and 30 days depending on entry point and date.
//
// We do not pick a number. Stating "30 days" with false confidence is exactly
// the failure this whole page exists to avoid. Instead the visa block is marked
// `volatile`, which renders a confirm-before-you-book prompt and the official
// link, and the closure is carried as an advisory above everything else.
// ─────────────────────────────────────────────────────────────────────────────

export const bangkok: DestinationGuide = {
  slug: 'bangkok',
  city: { en: 'Bangkok', km: 'បាងកក' },
  country: { en: 'Thailand', km: 'ថៃ' },
  countryCode: 'TH',
  esimCountrySlug: 'thailand',
  aliases: ['Bangkok', 'បាងកក', 'Thailand', 'ថៃ', 'BKK', 'DMK', 'Krung Thep', 'Phuket', 'Chiang Mai'],
  routeWeight: 10,
  directFlightMins: 65,

  geo: { lat: 13.75, lon: 100.5, timezone: 'Asia/Bangkok', flightAltitude: 1.46 },

  arrival: {
    skyColor: '#243a63',
    horizonColor: '#d9955f',
    intro: {
      en: 'An hour in the air and a different country. Bangkok is the closest big city to Phnom Penh — but right now it is a flight, not a drive.',
      km: 'មួយម៉ោងលើអាកាស ហើយជាប្រទេសផ្សេង។ បាងកកគឺជាទីក្រុងធំដែលនៅជិតភ្នំពេញបំផុត — ប៉ុន្តែពេលនេះត្រូវហោះហើរ មិនមែនបើកឡានទេ។',
    },
  },

  basics: {
    lastVerified: '2026-08-03',
    currency: { code: 'THB', name: { en: 'Thai baht', km: 'បាតថៃ' }, symbol: '฿' },
    tenDollarsBuys: [
      { item: { en: 'Two plates of pad kraprao', km: 'បាយឆាហឹរពីរចាន' }, localPrice: '฿120' },
      { item: { en: 'A BTS Skytrain ride', km: 'ជិះរថភ្លើង BTS មួយដង' }, localPrice: '฿35' },
      { item: { en: 'An iced coffee', km: 'កាហ្វេទឹកកក' }, localPrice: '฿60' },
    ],
    languages: [{ en: 'Thai', km: 'ភាសាថៃ' }],
    hello: { native: 'สวัสดี', roman: 'sawasdee' },
    thankYou: { native: 'ขอบคุณ', roman: 'khop khun' },
    plugTypes: ['A', 'B', 'C'],
    voltage: '220V · 50Hz',
    networks: [{ name: 'AIS' }, { name: 'TrueMove H' }],
  },

  entry: {
    forPassport: 'KH',
    advisory: {
      lastVerified: '2026-08-03',
      volatile: true,
      title: { en: 'The land border is closed. Fly.', km: 'ព្រំដែនផ្លូវគោកបិទ។ ត្រូវហោះហើរ។' },
      detail: {
        en: 'All Cambodia–Thailand land crossings have been closed to travellers since 2025 and no reopening date has been announced. Air routes between Phnom Penh, Siem Reap and Bangkok are operating normally. Do not book a bus or plan an overland connection without checking first.',
        km: 'ច្រកព្រំដែនផ្លូវគោកកម្ពុជា–ថៃទាំងអស់ត្រូវបានបិទចំពោះអ្នកដំណើរតាំងពីឆ្នាំ ២០២៥ ហើយមិនទាន់មានការប្រកាសថ្ងៃបើកឡើងវិញទេ។ ជើងហោះហើររវាងភ្នំពេញ សៀមរាប និងបាងកកនៅដំណើរការធម្មតា។ កុំកក់ឡានក្រុង ឬគ្រោងធ្វើដំណើរតាមផ្លូវគោកដោយមិនពិនិត្យជាមុន។',
      },
      source: {
        label: { en: 'U.S. Embassy in Cambodia — border advisory', km: 'ស្ថានទូតអាមេរិកប្រចាំកម្ពុជា — ដំណឹងព្រំដែន' },
        url: 'https://kh.usembassy.gov/travel-advisory-cambodia-thailand-border/',
      },
    },
    visa: {
      lastVerified: '2026-08-03',
      volatile: true,
      kind: 'check-before-booking',
      summary: {
        en: 'No visa is needed in advance for a short tourist visit by air — but the length of stay granted to Cambodian passport holders has changed several times since 2025 and sources currently disagree. Confirm with the Royal Thai Embassy in Phnom Penh before you book anything non-refundable.',
        km: 'មិនត្រូវការទិដ្ឋាការជាមុនសម្រាប់ការទស្សនាទេសចរណ៍រយៈពេលខ្លីតាមផ្លូវអាកាសទេ — ប៉ុន្តែរយៈពេលស្នាក់នៅដែលអនុញ្ញាតឲ្យអ្នកកាន់លិខិតឆ្លងដែនកម្ពុជាបានផ្លាស់ប្តូរច្រើនដងតាំងពីឆ្នាំ ២០២៥ ហើយប្រភពនានាមិនស្របគ្នា។ សូមបញ្ជាក់ជាមួយស្ថានទូតថៃនៅភ្នំពេញ មុនពេលកក់អ្វីដែលមិនអាចសងប្រាក់វិញបាន។',
      },
      maxStayDays: null,
      costUsd: 0,
      applyUrl: 'https://www.thaiembassy.org/phnompenh/',
      source: {
        label: { en: 'Royal Thai Embassy, Phnom Penh', km: 'ស្ថានទូតថៃ ភ្នំពេញ' },
        url: 'https://www.thaiembassy.org/phnompenh/',
      },
    },
    requirements: [
      {
        lastVerified: '2026-08-03',
        id: 'tdac',
        title: { en: 'Thailand Digital Arrival Card (TDAC)', km: 'ប័ណ្ណចូលឌីជីថលថៃ (TDAC)' },
        detail: {
          en: 'Mandatory for every non-Thai traveller, by air or land. Submit it in the 72 hours before you arrive. It is free, single-entry, and the only official site is tdac.immigration.go.th — everything else charging you a fee is a copy.',
          km: 'ចាំបាច់សម្រាប់អ្នកដំណើរមិនមែនជនជាតិថៃគ្រប់រូប ទាំងតាមអាកាស និងផ្លូវគោក។ ដាក់ស្នើក្នុងរយៈពេល ៧២ ម៉ោងមុនពេលមកដល់។ វាឥតគិតថ្លៃ ប្រើបានតែម្តង ហើយគេហទំព័រផ្លូវការតែមួយគត់គឺ tdac.immigration.go.th — កន្លែងផ្សេងដែលគិតថ្លៃគឺជាការក្លែងបន្លំ។',
        },
        mandatory: true,
        window: { opensDaysBefore: 3 },
        url: 'https://tdac.immigration.go.th',
        source: {
          label: { en: 'Thai Immigration Bureau', km: 'ការិយាល័យអន្តោប្រវេសន៍ថៃ' },
          url: 'https://tdac.immigration.go.th',
        },
      },
      {
        lastVerified: '2026-08-03',
        id: 'onward-ticket',
        title: { en: 'Proof of onward travel', km: 'ភស្តុតាងនៃការបន្តដំណើរ' },
        detail: {
          en: 'Immigration can ask to see a ticket out of Thailand within your permitted stay. Airlines sometimes ask at check-in too.',
          km: 'អន្តោប្រវេសន៍អាចសុំមើលសំបុត្រចេញពីថៃក្នុងរយៈពេលស្នាក់នៅដែលអនុញ្ញាត។ ក្រុមហ៊ុនអាកាសចរណ៍ក៏អាចសួរពេលឆែកអ៊ីនដែរ។',
        },
        mandatory: true,
      },
      {
        lastVerified: '2026-08-03',
        id: 'no-vapes',
        title: { en: 'Leave the vape at home', km: 'ទុកបារីអេឡិចត្រូនិកនៅផ្ទះ' },
        detail: {
          en: 'E-cigarettes and vaping liquid are illegal in Thailand — importing one carries a fine or worse, and airport checks do happen.',
          km: 'បារីអេឡិចត្រូនិក និងទឹកបារីខុសច្បាប់នៅថៃ — ការនាំចូលអាចត្រូវពិន័យ ឬធ្ងន់ជាងនេះ ហើយការត្រួតពិនិត្យនៅអាកាសយានដ្ឋានពិតជាមាន។',
        },
        mandatory: true,
      },
    ],
    passportValidity: {
      lastVerified: '2026-08-03',
      monthsBeyondStay: 6,
    },
    customs: {
      lastVerified: '2026-08-03',
      cashDeclareOverUsd: 15000,
      banned: [
        { en: 'E-cigarettes and vaping liquid', km: 'បារីអេឡិចត្រូនិក និងទឹកបារី' },
        { en: 'More than 200 cigarettes', km: 'បារីលើសពី ២០០ ដើម' },
        { en: 'Products made from protected wildlife', km: 'ផលិតផលពីសត្វព្រៃដែលត្រូវការពារ' },
      ],
    },
    emergency: {
      lastVerified: '2026-08-03',
      police: '191',
      ambulance: '1669',
      fire: '199',
      khmerMission: {
        name: { en: 'Royal Embassy of Cambodia, Bangkok', km: 'ស្ថានឯកអគ្គរាជទូតកម្ពុជា ទីក្រុងបាងកក' },
        note: {
          en: 'Check current contact details and opening hours on the Ministry of Foreign Affairs mission directory before you travel — consular arrangements have been affected by the border situation.',
          km: 'សូមពិនិត្យព័ត៌មានទំនាក់ទំនង និងម៉ោងបើកបច្ចុប្បន្ននៅបញ្ជីស្ថានតំណាងរបស់ក្រសួងការបរទេស មុនពេលធ្វើដំណើរ — សេវាកុងស៊ុលត្រូវបានប៉ះពាល់ដោយស្ថានការណ៍ព្រំដែន។',
        },
        url: 'https://www.mfaic.gov.kh/en/embassies/royal%20embassy%20of%20cambodia',
      },
      source: {
        label: { en: 'Tourist Police Thailand — 1155', km: 'ប៉ូលិសទេសចរណ៍ថៃ — ១១៥៥' },
        url: 'https://www.thailandtouristpolice.go.th/',
      },
    },
  },

  around: {
    lastVerified: '2026-08-03',
    fromAirport: [
      {
        mode: { en: 'Suvarnabhumi → Phaya Thai on the Airport Rail Link', km: 'Suvarnabhumi → Phaya Thai តាម Airport Rail Link' },
        durationMins: 30,
        costLocal: '฿45',
        costUsd: 1.3,
        note: { en: 'Beats the traffic every single time.', km: 'ឈ្នះការកកស្ទះចរាចរណ៍គ្រប់ពេល។' },
      },
      {
        mode: { en: 'Airport taxi by the official rank', km: 'តាក់ស៊ីអាកាសយានដ្ឋានតាមជួរផ្លូវការ' },
        durationMins: 55,
        costLocal: '฿400–500',
        costUsd: 13,
        note: {
          en: 'Use the official queue downstairs and insist on the meter. Ignore anyone who approaches you in the terminal.',
          km: 'ប្រើជួរផ្លូវការនៅជាន់ក្រោម ហើយទទូចឲ្យប្រើម៉ែត្រ។ កុំខ្វល់នឹងអ្នកដែលចូលមករកអ្នកក្នុងអាកាសយានដ្ឋាន។',
        },
      },
      {
        mode: { en: 'Don Mueang → city by A1 bus and BTS', km: 'Don Mueang → ទីក្រុងតាមឡានក្រុង A1 និង BTS' },
        durationMins: 60,
        costLocal: '฿30 + fare',
        costUsd: 1,
      },
    ],
    transitCard: {
      name: 'Rabbit / MRT card',
      note: {
        en: 'Two separate systems: Rabbit for the BTS Skytrain, an MRT card for the underground. Neither lives in your phone — buy both at the first station you use.',
        km: 'ប្រព័ន្ធពីរផ្សេងគ្នា៖ Rabbit សម្រាប់ BTS Skytrain និងកាត MRT សម្រាប់រថភ្លើងក្រោមដី។ គ្មានមួយណានៅក្នុងទូរស័ព្ទទេ — ទិញទាំងពីរនៅស្ថានីយដំបូងដែលអ្នកប្រើ។',
      },
      inPhoneWallet: false,
    },
    apps: [
      { name: 'Grab', purpose: { en: 'Taxis and food, same app as home', km: 'តាក់ស៊ី និងអាហារ កម្មវិធីដូចនៅផ្ទះ' } },
      { name: 'Bolt', purpose: { en: 'Usually cheaper than Grab in Bangkok', km: 'ជាធម្មតាថោកជាង Grab នៅបាងកក' } },
      { name: 'Google Maps', purpose: { en: 'Live BTS and MRT routing', km: 'ការណែនាំផ្លូវ BTS និង MRT ផ្ទាល់' } },
    ],
    money: {
      cambodianCardAccepted: 'widely',
      khqrAccepted: true,
      khqrNote: {
        en: 'Bakong supports cross-border QR with Thailand, so your KHQR app can pay at PromptPay merchants. Open the Bakong app and check the cross-border section before you rely on it for a big purchase.',
        km: 'Bakong គាំទ្រ QR ឆ្លងដែនជាមួយថៃ ដូច្នេះកម្មវិធី KHQR របស់អ្នកអាចបង់ប្រាក់នៅហាងដែលប្រើ PromptPay។ សូមបើកកម្មវិធី Bakong ហើយពិនិត្យផ្នែកឆ្លងដែន មុនពេលពឹងផ្អែកលើវាសម្រាប់ការទិញធំ។',
      },
      cashCulture: {
        en: 'Malls and chains take cards. Street food, markets and tuk-tuks are cash. ATMs charge a flat ฿220 fee per withdrawal, so take out more at once.',
        km: 'ផ្សារទំនើប និងហាងខ្សែសង្វាក់ទទួលកាត។ អាហារតាមផ្លូវ ផ្សារ និងតុកតុកគឺសាច់ប្រាក់។ ATM គិតថ្លៃ ២២០ បាតក្នុងមួយដង ដូច្នេះគួរដកច្រើនម្តង។',
      },
      tipping: {
        en: 'Not expected. Rounding up a taxi fare is plenty.',
        km: 'មិនចាំបាច់ទេ។ គ្រាន់តែបង្គត់ថ្លៃតាក់ស៊ីឡើងលើគឺគ្រប់គ្រាន់។',
      },
    },
  },

  places: {
    lastVerified: '2026-08-03',
    list: [
      {
        kind: 'landmark',
        name: { en: 'Wat Pho and the reclining Buddha', km: 'វត្ត Pho និងព្រះពុទ្ធផ្ទំ' },
        why: {
          en: 'Quieter and older than the Grand Palace next door, and the massage school inside is the real thing.',
          km: 'ស្ងាត់ និងចាស់ជាងព្រះបរមរាជវាំងនៅជាប់នោះ ហើយសាលាម៉ាស្សាខាងក្នុងគឺពិតប្រាកដ។',
        },
        area: { en: 'Rattanakosin', km: 'Rattanakosin' },
        bestTime: { en: 'Opens 08:00 — go then', km: 'បើកម៉ោង ០៨:០០ — ទៅពេលនោះ' },
        roughCostUsd: 6,
      },
      {
        kind: 'popular-with-cambodians',
        name: { en: 'Chatuchak weekend market', km: 'ផ្សារចុងសប្តាហ៍ Chatuchak' },
        why: {
          en: 'Fifteen thousand stalls. Go early, agree the price before anything is wrapped, and keep your phone in a front pocket.',
          km: 'តូបជាង ១៥,០០០។ ទៅឲ្យឆាប់ ព្រមព្រៀងតម្លៃមុនពេលគេខ្ចប់ ហើយទុកទូរស័ព្ទក្នុងហោប៉ៅមុខ។',
        },
        area: { en: 'Chatuchak', km: 'Chatuchak' },
        bestTime: { en: 'Saturday or Sunday before 10:00', km: 'ថ្ងៃសៅរ៍ ឬអាទិត្យ មុនម៉ោង ១០:០០' },
        roughCostUsd: 0,
      },
      {
        kind: 'hidden-gem',
        name: { en: 'Bang Krachao', km: 'កោះ Bang Krachao' },
        why: {
          en: "A green island in the river loop, five minutes by boat from the city. Rent a bicycle and the traffic noise just stops.",
          km: 'កោះបៃតងក្នុងកោងទន្លេ ប្រាំនាទីតាមទូកពីទីក្រុង។ ជួលកង់ ហើយសំឡេងចរាចរណ៍ក៏បាត់ទៅ។',
        },
        area: { en: 'Phra Pradaeng', km: 'Phra Pradaeng' },
        bestTime: { en: 'Early morning', km: 'ព្រឹកព្រលឹម' },
        roughCostUsd: 4,
      },
    ],
  },
};
