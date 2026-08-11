import type { DestinationGuide } from '../schema';
import { vietnamEntry } from './_vietnam';

export const daNang: DestinationGuide = {
  slug: 'da-nang',
  city: { en: 'Da Nang', km: 'ដាណាំង' },
  country: { en: 'Vietnam', km: 'វៀតណាម' },
  countryCode: 'VN',
  esimCountrySlug: 'vietnam',
  aliases: ['Da Nang', 'Danang', 'ដាណាំង', 'DAD', 'Hoi An', 'ហូយអាន', 'Hue', 'Vietnam', 'វៀតណាម'],
  routeWeight: 6,
  directFlightMins: null,

  geo: { lat: 16.05, lon: 108.2, timezone: 'Asia/Ho_Chi_Minh', flightAltitude: 1.43 },

  arrival: {
    skyColor: '#1f3560',
    horizonColor: '#e0a878',
    intro: {
      en: 'A beach on one side, a mountain pass on the other, and Hoi An half an hour down the coast. The trip Cambodians take when they want to stop moving for a week.',
      km: 'ឆ្នេរនៅម្ខាង ផ្លូវឆ្លងភ្នំនៅម្ខាងទៀត ហើយហូយអាននៅកន្លះម៉ោងតាមឆ្នេរ។ ជាដំណើរដែលខ្មែរជ្រើសរើស ពេលចង់ឈប់សម្រាកមួយសប្តាហ៍។',
    },
  },

  basics: {
    lastVerified: '2026-08-03',
    currency: { code: 'VND', name: { en: 'Vietnamese dong', km: 'ដុងវៀតណាម' }, symbol: '₫' },
    tenDollarsBuys: [
      { item: { en: 'Five bowls of mì Quảng', km: 'មី Quảng ប្រាំចាន' }, localPrice: '200,000₫' },
      { item: { en: 'A Grab bike along the beach road', km: 'ជិះម៉ូតូ Grab តាមផ្លូវឆ្នេរ' }, localPrice: '20,000₫' },
      { item: { en: 'A beachfront beer', km: 'ស្រាបៀរនៅមាត់ឆ្នេរ' }, localPrice: '20,000₫' },
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
        mode: { en: 'Da Nang airport → My Khe beach by Grab', km: 'អាកាសយានដ្ឋានដាណាំង → ឆ្នេរ My Khe តាម Grab' },
        durationMins: 12,
        costLocal: '80,000–120,000₫',
        costUsd: 4,
        note: {
          en: 'The airport is inside the city — you are at the beach before your phone finishes connecting.',
          km: 'អាកាសយានដ្ឋាននៅក្នុងទីក្រុង — អ្នកដល់ឆ្នេរមុនពេលទូរស័ព្ទតភ្ជាប់រួច។',
        },
      },
      {
        mode: { en: 'Da Nang → Hoi An by Grab car', km: 'ដាណាំង → ហូយអាន តាមឡាន Grab' },
        durationMins: 40,
        costLocal: '350,000₫',
        costUsd: 14,
        note: { en: 'Agree the return in advance if you go for the evening.', km: 'ព្រមព្រៀងការត្រឡប់ជាមុន បើអ្នកទៅពេលល្ងាច។' },
      },
    ],
    apps: [
      { name: 'Grab', purpose: { en: 'Bikes and cars — the only thing you need here', km: 'ម៉ូតូ និងឡាន — អ្វីតែមួយដែលអ្នកត្រូវការនៅទីនេះ' } },
      { name: 'Be', purpose: { en: 'Often cheaper than Grab for short hops', km: 'ជាញឹកញាប់ថោកជាង Grab សម្រាប់ចម្ងាយខ្លី' } },
    ],
    money: {
      cambodianCardAccepted: 'sometimes',
      khqrAccepted: true,
      khqrNote: {
        en: 'Bakong supports cross-border QR with Vietnam, so your KHQR app can pay at VietQR merchants. Smaller beach cafés may still prefer cash — check the cross-border section in the Bakong app before relying on it.',
        km: 'Bakong គាំទ្រ QR ឆ្លងដែនជាមួយវៀតណាម ដូច្នេះកម្មវិធី KHQR របស់អ្នកអាចបង់ប្រាក់នៅហាងដែលប្រើ VietQR។ ហាងកាហ្វេតូចៗតាមឆ្នេរអាចនៅចូលចិត្តសាច់ប្រាក់ — ពិនិត្យផ្នែកឆ្លងដែនក្នុងកម្មវិធី Bakong មុនពេលពឹងផ្អែកលើវា។',
      },
      cashCulture: {
        en: 'Cash for everything small. There are ATMs along the beach road, but withdraw in the city centre where the fees are lower.',
        km: 'សាច់ប្រាក់សម្រាប់អ្វីៗតូចៗទាំងអស់។ មាន ATM តាមផ្លូវឆ្នេរ ប៉ុន្តែគួរដកនៅកណ្តាលទីក្រុងដែលថ្លៃសេវាទាបជាង។',
      },
      tipping: {
        en: 'Not expected, though it is common to leave small change at a beachfront café.',
        km: 'មិនចាំបាច់ទេ ទោះបីការទុកលុយអាប់តិចតួចនៅហាងកាហ្វេមាត់ឆ្នេរជារឿងធម្មតា។',
      },
    },
  },

  places: {
    lastVerified: '2026-08-03',
    list: [
      {
        kind: 'landmark',
        name: { en: 'Marble Mountains at opening time', km: 'ភ្នំថ្មម៉ាប៉ែលពេលបើកទ្វារ' },
        why: {
          en: 'Caves, pagodas and a lift to the top for the people who do not want the stairs. It empties by nine because the tour buses go elsewhere.',
          km: 'រូងភ្នំ វត្តអារាម និងជណ្តើរយន្តឡើងកំពូលសម្រាប់អ្នកមិនចង់ឡើងជណ្តើរ។ វាស្ងាត់មុនម៉ោង ៩ ព្រោះឡានក្រុងទេសចរទៅកន្លែងផ្សេង។',
        },
        area: { en: 'Ngu Hanh Son', km: 'Ngu Hanh Son' },
        bestTime: { en: 'From 07:00', km: 'ចាប់ពីម៉ោង ០៧:០០' },
        roughCostUsd: 2,
      },
      {
        kind: 'popular-with-cambodians',
        name: { en: 'Hoi An old town after the day trippers leave', km: 'ទីក្រុងចាស់ហូយអានក្រោយពេលទេសចរចេញ' },
        why: {
          en: 'The lanterns come on around six and the coach parties leave around seven. That hour in between is the whole reason to come.',
          km: 'ចង្កៀងភ្លឺប្រហែលម៉ោង ៦ ហើយក្រុមទេសចរចេញប្រហែលម៉ោង ៧។ មួយម៉ោងចន្លោះនោះគឺជាមូលហេតុទាំងមូលដែលត្រូវមក។',
        },
        area: { en: 'Hoi An', km: 'ហូយអាន' },
        bestTime: { en: '18:00–20:00', km: 'ម៉ោង ១៨:០០–២០:០០' },
        roughCostUsd: 5,
      },
      {
        kind: 'hidden-gem',
        name: { en: 'Hai Van Pass by the back of a bike', km: 'ផ្លូវឆ្លងភ្នំ Hai Van តាមក្រោយម៉ូតូ' },
        why: {
          en: 'The mountain road north out of the city, with the sea on one side the whole way. Hire a driver rather than riding it yourself if you have never ridden in Vietnam.',
          km: 'ផ្លូវភ្នំទៅខាងជើងចេញពីទីក្រុង មានសមុទ្រនៅម្ខាងពេញផ្លូវ។ គួរជួលអ្នកបើកបរជាជាងបើកខ្លួនឯង បើអ្នកមិនធ្លាប់បើកនៅវៀតណាម។',
        },
        area: { en: 'North of Da Nang', km: 'ខាងជើងដាណាំង' },
        bestTime: { en: 'Morning, before the cloud comes down', km: 'ពេលព្រឹក មុនពេលពពកចុះ' },
        roughCostUsd: 20,
      },
    ],
  },
};
