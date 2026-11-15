# Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
# TEST SITE ONLY. Run: fetch.py (downloads fires/), then fire_dates.py web/public/data/hazards web (uses hazards.py's grid)
# Download NASA GIBS (public WMS, no login) images of Paraguay for the test site's hazard layers.
import datetime as dt
import os
import subprocess
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
WMS = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi"
BOX = (-62.9, -27.75, -54.1, -19.1)  # lon0, lat0, lon1, lat1


def url(layer, time, box, w, h):
    lo0, la0, lo1, la1 = box
    return (
        f"{WMS}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS={layer}&CRS=EPSG:4326"
        f"&BBOX={la0},{lo0},{la1},{lo1}&WIDTH={w}&HEIGHT={h}&FORMAT=image/png&TRANSPARENT=true&TIME={time}"
    )


def tiles(n, res):
    lo0, la0, lo1, la1 = BOX
    dx = (lo1 - lo0) / n
    dy = (la1 - la0) / n
    for i in range(n):
        for j in range(n):
            b = (lo0 + i * dx, la0 + j * dy, lo0 + (i + 1) * dx, la0 + (j + 1) * dy)
            yield i, j, b, int(round(dx / res)), int(round(dy / res))


jobs = []
day = dt.date(2025, 11, 1)
end = dt.date(2026, 10, 31)
d = day
while d <= end:
    jobs.append((f"fires/{d}.png", url("VIIRS_SNPP_Thermal_Anomalies_375m_All", d, BOX, 1100, 1081)))
    d += dt.timedelta(days=1)
d = day
while d <= end:
    for i, j, b, w, h in tiles(2, 0.0025):
        jobs.append((f"flood/{d}_{i}{j}.png", url("MODIS_Combined_Flood_3-Day", d, b, w, h)))
    d += dt.timedelta(days=3)
for i, j, b, w, h in tiles(4, 0.001):
    jobs.append((f"dist/2026-11-05_{i}{j}.png", url("OPERA_L3_DIST-ALERT-HLS_Color_Index", "2026-11-05", b, w, h)))

for sub in ("fires", "flood", "dist"):
    os.makedirs(os.path.join(HERE, sub), exist_ok=True)


def get(job):
    path, u = job
    p = os.path.join(HERE, path)
    if os.path.exists(p) and os.path.getsize(p) > 100:
        return 0
    subprocess.run(["curl", "-s", "--retry", "3", "--max-time", "180", "-o", p, u], check=False)
    return 1


with ThreadPoolExecutor(8) as ex:
    n = sum(ex.map(get, jobs))
print("jobs", len(jobs), "downloaded", n)
