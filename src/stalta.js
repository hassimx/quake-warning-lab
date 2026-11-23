// STA/LTA detector: the classic way seismometers notice an earthquake.
//
// STA = short-term average of signal energy (last ~0.5 s): "what is happening now".
// LTA = long-term average of signal energy (last ~10 s): "what is normal here".
// When an earthquake's P wave arrives, energy suddenly jumps, so STA grows much
// faster than LTA and their ratio shoots up. The station "triggers" when the
// ratio crosses a threshold (often 3 to 5).
//
// Why a ratio and not a fixed loudness level? Because background noise differs
// from place to place and hour to hour (a city station is noisier at rush
// hour). Comparing "now" with "normal" works everywhere.

export function staLta(v, sampleRate, { staS = 0.5, ltaS = 10 } = {}) {
  const ns = Math.max(1, Math.round(staS * sampleRate));
  const nl = Math.max(ns + 1, Math.round(ltaS * sampleRate));
  const ratio = new Float32Array(v.length);
  let sta = 0, lta = 0;
  for (let i = 0; i < v.length; i++) {
    const e = v[i] * v[i];            // energy of this sample
    sta += e; lta += e;
    if (i >= ns) sta -= v[i - ns] * v[i - ns];
    if (i >= nl) lta -= v[i - nl] * v[i - nl];
    // Wait until the long window is full, otherwise the ratio is meaningless.
    ratio[i] = i >= nl ? (sta / ns) / Math.max(lta / nl, 1e-9) : 0;
  }
  return ratio;
}

// First time (from the matching time array `t`) the ratio reaches the
// threshold, optionally only within [fromS, toS).
export function firstTrigger(ratio, t, threshold, fromS = -Infinity, toS = Infinity) {
  for (let i = 0; i < ratio.length; i++) {
    if (t[i] < fromS || t[i] >= toS) continue;
    if (ratio[i] >= threshold) return t[i];
  }
  return null;
}
