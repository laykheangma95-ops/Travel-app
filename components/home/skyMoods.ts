// ─────────────────────────────────────────────────────────────────────────────
// Sky moods — how the night sky changes hue when the globe arrives somewhere.
//
// The brand rule (.claude/skills/ui-ux §2) is "tokens only, no new hexes".
// A cinematic per-destination sky still needs colour variation, so instead of
// inventing a palette per country we define FIVE moods, each mixed only from
// existing brand tokens:
//
//   aurora  — starlight blue  #57C8FF / #8FD8FF
//   ember   — angkor gold     #C69749 / #E6CB8B  (+ clay #B14A34)
//   jade    — cultural jade   #1F7A66
//   dusk    — secondary navy  #1C3355 / #23406A
//   monsoon — jade × starlight blue
//
// Every destination is assigned one in `data/destinationProfiles.ts`. The mood
// drives three CSS custom properties on the stage, so the background gradient,
// the atmosphere rim and the pin all shift together as one lighting change
// rather than a set of unrelated recolours.
// ─────────────────────────────────────────────────────────────────────────────

import type { SkyMood } from '@/types';

export interface SkyMoodRecipe {
  /** Horizon wash behind the globe. */
  glow: string;
  /** Mid-sky tint — the body of the gradient. */
  veil: string;
  /** Line/pin accent. Used at large sizes only, never for body text. */
  accent: string;
  /** Three.js atmosphere rim colour (hex, engine wants a plain string). */
  rim: string;
}

export const SKY_MOODS: Record<SkyMood, SkyMoodRecipe> = {
  aurora: {
    glow: 'rgba(87, 200, 255, 0.20)',
    veil: 'rgba(35, 64, 106, 0.60)',
    accent: '#8FD8FF',
    rim: '#57c8ff',
  },
  ember: {
    glow: 'rgba(198, 151, 73, 0.22)',
    veil: 'rgba(122, 90, 30, 0.34)',
    accent: '#E6CB8B',
    rim: '#e0a860',
  },
  jade: {
    glow: 'rgba(31, 122, 102, 0.24)',
    veil: 'rgba(28, 82, 90, 0.50)',
    accent: '#6FD8BF',
    rim: '#3fbfa0',
  },
  dusk: {
    glow: 'rgba(35, 64, 106, 0.42)',
    veil: 'rgba(28, 51, 85, 0.62)',
    accent: '#A9C6F5',
    rim: '#6f9fe0',
  },
  monsoon: {
    glow: 'rgba(63, 168, 190, 0.22)',
    veil: 'rgba(24, 70, 100, 0.55)',
    accent: '#7FD8E8',
    rim: '#4fc3d9',
  },
};

/** The neutral home sky, used whenever no destination is in focus. */
export const IDLE_MOOD: SkyMoodRecipe = {
  glow: 'rgba(230, 176, 90, 0.12)',
  veil: 'rgba(30, 64, 122, 0.55)',
  accent: '#E6CB8B',
  rim: '#57c8ff',
};

export function moodRecipe(mood: SkyMood | null | undefined): SkyMoodRecipe {
  return mood ? SKY_MOODS[mood] : IDLE_MOOD;
}
