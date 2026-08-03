// ─────────────────────────────────────────────────────────────────────────────
// Destination hero scenes — drawn, not photographed.
//
// Why this instead of photography: the seam. The globe's atmosphere blooms to
// the destination's `arrival.skyColor` at the end of the flight, and this scene
// is drawn *on that same colour*, so the horizon simply continues. A photograph
// would have to be cross-faded over it, and a cross-fade is exactly the seam
// that kills the illusion.
//
// It also happens to solve the two hardest constraints on the page: these cost
// zero bytes over the network on a Cambodian mobile connection, and they carry
// no licensing risk. `schema.ts` keeps an optional `photo` field so real
// commissioned photography can drop in later without a refactor — see
// design-notes.md for the full argument and what we rejected.
//
// House style follows components/home/destinationArt.tsx: deep-navy silhouettes
// over the sky gradient, lit by a single warm celestial accent.
// ─────────────────────────────────────────────────────────────────────────────

const FORE = '#080f22';
const MID = '#122241';
const FAR = 'rgba(255,255,255,0.10)';
const GOLD = '#F7EAC0';
const WARM = '#E6CB8B';

function Windows({ x, y, w, h, cols, rows }: { x: number; y: number; w: number; h: number; cols: number; rows: number }) {
  const cells = [];
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      if ((c * 7 + r * 3) % 4 === 0) continue;
      cells.push(
        <rect
          key={`${c}-${r}`}
          x={x + 1.5 + (c * (w - 3)) / cols}
          y={y + 2 + (r * (h - 4)) / rows}
          width={Math.max(0.9, (w - 3) / cols - 1.1)}
          height={1.5}
          fill={GOLD}
          opacity={0.42}
        />,
      );
    }
  }
  return <g>{cells}</g>;
}

const scenes: Record<string, JSX.Element> = {
  // Fuji behind the towers, moon low over the bay.
  tokyo: (
    <g>
      <circle cx="318" cy="62" r="15" fill={GOLD} opacity="0.5" />
      <path d="M0,152 L74,96 L104,116 L128,101 L176,152 Z" fill={MID} opacity="0.75" />
      <path d="M74,96 L86,105 L92,100 L104,116 L88,109 L80,113 Z" fill="rgba(255,255,255,0.5)" />
      <rect x="196" y="70" width="20" height="90" fill={FORE} />
      <path d="M198,70 L206,44 L214,70 Z" fill={FORE} />
      <rect x="205" y="30" width="2" height="16" fill={WARM} opacity="0.8" />
      <rect x="150" y="112" width="26" height="48" fill={FORE} />
      <Windows x={150} y={112} w={26} h={48} cols={4} rows={9} />
      <rect x="234" y="98" width="30" height="62" fill={FORE} />
      <Windows x={234} y={98} w={30} h={62} cols={5} rows={11} />
      <rect x="276" y="124" width="22" height="36" fill={FORE} />
      <rect x="112" y="130" width="26" height="30" fill={FORE} />
      <rect x="310" y="118" width="34" height="42" fill={FORE} />
      <Windows x={310} y={118} w={34} h={42} cols={6} rows={8} />
      <rect x="0" y="158" width="400" height="102" fill={FORE} />
    </g>
  ),

  // Temple spires against a low skyline, river light in front.
  bangkok: (
    <g>
      <circle cx="82" cy="58" r="17" fill={GOLD} opacity="0.42" />
      <path d="M212,158 L212,110 L220,74 L228,110 L228,158 Z" fill={FORE} />
      <path d="M219,74 L221,60 L220,52 L219,60 Z" fill={WARM} opacity="0.9" />
      <path d="M190,158 L190,124 L198,100 L206,124 L206,158 Z" fill={FORE} />
      <path d="M234,158 L234,124 L242,100 L250,124 L250,158 Z" fill={FORE} />
      <path d="M176,158 Q188,140 200,158 Z" fill={FORE} />
      <rect x="96" y="112" width="28" height="48" fill={FORE} />
      <Windows x={96} y={112} w={28} h={48} cols={5} rows={9} />
      <rect x="286" y="98" width="24" height="62" fill={FORE} />
      <Windows x={286} y={98} w={24} h={62} cols={4} rows={11} />
      <rect x="322" y="126" width="32" height="34" fill={FORE} />
      <rect x="46" y="134" width="30" height="26" fill={FORE} />
      <rect x="0" y="158" width="400" height="102" fill={FORE} />
      <g opacity="0.5">
        <rect x="60" y="176" width="46" height="1.4" fill={WARM} />
        <rect x="180" y="192" width="70" height="1.4" fill={WARM} />
        <rect x="290" y="182" width="52" height="1.4" fill={WARM} />
      </g>
    </g>
  ),

  // Marina Bay: three towers, a curved crown, supertree silhouettes.
  singapore: (
    <g>
      <circle cx="70" cy="54" r="13" fill={GOLD} opacity="0.42" />
      <rect x="176" y="72" width="17" height="88" fill={FORE} />
      <rect x="200" y="72" width="17" height="88" fill={FORE} />
      <rect x="224" y="72" width="17" height="88" fill={FORE} />
      <path d="M170,72 Q208,54 248,68 L248,74 Q208,60 170,78 Z" fill={FORE} />
      <Windows x={176} y={80} w={17} h={80} cols={3} rows={14} />
      <Windows x={224} y={80} w={17} h={80} cols={3} rows={14} />
      <g>
        <path d="M296,158 L300,110 L304,158 Z" fill={FORE} />
        <ellipse cx="300" cy="104" rx="15" ry="7" fill={FORE} />
        <path d="M330,158 L333,124 L336,158 Z" fill={FORE} />
        <ellipse cx="333" cy="120" rx="11" ry="5" fill={FORE} />
        <path d="M364,158 L367,132 L370,158 Z" fill={FORE} />
        <ellipse cx="367" cy="128" rx="9" ry="4" fill={FORE} />
      </g>
      <rect x="96" y="118" width="26" height="42" fill={FORE} />
      <rect x="130" y="106" width="20" height="54" fill={FORE} />
      <Windows x={130} y={106} w={20} h={54} cols={3} rows={10} />
      <rect x="0" y="158" width="400" height="102" fill={FORE} />
      <g opacity="0.45">
        <rect x="140" y="180" width="120" height="1.4" fill={WARM} />
        <rect x="286" y="196" width="80" height="1.4" fill={WARM} />
      </g>
    </g>
  ),

  // Namsan tower on its hill, palace roof in front.
  seoul: (
    <g>
      <circle cx="330" cy="52" r="14" fill={GOLD} opacity="0.45" />
      <path d="M40,158 Q120,86 208,158 Z" fill={MID} opacity="0.8" />
      <rect x="122" y="60" width="5" height="50" fill={FORE} />
      <path d="M117,64 L132,64 L128,50 L121,50 Z" fill={FORE} />
      <rect x="123.6" y="34" width="1.8" height="16" fill={WARM} opacity="0.9" />
      <path d="M232,132 Q268,116 304,132 L308,138 L228,138 Z" fill={FORE} />
      <rect x="240" y="138" width="58" height="22" fill={FORE} />
      <path d="M250,132 Q268,124 286,132" stroke={WARM} strokeWidth="1" fill="none" opacity="0.55" />
      <rect x="330" y="108" width="24" height="52" fill={FORE} />
      <Windows x={330} y={108} w={24} h={52} cols={4} rows={10} />
      <rect x="366" y="124" width="26" height="36" fill={FORE} />
      <rect x="60" y="128" width="24" height="32" fill={FORE} />
      <rect x="0" y="158" width="400" height="102" fill={FORE} />
    </g>
  ),

  // Landmark tower, a low river skyline, boats.
  'ho-chi-minh-city': (
    <g>
      <circle cx="72" cy="56" r="15" fill={GOLD} opacity="0.44" />
      <path d="M244,158 L244,70 L254,44 L264,70 L264,158 Z" fill={FORE} />
      <rect x="253" y="26" width="2" height="18" fill={WARM} opacity="0.85" />
      <Windows x={246} y={78} w={16} h={80} cols={3} rows={15} />
      <rect x="196" y="112" width="26" height="48" fill={FORE} />
      <Windows x={196} y={112} w={26} h={48} cols={4} rows={9} />
      <rect x="286" y="120" width="30" height="40" fill={FORE} />
      <rect x="140" y="128" width="34" height="32" fill={FORE} />
      <rect x="330" y="134" width="26" height="26" fill={FORE} />
      <rect x="0" y="158" width="400" height="102" fill={FORE} />
      <g opacity="0.5">
        <path d="M74,186 L114,186 L108,192 L80,192 Z" fill={FORE} />
        <rect x="92" y="176" width="1.4" height="10" fill={WARM} />
        <path d="M296,200 L330,200 L325,206 L301,206 Z" fill={FORE} />
        <rect x="200" y="188" width="60" height="1.4" fill={WARM} />
      </g>
    </g>
  ),

  // The twin towers and their skybridge, limestone hills behind.
  'kuala-lumpur': (
    <g>
      <circle cx="66" cy="58" r="14" fill={GOLD} opacity="0.42" />
      <path d="M300,158 Q340,104 390,158 Z" fill={MID} opacity="0.75" />
      <rect x="176" y="66" width="18" height="94" fill={FORE} />
      <rect x="216" y="66" width="18" height="94" fill={FORE} />
      <path d="M176,66 L185,44 L194,66 Z" fill={FORE} />
      <path d="M216,66 L225,44 L234,66 Z" fill={FORE} />
      <rect x="184.2" y="30" width="1.6" height="14" fill={WARM} opacity="0.9" />
      <rect x="224.2" y="30" width="1.6" height="14" fill={WARM} opacity="0.9" />
      <rect x="194" y="96" width="22" height="4" fill={FORE} />
      <Windows x={176} y={72} w={18} h={86} cols={3} rows={16} />
      <Windows x={216} y={72} w={18} h={86} cols={3} rows={16} />
      <rect x="126" y="118" width="26" height="42" fill={FORE} />
      <rect x="256" y="106" width="20" height="54" fill={FORE} />
      <Windows x={256} y={106} w={20} h={54} cols={3} rows={10} />
      <rect x="82" y="132" width="28" height="28" fill={FORE} />
      <rect x="0" y="158" width="400" height="102" fill={FORE} />
    </g>
  ),

  // The dragon bridge, mountains, and the sea below it.
  'da-nang': (
    <g>
      <circle cx="318" cy="56" r="16" fill={GOLD} opacity="0.46" />
      <path d="M0,150 Q70,88 150,150 Z" fill={MID} opacity="0.8" />
      <path d="M244,150 Q300,102 360,150 Z" fill={MID} opacity="0.62" />
      <path
        d="M40,158 Q90,120 140,158 Q190,120 240,158 Q290,120 340,158"
        stroke={FORE}
        strokeWidth="7"
        fill="none"
      />
      <path
        d="M40,158 Q90,120 140,158 Q190,120 240,158 Q290,120 340,158"
        stroke={WARM}
        strokeWidth="1.2"
        fill="none"
        opacity="0.55"
      />
      <rect x="0" y="158" width="400" height="102" fill={FORE} />
      <g opacity="0.42">
        <rect x="40" y="182" width="90" height="1.4" fill={WARM} />
        <rect x="170" y="196" width="130" height="1.4" fill={WARM} />
        <rect x="60" y="212" width="70" height="1.4" fill={WARM} />
      </g>
    </g>
  ),
};

/** A generic horizon for destinations without their own drawing yet. */
const fallback = (
  <g>
    <circle cx="316" cy="58" r="15" fill={GOLD} opacity="0.42" />
    <path d="M0,152 Q100,110 200,150 Q300,118 400,150 L400,260 L0,260 Z" fill={MID} opacity="0.7" />
    <rect x="0" y="158" width="400" height="102" fill={FORE} />
  </g>
);

/**
 * The sky is a CSS gradient on the container and the drawing is a band anchored
 * to the bottom of it. Letting the SVG cover the whole hero instead would scale
 * a 400×260 landscape drawing to fill a portrait phone, blowing the skyline up
 * to several times its intended size — the horizon has to sit where the horizon
 * sits, whatever shape the viewport is.
 */
export function DestinationScene({
  slug,
  skyColor,
  horizonColor,
  className,
}: {
  slug: string;
  skyColor: string;
  horizonColor: string;
  className?: string;
}) {
  const id = `sky-${slug}`;
  return (
    <div
      className={className}
      aria-hidden="true"
      style={{
        background: `linear-gradient(180deg, ${skyColor} 0%, ${skyColor} 46%, ${horizonColor} 100%)`,
      }}
    >
      <svg
        className="v3-scene-band"
        viewBox="0 0 400 260"
        preserveAspectRatio="xMidYMax meet"
        focusable="false"
      >
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={skyColor} stopOpacity="0" />
            <stop offset="55%" stopColor={skyColor} stopOpacity="0.55" />
            <stop offset="100%" stopColor={horizonColor} />
          </linearGradient>
          <radialGradient id={`${id}-glow`} cx="0.5" cy="1" r="0.75">
            <stop offset="0%" stopColor={horizonColor} stopOpacity="0.9" />
            <stop offset="100%" stopColor={horizonColor} stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="400" height="260" fill={`url(#${id})`} />
        <rect y="86" width="400" height="90" fill={`url(#${id}-glow)`} />
        <g opacity="0.5">
          <circle cx="46" cy="34" r="1" fill="#fff" />
          <circle cx="128" cy="22" r="0.8" fill="#fff" />
          <circle cx="212" cy="38" r="0.9" fill="#fff" />
          <circle cx="286" cy="20" r="0.8" fill="#fff" />
          <circle cx="358" cy="40" r="1" fill="#fff" />
        </g>
        {scenes[slug] ?? fallback}
        <rect y="200" width="400" height="60" fill={FAR} opacity="0" />
      </svg>
    </div>
  );
}
