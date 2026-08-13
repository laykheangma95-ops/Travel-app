// ─────────────────────────────────────────────────────────────────────────────
// What a trip is allowed to be.
//
// One module, shared by the create form and the write routes, so the rules a
// traveler sees inline are literally the rules the server enforces. The form
// cannot drift into permitting something the API rejects, or into rejecting
// something the API would have accepted.
//
// Pure and dependency-free, like lib/travel/state.ts — importable from a client
// component, a route handler, or a test. Nothing here reaches the database.
// ─────────────────────────────────────────────────────────────────────────────

export const TRIP_INTERESTS = [
  'food',
  'culture',
  'nature',
  'nightlife',
  'shopping',
  'relaxing',
] as const;

export type TripInterest = (typeof TRIP_INTERESTS)[number];

/** Bilingual labels for the interest chips. `km` mirrors `en`, never a subset. */
export const INTEREST_LABEL: Record<TripInterest, { en: string; km: string }> = {
  food: { en: 'Food', km: 'អាហារ' },
  culture: { en: 'Culture', km: 'វប្បធម៌' },
  nature: { en: 'Nature', km: 'ធម្មជាតិ' },
  nightlife: { en: 'Nightlife', km: 'ជីវិតពេលយប់' },
  shopping: { en: 'Shopping', km: 'ការទិញទំនិញ' },
  relaxing: { en: 'Relaxing', km: 'សម្រាក' },
};

export const TRIP_TITLE_MAX = 80;
export const TRIP_DESTINATION_MAX = 80;
export const TRIP_TRAVELERS_MAX = 20;
/** A year is past the point where this is a trip and not a relocation. */
export const TRIP_NIGHTS_MAX = 365;

/** What the form collects and the API accepts. Not what the table stores. */
export interface TripDraft {
  title: string;
  destination: string;
  /** ISO YYYY-MM-DD, or null when the traveler has not committed to dates. */
  startDate: string | null;
  endDate: string | null;
  travelers: number;
  interests: TripInterest[];
}

export type TripField = 'title' | 'destination' | 'startDate' | 'endDate' | 'travelers' | 'interests';

export interface TripFieldError {
  field: TripField;
  message: { en: string; km: string };
}

export function emptyTripDraft(): TripDraft {
  return { title: '', destination: '', startDate: null, endDate: null, travelers: 1, interests: [] };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** True for a real calendar date, so 2026-02-31 fails rather than rolling over. */
function isRealDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function nightsBetween(start: string, end: string): number {
  const from = Date.parse(`${start}T00:00:00Z`);
  const to = Date.parse(`${end}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000);
}

/**
 * Every reason a draft cannot be saved, all at once.
 *
 * Returning the whole list rather than the first failure means the form can
 * mark every bad field in one pass — a traveler on a phone should not have to
 * discover their problems one submit at a time.
 */
export function validateTripDraft(draft: TripDraft): TripFieldError[] {
  const errors: TripFieldError[] = [];

  const title = draft.title.trim();
  if (!title) {
    errors.push({
      field: 'title',
      message: { en: 'Give the trip a name.', km: 'សូមដាក់ឈ្មោះដំណើរ។' },
    });
  } else if (title.length > TRIP_TITLE_MAX) {
    errors.push({
      field: 'title',
      message: {
        en: `Keep the name under ${TRIP_TITLE_MAX} characters.`,
        km: `ឈ្មោះត្រូវតិចជាង ${TRIP_TITLE_MAX} តួអក្សរ។`,
      },
    });
  }

  const destination = draft.destination.trim();
  if (!destination) {
    errors.push({
      field: 'destination',
      message: { en: 'Where are you going?', km: 'តើអ្នកនឹងទៅណា?' },
    });
  } else if (destination.length > TRIP_DESTINATION_MAX) {
    errors.push({
      field: 'destination',
      message: {
        en: `Keep the destination under ${TRIP_DESTINATION_MAX} characters.`,
        km: `គោលដៅត្រូវតិចជាង ${TRIP_DESTINATION_MAX} តួអក្សរ។`,
      },
    });
  }

  if (draft.startDate !== null && !isRealDate(draft.startDate)) {
    errors.push({
      field: 'startDate',
      message: { en: 'That start date is not a real date.', km: 'ថ្ងៃចេញដំណើរមិនត្រឹមត្រូវ។' },
    });
  }

  if (draft.endDate !== null && !isRealDate(draft.endDate)) {
    errors.push({
      field: 'endDate',
      message: { en: 'That return date is not a real date.', km: 'ថ្ងៃត្រឡប់មិនត្រឹមត្រូវ។' },
    });
  }

  // An end without a start is the one date combination that means nothing —
  // there is no window to place it in. Both empty is fine: that is a wish, and
  // TripsView already files undated trips under "upcoming".
  if (draft.endDate !== null && draft.startDate === null) {
    errors.push({
      field: 'startDate',
      message: {
        en: 'Add the date you leave, or clear the return date.',
        km: 'សូមបញ្ចូលថ្ងៃចេញដំណើរ ឬលុបថ្ងៃត្រឡប់។',
      },
    });
  }

  if (
    draft.startDate !== null &&
    draft.endDate !== null &&
    isRealDate(draft.startDate) &&
    isRealDate(draft.endDate)
  ) {
    const nights = nightsBetween(draft.startDate, draft.endDate);
    if (nights < 0) {
      errors.push({
        field: 'endDate',
        message: {
          en: 'The return date is before you leave.',
          km: 'ថ្ងៃត្រឡប់នៅមុនថ្ងៃចេញដំណើរ។',
        },
      });
    } else if (nights > TRIP_NIGHTS_MAX) {
      errors.push({
        field: 'endDate',
        message: {
          en: `That is longer than ${TRIP_NIGHTS_MAX} days.`,
          km: `រយៈពេលវែងជាង ${TRIP_NIGHTS_MAX} ថ្ងៃ។`,
        },
      });
    }
  }

  if (!Number.isInteger(draft.travelers) || draft.travelers < 1) {
    errors.push({
      field: 'travelers',
      message: { en: 'At least one traveller.', km: 'យ៉ាងតិចអ្នកដំណើរម្នាក់។' },
    });
  } else if (draft.travelers > TRIP_TRAVELERS_MAX) {
    errors.push({
      field: 'travelers',
      message: {
        en: `Up to ${TRIP_TRAVELERS_MAX} travellers.`,
        km: `រហូតដល់ ${TRIP_TRAVELERS_MAX} នាក់។`,
      },
    });
  }

  const known = new Set<string>(TRIP_INTERESTS);
  if (draft.interests.some((interest) => !known.has(interest))) {
    errors.push({
      field: 'interests',
      message: { en: 'Unrecognised interest.', km: 'ចំណាប់អារម្មណ៍មិនស្គាល់។' },
    });
  }

  return errors;
}

/**
 * Trim and de-duplicate a validated draft into the exact column values to store.
 *
 * Interests are re-ordered into TRIP_INTERESTS order rather than click order, so
 * two travelers who picked the same things produce the same array — which keeps
 * the column useful for grouping later.
 */
export function normalizeTripDraft(draft: TripDraft): {
  title: string;
  destination: string;
  start_date: string | null;
  end_date: string | null;
  travelers: number;
  interests: TripInterest[];
} {
  const chosen = new Set(draft.interests);
  return {
    title: draft.title.trim(),
    destination: draft.destination.trim(),
    start_date: draft.startDate,
    end_date: draft.endDate,
    travelers: draft.travelers,
    interests: TRIP_INTERESTS.filter((interest) => chosen.has(interest)),
  };
}

/**
 * A default trip name, so the required field is never the thing standing between
 * a traveler and their first trip. Overwritable — it is a suggestion in the box,
 * not a placeholder that silently becomes the title.
 */
export function suggestTripTitle(destination: string, lang: 'en' | 'km'): string {
  const place = destination.trim();
  if (!place) return '';
  return lang === 'km' ? `ដំណើរទៅ${place}` : `${place} trip`;
}
