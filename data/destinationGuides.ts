import type { DestinationGuide } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// Destination guides — the "help before you buy" layer.
//
// Everything here is FACTUAL and stable: IANA timezone, plug standard, mains
// voltage, emergency numbers, typical costs, best months. Nothing in this file
// is a live feed, so the guide works offline and never shows stale "current"
// data pretending to be fresh.
//
// Two deliberate omissions, because inventing them would be worse than leaving
// them out:
//
//   • No numeric "safety score". There is no defensible source for reducing a
//     country to a number, and a wrong one is both useless and insulting. The
//     honest equivalent is `data/scamAlerts.ts` — specific, actionable, local.
//   • No "current weather" or "current alerts". Those need a live source; the
//     UI reads them from an API when one is configured and otherwise says so
//     rather than rendering a plausible-looking guess.
//
// Emergency numbers are safety-critical. Only widely-published national numbers
// are listed. If you add a destination, verify them against that country's own
// government or tourism authority — not against another travel site.
//
// Written for a Cambodian passport holder leaving Phnom Penh: visa notes live
// in data/customsRules.ts, and `plugTypes` is compared against Cambodia's own
// A/C/G @ 230V so the guide can answer "do I need an adapter?" directly.
// ─────────────────────────────────────────────────────────────────────────────

/** Cambodia's own plug standard — the baseline every destination is compared to. */
export const HOME_PLUG_TYPES = ['A', 'C', 'G'] as const;
export const HOME_VOLTAGE = 230;

export const destinationGuides: DestinationGuide[] = [
  {
    countrySlug: 'thailand',
    timezone: 'Asia/Bangkok',
    plugTypes: ['A', 'B', 'C'],
    voltage: 220,
    languages: ['Thai'],
    bestMonths: 'November – February',
    climate: 'Cool and dry Nov–Feb, very hot Mar–May, monsoon rain Jun–Oct.',
    dailyBudgetUsd: { budget: 30, comfortable: 75 },
    tippingNote: 'Not expected. Rounding up a taxi fare or leaving 20–50 THB at a restaurant is plenty.',
    highlights: [
      'Grand Palace and Wat Pho, Bangkok',
      'Chatuchak weekend market — 15,000 stalls',
      'Old City temples, Chiang Mai',
      'Railay and Phi Phi beaches, Krabi',
    ],
    hiddenGems: [
      'Talad Noi, Bangkok — riverside lanes of old workshops and street art, five minutes from Chinatown',
      'Ban Bat — the last handmade alms-bowl street in the country, still worked by a handful of families',
    ],
    tips: [
      'The BTS Skytrain and MRT beat any taxi in Bangkok traffic — buy a Rabbit card at any station.',
      'Dress for temples: shoulders and knees covered, at the Grand Palace especially. They will turn you away.',
      'Cambodian riel is not exchangeable in Thailand. Bring USD or withdraw THB from an ATM on arrival.',
    ],
    emergency: { police: '191', ambulance: '1669', fire: '199', tourist: '1155' },
  },
  {
    countrySlug: 'vietnam',
    timezone: 'Asia/Ho_Chi_Minh',
    plugTypes: ['A', 'C', 'F'],
    voltage: 220,
    languages: ['Vietnamese'],
    bestMonths: 'February – April, August – October',
    climate: 'The country spans three climates — the north is cold Dec–Feb while the south stays hot year round.',
    dailyBudgetUsd: { budget: 25, comfortable: 60 },
    tippingNote: 'Not customary. Rounding up is welcome; upscale restaurants may add a 5% service charge.',
    highlights: [
      'Hạ Long Bay limestone karsts',
      'Hội An old town, lantern-lit after dark',
      'Cu Chi tunnels and the War Remnants Museum, Ho Chi Minh City',
      'Sa Pa rice terraces',
    ],
    hiddenGems: [
      'Phong Nha caves — among the largest cave systems on earth, and far quieter than Hạ Long',
      'Train Street, Hanoi — a working railway running an arm’s length from café tables',
    ],
    tips: [
      'Book Grab rather than flagging a taxi; if you must, use Mai Linh (green) or Vinasun (white).',
      'Cross the road at a slow, constant pace and do not stop — traffic flows around you. Hesitating is what causes accidents.',
      'Cash still rules outside the big cities. Keep small notes for markets and buses.',
    ],
    emergency: { police: '113', ambulance: '115', fire: '114' },
  },
  {
    countrySlug: 'japan',
    timezone: 'Asia/Tokyo',
    plugTypes: ['A', 'B'],
    voltage: 100,
    languages: ['Japanese'],
    bestMonths: 'March – May, October – November',
    climate: 'Cherry blossom in spring, humid summers, brilliant autumn colour, snow in the north.',
    dailyBudgetUsd: { budget: 70, comfortable: 160 },
    tippingNote: 'Do not tip. It can genuinely cause offence — good service is the baseline, not something bought.',
    highlights: [
      'Fushimi Inari’s thousand torii gates, Kyoto',
      'Shibuya Crossing and Senso-ji, Tokyo',
      'Mount Fuji from the Fuji Five Lakes',
      'Nara’s free-roaming deer park',
    ],
    hiddenGems: [
      'Yanaka, Tokyo — a low-rise old-town district that survived both the war and the bubble',
      'Naoshima — an entire island turned over to contemporary art museums',
    ],
    tips: [
      'Get an IC card (Suica or PASMO) at the airport. It works on nearly every train, bus and convenience store nationwide.',
      'Japan runs on 100V — the lowest mains voltage in the world. Your Cambodian plug fits the socket, but check any high-draw device (hair dryer, kettle) is rated for 100V.',
      'Carry cash. Japan is far more cash-based than its reputation suggests, especially at small restaurants and shrines.',
    ],
    emergency: { police: '110', ambulance: '119', fire: '119' },
  },
  {
    countrySlug: 'south-korea',
    timezone: 'Asia/Seoul',
    plugTypes: ['C', 'F'],
    voltage: 220,
    languages: ['Korean'],
    bestMonths: 'April – June, September – November',
    climate: 'Four sharp seasons — humid summers, genuinely cold winters, mild spring and autumn.',
    dailyBudgetUsd: { budget: 55, comfortable: 120 },
    tippingNote: 'Not practised. No tip is expected anywhere, including taxis.',
    highlights: [
      'Gyeongbokgung Palace and the guard change, Seoul',
      'Bukchon Hanok Village',
      'Jeju Island volcanic coast',
      'Gamcheon Culture Village, Busan',
    ],
    hiddenGems: [
      'Ihwa Mural Village, Seoul — a hillside neighbourhood painted by artists to stop its demolition',
      'Suwon Hwaseong Fortress — a walkable 18th-century wall almost no visitor makes time for',
    ],
    tips: [
      'A T-money card covers subway, bus and taxi across the country. Buy it at any convenience store.',
      'Korea uses the round European plug (C/F). Your flat Cambodian pins will not fit — bring an adapter.',
      'Naver Map or KakaoMap work far better than Google Maps here, which is legally restricted in Korea.',
    ],
    emergency: { police: '112', ambulance: '119', fire: '119' },
  },
  {
    countrySlug: 'china',
    timezone: 'Asia/Shanghai',
    plugTypes: ['A', 'C', 'I'],
    voltage: 220,
    languages: ['Mandarin Chinese'],
    bestMonths: 'April – May, September – October',
    climate: 'Enormous range — Beijing freezes in winter, the south stays subtropical.',
    dailyBudgetUsd: { budget: 40, comfortable: 95 },
    tippingNote: 'Not customary and occasionally refused.',
    highlights: [
      'The Great Wall at Mutianyu — restored but far less crowded than Badaling',
      'Forbidden City and Tiananmen, Beijing',
      'The Bund, Shanghai',
      'Terracotta Army, Xi’an',
    ],
    hiddenGems: [
      'Pingyao — a fully intact Ming-era walled city',
      'Zhangjiajie — the sandstone pillars that inspired the floating mountains in Avatar',
    ],
    tips: [
      'Set up Alipay or WeChat Pay before you fly and link a card. Cash is genuinely awkward now; many places no longer take it.',
      'Most non-Chinese apps and sites are blocked. Check your eSIM plan covers this before relying on Telegram or Google Maps.',
      'Download offline maps and translation before arrival — the moment you need them is the moment you cannot download them.',
    ],
    emergency: { police: '110', ambulance: '120', fire: '119' },
  },
  {
    countrySlug: 'singapore',
    timezone: 'Asia/Singapore',
    plugTypes: ['G'],
    voltage: 230,
    languages: ['English', 'Mandarin', 'Malay', 'Tamil'],
    bestMonths: 'February – April',
    climate: 'Hot and humid all year, around 26–32°C, with a sharp afternoon downpour most days.',
    dailyBudgetUsd: { budget: 60, comfortable: 140 },
    tippingNote: 'Not expected — most bills already include a 10% service charge.',
    highlights: [
      'Gardens by the Bay Supertree grove',
      'Marina Bay Sands and the waterfront promenade',
      'Hawker centres — Maxwell, Lau Pa Sat, Old Airport Road',
      'Singapore Botanic Gardens',
    ],
    hiddenGems: [
      'Tiong Bahru — pre-war walk-up flats, independent bookshops, the city’s calmest morning',
      'Pulau Ubin — a rural island of dirt tracks and kampong houses, 10 minutes by bumboat',
    ],
    tips: [
      'The Type G plug is the same as Cambodia’s — no adapter needed.',
      'Hawker centres are the best food in the city and the cheapest. A world-class meal runs $4–6.',
      'Fines are real and enforced: no eating or drinking on the MRT, and durian is banned on public transport.',
    ],
    emergency: { police: '999', ambulance: '995', fire: '995' },
  },
  {
    countrySlug: 'malaysia',
    timezone: 'Asia/Kuala_Lumpur',
    plugTypes: ['G'],
    voltage: 240,
    languages: ['Malay', 'English'],
    bestMonths: 'May – July',
    climate: 'Tropical year round; the east and west coasts have opposite monsoon seasons.',
    dailyBudgetUsd: { budget: 30, comfortable: 70 },
    tippingNote: 'Not expected. Many restaurants add a 10% service charge.',
    highlights: [
      'Petronas Towers and KLCC park',
      'Batu Caves',
      'George Town heritage streets, Penang',
      'Langkawi beaches and cable car',
    ],
    hiddenGems: [
      'Ipoh old town — colonial shophouses, cave temples and the country’s best white coffee',
      'Kampung Baru, Kuala Lumpur — a Malay village that never left, surrounded by skyscrapers',
    ],
    tips: [
      'The Type G plug matches Cambodia’s — no adapter needed.',
      'Grab is the default for getting around and much cheaper than metered taxis.',
      'Penang is the food capital, not KL. Build a day around it if you can.',
    ],
    emergency: { police: '999', ambulance: '999', fire: '994' },
  },
  {
    countrySlug: 'indonesia',
    timezone: 'Asia/Jakarta',
    plugTypes: ['C', 'F'],
    voltage: 230,
    languages: ['Indonesian'],
    bestMonths: 'May – September',
    climate: 'Dry season May–Sep, wet season Oct–Apr. Bali is warm all year.',
    dailyBudgetUsd: { budget: 25, comfortable: 65 },
    tippingNote: 'Not expected. Small change for drivers and porters is appreciated.',
    highlights: [
      'Borobudur and Prambanan temples, Yogyakarta',
      'Ubud rice terraces and monkey forest, Bali',
      'Mount Bromo at sunrise',
      'Komodo National Park',
    ],
    hiddenGems: [
      'Sidemen, Bali — the valley Ubud was thirty years ago, without the traffic',
      'Belitung — granite boulder beaches and clear water, almost no international visitors',
    ],
    tips: [
      'Indonesia uses round C/F pins. Your Cambodian plug will not fit — bring an adapter.',
      'Bali’s tourist levy is paid online before arrival. Keep the QR code on your phone.',
      'Gojek and Grab both run motorbike taxis — far faster than a car in Jakarta or Denpasar.',
    ],
    emergency: { police: '110', ambulance: '119', fire: '113' },
  },
  {
    countrySlug: 'philippines',
    timezone: 'Asia/Manila',
    plugTypes: ['A', 'B', 'C'],
    voltage: 220,
    languages: ['Filipino', 'English'],
    bestMonths: 'December – April',
    climate: 'Dry Dec–Apr; typhoon season runs roughly June to November.',
    dailyBudgetUsd: { budget: 30, comfortable: 70 },
    tippingNote: 'Appreciated but not required — 10% at restaurants is generous.',
    highlights: [
      'El Nido and Coron lagoons, Palawan',
      'Chocolate Hills, Bohol',
      'Banaue rice terraces',
      'Intramuros, Manila',
    ],
    hiddenGems: [
      'Siquijor — a quiet island with waterfalls and a reputation for folk healing',
      'Batanes — wind-scoured hills and stone houses closer to Taiwan than to Manila',
    ],
    tips: [
      'English is an official language and widely spoken — the easiest destination in the region to ask for help in.',
      'Domestic flights are the practical way between islands; ferries are slow and weather-dependent.',
      'Check typhoon forecasts before booking island transfers in the June–November window.',
    ],
    emergency: { police: '911', ambulance: '911', fire: '911' },
  },
  {
    countrySlug: 'laos',
    timezone: 'Asia/Vientiane',
    plugTypes: ['A', 'B', 'C', 'E', 'F'],
    voltage: 230,
    languages: ['Lao'],
    bestMonths: 'November – February',
    climate: 'Cool and dry Nov–Feb, hot Mar–May, rainy Jun–Oct.',
    dailyBudgetUsd: { budget: 25, comfortable: 55 },
    tippingNote: 'Not customary; rounding up is plenty.',
    highlights: [
      'Luang Prabang old town and the dawn alms procession',
      'Kuang Si waterfalls',
      'Vang Vieng karst landscape',
      'That Luang, Vientiane',
    ],
    hiddenGems: [
      'The Bolaven Plateau — coffee farms and waterfalls, barely visited',
      'Nong Khiaw — river gorges and viewpoints, a quieter Vang Vieng',
    ],
    tips: [
      'The Laos–China Railway has made Vientiane–Luang Prabang a two-hour trip. Book ahead; it sells out.',
      'Your Cambodian plug fits — no adapter needed.',
      'The alms procession is a religious rite, not a show. Watch from a distance and do not use flash.',
    ],
    emergency: { police: '191', ambulance: '195', fire: '190' },
  },
  {
    countrySlug: 'hong-kong',
    timezone: 'Asia/Hong_Kong',
    plugTypes: ['G'],
    voltage: 220,
    languages: ['Cantonese', 'English'],
    bestMonths: 'October – December',
    climate: 'Warm and humid most of the year; autumn is clear and comfortable.',
    dailyBudgetUsd: { budget: 55, comfortable: 130 },
    tippingNote: 'Restaurants add 10% service. Rounding up a taxi fare is normal.',
    highlights: [
      'Victoria Peak tram and skyline',
      'Star Ferry across the harbour',
      'Tian Tan Buddha, Lantau',
      'Temple Street night market',
    ],
    hiddenGems: [
      'Cheung Chau — a car-free fishing island 35 minutes by ferry',
      'Dragon’s Back — a ridge walk with sea views that starts inside the city',
    ],
    tips: [
      'The Type G plug matches Cambodia’s — no adapter needed.',
      'An Octopus card covers the MTR, ferries, buses and most convenience stores.',
      'The Star Ferry costs a few HKD and is the best value view in the city.',
    ],
    emergency: { police: '999', ambulance: '999', fire: '999' },
  },
  {
    countrySlug: 'taiwan',
    timezone: 'Asia/Taipei',
    plugTypes: ['A', 'B'],
    voltage: 110,
    languages: ['Mandarin Chinese'],
    bestMonths: 'October – December, March – May',
    climate: 'Subtropical; typhoons possible Jul–Sep, mild and pleasant in autumn.',
    dailyBudgetUsd: { budget: 40, comfortable: 90 },
    tippingNote: 'Not expected anywhere.',
    highlights: [
      'Taipei 101 and Elephant Mountain at dusk',
      'Jiufen mountain-side lanes',
      'Taroko Gorge',
      'Shilin and Raohe night markets',
    ],
    hiddenGems: [
      'Alishan — a narrow-gauge forest railway climbing into cloud-level cedar',
      'Tainan — the old capital, and the best food on the island',
    ],
    tips: [
      'Taiwan runs at 110V. Your flat Cambodian pins fit, but check high-draw devices are rated for it.',
      'An EasyCard covers metro, bus and convenience stores nationwide.',
      'The high-speed rail crosses the whole island in under two hours.',
    ],
    emergency: { police: '110', ambulance: '119', fire: '119' },
  },
  {
    countrySlug: 'india',
    timezone: 'Asia/Kolkata',
    plugTypes: ['C', 'D', 'M'],
    voltage: 230,
    languages: ['Hindi', 'English', 'and 20+ other official languages'],
    bestMonths: 'October – March',
    climate: 'Hot Apr–Jun, monsoon Jun–Sep, cool and dry Oct–Mar.',
    dailyBudgetUsd: { budget: 25, comfortable: 65 },
    tippingNote: '10% at restaurants is normal; small notes for porters and drivers.',
    highlights: [
      'Taj Mahal, Agra',
      'Amber Fort and the old city, Jaipur',
      'Varanasi ghats at dawn',
      'Kerala backwaters',
    ],
    hiddenGems: [
      'Hampi — a boulder-strewn ruined empire in Karnataka',
      'Majuli — the largest river island in the world, in Assam',
    ],
    tips: [
      'India uses large round D/M pins alongside C. Bring a universal adapter.',
      'Book trains well in advance through IRCTC; the good classes sell out weeks ahead.',
      'Drink only sealed bottled water, and be cautious with ice and raw salad for the first few days.',
    ],
    emergency: { police: '112', ambulance: '102', fire: '101' },
  },
  {
    countrySlug: 'uae',
    timezone: 'Asia/Dubai',
    plugTypes: ['G'],
    voltage: 230,
    languages: ['Arabic', 'English'],
    bestMonths: 'November – March',
    climate: 'Very hot May–Sep, often above 40°C. Winter is warm and dry.',
    dailyBudgetUsd: { budget: 60, comfortable: 150 },
    tippingNote: '10–15% is common; many bills already include a service charge.',
    highlights: [
      'Burj Khalifa observation decks',
      'Sheikh Zayed Grand Mosque, Abu Dhabi',
      'Dubai Creek and the gold and spice souks',
      'Desert dune safari',
    ],
    hiddenGems: [
      'Al Fahidi historical district — wind-tower houses from before the oil',
      'Hatta — mountain pools and hiking, 90 minutes from the city',
    ],
    tips: [
      'The Type G plug matches Cambodia’s — no adapter needed.',
      'Dress modestly in public areas and mosques: shoulders and knees covered.',
      'Public displays of affection and drinking outside licensed venues are offences here. Take it seriously.',
    ],
    emergency: { police: '999', ambulance: '998', fire: '997' },
  },
  {
    countrySlug: 'australia',
    timezone: 'Australia/Sydney',
    plugTypes: ['I'],
    voltage: 230,
    languages: ['English'],
    bestMonths: 'September – November, March – May',
    climate: 'Southern-hemisphere seasons — reversed from Cambodia. December is midsummer.',
    dailyBudgetUsd: { budget: 70, comfortable: 160 },
    tippingNote: 'Not expected — staff are paid a full wage. Round up if service was excellent.',
    highlights: [
      'Sydney Opera House and Harbour Bridge',
      'Great Barrier Reef, Cairns',
      'Great Ocean Road and the Twelve Apostles',
      'Uluru at sunset',
    ],
    hiddenGems: [
      'Kangaroo Island — wildlife without the tour buses',
      'The Grampians — sandstone ranges and rock art, three hours from Melbourne',
    ],
    tips: [
      'Australia uses the angled Type I plug found almost nowhere else. You will need an adapter — buy it before you fly.',
      'Seasons are reversed. Cambodia’s cool season is Australia’s summer.',
      'UV is genuinely extreme even on cloudy days. Sunscreen is not optional.',
    ],
    emergency: { police: '000', ambulance: '000', fire: '000' },
  },
  {
    countrySlug: 'united-kingdom',
    timezone: 'Europe/London',
    plugTypes: ['G'],
    voltage: 230,
    languages: ['English'],
    bestMonths: 'May – September',
    climate: 'Mild and changeable. Long daylight in summer, dark by 16:00 in December.',
    dailyBudgetUsd: { budget: 75, comfortable: 170 },
    tippingNote: '10–12% at restaurants unless service is already included. Not expected in pubs.',
    highlights: [
      'Tower of London and Westminster',
      'British Museum — free entry',
      'Edinburgh old town and the castle',
      'The Cotswolds and Bath',
    ],
    hiddenGems: [
      'Whitby — abbey ruins on the Yorkshire coast that gave Dracula its setting',
      'The Peak District — walking country an hour from Manchester',
    ],
    tips: [
      'The Type G plug is the same as Cambodia’s — no adapter needed.',
      'Contactless card or phone works directly on London buses and the Tube. No ticket needed.',
      'Most national museums are free — the British Museum, National Gallery, Tate and more.',
    ],
    emergency: { police: '999', ambulance: '999', fire: '999' },
  },
  {
    countrySlug: 'france',
    timezone: 'Europe/Paris',
    plugTypes: ['C', 'E'],
    voltage: 230,
    languages: ['French'],
    bestMonths: 'April – June, September – October',
    climate: 'Warm dry summers in the south, mild damp winters in the north.',
    dailyBudgetUsd: { budget: 70, comfortable: 160 },
    tippingNote: 'Service is included by law. Rounding up or leaving a euro or two is a compliment, not a duty.',
    highlights: [
      'Eiffel Tower and the Champ de Mars',
      'Louvre and Musée d’Orsay',
      'Mont Saint-Michel',
      'Provence lavender and hill villages',
    ],
    hiddenGems: [
      'Annecy — a canal town under the Alps with startlingly clear water',
      'Colmar — half-timbered Alsace streets on the German border',
    ],
    tips: [
      'France uses round C/E pins. Your Cambodian plug will not fit — bring an adapter.',
      'A simple "Bonjour" before any request changes how you are treated. It is not optional politeness here.',
      'TGV trains are far better than domestic flights between cities, and cheaper booked early.',
    ],
    emergency: { police: '17', ambulance: '15', fire: '18', tourist: '112' },
  },
  {
    countrySlug: 'germany',
    timezone: 'Europe/Berlin',
    plugTypes: ['C', 'F'],
    voltage: 230,
    languages: ['German'],
    bestMonths: 'May – September, December for markets',
    climate: 'Warm summers, cold winters, Christmas markets from late November.',
    dailyBudgetUsd: { budget: 65, comfortable: 145 },
    tippingNote: 'Round up or add 5–10%, handed to the server directly rather than left on the table.',
    highlights: [
      'Brandenburg Gate and the East Side Gallery, Berlin',
      'Neuschwanstein Castle',
      'Cologne Cathedral',
      'Christmas markets, late November onward',
    ],
    hiddenGems: [
      'Saxon Switzerland — sandstone towers and bridges near Dresden',
      'Bamberg — a wholly intact medieval town, and smoked beer',
    ],
    tips: [
      'Germany uses round C/F pins. Your Cambodian plug will not fit — bring an adapter.',
      'Cash is still expected at many bakeries, bars and small restaurants.',
      'Sunday closing is near-total for shops. Buy what you need on Saturday.',
    ],
    emergency: { police: '110', ambulance: '112', fire: '112' },
  },
  {
    countrySlug: 'usa',
    timezone: 'America/New_York',
    plugTypes: ['A', 'B'],
    voltage: 120,
    languages: ['English'],
    bestMonths: 'April – June, September – October',
    climate: 'Continental scale — plan by the specific city, not the country.',
    dailyBudgetUsd: { budget: 90, comfortable: 200 },
    tippingNote: 'Expected and part of wages: 18–20% at restaurants, $1–2 per drink, $2–5 for housekeeping.',
    highlights: [
      'Statue of Liberty and Central Park, New York',
      'Grand Canyon',
      'Golden Gate Bridge, San Francisco',
      'Yosemite and Yellowstone',
    ],
    hiddenGems: [
      'Marfa, Texas — minimalist art installations in high desert',
      'Olympic National Park — rainforest, mountains and coast in one park',
    ],
    tips: [
      'Tipping is not optional here — it is most service workers’ actual income. Budget 20% on top of every restaurant bill.',
      'The US runs at 120V. Your flat pins fit, but check high-draw devices are rated for it.',
      'Advertised prices exclude sales tax, which is added at the register and varies by state.',
    ],
    emergency: { police: '911', ambulance: '911', fire: '911' },
  },
  {
    countrySlug: 'canada',
    timezone: 'America/Toronto',
    plugTypes: ['A', 'B'],
    voltage: 120,
    languages: ['English', 'French'],
    bestMonths: 'June – September',
    climate: 'Warm short summers, long and genuinely cold winters.',
    dailyBudgetUsd: { budget: 75, comfortable: 165 },
    tippingNote: '15–20% at restaurants, as in the US.',
    highlights: [
      'Niagara Falls',
      'Banff and Lake Louise',
      'Old Montréal',
      'Stanley Park, Vancouver',
    ],
    hiddenGems: [
      'Gros Morne, Newfoundland — fjords and exposed mantle rock',
      'Haida Gwaii — old-growth forest and Haida cultural sites off the BC coast',
    ],
    tips: [
      'Canada runs at 120V. Your flat pins fit, but check high-draw devices are rated for it.',
      'Winter cold is on another scale — a Cambodian jacket will not be enough. Buy layers on arrival.',
      'Distances are vast. Toronto to Vancouver is a five-hour flight, not a drive.',
    ],
    emergency: { police: '911', ambulance: '911', fire: '911' },
  },
];

const guideBySlug = new Map(destinationGuides.map((g) => [g.countrySlug, g]));

export function getDestinationGuide(slug: string): DestinationGuide | undefined {
  return guideBySlug.get(slug);
}

/**
 * True when a Cambodian plug will not physically fit the destination's sockets.
 * Purely a shape comparison — voltage is reported separately, because a socket
 * that fits at a different voltage is the more dangerous case.
 */
export function needsAdapter(guide: DestinationGuide): boolean {
  return !guide.plugTypes.some((t) => (HOME_PLUG_TYPES as readonly string[]).includes(t));
}
