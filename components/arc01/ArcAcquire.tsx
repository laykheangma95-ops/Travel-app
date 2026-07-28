'use client';

import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { ARC, CASES, ENGRAVING_MAX, ENGRAVING_PRICE, FINISHES } from '@/data/arc01';

const money = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 });

/** Eases a number toward its new value — the total settles rather than jumps. */
function useSettlingNumber(value: number) {
  const [shown, setShown] = useState(value);
  const fromRef = useRef(value);
  const frameRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    if (from === value) return;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min((now - start) / 620, 1);
      const eased = 1 - Math.pow(1 - t, 4);
      const next = from + (value - from) * eased;
      setShown(next);
      if (t < 1) frameRef.current = requestAnimationFrame(step);
      else fromRef.current = value;
    };
    frameRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameRef.current);
  }, [value]);

  return Math.round(shown);
}

export function ArcAcquire() {
  const [finish, setFinish] = useState<string>(FINISHES[0].id);
  const [caseId, setCaseId] = useState<string>(CASES[0].id);
  const [engraving, setEngraving] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});
  const [reference, setReference] = useState<string | null>(null);

  const finishOpt = FINISHES.find((f) => f.id === finish) ?? FINISHES[0];
  const caseOpt = CASES.find((c) => c.id === caseId) ?? CASES[0];
  const engravingFee = engraving.trim() ? ENGRAVING_PRICE : 0;
  const total = ARC.basePrice + finishOpt.delta + caseOpt.delta + engravingFee;
  const shownTotal = useSettlingNumber(total);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: { name?: string; email?: string } = {};
    if (name.trim().length < 2) next.name = 'Required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) next.email = 'Enter a valid address';
    setErrors(next);
    if (Object.keys(next).length) return;

    const suffix = Math.floor(Math.random() * 0xffff)
      .toString(16)
      .toUpperCase()
      .padStart(4, '0');
    setReference(`ARC-2026-${suffix}`);
  };

  return (
    <section className="arc-sec arc-shell" id="acquire" aria-labelledby="arc-acquire-title">
      <div className="arc-eyebrow" data-reveal="">
        <span className="arc-idx">06</span>
        <span>Acquisition</span>
      </div>

      <header className="arc-sec__head">
        <div className="arc-sec__headline">
          <h2 className="arc-sec__title" id="arc-acquire-title" data-reveal="">
            Request
            <br />
            <em>an allocation</em>
          </h2>
        </div>
        <p className="arc-sec__lede" data-reveal="" style={{ '--i': 1 } as CSSProperties}>
          ARC-01 is not held in stock. Configure the clip, and we will write to you when
          a place in the year&rsquo;s five hundred becomes available. The current wait is
          about eleven months.
        </p>
      </header>

      <div className="arc-acq">
        <div data-reveal="">
          <div className="arc-opt" role="radiogroup" aria-labelledby="arc-finish-legend">
            <p className="arc-opt__legend" id="arc-finish-legend">
              Finish
            </p>
            {FINISHES.map((f) => (
              <label className="arc-opt__row" key={f.id}>
                <input
                  type="radio"
                  name="arc-finish"
                  value={f.id}
                  checked={finish === f.id}
                  onChange={() => setFinish(f.id)}
                />
                <span className="arc-opt__n">
                  <i className="arc-opt__dot" aria-hidden="true" />
                  {f.n}
                </span>
                <span className="arc-opt__name">
                  {f.name}
                  <span className="arc-opt__desc">{f.desc}</span>
                </span>
                <span className="arc-opt__delta">{f.delta ? `+ ${money(f.delta)}` : 'Included'}</span>
              </label>
            ))}
          </div>

          <div className="arc-opt" role="radiogroup" aria-labelledby="arc-case-legend">
            <p className="arc-opt__legend" id="arc-case-legend">
              Presentation
            </p>
            {CASES.map((c) => (
              <label className="arc-opt__row" key={c.id}>
                <input
                  type="radio"
                  name="arc-case"
                  value={c.id}
                  checked={caseId === c.id}
                  onChange={() => setCaseId(c.id)}
                />
                <span className="arc-opt__n">
                  <i className="arc-opt__dot" aria-hidden="true" />
                  {c.n}
                </span>
                <span className="arc-opt__name">
                  {c.name}
                  <span className="arc-opt__desc">{c.desc}</span>
                </span>
                <span className="arc-opt__delta">{c.delta ? `+ ${money(c.delta)}` : 'Included'}</span>
              </label>
            ))}
          </div>

          <div className="arc-engrave">
            <label className="arc-engrave__label" htmlFor="arc-engraving">
              <span>Engraving — case lid</span>
              <span className="arc-engrave__count">
                {engraving.length}/{ENGRAVING_MAX}
                {engravingFee ? ` · + ${money(ENGRAVING_PRICE)}` : ''}
              </span>
            </label>
            <input
              id="arc-engraving"
              className="arc-engrave__input"
              value={engraving}
              maxLength={ENGRAVING_MAX}
              autoComplete="off"
              placeholder="Optional"
              // The pantograph cuts letters, digits and four marks. Nothing else.
              onChange={(e) => setEngraving(e.target.value.replace(/[^A-Za-z0-9À-ɏ.\-& ]/g, ''))}
            />
            <div className="arc-engrave__preview" data-empty={!engraving.trim()} aria-hidden="true">
              <span>{engraving.trim() || 'ARC—01'}</span>
            </div>
          </div>
        </div>

        <div data-reveal="" style={{ '--i': 1 } as CSSProperties}>
          <div className="arc-ledger">
            <div className="arc-ledger__row">
              <span>ARC-01, {ARC.edition}-piece edition</span>
              <span>{money(ARC.basePrice)}</span>
            </div>
            <div className="arc-ledger__row">
              <span>Finish — {finishOpt.name}</span>
              <span>{finishOpt.delta ? money(finishOpt.delta) : '—'}</span>
            </div>
            <div className="arc-ledger__row">
              <span>Presentation — {caseOpt.name}</span>
              <span>{caseOpt.delta ? money(caseOpt.delta) : '—'}</span>
            </div>
            <div className="arc-ledger__row">
              <span>Engraving</span>
              <span>{engravingFee ? money(engravingFee) : '—'}</span>
            </div>
          </div>

          <div className="arc-total">
            <span>Total, USD</span>
            <b>{money(shownTotal)}</b>
          </div>

          {reference ? (
            <div className="arc-acq__done" role="status">
              <h3>Your request is recorded.</h3>
              <p>
                Reference {reference}. A member of the atelier will write to {email.trim()}{' '}
                when a place in the current edition opens. Nothing has been charged, and
                nothing will be until you confirm in writing.
              </p>
              <button
                type="button"
                className="arc-btn arc-btn--ghost"
                onClick={() => {
                  setReference(null);
                  setName('');
                  setEmail('');
                }}
              >
                Start another request
                <span className="arc-btn__dot" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <form className="arc-acq__form" onSubmit={submit} noValidate>
              <div className="arc-acq__field">
                <label htmlFor="arc-name">Name</label>
                <input
                  id="arc-name"
                  value={name}
                  autoComplete="name"
                  onChange={(e) => setName(e.target.value)}
                  aria-invalid={Boolean(errors.name)}
                />
              </div>
              <div className="arc-acq__field">
                <label htmlFor="arc-email">Email</label>
                <input
                  id="arc-email"
                  type="email"
                  value={email}
                  autoComplete="email"
                  onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={Boolean(errors.email)}
                />
              </div>
              <p className="arc-acq__err" role="alert">
                {errors.name ? `Name — ${errors.name}. ` : ''}
                {errors.email ? `Email — ${errors.email}.` : ''}
              </p>
              <div>
                <button type="submit" className="arc-btn">
                  Request allocation
                  <span className="arc-btn__dot" aria-hidden="true" />
                </button>
              </div>
              <p className="arc-acq__fine">
                This is a waiting-list enquiry, not an order. Your details are held in the
                browser for the length of this visit and are not transmitted anywhere.
              </p>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
