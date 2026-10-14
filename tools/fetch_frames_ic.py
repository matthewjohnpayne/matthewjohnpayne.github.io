#!/usr/bin/env python3
"""Fetch initial conditions for the reference-frames demonstration.

Mirrors the MPC tutorial "Reference Frames for Solar System Dynamics":
asteroid states come from the MPC Orbits API (heliocentric ecliptic Cartesian,
AU and AU/day), and the Sun, planets and Moon come from JPL Horizons
(barycentric ecliptic, ICRF) at the same epoch.

The browser integrates forward from these states; nothing is precomputed.

Usage:  python3 tools/fetch_frames_ic.py   (standard library only)
Writes: src/data/frames-ic.json
"""
import datetime
import json
import pathlib
import urllib.parse
import urllib.request

OUT = pathlib.Path(__file__).resolve().parents[1] / "src" / "data" / "frames-ic.json"

# Test particles: (MPC designation, key, display name)
ASTEROIDS = [
    ("469219", "kamooalewa", "Kamoʻoalewa"),  # Earth quasi-satellite
    ("624", "hektor", "Hektor"),             # Jupiter Trojan, L4
    ("153", "hilda", "Hilda"),               # 3:2 resonance with Jupiter
]

# Massive bodies: (Horizons id, key, name, GM in km^3/s^2 from JPL DE440).
# As in the tutorial, "399"/"301" select the Earth and Moon individually;
# the other planets are system barycentres.
BODIES = [
    ("10", "sun", "Sun", 132712440041.279419),
    ("1", "mercury", "Mercury", 22031.868551),
    ("2", "venus", "Venus", 324858.592000),
    ("399", "earth", "Earth", 398600.435507),
    ("301", "moon", "Moon", 4902.800118),
    ("4", "mars", "Mars", 42828.375816),
    ("5", "jupiter", "Jupiter", 126712764.100000),
    ("6", "saturn", "Saturn", 37940584.841800),
    ("7", "uranus", "Uranus", 5794556.400000),
    ("8", "neptune", "Neptune", 6836527.100580),
]

AU_KM = 149597870.7
DAY_S = 86400.0


def gm_au_day(gm_km3_s2):
    return gm_km3_s2 * DAY_S**2 / AU_KM**3


def mpc_orbit(desig):
    req = urllib.request.Request(
        "https://data.minorplanetcenter.net/api/get-orb",
        data=json.dumps({"desig": desig}).encode(),
        headers={"Content-Type": "application/json"},
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)[0]["mpc_orb"][0]


def horizons_state(command, jd_tt):
    params = {
        "format": "text", "COMMAND": f"'{command}'", "EPHEM_TYPE": "VECTORS",
        "CENTER": "'500@0'", "TLIST": f"'{jd_tt}'", "TLIST_TYPE": "JD",
        "TIME_TYPE": "TT", "VEC_TABLE": "2", "REF_PLANE": "ECLIPTIC",
        "REF_SYSTEM": "ICRF", "OUT_UNITS": "AU-D", "CSV_FORMAT": "YES",
        "VEC_LABELS": "NO",
    }
    url = "https://ssd.jpl.nasa.gov/api/horizons.api?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=60) as r:
        text = r.read().decode()
    row = text[text.index("$$SOE") + 5:text.index("$$EOE")].strip()
    return [float(v) for v in row.split(",")[2:8]]


def main():
    orbits = {d: mpc_orbit(d) for d, _, _ in ASTEROIDS}
    epochs = {o["epoch_data"]["epoch"] for o in orbits.values()}
    if len(epochs) != 1:
        raise SystemExit(f"Asteroid epochs differ ({epochs}); add a common-epoch step.")
    epoch_mjd = epochs.pop()
    jd_tt = epoch_mjd + 2400000.5

    bodies = []
    for hid, key, name, gm in BODIES:
        bodies.append({"key": key, "name": name, "horizons": hid,
                       "gm": gm_au_day(gm), "state": horizons_state(hid, jd_tt)})

    sun = bodies[0]["state"]
    particles = []
    for desig, key, name in ASTEROIDS:
        o = orbits[desig]
        helio = o["CAR"]["coefficient_values"][:6]
        particles.append({
            "key": key, "name": name, "designation": desig,
            # Heliocentric MPC state shifted to the barycentre via Horizons' Sun
            "state": [s + h for s, h in zip(sun, helio)],
            "mpc": {"fitted": o["software_data"]["fitting_datetime"],
                    "arc": o["orbit_fit_statistics"]["arc_length_total"],
                    "nobs": o["orbit_fit_statistics"]["nobs_total"]},
        })

    OUT.write_text(json.dumps({
        "description": "Initial conditions for the reference-frames demo. "
                       "Barycentric ecliptic (ICRF) positions in AU, velocities in AU/day; "
                       "GM in AU^3/day^2.",
        "epochMJD_TT": epoch_mjd,
        "fetched": datetime.date.today().isoformat(),
        "sources": {
            "asteroids": "MPC Orbits API, https://data.minorplanetcenter.net/api/get-orb",
            "planets": "JPL Horizons API, https://ssd.jpl.nasa.gov/api/horizons.api",
            "gm": "JPL DE440",
        },
        "bodies": bodies,
        "particles": particles,
    }, indent=1, ensure_ascii=False) + "\n")
    print(f"Wrote {OUT} (epoch MJD {epoch_mjd} TT)")


if __name__ == "__main__":
    main()
