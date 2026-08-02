# Wiring the classifier into `domnerEngine.ts`

The classifier runs **in front of** the keyword engine. It never replaces your
answers — it only decides which intent's answer to use. If it isn't confident,
your existing keyword scoring runs untouched, so the worst case is today's
behaviour.

## 1. Files

```
lib/intentFeatures.js      shared featuriser  (train + runtime, do not fork)
lib/intentClassifier.ts    runtime classifier
data/intentModel.json      trained weights, ~70 KB, commit this
data/intents.jsonl         training data, commit this
scripts/seed-data.mjs      writes the starter set
scripts/generate-intent-data.mjs   expands it via one-time API calls
scripts/train-intent.mjs   fits the model, prints accuracy
```

Add to `package.json`:

```json
"scripts": {
  "intents:seed":     "node scripts/seed-data.mjs",
  "intents:generate": "node scripts/generate-intent-data.mjs",
  "intents:train":    "node scripts/train-intent.mjs"
}
```

`resolveJsonModule` must be true in `tsconfig.json` for the model import.

## 2. Patch `generateReply`

In `lib/domnerEngine.ts`, add the import:

```ts
import { classify } from '@/lib/intentClassifier';
```

Then inside `generateReply`, replace the keyword scoring loop:

```ts
// ── BEFORE ───────────────────────────────────────────────
let best: Intent | null = null;
let bestScore = 0;
for (const intent of INTENTS) {
  const score = countMatches(text, intent.keywords);
  if (score > bestScore) { best = intent; bestScore = score; }
}
```

```ts
// ── AFTER ────────────────────────────────────────────────
let best: Intent | null = null;
let bestScore = 0;

// First pass: the trained classifier. It understands phrasing, so it catches
// the wordings no keyword list contains.
const predicted = classify(text);
if (predicted.confident) {
  const match = INTENTS.find((i) => i.id === predicted.intent);
  if (match) {
    best = match;
    bestScore = 99; // outranks keyword hits; a confident classification wins
  }
}

// Second pass: existing keyword scoring, unchanged. Runs when the classifier
// is unsure, and still catches anything the model has not learned yet.
if (!best) {
  for (const intent of INTENTS) {
    const score = countMatches(text, intent.keywords);
    if (score > bestScore) { best = intent; bestScore = score; }
  }
}

// Log everything the classifier was unsure about. This is the point of the
// whole exercise — it tells you what real customers say that you cannot yet
// parse, and it becomes next month's training data.
if (!predicted.confident) {
  logUnresolved(text, predicted);
}
```

Keep the country / price / eSIM signal logic exactly as it is. Those are
grounded lookups, not intent detection, and the classifier does not replace them.

## 3. The logger

Start with the cheapest thing that works. Vercel captures `console.log`, so
this costs nothing and needs no database:

```ts
function logUnresolved(text: string, predicted: ReturnType<typeof classify>) {
  console.log(JSON.stringify({
    tag: 'copilot_unresolved',
    text: text.slice(0, 200),
    guess: predicted.intent,
    confidence: Number(predicted.confidence.toFixed(3)),
    runnerUp: predicted.scores[1]?.intent,
    at: new Date().toISOString(),
  }));
}
```

Query it from your runtime logs by searching `copilot_unresolved`. Move it to a
table once the volume justifies it.

## 4. The monthly loop

1. Pull the `copilot_unresolved` lines from the last 30 days.
2. Label them — most fit an existing intent; recurring ones that don't are a
   new intent worth adding.
3. Append to `data/intents.jsonl`.
4. `npm run intents:train` — it prints accuracy and recalibrates the threshold.
5. Commit the new `intentModel.json` and deploy.

Real phrasings are worth far more than generated ones. After two or three
cycles most of your training data should come from step 1, not from the
generation script.

## 5. Before you trust it

The seed set of 222 examples trains to **59.5% held-out accuracy** — too low to
ship as a first pass, and too small to measure reliably. Run
`intents:generate` before wiring it in. Retrain, and only enable the classifier
path once `intents:train` reports accuracy you're comfortable with. Because it
is gated behind the confidence threshold, a weak model degrades to your current
keyword behaviour rather than answering wrongly — but there is no point paying
the latency for a model that rarely fires.

Watch for two failure modes in the training output:

- **An intent with low recall** — the model rarely picks it. Usually means it
  overlaps another intent. Sharpen both descriptions and regenerate.
- **Threshold pushed very high (0.9+) covering little traffic** — the model
  isn't separating classes. More data, or fewer, more distinct intents.
