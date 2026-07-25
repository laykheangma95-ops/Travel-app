# Handoff to Claude Code

## What's in here

```
lib/intentFeatures.js              featuriser — imported by BOTH training and runtime
lib/intentClassifier.ts            runtime classifier
data/intentTaxonomy.js             64 intents, 15 marked grounded
data/intents.jsonl                 222 seed examples (placeholder — regenerate)
data/intentModel.json              trained on the seed set, 59.5% accuracy — DO NOT SHIP
scripts/seed-data.mjs              writes the starter set
scripts/generate-questions.mjs     expands to ~9,600 examples (needs API key)
scripts/generate-intent-data.mjs   older 13-intent version, superseded
scripts/train-intent.mjs           fits the model, prints accuracy
INTEGRATE.md                       the patch for generateReply
concierge/                         standalone itinerary prototype, unrelated to the above
```

## Steps

1. Unzip into the repo root. Paths already match your layout (`lib/`, `data/`, `scripts/`).
2. Delete `scripts/generate-intent-data.mjs` — `generate-questions.mjs` replaces it.
3. Delete `data/intents.jsonl` and `data/intentModel.json` before generating. The seed
   set exists to prove the pipeline runs, not to train a shippable model.
4. Run the generation and training.
5. Only then apply the `generateReply` patch in INTEGRATE.md.

## Prompt for Claude Code

Paste this:

---

I've added an intent-classifier pipeline to the repo: `lib/intentFeatures.js`,
`lib/intentClassifier.ts`, `data/intentTaxonomy.js`, and three scripts in
`scripts/`. Read `INTEGRATE.md` first — it explains how this wires into the
existing `lib/domnerEngine.ts`.

Do these in order, stopping after each so I can check:

**1. Wire up the tooling.** Add `intents:seed`, `intents:generate` and
`intents:train` scripts to package.json. Confirm `resolveJsonModule` is enabled
in tsconfig.json. Verify `lib/intentFeatures.js` imports cleanly from both a
`.mjs` node script and a `.ts` file under Next's bundler — that shared import is
the one thing that must not break, since training and runtime silently diverge
if they use different featurisers.

**2. Reconcile the taxonomy.** `data/intentTaxonomy.js` has 64 intents;
`domnerEngine.ts` currently has 13, and its recent commits added roughly 16 more
inline. Map the taxonomy ids onto what the engine actually handles. Report back:
which taxonomy intents have no answer in the engine, which engine intents are
missing from the taxonomy, and where the ids disagree. Do not write any answers
yet — I want to see the gap list first.

**3. Grounded answers.** The 15 intents flagged `grounded: true` must have
answers computed from `data/esimPlans.ts`, `data/destinations.ts`,
`data/customsRules.ts` and `data/scamAlerts.ts`. Never hardcode a price,
validity period, country list or payment method — read it from the data files
so it stays correct when the data changes. Show me the answer functions before
wiring them in.

**4. Generate and train.** Run `intents:generate` then `intents:train`. Show me
the accuracy, the per-intent precision/recall table, and the calibrated
threshold. If any intent has low recall it overlaps another — tell me which
pairs, and propose merges rather than merging on your own.

**5. Integrate.** Apply the `generateReply` patch from INTEGRATE.md, including
`logUnresolved`. Keep the existing keyword scoring as the fallback path — the
classifier must not replace it. Add a unit test asserting that a low-confidence
classification still reaches the keyword engine.

Constraints:
- Don't touch the globe, the design-lock files, or anything under `docs/design-lock/`.
- Work on a branch, not master.
- The live app must never call an external model. The classifier is local; the
  generation script is a one-time offline step.

---

## Before you ship

Don't enable the classifier path until `intents:train` reports accuracy you're
comfortable with. It's gated behind a confidence threshold, so a weak model
degrades to today's keyword behaviour rather than answering wrongly — but a
model that rarely fires is just added latency.

The `logUnresolved` output is the real asset. Every low-confidence query is a
real customer phrasing you can't parse yet. After two or three retraining
cycles most of your training data should come from that log, not from the
generator.
