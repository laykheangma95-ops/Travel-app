import {
  Banknote,
  Clock,
  Languages,
  Plug,
  Signal,
  Sparkles,
  Sun,
  Wallet,
  Compass,
  Lightbulb,
  ShieldAlert,
  Phone,
  Stamp,
} from 'lucide-react';
import type { Destination, DestinationGuide, CustomsRule, ScamAlert } from '@/types';
import { needsAdapter, HOME_VOLTAGE } from '@/data/destinationGuides';
import { LocalClock, TimezoneOffset } from './LocalClock';
import { Badge } from '@/components/ui/Badge';

/* ── Quick facts ─────────────────────────────────────────────────────────────
   The six things a traveller checks first, answered before they scroll. Each
   one is a real question someone has actually asked support: what time is it
   there, will my charger fit, how much will a day cost, will my phone work. */

function Fact({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof Clock;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <div className="night-card p-5">
      <div className="flex items-center gap-2 text-white/55">
        <Icon size={15} aria-hidden="true" />
        <span className="text-xs font-semibold uppercase tracking-widest">{label}</span>
      </div>
      <p className="mt-2.5 font-display text-xl font-bold text-white">{value}</p>
      {sub && <p className="mt-1 text-xs leading-relaxed text-white/55">{sub}</p>}
    </div>
  );
}

export function QuickFacts({
  destination,
  guide,
}: {
  destination: Destination;
  guide: DestinationGuide;
}) {
  const adapter = needsAdapter(guide);
  const voltageDiffers = guide.voltage !== HOME_VOLTAGE;

  return (
    <section aria-labelledby="quick-facts" className="scroll-mt-24">
      <h2 id="quick-facts" className="sr-only">
        Quick facts about {destination.name}
      </h2>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Fact
          icon={Clock}
          label="Local time"
          value={<LocalClock timezone={guide.timezone} />}
          sub={<TimezoneOffset timezone={guide.timezone} />}
        />
        <Fact
          icon={Banknote}
          label="Currency"
          value={destination.currency}
          sub={`≈ ${destination.usdRate.toLocaleString()} ${destination.currency} to $1`}
        />
        <Fact
          icon={Plug}
          label="Power"
          value={`Type ${guide.plugTypes.join(' / ')}`}
          sub={
            // The genuinely useful version of this fact: not "what plug is it"
            // but "does MY plug fit" — answered against Cambodia's own standard.
            adapter
              ? `${guide.voltage}V · Your Cambodian plug will not fit — bring an adapter`
              : voltageDiffers
                ? `${guide.voltage}V · Your plug fits, but check devices are rated for ${guide.voltage}V`
                : `${guide.voltage}V · Same as Cambodia — no adapter needed`
          }
        />
        <Fact
          icon={Signal}
          label="Internet"
          value={destination.networkTech}
          sub={`${destination.networkQuality} coverage · ${destination.networks.join(', ')}`}
        />
        <Fact
          icon={Wallet}
          label="Daily budget"
          value={`$${guide.dailyBudgetUsd.budget}–${guide.dailyBudgetUsd.comfortable}`}
          sub="Per person per day, excluding flights"
        />
        <Fact
          icon={Languages}
          label="Language"
          value={guide.languages[0]}
          sub={guide.languages.length > 1 ? `Also ${guide.languages.slice(1).join(', ')}` : undefined}
        />
      </div>
    </section>
  );
}

/* ── When to go ──────────────────────────────────────────────────────────── */

export function WhenToGo({ guide }: { guide: DestinationGuide }) {
  return (
    <section aria-labelledby="when-to-go" className="night-card p-7">
      <div className="flex items-center gap-2 text-accent">
        <Sun size={16} aria-hidden="true" />
        <span className="text-xs font-semibold uppercase tracking-widest">Best time to visit</span>
      </div>
      <h2 id="when-to-go" className="mt-3 font-display text-2xl font-bold text-white">
        {guide.bestMonths}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-white/70">{guide.climate}</p>
      <p className="mt-4 border-t border-white/10 pt-4 text-sm leading-relaxed text-white/65">
        <span className="font-semibold text-white/85">Tipping · </span>
        {guide.tippingNote}
      </p>
    </section>
  );
}

/* ── Highlights & hidden gems ────────────────────────────────────────────── */

export function Highlights({
  destination,
  guide,
}: {
  destination: Destination;
  guide: DestinationGuide;
}) {
  return (
    <section aria-labelledby="highlights" className="grid gap-6 lg:grid-cols-2">
      <div className="night-card p-7">
        <div className="flex items-center gap-2 text-accent">
          <Compass size={16} aria-hidden="true" />
          <span className="text-xs font-semibold uppercase tracking-widest">Don&apos;t miss</span>
        </div>
        <h2 id="highlights" className="mt-3 font-display text-xl font-bold text-white">
          Top of everyone&apos;s list
        </h2>
        <ul className="mt-4 space-y-3">
          {guide.highlights.map((h) => (
            <li key={h} className="flex gap-3 text-sm leading-relaxed text-white/75">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold-light/70" aria-hidden="true" />
              {h}
            </li>
          ))}
        </ul>
      </div>

      <div className="night-card p-7">
        <div className="flex items-center gap-2 text-accent">
          <Sparkles size={16} aria-hidden="true" />
          <span className="text-xs font-semibold uppercase tracking-widest">Hidden gems</span>
        </div>
        <h2 className="mt-3 font-display text-xl font-bold text-white">
          What most visitors miss
        </h2>
        <ul className="mt-4 space-y-4">
          {guide.hiddenGems.map((g) => (
            <li key={g} className="text-sm leading-relaxed text-white/75">
              {g}
            </li>
          ))}
        </ul>
        <p className="mt-5 border-t border-white/10 pt-4 text-xs text-white/45">
          Curated by the Domner team — not sponsored placements.
        </p>
      </div>
    </section>
  );
}

/* ── Practical tips ──────────────────────────────────────────────────────── */

export function TravelTips({ destination, guide }: { destination: Destination; guide: DestinationGuide }) {
  return (
    <section aria-labelledby="tips" className="night-card p-7">
      <div className="flex items-center gap-2 text-accent">
        <Lightbulb size={16} aria-hidden="true" />
        <span className="text-xs font-semibold uppercase tracking-widest">Good to know</span>
      </div>
      <h2 id="tips" className="mt-3 font-display text-xl font-bold text-white">
        Before you fly to {destination.name}
      </h2>
      <ol className="mt-5 space-y-4">
        {guide.tips.map((tip, i) => (
          <li key={tip} className="flex gap-4">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-gold-light/40 bg-gold-light/10 text-xs font-bold text-gold-light">
              {i + 1}
            </span>
            <p className="text-sm leading-relaxed text-white/75">{tip}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ── Entry requirements ──────────────────────────────────────────────────── */

export function EntryRequirements({ customs }: { customs: CustomsRule }) {
  return (
    <section aria-labelledby="entry" className="night-card p-7">
      <div className="flex items-center gap-2 text-accent">
        <Stamp size={16} aria-hidden="true" />
        <span className="text-xs font-semibold uppercase tracking-widest">Entry requirements</span>
      </div>
      <h2 id="entry" className="mt-3 font-display text-xl font-bold text-white">
        On a Cambodian passport
      </h2>
      <p className="mt-3 text-sm font-medium leading-relaxed text-white">{customs.visaInfo}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Badge tone="info">Up to {customs.maxStayDays} days</Badge>
        <Badge tone="warning">Cash limit ${customs.maxCashUsd.toLocaleString()}</Badge>
      </div>
      <ul className="mt-4 space-y-2">
        {customs.notes.map((n) => (
          <li key={n} className="flex gap-3 text-sm leading-relaxed text-white/70">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-white/30" aria-hidden="true" />
            {n}
          </li>
        ))}
      </ul>
      <p className="mt-5 border-t border-white/10 pt-4 text-xs leading-relaxed text-white/45">
        Visa rules change. Confirm with the embassy before you book — this is guidance, not a
        guarantee of entry.
      </p>
    </section>
  );
}

/* ── Safety: real scams + real emergency numbers ─────────────────────────────
   There is deliberately no "safety score" here. A single number would be
   unsourceable and would flatten a country into a rating; specific, local,
   actionable warnings are what actually keep someone out of trouble. */

const SEVERITY_TONE = {
  high: 'danger',
  medium: 'warning',
  low: 'info',
} as const;

export function SafetyAndEmergency({
  destination,
  guide,
  alerts,
}: {
  destination: Destination;
  guide: DestinationGuide;
  alerts: ScamAlert[];
}) {
  const { police, ambulance, fire, tourist } = guide.emergency;
  const lines = [
    { label: 'Police', value: police },
    { label: 'Ambulance', value: ambulance },
    { label: 'Fire', value: fire },
    ...(tourist ? [{ label: 'Tourist line', value: tourist }] : []),
  ];

  return (
    <section aria-labelledby="safety" className="grid gap-6 lg:grid-cols-2">
      <div className="night-card p-7">
        <div className="flex items-center gap-2 text-accent">
          <ShieldAlert size={16} aria-hidden="true" />
          <span className="text-xs font-semibold uppercase tracking-widest">Watch out for</span>
        </div>
        <h2 id="safety" className="mt-3 font-display text-xl font-bold text-white">
          Common scams in {destination.name}
        </h2>
        {alerts.length > 0 ? (
          <ul className="mt-5 space-y-5">
            {alerts.map((a) => (
              <li key={a.title}>
                <div className="flex items-center gap-2">
                  <Badge tone={SEVERITY_TONE[a.severity]}>{a.severity}</Badge>
                  <p className="text-sm font-semibold text-white">{a.title}</p>
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-white/70">{a.description}</p>
              </li>
            ))}
          </ul>
        ) : (
          // Honest empty state: we have not researched this destination yet.
          // Saying "no known scams" would be a claim we cannot support.
          <p className="mt-4 text-sm leading-relaxed text-white/60">
            We haven&apos;t published scam warnings for {destination.name} yet. Ask our Khmer support
            team on Telegram before you travel — they answer from experience, not a script.
          </p>
        )}
      </div>

      <div className="night-card p-7">
        <div className="flex items-center gap-2 text-accent">
          <Phone size={16} aria-hidden="true" />
          <span className="text-xs font-semibold uppercase tracking-widest">Emergency numbers</span>
        </div>
        <h2 className="mt-3 font-display text-xl font-bold text-white">
          Save these before you fly
        </h2>
        <dl className="mt-5 space-y-2">
          {lines.map((l) => (
            <div
              key={l.label}
              className="flex items-center justify-between rounded-btn border border-white/10 bg-white/[0.04] px-4 py-3"
            >
              <dt className="text-sm text-white/70">{l.label}</dt>
              <dd>
                {/* tel: works offline and on a roaming SIM — the whole point of
                    putting these on the page rather than in a blog post. */}
                <a
                  href={`tel:${l.value}`}
                  className="rounded font-mono text-lg font-bold text-gold-light transition-colors hover:text-gold-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
                >
                  {l.value}
                </a>
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-5 border-t border-white/10 pt-4 text-xs leading-relaxed text-white/45">
          Emergency calls connect without credit and usually without a SIM. Your Domner eSIM keeps
          working for data even if your Cambodian number does not.
        </p>
      </div>
    </section>
  );
}
