/**
 * intentClassifier — runs the trained intent model at request time.
 *
 * Loaded once per warm serverless instance. No network calls, no model
 * download: it is a 4096 x N int8 matrix multiply, well under a millisecond.
 * Cost per classification is zero, permanently.
 *
 * Used as a FIRST PASS in front of the existing keyword engine. When the
 * classifier is confident it names the intent; when it isn't, the keyword
 * engine runs exactly as it does today. Worst case is current behaviour.
 */

import { featurise } from './intentFeatures.js';
import modelJson from '@/data/intentModel.json';

type Model = {
  version: number;
  dim: number;
  labels: string[];
  threshold: number;
  accuracy: number;
  scales: number[];
  bias: number[];
  weights: string;
};

const model = modelJson as Model;

/* Dequantise once at module load, not per request. */
const K = model.labels.length;
const DIM = model.dim;
const W = new Float32Array(K * DIM);

{
  const raw = Buffer.from(model.weights, 'base64');
  const q = new Int8Array(raw.buffer, raw.byteOffset, raw.byteLength);
  for (let k = 0; k < K; k++) {
    const off = k * DIM;
    const scale = model.scales[k];
    for (let i = 0; i < DIM; i++) W[off + i] = q[off + i] * scale;
  }
}

export type Classification = {
  /** Best-guess intent id, matching the ids in domnerEngine's INTENTS. */
  intent: string;
  /** Softmax probability, 0..1. */
  confidence: number;
  /** True when confidence clears the calibrated threshold. */
  confident: boolean;
  /** Full distribution, useful for logging and debugging. */
  scores: Array<{ intent: string; score: number }>;
};

export function classify(text: string): Classification {
  const x = featurise(text);
  const logits = new Float32Array(K);

  for (let k = 0; k < K; k++) {
    let s = model.bias[k];
    const off = k * DIM;
    for (let i = 0; i < DIM; i++) {
      const xi = x[i];
      if (xi !== 0) s += W[off + i] * xi;
    }
    logits[k] = s;
  }

  let max = -Infinity;
  for (let k = 0; k < K; k++) if (logits[k] > max) max = logits[k];
  let sum = 0;
  for (let k = 0; k < K; k++) {
    logits[k] = Math.exp(logits[k] - max);
    sum += logits[k];
  }

  let best = 0;
  const scores: Array<{ intent: string; score: number }> = [];
  for (let k = 0; k < K; k++) {
    logits[k] /= sum;
    scores.push({ intent: model.labels[k], score: logits[k] });
    if (logits[k] > logits[best]) best = k;
  }
  scores.sort((a, b) => b.score - a.score);

  return {
    intent: model.labels[best],
    confidence: logits[best],
    confident: logits[best] >= model.threshold,
    scores,
  };
}

export const modelInfo = {
  labels: model.labels,
  threshold: model.threshold,
  accuracy: model.accuracy,
  version: model.version,
};
