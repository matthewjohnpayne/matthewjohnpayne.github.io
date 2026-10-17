"""Reference values from the science-notebooks module notebooks/planet_nine/p9sec.py,
for checking src/scripts/planet9/physics.js (compare.mjs).

    python tools/validate_planet9/reference.py ../science-notebooks/notebooks/planet_nine
    node tools/validate_planet9/compare.mjs
"""
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.abspath(sys.argv[1]))
import p9sec as ps  # noqa: E402

states = [(400.0, 0.9, 10, 37, 143), (300.0, 0.7, 10, 0, 180), (250.0, 0.88, 40, 90, 90), (500.0, 0.93, 150, 20, 300)]
out = []
for a, e, i, w, O in states:
    y = ps.elements_to_vectors(e, *np.radians([i, w, O]))
    for j2 in (False, True):
        out.append(dict(a=a, y=y.tolist(), j2=j2, rhs=ps.Secular(a, j2=j2).rhs(1.0e8, y).tolist()))
traj = ps.evolve((300.0, 1 - 40 / 300, np.radians(10), np.radians(30), np.radians(150), 1.0e9, 11, {}))
ref = dict(rhs=out, traj=dict(a=300.0, e=1 - 40 / 300, i=10, w=30, O=150, t_end=1.0e9,
                              e_out=traj["e"].tolist(), i_out=traj["i"].tolist(), varpi_out=traj["varpi"].tolist()))
with open(os.path.join(os.path.dirname(__file__), "reference.json"), "w") as f:
    json.dump(ref, f)
print("Wrote reference.json")
