'use client';

import { useState, type CSSProperties, type FormEvent } from 'react';
import { ARC, provenanceFor, type ProvenanceRecord } from '@/data/arc01';

const FIELDS: Array<[keyof ProvenanceRecord, string]> = [
  ['serial', 'Serial'],
  ['artisan', 'Bent by'],
  ['bent', 'Formed'],
  ['certified', 'Certified'],
  ['hours', 'Recorded labour'],
  ['mass', 'Measured mass'],
  ['force', 'Clamping force'],
  ['points', 'Metrology points'],
];

export function ArcProvenance() {
  const [query, setQuery] = useState('');
  const [record, setRecord] = useState<ProvenanceRecord | null>(null);
  const [error, setError] = useState('');

  const lookup = (e: FormEvent) => {
    e.preventDefault();
    const n = Number(query.trim().replace(/^0+/, '') || NaN);
    if (!Number.isInteger(n) || n < 1 || n > ARC.edition) {
      setRecord(null);
      setError(`No such record — serials run 001 to ${ARC.edition}`);
      return;
    }
    setError('');
    setRecord(provenanceFor(n));
  };

  return (
    <section className="arc-sec arc-shell" id="provenance" aria-labelledby="arc-prov-title">
      <div className="arc-eyebrow" data-reveal="">
        <span className="arc-idx">05</span>
        <span>Provenance</span>
      </div>

      <header className="arc-sec__head">
        <div className="arc-sec__headline">
          <h2 className="arc-sec__title" id="arc-prov-title" data-reveal="">
            Every clip
            <br />
            has <em>a name</em>
            <br />
            attached
          </h2>
        </div>
        <p className="arc-sec__lede" data-reveal="" style={{ '--i': 1 } as CSSProperties}>
          Five hundred leave Le Locle each year, numbered in the order they were
          certified. The register is public. Enter any serial and it will tell you who
          bent it, on what day, and what it weighed when it was signed off.
        </p>
      </header>

      <div className="arc-prov">
        <div data-reveal="">
          <form className="arc-prov__form" onSubmit={lookup}>
            <label className="arc-mono" htmlFor="arc-serial" style={{ position: 'absolute', left: '-9999px' }}>
              Serial number
            </label>
            <input
              id="arc-serial"
              className="arc-field"
              value={query}
              inputMode="numeric"
              autoComplete="off"
              placeholder={`001 — ${ARC.edition}`}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button type="submit" className="arc-prov__go">
              Look up
            </button>
          </form>
          <p className="arc-prov__msg" role="status">
            {error}
          </p>
          <p className="arc-prov__seal">
            &ldquo;If it carries the number, it carries the hours.&rdquo;
          </p>
        </div>

        <div data-reveal="" style={{ '--i': 1 } as CSSProperties}>
          {record ? (
            <dl className="arc-prov__record" key={record.serial}>
              {FIELDS.map(([key, label]) => (
                <div key={key}>
                  <dt>{label}</dt>
                  <dd>{record[key]}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <dl className="arc-prov__record">
              {FIELDS.map(([key, label]) => (
                <div key={key}>
                  <dt>{label}</dt>
                  <dd style={{ opacity: 0.28 }}>——</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>
    </section>
  );
}
