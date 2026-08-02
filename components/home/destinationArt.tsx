// ─────────────────────────────────────────────────────────────────────────────
// Bespoke destination art for the Cambodia showcase (see .claude/skills/ui-ux
// §9.3 — "art direction over placeholders"). Each destination gets a hand-drawn
// SVG scene silhouette instead of an emoji: a recognisable landmark rendered in
// deep-navy foreground over the medallion's own gradient "sky", lit by a single
// gold or moonlit celestial accent. All inline vectors — no image requests, and
// they scale crisply into any medallion size. Decorative: callers mark them
// aria-hidden and supply the real label as text.
// ─────────────────────────────────────────────────────────────────────────────

const FORE = '#091124'; // foreground silhouette (temple night)
const MID = '#16294a'; // mid-ground hills / haze
const GOLD = '#F7EAC0'; // warm celestial + highlights
const GOLD_DIM = '#E6CB8B';
const MOON = 'rgba(255,255,255,0.9)';
const WATER = 'rgba(255,255,255,0.16)';
const GLOW = 'rgba(143,216,255,0.85)'; // starlight-blue plankton / lights

type Art = JSX.Element;

// Angkor Wat — five lotus towers on a gallery, mirrored in the moat.
// Vertical-sided towers with rounded lotus-bud crowns so it reads as the temple,
// not a mountain range.
const angkorTemple = (
  <g>
    {/* long gallery base */}
    <rect x="12" y="61" width="76" height="6" fill={FORE} />
    {/* outer towers */}
    <path d="M23,63 L23,54 Q23,49 27,47.5 Q31,49 31,54 L31,63 Z" fill={FORE} />
    <path d="M69,63 L69,54 Q69,49 73,47.5 Q77,49 77,54 L77,63 Z" fill={FORE} />
    {/* inner towers */}
    <path d="M33.5,63 L33.5,49 Q33.5,42 38,40 Q42.5,42 42.5,49 L42.5,63 Z" fill={FORE} />
    <path d="M57.5,63 L57.5,49 Q57.5,42 62,40 Q66.5,42 66.5,49 L66.5,63 Z" fill={FORE} />
    {/* central tower */}
    <path d="M43.5,63 L43.5,40 Q43.5,30 50,26 Q56.5,30 56.5,40 L56.5,63 Z" fill={FORE} />
    <circle cx="50" cy="26" r="1.6" fill={GOLD} opacity="0.9" />
  </g>
);

const angkor: Art = (
  <>
    <circle cx="76" cy="24" r="9" fill={MOON} opacity="0.85" />
    <circle cx="76" cy="24" r="14" fill={MOON} opacity="0.1" />
    {/* moat + reflection */}
    <rect x="0" y="67" width="100" height="33" fill={WATER} />
    <g opacity="0.3" transform="matrix(1 0 0 -1 0 134)">{angkorTemple}</g>
    {angkorTemple}
  </>
);

// Phnom Penh — riverside skyline crowned by a golden stupa spire.
const phnomPenh: Art = (
  <>
    <circle cx="24" cy="26" r="8" fill={MOON} opacity="0.85" />
    <rect x="0" y="74" width="100" height="26" fill={WATER} />
    <path d="M0,74 L0,58 L10,58 L10,50 L18,50 L18,62 L28,62 L28,55 L36,55 L36,74 Z" fill={MID} />
    {/* central stupa */}
    <path d="M44,74 L44,44 L47,44 L50,32 L53,44 L56,44 L56,74 Z" fill={FORE} />
    <path d="M50,32 L50,26 L50.5,26 Z" stroke={GOLD} strokeWidth="1.4" />
    <circle cx="50" cy="27" r="1.8" fill={GOLD} />
    <path d="M62,74 L62,52 L70,52 L70,46 L78,46 L78,60 L88,60 L88,54 L100,54 L100,74 Z" fill={MID} />
    {/* lit windows */}
    <rect x="13" y="54" width="1.6" height="1.6" fill={GOLD_DIM} />
    <rect x="72" y="50" width="1.6" height="1.6" fill={GOLD_DIM} />
    <rect x="82" y="58" width="1.6" height="1.6" fill={GOLD_DIM} />
  </>
);

// Koh Rong — palm island on a sea of glowing plankton.
const kohRong: Art = (
  <>
    <circle cx="75" cy="24" r="9" fill={MOON} opacity="0.9" />
    <rect x="0" y="66" width="100" height="34" fill={WATER} />
    {/* island mound */}
    <path d="M18,72 Q40,58 64,72 Z" fill={FORE} />
    {/* palms */}
    <path d="M40,71 Q39,58 41,52" stroke={FORE} strokeWidth="2" fill="none" strokeLinecap="round" />
    <path d="M41,52 Q34,49 30,52 M41,52 Q48,48 52,51 M41,52 Q39,46 42,43" stroke={FORE} strokeWidth="1.6" fill="none" strokeLinecap="round" />
    <path d="M50,71 Q51,60 49,55" stroke={FORE} strokeWidth="1.8" fill="none" strokeLinecap="round" />
    <path d="M49,55 Q44,53 41,55 M49,55 Q55,52 58,55" stroke={FORE} strokeWidth="1.4" fill="none" strokeLinecap="round" />
    {/* plankton glow */}
    <circle cx="20" cy="80" r="1.3" fill={GLOW} />
    <circle cx="34" cy="86" r="1" fill={GLOW} opacity="0.8" />
    <circle cx="60" cy="82" r="1.2" fill={GLOW} />
    <circle cx="78" cy="88" r="1" fill={GLOW} opacity="0.7" />
    <circle cx="88" cy="80" r="1.3" fill={GLOW} />
    <circle cx="12" cy="90" r="1" fill={GLOW} opacity="0.75" />
  </>
);

// Kampot — pepper-hill riverlands under a low setting sun.
const kampot: Art = (
  <>
    <circle cx="50" cy="40" r="11" fill={GOLD} opacity="0.85" />
    <circle cx="50" cy="40" r="17" fill={GOLD} opacity="0.12" />
    {/* river with sun reflection */}
    <rect x="0" y="70" width="100" height="30" fill={WATER} />
    <rect x="45" y="70" width="10" height="30" fill={GOLD} opacity="0.25" />
    {/* rolling hills */}
    <path d="M0,70 Q22,54 44,66 Q50,69 56,66 Q78,54 100,70 Z" fill={MID} />
    <path d="M0,72 Q30,62 60,72 Q80,78 100,72 L100,74 L0,74 Z" fill={FORE} />
    {/* small boat */}
    <path d="M60,79 L70,79 L68,82 L62,82 Z" fill={FORE} />
    <path d="M65,79 L65,74" stroke={FORE} strokeWidth="0.9" />
  </>
);

// Sihanoukville — coastline and a ferry crossing the gulf.
const sihanoukville: Art = (
  <>
    <circle cx="72" cy="26" r="9" fill={GOLD} opacity="0.8" />
    <rect x="0" y="64" width="100" height="36" fill={WATER} />
    {/* ferry */}
    <path d="M30,66 L58,66 L54,72 L34,72 Z" fill={FORE} />
    <rect x="37" y="60" width="14" height="6" fill={FORE} />
    <rect x="39" y="61.5" width="2" height="2" fill={GOLD_DIM} />
    <rect x="44" y="61.5" width="2" height="2" fill={GOLD_DIM} />
    {/* wave lines */}
    <path d="M6,80 Q14,77 22,80 T38,80 T54,80 T70,80 T86,80 T100,80" stroke={GLOW} strokeWidth="0.9" fill="none" opacity="0.7" />
    <path d="M2,88 Q12,85 22,88 T42,88 T62,88 T82,88 T100,88" stroke="rgba(255,255,255,0.35)" strokeWidth="0.9" fill="none" />
  </>
);

// Battambang — the bamboo train receding down the rails.
const battambang: Art = (
  <>
    <circle cx="26" cy="24" r="8" fill={MOON} opacity="0.85" />
    {/* dry-plain horizon */}
    <path d="M0,66 Q50,60 100,66 L100,70 L0,70 Z" fill={MID} />
    {/* rails converging to a vanishing point */}
    <path d="M42,58 L14,96 M58,58 L86,96" stroke={GOLD_DIM} strokeWidth="1" opacity="0.55" />
    <path d="M40,70 L34,80 M62,70 L68,80 M37,80 L27,94 M63,80 L73,94" stroke={GOLD_DIM} strokeWidth="0.8" opacity="0.4" />
    {/* norry cart */}
    <rect x="40" y="60" width="20" height="7" rx="1" fill={FORE} />
    <circle cx="45" cy="68" r="2" fill={FORE} />
    <circle cx="55" cy="68" r="2" fill={FORE} />
    <rect x="48" y="55" width="4" height="5" fill={FORE} />
  </>
);

// Kep — the town's landmark giant crab standing in the sea.
const kep: Art = (
  <>
    <circle cx="74" cy="24" r="9" fill={MOON} opacity="0.9" />
    <rect x="0" y="70" width="100" height="30" fill={WATER} />
    {/* crab body */}
    <ellipse cx="50" cy="64" rx="15" ry="9" fill={GOLD_DIM} />
    <ellipse cx="50" cy="62" rx="15" ry="9" fill={GOLD} opacity="0.55" />
    {/* legs */}
    <path d="M36,64 Q28,64 24,70 M38,68 Q30,70 27,76 M64,64 Q72,64 76,70 M62,68 Q70,70 73,76" stroke={GOLD_DIM} strokeWidth="1.6" fill="none" strokeLinecap="round" />
    {/* claws */}
    <path d="M37,58 Q30,52 33,47 Q36,50 38,54" fill={GOLD} />
    <path d="M63,58 Q70,52 67,47 Q64,50 62,54" fill={GOLD} />
    {/* eyes */}
    <circle cx="46" cy="58" r="1.4" fill={FORE} />
    <circle cx="54" cy="58" r="1.4" fill={FORE} />
  </>
);

// Mondulkiri — a lone elephant on the misty highland ridges.
const mondulkiri: Art = (
  <>
    <circle cx="70" cy="28" r="10" fill={GOLD} opacity="0.7" />
    {/* layered misty hills */}
    <path d="M0,60 Q30,50 60,58 Q80,63 100,56 L100,72 L0,72 Z" fill={MID} opacity="0.7" />
    <path d="M0,68 Q28,60 52,67 Q76,73 100,66 L100,80 L0,80 Z" fill={MID} />
    <path d="M0,76 Q40,70 100,77 L100,90 L0,90 Z" fill={FORE} />
    {/* elephant */}
    <path
      d="M34,78 Q34,70 42,69 Q50,67 56,71 Q60,70 61,73 Q60,76 57,75 L57,80 L54,80 L54,76 Q49,78 44,77 L44,80 L41,80 L41,76 Q36,76 34,78 Z"
      fill={FORE}
    />
    <path d="M61,73 Q64,74 63,78" stroke={FORE} strokeWidth="1.4" fill="none" strokeLinecap="round" />
  </>
);

const ART: Record<string, Art> = {
  'Angkor Wat': angkor,
  'Phnom Penh': phnomPenh,
  'Koh Rong': kohRong,
  Kampot: kampot,
  Sihanoukville: sihanoukville,
  Battambang: battambang,
  Kep: kep,
  Mondulkiri: mondulkiri,
};

export function DestinationArt({ name, className }: { name: string; className?: string }) {
  const scene = ART[name] ?? angkor;
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      {scene}
    </svg>
  );
}
