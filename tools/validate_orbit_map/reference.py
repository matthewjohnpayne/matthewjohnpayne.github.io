#!/usr/bin/env python3
"""Reference values for the asteroid-belt orbit map (src/scripts/orbitmap/kepler.js).

1. Two-body positions from REBOUND for 400 orbits from public/data/orbitmap/belt.bin (decoded with
   the same quantisation as the page) and for Jupiter, at several times; compare.mjs checks the
   page's Kepler solver against them.
2. The Hilda triangle and the Trojan clouds in the frame turning with Jupiter: the fraction of
   Hilda-band orbits beyond 4.4 au (near aphelion) lying within 25 deg of the directions 60 deg ahead
   of, 60 deg behind and opposite Jupiter's mean longitude, and of Trojan-band orbits within 30 deg
   of +-60 deg, at each time. A uniform spread would give 150/360 = 0.42 and 120/360 = 0.33.
3. With the MPCORB file as argument: the position error caused by quantising the elements, for
   the same 400 orbits, at the end of the page's time range.

    python3 tools/validate_orbit_map/reference.py [MPCORB.DAT.gz]
Writes tools/validate_orbit_map/reference.json.
"""
import json
import math
import pathlib
import sys

import numpy as np
import rebound

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[1]
TIMES = [-50.0, -10.0, 0.0, 10.0, 25.0, 50.0]          # years after the epoch
N_SAMPLE = 400

meta = json.loads((ROOT / "src" / "data" / "orbitmap.json").read_text())
N = meta["counts"]["total"]
raw = (ROOT / "public" / "data" / "orbitmap" / "belt.bin").read_bytes()
a = np.frombuffer(raw[:4 * N], "<f4").astype(float)
u = np.frombuffer(raw[4 * N:], "<u2").reshape(5, N).astype(float) / 65535
s = meta["scales"]
el = np.column_stack([a, u[0] * s["e"], u[1] * s["i"], u[2] * s["node"], u[3] * s["peri"], u[4] * s["M"]])
K = meta["gaussK"] * 365.25                               # rad/yr for a = 1 au, as on the page

rng = np.random.default_rng(1)
idx = np.sort(rng.choice(N, N_SAMPLE, replace=False))


def rebound_positions(elements, times, G=K * K):
    """Ecliptic x, y of test particles on two-body orbits about a unit mass (G = K^2 by default)."""
    out = {t: [] for t in times}
    for row in elements:
        for t in times:
            sim = rebound.Simulation()
            sim.G = G
            sim.add(m=1.0)
            aa, e, inc, node, peri, M = row
            sim.add(primary=sim.particles[0], a=aa, e=e, inc=math.radians(inc), Omega=math.radians(node),
                    omega=math.radians(peri), M=math.radians(M))
            sim.integrator = "whfast"
            sim.dt = 0.01 if t >= 0 else -0.01
            sim.integrate(t, exact_finish_time=1) if t else None
            p = sim.particles[1]
            out[t].append([p.x, p.y])
    return out


ref = {"times": TIMES, "indices": idx.tolist()}
pos = rebound_positions(el[idx], TIMES)
ref["asteroids"] = {str(t): pos[t] for t in TIMES}

J = meta["planets"]["jupiter"]
# Jupiter's own two-body orbit about the Sun, with G M = n^2 a^3 from its osculating elements
# (so the mass of Jupiter is included, as in the page's mean motion)
nJ = math.radians(J["n_deg_per_day"]) * 365.25
jpos = rebound_positions([[J["a"], J["e"], J["i"], J["node"], J["peri"], J["M"]]], TIMES, G=nJ * nJ * J["a"] ** 3)
ref["jupiter"] = {str(t): jpos[t][0] for t in TIMES}


def kepler_xy(e_rows, t):
    aa, e, inc, node, peri, M0 = [e_rows[:, k] for k in range(6)]
    inc, node, peri, M0 = map(np.radians, (inc, node, peri, M0))
    M = M0 + K / aa ** 1.5 * t
    E = M.copy()
    E[e >= 0.8] = math.pi
    for _ in range(60):
        E -= (E - e * np.sin(E) - M) / (1 - e * np.cos(E))
    xp, yp = aa * (np.cos(E) - e), aa * np.sqrt(1 - e * e) * np.sin(E)
    cw, sw, cW, sW, ci = np.cos(peri), np.sin(peri), np.cos(node), np.sin(node), np.cos(inc)
    return ((cW * cw - sW * sw * ci) * xp + (-cW * sw - sW * cw * ci) * yp,
            (sW * cw + cW * sw * ci) * xp + (-sW * sw + cW * cw * ci) * yp)


# Hilda triangle and Trojan clouds in Jupiter's frame
lam0 = math.radians(J["node"] + J["peri"] + J["M"])
hil = (a >= meta["bands"]["hilda"][0]) & (a <= meta["bands"]["hilda"][1])
tro = (a >= meta["bands"]["trojan"][0]) & (a <= meta["bands"]["trojan"][1])
shape = []
for t in TIMES + [100.0, 200.0]:
    x, y = kepler_xy(el, t)
    ang = (np.degrees(np.arctan2(y, x) - (lam0 + nJ * t)) + 180) % 360 - 180
    far = hil & (np.hypot(x, y) > 4.4)
    near = lambda c, w: np.abs((ang - c + 180) % 360 - 180) < w
    f_h = float(np.mean((near(60, 25) | near(-60, 25) | near(180, 25))[far]))
    f_t = float(np.mean((near(60, 30) | near(-60, 30))[tro]))
    shape.append({"t": t, "hildaFar": int(far.sum()), "hildaNearVertices": round(f_h, 3), "trojanNearL4L5": round(f_t, 3)})
ref["shape"] = shape

if len(sys.argv) > 1:   # quantisation error, against the unquantised MPCORB elements
    sys.path.insert(0, str(ROOT / "tools"))
    from export_orbit_map import build_sample
    exact, _ = build_sample(sys.argv[1])
    errs = {}
    for t in [0.0, 50.0]:
        xq, yq = kepler_xy(el[idx], t)
        xe, ye = kepler_xy(exact[idx], t)
        d = np.hypot(xq - xe, yq - ye)
        errs[str(t)] = {"median_au": float(np.median(d)), "max_au": float(d.max())}
    ref["quantisation"] = errs

(HERE / "reference.json").write_text(json.dumps(ref, indent=1) + "\n")
print(json.dumps({k: ref[k] for k in ("shape",) + (("quantisation",) if "quantisation" in ref else ())}, indent=1))
