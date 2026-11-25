# Quake Warning Lab

**How can your phone warn you seconds *before* an earthquake's shaking arrives?**

Live: https://hassimx.github.io/quake-warning-lab/

Quake Warning Lab is an interactive model of earthquake early warning (EEW), the system that makes phones in Japan and on the US West Coast buzz before strong shaking starts. You place an earthquake on a map, put your phone somewhere, press Play and watch the race between the seismic waves and the alert.

## What you can do

- **Click the map** to move the earthquake, **drag the phone** to change where you are (or use the keyboard: arrows move the quake, Shift + arrows move the phone, Enter plays).
- **Press Play** to watch the fast P wave and the slow S wave spread out, the nearest seismometers trigger, and your phone get the alert.
- **Read the seismogram** under the map: what the nearest station records and how its detector decides "this is an earthquake".
- **Change the settings** (magnitude, depth, how long the system waits before deciding, network delay, how many stations must agree) and see how many seconds of warning you get.
- **Send a truck past a station** to see a false trigger, and why real systems wait for several stations.
- First visit starts a 30-second guided tour; afterwards a recap card explains what you saw and estimates the distance to the quake from the gap between the P and S waves.

## How early warning works, step by step

1. **The fault breaks** at a point underground (the hypocentre) and sends out two kinds of waves.
   The **P wave** is fast (about 6.5 km/s in the upper crust) but usually causes weak shaking.
   The **S wave** is slower (about 3.6 km/s) and carries most of the damaging shaking.
2. **The P wave reaches the nearest seismometers first.** Each station runs an **STA/LTA detector**: it divides the signal energy of the last 0.5 s (short-term average, "what is happening now") by the energy of the last 10 s (long-term average, "what is normal here"). When the P wave arrives, the ratio jumps; above 4 the station triggers. A ratio works in quiet and noisy places alike, which a fixed loudness threshold would not.
3. **Several stations must agree.** One station can be fooled by a truck or a door slam. The network only believes it is an earthquake once K stations (2 by default) have triggered.
4. **The system waits a few seconds of P wave** to estimate the magnitude. A longer window gives a better estimate but less warning.
5. **The alert is sent** through the phone network. Processing and delivery add a couple of seconds.
6. **The race.** Alert time = K-th station trigger + P-wave window + latency. If the S wave reaches you later than that, the difference is your warning. Closer to the epicentre the S wave wins: that area is the **blind zone** (the red dashed circle), where no warning is possible.

The "8 km per second" rule in the recap card follows from the two speeds: the S–P gap grows by 1/3.6 − 1/6.5 ≈ 0.12 s per km, so each second of gap is about 8 km.

## Simplifications and limitations

This is a teaching model, not a forecasting tool.

- **Straight rays, constant speeds.** Waves travel in straight lines at fixed P and S speeds. Real wave speeds change with depth and rock type.
- **Point source.** The quake is a single point. A large earthquake ruptures a fault hundreds of kilometres long over a minute or more, so real systems underestimate big quakes at first.
- **Synthetic seismograms.** The traces are noise plus two decaying wave packets, not real recordings.
- **Simplified magnitude step.** The model only waits for the chosen P-wave window; it does not actually estimate magnitude from the waveform.
- **Rough shaking estimate.** Expected shaking comes from a simplified attenuation formula, loosely mapped to a JMA-style intensity scale. It ignores soil type, which matters a lot in reality.
- **Regular station grid.** Stations sit every 40 km on a grid. Real networks are irregular, and Japan's is denser.

## Code

No build step and no dependencies: plain HTML, CSS and JavaScript modules.

| File | What it does |
| --- | --- |
| `src/physics.js` | P/S travel times from a hypocentre at depth, alert time, warning time, blind-zone radius, simplified shaking model |
| `src/seismogram.js` | Synthetic station record: background noise, weak P packet, strong S packet, optional truck burst |
| `src/stalta.js` | STA/LTA detector and first-trigger search |
| `src/app.js` | Map, station network, K-station rule, animation, seismogram view, tour and recap cards |
| `tests/physics.test.mjs` | Checks travel times, the S–P rule, the blind zone and the detector (`npm test`) |

Run locally with any static server:

```
python3 -m http.server 8000
```

then open http://localhost:8000. Tests need Node 18+: `npm test`.

## Sources

- U.S. Geological Survey, *Earthquake Early Warning overview* (ShakeAlert): https://www.usgs.gov/programs/earthquake-hazards/science/earthquake-early-warning-overview
- Japan Meteorological Agency, *Earthquake Early Warnings*: https://www.jma.go.jp/jma/en/Activities/eew.html
- Allen, R. V. (1978). Automatic earthquake recognition and timing from single traces. *Bulletin of the Seismological Society of America*, 68(5), 1521–1532. (The STA/LTA detector.)
