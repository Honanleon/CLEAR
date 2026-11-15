# Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
# NISAR vs Sentinel-1 (C band) on OPERA RTC-S1 renders from NASA GIBS. Run fetch_s1.py, then compare.py [false-alarm %, default 0.1; the site uses 1].
# NISAR (L-band) radar-estimated clearing vs Sentinel-1 (C-band, OPERA RTC-S1 renders from NASA GIBS).
# Not for the web page. VH = green channel of the GIBS render (R = B = VV), same fixed stretch on every date.
import glob, json, math, os, sys
import numpy as np
from PIL import Image, ImageDraw
HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "web", "public", "data")
ZONES = {
    "norte": ((-61.6, -20.9, -61.0, -20.5), f"{DATA}/polygons.geojson"),
    "sur": ((-61.7, -22.8, -61.1, -22.4), f"{DATA}/zones/boqueron-sur/polygons.geojson"),
}
BASE = ("2025-10-15", "2025-12-31")
END = ("2026-09-01", "2026-10-31")
FA = float(sys.argv[1]) if len(sys.argv) > 1 else 0.1

def load(z, lo, hi):
    stack = []
    used = []
    for f in sorted(glob.glob(os.path.join(HERE, z, "*.png"))):
        d = os.path.basename(f)[:10]
        if not (lo <= d <= hi) or os.path.getsize(f) < 100000:
            continue
        a = np.array(Image.open(f).convert("RGBA")).astype(float)
        g = a[..., 1]
        g[a[..., 3] == 0] = np.nan
        if np.isnan(g).mean() > 0.5:
            continue
        stack.append(g)
        used.append(d)
    return np.nanmedian(np.stack(stack), 0), used

def smooth(x, k=3):
    p = k // 2
    xp = np.pad(np.nan_to_num(x, nan=np.nanmedian(x)), p, mode="edge")
    c = np.cumsum(np.cumsum(xp, 0), 1)
    c = np.pad(c, ((1, 0), (1, 0)))
    return (c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k]) / (k * k)

def otsu(v):
    v = v[np.isfinite(v)].astype(int).clip(0, 255)
    h = np.bincount(v, minlength=256).astype(float)
    w = np.cumsum(h); m = np.cumsum(h * np.arange(256)); mt = m[-1]; wt = w[-1]
    between = (mt * w / wt - m) ** 2 / np.where((w * (wt - w)) > 0, w * (wt - w), np.inf)
    return int(np.argmax(between))

out = {}
for z, (bb, pfile) in ZONES.items():
    base, bd = load(z, *BASE)
    end, ed = load(z, *END)
    base, end = smooth(base), smooth(end)
    H, W = base.shape
    x0, y0, x1, y1 = bb
    px_ha = ((x1 - x0) / W * 111320 * math.cos(math.radians((y0 + y1) / 2))) * ((y1 - y0) / H * 110574) / 1e4
    feats = json.load(open(pfile))["features"]
    # NISAR hexagons rasterized (each with its own id)
    lab = Image.new("I", (W, H), 0)
    dr = ImageDraw.Draw(lab)
    for k, f in enumerate(feats, 1):
        g = f["geometry"]
        rings = [g["coordinates"][0]] if g["type"] == "Polygon" else [p[0] for p in g["coordinates"]]
        for r in rings:
            dr.polygon([((x - x0) / (x1 - x0) * W, (y1 - y) / (y1 - y0) * H) for x, y in r], fill=k)
    lab = np.array(lab)
    thr = otsu(base)  # forest (bright VH) vs open
    forest0 = base > thr
    d = end - base
    ref = forest0 & (lab == 0)  # stable reference: baseline forest outside every NISAR hexagon
    T = np.percentile(d[ref], FA)  # FA % of the reference forest drops this much by chance
    s1 = forest0 & (d <= T) & (end <= thr)  # S1 clearing: was forest, dropped beyond T, now open
    # patches of at least 5 ha, like the NISAR detection's min_area_ha
    from scipy import ndimage
    lbl, n = ndimage.label(s1)
    sizes = ndimage.sum(s1, lbl, range(1, n + 1)) * px_ha
    keep = np.zeros(n + 1, bool)
    keep[1:] = sizes >= 5
    s1 = keep[lbl]
    nisar_ha = sum(f["properties"]["area_ha"] for f in feats)
    rows = []
    for k, f in enumerate(feats, 1):
        m = lab == k
        s1_ha = float(s1[m].sum() * px_ha)
        a = f["properties"]["area_ha"]
        rows.append({"id": f["properties"].get("id"), "date": f["properties"]["first_date"], "nisar_ha": a, "s1_ha": round(s1_ha, 1),
                     "s1_match": s1_ha >= max(2.0, 0.25 * a), "dist": f["properties"].get("dist_confirmed")})
    inside = float(s1[lab > 0].sum() * px_ha)
    null_hits = null_n = 0
    km_px = W / ((x1 - x0) * 111320 * math.cos(math.radians((y0 + y1) / 2)) / 1000)
    for dx, dy in [(5, 0), (-5, 0), (0, 5), (0, -5), (7, 7), (-7, 7), (7, -7), (-7, -7)]:
        sh = np.roll(np.roll(lab, int(dy * km_px), 0), int(dx * km_px), 1)
        for k, f in enumerate(feats, 1):
            m = (sh == k) & (lab == 0)
            if m.sum() < 0.9 * (lab == k).sum():
                continue  # shifted onto another hexagon or off the image
            null_n += 1
            a_ = f["properties"]["area_ha"]
            if s1[m].sum() * px_ha >= max(2.0, 0.25 * a_):
                null_hits += 1
    total_s1 = float(s1.sum() * px_ha)
    match = [r for r in rows if r["s1_match"]]
    dist_yes = [r for r in rows if r["dist"] is True]
    both = [r for r in rows if r["s1_match"] and r["dist"] is True]
    s1_only = [r for r in rows if r["s1_match"] and r["dist"] is not True]
    res = {
        "s1_dates_base": bd, "s1_dates_end": ed, "forest_threshold_G": thr, "drop_threshold_G": round(float(T), 1),
        "forest_share": round(float(forest0.mean()), 3),
        "nisar_hexagons": len(rows), "nisar_ha": round(nisar_ha, 1),
        "hexagons_matched_by_s1": len(match), "nisar_ha_in_matched": round(sum(r["nisar_ha"] for r in match), 1),
        "s1_ha_inside_nisar_hexagons": round(inside, 1), "s1_ha_total": round(total_s1, 1),
        "coverage_pct": round(100 * inside / total_s1, 1) if total_s1 else None,
        "dist_confirmed_hexagons": len(dist_yes), "s1_and_dist": len(both), "s1_not_dist": len(s1_only),
        "dist_not_s1": len([r for r in dist_yes if not r["s1_match"]]),
        "null_match_pct": round(100 * null_hits / max(1, null_n), 1), "null_n": null_n, "fa_pct": FA,
        "false_alarm_check_pct": round(100 * float((s1 & ref).sum()) / max(1, ref.sum()), 2),
    }
    out[z] = res
    # picture: baseline VH | end VH | S1 clearing (red) + NISAR hexagons (outline)
    vis = np.dstack([np.zeros_like(base)] * 3)
    g8 = np.clip(end, 0, 255)
    vis = np.dstack([g8, g8, g8]) * 0.6
    vis[s1] = [255, 40, 40]
    im = Image.fromarray(vis.astype(np.uint8))
    d2 = ImageDraw.Draw(im)
    for f in feats:
        g = f["geometry"]
        rings = [g["coordinates"][0]] if g["type"] == "Polygon" else [p[0] for p in g["coordinates"]]
        for r in rings:
            d2.line([((x - x0) / (x1 - x0) * W, (y1 - y) / (y1 - y0) * H) for x, y in r], fill=(80, 200, 255), width=3)
    im.thumbnail((1400, 1000))
    im.save(os.path.join(HERE, f"compare-{z}-fa{FA}.png"))
    print(z, {k: v for k, v in res.items() if not k.startswith("s1_dates")})
json.dump(out, open(os.path.join(HERE, f"compare-fa{FA}.json"), "w"), indent=1)
