import type { Metadata } from 'next';
import { ArcAcquire } from '@/components/arc01/ArcAcquire';
import { ArcChrome } from '@/components/arc01/ArcChrome';
import { ArcFooter } from '@/components/arc01/ArcFooter';
import { ArcHero } from '@/components/arc01/ArcHero';
import { ArcMacro } from '@/components/arc01/ArcMacro';
import { ArcManifesto } from '@/components/arc01/ArcManifesto';
import { ArcMaterial } from '@/components/arc01/ArcMaterial';
import { ArcNav } from '@/components/arc01/ArcNav';
import { ArcPrecision } from '@/components/arc01/ArcPrecision';
import { ArcProvenance } from '@/components/arc01/ArcProvenance';
import { ArcSpecification } from '@/components/arc01/ArcSpecification';
import { arcDisplay, arcMono, arcSans } from './fonts';
import './arc-01.css';

export const metadata: Metadata = {
  title: 'ARC-01 — The paperclip, taken seriously',
  description:
    'A single paperclip, drawn from N-904L superalloy, formed in 214 hours and certified at 1,412 points. Edition of 500 per year. USD 10,000.',
  openGraph: {
    title: 'ARC-01 — The paperclip, taken seriously',
    description:
      '214 hours. 1,412 metrology points. A 400-year design life. Edition of 500 per year, from Le Locle.',
    type: 'website',
  },
};

// The reveal animations start hidden; without JS nothing would ever show them,
// so no-script readers get the finished state immediately.
const NOSCRIPT = `.arc [data-reveal]{opacity:1!important;transform:none!important;clip-path:none!important}`;

export default function Arc01Page() {
  return (
    <div className={`arc ${arcDisplay.variable} ${arcSans.variable} ${arcMono.variable}`}>
      <noscript>
        <style dangerouslySetInnerHTML={{ __html: NOSCRIPT }} />
      </noscript>

      <ArcChrome />
      <ArcNav />

      <main>
        <ArcHero />
        <ArcManifesto />
        <ArcMaterial />
        <hr className="arc-rule" />
        <ArcPrecision />
        <hr className="arc-rule" />
        <ArcMacro />
        <ArcSpecification />
        <ArcProvenance />
        <hr className="arc-rule" />
        <ArcAcquire />
      </main>

      <ArcFooter />
    </div>
  );
}
