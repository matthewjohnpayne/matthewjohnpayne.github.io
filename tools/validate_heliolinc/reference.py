"""Reference results for validating src/scripts/heliolinc/linking.js.

Usage (the science-notebooks Python environment):
    python tools/validate_heliolinc/reference.py ../science-notebooks/notebooks/heliolinc

Reads the exported survey (public/data/heliolinc/field.bin, float32 offsets),
rebuilds the detections exactly as the page does, and runs the notebook's
module on them. Writes tools/validate_heliolinc/reference.json.
"""
import json
import os
import sys

import numpy as np

nb_dir = os.path.abspath(sys.argv[1])
here = os.path.dirname(os.path.abspath(__file__))
root = os.path.dirname(os.path.dirname(here))
sys.path.insert(0, nb_dir)
import heliolinc as hl  # noqa: E402

meta = json.load(open(f"{root}/src/data/heliolinc.json"))
nd, nt = meta["nDetections"], meta["nTracklets"]
raw = open(f"{root}/public/data/heliolinc/field.bin", "rb").read()
f32 = lambda k: np.frombuffer(raw, np.float32, nd, 4 * k * nd).astype(np.float64)
obj = np.frombuffer(raw, np.int32, nt, 12 * nd)
det = {"t": meta["windowCentreJD"] + f32(0), "ra": meta["raRef"] + f32(1), "dec": meta["decRef"] + f32(2),
       "tracklet": np.repeat(np.arange(nt), 3)}
T_C = meta["windowCentreJD"]

out = {}
p = hl.prepare(det, T_C, 0.4)
out["frame"] = p["frame"].tolist()
for gd in [0.0, 2e-3]:
    out[f"arrows_{gd}"] = hl.fit_arrows(p, gd)[:2000].tolist()
gds = meta["notebook"]["gammaDots"]
out["scores"] = []
for d, dt in [(5e-4, 5.0), (1e-3, 5.0), (2e-3, 5.0), (1e-3, 1.0), (1e-3, 20.0), (4e-3, 10.0)]:
    s = hl.score(hl.run_heliolinc(det, T_C, 0.4, gds, d, dt), obj)
    out["scores"].append({"d": d, "dt": dt, **s})
s = hl.score(hl.run_heliolinc(det, T_C, [0.3, 0.35, 0.4, 0.45], gds, 1e-3, 5.0, z_dir=p["frame"][2]), obj)
out["scores"].append({"d": 1e-3, "dt": 5.0, "gammas": [0.3, 0.35, 0.4, 0.45], **s})
night = np.floor(det["t"].reshape(-1, 3).mean(axis=1) - 0.5).astype(int)
out["findable"] = int(len(hl.findable(obj, night)))
c = meta["crocco"]
det_c = {"t": c["windowCentreJD"] + np.array(c["t"]), "ra": np.array(c["ra"]), "dec": np.array(c["dec"]),
         "tracklet": np.repeat(np.arange(len(c["t"]) // 3), 3)}
pc = hl.prepare(det_c, c["windowCentreJD"], 0.4)
out["crocco_arrows"] = hl.fit_arrows(pc, 0.0).tolist()
out["earth"] = [{"jd": jd, "pos": hl.earth_position(jd).tolist()} for jd in [2451545.0, T_C, c["windowCentreJD"]]]
json.dump(out, open(f"{here}/reference.json", "w"))
print("Wrote reference.json:", [(s["d"], s["dt"], s["pure_objects"], s["erroneous"]) for s in out["scores"]], "findable", out["findable"])
