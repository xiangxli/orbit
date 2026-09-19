# orbit

A true-scale interactive demonstration of the Earth orbiting the Sun, built with Three.js,
plus a **real-sky mode**: pick any date (3000 BC to AD 3000) and any place on Earth and
see that sky, with the Chinese constellations (三垣二十八宿). Open `index.html` in a browser.

## Features

- True scale: Sun radius = 109.2 Earth radii, orbit = 23,481 Earth radii (1 AU)
- Earth's rotation locked to the real 365.25:1 ratio (spins per orbit)
- Day-of-year counter with seasons derived from the Sun's declination
- Observer view: stand on the Earth's surface at any latitude, watch the Big Dipper wheel around Polaris
- Annual view: fixed local time — only the ~1°/day orbital drift remains
- Big Dipper (7 real stars + Alcor), the Taoist nine-star Dipper (洞明/隐元), Polaris, starfield
- i18n (device-language detection, English default), collapsible HUD

### Real sky (date & place)

The page opens with a card of era presets — **Tonight**, the **Yaodian** sky of 2000 BC,
the **Han** dynasty, the **1054 guest star** — or **Custom** (starts tonight and opens the
panel's date fields); **Demo mode** goes to the orbit demonstration (the header switch
toggles between the two). The place is never asked: the page uses the browser's location
when permitted (https), and falls back to Xi'an otherwise — both changeable in the panel.
The panel has collapsible sections (time, place, sky events, display, demo) and a bottom
toolbar with play/pause, rate presets (real time, 1 min/s, wheeling sky, precession), Now
and Tonight. The demo's free-running clock is replaced by a real calendar clock (UT Julian
Day) that drives everything:

- **Date/time**: year (astronomical numbering: 0 = 1 BC, −1 = 2 BC), month, day,
  hour, minute. Julian calendar before 1582-10-15, Gregorian after (or force either).
  Time is local mean solar time by longitude (what "the hour" meant before time zones),
  or UTC. `Now`, ±1 h, ±1 d buttons; a log time-rate slider from real time to ~1 yr per 3 s.
- **Place**: a preset list (historical Chinese capitals first), lat/lon fields, or click
  the globe in the free view.
- **Sky**: 5,159 stars (HYG, V ≤ 6.0 plus every star on a constellation line), colours
  from B−V, halos on the bright ones, proper motion applied; the Milky Way from NASA's
  Deep Star Maps (moonlight and twilight dim it); 318 Chinese xingguan with lines, the 28
  lunar mansions named in gold and the smaller asterisms named once you zoom in; the Moon
  at its true position and distance (phase from the lighting); the Sun.
- **Planets**: the five naked-eye planets (辰星 Mercury, 太白 Venus, 荧惑 Mars, 岁星
  Jupiter, 镇星 Saturn) from JPL's approximate Keplerian elements (Standish & Williams;
  Mars to ~100″ over 3000 BC–3000 AD), with magnitudes, labels, click info and "Go to".
- **Moon meets a planet** (月掩 / 凌 / 犯): pick a planet and press ◀ / ▶ to jump to the
  previous / next close approach visible from the current place, seen from the ground with
  the Moon's parallax (the Moon is a true-scale body at its true distance, so an occultation
  is real 3D geometry). The view zooms to 4°; 掩 = behind the Moon's disc, 凌 = within 0.5°,
  犯 = within 1°. Verified against the lunar occultations of Mars of 2022-12-08 (London)
  and 2025-01-14 (New York).
- **Exploring**: a year slider (3000 BC to AD 3000) and ±1 year / century steps that move by
  whole tropical years (season and time of night stay put, only precession changes),
  ±1 month calendar steps; a ticking clock with play/pause; click any star or planet for
  its names, magnitude, xingguan and altitude/azimuth; a "Go to" list (Sun, Moon, pole,
  planets, the 28 mansions, major asterisms, bright stars) that turns the view; arrow keys
  look around, +/− zoom. Entering real-sky mode in daytime jumps to 21:00 local.
- **Horizon**: a low ridge of hills the stars set behind, and an airglow / twilight band
  that warms up toward the Sun at dusk.
- **Names and lines**: bright stars carry their names (to V 1.5 at wide fields, V 3 when
  zoomed in); toggles for the meridian, the celestial equator of date and the ecliptic.
- **Share**: in real-sky mode the address bar tracks time, place and view
  (`?t=<JD>&lat&lon&az&alt&fov`); "Share link" copies it, and such a link opens straight
  into that sky.
- **Physics**: precession (the pole of date; Thuban was the pole star in 2800 BC, Polaris
  only recently), sidereal time, ΔT, the Earth's true distance from the Sun. No nutation,
  aberration or refraction (all < 1′ except refraction near the horizon).
- **Observer view**: opens facing south (面南背北: east on your left, west on your right,
  the ecliptic in front of you), with horizon and cardinal points; drag to look around,
  wheel/pinch to zoom. Stars fade and the sky turns blue by day.
- Readouts: local sidereal time, Sun altitude/azimuth, Moon phase, and the epoch's pole
  star (nearest star brighter than V 4.5 to the pole of date).

The demo's speed sliders are disabled in real-sky mode (they would break the calendar).

## Files

| File | Role |
|---|---|
| `index.html` | The whole app (Three.js scene, HUD, real-sky mode) |
| `astro.js` | Pure astronomy: calendars/JD, ΔT, sidereal time, obliquity, precession, Sun, Moon, coordinate transforms. Classic script (browser) + CommonJS (node) |
| `stars.js`, `constellations.js`, `milkyway.js` | Generated data (see `tools/build_data.py`); the Milky Way is a base64 JPEG so WebGL can use it from `file://` |
| `test/` | `node --test test/` — Meeus worked examples and historical sanity checks |
| `PLAN.md` | Design decisions and frame conventions for the real-sky mode. Read it before touching the coordinate code |

`astro.js` and the data files are classic scripts, not ES modules, so the page still works
from `file://`. Three.js itself comes from a CDN.

## Data sources and licences

- Star catalog: [HYG v4.1](https://github.com/astronexus/HYG-Database) — CC BY-SA 4.0.
- Chinese constellations and star names: [Stellarium sky culture "chinese"](https://github.com/Stellarium/stellarium-skycultures/tree/master/chinese)
  (lines and names based on Yi Shitong's *Chinese and Western Contrast Star Chart and Catalogue 1950.0*
  and Sun Xiaochun & Kistemaker's *The Chinese Sky during the Han*) — CC BY-SA.
- Milky Way: NASA/Goddard Scientific Visualization Studio, [Deep Star Maps 2020](https://svs.gsfc.nasa.gov/4851)
  (Ernie Wright), `milkyway_2020_4k.exr` converted to sRGB — public domain.
- Planets: E.M. Standish & J.G. Williams, [Approximate Positions of the Planets](https://ssd.jpl.nasa.gov/planets/approx_pos.html), JPL.
- Algorithms: Jean Meeus, *Astronomical Algorithms*, 2nd ed.; ΔT polynomials from Espenak & Meeus.

Regenerate the data files with `python3 tools/build_data.py` after downloading the sources
listed at the top of that script.

## Design decisions

### Star catalog: where the camera is based (2026)

Clicking a star in the "Go to:" catalog uses the **load-view framing** — the
composition the page opens with (Earth centered, the Sun beside it on the left):

- The camera is placed at the same distance (11.5 units) and lateral offset as
  the load view, on the anti-star side of the Earth.
- The **Earth stays centered** and the chosen star appears beside it, in the same
  relative position the Sun occupies on load — as if you had rotated the view
  toward the star (done directly, without animating the rotation).
- The perpendicular is computed in 3D (with a horizontal fallback), so stars high
  in the sky (Polaris, the Dipper) are framed beside the Earth too.

### Orbit direction

The Earth orbits counterclockwise seen from the north ecliptic pole, the same sense
as its spin. (Before the real-sky work the demo orbited clockwise; nothing in the demo
depended on the sense, but the real sky does: the Sun must drift eastward through the
stars.)

## Notes: sidereal day vs solar day, and the 365 vs 366 count

This section records the astronomy behind the demo's rotation ratio and the apparent
motion of the stars (e.g., the Big Dipper around Polaris).

### The two motions

1. **Diurnal motion** — the whole sky appears to rotate around the celestial pole
   once per day. This is caused by the Earth's *spin*, not by the stars moving:
   a fixed observer on the spinning Earth turns their frame of reference, so the
   sky appears to wheel around the spin axis (which points at Polaris).
2. **Annual motion** — at the *same clock time* each night, the sky is slightly
   further advanced: ~1°/day, completing exactly one full circle per year.
   This is the *orbital* component. Orbiting translates the observer but does
   not rotate them relative to the stars, so it can only contribute a slow drift
   (parallax of the Dipper is ~0.03 arcseconds — utterly invisible).

### Why the solar day is 4 minutes longer than the sidereal day

- **Sidereal day** = 23 h 56 m 4 s — the Earth's rotation relative to the stars.
- **Solar day** = 24 h — rotation relative to the Sun.

While the Earth rotates, it also advances ~1/365 of its orbit per day, so the
Sun's direction drifts ~0.986° eastward each day. After one full rotation the
Earth hasn't caught up to the Sun — it must rotate an extra ~0.986°, which takes
~4 minutes:

> solar day = sidereal day + ~4 minutes

### Why the sky shifts ~1°/day at a fixed clock time

At the same clock time each night your meridian is aligned with the Sun, but the
stars complete one rotation per *sidereal* day (4 minutes shorter). So each night
the sky is 0.986° further advanced — about two full-moon widths. Over a month
that is ~30°, the whole length of the Big Dipper.

### Why it closes exactly: 365 vs 366

- 365 solar days × 24 h = 8,760 hours
- 366 sidereal days × 23.9345 h = 8,760 hours exactly

A calendar year contains exactly **366 sidereal rotations** — one more than the
365 solar days. The accumulated 4-minutes-per-day drift therefore sums to exactly
one full rotation per year, and every constellation returns to the identical
orientation at the same clock time one year later. This is why the Big Dipper
completes one circle around Polaris per year at a fixed time (high in the north
on spring evenings, low in autumn), while during a single night it circles once
per day.

### The general rule

For any planet with prograde rotation:

> **N_sidereal = N_solar + 1** (per orbit)

The "+1" is the orbit itself: as the planet travels 360° around its star, the
star's direction sweeps 360° against the background sky, "stealing" one day from
the spin count relative to the stars. (For retrograde rotators like Venus:
N_sidereal = N_solar − 1.)

The demo models this exactly: the rotation speed slider is "% of the real rate",
so at 100% the Earth completes 365.25 rotations per orbit — the same ratio that
produces the 1°/day annual drift of the Dipper around Polaris.
