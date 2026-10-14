"""Export the resonance-overlap notebook's Figure 5 Lyapunov-time maps for the
interactive page (src/pages/teaching/resonance-overlap.astro).

Usage (any Python with numpy):
    python tools/export_overlap_maps.py ../science-notebooks/notebooks/resonance_overlap

Writes public/data/overlap/fig5.bin (one byte per pixel, the three maps one
after another, rows of increasing e1, columns of increasing period ratio) and
src/data/overlap-maps.json (the grid and the byte encoding). Byte 0 means a
planet escaped (log10 T = -inf), 255 means no tangent growth (+inf), and 1..254
encode log10(T_Ly/P1) linearly from 0 to VMAX.
"""
import json
import os
import subprocess
import sys

import numpy as np

nb_dir = os.path.abspath(sys.argv[1])
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VMAX = 3.0
N_SIG, N_PR = 150, 600   # the notebook's full-resolution grid

maps = []
for k in range(3):
    v = np.load(f"{nb_dir}/cache/fig5_M1_{k}.npz")["values"].astype(float)
    assert v.size == N_SIG * N_PR, "expected the full-resolution cache"
    b = np.where(np.isneginf(v), 0, np.where(np.isposinf(v), 255, 1 + np.round(np.clip(v, 0, VMAX) / VMAX * 253)))
    maps.append(b.astype(np.uint8))

os.makedirs(f"{root}/public/data/overlap", exist_ok=True)
np.concatenate(maps).tofile(f"{root}/public/data/overlap/fig5.bin")
try:
    commit = subprocess.run(["git", "-C", nb_dir, "log", "-1", "--format=%h"], capture_output=True, text=True).stdout.strip()
except OSError:
    commit = ""
meta = {
    "description": "Lyapunov-time maps from the science-notebooks resonance-overlap notebook (its Figure 5 analogue, after DPH13 Figure 5), exported by tools/export_overlap_maps.py.",
    "source": "https://github.com/matthewjohnpayne/science-notebooks/tree/main/notebooks/resonance_overlap",
    "commit": commit,
    "file": "data/overlap/fig5.bin",
    "eps": 2e-5,
    "M1": [0.0, np.pi / 10, np.pi / 2],
    "M1Labels": ["0", "π/10", "π/2"],
    "pr": [1.05, 1.35, N_PR],
    "e1": [0.0, 0.10, N_SIG],
    "tDays": 1e6,
    "encoding": {"vmax": VMAX, "levels": 253, "negInf": 0, "posInf": 255},
}
with open(f"{root}/src/data/overlap-maps.json", "w") as f:
    json.dump(meta, f, indent=2)
print(f"wrote {3 * N_SIG * N_PR} pixels from {nb_dir} at {commit}")
