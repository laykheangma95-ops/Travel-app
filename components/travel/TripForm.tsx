'use client';

// ─────────────────────────────────────────────────────────────────────────────
// TripForm — the front door to a trip, and the same screen for editing one.
//
// Until this existed, `trip_plans` had no write path anywhere in the codebase:
// the table, its RLS policies, TripsView, TripWorkspace and the whole travel
// state machine were built and correct, but the only way to produce a row was
// to type it into the Supabase dashboard by hand. The "New trip" button pointed
// at the packing checklist.
//
// Create and edit are one component because they are one act — the fields, the
// rules and the layout are identical, and only the verb and the destination of
// the redirect differ. Two components would drift.
//
// Validation is lib/travel/trips.ts, the exact module the API validates with,
// so nothing the form accepts can be refused by the server or vice versa.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Check, Loader2, Trash2 } from 'lucide-react';
import { countries } from '@/data/countries';
import { tripDestinations, type TripDestination } from '@/data/cities';
import { useLang } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Input, Select } from '@/components/ui/Input';
import {
  INTEREST_LABEL,
  TRIP_INTERESTS,
  TRIP_TITLE_MAX,
  TRIP_TRAVELERS_MAX,
  emptyTripDraft,
  suggestTripTitle,
  validateTripDraft,
  type TripDraft,
  type TripField,
  type TripInterest,
} from '@/lib/travel/trips';

interface TripFormProps {
  /** Absent when creating. Present when editing an existing trip. */
  tripId?: string;
  initial?: TripDraft;
  /**
   * A destination handed over by Explore or a destination guide, so someone who
   * has just finished reading about a place does not have to type its name
   * again. Only matched against the known country list — an unrecognised value
   * is ignored rather than trusted into the form.
   */
  presetDestination?: string | null;
}

type Errors = Partial<Record<TripField, string>>;

/** The country list is the vocabulary; anything else is discarded. */
function knownCountry(value: string | null | undefined): string | null {
  if (!value) return null;
  const needle = value.trim().toLocaleLowerCase();
  if (!needle) return null;
  return countries.find((country) => country.name.toLocaleLowerCase() === needle)?.name ?? null;
}

export function TripForm({ tripId, initial, presetDestination }: TripFormProps) {
  const { lang } = useLang();
  const router = useRouter();
  const editing = Boolean(tripId);

  const [draft, setDraft] = useState<TripDraft>(() => {
    if (initial) return initial;
    const preset = knownCountry(presetDestination);
    if (!preset) return emptyTripDraft();
    return { ...emptyTripDraft(), destination: preset, title: suggestTripTitle(preset, lang) };
  });
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [destinationOpen, setDestinationOpen] = useState(false);
  /** Which suggestion the arrow keys are on. -1 means none. */
  const [highlighted, setHighlighted] = useState(-1);

  // Whether the traveler has taken ownership of the title. Once they have, a
  // later change of destination must not overwrite what they typed.
  const titleTouched = useRef(Boolean(initial?.title));

  const set = <K extends keyof TripDraft>(key: K, value: TripDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  /** Suggest a name from the destination, until the traveler writes their own. */
  const onDestination = (value: string) => {
    setDraft((current) => ({
      ...current,
      destination: value,
      title: titleTouched.current ? current.title : suggestTripTitle(value, lang),
    }));
    setErrors((current) => ({ ...current, destination: undefined, title: undefined }));
  };

  const toggleInterest = (interest: TripInterest) => {
    setDraft((current) => ({
      ...current,
      interests: current.interests.includes(interest)
        ? current.interests.filter((each) => each !== interest)
        : [...current.interests, interest],
    }));
  };

  // Every country in the world AND every city we index — deliberately not
  // filtered by eSIM coverage. Nobody says "I'm going to Malaysia"; they say
  // Kuala Lumpur, and someone planning Athens should be able to plan Athens
  // whether or not we can sell them a Greek eSIM yet.
  const suggestions = useMemo(
    () =>
      [...tripDestinations].sort(
        (a, b) => b.weight - a.weight || a.label.localeCompare(b.label)
      ),
    []
  );

  const matchingDestinations = useMemo(() => {
    const query = draft.destination.trim().toLocaleLowerCase();
    if (!query) return suggestions.filter((item) => item.kind === 'country').slice(0, 8);

    const scored: { item: TripDestination; rank: number }[] = [];
    for (const item of suggestions) {
      const label = item.label.toLocaleLowerCase();
      // A prefix match is what the traveler is most likely reaching for, so it
      // outranks a match buried mid-string ("Ho Chi Minh" before "Quezon City").
      let rank = 0;
      if (label === query) rank = 400;
      else if (label.startsWith(query)) rank = 300;
      else if (item.labelKm?.includes(draft.destination.trim())) rank = 250;
      else if (label.includes(query)) rank = 150;
      else if (item.aliases.some((alias) => alias.toLocaleLowerCase().startsWith(query))) rank = 100;
      if (rank) scored.push({ item, rank: rank + item.weight });
    }
    return scored
      .sort((a, b) => b.rank - a.rank || a.item.label.localeCompare(b.item.label))
      .slice(0, 8)
      .map((entry) => entry.item);
  }, [draft.destination, suggestions]);

  /**
   * Take a suggestion. The COUNTRY is what gets stored — trip_plans.destination
   * is what the itinerary catalogue, resolveTrip and matchDestination all key
   * on, so storing "Kuala Lumpur" would leave the trip unreachable by every one
   * of them. The city survives in the suggested title, which is the part the
   * traveler actually reads back.
   */
  const chooseDestination = (item: TripDestination) => {
    setDraft((current) => ({
      ...current,
      destination: item.country,
      title: titleTouched.current ? current.title : suggestTripTitle(item.label, lang),
    }));
    setErrors((current) => ({ ...current, destination: undefined, title: undefined }));
  };

  /** Arrow keys walk the list, Enter takes the highlighted one, Escape closes. */
  function onDestinationKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setDestinationOpen(false);
      setHighlighted(-1);
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!destinationOpen) {
        setDestinationOpen(true);
        return;
      }
      if (matchingDestinations.length === 0) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setHighlighted((current) => {
        const next = current + step;
        if (next < 0) return matchingDestinations.length - 1;
        if (next >= matchingDestinations.length) return 0;
        return next;
      });
      return;
    }

    // Enter only steals the keypress when a suggestion is actually highlighted;
    // otherwise it submits the form, which is what it should do.
    if (event.key === 'Enter' && destinationOpen && highlighted >= 0) {
      event.preventDefault();
      chooseDestination(matchingDestinations[highlighted]);
      setDestinationOpen(false);
      setHighlighted(-1);
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const found = validateTripDraft(draft);
    if (found.length > 0) {
      const next: Errors = {};
      for (const error of found) next[error.field] ??= error.message[lang];
      setErrors(next);
      // Send focus to the first problem rather than leaving a phone user to
      // hunt for the red text somewhere above the fold.
      document.getElementById(`trip-${found[0].field}`)?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(editing ? `/api/travel/trips/${tripId}` : '/api/travel/trips', {
        method: editing ? 'PATCH' : 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(draft),
      });

      const body = (await response.json().catch(() => null)) as
        | { trip?: { id: string }; error?: { message?: string } }
        | null;

      if (!response.ok || !body?.trip) {
        setFormError(
          body?.error?.message ??
            (lang === 'km' ? 'រក្សាទុកមិនបាន។ សូមព្យាយាមម្ដងទៀត។' : 'Could not save. Please try again.')
        );
        setSubmitting(false);
        return;
      }

      router.push(`/trips/${body.trip.id}`);
      router.refresh();
    } catch {
      setFormError(
        lang === 'km' ? 'រក្សាទុកមិនបាន។ សូមព្យាយាមម្ដងទៀត។' : 'Could not save. Please try again.'
      );
      setSubmitting(false);
    }
  }

  async function onDelete() {
    if (!tripId) return;
    setDeleting(true);
    setFormError(null);
    try {
      const response = await fetch(`/api/travel/trips/${tripId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok) {
        setFormError(
          lang === 'km' ? 'លុបមិនបាន។ សូមព្យាយាមម្ដងទៀត។' : 'Could not delete. Please try again.'
        );
        setDeleting(false);
        return;
      }
      router.push('/trips');
      router.refresh();
    } catch {
      setFormError(
        lang === 'km' ? 'លុបមិនបាន។ សូមព្យាយាមម្ដងទៀត។' : 'Could not delete. Please try again.'
      );
      setDeleting(false);
    }
  }

  const busy = submitting || deleting;

  return (
    <div className="night-canvas has-tabbar relative min-h-screen">
      <div className="night-stars" aria-hidden="true" />

      <div className="relative mx-auto max-w-2xl px-4 pb-16 pt-8 sm:px-6">
        <Link
          href={editing && tripId ? `/trips/${tripId}` : '/trips'}
          className="inline-flex min-h-[2.75rem] items-center gap-1.5 text-sm text-white/65 transition-colors duration-200 ease-smooth hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
        >
          <ArrowLeft size={15} aria-hidden="true" />
          {editing ? (lang === 'km' ? 'ត្រឡប់ទៅដំណើរ' : 'Back to trip') : lang === 'km' ? 'ដំណើរទាំងអស់' : 'All trips'}
        </Link>

        <header className="mt-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gold-light">
            {editing ? (lang === 'km' ? 'កែសម្រួល' : 'Edit') : lang === 'km' ? 'ដំណើរថ្មី' : 'New trip'}
          </p>
          <h1 className="mt-1.5 font-display text-3xl text-white sm:text-4xl">
            {editing
              ? lang === 'km'
                ? 'កែសម្រួលដំណើរ'
                : 'Edit this trip'
              : lang === 'km'
                ? 'តើអ្នកនឹងទៅណា?'
                : 'Where are you going?'}
          </h1>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-white/65">
            {lang === 'km'
              ? 'បញ្ចូលតែគោលដៅក៏បានដែរ។ ថ្ងៃ និងផ្នែកផ្សេងទៀតអាចបន្ថែមពេលក្រោយ។'
              : 'A destination is enough to start. Dates and the rest can come later.'}
          </p>
        </header>

        <form onSubmit={onSubmit} noValidate className="night-card mt-6 space-y-5 p-5 sm:p-6">
          {/* The combobox carried the right ARIA — role, aria-expanded,
              aria-controls, a listbox of options — but had no key handling and
              no aria-activedescendant, so a keyboard or screen-reader user was
              told a listbox was open and could not reach it. */}
          <div className="relative">
            <Input
              dark
              id="trip-destination"
              label={lang === 'km' ? 'គោលដៅ' : 'Destination'}
              placeholder={lang === 'km' ? 'ទីក្រុង ឬប្រទេស…' : 'City or country…'}
              required
              autoComplete="off"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={destinationOpen}
              aria-controls="trip-destination-options"
              aria-activedescendant={
                destinationOpen && highlighted >= 0
                  ? `trip-destination-option-${highlighted}`
                  : undefined
              }
              value={draft.destination}
              error={errors.destination}
              onFocus={() => setDestinationOpen(true)}
              onBlur={() => window.setTimeout(() => setDestinationOpen(false), 120)}
              onKeyDown={onDestinationKeyDown}
              onChange={(event) => {
                onDestination(event.target.value);
                setDestinationOpen(true);
                setHighlighted(-1);
              }}
            />
            {destinationOpen && (
              <ul
                id="trip-destination-options"
                role="listbox"
                aria-label={lang === 'km' ? 'ទីក្រុង និងប្រទេស' : 'Cities and countries'}
                className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-btn border border-white/15 bg-[#142238] p-1 shadow-2xl"
              >
                {matchingDestinations.map((item, index) => (
                  <li key={`${item.kind}-${item.label}-${item.country}`}>
                    <button
                      type="button"
                      id={`trip-destination-option-${index}`}
                      role="option"
                      aria-selected={index === highlighted}
                      onMouseEnter={() => setHighlighted(index)}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        chooseDestination(item);
                        setDestinationOpen(false);
                        setHighlighted(-1);
                      }}
                      className={cn(
                        'flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 text-left text-sm transition-colors',
                        index === highlighted ? 'bg-white/12 text-white' : 'text-white/80'
                      )}
                    >
                      <span className="min-w-0 truncate">
                        {lang === 'km' ? (item.labelKm ?? item.label) : item.label}
                      </span>
                      {item.kind === 'city' && (
                        <span className="shrink-0 text-xs text-white/45">{item.country}</span>
                      )}
                    </button>
                  </li>
                ))}
                {!matchingDestinations.length && (
                  <li className="px-3 py-3 text-sm text-white/55">
                    {lang === 'km' ? 'រកមិនឃើញប្រទេសនេះទេ។' : 'No country found.'}
                  </li>
                )}
              </ul>
            )}
          </div>

          <Input
            dark
            id="trip-title"
            label={lang === 'km' ? 'ឈ្មោះដំណើរ' : 'Trip name'}
            placeholder={lang === 'km' ? 'ដំណើរទៅជប៉ុន' : 'Japan trip'}
            required
            maxLength={TRIP_TITLE_MAX}
            value={draft.title}
            error={errors.title}
            onChange={(event) => {
              titleTouched.current = true;
              set('title', event.target.value);
            }}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              dark
              id="trip-startDate"
              type="date"
              label={lang === 'km' ? 'ថ្ងៃចេញដំណើរ' : 'Leaving'}
              value={draft.startDate ?? ''}
              error={errors.startDate}
              onChange={(event) => {
                const startDate = event.target.value || null;
                setDraft((current) => ({
                  ...current,
                  startDate,
                  // The return field starts at the leaving date. Moving the
                  // leaving date later also keeps an earlier return valid.
                  endDate: startDate && (!current.endDate || current.endDate < startDate) ? startDate : current.endDate,
                }));
                setErrors((current) => ({ ...current, startDate: undefined, endDate: undefined }));
              }}
            />
            <Input
              dark
              id="trip-endDate"
              type="date"
              label={lang === 'km' ? 'ថ្ងៃត្រឡប់' : 'Returning'}
              min={draft.startDate ?? undefined}
              value={draft.endDate ?? ''}
              error={errors.endDate}
              onChange={(event) => set('endDate', event.target.value || null)}
            />
          </div>

          <Select
            dark
            id="trip-travelers"
            label={lang === 'km' ? 'អ្នកដំណើរ' : 'Travellers'}
            value={String(draft.travelers)}
            error={errors.travelers}
            onChange={(event) => set('travelers', Number(event.target.value))}
          >
            {Array.from({ length: TRIP_TRAVELERS_MAX }, (_, index) => index + 1).map((count) => (
              <option key={count} value={count}>
                {count}
              </option>
            ))}
          </Select>

          <fieldset>
            <legend className="block text-sm font-medium text-white/80">
              {lang === 'km' ? 'ចំណាប់អារម្មណ៍' : "What you're into"}
            </legend>
            <p className="mt-0.5 text-xs text-white/50">
              {lang === 'km' ? 'ជាជម្រើស — ជួយរៀបចំកម្មវិធីពេលក្រោយ។' : 'Optional — it shapes the plan later.'}
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {TRIP_INTERESTS.map((interest) => {
                const active = draft.interests.includes(interest);
                return (
                  <button
                    key={interest}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleInterest(interest)}
                    className={cn(
                      'liquid-press inline-flex min-h-[2.75rem] items-center gap-1.5 rounded-btn border px-4 text-sm font-medium transition-all duration-200 ease-smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light',
                      active
                        ? 'border-gold-light/50 bg-gold-light/15 text-gold-bright'
                        : 'border-white/15 text-white/70 hover:border-gold-light/30 hover:text-white'
                    )}
                  >
                    {active && <Check size={14} aria-hidden="true" />}
                    {INTEREST_LABEL[interest][lang]}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {formError && (
            <p role="alert" className="text-sm text-danger">
              {formError}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="submit"
              disabled={busy}
              className="liquid-glass-accent liquid-press inline-flex min-h-[3rem] flex-1 items-center justify-center gap-2 rounded-btn px-6 text-sm font-semibold text-primary-deep disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-bright"
            >
              {submitting && <Loader2 size={15} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
              {editing
                ? lang === 'km'
                  ? 'រក្សាទុក'
                  : 'Save changes'
                : lang === 'km'
                  ? 'បង្កើតដំណើរ'
                  : 'Create trip'}
            </button>
            <Link
              href={editing && tripId ? `/trips/${tripId}` : '/trips'}
              className="inline-flex min-h-[3rem] items-center justify-center rounded-btn border border-white/15 px-5 text-sm font-semibold text-white transition-colors duration-200 ease-smooth hover:border-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
            >
              {lang === 'km' ? 'បោះបង់' : 'Cancel'}
            </Link>
          </div>
        </form>

        {editing && (
          <section className="mt-6" aria-labelledby="trip-danger">
            <h2 id="trip-danger" className="text-[11px] font-semibold uppercase tracking-widest text-white/45">
              {lang === 'km' ? 'លុបដំណើរ' : 'Delete trip'}
            </h2>

            {confirmingDelete ? (
              <div className="night-card mt-2.5 p-4">
                <p className="text-sm leading-relaxed text-white/75">
                  {lang === 'km'
                    ? 'ការលុបនេះនឹងលុបបញ្ជីត្រៀម និងរូបភាពអនុស្សាវរីយ៍របស់ដំណើរនេះផងដែរ។ មិនអាចត្រឡប់វិញបានទេ។'
                    : 'This also removes the checklist and the memories saved to this trip. It cannot be undone.'}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={onDelete}
                    disabled={busy}
                    className="liquid-press inline-flex min-h-[2.75rem] items-center gap-1.5 rounded-btn bg-danger px-5 text-sm font-semibold text-white disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  >
                    {deleting && <Loader2 size={14} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
                    {lang === 'km' ? 'លុបជាស្ថាពរ' : 'Delete permanently'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(false)}
                    disabled={busy}
                    className="inline-flex min-h-[2.75rem] items-center rounded-btn border border-white/15 px-5 text-sm font-semibold text-white transition-colors duration-200 ease-smooth hover:border-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
                  >
                    {lang === 'km' ? 'រក្សាទុកដំណើរ' : 'Keep it'}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="mt-2.5 inline-flex min-h-[2.75rem] items-center gap-1.5 rounded-btn border border-danger/40 px-5 text-sm font-semibold text-danger transition-colors duration-200 ease-smooth hover:border-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger"
              >
                <Trash2 size={14} aria-hidden="true" />
                {lang === 'km' ? 'លុបដំណើរនេះ' : 'Delete this trip'}
              </button>
            )}
          </section>
        )}
      </div>
    </div>
  );
}