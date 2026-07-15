import type { AirportGuide } from '@/types';

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
        timing: '2h 30min before',
        description:
          'Go to the terminal building main entrance. Counters 1-12 are domestic. Counters 13-24 are international. Find your airline name on the screen above the counters.',
        phrases: [{ label: 'Where is check-in?', phrase: 'Check-in counter នៅឯណា?' }],
        watchOut: "Don't let strangers help you with bags — it's a tip scam.",
      },
      {
        title: 'Security',
        description:
          'Remove laptop, belt, shoes, and liquids. Liquids must be in containers under 100ml and in a clear plastic bag.',
      },
      {
        title: 'Immigration (Departures)',
        description:
          "Have your passport and boarding pass ready. Join the 'All Passports' line. The officer will stamp your passport. This is normal.",
      },
      {
        title: 'Find your gate',
        description:
          'After immigration, your gate is shown on your boarding pass and on the screens. Gates are A1-A12 and B1-B8.',
      },
      {
        title: 'Boarding',
        description:
          'Begin boarding 40 minutes before departure. Listen for announcements or watch your Domner App notification.',
      },
    ],
    arrivalSteps: [
      {
        title: 'Immigration (Arrivals)',
        description:
          'Follow the "Arrivals" signs. Cambodians use the "Cambodian Passports" line — it is usually faster.',
      },
      {
        title: 'Baggage claim',
        description:
          'Check the screens for your flight number and belt number. Trolleys are free.',
      },
      {
        title: 'Customs',
        description:
          'If you have nothing to declare, use the green channel. Keep receipts for expensive items.',
      },
      {
        title: 'Transport',
        description:
          'Use the official taxi counter, PassApp, or Grab. Agree on the price before getting in an unmetered tuk-tuk.',
        watchOut: 'Avoid strangers offering rides inside the terminal.',
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
        timing: '2h 30min before',
        description:
          'The new Siem Reap Angkor airport is large — arrive early. International check-in is in the main hall; look for your airline on the overhead screens.',
      },
      {
        title: 'Security',
        description:
          'Standard screening: laptops out, liquids under 100ml in a clear bag, empty your pockets into the tray.',
      },
      {
        title: 'Immigration',
        description:
          'Have your passport and boarding pass ready. Officers may ask your destination — answer simply and honestly.',
      },
      {
        title: 'Find your gate',
        description:
          'Gates are a 5-15 minute walk from immigration. Check your boarding pass and the screens.',
      },
      {
        title: 'Boarding',
        description: 'Boarding starts about 40 minutes before departure. Keep your passport handy.',
      },
    ],
    arrivalSteps: [
      {
        title: 'Immigration (Arrivals)',
        description: 'Follow signs to Arrivals. E-visa holders use the marked lane.',
      },
      {
        title: 'Baggage claim',
        description: 'Belt numbers show on screens. Bags take about 15-20 minutes.',
      },
      {
        title: 'Transport',
        description:
          'The airport is ~40 km from town. Use the official taxi/bus counter — fixed prices are posted.',
        watchOut: 'Ignore unofficial drivers approaching you in the hall.',
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
        timing: '3h before',
        description:
          'Suvarnabhumi is huge. Check-in rows A-W are on Level 4. Find your airline row on the big screens as you enter.',
      },
      {
        title: 'Security & Immigration',
        description:
          'Security and immigration are combined behind each entrance. Queues can take 45+ minutes at peak times.',
      },
      {
        title: 'Find your gate',
        description:
          'Gates A-G. Some gates are a 20-minute walk — check the estimated walking time on the signs.',
      },
      {
        title: 'Boarding',
        description: 'Boarding starts 40 minutes before departure and gates close 20 minutes before.',
      },
    ],
    arrivalSteps: [
      {
        title: 'Immigration (Arrivals)',
        description:
          'Follow "Immigration" signs on Level 2. Fill the arrival card if required. Tell the officer you are a tourist and show your hotel booking if asked.',
      },
      {
        title: 'Baggage claim',
        description: 'Belts 1-23. Check the screen for flight QH/PG/TG numbers. Bags take 20-25 minutes.',
      },
      {
        title: 'Transport',
        description:
          'Use the OFFICIAL taxi counter on Level 1, or the Airport Rail Link on Level B. Grab pickup is on Level 4.',
        watchOut: 'Avoid strangers offering rides — use the official queue only.',
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
        timing: '2h 30min before',
        description:
          'Terminal 1 is international, Terminal 2 is domestic. AirAsia and low-cost carriers use rows 1-8 in Terminal 1.',
      },
      {
        title: 'Security & Immigration',
        description: 'Queues move fast but can be long on weekends. Keep your boarding pass ready.',
      },
      {
        title: 'Find your gate',
        description: 'International gates are numbered 1-6. Walkways are short compared to BKK.',
      },
      { title: 'Boarding', description: 'Low-cost carriers close gates strictly 20 minutes before departure.' },
    ],
    arrivalSteps: [
      {
        title: 'Immigration',
        description: 'Follow the arrivals corridor to immigration on Level 1. Have your hotel address ready.',
      },
      { title: 'Baggage claim', description: 'Belts are just after immigration. Bags usually within 20 minutes.' },
      {
        title: 'Transport',
        description: 'Official taxi counter is at Exit 8. The A1 bus goes to the BTS for 30 THB.',
        watchOut: 'Say no to "taxi mafia" touts inside the hall.',
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
        timing: '2h 30min before',
        description:
          'International departures are in Terminal 2. Screens above each row show the airline. Keep your passport out.',
      },
      {
        title: 'Immigration & Security',
        description:
          'Fill the departure requirements online in advance if your airline requires it. Queues peak 6-9am.',
      },
      { title: 'Find your gate', description: 'Gates 9-28 are international. Allow 10 minutes to walk.' },
      { title: 'Boarding', description: 'Boarding begins 40 minutes before departure.' },
    ],
    arrivalSteps: [
      {
        title: 'Immigration (Arrivals)',
        description:
          'Cambodian passport holders: visa on arrival available ($25) or e-visa. Join the correct lane. Officers rarely speak Khmer — use the Domner phrase cards.',
      },
      { title: 'Baggage claim', description: 'Belt numbers on screens. Trolleys are free.' },
      {
        title: 'Transport',
        description:
          'Use the taxi ranks for Mai Linh (green) or Vinasun (white) taxis only, or book a Grab to the pickup zone.',
        watchOut: 'Avoid unmarked taxis — overcharging is common.',
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
        timing: '2h 30min before',
        description: 'Terminal 2 is international. Check-in rows A-E; find your airline on the screens.',
      },
      { title: 'Immigration & Security', description: 'Standard screening. Keep liquids under 100ml.' },
      { title: 'Find your gate', description: 'Gates 24-40 are international. Allow 10-15 minutes.' },
      { title: 'Boarding', description: 'Boarding begins 40 minutes before departure.' },
    ],
    arrivalSteps: [
      {
        title: 'Immigration',
        description: 'Visa on arrival counter is BEFORE immigration — go there first if you need one.',
      },
      { title: 'Baggage claim', description: 'Belts 1-6. Bags take about 20 minutes.' },
      {
        title: 'Transport',
        description: 'Hanoi is 30 km away. Use the official taxi queue or bus 86 to the Old Quarter.',
        watchOut: 'Agree the fare or insist on the meter before departing.',
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
        timing: '2h 30min before',
        description:
          'Check which terminal (1-4) your airline uses before you travel. Early check-in kiosks are available.',
      },
      {
        title: 'Immigration',
        description: 'Use the automated lanes with your passport — most nationalities are eligible.',
      },
      {
        title: 'Security at the gate',
        description: 'At Changi, security screening happens AT YOUR GATE, not centrally. Arrive at the gate early.',
      },
      { title: 'Boarding', description: 'Gates close 10 minutes before departure — Changi is strict.' },
    ],
    arrivalSteps: [
      {
        title: 'Arrival immigration',
        description:
          'Submit the SG Arrival Card online within 3 days before landing. Automated lanes are fast.',
      },
      { title: 'Baggage claim', description: 'Belts are clearly marked. Free trolleys everywhere.' },
      {
        title: 'Transport',
        description: 'MRT (cheapest), city shuttle, or the official taxi queue. Grab pickup points are signposted.',
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
        timing: '3h before',
        description: 'Terminal 3 handles most international flights. Have your passport and visa ready.',
      },
      {
        title: 'Immigration & Security',
        description: 'Fingerprints may be collected. Power banks must be in carry-on with capacity marked.',
      },
      { title: 'Find your gate', description: 'Terminal 3 is huge — a train connects concourses. Allow 30 minutes.' },
      { title: 'Boarding', description: 'Boarding begins 45 minutes before departure.' },
    ],
    arrivalSteps: [
      {
        title: 'Immigration',
        description:
          'Complete the arrival card. Fingerprint scan for foreigners at kiosks before the immigration queue.',
      },
      { title: 'Baggage claim', description: 'Follow signs — you may need the inter-terminal train first.' },
      {
        title: 'Transport',
        description: 'Airport Express train or the official taxi queue. Have your hotel name written in Chinese.',
        watchOut: 'Refuse "black taxis" offering rides in the hall.',
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
        timing: '3h before',
        description: 'Two terminals — check your airline. International check-in closes 60 minutes before departure.',
      },
      { title: 'Immigration & Security', description: 'Standard checks plus fingerprints for foreigners.' },
      { title: 'Find your gate', description: 'Long walks are common; follow the moving walkways.' },
      { title: 'Boarding', description: 'Boarding begins 45 minutes before departure.' },
    ],
    arrivalSteps: [
      { title: 'Immigration', description: 'Arrival card required. Kiosks print fingerprints first.' },
      { title: 'Baggage claim', description: 'Belt numbers on screens; bags take 20-30 minutes.' },
      {
        title: 'Transport',
        description: 'Maglev train (fastest), Metro Line 2, or official taxi queue. Alipay/WeChat Pay help a lot.',
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
        timing: '2h 30min before',
        description: 'Check your terminal (1, 2 or 3) before travelling — they are far apart.',
      },
      { title: 'Security & Immigration', description: 'Efficient but thorough. Keep your boarding pass visible.' },
      { title: 'Find your gate', description: 'Follow the color-coded signs. Trains connect satellite gates.' },
      { title: 'Boarding', description: 'Boarding begins 30-40 minutes before departure, always on time.' },
    ],
    arrivalSteps: [
      {
        title: 'Immigration',
        description:
          'Fill "Visit Japan Web" online before landing for faster entry. Fingerprints and photo at the counter.',
      },
      { title: 'Baggage claim', description: 'Bags are usually waiting — Japanese ground crews are fast.' },
      {
        title: 'Transport',
        description:
          'Narita Express or Keisei Skyliner to Tokyo (~60 min). Buy tickets at the counter with your passport.',
      },
    ],
  },
];

export function getAirportGuide(code: string): AirportGuide | undefined {
  return airportGuides.find((a) => a.code === code.toUpperCase());
}
