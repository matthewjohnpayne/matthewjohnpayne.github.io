"""Reference transit times for validating src/scripts/ttv/physics.js.

Usage (the science-notebooks Python environment):
    python tools/validate_ttv/reference.py ../science-notebooks/notebooks/ttv_inclined

Runs the notebook's module (REBOUND, IAS15) for PFV10's Figure 1 systems and
for random Hill-stable systems, and writes tools/validate_ttv/reference.json.
"""
import json
import os
import sys
from multiprocessing import Pool

import numpy as np

nb_dir = os.path.abspath(sys.argv[1])
here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, nb_dir)
import ttv  # noqa: E402


def run(job):
    sim = ttv.make_sim(*job)
    bary = [[p.x, p.y, p.z, p.vx, p.vy, p.vz] for p in sim.particles]
    return {"job": list(job), "bary": bary, "times": ttv.transit_times(sim).tolist()}


if __name__ == "__main__":
    jobs = [(ar, e, np.radians(i), 0.0, 0.0, 0.0) for ar, e in
            [(1.59, 0.02), (2.08, 0.12), (2.92, 0.05), (1.63, 0.05), (3.6, 0.15), (3.6, 0.55)] for i in [0, 45, 90, 180]]
    rng = np.random.default_rng(7)
    while len(jobs) < 64:
        a, e, i = rng.uniform(1.3, 4.0), rng.uniform(0, 0.5), rng.uniform(0, np.pi)
        if ttv.gladman_hill_stable(a, e):
            jobs.append((a, e, i, *rng.uniform(0, 2 * np.pi, 3)))
    with Pool(os.cpu_count()) as pool:
        out = pool.map(run, [tuple(map(float, j)) for j in jobs])
    json.dump(out, open(f"{here}/reference.json", "w"))
    print(f"Wrote reference.json: {len(out)} systems")
