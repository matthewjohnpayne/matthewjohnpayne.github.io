"""Reference catalogue search from the science-notebooks module notebooks/shift_and_stack/sns.py,
for checking src/scripts/sns/search.js (compare.mjs).

    python tools/validate_sns/reference.py ../science-notebooks/notebooks/shift_and_stack
    node tools/validate_sns/compare.mjs
"""
import json
import os
import sys

sys.path.insert(0, os.path.abspath(sys.argv[1]))
import sns  # noqa: E402

t, imgs, truth = sns.make_survey(30, 256, 2.0, 4.0, n_obj=24, snr_range=(1.0, 5.0), v_range=(2.0, 20.0), seed=7)
cat = sns.detect(t, imgs, 2.0, 2.0)
res, nv = sns.catalog_search(cat, 4.0, 1.5, 21.0, n_min=8, max_results=60, size=256)
out = dict(cat={k: cat[k].tolist() for k in ("x", "y", "t")}, n_velocities=int(nv),
           results=[dict(members=sorted(int(m) for m in r["members"]), vx=float(r["vx"]), vy=float(r["vy"]), n=r["n"]) for r in res])
with open(os.path.join(os.path.dirname(__file__), "reference.json"), "w") as f:
    json.dump(out, f)
print(f"{len(cat['x'])} detections, {nv} velocities, {len(res)} clusters")
