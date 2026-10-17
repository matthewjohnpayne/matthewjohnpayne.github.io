#!/usr/bin/env python3
"""Orbits for the Object of the Month pages, from the MPC Orbits API.

For every record in src/content/objects/ (one Markdown file per object, with a `designation`
in its front matter), fetch the object's orbit in the mpc_orb format from
https://data.minorplanetcenter.net/api/get-orb and keep what the page needs: the best-fit
elements and their uncertainties, the heliocentric ecliptic state vector, the absolute
magnitude and the fit statistics. The page integrates the state at build time with the
reference-frames integrator, so the orbit's epoch must match src/data/frames-ic.json
(re-run tools/fetch_frames_ic.py at the new epoch if the MPC moves to a new one).

Usage:  python3 tools/export_object_orbits.py   (standard library only)
Writes: src/data/objects/<record name>.json
"""
import datetime
import json
import pathlib
import re
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
RECORDS = ROOT / "src" / "content" / "objects"
OUT = ROOT / "src" / "data" / "objects"
API = "https://data.minorplanetcenter.net/api/get-orb"


def get_orb(desig):
    req = urllib.request.Request(API, data=json.dumps({"desig": desig}).encode(), method="GET",
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)[0]["mpc_orb"][0]


def summarise(mo, desig):
    kep, com, car = mo["KEP"], mo["COM"], mo["CAR"]
    named = lambda block: dict(zip(block["coefficient_names"], block["coefficient_values"]))
    sigma = lambda block: dict(zip(block["coefficient_names"], block["coefficient_uncertainties"]))
    fit = mo["orbit_fit_statistics"]
    return {
        "designation": desig,
        "fetched": datetime.date.today().isoformat(),
        "source": f"MPC Orbits API ({API}), mpc_orb format",
        "names": mo["designation_data"],
        "epochMJD_TT": mo["epoch_data"]["epoch"],
        "orbitType": mo["categorization"]["orbit_type_str"],
        "kep": named(kep), "kepSigma": sigma(kep),
        "com": named(com), "comSigma": sigma(com),
        "state": car["coefficient_values"],   # heliocentric ecliptic (ICRF), au and au/day
        "H": mo["magnitude_data"]["H"], "G": mo["magnitude_data"]["G"],
        "periodDays": fit["period"],
        "arc": fit["arc_length_total"], "nobs": fit["nobs_total"], "nopp": fit["nopp"],
        "rms": fit["normalized_RMS"],
        "fitDate": mo["software_data"]["fitting_datetime"],
        "frame": mo["system_data"],
    }


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for path in sorted(RECORDS.glob("[!_]*.md")):
        m = re.search(r'^designation:\s*"?([^"\n]+)"?\s*$', path.read_text(encoding="utf-8"), re.M)
        if not m:
            raise SystemExit(f"{path.name}: no designation in the front matter")
        desig = m.group(1).strip()
        data = summarise(get_orb(desig), desig)
        (OUT / f"{path.stem}.json").write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"{path.stem}: {data['names']['citation']}, epoch MJD {data['epochMJD_TT']}, a = {data['kep']['a']:.6f} au")


if __name__ == "__main__":
    main()
