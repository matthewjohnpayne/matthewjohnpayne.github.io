"""Export the TTV notebook's maps for the interactive page
(src/pages/teaching/transit-timing.astro).

Usage (the science-notebooks Python environment):
    python tools/export_ttv_maps.py ../science-notebooks/notebooks/ttv_inclined

Rebuilds the notebook's grids and Hill-stability masks, reads its cached
integrations (cache/fig2_*.npz, fig3_*.npz, fig4_*.npz; five random
orientations per grid point) and writes the median RMS TTV of every grid point
to public/data/ttv/maps.json (null where the point was not simulated).
"""
import json
import os
import subprocess
import sys
import warnings

import numpy as np

nb_dir = os.path.abspath(sys.argv[1])
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, nb_dir)
import ttv  # noqa: E402

N_REAL = 5


def medians(name, points):
    points = np.asarray(points, dtype=float)
    stable = ttv.gladman_hill_stable(points[:, 0], points[:, 1])
    vals = np.load(f"{nb_dir}/cache/{name}.npz")["values"].astype(float)
    assert len(vals) == stable.sum() * N_REAL, f"{name}: expected the full-resolution cache"
    out = np.full((len(points), N_REAL), np.nan)
    out[stable] = vals.reshape(-1, N_REAL)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        med = np.nanmedian(out, axis=1)
    return [None if not np.isfinite(v) else float(f"{v:.3g}") for v in med]


E2 = np.linspace(0, 0.6, 25); I2 = np.linspace(0, 180, 25)
FIG2 = [("2:1 resonance", 1.59), ("3:1 resonance", 2.08), ("5:1 resonance", 2.92), ("adjacent to 2:1", 1.63), ("non-resonant", 3.6)]
A3 = np.linspace(1.25, 4.0, 111); E3 = np.linspace(0, 0.6, 21)
A4 = np.linspace(1.50, 1.70, 51); E4 = np.linspace(0, 0.3, 21)
INC = [0, 30, 45, 90, 135, 180]

out = {
    "description": "Median RMS TTVs (seconds) from the science-notebooks TTV notebook (after Payne, Ford & Veras 2010), exported by tools/export_ttv_maps.py. Rows are increasing e2; null means not Hill stable, so not simulated.",
    "source": "https://github.com/matthewjohnpayne/science-notebooks/tree/main/notebooks/ttv_inclined",
    "commit": subprocess.run(["git", "-C", nb_dir, "log", "-1", "--format=%h"], capture_output=True, text=True).stdout.strip(),
    "nReal": N_REAL,
    "eccInc": {"e2": E2.tolist(), "i2": I2.tolist(), "maps": [
        {"label": lab, "aRatio": ar, "values": medians(f"fig2_{k}", [(ar, e, i) for e in E2 for i in I2])} for k, (lab, ar) in enumerate(FIG2)]},
    "flames": {"aRatio": A3.tolist(), "e2": E3.tolist(), "inc": INC, "maps": [
        medians(f"fig3_{k}", [(a, e, inc) for e in E3 for a in A3]) for k, inc in enumerate(INC)]},
    "closeUp": {"aRatio": A4.tolist(), "e2": E4.tolist(), "inc": INC, "maps": [
        medians(f"fig4_{k}", [(a, e, inc) for e in E4 for a in A4]) for k, inc in enumerate(INC)]},
}
os.makedirs(f"{root}/public/data/ttv", exist_ok=True)
with open(f"{root}/public/data/ttv/maps.json", "w") as f:
    json.dump(out, f, separators=(",", ":"))
print(f"Wrote public/data/ttv/maps.json ({os.path.getsize(root + '/public/data/ttv/maps.json') / 1e3:.0f} kB), notebook {out['commit']}")
