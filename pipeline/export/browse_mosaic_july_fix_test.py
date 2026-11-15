# Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
# TEST SITE ONLY. Same inputs as browse_mosaic_test.py (selection.json, year_all.json, browse PNGs next to it).
# usage: python browse_mosaic_july_fix_test.py web/public/data/mosaic
# Rebuild the July 2026 timeline mosaic without the corrupted track 60 pass of 2026-07-24 (all 5 browse images
# striped / smeared). Each of its frames falls back to its last good pass: 2026-07-12 (frames 164-165) or
# 2026-06-30 (frames 166-168; no 07-12 product for them).
import json, os, sys
import numpy as np
from PIL import Image
OUTDIR = sys.argv[1]
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "browse_mosaic_test.py")).read().split("meta = {")[0]
sys.argv = [sys.argv[0], OUTDIR]
exec(src)
y = json.load(open(os.path.join(HERE, "year_all.json")))
july = [it for it in sel["monthly"]["2026-07-31"] if not (it["path"] == 60 and it["date"] == "2026-07-24")]
# the 2026-07-12 pass exists only for frames 164-165 and its browse images do not georeference (residual
# 0.024-0.074 deg): every frame takes the 2026-06-30 pass
add = []
have = set()
for it in sel["monthly"]["2026-06-30"]:
    if it["path"] == 60 and it["frame"] not in have:
        add.append(dict(it, fill=False))
for a in add:
    a2 = np.array(Image.open(os.path.join(HERE, "monthly", a["id"] + ".png")).convert("L")).astype(float)
    nz = a2 > 5
    r = np.abs(np.diff(a2, axis=0))[nz[1:] & nz[:-1]].mean() / np.abs(np.diff(a2, axis=1))[nz[:, 1:] & nz[:, :-1]].mean()
    print("replacement", a["frame"], a["date"], "stripe ratio", round(r, 2))
items = july + add
r = build("monthly", latest_on_top=True, items=items, name="m_2026-07")
ds = [p["date"] for p in r["products"]]
print("frames", len(r["products"]), "skipped", r["skipped"], "coverage", r["coverage_of_paraguay"], "dates", min(ds), max(ds))
mp = os.path.join(OUTDIR, "mosaic.json")
meta = json.load(open(mp))
for t in meta["timeline"]:
    if t["until"] == "2026-07-31":
        t.update({"dates": [min(ds), max(ds)], "coverage_of_paraguay": r["coverage_of_paraguay"], "frames": len(r["products"]), "skipped": len(r["skipped"]),
                  "excluded": "track 60 pass of 2026-07-24 (corrupted browse images); its 5 frames use their last good pass, 2026-06-30"})
json.dump(meta, open(mp, "w"), indent=1)
