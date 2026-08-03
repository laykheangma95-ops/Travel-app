import type { DestinationGuide } from '../schema';

export const kualaLumpur: DestinationGuide = {
  slug: 'kuala-lumpur',
  city: { en: 'Kuala Lumpur', km: 'កូឡាឡាំពួរ' },
  country: { en: 'Malaysia', km: 'ម៉ាឡេស៊ី' },
  countryCode: 'MY',
  esimCountrySlug: 'malaysia',
  aliases: ['Kuala Lumpur', 'កូឡាឡាំពួរ', 'Malaysia', 'ម៉ាឡេស៊ី', 'KL', 'KUL', 'Penang', 'Johor'],
  routeWeight: 7,
  directFlightMins: 120,

  geo: { lat: 3.14, lon: 101.69, timezone: 'Asia/Kuala_Lumpur', flightAltitude: 1.45 },

  arrival: {
    skyColor: '#20315c',
    horizonColor: '#c58f77',
    intro: {
      en: 'Two hours, no visa, and a city where you can eat Malay, Chinese and Indian food in one street. The cheapest of the easy trips.',
      km: 'ពីរម៉ោង គ្មានទិដ្ឋាការ ហើយជាទីក្រុងដែលអ្នកអាចញ៉ាំអាហារម៉ាឡេ ចិន និងឥណ្ឌាក្នុងផ្លូវតែមួយ។ ជាដំណើរងាយស្រួលដែលថោកបំផុត។',
    },
  },

  basics: {
    lastVerified: '2026-08-03',
    currency: { code: 'MYR', name: { en: 'Malaysian ringgit', km: 'រីងហ្គីតម៉ាឡេស៊ី' }, symbol: 'RM' },
    tenDollarsBuys: [
      { item: { en: 'Three plates of nasi lemak', km: 'បាយ nasi lemak បីចាន' }, localPrice: 'RM12' },
      { item: { en: 'An LRT ride across the city', km: 'ជិះ LRT ឆ្លងកាត់ទីក្រុង' }, localPrice: 'RM3' },
      { item: { en: 'Teh tarik and roti canai', km: 'តែ tarik និងនំ roti canai' }, localPrice: 'RM6' },
    ],
    languages: [
      { en: 'Malay', km: 'ភាសាម៉ាឡេ' },
      { en: 'English', km: 'អង់គ្លេស' },
      { en: 'Mandarin', km: 'ចិនកុកងឺ' },
    ],
    hello: { native: 'Selamat pagi', roman: 'se-la-mat pa-gi' },
    thankYou: { native: 'Terima kasih', roman: 'te-ri-ma ka-sih' },
    plugTypes: ['G'],
    voltage: '240V · 50Hz',
    networks: [{ name: 'Maxis' }, { name: 'CelcomDigi' }],
  },

  entry: {
    forPassport: 'KH',
    visa: {
      lastVerified: '2026-08-03',
      kind: 'visa-free',
      summary: {
        en: 'No visa needed for tourism. Cambodian passport holders enter visa-free as an ASEAN national — the officer stamps your permitted stay on arrival.',
        km: 'មិនត្រូវការទិដ្ឋាការសម្រាប់ទេសចរណ៍ទេ។ អ្នកកាន់លិខិតឆ្លងដែនកម្ពុជាចូលដោយឥតទិដ្ឋាការក្នុងនាមជាពលរដ្ឋអាស៊ាន — មន្ត្រីបោះត្រារយៈពេលស្នាក់នៅពេលមកដល់។',
      },
      maxStayDays: 30,
      costUsd: 0,
      applyUrl: 'https://www.imi.gov.my/index.php/en/main-services/visa/visa-requirement-by-country/',
      source: {
        label: { en: 'Immigration Department of Malaysia', km: 'នាយកដ្ឋានអន្តោប្រវេសន៍ម៉ាឡេស៊ី' },
        url: 'https://www.imi.gov.my/index.php/en/main-services/visa/visa-requirement-by-country/',
      },
    },
    requirements: [
      {
        lastVerified: '2026-08-03',
        id: 'mdac',
        title: { en: 'Malaysia Digital Arrival Card (MDAC)', km: 'ប័ណ្ណចូលឌីជីថលម៉ាឡេស៊ី (MDAC)' },
        detail: {
          en: 'Submit online in the three days before you arrive. It is free on the Immigration Department site — imigresen-online.imi.gov.my. Paid lookalike sites are everywhere in search results; none of them are official.',
          km: 'ដាក់ស្នើតាមអនឡាញក្នុងរយៈពេលបីថ្ងៃមុនពេលមកដល់។ វាឥតគិតថ្លៃនៅគេហទំព័រនាយកដ្ឋានអន្តោប្រវេសន៍ — imigresen-online.imi.gov.my។ គេហទំព័រក្លែងក្លាយដែលគិតថ្លៃមានច្រើនក្នុងលទ្ធផលស្វែងរក គ្មានមួយណាជាផ្លូវការទេ។',
        },
        mandatory: true,
        window: { opensDaysBefore: 3 },
        url: 'https://imigresen-online.imi.gov.my/mdac/main',
        source: {
          label: { en: 'Immigration Department of Malaysia', km: 'នាយកដ្ឋានអន្តោប្រវេសន៍ម៉ាឡេស៊ី' },
          url: 'https://www.imi.gov.my/index.php/en/pengumuman/malaysia-digital-arrival-card-mdac/',
        },
      },
      {
        lastVerified: '2026-08-03',
        id: 'onward-ticket',
        title: { en: 'Return ticket and hotel address', km: 'សំបុត្រត្រឡប់ និងអាសយដ្ឋានសណ្ឋាគារ' },
        detail: {
          en: 'The MDAC asks for both, and immigration may ask again at the counter.',
          km: 'MDAC សុំទាំងពីរ ហើយអន្តោប្រវេសន៍អាចសួរម្តងទៀតនៅបញ្ជរ។',
        },
        mandatory: true,
      },
    ],
    passportValidity: { lastVerified: '2026-08-03', monthsBeyondStay: 6 },
    customs: {
      lastVerified: '2026-08-03',
      cashDeclareOverUsd: 10000,
      banned: [
        { en: 'Drugs — Malaysia carries the death penalty for trafficking', km: 'គ្រឿងញៀន — ម៉ាឡេស៊ីមានទោសប្រហារជីវិតចំពោះការជួញដូរ' },
        { en: 'Pornographic material', km: 'សម្ភារៈអាសអាភាស' },
        { en: 'Weapons and imitation firearms', km: 'អាវុធ និងកាំភ្លើងក្លែងក្លាយ' },
      ],
    },
    emergency: {
      lastVerified: '2026-08-03',
      police: '999',
      ambulance: '999',
      fire: '994',
      khmerMission: {
        name: { en: 'Royal Embassy of Cambodia, Kuala Lumpur', km: 'ស្ថានឯកអគ្គរាជទូតកម្ពុជា កូឡាឡាំពួរ' },
        address: { en: 'No. 46, Jalan U-Thant, 55000 Kuala Lumpur', km: 'លេខ ៤៦, Jalan U-Thant, 55000 កូឡាឡាំពួរ' },
        phone: '+60 3 4257 1150',
        email: 'camemb.mys@mfa.gov.kh',
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
        mode: { en: 'KLIA → KL Sentral on the KLIA Ekspres', km: 'KLIA → KL Sentral តាម KLIA Ekspres' },
        durationMins: 28,
        costLocal: 'RM55',
        costUsd: 12,
        note: { en: 'Cheaper if you buy the return online in advance.', km: 'ថោកជាងបើទិញសំបុត្រទៅមកតាមអនឡាញជាមុន។' },
      },
      {
        mode: { en: 'Airport coach to KL Sentral', km: 'ឡានក្រុងអាកាសយានដ្ឋានទៅ KL Sentral' },
        durationMins: 60,
        costLocal: 'RM15',
        costUsd: 3.2,
        note: { en: 'The value option, and perfectly comfortable.', km: 'ជម្រើសសមរម្យ ហើយស្រួលល្មម។' },
      },
      {
        mode: { en: 'Grab from the airport', km: 'Grab ពីអាកាសយានដ្ឋាន' },
        durationMins: 55,
        costLocal: 'RM75–95',
        costUsd: 18,
      },
    ],
    transitCard: {
      name: "Touch 'n Go",
      note: {
        en: "Buy a Touch 'n Go card at the station — it covers LRT, MRT, monorail and buses, and you can also tap it at some shops. The eWallet version needs a Malaysian number, so get the physical card.",
        km: "ទិញកាត Touch 'n Go នៅស្ថានីយ — វាប្រើបានលើ LRT, MRT, monorail និងឡានក្រុង ហើយអ្នកក៏អាចប៉ះនៅហាងខ្លះដែរ។ កំណែ eWallet ត្រូវការលេខទូរស័ព្ទម៉ាឡេស៊ី ដូច្នេះត្រូវយកកាតរូបវន្ត។",
      },
      inPhoneWallet: false,
    },
    apps: [
      { name: 'Grab', purpose: { en: 'Rides and food — dominant here', km: 'ការធ្វើដំណើរ និងអាហារ — ពេញនិយមបំផុតនៅទីនេះ' } },
      { name: 'Moovit', purpose: { en: 'Train and bus routing across the KL network', km: 'ការណែនាំផ្លូវរថភ្លើង និងឡានក្រុងក្នុងបណ្តាញ KL' } },
    ],
    money: {
      cambodianCardAccepted: 'widely',
      khqrAccepted: true,
      khqrNote: {
        en: 'Bakong supports cross-border QR with Malaysia, so your KHQR app can pay at DuitNow merchants. Check the cross-border section in the Bakong app before you count on it.',
        km: 'Bakong គាំទ្រ QR ឆ្លងដែនជាមួយម៉ាឡេស៊ី ដូច្នេះកម្មវិធី KHQR របស់អ្នកអាចបង់ប្រាក់នៅហាងដែលប្រើ DuitNow។ ពិនិត្យផ្នែកឆ្លងដែនក្នុងកម្មវិធី Bakong មុនពេលពឹងផ្អែកលើវា។',
      },
      cashCulture: {
        en: 'Cards work in malls and restaurants; hawker stalls and markets are cash or QR. RM100 in small notes covers a few days of street food.',
        km: 'កាតដំណើរការនៅផ្សារទំនើប និងភោជនីយដ្ឋាន។ តូបលក់អាហារ និងផ្សារគឺសាច់ប្រាក់ ឬ QR។ RM100 ជាក្រដាសតូចៗគ្រប់គ្រាន់សម្រាប់អាហារតាមផ្លូវពីរបីថ្ងៃ។',
      },
      tipping: {
        en: 'Not expected. Restaurants often add a 10% service charge already.',
        km: 'មិនចាំបាច់ទេ។ ភោជនីយដ្ឋានតែងតែបូកថ្លៃសេវា ១០% រួចហើយ។',
      },
    },
  },

  places: {
    lastVerified: '2026-08-03',
    list: [
      {
        kind: 'landmark',
        name: { en: 'Batu Caves', km: 'រូងភ្នំ Batu' },
        why: {
          en: '272 painted steps to a limestone cave temple, free to enter, and forty minutes on the commuter train from KL Sentral.',
          km: 'ជណ្តើរលាបពណ៌ ២៧២ កាំឡើងទៅវត្តក្នុងរូងភ្នំកំបោរ ចូលឥតគិតថ្លៃ ហើយសែសិបនាទីតាមរថភ្លើងពី KL Sentral។',
        },
        area: { en: 'Gombak', km: 'Gombak' },
        bestTime: { en: 'Before 09:00 — the steps get very hot', km: 'មុនម៉ោង ០៩:០០ — ជណ្តើរក្តៅខ្លាំង' },
        roughCostUsd: 1,
      },
      {
        kind: 'popular-with-cambodians',
        name: { en: 'Petronas Towers from KLCC Park', km: 'អគារ Petronas ពីសួន KLCC' },
        why: {
          en: 'The photograph is free from the park, and the fountain show runs in the evening. The Skybridge ticket sells out days ahead.',
          km: 'ការថតរូបឥតគិតថ្លៃពីសួន ហើយការបង្ហាញទឹកផុសដំណើរការពេលល្ងាច។ សំបុត្រ Skybridge អស់មុនច្រើនថ្ងៃ។',
        },
        area: { en: 'KLCC', km: 'KLCC' },
        bestTime: { en: '20:00 for the fountains', km: 'ម៉ោង ២០:០០ សម្រាប់ទឹកផុស' },
        roughCostUsd: 0,
      },
      {
        kind: 'hidden-gem',
        name: { en: 'Kampung Baru on a Sunday morning', km: 'Kampung Baru ព្រឹកថ្ងៃអាទិត្យ' },
        why: {
          en: 'Wooden Malay houses and a village breakfast market, standing in the shadow of the towers. It is the oldest part of the city and almost nobody visits.',
          km: 'ផ្ទះឈើម៉ាឡេ និងផ្សារអាហារពេលព្រឹកបែបភូមិ ស្ថិតក្នុងម្លប់អគារខ្ពស់។ វាជាតំបន់ចាស់បំផុតនៃទីក្រុង ហើយស្ទើរតែគ្មាននរណាទៅទស្សនា។',
        },
        area: { en: 'Kampung Baru', km: 'Kampung Baru' },
        bestTime: { en: 'Sunday, 07:00–10:00', km: 'ថ្ងៃអាទិត្យ ០៧:០០–១០:០០' },
        roughCostUsd: 3,
      },
    ],
  },
};
