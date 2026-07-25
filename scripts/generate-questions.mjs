/**
 * generate-questions — builds the training corpus at volume.
 *
 *   ANTHROPIC_API_KEY=sk-... node scripts/generate-questions.mjs [perIntent]
 *
 * Generates QUESTIONS ONLY. Answers are never generated — they are computed
 * from your own data by domnerEngine, which is the only reason the copilot
 * can be trusted about prices and policies.
 *
 * Defaults to 150 per intent across ~60 intents, so roughly 9,000 examples.
 * Past ~150 the model starts repeating itself; the near-duplicate filter will
 * show you when you have hit that ceiling.
 *
 * Resumable: re-running skips intents that already have enough examples.
 */

import fs from 'node:fs';
import { TAXONOMY, INTENT_IDS } from '../data/intentTaxonomy.js';

const KEY = process.env.ANTHROPIC_API_KEY;
if (!KEY) {
  console.error('Set ANTHROPIC_API_KEY first.');
  process.exit(1);
}

const PER_INTENT = Number(process.argv[2] || 150);
const BATCH = 50;
const OUT = 'data/intents.jsonl';
const CONCURRENCY = 4;

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

  const prompt = `You are building training data for a customer-support intent classifier for Domner, a Cambodian travel app. It sells eSIM data plans for 20 countries in three tiers (Basic 3 days, Standard 7 days, Premium 15 days), tracks flights, and provides airport guides, customs rules, scam alerts and a trip checklist. Payments are ABA, Wing and KHQR. Support is via Telegram.

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
- Where natural, mention real countries from the list: Vietnam, Thailand, China, Japan, Singapore, South Korea, Malaysia, Taiwan, Hong Kong, Indonesia, Australia, USA, France, UK, Germany, UAE, India, Philippines, Laos, Canada.
- Write QUESTIONS AND STATEMENTS A CUSTOMER WOULD SEND. Never write answers.

Return ONLY a JSON array of strings.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 20000));
    return generate(intentId, n, avoid);
  }

  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  const text = data.content.map((b) => b.text || '').join('');
  const s = text.indexOf('[');
  const e = text.lastIndexOf(']');
  if (s === -1 || e === -1) throw new Error('no JSON array');
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
  })
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
