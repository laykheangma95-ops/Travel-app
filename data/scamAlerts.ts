import type { ScamAlert } from '@/types';

export const scamAlerts: ScamAlert[] = [
  {
    countrySlug: 'thailand',
    title: 'Airport taxi touts',
    description:
      'People inside the arrivals hall offering "cheap taxi" — they charge 3-5x the meter price. Always use the official taxi counter on Level 1.',
    severity: 'high',
  },
  {
    countrySlug: 'thailand',
    title: '"Temple is closed" scam',
    description:
      'A friendly stranger says the Grand Palace is closed and offers a tuk-tuk tour instead. The palace is almost never closed — walk to the entrance yourself.',
    severity: 'medium',
  },
  {
    countrySlug: 'vietnam',
    title: 'Taxi meter tampering',
    description:
      'Some unmarked taxis have rigged meters. Use only Mai Linh (green) or Vinasun (white) taxis, or book a Grab.',
    severity: 'high',
  },
  {
    countrySlug: 'vietnam',
    title: 'Motorbike rental damage claims',
    description:
      'Renters claim you damaged the bike and demand payment. Photograph the bike from every angle before you ride.',
    severity: 'medium',
  },
  {
    countrySlug: 'china',
    title: 'Tea house scam',
    description:
      'Friendly "students" invite you to a tea ceremony, then present a bill of hundreds of dollars. Politely decline invitations from strangers.',
    severity: 'medium',
  },
  {
    countrySlug: 'japan',
    title: 'Bar touts in nightlife districts',
    description:
      'Touts in Kabukicho or Roppongi lure visitors into bars with hidden cover charges. Never follow a street tout into a bar.',
    severity: 'medium',
  },
  {
    countrySlug: 'malaysia',
    title: 'Fake police checks',
    description:
      'Scammers posing as police ask to "inspect your wallet". Real police never do this — ask to go to a police station.',
    severity: 'medium',
  },
  {
    countrySlug: 'indonesia',
    title: 'Money changer sleight of hand',
    description:
      'Street money changers with "great rates" short-count your notes. Use banks or authorized counters only, and count before leaving.',
    severity: 'high',
  },
];

export function getScamAlerts(slug: string): ScamAlert[] {
  return scamAlerts.filter((s) => s.countrySlug === slug);
}
