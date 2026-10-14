"""Export the HelioLinC notebook's simulated survey for the interactive page
(src/pages/teaching/heliolinc.astro).

Usage (the science-notebooks Python environment: numpy and scipy):
    python tools/export_heliolinc_data.py ../science-notebooks/notebooks/heliolinc

Re-runs the notebook's survey with the notebook's own module, orbits and seeds,
so the page links exactly the tracklets the notebook does. Writes:

  public/data/heliolinc/field.bin   all detections, then per-tracklet data:
      float32 t[n_det]      days from the window centre
      float32 dra[n_det]    RA minus the field's reference RA (radians)
      float32 ddec[n_det]   Dec minus the field's reference Dec (radians)
      int32   obj[n_trk]    index of the object (into names.json)
      uint8   cls[n_trk]    dynamical class (index into meta.classes)
    Detections come in tracklets of three, in order: tracklet k is detections
    3k, 3k + 1 and 3k + 2.
  public/data/heliolinc/names.json  MPC designation of each object
  src/data/heliolinc.json           the window, field and counts; Crocco's
                                    detections and true arrow; and the notebook's
                                    linking results, for comparison on the page.
"""
import json
import os
import subprocess
import sys
import time

import numpy as np

nb_dir = os.path.abspath(sys.argv[1])
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, nb_dir)
os.chdir(nb_dir)
import heliolinc as hl  # noqa: E402

DEG = np.pi / 180
CLASSES = ["MBA", "NEO", "Hilda", "Trojan", "Centaur", "TNO", "Other"]

# --- The notebook's survey (Section 1) and Crocco (Section 3) ----------------------
NAMES, ORBITS, META = hl.load_orbits("data/orbits.csv.gz")
CLASS = hl.classify(ORBITS["a"], ORBITS["e"])
T_C = META["window_centre_jd"]
LAM0 = META["opposition_longitude_deg"] * DEG
NIGHTS = T_C + np.arange(-12, 13, 3)
HALF_DEG = 4.0
FIELD = (LAM0, 0.0, np.tan(HALF_DEG * DEG))
det = hl.simulate_survey(ORBITS, NIGHTS, FIELD)
tr = hl.tracklet_table(det)
n_trk = len(tr["obj"])
assert np.all(tr["n"] == 3) and np.all(det["tracklet"] == np.repeat(np.arange(n_trk), 3))
findable = hl.findable(tr["obj"], tr["night"])

i_c = int(np.flatnonzero(NAMES == "(10606) Crocco")[0])
croc = hl.subset(ORBITS, [i_c])
T_CR = hl.nearest_new_moon(2461491.5) - 69.2 / 86400
u, r, delta, phase = hl.observe(croc, T_CR)
lam_c, beta_c = np.arctan2(u[0, 1], u[0, 0]), np.arcsin(u[0, 2])
det_c = hl.simulate_survey(croc, T_CR + np.arange(-12, 13, 3), (lam_c, beta_c, np.tan(60 * DEG)), v_limit=30)
p_c = hl.prepare(det_c, T_CR, 0.4)
truth = hl.true_arrow(croc, T_CR, p_c["frame"])[0]

# --- Compact the survey: objects renumbered, positions as offsets -----------------
objs, obj_new = np.unique(tr["obj"], return_inverse=True)
ra0, dec0 = float(np.median(det["ra"])), float(np.median(det["dec"]))
dra = np.angle(np.exp(1j * (det["ra"] - ra0)))
out_dir = f"{root}/public/data/heliolinc"
os.makedirs(out_dir, exist_ok=True)
with open(f"{out_dir}/field.bin", "wb") as f:
    (det["t"] - T_C).astype(np.float32).tofile(f)
    dra.astype(np.float32).tofile(f)
    (det["dec"] - dec0).astype(np.float32).tofile(f)
    obj_new.astype(np.int32).tofile(f)
    np.array([CLASSES.index(c) for c in CLASS[tr["obj"]]], dtype=np.uint8).tofile(f)
with open(f"{out_dir}/names.json", "w") as f:
    json.dump([str(n) for n in NAMES[objs]], f, separators=(",", ":"))

# --- The notebook's linking results (Sections 5 and 8), on the full-precision data ---
t0 = time.time()
GAMMA_DOTS = np.array([-4e-3, -2e-3, 0.0, 2e-3, 4e-3])
D_GRID = 1e-3 * 2.0 ** np.arange(-3.5, 2.6, 0.5)
DTS = [1.0, 2.0, 5.0, 10.0, 20.0]
arrows = hl.all_arrows(det, T_C, 0.4, GAMMA_DOTS)
scan = {str(dt): [hl.score(hl.cluster_arrows(arrows, d, dt), tr["obj"]) for d in D_GRID] for dt in DTS}
P0 = hl.prepare(det, T_C, 0.4)
finer = np.arange(-4e-3, 4.1e-3, 1e-3)
grids = {"nominal": ([0.4], GAMMA_DOTS), "four-gamma": ([0.3, 0.35, 0.4, 0.45], GAMMA_DOTS),
         "nine-gammadot": ([0.4], finer), "both": ([0.3, 0.35, 0.4, 0.45], finer)}
grid_scan = {}
for name, (gs, gds) in grids.items():
    a = hl.all_arrows(det, T_C, gs, gds, z_dir=P0["frame"][2])
    grid_scan[name] = [hl.score(hl.cluster_arrows(a, d, 5.0), tr["obj"]) for d in D_GRID]
print(f"Notebook results recomputed in {time.time() - t0:.0f} s")

try:
    commit = subprocess.run(["git", "-C", nb_dir, "log", "-1", "--format=%h"], capture_output=True, text=True).stdout.strip()
except OSError:
    commit = ""
meta = {
    "description": "The simulated survey of the science-notebooks HelioLinC notebook, exported by tools/export_heliolinc_data.py.",
    "source": "https://github.com/matthewjohnpayne/science-notebooks/tree/main/notebooks/heliolinc",
    "commit": commit,
    "file": "data/heliolinc/field.bin",
    "names": "data/heliolinc/names.json",
    "windowCentreJD": T_C,
    "oppositionLongitudeDeg": float(np.degrees(LAM0)),
    "fieldHalfWidthDeg": HALF_DEG,
    "nightsFromCentre": (NIGHTS - T_C).tolist(),
    "raRef": ra0,
    "decRef": dec0,
    "nDetections": int(len(det["t"])),
    "nTracklets": int(n_trk),
    "nObjects": int(len(objs)),
    "nFindable": int(len(findable)),
    "findableByClass": {c: int((CLASS[findable] == c).sum()) for c in CLASSES},
    "classes": CLASSES,
    "crocco": {
        "windowCentreJD": T_CR,
        "t": (det_c["t"] - T_CR).tolist(),
        "ra": det_c["ra"].tolist(),
        "dec": det_c["dec"].tolist(),
        "gamma": float(truth[4]),
        "gammaDot": float(truth[5]),
        "r": float(r[0]),
        "delta": float(delta[0]),
    },
    "notebook": {
        "gammaDots": GAMMA_DOTS.tolist(),
        "dGrid": D_GRID.tolist(),
        "dts": DTS,
        "scan": scan,
        "gridScan": grid_scan,
    },
}
with open(f"{root}/src/data/heliolinc.json", "w") as f:
    json.dump(meta, f, indent=1)
print(f"Wrote {out_dir}/field.bin ({os.path.getsize(out_dir + '/field.bin') / 1e6:.2f} MB), names.json, src/data/heliolinc.json")
print(f"{len(det['t'])} detections, {n_trk} tracklets, {len(objs)} objects, {len(findable)} findable; notebook {commit}")
