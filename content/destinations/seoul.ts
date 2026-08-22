import type { DestinationGuide } from '../schema';

export const seoul: DestinationGuide = {
  slug: 'seoul',
  city: { en: 'Seoul', km: 'សេអ៊ូល' },
  country: { en: 'South Korea', km: 'កូរ៉េខាងត្បូង' },
  countryCode: 'KR',
  esimCountrySlug: 'south-korea',
  aliases: ['Seoul', 'សេអ៊ូល', 'Korea', 'South Korea', 'កូរ៉េ', 'ICN', 'Incheon', 'Busan', 'Gangnam'],
  routeWeight: 8,
  directFlightMins: 310,

  geo: { lat: 37.57, lon: 126.98, timezone: 'Asia/Seoul', flightAltitude: 1.5 },

  arrival: {
    skyColor: '#1d2c56',
    horizonColor: '#b98aa8',
    intro: {
      en: 'Five hours direct, and the visa is the hard part — not the trip. Once you are through, Seoul is the easiest big city in Asia to get around without a word of the language.',
      km: 'ប្រាំម៉ោងផ្ទាល់ ហើយទិដ្ឋាការជាផ្នែកលំបាក — មិនមែនដំណើរទេ។ នៅពេលអ្នកឆ្លងផុត សេអ៊ូលគឺជាទីក្រុងធំងាយស្រួលបំផុតនៅអាស៊ីក្នុងការធ្វើដំណើរ ដោយមិនចាំបាច់ចេះភាសា។',
    },
  },

  basics: {
    lastVerified: '2026-08-03',
    currency: { code: 'KRW', name: { en: 'Korean won', km: 'វ៉ុនកូរ៉េ' }, symbol: '₩' },
    tenDollarsBuys: [
      { item: { en: 'A bowl of kalguksu', km: 'មីកាត់មួយចាន' }, localPrice: '₩9,000' },
      { item: { en: 'A subway ride', km: 'ជិះរថភ្លើងក្រោមដី' }, localPrice: '₩1,400' },
      { item: { en: 'Convenience-store dinner', km: 'អាហារពេលល្ងាចនៅហាងទំនិញ' }, localPrice: '₩5,000' },
    ],
    languages: [{ en: 'Korean', km: 'ភាសាកូរ៉េ' }],
    hello: { native: '안녕하세요', roman: 'annyeonghaseyo' },
    thankYou: { native: '감사합니다', roman: 'gamsahamnida' },
    plugTypes: ['C', 'F'],
    voltage: '220V · 60Hz',
    networks: [{ name: 'SK Telecom' }, { name: 'KT' }],
  },

  entry: {
    forPassport: 'KH',
    visa: {
      lastVerified: '2026-08-03',
      kind: 'embassy-visa',
      summary: {
        en: 'A visa is required, and K-ETA is not an alternative — that scheme is only for nationalities Korea already admits visa-free. Apply in person at the Embassy of the Republic of Korea in Phnom Penh, mornings only.',
        km: 'ត្រូវការទិដ្ឋាការ ហើយ K-ETA មិនមែនជាជម្រើសជំនួសទេ — កម្មវិធីនោះសម្រាប់តែសញ្ជាតិដែលកូរ៉េអនុញ្ញាតឲ្យចូលដោយឥតទិដ្ឋាការស្រាប់។ ដាក់ពាក្យដោយផ្ទាល់នៅស្ថានទូតកូរ៉េនៅភ្នំពេញ តែពេលព្រឹក។',
      },
      maxStayDays: null,
      costUsd: null,
      applyUrl: 'https://overseas.mofa.go.kr/kh-en/brd/m_25536/view.do?seq=1',
      processingTime: {
        en: 'Plan on several weeks. Financial evidence and an itinerary are part of the file.',
        km: 'ត្រូវគ្រោងទុកច្រើនសប្តាហ៍។ ភស្តុតាងហិរញ្ញវត្ថុ និងកម្មវិធីធ្វើដំណើរជាផ្នែកនៃឯកសារ។',
      },
      source: {
        label: { en: 'Embassy of the Republic of Korea in Cambodia', km: 'ស្ថានទូតសាធារណរដ្ឋកូរ៉េប្រចាំកម្ពុជា' },
        url: 'https://overseas.mofa.go.kr/kh-en/brd/m_25536/view.do?seq=1',
      },
    },
    requirements: [
      {
        lastVerified: '2026-08-03',
        id: 'korea-visa',
        title: { en: 'Start the visa first, book the flight second', km: 'ចាប់ផ្តើមទិដ្ឋាការមុន កក់សំបុត្រយន្តហោះក្រោយ' },
        detail: {
          en: 'This is the one destination on Domner where a non-refundable ticket before the visa is a genuine risk. The embassy takes applications in the morning on working days.',
          km: 'នេះជាគោលដៅតែមួយនៅ Domner ដែលការទិញសំបុត្រមិនអាចសងវិញមុនទទួលទិដ្ឋាការ គឺជាហានិភ័យពិតប្រាកដ។ ស្ថានទូតទទួលពាក្យពេលព្រឹកនៅថ្ងៃធ្វើការ។',
        },
        mandatory: true,
        url: 'https://overseas.mofa.go.kr/kh-en/index.do',
      },
      {
        lastVerified: '2026-08-03',
        id: 'q-code',
        title: { en: 'Q-CODE health declaration, if asked', km: 'សេចក្តីប្រកាសសុខភាព Q-CODE បើត្រូវការ' },
        detail: {
          en: 'Korea runs an online health declaration that is switched on and off depending on conditions. Check the official site a week before you fly; when it is active, filling it in beforehand skips a queue at Incheon.',
          km: 'កូរ៉េមានសេចក្តីប្រកាសសុខភាពតាមអនឡាញ ដែលបើក និងបិទតាមស្ថានការណ៍។ ពិនិត្យគេហទំព័រផ្លូវការមួយសប្តាហ៍មុនហោះហើរ។ ពេលវាដំណើរការ ការបំពេញជាមុនជួយរំលងជួរនៅ Incheon។',
        },
        mandatory: false,
        window: { opensDaysBefore: 3 },
        url: 'https://cov19ent.kdca.go.kr/',
      },
    ],
    passportValidity: { lastVerified: '2026-08-03', monthsBeyondStay: 6 },
    customs: {
      lastVerified: '2026-08-03',
      cashDeclareOverUsd: 10000,
      banned: [
        { en: 'Fresh meat and unprocessed food products', km: 'សាច់ស្រស់ និងផលិតផលអាហារមិនទាន់កែច្នៃ' },
        { en: 'Counterfeit branded goods', km: 'ទំនិញម៉ាកក្លែងក្លាយ' },
      ],
    },
    emergency: {
      lastVerified: '2026-08-03',
      police: '112',
      ambulance: '119',
      fire: '119',
      khmerMission: {
        name: { en: 'Royal Embassy of Cambodia, Seoul', km: 'ស្ថានឯកអគ្គរាជទូតកម្ពុជា ទីក្រុងសេអ៊ូល' },
        address: { en: 'Hannam-dong, Yongsan-gu, Seoul', km: 'Hannam-dong, Yongsan-gu, សេអ៊ូល' },
        phone: '+82 2 3785 1041',
        email: 'camemb.kor@mfa.gov.kh',
        url: 'https://camembkor.mfaic.gov.kh/',
      },
      source: {
        label: { en: 'Cambodian Ministry of Foreign Affairs', km: 'ក្រសួងការបរទេសកម្ពុជា' },
        url: 'https://www.mfaic.gov.kh/en/embassies/royal%20embassy%20of%20cambodia',
      },
    },
  },

  around: {
    lastVerified: '2026-08-03',
    fromAirport: [
      {
        mode: { en: 'Incheon → Seoul Station on the AREX express', km: 'Incheon → ស្ថានីយសេអ៊ូល តាមរថភ្លើងលឿន AREX' },
        durationMins: 43,
        costLocal: '₩11,000',
        costUsd: 8,
        note: { en: 'Reserved seat, no stops.', km: 'កៅអីកក់ទុក មិនឈប់តាមផ្លូវ។' },
      },
      {
        mode: { en: 'Incheon → Seoul Station, all-stop train', km: 'Incheon → ស្ថានីយសេអ៊ូល រថភ្លើងឈប់គ្រប់ស្ថានីយ' },
        durationMins: 60,
        costLocal: '₩4,750',
        costUsd: 3.5,
        note: { en: 'Half the price, seventeen more minutes.', km: 'តម្លៃពាក់កណ្តាល យឺតជាង ១៧ នាទី។' },
      },
      {
        mode: { en: 'Airport limousine bus', km: 'ឡានក្រុង limousine អាកាសយានដ្ឋាន' },
        durationMins: 70,
        costLocal: '₩17,000',
        costUsd: 12.5,
        note: { en: 'Worth it if your hotel is on the route and you have luggage.', km: 'មានតម្លៃបើសណ្ឋាគាររបស់អ្នកនៅតាមផ្លូវ ហើយអ្នកមានអីវ៉ាន់។' },
      },
    ],
    transitCard: {
      name: 'T-money',
      note: {
        en: 'Buy one at any convenience store for about ₩3,000 and top it up with cash at the machines. It covers subway, buses and most taxis. Foreign phones cannot hold it, so carry the card.',
        km: 'ទិញនៅហាងទំនិញណាក៏បាន ក្នុងតម្លៃប្រហែល ₩3,000 ហើយបញ្ចូលលុយដោយសាច់ប្រាក់នៅម៉ាស៊ីន។ វាប្រើបានលើរថភ្លើងក្រោមដី ឡានក្រុង និងតាក់ស៊ីភាគច្រើន។ ទូរស័ព្ទបរទេសមិនអាចផ្ទុកវាបានទេ ដូច្នេះត្រូវយកកាតជាប់ខ្លួន។',
      },
      inPhoneWallet: false,
    },
    apps: [
      { name: 'Naver Map', purpose: { en: 'Google Maps does not do walking directions in Korea — this does', km: 'Google Maps មិនណែនាំផ្លូវថ្មើរជើងនៅកូរ៉េទេ — កម្មវិធីនេះធ្វើបាន' } },
      { name: 'Kakao T', purpose: { en: 'Taxis. Grab does not operate here', km: 'តាក់ស៊ី។ Grab មិនដំណើរការនៅទីនេះទេ' } },
      { name: 'Papago', purpose: { en: 'Korean translation that actually reads well', km: 'ការបកប្រែភាសាកូរ៉េដែលអានបានល្អ' } },
    ],
    money: {
      cambodianCardAccepted: 'widely',
      khqrAccepted: false,
      khqrNote: {
        en: 'KHQR does not work in Korea. Cards do, almost everywhere.',
        km: 'KHQR មិនដំណើរការនៅកូរ៉េទេ។ កាតដំណើរការស្ទើរតែគ្រប់កន្លែង។',
      },
      cashCulture: {
        en: 'One of the most card-friendly countries in the world — even a ₩1,000 coffee. Keep a little cash for markets and the T-money top-up machines.',
        km: 'ជាប្រទេសមួយក្នុងចំណោមប្រទេសដែលងាយស្រួលប្រើកាតបំផុតក្នុងពិភពលោក — សូម្បីតែកាហ្វេ ₩1,000។ ទុកសាច់ប្រាក់តិចតួចសម្រាប់ផ្សារ និងម៉ាស៊ីនបញ្ចូល T-money។',
      },
      tipping: {
        en: 'Not expected anywhere, including taxis and restaurants.',
        km: 'មិនចាំបាច់នៅកន្លែងណាទេ រួមទាំងតាក់ស៊ី និងភោជនីយដ្ឋាន។',
      },
    },
  },

  places: {
    lastVerified: '2026-08-03',
    list: [
      {
        kind: 'landmark',
        contentSlug: 'south-korea:gyeongbokgung-palace',
        name: { en: 'Gyeongbokgung, in hanbok', km: 'ព្រះបរមរាជវាំង Gyeongbokgung ក្នុងសំលៀកបំពាក់ hanbok' },
        why: {
          en: 'Rent a hanbok outside the gate and entry to the palace is free. That is the actual rule, not a trick.',
          km: 'ជួល hanbok នៅខាងក្រៅច្រកទ្វារ នោះការចូលព្រះបរមរាជវាំងឥតគិតថ្លៃ។ នេះជាច្បាប់ពិត មិនមែនល្បិចទេ។',
        },
        area: { en: 'Jongno', km: 'Jongno' },
        bestTime: { en: 'Closed Tuesdays', km: 'បិទថ្ងៃអង្គារ' },
        roughCostUsd: 10,
      },
      {
        kind: 'popular-with-cambodians',
        contentSlug: 'south-korea:myeongdong-shopping-street',
        name: { en: 'Myeongdong at night', km: 'Myeongdong ពេលយប់' },
        why: {
          en: 'Skincare, street food and the crowd. Prices are better one street back from the main drag.',
          km: 'គ្រឿងសម្អាង អាហារតាមផ្លូវ និងហ្វូងមនុស្ស។ តម្លៃថោកជាងនៅផ្លូវមួយក្រោយផ្លូវធំ។',
        },
        area: { en: 'Jung-gu', km: 'Jung-gu' },
        bestTime: { en: 'After 18:00', km: 'ក្រោយម៉ោង ១៨:០០' },
        roughCostUsd: 0,
      },
      {
        kind: 'hidden-gem',
        contentSlug: 'south-korea:ihwa-mural-village',
        name: { en: 'Ihwa Mural Village', km: 'ភូមិគំនូរជញ្ជាំង Ihwa' },
        why: {
          en: 'A steep hillside neighbourhood painted by artists, with the best free view over the old city. People live here — go quietly.',
          km: 'សង្កាត់លើភ្នំចោតដែលសិល្បករបានគូរ ជាមួយទេសភាពឥតគិតថ្លៃល្អបំផុតលើទីក្រុងចាស់។ មនុស្សរស់នៅទីនេះ — ត្រូវទៅដោយស្ងាត់ស្ងៀម។',
        },
        area: { en: 'Naksan', km: 'Naksan' },
        roughCostUsd: 0,
      },
    ],
  },
};
