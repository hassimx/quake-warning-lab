# Quake Warning Lab

How can your phone warn you seconds *before* an earthquake's shaking arrives?

Quake Warning Lab is an interactive browser model of earthquake early warning (EEW). Place an earthquake on the map, drag your phone, and watch the fast P wave and the slow, damaging S wave spread out. The model computes when the nearest seismometer detects the P wave, when the alert reaches your phone, and how many seconds you get before the shaking starts, or whether you are inside the "blind zone" where no warning is possible.

## Run locally

No build step. Serve the folder with any static server, for example:

```
python3 -m http.server 8000
```

and open http://localhost:8000.

## How it works (so far)

- `src/physics.js`: travel times of P (6.5 km/s) and S (3.6 km/s) waves from a hypocentre at depth, alert time (first P detection + P-wave window + latency), warning time, blind-zone radius and a simplified shaking model.
- `src/app.js`: the map, stations, wavefront animation and the timeline.
- `src/seismogram.js`: synthetic record at a station (background noise, weak P packet, strong S packet), starting 15 s before the quake so the detector has a normal baseline.
- `src/stalta.js`: STA/LTA detector. Short-term energy (0.5 s) divided by long-term energy (10 s); the station triggers when the ratio reaches 4. Detection time from this detector, not the exact P arrival, now drives the alert.
