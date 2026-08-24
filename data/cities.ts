// ─────────────────────────────────────────────────────────────────────────────
// The city index.
//
// The problem this solves: nobody says "I'm going to France." They say Paris.
// They say Guangzhou, not China. Until this file existed, the homepage search
// and the store search only knew country names, so "Paris" and "ក្វាងចូវ"
// returned nothing at all — for destinations we can put data on a phone in
// today.
//
// A city here is not a product. It is a pointer at a country in
// data/coverage.ts, which already knows which SKU actually reaches that
// country. So Paris → France → (France SKU or the Europe bundle, whichever is
// cheaper), and Guangzhou → China → (China SKU or China·HK·Macao). Adding a
// city can never invent coverage: `cityLookup` drops any city whose country we
// do not serve.
//
// Khmer names are given where the spelling is settled in Khmer-language media;
// where it is not, `nameKm` is omitted rather than transliterated by guesswork.
// Aliases carry IATA airport codes and the other spellings people type.
// ─────────────────────────────────────────────────────────────────────────────

import { getServedCountry, type ServedCountry } from './coverage';

export interface City {
  name: string;
  /** Khmer spelling, where one is settled. Omitted rather than invented. */
  nameKm?: string;
  /** A slug in the coverage registry — data/coverage.ts COUNTRY_REGISTRY. */
  countrySlug: string;
  /** Airport codes, alternate spellings, former names, nearby resort areas. */
  aliases?: string[];
  /**
   * How likely a Cambodian traveller is to be typing this one. Only breaks
   * ties — a weighted city never outranks a better textual match.
   */
  weight?: number;
}

export const cities: City[] = [
  // ── Cambodia ───────────────────────────────────────────────────────────────
  { name: 'Phnom Penh', nameKm: 'ភ្នំពេញ', countrySlug: 'cambodia', aliases: ['PNH'], weight: 10 },
  { name: 'Siem Reap', nameKm: 'សៀមរាប', countrySlug: 'cambodia', aliases: ['REP', 'SAI', 'Angkor'], weight: 8 },
  { name: 'Sihanoukville', nameKm: 'ព្រះសីហនុ', countrySlug: 'cambodia', aliases: ['KOS', 'Kompong Som'], weight: 6 },
  { name: 'Battambang', nameKm: 'បាត់ដំបង', countrySlug: 'cambodia' },
  { name: 'Kampot', nameKm: 'កំពត', countrySlug: 'cambodia' },

  // ── Thailand ───────────────────────────────────────────────────────────────
  { name: 'Bangkok', nameKm: 'បាងកក', countrySlug: 'thailand', aliases: ['BKK', 'DMK', 'Krung Thep'], weight: 10 },
  { name: 'Phuket', nameKm: 'ភូកេត', countrySlug: 'thailand', aliases: ['HKT'], weight: 8 },
  { name: 'Chiang Mai', nameKm: 'ចៀងម៉ៃ', countrySlug: 'thailand', aliases: ['CNX'], weight: 7 },
  { name: 'Pattaya', nameKm: 'ប៉ាតាយ៉ា', countrySlug: 'thailand', aliases: ['UTP'], weight: 6 },
  { name: 'Krabi', countrySlug: 'thailand', aliases: ['KBV'] },
  { name: 'Koh Samui', countrySlug: 'thailand', aliases: ['USM', 'Samui'] },
  { name: 'Hat Yai', countrySlug: 'thailand', aliases: ['HDY'] },
  { name: 'Chiang Rai', countrySlug: 'thailand', aliases: ['CEI'] },

  // ── Vietnam ────────────────────────────────────────────────────────────────
  { name: 'Ho Chi Minh City', nameKm: 'ហូជីមិញ', countrySlug: 'vietnam', aliases: ['SGN', 'Saigon', 'HCMC'], weight: 10 },
  { name: 'Hanoi', nameKm: 'ហាណូយ', countrySlug: 'vietnam', aliases: ['HAN', 'Ha Noi'], weight: 9 },
  { name: 'Da Nang', nameKm: 'ដាណាំង', countrySlug: 'vietnam', aliases: ['DAD', 'Danang'], weight: 8 },
  { name: 'Nha Trang', countrySlug: 'vietnam', aliases: ['CXR'] },
  { name: 'Phu Quoc', countrySlug: 'vietnam', aliases: ['PQC'] },
  { name: 'Hoi An', countrySlug: 'vietnam' },
  { name: 'Ha Long', countrySlug: 'vietnam', aliases: ['Halong'] },
  { name: 'Hue', countrySlug: 'vietnam', aliases: ['HUI'] },
  { name: 'Da Lat', countrySlug: 'vietnam', aliases: ['DLI', 'Dalat'] },

  // ── Laos ───────────────────────────────────────────────────────────────────
  { name: 'Vientiane', nameKm: 'វៀងចន្ទន៍', countrySlug: 'laos', aliases: ['VTE'], weight: 6 },
  { name: 'Luang Prabang', countrySlug: 'laos', aliases: ['LPQ'] },
  { name: 'Pakse', countrySlug: 'laos', aliases: ['PKZ'] },

  // ── Malaysia ───────────────────────────────────────────────────────────────
  { name: 'Kuala Lumpur', nameKm: 'គូឡាឡាំពួរ', countrySlug: 'malaysia', aliases: ['KUL', 'KL'], weight: 9 },
  { name: 'Penang', countrySlug: 'malaysia', aliases: ['PEN', 'George Town'] },
  { name: 'Johor Bahru', countrySlug: 'malaysia', aliases: ['JHB'] },
  { name: 'Kota Kinabalu', countrySlug: 'malaysia', aliases: ['BKI'] },
  { name: 'Langkawi', countrySlug: 'malaysia', aliases: ['LGK'] },
  { name: 'Malacca', countrySlug: 'malaysia', aliases: ['Melaka'] },

  // ── Singapore ──────────────────────────────────────────────────────────────
  { name: 'Singapore', nameKm: 'សិង្ហបូរី', countrySlug: 'singapore', aliases: ['SIN', 'Changi'], weight: 10 },
  { name: 'Sentosa', countrySlug: 'singapore' },

  // ── Indonesia ──────────────────────────────────────────────────────────────
  { name: 'Bali', nameKm: 'បាលី', countrySlug: 'indonesia', aliases: ['DPS', 'Denpasar', 'Kuta', 'Ubud', 'Seminyak'], weight: 9 },
  { name: 'Jakarta', nameKm: 'ចាការតា', countrySlug: 'indonesia', aliases: ['CGK', 'HLP'], weight: 8 },
  { name: 'Surabaya', countrySlug: 'indonesia', aliases: ['SUB'] },
  { name: 'Yogyakarta', countrySlug: 'indonesia', aliases: ['YIA', 'Jogja', 'Borobudur'] },
  { name: 'Bandung', countrySlug: 'indonesia', aliases: ['BDO'] },
  { name: 'Medan', countrySlug: 'indonesia', aliases: ['KNO'] },
  { name: 'Lombok', countrySlug: 'indonesia', aliases: ['LOP'] },
  { name: 'Batam', countrySlug: 'indonesia', aliases: ['BTH'] },

  // ── Philippines ────────────────────────────────────────────────────────────
  { name: 'Manila', nameKm: 'ម៉ានីល', countrySlug: 'philippines', aliases: ['MNL'], weight: 7 },
  { name: 'Cebu', countrySlug: 'philippines', aliases: ['CEB'] },
  { name: 'Boracay', countrySlug: 'philippines', aliases: ['MPH', 'Caticlan'] },
  { name: 'Davao', countrySlug: 'philippines', aliases: ['DVO'] },
  { name: 'Palawan', countrySlug: 'philippines', aliases: ['PPS', 'Puerto Princesa', 'El Nido'] },
  { name: 'Clark', countrySlug: 'philippines', aliases: ['CRK', 'Angeles'] },

  // ── China ──────────────────────────────────────────────────────────────────
  // The single biggest reason this file exists. Nobody searches "China".
  { name: 'Guangzhou', nameKm: 'ក្វាងចូវ', countrySlug: 'china', aliases: ['CAN', 'Canton', 'Kwangchow'], weight: 10 },
  { name: 'Shanghai', nameKm: 'សៀងហៃ', countrySlug: 'china', aliases: ['PVG', 'SHA'], weight: 10 },
  { name: 'Beijing', nameKm: 'ប៉េកាំង', countrySlug: 'china', aliases: ['PEK', 'PKX', 'Peking'], weight: 10 },
  { name: 'Shenzhen', nameKm: 'សិនជេន', countrySlug: 'china', aliases: ['SZX'], weight: 9 },
  { name: 'Chengdu', countrySlug: 'china', aliases: ['CTU', 'TFU'], weight: 7 },
  { name: 'Kunming', countrySlug: 'china', aliases: ['KMG'], weight: 7 },
  { name: 'Nanning', countrySlug: 'china', aliases: ['NNG'], weight: 6 },
  { name: 'Xiamen', countrySlug: 'china', aliases: ['XMN'] },
  { name: 'Hangzhou', countrySlug: 'china', aliases: ['HGH'] },
  { name: 'Chongqing', countrySlug: 'china', aliases: ['CKG'] },
  { name: "Xi'an", countrySlug: 'china', aliases: ['XIY', 'Xian'] },
  { name: 'Qingdao', countrySlug: 'china', aliases: ['TAO'] },
  { name: 'Tianjin', countrySlug: 'china', aliases: ['TSN'] },
  { name: 'Wuhan', countrySlug: 'china', aliases: ['WUH'] },
  { name: 'Sanya', countrySlug: 'china', aliases: ['SYX', 'Hainan'] },
  { name: 'Zhengzhou', countrySlug: 'china', aliases: ['CGO'] },
  { name: 'Changsha', countrySlug: 'china', aliases: ['CSX'] },
  { name: 'Shenyang', countrySlug: 'china', aliases: ['SHE'] },
  { name: 'Harbin', countrySlug: 'china', aliases: ['HRB'] },
  { name: 'Guilin', countrySlug: 'china', aliases: ['KWL'] },
  { name: 'Suzhou', countrySlug: 'china' },
  { name: 'Yiwu', countrySlug: 'china' },

  // ── Hong Kong · Macao ──────────────────────────────────────────────────────
  { name: 'Hong Kong', nameKm: 'ហុងកុង', countrySlug: 'hong-kong', aliases: ['HKG', 'Kowloon'], weight: 9 },
  { name: 'Macao', nameKm: 'ម៉ាកាវ', countrySlug: 'macao', aliases: ['MFM', 'Macau'], weight: 7 },

  // ── Japan ──────────────────────────────────────────────────────────────────
  { name: 'Tokyo', nameKm: 'តូក្យូ', countrySlug: 'japan', aliases: ['NRT', 'HND', 'Narita', 'Haneda', 'Shibuya', 'Shinjuku'], weight: 10 },
  { name: 'Osaka', nameKm: 'អូសាកា', countrySlug: 'japan', aliases: ['KIX', 'ITM', 'Kansai'], weight: 9 },
  { name: 'Kyoto', nameKm: 'ក្យូតូ', countrySlug: 'japan', weight: 8 },
  { name: 'Fukuoka', countrySlug: 'japan', aliases: ['FUK'] },
  { name: 'Sapporo', countrySlug: 'japan', aliases: ['CTS', 'Hokkaido'] },
  { name: 'Nagoya', countrySlug: 'japan', aliases: ['NGO'] },
  { name: 'Okinawa', countrySlug: 'japan', aliases: ['OKA', 'Naha'] },
  { name: 'Hiroshima', countrySlug: 'japan', aliases: ['HIJ'] },
  { name: 'Nara', countrySlug: 'japan' },
  { name: 'Yokohama', countrySlug: 'japan' },

  // ── South Korea ────────────────────────────────────────────────────────────
  { name: 'Seoul', nameKm: 'សេអ៊ូល', countrySlug: 'south-korea', aliases: ['ICN', 'GMP', 'Incheon', 'Myeongdong', 'Gangnam'], weight: 10 },
  { name: 'Busan', nameKm: 'ប៊ូសាន', countrySlug: 'south-korea', aliases: ['PUS', 'Pusan'], weight: 7 },
  { name: 'Jeju', countrySlug: 'south-korea', aliases: ['CJU'] },
  { name: 'Daegu', countrySlug: 'south-korea', aliases: ['TAE'] },

  // ── Taiwan ─────────────────────────────────────────────────────────────────
  { name: 'Taipei', nameKm: 'តៃប៉ិ', countrySlug: 'taiwan', aliases: ['TPE', 'TSA', 'Taoyuan'], weight: 8 },
  { name: 'Kaohsiung', countrySlug: 'taiwan', aliases: ['KHH'] },
  { name: 'Taichung', countrySlug: 'taiwan', aliases: ['RMQ'] },

  // ── India ──────────────────────────────────────────────────────────────────
  { name: 'Mumbai', nameKm: 'មុំបៃ', countrySlug: 'india', aliases: ['BOM', 'Bombay'], weight: 6 },
  { name: 'Delhi', nameKm: 'ដេលី', countrySlug: 'india', aliases: ['DEL', 'New Delhi'], weight: 6 },
  { name: 'Bangalore', countrySlug: 'india', aliases: ['BLR', 'Bengaluru'] },
  { name: 'Chennai', countrySlug: 'india', aliases: ['MAA', 'Madras'] },
  { name: 'Kolkata', countrySlug: 'india', aliases: ['CCU', 'Calcutta'] },
  { name: 'Hyderabad', countrySlug: 'india', aliases: ['HYD'] },
  { name: 'Goa', countrySlug: 'india', aliases: ['GOI'] },
  { name: 'Agra', countrySlug: 'india', aliases: ['Taj Mahal'] },
  { name: 'Bodh Gaya', countrySlug: 'india', aliases: ['GAY', 'Bodhgaya'] },

  // ── UAE ────────────────────────────────────────────────────────────────────
  { name: 'Dubai', nameKm: 'ឌូបៃ', countrySlug: 'uae', aliases: ['DXB', 'DWC'], weight: 8 },
  { name: 'Abu Dhabi', countrySlug: 'uae', aliases: ['AUH'] },
  { name: 'Sharjah', countrySlug: 'uae', aliases: ['SHJ'] },

  // ── Turkey ─────────────────────────────────────────────────────────────────
  { name: 'Istanbul', nameKm: 'អ៊ីស្តង់ប៊ុល', countrySlug: 'turkey', aliases: ['IST', 'SAW'], weight: 6 },
  { name: 'Ankara', countrySlug: 'turkey', aliases: ['ESB'] },
  { name: 'Antalya', countrySlug: 'turkey', aliases: ['AYT'] },
  { name: 'Cappadocia', countrySlug: 'turkey', aliases: ['NAV', 'Goreme'] },

  // ── Australia · New Zealand ────────────────────────────────────────────────
  { name: 'Sydney', nameKm: 'ស៊ីដនី', countrySlug: 'australia', aliases: ['SYD'], weight: 8 },
  { name: 'Melbourne', nameKm: 'ម៉ែលបួន', countrySlug: 'australia', aliases: ['MEL'], weight: 8 },
  { name: 'Brisbane', countrySlug: 'australia', aliases: ['BNE'] },
  { name: 'Perth', countrySlug: 'australia', aliases: ['PER'] },
  { name: 'Adelaide', countrySlug: 'australia', aliases: ['ADL'] },
  { name: 'Gold Coast', countrySlug: 'australia', aliases: ['OOL'] },
  { name: 'Canberra', countrySlug: 'australia', aliases: ['CBR'] },
  { name: 'Auckland', countrySlug: 'new-zealand', aliases: ['AKL'] },
  { name: 'Wellington', countrySlug: 'new-zealand', aliases: ['WLG'] },
  { name: 'Christchurch', countrySlug: 'new-zealand', aliases: ['CHC'] },
  { name: 'Queenstown', countrySlug: 'new-zealand', aliases: ['ZQN'] },

  // ── USA · Canada · Mexico ──────────────────────────────────────────────────
  { name: 'New York', nameKm: 'ញូវយ៉ក', countrySlug: 'usa', aliases: ['JFK', 'EWR', 'LGA', 'NYC', 'Manhattan'], weight: 9 },
  { name: 'Los Angeles', nameKm: 'ឡូសអង់សឺឡេស', countrySlug: 'usa', aliases: ['LAX', 'LA', 'Hollywood'], weight: 9 },
  { name: 'San Francisco', countrySlug: 'usa', aliases: ['SFO', 'Bay Area'], weight: 8 },
  { name: 'Seattle', countrySlug: 'usa', aliases: ['SEA'] },
  { name: 'Chicago', countrySlug: 'usa', aliases: ['ORD', 'MDW'] },
  { name: 'Las Vegas', countrySlug: 'usa', aliases: ['LAS'] },
  { name: 'Boston', countrySlug: 'usa', aliases: ['BOS'] },
  { name: 'Washington', countrySlug: 'usa', aliases: ['IAD', 'DCA', 'Washington DC'] },
  { name: 'Houston', countrySlug: 'usa', aliases: ['IAH'] },
  { name: 'Dallas', countrySlug: 'usa', aliases: ['DFW'] },
  { name: 'Atlanta', countrySlug: 'usa', aliases: ['ATL'] },
  { name: 'Miami', countrySlug: 'usa', aliases: ['MIA'] },
  { name: 'Honolulu', countrySlug: 'usa', aliases: ['HNL', 'Hawaii'] },
  { name: 'Long Beach', countrySlug: 'usa', aliases: ['LGB'] },
  { name: 'Portland', countrySlug: 'usa', aliases: ['PDX'] },
  { name: 'San Diego', countrySlug: 'usa', aliases: ['SAN'] },
  { name: 'Toronto', countrySlug: 'canada', aliases: ['YYZ'], weight: 6 },
  { name: 'Vancouver', countrySlug: 'canada', aliases: ['YVR'], weight: 6 },
  { name: 'Montreal', countrySlug: 'canada', aliases: ['YUL'] },
  { name: 'Calgary', countrySlug: 'canada', aliases: ['YYC'] },
  { name: 'Ottawa', countrySlug: 'canada', aliases: ['YOW'] },
  { name: 'Mexico City', countrySlug: 'mexico', aliases: ['MEX'] },
  { name: 'Cancun', countrySlug: 'mexico', aliases: ['CUN'] },
  { name: 'Guadalajara', countrySlug: 'mexico', aliases: ['GDL'] },

  // ── Europe ─────────────────────────────────────────────────────────────────
  // Every one of these is reachable on the Europe eSIM even where we sell no
  // country SKU — which is exactly the coverage a search for "Rome" used to miss.
  { name: 'Paris', nameKm: 'បារីស', countrySlug: 'france', aliases: ['CDG', 'ORY', 'Eiffel'], weight: 10 },
  { name: 'Nice', countrySlug: 'france', aliases: ['NCE', 'French Riviera'] },
  { name: 'Lyon', countrySlug: 'france', aliases: ['LYS'] },
  { name: 'Marseille', countrySlug: 'france', aliases: ['MRS'] },
  { name: 'Bordeaux', countrySlug: 'france', aliases: ['BOD'] },
  { name: 'Toulouse', countrySlug: 'france', aliases: ['TLS'] },
  { name: 'Cannes', countrySlug: 'france' },

  { name: 'London', nameKm: 'ឡុងដ៍', countrySlug: 'united-kingdom', aliases: ['LHR', 'LGW', 'STN', 'Heathrow'], weight: 10 },
  { name: 'Manchester', countrySlug: 'united-kingdom', aliases: ['MAN'] },
  { name: 'Edinburgh', countrySlug: 'united-kingdom', aliases: ['EDI', 'Scotland'] },
  { name: 'Birmingham', countrySlug: 'united-kingdom', aliases: ['BHX'] },
  { name: 'Glasgow', countrySlug: 'united-kingdom', aliases: ['GLA'] },
  { name: 'Liverpool', countrySlug: 'united-kingdom', aliases: ['LPL'] },
  { name: 'Oxford', countrySlug: 'united-kingdom' },
  { name: 'Cambridge', countrySlug: 'united-kingdom' },

  { name: 'Berlin', nameKm: 'ប៊ែរឡាំង', countrySlug: 'germany', aliases: ['BER'], weight: 8 },
  { name: 'Frankfurt', countrySlug: 'germany', aliases: ['FRA'], weight: 7 },
  { name: 'Munich', countrySlug: 'germany', aliases: ['MUC', 'München'] },
  { name: 'Hamburg', countrySlug: 'germany', aliases: ['HAM'] },
  { name: 'Cologne', countrySlug: 'germany', aliases: ['CGN', 'Köln'] },
  { name: 'Düsseldorf', countrySlug: 'germany', aliases: ['DUS', 'Dusseldorf'] },
  { name: 'Stuttgart', countrySlug: 'germany', aliases: ['STR'] },

  { name: 'Rome', nameKm: 'រ៉ូម', countrySlug: 'italy', aliases: ['FCO', 'Roma', 'Vatican'], weight: 8 },
  { name: 'Milan', nameKm: 'មីឡាន', countrySlug: 'italy', aliases: ['MXP', 'LIN', 'Milano'], weight: 7 },
  { name: 'Venice', countrySlug: 'italy', aliases: ['VCE', 'Venezia'] },
  { name: 'Florence', countrySlug: 'italy', aliases: ['FLR', 'Firenze'] },
  { name: 'Naples', countrySlug: 'italy', aliases: ['NAP', 'Napoli'] },
  { name: 'Pisa', countrySlug: 'italy', aliases: ['PSA'] },

  { name: 'Barcelona', nameKm: 'បាសេឡូន', countrySlug: 'spain', aliases: ['BCN'], weight: 8 },
  { name: 'Madrid', nameKm: 'ម៉ាឌ្រីដ', countrySlug: 'spain', aliases: ['MAD'], weight: 7 },
  { name: 'Seville', countrySlug: 'spain', aliases: ['SVQ', 'Sevilla'] },
  { name: 'Valencia', countrySlug: 'spain', aliases: ['VLC'] },
  { name: 'Malaga', countrySlug: 'spain', aliases: ['AGP'] },
  { name: 'Ibiza', countrySlug: 'spain', aliases: ['IBZ'] },
  { name: 'Palma', countrySlug: 'spain', aliases: ['PMI', 'Mallorca'] },

  { name: 'Amsterdam', nameKm: 'អាំស្ទែដាំ', countrySlug: 'netherlands', aliases: ['AMS', 'Schiphol'], weight: 7 },
  { name: 'Rotterdam', countrySlug: 'netherlands', aliases: ['RTM'] },
  { name: 'The Hague', countrySlug: 'netherlands', aliases: ['Den Haag'] },

  { name: 'Zurich', nameKm: 'ស៊ូរិច', countrySlug: 'switzerland', aliases: ['ZRH', 'Zürich'], weight: 6 },
  { name: 'Geneva', countrySlug: 'switzerland', aliases: ['GVA'] },
  { name: 'Bern', countrySlug: 'switzerland' },
  { name: 'Interlaken', countrySlug: 'switzerland', aliases: ['Jungfrau'] },
  { name: 'Lucerne', countrySlug: 'switzerland', aliases: ['Luzern'] },
  { name: 'Zermatt', countrySlug: 'switzerland', aliases: ['Matterhorn'] },

  { name: 'Vienna', nameKm: 'វីយែន', countrySlug: 'austria', aliases: ['VIE', 'Wien'] },
  { name: 'Salzburg', countrySlug: 'austria', aliases: ['SZG'] },
  { name: 'Innsbruck', countrySlug: 'austria', aliases: ['INN'] },

  { name: 'Brussels', countrySlug: 'belgium', aliases: ['BRU', 'Bruxelles'] },
  { name: 'Bruges', countrySlug: 'belgium', aliases: ['Brugge'] },
  { name: 'Antwerp', countrySlug: 'belgium', aliases: ['Antwerpen'] },

  { name: 'Lisbon', countrySlug: 'portugal', aliases: ['LIS', 'Lisboa'], weight: 6 },
  { name: 'Porto', countrySlug: 'portugal', aliases: ['OPO'] },
  { name: 'Faro', countrySlug: 'portugal', aliases: ['FAO', 'Algarve'] },
  { name: 'Madeira', countrySlug: 'portugal', aliases: ['FNC', 'Funchal'] },

  { name: 'Prague', countrySlug: 'czech-republic', aliases: ['PRG', 'Praha'], weight: 6 },
  { name: 'Brno', countrySlug: 'czech-republic', aliases: ['BRQ'] },

  { name: 'Warsaw', countrySlug: 'poland', aliases: ['WAW', 'Warszawa'] },
  { name: 'Krakow', countrySlug: 'poland', aliases: ['KRK', 'Cracow', 'Kraków'] },
  { name: 'Gdansk', countrySlug: 'poland', aliases: ['GDN', 'Gdańsk'] },

  { name: 'Budapest', countrySlug: 'hungary', aliases: ['BUD'], weight: 6 },
  { name: 'Copenhagen', countrySlug: 'denmark', aliases: ['CPH', 'København'] },
  { name: 'Stockholm', countrySlug: 'sweden', aliases: ['ARN', 'Arlanda'] },
  { name: 'Gothenburg', countrySlug: 'sweden', aliases: ['GOT', 'Göteborg'] },
  { name: 'Oslo', countrySlug: 'norway', aliases: ['OSL'] },
  { name: 'Bergen', countrySlug: 'norway', aliases: ['BGO', 'Fjords'] },
  { name: 'Tromso', countrySlug: 'norway', aliases: ['TOS', 'Tromsø', 'Northern Lights'] },
  { name: 'Helsinki', countrySlug: 'finland', aliases: ['HEL'] },
  { name: 'Rovaniemi', countrySlug: 'finland', aliases: ['RVN', 'Lapland'] },
  { name: 'Dublin', countrySlug: 'ireland', aliases: ['DUB'] },
  { name: 'Athens', countrySlug: 'greece', aliases: ['ATH'] },
  { name: 'Santorini', countrySlug: 'greece', aliases: ['JTR'] },
  { name: 'Bucharest', countrySlug: 'romania', aliases: ['OTP'] },
  { name: 'Sofia', countrySlug: 'bulgaria', aliases: ['SOF'] },
  { name: 'Bratislava', countrySlug: 'slovakia', aliases: ['BTS'] },
  { name: 'Vilnius', countrySlug: 'lithuania', aliases: ['VNO'] },
  { name: 'Tallinn', countrySlug: 'estonia', aliases: ['TLL'] },
  { name: 'Riga', countrySlug: 'latvia', aliases: ['RIX'] },
  { name: 'Luxembourg City', countrySlug: 'luxembourg', aliases: ['LUX'] },
  { name: 'Valletta', countrySlug: 'malta', aliases: ['MLA'] },
  { name: 'Nicosia', countrySlug: 'cyprus', aliases: ['Larnaca', 'LCA'] },
  { name: 'Chisinau', countrySlug: 'moldova', aliases: ['KIV'] },
  { name: 'Vatican City', countrySlug: 'vatican-city', aliases: ['Holy See', 'St Peters'] },
  { name: 'Vaduz', countrySlug: 'liechtenstein' },
  { name: 'Moscow', nameKm: 'ម៉ូស្គូ', countrySlug: 'russia', aliases: ['SVO', 'DME', 'Moskva'] },
  { name: 'Saint Petersburg', countrySlug: 'russia', aliases: ['LED', 'St Petersburg'] },
];

// ── Lookup ───────────────────────────────────────────────────────────────────

/**
 * A city we can actually sell for, joined to its country's coverage record.
 *
 * Cities whose country is not in the coverage index are dropped here rather
 * than rendered — a suggestion we cannot fulfil is worse than no suggestion.
 * Athens and Riga are the current examples: written down so they light up the
 * moment the supplier adds Greece or Latvia, silent until then.
 */
export interface CityCoverage {
  city: City;
  country: ServedCountry;
}

const resolved: CityCoverage[] = cities.flatMap((city) => {
  const country = getServedCountry(city.countrySlug);
  return country ? [{ city, country }] : [];
});

/** Cities we can sell for today, in the order they were declared. */
export const coveredCities: CityCoverage[] = resolved;

/** Cities listed above whose country we cannot sell yet. Useful in tests. */
export const uncoveredCitySlugs: string[] = [
  ...new Set(cities.filter((c) => !getServedCountry(c.countrySlug)).map((c) => c.countrySlug)),
];

function normalise(s: string): string {
  return s.toLowerCase().normalize('NFC').trim();
}

export interface CityMatch extends CityCoverage {
  /** How the text matched: 100 exact, 80 prefix, 45 contained. */
  tier: 100 | 80 | 45;
  /** `tier` plus the city's weight. Ranking within this list only. */
  score: number;
}

/**
 * Rank cities against what someone typed.
 *
 * Same shape as the destination search so the two can be merged and sorted on
 * one scale: exact 100, prefix 80, contained 45, then `weight` as a tie-break.
 * Two-character queries only match on a prefix — "an" should not drag in
 * Antwerp, Ankara, Antalya and Nanning.
 */
export function searchCities(query: string, limit = 6): CityMatch[] {
  const q = normalise(query);
  if (!q) return [];
  const prefixOnly = q.length < 3;

  const matches: CityMatch[] = [];

  for (const entry of resolved) {
    const { city } = entry;
    const fields = [city.name, city.nameKm, ...(city.aliases ?? [])].filter(
      (f): f is string => Boolean(f)
    );

    let best: 0 | 100 | 80 | 45 = 0;
    for (const field of fields) {
      const f = normalise(field);
      if (f === q) best = 100;
      else if (f.startsWith(q)) best = best === 100 ? best : 80;
      else if (!prefixOnly && f.includes(q) && best === 0) best = 45;
    }

    if (best !== 0) matches.push({ ...entry, tier: best, score: best + (city.weight ?? 0) });
  }

  return matches.sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * Country slugs a free-text query reaches through a city name.
 *
 * This is what the store's search box uses: typing "Guangzhou" has to light up
 * the China card, and typing "Paris" the France one, without either search box
 * growing its own copy of the city list.
 */
export function countrySlugsForCityQuery(query: string): Set<string> {
  return new Set(searchCities(query, 24).map((m) => m.country.slug));
}

/** The best city match for a query, or undefined. */
export function bestCityMatch(query: string): CityMatch | undefined {
  return searchCities(query, 1)[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// TRIP-PLANNING DESTINATIONS — deliberately NOT gated by eSIM coverage.
//
// Everything above this line answers "what can we sell?", so it resolves
// through data/coverage.ts and drops any city whose country we do not serve.
// That is right for the store and wrong for the trip planner: a traveler
// planning Athens should be able to plan Athens, and be told separately that we
// have no eSIM for Greece yet. Gating the planner on the supplier's catalogue
// made the product smaller than the data it already holds.
//
// Countries here come from data/countries.ts — all 241 of them, not the 52 we
// sell — so a city resolves to a country name whether or not a plan exists.
// ─────────────────────────────────────────────────────────────────────────────

import { countries } from './countries';

function countrySlugOf(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * City-index slugs whose spelling differs from the country list's. Four, all
 * verified against data/countries.ts rather than assumed: the registry says
 * "macao"/"uae"/"usa"/"czech-republic" where the country list says Macau,
 * United Arab Emirates, United States and Czechia.
 */
const SLUG_ALIASES: Record<string, string> = {
  macao: 'macau',
  uae: 'united-arab-emirates',
  usa: 'united-states',
  'czech-republic': 'czechia',
};

const COUNTRY_NAME_BY_SLUG: Map<string, string> = new Map(
  countries.map((country) => [countrySlugOf(country.name), country.name])
);

/** The country name a city sits in, for any country in the world. */
export function countryNameForCitySlug(slug: string): string | undefined {
  return COUNTRY_NAME_BY_SLUG.get(SLUG_ALIASES[slug] ?? slug);
}

export interface TripDestination {
  /** What the traveler reads: a city name, or a country name. */
  label: string;
  /** Khmer label where one is settled. */
  labelKm?: string;
  /**
   * The country this resolves to, and the ONLY thing written to
   * trip_plans.destination. The itinerary catalogue, savedPlaces.resolveTrip
   * and matchDestination all key on the country name, so a city must resolve to
   * one or the trip would be unreachable by every one of them.
   */
  country: string;
  kind: 'city' | 'country';
  /** Sort weight: better-known cities first, countries after their cities. */
  weight: number;
  /** Extra strings that should match this entry — IATA codes, old spellings. */
  aliases: string[];
}

/**
 * Every country in the world, plus every city we index, as one searchable list.
 * eSIM coverage is not consulted; see the note at the top of this section.
 */
export const tripDestinations: TripDestination[] = [
  ...cities.flatMap((city): TripDestination[] => {
    const country = countryNameForCitySlug(city.countrySlug);
    // A city we cannot name a country for would write a destination nothing
    // downstream could match, so it is dropped rather than guessed at.
    if (!country) return [];
    return [
      {
        label: city.name,
        labelKm: city.nameKm,
        country,
        kind: 'city',
        weight: (city.weight ?? 0) + 10,
        aliases: [...(city.aliases ?? []), country],
      },
    ];
  }),
  ...countries.map((country): TripDestination => ({
    label: country.name,
    country: country.name,
    kind: 'country',
    weight: 0,
    aliases: [],
  })),
];
