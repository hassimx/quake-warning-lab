// Physics of earthquake early warning (EEW), kept deliberately simple.
//
// An earthquake sends out two main kinds of body waves:
//   P waves (primary): compressional, fast, usually weak shaking.
//   S waves (secondary): shear, slower, carry most of the damaging shaking.
// Early warning works because a seismometer near the epicentre can detect the
// fast P wave, and an alert travels at the speed of the internet, so people
// farther away can be told before the slow S wave reaches them.

export const VP = 6.5; // km/s, average P-wave speed in the upper crust
export const VS = 3.6; // km/s, average S-wave speed in the upper crust

// Straight-line distance from the hypocentre (point at depth) to a place on the
// surface that is `epicentralKm` away from the epicentre.
export function hypocentralDistance(epicentralKm, depthKm) {
  return Math.sqrt(epicentralKm * epicentralKm + depthKm * depthKm);
}

export function pArrival(epicentralKm, depthKm) {
  return hypocentralDistance(epicentralKm, depthKm) / VP;
}

export function sArrival(epicentralKm, depthKm) {
  return hypocentralDistance(epicentralKm, depthKm) / VS;
}

// Seconds between P and S at one place. Seismologists use this gap the other
// way round: a 10 s gap means the quake was roughly 80 km away.
export function spGap(epicentralKm, depthKm) {
  return sArrival(epicentralKm, depthKm) - pArrival(epicentralKm, depthKm);
}

// When does the alert reach a phone?
//   firstP     : time the P wave reaches the nearest station
//   pWindow    : seconds of P-wave record the system waits for before it trusts
//                its magnitude estimate (longer = more reliable, but later)
//   latency    : processing plus sending the alert through the phone network
export function alertTime({ nearestStationKm, depthKm, pWindow, latency }) {
  const firstP = pArrival(nearestStationKm, depthKm);
  return firstP + pWindow + latency;
}

// Warning time at the user's location. Negative means the shaking arrives
// before the alert: the user is inside the "blind zone".
export function warningTime({ userKm, depthKm, nearestStationKm, pWindow, latency }) {
  return sArrival(userKm, depthKm) - alertTime({ nearestStationKm, depthKm, pWindow, latency });
}

// Radius of the blind zone: epicentral distance at which S arrives exactly when
// the alert does. Solved directly: sqrt(r^2 + h^2) = VS * tAlert.
export function blindZoneRadius({ depthKm, nearestStationKm, pWindow, latency }) {
  const t = alertTime({ nearestStationKm, depthKm, pWindow, latency });
  const hypo = VS * t;
  return hypo > depthKm ? Math.sqrt(hypo * hypo - depthKm * depthKm) : 0;
}

// Rough peak ground acceleration (cm/s^2) from magnitude and distance.
// A simplified attenuation relation of the usual form
//   log10(PGA) = a*M - log10(R + c) - b*R + d
// with coefficients chosen to give realistic orders of magnitude. It is for
// explaining the idea (shaking fades with distance, grows with magnitude), not
// for engineering.
export function pga(magnitude, epicentralKm, depthKm) {
  const r = hypocentralDistance(epicentralKm, depthKm);
  const log = 0.5 * magnitude - Math.log10(r + 10) - 0.0035 * r + 0.7;
  return Math.pow(10, log);
}

// Map PGA to a plain-language shaking level (loosely following the JMA scale).
export function shakingLevel(pgaCm) {
  if (pgaCm < 2.5) return { level: 1, label: "barely felt" };
  if (pgaCm < 8) return { level: 2, label: "light" };
  if (pgaCm < 25) return { level: 3, label: "moderate: things rattle" };
  if (pgaCm < 80) return { level: 4, label: "strong: hard to stand" };
  if (pgaCm < 250) return { level: 5, label: "very strong: furniture falls" };
  return { level: 6, label: "violent: buildings damaged" };
}
