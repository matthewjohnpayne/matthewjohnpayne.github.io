#!/usr/bin/env python3
"""Figures for the Object of the Month pages whose orbits the one-year build-time integration
(src/lib/objectOrbit.ts) cannot show: a distant resonant TNO, an interstellar object and a
temporarily captured minimoon. Each is computed here, once, and cached as JSON for the page.

For every record in src/content/objects/ whose `view` is one of the views below, this writes
src/data/objects/<record name>-figure.json:

  outer-resonance  A trans-Neptunian object in a mean-motion resonance with Neptune
                   (`resonance: [p, q]` in the record, e.g. [21, 5]). REBOUND WHFast with the
                   Sun (carrying the inner planets' mass) and the four giant planets, from the
                   MPC orbit and the planets of src/data/frames-ic.json at the MPC epoch.
                   Panels: the orbits seen from above; one full resonant cycle in a frame
                   turning with Neptune; and the resonant angle over 200,000 years.
  hyperbolic       An interstellar object's path through the inner Solar System. REBOUND IAS15
                   with the Sun, planets and Moon, from the MPC orbit (gravity only).
                   Panels: the path seen from above, and distances from the Sun and planets.
  earth-capture    A temporary capture by the Earth. Positions from JPL Horizons (the JPL orbit
                   solution), drawn around the Earth in a frame that keeps the Sun in one
                   direction. Panels: that path, and the distance from the Earth.

Each run is checked against JPL Horizons (an independent orbit and force model), and the
differences are stored with the figure and quoted on the page.

Usage:  python3 tools/export_object_figures.py [record name ...]   (needs numpy, rebound, requests)
"""
import datetime
import json
import math
import pathlib
import re
import sys

import numpy as np
import rebound
import requests

ROOT = pathlib.Path(__file__).resolve().parents[1]
RECORDS = ROOT / "src" / "content" / "objects"
DATA = ROOT / "src" / "data" / "objects"
IC = json.loads((ROOT / "src" / "data" / "frames-ic.json").read_text())
HORIZONS = "https://ssd.jpl.nasa.gov/api/horizons.api"
MJD0 = 2400000.5
DAY_YR = 365.25
AU_KM = 149597870.7
INNER = ["mercury", "venus", "earth", "moon", "mars"]
GIANTS = ["jupiter", "saturn", "uranus", "neptune"]


# ------------------------------------------------------------------ helpers
def front_matter(path):
    fm = path.read_text(encoding="utf-8").split("---")[1]
    get = lambda k: (re.search(rf'^{k}:\s*"?([^"\n#]*)"?', fm, re.M) or [None, None])[1]
    res = re.search(r"^resonance:\s*\[\s*(\d+)\s*,\s*(\d+)\s*\]", fm, re.M)
    return {"designation": get("designation").strip(), "view": (get("view") or "").strip(),
            "horizons": (get("horizons") or "").strip() or None,
            "resonance": [int(res.group(1)), int(res.group(2))] if res else None}


def mjd_to_iso(mjd):
    return (datetime.datetime(1858, 11, 17) + datetime.timedelta(days=float(mjd))).strftime("%Y-%m-%d")


def iso_to_mjd(iso):
    return (datetime.datetime.fromisoformat(iso) - datetime.datetime(1858, 11, 17)).total_seconds() / 86400


def horizons(command, center, start, stop, step):
    """Ecliptic (ICRF) vectors from JPL Horizons: (MJD TDB, xyz au, vxyz au/day, header text)."""
    p = dict(format="json", COMMAND=f"'{command}'", EPHEM_TYPE="'VECTORS'", CENTER=f"'{center}'",
             START_TIME=f"'{start}'", STOP_TIME=f"'{stop}'", STEP_SIZE=f"'{step}'", REF_PLANE="'ECLIPTIC'",
             REF_SYSTEM="'ICRF'", OUT_UNITS="'AU-D'", VEC_TABLE="'2'", CSV_FORMAT="'YES'", VEC_LABELS="'NO'")
    for attempt in range(3):
        try:
            r = requests.get(HORIZONS, params=p, timeout=180)
            r.raise_for_status()
            text = r.json()["result"]
            break
        except Exception:
            if attempt == 2:
                raise
    rows = [l.split(",") for l in text[text.index("$$SOE") + 5:text.index("$$EOE")].strip().splitlines()]
    jd = np.array([float(x[0]) for x in rows])
    v = np.array([[float(c) for c in x[2:8]] for x in rows])
    return jd - MJD0, v[:, :3], v[:, 3:], text


def soln_line(text):
    m = re.search(r"Rec #.*?Soln\.date:\s*\S+", text)
    return re.sub(r"\s+", " ", m.group(0)) if m else "JPL Horizons"


def ic_body(key):
    return next(b for b in IC["bodies"] if b["key"] == key)


def orbit_state(stem):
    """The object's MPC heliocentric ecliptic state (au, au/day) and epoch, from
    src/data/objects/<stem>.json (tools/export_object_orbits.py)."""
    o = json.loads((DATA / f"{stem}.json").read_text())
    return np.array(o["state"]), o["epochMJD_TT"], o


def r2(a):
    return [round(float(v), 4) for v in a]


def thin(points, keep=4):
    return [[round(float(x), keep), round(float(y), keep)] for x, y in points]


# ------------------------------------------------------------------ simulations
def planets_sim(keys, fold_inner=False):
    """REBOUND simulation (G = 1, masses as GM in au^3/day^2, time in days) at the frames-ic
    epoch, barycentric. With fold_inner, the Sun and inner planets become one body at their
    barycentre, carrying their total mass."""
    sim = rebound.Simulation()
    sim.G = 1.0
    if fold_inner:
        group = [ic_body(k) for k in ["sun"] + INNER]
        m = sum(b["gm"] for b in group)
        s = sum(b["gm"] * np.array(b["state"]) for b in group) / m
        sim.add(m=m, x=s[0], y=s[1], z=s[2], vx=s[3], vy=s[4], vz=s[5], hash="sun")
    for k in keys:
        b = ic_body(k)
        s = b["state"]
        sim.add(m=b["gm"], x=s[0], y=s[1], z=s[2], vx=s[3], vy=s[4], vz=s[5], hash=k)
    return sim


def add_test(sim, helio, sun_key="sun"):
    """Add a massless particle at a heliocentric state, relative to the true Sun of frames-ic."""
    s = np.array(ic_body(sun_key)["state"]) + helio
    sim.add(m=0.0, x=s[0], y=s[1], z=s[2], vx=s[3], vy=s[4], vz=s[5], hash="object")


def resonant_angle(o, oN, p, q):
    return (p * o.l - q * oN.l - (p - q) * o.pomega) % (2 * math.pi)


# ------------------------------------------------------------------ outer-resonance
def outer_resonance(stem, rec):
    p, q = rec["resonance"]
    state, epoch, orb = orbit_state(stem)
    if epoch != IC["epochMJD_TT"]:
        raise SystemExit(f"{stem}: orbit epoch MJD {epoch} differs from frames-ic.json")
    # True Sun first (so heliocentric positions are easy), then planets; inner planets folded in.
    sim = planets_sim(GIANTS, fold_inner=True)
    add_test(sim, state)
    sim.N_active = 5
    sim.move_to_com()
    sim.integrator = "whfast"
    sim.dt = 100.0
    sim.ri_whfast.safe_mode = 0
    sim.ri_whfast.corrector = 11
    ps = sim.particles
    PN = ps["neptune"].orbit(primary=sim.com(last=5)).P

    # Panel A: the orbits seen from above, heliocentric (one period of the object; planets' orbits).
    helio = {"object": [], "planets": {}, "now": {}}
    sun = ps["sun"]
    for k in GIANTS:
        pts = np.array(ps[k].sample_orbit(Npts=240, primary=sun))
        helio["planets"][k] = thin(pts[:, :2], 2)
        helio["now"][k] = r2([ps[k].x - sun.x, ps[k].y - sun.y])
    helio["now"]["object"] = r2([ps["object"].x - sun.x, ps["object"].y - sun.y])
    pts = np.array(ps["object"].sample_orbit(Npts=480, primary=sun))
    helio["object"] = thin(pts[:, :2], 2)

    # Panel B: one full resonant cycle (p Neptune orbits) in a frame turning with Neptune.
    cycle = p * PN
    n_s = 2400
    rot, r3, dn, nep = [], [], [], None
    sim_b = sim.copy()
    pb = sim_b.particles
    for t in np.linspace(0, cycle, n_s + 1):
        sim_b.integrate(t, exact_finish_time=1)
        s = pb["sun"]
        xn, yn = pb["neptune"].x - s.x, pb["neptune"].y - s.y
        th = math.atan2(yn, xn)
        c, sn = math.cos(th), math.sin(th)
        ob, ne = pb["object"], pb["neptune"]
        xo, yo = ob.x - s.x, ob.y - s.y
        rot.append([c * xo + sn * yo, -sn * xo + c * yo])
        r3.append(math.hypot(xo, yo, ob.z - s.z))                              # 3-D distance from the Sun
        dn.append(math.hypot(ob.x - ne.x, ob.y - ne.y, ob.z - ne.z))           # 3-D distance from Neptune
        if nep is None:
            nep = math.hypot(xn, yn)
    rot = np.array(rot)
    # perihelion passages (local minima of the 3-D distance from the Sun), drawn in this frame
    r = np.array(r3)
    peri = [r2(rot[k]) for k in range(1, len(r) - 1) if r[k] < r[k - 1] and r[k] <= r[k + 1]]
    min_to_neptune = float(np.min(dn))

    # Panel C: the resonant angle and the period ratio over 200,000 years (barycentric elements).
    years, every = 200_000, 100
    th, ratio, tt = [], [], []
    sim_c = sim.copy()
    for t in np.arange(0, years + every, every):
        sim_c.integrate(t * DAY_YR, exact_finish_time=0)
        c = sim_c.com(last=5)
        o = sim_c.particles["object"].orbit(primary=c)
        oN = sim_c.particles["neptune"].orbit(primary=c)
        th.append(math.degrees(resonant_angle(o, oN, p, q)))
        ratio.append(o.P / oN.P)
        tt.append(int(t))
    th, ratio = np.array(th), np.array(ratio)
    centre = math.degrees(math.atan2(np.mean(np.sin(np.radians(th))), np.mean(np.cos(np.radians(th))))) % 360
    dev = (th - centre + 180) % 360 - 180
    stats = {"centre_deg": round(centre, 1), "min_deg": round(float(th.min()), 1), "max_deg": round(float(th.max()), 1),
             "half_amplitude_deg": round(float(np.abs(dev).max()), 1), "ratio_min": round(float(ratio.min()), 4),
             "ratio_max": round(float(ratio.max()), 4), "years": years, "every_years": every}
    # libration period: mean spacing of upward zero crossings of the deviation
    up = np.flatnonzero((dev[:-1] < 0) & (dev[1:] >= 0))
    if len(up) > 2:
        stats["libration_period_years"] = int(round(float(np.mean(np.diff(np.array(tt)[up]))), -3))

    # Validation: the same integration against JPL Horizons positions, every 25 years from 1900 to 2150.
    hz_mjd, hz_xyz, _, text = horizons(f"DES={rec['designation']};", "500@0", "1900-01-01", "2150-01-01", "9131 d")
    sim_v = sim.copy()
    devs = []
    for mjd, x in sorted(zip(hz_mjd, hz_xyz), key=lambda z: abs(z[0] - epoch)):
        sim_v.integrate((mjd - epoch), exact_finish_time=1)
        ob = sim_v.particles["object"]
        d = np.linalg.norm(np.array([ob.x, ob.y, ob.z]) - x)    # both barycentric
        devs.append((mjd, float(d)))
    worst = max(devs, key=lambda z: z[1])
    validation = {"against": soln_line(text), "dates": f"{mjd_to_iso(min(hz_mjd))} to {mjd_to_iso(max(hz_mjd))}",
                  "n": len(devs), "max_au": round(worst[1], 4), "at": mjd_to_iso(worst[0]),
                  "note": "barycentric positions every 25 years"}
    return {"view": "outer-resonance", "resonance": [p, q], "neptune_period_years": round(PN / DAY_YR, 2),
            "cycle_years": round(cycle / DAY_YR), "epoch": mjd_to_iso(epoch), "helio": helio,
            "rotating": {"path": thin(rot, 2), "neptune_r": round(nep, 2), "pericentres": peri, "min_to_neptune": round(min_to_neptune)},
            "angle": {"t": tt, "theta": [round(float(v), 1) for v in th], "ratio": [round(float(v), 5) for v in ratio], "stats": stats},
            "validation": validation,
            "method": f"REBOUND WHFast (100-day step) with the Sun (carrying the inner planets' mass) and the four giant planets, from the MPC orbit and JPL Horizons planet positions at {mjd_to_iso(epoch)}; resonant angle from barycentric osculating elements."}


# ------------------------------------------------------------------ hyperbolic
def hyperbolic(stem, rec, start="2024-07-01", stop="2027-07-01", step=2.0):
    state, epoch, orb = orbit_state(stem)
    if epoch != IC["epochMJD_TT"]:
        raise SystemExit(f"{stem}: orbit epoch MJD {epoch} differs from frames-ic.json")
    keys = ["mercury", "venus", "earth", "moon", "mars"] + GIANTS
    sim = rebound.Simulation()
    sim.G = 1.0
    for k in ["sun"] + keys:
        b = ic_body(k)
        s = b["state"]
        sim.add(m=b["gm"], x=s[0], y=s[1], z=s[2], vx=s[3], vy=s[4], vz=s[5], hash=k)
    add_test(sim, state)
    sim.N_active = len(keys) + 1
    sim.integrator = "ias15"
    t0, t1 = iso_to_mjd(start) - epoch, iso_to_mjd(stop) - epoch
    times = np.arange(t0, t1 + step / 2, step)
    track = {k: np.zeros((len(times), 3)) for k in ["object", "earth", "mars", "jupiter"]}
    # integrate backwards from the epoch, then forwards
    order = np.argsort(np.abs(times))
    back = sim.copy()
    for k_sim, sel in [(back, [i for i in range(len(times)) if times[i] < 0][::-1]), (sim, [i for i in range(len(times)) if times[i] >= 0])]:
        for i in sel:
            k_sim.integrate(times[i], exact_finish_time=1)
            s = k_sim.particles["sun"]
            for key in track:
                b = k_sim.particles[key]
                track[key][i] = [b.x - s.x, b.y - s.y, b.z - s.z]
    mjd = times + epoch
    o = track["object"]
    dist = {"sun": np.linalg.norm(o, axis=1)}
    for key in ["earth", "mars", "jupiter"]:
        dist[key] = np.linalg.norm(o - track[key], axis=1)
    events = {}
    for key, d in dist.items():
        k = int(np.argmin(d))
        events[key] = {"date": mjd_to_iso(mjd[k]), "au": round(float(d[k]), 3), "index": k}
    # planets' orbits (osculating, at the epoch) and positions at perihelion
    sun = sim.particles["sun"]
    k_peri = events["sun"]["index"]
    orbits = {}
    for key in ["mercury", "venus", "earth", "mars", "jupiter"]:
        pts = np.array(sim.particles[key].sample_orbit(Npts=240, primary=sun))
        orbits[key] = thin(pts[:, :2], 3)
    at_peri = {key: r2(track[key][k_peri][:2]) for key in ["earth", "mars", "jupiter"]}
    disc = int(np.argmin(np.abs(mjd - iso_to_mjd("2025-07-01"))))

    # Validation against JPL Horizons (whose orbit includes non-gravitational terms), every 20 days.
    # dates on the 2-day grid of the run (even MJDs)
    hz_mjd, hz_xyz, _, text = horizons(rec["horizons"] or rec["designation"], "500@10", "2025-06-14", "2026-06-13", "20 d")
    devs = []
    for m, x in zip(hz_mjd, hz_xyz):
        i = int(np.argmin(np.abs(mjd - m)))
        if abs(mjd[i] - m) < 1e-3:
            devs.append((m, float(np.linalg.norm(o[i] - x))))
    worst = max(devs, key=lambda z: z[1])
    validation = {"against": soln_line(text), "dates": "2025-06-14 to 2026-06-13", "n": len(devs),
                  "max_au": round(worst[1], 5), "max_km": int(round(worst[1] * AU_KM, -2)), "at": mjd_to_iso(worst[0])}
    every = 3   # keep every 3rd sample (6 days) for the page
    return {"view": "hyperbolic", "epoch": mjd_to_iso(epoch), "start": start, "stop": stop, "step_days": step * every,
            "path": thin(o[::every, :2], 3), "dates": [mjd_to_iso(m) for m in mjd[::every]],
            "dist": {k: [round(float(v), 3) for v in d[::every]] for k, d in dist.items()},
            "events": {k: {kk: vv for kk, vv in v.items() if kk != "index"} for k, v in events.items()},
            "discovery": {"date": "2025-07-01", "xy": r2(o[disc][:2])},
            "perihelion_xy": r2(o[k_peri][:2]), "planets_at_perihelion": at_peri, "orbits": orbits,
            "validation": validation,
            "method": f"REBOUND IAS15 with the Sun, eight planets and the Moon, from the MPC orbit (gravity only) and JPL Horizons planet positions at {mjd_to_iso(epoch)}."}


# ------------------------------------------------------------------ earth-capture
def earth_capture(stem, rec, start="2006-03-01", stop="2008-01-31"):
    cmd = rec["horizons"] or f"DES={rec['designation']};"
    mjd, xyz, vel, text = horizons(cmd, "500@399", start, stop, "1 d")
    _, sun, _, _ = horizons("10", "500@399", start, stop, "1 d")
    # frame centred on the Earth, turning so that the Sun stays along -x
    th = np.arctan2(-sun[:, 1], -sun[:, 0])
    c, s = np.cos(th), np.sin(th)
    rot = np.stack([c * xyz[:, 0] + s * xyz[:, 1], -s * xyz[:, 0] + c * xyz[:, 1]], 1)
    d = np.linalg.norm(xyz, axis=1)
    gm = lambda k: ic_body(k)["gm"]
    hill = 1.000001018 * ((gm("earth") + gm("moon")) / (3 * gm("sun"))) ** (1 / 3)
    inside = np.flatnonzero(d < hill)
    first, last = int(inside[0]), int(inside[-1])
    # revolutions around the Earth in the turning frame while inside the Hill sphere
    ang = np.unwrap(np.arctan2(rot[first:last + 1, 1], rot[first:last + 1, 0]))
    revs = abs(ang[-1] - ang[0]) / (2 * math.pi)
    k_min = int(np.argmin(d))

    # Validation: integrate the Horizons state of the first day, under gravity alone (Sun, planets,
    # Moon from Horizons), and compare with the Horizons positions over the whole span.
    sim = rebound.Simulation()
    sim.G = 1.0
    t0 = f"JD{mjd[0] + MJD0:.1f}"
    bodies = [("10", "sun"), ("199", "mercury"), ("299", "venus"), ("399", "earth"), ("301", "moon"),
              ("4", "mars"), ("5", "jupiter"), ("6", "saturn"), ("7", "uranus"), ("8", "neptune")]
    for hz, key in bodies:
        _, x, v, _ = horizons(hz, "500@0", t0, f"JD{mjd[0] + MJD0 + 1:.1f}", "1 d")
        sim.add(m=gm(key), x=x[0, 0], y=x[0, 1], z=x[0, 2], vx=v[0, 0], vy=v[0, 1], vz=v[0, 2], hash=key)
    _, xo, vo, _ = horizons(cmd, "500@0", t0, f"JD{mjd[0] + MJD0 + 1:.1f}", "1 d")
    sim.add(m=0.0, x=xo[0, 0], y=xo[0, 1], z=xo[0, 2], vx=vo[0, 0], vy=vo[0, 1], vz=vo[0, 2], hash="object")
    sim.N_active = len(bodies)
    sim.integrator = "ias15"
    devs = []
    for i in range(0, len(mjd), 5):
        sim.integrate(mjd[i] - mjd[0], exact_finish_time=1)
        e, ob = sim.particles["earth"], sim.particles["object"]
        devs.append((mjd[i], float(np.linalg.norm(np.array([ob.x - e.x, ob.y - e.y, ob.z - e.z]) - xyz[i]))))
    worst = max(devs, key=lambda z: z[1])
    validation = {"against": soln_line(text), "dates": f"{start} to {stop}", "n": len(devs),
                  "max_km": int(round(worst[1] * AU_KM, -2)), "at": mjd_to_iso(worst[0]),
                  "note": "the Horizons state on the first day integrated under gravity alone with REBOUND IAS15 (Sun, planets, Moon), compared with the Horizons positions, which include small non-gravitational forces"}
    nonzero = re.findall(r"A1=\s*\S+\s+A2=\s*\S+\s+A3=\s*\S+", text)
    return {"view": "earth-capture", "source": soln_line(text), "nongrav": nonzero[0] if nonzero else None,
            "start": start, "stop": stop, "step_days": 1,
            "path": thin(rot, 5), "dates": [mjd_to_iso(m) for m in mjd], "dist": [round(float(v), 5) for v in d],
            "hill_au": round(hill, 5), "moon_au": round(384400 / AU_KM, 5),
            "inside": {"from": mjd_to_iso(mjd[first]), "to": mjd_to_iso(mjd[last]), "days": int(round(mjd[last] - mjd[first])),
                       "revolutions": round(revs, 2), "from_xy": r2(rot[first]), "to_xy": r2(rot[last])},
            "closest": {"date": mjd_to_iso(mjd[k_min]), "au": round(float(d[k_min]), 5), "km": int(round(d[k_min] * AU_KM, -3)), "xy": r2(rot[k_min])},
            "validation": validation,
            "method": "Positions from JPL Horizons (the JPL orbit solution, fitted to the 2006–2007 observations), one per day, drawn around the Earth in a frame that turns once a year so that the Sun stays to the left."}


VIEWS = {"outer-resonance": outer_resonance, "hyperbolic": hyperbolic, "earth-capture": earth_capture}


def main():
    want = set(sys.argv[1:])
    for path in sorted(RECORDS.glob("[!_]*.md")):
        if want and path.stem not in want:
            continue
        rec = front_matter(path)
        if rec["view"] not in VIEWS:
            continue
        fig = VIEWS[rec["view"]](path.stem, rec)
        fig["made"] = datetime.date.today().isoformat()
        out = DATA / f"{path.stem}-figure.json"
        out.write_text(json.dumps(fig, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
        print(f"{path.stem}: {rec['view']}, {out.stat().st_size / 1024:.0f} kB; validation {fig['validation']}")


if __name__ == "__main__":
    main()
