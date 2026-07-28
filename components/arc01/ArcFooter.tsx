import { ARC } from '@/data/arc01';

export function ArcFooter() {
  return (
    <footer className="arc-footer arc-shell">
      <p className="arc-footer__mark" aria-hidden="true">
        ARC—01
      </p>

      <div className="arc-footer__cols">
        <div className="arc-footer__col">
          <b>Atelier</b>
          <p>{ARC.maker}</p>
          <p>Rue du Marais 14</p>
          <p>2400 {ARC.origin}</p>
        </div>
        <div className="arc-footer__col">
          <b>The object</b>
          <a href="#material">Material</a>
          <a href="#precision">Manufacture</a>
          <a href="#macro">Detail</a>
          <a href="#specification">Specification</a>
        </div>
        <div className="arc-footer__col">
          <b>Ownership</b>
          <a href="#provenance">Register</a>
          <a href="#acquire">Allocation</a>
          <p>Service — every 25 years</p>
          <p>Warranty — 400 years</p>
        </div>
        <div className="arc-footer__col">
          <b>Enquiries</b>
          <a href="mailto:atelier@arc-instruments.example">atelier@arc-instruments.example</a>
          <p>Visits by appointment</p>
          <p>Mon–Thu, 09:00–16:00</p>
        </div>
      </div>

      <div className="arc-footer__base">
        <span>© MMXXVI {ARC.maker}</span>
        <span>Edition of {ARC.edition} per annum</span>
        <span>{ARC.hoursPerUnit} hours per unit</span>
        <a href="#top">Return to top</a>
      </div>
    </footer>
  );
}
