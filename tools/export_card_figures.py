"""Data for the computed figures on the homepage's "Research at a glance" cards
(src/components/ScienceVisual.astro), written to src/data/card-figures.json.

Usage:
    python tools/export_card_figures.py path/to/MPCORB.DAT.gz

* Small-body populations: a random sample of the MPC's orbit database (MPCORB) with
  H < 15.5 and 1.6 < a < 5.6 au, as (semi-major axis, eccentricity) pairs.
* Temporary satellites: the path of the minimoon 2006 RH120 relative to the Earth from
  JPL Horizons (JPL's orbit solution, which includes non-gravitational forces), in the
  ecliptic plane and in a frame rotating so that the Sun stays in a fixed direction.

MPCORB is downloaded by hand from https://minorplanetcenter.net/iau/MPCORB/MPCORB.DAT.gz.
"""
import datetime
import gzip
import json
import pathlib
import sys
import urllib.parse
import urllib.request

import numpy as np

OUT = pathlib.Path(__file__).resolve().parents[1] / "src" / "data" / "card-figures.json"
N_SAMPLE = 3000
H_MAX, A_MIN, A_MAX = 15.5, 1.6, 5.6


def read_mpcorb(path):
    """(H, a, e) of every MPCORB record (fixed-column format)."""
    out = []
    with gzip.open(path, "rt", encoding="ascii", errors="replace") as f:
        body = False
        for line in f:
            if line.startswith("-----"):
                body = True
                continue
            if not body or len(line) < 103 or not line[8:13].strip():
                continue
            try:
                out.append((float(line[8:13]), float(line[92:103]), float(line[70:79])))
            except ValueError:
                continue
    return np.array(out)


def horizons_vectors(command, start, stop, step="1 d"):
    """Geocentric ecliptic (J2000) positions (au) from JPL Horizons."""
    params = {"format": "text", "COMMAND": f"'{command}'", "EPHEM_TYPE": "VECTORS", "CENTER": "'500@399'",
              "START_TIME": f"'{start}'", "STOP_TIME": f"'{stop}'", "STEP_SIZE": f"'{step}'",
              "REF_PLANE": "ECLIPTIC", "REF_SYSTEM": "ICRF", "OUT_UNITS": "AU-D", "VEC_TABLE": "1",
              "CSV_FORMAT": "YES", "VEC_LABELS": "NO"}
    url = "https://ssd.jpl.nasa.gov/api/horizons.api?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=120) as r:
        text = r.read().decode()
    rows = text[text.index("$$SOE") + 5:text.index("$$EOE")].strip().splitlines()
    return np.array([[float(v) for v in row.split(",")[2:5]] for row in rows]), text


def main():
    rng = np.random.default_rng(2026)
    orb = read_mpcorb(sys.argv[1])
    H, a, e = orb.T
    sel = np.flatnonzero((H < H_MAX) & (a > A_MIN) & (a < A_MAX) & (e < 0.5))
    pick = rng.choice(sel, size=min(N_SAMPLE, sel.size), replace=False)
    population = [[round(float(a[k]), 4), round(float(e[k]), 4)] for k in pick]
    print(f"MPCORB: {len(orb):,} orbits; {sel.size:,} pass the cuts; {len(pick)} sampled")

    start, stop = "2006-05-01", "2007-09-30"
    rh, text = horizons_vectors("DES=2006 RH120;", start, stop)
    sun, _ = horizons_vectors("10", start, stop)
    soln = next((ln.strip() for ln in text.splitlines() if "Soln.date" in ln), "")
    # rotate each day so that the Sun lies along -x
    ang = np.arctan2(sun[:, 1], sun[:, 0]) - np.pi
    c, s = np.cos(-ang), np.sin(-ang)
    x = c * rh[:, 0] - s * rh[:, 1]
    y = s * rh[:, 0] + c * rh[:, 1]
    path = [[round(float(u), 5), round(float(v), 5)] for u, v in zip(x, y)]
    print(f"2006 RH120: {len(path)} daily positions; {soln}")

    OUT.write_text(json.dumps({
        "description": "Data for the computed homepage card figures, made by tools/export_card_figures.py.",
        "made": datetime.date.today().isoformat(),
        "population": {"source": "MPC orbit database (MPCORB.DAT), downloaded " + datetime.date.today().isoformat(),
                       "cuts": f"H < {H_MAX}, {A_MIN} < a < {A_MAX} au, e < 0.5; random sample of {len(pick)}",
                       "a_e": population},
        "minimoon": {"object": "2006 RH120", "source": f"JPL Horizons, geocentric ecliptic positions; {soln}",
                     "frame": "Earth at the origin, rotating so that the Sun is always along -x (au)",
                     "start": start, "step_days": 1, "xy": path},
    }, separators=(",", ":")) + "\n")
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
