/**
 * intent-gap — reconciles data/intentTaxonomy.js against the intents
 * lib/domnerEngine.ts actually answers.
 *
 *   npm run intents:gap
 *
 * The MAP below is a hand-made judgement call per taxonomy id, not something
 * derived automatically — an id matching by name does not mean the engine
 * really answers that question. Re-check MAP whenever either side changes;
 * the script fails loudly if a taxonomy id is left unmapped.
 *
 *   EXACT    same id present in the engine's INTENTS array
 *   COVERED  engine answers it, under a different or broader id
 *   PARTIAL  an engine answer mentions it in passing; not a real answer
 *   NONE     nothing in the engine answers this
 */
import { INTENT_IDS, GROUNDED_IDS } from '../data/intentTaxonomy.js';
import fs from 'node:fs';

// engine intent ids, scraped from the INTENTS array
const src = fs.readFileSync('lib/domnerEngine.ts', 'utf8');
const body = src.slice(src.indexOf('const INTENTS'), src.indexOf('const PRICE_KEYWORDS'));
const ENGINE = [...body.matchAll(/^\s{4}id: '([^']+)'/gm)].map(m => m[1]);

// engine answers that exist OUTSIDE the INTENTS array (special-cased in generateReply)
const SPECIAL = ['<price path: countryPriceLine>', '<price path: popular list>'];

// mapping: taxonomy id -> [status, engine source]
//   EXACT   same id present in engine INTENTS
//   COVERED engine answers it, under a different or broader id
//   PARTIAL an engine answer mentions it in passing; not a real answer
//   NONE    nothing in the engine answers this
const MAP = {
  greeting:['EXACT','greeting'], thanks:['EXACT','thanks'],
  identity:['PARTIAL','greeting (names itself, no dedicated answer)'],
  capabilities:['COVERED','products ("what can you do" is in its keywords)'],

  esim_price:['COVERED','price path: countryPriceLine + popular list'],
  esim_plan_compare:['PARTIAL','countryPriceLine lists 3 tiers, only when a country is named'],
  esim_data_amount:['PARTIAL','countryPriceLine ("1GB/day")'],
  esim_validity:['PARTIAL','countryPriceLine ("3 days")'],
  esim_coverage:['PARTIAL','popular list names 5 of 20; no "is X covered" answer'],
  esim_multi_country:['NONE',''],
  esim_network:['PARTIAL','countryPriceLine (dest.networkTech)'],
  esim_buy_when:['PARTIAL','esim_setup ("install before you fly")'],

  esim_setup:['EXACT','esim_setup'], esim_compatibility:['EXACT','esim_compatibility'],
  esim_not_working:['NONE',''], esim_qr_lost:['NONE',''], esim_topup:['NONE',''],
  esim_remove:['NONE',''], esim_keep_number:['NONE',''],
  esim_hotspot:['PARTIAL','esim_setup tail ("includes hotspot")'],
  esim_calls_sms:['NONE',''], esim_two_phones:['NONE',''],

  china_vpn:['EXACT','china_vpn'],
  visa:['NONE','data exists: customsRules.visaInfo (7 of 20 countries)'],
  customs:['NONE','data exists: customsRules (7 of 20 countries)'],
  currency:['NONE','data exists: destinations.currency + usdRate (all 20)'],
  safety_scams:['NONE','data exists: scamAlerts (8 countries)'],
  local_transport:['NONE',''], best_time:['NONE',''], power_plug:['NONE',''],

  flight_track:['COVERED','flight'], flight_delay:['COVERED','flight'],
  flight_alerts:['PARTIAL','flight (mentions alerts, does not explain setup)'],
  flight_share:['NONE',''], flight_missed:['NONE',''], flight_baggage:['NONE',''],
  flight_booking:['PARTIAL','refund_booking ("I can’t book")'],

  airport_guide:['COVERED','airport'],
  airport_arrival_time:['COVERED','airport (2h domestic / 3h international)'],
  airport_transfer:['NONE',''], airport_wifi:['NONE',''], airport_lounge:['NONE',''],

  checklist:['EXACT','checklist'],
  documents:['PARTIAL','checklist (passport/boarding pass offline)'],
  travel_insurance:['NONE',''],
  emergency:['EXACT','emergency (answer is not data-grounded today)'],

  payment_methods:['COVERED','payment'],
  payment_failed:['NONE',''],
  payment_currency:['PARTIAL','payment ("all prices in USD")'],
  refund:['COVERED','refund_booking'], cancel_order:['COVERED','refund_booking'],
  change_booking:['COVERED','refund_booking'],
  order_status:['NONE',''], invoice:['NONE',''],

  account_login:['NONE',''], account_delete:['NONE',''], privacy:['NONE',''],
  domner_pro:['NONE','NO PRODUCT DATA EXISTS'],
  affiliate:['NONE','data exists: REFERRAL_DISCOUNT_PCT 5%, /affiliate page'],
  products:['EXACT','products'], partnership:['NONE',''],

  support_human:['COVERED','support'],
  complaint:['NONE',''],
  availability:['PARTIAL','support ("24/7 in Khmer")'],
};

const missing = INTENT_IDS.filter(id => !MAP[id]);
if (missing.length) { console.error('UNMAPPED:', missing); process.exit(1); }

const by = s => INTENT_IDS.filter(id => MAP[id][0] === s);
console.log(`taxonomy ${INTENT_IDS.length} intents | engine ${ENGINE.length} INTENTS + ${SPECIAL.length} special paths\n`);
for (const s of ['EXACT','COVERED','PARTIAL','NONE']) {
  const ids = by(s);
  console.log(`${s}  (${ids.length})`);
  for (const id of ids) {
    const g = GROUNDED_IDS.includes(id) ? ' [grounded]' : '';
    console.log(`  ${id.padEnd(22)}${g.padEnd(12)} ${MAP[id][1]}`);
  }
  console.log();
}
console.log('engine ids NOT in taxonomy:');
for (const e of ENGINE) if (!INTENT_IDS.includes(e)) console.log('  ' + e);
console.log('\nengine ids that ARE taxonomy ids:');
console.log('  ' + ENGINE.filter(e => INTENT_IDS.includes(e)).join(', '));
console.log('\ngrounded intents with no engine answer at all:');
for (const id of GROUNDED_IDS) if (MAP[id][0]==='NONE') console.log(`  ${id.padEnd(18)} ${MAP[id][1]}`);
console.log('\ngrounded intents only partially answered:');
for (const id of GROUNDED_IDS) if (MAP[id][0]==='PARTIAL') console.log(`  ${id.padEnd(18)} ${MAP[id][1]}`);
