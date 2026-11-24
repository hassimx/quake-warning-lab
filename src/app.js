import { pArrival, sArrival, pga, shakingLevel, VP, VS } from "./physics.js";
import { seismogram, SAMPLE_RATE } from "./seismogram.js";
import { staLta, firstTrigger } from "./stalta.js";

// ---- World ----------------------------------------------------------------
// The map is a 300 km x 225 km area. Seismometer stations sit on a regular
// grid, like a real dense network (Japan has one roughly every 20-25 km).
const WORLD_W = 300, WORLD_H = 225;
const STATION_SPACING = 40; // km
const THRESHOLD = 4; // STA/LTA ratio that counts as "earthquake detected"
const TRACE_S = 40;  // seconds of record shown under the map

const stations = [];
for (let x = STATION_SPACING / 2; x < WORLD_W; x += STATION_SPACING)
  for (let y = STATION_SPACING / 2; y < WORLD_H; y += STATION_SPACING) stations.push({ x, y });

const state = {
  quake: { x: 90, y: 110 },
  phone: { x: 230, y: 120 },
  magnitude: 7,
  depth: 15,
  pWindow: 3,   // s of P wave the system waits for before estimating magnitude
  latency: 2,   // s for processing + sending the alert through the phone network
  kStations: 2, // how many stations must detect before the system believes it
  truck: false, // a heavy truck passes the nearest station 4 s before the quake
  t: null,        // animation clock in seconds, null when idle
  playing: false,
};

// ---- Helpers ----------------------------------------------------------------
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Every station near the quake records the shaking and runs its own STA/LTA
// detector. Only the closest few matter for the first alert, so we simulate
// those. Cached, because this only changes when the quake changes.
const SIMULATED = 6;
const TRUCK_T = -4; // s: the truck passes the nearest station before the fault breaks
let netCache = { key: "", list: [] };
function network() {
  const key = [state.quake.x.toFixed(1), state.quake.y.toFixed(1), state.depth, state.magnitude, state.truck].join("|");
  if (netCache.key !== key) {
    const list = stations
      .map((s, i) => ({ s, i, km: dist(s, state.quake) }))
      .sort((a, b) => a.km - b.km)
      .slice(0, SIMULATED)
      .map((st, rank) => {
        // A truck is local: only the one station next to the road feels it.
        const bursts = state.truck && rank === 0 ? [{ t: TRUCK_T, amp: 5 }] : [];
        const rec = seismogram({ distanceKm: st.km, depthKm: state.depth, magnitude: state.magnitude,
                                 durationS: TRACE_S, seed: 7 + st.i, bursts });   // each station has its own noise
        const ratio = staLta(rec.v, SAMPLE_RATE);
        return {
          ...st, rec, ratio,
          // what the detector sees before the quake (only noise or a truck) ...
          falseTrigger: firstTrigger(ratio, rec.t, THRESHOLD, -Infinity, 0),
          // ... and the real earthquake
          trigger: firstTrigger(ratio, rec.t, THRESHOLD, 0),
        };
      });
    netCache = { key, list };
  }
  return netCache.list;
}

function scenario() {
  const userKm = dist(state.phone, state.quake);
  const net = network();
  const nearest = net[0];
  const nearKm = nearest.km;
  const { rec, ratio } = nearest;
  // The system only believes it is an earthquake once K different stations
  // have triggered. Detection is not the exact P arrival: each detector needs
  // a moment of signal before its ratio crosses the threshold.
  const triggers = net.map((st) => st.trigger).filter((t) => t !== null).sort((a, b) => a - b);
  // Before the quake, does the network wrongly believe there is one?
  const falseTriggers = net.map((st) => st.falseTrigger).filter((t) => t !== null).sort((a, b) => a - b);
  const falseAlarm = falseTriggers.length >= state.kStations ? falseTriggers[state.kStations - 1] : null;
  const k = Math.min(state.kStations, triggers.length);
  const tDetect = k > 0 ? triggers[k - 1] : pArrival(nearKm, state.depth);
  const tAlert = tDetect + state.pWindow + state.latency;
  const tS = sArrival(userKm, state.depth);
  const hypoBlind = VS * tAlert;
  return {
    userKm,
    nearKm,
    rec,
    ratio,
    net,
    falseTriggers,
    falseAlarm,
    tFirstP: pArrival(nearKm, state.depth),
    tDetect,
    tAlert,
    tP: pArrival(userKm, state.depth),
    tS,
    warning: tS - tAlert,
    blind: hypoBlind > state.depth ? Math.sqrt(hypoBlind ** 2 - state.depth ** 2) : 0,
    shaking: shakingLevel(pga(state.magnitude, userKm, state.depth)),
  };
}

// ---- Drawing ----------------------------------------------------------------
const canvas = document.getElementById("map");
const ctx = canvas.getContext("2d");
const sx = canvas.width / WORLD_W, sy = canvas.height / WORLD_H;
const toPx = (p) => ({ x: p.x * sx, y: p.y * sy });

// Radius on the surface reached by a wave at time t (wave starts at depth).
function surfaceRadius(t, speed) {
  const hypo = speed * t;
  return hypo > state.depth ? Math.sqrt(hypo * hypo - state.depth * state.depth) : 0;
}

function draw() {
  const sc = scenario();
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // grid every 50 km
  ctx.strokeStyle = "#ece9e2"; ctx.lineWidth = 1;
  for (let x = 0; x <= WORLD_W; x += 50) { ctx.beginPath(); ctx.moveTo(x * sx, 0); ctx.lineTo(x * sx, canvas.height); ctx.stroke(); }
  for (let y = 0; y <= WORLD_H; y += 50) { ctx.beginPath(); ctx.moveTo(0, y * sy); ctx.lineTo(canvas.width, y * sy); ctx.stroke(); }

  const q = toPx(state.quake);

  // blind zone
  ctx.fillStyle = "rgba(214,69,47,0.08)";
  ctx.beginPath(); ctx.arc(q.x, q.y, sc.blind * sx, 0, Math.PI * 2); ctx.fill();
  ctx.setLineDash([5, 5]); ctx.strokeStyle = "rgba(214,69,47,0.5)"; ctx.stroke(); ctx.setLineDash([]);

  // stations
  const triggeredNow = new Set(sc.net.filter((st) => st.trigger !== null && state.t !== null && state.t >= st.trigger).map((st) => st.i));
  for (const [i, s] of stations.entries()) {
    const p = toPx(s);
    ctx.fillStyle = triggeredNow.has(i) ? "#2f6fd6" : "#8a8f98";
    ctx.beginPath(); ctx.moveTo(p.x, p.y - 5); ctx.lineTo(p.x + 4.5, p.y + 3); ctx.lineTo(p.x - 4.5, p.y + 3); ctx.closePath(); ctx.fill();
  }

  // wavefronts
  if (state.t !== null) {
    const rp = surfaceRadius(state.t, VP), rs = surfaceRadius(state.t, VS);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#2f6fd6"; ctx.beginPath(); ctx.arc(q.x, q.y, rp * sx, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#d6452f"; ctx.beginPath(); ctx.arc(q.x, q.y, rs * sx, 0, Math.PI * 2); ctx.stroke();
  }

  // quake
  ctx.fillStyle = "#1d1f23";
  ctx.beginPath(); ctx.arc(q.x, q.y, 7, 0, Math.PI * 2); ctx.fill();

  // phone
  const ph = toPx(state.phone);
  const alerted = state.t !== null && state.t >= sc.tAlert;
  ctx.fillStyle = alerted ? "#f2b705" : "#1f9d6b";
  ctx.fillRect(ph.x - 7, ph.y - 11, 14, 22);
  ctx.fillStyle = "#fff"; ctx.fillRect(ph.x - 5, ph.y - 8, 10, 14);

  // scale bar
  ctx.fillStyle = "#61656c"; ctx.font = "12px system-ui";
  ctx.fillRect(12, canvas.height - 18, 50 * sx, 3);
  ctx.fillText("50 km", 12, canvas.height - 24);
  if (state.t !== null) ctx.fillText(`t = ${state.t.toFixed(1)} s`, canvas.width - 70, 20);

  drawTrace(sc);
  renderPanel(sc);
}

// ---- Seismogram + detector under the map --------------------------------------
const trace = document.getElementById("trace");
const tctx = trace.getContext("2d");

function drawTrace(sc) {
  const W = trace.width, H = trace.height;
  const t0 = -5, t1 = Math.max(20, sc.tAlert + 6);      // visible time window (s)
  const xOf = (t) => ((t - t0) / (t1 - t0)) * W;
  tctx.clearRect(0, 0, W, H);

  const top = H * 0.62, mid = top / 2;                   // waveform band on top
  const { t, v } = sc.rec;
  let peak = 1e-6;
  for (let i = 0; i < v.length; i++) if (t[i] >= t0 && t[i] <= t1) peak = Math.max(peak, Math.abs(v[i]));
  const now = state.t ?? t1;                             // draw only what has been "recorded" so far

  tctx.strokeStyle = "#1d1f23"; tctx.lineWidth = 1; tctx.beginPath();
  let started = false;
  for (let i = 0; i < v.length; i++) {
    if (t[i] < t0 || t[i] > Math.min(t1, now)) continue;
    // square-root scale so the quiet background is still visible next to the S wave
    const x = xOf(t[i]), y = mid - Math.sign(v[i]) * Math.sqrt(Math.abs(v[i]) / peak) * (mid - 6);
    started ? tctx.lineTo(x, y) : tctx.moveTo(x, y); started = true;
  }
  tctx.stroke();

  // STA/LTA ratio on the bottom band, with the threshold line
  const base = H - 6, span = H - top - 12, maxR = Math.max(THRESHOLD * 2, 8);
  const yR = (r) => base - Math.min(r, maxR) / maxR * span;
  tctx.strokeStyle = "#dedbd4"; tctx.beginPath(); tctx.moveTo(0, base); tctx.lineTo(W, base); tctx.stroke();
  tctx.setLineDash([4, 4]); tctx.strokeStyle = "#d6452f";
  tctx.beginPath(); tctx.moveTo(0, yR(THRESHOLD)); tctx.lineTo(W, yR(THRESHOLD)); tctx.stroke(); tctx.setLineDash([]);
  tctx.strokeStyle = "#2f6fd6"; tctx.lineWidth = 1.5; tctx.beginPath(); started = false;
  for (let i = 0; i < v.length; i++) {
    if (t[i] < t0 || t[i] > Math.min(t1, now)) continue;
    const x = xOf(t[i]), y = yR(sc.ratio[i]);
    started ? tctx.lineTo(x, y) : tctx.moveTo(x, y); started = true;
  }
  tctx.stroke();

  // markers
  tctx.font = "11px system-ui"; tctx.textBaseline = "top";
  const mark = (time, color, label, row) => {
    if (time > now || time < t0 || time > t1) return;
    const x = xOf(time);
    tctx.strokeStyle = color; tctx.lineWidth = 1; tctx.beginPath(); tctx.moveTo(x, 0); tctx.lineTo(x, H); tctx.stroke();
    tctx.fillStyle = color; tctx.fillText(label, x + 3, 2 + row * 13);
  };
  if (state.truck) mark(TRUCK_T, "#8a6d3b", "truck", 0);
  mark(0, "#61656c", "fault breaks", 0);
  mark(sc.tDetect, "#2f6fd6", "detected", 1);
  mark(sc.tAlert, "#b8860b", "alert sent", 2);
  tctx.fillStyle = "#61656c"; tctx.textBaseline = "bottom"; tctx.textAlign = "right";
  tctx.fillText(`STA/LTA ratio (detects at ${THRESHOLD})`, W - 6, yR(THRESHOLD) - 3);
  tctx.textAlign = "left";
}

function renderPanel(sc) {
  const res = document.getElementById("result");
  if (sc.warning > 0) {
    res.className = "result";
    res.innerHTML = `<div class="big">${sc.warning.toFixed(1)} s</div>
      <div>of warning before strong shaking reaches you (${sc.userKm.toFixed(0)} km away).</div>
      <div class="sub">Expected shaking: ${sc.shaking.label}.</div>`;
  } else {
    res.className = "result blind";
    res.innerHTML = `<div class="big">No warning</div>
      <div>You are inside the blind zone: the strong S wave reaches you
      ${(-sc.warning).toFixed(1)} s before the alert can.</div>
      <div class="sub">Expected shaking: ${sc.shaking.label}.</div>`;
  }

  const fa = document.getElementById("falseAlarm");
  if (!state.truck) {
    fa.hidden = true;
  } else if (sc.falseAlarm !== null) {
    fa.hidden = false; fa.className = "notice bad";
    fa.innerHTML = `<b>False alarm!</b> A truck shook the nearest station at ${TRUCK_T} s, before any earthquake.
      With only 1 station needed, the system believed it and woke up the whole city.
      Try setting "Stations that must agree" to 2.`;
  } else {
    fa.hidden = false; fa.className = "notice good";
    fa.innerHTML = `<b>No false alarm.</b> The truck shook one station${sc.falseTriggers.length ? " and it triggered" : ""},
      but the stations around it felt nothing, so the network ignored it.
      Real early-warning systems wait for several stations for exactly this reason.`;
  }

  const t = state.t ?? -1;
  const steps = [
    [0, "Fault breaks. P and S waves leave the hypocentre."],
    [sc.tFirstP, `P wave reaches the nearest seismometer (${sc.nearKm.toFixed(0)} km from the quake).`],
    [sc.tDetect, state.kStations > 1
      ? `${state.kStations} stations have triggered: the system is confident it is an earthquake.`
      : "Its STA/LTA detector crosses the threshold: earthquake detected."],
    [sc.tDetect + state.pWindow, `After ${state.pWindow} s of P wave the system estimates the magnitude.`],
    [sc.tAlert, `Alert sent; your phone buzzes (+${state.latency} s for processing and the network).`],
    [sc.tP, "Fast, weak P wave reaches you."],
    [sc.tS, "Slow, strong S wave reaches you: the shaking starts."],
  ].sort((a, b) => a[0] - b[0]);
  document.getElementById("timeline").innerHTML = steps
    .map(([time, text]) => `<li class="${t >= time ? "done" : ""}"><b>${time.toFixed(1)} s</b> ${text}</li>`)
    .join("");
}

// ---- Interaction ------------------------------------------------------------
function eventToWorld(e) {
  const r = canvas.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * WORLD_W, y: ((e.clientY - r.top) / r.height) * WORLD_H };
}

let dragging = false;
canvas.addEventListener("pointerdown", (e) => {
  const w = eventToWorld(e);
  if (dist(w, state.phone) < 12) { dragging = true; canvas.setPointerCapture(e.pointerId); return; }
  state.quake = w; state.t = null; draw();
});
canvas.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  state.phone = eventToWorld(e); draw();
});
canvas.addEventListener("pointerup", () => { dragging = false; });

function bindSlider(id, key, fmt) {
  const el = document.getElementById(id), out = document.getElementById(id + "Out");
  const update = () => { state[key] = Number(el.value); out.textContent = fmt(state[key]); draw(); };
  el.addEventListener("input", update); update();
}
bindSlider("mag", "magnitude", (v) => v.toFixed(1));
bindSlider("depth", "depth", (v) => `${v}`);
bindSlider("pwin", "pWindow", (v) => `${v.toFixed(1)} s`);
bindSlider("lat", "latency", (v) => `${v.toFixed(1)} s`);
bindSlider("kst", "kStations", (v) => `${v}`);

document.getElementById("truck").addEventListener("click", (e) => {
  state.truck = !state.truck;
  e.currentTarget.setAttribute("aria-pressed", String(state.truck));
  e.currentTarget.textContent = state.truck ? "🚚 Truck: on" : "🚚 Send a truck past the station";
  draw();
});

// Run the clock from state.t (or 0) up to `until` seconds, then call `done`.
let animId = 0;
function animate(until, done) {
  const id = ++animId;                 // a newer animation cancels an older one
  if (state.t === null) state.t = 0;
  state.playing = true;
  let last = performance.now();
  const speed = 2;                     // simulated seconds per real second
  function frame(now) {
    if (id !== animId) return;
    state.t = Math.min(until, state.t + ((now - last) / 1000) * speed);
    last = now; draw();
    if (state.t < until) requestAnimationFrame(frame);
    else { state.playing = false; done && done(); }
  }
  requestAnimationFrame(frame);
}

document.getElementById("play").addEventListener("click", () => {
  state.t = 0;
  animate(scenario().tS + 3, showLearned);
});

// ---- "What you just learned" -------------------------------------------------
function showLearned() {
  const sc = scenario();
  const card = document.getElementById("learned");
  card.hidden = false;
  card.innerHTML = `<h3>What you just saw</h3>
    <ol>
      <li><b>Two waves.</b> The P wave (blue) is fast but weak. The S wave (red) is slow and does the damage.</li>
      <li><b>A race the internet wins.</b> A seismometer near the quake caught the P wave, and the alert flew to
        your phone at network speed, ${sc.warning > 0 ? `${sc.warning.toFixed(1)} s before the S wave arrived` : "but here the S wave still won"}.</li>
      <li><b>Distance is your friend.</b> Far away you get more warning. Inside the red dashed circle (the blind zone)
        the shaking always arrives first.</li>
    </ol>
    <p class="sub">Now try: drag your phone closer, make the quake deeper, or send a truck past the station.</p>`;
  renderFeel(sc);
}

// ---- "Feel it yourself": estimate distance from the S-P gap --------------------
function renderFeel(sc) {
  const box = document.getElementById("feel");
  box.hidden = false;
  const gap = sc.tS - sc.tP;
  const est = gap * 8;
  box.innerHTML = `<h3>Feel it yourself</h3>
    <p>At your phone the weak P wave arrived at <b>${sc.tP.toFixed(1)} s</b> and the strong S wave at
    <b>${sc.tS.toFixed(1)} s</b>: a gap of <b>${gap.toFixed(1)} s</b>.</p>
    <p>Rule of thumb: every second of gap is about 8 km, so the quake was about
    <b>${gap.toFixed(1)} × 8 ≈ ${est.toFixed(0)} km</b> away. The real distance is
    <b>${Math.hypot(sc.userKm, state.depth).toFixed(0)} km</b> (counting the depth).</p>
    <p class="sub">Why 8? In one second the P wave travels ${VP} km and the S wave ${VS} km, so the gap grows by
    1/${VS} − 1/${VP} ≈ 0.12 s per km, which is 1 s per ~8 km.</p>`;
}

// ---- First-visit guided tour -------------------------------------------------
const tour = document.getElementById("tour");
const tourSteps = [
  { text: () => `<b>1/3</b> The black dot is an earthquake. The green phone is you, ${scenario().userKm.toFixed(0)} km away.
      Grey triangles are seismometers.`, until: null },
  { text: () => `<b>2/3</b> The fast blue P wave reaches the nearest seismometers. They notice it (they turn blue)
      and the system sends an alert through the network, much faster than any wave.`, until: () => scenario().tAlert + 0.5 },
  { text: () => { const w = scenario().warning;
      return `<b>3/3</b> The slow red S wave brings the strong shaking. ${w > 0
        ? `Your phone buzzed <b>${w.toFixed(1)} s</b> before it reached you. That is your warning.`
        : "Here it reached you before the alert: you are in the blind zone."}`; }, until: () => scenario().tS + 1 },
];
let tourStep = 0;
function showTourStep() {
  const st = tourSteps[tourStep];
  tour.hidden = false;
  tour.querySelector(".tour-text").innerHTML = st.text();
  tour.querySelector("#tourNext").textContent = tourStep < tourSteps.length - 1 ? "Next ▶" : "Done";
  if (st.until) animate(st.until(), () => { tour.querySelector(".tour-text").innerHTML = st.text(); });
}
function startTour() { state.t = 0; tourStep = 0; draw(); showTourStep(); }
function endTour() {
  tour.hidden = true;
  try { localStorage.setItem("qwl-tour-done", "1"); } catch (e) { /* storage may be blocked */ }
  showLearned();
}
document.getElementById("tourNext").addEventListener("click", () => {
  if (tourStep < tourSteps.length - 1) { tourStep++; showTourStep(); } else endTour();
});
document.getElementById("tourSkip").addEventListener("click", () => { animId++; state.t = null; endTour(); draw(); });
document.getElementById("replayTour").addEventListener("click", startTour);

draw();
let seen = false;
try { seen = localStorage.getItem("qwl-tour-done") === "1"; } catch (e) { /* ignore */ }
if (!seen) startTour();
