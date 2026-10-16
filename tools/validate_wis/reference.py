"""Reference observatory positions from wis, for checking src/scripts/wis/earth.js (compare.mjs).

    HOME=<dir with .wispykernels> python tools/validate_wis/reference.py
    node tools/validate_wis/compare.mjs
"""
import json
import pathlib

import numpy as np
from astropy.time import Time
from wis import Wis
from wis.kernels import DE440, GAIA, HST, JWST

AU_KM = 149597870.7
CODES = ["X05", "F51", "568", "I41", "G96", "703", "Q55", "W84", "309", "K91", "Y00", "000"]
utc = Time([f"{y}-{m:02d}-{d:02d}T{h:02d}:{mi:02d}:00" for y, m, d, h, mi in
            [(2000, 1, 1, 12, 0), (2004, 6, 30, 3, 17), (2008, 10, 7, 2, 46), (2012, 3, 3, 21, 5), (2016, 9, 15, 9, 41),
             (2019, 12, 31, 23, 59), (2021, 7, 4, 16, 30), (2023, 2, 14, 6, 6), (2024, 11, 5, 18, 0), (2025, 8, 1, 0, 0),
             (2026, 4, 20, 13, 13), (2026, 10, 15, 12, 0)]], scale="utc")
out = {"utc_ms": [float((t.unix) * 1000) for t in utc], "codes": {}}
# off-grid times for checking the interpolation of the exported spacecraft positions
craft_utc = {"274": Time(["2022-07-12T03:21:00", "2024-03-01T17:45:00", "2026-10-13T08:08:00", "2029-05-05T22:30:00"], scale="utc"),
             "258": Time(["2014-08-01T10:10:00", "2019-07-04T04:44:00", "2025-01-10T19:19:00"], scale="utc"),
             "250": Time(["2026-10-12T00:30:30", "2026-10-12T13:07:45", "2026-10-13T21:59:10"], scale="utc")}
out["craft"] = {}
with Wis(kernels=[DE440, JWST, GAIA, HST]) as w:
    for code, t in craft_utc.items():
        obs, _ = w.get_obs_helio_equ_AU(code, t.tdb)
        g, _ = w.get_obs_helio_equ_AU("500", t.tdb)
        out["craft"][code] = {"utc_ms": [float(x.unix * 1000) for x in t], "xyz": ((np.asarray(obs) - np.asarray(g)) * AU_KM).tolist()}
    geo, _ = w.get_obs_helio_equ_AU("500", utc.tdb)
    for code in CODES:
        obs, _ = w.get_obs_helio_equ_AU(code, utc.tdb)
        out["codes"][code] = ((np.asarray(obs) - np.asarray(geo)) * AU_KM).tolist()
(pathlib.Path(__file__).resolve().parent / "reference.json").write_text(json.dumps(out))
print(f"{len(CODES)} codes x {len(utc)} epochs")
