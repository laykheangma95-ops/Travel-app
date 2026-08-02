// Airport coordinates (IATA → [lat, lon]) for drawing route lines on the
// live tracking map. Covers airports Cambodian travelers use most plus major
// regional hubs; unknown codes simply skip the route overlay.

export const AIRPORT_COORDS: Record<string, [number, number]> = {
  // Cambodia
  PNH: [11.5466, 104.8441],
  KTI: [11.1039, 104.8547], // Techo International
  SAI: [13.3651, 104.2245], // Siem Reap Angkor International
  REP: [13.4107, 103.8128],
  KOS: [10.5797, 103.6367],
  // Thailand
  BKK: [13.69, 100.7501],
  DMK: [13.9126, 100.6069],
  HKT: [8.1132, 98.3169],
  CNX: [18.7668, 98.9626],
  // Vietnam
  SGN: [10.8189, 106.652],
  HAN: [21.2212, 105.8071],
  DAD: [16.0439, 108.1994],
  CXR: [11.9982, 109.2193],
  // Singapore / Malaysia / Indonesia / Philippines
  SIN: [1.3644, 103.9915],
  KUL: [2.7456, 101.7099],
  CGK: [-6.1256, 106.6559],
  DPS: [-8.7482, 115.1672],
  MNL: [14.5086, 121.0198],
  CEB: [10.3075, 123.9789],
  // China / HK / Taiwan / Macau
  PEK: [40.0799, 116.6031],
  PKX: [39.5098, 116.4105],
  PVG: [31.1443, 121.8083],
  SHA: [31.1979, 121.3363],
  CAN: [23.3924, 113.2988],
  SZX: [22.6393, 113.8107],
  KMG: [25.1019, 102.9292],
  HKG: [22.308, 113.9185],
  TPE: [25.0777, 121.2328],
  MFM: [22.1496, 113.5915],
  // Japan / Korea
  NRT: [35.7719, 140.3929],
  HND: [35.5494, 139.7798],
  KIX: [34.4342, 135.2441],
  FUK: [33.5859, 130.4507],
  CTS: [42.7752, 141.6923],
  ICN: [37.4602, 126.4407],
  GMP: [37.5583, 126.7906],
  PUS: [35.1795, 128.9382],
  // South Asia / Middle East
  DEL: [28.5562, 77.1],
  BOM: [19.0896, 72.8656],
  DXB: [25.2532, 55.3657],
  AUH: [24.433, 54.6511],
  DOH: [25.2731, 51.6081],
  // Oceania / West
  SYD: [-33.9399, 151.1753],
  MEL: [-37.669, 144.841],
  LAX: [33.9416, -118.4085],
  SFO: [37.6213, -122.379],
  LHR: [51.47, -0.4543],
  CDG: [49.0097, 2.5479],
  FRA: [50.0379, 8.5622],
};

export function getAirportCoords(iata?: string | null): [number, number] | null {
  if (!iata) return null;
  return AIRPORT_COORDS[iata.toUpperCase()] ?? null;
}

// Country names (English + Khmer) for the seatback route readouts on the
// flight page. Grouped per country, keyed by the same IATA codes as above.
const COUNTRY_GROUPS: [string[], { en: string; km: string }][] = [
  [['PNH', 'KTI', 'SAI', 'REP', 'KOS'], { en: 'Cambodia', km: 'កម្ពុជា' }],
  [['BKK', 'DMK', 'HKT', 'CNX'], { en: 'Thailand', km: 'ថៃ' }],
  [['SGN', 'HAN', 'DAD', 'CXR'], { en: 'Vietnam', km: 'វៀតណាម' }],
  [['SIN'], { en: 'Singapore', km: 'សិង្ហបុរី' }],
  [['KUL'], { en: 'Malaysia', km: 'ម៉ាឡេស៊ី' }],
  [['CGK', 'DPS'], { en: 'Indonesia', km: 'ឥណ្ឌូណេស៊ី' }],
  [['MNL', 'CEB'], { en: 'Philippines', km: 'ហ្វីលីពីន' }],
  [['PEK', 'PKX', 'PVG', 'SHA', 'CAN', 'SZX', 'KMG'], { en: 'China', km: 'ចិន' }],
  [['HKG'], { en: 'Hong Kong', km: 'ហុងកុង' }],
  [['TPE'], { en: 'Taiwan', km: 'តៃវ៉ាន់' }],
  [['MFM'], { en: 'Macau', km: 'ម៉ាកាវ' }],
  [['NRT', 'HND', 'KIX', 'FUK', 'CTS'], { en: 'Japan', km: 'ជប៉ុន' }],
  [['ICN', 'GMP', 'PUS'], { en: 'South Korea', km: 'កូរ៉េខាងត្បូង' }],
  [['DEL', 'BOM'], { en: 'India', km: 'ឥណ្ឌា' }],
  [['DXB', 'AUH'], { en: 'United Arab Emirates', km: 'អេមីរ៉ាតអារ៉ាប់រួម' }],
  [['DOH'], { en: 'Qatar', km: 'កាតា' }],
  [['SYD', 'MEL'], { en: 'Australia', km: 'អូស្ត្រាលី' }],
  [['LAX', 'SFO'], { en: 'United States', km: 'សហរដ្ឋអាមេរិក' }],
  [['LHR'], { en: 'United Kingdom', km: 'ចក្រភពអង់គ្លេស' }],
  [['CDG'], { en: 'France', km: 'បារាំង' }],
  [['FRA'], { en: 'Germany', km: 'អាល្លឺម៉ង់' }],
];

export const AIRPORT_COUNTRY: Record<string, { en: string; km: string }> = Object.fromEntries(
  COUNTRY_GROUPS.flatMap(([codes, country]) => codes.map((code) => [code, country])),
);

export function getAirportCountry(iata?: string | null): { en: string; km: string } | null {
  if (!iata) return null;
  return AIRPORT_COUNTRY[iata.toUpperCase()] ?? null;
}
