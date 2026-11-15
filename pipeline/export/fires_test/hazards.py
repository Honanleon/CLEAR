# Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
# TEST SITE ONLY. Run: fetch.py (downloads fires/), then fire_dates.py web/public/data/hazards web (uses hazards.py's grid)
# Aggregate NASA GIBS hazard images of Paraguay into the site's hexagon grids (test site only).
# Same grid as web/src/map/hexgrid.ts: pointy-top hexagons in a local equirectangular projection anchored on
# the primary study zone (boqueron-norte centre), radius 24 km (big) and 2 km (mini).
#   fires : VIIRS S-NPP 375 m thermal anomalies, daily -> days with a fire detection in each hexagon
#   flood : MODIS combined flood (3-day composite), every 3 days -> largest flooded area seen (ha)
#   dist  : OPERA DIST-ALERT-HLS status on 2026-11-05 (rolling past year), confirmed >= 50 % vegetation loss (ha)
import glob
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1]
WEB = sys.argv[2]
BOX = (-62.9, -27.75, -54.1, -19.1)
LON0, LAT0 = -61.3, -20.7
KX = 111_320 * math.cos(math.radians(LAT0))
KY = 110_574
SQ3 = math.sqrt(3)
RADII = {"big": 24000.0, "mini": 2000.0}
py = json.load(open(os.path.join(WEB, "src", "map", "paraguay.json")))


def axial(lon, lat, R):
    x = (lon - LON0) * KX
    y = (lat - LAT0) * KY
    fq = ((SQ3 / 3) * x - y / 3) / R
    fr = ((2 / 3) * y) / R
    fs = -fq - fr
    q, r, s = np.rint(fq), np.rint(fr), np.rint(fs)
    dq, dr, ds = np.abs(q - fq), np.abs(r - fr), np.abs(s - fs)
    q = np.where((dq > dr) & (dq > ds), -r - s, q)
    r = np.where(~((dq > dr) & (dq > ds)) & (dr > ds), -q - s, r)
    return (q.astype(np.int64) * 100003 + r.astype(np.int64))


def ring(key, R):
    q = int(round(key / 100003))
    r = key - q * 100003
    if r > 50000:
        q += 1
        r -= 100003
    if r < -50000:
        q -= 1
        r += 100003
    cx = R * SQ3 * (q + r / 2)
    cy = R * 1.5 * r
    pts = []
    for i in range(7):
        a = math.radians(60 * (i % 6) - 30)
        pts.append([round(LON0 + (cx + R * math.cos(a)) / KX, 4), round(LAT0 + (cy + R * math.sin(a)) / KY, 4)])
    return pts


class Grid:
    """Pixel centres of one image (box, size): lon/lat, Paraguay mask, pixel area (ha), hexagon keys."""

    def __init__(self, box, w, h):
        lo0, la0, lo1, la1 = box
        dx = (lo1 - lo0) / w
        dy = (la1 - la0) / h
        lon = lo0 + (np.arange(w) + 0.5) * dx
        lat = la1 - (np.arange(h) + 0.5) * dy
        LON, LAT = np.meshgrid(lon, lat)
        m = Image.new("L", (w, h), 0)
        ImageDraw.Draw(m).polygon([((x - lo0) / dx, (la1 - y) / dy) for x, y in py], fill=255)
        self.inside = np.array(m) > 0
        self.ha = (dx * 111_320 * np.cos(np.radians(LAT)) * dy * 110_574) / 1e4
        self.keys = {k: axial(LON, LAT, R) for k, R in RADII.items()}


def color_mask(a, rgb, tol=12):
    return (a[..., 3] > 0) & (np.abs(a[..., :3].astype(int) - np.array(rgb)).max(-1) <= tol)


def write(name, values, unit, meta):
    os.makedirs(OUT, exist_ok=True)
    out = {"meta": dict(meta, unit=unit)}
    for k, R in RADII.items():
        feats = []
        for key, v in values[k].items():
            if v <= 0:
                continue
            feats.append({"type": "Feature", "properties": {"v": round(float(v), 1)}, "geometry": {"type": "Polygon", "coordinates": [ring(key, R)]}})
        out[k] = {"type": "FeatureCollection", "features": feats}
        out["meta"][f"{k}_cells"] = len(feats)
        out["meta"][f"{k}_max"] = round(max((f["properties"]["v"] for f in feats), default=0), 1)
    json.dump(out, open(os.path.join(OUT, f"{name}.json"), "w"), separators=(",", ":"))
    print(name, {k: out["meta"][k] for k in out["meta"] if k.endswith(("cells", "max"))}, os.path.getsize(os.path.join(OUT, f"{name}.json")) // 1024, "KB")


# ---- fires: days with a detection per hexagon
files = sorted(glob.glob(os.path.join(HERE, "fires", "*.png")))
g = None
days = {k: {} for k in RADII}
n_days = 0
for f in files:
    try:
        a = np.array(Image.open(f).convert("RGBA"))
    except Exception:
        continue
    if g is None:
        g = Grid(BOX, a.shape[1], a.shape[0])
    n_days += 1
    fire = (a[..., 3] > 0) & (a[..., 0] > 100) & (a[..., 1] < 90) & g.inside
    for k in RADII:
        for key in np.unique(g.keys[k][fire]):
            days[k][int(key)] = days[k].get(int(key), 0) + 1
write("fires", days, "days", {"source": "NASA FIRMS VIIRS S-NPP 375 m thermal anomalies via NASA GIBS", "period": ["2025-11-01", "2026-10-31"], "days_read": n_days})


# ---- tiled layers
def tiled(pattern):
    """{date: [(box, array), ...]} for tiles named <date>_<i><j>.png on a 2x2 or 4x4 split of BOX."""
    by = {}
    for f in sorted(glob.glob(pattern)):
        base = os.path.basename(f)[:-4]
        date, ij = base.rsplit("_", 1)
        by.setdefault(date, []).append((int(ij[0]), int(ij[1]), f))
    return by


grids = {}


def tile_grid(n, i, j, w, h):
    key = (n, i, j, w, h)
    if key not in grids:
        lo0, la0, lo1, la1 = BOX
        dx = (lo1 - lo0) / n
        dy = (la1 - la0) / n
        grids[key] = Grid((lo0 + i * dx, la0 + j * dy, lo0 + (i + 1) * dx, la0 + (j + 1) * dy), w, h)
    return grids[key]


# floods: largest flooded area per hexagon over the 3-day composites
flood_max = {k: {} for k in RADII}
dates = tiled(os.path.join(HERE, "flood", "*.png"))
for date, tl in dates.items():
    acc = {k: {} for k in RADII}
    for i, j, f in tl:
        try:
            a = np.array(Image.open(f).convert("RGBA"))
        except Exception:
            continue
        gg = tile_grid(2, i, j, a.shape[1], a.shape[0])
        m = color_mask(a, (250, 30, 36)) & gg.inside
        if not m.any():
            continue
        for k in RADII:
            keys = gg.keys[k][m]
            has = gg.ha[m]
            u, inv = np.unique(keys, return_inverse=True)
            sums = np.bincount(inv, weights=has)
            for key, s in zip(u, sums):
                acc[k][int(key)] = acc[k].get(int(key), 0) + s
    for k in RADII:
        for key, s in acc[k].items():
            if s > flood_max[k].get(key, 0):
                flood_max[k][key] = s
write("flood", flood_max, "ha", {"source": "NASA MODIS combined flood product (3-day composite) via NASA GIBS", "period": ["2025-11-01", "2026-10-31"], "dates_read": len(dates)})

# vegetation loss: OPERA DIST-ALERT, confirmed >= 50 % (status 6) and confirmed >= 50 % finished (status 8)
loss = {k: {} for k in RADII}
for date, tl in tiled(os.path.join(HERE, "dist", "*.png")).items():
    for i, j, f in tl:
        a = np.array(Image.open(f).convert("RGBA"))
        gg = tile_grid(4, i, j, a.shape[1], a.shape[0])
        m = (color_mask(a, (224, 27, 7), 6) | color_mask(a, (221, 221, 221), 4)) & gg.inside
        for k in RADII:
            keys = gg.keys[k][m]
            u, inv = np.unique(keys, return_inverse=True)
            sums = np.bincount(inv, weights=gg.ha[m])
            for key, s in zip(u, sums):
                loss[k][int(key)] = loss[k].get(int(key), 0) + s
write("dist", loss, "ha", {"source": "NASA OPERA DIST-ALERT-HLS (Landsat + Sentinel-2) via NASA GIBS, status on 2026-11-05 (past year), confirmed >= 50 % vegetation loss", "period": ["2025-11-05", "2026-11-05"]})
