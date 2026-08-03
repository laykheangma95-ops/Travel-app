'use client';

// ─────────────────────────────────────────────────────────────────────────────
// The sound of Domner.
//
// Every sound here is SYNTHESISED at runtime with the Web Audio API. Not one
// audio file is downloaded. That is not a clever trick, it is the only
// defensible way to put sound on this product: a tasteful set of samples is
// 200–500KB, and this audience is on metered mobile data where that is real
// money for something they may never switch on.
//
// The palette is a D major pentatonic. Cambodian pinpeat music sits on a
// seven-tone equidistant scale that does not map onto Western tuning, and
// faking it would be pastiche — but a pentatonic set shares its openness and
// its lack of leading-tone tension, so the sounds feel calm and unresolved
// rather than "correct". Nothing here ever plays a cadence. The world is still
// waiting for you to go somewhere.
//
// Rules the whole system obeys:
//   • Off by default. Sound is opt-in, remembered, and reversible in one tap.
//   • Nothing can play before a real user gesture — browsers forbid it, and so
//     do we. The context is created on the first interaction, never on load.
//   • Master gain is low and fixed. There is no "loud" setting because there is
//     no reason for this product to be loud.
//   • Every cue is under 1.2 seconds except the flight bed, which is the only
//     sustained sound and is tied to a motion the user started.
//   • Silence is the default state between cues. This is punctuation, not music.
// ─────────────────────────────────────────────────────────────────────────────

export type Cue =
  | 'awaken'
  | 'focus'
  | 'key'
  | 'move'
  | 'unlock'
  | 'flight'
  | 'arrive'
  | 'confirm'
  | 'notify'
  | 'achieve';

const STORAGE_KEY = 'domner-sound';

/** D major pentatonic, two octaves. Open, calm, no leading tone. */
const D = 146.83;
const SCALE = [
  D, D * 1.1225, D * 1.2599, D * 1.4983, D * 1.6818,
  D * 2, D * 2.245, D * 2.5198, D * 2.9966, D * 3.3636,
];

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let space: ConvolverNode | null = null;
let enabled = false;
let flightBed: { stop: (t?: number) => void } | null = null;

/** A short synthetic room. Cheaper than an impulse response file, and warmer
 *  than no reverb at all — without it every cue sounds like a UI beep. */
function buildSpace(c: AudioContext): ConvolverNode {
  const seconds = 1.6;
  const len = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      // Exponentially decaying noise — a plausible small hall.
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6) * 0.5;
    }
  }
  const conv = c.createConvolver();
  conv.buffer = buf;
  return conv;
}

function ensureContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (ctx) return ctx;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;

  ctx = new Ctor();
  master = ctx.createGain();
  // Deliberately quiet. There is no volume control because there is no version
  // of this that should ever be loud.
  master.gain.value = 0.22;
  space = buildSpace(ctx);
  const wet = ctx.createGain();
  wet.gain.value = 0.3;
  space.connect(wet);
  wet.connect(ctx.destination);
  master.connect(space);
  master.connect(ctx.destination);
  return ctx;
}

/**
 * One struck tone. Sine plus a quiet detuned triangle gives a glassy, bell-like
 * body without a sample; the long release is what stops it sounding like a beep.
 */
function tone(
  c: AudioContext,
  out: AudioNode,
  freq: number,
  at: number,
  opts: { gain?: number; attack?: number; release?: number; type?: OscillatorType } = {},
) {
  const gain = opts.gain ?? 0.3;
  const attack = opts.attack ?? 0.012;
  const release = opts.release ?? 0.9;

  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + release);
  g.connect(out);

  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(freq * 6, at);
  lp.Q.value = 0.6;
  lp.connect(g);

  const o1 = c.createOscillator();
  o1.type = opts.type ?? 'sine';
  o1.frequency.value = freq;
  o1.connect(lp);

  const o2 = c.createOscillator();
  o2.type = 'triangle';
  o2.frequency.value = freq;
  o2.detune.value = 5;
  const g2 = c.createGain();
  g2.gain.value = 0.28;
  o2.connect(g2);
  g2.connect(lp);

  o1.start(at);
  o2.start(at);
  o1.stop(at + attack + release + 0.05);
  o2.stop(at + attack + release + 0.05);
}

/** Filtered noise — air, breath, the sound of moving through something. */
function breath(
  c: AudioContext,
  out: AudioNode,
  at: number,
  dur: number,
  opts: { gain?: number; from?: number; to?: number } = {},
) {
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

  const src = c.createBufferSource();
  src.buffer = buf;

  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 0.9;
  bp.frequency.setValueAtTime(opts.from ?? 500, at);
  bp.frequency.exponentialRampToValueAtTime(opts.to ?? 2200, at + dur);

  const g = c.createGain();
  const peak = opts.gain ?? 0.09;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + dur * 0.35);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);

  src.connect(bp);
  bp.connect(g);
  g.connect(out);
  src.start(at);
  src.stop(at + dur + 0.05);
}

/* ── The cues ──────────────────────────────────────────────────────────── */

function playCue(cue: Cue, detail?: number) {
  const c = ensureContext();
  if (!c || !master || !enabled) return;
  if (c.state === 'suspended') void c.resume();
  const t = c.currentTime + 0.01;

  switch (cue) {
    // The product waking up. A rising fifth, unhurried — the sound of a light
    // coming on in a room, not a notification.
    case 'awaken':
      tone(c, master, SCALE[0], t, { gain: 0.16, attack: 0.06, release: 1.6 });
      tone(c, master, SCALE[3], t + 0.14, { gain: 0.14, attack: 0.06, release: 1.8 });
      breath(c, master, t, 1.2, { gain: 0.04, from: 300, to: 1400 });
      break;

    // The field is listening. One low, soft blip.
    case 'focus':
      tone(c, master, SCALE[2], t, { gain: 0.1, attack: 0.006, release: 0.34 });
      break;

    // A keystroke. Barely there, slightly different every time, so typing has
    // texture instead of a metronome.
    case 'key':
      tone(c, master, SCALE[4 + Math.floor(Math.random() * 3)] * 2, t, {
        gain: 0.028,
        attack: 0.002,
        release: 0.07,
      });
      break;

    // Moving through suggestions. Pitch climbs with the index, so the list has
    // a shape you can hear.
    case 'move':
      tone(c, master, SCALE[Math.min(SCALE.length - 1, 3 + (detail ?? 0))], t, {
        gain: 0.07,
        attack: 0.003,
        release: 0.16,
      });
      break;

    // THE moment. A destination is chosen and the light path ignites: a rising
    // pentatonic arpeggio over a swell of air. This is the only cue allowed to
    // be conspicuous, and it happens at most once per journey.
    case 'unlock':
      [0, 2, 4, 7].forEach((step, i) =>
        tone(c, master!, SCALE[step], t + i * 0.075, {
          gain: 0.17 - i * 0.015,
          attack: 0.01,
          release: 1.5,
        }),
      );
      breath(c, master, t + 0.05, 1.4, { gain: 0.075, from: 400, to: 3200 });
      break;

    // The flight bed: a low drone plus rising air, for as long as the camera is
    // moving. The only sustained sound in the system, and it is always tied to
    // a motion the user started.
    case 'flight': {
      const dur = (detail ?? 2600) / 1000;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.09, t + dur * 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      g.connect(master);

      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(SCALE[0] * 0.5, t);
      o.frequency.linearRampToValueAtTime(SCALE[0] * 0.75, t + dur);
      o.connect(g);
      o.start(t);
      o.stop(t + dur + 0.1);

      breath(c, master, t, dur, { gain: 0.055, from: 220, to: 1800 });
      flightBed = { stop: () => o.stop() };
      break;
    }

    // Arrival. One bell, left to ring out. Nothing follows it, because the
    // point of arriving is that you have stopped.
    case 'arrive':
      tone(c, master, SCALE[5], t, { gain: 0.15, attack: 0.02, release: 2.4 });
      tone(c, master, SCALE[7], t + 0.02, { gain: 0.07, attack: 0.03, release: 2.6 });
      break;

    // Something is yours now. Warm, two notes, resolved downward — the opposite
    // shape to `unlock`, so buying feels like settling rather than opening.
    case 'confirm':
      tone(c, master, SCALE[5], t, { gain: 0.14, attack: 0.01, release: 0.8 });
      tone(c, master, SCALE[3], t + 0.1, { gain: 0.13, attack: 0.01, release: 1.2 });
      break;

    case 'notify':
      tone(c, master, SCALE[6], t, { gain: 0.1, attack: 0.005, release: 0.3 });
      tone(c, master, SCALE[6], t + 0.16, { gain: 0.08, attack: 0.005, release: 0.5 });
      break;

    // Reserved for the collectibles in roadmap.md. A four-note run that lands
    // an octave up: the one moment in the system that is allowed to feel like
    // a small victory.
    case 'achieve':
      [0, 2, 4, 5].forEach((step, i) =>
        tone(c, master!, SCALE[step + 2], t + i * 0.09, {
          gain: 0.13,
          attack: 0.008,
          release: 1.1,
        }),
      );
      break;
  }
}

/* ── Public surface ────────────────────────────────────────────────────── */

const listeners = new Set<(on: boolean) => void>();

export function isSoundOn(): boolean {
  return enabled;
}

export function loadSoundPreference(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    enabled = localStorage.getItem(STORAGE_KEY) === 'on';
  } catch {
    enabled = false;
  }
  return enabled;
}

export function setSoundEnabled(on: boolean): void {
  enabled = on;
  try {
    localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    /* private browsing */
  }
  for (const l of listeners) l(on);
  if (on) {
    // Turning it on is itself a gesture, so this is the one place the context
    // can legitimately start — and hearing the room open is the confirmation.
    playCue('awaken');
  } else {
    flightBed?.stop();
    flightBed = null;
  }
}

export function onSoundChange(fn: (on: boolean) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Fire a cue. A no-op when sound is off, which is the default. */
export function play(cue: Cue, detail?: number): void {
  try {
    playCue(cue, detail);
  } catch {
    // Audio must never be able to break the page.
  }
}
