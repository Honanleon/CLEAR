# Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
#
# TEST SITE ONLY (branch test/nisar-paraguay-mosaic). Paraguay-wide NISAR quick-look mosaics from ASF GCOV
# browse PNGs. Inputs (in this script's folder): selection.json (one product per track/frame from the ASF
# search API: "after" = latest 2026-09-15..10-31 per track/frame) and the downloaded
# browse PNGs in before/ and after/. Usage: python browse_mosaic_test.py <out_dir>
# "before" = earliest pass of each track/frame up to 2026-07-15 (NISAR imaged eastern Paraguay only from June 2026).
# Each browse is georeferenced by matching the 4 corners of its data swath (extreme non-black pixels)
# to the 4 corners of the product footprint from the ASF search (affine fit; products with a residual
# over 0.02 deg are skipped). Output: lon/lat grid over Paraguay, clipped to the country, RGBA WebP.
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1]
sel = json.load(open(os.path.join(HERE, "selection.json")))
py = json.load(open(os.path.join(HERE, "..", "..", "web", "src", "map", "paraguay.json")))

BOX = (-62.9, -27.75, -54.1, -19.1)  # lon0, lat0, lon1, lat1
RES = 0.004  # deg (~400 m)
W = int(round((BOX[2] - BOX[0]) / RES))
H = int(round((BOX[3] - BOX[1]) / RES))

mask_img = Image.new("L", (W, H), 0)
ImageDraw.Draw(mask_img).polygon([((x - BOX[0]) / RES, (BOX[3] - y) / RES) for x, y in py], fill=255)
inside_py = np.array(mask_img) > 0


def fit(arr, ring):
    nz = arr[..., :3].astype(int).sum(2) > 15
    rows = np.where(nz.any(1))[0]
    cols = np.where(nz.any(0))[0]
    if len(rows) < 10 or len(cols) < 10:
        return None
    top = (np.where(nz[rows[0]])[0].mean(), rows[0])
    bot = (np.where(nz[rows[-1]])[0].mean(), rows[-1])
    left = (cols[0], np.where(nz[:, cols[0]])[0].mean())
    right = (cols[-1], np.where(nz[:, cols[-1]])[0].mean())
    r = np.array(ring[:-1] if ring[0] == ring[-1] else ring, float)
    geo = np.array([r[r[:, 1].argmax()], r[r[:, 0].argmax()], r[r[:, 1].argmin()], r[r[:, 0].argmin()]])
    pix = np.array([top, right, bot, left], float)
    A = np.c_[pix, np.ones(4)]
    cl, *_ = np.linalg.lstsq(A, geo[:, 0], rcond=None)
    ct, *_ = np.linalg.lstsq(A, geo[:, 1], rcond=None)
    res = max(np.abs(A @ cl - geo[:, 0]).max(), np.abs(A @ ct - geo[:, 1]).max())
    return cl, ct, res, nz


def build(kind, latest_on_top):
    items = sorted(sel[kind], key=lambda x: x["date"], reverse=not latest_on_top)
    rgb = np.zeros((H, W, 3), np.uint8)
    have = np.zeros((H, W), bool)
    used, skipped = [], []
    for it in items:
        path = os.path.join(HERE, kind, it["id"] + ".png")
        if not os.path.exists(path) or os.path.getsize(path) < 1000:
            skipped.append((it["id"], "missing"))
            continue
        arr = np.array(Image.open(path).convert("RGB"))
        f = fit(arr, it["ring"])
        if f is None or f[2] > 0.02:
            skipped.append((it["id"], "fit" if f is None else f"residual {f[2]:.3f}"))
            continue
        cl, ct, res, nz = f
        # brightness matched to a common median so the seams between passes are softer
        lum = arr[nz].mean(1)
        gain = float(np.clip(128.0 / max(1.0, np.median(lum)), 0.6, 1.7))
        ring = np.array(it["ring"], float)
        x0, x1 = ring[:, 0].min() - 0.05, ring[:, 0].max() + 0.05
        y0, y1 = ring[:, 1].min() - 0.05, ring[:, 1].max() + 0.05
        c0 = max(0, int((x0 - BOX[0]) / RES)); c1 = min(W, int((x1 - BOX[0]) / RES) + 1)
        r0 = max(0, int((BOX[3] - y1) / RES)); r1 = min(H, int((BOX[3] - y0) / RES) + 1)
        if c0 >= c1 or r0 >= r1:
            continue
        lon = BOX[0] + (np.arange(c0, c1) + 0.5) * RES
        lat = BOX[3] - (np.arange(r0, r1) + 0.5) * RES
        LON, LAT = np.meshgrid(lon, lat)
        M = np.array([[cl[0], cl[1]], [ct[0], ct[1]]])
        Mi = np.linalg.inv(M)
        dx = LON - cl[2]
        dy = LAT - ct[2]
        px = np.rint(Mi[0, 0] * dx + Mi[0, 1] * dy).astype(int)
        pyy = np.rint(Mi[1, 0] * dx + Mi[1, 1] * dy).astype(int)
        ok = (px >= 0) & (pyy >= 0) & (px < arr.shape[1]) & (pyy < arr.shape[0])
        sub_ok = np.zeros_like(ok)
        sub_ok[ok] = nz[pyy[ok], px[ok]]
        vals = np.clip(arr[pyy[sub_ok], px[sub_ok]].astype(float) * gain, 0, 255).astype(np.uint8)
        blk_rgb = rgb[r0:r1, c0:c1]
        blk_have = have[r0:r1, c0:c1]
        blk_rgb[sub_ok] = vals
        blk_have[sub_ok] = True
        used.append({"id": it["id"], "date": it["date"], "track": it["path"], "frame": it["frame"], "residual_deg": round(float(res), 4)})
    alpha = (have & inside_py).astype(np.uint8) * 255
    img = Image.fromarray(np.dstack([rgb, alpha]), "RGBA")
    os.makedirs(OUT, exist_ok=True)
    img.save(os.path.join(OUT, f"{kind}.webp"), "WEBP", quality=80, method=6)
    cov = float((have & inside_py).sum() / inside_py.sum())
    return {"products": used, "skipped": skipped, "coverage_of_paraguay": round(cov, 3)}


meta = {
    "bbox": BOX,
    "coordinates": [[BOX[0], BOX[3]], [BOX[2], BOX[3]], [BOX[2], BOX[1]], [BOX[0], BOX[1]]],
    "source": "NISAR L2 GCOV browse images (ASF DAAC quick-looks, NASA/JPL), mosaicked; not calibrated",
    "after": build("after", latest_on_top=True),
    "before": build("before", latest_on_top=False),
}
for k in ("before", "after"):
    m = meta[k]
    ds = [p["date"] for p in m["products"]]
    m["dates"] = [min(ds), max(ds)] if ds else []
    print(k, "used", len(m["products"]), "skipped", len(m["skipped"]), "coverage", m["coverage_of_paraguay"], "dates", m["dates"], "size", os.path.getsize(os.path.join(OUT, f"{k}.webp")) // 1024, "KB")
    for s in m["skipped"]:
        print("  skipped", s)
json.dump(meta, open(os.path.join(OUT, "mosaic.json"), "w"), indent=1)
