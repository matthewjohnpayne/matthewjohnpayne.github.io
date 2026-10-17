#!/usr/bin/env python3
"""Has the MPC moved to a new standard orbit epoch?

The reference-frames page (src/data/frames-ic.json) and the Object of the Month figures are tied to
the MPC's standard epoch, which changes roughly every 200 days. This compares the epoch of the MPC's
current orbit for (1) Ceres, which is always given at the standard epoch, with frames-ic.json.

    python3 tools/check_mpc_epoch.py

Exit 0: unchanged. Exit 1: changed (prints a summary for the issue). Exit 2: MPC unreachable.
Standard library only.
"""
import json
import pathlib
import sys
import urllib.request

FRAMES = pathlib.Path(__file__).resolve().parents[1] / "src" / "data" / "frames-ic.json"


def mpc_epoch():
    req = urllib.request.Request("https://data.minorplanetcenter.net/api/get-orb", method="GET",
                                 data=json.dumps({"desig": "Ceres"}).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return float(json.load(r)[0]["mpc_orb"][0]["epoch_data"]["epoch"])


site = float(json.loads(FRAMES.read_text())["epochMJD_TT"])
try:
    mpc = mpc_epoch()
except Exception as err:  # noqa: BLE001 - any failure means we cannot tell
    print(f"Could not reach the MPC Orbits API: {err}")
    sys.exit(2)
if mpc == site:
    print(f"Unchanged: the MPC standard epoch is MJD {mpc:g}, as in src/data/frames-ic.json.")
    sys.exit(0)
print(f"The MPC's standard epoch is now MJD {mpc:g} (TT); src/data/frames-ic.json uses MJD {site:g}.")
sys.exit(1)
