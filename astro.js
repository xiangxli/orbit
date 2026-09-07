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

  return {
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
