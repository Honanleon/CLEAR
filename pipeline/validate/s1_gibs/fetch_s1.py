# Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
# NISAR vs Sentinel-1 (C band) on OPERA RTC-S1 renders from NASA GIBS. Run fetch_s1.py, then compare.py [false-alarm %, default 0.1; the site uses 1].
# Sentinel-1 RTC (OPERA L2 RTC-S1) renders from NASA GIBS (public WMS, no login) over the two clearing zones,
# daily, for the baseline (Nov - Dec 2025) and the end (Sep - Oct 2026). Days without a pass come back tiny (empty).
import datetime as dt, os, subprocess
from concurrent.futures import ThreadPoolExecutor
HERE = os.path.dirname(os.path.abspath(__file__))
WMS = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi"
ZONES = {"norte": (-61.6, -20.9, -61.0, -20.5), "sur": (-61.7, -22.8, -61.1, -22.4)}
RES = 0.0003
def days(a, b):
    d = a
    while d <= b:
        yield d
        d += dt.timedelta(days=1)
jobs = []
for z, (x0, y0, x1, y1) in ZONES.items():
    os.makedirs(os.path.join(HERE, z), exist_ok=True)
    w, h = round((x1 - x0) / RES), round((y1 - y0) / RES)
    for d in list(days(dt.date(2025, 10, 15), dt.date(2026, 1, 20))) + list(days(dt.date(2026, 8, 25), dt.date(2026, 11, 5))):
        url = f"{WMS}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=OPERA_L2_Radiometric_Terrain_Corrected_SAR_Sentinel-1&CRS=EPSG:4326&BBOX={y0},{x0},{y1},{x1}&WIDTH={w}&HEIGHT={h}&FORMAT=image/png&TRANSPARENT=true&TIME={d}"
        jobs.append((os.path.join(HERE, z, f"{d}.png"), url))
def get(j):
    p, u = j
    if os.path.exists(p) and os.path.getsize(p) > 0:
        return
    subprocess.run(["curl", "-s", "--retry", "3", "--max-time", "180", "-o", p, u], check=False)
with ThreadPoolExecutor(8) as ex:
    list(ex.map(get, jobs))
for z in ZONES:
    fs = sorted(os.listdir(os.path.join(HERE, z)))
    full = [f[:10] for f in fs if os.path.getsize(os.path.join(HERE, z, f)) > 100000]
    print(z, "days", len(fs), "with data", len(full), full)
