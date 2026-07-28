// ARC-01 — product record.
//
// Every figure on the site reads from here so the spec ledger, the process
// list and the configurator can never drift apart. Values are deliberately
// over-specified: that is the joke, and also the point.

export const ARC = {
  name: 'ARC-01',
  maker: 'ARC Instruments',
  origin: 'Le Locle, Switzerland',
  basePrice: 10000,
  edition: 500,
  hoursPerUnit: 214,
  designLifeYears: 400,
} as const;

/** Alloy composition, weight %. Real 904L (UNS N08904) numbers. */
export const COMPOSITION: Array<{
  symbol: string;
  element: string;
  pct: number;
  role: string;
}> = [
  { symbol: 'Fe', element: 'Iron', pct: 45.98, role: 'Balance. The spine of the lattice.' },
  { symbol: 'Ni', element: 'Nickel', pct: 25.0, role: 'Holds the austenite stable — non-magnetic down to 4 K.' },
  { symbol: 'Cr', element: 'Chromium', pct: 20.0, role: 'Grows a passive oxide film that re-forms in air within milliseconds.' },
  { symbol: 'Mo', element: 'Molybdenum', pct: 4.5, role: 'Pitting and crevice resistance in chlorides. Seawater, sweat, tears.' },
  { symbol: 'Mn', element: 'Manganese', pct: 2.0, role: 'Deoxidiser. Refines grain through eleven drawing passes.' },
  { symbol: 'Cu', element: 'Copper', pct: 1.5, role: 'Resistance to reducing acids. The reason it survives a human hand.' },
  { symbol: 'Si', element: 'Silicon', pct: 1.0, role: 'Deoxidiser. Raises scaling resistance during the vacuum anneal.' },
  { symbol: 'C', element: 'Carbon', pct: 0.02, role: 'Held below 0.020 % so no carbide precipitates at the bends.' },
];

/** Cold-drawing schedule, Ø in mm. Twelve diameters, eleven passes. */
export const DRAW_PASSES = [
  5.5, 4.62, 3.88, 3.26, 2.74, 2.3, 1.93, 1.62, 1.48, 1.31, 1.19, 1.1,
];

export const PROCESS: Array<{
  n: string;
  title: string;
  hours: number;
  spec: string;
  detail: string;
}> = [
  {
    n: '01',
    title: 'Billet qualification',
    hours: 12,
    spec: '1 accepted in 9',
    detail:
      'Each 40 kg billet is spectro-analysed, ultrasonically mapped and sectioned. Inclusion counts above ASTM E45 grade 0.5 are rejected outright. Eight billets in nine go back to the foundry.',
  },
  {
    n: '02',
    title: 'Cold drawing',
    hours: 46.5,
    spec: '11 passes · Ø5.500 → Ø1.1000',
    detail:
      'Drawn through eleven polished diamond dies, never more than an 18 % area reduction per pass. Between each pass the wire rests in a stress-relief soak. Nobody has found a way to hurry this.',
  },
  {
    n: '03',
    title: 'Cryogenic stabilisation',
    hours: 36,
    spec: '−196 °C, 36 h',
    detail:
      'Thirty-six hours submerged in liquid nitrogen. Residual austenite settles, dimensional drift over the following four centuries falls below one micron.',
  },
  {
    n: '04',
    title: 'Four-axis form bending',
    hours: 3.5,
    spec: 'R0.900 mm ±0.002',
    detail:
      'Three bends. Each is formed around a sapphire mandrel at 0.4 mm·s⁻¹ while a load cell watches for the first sign of work-hardening. The machine stops if it sees it.',
  },
  {
    n: '05',
    title: 'Vacuum stress-relief anneal',
    hours: 18,
    spec: '1,040 °C · 10⁻⁶ mbar',
    detail:
      'The formed clip is brought to 1,040 °C in a hard vacuum, held, then quenched in argon. All memory of the bending is erased; only the shape remains.',
  },
  {
    n: '06',
    title: 'Hand-lapping',
    hours: 61,
    spec: '6 stages → Ra 0.012 μm',
    detail:
      'Six stages, finishing on a felt wheel charged with 0.25 μm diamond. The last stage removes roughly 40 nanometres of material and takes an artisan nine hours.',
  },
  {
    n: '07',
    title: 'Anglage & edge break',
    hours: 24,
    spec: '0.05 mm, by hand',
    detail:
      'Both wire ends are chamfered by hand under a stereo microscope, the way a movement bridge is finished. It serves no mechanical purpose. It is not negotiable.',
  },
  {
    n: '08',
    title: 'Metrology & certification',
    hours: 13,
    spec: '1,412 points',
    detail:
      'Scanned on a Zeiss CMM at 1,412 points, load-tested to 4.61 N, then issued a certificate carrying its serial, its measured mass and the initials of the artisan who bent it.',
  },
];

export type SpecRow = { label: string; value: string; note?: string; count?: number; decimals?: number };

export const SPEC_GROUPS: Array<{ group: string; rows: SpecRow[] }> = [
  {
    group: 'Geometry',
    rows: [
      { label: 'Overall length', value: '33.000 mm', note: '±0.004', count: 33, decimals: 3 },
      { label: 'Overall width', value: '8.000 mm', note: '±0.004', count: 8, decimals: 3 },
      { label: 'Wire diameter', value: '1.1000 mm', note: '±0.0008', count: 1.1, decimals: 4 },
      { label: 'Inner bend radius', value: '0.900 mm', note: '±0.002', count: 0.9, decimals: 3 },
      { label: 'Planarity deviation', value: '4 μm', note: 'over 33 mm', count: 4, decimals: 0 },
      { label: 'Mass', value: '1.1040 g', note: '±0.0004', count: 1.104, decimals: 4 },
    ],
  },
  {
    group: 'Material',
    rows: [
      { label: 'Alloy', value: 'N-904L', note: 'UNS N08904' },
      { label: 'Tensile strength', value: '1,420 MPa', count: 1420, decimals: 0 },
      { label: 'Hardness', value: '285 HV1', count: 285, decimals: 0 },
      { label: 'Surface roughness', value: 'Ra 0.012 μm', count: 0.012, decimals: 3 },
      { label: 'Magnetic permeability', value: '≤ 1.005 μ', count: 1.005, decimals: 3 },
      { label: 'Specular reflectance', value: '91.4 %', count: 91.4, decimals: 1 },
    ],
  },
  {
    group: 'Performance',
    rows: [
      { label: 'Clamping force', value: '4.610 N', note: '±0.02', count: 4.61, decimals: 3 },
      { label: 'Sheet capacity', value: '220 sheets', note: '80 gsm', count: 220, decimals: 0 },
      { label: 'Fatigue life', value: '1,000,000 cycles', note: 'no measurable set', count: 1000000, decimals: 0 },
      { label: 'Elastic recovery', value: '99.997 %', count: 99.997, decimals: 3 },
      { label: 'Operating range', value: '−196 → +540 °C' },
      { label: 'Pressure rating', value: '1,200 bar', note: '12,000 m depth', count: 1200, decimals: 0 },
    ],
  },
  {
    group: 'Endurance',
    rows: [
      { label: 'Neutral salt spray', value: '4,000 h', note: 'no pitting', count: 4000, decimals: 0 },
      { label: 'Outgassing, TML', value: '0.01 %', note: 'ASTM E595 — vacuum rated', count: 0.01, decimals: 2 },
      { label: 'Radiation tolerance', value: '10 MGy', count: 10, decimals: 0 },
      { label: 'Recommended service', value: 'every 25 years', count: 25, decimals: 0 },
      { label: 'Design life', value: '400 years', count: 400, decimals: 0 },
      { label: 'Annual production', value: '500 units', count: 500, decimals: 0 },
    ],
  },
];

export const FINISHES = [
  { id: 'speculaire', n: '01', name: 'Spéculaire', desc: 'Mirror polish, 0.25 μm diamond', delta: 0 },
  { id: 'satine', n: '02', name: 'Satiné', desc: 'Vertical brush, 400 grain', delta: 400 },
  { id: 'nuit', n: '03', name: 'Nuit', desc: 'Black PVD, 3 μm, 2,400 HV', delta: 900 },
] as const;

export const CASES = [
  { id: 'walnut', n: '01', name: 'Walnut & ivory', desc: 'Claro walnut, hand-rubbed oil', delta: 0 },
  { id: 'titanium', n: '02', name: 'Solid titanium', desc: 'Grade 5, milled from one block', delta: 1200 },
] as const;

export const ENGRAVING_PRICE = 350;
export const ENGRAVING_MAX = 12;

/** Deterministic pseudo-random — same serial always yields the same record. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ARTISANS = ['H.M.', 'J.-P. R.', 'A. K.', 'S. B.', 'T. O.', 'C. V.', 'M. D.', 'R. L.'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export type ProvenanceRecord = {
  serial: string;
  artisan: string;
  bent: string;
  certified: string;
  hours: string;
  mass: string;
  force: string;
  points: string;
};

export function provenanceFor(serial: number): ProvenanceRecord {
  const rnd = mulberry32(serial * 2654435761);
  const artisan = ARTISANS[Math.floor(rnd() * ARTISANS.length)];
  const month = Math.floor(rnd() * 12);
  const day = 1 + Math.floor(rnd() * 27);
  const certDay = day + 3 + Math.floor(rnd() * 9);
  const certMonth = certDay > 28 ? (month + 1) % 12 : month;
  const hours = 210 + rnd() * 8;
  const mass = 1.1036 + rnd() * 0.0008;
  const force = 4.594 + rnd() * 0.032;
  const points = 1402 + Math.floor(rnd() * 24);
  return {
    serial: `${String(serial).padStart(3, '0')} / ${ARC.edition}`,
    artisan,
    bent: `${day} ${MONTHS[month]} 2026`,
    certified: `${certDay > 28 ? certDay - 28 : certDay} ${MONTHS[certMonth]} 2026`,
    hours: `${hours.toFixed(1)} h`,
    mass: `${mass.toFixed(4)} g`,
    force: `${force.toFixed(3)} N`,
    points: points.toLocaleString('en-US'),
  };
}
