---
name: epoch-update
description: Update the site after the MPC moves to a new standard orbit epoch - refetch initial conditions, rerun every affected export and validation, and update numbers quoted on pages. Use when an "MPC epoch changed" issue appears.
argument-hint: "(none)"
disable-model-invocation: true
---

# MPC standard epoch update

First read `.claude/task-rules.md` (shared rules: never invent, verify sources, private data, real validated physics, accessibility, drafts, the GitHub issue, never push without Matthew's go-ahead) and `AGENTS.md`.

The reference-frames page, the homepage card figures and the Object of the Month figures integrate MPC orbits from the epoch stored in `src/data/frames-ic.json`. When the MPC moves its standard epoch, new orbits no longer match it.

1. **Confirm the change.** Compare `src/data/frames-ic.json` with the epoch the MPC Orbits API now returns (e.g. `tools/export_object_orbits.py` reports it, or fetch one orbit). If unchanged, close the issue with a comment and stop.
2. **Refetch initial conditions:** `arch -arm64 python3 tools/fetch_frames_ic.py`.
3. **Re-run every export that depends on it** (read each script's docstring): at least `tools/export_card_figures.py`, `tools/export_mpcorb_samples.py`, and any other `tools/export_*.py` that reads `frames-ic.json` (grep for it).
4. **Featured objects keep their saved orbits** (the archive shows each object as it was featured). Only queued, unreviewed objects should be refetched with `tools/export_object_orbits.py <slug>`; check that every object page still builds (the build fails clearly on an epoch mismatch).
5. **Re-run validations:** `tools/validate_frames/` (see its README), and any `tools/validate_*` whose data changed (`reference.py`, then `node compare.mjs`).
6. **Update numbers quoted in page copy** (e.g. the reference-frames page's distances and dates such as when Kamoʻoalewa leaves its quasi-satellite state, and the `checked` text in `src/data/page-status.json`). Grep the pages for the old numbers.
7. Usual checks, issue (search "epoch"), commit, ask before pushing.
