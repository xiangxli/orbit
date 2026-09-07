#!/usr/bin/env python3
"""Build stars.js and constellations.js for the historical-sky feature.

Sources (download into the data dir first; default /tmp/orbit-data):
  HYG v4.1 star database (CC BY-SA 4.0)
    https://raw.githubusercontent.com/astronexus/HYG-Database/main/hyg/CURRENT/hygdata_v41.csv
  Stellarium "chinese" sky culture (CC BY-SA), lines + names
    https://raw.githubusercontent.com/Stellarium/stellarium-skycultures/master/chinese/index.json
    https://raw.githubusercontent.com/Stellarium/stellarium-skycultures/master/chinese/po/zh_CN.po

Usage: python3 tools/build_data.py [data_dir]

Output (repo root):
  stars.js          var STAR_DATA = { fields, stars: [[hip, ra, dec, mag, ci, pmra, pmdec], ...],
                                      zh: {hip: name}, en: {hip: name} }
  constellations.js var CONSTELLATION_DATA = [{ id, zh, py, en, lines: [[hip, ...], ...] }, ...]

Selection: every star with V <= MAG_LIMIT, plus every star referenced by a
constellation line regardless of magnitude. Positions are J2000; proper
motion in mas/yr (pmra already includes cos(dec), Hipparcos convention).
"""
import csv, json, os, re, sys

MAG_LIMIT = 6.0
DATA_DIR = sys.argv[1] if len(sys.argv) > 1 else '/tmp/orbit-data'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ---- Stellarium chinese sky culture ----
index = json.load(open(os.path.join(DATA_DIR, 'chinese_index.json'), encoding='utf-8'))
po = open(os.path.join(DATA_DIR, 'chinese_zh_CN.po'), encoding='utf-8').read()

# Special star names: the .po carries "#. Chinese star name for HIP N" comments.
# Constellation translations are the fallback for the few xingguan whose
# index.json entry lacks a "native" field (星宿, 龟, 平).
special_zh = {}      # HIP -> zh (from the .po comment)
special_en_zh = {}   # english -> zh (the same name can apply to several stars,
                     # e.g. "The Celestial Pivot" = 天枢 for both Dubhe and HIP 62572)
con_zh_po = {}
for comment, en, zh in re.findall(r'((?:#\..*\n)*)msgid "(.*)"\nmsgstr "(.*)"', po):
    m = re.search(r'Chinese star name for HIP (\d+)', comment)
    if m and zh:
        special_zh.setdefault(int(m.group(1)), zh)
        special_en_zh.setdefault(en, zh)
    elif 'Chinese constellation' in comment and zh:
        con_zh_po.setdefault(en, zh)

constellations = []
con_native = {}
for c in index['constellations']:
    name = c['common_name']
    en = name.get('english') or ''
    zh = name.get('native') or con_zh_po.get(en, '')
    if en:
        con_native[en] = zh
    constellations.append({
        'id': c['id'].replace('CON chinese ', 'c'),
        'zh': zh, 'py': name.get('pronounce', ''), 'en': en,
        'lines': c['lines'],
    })

CN_DIGITS = '零一二三四五六七八九'
def cn_number(n):
    if n < 10: return CN_DIGITS[n]
    if n < 20: return '十' + (CN_DIGITS[n - 10] if n > 10 else '')
    tens, ones = divmod(n, 10)
    return CN_DIGITS[tens] + '十' + (CN_DIGITS[ones] if ones else '')

ROMAN = {'I': 1, 'V': 5, 'X': 10, 'L': 50, 'C': 100}
def roman_to_int(s):
    total = 0
    for i, ch in enumerate(s):
        v = ROMAN[ch]
        total += -v if i + 1 < len(s) and ROMAN[s[i + 1]] > v else v
    return total

# Numbered names: "<Xingguan english> [Added] <roman>" -> "<星官>[增]<数>"
numbered_zh = {}
proper_zh = {}
pat = re.compile(r'^(.+?) (Added )?([IVXLC]+)$')
for key, names in index['common_names'].items():
    if not key.startswith('HIP '):
        continue  # deep-sky objects ("NAME Beehive" etc.)
    hip = int(key.split()[1])
    for n in names:
        if n['english'] in special_en_zh:
            proper_zh.setdefault(hip, special_en_zh[n['english']])
        elif con_native.get(n['english']):
            # single-star xingguan named after the star itself (天狼, 大角, 织女 ...)
            proper_zh.setdefault(hip, con_native[n['english']])
    for n in names:
        m = pat.match(n['english'])
        if not m or m.group(1) not in con_native or not con_native[m.group(1)]:
            continue
        zh = con_native[m.group(1)] + ('增' if m.group(2) else '') + cn_number(roman_to_int(m.group(3)))
        numbered_zh.setdefault(hip, zh)
        break

line_hips = {h for c in constellations for seg in c['lines'] for h in seg}

# ---- HYG ----
stars = []
en_names = {}
seen_hip = set()
polaris_pm = None
with open(os.path.join(DATA_DIR, 'hygdata_v41.csv'), newline='', encoding='utf-8') as f:
    for row in csv.DictReader(f):
        if row['id'] == '0':
            continue  # Sun
        hip = int(row['hip']) if row['hip'] else 0
        mag = float(row['mag'])
        if mag > MAG_LIMIT and hip not in line_hips:
            continue
        if hip and hip in seen_hip:
            continue  # HYG lists multiple-star components under one HIP
        if hip:
            seen_hip.add(hip)
        ra = float(row['ra']) * 15.0  # hours -> degrees
        dec = float(row['dec'])
        ci = float(row['ci']) if row['ci'] else 0.0
        pmra = float(row['pmra'] or 0)
        pmdec = float(row['pmdec'] or 0)
        if hip == 11767:
            polaris_pm = (pmra, pmdec)
        stars.append([hip, round(ra, 4), round(dec, 4), round(mag, 2), round(ci, 2), round(pmra), round(pmdec)])
        if row['proper'] and hip:
            en_names[hip] = row['proper']

stars.sort(key=lambda s: s[3])
missing = sorted(line_hips - seen_hip)

zh_names = {}
for s in stars:
    hip = s[0]
    if not hip:
        continue
    name = special_zh.get(hip) or proper_zh.get(hip) or numbered_zh.get(hip)
    if name:
        zh_names[hip] = name

def compact(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(',', ':'))

header = ('// Generated by tools/build_data.py -- do not edit by hand.\n'
          '// Sources: HYG v4.1 (CC BY-SA 4.0, https://github.com/astronexus/HYG-Database);\n'
          '// Stellarium "chinese" sky culture (CC BY-SA, https://github.com/Stellarium/stellarium-skycultures).\n')

with open(os.path.join(ROOT, 'stars.js'), 'w', encoding='utf-8') as f:
    f.write(header)
    f.write('// fields: hip, ra (deg, J2000), dec (deg), mag (V), ci (B-V), pmra (mas/yr, incl. cos dec), pmdec (mas/yr)\n')
    f.write('var STAR_DATA = {\n')
    f.write('"fields":["hip","ra","dec","mag","ci","pmra","pmdec"],\n')
    f.write('"stars":[\n' + ',\n'.join(compact(s) for s in stars) + '\n],\n')
    f.write('"zh":' + compact(zh_names) + ',\n')
    f.write('"en":' + compact(en_names) + '\n};\n')

with open(os.path.join(ROOT, 'constellations.js'), 'w', encoding='utf-8') as f:
    f.write(header)
    f.write('// Chinese xingguan (star officials): lines are HIP numbers (see stars.js).\n')
    f.write('var CONSTELLATION_DATA = [\n' + ',\n'.join(compact(c) for c in constellations) + '\n];\n')

print(f'stars: {len(stars)} (mag <= {MAG_LIMIT} or on a line); zh names: {len(zh_names)}; en names: {len(en_names)}')
print(f'constellations: {len(constellations)}; line HIPs: {len(line_hips)}; missing from HYG: {len(missing)} {missing[:20]}')
print(f'Polaris (HIP 11767) pmra, pmdec = {polaris_pm}  (Hipparcos mu_alpha* = 44.22, mu_delta = -11.74)')
for p in ('stars.js', 'constellations.js'):
    print(f'{p}: {os.path.getsize(os.path.join(ROOT, p)) / 1024:.0f} KB')
