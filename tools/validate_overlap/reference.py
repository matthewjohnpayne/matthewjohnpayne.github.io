"""Reference values for validating src/scripts/overlap/physics.js against the
science-notebooks resonance-overlap notebook (its overlap.py module and its
cached Lyapunov-time maps).

Usage (any Python with REBOUND 5 and numpy):
    python tools/validate_overlap/reference.py ../science-notebooks/notebooks/resonance_overlap
writes tools/validate_overlap/reference.json, then run
    node tools/validate_overlap/compare.mjs
"""
import json
import os
import sys

import numpy as np

nb_dir = os.path.abspath(sys.argv[1])
sys.path.insert(0, nb_dir)
import overlap as ov  # noqa: E402

rng = np.random.default_rng(2013)
out = {"source": "science-notebooks/notebooks/resonance_overlap (overlap.py and cache/*.npz)"}

# Initial conditions, as Jacobi coordinates
out["states"] = []
for eps, pr, e1, M1 in [(2e-5, 1.2, 0.05, 0.3), (2e-3, 1.5, 0.01, -2.0), (1e-6, 1.04, 0.0, np.pi / 2)]:
    sim = ov.two_planet_sim(eps, pr, e1=e1, M1=M1)
    p0, p1, p2 = sim.particles[:3]
    com = np.array([p0.x * p0.m + p1.x * p1.m, p0.y * p0.m + p1.y * p1.m,
                    p0.vx * p0.m + p1.vx * p1.m, p0.vy * p0.m + p1.vy * p1.m]) / (p0.m + p1.m)
    y = [p1.x - p0.x, p1.y - p0.y, p1.vx - p0.vx, p1.vy - p0.vy,
         p2.x - com[0], p2.y - com[1], p2.vx - com[2], p2.vy - com[3]]
    out["states"].append({"eps": eps, "pr": pr, "e1": e1, "M1": M1, "y": y,
                          "E": sim.energy(), "L": float(np.linalg.norm(sim.angular_momentum())),
                          "hill_margin": ov.hill_margin(sim)})

out["hill"] = [{"eps": eps, "e1": e1, "M1": M1, "pr": ov.hill_period_ratio(eps, e1=e1, M1=M1)}
               for eps, e1, M1 in [(2e-5, 0, np.pi / 2), (2e-5, 0.05, 0.0), (2e-3, 0.01, 0.0), (1e-6, 0, np.pi / 2)]]

out["separatrix"] = []
for eps, m in [(2e-5, 4), (2e-5, 9), (2e-4, 3)]:
    (pi, si), (po, so) = ov.resonance_separatrix(eps, m)
    k = np.arange(0, 600, 37)
    out["separatrix"].append({"eps": eps, "m": m, "k": k.tolist(),
                              "inner_pr": pi[k].tolist(), "inner_sigma": si[k].tolist(),
                              "outer_pr": po[k].tolist(), "outer_sigma": so[k].tolist()})

# Random pixels of the notebook's maps, with the notebook's values
samples = []
prs5, sigs5 = np.linspace(1.05, 1.35, 600), np.linspace(0, 0.10, 150)
for k, M1 in enumerate([0.0, np.pi / 10, np.pi / 2]):
    vals = np.load(f"{nb_dir}/cache/fig5_M1_{k}.npz")["values"].reshape(150, 600)
    for _ in range(150):
        i, j = rng.integers(150), rng.integers(600)
        samples.append({"map": f"fig5_M1_{k}", "eps": 2e-5, "pr": prs5[j], "e1": sigs5[i], "M1": M1, "notebook": float(vals[i, j])})
m1s = np.linspace(-np.pi, np.pi, 361)
for k, (eps, lo, hi) in enumerate([(2e-3, 1.10, 1.70), (2e-4, 1.15, 1.35), (2e-5, 1.05, 1.20)]):
    prs9 = np.linspace(lo, hi, 160)
    vals = np.load(f"{nb_dir}/cache/fig9_eps_{k}.npz")["values"].reshape(160, 361)
    for _ in range(100):
        i, j = rng.integers(160), rng.integers(361)
        samples.append({"map": f"fig9_eps_{k}", "eps": eps, "pr": prs9[i], "e1": 0.01, "M1": m1s[j], "notebook": float(vals[i, j])})
out["lyapunov"] = [{k: (v if not isinstance(v, float) or np.isfinite(v) else ("inf" if v > 0 else "-inf")) for k, v in s.items()} for s in samples]

path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "reference.json")
with open(path, "w") as f:
    json.dump(out, f, indent=1)
print(f"wrote {path}: {len(samples)} map samples")
