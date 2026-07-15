// Domer Trip Copilot — product + policy knowledge base and a free FAQ layer.
//
// Two things live here:
//   1. KNOWLEDGE_BASE — injected into the Copilot system prompt so the AI
//      answers as *our* agent, grounded in Domer's real products and policies
//      instead of generic travel trivia.
//   2. matchFaq() — a zero-cost canned-answer layer. Common questions are
//      matched by keyword and answered instantly in Khmer or English, so they
//      never hit the paid AI model. Anything it doesn't match falls through to
//      Claude (Haiku). This is the "smart hybrid": free FAQ for the top
//      questions, cheap AI for the long tail.

// Keep this in sync with data/esimPlans.ts and data/destinations.ts.
export const KNOWLEDGE_BASE = `
DOMER — product & policy facts (answer from these; do not invent specifics):

eSIM store:
- 20 destinations across Asia. Popular: Vietnam, Thailand, China, Japan, Singapore, South Korea, Malaysia.
- Three plan tiers per destination: Basic (3 days, 1GB/day), Standard (7 days, 2GB/day, most popular), Premium (15 days, 3GB/day).
- Prices start from about $3.99 (Vietnam Basic). Each destination has its own base price; higher tiers cost more.
- Every plan includes: hotspot/tethering, instant QR delivery, and 24/7 Khmer support. China plans need no VPN.
- Networks are local carriers (e.g. Vietnam: MobiFone/Viettel; Japan: NTT Docomo/SoftBank). Most are 4G LTE; some 4G/5G or 5G.

eSIM setup & usage:
- The eSIM QR code is emailed after purchase, normally within 15 minutes.
- Install the eSIM BEFORE you fly (needs internet/Wi-Fi to install), but only switch it ON after you land at your destination.
- eSIM requires an eSIM-capable phone (most iPhone XS and newer, Pixel 3 and newer, recent Samsung Galaxy S/Note/Z). Older or dual-SIM-locked phones may not support it.
- Install: Settings → Mobile/Cellular → Add eSIM / Add data plan → scan the QR code from the Domer email.

Payments:
- Two methods: international cards via Stripe, and KHQR / ABA PayWay for local Cambodian payment.
- Prices are in USD.

Support:
- 24/7 Khmer support. Travelers can reply to the order confirmation email or message Domer on Telegram.

Scope of this assistant:
- Can help with: airport procedures, eSIM/data setup, packing checklists, emergency phrases, currency, general flight questions.
- CANNOT book, cancel, modify, or refund tickets or eSIM orders — direct those to Domer support (email/Telegram).
- Never invent specific gate numbers, delay minutes, or flight statuses. Tell the traveler to check the live flight tracker in the app.

General travel guidance:
- Arrive at the airport at least 2 hours before a domestic flight, 3 hours before an international flight.
`.trim();

interface FaqAnswer {
  km: string;
  en: string;
}

interface FaqEntry {
  // Matched case-insensitively against the user's message. Include both
  // English keywords and Khmer keywords so either language triggers the entry.
  keywords: string[];
  answer: FaqAnswer;
}

// Ordered by specificity — the first entry whose keywords match wins, so put
// more specific topics before broad ones.
const FAQ: FaqEntry[] = [
  {
    keywords: ['refund', 'cancel', 'money back', 'សំណង', 'បង្វិលប្រាក់', 'លុបចោល'],
    answer: {
      km: 'ខ្ញុំមិនអាចធ្វើការសងប្រាក់ ឬលុបចោលការបញ្ជាទិញដោយផ្ទាល់បានទេ។ សូមទាក់ទងក្រុមជំនួយ Domer ដោយឆ្លើយតបទៅអ៊ីមែលបញ្ជាក់ការបញ្ជាទិញ ឬផ្ញើសារមក Telegram — ក្រុមការងារនឹងជួយអ្នក ២៤/៧។',
      en: "I can't process refunds or cancel orders myself. Please contact Domer support — reply to your order confirmation email or message us on Telegram, and the team will help you 24/7.",
    },
  },
  {
    keywords: ['when turn on', 'turn on', 'activate', 'when to use', 'switch on', 'បើក eSIM', 'ពេលណាបើក', 'ដំណើរការ'],
    answer: {
      km: 'ដំឡើង eSIM មុនពេលអ្នកហោះហើរ (ត្រូវការ Wi-Fi ដើម្បីដំឡើង) ប៉ុន្តែបើកវាតែនៅពេលអ្នកចុះចតដល់គោលដៅប៉ុណ្ណោះ។ ដូច្នេះអ្នកនឹងមិនខ្ជះខ្ជាយទិន្នន័យទេ។',
      en: 'Install your eSIM before you fly (you need Wi-Fi to install it), but only switch it ON after you land at your destination — that way you don\'t waste any data.',
    },
  },
  {
    keywords: ['install', 'setup', 'how to add', 'scan qr', 'ដំឡើង', 'របៀបដំឡើង', 'scan'],
    answer: {
      km: 'ដើម្បីដំឡើង eSIM៖ ចូល Settings → Mobile/Cellular → Add eSIM / Add data plan → ស្កេនកូដ QR ពីអ៊ីមែល Domer របស់អ្នក។ សូមធ្វើវានៅពេលមាន Wi-Fi មុនពេលហោះហើរ។',
      en: 'To install your eSIM: Settings → Mobile/Cellular → Add eSIM / Add data plan → scan the QR code from your Domer email. Do this on Wi-Fi before you fly.',
    },
  },
  {
    keywords: ['qr code', 'where is my', "didn't get", 'not received', 'how long', 'when receive', 'កូដ QR', 'មិនបានទទួល', 'ទទួលបាន'],
    answer: {
      km: 'កូដ QR eSIM របស់អ្នកត្រូវបានផ្ញើទៅអ៊ីមែលជាធម្មតាក្នុងរយៈពេល ១៥ នាទីបន្ទាប់ពីទូទាត់។ សូមពិនិត្យប្រអប់ Spam ផងដែរ។ បើមិនទាន់ទទួល សូមផ្ញើសារមក Telegram។',
      en: 'Your eSIM QR code is emailed within about 15 minutes of payment. Check your spam folder too. If it still hasn\'t arrived, message us on Telegram and we\'ll sort it out.',
    },
  },
  {
    keywords: ['which phone', 'compatible', 'support esim', 'my phone', 'device', 'ទូរស័ព្ទ', 'ស៊ីមអេ', 'គាំទ្រ'],
    answer: {
      km: 'eSIM ដំណើរការលើទូរស័ព្ទដែលគាំទ្រ eSIM — iPhone XS ឡើងទៅ, Google Pixel 3 ឡើងទៅ, និង Samsung Galaxy S/Note/Z ជំនាន់ថ្មីៗ។ ទូរស័ព្ទចាស់ៗ អាចនឹងមិនគាំទ្រទេ។',
      en: 'eSIM works on eSIM-capable phones — iPhone XS and newer, Google Pixel 3 and newer, and recent Samsung Galaxy S/Note/Z models. Older phones may not support it.',
    },
  },
  {
    keywords: ['pay', 'payment', 'aba', 'khqr', 'card', 'stripe', 'ទូទាត់', 'បង់ប្រាក់', 'អេប៊ីអេ'],
    answer: {
      km: 'អ្នកអាចទូទាត់តាមកាតអន្តរជាតិ (Stripe) ឬតាម KHQR / ABA PayWay សម្រាប់ការទូទាត់ក្នុងស្រុក។ តម្លៃគិតជាដុល្លារ (USD)។',
      en: 'You can pay by international card (Stripe) or with KHQR / ABA PayWay for local Cambodian payment. Prices are in USD.',
    },
  },
  {
    keywords: ['vpn', 'china', ' China', 'ចិន', 'វីភីអិន'],
    answer: {
      km: 'ជាមួយ eSIM របស់ Domer សម្រាប់ចិន អ្នកមិនត្រូវការ VPN ទេ — អ្នកអាចប្រើ Google, WhatsApp និងកម្មវិធីធម្មតាបានតាមធម្មតា។',
      en: "With Domer's China eSIM you don't need a VPN — you can use Google, WhatsApp, and your usual apps normally.",
    },
  },
  {
    keywords: ['how much', 'price', 'cost', 'cheapest', 'តម្លៃ', 'ថ្លៃ', 'ប៉ុន្មាន'],
    answer: {
      km: 'តម្លៃ eSIM ចាប់ផ្តើមពីប្រហែល $3.99។ គ្រប់គោលដៅមានគម្រោង ៣ កម្រិត៖ Basic (៣ថ្ងៃ, 1GB/ថ្ងៃ), Standard (៧ថ្ងៃ, 2GB/ថ្ងៃ), Premium (១៥ថ្ងៃ, 3GB/ថ្ងៃ)។ សូមមើលក្នុងហាង eSIM សម្រាប់តម្លៃពិតប្រាកដតាមប្រទេស។',
      en: 'eSIM prices start from about $3.99. Every destination has 3 tiers: Basic (3 days, 1GB/day), Standard (7 days, 2GB/day), and Premium (15 days, 3GB/day). Check the eSIM store for the exact price per country.',
    },
  },
  {
    keywords: ['what time', 'how early', 'arrive airport', 'before flight', 'ម៉ោង', 'មុនពេលហោះ', 'អាកាសយានដ្ឋាន'],
    answer: {
      km: 'សូមទៅដល់អាកាសយានដ្ឋានយ៉ាងហោចណាស់ ២ ម៉ោងមុនជើងហោះហើរក្នុងស្រុក ឬ ៣ ម៉ោងសម្រាប់ជើងហោះហើរអន្តរជាតិ។',
      en: 'Arrive at the airport at least 2 hours before a domestic flight, or 3 hours before an international flight.',
    },
  },
  {
    keywords: ['contact', 'support', 'help me', 'talk to', 'telegram', 'ជំនួយ', 'ទាក់ទង', 'តេលេក្រាម'],
    answer: {
      km: 'ក្រុមជំនួយ Domer មាន ២៤/៧ ជាភាសាខ្មែរ។ អ្នកអាចឆ្លើយតបទៅអ៊ីមែលបញ្ជាក់ការបញ្ជាទិញ ឬផ្ញើសារមក Telegram។',
      en: 'Domer offers 24/7 Khmer support. You can reply to your order confirmation email or message us on Telegram.',
    },
  },
];

/**
 * Detects whether the text contains Khmer characters, to pick the reply language.
 */
export function isKhmer(text: string): boolean {
  return /[ក-៿]/.test(text);
}

/**
 * Returns a free canned answer for common questions, or null if the question
 * should fall through to the AI model. Matching is a simple case-insensitive
 * keyword scan — deliberately conservative so we only deflect clear-cut FAQs
 * and let anything nuanced reach Claude.
 */
export function matchFaq(userText: string): string | null {
  const text = userText.toLowerCase().trim();
  if (!text) return null;

  for (const entry of FAQ) {
    if (entry.keywords.some((kw) => text.includes(kw.toLowerCase()))) {
      return isKhmer(userText) ? entry.answer.km : entry.answer.en;
    }
  }
  return null;
}
