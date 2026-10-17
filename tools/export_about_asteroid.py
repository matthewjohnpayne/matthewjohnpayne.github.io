#!/usr/bin/env python3
"""The orbit of asteroid (20592) Payne for the About page, from the MPC Orbits API.

Fetches the mpc_orb record with the same code as the Object of the Month pages
(tools/export_object_orbits.py) and keeps the Keplerian elements, epoch, orbit type and fit
statistics. The page draws the orbit at build time from these elements. The MPC naming citation
is not stored: it includes a birth year, which the site does not publish; the page cites the
WGSBN Bulletin instead.

Usage:  python3 tools/export_about_asteroid.py   (standard library only)
Writes: src/data/asteroid-20592.json
"""
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from export_object_orbits import get_orb, summarise  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "src" / "data" / "asteroid-20592.json"


def main():
    s = summarise(get_orb("20592"), "20592")
    names = s.pop("names")
    keep = {
        "designation": "(20592) Payne",
        "provisional": names["unpacked_primary_provisional_designation"],
        "otherDesignations": names["unpacked_secondary_provisional_designations"],
        "fetched": s["fetched"], "source": s["source"],
        "epochMJD_TT": s["epochMJD_TT"], "orbitType": s["orbitType"],
        "kep": s["kep"], "kepSigma": s["kepSigma"], "H": s["H"],
        "periodDays": s["periodDays"], "arc": s["arc"], "nobs": s["nobs"], "nopp": s["nopp"],
    }
    OUT.write_text(json.dumps(keep, indent=1, ensure_ascii=False) + "\n")
    print(f"wrote {OUT.relative_to(ROOT)}: a = {s['kep']['a']:.4f} au, e = {s['kep']['e']:.4f}, "
          f"i = {s['kep']['i']:.2f} deg, epoch MJD {s['epochMJD_TT']}")


if __name__ == "__main__":
    main()
