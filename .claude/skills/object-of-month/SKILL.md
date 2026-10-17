---
name: object-of-month
description: Draft an Object of the Month entry (essay, sources, computed orbit figures) for Matthew to review, queued for a given month. Use when the reminder issue says no object is queued, or Matthew asks for a new object.
argument-hint: "<designation> <YYYY-MM>"
disable-model-invocation: true
---

# Object of the Month: $0 for $1

First read `.claude/task-rules.md` (shared rules: never invent, verify sources, private data, real validated physics, accessibility, drafts, the GitHub issue, never push without Matthew's go-ahead) and `AGENTS.md`.

1. **Check the queue.** `node tools/check_next_object.mjs $1` and `ls src/content/objects/`. If $1 already has a reviewed object, ask Matthew before adding another. If the designation or month is missing from the arguments, ask.
2. **Record.** Copy `src/content/objects/_TEMPLATE.md` to `src/content/objects/<slug>.md` (lower case, no spaces). Set `name` exactly as the MPC writes it, `designation`, `month: "$1"`, `summary`, `view`, `related`, `papers` (Matthew's bibcodes about the object, if any), `sources`, and **`reviewed: false`**.
3. **Essay** (about 400-600 words, the tone and structure of `kamooalewa.md`): discovery, why the orbit is interesting, what is known physically, any mission. Every factual claim comes from a primary source fetched now (MPC object page and MPECs, MPC get-orb, JPL SBDB/Horizons, refereed papers via ADS, agency pages) and is cited inline and in `sources`. Neutral voice; first person only for facts about Matthew's own papers.
4. **Orbit and figures.** `arch -arm64 python3 tools/export_object_orbits.py <slug>` (saves the MPC orbit; already-featured objects keep their saved orbits). Choose a `view` that suits the orbit (`heliocentric`, `earth-corotating`, `outer-resonance`, `hyperbolic`, `earth-capture`; see `src/content.config.ts`). For the newer views run `tools/export_object_figures.py`. If none fits, add a view following `src/components/ObjectFigures.astro`, with real physics validated against JPL Horizons, the method and epoch stated, and "an illustration, not an ephemeris".
5. **Check** in `npm run dev` that the page shows with a Draft label, and that a production build does not include it (it is unreviewed). Usual checks.
6. Issue (search "Object of the Month for $1"), commit, and tell Matthew it needs his review (`reviewed: true` publishes it on the 1st of $1). Ask before pushing.
