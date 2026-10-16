"""Reference encounters from the science-notebooks module notebooks/exomoons_wd/exomoons.py
(REBOUND, IAS15), for checking src/scripts/exomoons/physics.js (compare.mjs).

    python tools/validate_exomoons/reference.py ../science-notebooks/notebooks/exomoons_wd
    node tools/validate_exomoons/compare.mjs
"""
import json
import os
import sys
from multiprocessing import Pool

import numpy as np

sys.path.insert(0, os.path.abspath(sys.argv[1]))
import exomoons as ex  # noqa: E402

N_PER_CASE = 40


def one(args):
    case, moon = args
    b, c, a, e = ex.flyby_batch((case, {k: np.array([v]) for k, v in moon.items()}))
    fin = lambda x: float(x) if np.isfinite(x) else None      # unbound moons have no a, e (JSON has no NaN)
    return bool(b[0]), bool(c[0]), fin(a[0]), fin(e[0])


def main():
    rng = np.random.default_rng(5)
    cases = {}
    jobs = []
    for case in ["B", "C", "Y", "Z"]:
        c = ex.FLYBYS[case]
        r_H = ex.hill_radius(ex.A_P, 0, c["m_p"], ex.M_STAR)
        m = ex.sample_moons(20 * N_PER_CASE, r_H, c["r_p"], rng)
        keep = np.flatnonzero(m["a"] / r_H > 0.005)[:N_PER_CASE]
        moons = [{k: float(v[i]) for k, v in m.items()} for i in keep]
        sim = ex.flyby_massive(c["q"], c["vq"], c["m_p"], c["t_sim"])
        start = [list(p.xyz) + list(p.vxyz) for p in sim.particles]
        cases[case] = dict(moons=moons, start=start)
        jobs += [(case, mo) for mo in moons]
    with Pool(os.cpu_count()) as pool:
        res = pool.map(one, jobs, chunksize=1)
    k = 0
    for case in cases:
        out = []
        for _ in cases[case]["moons"]:
            out.append(dict(zip(["bound", "captured", "a", "e"], res[k])))
            k += 1
        cases[case]["results"] = out
    with open(os.path.join(os.path.dirname(__file__), "reference.json"), "w") as f:
        json.dump(cases, f)
    print("Wrote reference.json")


if __name__ == "__main__":
    main()
