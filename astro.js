// astro.js — pure astronomy for the historical-sky feature. No dependencies.
//
// Loaded as a classic <script> in the browser (exposes window.Astro) so the page
// keeps working from file://, and as CommonJS under node for the tests
// (`node --test test/`). Every algorithm cites its chapter in Meeus,
// "Astronomical Algorithms" (2nd ed.); the tests reproduce the book's examples.
//
// Conventions
//   angles      : degrees in and out, unless the name says Rad
//   jd          : Julian Day (UT). Functions that need dynamical time take jdTT.
//   year        : astronomical numbering (0 = 1 BC, -1 = 2 BC, ...)
//   longitude   : east positive
//   vectors     : [x, y, z] unit vectors in the equatorial frame (x = equinox,
//                 z = north celestial pole); "J2000" = J2000.0 mean equator/equinox
//   matrices    : 3x3 row-major, M[row][col]; v' = M · v
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Astro = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEG = Math.PI / 180;
  const RAD = 180 / Math.PI;
  const J2000 = 2451545.0;                 // 2000 Jan 1.5 TT
  const JULIAN_CENTURY = 36525;
  const GREGORIAN_START_JD = 2299160.5;    // 1582 Oct 15, 0h
  const EPS_J2000 = 23.4392911;            // mean obliquity at J2000 (deg)

  const norm360 = (x) => { x %= 360; return x < 0 ? x + 360 : x; };
  const sin = (d) => Math.sin(d * DEG);
  const cos = (d) => Math.cos(d * DEG);

  // ---------------------------------------------------------------------------
  // Calendar  (Meeus ch. 7)
  // ---------------------------------------------------------------------------

  // calendar: 'auto' (Julian before 1582-10-15, Gregorian after), 'julian', 'gregorian'.
  function isGregorianDate(year, month, day) {
    return year > 1582 || (year === 1582 && (month > 10 || (month === 10 && day >= 15)));
  }

  function calendarToJD({ year, month, day, hour = 0, minute = 0, second = 0 }, calendar = 'auto') {
    const gregorian = calendar === 'auto' ? isGregorianDate(year, month, day) : calendar === 'gregorian';
    let Y = year, M = month;
    const D = day + (hour + minute / 60 + second / 3600) / 24;
    if (M <= 2) { Y -= 1; M += 12; }
    let B = 0;
    if (gregorian) {
      const A = Math.floor(Y / 100);
      B = 2 - A + Math.floor(A / 4);
    }
    return Math.floor(365.25 * (Y + 4716)) + Math.floor(30.6001 * (M + 1)) + D + B - 1524.5;
  }

  function jdToCalendar(jd, calendar = 'auto') {
    const gregorian = calendar === 'auto' ? jd >= GREGORIAN_START_JD : calendar === 'gregorian';
    // Work in integer milliseconds of the day to avoid 59.99999 s artifacts.
    const jd05 = jd + 0.5;
    let Z = Math.floor(jd05);
    let ms = Math.round((jd05 - Z) * 86400000);
    if (ms >= 86400000) { ms -= 86400000; Z += 1; }
    let A = Z;
    if (gregorian) {
      const alpha = Math.floor((Z - 1867216.25) / 36524.25);
      A = Z + 1 + alpha - Math.floor(alpha / 4);
    }
    const B = A + 1524;
    const C = Math.floor((B - 122.1) / 365.25);
    const D = Math.floor(365.25 * C);
    const E = Math.floor((B - D) / 30.6001);
    const day = B - D - Math.floor(30.6001 * E);
    const month = E < 14 ? E - 1 : E - 13;
    const year = month > 2 ? C - 4716 : C - 4715;
    const hour = Math.floor(ms / 3600000);
    const minute = Math.floor((ms % 3600000) / 60000);
    const second = (ms % 60000) / 1000;
    return { year, month, day, hour, minute, second, calendar: gregorian ? 'gregorian' : 'julian' };
  }

  // Decimal year (used by deltaT): year + (month - 0.5) / 12, as in Espenak & Meeus.
  function decimalYear(jd) {
    const c = jdToCalendar(jd);
    return c.year + (c.month - 0.5) / 12;
  }

  // ---------------------------------------------------------------------------
  // ΔT = TT − UT  (seconds).  Espenak & Meeus polynomial fit (NASA eclipse site).
  // ---------------------------------------------------------------------------
  function deltaT(y) {
    let t, u;
    if (y < -500) {
      u = (y - 1820) / 100;
      return -20 + 32 * u * u;
    }
    if (y < 500) {
      u = y / 100;
      return 10583.6 - 1014.41 * u + 33.78311 * u ** 2 - 5.952053 * u ** 3
        - 0.1798452 * u ** 4 + 0.022174192 * u ** 5 + 0.0090316521 * u ** 6;
    }
    if (y < 1600) {
      u = (y - 1000) / 100;
      return 1574.2 - 556.01 * u + 71.23472 * u ** 2 + 0.319781 * u ** 3
        - 0.8503463 * u ** 4 - 0.005050998 * u ** 5 + 0.0083572073 * u ** 6;
    }
    if (y < 1700) {
      t = y - 1600;
      return 120 - 0.9808 * t - 0.01532 * t ** 2 + t ** 3 / 7129;
    }
    if (y < 1800) {
      t = y - 1700;
      return 8.83 + 0.1603 * t - 0.0059285 * t ** 2 + 0.00013336 * t ** 3 - t ** 4 / 1174000;
    }
    if (y < 1860) {
      t = y - 1800;
      return 13.72 - 0.332447 * t + 0.0068612 * t ** 2 + 0.0041116 * t ** 3 - 0.00037436 * t ** 4
        + 0.0000121272 * t ** 5 - 0.0000001699 * t ** 6 + 0.000000000875 * t ** 7;
    }
    if (y < 1900) {
      t = y - 1860;
      return 7.62 + 0.5737 * t - 0.251754 * t ** 2 + 0.01680668 * t ** 3
        - 0.0004473624 * t ** 4 + t ** 5 / 233174;
    }
    if (y < 1920) {
      t = y - 1900;
      return -2.79 + 1.494119 * t - 0.0598939 * t ** 2 + 0.0061966 * t ** 3 - 0.000197 * t ** 4;
    }
    if (y < 1941) {
      t = y - 1920;
      return 21.20 + 0.84493 * t - 0.076100 * t ** 2 + 0.0020936 * t ** 3;
    }
    if (y < 1961) {
      t = y - 1950;
      return 29.07 + 0.407 * t - t ** 2 / 233 + t ** 3 / 2547;
    }
    if (y < 1986) {
      t = y - 1975;
      return 45.45 + 1.067 * t - t ** 2 / 260 - t ** 3 / 718;
    }
    if (y < 2005) {
      t = y - 2000;
      return 63.86 + 0.3345 * t - 0.060374 * t ** 2 + 0.0017275 * t ** 3
        + 0.000651814 * t ** 4 + 0.00002373599 * t ** 5;
    }
    if (y < 2050) {
      t = y - 2000;
      return 62.92 + 0.32217 * t + 0.005589 * t ** 2;
    }
    if (y < 2150) {
      u = (y - 1820) / 100;
      return -20 + 32 * u * u - 0.5628 * (2150 - y);
    }
    u = (y - 1820) / 100;
    return -20 + 32 * u * u;
  }

  // TT Julian Day from a UT Julian Day.
  function jdTTfromUT(jdUT) {
    return jdUT + deltaT(decimalYear(jdUT)) / 86400;
  }

  // ---------------------------------------------------------------------------
  // Sidereal time  (Meeus 12.4)
  // ---------------------------------------------------------------------------
  function gmst(jdUT) {
    const d = jdUT - J2000;
    const T = d / JULIAN_CENTURY;
    return norm360(280.46061837 + 360.98564736629 * d + 0.000387933 * T * T - T * T * T / 38710000);
  }

  // Local mean sidereal time (deg). lon east-positive.
  function lst(jdUT, lon) {
    return norm360(gmst(jdUT) + lon);
  }

  // ---------------------------------------------------------------------------
  // Mean obliquity of the ecliptic  (Meeus 22.3, Laskar; good for ±10,000 yr)
  // ---------------------------------------------------------------------------
  function meanObliquity(jdTT) {
    const U = (jdTT - J2000) / (JULIAN_CENTURY * 100);
    const arcsec = 84381.448
      - 4680.93 * U - 1.55 * U ** 2 + 1999.25 * U ** 3 - 51.38 * U ** 4 - 249.67 * U ** 5
      - 39.05 * U ** 6 + 7.12 * U ** 7 + 27.87 * U ** 8 + 5.79 * U ** 9 + 2.45 * U ** 10;
    return arcsec / 3600;
  }

  // ---------------------------------------------------------------------------
  // Small linear algebra
  // ---------------------------------------------------------------------------
  function rotX(a) { const c = cos(a), s = sin(a); return [[1, 0, 0], [0, c, -s], [0, s, c]]; }
  function rotY(a) { const c = cos(a), s = sin(a); return [[c, 0, s], [0, 1, 0], [-s, 0, c]]; }
  function rotZ(a) { const c = cos(a), s = sin(a); return [[c, -s, 0], [s, c, 0], [0, 0, 1]]; }

  function mul3(A, B) {
    const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++)
        M[i][j] = A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j];
    return M;
  }
  function transpose3(M) {
    return [[M[0][0], M[1][0], M[2][0]], [M[0][1], M[1][1], M[2][1]], [M[0][2], M[1][2], M[2][2]]];
  }
  function matVec(M, v) {
    return [
      M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2],
      M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2],
      M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2],
    ];
  }

  // Spherical (lon/RA, lat/Dec in deg) <-> unit vector.
  function sphToVec(lon, lat) {
    const cl = cos(lat);
    return [cl * cos(lon), cl * sin(lon), sin(lat)];
  }
  function vecToSph(v) {
    const r = Math.hypot(v[0], v[1], v[2]) || 1;
    return {
      lon: norm360(Math.atan2(v[1], v[0]) * RAD),
      lat: Math.asin(Math.max(-1, Math.min(1, v[2] / r))) * RAD,
    };
  }
  function angularDistance(a, b) {
    const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const cx = a[1] * b[2] - a[2] * b[1];
    const cy = a[2] * b[0] - a[0] * b[2];
    const cz = a[0] * b[1] - a[1] * b[0];
    return Math.atan2(Math.hypot(cx, cy, cz), dot) * RAD;
  }

  // ---------------------------------------------------------------------------
  // Precession  (Meeus 21.2–21.4, Lieske et al. 1977; starting epoch J2000)
  // ---------------------------------------------------------------------------
  function precessionAngles(jdTT) {
    const t = (jdTT - J2000) / JULIAN_CENTURY;
    return {
      zeta: (2306.2181 * t + 0.30188 * t * t + 0.017998 * t * t * t) / 3600,
      z: (2306.2181 * t + 1.09468 * t * t + 0.018203 * t * t * t) / 3600,
      theta: (2004.3109 * t - 0.42665 * t * t - 0.041833 * t * t * t) / 3600,
    };
  }

  // P such that v_date = P · v_J2000  (mean equator & equinox of date).
  // Equivalent to Meeus 21.4: rotate RA by ζ, tilt by θ about y, rotate RA by z.
  function precessionMatrix(jdTT) {
    const { zeta, z, theta } = precessionAngles(jdTT);
    return mul3(mul3(rotZ(z), rotY(-theta)), rotZ(zeta));
  }

  function precessFromJ2000(ra, dec, jdTT) {
    return vecToSph(matVec(precessionMatrix(jdTT), sphToVec(ra, dec)));
  }

  // Direction of the mean pole / mean equinox of date, in J2000 equatorial coords.
  function poleOfDate(jdTT) { return matVec(transpose3(precessionMatrix(jdTT)), [0, 0, 1]); }
  function equinoxOfDate(jdTT) { return matVec(transpose3(precessionMatrix(jdTT)), [1, 0, 0]); }

  // Proper motion, linear. pmRaCosDec and pmDec in mas/yr (Hipparcos/HYG convention).
  function applyProperMotion(ra, dec, pmRaCosDec, pmDec, years) {
    const cd = cos(dec) || 1e-9;
    return {
      ra: norm360(ra + (pmRaCosDec / 3600000 / cd) * years),
      dec: dec + (pmDec / 3600000) * years,
    };
  }

  // ---------------------------------------------------------------------------
  // Coordinate transforms  (Meeus ch. 13)
  // ---------------------------------------------------------------------------
  function eclToEq(lon, lat, eps) {
    const ra = Math.atan2(sin(lon) * cos(eps) - Math.tan(lat * DEG) * sin(eps), cos(lon)) * RAD;
    const dec = Math.asin(sin(lat) * cos(eps) + cos(lat) * sin(eps) * sin(lon)) * RAD;
    return { ra: norm360(ra), dec };
  }
  function eqToEcl(ra, dec, eps) {
    const lon = Math.atan2(sin(ra) * cos(eps) + Math.tan(dec * DEG) * sin(eps), cos(ra)) * RAD;
    const lat = Math.asin(sin(dec) * cos(eps) - cos(dec) * sin(eps) * sin(ra)) * RAD;
    return { lon: norm360(lon), lat };
  }

  // Equatorial -> horizontal. lstDeg = local sidereal time, lat = geographic latitude.
  // Azimuth from north through east (0 = N, 90 = E); altitude geometric (no refraction).
  function eqToHorizontal(ra, dec, lstDeg, lat) {
    const H = lstDeg - ra;
    const azSouth = Math.atan2(sin(H), cos(H) * sin(lat) - Math.tan(dec * DEG) * cos(lat)) * RAD;
    const alt = Math.asin(sin(lat) * sin(dec) + cos(lat) * cos(dec) * cos(H)) * RAD;
    return { az: norm360(azSouth + 180), alt };
  }

  // ---------------------------------------------------------------------------
  // Sun  (Meeus ch. 25, low precision: 0.01° near the present)
  // ---------------------------------------------------------------------------
  // Returns geometric true longitude (mean equinox of date), apparent longitude,
  // distance R in AU, plus the intermediate mean anomaly M and equation of centre C.
  function sunPosition(jdTT) {
    const T = (jdTT - J2000) / JULIAN_CENTURY;
    const L0 = norm360(280.46646 + 36000.76983 * T + 0.0003032 * T * T);
    const M = norm360(357.52911 + 35999.05029 * T - 0.0001537 * T * T);
    const e = 0.016708634 - 0.000042037 * T - 0.0000001267 * T * T;
    const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * sin(M)
      + (0.019993 - 0.000101 * T) * sin(2 * M)
      + 0.000289 * sin(3 * M);
    const lon = norm360(L0 + C);
    const nu = M + C;
    const R = 1.000001018 * (1 - e * e) / (1 + e * cos(nu));
    const Omega = 125.04 - 1934.136 * T;
    const apparentLon = norm360(lon - 0.00569 - 0.00478 * sin(Omega));
    return { lon, apparentLon, R, M, C, L0, e };
  }

  // ---------------------------------------------------------------------------
  // Moon  (Meeus ch. 47, full ELP-2000/82 truncation from the book)
  // ---------------------------------------------------------------------------
  // Table 47.A: D, M, M', F, Σl (1e-6 deg), Σr (1e-3 km)
  const MOON_LR = [
    [0, 0, 1, 0, 6288774, -20905355],
    [2, 0, -1, 0, 1274027, -3699111],
    [2, 0, 0, 0, 658314, -2955968],
    [0, 0, 2, 0, 213618, -569925],
    [0, 1, 0, 0, -185116, 48888],
    [0, 0, 0, 2, -114332, -3149],
    [2, 0, -2, 0, 58793, 246158],
    [2, -1, -1, 0, 57066, -152138],
    [2, 0, 1, 0, 53322, -170733],
    [2, -1, 0, 0, 45758, -204586],
    [0, 1, -1, 0, -40923, -129620],
    [1, 0, 0, 0, -34720, 108743],
    [0, 1, 1, 0, -30383, 104755],
    [2, 0, 0, -2, 15327, 10321],
    [0, 0, 1, 2, -12528, 0],
    [0, 0, 1, -2, 10980, 79661],
    [4, 0, -1, 0, 10675, -34782],
    [0, 0, 3, 0, 10034, -23210],
    [4, 0, -2, 0, 8548, -21636],
    [2, 1, -1, 0, -7888, 24208],
    [2, 1, 0, 0, -6766, 30824],
    [1, 0, -1, 0, -5163, -8379],
    [1, 1, 0, 0, 4987, -16675],
    [2, -1, 1, 0, 4036, -12831],
    [2, 0, 2, 0, 3994, -10445],
    [4, 0, 0, 0, 3861, -11650],
    [2, 0, -3, 0, 3665, 14403],
    [0, 1, -2, 0, -2689, -7003],
    [2, 0, -1, 2, -2602, 0],
    [2, -1, -2, 0, 2390, 10056],
    [1, 0, 1, 0, -2348, 6322],
    [2, -2, 0, 0, 2236, -9884],
    [0, 1, 2, 0, -2120, 5751],
    [0, 2, 0, 0, -2069, 0],
    [2, -2, -1, 0, 2048, -4950],
    [2, 0, 1, -2, -1773, 4130],
    [2, 0, 0, 2, -1595, 0],
    [4, -1, -1, 0, 1215, -3958],
    [0, 0, 2, 2, -1110, 0],
    [3, 0, -1, 0, -892, 3258],
    [2, 1, 1, 0, -810, 2616],
    [4, -1, -2, 0, 759, -1897],
    [0, 2, -1, 0, -713, -2117],
    [2, 2, -1, 0, -700, 2354],
    [2, 1, -2, 0, 691, 0],
    [2, -1, 0, -2, 596, 0],
    [4, 0, 1, 0, 549, -1423],
    [0, 0, 4, 0, 537, -1117],
    [4, -1, 0, 0, 520, -1571],
    [1, 0, -2, 0, -487, -1739],
    [2, 1, 0, -2, -399, 0],
    [0, 0, 2, -2, -381, -4421],
    [1, 1, 1, 0, 351, 0],
    [3, 0, -2, 0, -340, 0],
    [4, 0, -3, 0, 330, 0],
    [2, -1, 2, 0, 327, 0],
    [0, 2, 1, 0, -323, 1165],
    [1, 1, -1, 0, 299, 0],
    [2, 0, 3, 0, 294, 0],
    [2, 0, -1, -2, 0, 8752],
  ];
  // Table 47.B: D, M, M', F, Σb (1e-6 deg)
  const MOON_B = [
    [0, 0, 0, 1, 5128122],
    [0, 0, 1, 1, 280602],
    [0, 0, 1, -1, 277693],
    [2, 0, 0, -1, 173237],
    [2, 0, -1, 1, 55413],
    [2, 0, -1, -1, 46271],
    [2, 0, 0, 1, 32573],
    [0, 0, 2, 1, 17198],
    [2, 0, 1, -1, 9266],
    [0, 0, 2, -1, 8822],
    [2, -1, 0, -1, 8216],
    [2, 0, -2, -1, 4324],
    [2, 0, 1, 1, 4200],
    [2, 1, 0, -1, -3359],
    [2, -1, -1, 1, 2463],
    [2, -1, 0, 1, 2211],
    [2, -1, -1, -1, 2065],
    [0, 1, -1, -1, -1870],
    [4, 0, -1, -1, 1828],
    [0, 1, 0, 1, -1794],
    [0, 0, 0, 3, -1749],
    [0, 1, -1, 1, -1565],
    [1, 0, 0, 1, -1491],
    [0, 1, 1, 1, -1475],
    [0, 1, 1, -1, -1410],
    [0, 1, 0, -1, -1344],
    [1, 0, 0, -1, -1335],
    [0, 0, 3, 1, 1107],
    [4, 0, 0, -1, 1021],
    [4, 0, -1, 1, 833],
    [0, 0, 1, -3, 777],
    [4, 0, -2, 1, 671],
    [2, 0, 0, -3, 607],
    [2, 0, 2, -1, 596],
    [2, -1, 1, -1, 491],
    [2, 0, -2, 1, -451],
    [0, 0, 3, -1, 439],
    [2, 0, 2, 1, 422],
    [2, 0, -3, -1, 421],
    [2, 1, -1, 1, -366],
    [2, 1, 0, 1, -351],
    [4, 0, 0, 1, 331],
    [2, -1, 1, 1, 315],
    [2, -2, 0, -1, 302],
    [0, 0, 1, 3, -283],
    [2, 1, 1, -1, -229],
    [1, 1, 0, -1, 223],
    [1, 1, 0, 1, 223],
    [0, 1, -2, -1, -220],
    [2, 1, -1, -1, -220],
    [1, 0, 1, 1, -185],
    [2, -1, -2, -1, 181],
    [0, 1, 2, 1, -177],
    [4, 0, -2, -1, 176],
    [4, -1, -1, -1, 166],
    [1, 0, 1, -1, -164],
    [4, 0, 1, -1, 132],
    [1, 0, -1, -1, -119],
    [4, -1, 0, -1, 115],
    [2, -2, 0, 1, 107],
  ];

  // Geocentric ecliptic longitude/latitude (mean equinox of date, deg) and
  // distance (km). Plus the fundamental arguments for callers that want them.
  function moonPosition(jdTT) {
    const T = (jdTT - J2000) / JULIAN_CENTURY;
    const T2 = T * T, T3 = T2 * T, T4 = T3 * T;
    const Lp = norm360(218.3164477 + 481267.88123421 * T - 0.0015786 * T2 + T3 / 538841 - T4 / 65194000);
    const D = norm360(297.8501921 + 445267.1114034 * T - 0.0018819 * T2 + T3 / 545868 - T4 / 113065000);
    const M = norm360(357.5291092 + 35999.0502909 * T - 0.0001536 * T2 + T3 / 24490000);
    const Mp = norm360(134.9633964 + 477198.8675055 * T + 0.0087414 * T2 + T3 / 69699 - T4 / 14712000);
    const F = norm360(93.2720950 + 483202.0175233 * T - 0.0036539 * T2 - T3 / 3526000 + T4 / 863310000);
    const A1 = norm360(119.75 + 131.849 * T);
    const A2 = norm360(53.09 + 479264.290 * T);
    const A3 = norm360(313.45 + 481266.484 * T);
    const E = 1 - 0.002516 * T - 0.0000074 * T2;
    const E2 = E * E;

    let sl = 0, sr = 0, sb = 0;
    for (const [d, m, mp, f, l, r] of MOON_LR) {
      const arg = d * D + m * M + mp * Mp + f * F;
      const k = m === 0 ? 1 : (Math.abs(m) === 1 ? E : E2);
      sl += k * l * sin(arg);
      sr += k * r * cos(arg);
    }
    for (const [d, m, mp, f, b] of MOON_B) {
      const arg = d * D + m * M + mp * Mp + f * F;
      const k = m === 0 ? 1 : (Math.abs(m) === 1 ? E : E2);
      sb += k * b * sin(arg);
    }
    sl += 3958 * sin(A1) + 1962 * sin(Lp - F) + 318 * sin(A2);
    sb += -2235 * sin(Lp) + 382 * sin(A3) + 175 * sin(A1 - F) + 175 * sin(A1 + F)
      + 127 * sin(Lp - Mp) - 115 * sin(Lp + Mp);

    return {
      lon: norm360(Lp + sl / 1e6),
      lat: sb / 1e6,
      dist: 385000.56 + sr / 1000,
      Lp, D, M, Mp, F, E,
    };
  }

  // ---------------------------------------------------------------------------
  // Composite helpers: everything in J2000 equatorial vectors, for the scene.
  // ---------------------------------------------------------------------------

  // Ecliptic-of-date (lon, lat) -> J2000 equatorial unit vector.
  function eclipticOfDateToJ2000(lon, lat, jdTT) {
    const eps = meanObliquity(jdTT);
    const { ra, dec } = eclToEq(lon, lat, eps);
    return matVec(transpose3(precessionMatrix(jdTT)), sphToVec(ra, dec));
  }

  // Sun: geocentric direction (unit vector, J2000 equatorial) and distance (AU).
  function sunVectorJ2000(jdTT) {
    const s = sunPosition(jdTT);
    return { v: eclipticOfDateToJ2000(s.lon, 0, jdTT), R: s.R, lon: s.lon };
  }

  // Moon: geocentric direction (unit vector, J2000 equatorial) and distance (km).
  function moonVectorJ2000(jdTT) {
    const m = moonPosition(jdTT);
    return { v: eclipticOfDateToJ2000(m.lon, m.lat, jdTT), dist: m.dist, lon: m.lon, lat: m.lat };
  }

  // Moon phase angle helpers: elongation from the Sun (deg) and illuminated fraction.
  function moonIllumination(jdTT) {
    const s = sunVectorJ2000(jdTT), m = moonVectorJ2000(jdTT);
    const elong = angularDistance(s.v, m.v);
    return { elongation: elong, fraction: (1 - cos(elong)) / 2 };
  }

  // Horizontal coordinates of a J2000 direction for an observer.
  function j2000ToHorizontal(v, jdUT, lat, lon) {
    const tt = jdTTfromUT(jdUT);
    const { lon: ra, lat: dec } = vecToSph(matVec(precessionMatrix(tt), v));
    return eqToHorizontal(ra, dec, lst(jdUT, lon), lat);
  }

  // ---------------------------------------------------------------------------
  // Planets  (JPL "Approximate Positions of the Planets", Standish & Williams 1992,
  // https://ssd.jpl.nasa.gov/planets/approx_pos.html). Keplerian elements and
  // rates per Julian century, mean ecliptic and equinox of J2000.
  // Table 1 is used inside 1800–2050, Table 2 (with the extra terms in M for
  // Jupiter and Saturn) elsewhere. Quoted accuracy over 3000 BC – 3000 AD:
  // Mercury 20″, Venus 40″, Earth 40″, Mars 100″, Jupiter 600″, Saturn 1000″.
  // ---------------------------------------------------------------------------
  // [a (au), e, I, L, ϖ, Ω] (deg), then rates per century, then [b, c, s, f]
  const PLANETS_T1 = {
    mercury: [[0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593],
              [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081]],
    venus:   [[0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255],
              [0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418]],
    earth:   [[1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0],
              [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0]],
    mars:    [[1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
              [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343]],
    jupiter: [[5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909],
              [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106]],
    saturn:  [[9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448],
              [-0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794]],
  };
  const PLANETS_T2 = {
    mercury: [[0.38709843, 0.20563661, 7.00559432, 252.25166724, 77.45771895, 48.33961819],
              [0.00000000, 0.00002123, -0.00590158, 149472.67486623, 0.15940013, -0.12214182]],
    venus:   [[0.72332102, 0.00676399, 3.39777545, 181.97970850, 131.76755713, 76.67261496],
              [-0.00000026, -0.00005107, 0.00043494, 58517.81560260, 0.05679648, -0.27274174]],
    earth:   [[1.00000018, 0.01673163, -0.00054346, 100.46691572, 102.93005885, -5.11260389],
              [-0.00000003, -0.00003661, -0.01337178, 35999.37306329, 0.31795260, -0.24123856]],
    mars:    [[1.52371243, 0.09336511, 1.85181869, -4.56813164, -23.91744784, 49.71320984],
              [0.00000097, 0.00009149, -0.00724757, 19140.29934243, 0.45223625, -0.26852431]],
    jupiter: [[5.20248019, 0.04853590, 1.29861416, 34.33479152, 14.27495244, 100.29282654],
              [-0.00002864, 0.00018026, -0.00322699, 3034.90371757, 0.18199196, 0.13024619],
              [-0.00012452, 0.06064060, -0.35635438, 38.35125000]],
    saturn:  [[9.54149883, 0.05550825, 2.49424102, 50.07571329, 92.86136063, 113.63998702],
              [-0.00003065, -0.00032044, 0.00451969, 1222.11494724, 0.54179478, -0.25015002],
              [0.00025899, -0.13434469, 0.87320147, 38.35125000]],
  };
  const PLANET_NAMES = ['mercury', 'venus', 'mars', 'jupiter', 'saturn'];
  const EPS_JPL = 23.43928;

  // Heliocentric position (au) in the J2000 ecliptic frame.
  function heliocentricEclJ2000(name, jdTT) {
    const T = (jdTT - J2000) / JULIAN_CENTURY;
    const year = 2000 + T * 100;
    const tab = (year >= 1800 && year <= 2050) ? PLANETS_T1 : PLANETS_T2;
    const [el, rate, extra] = tab[name];
    const a = el[0] + rate[0] * T, e = el[1] + rate[1] * T, I = el[2] + rate[2] * T;
    const L = el[3] + rate[3] * T, peri = el[4] + rate[4] * T, node = el[5] + rate[5] * T;
    const omega = peri - node;
    let M = L - peri;
    if (extra) {
      const [b, c, s, f] = extra;
      M += b * T * T + c * cos(f * T) + s * sin(f * T);
    }
    M = ((M % 360) + 540) % 360 - 180;
    const eStar = e * RAD;
    let E = M + eStar * sin(M);
    for (let i = 0; i < 30; i++) {
      const dM = M - (E - eStar * sin(E));
      const dE = dM / (1 - e * cos(E));
      E += dE;
      if (Math.abs(dE) < 1e-8) break;
    }
    const xp = a * (cos(E) - e), yp = a * Math.sqrt(1 - e * e) * sin(E);
    const cw = cos(omega), sw = sin(omega), cO = cos(node), sO = sin(node), cI = cos(I), sI = sin(I);
    return [
      (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp,
      (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp,
      (sw * sI) * xp + (cw * sI) * yp,
    ];
  }

  // Visual magnitude (Meeus ch. 41, Müller's formulae; Saturn's ring term averaged).
  function planetMagnitude(name, r, d, i) {
    const base = 5 * Math.log10(r * d);
    switch (name) {
      case 'mercury': return -0.42 + base + 0.0380 * i - 0.000273 * i * i + 0.000002 * i * i * i;
      case 'venus': return -4.40 + base + 0.0009 * i + 0.000239 * i * i - 0.00000065 * i * i * i;
      case 'mars': return -1.52 + base + 0.016 * i;
      case 'jupiter': return -9.40 + base + 0.005 * i;
      case 'saturn': return -8.88 + base - 0.6;
      default: return 0;
    }
  }

  // Geocentric direction (unit vector, J2000 equatorial), distance (au),
  // heliocentric distance, phase angle, elongation and magnitude.
  // The Earth is taken at the Earth–Moon barycentre (offset < 4700 km).
  function planetVectorJ2000(name, jdTT) {
    const p = heliocentricEclJ2000(name, jdTT);
    const eb = heliocentricEclJ2000('earth', jdTT);
    const g = [p[0] - eb[0], p[1] - eb[1], p[2] - eb[2]];
    const dist = Math.hypot(g[0], g[1], g[2]);
    const r = Math.hypot(p[0], p[1], p[2]);
    const R = Math.hypot(eb[0], eb[1], eb[2]);
    const eq = matVec(rotX(EPS_JPL), g);
    const clamp1 = (x) => Math.max(-1, Math.min(1, x));
    const phase = Math.acos(clamp1((r * r + dist * dist - R * R) / (2 * r * dist))) * RAD;
    const elongation = Math.acos(clamp1((R * R + dist * dist - r * r) / (2 * R * dist))) * RAD;
    return { v: eq.map((x) => x / dist), dist, r, R, phase, elongation, mag: planetMagnitude(name, r, dist, phase) };
  }

  // ---------------------------------------------------------------------------
  // Topocentric Moon and Moon–planet approaches
  // ---------------------------------------------------------------------------
  const EARTH_RADIUS_KM = 6371;
  const MOON_RADIUS_KM = 1737.4;

  // Observer's geocentric position (Earth radii; spherical Earth) in J2000 equatorial coords.
  function observerVectorJ2000(jdUT, lat, lon) {
    const th = lst(jdUT, lon);
    const vDate = [cos(lat) * cos(th), cos(lat) * sin(th), sin(lat)];
    return matVec(transpose3(precessionMatrix(jdTTfromUT(jdUT))), vDate);
  }

  // The Moon as seen from a place: direction (J2000 equatorial) and distance (km).
  // Parallax is up to ~1°, which is what makes occultations local events.
  function moonTopocentricJ2000(jdUT, lat, lon) {
    const m = moonVectorJ2000(jdTTfromUT(jdUT));
    const o = observerVectorJ2000(jdUT, lat, lon);
    const k = m.dist / EARTH_RADIUS_KM;
    const t = [m.v[0] * k - o[0], m.v[1] * k - o[1], m.v[2] * k - o[2]];
    const d = Math.hypot(t[0], t[1], t[2]);
    return { v: t.map((x) => x / d), dist: d * EARTH_RADIUS_KM, geocentric: m };
  }

  // First Moon–planet close approach from jdStart, scanning forward
  // (direction +1) or backward (−1) for up to maxDays. Returns the time of
  // minimum topocentric separation, the separation, and whether it is an
  // occultation (separation smaller than the Moon's apparent radius).
  // With visible=true only approaches with the Moon up and the Sun down count.
  function findMoonPlanetApproach(name, jdStart, direction, lat, lon, opts = {}) {
    const maxSep = opts.maxSepDeg ?? 1.0;
    const maxDays = opts.maxDays ?? 365.25 * 30;
    const visible = opts.visible ?? true;
    const sep = (jd) => angularDistance(moonTopocentricJ2000(jd, lat, lon).v, planetVectorJ2000(name, jdTTfromUT(jd)).v);
    // Observable: Moon above the horizon, Sun below -3°
    const seen = (jd) => {
      const m = j2000ToHorizontal(moonTopocentricJ2000(jd, lat, lon).v, jd, lat, lon);
      const su = j2000ToHorizontal(sunVectorJ2000(jdTTfromUT(jd)).v, jd, lat, lon);
      return m.alt > 0 && su.alt < -3;
    };
    const step = 0.25 * (direction < 0 ? -1 : 1);   // 6 h
    let s2 = sep(jdStart), s1 = sep(jdStart + step);
    for (let jd = jdStart + 2 * step; Math.abs(jd - jdStart) <= maxDays; jd += step) {
      const s0 = sep(jd);
      if (s1 < s2 && s1 <= s0 && s1 < 8) {
        // local minimum near jd - step: golden-section search on the bracket
        let a = Math.min(jd - 2 * step, jd), b = Math.max(jd - 2 * step, jd);
        const gr = (Math.sqrt(5) - 1) / 2;
        let c = b - gr * (b - a), d = a + gr * (b - a), fc = sep(c), fd = sep(d);
        for (let i = 0; i < 30; i++) {
          if (fc < fd) { b = d; d = c; fd = fc; c = b - gr * (b - a); fc = sep(c); }
          else { a = c; c = d; fc = fd; d = a + gr * (b - a); fd = sep(d); }
        }
        const t = (a + b) / 2, s = sep(t);
        if (s <= maxSep) {
          const moon = moonTopocentricJ2000(t, lat, lon);
          const mh = j2000ToHorizontal(moon.v, t, lat, lon);
          const sh = j2000ToHorizontal(sunVectorJ2000(jdTTfromUT(t)).v, t, lat, lon);
          // "Visible" if the pair can be seen within ±1.5 h of closest approach
          // (the pair stays close for hours). viewJd is the nearest such moment.
          let viewJd = seen(t) ? t : null;
          for (let k = 1; k <= 9 && viewJd === null; k++) {
            const dk = k * 10 / 1440;
            if (seen(t + dk)) viewJd = t + dk;
            else if (seen(t - dk)) viewJd = t - dk;
          }
          if (!visible || viewJd !== null) {
            if (viewJd === null) viewJd = t;
            const moonRadius = Math.asin(MOON_RADIUS_KM / moon.dist) * RAD;
            const vh = j2000ToHorizontal(moonTopocentricJ2000(viewJd, lat, lon).v, viewJd, lat, lon);
            return { jd: t, sep: s, moonRadius, occultation: s < moonRadius,
                     moonAlt: mh.alt, moonAz: mh.az, sunAlt: sh.alt,
                     viewJd, viewSep: viewJd === t ? s : sep(viewJd), viewMoonAlt: vh.alt, viewMoonAz: vh.az };
          }
        }
      }
      s2 = s1;
      s1 = s0;
    }
    return null;
  }

  return {
    PLANET_NAMES, heliocentricEclJ2000, planetVectorJ2000, planetMagnitude,
    observerVectorJ2000, moonTopocentricJ2000, findMoonPlanetApproach,
    DEG, RAD, J2000, JULIAN_CENTURY, GREGORIAN_START_JD, EPS_J2000,
    norm360,
    calendarToJD, jdToCalendar, isGregorianDate, decimalYear,
    deltaT, jdTTfromUT,
    gmst, lst,
    meanObliquity,
    rotX, rotY, rotZ, mul3, transpose3, matVec, sphToVec, vecToSph, angularDistance,
    precessionAngles, precessionMatrix, precessFromJ2000, poleOfDate, equinoxOfDate,
    applyProperMotion,
    eclToEq, eqToEcl, eqToHorizontal,
    sunPosition, moonPosition,
    eclipticOfDateToJ2000, sunVectorJ2000, moonVectorJ2000, moonIllumination,
    j2000ToHorizontal,
  };
});
