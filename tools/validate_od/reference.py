"""Independent Python reference for the orbit-determination page (src/scripts/od/od.js).

    python tools/validate_od/reference.py      # writes tools/validate_od/reference.json

It reads public/data/od/yr4.json (from tools/export_od_data.py) and, with SciPy instead of the
page's hand-written code, computes:
  1. the astrometric positions of 2024 YR4 predicted from JPL's orbit with this force model
     (Sun, planets, Moon) and light-time correction, compared with JPL Horizons' own;
  2. the least-squares orbit from all the observations, and from the first 1, 2 and 4 weeks,
     with the same weights and outlier rule as the page, compared with JPL's orbit;
  3. Gauss's method on three observations, and the admissible region and predicted positions
     for the discovery tracklet, for a one-to-one comparison with the page.
Integration: scipy.integrate.solve_ivp (DOP853, rtol 1e-12); the page uses fixed-step RK4.
"""
import json
import os

import numpy as np
from scipy.integrate import solve_ivp
from scipy.interpolate import CubicHermiteSpline
from scipy.optimize import least_squares

HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, "..", "..", "public", "data", "od", "yr4.json")))
HZ = json.load(open(os.path.join(HERE, "horizons.json")))["radec"]
C = D["c_au_per_day"]
EPOCH, PREDICT = D["epoch"], D["predict"]
AS = np.pi / 180 / 3600
EPS = 84381.448 * AS                       # J2000 obliquity, ICRF -> ecliptic
CHI2_REJECT, CHI2_RECOVER = 8.0, 7.0       # outlier rule (Carpino et al. 2003)

tab = D["table"]
tt = tab["t0"] + tab["step"] * np.arange(tab["n"])
GM, SPL = [], []
for name in tab["bodies"]:
    b = tab["data"][name]
    xv = np.array(b["xv"])
    GM.append(b["gm"])
    SPL.append(CubicHermiteSpline(tt, xv[:, :3], xv[:, 3:]))
GM = np.array(GM)
GM_SUN = GM[0]
_ALL = np.array([np.array(tab["data"][n]["xv"]) for n in tab["bodies"]])       # body, time, 6
ALL = CubicHermiteSpline(tt, _ALL[:, :, :3].transpose(1, 0, 2), _ALL[:, :, 3:].transpose(1, 0, 2))
OBS = D["obs"]
T = np.array([o["t"] for o in OBS])
SITE = np.array([o["site"] for o in OBS])
RA, DEC = np.radians([o["ra"] for o in OBS]), np.radians([o["dec"] for o in OBS])
SIGMA_FLOOR = 0.5                         # arcsec; see the page and Veres et al. (2017)
SIG = np.maximum(np.array([[o["sra"], o["sdec"]] for o in OBS]), SIGMA_FLOOR)


def body_pos(t):
    return ALL(t)


def sun_state(t):
    return np.concatenate([SPL[0](t), SPL[0].derivative()(t)])


def rhs(t, y):
    d = body_pos(t) - y[:3]
    a = (GM[:, None] * d / np.linalg.norm(d, axis=1)[:, None] ** 3).sum(0)
    return np.concatenate([y[3:], a])


def propagate(x0, t0, t_min, t_max):
    """Dense solution covering [t_min, t_max]: a function of t returning position(s)."""
    sols = []
    if t_min < t0:
        sols.append(solve_ivp(rhs, (t0, t_min - 0.05), x0, method="DOP853", rtol=1e-12, atol=1e-16, dense_output=True))
    if t_max > t0:
        sols.append(solve_ivp(rhs, (t0, t_max + 0.05), x0, method="DOP853", rtol=1e-12, atol=1e-16, dense_output=True))

    def at(t):
        t = np.atleast_1d(t)
        out = np.empty((len(t), 6))
        for i, ti in enumerate(t):
            s = sols[0] if (ti < t0 or len(sols) == 1) else sols[-1]
            out[i] = s.sol(ti)
        return out
    return at


def unit(ra, dec):
    return np.stack([np.cos(dec) * np.cos(ra), np.cos(dec) * np.sin(ra), np.sin(dec)], -1)


def radec_of(v):
    return np.arctan2(v[..., 1], v[..., 0]) % (2 * np.pi), np.arcsin(v[..., 2] / np.linalg.norm(v, axis=-1))


def predict(at, t, site):
    """Astrometric RA, Dec (rad) with light-time correction, observed at time t from site."""
    tau = np.zeros(len(t))
    for _ in range(3):
        rho = at(t - tau)[:, :3] - site[:, :3]
        tau = np.linalg.norm(rho, axis=1) / C
    return radec_of(rho)


def residuals_arcsec(x0, idx):
    at = propagate(x0, EPOCH, T[idx].min(), T[idx].max())
    ra, de = predict(at, T[idx], SITE[idx])
    dra = ((RA[idx] - ra + np.pi) % (2 * np.pi) - np.pi) * np.cos(DEC[idx]) / AS
    dde = (DEC[idx] - de) / AS
    return dra, dde


def fit(idx, x0):
    """Weighted least squares with iterative outlier rejection. Returns state, covariance, used mask."""
    idx = np.asarray(idx)
    use = np.ones(len(idx), bool)
    for _ in range(6):
        def f(x):
            a, b = residuals_arcsec(x, idx[use])
            return np.concatenate([a / SIG[idx[use], 0], b / SIG[idx[use], 1]])
        sol = least_squares(f, x0, x_scale=[1e-3] * 3 + [1e-5] * 3, xtol=1e-14, ftol=1e-14, gtol=1e-14)
        x0 = sol.x
        a, b = residuals_arcsec(x0, idx)
        chi2 = (a / SIG[idx, 0]) ** 2 + (b / SIG[idx, 1]) ** 2
        new = np.where(use, chi2 < CHI2_REJECT, chi2 < CHI2_RECOVER)
        if (new == use).all():
            break
        use = new
    J = sol.jac
    cov = np.linalg.inv(J.T @ J)
    return x0, cov, use, a, b


def kepler_elements(x, mu=GM_SUN):
    """Heliocentric ecliptic a, e, i (deg), q from a heliocentric ICRF state."""
    ce, se = np.cos(EPS), np.sin(EPS)
    R = np.array([[1, 0, 0], [0, ce, se], [0, -se, ce]])
    r, v = R @ x[:3], R @ x[3:]
    h = np.cross(r, v)
    ev = np.cross(v, h) / mu - r / np.linalg.norm(r)
    e = np.linalg.norm(ev)
    a = 1 / (2 / np.linalg.norm(r) - v @ v / mu)
    return dict(a=a, e=e, i=np.degrees(np.arccos(h[2] / np.linalg.norm(h))), q=a * (1 - e))


# ------------------------------------------------------------------ Gauss's method
def stumpff(z):
    if z > 1e-8:
        s = np.sqrt(z); return (s - np.sin(s)) / s**3, (1 - np.cos(s)) / z
    if z < -1e-8:
        s = np.sqrt(-z); return (np.sinh(s) - s) / s**3, (np.cosh(s) - 1) / -z
    return 1 / 6, 1 / 2


def universal_fg(r0, v0, dt, mu):
    """Lagrange f, g for a two-body step dt from (r0, v0), by the universal anomaly."""
    rn, vr = np.linalg.norm(r0), r0 @ v0 / np.linalg.norm(r0)
    alpha = 2 / rn - v0 @ v0 / mu
    x = np.sqrt(mu) * abs(alpha) * dt
    for _ in range(100):
        z = alpha * x * x
        Cs, Cc = stumpff(z)
        F = rn * vr / np.sqrt(mu) * x * x * Cc + (1 - alpha * rn) * x**3 * Cs + rn * x - np.sqrt(mu) * dt
        dF = rn * vr / np.sqrt(mu) * x * (1 - alpha * x * x * Cs) + (1 - alpha * rn) * x * x * Cc + rn
        dx = F / dF
        x -= dx
        if abs(dx) < 1e-13:
            break
    z = alpha * x * x
    Cs, Cc = stumpff(z)
    return 1 - x * x / rn * Cc, dt - x**3 / np.sqrt(mu) * Cs


def gauss(ks):
    """Gauss's method (with iterative improvement) from three observations. Returns a list of
    heliocentric ICRF states at the middle time (corrected for light time), one per positive root
    of the eighth-degree polynomial, with the root's distance."""
    mu = GM_SUN
    t = T[ks]
    L = unit(RA[ks], DEC[ks])
    R = np.array([SITE[k][:3] - SPL[0](T[k]) for k in ks])
    t1, t3 = t[0] - t[1], t[2] - t[1]
    tau = t3 - t1
    p1, p2, p3 = np.cross(L[1], L[2]), np.cross(L[0], L[2]), np.cross(L[0], L[1])
    D0 = L[0] @ p1
    Dm = np.array([[R[i] @ p for p in (p1, p2, p3)] for i in range(3)])
    A = (-Dm[0, 1] * t3 / tau + Dm[1, 1] + Dm[2, 1] * t1 / tau) / D0
    B = (Dm[0, 1] * (t3 * t3 - tau * tau) * t3 / tau + Dm[2, 1] * (tau * tau - t1 * t1) * t1 / tau) / (6 * D0)
    E = R[1] @ L[1]
    R2 = R[1] @ R[1]
    a, b, c = -(A * A + 2 * A * E + R2), -2 * mu * B * (A + E), -(mu * B) ** 2
    roots = np.roots([1, 0, a, 0, 0, b, 0, 0, c])
    out = []
    for x in sorted(r.real for r in roots if abs(r.imag) < 1e-10 and r.real > 0):
        f1 = 1 - mu * t1 * t1 / (2 * x**3); f3 = 1 - mu * t3 * t3 / (2 * x**3)
        g1 = t1 - mu * t1**3 / (6 * x**3); g3 = t3 - mu * t3**3 / (6 * x**3)
        rho2 = A + mu * B / x**3
        if rho2 <= 0:
            continue
        tc = t.copy()
        for _ in range(200):
            c1, c3 = g3 / (f1 * g3 - f3 * g1), -g1 / (f1 * g3 - f3 * g1)
            rho = np.array([(-Dm[0, 0] + Dm[1, 0] / c1 - Dm[2, 0] * c3 / c1) / D0,
                            (-c1 * Dm[0, 1] + Dm[1, 1] - c3 * Dm[2, 1]) / D0,
                            (-Dm[0, 2] * c1 / c3 + Dm[1, 2] / c3 - Dm[2, 2]) / D0])
            r = R + rho[:, None] * L
            v2 = (-f3 * r[0] + f1 * r[2]) / (f1 * g3 - f3 * g1)
            tc = t - rho / C                                  # light time
            f1n, g1n = universal_fg(r[1], v2, tc[0] - tc[1], mu)
            f3n, g3n = universal_fg(r[1], v2, tc[2] - tc[1], mu)
            done = max(abs(f1n - f1), abs(f3n - f3), abs(g1n - g1), abs(g3n - g3)) < 1e-12
            f1, g1, f3, g3 = (f1 + f1n) / 2, (g1 + g1n) / 2, (f3 + f3n) / 2, (g3 + g3n) / 2
            if done:
                break
        out.append(dict(root=float(x), rho2=float(rho[1]), t=float(tc[1]), state=np.concatenate([r[1], v2])))
    return out


# ------------------------------------------------------------------ one tracklet
def attributable(ks):
    """Linear fit of RA cos(Dec0) and Dec against time: (t0, ra, dec, radot, decdot) in rad, rad/day."""
    t = T[ks]; t0 = t.mean()
    dec0 = DEC[ks].mean()
    pa = np.polyfit(t - t0, np.unwrap(RA[ks]), 1)
    pd = np.polyfit(t - t0, DEC[ks], 1)
    return t0, pa[1], pd[1], pa[0], pd[0]


def site_at(ks, t0):
    """Observatory barycentric state at t0, interpolated linearly between the tracklet's observations."""
    t = T[ks]
    return np.array([np.interp(t0, t, SITE[ks, j]) for j in range(6)])


def state_from(att, site, rho, rhodot):
    t0, ra, dec, rad, ded = att
    L = unit(ra, dec)
    ea = np.array([-np.sin(ra), np.cos(ra), 0.0])
    ed = np.array([-np.sin(dec) * np.cos(ra), -np.sin(dec) * np.sin(ra), np.cos(dec)])
    r = site[:3] + rho * L
    v = site[3:] + rhodot * L + rho * (rad * np.cos(dec) * ea + ded * ed)
    return np.concatenate([r, v])


def main():
    out = {}
    jpl = np.array(D["jpl"]["epoch_state"])
    idx_all = np.arange(len(T))
    # 1. force model and light time
    at = propagate(jpl, EPOCH, T.min(), PREDICT)
    ra, de = predict(at, T, SITE)
    H = np.radians(np.array(HZ))
    sep = np.degrees(np.arccos(np.clip(np.sum(unit(ra, de) * unit(H[:, 0], H[:, 1]), 1), -1, 1))) * 3600
    out["model_vs_horizons_arcsec"] = dict(median=float(np.median(sep)), max=float(sep.max()))
    out["predict_from_jpl"] = at(PREDICT)[0, :3].tolist()
    print(f"1. JPL orbit through this model vs Horizons astrometry: median {np.median(sep):.4f}\", max {sep.max():.4f}\"")
    print(f"   position at prediction date: {np.linalg.norm(at(PREDICT)[0, :3] - D['jpl']['predict_state'][:3]) * 1.496e8:.1f} km from Horizons")

    # 2. least squares
    out["fits"] = {}
    for label, days in [("all", None), ("7d", 7), ("14d", 14), ("28d", 28)]:
        idx = idx_all if days is None else idx_all[T < T[0] + days]
        x, cov, use, a, b = fit(idx, jpl)
        dx = x - jpl
        sig = np.sqrt(np.diag(cov))
        rms = np.sqrt(np.mean(np.concatenate([a[use], b[use]]) ** 2))
        out["fits"][label] = dict(n=int(len(idx)), used=int(use.sum()), state=x.tolist(), sigma=sig.tolist(),
                                  rms_arcsec=float(rms), dpos_km=float(np.linalg.norm(dx[:3]) * 1.495978707e8),
                                  nsig=float(np.sqrt(dx @ np.linalg.solve(cov, dx))))
        print(f"2. fit {label}: {use.sum()}/{len(idx)} used, rms {rms:.3f}\", |x - JPL| = {out['fits'][label]['dpos_km']:.0f} km "
              f"(position sigma {np.linalg.norm(sig[:3]) * 1.496e8:.0f} km), Mahalanobis {out['fits'][label]['nsig']:.2f}")

    # 3a. Gauss on the page's preset: middle observations of three tracklets
    tracklets = []
    for k in range(len(T)):
        if tracklets and OBS[k]["stn"] == OBS[tracklets[-1][-1]]["stn"] and T[k] - T[tracklets[-1][-1]] < 0.3:
            tracklets[-1].append(k)
        else:
            tracklets.append([k])
    disc = next(i for i, tk in enumerate(tracklets) if any(OBS[k]["disc"] for k in tk))
    print(f"   {len(tracklets)} tracklets; discovery tracklet {disc}: {[OBS[k]['stn'] for k in tracklets[disc]]}")
    out["tracklets"] = tracklets
    out["gauss"] = []
    for trio in [(disc, disc + 20, disc + 40), (disc, disc + 6, disc + 12)]:
        ks = [tracklets[i][len(tracklets[i]) // 2] for i in trio]
        sols = gauss(ks)
        res = []
        for s in sols:
            el = kepler_elements(s["state"])
            res.append(dict(root=s["root"], rho2=s["rho2"], state=s["state"].tolist(), **el))
            print(f"3a. Gauss {trio}: root r2 = {s['root']:.5f} au, rho2 = {s['rho2']:.5f} au, a = {el['a']:.4f} e = {el['e']:.4f} i = {el['i']:.3f}")
        out["gauss"].append(dict(tracklets=list(trio), obs=ks, solutions=res))
    xs = jpl - np.concatenate([SPL[0](EPOCH), SPL[0].derivative()(EPOCH)])
    out["jpl_elements"] = kepler_elements(xs)
    print("   JPL elements at epoch:", {k: round(v, 5) for k, v in out["jpl_elements"].items()})

    # 3b. admissible region and predictions from the discovery tracklet
    ks = tracklets[disc]
    att = attributable(ks)
    site = site_at(np.array(ks), att[0])
    true = at(att[0] - 0.0)[0]
    rel = true[:3] - site[:3]
    rho_t = np.linalg.norm(rel)
    print(f"3b. attributable at JD {att[0]:.5f}: rates {np.degrees(att[3]) * np.cos(att[2]):.3f}, {np.degrees(att[4]):.3f} deg/day; "
          f"true rho {rho_t:.5f} au, rhodot {rel @ (true[3:] - site[3:]) / rho_t:.6f} au/day")
    samples = []
    target = tracklets[disc + 6][0]
    for rho in [0.01, 0.03, 0.1, 0.3, 1.0]:
        for rd in [-0.01, 0.0, 0.01]:
            x = state_from(att, site, rho, rd)
            xh = x - sun_state(att[0])
            if (xh[3:] @ xh[3:]) / 2 - GM_SUN / np.linalg.norm(xh[:3]) >= 0:
                continue
            atx = propagate(x, att[0], att[0], T[target])
            r2, d2 = predict(atx, T[[target]], SITE[[target]])
            samples.append(dict(rho=rho, rhodot=rd, ra=float(np.degrees(r2[0])), dec=float(np.degrees(d2[0]))))
    out["attributable"] = dict(tracklet=disc, values=list(map(float, att)), site=site.tolist(), target_obs=int(target), samples=samples)
    print(f"   {len(samples)} sample predictions for observation {target} ({OBS[target]['stn']}, +{T[target] - att[0]:.2f} d)")
    json.dump(out, open(os.path.join(HERE, "reference.json"), "w"), indent=1)


if __name__ == "__main__":
    main()
