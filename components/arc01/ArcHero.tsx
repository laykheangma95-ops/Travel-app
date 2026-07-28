'use client';

import { useCallback, useState } from 'react';
import { PaperclipViewer } from './PaperclipViewer';

const DATA = [
  { k: 'Reference', v: 'ARC-01' },
  { k: 'Wire', v: 'Ø 1.1000 mm' },
  { k: 'Mass', v: '1.1040 g' },
  { k: 'Edition', v: '500 / year' },
];

export function ArcHero() {
  const [dragged, setDragged] = useState(false);
  const handleFirstDrag = useCallback(() => setDragged(true), []);

  return (
    <section className="arc-hero arc-shell" id="top">
      <div className="arc-hero__type" aria-hidden="true">
        <span className="arc-hero__word">ARC—01</span>
      </div>

      <PaperclipViewer onFirstDrag={handleFirstDrag} />

      <div className="arc-hero__top">
        <p className="arc-hero__kicker">
          ARC Instruments
          <br />
          Le Locle, Switzerland
          <br />
          Est. MMXXVI
        </p>
        <h1 className="arc-hero__claim">
          The paperclip, <em>taken seriously.</em>
        </h1>
      </div>

      <div className="arc-hero__bottom">
        <div className="arc-hero__foot">
          <span className="arc-hint" data-hidden={dragged}>
            <i className="arc-hint__ring" aria-hidden="true" />
            Drag to rotate
          </span>
          <span className="arc-hero__scroll">
            Scroll
            <i aria-hidden="true" />
          </span>
        </div>

        <dl className="arc-hero__data">
          {DATA.map((d) => (
            <div className="arc-hero__cell" key={d.k}>
              <dt>{d.k}</dt>
              <dd>{d.v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
