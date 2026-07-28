import type { CSSProperties } from 'react';
import { SPEC_GROUPS } from '@/data/arc01';

// Force/deflection traces, plotted in the 0–100 viewBox space below.
// ARC-01 stays linear all the way to 4.61 N and returns; a commodity clip
// yields at 1.2 N and keeps the deformation.
const ARC_TRACE = 'M6,94 C26,86 46,66 62,42 S84,14 94,8';
const STD_TRACE = 'M6,94 C18,90 28,84 36,77 C44,70 52,68 64,68 C76,68 86,67 94,66';

export function ArcSpecification() {
  return (
    <section
      className="arc-inv arc-sec arc-shell"
      id="specification"
      aria-labelledby="arc-spec-title"
    >
      <div className="arc-eyebrow" data-reveal="">
        <span className="arc-idx">04</span>
        <span>Specification</span>
      </div>

      <header className="arc-sec__head">
        <div className="arc-sec__headline">
          <h2 className="arc-sec__title" id="arc-spec-title" data-reveal="">
            Measured,
            <br />
            <em>not claimed</em>
          </h2>
        </div>
        <p className="arc-sec__lede" data-reveal="" style={{ '--i': 1 } as CSSProperties}>
          Every figure below is taken from the certificate that ships with the clip,
          not from a datasheet. Tolerances are the ones actually held in production —
          the drawing permits more.
        </p>
      </header>

      <div className="arc-spec">
        {SPEC_GROUPS.map((group, gi) => (
          <div className="arc-spec__group" key={group.group} data-reveal="" style={{ '--i': gi } as CSSProperties}>
            <h3>{group.group}</h3>
            <dl>
              {group.rows.map((row) => (
                <div className="arc-spec__row" key={row.label}>
                  <dt>{row.label}</dt>
                  <dd>
                    <span data-count={row.count} data-dec={row.decimals}>
                      {row.value}
                    </span>
                    {row.note ? <span className="arc-spec__note">{row.note}</span> : null}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>

      <div className="arc-curve" data-reveal="">
        <svg className="arc-curve__plot" viewBox="0 0 100 100" role="img" aria-label="Force against deflection: ARC-01 remains linear to 4.61 newtons, a commodity clip yields at 1.2 newtons">
          <line className="axis" x1="6" y1="6" x2="6" y2="94" />
          <line className="axis" x1="6" y1="94" x2="98" y2="94" />
          <line className="grid" x1="6" y1="50" x2="98" y2="50" />
          <line className="grid" x1="6" y1="28" x2="98" y2="28" />
          <line className="grid" x1="52" y1="6" x2="52" y2="94" />
          <path className="trace trace--std" d={STD_TRACE} />
          <path className="trace trace--arc" d={ARC_TRACE} />
          <text className="lbl" x="6" y="101">
            0
          </text>
          <text className="lbl" x="88" y="101">
            2.0 mm
          </text>
          <text className="lbl" x="0" y="10" transform="rotate(-90 4 10)">
            Force N
          </text>
        </svg>

        <ul className="arc-curve__key">
          <li>
            <i aria-hidden="true" />
            <div>
              <b>ARC-01</b>
              <p>
                Purely elastic to 4.610 N and beyond. After one million open-and-close
                cycles the metrology finds no measurable set — the clip is the same
                shape it left Le Locle.
              </p>
            </div>
          </li>
          <li>
            <i aria-hidden="true" />
            <div>
              <b>Commodity clip</b>
              <p>
                Yields at roughly 1.2 N and stops recovering. It holds fewer sheets
                every time it is used, which is a property nobody has ever thought to
                complain about.
              </p>
            </div>
          </li>
        </ul>
      </div>
    </section>
  );
}
