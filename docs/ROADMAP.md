# Roadmap and ideas

Open work, ideas for future content, and a short log of what is done. Update this file whenever you finish, start or think of something. Background is in `CONTEXT.md`.

## Waiting on Matthew

Status at the end of the session of 2026-10-18. Everything below the "Done" heading is live.

- [ ] **/now page text** in `src/data/now.json` (page exists, noindex and unlinked until it has text). Then link it (About or footer) and list it on nownownow.com.
- [ ] **Portrait photo**, with permission (`public/assets/matthew.jpg`, then `site.json`); the homepage still shows the initials placeholder.
- [ ] **About:** optional "Outside work" section (placeholder visible only under `npm run dev`). Matthew to ask the MPC to correct its own About page ("project scientist from 2018" should be April 2017; Acting Director Feb 2021, Director 2022).
- [ ] **Featured papers:** Matthew to choose a handful (`featured: true` in `src/content/publications/`); then build a "Start here" row on `/research/` and the homepage.
- [ ] **Software list:** Matthew is supplying a curated list one entry at a time; so far digest2, mpc_orb and WIS. Copy `src/content/software/_TEMPLATE.yaml`.
- [ ] **CV:** review `/cv/`; supply anything missing since 2024 (grants, honours, IAWN/SMPAG roles). Claude can add the (20592) Payne naming as an honours entry once there is an honours section.
- [ ] **Talks:** 5 of 32 records have no materials; Google Slides decks and the 2023 IAWN Keynote deck still to export by hand; talks before 2022 not yet recovered. Optionally delete the unredacted "(1).pdf" uploads in Drive.
- [ ] **Students and postdocs** (`docs/UPDATING_PEOPLE.md`, yearly): pages for the current students (Kim Armas, Amanda Fanale, Milagros Tamara Giraldo) once they have them; Tyler Valentine's current position.
- [ ] **MPC staff:** check the former-staff list (archived MPC pages, 2013 onwards), add roles where blank, add earlier staff.
- [ ] **Review wording:** theme summaries in `src/data/research.json`; the Jupiter copy on reference-frames; the resonance-overlap notebook text; the interactive pages HelioLinC, resonance overlap, interstellar objects, and the newer RUN DMC, Laplace resonance, shift-and-stack, exomoons, Cassini and Planet Nine pages.
- [ ] **Small decisions:** whether "Working with me" goes in the navigation (now linked from About, People and Open problems); in Kepleroids, whether Rama, when a wave is cleared before it arrives (10–30 s), should carry its remaining wait into the next wave instead of being rescheduled.

## Next up (for Claude, when asked)

- [ ] Featured-papers row, once Matthew has chosen them.
- [ ] Remove the unused Orbital Laboratory (`src/components/OrbitLab.astro`, `public/js/orbital-lab.js`) and the stale `preview/` copy, if Matthew agrees.
- [ ] Planet Nine notebook: two isolated J2 flips at rp = 30 au (a = 390 and 510) are reported but not investigated. The weekly notebook check runs its QUICK mode (about 7 minutes).
- [x] Render science-notebooks as an online book (done 2026-10-17: `matthewjohnpayne.github.io/science-notebooks/`, `book.yml`).

### Ideas from other science websites (review of 2026-10-17)

Ranked by fit with the site's goals; all must follow AGENTS.md (static, real validated physics, no autoplay).
1. **Uncertainty-shrinking essay** (after ciechanow.ski): a new NEO's cloud of possible orbits narrowing as nights of observations are added, with the impact probability rising then falling to zero. Extends the 2024 YR4 orbit-determination page.
2. **Two centuries of discovery** (after Scott Manley's MPC-data animation): year slider, colour by survey, optional sound on request; built at build time from MPC discovery data.
3. **Interactive companions linked from each paper** (Distill style); much already exists through the per-paper links.
4. **Hover glossary and designation previews** (Gwern, Nutshell), from data saved at build time (MPC orbit API has no CORS).
5. **Designation decoder** (packed/unpacked, discovery to naming), plus an 80-column/ADES line parser.
6. **"Scroll to Sedna"**: a to-scale sideways scroll with discovery-history milestones.
7. **Planetary-defence exercise** (after the CNEOS scenarios), possibly a Kepleroids mode.
8. **"What the MPC data actually says"** notes for news flurries (after AstroWright).
9. **A living "State of Planet Nine" page.**
Cheap: a /uses page; short "today I learned" notes; maturity tags on open problems and notes; FAQ by difficulty.

## Content ideas

### Demo notebooks (for the science-notebooks repo)

Each idea comes from one of Matthew's refereed papers. Pair each notebook with a browser interactive here when it suits one.

| Idea | Based on | Notes |
|---|---|---|
| Resonance overlap and the stability of close planet pairs | Deck, Payne & Holman 2013 (ApJ 774, 129) | **Done:** notebook in science-notebooks; interactive page at `/teaching/resonance-overlap/`. |
| Transit timing variations: inclined and retrograde companions | Payne, Ford & Veras 2010 (ApJL 712, L86) | **Done:** notebook in science-notebooks (064795a); interactive page at `/teaching/transit-timing/`. Still to do: Payne & Ford 2011 (HAT-P-13) and Veras, Ford & Payne 2011. |
| Stellar wobble to radial-velocity curve | Nelson et al. 2014, RUN DMC (ApJS 210, 11) | Ties to the Sun-wobble inset on the reference-frames page. N-body versus Keplerian RV fits for interacting planets. |
| HelioLinC: linking detections by guessing the distance | Holman et al. 2018 (AJ 156, 135) | **Done:** notebook in science-notebooks (abbaaa0); interactive page at `/teaching/heliolinc/`. |
| Shift-and-stack on detection catalogues | Stetzler et al. 2025 (AJ 170, 352) | Synthetic catalogue: recover a faint mover by stacking along trial velocities. |
| Exomoons freed by white dwarf mass loss | Payne et al. 2016 (MNRAS 457, 217), 2017 (MNRAS 464, 2557) | Hill-sphere growth and loss as the star loses mass. |
| Planet Nine and TNO orbits | Li, Hadden, Payne & Holman 2018 (AJ 156, 263); Hadden et al. 2018 (AJ 155, 249) | Secular and chaotic dynamics of distant TNOs. |
| Satellites in closely packed systems | Payne, Deck, Holman & Perets 2013 (ApJL 775, L44) | How tightly packed planets limit moon stability. |
| Laplace resonance in Gliese 876 | Nelson et al. 2016 (MNRAS 455, 2484) | Three-body resonance angles from an N-body fit. |
| Interstellar objects detectable with LSST | Hoover, Seligman & Payne 2022 (PSJ 3, 71) | **Done:** notebook in science-notebooks (`iso_lsst`); interactive page at `/teaching/interstellar-objects/`. Differences from the paper (whole-night visibility test, ecliptic concentration, Δv convention) are explained in the notebook. |

Check author lists and bibcodes against `src/content/publications/` before quoting them on the site.

### Other ideas

- **More reference-frames planets:** Venus and Mars co-orbitals, which the notebook's "Going further" section mentions.
- **Minimoons interactive**, from the MPC animation tutorial.
- **Kepleroids** (2026-10-15): an Asteroids-style game in which everything orbits the Sun (`src/scripts/kepleroids/game.js`). Rama (twin-guns pod) arrives from wave 2; wave 3 has a binary star of the same total mass (separation 90); after wave 3 each wave has, at random, a single star or a binary of random separation (50–90) and mass ratio (0.25–1) (2026-10-18). The homepage hero shows orbits sharing one perihelion, from a circle to hyperbolas (chosen 2026-10-17; `src/components/HeroKepler.astro` inside `HomeOrbit.astro`), in the style of the Research-at-a-glance cards; clicking it opens the game in a large window, with its instructions (a not-very-hidden easter egg). There is also an unlinked, unindexed full page at `/kepleroids/`. The old Orbital Laboratory (`src/components/OrbitLab.astro`, `public/js/orbital-lab.js`) is no longer used but has been kept.
- **Cross-links:** link each research theme to its software, tutorials and interactive pages, and each collaborator to the themes you share.

## Done

- 2026-10-18: **Working with me** `/work-with-me/` published with Matthew's approved wording (undergraduates and SPARK; PhD students via the SAO Predoctoral Program; no direct postdoc hiring, but CfA prize fellows can work with anyone at the CfA; reference letters; getting in touch). Linked from About, People and Open problems. MPC enquiries point to the MPC Helpdesk (minorplanetcenter.net/mpcops/contact/).

- 2026-10-18: **Explore and Teaching merged** (Matthew: "full merge") into `/explore/`, "Explore & learn": interactive cards now carry their notebook, online-book links and notebook dates; the two notebook-only science notebooks get cards; Teaching (PHYS 422) above the MPC tutorials, with three tiles at the top linking to the three parts. `/teaching/` redirects to `#teaching` (`#nb-<area>` to the area); Teaching removed from the navigation; interactive pages' "All tutorials" links now say "More to explore". The Research theme line is now a single link to the theme filter.

- 2026-10-18: **Research and Publications merged** (Matthew's request) into `/research/`, "Research & publications": a By topic / By year toggle kept in the URL, first-author and co-author filters in both views, theme tags in the year view. Each theme shows counts of its interactive pages (linking to `/explore/#theme=<id>`) and notebooks (`/teaching/#nb-<area>`), plus any other related links; per-paper links unchanged. `/publications/` redirects, keeping `#with=`. Publications removed from the navigation.

- 2026-10-17: **Explore hub** `/explore/` (in the main navigation): all interactive pages grouped by area, generated from `page-status.json`, with computed or typographic thumbnails; six featured on a homepage strip; linked from Teaching.

- 2026-10-17: **Automation in three tiers** (`docs/MAINTENANCE.md`): live browser data (software releases, notebook dates), scheduled workflows (publications, links, data refresh, epoch, staff, calendar, CV PDF, Dependabot, notebook tests in science-notebooks), and local Claude skills for tasks that need judgement. Also: FAQ, Today at the MPC, Object of the Month with a queue (Kamoʻoalewa, 2010 JO179, 3I/ATLAS, 2006 RH120 drafted), open problems with literature checks, notes, changelog, status lines, and the orbit-determination essay (2024 YR4).

- 2026-10-15: CV page `/cv/` with a PDF download, generated from `src/data/cv.json` (from the 2021 and 2024 CVs) plus the site's publications, talks and people records. Workflow in `docs/CV.md`.

- 2026-10-15: Talks page `/talks/` with 27 talks from 2022 onwards, from a read-only inventory of Drive MPC_Public (Matthew chose conferences, agency meetings, teaching and outreach, and co-authored talks). Links so far: ACM 2026 slides and video, and the 2025 House testimony record. Workflow in `docs/TALKS.md`. Transit-timing page published.

- 2026-10-14: TTV notebook pushed (science-notebooks 064795a) and interactive page `/teaching/transit-timing/` (Matthew: "push both, then build the browser version"): one system integrated in the browser (PFV10 Fig. 1 presets, four inclinations), the notebook's maps (clickable), and a detection-threshold view. Validated by `tools/validate_ttv/`: RMS TTVs agree with REBOUND to ~1e-4 (median) over 64 systems; one chaotic system diverges.

- 2026-10-14: HelioLinC notebook pushed (science-notebooks abbaaa0) and interactive page `/teaching/heliolinc/` (Matthew: "push, and then work on the browser version"): Crocco's arrows under the reader's guess, the notebook's survey in arrow space with a γ̇ focus slider, and the full linking search in a worker. Validated by `tools/validate_heliolinc/`: identical cluster counts to the notebook module in 7 of 7 settings. Linked from Teaching and the Research detection theme.

- 2026-10-14: **Site published** at https://matthewjohnpayne.github.io/ (Matthew's go-ahead). Pages source switched to GitHub Actions; `deploy.yml` builds and deploys on every push to `main`.

- **2026-10-13:**
  - Imported v0.1 and made it build (Astro 7).
  - Added validated content collections.
  - Built the Teaching page (30 notebooks, PHYS 422) and the Software page.
  - Built the reference-frames interactive (Kamoʻoalewa).
- **2026-10-14:**
  - Added the Jupiter mode (Hektor, Hilda) to the reference-frames page.
  - Linked the homepage card to it.
  - Built the Publications page from ADS (65 papers).
  - Built the Research page (six themes).
  - Built the People page (86 collaborators, with a co-author filter on Publications).
  - Added the project notes (this file and `CONTEXT.md`).
  - Wrote the resonance-overlap notebook in science-notebooks.
  - 2026-10-14: full-resolution version pushed (science-notebooks 7576a3c): DPH13 Lyapunov estimator, analogues of Figs. 4, 5, 9, 10 and 14, results cached in `cache/`.
  - 2026-10-14: interactive page `/teaching/resonance-overlap/` (Matthew: "go ahead with the interactive version"). The analytic overlap diagram, the notebook's Figure 5 maps, maps computed in the browser at four masses, and single orbits. Validated by `tools/validate_overlap/`: 747 of 750 notebook pixels agree on chaotic vs regular. Linked from Teaching (new "Science notebooks" group) and the Research exoplanet-dynamics theme.
  - 2026-10-14: fourth homepage card, "Planetary chaos", linking to it (Matthew chose a fourth card over replacing one). Its drawing is computed at build time from `resonanceSeparatrix`. The card grid is now 4 across, 2 by 2 below 1080px and 1 column on phones.
