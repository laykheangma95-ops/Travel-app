/**
 * generate-questions — builds the training corpus at volume.
 *
 *   ANTHROPIC_API_KEY=sk-... node scripts/generate-questions.mjs [perIntent]
 *
 * Generates QUESTIONS ONLY. Answers are never generated — they are computed
 * from your own data by domnerEngine, which is the only reason the copilot
 * can be trusted about prices and policies.
 *
 * This is a ONE-TIME OFFLINE step. The live app never calls an external model:
 * it loads data/intentModel.json and does local arithmetic. Nothing here ships.
 *
 * Defaults to 150 per intent across ~60 intents, so roughly 9,000 examples.
 * Past ~150 the model starts repeating itself; the near-duplicate filter will
 * show you when you have hit that ceiling.
 *
 * Resumable: re-running skips intents that already have enough examples.
 */

import fs from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { TAXONOMY, INTENT_IDS } from '../data/intentTaxonomy.js';

/* The app already depends on @anthropic-ai/sdk, so use it rather than raw
   fetch: it retries 429s and 5xx with exponential backoff on its own, and
   surfaces typed errors instead of a bare status code. */
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Set ANTHROPIC_API_KEY first.');
  process.exit(1);
}
const anthropic = new Anthropic();

/* Sonnet rather than Opus: this is a bulk job of ~9,000 short questions where
   the task is phrasing variety, not reasoning. Switch to 'claude-opus-5' if
   the generated phrasings come out bland. */
const MODEL = 'claude-sonnet-5';
const MAX_TOKENS = 8000;

const PER_INTENT = Number(process.argv[2] || 150);
const BATCH = 50;
const OUT = 'data/intents.jsonl';
const CONCURRENCY = 4;

/* ---------- app facts, read from the data files ----------
   These used to be hardcoded in the prompt, which let them drift from the app:
   the "Wing" payment method described there does not exist in this codebase,
   and the country list would go stale silently whenever destinations.ts
   changed. Reading them means generated questions describe the real product. */
function readAppFacts() {
  const grab = (file) => fs.readFileSync(file, 'utf8');

  const countries = [
    ...grab('data/destinations.ts').matchAll(/^\s{4}slug: '[^']+', name: '([^']+)'/gm),
  ].map((m) => m[1]);

  const tiers = [
    ...grab('data/esimPlans.ts').matchAll(/name: '([^']+)', durationDays: (\d+)/g),
  ].map((m) => `${m[1]} ${m[2]} days`);

  // DOMNER_FACTS.paymentMethods — the single source of truth for how people pay.
  const payBlock = grab('lib/domnerBrain.ts').match(/paymentMethods: \[([^\]]+)\]/);
  const payments = payBlock ? [...payBlock[1].matchAll(/'([^']+)'/g)].map((m) => m[1]) : [];

  if (!countries.length || !tiers.length || !payments.length) {
    throw new Error(
      `could not read app facts (countries=${countries.length} tiers=${tiers.length} ` +
        `payments=${payments.length}) — the data files moved or changed shape. Fix ` +
        'readAppFacts() rather than generating questions from stale facts.',
    );
  }
  return { countries, tiers, payments };
}

const FACTS = readAppFacts();
console.log(
  `app facts: ${FACTS.countries.length} countries, ${FACTS.tiers.length} tiers, ` +
    `payments: ${FACTS.payments.join(' / ')}\n`,
);

/* ---------- load what already exists ---------- */
const seen = new Set();
const countByIntent = new Map(INTENT_IDS.map((id) => [id, 0]));

if (fs.existsSync(OUT)) {
  for (const line of fs.readFileSync(OUT, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    seen.add(norm(row.text));
    countByIntent.set(row.intent, (countByIntent.get(row.intent) || 0) + 1);
  }
  console.log(`${seen.size} existing examples preserved\n`);
}

function norm(s) {
  return String(s).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

/* Near-duplicate check: trigram Jaccard against recent additions for the same
   intent. Exact-match dedup alone lets through "how much is esim" and
   "how much is the esim", which teach the model nothing. */
function trigrams(s) {
  const t = norm(s);
  const out = new Set();
  for (let i = 0; i + 3 <= t.length; i++) out.add(t.slice(i, i + 3));
  return out;
}
function tooSimilar(text, pool) {
  const a = trigrams(text);
  if (a.size === 0) return true;
  for (const b of pool) {
    let inter = 0;
    for (const g of a) if (b.has(g)) inter++;
    const union = a.size + b.size - inter;
    if (union > 0 && inter / union > 0.5) return true;
  }
  return false;
}

/* ---------- generation ---------- */
async function generate(intentId, n, avoid) {
  const desc = TAXONOMY[intentId].desc;
  const others = INTENT_IDS.filter((id) => id !== intentId)
    .map((id) => `- ${id}: ${TAXONOMY[id].desc}`)
    .join('\n');

  const avoidBlock = avoid.length
    ? `\nAlready collected — write DIFFERENT phrasings, not variations of these:\n${avoid
        .slice(-25)
        .map((t) => '- ' + t)
        .join('\n')}\n`
    : '';

  const prompt = `You are building training data for a customer-support intent classifier for Domner, a Cambodian travel app. It sells eSIM data plans for ${FACTS.countries.length} countries in ${FACTS.tiers.length} tiers (${FACTS.tiers.join(', ')}), tracks flights, and provides airport guides, customs rules, scam alerts and a trip checklist. Payments are ${FACTS.payments.join(' and ')}. Support is via Telegram.

Write ${n} DIFFERENT ways a real customer might express this ONE intent:
"${intentId}" — ${desc}
${avoidBlock}
These are the OTHER intents. Nothing you write may plausibly belong to any of them:
${others}

Requirements:
- About 60% English, 40% Khmer script. Write natural Khmer, not transliteration.
- Vary register: terse ("no data"), polite, panicked, rambling, broken English.
- Include realistic typos, missing punctuation, lowercase. Real customers type badly.
- Vary length from 2 words to a full sentence.
- Where natural, mention real countries from the list: ${FACTS.countries.join(', ')}.
- Write QUESTIONS AND STATEMENTS A CUSTOMER WOULD SEND. Never write answers.

Return ONLY a JSON array of strings.`;

  /* The SDK retries 429 and 5xx internally with exponential backoff, so there
     is no retry loop here. The previous version recursed on 429 with no depth
     limit, which could spin forever against a persistently throttled key. */
  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = message.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  const s = text.indexOf('[');
  const e = text.lastIndexOf(']');
  if (s === -1 || e === -1) {
    throw new Error(
      message.stop_reason === 'max_tokens'
        ? `no JSON array — hit max_tokens (${MAX_TOKENS}); lower BATCH or raise MAX_TOKENS`
        : `no JSON array (stop_reason=${message.stop_reason})`,
    );
  }
  return JSON.parse(text.slice(s, e + 1));
}

/* ---------- worker ---------- */
const out = fs.createWriteStream(OUT, { flags: 'a' });
const report = [];

async function fill(intentId) {
  const have = countByIntent.get(intentId) || 0;
  if (have >= PER_INTENT) {
    report.push({ intentId, added: 0, total: have, skipped: true });
    return;
  }

  const pool = [];
  const kept = [];
  let added = 0;
  let rejected = 0;
  let rounds = 0;

  while (added + have < PER_INTENT && rounds < 6) {
    rounds++;
    let batch;
    try {
      batch = await generate(intentId, BATCH, kept);
    } catch (err) {
      report.push({ intentId, added, total: have + added, error: err.message });
      break;
    }

    for (const raw of batch) {
      const text = String(raw).trim();
      if (!text || text.length > 200) continue;
      const key = norm(text);
      if (!key || seen.has(key)) {
        rejected++;
        continue;
      }
      if (tooSimilar(text, pool)) {
        rejected++;
        continue;
      }
      seen.add(key);
      pool.push(trigrams(text));
      kept.push(text);
      out.write(JSON.stringify({ intent: intentId, text }) + '\n');
      added++;
      if (added + have >= PER_INTENT) break;
    }

    // Saturated: the model is repeating itself, more rounds will not help.
    if (rejected > BATCH * 1.5 && added < PER_INTENT * 0.5) break;
  }

  countByIntent.set(intentId, have + added);
  report.push({ intentId, added, total: have + added, rejected });
}

/* simple concurrency pool */
const queue = [...INTENT_IDS];
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      const id = queue.shift();
      await fill(id);
      const r = report[report.length - 1];
      const tag = r.error ? `ERROR ${r.error}` : r.skipped ? 'already full' : `+${r.added}`;
      console.log(`${id.padEnd(24)} ${String(r.total).padStart(4)}  ${tag}`);
    }
  }),
);

out.end();

/* ---------- balance report ---------- */
const totals = [...countByIntent.values()];
const total = totals.reduce((a, b) => a + b, 0);
const min = Math.min(...totals);
const max = Math.max(...totals);

console.log(`\n${total} examples across ${INTENT_IDS.length} intents`);
console.log(`min ${min}, max ${max} per intent`);

const thin = [...countByIntent].filter(([, n]) => n < PER_INTENT * 0.6);
if (thin.length) {
  console.log(`\nthin intents — the model struggled to find distinct phrasings:`);
  for (const [id, n] of thin) console.log(`  ${id.padEnd(24)} ${n}`);
  console.log(`These usually overlap another intent. Sharpen the descriptions in`);
  console.log(`data/intentTaxonomy.js, or merge them, then re-run.`);
}

if (max > min * 3) {
  console.log(`\nImbalance is over 3x. Class weighting or capping the large intents`);
  console.log(`will help — otherwise the model biases toward whichever intent is largest.`);
}

console.log(`\nNext:\n  node scripts/train-intent.mjs`);
