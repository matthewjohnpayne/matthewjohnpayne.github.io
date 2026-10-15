"""Reference values from the science-notebooks module notebooks/iso_lsst/iso.py, for
checking src/scripts/iso/physics.js (compare.mjs).

    python tools/validate_iso/reference.py ../science-notebooks/notebooks/iso_lsst
    node tools/validate_iso/compare.mjs
"""
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.abspath(sys.argv[1]))
import iso  # noqa: E402

rng = np.random.default_rng(11)
# 60 objects that come close (so that most are detectable), plus 20 drawn at random
v_gal = iso.sample_velocities(400, rng)
b = iso.B_MAX * rng.random(400) ** (1 / 3)
psi = 2 * np.pi * rng.random(400)
jd0 = 2459215.5 + np.floor(365 * rng.random(400))
r0, v0 = iso.place(v_gal, b, psi)
el = iso.elements(r0, v0)
pick = np.concatenate([np.flatnonzero(el["q"] < 1.5)[:60], np.arange(20)])

days = np.arange(0.0, iso.T_SPAN + 1)
objs = []
for k in pick:
    e1 = {key: val[k:k + 1] for key, val in el.items()}
    r = iso.positions(e1, days)[0]
    earth = iso.earth_position(jd0[k] + days)
    geo = r - earth
    m = iso.apparent_magnitude(iso.H_OUMUAMUA, np.linalg.norm(r, axis=1), np.linalg.norm(geo, axis=1), np.linalg.norm(earth, axis=1))
    ra, dec = iso.ecl_to_radec(geo)
    ra_s, dec_s = iso.ecl_to_radec(-earth)
    obs = iso.observable_tonight(ra, dec, ra_s, dec_s)
    objs.append(dict(vGal=v_gal[k].tolist(), b=float(b[k]), psi=float(psi[k]), jd0=float(jd0[k]),
                     r0=r0[k].tolist(), v0=v0[k].tolist(), q=float(el["q"][k]), e=float(el["e"][k]),
                     x=r[::30].tolist(), m=m.tolist(), obs=obs.astype(int).tolist()))

ra_e, dec_e, dens = iso.radiant_map("G", n_ra=36, n_dec=18, n_v=120)
ref = dict(objects=objs, apex=list(iso.solar_apex()),
           known={k: list(iso.asymptote(**v)) for k, v in iso.KNOWN.items()},
           radiant=dict(n_ra=36, n_dec=18, map=dens.tolist()),
           rate20=iso.rate_factor(20), rate40=iso.rate_factor(40))
with open(os.path.join(os.path.dirname(__file__), "reference.json"), "w") as f:
    json.dump(ref, f)
print(f"Wrote reference.json: {len(objs)} objects")
