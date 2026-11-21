// Synthetic seismogram: what a seismometer near the quake would record.
//
// The record is background noise plus two wave packets:
//   - the P wave arrives first and is fairly weak,
//   - the S wave arrives later and is several times stronger.
// Each packet starts sharply and then decays (the "coda"). Real records are
// messier, but this keeps the parts that matter for detection: a quiet
// background, then a sudden rise in energy when the P wave arrives.

import { pArrival, sArrival, pga } from "./physics.js";

export const SAMPLE_RATE = 50; // samples per second

// Small deterministic random generator, so the same quake always produces the
// same trace (easier to compare settings).
export function makeRng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return ((s >>> 0) / 4294967296) * 2 - 1; // uniform in [-1, 1)
  };
}

// Packet of oscillations starting at t0 with peak amplitude `amp`.
function packet(t, t0, amp, freq, decay) {
  if (t < t0) return 0;
  const dt = t - t0;
  const rise = Math.min(1, dt / 0.3); // 0.3 s ramp up
  return amp * rise * Math.exp(-dt / decay) * Math.sin(2 * Math.PI * freq * dt);
}

// Returns { t: Float32Array, v: Float32Array, tP, tS }. Time 0 is the moment
// the fault breaks; the record starts `preS` seconds earlier so the detector
// has a stretch of normal background to compare against.
export function seismogram({ distanceKm, depthKm, magnitude, durationS, preS = 15, noise = 0.6, seed = 7, bursts = [] }) {
  const n = Math.ceil((durationS + preS) * SAMPLE_RATE);
  const t = new Float32Array(n), v = new Float32Array(n);
  const rng = makeRng(seed);
  const tP = pArrival(distanceKm, depthKm);
  const tS = sArrival(distanceKm, depthKm);
  const sAmp = pga(magnitude, distanceKm, depthKm);  // S wave carries the strong shaking
  const pAmp = sAmp * 0.25;                            // P wave is a few times weaker
  const decay = 2 + magnitude;                         // bigger quakes shake longer

  for (let i = 0; i < n; i++) {
    const ti = i / SAMPLE_RATE - preS;
    t[i] = ti;
    let x = noise * rng();
    x += packet(ti, tP, pAmp, 6, decay);
    x += packet(ti, tS, sAmp, 3, decay * 1.5);
    // Non-earthquake bursts (a passing truck, a door slam): short and local.
    for (const b of bursts) x += packet(ti, b.t, b.amp, 12, 0.6);
    v[i] = x;
  }
  return { t, v, tP, tS };
}
