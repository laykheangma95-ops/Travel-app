/**
 * intentFeatures — turns a message into a sparse numeric vector.
 *
 * Shared by the training script and the live classifier. If these ever
 * disagree the model silently degrades, so this file is imported by both
 * rather than duplicated.
 *
 * Why character n-grams instead of word embeddings:
 *  - Khmer is not space-delimited, so word tokenisation is unreliable.
 *    Character n-grams sidestep that entirely and treat both languages
 *    the same way.
 *  - Typos and inflections still overlap heavily at the character level,
 *    which is exactly the brittleness the keyword engine suffers from.
 *  - No model download. The whole thing is arithmetic, so it runs inside
 *    an existing serverless function with no cold-start penalty.
 */

/** Feature space size. Power of two so the mask is a bitwise AND. */
export const DIM = 4096;

/** FNV-1a, 32-bit. Fast, no dependencies, good enough spread for hashing. */
function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) & (DIM - 1);
}

/**
 * Normalise before featurising.
 * Keeps Khmer codepoints intact, strips punctuation and collapses runs of
 * whitespace and digits (an exact flight number should not create its own
 * feature — "AK123" and "AK456" are the same question).
 */
export function normalise(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[0-9]+/g, '0')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Build the feature vector: character 3/4/5-grams plus whitespace-separated
 * word unigrams and bigrams. Sublinear term frequency (1 + log tf) keeps a
 * repeated word from dominating, then L2 normalisation makes short and long
 * messages comparable.
 *
 * @param {string} text
 * @returns {Float32Array} length DIM
 */
export function featurise(text) {
  const s = normalise(text);
  const counts = new Map();

  const bump = (token) => {
    const i = hash(token);
    counts.set(i, (counts.get(i) || 0) + 1);
  };

  // character n-grams, padded so word starts and ends are distinguishable
  const padded = ` ${s} `;
  for (const n of [3, 4, 5]) {
    for (let i = 0; i + n <= padded.length; i++) bump(padded.slice(i, i + n));
  }

  // word unigrams and bigrams (no-ops for unspaced Khmer, useful for English)
  const words = s.split(' ').filter(Boolean);
  for (let i = 0; i < words.length; i++) {
    bump('w:' + words[i]);
    if (i + 1 < words.length) bump('w:' + words[i] + '_' + words[i + 1]);
  }

  const vec = new Float32Array(DIM);
  let norm = 0;
  for (const [i, tf] of counts) {
    const v = 1 + Math.log(tf);
    vec[i] = v;
    norm += v * v;
  }
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < DIM; i++) vec[i] /= norm;

  return vec;
}
