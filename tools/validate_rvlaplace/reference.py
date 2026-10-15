"""Reference GJ 876 integrations (REBOUND IAS15) from the science-notebooks module
notebooks/laplace_gj876/gj876.py, for checking src/scripts/rvlaplace/physics.js (compare.mjs).

    python tools/validate_rvlaplace/reference.py ../science-notebooks/notebooks/laplace_gj876
    node tools/validate_rvlaplace/compare.mjs
"""
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.abspath(sys.argv[1]))
import gj876  # noqa: E402

out = {}
for f in (0.2, 1.0, 5.0):
    run = gj876.evolve(gj876.medians(), years=60.0, n_out=3000, mass_scale={"e": f})
    ang = gj876.angles(run)
    out[str(f)] = {k: ang[k].tolist() for k in ("phi_cb_c", "phi_cb_b", "phi_be_b", "laplace")}
    out[str(f)]["amp"] = {k: gj876.amplitude(ang[k]) for k in ("phi_cb_c", "phi_cb_b", "phi_be_b", "laplace")}

# the star's radial velocity (line of sight +z) over the first 200 days
sim = gj876.make_sim(gj876.medians())
t = np.linspace(0, 200, 401)
rv = []
for ti in t:
    sim.integrate(ti)
    rv.append(-sim.particles[0].vz * 1.495978707e11 / 86400)
out["rv"] = dict(t=t.tolist(), rv=rv)
with open(os.path.join(os.path.dirname(__file__), "reference.json"), "w") as fh:
    json.dump(out, fh)
print({f: out[f]["amp"] for f in ("0.2", "1.0", "5.0")})
