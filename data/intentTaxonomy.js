/**
 * intentTaxonomy — the full question surface of the Domner app.
 *
 * Grounded in what the app actually does, read from the repo:
 *   20 destinations, 3 plan tiers (basic/standard/premium), per-country base
 *   pricing, flight tracking, airport guides, customs rules, scam alerts,
 *   trip checklist, Stripe card + KHQR / ABA PayWay payments, Telegram support.
 *   Payment methods are read from DOMNER_FACTS.paymentMethods at answer time —
 *   there is no Wing integration in the app, so do not describe one here.
 *
 * COUNTRIES ARE NOT INTENTS. "how much for japan" and "how much for thailand"
 * are the same intent (esim_price) with different entities — detectCountry()
 * already handles that. Adding a country intent per destination would give you
 * 60 near-identical classes that the model cannot separate.
 *
 * `grounded` marks intents whose answer MUST be computed from app data rather
 * than written by hand. Never let a model author these answers.
 */

export const TAXONOMY = {
  /* ---- conversation ---- */
  greeting: { desc: 'Saying hello or opening the conversation, nothing asked yet.' },
  thanks: { desc: 'Expressing thanks or closing the conversation.' },
  identity: { desc: 'Asking what the assistant is, whether it is a bot or a human.' },
  capabilities: { desc: 'Asking what the assistant can help with.' },

  /* ---- eSIM: buying ---- */
  esim_price: { desc: 'How much an eSIM costs, for a country or in general.', grounded: true },
  esim_plan_compare: { desc: 'Difference between Basic, Standard and Premium tiers.', grounded: true },
  esim_data_amount: { desc: 'How much data a plan includes, daily allowance, whether it is enough.', grounded: true },
  esim_validity: { desc: 'How many days a plan lasts, when validity starts.', grounded: true },
  esim_coverage: { desc: 'Which countries are available, whether a specific country is covered.', grounded: true },
  esim_multi_country: { desc: 'Using one eSIM across several countries on a single trip.', grounded: true },
  esim_network: { desc: 'Which carrier or network the eSIM uses, 4G versus 5G speed.', grounded: true },
  esim_buy_when: { desc: 'How far in advance to buy, whether to buy before flying or on arrival.' },

  /* ---- eSIM: technical ---- */
  esim_setup: { desc: 'Installing, activating, scanning the QR code.' },
  esim_compatibility: { desc: 'Whether a specific phone or device supports eSIM.' },
  esim_not_working: { desc: 'Installed but no data, no signal, cannot connect.' },
  esim_qr_lost: { desc: 'Lost, missing, or never received the QR code or confirmation email.' },
  esim_topup: { desc: 'Adding more data or extending an existing plan.' },
  esim_remove: { desc: 'Deleting an eSIM, reusing a slot, whether removal is reversible.' },
  esim_keep_number: { desc: 'Whether the home number, calls and SMS still work alongside the eSIM.' },
  esim_hotspot: { desc: 'Tethering, sharing the connection with another device.' },
  esim_calls_sms: { desc: 'Whether the plan supports voice calls and text, or is data-only.' },
  esim_two_phones: { desc: 'Using one plan on two devices, or transferring it to another phone.' },

  /* ---- destination and border ---- */
  china_vpn: { desc: 'Internet restrictions in China, blocked apps, whether a VPN is needed.' },
  visa: { desc: 'Visa requirements, visa on arrival, e-visa for a destination.', grounded: true },
  customs: { desc: 'Customs rules, cash declaration limits, restricted or prohibited items.', grounded: true },
  currency: { desc: 'Local currency, exchange rates, whether USD is accepted, where to change money.', grounded: true },
  safety_scams: { desc: 'Common scams, tourist traps, staying safe at a destination.', grounded: true },
  local_transport: { desc: 'Getting around at the destination — taxis, rideshare, trains, tuk-tuks.' },
  best_time: { desc: 'Best season to visit, weather, rainy season timing.' },
  power_plug: { desc: 'Plug type, voltage, whether an adapter is needed.' },

  /* ---- flights ---- */
  flight_track: { desc: 'Tracking a specific flight, current position, live status.' },
  flight_delay: { desc: 'Whether a flight is delayed or on time, how late it is running.' },
  flight_alerts: { desc: 'Setting up notifications for a flight, how alerts are delivered.' },
  flight_share: { desc: 'Sharing a flight link so someone else can follow the trip.' },
  flight_missed: { desc: 'Missed a flight or connection, what to do next.' },
  flight_baggage: { desc: 'Baggage allowance, carry-on rules, liquid limits, excess fees.' },
  flight_booking: { desc: 'Whether Domner sells flights, how to book, where to buy tickets.' },

  /* ---- airports ---- */
  airport_guide: { desc: 'Navigating a specific airport, terminals, layout, facilities.' },
  airport_arrival_time: { desc: 'How early to arrive before departure, how long security takes.' },
  airport_transfer: { desc: 'Getting to or from the airport, transport options and cost.' },
  airport_wifi: { desc: 'Airport wifi, how to connect, whether it is free.' },
  airport_lounge: { desc: 'Lounges, access rules, cost.' },

  /* ---- trip prep ---- */
  checklist: { desc: 'What to pack, what to prepare, the trip checklist feature.' },
  documents: { desc: 'Passport validity, required documents, printed versus digital copies.' },
  travel_insurance: { desc: 'Whether insurance is needed or offered, what it covers.' },
  emergency: { desc: 'Urgent trouble — lost passport, theft, accident, police or hospital needed.', grounded: true },

  /* ---- commerce ---- */
  payment_methods: { desc: 'Which payment methods are accepted — international card, KHQR, ABA PayWay.', grounded: true },
  payment_failed: { desc: 'A payment was declined or failed, charged but nothing received.' },
  payment_currency: { desc: 'Paying in USD or riel, whether there are conversion fees.' },
  refund: { desc: 'Requesting a refund, refund policy, how long it takes.' },
  cancel_order: { desc: 'Cancelling an order or purchase.' },
  change_booking: { desc: 'Changing dates, changing the plan, swapping the destination.' },
  order_status: { desc: 'Where an order is, whether it went through, finding a receipt.' },
  invoice: { desc: 'Requesting an invoice or receipt, business or tax documentation.' },

  /* ---- account and business ---- */
  account_login: { desc: 'Signing in, password reset, account access problems.' },
  account_delete: { desc: 'Deleting an account, removing personal data.' },
  privacy: { desc: 'How personal data is handled, stored, or shared.' },
  // NOT grounded: no Pro product exists in the app — no plan, price or tier in
  // any data file. The answer states it is unavailable; it cannot be computed.
  domner_pro: { desc: 'Asking about a paid Domner Pro or premium subscription tier.' },
  affiliate: { desc: 'The affiliate or referral programme, earning commission.' },
  products: { desc: 'What Domner sells or does overall, services and features.', grounded: true },
  partnership: { desc: 'Business enquiries, becoming a partner or reseller.' },

  /* ---- escalation ---- */
  support_human: { desc: 'Wanting to reach a human agent instead of the assistant.' },
  complaint: { desc: 'Expressing frustration, a complaint about service or product.' },
  availability: { desc: 'Support hours, response time, whether anyone is available now.' },
};

export const INTENT_IDS = Object.keys(TAXONOMY);
export const GROUNDED_IDS = INTENT_IDS.filter((id) => TAXONOMY[id].grounded);
