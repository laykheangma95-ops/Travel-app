/**
 * train-intent — fits the intent classifier and writes data/intentModel.json
 *
 *   node scripts/train-intent.mjs data/intents.jsonl
 *
 * Input is JSONL, one example per line: {"intent":"esim_setup","text":"..."}
 * Output is a quantised weight matrix small enough to commit to the repo.
 *
 * Multinomial logistic regression, trained with mini-batch SGD. No
 * dependencies — this is a few hundred lines of arithmetic, and keeping it
 * dependency-free means the training step can never break the app build.
 */

import fs from 'node:fs';
import path from 'node:path';
import { featurise, DIM } from '../lib/intentFeatures.js';

const EPOCHS = 300;
const LR = 2.0;
const L2 = 1e-5;
const BATCH = 16;
const TEST_FRACTION = 0.2;
const SEED = 42;

/* deterministic RNG so runs are reproducible and diffs are meaningful */
let seed = SEED;
const rand = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};
const shuffle = (arr) => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

/* ---------- load ---------- */
const inputPath = process.argv[2] || 'data/intents.jsonl';
const rows = fs
  .readFileSync(inputPath, 'utf8')
  .split('\n')
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l));

const labels = [...new Set(rows.map((r) => r.intent))].sort();
const labelIndex = new Map(labels.map((l, i) => [l, i]));
const K = labels.length;

console.log(`${rows.length} examples, ${K} intents\n`);

/* ---------- stratified split ---------- */
const byLabel = new Map(labels.map((l) => [l, []]));
for (const r of rows) byLabel.get(r.intent).push(r);

const train = [];
const test = [];
for (const [label, items] of byLabel) {
  shuffle(items);
  const nTest = Math.max(1, Math.round(items.length * TEST_FRACTION));
  test.push(...items.slice(0, nTest));
  train.push(...items.slice(nTest));
  if (items.length < 8) {
    console.warn(`  warning: "${label}" has only ${items.length} examples`);
  }
}
console.log(`train ${train.length} / test ${test.length}\n`);

/* ---------- featurise once ---------- */
const prep = (set) =>
  set.map((r) => ({ x: featurise(r.text), y: labelIndex.get(r.intent), text: r.text }));
const trainX = prep(train);
const testX = prep(test);

/* ---------- model ---------- */
const W = new Float32Array(K * DIM);
const b = new Float32Array(K);

function scores(x, out) {
  for (let k = 0; k < K; k++) {
    let s = b[k];
    const off = k * DIM;
    for (let i = 0; i < DIM; i++) {
      const xi = x[i];
      if (xi !== 0) s += W[off + i] * xi;
    }
    out[k] = s;
  }
  return out;
}

function softmax(s) {
  let max = -Infinity;
  for (let k = 0; k < K; k++) if (s[k] > max) max = s[k];
  let sum = 0;
  for (let k = 0; k < K; k++) {
    s[k] = Math.exp(s[k] - max);
    sum += s[k];
  }
  for (let k = 0; k < K; k++) s[k] /= sum;
  return s;
}

/* ---------- train ---------- */
const buf = new Float32Array(K);
for (let epoch = 0; epoch < EPOCHS; epoch++) {
  shuffle(trainX);
  const lr = LR * (1 - epoch / EPOCHS); // linear decay
  let loss = 0;

  for (let start = 0; start < trainX.length; start += BATCH) {
    const batch = trainX.slice(start, start + BATCH);
    const gradW = new Float32Array(K * DIM);
    const gradB = new Float32Array(K);

    for (const { x, y } of batch) {
      const p = softmax(scores(x, buf));
      loss += -Math.log(Math.max(p[y], 1e-12));
      for (let k = 0; k < K; k++) {
        const err = p[k] - (k === y ? 1 : 0);
        if (err === 0) continue;
        const off = k * DIM;
        for (let i = 0; i < DIM; i++) {
          const xi = x[i];
          if (xi !== 0) gradW[off + i] += err * xi;
        }
        gradB[k] += err;
      }
    }

    const scale = lr / batch.length;
    for (let j = 0; j < W.length; j++) W[j] -= scale * gradW[j] + lr * L2 * W[j];
    for (let k = 0; k < K; k++) b[k] -= scale * gradB[k];
  }

  if (epoch % 15 === 0 || epoch === EPOCHS - 1) {
    console.log(`  epoch ${String(epoch).padStart(2)}  loss ${(loss / trainX.length).toFixed(4)}`);
  }
}

/* ---------- evaluate ---------- */
function predict(x) {
  const p = softmax(scores(x, new Float32Array(K)));
  let best = 0;
  for (let k = 1; k < K; k++) if (p[k] > p[best]) best = k;
  return { label: best, confidence: p[best] };
}

let correct = 0;
const perClass = labels.map(() => ({ tp: 0, fp: 0, fn: 0 }));
const confidences = [];

for (const { x, y, text } of testX) {
  const { label, confidence } = predict(x);
  confidences.push({ correct: label === y, confidence, text, expected: labels[y], got: labels[label] });
  if (label === y) {
    correct++;
    perClass[y].tp++;
  } else {
    perClass[label].fp++;
    perClass[y].fn++;
  }
}

const accuracy = correct / testX.length;
console.log(`\naccuracy  ${(accuracy * 100).toFixed(1)}%  (${correct}/${testX.length})\n`);

console.log('per intent:');
labels.forEach((l, k) => {
  const { tp, fp, fn } = perClass[k];
  const prec = tp + fp ? tp / (tp + fp) : 0;
  const rec = tp + fn ? tp / (tp + fn) : 0;
  const f1 = prec + rec ? (2 * prec * rec) / (prec + rec) : 0;
  console.log(
    `  ${l.padEnd(20)} P ${(prec * 100).toFixed(0).padStart(3)}%  R ${(rec * 100)
      .toFixed(0)
      .padStart(3)}%  F1 ${f1.toFixed(2)}`
  );
});

/* ---------- calibrate the accept threshold ----------
   We want a threshold where predictions we ACCEPT are right ~90% of the time.
   Everything below it falls through to the keyword engine, so a miss here is
   cheap — it degrades to today's behaviour rather than answering wrongly. */
let threshold = 0.5;
for (let t = 0.95; t >= 0.2; t -= 0.05) {
  const accepted = confidences.filter((c) => c.confidence >= t);
  if (accepted.length < 3) continue;
  const precision = accepted.filter((c) => c.correct).length / accepted.length;
  if (precision >= 0.9) {
    threshold = Number(t.toFixed(2));
    console.log(
      `\nthreshold ${threshold} → ${(precision * 100).toFixed(0)}% precision on ` +
        `${((accepted.length / confidences.length) * 100).toFixed(0)}% of traffic`
    );
    break;
  }
}

const misses = confidences.filter((c) => !c.correct).slice(0, 5);
if (misses.length) {
  console.log('\nsample errors:');
  for (const m of misses) {
    console.log(`  "${m.text.slice(0, 48)}"  ${m.expected} → ${m.got} (${m.confidence.toFixed(2)})`);
  }
}

/* ---------- quantise + save ----------
   int8 per class with a per-class scale. Cuts the file ~4x against float32
   with no measurable accuracy cost at this model size. */
const q = new Int8Array(K * DIM);
const scales = new Float32Array(K);
for (let k = 0; k < K; k++) {
  const off = k * DIM;
  let max = 0;
  for (let i = 0; i < DIM; i++) max = Math.max(max, Math.abs(W[off + i]));
  const scale = max / 127 || 1;
  scales[k] = scale;
  for (let i = 0; i < DIM; i++) q[off + i] = Math.round(W[off + i] / scale);
}

const model = {
  version: 1,
  createdAt: new Date().toISOString(),
  dim: DIM,
  labels,
  threshold,
  accuracy: Number(accuracy.toFixed(3)),
  trainedOn: rows.length,
  scales: Array.from(scales),
  bias: Array.from(b),
  weights: Buffer.from(q.buffer).toString('base64'),
};

const outPath = path.join('data', 'intentModel.json');
fs.mkdirSync('data', { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(model));
const kb = (fs.statSync(outPath).size / 1024).toFixed(0);
console.log(`\nwrote ${outPath} — ${kb} KB`);
