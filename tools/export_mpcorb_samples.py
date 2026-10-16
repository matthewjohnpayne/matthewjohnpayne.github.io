#!/usr/bin/env python3
"""Fetch the sample mpc_orb.json files for the mpc_orb page (src/pages/software/mpc-orb.astro)
from the MPC's get-orb API (https://docs.minorplanetcenter.net/mpc-ops-docs/apis/get-orb/).

    python3 tools/export_mpcorb_samples.py

Writes public/data/mpc_orb/<key>.json (each the bare mpc_orb object) and index.json.
"""
import json
import pathlib
import urllib.request

OUT = pathlib.Path(__file__).resolve().parents[1] / "public" / "data" / "mpc_orb"
SAMPLES = [  # key, designation sent to the API, label on the page, a note on the page
    ("ceres", "Ceres", "(1) Ceres", "Observed since its discovery in 1801."),
    ("apophis", "Apophis", "(99942) Apophis", "Fitted with the Yarkovsky effect (the 7th parameter). The real orbit is reshaped by its close approach to Earth on 13 April 2029, which a two-body model ignores."),
    ("2024yr4", "2024 YR4", "2024 YR4", "Briefly a possible 2032 Earth impactor; further observations in 2025 ruled that out."),
    ("2008tc3", "2008 TC3", "2008 TC3", "Observed for less than a day before it hit Earth on 7 October 2008, less than three hours after this epoch; this page ignores Earth, so its clones carry on."),
    ("12p", "12P", "12P/Pons–Brooks", "A comet, fitted with non-gravitational accelerations from outgassing (A1 and A2), which the two-body model here leaves out."),
    ("3i", "3I", "3I/ATLAS", "Interstellar, on a hyperbolic orbit (e > 1), so it has no Keplerian semi-major axis or period."),
]


def get_orb(desig):
    req = urllib.request.Request("https://data.minorplanetcenter.net/api/get-orb", method="GET",
                                 data=json.dumps({"desig": desig}).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)[0]["mpc_orb"][0]


OUT.mkdir(parents=True, exist_ok=True)
index = []
for key, desig, label, note in SAMPLES:
    orb = get_orb(desig)
    (OUT / f"{key}.json").write_text(json.dumps(orb, indent=1) + "\n")
    index.append(dict(key=key, label=label, note=note, created=orb["software_data"]["mpcorb_creation_datetime"]))
    print(f"{key:8s} epoch MJD {orb['epoch_data']['epoch']}  {orb['orbit_fit_statistics']['arc_length_total']}")
(OUT / "index.json").write_text(json.dumps(index, indent=1) + "\n")
