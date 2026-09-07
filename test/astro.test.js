// Meeus, "Astronomical Algorithms" (2nd ed.) worked examples, plus a few
// physical sanity checks. Run: node --test test/
const { test } = require('node:test');
const assert = require('node:assert/strict');
const A = require('../astro.js');

function near(actual, expected, tol, msg) {
  assert.ok(Math.abs(actual - expected) <= tol,
    `${msg || ''} expected ${expected} ± ${tol}, got ${actual} (diff ${actual - expected})`);
}
// Angle comparison modulo 360.
function nearAngle(actual, expected, tol, msg) {
  let d = ((actual - expected) % 360 + 540) % 360 - 180;
  assert.ok(Math.abs(d) <= tol, `${msg || ''} expected ${expected}° ± ${tol}, got ${actual}° (diff ${d})`);
}
const hms = (h, m, s) => 15 * (h + m / 60 + s / 3600);
const dms = (d, m, s) => Math.sign(d) * (Math.abs(d) + m / 60 + s / 3600);

// ---- Calendar (Meeus ch. 7) ----
test('calendarToJD: Meeus table of JDs', () => {
  const cases = [
    [{ year: 1957, month: 10, day: 4.81 }, 2436116.31],
    [{ year: 333, month: 1, day: 27.5 }, 1842713.0],
    [{ year: 2000, month: 1, day: 1.5 }, 2451545.0],
    [{ year: 1999, month: 1, day: 1.0 }, 2451179.5],
    [{ year: 1987, month: 1, day: 27.0 }, 2446822.5],
    [{ year: 1987, month: 6, day: 19.5 }, 2446966.0],
    [{ year: 1988, month: 1, day: 27.0 }, 2447187.5],
    [{ year: 1988, month: 6, day: 19.5 }, 2447332.0],
    [{ year: 1900, month: 1, day: 1.0 }, 2415020.5],
    [{ year: 1600, month: 1, day: 1.0 }, 2305447.5],
    [{ year: 1600, month: 12, day: 31.0 }, 2305812.5],
    [{ year: 837, month: 4, day: 10.3 }, 2026871.8],
    [{ year: -123, month: 12, day: 31.0 }, 1676496.5],
    [{ year: -122, month: 1, day: 1.0 }, 1676497.5],
    [{ year: -1000, month: 7, day: 12.5 }, 1356001.0],
    [{ year: -1000, month: 2, day: 29.0 }, 1355866.5],
    [{ year: -1001, month: 8, day: 17.9 }, 1355671.4],
    [{ year: -4712, month: 1, day: 1.5 }, 0.0],
  ];
  for (const [c, jd] of cases) near(A.calendarToJD(c), jd, 1e-6, JSON.stringify(c));
});

test('calendarToJD: hour/minute/second and the Gregorian switch', () => {
  near(A.calendarToJD({ year: 1957, month: 10, day: 4, hour: 19, minute: 26, second: 24 }), 2436116.31, 1e-6);
  near(A.calendarToJD({ year: 1582, month: 10, day: 15 }), 2299160.5, 0, '1582-10-15 (first Gregorian day)');
  near(A.calendarToJD({ year: 1582, month: 10, day: 4 }), 2299159.5, 0, '1582-10-04 (last Julian day)');
  near(A.calendarToJD({ year: 2000, month: 1, day: 1.5 }, 'julian'), 2451558.0, 0, 'proleptic Julian 2000');
});

test('jdToCalendar: Meeus examples and round trips', () => {
  let c = A.jdToCalendar(2436116.31);
  assert.deepEqual([c.year, c.month, c.day, c.hour, c.minute], [1957, 10, 4, 19, 26]);
  near(c.second, 24, 0.01);
  c = A.jdToCalendar(1842713.0);
  assert.deepEqual([c.year, c.month, c.day, c.hour, c.calendar], [333, 1, 27, 12, 'julian']);
  c = A.jdToCalendar(1507900.13);
  assert.deepEqual([c.year, c.month, c.day], [-584, 5, 28]);
  near(c.hour + c.minute / 60 + c.second / 3600, 0.63 * 24, 1e-6);
  for (const y of [-3000, -1000, -1, 0, 1, 1582, 1583, 2026, 3000]) {
    const src = { year: y, month: 3, day: 21, hour: 18, minute: 30, second: 0 };
    const back = A.jdToCalendar(A.calendarToJD(src));
    assert.deepEqual([back.year, back.month, back.day, back.hour, back.minute, back.second],
      [y, 3, 21, 18, 30, 0], `round trip ${y}`);
  }
});

// ---- ΔT ----
test('deltaT: anchor values of the Espenak-Meeus fit', () => {
  near(A.deltaT(2000), 63.86, 0.01);
  near(A.deltaT(1900), -2.79, 0.01);
  near(A.deltaT(1000), 1574.2, 0.01);
  near(A.deltaT(0), 10583.6, 0.01);
  near(A.deltaT(-1000), 25428, 30, 'about 7 hours in 1000 BC');
  near(A.deltaT(-3000), 74350, 100);
  near(A.deltaT(2024), 69.2, 5, 'present day within a few seconds');
  // Piecewise fit should be continuous to within a few seconds at the joins.
  for (const y of [-500, 500, 1600, 1700, 1800, 1860, 1900, 1920, 1941, 1961, 1986, 2005, 2050, 2150]) {
    near(A.deltaT(y - 1e-6), A.deltaT(y + 1e-6), 6, `join at ${y}`);
  }
});

// ---- Sidereal time (Meeus ex. 12.a, 12.b) ----
test('gmst', () => {
  nearAngle(A.gmst(2446895.5), hms(13, 10, 46.3668), 1e-5, '1987-04-10 0h UT');
  const jd = A.calendarToJD({ year: 1987, month: 4, day: 10, hour: 19, minute: 21 });
  nearAngle(A.gmst(jd), hms(8, 34, 57.0896), 1e-5, '1987-04-10 19:21 UT');
});

// ---- Obliquity (Meeus ex. 22.a) ----
test('meanObliquity', () => {
  near(A.meanObliquity(A.J2000), 23.4392911, 1e-7);
  near(A.meanObliquity(2446895.5), dms(23, 26, 27.407), 0.01 / 3600);
  near(A.meanObliquity(A.calendarToJD({ year: -3000, month: 1, day: 1 })), 24.03, 0.02, '3000 BC');
});

// ---- Proper motion + precession (Meeus ex. 21.b, θ Persei) ----
test('applyProperMotion and precessFromJ2000: θ Persei to 2028-11-13.19 TD', () => {
  const ra0 = hms(2, 44, 11.986), dec0 = dms(49, 13, 42.48);
  const jd = 2462088.69;
  const years = (jd - A.J2000) / 365.25;
  // Meeus gives μα = 0.03425 s/yr (not cos δ scaled); convert to mas/yr · cos δ.
  const pmRaCosDec = 0.03425 * 15 * Math.cos(dec0 * A.DEG) * 1000;
  const pm = A.applyProperMotion(ra0, dec0, pmRaCosDec, -0.0895 * 1000, years);
  nearAngle(pm.ra, hms(2, 44, 12.975), 1e-5, 'RA with proper motion');
  near(pm.dec, dms(49, 13, 39.90), 1e-5, 'Dec with proper motion');
  const p = A.precessFromJ2000(pm.ra, pm.dec, jd);
  nearAngle(p.lon, hms(2, 46, 11.331), 1e-4, 'precessed RA');
  near(p.lat, dms(49, 20, 54.54), 1e-4, 'precessed Dec');
});

test('precessionMatrix is a rotation; pole/equinox of date are consistent', () => {
  const jd = A.calendarToJD({ year: -1000, month: 1, day: 1 });
  const P = A.precessionMatrix(jd);
  const I = A.mul3(P, A.transpose3(P));
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) near(I[i][j], i === j ? 1 : 0, 1e-12);
  const pole = A.poleOfDate(jd), eq = A.equinoxOfDate(jd);
  near(pole[0] * eq[0] + pole[1] * eq[1] + pole[2] * eq[2], 0, 1e-12, 'pole ⟂ equinox');
  near(A.angularDistance(A.poleOfDate(A.J2000), [0, 0, 1]), 0, 1e-9);
});

test('pole of date: Polaris now, Kochab around 1000 BC, Thuban around 2800 BC', () => {
  const polaris = A.sphToVec(hms(2, 31, 49.09), dms(89, 15, 50.8));
  const kochab = A.sphToVec(hms(14, 50, 42.33), dms(74, 9, 19.8));
  const thuban = A.sphToVec(hms(14, 4, 23.35), dms(64, 22, 33.1));
  const at = (y) => A.poleOfDate(A.calendarToJD({ year: y, month: 1, day: 1 }));
  assert.ok(A.angularDistance(at(2000), polaris) < 0.8, 'Polaris within 0.8° of the pole in 2000');
  assert.ok(A.angularDistance(at(-1000), polaris) > 10, 'Polaris far from the pole in 1000 BC');
  assert.ok(A.angularDistance(at(-1000), kochab) < 8, 'Kochab (帝) near the pole in 1000 BC');
  assert.ok(A.angularDistance(at(-2800), thuban) < 1.5, 'Thuban (右枢) near the pole in 2800 BC');
});

// ---- Coordinate transforms (Meeus ex. 13.a, 13.b, 47.a) ----
test('eqToEcl: Pollux', () => {
  const e = A.eqToEcl(116.328942, 28.026183, 23.4392911);
  near(e.lon, 113.215630, 1e-6);
  near(e.lat, 6.684170, 1e-6);
  const back = A.eclToEq(e.lon, e.lat, 23.4392911);
  near(back.ra, 116.328942, 1e-9);
  near(back.dec, 28.026183, 1e-9);
});

test('eclToEq: Moon apparent position of ex. 47.a', () => {
  const eq = A.eclToEq(133.167265, -3.229126, 23.440636);
  near(eq.ra, 134.688470, 1e-6);
  near(eq.dec, 13.768368, 1e-6);
});

test('eqToHorizontal: Venus from Washington (ex. 13.b)', () => {
  const ra = hms(23, 9, 16.641), dec = -dms(6, 43, 11.61);
  const lst = hms(8, 34, 56.853) - dms(77, 3, 56);   // apparent GST minus west longitude
  const h = A.eqToHorizontal(ra, dec, lst, dms(38, 55, 17));
  near(h.az, 68.0337 + 180, 1e-3, 'azimuth from north');
  near(h.alt, 15.1249, 1e-3, 'altitude');
});

// ---- Sun (Meeus ex. 25.a) ----
test('sunPosition 1992-10-13 0h TD', () => {
  const s = A.sunPosition(2448908.5);
  near(s.L0, 201.80720, 2e-5);
  near(s.M, 278.99397, 2e-5);
  near(s.C, -1.89732, 2e-5);
  near(s.lon, 199.90988, 2e-5, 'true geometric longitude');
  near(s.apparentLon, 199.90895, 2e-5);
  near(s.R, 0.99766, 1e-5);
});

test('sunPosition: solstice and equinox of 2000', () => {
  // 2000 Dec 21 13:37 UT solstice; 2000 Mar 20 07:35 UT equinox (USNO)
  const dec = A.sunPosition(A.jdTTfromUT(A.calendarToJD({ year: 2000, month: 12, day: 21, hour: 13, minute: 37 })));
  nearAngle(dec.lon, 270, 0.02, 'December solstice');
  const mar = A.sunPosition(A.jdTTfromUT(A.calendarToJD({ year: 2000, month: 3, day: 20, hour: 7, minute: 35 })));
  nearAngle(mar.lon, 0, 0.02, 'March equinox');
});

// ---- Moon (Meeus ex. 47.a) ----
test('moonPosition 1992-04-12 0h TD', () => {
  const m = A.moonPosition(2448724.5);
  near(m.Lp, 134.290182, 2e-6);
  near(m.D, 113.842304, 2e-6);
  near(m.M, 97.643514, 2e-6);
  near(m.Mp, 5.150833, 2e-6);
  near(m.F, 219.889721, 2e-6);
  near(m.E, 1.000194, 1e-6);
  near(m.lon, 133.162655, 2e-6, 'longitude');
  near(m.lat, -3.229126, 2e-6, 'latitude');
  near(m.dist, 368409.7, 0.1, 'distance km');
});

// ---- Composite: the whole chain against real events ----
test('2024-04-08 total solar eclipse: Sun and Moon nearly aligned', () => {
  const jd = A.calendarToJD({ year: 2024, month: 4, day: 8, hour: 18, minute: 18 });
  const ill = A.moonIllumination(A.jdTTfromUT(jd));
  assert.ok(ill.elongation < 0.6, `geocentric elongation ${ill.elongation}° should be < 0.6°`);
  assert.ok(ill.fraction < 0.001);
});

test('Sun due east on the horizon at the equinox for a mid-latitude observer', () => {
  // Xi'an (34.27 N, 108.95 E), 2000-03-20, local mean time 06:10 -> UT = 06:10 - 108.95/15 h
  const local = A.calendarToJD({ year: 2000, month: 3, day: 20, hour: 6, minute: 10 });
  const jdUT = local - 108.95 / 15 / 24;
  const sun = A.sunVectorJ2000(A.jdTTfromUT(jdUT));
  const h = A.j2000ToHorizontal(sun.v, jdUT, 34.27, 108.95);
  near(h.alt, 0, 1.0, 'altitude ~0 (no refraction)');
  near(h.az, 90, 1.5, 'azimuth ~east');
});

test('Polaris altitude equals latitude (present day)', () => {
  const polaris = A.sphToVec(hms(2, 31, 49.09), dms(89, 15, 50.8));
  const jd = A.calendarToJD({ year: 2026, month: 9, day: 7, hour: 12 });
  for (const lat of [10, 34.27, 60]) {
    const h = A.j2000ToHorizontal(polaris, jd, lat, 108.95);
    near(h.alt, lat, 0.8, `lat ${lat}`);
  }
});

// ---- Planets (JPL approximate elements) ----
test('planetVectorJ2000: Venus 1992-12-20 0h TD (Meeus ex. 33.a)', () => {
  const jd = 2448976.5;
  const p = A.planetVectorJ2000('venus', jd);
  const eq = A.vecToSph(A.matVec(A.precessionMatrix(jd), p.v));
  nearAngle(eq.lon, hms(21, 4, 41.454), 0.02, 'RA (apparent in Meeus; we are geometric)');
  near(eq.lat, -dms(18, 53, 16.84), 0.02, 'Dec');
  near(p.dist, 0.910845, 0.002, 'distance au');
});

test('Mars at opposition 2022-12-08 05:42 UT: opposite the Sun', () => {
  const jd = A.jdTTfromUT(A.calendarToJD({ year: 2022, month: 12, day: 8, hour: 5, minute: 42 }));
  const mars = A.vecToSph(A.planetVectorJ2000('mars', jd).v);
  const sun = A.vecToSph(A.sunVectorJ2000(jd).v);
  const m = A.eqToEcl(mars.lon, mars.lat, A.EPS_J2000), s = A.eqToEcl(sun.lon, sun.lat, A.EPS_J2000);
  nearAngle(m.lon - s.lon, 180, 0.1, 'ecliptic longitude difference');
  assert.ok(A.planetVectorJ2000('mars', jd).mag < -1.5, 'bright at opposition');
});

test('Great conjunction 2020-12-21: Jupiter and Saturn 0.1° apart', () => {
  const jd = A.jdTTfromUT(A.calendarToJD({ year: 2020, month: 12, day: 21, hour: 18 }));
  const d = A.angularDistance(A.planetVectorJ2000('jupiter', jd).v, A.planetVectorJ2000('saturn', jd).v);
  assert.ok(d < 0.25, `separation ${d.toFixed(3)}°`);
});

test('findMoonPlanetApproach: lunar occultations of Mars, 2022-12-08 (London) and 2025-01-14 (New York)', () => {
  const ev1 = A.findMoonPlanetApproach('mars', A.calendarToJD({ year: 2022, month: 12, day: 1 }), 1, 51.5, -0.13, { maxDays: 60 });
  assert.ok(ev1, 'an approach is found');
  const c1 = A.jdToCalendar(ev1.jd);
  assert.deepEqual([c1.year, c1.month, c1.day], [2022, 12, 8]);
  assert.ok(ev1.occultation, `occultation (sep ${ev1.sep.toFixed(3)}°, Moon radius ${ev1.moonRadius.toFixed(3)}°)`);
  assert.ok(ev1.moonAlt > 0 && ev1.sunAlt < 0, 'visible at night');
  const ev2 = A.findMoonPlanetApproach('mars', A.calendarToJD({ year: 2025, month: 1, day: 1 }), 1, 40.71, -74.01, { maxDays: 60 });
  assert.ok(ev2, 'an approach is found');
  const c2 = A.jdToCalendar(ev2.jd);
  assert.deepEqual([c2.year, c2.month, c2.day], [2025, 1, 14]);
  assert.ok(ev2.occultation, `occultation (sep ${ev2.sep.toFixed(3)}°, Moon radius ${ev2.moonRadius.toFixed(3)}°)`);
  // Backward search from after the event finds the same one
  const back = A.findMoonPlanetApproach('mars', A.calendarToJD({ year: 2025, month: 2, day: 1 }), -1, 40.71, -74.01, { maxDays: 60 });
  near(back.jd, ev2.jd, 0.01, 'backward search agrees');
});
