// ─────────────────────────────────────────────────────────────────────────────
// Destination guide schema — the backbone of the homepage journey.
//
// Design rules, in priority order:
//
//  1. EVERY hand-written fact carries `lastVerified` and (where one exists) a
//     `source`. Both are rendered in the UI. A fact we cannot date is a fact we
//     do not ship — see docs/homepage-v3-plan.md §3.
//  2. Every human-readable string is bilingual (`Bi`). The type system, not a
//     reviewer, is what guarantees Khmer completeness.
//  3. This describes FACTS ABOUT A PLACE, not sections of a page. The trip
//     dashboard, the arrival moment and the Travel Readiness Score in
//     roadmap.md all read these same objects without re-modelling anything.
//  4. Guides are cities; the eSIM catalogue is countries. The join is
//     `esimCountrySlug`.
//
// Maintaining a destination means editing one file in content/destinations/.
// No component changes, no code.
// ─────────────────────────────────────────────────────────────────────────────

/** A bilingual string. Khmer is never optional. */
export interface Bi {
  en: string;
  km: string;
}

/** ISO date, e.g. '2026-08-03'. Rendered in the UI wherever it appears. */
export type ISODate = string;

export interface Source {
  label: Bi;
  /** The official page a traveller can check for themselves. */
  url: string;
}

/**
 * Wrapper for anything hand-written.
 *
 * `volatile` marks a fact that has changed more than once in the last year —
 * currently used for the Thailand entry rules, which moved repeatedly through
 * 2025–2026. The UI renders volatile facts with a "confirm before you book"
 * prompt and a link to the official source instead of presenting a number with
 * false confidence. Being visibly unsure about a genuinely unsettled fact is
 * more useful than being confidently wrong.
 */
export type Verified<T> = T & {
  lastVerified: ISODate;
  source?: Source;
  volatile?: boolean;
};

/** Optional real photography. Ships as bespoke SVG scenes today — see
 *  components/home/v3/destinationScene.tsx and design-notes.md. */
export interface Photo {
  src: string;
  alt: Bi;
  blurDataURL: string;
  width: number;
  height: number;
  credit: { name: string; url: string; license: string };
}

export type VisaKind =
  | 'visa-free'
  | 'visa-on-arrival'
  | 'e-visa'
  | 'embassy-visa'
  | 'check-before-booking';

export interface Requirement {
  /** Stable id — the Travel Readiness Score in roadmap.md keys off this. */
  id: string;
  title: Bi;
  detail: Bi;
  mandatory: boolean;
  /** When this can and must be done, relative to departure. Lets us say
   *  "submit on or after 14 March" once a travel date is known. */
  window?: { opensDaysBefore?: number; closesHoursBefore?: number };
  url?: string;
}

export interface FromAirport {
  mode: Bi;
  durationMins: number;
  /** As written on the ticket machine, e.g. '¥2,570'. */
  costLocal: string;
  costUsd: number;
  note?: Bi;
}

export interface TravelApp {
  name: string;
  purpose: Bi;
}

export interface Place {
  kind: 'landmark' | 'hidden-gem' | 'popular-with-cambodians';
  /**
   * The catalogue row this entry saves to — `destination_places.content_slug`,
   * seeded from supabase/seeds/destination_places.csv (migration 011).
   *
   * Required, and deliberately not derived from `name`. A guide heading is
   * editorial prose that should be free to change — "Wat Pho and the reclining
   * Buddha", "Gardens by the Bay after dark" — while the catalogue key stays
   * canonical and stable. Deriving one from the other would mean a copy edit
   * silently forked a new place, or broke saving for an existing one.
   *
   * tests/guideCatalogue.test.ts fails the build if a slug here has no matching
   * seed row, so a guide entry can never ship un-saveable.
   */
  contentSlug: string;
  name: Bi;
  why: Bi;
  area: Bi;
  bestTime?: Bi;
  roughCostUsd?: number;
  mapUrl?: string;
}

export interface DestinationGuide {
  slug: string;
  city: Bi;
  country: Bi;
  /** ISO 3166-1 alpha-2 — drives the drawn flag, never an emoji. */
  countryCode: string;
  /** Which entry in data/destinations.ts this guide sells. */
  esimCountrySlug: string;
  /** Everything search should match: English, Khmer, airport codes, aliases. */
  aliases: string[];
  /**
   * How commonly Cambodians fly this route. Hand-set 1–10, used only to order
   * suggestions. Never displayed as a number — we do not have, and will not
   * invent, passenger statistics.
   */
  routeWeight: number;
  /** Direct flight time from Phnom Penh, in minutes. null = no direct route. */
  directFlightMins: number | null;

  geo: {
    lat: number;
    lon: number;
    /** IANA zone. Powers the live local clock with no API call at all. */
    timezone: string;
    /** Camera distance the flight settles at. Tuned per destination so the
     *  country frames well; see components/globe/flightController.ts. */
    flightAltitude: number;
  };

  arrival: {
    /**
     * The colour the sky becomes at the end of the flight. The globe's
     * atmosphere crosses to exactly this value, and the destination scene is
     * drawn on top of it — so the flight lands *into* the artwork rather than
     * cross-fading over it. This field is the seam.
     */
    skyColor: string;
    /** Second gradient stop, toward the horizon. */
    horizonColor: string;
    intro: Bi;
    photo?: Photo;
  };

  basics: Verified<{
    currency: { code: string; name: Bi; symbol: string };
    /** Three real, checkable local prices. Concrete beats "affordable". */
    tenDollarsBuys: { item: Bi; localPrice: string }[];
    languages: Bi[];
    hello: { native: string; roman: string };
    thankYou: { native: string; roman: string };
    /** IEC plug letters, e.g. ['A', 'B']. */
    plugTypes: string[];
    voltage: string;
    networks: { name: string; note?: Bi }[];
  }>;

  /** Chapter 3 — deliberately the richest object here. */
  entry: {
    /** Explicit: this is advice for a Cambodian passport, nobody else's. */
    forPassport: 'KH';
    visa: Verified<{
      kind: VisaKind;
      summary: Bi;
      maxStayDays: number | null;
      costUsd: number | null;
      applyUrl?: string;
      processingTime?: Bi;
    }>;
    /** Shown as a checklist. Each is independently trackable. */
    requirements: Verified<Requirement>[];
    passportValidity: Verified<{ monthsBeyondStay: number; note?: Bi }>;
    customs: Verified<{ cashDeclareOverUsd: number | null; banned: Bi[] }>;
    emergency: Verified<{
      police: string;
      ambulance: string;
      fire: string;
      /** The thing no competitor carries. Omitted rather than guessed. */
      khmerMission?: {
        name: Bi;
        address?: Bi;
        phone?: string;
        email?: string;
        url?: string;
        note?: Bi;
      };
    }>;
    /** Anything a Cambodian traveller must know that does not fit above —
     *  currently the Thai land border closure. Rendered at the top of the
     *  chapter, above the visa card. */
    advisory?: Verified<{ title: Bi; detail: Bi }>;
  };

  around: Verified<{
    fromAirport: FromAirport[];
    transitCard?: { name: string; note: Bi; inPhoneWallet: boolean };
    apps: TravelApp[];
    money: {
      cambodianCardAccepted: 'widely' | 'sometimes' | 'rarely';
      khqrAccepted: boolean;
      khqrNote: Bi;
      cashCulture: Bi;
      tipping: Bi;
    };
  }>;

  places: Verified<{ list: Place[] }>;
}
