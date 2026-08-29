# orbit

A true-scale interactive demonstration of the Earth orbiting the Sun, built with Three.js. Open `index.html` in a browser.

## Features

- True scale: Sun radius = 109.2 Earth radii, orbit = 23,481 Earth radii (1 AU)
- Earth's rotation locked to the real 365.25:1 ratio (spins per orbit)
- Day-of-year counter with seasons derived from the Sun's declination
- Observer view: stand on the Earth's surface at any latitude, watch the Big Dipper wheel around Polaris
- Annual view: fixed local time — only the ~1°/day orbital drift remains
- Big Dipper (7 real stars + Alcor), the Taoist nine-star Dipper (洞明/隐元), Polaris, starfield
- i18n (device-language detection, English default), collapsible HUD

## Design decisions

### Star catalog: where the camera is based (2026)

When a star is chosen from the "Go to:" catalog, the camera framing follows
**Option 2 — Earth-relative, camera orbits**:

- The camera keeps its **current distance from the Earth** (the user's zoom is preserved).
- It flies to the **Earth–star line with a small lateral offset**, so the chosen
  star is centered in the view and the **Earth stays visible at the edge**
  (the same composition style as the default Sun framing, generalized to any object).
- The fly-to animation recomputes the framing against the Earth's *current*
  position each frame, so the moving planet can't leave the camera stranded.

Rejected alternatives:
- **Option 1 (star-centered):** camera rotates in place; the star is centered but
  the Earth leaves the frame (no spatial context).
- **Option 3 (earth-centered):** Earth stays centered and the star appears at the
  view's edge — the star is never truly "pointed at".

Rationale: the demo's identity is Earth-relative, and pointing at a star is only
useful when you can still see *where* that star is relative to Earth.

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
