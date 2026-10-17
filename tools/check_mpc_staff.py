#!/usr/bin/env python3
"""Compare the staff listed on the MPC About page with src/data/mpc-staff.json.

Reports people on the page who are in neither the `current` nor the `former` list, people in
`current` who are no longer on the page, and roles that differ where the page states one. People
kept in `former` although the page still lists them (at Matthew Payne's instruction) are not
reported. Matthew Payne himself is ignored. Never edits the data file.

    python3 tools/check_mpc_staff.py

Exit 0: no differences. Exit 1: differences (printed as Markdown for the issue). Exit 2: page
unreachable or not parsed. Standard library only.
"""
import html
import json
import pathlib
import re
import sys
import unicodedata
import urllib.request

URL = "https://minorplanetcenter.net/about"
DATA = pathlib.Path(__file__).resolve().parents[1] / "src" / "data" / "mpc-staff.json"
IGNORE = {"matthew payne"}


def key(name):
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z ]", "", re.sub(r"\s+", " ", s)).strip()


def page_staff():
    with urllib.request.urlopen(urllib.request.Request(URL, headers={"User-Agent": "matthewjohnpayne.github.io staff check"}), timeout=60) as r:
        text = r.read().decode("utf-8", "replace")
    start = text.find(">Staff<")
    end = text.find("Running Tallies", start)
    if start < 0 or end < 0:
        raise ValueError("could not find the Staff section")
    people = {}
    for h in re.findall(r"<h3[^>]*>(.*?)</h3>", text[start:end], re.S):
        name, _, role = html.unescape(re.sub(r"<[^>]+>", "", h)).strip().partition(",")
        people[key(name)] = (name.strip(), role.strip())
    if not people:
        raise ValueError("no staff headings found")
    return people


try:
    page = page_staff()
except Exception as err:  # noqa: BLE001
    print(f"Could not read the MPC About page: {err}")
    sys.exit(2)
data = json.loads(DATA.read_text())
current = {key(p["name"]): p for p in data["current"]}
former = {key(p["name"]): p for p in data.get("former", [])}

lines = []
for k, (name, role) in sorted(page.items()):
    if k in IGNORE:
        continue
    if k not in current and k not in former:
        lines.append(f"- **New on the About page:** {name}" + (f", {role}" if role else ""))
    elif k in current and role and role != current[k].get("role", ""):
        lines.append(f"- **Role differs** for {name}: the page says \"{role}\", the site says \"{current[k].get('role', '')}\"")
for k, p in sorted(current.items()):
    if k not in page:
        lines.append(f"- **No longer on the About page:** {p['name']} (still in `current`)")

if not lines:
    print(f"No differences between {URL} and src/data/mpc-staff.json.")
    sys.exit(0)
print(f"Differences between {URL} and src/data/mpc-staff.json:\n")
print("\n".join(lines))
print("\nAGENTS.md: keep roles exactly as the MPC states them, and ask Matthew before adding former staff.")
sys.exit(1)
