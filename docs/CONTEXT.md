# Project context

Background for anyone, human or LLM, picking up this site. `AGENTS.md` holds the rules; this file holds the reasons. Keep it current when a decision changes.

## What the site is for

The personal website of **Matthew Payne**, astrophysicist and Director of the Minor Planet Center (MPC). It describes his previous and current work: research, collaborators, software, teaching and the MPC. The aim is a site that explains the science, rather than a CV page.

- **Audience:** mixed scientific and general readers. The tone is formal and accurate.
- **Maintenance:** it must be easy for an LLM to keep up to date, which is why content lives in validated data files and is generated from authoritative sources where possible.

## Where the design came from

Matthew planned the concept in a ChatGPT conversation ("Website concept planning", 2026). ChatGPT produced the v0.1 code, imported unmodified in commit `10ab108`. The decisions from that conversation:

- **Look:** inspired by [Seeing Theory](https://seeing-theory.brown.edu/), with R2D3 and Distill as secondary references. A dark hero section with an integrated, real orbital simulation sits above light content sections. The science provides the visual interest; see `DESIGN.md`.
- **Six sections:** Research, People, Software, Teaching, MPC, Publications.
- **Interactive explanations:** selected notebooks become browser-based interactive pages, each with real computed physics, no autoplay and full keyboard access.
- **A hidden game, "Kepleroids"** (first planned as "Blastroids"): an Asteroids-style game in which everything orbits the Sun, opened by clicking the orbit diagram on the homepage.
- **Hosting:** GitHub Pages, static, with no server.

## Sections and their data sources

| Section | Source of truth | Notes |
|---|---|---|
| Research | `src/data/research.json` | Six themes; each paper assigned by ADS bibcode. Titles approved 2026-10-14. |
| People | `src/content/people/`, `src/data/mpc-staff.json`, `src/data/collaborators.json` (generated) | Three sections. **Students and postdocs:** names, roles and years from the Academic Supervision section of Matthew's 2021 CV; he will supply fuller details, and "–" periods may have ended since 2021. **MPC staff:** current staff from minorplanetcenter.net/about (2026-10-14); former staff from Internet Archive copies of that page, 2013–2026. Staff before 2013 are not yet covered. **Collaborators:** co-authors from ADS. |
| Software | `src/content/software/` | Curated by Matthew. On 2026-10-14 he removed the first list (old or unfinished repos) and is adding entries one at a time, starting with digest2. Add only entries he chooses. |
| Teaching | `src/content/tutorials/`, `src/content/courses/` | All 30 MPC tutorial notebooks are Matthew's. PHYS 422 (Bridgewater State) is a course he wrote, teaching Python to undergraduates with no programming background. |
| MPC | `src/data/pages.json` | Links to MPC services and documentation. |
| Publications | `src/content/publications/` (generated) | Refereed papers from an ADS query Matthew confirmed. |

### Publications and collaborators

`tools/fetch_publications.py` reproduces Matthew's ADS search: author "Payne, Matthew", 2006 onwards, refereed, astronomy database, excluding other M. Payne authors by middle initial. "Payne, Matthew P" (University of Colorado) is also excluded, because ADS matched a 2023 coronal-heating paper of his. The same run derives the collaborator list.

- **Token:** a refresh needs Matthew's ADS API token in `ADS_API_TOKEN`. The first fetch, on 2026-10-14, used the anonymous token the ADS website itself uses.
- **Count on 2026-10-14:** 65 papers, 9 as first author, plus 86 collaborators.
- **Known oddity:** ADS lists Matthew's affiliation on GOT 'EM V (2025AJ....169..248C) as UC San Diego, probably an ADS mismatch.
- **Matthew's view on collaborators:** the site describes his past work, so listing co-authors needs no approval from them.

## Interactive tutorial: reference frames

`/teaching/reference-frames/` adapts Matthew's MPC notebook "Reference Frames for Solar System Dynamics".

- **What it shows:** one N-body integration (Sun, eight planets, Moon, Kamoʻoalewa, Hektor, Hilda) runs in the reader's browser in about 0.6 s. It is drawn in five frames, around Earth or Jupiter.
- **Data:** initial conditions come from the MPC Orbits API and JPL Horizons via `tools/fetch_frames_ic.py`.
- **Validation:** the integrator (Yoshida 6th-order, 0.5-day step) agrees with REBOUND IAS15 to about 26 km for Earth–Kamoʻoalewa and about 16 m for Jupiter–Hektor and Jupiter–Hilda over 300 years. `tools/validate_frames/` documents the checks.

## Related repository: science notebooks

[`matthewjohnpayne/science-notebooks`](https://github.com/matthewjohnpayne/science-notebooks) (public; local copy `~/git_repos/science-notebooks`) holds research-based notebooks that do not belong on the MPC tutorial site. The first is "Resonance Overlap", reproducing Deck, Payne & Holman (2013) at the paper's own resolution: Lyapunov-time maps from about half a million REBOUND integrations, cached in the repo. Matthew wants to refine that notebook before an interactive web version is built. Rendering the repo to `matthewjohnpayne.github.io/science-notebooks/` (for example with Jupyter Book) is still to do.

## Decisions log

- **2026-10-13: Repository.** The site lives in Matthew's existing `matthewjohnpayne/matthewjohnpayne.github.io` repo and is served at the root, so there is no `base` in `astro.config.mjs`.
- **2026-10-13: License.** Code is MIT (`LICENSE`); text and images are © Matthew Payne, all rights reserved. The footer and README say so.
- **2026-10-13: Commits.** Local commits are fine; pushing needs Matthew's go-ahead.
- **2026-10-14: Live.** With Matthew's go-ahead, Pages was switched to "GitHub Actions" and `main` pushed. **Every push to `main` now publishes the site**, so push only with his go-ahead.
- **2026-10-14: GitHub.** Matthew asked for `matthewjohnpayne/science-notebooks` to be created; it is public. He removed the first Software list, as it was old or unfinished.
- **2026-10-14: Content approvals.**
  - Publications come from the ADS query above.
  - The six research themes are approved as worded "for now".
  - Collaborators are listed from co-authorship.
  - Start the science notebooks with resonance overlap.
  - Do not publish the site yet.

## Local environment notes (Matthew's Mac)

- **Node:** Homebrew's Node is broken (Intel Homebrew on Apple Silicon; missing `libllhttp`). A standalone official Node 24 is installed at `~/.local/node-v24`, so use `PATH=~/.local/node-v24/bin:$PATH`.
- **Headless Chrome screenshots:** `--virtual-time-budget` stalls Web Workers, and window widths under about 500px get cropped. Use puppeteer-core driving `/Applications/Google Chrome.app` with a mobile viewport instead.
