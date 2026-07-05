import type { CustomsRule } from '@/types';

export const customsRules: CustomsRule[] = [
  {
    countrySlug: 'vietnam',
    maxCashUsd: 5000,
    visaInfo: 'Cambodian passport: visa on arrival available, $25. E-visa also accepted.',
    maxStayDays: 30,
    notes: [
      'Max cash $5,000 USD allowed into Vietnam without declaration',
      'Fill the Vietnam e-arrival card 48 hours before travel',
      'Prescription medication must be in original packaging',
    ],
  },
  {
    countrySlug: 'thailand',
    maxCashUsd: 15000,
    visaInfo: 'Cambodian passport: visa-free entry for tourism up to 30 days.',
    maxStayDays: 30,
    notes: [
      'Cash over $15,000 USD must be declared',
      'Show proof of onward travel if asked',
      'E-cigarettes are illegal in Thailand',
    ],
  },
  {
    countrySlug: 'china',
    maxCashUsd: 5000,
    visaInfo: 'Cambodian passport: visa required — apply at the Chinese embassy before travel.',
    maxStayDays: 30,
    notes: [
      'Cash over $5,000 USD must be declared',
      'Many apps are blocked — Premium eSIM plans include no-VPN access',
      'Register your stay with local police within 24h if not in a hotel',
    ],
  },
  {
    countrySlug: 'japan',
    maxCashUsd: 10000,
    visaInfo: 'Cambodian passport: visa required — apply via a registered travel agency.',
    maxStayDays: 15,
    notes: [
      'Cash over ¥1,000,000 must be declared',
      'Complete Visit Japan Web before landing for faster entry',
      'Some common medications (e.g. pseudoephedrine) are banned',
    ],
  },
  {
    countrySlug: 'singapore',
    maxCashUsd: 14500,
    visaInfo: 'Cambodian passport: visa-free entry up to 30 days.',
    maxStayDays: 30,
    notes: [
      'Submit the SG Arrival Card online within 3 days before arrival',
      'Chewing gum and e-cigarettes are prohibited',
      'Cash over SGD 20,000 must be declared',
    ],
  },
  {
    countrySlug: 'south-korea',
    maxCashUsd: 10000,
    visaInfo: 'Cambodian passport: visa required — apply K-ETA or embassy visa.',
    maxStayDays: 30,
    notes: [
      'Cash over $10,000 USD must be declared',
      'Complete the Q-code health form if required',
    ],
  },
  {
    countrySlug: 'malaysia',
    maxCashUsd: 10000,
    visaInfo: 'Cambodian passport: visa-free entry up to 30 days.',
    maxStayDays: 30,
    notes: [
      'Complete the Malaysia Digital Arrival Card (MDAC) 3 days before travel',
      'Cash over $10,000 USD must be declared',
    ],
  },
];

export function getCustomsRule(slug: string): CustomsRule | undefined {
  return customsRules.find((c) => c.countrySlug === slug);
}
