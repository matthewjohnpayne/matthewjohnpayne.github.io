"""Export the simulated RV data set of the science-notebooks notebook rv_demcmc (regenerated
with the notebook's own random seed and code), its N-body best fit, and reference values of
the log posterior for validating src/scripts/rvdemc/model.js.

    python tools/export_rvdemc_data.py ../science-notebooks/notebooks/rv_demcmc
    node tools/validate_rvdemc/compare.mjs
"""
import json
import os
import sys

import numpy as np
from scipy.optimize import least_squares, minimize

sys.path.insert(0, os.path.abspath(sys.argv[1]))
import rvdemc as rv  # noqa: E402

# As in tools/build_rv_demcmc.py (science-notebooks), in the same order of random draws
M_STAR = 0.32
rng = np.random.default_rng(1)
TRUTH = [dict(P=30.1, K=88.0, e=0.26, omega=0.8, M=1.0), dict(P=61.1, K=212.0, e=0.03, omega=0.4, M=2.0)]
JIT_TRUE = 2.0
t = np.sort(rng.uniform(0, 1500, 120))
err = np.full(t.size, 3.0)
data = dict(t=t, rv=rv.nbody_rv(TRUTH, t, M_STAR) + rng.normal(0, np.hypot(3.0, JIT_TRUE), t.size), err=err)


def residuals(x, model):
    planets, C, _ = rv.unpack(np.append(x, 0.0), 2)
    m = rv.keplerian_rv(planets, t) if model == "kepler" else rv.nbody_rv(planets, t, M_STAR)
    return (data["rv"] - m - C) / data["err"]


x_true = rv.pack(TRUTH, 0.0, 1.0)[:-1]
start = x_true * (1 + 0.02 * rng.normal(size=x_true.size))
start[[0, 5]] = x_true[[0, 5]]
kep = least_squares(residuals, start, args=("kepler",))
nbf = least_squares(residuals, kep.x, args=("nbody",))
print(f"chi^2/N: Keplerian {(kep.fun**2).mean():.1f}, N-body {(nbf.fun**2).mean():.2f} (notebook: 375.4 and 1.29)")

post = rv.Posterior(data, 2, "nbody", M_STAR)
best = np.append(nbf.x, np.log1p(JIT_TRUE))
check_x = [best, rv.pack(TRUTH, 0.0, JIT_TRUE)] + [best + 1e-3 * rng.normal(size=best.size) * np.maximum(np.abs(best), 1) for _ in range(4)]
# The posterior's maximum and its Gaussian approximation (inverse Hessian of the log posterior),
# used on the page to set the random walk's step sizes (as the notebook's Section 4 does with
# DEMCMC's posterior widths) and to draw the target the samplers should cover.
mp = minimize(lambda x: -post(x), best, method="Nelder-Mead", options=dict(maxiter=6000, xatol=1e-9, fatol=1e-7)).x
n = mp.size
h = 1e-4 * np.maximum(np.abs(mp), 1) * np.array([0.01, 1, 1, 0.01, 0.01] * 2 + [1, 1])
H = np.zeros((n, n))
for i in range(n):
    for j in range(i, n):
        ei, ej = np.zeros(n), np.zeros(n)
        ei[i], ej[j] = h[i], h[j]
        H[i, j] = H[j, i] = (post(mp + ei + ej) - post(mp + ei - ej) - post(mp - ei + ej) + post(mp - ei - ej)) / (4 * h[i] * h[j])
cov = np.linalg.inv(-H)
sd = np.sqrt(np.diag(cov))
corr = cov / np.outer(sd, sd)
print(f"Gaussian approximation: largest |correlation| {np.abs(corr - np.eye(n)).max():.3f}, condition number {np.linalg.cond(corr):.0f}")


def physical(x):
    planets, C, jit = rv.unpack(x, 2)
    ms = [rv.mass_from_K(p["K"], p["P"], p["e"], M_STAR + (0 if i == 0 else rv.mass_from_K(planets[0]["K"], planets[0]["P"], planets[0]["e"], M_STAR)))
          / rv.M_JUP for i, p in enumerate(planets)]
    return [ms[0], ms[1], planets[0]["P"], planets[1]["P"], planets[0]["e"], planets[1]["e"], jit]


gauss = rng.multivariate_normal(mp, cov, 1500)
phys = np.array([physical(x) for x in gauss])
pc = np.corrcoef(phys[:, :6].T)
np.fill_diagonal(pc, 0)
pair = [int(v) for v in np.unravel_index(np.abs(pc).argmax(), pc.shape)]
print(f"most correlated physical pair: {pair}, r = {pc[pair[0], pair[1]]:.3f}")
fine = np.linspace(0, 1500, 600)
out = dict(m_star=M_STAR, truth=TRUTH, jit_true=JIT_TRUE, t=t.tolist(), rv=data["rv"].tolist(), err=err.tolist(),
           best=best.tolist(), kep_best=np.append(kep.x, np.log1p(JIT_TRUE)).tolist(),
           chi2_kep=float((kep.fun**2).mean()), chi2_nb=float((nbf.fun**2).mean()),
           map=mp.tolist(), sd=sd.tolist(), cov=cov.tolist(), pair=pair,
           gauss_phys=np.round(phys, 6).tolist())
ref = dict(x=[x.tolist() for x in check_x], logp=[float(post(x)) for x in check_x],
           fine=fine.tolist(), rv_truth_nbody=rv.nbody_rv(TRUTH, fine, M_STAR).tolist(),
           rv_truth_kepler=rv.keplerian_rv(TRUTH, fine).tolist())
here = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(here, "..", "src", "data", "rvdemc.json"), "w") as f:
    json.dump(out, f)
os.makedirs(os.path.join(here, "validate_rvdemc"), exist_ok=True)
with open(os.path.join(here, "validate_rvdemc", "reference.json"), "w") as f:
    json.dump(ref, f)
print("log posterior at the checks:", [round(v, 4) for v in ref["logp"]])
