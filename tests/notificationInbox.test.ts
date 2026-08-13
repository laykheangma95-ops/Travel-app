import { describe, expect, it } from 'vitest';
import { groupByDay, selectLive, subjectKey, type InboxItem } from '@/lib/notifications/inbox';
import type { NotificationLevel } from '@/lib/notifications/catalog';

const TODAY = '2026-09-18';
const YESTERDAY = '2026-09-17';

let sequence = 0;

function item(overrides: Partial<InboxItem> & { level: NotificationLevel }): InboxItem {
  sequence += 1;
  return {
    id: `n${sequence}`,
    category: 'flights',
    kind: 'flight.delayed',
    entity_type: null,
    entity_id: null,
    read_at: null,
    created_at: `${TODAY}T09:00:00.000Z`,
    ...overrides,
  };
}

describe('selectLive — the Island shows exactly one thing', () => {
  it('picks the most urgent unread item from today', () => {
    const chosen = selectLive(
      [
        item({ id: 'weather', level: 3, created_at: `${TODAY}T11:00:00Z` }),
        item({ id: 'gate', level: 1, created_at: `${TODAY}T09:00:00Z` }),
        item({ id: 'checkin', level: 2, created_at: `${TODAY}T10:00:00Z` }),
      ],
      TODAY
    );
    expect(chosen?.id).toBe('gate');
  });

  it('breaks a tie on recency', () => {
    const chosen = selectLive(
      [
        item({ id: 'older', level: 1, created_at: `${TODAY}T08:00:00Z` }),
        item({ id: 'newer', level: 1, created_at: `${TODAY}T12:00:00Z` }),
      ],
      TODAY
    );
    expect(chosen?.id).toBe('newer');
  });

  it('never shows a read item', () => {
    const chosen = selectLive(
      [item({ level: 1, read_at: `${TODAY}T09:05:00Z` })],
      TODAY
    );
    expect(chosen).toBeNull();
  });

  it("never shows yesterday's critical alert as live", () => {
    // A gate change from Tuesday is history. Pinning it would make the Island
    // lie, and an Island that lies once stops being the place people look.
    const chosen = selectLive(
      [item({ level: 1, created_at: `${YESTERDAY}T23:50:00Z` })],
      TODAY
    );
    expect(chosen).toBeNull();
  });

  it('never shows a level 3 or 4 item, however recent', () => {
    const chosen = selectLive(
      [
        item({ level: 3, created_at: `${TODAY}T23:00:00Z` }),
        item({ level: 4, created_at: `${TODAY}T23:30:00Z` }),
      ],
      TODAY
    );
    expect(chosen).toBeNull();
  });
});

describe('subjectKey — what belongs together', () => {
  it('groups every update about one flight, whatever the kind', () => {
    const delay = item({ level: 1, kind: 'flight.delayed', entity_type: 'flight', entity_id: 'SQ123' });
    const gate = item({ level: 1, kind: 'flight.gate_change', entity_type: 'flight', entity_id: 'SQ123' });
    expect(subjectKey(delay)).toBe(subjectKey(gate));
  });

  it('keeps different flights apart', () => {
    const a = item({ level: 1, entity_type: 'flight', entity_id: 'SQ123' });
    const b = item({ level: 1, entity_type: 'flight', entity_id: 'QH215' });
    expect(subjectKey(a)).not.toBe(subjectKey(b));
  });

  it('does not group two unrelated entity-less kinds', () => {
    const esim = item({ level: 2, category: 'esim', kind: 'esim.low_data' });
    const trip = item({ level: 2, category: 'trips', kind: 'trip.tomorrow' });
    expect(subjectKey(esim)).not.toBe(subjectKey(trip));
  });

  it('leaves an entity-less row grouped only with itself', () => {
    const one = item({ level: 3, kind: 'travel.weather' });
    const two = item({ level: 3, kind: 'travel.weather' });
    expect(subjectKey(one)).not.toBe(subjectKey(two));
  });
});

describe('groupByDay', () => {
  it('sorts days newest first', () => {
    const groups = groupByDay([
      item({ level: 2, created_at: `${YESTERDAY}T09:00:00Z` }),
      item({ level: 2, created_at: `${TODAY}T09:00:00Z` }),
    ]);
    expect(groups.map((group) => group.day)).toEqual([TODAY, YESTERDAY]);
  });

  it('puts urgency before recency within a day', () => {
    // The inversion that justifies the whole priority engine: an hour-old gate
    // change outranks a ten-minute-old weather note.
    const groups = groupByDay([
      item({ id: 'weather', level: 3, created_at: `${TODAY}T11:50:00Z` }),
      item({ id: 'gate', level: 1, created_at: `${TODAY}T11:00:00Z` }),
    ]);
    expect(groups[0].stacks.map((stack) => stack[0].id)).toEqual(['gate', 'weather']);
  });

  it('collapses one subject into one stack, in place', () => {
    const groups = groupByDay([
      item({ id: 'd1', level: 1, entity_type: 'flight', entity_id: 'SQ123', created_at: `${TODAY}T10:00:00Z` }),
      item({ id: 'other', level: 2, category: 'esim', kind: 'esim.ready', created_at: `${TODAY}T12:00:00Z` }),
      item({ id: 'd2', level: 1, entity_type: 'flight', entity_id: 'SQ123', created_at: `${TODAY}T11:00:00Z` }),
    ]);

    expect(groups).toHaveLength(1);
    const [flightStack, esimStack] = groups[0].stacks;
    // Three notifications, two objects on screen.
    expect(groups[0].stacks).toHaveLength(2);
    expect(flightStack.map((entry) => entry.id)).toEqual(['d2', 'd1']);
    expect(esimStack.map((entry) => entry.id)).toEqual(['other']);
  });

  it('reports the most urgent level in the day for the spine', () => {
    const groups = groupByDay([
      item({ level: 4, created_at: `${TODAY}T09:00:00Z` }),
      item({ level: 2, created_at: `${TODAY}T10:00:00Z` }),
    ]);
    expect(groups[0].topLevel).toBe(2);
  });

  it('excludes whatever the Island is already showing', () => {
    // One notification must never be two objects on screen.
    const groups = groupByDay(
      [
        item({ id: 'live', level: 1, created_at: `${TODAY}T10:00:00Z` }),
        item({ id: 'rest', level: 3, created_at: `${TODAY}T09:00:00Z` }),
      ],
      'live'
    );
    expect(groups[0].stacks.flat().map((entry) => entry.id)).toEqual(['rest']);
  });

  it('drops a day entirely when its only item was the live one', () => {
    const groups = groupByDay([item({ id: 'live', level: 1 })], 'live');
    expect(groups).toEqual([]);
  });
});
