// ─────────────────────────────────────────────────────────────────────────────
// Contextual insights — what the companion says, and when it stays quiet.
//
// One insight per moment, chosen by the same "most present thing wins" ordering
// the state machine uses. Returning null is a first-class answer: a companion
// that comments on everything is noise, and noise is what makes people stop
// reading the one message that mattered.
//
// Pure, bilingual, and derived only from data we actually hold. Nothing here
// guesses at a gate, a price, or a flight time.
// ─────────────────────────────────────────────────────────────────────────────

import type { Lang } from '@/lib/i18n';
import type { TravelSnapshot } from './state';

export interface Insight {
  message: string;
  action?: { label: string; href: string };
}

const COPY = {
  esimMissing: {
    en: (place: string, days: number) =>
      `Your eSIM for ${place} isn't ready yet — ${days} ${days === 1 ? 'day' : 'days'} to go.`,
    km: (place: string, days: number) => `eSIM សម្រាប់${place}មិនទាន់រួចរាល់ទេ — នៅសល់ ${days} ថ្ងៃ។`,
  },
  esimMissingTomorrow: {
    en: (place: string) => `You travel to ${place} tomorrow and there's no eSIM on this trip yet.`,
    km: (place: string) => `អ្នកទៅ${place}ថ្ងៃស្អែក ហើយដំណើរនេះមិនទាន់មាន eSIM ទេ។`,
  },
  flightMissing: {
    en: (place: string) => `Add your flight to ${place} and I'll watch it for gate and delay changes.`,
    km: (place: string) => `បន្ថែមជើងហោះហើរទៅ${place} ខ្ញុំនឹងតាមដានទ្វារ និងការពន្យារពេល។`,
  },
  almostReady: {
    en: (place: string) => `You're almost ready for ${place}. One thing left.`,
    km: (place: string) => `អ្នកជិតរួចរាល់សម្រាប់${place}ហើយ។ នៅសល់មួយទៀត។`,
  },
  ready: {
    en: (place: string) => `Everything's set for ${place}. I'll take it from here.`,
    km: (place: string) => `អ្វីៗរួចរាល់សម្រាប់${place}ហើយ។ ខ្ញុំនឹងតាមដានបន្ត។`,
  },
  itineraryEmpty: {
    en: (place: string) => `Want me to sketch out your days in ${place}?`,
    km: (place: string) => `ចង់ឲ្យខ្ញុំរៀបចំកម្មវិធីនៅ${place}ទេ?`,
  },
  traveling: {
    en: (place: string) => `You're in ${place}. Ask me anything — I have your trip in front of me.`,
    km: (place: string) => `អ្នកនៅ${place}។ សួរខ្ញុំបាន — ខ្ញុំមានដំណើររបស់អ្នកនៅមុខ។`,
  },
  atAirport: {
    en: () => `Travel day. I'll tell you the second your gate or time changes.`,
    km: () => `ថ្ងៃធ្វើដំណើរ។ ខ្ញុំនឹងប្រាប់អ្នកភ្លាមៗពេលទ្វារ ឬម៉ោងផ្លាស់ប្តូរ។`,
  },
  postTrip: {
    en: (place: string) => `How was ${place}? Add a few photos before the details fade.`,
    km: (place: string) => `${place}យ៉ាងណា? បន្ថែមរូបភាពមុនពេលអ្នកបំភ្លេច។`,
  },
  discovering: {
    en: () => `No trip on the horizon. Want a few ideas for a short escape?`,
    km: () => `មិនមានដំណើរនៅខាងមុខ។ ចង់បានគំនិតដំណើរខ្លីៗទេ?`,
  },
} as const;

const ACTION = {
  getEsim: { en: 'Get eSIM', km: 'យក eSIM' },
  addFlight: { en: 'Add flight', km: 'បន្ថែមជើងហោះហើរ' },
  finishTrip: { en: 'Finish setup', km: 'បញ្ចប់ការរៀបចំ' },
  buildItinerary: { en: 'Plan my days', km: 'រៀបចំកម្មវិធី' },
  addMemories: { en: 'Add memories', km: 'បន្ថែមការចងចាំ' },
  explore: { en: 'Explore', km: 'ស្វែងរក' },
  openFlight: { en: 'Open flight', km: 'បើកជើងហោះហើរ' },
} as const;

/**
 * The one thing worth saying right now, or null.
 *
 * Read the branches as a priority list. Connectivity beats itinerary polish
 * because a traveler who lands without data cannot fix anything else; a missing
 * flight beats both because without it we have nothing to watch for them.
 */
export function insightFor(snapshot: TravelSnapshot, lang: Lang): Insight | null {
  const trip = snapshot.activeTrip;
  const place = trip?.destination ?? '';
  const days = snapshot.daysUntilStart;

  switch (snapshot.state) {
    case 'at_airport':
      return {
        message: COPY.atAirport[lang](),
        action: snapshot.activeFlight
          ? {
              label: ACTION.openFlight[lang],
              href: `/flights/${encodeURIComponent(snapshot.activeFlight.flightNumber)}`,
            }
          : undefined,
      };

    case 'traveling':
      if (!trip) return null;
      // Mid-trip, a low eSIM is the only thing worth interrupting for; usage
      // capsules cover the rest.
      if (snapshot.missing.includes('esim')) {
        return {
          message: COPY.esimMissingTomorrow[lang](place),
          action: { label: ACTION.getEsim[lang], href: '/esim' },
        };
      }
      return { message: COPY.traveling[lang](place) };

    case 'pre_trip': {
      if (!trip) return null;
      if (snapshot.missing.includes('esim')) {
        return {
          message:
            days !== null && days <= 1
              ? COPY.esimMissingTomorrow[lang](place)
              : COPY.esimMissing[lang](place, days ?? 0),
          action: { label: ACTION.getEsim[lang], href: '/esim' },
        };
      }
      if (snapshot.missing.length === 1) {
        return {
          message: COPY.almostReady[lang](place),
          action: { label: ACTION.finishTrip[lang], href: `/trips/${trip.id}` },
        };
      }
      if (snapshot.missing.length === 0) return { message: COPY.ready[lang](place) };
      return {
        message: COPY.almostReady[lang](place),
        action: { label: ACTION.finishTrip[lang], href: `/trips/${trip.id}` },
      };
    }

    case 'booked':
    case 'planning': {
      if (!trip) return null;
      if (snapshot.missing.includes('flight')) {
        return {
          message: COPY.flightMissing[lang](place),
          action: { label: ACTION.addFlight[lang], href: '/flights' },
        };
      }
      if (snapshot.missing.includes('esim')) {
        return {
          message: COPY.esimMissing[lang](place, days ?? 0),
          action: { label: ACTION.getEsim[lang], href: '/esim' },
        };
      }
      if (snapshot.missing.includes('itinerary')) {
        return {
          message: COPY.itineraryEmpty[lang](place),
          action: { label: ACTION.buildItinerary[lang], href: `/trips/${trip.id}#itinerary` },
        };
      }
      return { message: COPY.ready[lang](place) };
    }

    case 'post_trip':
      if (!trip) return null;
      return {
        message: COPY.postTrip[lang](place),
        action: { label: ACTION.addMemories[lang], href: `/trips/${trip.id}/memories` },
      };

    case 'discovering':
      return {
        message: COPY.discovering[lang](),
        action: { label: ACTION.explore[lang], href: '/explore' },
      };

    // A brand-new visitor has not told us anything yet. The hero is already
    // asking them where they are going; a companion piping up on top of it is
    // the definition of noise.
    case 'new_user':
      return null;
  }
}
