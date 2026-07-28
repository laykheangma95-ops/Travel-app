import type { CSSProperties } from 'react';
import { COMPOSITION, DRAW_PASSES } from '@/data/arc01';

const MAX_PCT = Math.max(...COMPOSITION.map((c) => c.pct));

export function ArcMaterial() {
  return (
    <section className="arc-sec arc-shell" id="material" aria-labelledby="arc-material-title">
      <div className="arc-eyebrow" data-reveal="">
        <span className="arc-idx">01</span>
        <span>Material</span>
      </div>

      <header className="arc-sec__head">
        <div className="arc-sec__headline">
          <h2 className="arc-sec__title" id="arc-material-title" data-reveal="">
            Alloy
            <br />
            <em>N-904L</em>
          </h2>
        </div>
        <p className="arc-sec__lede" data-reveal="" style={{ '--i': 1 } as CSSProperties}>
          A superaustenitic steel developed for sulphuric acid plants and used, in
          watchmaking, by exactly one house. It is difficult to machine, punishing to
          polish and effectively immortal. We chose it for the third reason.
        </p>
      </header>

      <div className="arc-mat">
        <div className="arc-mat__prose">
          <p className="arc-mat__pull" data-reveal="">
            Ordinary clips are drawn from mild steel and given eight microns of zinc.
            <em> They begin failing on the day they are made.</em>
          </p>
          <p data-reveal="" style={{ '--i': 1 } as CSSProperties}>
            ARC-01 has no coating, because there is nothing to protect. The chromium
            content grows a passive oxide two nanometres thick that re-forms in air
            faster than it can be measured. Scratch it, and it heals before you have
            put the loupe down.
          </p>
          <p data-reveal="" style={{ '--i': 2 } as CSSProperties}>
            The nickel keeps the lattice austenitic to cryogenic temperatures, which
            is why ARC-01 will not hold a magnetic charge, will not become brittle at
            −196 °C, and will not — the metallurgists were emphatic — ever be
            interesting to a hard drive.
          </p>
        </div>

        <div>
          <dl className="arc-comp">
            {COMPOSITION.map((c, i) => (
              <div
                className="arc-comp__row"
                key={c.symbol}
                data-reveal=""
                tabIndex={0}
                style={{ '--i': i, '--pct': `${(c.pct / MAX_PCT) * 100}%` } as CSSProperties}
              >
                <dt className="arc-comp__sym">{c.symbol}</dt>
                <dd className="arc-comp__name">{c.element}</dd>
                <dd className="arc-comp__pct" data-count={c.pct} data-dec={c.pct < 1 ? 3 : 2}>
                  {c.pct.toFixed(c.pct < 1 ? 3 : 2)}
                </dd>
                <dd className="arc-comp__role">{c.role}</dd>
              </div>
            ))}
          </dl>

          <div className="arc-draw" data-reveal="">
            <div className="arc-draw__scale" role="img" aria-label="Eleven cold-drawing passes reducing the wire from 5.5 mm to 1.1 mm">
              {DRAW_PASSES.map((d, i) => (
                <span
                  className="arc-draw__bar"
                  key={d}
                  style={{ '--h': `${(d / DRAW_PASSES[0]) * 100}%`, '--i': i } as CSSProperties}
                />
              ))}
            </div>
            <div className="arc-draw__legend">
              <span>Ø 5.500 — billet</span>
              <span>11 passes</span>
              <span>Ø 1.1000 — final</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
