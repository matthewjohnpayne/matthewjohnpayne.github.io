"""Export the data for the orbit-determination page (src/pages/teaching/orbit-determination.astro).

The object is the near-Earth asteroid 2024 YR4, discovered by ATLAS (Rio Hurtado, Chile; code W68)
on 2024 December 27. The page uses its first six weeks of astrometry.

    python tools/export_od_data.py            # needs the network: MPC and JPL Horizons

Writes public/data/od/yr4.json:
  * every optical observation from 2024 Dec 25 to 2025 Feb 8 (MPC Observations API, ADES), with
    its time (JD, TDB), RA and Dec (deg), the reported uncertainties (arcsec, or 1" if none),
    magnitude and band, and the observatory code (with the observatory names from the MPC);
  * the barycentric ICRF position and velocity of the observatory at each observation (JPL
    Horizons, topocentric, so Earth rotation, precession and nutation are Horizons' own);
  * barycentric ICRF positions and velocities of the Sun, planets and Moon every 0.5 day, so the
    page can integrate orbits with their gravity;
  * JPL's present orbit of 2024 YR4, as a barycentric state at the page's epoch and as positions
    on the prediction date, for comparison.
and tools/validate_od/horizons.json: Horizons' astrometric RA and Dec of 2024 YR4 at every
observation, used by tools/validate_od/ to check the page's force model and light-time correction.
"""
import json
import os
import sys
from collections import defaultdict

import numpy as np
import requests

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "data", "od", "yr4.json")
VAL = os.path.join(ROOT, "tools", "validate_od", "horizons.json")
DESIG = "2024 YR4"
FIRST, LAST = "2024-12-25", "2025-02-08"          # observation dates used (UTC)
EPOCH = 2460676.5                                  # 2025 Jan 1.0 TDB: the page's reference epoch
PREDICT = 2460796.5                                # 2025 May 1.0 TDB: the prediction date
TAB0, TAB1, TAB_STEP = 2460659.5, 2460806.5, 0.5   # planet table: 2024 Dec 15 to 2025 May 11
TT_UTC = 69.184 / 86400                            # TT - UTC in 2024-25 (37 leap seconds); TDB - TT < 2 ms
DEFAULT_SIGMA = 1.0                                # arcsec, when an observation reports no uncertainty
# DE440 GM values (au^3 / day^2) and the Horizons IDs of the bodies in the table
BODIES = [("Sun", "10", 2.9591220828411956e-04), ("Mercury", "199", 4.9125001948893182e-11),
          ("Venus", "299", 7.2434523326441187e-10), ("Earth", "399", 8.8876924467071022e-10),
          ("Moon", "301", 1.0931894624024351e-11), ("Mars", "4", 9.5495488297258119e-11),
          ("Jupiter", "5", 2.8253458252257917e-07), ("Saturn", "6", 8.4597059933762903e-08),
          ("Uranus", "7", 1.2920265649682399e-08), ("Neptune", "8", 1.5243573478851939e-08)]
HORIZONS = "https://ssd.jpl.nasa.gov/api/horizons.api"


def horizons(**kw):
    p = dict(format="text", OBJ_DATA="'NO'", CSV_FORMAT="'YES'")
    p.update({k: f"'{v}'" for k, v in kw.items()})
    r = requests.get(HORIZONS, params=p, timeout=180)
    r.raise_for_status()
    t = r.text
    if "$$SOE" not in t:
        raise RuntimeError(t[-2000:])
    return [l.split(",") for l in t[t.index("$$SOE") + 5:t.index("$$EOE")].strip().splitlines()]


def vectors(command, center, tlist=None, start=None, stop=None, step=None):
    """Barycentric-frame ICRF state vectors (au, au/day) at TDB times."""
    kw = dict(COMMAND=command, CENTER=center, EPHEM_TYPE="VECTORS", REF_PLANE="FRAME", REF_SYSTEM="ICRF",
              VEC_TABLE="2", OUT_UNITS="AU-D", VEC_LABELS="NO", VEC_CORR="NONE", TIME_TYPE="TDB")
    if tlist is not None:
        rows = []
        for i in range(0, len(tlist), 50):                       # keep the URL short
            rows += horizons(TLIST=" ".join(f"{t:.9f}" for t in tlist[i:i + 50]), TLIST_TYPE="JD", **kw)
    else:
        rows = horizons(START_TIME=f"JD{start}", STOP_TIME=f"JD{stop}", STEP_SIZE=step, **kw)
    return np.array([[float(v) for v in r[2:8]] for r in rows])


def astrometric(center, tlist_utc):
    """Horizons' astrometric ICRF RA, Dec (deg) of the object from an observatory, at UTC times."""
    out = []
    for i in range(0, len(tlist_utc), 50):
        rows = horizons(COMMAND=f"DES={DESIG};", CENTER=f"{center}@399", EPHEM_TYPE="OBSERVER", QUANTITIES="1",
                        TLIST=" ".join(f"{t:.9f}" for t in tlist_utc[i:i + 50]), TLIST_TYPE="JD", TIME_TYPE="UT",
                        ANG_FORMAT="DEG", EXTRA_PREC="YES")
        out += [[float(r[3]), float(r[4])] for r in rows]
    return out


def jd_utc(iso):
    from datetime import datetime, timezone
    iso = iso.rstrip("Z")
    d = datetime.strptime(iso, "%Y-%m-%dT%H:%M:%S.%f" if "." in iso else "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc)
    return 2440587.5 + d.timestamp() / 86400


def main():
    r = requests.get("https://data.minorplanetcenter.net/api/get-obs", json={"desigs": [DESIG], "output_format": ["ADES_DF"]}, timeout=120)
    r.raise_for_status()
    obs = [o for o in r.json()[0]["ADES_DF"] if FIRST <= o["obstime"][:10] <= LAST and o["obstype" if "obstype" in o else "Obstype"] == "optical"]
    obs.sort(key=lambda o: o["obstime"])
    print(f"{len(obs)} observations, {obs[0]['obstime']} to {obs[-1]['obstime']}")

    # observatory positions, one Horizons request per site
    by_stn = defaultdict(list)
    for k, o in enumerate(obs):
        by_stn[o["stn"]].append(k)
    site = [None] * len(obs)
    hz = [None] * len(obs)
    for stn, ks in sorted(by_stn.items()):
        t_utc = [jd_utc(obs[k]["obstime"]) for k in ks]
        try:
            v = -vectors("0", f"{stn}@399", tlist=[t + TT_UTC for t in t_utc])   # SSB from site, negated
            a = astrometric(stn, t_utc)
        except Exception as e:                                               # e.g. a code Horizons lacks
            print(f"  skipping {stn}: {str(e)[:120]}")
            continue
        for j, k in enumerate(ks):
            site[k], hz[k] = v[j], a[j]
        print(f"  {stn}: {len(ks)}")
    keep = [k for k in range(len(obs)) if site[k] is not None]

    rows = []
    for k in keep:
        o = obs[k]
        sra = float(o["rmsra"]) if o.get("rmsra") else DEFAULT_SIGMA
        sde = float(o["rmsdec"]) if o.get("rmsdec") else DEFAULT_SIGMA
        rows.append(dict(t=round(jd_utc(o["obstime"]) + TT_UTC, 7), ra=float(o["ra"]), dec=float(o["dec"]),
                         sra=sra, sdec=sde, stn=o["stn"], disc=o.get("disc") == "*",
                         mag=float(o["mag"]) if o.get("mag") else None, band=o.get("band"),
                         site=[round(float(x), 12) for x in site[k]]))

    names = {}
    for stn in sorted({r["stn"] for r in rows}):
        q = requests.get("https://data.minorplanetcenter.net/api/obscodes", json={"obscode": stn}, timeout=60)
        q.raise_for_status()
        names[stn] = q.json()["name_utf8"]

    tab_t = np.arange(TAB0, TAB1 + 1e-9, TAB_STEP)
    table = {}
    for name, hid, gm in BODIES:
        sv = vectors(hid, "500@0", start=TAB0, stop=TAB1, step=f"{int(round(TAB_STEP * 24 * 60))}m")
        assert len(sv) == len(tab_t), (name, len(sv), len(tab_t))
        table[name] = dict(gm=gm, xv=[[round(float(x), 13) for x in s] for s in sv])
        print(f"  table: {name}")

    yr4_epoch = vectors(f"DES={DESIG};", "500@0", tlist=[EPOCH])[0]
    yr4_pred = vectors(f"DES={DESIG};", "500@0", tlist=[PREDICT])[0]

    out = dict(
        about=("Astrometry of 2024 YR4 from the MPC Observations API; observatory and planet positions and JPL's orbit "
               "of 2024 YR4 from JPL Horizons. Generated by tools/export_od_data.py."),
        object=DESIG, epoch=EPOCH, predict=PREDICT, c_au_per_day=173.14463267424034,
        obs=rows, sites=names,
        table=dict(t0=TAB0, step=TAB_STEP, n=len(tab_t), bodies=[b[0] for b in BODIES], data=table),
        jpl=dict(epoch_state=[float(x) for x in yr4_epoch], predict_state=[float(x) for x in yr4_pred],
                 note="JPL Horizons, barycentric ICRF, from JPL's current orbit solution"))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(out, open(OUT, "w"), separators=(",", ":"))
    os.makedirs(os.path.dirname(VAL), exist_ok=True)
    json.dump(dict(about="Horizons astrometric RA, Dec (deg) of 2024 YR4 at each observation in public/data/od/yr4.json.",
                   radec=[hz[k] for k in keep]), open(VAL, "w"))
    print(f"Wrote {OUT} ({os.path.getsize(OUT) / 1024:.0f} kB): {len(rows)} observations from {len(by_stn)} sites")


if __name__ == "__main__":
    sys.exit(main())
