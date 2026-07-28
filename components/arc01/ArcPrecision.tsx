'use client';

import { useState, type CSSProperties } from 'react';
import { ARC, PROCESS } from '@/data/arc01';

export function ArcPrecision() {
  // One panel open at a time — the list stays a list, never a stack of cards.
  const [open, setOpen] = useState<string | null>('01');

  return (
    <section className="arc-sec arc-shell" id="precision" aria-labelledby="arc-precision-title">
      <div className="arc-eyebrow" data-reveal="">
        <span className="arc-idx">02</span>
        <span>Manufacture</span>
      </div>

      <header className="arc-sec__head">
        <div className="arc-sec__headline">
          <h2 className="arc-sec__title" id="arc-precision-title" data-reveal="">
            Two hundred
            <br />
            <em>and fourteen</em>
            <br />
            hours
          </h2>
        </div>
        <p className="arc-sec__lede" data-reveal="" style={{ '--i': 1 } as CSSProperties}>
          Eight operations, in a fixed order, none of which can be run in parallel and
          only one of which is performed by a machine unattended. A commodity clip
          takes 0.4 seconds. We are aware of the ratio.
        </p>
      </header>

      <ol className="arc-proc">
        {PROCESS.map((step, i) => {
          const isOpen = open === step.n;
          return (
            <li
              className="arc-proc__item"
              key={step.n}
              data-open={isOpen}
              data-reveal=""
              style={{ '--i': i } as CSSProperties}
            >
              <button
                type="button"
                className="arc-proc__btn"
                aria-expanded={isOpen}
                aria-controls={`arc-proc-${step.n}`}
                onClick={() => setOpen(isOpen ? null : step.n)}
              >
                <span className="arc-proc__n">{step.n}</span>
                <span className="arc-proc__title">{step.title}</span>
                <span className="arc-proc__meta">
                  <span className="arc-proc__spec">{step.spec}</span>
                  <span className="arc-proc__hours">{step.hours.toFixed(1)} h</span>
                </span>
              </button>

              <div className="arc-proc__panel" id={`arc-proc-${step.n}`} role="region" aria-label={step.title}>
                <div>
                  <div className="arc-proc__detail">
                    <span aria-hidden="true" />
                    <p>
                      {step.detail}
                      <span className="arc-proc__spec-m">
                        {step.spec} · {step.hours.toFixed(1)} h
                      </span>
                    </p>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="arc-proc__total" data-reveal="">
        <span className="arc-mono">Total, per unit</span>
        <b>
          <span data-count={ARC.hoursPerUnit} data-dec={1}>
            {ARC.hoursPerUnit.toFixed(1)}
          </span>
          <span> h</span>
        </b>
      </div>
    </section>
  );
}
