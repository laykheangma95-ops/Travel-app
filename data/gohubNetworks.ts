// ─────────────────────────────────────────────────────────────────────────────
// GENERATED FILE — do not edit by hand.
//
//   node scripts/build-gohub-catalog.mjs <GOHUB_PRICE_US_SILVER*.xlsx>
//
// The network facts behind each destination, from the price list's Network,
// Speed and Call/sms columns. These are the answers to the questions a customer
// asks before paying: whose network is this, where does it work, how fast.
//
// Everything here is a supplier fact we can stand behind. Anything we do NOT
// have — hotspot, KYC, top-up, activation window — is deliberately absent
// rather than guessed; see data/planPolicy.ts.
// ─────────────────────────────────────────────────────────────────────────────

export interface CoverageEntry {
  country: string;
  carriers: string[];
}

export interface DestinationNetwork {
  /** Per-country carrier breakdown. Empty for single-country destinations. */
  coverage: CoverageEntry[];
  /** Carriers with no country breakdown — the destination is the country. */
  carriers: string[];
}

export const destinationNetworks: Record<string, DestinationNetwork> = {
  'cambodia': {
    coverage: [],
    carriers: ['Metfone', 'Smart'],
  },
  'thailand': {
    coverage: [
      { country: 'Thailand', carriers: ['AIS', 'True'] },
    ],
    carriers: [],
  },
  'vietnam': {
    coverage: [
      { country: 'Vietnam', carriers: ['Vinaphone', 'Vietnamobile'] },
    ],
    carriers: [],
  },
  'laos': {
    coverage: [],
    carriers: ['ETL'],
  },
  'malaysia': {
    coverage: [
      { country: 'Malaysia', carriers: ['Celcomdigi', 'U-mobile'] },
    ],
    carriers: [],
  },
  'singapore': {
    coverage: [
      { country: 'Singapore', carriers: ['Simba'] },
    ],
    carriers: [],
  },
  'indonesia': {
    coverage: [
      { country: 'Indonesia', carriers: ['Telkomsel', 'Indosat'] },
    ],
    carriers: [],
  },
  'philippines': {
    coverage: [
      { country: 'Philippines', carriers: ['Smart'] },
    ],
    carriers: [],
  },
  'japan': {
    coverage: [
      { country: 'Japan', carriers: ['Rakuten', 'Docomo'] },
    ],
    carriers: [],
  },
  'south-korea': {
    coverage: [
      { country: 'South Korea', carriers: ['SK', 'LGU'] },
    ],
    carriers: [],
  },
  'china': {
    coverage: [
      { country: 'China', carriers: ['China Unicom', 'China Telecom'] },
    ],
    carriers: [],
  },
  'hong-kong': {
    coverage: [
      { country: 'Hong Kong', carriers: ['3HK'] },
    ],
    carriers: [],
  },
  'macao': {
    coverage: [
      { country: 'Macao', carriers: ['3HK'] },
    ],
    carriers: [],
  },
  'taiwan': {
    coverage: [
      { country: 'Taiwan', carriers: ['Chunghwa'] },
    ],
    carriers: [],
  },
  'india': {
    coverage: [],
    carriers: ['Bharti Airtel', 'Vodafone Idea', 'Jio'],
  },
  'turkey': {
    coverage: [],
    carriers: ['AVEA (Turk telekom)', 'Vodafone', 'Turkcell'],
  },
  'usa': {
    coverage: [],
    carriers: ['Verizon'],
  },
  'canada': {
    coverage: [],
    carriers: ['Verizon', 'Rogers', 'AT&T', 'Telcel'],
  },
  'australia': {
    coverage: [
      { country: 'Australia', carriers: ['Telstra'] },
      { country: 'New Zealand', carriers: ['Spark'] },
    ],
    carriers: [],
  },
  'france': {
    coverage: [
      { country: 'Germany', carriers: ['Vodafone Germany'] },
      { country: 'France', carriers: ['Free Mobile'] },
      { country: 'Netherlands', carriers: ['KPN', 'Vodafone Netherlands'] },
      { country: 'Switzerland', carriers: ['Swisscom', 'Salt Mobile SA'] },
      { country: 'Spain', carriers: ['Vodafone Spain', 'Orange Spain'] },
      { country: 'Poland', carriers: ['P4'] },
      { country: 'United Kingdom', carriers: ['3 (4G Only)'] },
      { country: 'Italy', carriers: ['3 (4G Only)'] },
      { country: 'Austria', carriers: ['3 (4G Only)'] },
      { country: 'Denmark', carriers: ['3 (4G Only)'] },
      { country: 'United States', carriers: ['Verizon'] },
      { country: 'Belgium', carriers: ['Orange Belgium'] },
      { country: 'Bulgaria', carriers: ['Telenor Bulgaria'] },
      { country: 'Cyprus', carriers: ['Epic LTD'] },
      { country: 'Czech Republic', carriers: ['O2 CZ'] },
      { country: 'Estonia', carriers: ['Tele2 Eesti'] },
      { country: 'Finland', carriers: ['DNA'] },
      { country: 'France', carriers: ['Wireless France'] },
      { country: 'Hungary', carriers: ['Telenor Hungary', 'Vodafone Hungary'] },
      { country: 'Ireland', carriers: ['3A Eir'] },
      { country: 'Lithuania', carriers: ['UAB Tele2'] },
      { country: 'Luxembourg', carriers: ['Orange Luxembourg'] },
      { country: 'Malta', carriers: ['Epic Malta'] },
      { country: 'Portugal', carriers: ['Vodafone Portugal'] },
      { country: 'Romania', carriers: ['Orange Romania', 'Vodafone Romania'] },
      { country: 'Russia', carriers: ['Vimpelcom'] },
      { country: 'Slovakia', carriers: ['O2 SK', 'Orange Slovensko'] },
      { country: 'Sweden', carriers: ['3 Sverige', 'Telenor Sverige AB'] },
      { country: 'Liechtenstein', carriers: ['Salt (Liechtenstein) AG'] },
      { country: 'Moldova', carriers: ['Orange Moldova'] },
      { country: 'Norway', carriers: ['Telia'] },
      { country: 'Vatican City', carriers: ['3 (4G Only)'] },
      { country: 'Turkey', carriers: ['TT Mobil'] },
    ],
    carriers: [],
  },
  'united-kingdom': {
    coverage: [
      { country: 'Germany', carriers: ['Vodafone Germany'] },
      { country: 'France', carriers: ['Free Mobile'] },
      { country: 'Netherlands', carriers: ['KPN', 'Vodafone Netherlands'] },
      { country: 'Switzerland', carriers: ['Swisscom', 'Salt Mobile SA'] },
      { country: 'Spain', carriers: ['Vodafone Spain', 'Orange Spain'] },
      { country: 'Poland', carriers: ['P4'] },
      { country: 'United Kingdom', carriers: ['3 (4G Only)'] },
      { country: 'Italy', carriers: ['3 (4G Only)'] },
      { country: 'Austria', carriers: ['3 (4G Only)'] },
      { country: 'Denmark', carriers: ['3 (4G Only)'] },
      { country: 'United States', carriers: ['Verizon'] },
      { country: 'Belgium', carriers: ['Orange Belgium'] },
      { country: 'Bulgaria', carriers: ['Telenor Bulgaria'] },
      { country: 'Cyprus', carriers: ['Epic LTD'] },
      { country: 'Czech Republic', carriers: ['O2 CZ'] },
      { country: 'Estonia', carriers: ['Tele2 Eesti'] },
      { country: 'Finland', carriers: ['DNA'] },
      { country: 'France', carriers: ['Wireless France'] },
      { country: 'Hungary', carriers: ['Telenor Hungary', 'Vodafone Hungary'] },
      { country: 'Ireland', carriers: ['3A Eir'] },
      { country: 'Lithuania', carriers: ['UAB Tele2'] },
      { country: 'Luxembourg', carriers: ['Orange Luxembourg'] },
      { country: 'Malta', carriers: ['Epic Malta'] },
      { country: 'Portugal', carriers: ['Vodafone Portugal'] },
      { country: 'Romania', carriers: ['Orange Romania', 'Vodafone Romania'] },
      { country: 'Russia', carriers: ['Vimpelcom'] },
      { country: 'Slovakia', carriers: ['O2 SK', 'Orange Slovensko'] },
      { country: 'Sweden', carriers: ['3 Sverige', 'Telenor Sverige AB'] },
      { country: 'Liechtenstein', carriers: ['Salt (Liechtenstein) AG'] },
      { country: 'Moldova', carriers: ['Orange Moldova'] },
      { country: 'Norway', carriers: ['Telia'] },
      { country: 'Vatican City', carriers: ['3 (4G Only)'] },
      { country: 'Turkey', carriers: ['TT Mobil'] },
    ],
    carriers: [],
  },
  'germany': {
    coverage: [
      { country: 'Germany', carriers: ['Vodafone Germany'] },
      { country: 'France', carriers: ['Free Mobile'] },
      { country: 'Netherlands', carriers: ['KPN', 'Vodafone Netherlands'] },
      { country: 'Switzerland', carriers: ['Swisscom', 'Salt Mobile SA'] },
      { country: 'Spain', carriers: ['Vodafone Spain', 'Orange Spain'] },
      { country: 'Poland', carriers: ['P4'] },
      { country: 'United Kingdom', carriers: ['3 (4G Only)'] },
      { country: 'Italy', carriers: ['3 (4G Only)'] },
      { country: 'Austria', carriers: ['3 (4G Only)'] },
      { country: 'Denmark', carriers: ['3 (4G Only)'] },
      { country: 'United States', carriers: ['Verizon'] },
      { country: 'Belgium', carriers: ['Orange Belgium'] },
      { country: 'Bulgaria', carriers: ['Telenor Bulgaria'] },
      { country: 'Cyprus', carriers: ['Epic LTD'] },
      { country: 'Czech Republic', carriers: ['O2 CZ'] },
      { country: 'Estonia', carriers: ['Tele2 Eesti'] },
      { country: 'Finland', carriers: ['DNA'] },
      { country: 'France', carriers: ['Wireless France'] },
      { country: 'Hungary', carriers: ['Telenor Hungary', 'Vodafone Hungary'] },
      { country: 'Ireland', carriers: ['3A Eir'] },
      { country: 'Lithuania', carriers: ['UAB Tele2'] },
      { country: 'Luxembourg', carriers: ['Orange Luxembourg'] },
      { country: 'Malta', carriers: ['Epic Malta'] },
      { country: 'Portugal', carriers: ['Vodafone Portugal'] },
      { country: 'Romania', carriers: ['Orange Romania', 'Vodafone Romania'] },
      { country: 'Russia', carriers: ['Vimpelcom'] },
      { country: 'Slovakia', carriers: ['O2 SK', 'Orange Slovensko'] },
      { country: 'Sweden', carriers: ['3 Sverige', 'Telenor Sverige AB'] },
      { country: 'Liechtenstein', carriers: ['Salt (Liechtenstein) AG'] },
      { country: 'Moldova', carriers: ['Orange Moldova'] },
      { country: 'Norway', carriers: ['Telia'] },
      { country: 'Vatican City', carriers: ['3 (4G Only)'] },
      { country: 'Turkey', carriers: ['TT Mobil'] },
    ],
    carriers: [],
  },
  'uae': {
    coverage: [],
    carriers: ['UAE - DU'],
  },
  'southeast-asia': {
    coverage: [
      { country: 'Singapore', carriers: ['Simba'] },
      { country: 'Malaysia', carriers: ['Celcomdigi', 'U-mobile'] },
      { country: 'Indonesia', carriers: ['Telkomsel', 'Indosat'] },
      { country: 'Thailand', carriers: ['AIS', 'True'] },
    ],
    carriers: [],
  },
  'europe': {
    coverage: [
      { country: 'Germany', carriers: ['Vodafone Germany'] },
      { country: 'France', carriers: ['Free Mobile'] },
      { country: 'Netherlands', carriers: ['KPN', 'Vodafone Netherlands'] },
      { country: 'Switzerland', carriers: ['Swisscom', 'Salt Mobile SA'] },
      { country: 'Spain', carriers: ['Vodafone Spain', 'Orange Spain'] },
      { country: 'Poland', carriers: ['P4'] },
      { country: 'United Kingdom', carriers: ['3 (4G Only)'] },
      { country: 'Italy', carriers: ['3 (4G Only)'] },
      { country: 'Austria', carriers: ['3 (4G Only)'] },
      { country: 'Denmark', carriers: ['3 (4G Only)'] },
      { country: 'United States', carriers: ['Verizon'] },
      { country: 'Belgium', carriers: ['Orange Belgium'] },
      { country: 'Bulgaria', carriers: ['Telenor Bulgaria'] },
      { country: 'Cyprus', carriers: ['Epic LTD'] },
      { country: 'Czech Republic', carriers: ['O2 CZ'] },
      { country: 'Estonia', carriers: ['Tele2 Eesti'] },
      { country: 'Finland', carriers: ['DNA'] },
      { country: 'France', carriers: ['Wireless France'] },
      { country: 'Hungary', carriers: ['Telenor Hungary', 'Vodafone Hungary'] },
      { country: 'Ireland', carriers: ['3A Eir'] },
      { country: 'Lithuania', carriers: ['UAB Tele2'] },
      { country: 'Luxembourg', carriers: ['Orange Luxembourg'] },
      { country: 'Malta', carriers: ['Epic Malta'] },
      { country: 'Portugal', carriers: ['Vodafone Portugal'] },
      { country: 'Romania', carriers: ['Orange Romania', 'Vodafone Romania'] },
      { country: 'Russia', carriers: ['Vimpelcom'] },
      { country: 'Slovakia', carriers: ['O2 SK', 'Orange Slovensko'] },
      { country: 'Sweden', carriers: ['3 Sverige', 'Telenor Sverige AB'] },
      { country: 'Liechtenstein', carriers: ['Salt (Liechtenstein) AG'] },
      { country: 'Moldova', carriers: ['Orange Moldova'] },
      { country: 'Norway', carriers: ['Telia'] },
      { country: 'Vatican City', carriers: ['3 (4G Only)'] },
      { country: 'Turkey', carriers: ['TT Mobil'] },
    ],
    carriers: [],
  },
  'singapore-malaysia-indonesia': {
    coverage: [
      { country: 'Singapore', carriers: ['Simba'] },
      { country: 'Malaysia', carriers: ['Celcomdigi', 'U-mobile'] },
      { country: 'Indonesia', carriers: ['Telkomsel', 'Indosat'] },
    ],
    carriers: [],
  },
  'hong-kong-macao': {
    coverage: [],
    carriers: ['China Telecom'],
  },
  'china-hong-kong-macao': {
    coverage: [
      { country: 'China', carriers: ['China Telecom'] },
      { country: 'Hong Kong', carriers: ['China Telecom HK', 'HKT'] },
      { country: 'Macao', carriers: ['China Telecom(Macau)'] },
    ],
    carriers: [],
  },
  'usa-mexico-canada': {
    coverage: [],
    carriers: ['Verizon', 'Rogers', 'AT&T', 'Telcel'],
  },
};
