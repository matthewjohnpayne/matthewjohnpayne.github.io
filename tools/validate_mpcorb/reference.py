"""Reference results for checking src/scripts/mpcorb/orbit.js (compare.mjs), from REBOUND (two-body
propagation with IAS15, Sun only), NumPy (Monte Carlo) and the mpc_orb package (schema validation).

    python tools/validate_mpcorb/reference.py
    node tools/validate_mpcorb/compare.mjs
"""
import json
import pathlib

import numpy as np
import rebound
from mpc_orb import validate_mpcorb
from mpc_orb.parse import MPCORB

HERE = pathlib.Path(__file__).resolve().parent
DATA = HERE.parents[1] / "public" / "data" / "mpc_orb"
GM = 0.01720209895 ** 2
out = {}
for item in json.loads((DATA / "index.json").read_text()):
    orb = json.loads((DATA / f"{item['key']}.json").read_text())
    try:
        validate_mpcorb.validate_mpcorb(orb)
        valid = "schema ok"
    except Exception as ex:  # report, don't stop
        valid = f"schema error: {str(ex)[:120]}"
    MPCORB(orb)  # parses
    s0 = np.array(orb["CAR"]["coefficient_values"][:6])
    res = {"valid": valid, "prop": []}
    for dt in (-3652.5, -365.25, 30.0, 365.25, 3652.5, 18262.5):
        sim = rebound.Simulation()
        sim.G = 1.0
        sim.add(m=GM)
        sim.add(m=0.0, x=s0[0], y=s0[1], z=s0[2], vx=s0[3], vy=s0[4], vz=s0[5])
        sim.integrator = "ias15"
        sim.integrate(dt, exact_finish_time=1)
        p = sim.particles[1]
        res["prop"].append({"dt": dt, "s": [p.x, p.y, p.z, p.vx, p.vy, p.vz]})
    # Monte Carlo: clones from the CAR covariance, converted to cometary elements (q, e, i)
    C = np.array([[orb["CAR"]["covariance"][f"cov{min(i, j)}{max(i, j)}"] for j in range(6)] for i in range(6)])
    clones = np.random.default_rng(1).multivariate_normal(s0, C, 4000)
    qs = []
    for c in clones:
        r, v = c[:3], c[3:]
        h = np.cross(r, v)
        e = np.linalg.norm(np.cross(v, h) / GM - r / np.linalg.norm(r))
        qs.append([h @ h / GM / (1 + e), e, np.degrees(np.arccos(h[2] / np.linalg.norm(h)))])
    res["mc_std_qei"] = np.std(qs, axis=0).tolist()
    res["file_unc_qei"] = orb["COM"]["coefficient_uncertainties"][:3]
    out[item["key"]] = res
    print(f"{item['key']:8s} {valid:12s} MC/file sigma (q,e,i): {np.round(np.array(res['mc_std_qei']) / np.array(res['file_unc_qei']), 3)}")
(HERE / "reference.json").write_text(json.dumps(out))
