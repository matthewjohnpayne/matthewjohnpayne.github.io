#!/usr/bin/env python3
"""Data for the asteroid-belt orbit map (src/pages/teaching/asteroid-belt.astro).

Follows Step 8 of the MPC tutorial "Plotting Asteroid Orbits"
(https://docs.minorplanetcenter.net/tutorials/notebooks/mpc_tutorial_orbit_plotting/): read the
MPC's MPCORB.DAT, keep the orbits at the catalogue's common epoch with a < 6 au, keep every orbit in
the Hilda (a = 3.7-4.2 au) and Jupiter Trojan (a = 5.0-5.4 au) bands, and a random subsample of the
rest. The planets' heliocentric osculating elements at the same epoch come from the JPL Horizons
states in src/data/frames-ic.json (same epoch, MJD 61200.0 TT).

    python3 tools/export_orbit_map.py [path/to/MPCORB.DAT.gz]

Without an argument it downloads MPCORB.DAT.gz (about 90 MB) to the system temporary directory
(it is not kept in the repository). Writes:
  public/data/orbitmap/belt.bin   N float32 semi-major axes (au), then 5N uint16:
                                  e, i, node, peri, M, each quantised to 0..65535
                                  (e on [0, 1), i on [0, 180) deg, angles on [0, 360) deg)
  src/data/orbitmap.json          counts, epoch, sources, quantisation, planets' elements
"""
import collections
import datetime
import gzip
import json
import math
import os
import pathlib
import sys
import tempfile
import urllib.request

import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT_BIN = ROOT / "public" / "data" / "orbitmap" / "belt.bin"
OUT_META = ROOT / "src" / "data" / "orbitmap.json"
URL = "https://www.minorplanetcenter.net/iau/MPCORB/MPCORB.DAT.gz"
N_BELT = 80_000           # random subsample of orbits outside the Hilda and Trojan bands
SEED = 42
HILDA, TROJAN = (3.7, 4.2), (5.0, 5.4)


def unpack_epoch(p):
    """Packed MPC date (e.g. 'K2669') -> (year, month, day)."""
    century = {"I": 18, "J": 19, "K": 20}[p[0]]
    val = lambda c: int(c) if c.isdigit() else ord(c) - 55
    return century * 100 + int(p[1:3]), val(p[3]), val(p[4])


def read_mpcorb(path):
    rows, epochs = [], collections.Counter()
    with gzip.open(path, "rt", errors="replace") as f:
        header = True
        for line in f:
            if header:
                if line.startswith("----------"):
                    header = False
                continue
            if len(line) < 104:
                continue
            try:   # a, e, i, node, peri, M (MPC orbit format columns 93-103, 71-79, 60-68, 49-57, 38-46, 27-35)
                el = (float(line[92:103]), float(line[70:79]), float(line[59:68]),
                      float(line[48:57]), float(line[37:46]), float(line[26:35]))
            except ValueError:
                continue
            rows.append(el + (line[20:25],))
            epochs[line[20:25]] += 1
    return rows, epochs


def planet_elements():
    """Heliocentric osculating ecliptic elements of the planets at the frames-ic epoch."""
    import rebound
    ic = json.loads((ROOT / "src" / "data" / "frames-ic.json").read_text())
    bodies = {b["key"]: b for b in ic["bodies"]}
    sim = rebound.Simulation()
    sim.G = 1.0                                   # masses are GM in au^3/day^2, so time is in days
    for key in ["sun", "mercury", "venus", "earth", "mars", "jupiter"]:
        b = bodies[key]
        x, y, z, vx, vy, vz = b["state"]
        sim.add(m=b["gm"], x=x, y=y, z=z, vx=vx, vy=vy, vz=vz)
    sun = sim.particles[0]
    out = {}
    for k, key in enumerate(["mercury", "venus", "earth", "mars", "jupiter"], start=1):
        o = sim.particles[k].orbit(primary=sun)
        out[key] = dict(name=bodies[key]["name"], a=o.a, e=o.e, i=math.degrees(o.inc),
                        node=math.degrees(o.Omega) % 360, peri=math.degrees(o.omega) % 360,
                        M=math.degrees(o.M) % 360, n_deg_per_day=math.degrees(o.n))
    return ic["epochMJD_TT"], ic["fetched"], out


def mpcorb_path(argv):
    if len(argv) > 1:
        return argv[1]
    path = os.path.join(tempfile.gettempdir(), "MPCORB.DAT.gz")
    if not os.path.exists(path):
        print(f"Downloading {URL}")
        urllib.request.urlretrieve(URL, path)
    return path


def build_sample(path):
    """The orbits written to belt.bin, unquantised, plus the numbers the page quotes."""
    rows, epochs = read_mpcorb(path)
    epoch, n_epoch = epochs.most_common(1)[0]
    el = np.array([r[:6] for r in rows if r[6] == epoch])
    n_total = len(rows)
    el = el[(el[:, 0] > 0) & (el[:, 0] < 6.0) & (el[:, 1] < 1.0)]
    a = el[:, 0]
    is_hilda = (a >= HILDA[0]) & (a <= HILDA[1])
    is_trojan = (a >= TROJAN[0]) & (a <= TROJAN[1])
    rest = el[~(is_hilda | is_trojan)]
    rng = np.random.default_rng(SEED)
    keep = rng.choice(len(rest), min(N_BELT, len(rest)), replace=False)
    sample = np.vstack([rest[np.sort(keep)], el[is_hilda], el[is_trojan]])
    info = dict(n_total=len(rows), epoch=epoch, n_epoch=n_epoch, n_range=len(el), n_rest=len(rest),
                n_keep=len(keep), n_hilda=int(is_hilda.sum()), n_trojan=int(is_trojan.sum()))
    return sample, info


def main():
    path = mpcorb_path(sys.argv)
    mtime = datetime.datetime.fromtimestamp(os.path.getmtime(path), datetime.timezone.utc).date().isoformat()
    sample, info = build_sample(path)
    n = len(sample)
    epoch, n_epoch, n_total = info["epoch"], info["n_epoch"], info["n_total"]
    y, m, d = unpack_epoch(epoch)

    q = lambda x, span: np.clip(np.round(x / span * 65535), 0, 65535).astype("<u2")
    a32 = sample[:, 0].astype("<f4")
    u16 = np.concatenate([q(sample[:, 1], 1.0), q(sample[:, 2], 180.0),
                          q(sample[:, 3] % 360, 360.0), q(sample[:, 4] % 360, 360.0), q(sample[:, 5] % 360, 360.0)])
    OUT_BIN.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_BIN, "wb") as f:
        f.write(a32.tobytes())
        f.write(u16.tobytes())

    epoch_mjd, planets_fetched, planets = planet_elements()
    epoch_date = f"{y:04d}-{m:02d}-{d:02d}"
    mjd_from_date = (datetime.date(y, m, d) - datetime.date(1858, 11, 17)).days
    assert abs(mjd_from_date - epoch_mjd) < 1e-9, f"MPCORB epoch {epoch_date} (MJD {mjd_from_date}) != frames-ic MJD {epoch_mjd}"
    meta = {
        "_comment": "Generated by tools/export_orbit_map.py; do not edit.",
        "source": "MPCORB.DAT, Minor Planet Center",
        "sourceUrl": URL,
        "mpcorbFile": mtime,
        "catalogueOrbits": n_total,
        "epochPacked": epoch, "epoch": epoch_date, "epochMJD_TT": epoch_mjd,
        "atEpoch": int(n_epoch),
        "inRange": int(info["n_range"]),
        "counts": {"total": n, "rest": info["n_keep"], "restAvailable": info["n_rest"],
                   "hilda": info["n_hilda"], "trojan": info["n_trojan"]},
        "bands": {"hilda": HILDA, "trojan": TROJAN},
        "seed": SEED,
        "layout": "float32 a[N], then uint16 e[N], i[N], node[N], peri[N], M[N] (little-endian)",
        "scales": {"e": 1.0, "i": 180.0, "node": 360.0, "peri": 360.0, "M": 360.0},
        "gaussK": 0.01720209895,
        "planetsSource": "JPL Horizons states in src/data/frames-ic.json, fetched " + planets_fetched,
        "planets": planets,
        "bytes": OUT_BIN.stat().st_size,
    }
    OUT_META.write_text(json.dumps(meta, indent=1) + "\n")
    print(f"Wrote {OUT_BIN} ({OUT_BIN.stat().st_size / 1e6:.2f} MB): {n:,} orbits "
          f"({info['n_keep']:,} of {info['n_rest']:,} others, {info['n_hilda']:,} Hilda band, {info['n_trojan']:,} Trojan band) "
          f"at epoch {epoch} = {epoch_date}")


if __name__ == "__main__":
    main()
