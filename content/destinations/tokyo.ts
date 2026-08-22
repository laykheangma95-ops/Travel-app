import type { DestinationGuide } from '../schema';

const MFAIC: { label: { en: string; km: string }; url: string } = {
  label: { en: 'Cambodian Ministry of Foreign Affairs', km: 'ក្រសួងការបរទេសកម្ពុជា' },
  url: 'https://www.mfaic.gov.kh/en/embassies/royal%20embassy%20of%20cambodia',
};

export const tokyo: DestinationGuide = {
  slug: 'tokyo',
  city: { en: 'Tokyo', km: 'តូក្យូ' },
  country: { en: 'Japan', km: 'ជប៉ុន' },
  countryCode: 'JP',
  esimCountrySlug: 'japan',
  aliases: ['Tokyo', 'តូក្យូ', 'Japan', 'ជប៉ុន', 'Nippon', 'NRT', 'HND', 'Narita', 'Haneda', 'Osaka', 'Kyoto'],
  routeWeight: 7,
  directFlightMins: null,

  geo: { lat: 35.68, lon: 139.69, timezone: 'Asia/Tokyo', flightAltitude: 1.52 },

  arrival: {
    skyColor: '#1b2f5e',
    horizonColor: '#c98a6b',
    intro: {
      en: 'Twelve hours by air with one stop, and a city that runs on the minute. Japan asks more of you before you fly than anywhere else on this list — and rewards it.',
      km: 'ដប់ពីរម៉ោងតាមអាកាសដោយឈប់សម្រាកម្តង ហើយជាទីក្រុងដែលដំណើរការទាន់ម៉ោងគ្រប់នាទី។ ជប៉ុនទាមទារការត្រៀមខ្លួនច្រើនជាងគេមុនពេលហោះហើរ ប៉ុន្តែវាមានតម្លៃ។',
    },
  },

  basics: {
    lastVerified: '2026-08-03',
    currency: { code: 'JPY', name: { en: 'Japanese yen', km: 'យ៉េនជប៉ុន' }, symbol: '¥' },
    tenDollarsBuys: [
      { item: { en: 'A bowl of ramen', km: 'នំបញ្ចុកជប៉ុនមួយចាន' }, localPrice: '¥900' },
      { item: { en: 'A metro ride', km: 'ជិះរថភ្លើងក្រោមដីមួយដង' }, localPrice: '¥180' },
      { item: { en: 'Convenience-store coffee', km: 'កាហ្វេនៅហាងទំនិញ' }, localPrice: '¥120' },
    ],
    languages: [{ en: 'Japanese', km: 'ភាសាជប៉ុន' }],
    hello: { native: 'こんにちは', roman: 'konnichiwa' },
    thankYou: { native: 'ありがとうございます', roman: 'arigatou gozaimasu' },
    plugTypes: ['A', 'B'],
    voltage: '100V · 50/60Hz',
    networks: [
      { name: 'NTT Docomo', note: { en: 'Widest rural coverage', km: 'គ្របដណ្តប់ជនបទល្អបំផុត' } },
      { name: 'SoftBank' },
    ],
  },

  entry: {
    forPassport: 'KH',
    visa: {
      lastVerified: '2026-08-03',
      kind: 'embassy-visa',
      summary: {
        en: 'You need a visa before you fly. Apply through the Embassy of Japan in Phnom Penh — applications are taken in the morning only, and most tourist applications go through a designated travel agency.',
        km: 'អ្នកត្រូវការទិដ្ឋាការមុនពេលហោះហើរ។ ដាក់ពាក្យតាមស្ថានទូតជប៉ុននៅភ្នំពេញ — ទទួលពាក្យតែពេលព្រឹក ហើយពាក្យទេសចរណ៍ភាគច្រើនត្រូវឆ្លងកាត់ភ្នាក់ងារទេសចរណ៍ដែលបានកំណត់។',
      },
      maxStayDays: null,
      costUsd: null,
      applyUrl: 'https://www.kh.emb-japan.go.jp/itpr_en/b_000053.html',
      processingTime: {
        en: 'Allow several working days after the agency submits. Start at least three weeks before you fly.',
        km: 'ត្រូវរង់ចាំច្រើនថ្ងៃធ្វើការបន្ទាប់ពីភ្នាក់ងារដាក់ពាក្យ។ ចាប់ផ្តើមយ៉ាងតិច ៣ សប្តាហ៍មុនហោះហើរ។',
      },
      source: {
        label: { en: 'Embassy of Japan in Cambodia', km: 'ស្ថានទូតជប៉ុនប្រចាំកម្ពុជា' },
        url: 'https://www.kh.emb-japan.go.jp/itpr_en/b_000053.html',
      },
    },
    requirements: [
      {
        lastVerified: '2026-08-03',
        id: 'visit-japan-web',
        title: { en: 'Visit Japan Web', km: 'Visit Japan Web' },
        detail: {
          en: 'Register your immigration and customs declarations online and land with two QR codes ready. It is free, and it is the difference between walking through and queueing.',
          km: 'ចុះឈ្មោះសេចក្តីប្រកាសអន្តោប្រវេសន៍ និងគយតាមអនឡាញ ហើយចុះចតដោយមាន QR ពីរួចរាល់។ វាឥតគិតថ្លៃ ហើយជាភាពខុសគ្នារវាងការដើរឆ្លងកាត់ និងការឈរជួរ។',
        },
        mandatory: false,
        window: { opensDaysBefore: 14 },
        url: 'https://vjw-lp.digital.go.jp/en/',
        source: {
          label: { en: 'Digital Agency, Government of Japan', km: 'ទីភ្នាក់ងារឌីជីថល រដ្ឋាភិបាលជប៉ុន' },
          url: 'https://vjw-lp.digital.go.jp/en/',
        },
      },
      {
        lastVerified: '2026-08-03',
        id: 'return-ticket',
        title: { en: 'Return or onward ticket', km: 'សំបុត្រត្រឡប់ ឬបន្តដំណើរ' },
        detail: {
          en: 'Have it on your phone at immigration. Your visa application will have asked for it already.',
          km: 'ត្រូវមាននៅលើទូរស័ព្ទពេលឆ្លងអន្តោប្រវេសន៍។ ពាក្យសុំទិដ្ឋាការរបស់អ្នកបានស្នើសុំវារួចហើយ។',
        },
        mandatory: true,
      },
      {
        lastVerified: '2026-08-03',
        id: 'medication-check',
        title: { en: 'Check your medication is legal', km: 'ពិនិត្យថាថ្នាំរបស់អ្នកស្របច្បាប់' },
        detail: {
          en: 'Japan bans some medicines that are sold over the counter elsewhere, including anything containing pseudoephedrine. Bring prescriptions in their original packaging.',
          km: 'ជប៉ុនហាមឃាត់ថ្នាំមួយចំនួនដែលលក់ដោយសេរីនៅកន្លែងផ្សេង រួមទាំងថ្នាំដែលមាន pseudoephedrine។ យកថ្នាំតាមវេជ្ជបញ្ជាក្នុងកញ្ចប់ដើម។',
        },
        mandatory: true,
        url: 'https://www.mhlw.go.jp/english/policy/health-medical/pharmaceuticals/01.html',
      },
    ],
    passportValidity: {
      lastVerified: '2026-08-03',
      monthsBeyondStay: 6,
      note: {
        en: 'Six months beyond your return date is the safe rule for the visa application.',
        km: 'ប្រាំមួយខែបន្ទាប់ពីថ្ងៃត្រឡប់ គឺជាច្បាប់សុវត្ថិភាពសម្រាប់ការដាក់ពាក្យទិដ្ឋាការ។',
      },
    },
    customs: {
      lastVerified: '2026-08-03',
      cashDeclareOverUsd: 10000,
      banned: [
        { en: 'Medicines containing pseudoephedrine or codeine', km: 'ថ្នាំដែលមាន pseudoephedrine ឬ codeine' },
        { en: 'Fresh meat, fruit and vegetables', km: 'សាច់ស្រស់ ផ្លែឈើ និងបន្លែ' },
        { en: 'Counterfeit branded goods', km: 'ទំនិញម៉ាកក្លែងក្លាយ' },
      ],
    },
    emergency: {
      lastVerified: '2026-08-03',
      police: '110',
      ambulance: '119',
      fire: '119',
      khmerMission: {
        name: { en: 'Royal Embassy of Cambodia, Tokyo', km: 'ស្ថានឯកអគ្គរាជទូតកម្ពុជា ទីក្រុងតូក្យូ' },
        address: { en: '8-6-9 Akasaka, Minato-ku, Tokyo 107-0052', km: '8-6-9 Akasaka, Minato-ku, តូក្យូ 107-0052' },
        phone: '+81 3 5412 8521',
        email: 'camemb.jpn@mfaic.gov.kh',
        url: 'https://recjpn.mfaic.gov.kh/Contact',
      },
      source: MFAIC,
    },
  },

  around: {
    lastVerified: '2026-08-03',
    fromAirport: [
      {
        mode: { en: 'Narita → Ueno on the Keisei Skyliner', km: 'Narita → Ueno តាមរថភ្លើង Keisei Skyliner' },
        durationMins: 41,
        costLocal: '¥2,570',
        costUsd: 17,
        note: { en: 'The fast one. Reserved seat, luggage space.', km: 'ជម្រើសលឿន។ កៅអីកក់ទុក មានកន្លែងដាក់អីវ៉ាន់។' },
      },
      {
        mode: { en: 'Haneda → Shinagawa on the Keikyu line', km: 'Haneda → Shinagawa តាមខ្សែ Keikyu' },
        durationMins: 15,
        costLocal: '¥330',
        costUsd: 2.2,
        note: { en: 'If you land at Haneda you are almost already there.', km: 'បើអ្នកចុះនៅ Haneda អ្នកស្ទើរតែដល់ហើយ។' },
      },
      {
        mode: { en: 'Airport taxi', km: 'តាក់ស៊ីអាកាសយានដ្ឋាន' },
        durationMins: 70,
        costLocal: '¥20,000+',
        costUsd: 130,
        note: { en: 'Rarely worth it. The train is faster than the road.', km: 'កម្រមានតម្លៃ។ រថភ្លើងលឿនជាងផ្លូវថ្នល់។' },
      },
    ],
    transitCard: {
      name: 'Suica',
      note: {
        en: 'Add Suica to Apple Wallet before you fly and top it up with your card — it works on every train, bus and convenience store. On Android it only works on Japanese-model phones, so bring a physical card instead.',
        km: 'បញ្ចូល Suica ទៅ Apple Wallet មុនពេលហោះហើរ ហើយបញ្ចូលលុយដោយកាតរបស់អ្នក — វាដំណើរការលើរថភ្លើង ឡានក្រុង និងហាងទំនិញទាំងអស់។ លើ Android វាដំណើរការតែលើទូរស័ព្ទម៉ូដែលជប៉ុន ដូច្នេះត្រូវយកកាតរូបវន្តជំនួស។',
      },
      inPhoneWallet: true,
    },
    apps: [
      { name: 'Google Maps', purpose: { en: 'Train times to the minute, platform numbers', km: 'ម៉ោងរថភ្លើងជាក់លាក់ និងលេខផ្លូវ' } },
      { name: 'Japan Transit Planner', purpose: { en: 'Cheapest route between two stations', km: 'ផ្លូវថោកបំផុតរវាងស្ថានីយពីរ' } },
      { name: 'Google Lens', purpose: { en: 'Pointing your camera at a menu', km: 'ភ្ជង់កាមេរ៉ាទៅម៉ឺនុយដើម្បីបកប្រែ' } },
    ],
    money: {
      cambodianCardAccepted: 'widely',
      khqrAccepted: false,
      khqrNote: {
        en: 'KHQR does not work in Japan. Bring a card and cash.',
        km: 'KHQR មិនដំណើរការនៅជប៉ុនទេ។ ត្រូវយកកាត និងសាច់ប្រាក់។',
      },
      cashCulture: {
        en: 'Cards work in the cities, but small restaurants, shrines and older shops are still cash only. Carry ¥10,000 and withdraw more from any 7-Eleven ATM.',
        km: 'កាតដំណើរការក្នុងទីក្រុង ប៉ុន្តែភោជនីយដ្ឋានតូច វត្តអារាម និងហាងចាស់ៗនៅតែទទួលតែសាច់ប្រាក់។ យក ¥10,000 ជាប់ខ្លួន ហើយដកបន្ថែមពី ATM របស់ 7-Eleven។',
      },
      tipping: {
        en: 'Do not tip. It is genuinely not done, and leaving money can cause confusion.',
        km: 'កុំឲ្យទឹកតែ។ វាមិនមែនជាទម្លាប់ទេ ហើយការទុកលុយអាចធ្វើឲ្យមានការភ័ន្តច្រឡំ។',
      },
    },
  },

  places: {
    lastVerified: '2026-08-03',
    list: [
      {
        kind: 'landmark',
        contentSlug: 'japan:sensoji-temple',
        name: { en: 'Senso-ji at dawn', km: 'វត្ត Senso-ji ពេលព្រឹកព្រលឹម' },
        why: {
          en: 'The oldest temple in Tokyo, and empty before seven. By ten it is shoulder to shoulder.',
          km: 'វត្តចំណាស់ជាងគេនៅតូក្យូ ហើយស្ងាត់មុនម៉ោង ៧។ ដល់ម៉ោង ១០ គឺមនុស្សប្រជ្រៀតគ្នា។',
        },
        area: { en: 'Asakusa', km: 'Asakusa' },
        bestTime: { en: 'Before 07:00', km: 'មុនម៉ោង ០៧:០០' },
        roughCostUsd: 0,
      },
      {
        kind: 'popular-with-cambodians',
        contentSlug: 'japan:shibuya-crossing',
        name: { en: 'Shibuya Crossing and Shibuya Sky', km: 'ផ្លូវឆ្លងកាត់ Shibuya និង Shibuya Sky' },
        why: {
          en: 'The photograph everyone comes home with. Book Shibuya Sky for sunset a few days ahead — it sells out.',
          km: 'រូបថតដែលគ្រប់គ្នាយកមកផ្ទះ។ កក់ Shibuya Sky សម្រាប់ថ្ងៃលិចមុនពីរបីថ្ងៃ — សំបុត្រអស់លឿន។',
        },
        area: { en: 'Shibuya', km: 'Shibuya' },
        bestTime: { en: 'Sunset', km: 'ពេលថ្ងៃលិច' },
        roughCostUsd: 16,
      },
      {
        kind: 'hidden-gem',
        contentSlug: 'japan:yanaka-ginza',
        name: { en: 'Yanaka Ginza', km: 'ផ្លូវ Yanaka Ginza' },
        why: {
          en: 'A low wooden shopping street that survived the war and the bubble. Cats, croquettes, no tour buses.',
          km: 'ផ្លូវហាងឈើទាបដែលរួចផុតពីសង្គ្រាម និងវិបត្តិសេដ្ឋកិច្ច។ មានឆ្មា នំ croquette និងគ្មានឡានក្រុងទេសចរ។',
        },
        area: { en: 'Yanaka', km: 'Yanaka' },
        roughCostUsd: 5,
      },
      {
        kind: 'hidden-gem',
        contentSlug: 'japan:todoroki-valley',
        name: { en: 'Todoroki Valley', km: 'ជ្រលង Todoroki' },
        why: {
          en: 'A cool green ravine inside the city limits, ten minutes from a train station and almost never in a guidebook.',
          km: 'ជ្រលងបៃតងត្រជាក់នៅក្នុងទីក្រុង ដប់នាទីពីស្ថានីយរថភ្លើង ហើយស្ទើរតែមិនដែលមានក្នុងសៀវភៅមគ្គុទ្ទេសក៍។',
        },
        area: { en: 'Setagaya', km: 'Setagaya' },
        roughCostUsd: 0,
      },
    ],
  },
};
