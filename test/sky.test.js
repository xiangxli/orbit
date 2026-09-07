// Whole-chain checks against history, using the generated star data:
// pole stars of past epochs, and the four "mid-sky stars at dusk" of the
// Yaodian (尚书·尧典 四仲中星), which fit the sky of roughly 2000 BC.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const A = require('../astro.js');

const ctx = {};
vm.createContext(ctx);
for (const f of ['stars.js', 'constellations.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx);
}
const STARS = ctx.STAR_DATA;
const CONS = ctx.CONSTELLATION_DATA;
const byHip = new Map(STARS.stars.map((s) => [s[0], s]));

test('data: catalog, names and lines are consistent', () => {
  assert.ok(STARS.stars.length > 5000, 'about 5,000 stars');
  assert.ok(CONS.length >= 300, 'about 300 xingguan');
  assert.equal(STARS.zh[54061], '天枢', 'Dubhe');
  assert.equal(STARS.zh[72607], '帝', 'Kochab');
  assert.equal(STARS.zh[46390], '星宿一', 'Alphard');
  assert.equal(STARS.en[32349], 'Sirius');
  const missing = new Set();
  let refs = 0;
  for (const c of CONS) {
    assert.ok(c.zh, `xingguan ${c.id} ${c.en} has a Chinese name`);
    for (const seg of c.lines) for (const h of seg) { refs++; if (!byHip.has(h)) missing.add(h); }
  }
  assert.ok(refs > 1500);
  assert.ok(missing.size <= 3, `line stars missing from the catalog: ${[...missing]}`);
  const beidou = CONS.find((c) => c.zh === '北斗');
  // (JSON compare: the data arrays come from another vm realm)
  assert.equal(JSON.stringify(beidou.lines[0]), JSON.stringify([54061, 53910, 58001, 59774, 62956, 65378, 67301]));
});

// Nearest catalog star brighter than V 4.5 to the mean pole of date.
function poleStar(year) {
  const tt = A.jdTTfromUT(A.calendarToJD({ year, month: 1, day: 1 }));
  const pole = A.poleOfDate(tt);
  let best = null, bd = 1e9;
  for (const s of STARS.stars) {
    if (!s[0] || s[3] > 4.5) continue;
    const d = A.angularDistance(pole, A.sphToVec(s[1], s[2]));
    if (d < bd) { bd = d; best = s; }
  }
  return { hip: best[0], dist: bd };
}

test('pole star of the epoch: Polaris now, Thuban in 2800 BC', () => {
  const now = poleStar(2000);
  assert.equal(now.hip, 11767, 'Polaris');
  assert.ok(now.dist < 0.8);
  const old = poleStar(-2800);
  assert.equal(old.hip, 68756, 'Thuban (右枢)');
  assert.ok(old.dist < 0.2);
  assert.ok(poleStar(-1000).hip !== 11767, 'Polaris was not the pole star in 1000 BC');
});

// Sun longitude -> UT Julian Day in a given year (Newton steps on the mean rate).
function jdOfSunLongitude(targetDeg, year) {
  let jd = A.calendarToJD({ year, month: 1, day: 1 });
  for (let i = 0; i < 50; i++) {
    const d = ((targetDeg - A.sunPosition(A.jdTTfromUT(jd)).lon) % 360 + 540) % 360 - 180;
    if (Math.abs(d) < 1e-4) break;
    jd += d * 365.25 / 360;
  }
  return jd;
}
// Evening civil dusk (Sun altitude -6°) on the local day containing jd0.
function duskJd(jd0, lat, lon) {
  const localNoon = Math.floor(jd0 + lon / 360 - 0.5) + 1 - lon / 360;
  const alt = (jd) => A.j2000ToHorizontal(A.sunVectorJ2000(A.jdTTfromUT(jd)).v, jd, lat, lon).alt;
  let lo = localNoon, hi = localNoon + 0.5;
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (alt(mid) > -6) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
function hourAngleAtDusk(hip, sunLon, year, lat, lon) {
  const jd = duskJd(jdOfSunLongitude(sunLon, year), lat, lon);
  const s = byHip.get(hip);
  const eq = A.vecToSph(A.matVec(A.precessionMatrix(A.jdTTfromUT(jd)), A.sphToVec(s[1], s[2])));
  return ((A.lst(jd, lon) - eq.lon) % 360 + 540) % 360 - 180;
}

test('Yaodian: the four mid-sky stars culminate at dusk around 2000 BC, not around AD 0', () => {
  const lat = 34.34, lon = 108.94;   // Xi'an
  const marks = [
    ['日中星鸟 (spring equinox, 星宿一 Alphard)', 0, 46390],
    ['日永星火 (summer solstice, 心宿二 Antares)', 90, 80763],
    ['宵中星虚 (autumn equinox, 虚宿一 β Aqr)', 180, 106278],
    ['日短星昴 (winter solstice, 昴宿六 Alcyone)', 270, 17702],
  ];
  let sumOld = 0, sumNew = 0;
  for (const [name, sunLon, hip] of marks) {
    const haOld = hourAngleAtDusk(hip, sunLon, -2000, lat, lon);
    const haNew = hourAngleAtDusk(hip, sunLon, 0, lat, lon);
    assert.ok(Math.abs(haOld) < 20, `${name}: hour angle ${haOld.toFixed(1)}° at dusk in 2000 BC`);
    sumOld += Math.abs(haOld);
    sumNew += Math.abs(haNew);
  }
  assert.ok(sumNew > sumOld * 1.5, `fit is much worse in AD 0 (${sumNew.toFixed(0)}° vs ${sumOld.toFixed(0)}°)`);
});
