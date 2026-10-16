#!/usr/bin/env python3
"""Data for the wis page (src/pages/software/wis.astro):

* public/data/wis/obscodes.json: every ground-based MPC observatory code with its parallax
  constants, from the MPC Observatory Codes API (as wis uses them);
* public/data/wis/spacecraft.json: geocentric equatorial J2000 positions (km) of JWST, Gaia and
  HST from wis itself, i.e. from NASA/JPL and ESA SPICE kernels.

    HOME=<dir with .wispykernels> python tools/export_wis_data.py

(wis keeps its kernels in ~/.wispykernels; download them with download-wis-kernels DE440 JWST GAIA HST.)
"""
import json
import pathlib

import numpy as np
import requests
import spiceypy as sp
from astropy.time import Time
from wis import Wis
from wis.kernels import DE440, GAIA, HST, JWST

OUT = pathlib.Path(__file__).resolve().parents[1] / "public" / "data" / "wis"
OUT.mkdir(parents=True, exist_ok=True)
AU_KM = 149597870.7

# --- observatory codes
codes = requests.get("https://data.minorplanetcenter.net/api/obscodes", json={}, timeout=60).json()
rows = []
for code, d in sorted(codes.items()):
    if d.get("uses_two_line_observations") or None in (d.get("longitude"), d.get("rhocosphi"), d.get("rhosinphi")):
        continue
    rows.append([code, d.get("name_utf8") or d.get("name"), float(d["longitude"]), float(d["rhocosphi"]), float(d["rhosinphi"])])
(OUT / "obscodes.json").write_text(json.dumps(rows, ensure_ascii=False, separators=(",", ":")))
print(f"{len(rows)} ground-based observatory codes")


# --- spacecraft: sample where each kernel has data
def coverage(w, naif):
    """Union of the SPK coverage windows of a NAIF body among the loaded kernels (ET seconds)."""
    cover = sp.cell_double(20000)
    for i in range(sp.ktotal("SPK")):
        f = sp.kdata(i, "SPK")[0]
        if naif in sp.spkobj(f):
            sp.spkcov(f, naif, cover)
    return [sp.wnfetd(cover, i) for i in range(sp.wncard(cover))]


def geocentric(w, code, jd_tdb):
    t = Time(jd_tdb, format="jd", scale="tdb")
    obs, _ = w.get_obs_helio_equ_AU(code, t)
    geo, _ = w.get_obs_helio_equ_AU("500", t)
    return (np.asarray(obs) - np.asarray(geo)) * AU_KM


craft = {}
with Wis(kernels=[DE440, JWST, GAIA, HST]) as w:
    for code, name, naif, step_days, limit in [("274", "James Webb Space Telescope", -170, 1.0, None),
                                                ("258", "Gaia", -123, 1.0, "2025-01-15"),
                                                ("250", "Hubble Space Telescope", -48, 1 / 1440, ("2026-10-12", 2.0))]:
        wins = coverage(w, naif)
        et0, et1 = min(a for a, _ in wins), max(b for _, b in wins)
        jd0, jd1 = 2451545.0 + et0 / 86400 + 1e-6, 2451545.0 + et1 / 86400 - 1e-6
        if isinstance(limit, str):
            jd1 = min(jd1, Time(limit).tdb.jd)
        elif isinstance(limit, tuple):          # HST: a short window (start, days), at one-minute steps
            jd0, jd1 = Time(limit[0]).tdb.jd, Time(limit[0]).tdb.jd + limit[1]
        jd0 = np.ceil(jd0 / step_days) * step_days if step_days >= 1 else jd0
        jd = np.arange(jd0, jd1, step_days)
        pos = geocentric(w, code, jd)
        craft[code] = dict(name=name, jd0=float(jd[0]), step=step_days, n=len(jd),
                           xyz=np.round(pos, 1).ravel().tolist())
        r = np.linalg.norm(pos, axis=1)
        print(f"{code} {name}: {Time(jd[0], format='jd', scale='tdb').iso[:16]} to {Time(jd[-1], format='jd', scale='tdb').iso[:16]}, "
              f"{len(jd)} samples, {r.min():,.0f}-{r.max():,.0f} km from the geocentre")
(OUT / "spacecraft.json").write_text(json.dumps(craft, separators=(",", ":")))
