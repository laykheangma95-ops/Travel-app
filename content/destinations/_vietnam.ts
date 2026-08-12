import type { DestinationGuide } from '../schema';

// Entry rules are a property of the country, not the city. Ho Chi Minh City and
// Da Nang share this object so the two guides can never drift apart — the exact
// failure mode that would put a wrong visa rule in front of a traveller.
export const vietnamEntry: DestinationGuide['entry'] = {
  forPassport: 'KH',
  visa: {
    lastVerified: '2026-08-03',
    kind: 'visa-free',
    summary: {
      en: 'No visa needed. Cambodian passport holders enter visa-free under the bilateral agreement — one of the easiest borders you will cross.',
      km: 'មិនត្រូវការទិដ្ឋាការទេ។ អ្នកកាន់លិខិតឆ្លងដែនកម្ពុជាចូលដោយឥតទិដ្ឋាការតាមកិច្ចព្រមព្រៀងទ្វេភាគី — ជាព្រំដែនងាយស្រួលបំផុតមួយ។',
    },
    maxStayDays: 30,
    costUsd: 0,
    applyUrl: 'https://evisa.gov.vn/',
    source: {
      label: { en: 'Vietnam National Immigration Portal', km: 'ច្រកអន្តោប្រវេសន៍ជាតិវៀតណាម' },
      url: 'https://evisa.gov.vn/',
    },
  },
  requirements: [
    {
      lastVerified: '2026-08-03',
      id: 'vn-entry-declaration',
      volatile: true,
      title: { en: 'Electronic entry declaration', km: 'សេចក្តីប្រកាសចូលតាមអេឡិចត្រូនិក' },
      detail: {
        en: 'Vietnam has been rolling out an online arrival declaration, and which travellers and which border gates it applies to has kept changing. Check the national immigration portal a few days before you fly rather than relying on what a travel agent told you last year.',
        km: 'វៀតណាមកំពុងដាក់ឲ្យប្រើសេចក្តីប្រកាសចូលតាមអនឡាញ ហើយអ្នកដំណើរណាខ្លះ និងច្រកព្រំដែនណាខ្លះដែលត្រូវអនុវត្តនៅតែផ្លាស់ប្តូរ។ សូមពិនិត្យច្រកអន្តោប្រវេសន៍ជាតិពីរបីថ្ងៃមុនហោះហើរ ជាជាងពឹងលើអ្វីដែលភ្នាក់ងារទេសចរណ៍ប្រាប់កាលពីឆ្នាំមុន។',
      },
      mandatory: false,
      window: { opensDaysBefore: 3 },
      url: 'https://evisa.gov.vn/',
    },
    {
      lastVerified: '2026-08-03',
      id: 'passport-condition',
      title: { en: 'A passport in good condition', km: 'លិខិតឆ្លងដែនក្នុងស្ថានភាពល្អ' },
      detail: {
        en: 'Vietnamese immigration is strict about torn, water-damaged or heavily worn passports and can refuse entry over one. Check yours before the airport.',
        km: 'អន្តោប្រវេសន៍វៀតណាមតឹងរ៉ឹងចំពោះលិខិតឆ្លងដែនរហែក ខូចដោយទឹក ឬពុកខ្លាំង ហើយអាចបដិសេធការចូល។ ពិនិត្យរបស់អ្នកមុនទៅអាកាសយានដ្ឋាន។',
      },
      mandatory: true,
    },
  ],
  passportValidity: { lastVerified: '2026-08-03', monthsBeyondStay: 6 },
  customs: {
    lastVerified: '2026-08-03',
    cashDeclareOverUsd: 5000,
    banned: [
      { en: 'More than $5,000 in cash without declaring it', km: 'សាច់ប្រាក់លើសពី $5,000 ដោយមិនប្រកាស' },
      { en: 'Political material about Vietnam', km: 'ឯកសារនយោបាយអំពីវៀតណាម' },
      { en: 'Prescription medicine without its original packaging', km: 'ថ្នាំតាមវេជ្ជបញ្ជាដោយគ្មានកញ្ចប់ដើម' },
    ],
  },
  emergency: {
    lastVerified: '2026-08-03',
    police: '113',
    ambulance: '115',
    fire: '114',
    khmerMission: {
      name: { en: 'Royal Embassy of Cambodia, Hanoi', km: 'ស្ថានឯកអគ្គរាជទូតកម្ពុជា ទីក្រុងហាណូយ' },
      address: { en: '71 Tran Hung Dao Street, Hanoi', km: 'ផ្លូវ ៧១ Tran Hung Dao, ហាណូយ' },
      phone: '+84 24 3942 4788',
      email: 'camemb.vnm@mfa.gov.kh',
      note: {
        en: 'There is also a Consulate-General in Ho Chi Minh City — check the Ministry directory for its current address and hours before you go.',
        km: 'មានស្ថានកុងស៊ុលធំនៅទីក្រុងហូជីមិញផងដែរ — សូមពិនិត្យបញ្ជីរបស់ក្រសួងសម្រាប់អាសយដ្ឋាន និងម៉ោងបច្ចុប្បន្នមុនពេលទៅ។',
      },
      url: 'https://www.mfaic.gov.kh/en/embassies/royal%20embassy%20of%20cambodia',
    },
    source: {
      label: { en: 'Cambodian Ministry of Foreign Affairs', km: 'ក្រសួងការបរទេសកម្ពុជា' },
      url: 'https://www.mfaic.gov.kh/en/embassies/royal%20embassy%20of%20cambodia',
    },
  },
};
