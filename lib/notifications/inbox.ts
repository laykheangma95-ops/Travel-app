// ─────────────────────────────────────────────────────────────────────────────
// Inbox shaping — how a flat list of notifications becomes a readable screen.
//
// Pure, so the ordering rules that make the inbox worth having can be tested
// directly rather than inferred from a rendered component. The Notification
// Center imports these and renders the result; it makes no ordering decisions
// of its own.
// ─────────────────────────────────────────────────────────────────────────────

import type { NotificationLevel } from './catalog';

/** The subset of a notification row that shaping actually depends on. */
export interface InboxItem {
  id: string;
  category: string;
  kind: string;
  level: NotificationLevel;
  entity_type?: string | null;
  entity_id?: string | null;
  read_at: string | null;
  created_at: string;
}

export function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * What makes two notifications "the same subject".
 *
 * The entity when there is one — every update about SQ123 belongs together,
 * whether it is a delay, a gate change or the boarding call, because the
 * traveler thinks of them as one unfolding situation rather than four events.
 *
 * Otherwise the kind, so three low-data warnings group but a low-data warning
 * and a trip reminder do not. Falling back to the id means a row with neither
 * groups only with itself, which is the honest answer to "we do not know".
 */
export function subjectKey(item: InboxItem): string {
  if (item.entity_type && item.entity_id) return `${item.entity_type}:${item.entity_id}`;
  return `${item.category}:${item.kind}:${item.id}`;
}

/**
 * The one notification the Island shows, or null.
 *
 * Unread, level 1 or 2, and from today. A critical alert from Tuesday is
 * history, not a live state — pinning it would make the Island lie, and an
 * Island that lies once stops being the place people look. Most urgent wins,
 * then most recent.
 *
 * `today` is a parameter so this is testable without mocking the clock.
 */
export function selectLive<T extends InboxItem>(items: T[], today: string): T | null {
  return (
    items
      .filter((item) => item.read_at === null && item.level <= 2 && dayKey(item.created_at) === today)
      .sort((a, b) => a.level - b.level || b.created_at.localeCompare(a.created_at))[0] ?? null
  );
}

export interface DayGroup<T> {
  day: string;
  /** Subjects, each a stack of one or more items, newest-and-most-urgent first. */
  stacks: T[][];
  /** The most urgent level present. Drives the day's priority spine. */
  topLevel: NotificationLevel;
}

/**
 * Group into days, then into subjects.
 *
 * WITHIN A DAY, URGENCY BEATS TIME. A gate change from an hour ago outranks a
 * weather note from ten minutes ago, because someone opening this screen is
 * scanning for what they have to act on — not for what happened most recently.
 * That inversion is the entire reason the priority engine exists; sorting purely
 * by timestamp here would throw the levels away at the last step.
 *
 * `excludeId` drops whatever the Island is already showing, so one notification
 * is never two objects on screen.
 */
export function groupByDay<T extends InboxItem>(items: T[], excludeId?: string | null): DayGroup<T>[] {
  const byDay = new Map<string, T[]>();

  for (const item of items) {
    if (excludeId && item.id === excludeId) continue;
    const key = dayKey(item.created_at);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(item);
    else byDay.set(key, [item]);
  }

  return [...byDay.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([day, bucket]) => {
      bucket.sort((a, b) => a.level - b.level || b.created_at.localeCompare(a.created_at));

      // Grouping preserves the order the sort just established, so a stack lands
      // exactly where its most urgent member would have.
      const bySubject = new Map<string, T[]>();
      for (const item of bucket) {
        const key = subjectKey(item);
        const stack = bySubject.get(key);
        if (stack) stack.push(item);
        else bySubject.set(key, [item]);
      }

      const topLevel = Math.min(...bucket.map((item) => item.level)) as NotificationLevel;
      return { day, stacks: [...bySubject.values()], topLevel };
    });
}
