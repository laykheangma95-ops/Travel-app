// Premium dark medallion for country flags — deep navy-to-black glass with a
// gold-foil rim (Angkor Gold, matches the brand accent) and a silk-like
// waving ripple on the flag glyph, in the vein of Singapore Airlines' dark
// gold branding. Pure CSS/SVG — no image assets or extra dependencies.

interface WavyFlagProps {
  /**
   * Usually the flag emoji. Some flags (Cambodia's among them) are missing
   * from several widespread emoji fonts and render as a blurred, illegible
   * glyph instead of a flag — pass a small inline SVG for those instead.
   */
  flag: React.ReactNode;
  label: string;
  size?: number;
  className?: string;
}

export function WavyFlag({ flag, label, size = 48, className }: WavyFlagProps) {
  return (
    <span
      className={`wavy-flag ${className ?? ''}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label}
    >
      <span className="wavy-flag-sheen" aria-hidden="true" />
      <span className="wavy-flag-cloth" style={{ fontSize: size * 0.5 }}>
        {flag}
      </span>
    </span>
  );
}
