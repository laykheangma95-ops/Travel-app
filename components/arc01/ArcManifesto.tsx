import type { CSSProperties } from 'react';

const LINES = [
  'Ten thousand dollars',
  <>
    for a paperclip is <em>absurd.</em>
  </>,
  'So is spending two hundred',
  'and fourteen hours making sure',
  'one still closes on a sheet',
  'of paper in the year 2426.',
];

const NOTES = [
  {
    label: 'The premise',
    body:
      'Every object in an office has been optimised to cost less. We took the smallest one and asked what happens if you optimise for the opposite — for it to be correct, once, permanently.',
  },
  {
    label: 'The constraint',
    body:
      'It had to remain a paperclip. Same profile, same gesture, same thirty-three millimetres. Nothing was allowed to be added that a hand would notice.',
  },
  {
    label: 'The result',
    body:
      'Five hundred a year. Each one bent by a named person, measured at 1,412 points and certified before it is allowed to leave Le Locle.',
  },
];

export function ArcManifesto() {
  return (
    <section className="arc-inv arc-manifesto arc-shell" aria-labelledby="arc-manifesto-title">
      <div className="arc-eyebrow" data-reveal="">
        <span className="arc-idx">00</span>
        <span>Statement</span>
      </div>

      <p className="arc-manifesto__body" id="arc-manifesto-title">
        {LINES.map((line, i) => (
          <span
            className="arc-manifesto__line"
            key={i}
            data-reveal=""
            style={{ '--i': i } as CSSProperties}
          >
            {line}
          </span>
        ))}
      </p>

      <div className="arc-manifesto__foot">
        {NOTES.map((n, i) => (
          <p className="arc-manifesto__note" key={n.label} data-reveal="" style={{ '--i': i } as CSSProperties}>
            <b>{n.label}</b>
            {n.body}
          </p>
        ))}
      </div>
    </section>
  );
}
