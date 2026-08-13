import type { AirportGuide } from '@/types';

// Every step carries Khmer alongside the English. This is the one screen a
// traveller reads while standing in a queue in a country whose language they
// do not speak, so the Khmer is written to be spoken aloud and acted on — not
// to mirror the English sentence structure.

export const airportGuides: AirportGuide[] = [
  {
    code: 'PNH',
    name: 'Phnom Penh International',
    city: 'Phnom Penh',
    country: 'Cambodia',
    flag: '🇰🇭',
    digitalMapUrl: 'https://www.airportinformation.com/PNH/map',
    digitalMapLabel: 'Interactive terminal map',
    departureSteps: [
      {
        title: 'Check-in',
        titleKm: 'ឆេកអ៊ីន',
        timing: '2h 30min before',
        timingKm: 'មុន ២ ម៉ោង ៣០ នាទី',
        description:
          'Go to the terminal building main entrance. Counters 1-12 are domestic. Counters 13-24 are international. Find your airline name on the screen above the counters.',
        descriptionKm:
          'ចូលតាមទ្វារធំនៃអគារអាកាសយានដ្ឋាន។ បញ្ជរលេខ ១-១២ សម្រាប់ជើងហោះហើរក្នុងស្រុក។ បញ្ជរលេខ ១៣-២៤ សម្រាប់ជើងហោះហើរអន្តរជាតិ។ រកឈ្មោះក្រុមហ៊ុនអាកាសចរណ៍របស់អ្នកនៅលើអេក្រង់ខាងលើបញ្ជរ។',
        phrases: [{ label: 'Where is check-in?', phrase: 'Check-in counter នៅឯណា?' }],
        watchOut: "Don't let strangers help you with bags — it's a tip scam.",
        watchOutKm: 'កុំឲ្យមនុស្សមិនស្គាល់ជួយលីកាបូបរបស់អ្នក — គេនឹងទារលុយក្រោយមក។',
      },
      {
        title: 'Security',
        titleKm: 'ការត្រួតពិនិត្យសុវត្ថិភាព',
        description:
          'Remove laptop, belt, shoes, and liquids. Liquids must be in containers under 100ml and in a clear plastic bag.',
        descriptionKm:
          'យកកុំព្យូទ័រ ខ្សែក្រវាត់ ស្បែកជើង និងអង្គធាតុរាវចេញ។ អង្គធាតុរាវត្រូវដាក់ក្នុងដបតូចជាង ១០០ មីលីលីត្រ ហើយដាក់ក្នុងថង់ប្លាស្ទិកថ្លា។',
      },
      {
        title: 'Immigration (Departures)',
        titleKm: 'អន្តោប្រវេសន៍ (ចេញដំណើរ)',
        description:
          "Have your passport and boarding pass ready. Join the 'All Passports' line. The officer will stamp your passport. This is normal.",
        descriptionKm:
          'រៀបចំលិខិតឆ្លងដែន និងសំបុត្រឡើងយន្តហោះឲ្យរួចរាល់។ ចូលជួរ “All Passports”។ មន្ត្រីនឹងបោះត្រាលើលិខិតឆ្លងដែនរបស់អ្នក។ នេះជារឿងធម្មតា។',
      },
      {
        title: 'Find your gate',
        titleKm: 'រកច្រកឡើងយន្តហោះ',
        description:
          'After immigration, your gate is shown on your boarding pass and on the screens. Gates are A1-A12 and B1-B8.',
        descriptionKm:
          'បន្ទាប់ពីអន្តោប្រវេសន៍ ច្រករបស់អ្នកបង្ហាញនៅលើសំបុត្រឡើងយន្តហោះ និងលើអេក្រង់។ ច្រកមានពី A1-A12 និង B1-B8។',
      },
      {
        title: 'Boarding',
        titleKm: 'ការឡើងជិះយន្តហោះ',
        description:
          'Begin boarding 40 minutes before departure. Listen for announcements or watch your Domner App notification.',
        descriptionKm:
          'ចាប់ផ្តើមឡើងជិះ ៤០ នាទីមុនពេលចេញដំណើរ។ ស្តាប់សេចក្តីប្រកាស ឬមើលការជូនដំណឹងក្នុងកម្មវិធី Domner។',
      },
    ],
    arrivalSteps: [
      {
        title: 'Immigration (Arrivals)',
        titleKm: 'អន្តោប្រវេសន៍ (មកដល់)',
        description:
          'Follow the "Arrivals" signs. Cambodians use the "Cambodian Passports" line — it is usually faster.',
        descriptionKm:
          'ដើរតាមផ្លាកសញ្ញា “Arrivals”។ ជនជាតិខ្មែរប្រើជួរ “Cambodian Passports” — ជាធម្មតាលឿនជាង។',
      },
      {
        title: 'Baggage claim',
        titleKm: 'ទទួលឥវ៉ាន់',
        description:
          'Check the screens for your flight number and belt number. Trolleys are free.',
        descriptionKm:
          'មើលអេក្រង់រកលេខជើងហោះហើរ និងលេខខ្សែក្រវាត់ឥវ៉ាន់របស់អ្នក។ រទេះរុញប្រើដោយឥតគិតថ្លៃ។',
      },
      {
        title: 'Customs',
        titleKm: 'គយ',
        description:
          'If you have nothing to declare, use the green channel. Keep receipts for expensive items.',
        descriptionKm:
          'បើអ្នកគ្មានអ្វីត្រូវប្រកាសទេ ចូលតាមផ្លូវពណ៌បៃតង។ រក្សាទុកវិក្កយបត្រសម្រាប់របស់ថ្លៃៗ។',
      },
      {
        title: 'Transport',
        titleKm: 'ការធ្វើដំណើរបន្ត',
        description:
          'Use the official taxi counter, PassApp, or Grab. Agree on the price before getting in an unmetered tuk-tuk.',
        descriptionKm:
          'ប្រើបញ្ជរតាក់ស៊ីផ្លូវការ PassApp ឬ Grab។ ព្រមព្រៀងតម្លៃជាមុនសិន មុននឹងឡើងជិះតុកតុកដែលគ្មានម៉ែត្រ។',
        watchOut: 'Avoid strangers offering rides inside the terminal.',
        watchOutKm: 'ជៀសវាងមនុស្សមិនស្គាល់ដែលមកបបួលជិះឡាននៅក្នុងអគារ។',
      },
    ],
  },
  {
    code: 'SAI',
    name: 'Siem Reap Angkor International',
    city: 'Siem Reap',
    country: 'Cambodia',
    flag: '🇰🇭',
    digitalMapUrl: 'https://www.airportinformation.com/SAI/map',
    digitalMapLabel: 'Interactive terminal map',
    departureSteps: [
      {
        title: 'Check-in',
        titleKm: 'ឆេកអ៊ីន',
        timing: '2h 30min before',
        timingKm: 'មុន ២ ម៉ោង ៣០ នាទី',
        description:
          'The new Siem Reap Angkor airport is large — arrive early. International check-in is in the main hall; look for your airline on the overhead screens.',
        descriptionKm:
          'អាកាសយានដ្ឋានសៀមរាបអង្គរថ្មីមានទំហំធំ — សូមមកឲ្យបានមុនម៉ោង។ ការឆេកអ៊ីនអន្តរជាតិនៅក្នុងសាលធំ។ មើលឈ្មោះក្រុមហ៊ុនអាកាសចរណ៍របស់អ្នកលើអេក្រង់ខាងលើ។',
      },
      {
        title: 'Security',
        titleKm: 'ការត្រួតពិនិត្យសុវត្ថិភាព',
        description:
          'Standard screening: laptops out, liquids under 100ml in a clear bag, empty your pockets into the tray.',
        descriptionKm:
          'ការត្រួតពិនិត្យធម្មតា៖ យកកុំព្យូទ័រចេញ អង្គធាតុរាវតិចជាង ១០០ មីលីលីត្រដាក់ក្នុងថង់ថ្លា ហើយយកអ្វីៗក្នុងហោប៉ៅដាក់ក្នុងថាស។',
      },
      {
        title: 'Immigration',
        titleKm: 'អន្តោប្រវេសន៍',
        description:
          'Have your passport and boarding pass ready. Officers may ask your destination — answer simply and honestly.',
        descriptionKm:
          'រៀបចំលិខិតឆ្លងដែន និងសំបុត្រឡើងយន្តហោះឲ្យរួចរាល់។ មន្ត្រីអាចសួរថាអ្នកទៅណា — ឆ្លើយឲ្យខ្លី និងត្រង់។',
      },
      {
        title: 'Find your gate',
        titleKm: 'រកច្រកឡើងយន្តហោះ',
        description:
          'Gates are a 5-15 minute walk from immigration. Check your boarding pass and the screens.',
        descriptionKm:
          'ច្រកឡើងយន្តហោះនៅចម្ងាយដើរ ៥-១៥ នាទីពីអន្តោប្រវេសន៍។ មើលសំបុត្រឡើងយន្តហោះ និងអេក្រង់។',
      },
      {
        title: 'Boarding',
        titleKm: 'ការឡើងជិះយន្តហោះ',
        description: 'Boarding starts about 40 minutes before departure. Keep your passport handy.',
        descriptionKm:
          'ការឡើងជិះចាប់ផ្តើមប្រហែល ៤០ នាទីមុនចេញដំណើរ។ ទុកលិខិតឆ្លងដែននៅជិតដៃ។',
      },
    ],
    arrivalSteps: [
      {
        title: 'Immigration (Arrivals)',
        titleKm: 'អន្តោប្រវេសន៍ (មកដល់)',
        description: 'Follow signs to Arrivals. E-visa holders use the marked lane.',
        descriptionKm:
          'ដើរតាមផ្លាកសញ្ញាទៅ Arrivals។ អ្នកមានទិដ្ឋាការអេឡិចត្រូនិកប្រើជួរដែលមានសម្គាល់។',
      },
      {
        title: 'Baggage claim',
        titleKm: 'ទទួលឥវ៉ាន់',
        description: 'Belt numbers show on screens. Bags take about 15-20 minutes.',
        descriptionKm: 'លេខខ្សែក្រវាត់ឥវ៉ាន់បង្ហាញលើអេក្រង់។ ឥវ៉ាន់ចេញមកប្រហែល ១៥-២០ នាទី។',
      },
      {
        title: 'Transport',
        titleKm: 'ការធ្វើដំណើរបន្ត',
        description:
          'The airport is ~40 km from town. Use the official taxi/bus counter — fixed prices are posted.',
        descriptionKm:
          'អាកាសយានដ្ឋាននៅឆ្ងាយពីទីក្រុងប្រហែល ៤០ គីឡូម៉ែត្រ។ ប្រើបញ្ជរតាក់ស៊ី/ឡានក្រុងផ្លូវការ — តម្លៃកំណត់ជាក់លាក់មានបិទផ្សាយ។',
        watchOut: 'Ignore unofficial drivers approaching you in the hall.',
        watchOutKm: 'កុំខ្វល់នឹងអ្នកបើកបរមិនផ្លូវការដែលចូលមករកអ្នកក្នុងសាល។',
      },
    ],
  },
  {
    code: 'BKK',
    name: 'Suvarnabhumi Bangkok',
    city: 'Bangkok',
    country: 'Thailand',
    flag: '🇹🇭',
    digitalMapUrl: 'https://suvarnabhumi.airportthai.co.th/airport-map',
    digitalMapLabel: 'Official interactive map',
    departureSteps: [
      {
        title: 'Check-in',
        titleKm: 'ឆេកអ៊ីន',
        timing: '3h before',
        timingKm: 'មុន ៣ ម៉ោង',
        description:
          'Suvarnabhumi is huge. Check-in rows A-W are on Level 4. Find your airline row on the big screens as you enter.',
        descriptionKm:
          'អាកាសយានដ្ឋានស្វណ្ណភូមិធំណាស់។ ជួរឆេកអ៊ីន A-W នៅជាន់ទី ៤។ រកជួរក្រុមហ៊ុនអាកាសចរណ៍របស់អ្នកលើអេក្រង់ធំ ពេលអ្នកចូល។',
      },
      {
        title: 'Security & Immigration',
        titleKm: 'សុវត្ថិភាព និងអន្តោប្រវេសន៍',
        description:
          'Security and immigration are combined behind each entrance. Queues can take 45+ minutes at peak times.',
        descriptionKm:
          'ការត្រួតពិនិត្យសុវត្ថិភាព និងអន្តោប្រវេសន៍នៅជាមួយគ្នា ខាងក្រោយច្រកចូលនីមួយៗ។ ពេលមនុស្សច្រើន ការតម្រង់ជួរអាចចំណាយពេលលើសពី ៤៥ នាទី។',
      },
      {
        title: 'Find your gate',
        titleKm: 'រកច្រកឡើងយន្តហោះ',
        description:
          'Gates A-G. Some gates are a 20-minute walk — check the estimated walking time on the signs.',
        descriptionKm:
          'ច្រក A-G។ ច្រកខ្លះត្រូវដើររហូតដល់ ២០ នាទី — មើលរយៈពេលដើរប៉ាន់ស្មាននៅលើផ្លាកសញ្ញា។',
      },
      {
        title: 'Boarding',
        titleKm: 'ការឡើងជិះយន្តហោះ',
        description: 'Boarding starts 40 minutes before departure and gates close 20 minutes before.',
        descriptionKm:
          'ការឡើងជិះចាប់ផ្តើម ៤០ នាទីមុនចេញដំណើរ ហើយច្រកបិទ ២០ នាទីមុន។',
      },
    ],
    arrivalSteps: [
      {
        title: 'Immigration (Arrivals)',
        titleKm: 'អន្តោប្រវេសន៍ (មកដល់)',
        description:
          'Follow "Immigration" signs on Level 2. Fill the arrival card if required. Tell the officer you are a tourist and show your hotel booking if asked.',
        descriptionKm:
          'ដើរតាមផ្លាកសញ្ញា “Immigration” នៅជាន់ទី ២។ បំពេញបណ្ណចូលប្រទេសបើគេទាមទារ។ ប្រាប់មន្ត្រីថាអ្នកជាភ្ញៀវទេសចរ ហើយបង្ហាញការកក់សណ្ឋាគារបើគេសួរ។',
      },
      {
        title: 'Baggage claim',
        titleKm: 'ទទួលឥវ៉ាន់',
        description: 'Belts 1-23. Check the screen for flight QH/PG/TG numbers. Bags take 20-25 minutes.',
        descriptionKm:
          'ខ្សែក្រវាត់ឥវ៉ាន់លេខ ១-២៣។ មើលអេក្រង់រកលេខជើងហោះហើរ QH/PG/TG។ ឥវ៉ាន់ចេញមកប្រហែល ២០-២៥ នាទី។',
      },
      {
        title: 'Transport',
        titleKm: 'ការធ្វើដំណើរបន្ត',
        description:
          'Use the OFFICIAL taxi counter on Level 1, or the Airport Rail Link on Level B. Grab pickup is on Level 4.',
        descriptionKm:
          'ប្រើបញ្ជរតាក់ស៊ីផ្លូវការនៅជាន់ទី ១ ឬរថភ្លើង Airport Rail Link នៅជាន់ B។ កន្លែងឡើង Grab នៅជាន់ទី ៤។',
        watchOut: 'Avoid strangers offering rides — use the official queue only.',
        watchOutKm: 'ជៀសវាងមនុស្សមិនស្គាល់ដែលបបួលជិះឡាន — ប្រើតែជួរផ្លូវការប៉ុណ្ណោះ។',
      },
    ],
  },
  {
    code: 'DMK',
    name: 'Don Mueang Bangkok',
    city: 'Bangkok',
    country: 'Thailand',
    flag: '🇹🇭',
    digitalMapUrl: 'https://donmueang.airportthai.co.th/airport-map',
    digitalMapLabel: 'Official interactive map',
    departureSteps: [
      {
        title: 'Check-in',
        titleKm: 'ឆេកអ៊ីន',
        timing: '2h 30min before',
        timingKm: 'មុន ២ ម៉ោង ៣០ នាទី',
        description:
          'Terminal 1 is international, Terminal 2 is domestic. AirAsia and low-cost carriers use rows 1-8 in Terminal 1.',
        descriptionKm:
          'អគារទី ១ សម្រាប់អន្តរជាតិ អគារទី ២ សម្រាប់ក្នុងស្រុក។ AirAsia និងក្រុមហ៊ុនតម្លៃសន្សំសំចៃប្រើជួរ ១-៨ ក្នុងអគារទី ១។',
      },
      {
        title: 'Security & Immigration',
        titleKm: 'សុវត្ថិភាព និងអន្តោប្រវេសន៍',
        description: 'Queues move fast but can be long on weekends. Keep your boarding pass ready.',
        descriptionKm:
          'ជួរដើរលឿន តែអាចវែងនៅចុងសប្តាហ៍។ ទុកសំបុត្រឡើងយន្តហោះនៅជិតដៃ។',
      },
      {
        title: 'Find your gate',
        titleKm: 'រកច្រកឡើងយន្តហោះ',
        description: 'International gates are numbered 1-6. Walkways are short compared to BKK.',
        descriptionKm:
          'ច្រកអន្តរជាតិមានលេខ ១-៦។ ផ្លូវដើរខ្លីជាងអាកាសយានដ្ឋានស្វណ្ណភូមិ។',
      },
      {
        title: 'Boarding',
        titleKm: 'ការឡើងជិះយន្តហោះ',
        description: 'Low-cost carriers close gates strictly 20 minutes before departure.',
        descriptionKm:
          'ក្រុមហ៊ុនតម្លៃសន្សំសំចៃបិទច្រកយ៉ាងម៉ត់ចត់ ២០ នាទីមុនចេញដំណើរ។',
      },
    ],
    arrivalSteps: [
      {
        title: 'Immigration',
        titleKm: 'អន្តោប្រវេសន៍',
        description: 'Follow the arrivals corridor to immigration on Level 1. Have your hotel address ready.',
        descriptionKm:
          'ដើរតាមច្រកមកដល់ទៅអន្តោប្រវេសន៍នៅជាន់ទី ១។ រៀបចំអាសយដ្ឋានសណ្ឋាគាររបស់អ្នកឲ្យរួចរាល់។',
      },
      {
        title: 'Baggage claim',
        titleKm: 'ទទួលឥវ៉ាន់',
        description: 'Belts are just after immigration. Bags usually within 20 minutes.',
        descriptionKm: 'ខ្សែក្រវាត់ឥវ៉ាន់នៅបន្ទាប់ពីអន្តោប្រវេសន៍។ ឥវ៉ាន់ចេញមកជាធម្មតាក្នុង ២០ នាទី។',
      },
      {
        title: 'Transport',
        titleKm: 'ការធ្វើដំណើរបន្ត',
        description: 'Official taxi counter is at Exit 8. The A1 bus goes to the BTS for 30 THB.',
        descriptionKm:
          'បញ្ជរតាក់ស៊ីផ្លូវការនៅច្រកចេញទី ៨។ ឡានក្រុង A1 ទៅស្ថានីយ៍ BTS តម្លៃ ៣០ បាត។',
        watchOut: 'Say no to "taxi mafia" touts inside the hall.',
        watchOutKm: 'បដិសេធអ្នកទាក់ទាញភ្ញៀវជិះតាក់ស៊ីខុសច្បាប់នៅក្នុងសាល។',
      },
    ],
  },
  {
    code: 'SGN',
    name: 'Tan Son Nhat Ho Chi Minh',
    city: 'Ho Chi Minh City',
    country: 'Vietnam',
    flag: '🇻🇳',
    digitalMapUrl: 'https://www.ifly.com/airports/ho-chi-minh-airport/terminal-map',
    digitalMapLabel: 'Interactive terminal map',
    departureSteps: [
      {
        title: 'Check-in',
        titleKm: 'ឆេកអ៊ីន',
        timing: '2h 30min before',
        timingKm: 'មុន ២ ម៉ោង ៣០ នាទី',
        description:
          'International departures are in Terminal 2. Screens above each row show the airline. Keep your passport out.',
        descriptionKm:
          'ការចេញដំណើរអន្តរជាតិនៅអគារទី ២។ អេក្រង់ខាងលើជួរនីមួយៗបង្ហាញឈ្មោះក្រុមហ៊ុនអាកាសចរណ៍។ ទុកលិខិតឆ្លងដែននៅក្នុងដៃ។',
      },
      {
        title: 'Immigration & Security',
        titleKm: 'អន្តោប្រវេសន៍ និងសុវត្ថិភាព',
        description:
          'Fill the departure requirements online in advance if your airline requires it. Queues peak 6-9am.',
        descriptionKm:
          'បំពេញលក្ខខណ្ឌចេញដំណើរតាមអ៊ីនធឺណិតជាមុន បើក្រុមហ៊ុនអាកាសចរណ៍របស់អ្នកទាមទារ។ ជួរវែងបំផុតវេលាម៉ោង ៦-៩ ព្រឹក។',
      },
      {
        title: 'Find your gate',
        titleKm: 'រកច្រកឡើងយន្តហោះ',
        description: 'Gates 9-28 are international. Allow 10 minutes to walk.',
        descriptionKm: 'ច្រកលេខ ៩-២៨ សម្រាប់អន្តរជាតិ។ ទុកពេលដើរ ១០ នាទី។',
      },
      {
        title: 'Boarding',
        titleKm: 'ការឡើងជិះយន្តហោះ',
        description: 'Boarding begins 40 minutes before departure.',
        descriptionKm: 'ការឡើងជិះចាប់ផ្តើម ៤០ នាទីមុនចេញដំណើរ។',
      },
    ],
    arrivalSteps: [
      {
        title: 'Immigration (Arrivals)',
        titleKm: 'អន្តោប្រវេសន៍ (មកដល់)',
        description:
          'Cambodian passport holders: visa on arrival available ($25) or e-visa. Join the correct lane. Officers rarely speak Khmer — use the Domner phrase cards.',
        descriptionKm:
          'អ្នកកាន់លិខិតឆ្លងដែនកម្ពុជា៖ អាចយកទិដ្ឋាការនៅព្រំដែន ($25) ឬប្រើទិដ្ឋាការអេឡិចត្រូនិក។ ចូលជួរឲ្យត្រូវ។ មន្ត្រីកម្រនិយាយខ្មែរណាស់ — សូមប្រើឃ្លាបន្ទាន់របស់ Domner។',
      },
      {
        title: 'Baggage claim',
        titleKm: 'ទទួលឥវ៉ាន់',
        description: 'Belt numbers on screens. Trolleys are free.',
        descriptionKm: 'លេខខ្សែក្រវាត់ឥវ៉ាន់បង្ហាញលើអេក្រង់។ រទេះរុញប្រើដោយឥតគិតថ្លៃ។',
      },
      {
        title: 'Transport',
        titleKm: 'ការធ្វើដំណើរបន្ត',
        description:
          'Use the taxi ranks for Mai Linh (green) or Vinasun (white) taxis only, or book a Grab to the pickup zone.',
        descriptionKm:
          'ប្រើតែតាក់ស៊ី Mai Linh (ពណ៌បៃតង) ឬ Vinasun (ពណ៌ស) នៅកន្លែងចតផ្លូវការ ឬកក់ Grab ទៅតំបន់ទទួលភ្ញៀវ។',
        watchOut: 'Avoid unmarked taxis — overcharging is common.',
        watchOutKm: 'ជៀសវាងតាក់ស៊ីគ្មានស្លាកសញ្ញា — គេច្រើនយកថ្លៃលើសណាស់។',
      },
    ],
  },
  {
    code: 'HAN',
    name: 'Noi Bai Hanoi',
    city: 'Hanoi',
    country: 'Vietnam',
    flag: '🇻🇳',
    digitalMapUrl: 'https://www.ifly.com/airports/hanoi-noi-bai-airport/terminal-map',
    digitalMapLabel: 'Interactive terminal map',
    departureSteps: [
      {
        title: 'Check-in',
        titleKm: 'ឆេកអ៊ីន',
        timing: '2h 30min before',
        timingKm: 'មុន ២ ម៉ោង ៣០ នាទី',
        description: 'Terminal 2 is international. Check-in rows A-E; find your airline on the screens.',
        descriptionKm:
          'អគារទី ២ សម្រាប់អន្តរជាតិ។ ជួរឆេកអ៊ីន A-E។ រកឈ្មោះក្រុមហ៊ុនអាកាសចរណ៍របស់អ្នកលើអេក្រង់។',
      },
      {
        title: 'Immigration & Security',
        titleKm: 'អន្តោប្រវេសន៍ និងសុវត្ថិភាព',
        description: 'Standard screening. Keep liquids under 100ml.',
        descriptionKm: 'ការត្រួតពិនិត្យធម្មតា។ អង្គធាតុរាវត្រូវតិចជាង ១០០ មីលីលីត្រ។',
      },
      {
        title: 'Find your gate',
        titleKm: 'រកច្រកឡើងយន្តហោះ',
        description: 'Gates 24-40 are international. Allow 10-15 minutes.',
        descriptionKm: 'ច្រកលេខ ២៤-៤០ សម្រាប់អន្តរជាតិ។ ទុកពេល ១០-១៥ នាទី។',
      },
      {
        title: 'Boarding',
        titleKm: 'ការឡើងជិះយន្តហោះ',
        description: 'Boarding begins 40 minutes before departure.',
        descriptionKm: 'ការឡើងជិះចាប់ផ្តើម ៤០ នាទីមុនចេញដំណើរ។',
      },
    ],
    arrivalSteps: [
      {
        title: 'Immigration',
        titleKm: 'អន្តោប្រវេសន៍',
        description: 'Visa on arrival counter is BEFORE immigration — go there first if you need one.',
        descriptionKm:
          'បញ្ជរទិដ្ឋាការនៅព្រំដែនស្ថិតនៅ<b>មុន</b>អន្តោប្រវេសន៍ — បើអ្នកត្រូវការ សូមទៅទីនោះជាមុនសិន។',
      },
      {
        title: 'Baggage claim',
        titleKm: 'ទទួលឥវ៉ាន់',
        description: 'Belts 1-6. Bags take about 20 minutes.',
        descriptionKm: 'ខ្សែក្រវាត់ឥវ៉ាន់លេខ ១-៦។ ឥវ៉ាន់ចេញមកប្រហែល ២០ នាទី។',
      },
      {
        title: 'Transport',
        titleKm: 'ការធ្វើដំណើរបន្ត',
        description: 'Hanoi is 30 km away. Use the official taxi queue or bus 86 to the Old Quarter.',
        descriptionKm:
          'ទីក្រុងហាណូយនៅឆ្ងាយ ៣០ គីឡូម៉ែត្រ។ ប្រើជួរតាក់ស៊ីផ្លូវការ ឬឡានក្រុងលេខ ៨៦ ទៅតំបន់ទីក្រុងចាស់។',
        watchOut: 'Agree the fare or insist on the meter before departing.',
        watchOutKm: 'ព្រមព្រៀងតម្លៃ ឬទទូចឲ្យគេបើកម៉ែត្រ មុននឹងចេញដំណើរ។',
      },
    ],
  },
  {
    code: 'SIN',
    name: 'Changi Singapore',
    city: 'Singapore',
    country: 'Singapore',
    flag: '🇸🇬',
    digitalMapUrl: 'https://www.changiairport.com/en/at-changi/map.html',
    digitalMapLabel: 'Official interactive map',
    departureSteps: [
      {
        title: 'Check-in',
        titleKm: 'ឆេកអ៊ីន',
        timing: '2h 30min before',
        timingKm: 'មុន ២ ម៉ោង ៣០ នាទី',
        description:
          'Check which terminal (1-4) your airline uses before you travel. Early check-in kiosks are available.',
        descriptionKm:
          'ពិនិត្យមើលថាក្រុមហ៊ុនអាកាសចរណ៍របស់អ្នកប្រើអគារណា (១-៤) មុនពេលអ្នកចេញដំណើរ។ មានម៉ាស៊ីនឆេកអ៊ីនមុនម៉ោងផងដែរ។',
      },
      {
        title: 'Immigration',
        titleKm: 'អន្តោប្រវេសន៍',
        description: 'Use the automated lanes with your passport — most nationalities are eligible.',
        descriptionKm:
          'ប្រើជួរស្វ័យប្រវត្តិជាមួយលិខិតឆ្លងដែនរបស់អ្នក — ជនជាតិភាគច្រើនអាចប្រើបាន។',
      },
      {
        title: 'Security at the gate',
        titleKm: 'ការត្រួតពិនិត្យនៅច្រកឡើងយន្តហោះ',
        description: 'At Changi, security screening happens AT YOUR GATE, not centrally. Arrive at the gate early.',
        descriptionKm:
          'នៅ Changi ការត្រួតពិនិត្យសុវត្ថិភាពធ្វើឡើង<b>នៅច្រកឡើងយន្តហោះរបស់អ្នក</b> មិនមែននៅកន្លែងកណ្តាលទេ។ សូមទៅដល់ច្រកឲ្យបានមុនម៉ោង។',
      },
      {
        title: 'Boarding',
        titleKm: 'ការឡើងជិះយន្តហោះ',
        description: 'Gates close 10 minutes before departure — Changi is strict.',
        descriptionKm: 'ច្រកបិទ ១០ នាទីមុនចេញដំណើរ — Changi ម៉ត់ចត់ណាស់។',
      },
    ],
    arrivalSteps: [
      {
        title: 'Arrival immigration',
        titleKm: 'អន្តោប្រវេសន៍ពេលមកដល់',
        description:
          'Submit the SG Arrival Card online within 3 days before landing. Automated lanes are fast.',
        descriptionKm:
          'ដាក់បណ្ណចូលប្រទេស SG Arrival Card តាមអ៊ីនធឺណិត ក្នុងរយៈពេល ៣ ថ្ងៃមុនចុះដល់។ ជួរស្វ័យប្រវត្តិលឿនណាស់។',
      },
      {
        title: 'Baggage claim',
        titleKm: 'ទទួលឥវ៉ាន់',
        description: 'Belts are clearly marked. Free trolleys everywhere.',
        descriptionKm: 'ខ្សែក្រវាត់ឥវ៉ាន់មានសម្គាល់ច្បាស់។ រទេះរុញឥតគិតថ្លៃមានគ្រប់ទីកន្លែង។',
      },
      {
        title: 'Transport',
        titleKm: 'ការធ្វើដំណើរបន្ត',
        description: 'MRT (cheapest), city shuttle, or the official taxi queue. Grab pickup points are signposted.',
        descriptionKm:
          'រថភ្លើង MRT (ថោកជាងគេ) ឡានក្រុងទៅទីក្រុង ឬជួរតាក់ស៊ីផ្លូវការ។ កន្លែងឡើង Grab មានផ្លាកសញ្ញាបង្ហាញ។',
      },
    ],
  },
  {
    code: 'PEK',
    name: 'Capital International Beijing',
    city: 'Beijing',
    country: 'China',
    flag: '🇨🇳',
    digitalMapUrl: 'https://www.ifly.com/airports/beijing-capital-international-airport/terminal-map',
    digitalMapLabel: 'Interactive terminal map',
    departureSteps: [
      {
        title: 'Check-in',
        titleKm: 'ឆេកអ៊ីន',
        timing: '3h before',
        timingKm: 'មុន ៣ ម៉ោង',
        description: 'Terminal 3 handles most international flights. Have your passport and visa ready.',
        descriptionKm:
          'អគារទី ៣ ទទួលបន្ទុកជើងហោះហើរអន្តរជាតិភាគច្រើន។ រៀបចំលិខិតឆ្លងដែន និងទិដ្ឋាការឲ្យរួចរាល់។',
      },
      {
        title: 'Immigration & Security',
        titleKm: 'អន្តោប្រវេសន៍ និងសុវត្ថិភាព',
        description: 'Fingerprints may be collected. Power banks must be in carry-on with capacity marked.',
        descriptionKm:
          'គេអាចយកស្នាមម្រាមដៃ។ ថ្មបម្រុង (power bank) ត្រូវដាក់ក្នុងឥវ៉ាន់យួរដៃ ហើយត្រូវមានសរសេរចំណុះច្បាស់លាស់។',
      },
      {
        title: 'Find your gate',
        titleKm: 'រកច្រកឡើងយន្តហោះ',
        description: 'Terminal 3 is huge — a train connects concourses. Allow 30 minutes.',
        descriptionKm:
          'អគារទី ៣ ធំណាស់ — មានរថភ្លើងភ្ជាប់រវាងតំបន់នីមួយៗ។ ទុកពេល ៣០ នាទី។',
      },
      {
        title: 'Boarding',
        titleKm: 'ការឡើងជិះយន្តហោះ',
        description: 'Boarding begins 45 minutes before departure.',
        descriptionKm: 'ការឡើងជិះចាប់ផ្តើម ៤៥ នាទីមុនចេញដំណើរ។',
      },
    ],
    arrivalSteps: [
      {
        title: 'Immigration',
        titleKm: 'អន្តោប្រវេសន៍',
        description:
          'Complete the arrival card. Fingerprint scan for foreigners at kiosks before the immigration queue.',
        descriptionKm:
          'បំពេញបណ្ណចូលប្រទេស។ ជនបរទេសត្រូវស្កេនស្នាមម្រាមដៃនៅម៉ាស៊ីន មុនចូលជួរអន្តោប្រវេសន៍។',
      },
      {
        title: 'Baggage claim',
        titleKm: 'ទទួលឥវ៉ាន់',
        description: 'Follow signs — you may need the inter-terminal train first.',
        descriptionKm: 'ដើរតាមផ្លាកសញ្ញា — អ្នកអាចត្រូវជិះរថភ្លើងឆ្លងអគារជាមុនសិន។',
      },
      {
        title: 'Transport',
        titleKm: 'ការធ្វើដំណើរបន្ត',
        description: 'Airport Express train or the official taxi queue. Have your hotel name written in Chinese.',
        descriptionKm:
          'រថភ្លើង Airport Express ឬជួរតាក់ស៊ីផ្លូវការ។ សូមមានឈ្មោះសណ្ឋាគាររបស់អ្នកសរសេរជាភាសាចិន។',
        watchOut: 'Refuse "black taxis" offering rides in the hall.',
        watchOutKm: 'បដិសេធតាក់ស៊ីខុសច្បាប់ដែលបបួលជិះនៅក្នុងសាល។',
      },
    ],
  },
  {
    code: 'PVG',
    name: 'Pudong Shanghai',
    city: 'Shanghai',
    country: 'China',
    flag: '🇨🇳',
    digitalMapUrl: 'https://www.ifly.com/airports/shanghai-pudong-international-airport/terminal-map',
    digitalMapLabel: 'Interactive terminal map',
    departureSteps: [
      {
        title: 'Check-in',
        titleKm: 'ឆេកអ៊ីន',
        timing: '3h before',
        timingKm: 'មុន ៣ ម៉ោង',
        description: 'Two terminals — check your airline. International check-in closes 60 minutes before departure.',
        descriptionKm:
          'មានអគារពីរ — ពិនិត្យមើលក្រុមហ៊ុនអាកាសចរណ៍របស់អ្នក។ ការឆេកអ៊ីនអន្តរជាតិបិទ ៦០ នាទីមុនចេញដំណើរ។',
      },
      {
        title: 'Immigration & Security',
        titleKm: 'អន្តោប្រវេសន៍ និងសុវត្ថិភាព',
        description: 'Standard checks plus fingerprints for foreigners.',
        descriptionKm: 'ការត្រួតពិនិត្យធម្មតា បូកនឹងការយកស្នាមម្រាមដៃសម្រាប់ជនបរទេស។',
      },
      {
        title: 'Find your gate',
        titleKm: 'រកច្រកឡើងយន្តហោះ',
        description: 'Long walks are common; follow the moving walkways.',
        descriptionKm: 'ត្រូវដើរឆ្ងាយជាធម្មតា។ ដើរតាមផ្លូវយន្តជួយដឹក។',
      },
      {
        title: 'Boarding',
        titleKm: 'ការឡើងជិះយន្តហោះ',
        description: 'Boarding begins 45 minutes before departure.',
        descriptionKm: 'ការឡើងជិះចាប់ផ្តើម ៤៥ នាទីមុនចេញដំណើរ។',
      },
    ],
    arrivalSteps: [
      {
        title: 'Immigration',
        titleKm: 'អន្តោប្រវេសន៍',
        description: 'Arrival card required. Kiosks print fingerprints first.',
        descriptionKm: 'ត្រូវការបណ្ណចូលប្រទេស។ ត្រូវស្កេនស្នាមម្រាមដៃនៅម៉ាស៊ីនជាមុនសិន។',
      },
      {
        title: 'Baggage claim',
        titleKm: 'ទទួលឥវ៉ាន់',
        description: 'Belt numbers on screens; bags take 20-30 minutes.',
        descriptionKm: 'លេខខ្សែក្រវាត់ឥវ៉ាន់បង្ហាញលើអេក្រង់។ ឥវ៉ាន់ចេញមកប្រហែល ២០-៣០ នាទី។',
      },
      {
        title: 'Transport',
        titleKm: 'ការធ្វើដំណើរបន្ត',
        description: 'Maglev train (fastest), Metro Line 2, or official taxi queue. Alipay/WeChat Pay help a lot.',
        descriptionKm:
          'រថភ្លើង Maglev (លឿនជាងគេ) រថភ្លើងក្រោមដីខ្សែទី ២ ឬជួរតាក់ស៊ីផ្លូវការ។ Alipay/WeChat Pay ជួយបានច្រើនណាស់។',
      },
    ],
  },
  {
    code: 'NRT',
    name: 'Narita Tokyo',
    city: 'Tokyo',
    country: 'Japan',
    flag: '🇯🇵',
    digitalMapUrl: 'https://www.narita-airport.jp/en/map/',
    digitalMapLabel: 'Official interactive map',
    departureSteps: [
      {
        title: 'Check-in',
        titleKm: 'ឆេកអ៊ីន',
        timing: '2h 30min before',
        timingKm: 'មុន ២ ម៉ោង ៣០ នាទី',
        description: 'Check your terminal (1, 2 or 3) before travelling — they are far apart.',
        descriptionKm:
          'ពិនិត្យមើលអគាររបស់អ្នក (១ ២ ឬ ៣) មុនពេលចេញដំណើរ — ពួកវានៅឆ្ងាយពីគ្នា។',
      },
      {
        title: 'Security & Immigration',
        titleKm: 'សុវត្ថិភាព និងអន្តោប្រវេសន៍',
        description: 'Efficient but thorough. Keep your boarding pass visible.',
        descriptionKm: 'លឿន តែពិនិត្យយ៉ាងល្អិតល្អន់។ ទុកសំបុត្រឡើងយន្តហោះឲ្យគេមើលឃើញ។',
      },
      {
        title: 'Find your gate',
        titleKm: 'រកច្រកឡើងយន្តហោះ',
        description: 'Follow the color-coded signs. Trains connect satellite gates.',
        descriptionKm: 'ដើរតាមផ្លាកសញ្ញាតាមពណ៌។ មានរថភ្លើងភ្ជាប់ទៅច្រកនៅឆ្ងាយ។',
      },
      {
        title: 'Boarding',
        titleKm: 'ការឡើងជិះយន្តហោះ',
        description: 'Boarding begins 30-40 minutes before departure, always on time.',
        descriptionKm: 'ការឡើងជិះចាប់ផ្តើម ៣០-៤០ នាទីមុនចេញដំណើរ ហើយតែងតែទាន់ម៉ោង។',
      },
    ],
    arrivalSteps: [
      {
        title: 'Immigration',
        titleKm: 'អន្តោប្រវេសន៍',
        description:
          'Fill "Visit Japan Web" online before landing for faster entry. Fingerprints and photo at the counter.',
        descriptionKm:
          'បំពេញ “Visit Japan Web” តាមអ៊ីនធឺណិតមុនចុះដល់ ដើម្បីចូលបានលឿន។ គេយកស្នាមម្រាមដៃ និងថតរូបនៅបញ្ជរ។',
      },
      {
        title: 'Baggage claim',
        titleKm: 'ទទួលឥវ៉ាន់',
        description: 'Bags are usually waiting — Japanese ground crews are fast.',
        descriptionKm: 'ឥវ៉ាន់ជាធម្មតាចេញរួចរង់ចាំហើយ — បុគ្គលិកជប៉ុនធ្វើការលឿនណាស់។',
      },
      {
        title: 'Transport',
        titleKm: 'ការធ្វើដំណើរបន្ត',
        description:
          'Narita Express or Keisei Skyliner to Tokyo (~60 min). Buy tickets at the counter with your passport.',
        descriptionKm:
          'រថភ្លើង Narita Express ឬ Keisei Skyliner ទៅតូក្យូ (ប្រហែល ៦០ នាទី)។ ទិញសំបុត្រនៅបញ្ជរដោយបង្ហាញលិខិតឆ្លងដែន។',
      },
    ],
  },
];

export function getAirportGuide(code: string): AirportGuide | undefined {
  return airportGuides.find((a) => a.code === code.toUpperCase());
}
