import { pArrival, sArrival, alertTime, warningTime, blindZoneRadius, pga, shakingLevel, VP, VS } from "./physics.js";

// ---- World ----------------------------------------------------------------
// The map is a 300 km x 225 km area. Seismometer stations sit on a regular
// grid, like a real dense network (Japan has one roughly every 20-25 km).
const WORLD_W = 300, WORLD_H = 225;
const STATION_SPACING = 40; // km
const P_WINDOW = 3;  // s of P wave the system waits for before alerting
const LATENCY = 2;   // s for processing + sending the alert

const stations = [];
for (let x = STATION_SPACING / 2; x < WORLD_W; x += STATION_SPACING)
  for (let y = STATION_SPACING / 2; y < WORLD_H; y += STATION_SPACING) stations.push({ x, y });

const state = {
  quake: { x: 90, y: 110 },
  phone: { x: 230, y: 120 },
  magnitude: 7,
  depth: 15,
  t: null,        // animation clock in seconds, null when idle
  playing: false,
};

// ---- Helpers ----------------------------------------------------------------
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function nearestStationKm() {
  return Math.min(...stations.map((s) => dist(s, state.quake)));
}

function scenario() {
  const userKm = dist(state.phone, state.quake);
  const nearKm = nearestStationKm();
  const common = { depthKm: state.depth, nearestStationKm: nearKm, pWindow: P_WINDOW, latency: LATENCY };
  const tAlert = alertTime(common);
  return {
    userKm,
    nearKm,
    tFirstP: pArrival(nearKm, state.depth),
    tAlert,
    tP: pArrival(userKm, state.depth),
    tS: sArrival(userKm, state.depth),
    warning: warningTime({ ...common, userKm }),
    blind: blindZoneRadius(common),
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
  for (const s of stations) {
    const p = toPx(s);
    ctx.fillStyle = "#8a8f98";
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

  renderPanel(sc);
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

  const t = state.t ?? -1;
  const steps = [
    [0, "Fault breaks. P and S waves leave the hypocentre."],
    [sc.tFirstP, `P wave reaches the nearest seismometer (${sc.nearKm.toFixed(0)} km from the quake).`],
    [sc.tFirstP + P_WINDOW, `After ${P_WINDOW} s of P wave the system estimates the magnitude.`],
    [sc.tAlert, `Alert sent; your phone buzzes (+${LATENCY} s for processing and the network).`],
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

document.getElementById("play").addEventListener("click", () => {
  const sc = scenario();
  const end = sc.tS + 3;
  state.t = 0; state.playing = true;
  let last = performance.now();
  const speed = 2; // simulated seconds per real second
  function frame(now) {
    state.t = Math.min(end, state.t + ((now - last) / 1000) * speed);
    last = now; draw();
    if (state.t < end) requestAnimationFrame(frame); else state.playing = false;
  }
  requestAnimationFrame(frame);
});

draw();
