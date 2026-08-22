import type { DestinationGuide } from '../schema';
import { vietnamEntry } from './_vietnam';

export const hoChiMinhCity: DestinationGuide = {
  slug: 'ho-chi-minh-city',
  city: { en: 'Ho Chi Minh City', km: 'ហូជីមិញ' },
  country: { en: 'Vietnam', km: 'វៀតណាម' },
  countryCode: 'VN',
  esimCountrySlug: 'vietnam',
  aliases: ['Ho Chi Minh City', 'ហូជីមិញ', 'Saigon', 'ព្រៃនគរ', 'Vietnam', 'វៀតណាម', 'SGN', 'HCMC'],
  routeWeight: 10,
  directFlightMins: 55,

  geo: { lat: 10.82, lon: 106.63, timezone: 'Asia/Ho_Chi_Minh', flightAltitude: 1.42 },

  arrival: {
    skyColor: '#22355e',
    horizonColor: '#d99a6c',
    intro: {
      en: 'Fifty-five minutes in the air — barely long enough for the drinks trolley. The closest foreign city to Phnom Penh, and the one most Cambodians see first.',
      km: 'ហាសិបប្រាំនាទីលើអាកាស — ស្ទើរតែមិនទាន់បានផឹកទឹក។ ជាទីក្រុងបរទេសដែលនៅជិតភ្នំពេញបំផុត ហើយជាកន្លែងដែលខ្មែរភាគច្រើនឃើញមុនគេ។',
    },
  },

  basics: {
    lastVerified: '2026-08-03',
    currency: { code: 'VND', name: { en: 'Vietnamese dong', km: 'ដុងវៀតណាម' }, symbol: '₫' },
    tenDollarsBuys: [
      { item: { en: 'Four bowls of phở', km: 'គុយទាវ phở បួនចាន' }, localPrice: '250,000₫' },
      { item: { en: 'A Grab bike across District 1', km: 'ជិះម៉ូតូ Grab ឆ្លងកាត់ស្រុកទី ១' }, localPrice: '25,000₫' },
      { item: { en: 'Iced coffee with condensed milk', km: 'កាហ្វេទឹកកកជាមួយទឹកដោះគោ' }, localPrice: '25,000₫' },
    ],
    languages: [{ en: 'Vietnamese', km: 'ភាសាវៀតណាម' }],
    hello: { native: 'Xin chào', roman: 'sin chao' },
    thankYou: { native: 'Cảm ơn', roman: 'gam un' },
    plugTypes: ['A', 'C'],
    voltage: '220V · 50Hz',
    networks: [{ name: 'Viettel' }, { name: 'MobiFone' }],
  },

  entry: vietnamEntry,

  around: {
    lastVerified: '2026-08-03',
    fromAirport: [
      {
        mode: { en: 'Tan Son Nhat → District 1 by Grab', km: 'Tan Son Nhat → ស្រុកទី ១ តាម Grab' },
        durationMins: 30,
        costLocal: '150,000–200,000₫',
        costUsd: 7,
        note: {
          en: 'Book it in the app before you leave the terminal so the price is fixed. Ignore drivers who approach you.',
          km: 'កក់ក្នុងកម្មវិធីមុនចេញពីអាកាសយានដ្ឋាន ដើម្បីឲ្យតម្លៃថេរ។ កុំខ្វល់នឹងអ្នកបើកបរដែលចូលមករកអ្នក។',
        },
      },
      {
        mode: { en: 'Bus 109 to Ben Thanh', km: 'ឡានក្រុងលេខ ១០៩ ទៅ Ben Thanh' },
        durationMins: 45,
        costLocal: '15,000₫',
        costUsd: 0.6,
        note: { en: 'Air-conditioned, runs until late evening.', km: 'មានម៉ាស៊ីនត្រជាក់ ដំណើរការដល់យប់។' },
      },
    ],
    apps: [
      { name: 'Grab', purpose: { en: 'Bikes, cars, food — the same account you use at home', km: 'ម៉ូតូ ឡាន អាហារ — គណនីដូចអ្នកប្រើនៅផ្ទះ' } },
      { name: 'Be', purpose: { en: 'Local rival to Grab, often cheaper', km: 'គូប្រជែងក្នុងស្រុករបស់ Grab ជាញឹកញាប់ថោកជាង' } },
      { name: 'Google Translate', purpose: { en: 'Camera mode on menus — Vietnamese OCR is good', km: 'របៀបកាមេរ៉ាលើម៉ឺនុយ — ការអានអក្សរវៀតណាមល្អ' } },
    ],
    money: {
      cambodianCardAccepted: 'sometimes',
      khqrAccepted: true,
      khqrNote: {
        en: 'Bakong supports cross-border QR with Vietnam, so your KHQR app can pay at VietQR merchants — genuinely useful here, because so much of the city is QR-first. Check the cross-border section in the Bakong app before you rely on it.',
        km: 'Bakong គាំទ្រ QR ឆ្លងដែនជាមួយវៀតណាម ដូច្នេះកម្មវិធី KHQR របស់អ្នកអាចបង់ប្រាក់នៅហាងដែលប្រើ VietQR — មានប្រយោជន៍ពិតប្រាកដនៅទីនេះ ព្រោះទីក្រុងភាគច្រើនប្រើ QR ជាចម្បង។ ពិនិត្យផ្នែកឆ្លងដែនក្នុងកម្មវិធី Bakong មុនពេលពឹងផ្អែកលើវា។',
      },
      cashCulture: {
        en: 'Cash and QR run the city; cards are for hotels and bigger restaurants. USD is not accepted in shops — change it or withdraw dong. Note the zeros: 100,000₫ is about $4.',
        km: 'សាច់ប្រាក់ និង QR ជាចម្បងនៅទីក្រុងនេះ។ កាតសម្រាប់សណ្ឋាគារ និងភោជនីយដ្ឋានធំ។ ដុល្លារមិនត្រូវបានទទួលនៅហាងទេ — ត្រូវប្តូរ ឬដកដុង។ ចាំពីលេខសូន្យ៖ 100,000₫ ប្រហែល $4។',
      },
      tipping: {
        en: 'Not expected. Rounding up a Grab fare is a kind gesture, not an obligation.',
        km: 'មិនចាំបាច់ទេ។ ការបង្គត់ថ្លៃ Grab ឡើងលើគឺជាការសប្បុរស មិនមែនកាតព្វកិច្ចទេ។',
      },
    },
  },

  places: {
    lastVerified: '2026-08-03',
    list: [
      {
        kind: 'landmark',
        contentSlug: 'vietnam:war-remnants-museum',
        name: { en: 'War Remnants Museum', km: 'សារមន្ទីរដាននៃសង្គ្រាម' },
        why: {
          en: 'Hard, and the most honest hour you will spend in the city. Go in the morning while you still have the energy for it.',
          km: 'ពិបាកចិត្ត តែជាមួយម៉ោងដែលពិតបំផុតដែលអ្នកនឹងចំណាយក្នុងទីក្រុងនេះ។ ទៅពេលព្រឹកខណៈអ្នកនៅមានកម្លាំងចិត្ត។',
        },
        area: { en: 'District 3', km: 'ស្រុកទី ៣' },
        roughCostUsd: 2,
      },
      {
        kind: 'popular-with-cambodians',
        contentSlug: 'vietnam:ben-thanh-market',
        name: { en: 'Ben Thanh market and the night street', km: 'ផ្សារ Ben Thanh និងផ្លូវពេលយប់' },
        why: {
          en: 'Bargain to about half the first price inside the market. The night stalls outside are cheaper and better for food.',
          km: 'ត្រូវតថ្លៃមកប្រហែលពាក់កណ្តាលនៃតម្លៃដំបូងខាងក្នុងផ្សារ។ តូបពេលយប់នៅខាងក្រៅថោកជាង ហើយអាហារឆ្ងាញ់ជាង។',
        },
        area: { en: 'District 1', km: 'ស្រុកទី ១' },
        bestTime: { en: 'Night market from 19:00', km: 'ផ្សារយប់ចាប់ពីម៉ោង ១៩:០០' },
        roughCostUsd: 0,
      },
      {
        kind: 'hidden-gem',
        contentSlug: 'vietnam:42-nguyen-hue',
        name: { en: 'The apartment block at 42 Nguyen Hue', km: 'អគារផ្ទះល្វែងលេខ ៤២ Nguyen Hue' },
        why: {
          en: 'A 1960s apartment building where every flat is now a tiny café or bookshop. Ride the old lift up and work your way down.',
          km: 'អគារផ្ទះល្វែងទសវត្សរ៍ ១៩៦០ ដែលបន្ទប់នីមួយៗឥឡូវជាហាងកាហ្វេ ឬហាងសៀវភៅតូច។ ជិះជណ្តើរយន្តចាស់ឡើងលើ ហើយដើរចុះម្តងមួយជាន់។',
        },
        area: { en: 'District 1', km: 'ស្រុកទី ១' },
        bestTime: { en: 'Late afternoon', km: 'រសៀលជ្រៅ' },
        roughCostUsd: 3,
      },
    ],
  },
};
