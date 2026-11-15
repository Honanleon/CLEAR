# Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
# TEST SITE ONLY. Run: fetch.py (downloads fires/), then fire_dates.py web/public/data/hazards web (uses hazards.py's grid)
# Fires (NASA FIRMS VIIRS S-NPP 375 m via GIBS, daily 2025-11-01..2026-10-31) per hexagon of the site's grids.
# Whole country: days with a detection per big (24 km) and mini (2 km) hexagon -> map layer.
# Inside the study zones (+0.05 deg): the dates too -> "was there fire around the clearing date?" in the panel.
import datetime as dt, glob, json, os, sys
import numpy as np
from PIL import Image
OUTDIR = sys.argv[1]
WEB = sys.argv[2]
sys.argv = [sys.argv[0], "/dev/null", WEB]
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "hazards.py")).read().split("# ---- fires")[0])
zones = json.load(open(os.path.join(WEB, "public", "data", "zones.json")))["zones"]
boxes = [z["bbox"] for z in zones]
start = dt.date(2025, 11, 1)
files = sorted(glob.glob(os.path.join(HERE, "fires", "*.png")))
g = None
days = {k: {} for k in RADII}
dates = {k: {} for k in RADII}
for f in files:
    d = dt.date.fromisoformat(os.path.basename(f)[:10])
    try:
        a = np.array(Image.open(f).convert("RGBA"))
    except Exception:
        continue
    if g is None:
        g = Grid(BOX, a.shape[1], a.shape[0])
        lo0, la0, lo1, la1 = BOX
        lon = lo0 + (np.arange(a.shape[1]) + 0.5) * (lo1 - lo0) / a.shape[1]
        lat = la1 - (np.arange(a.shape[0]) + 0.5) * (la1 - la0) / a.shape[0]
        LON, LAT = np.meshgrid(lon, lat)
        inzone = np.zeros(LON.shape, bool)
        for b in boxes:
            inzone |= (LON >= b[0] - 0.05) & (LON <= b[2] + 0.05) & (LAT >= b[1] - 0.05) & (LAT <= b[3] + 0.05)
    fire = (a[..., 3] > 0) & (a[..., 0] > 100) & (a[..., 1] < 90) & g.inside
    off = (d - start).days
    for k in RADII:
        for key in np.unique(g.keys[k][fire]):
            days[k][int(key)] = days[k].get(int(key), 0) + 1
        for key in np.unique(g.keys[k][fire & inzone]):
            dates[k].setdefault(int(key), []).append(off)
def qr(key):
    q = int(round(key / 100003)); r = key - q * 100003
    if r > 50000: q += 1; r -= 100003
    if r < -50000: q -= 1; r += 100003
    return q, r
out = {"meta": {"source": "NASA FIRMS VIIRS S-NPP 375 m thermal anomalies via NASA GIBS (daily images); the drawn symbols are larger than the 375 m pixel, so the extent is inflated", "start": str(start), "days_read": len(files)}}
for k in RADII:
    out[k] = [[*qr(key), n] for key, n in days[k].items()]
    out[k + "_dates"] = {f"{q},{r}": v for key, v in dates[k].items() for q, r in [qr(key)]}
    print(k, "cells", len(out[k]), "zone cells with dates", len(out[k + "_dates"]))
os.makedirs(OUTDIR, exist_ok=True)
p = os.path.join(OUTDIR, "fires.json")
json.dump(out, open(p, "w"), separators=(",", ":"))
print(os.path.getsize(p) // 1024, "KB")
