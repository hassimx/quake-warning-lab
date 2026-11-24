// Run with: npm test   (or: node --test tests/*.test.mjs)
import test from "node:test";
import assert from "node:assert/strict";
import { pArrival, sArrival, spGap, blindZoneRadius, warningTime, VP, VS } from "../src/physics.js";
import { seismogram, SAMPLE_RATE } from "../src/seismogram.js";
import { staLta, firstTrigger } from "../src/stalta.js";

test("P arrives before S, and both match distance / speed", () => {
  const d = 100, h = 10, r = Math.hypot(d, h);
  assert.ok(Math.abs(pArrival(d, h) - r / VP) < 1e-9);
  assert.ok(Math.abs(sArrival(d, h) - r / VS) < 1e-9);
  assert.ok(pArrival(d, h) < sArrival(d, h));
});

test("the S-P gap grows by roughly 1 s every 8 km", () => {
  const perKm = (spGap(200, 10) - spGap(100, 10)) / 100;
  assert.ok(perKm > 1 / 9 && perKm < 1 / 7, `got ${perKm}`);
});

test("blind zone: S arrives exactly when the alert does", () => {
  const p = { depthKm: 15, nearestStationKm: 10, pWindow: 3, latency: 2 };
  const r = blindZoneRadius(p);
  assert.ok(Math.abs(warningTime({ ...p, userKm: r })) < 1e-6);
  assert.ok(warningTime({ ...p, userKm: r + 20 }) > 0);   // outside: some warning
  assert.ok(warningTime({ ...p, userKm: r - 5 }) < 0);    // inside: none
});

test("STA/LTA triggers within a second after the P wave arrives", () => {
  const rec = seismogram({ distanceKm: 20, depthKm: 15, magnitude: 6.5, durationS: 30 });
  const t = firstTrigger(staLta(rec.v, SAMPLE_RATE), rec.t, 4, 0);
  assert.ok(t !== null && t >= rec.tP && t - rec.tP < 1, `trigger ${t}, P ${rec.tP}`);
});

test("background noise alone does not trigger", () => {
  const rec = seismogram({ distanceKm: 20, depthKm: 15, magnitude: 6.5, durationS: 30 });
  assert.equal(firstTrigger(staLta(rec.v, SAMPLE_RATE), rec.t, 4, -Infinity, 0), null);
});

test("a truck before the quake fools a single station", () => {
  const rec = seismogram({ distanceKm: 20, depthKm: 15, magnitude: 6.5, durationS: 30, bursts: [{ t: -4, amp: 5 }] });
  const t = firstTrigger(staLta(rec.v, SAMPLE_RATE), rec.t, 4, -Infinity, 0);
  assert.ok(t !== null && t >= -4 && t < -3, `false trigger at ${t}`);
});
