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
}

type Errors = Partial<Record<TripField, string>>;

export function TripForm({ tripId, initial }: TripFormProps) {
  const { lang } = useLang();
  const router = useRouter();
  const editing = Boolean(tripId);

  const [draft, setDraft] = useState<TripDraft>(initial ?? emptyTripDraft());
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

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

  // A full country list means a traveler can begin a trip anywhere in the
  // world. The native datalist filters as they type (for example, "A" or "C").
  const suggestions = useMemo(
    () => countries.map((country) => country.name).sort((a, b) => a.localeCompare(b)),
    []
  );

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
          <div>
            <Input
              dark
              id="trip-destination"
              list="trip-destination-options"
              label={lang === 'km' ? 'គោលដៅ' : 'Destination'}
              placeholder={lang === 'km' ? 'ជប៉ុន, តូក្យូ, បាងកក…' : 'Japan, Tokyo, Bangkok…'}
              required
              autoComplete="off"
              value={draft.destination}
              error={errors.destination}
              onChange={(event) => onDestination(event.target.value)}
            />
            <datalist id="trip-destination-options">
              {suggestions.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
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
                  // Moving the leaving date forward also moves an earlier return
                  // date forward, so the date range always remains valid.
                  endDate: startDate && current.endDate && current.endDate < startDate ? startDate : current.endDate,
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
