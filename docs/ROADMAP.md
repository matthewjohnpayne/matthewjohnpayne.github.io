# Roadmap and ideas

Open work, ideas for future content, and a short log of what is done. Update this file whenever you finish, start or think of something. Background is in `CONTEXT.md`.

## Waiting on Matthew

- [ ] **Biography and CV details** for the homepage and an About section. Do not draft from public sources without his review.
- [ ] **Portrait photo**, with permission (`public/assets/matthew.jpg`, then `site.json`).
- [ ] **Software list:** Matthew is supplying a curated, up-to-date list, one entry at a time; so far digest2 (2026-10-14). Copy `src/content/software/_TEMPLATE.yaml` for each entry.
- [ ] **Students and postdocs:** current positions and links added 2026-10-14 (see `docs/UPDATING_PEOPLE.md`; repeat yearly). Still open: pages for the current students (Kim Armas, Amanda Fanale, Milagros Tamara Giraldo) once they have them, and Tyler Valentine's current position.
- [ ] **MPC staff:** Matthew to check the former-staff list (from archived MPC pages, 2013 onwards), add roles where blank, and add earlier staff.
- [ ] **An ADS API token** for future publication refreshes. Optionally, a GitHub Action could refresh them on a schedule, with the token stored as a repository secret.
- [ ] **Review the new wording:**
  - the theme summaries in `src/data/research.json` (titles approved; summaries written from paper titles);
  - the Jupiter copy on the reference-frames page;
  - the resonance-overlap notebook text.
- [ ] **Review the HelioLinC interactive page** (`/teaching/heliolinc/`): wording, and whether to add the population or false-tracklet views of the notebook.
- [ ] **Review the resonance-overlap interactive page** (`/teaching/resonance-overlap/`): wording, and whether the map should offer more starting phases or the Figure 9 (phase against period ratio) maps.
- [ ] **Review the interstellar-objects interactive page** (`/teaching/interstellar-objects/`) and notebook (`iso_lsst`): wording, and the notebook's account of where it differs from Hoover, Seligman & Payne (2022).

## Next up

- [ ] **Render science-notebooks to GitHub Pages** (Jupyter Book or similar) at `matthewjohnpayne.github.io/science-notebooks/`.
- [ ] **Featured papers:** set `featured: true` on a handful, and show them at the top of Publications and on the homepage.
- [ ] **Replace the illustrative homepage card figures** (`src/components`) with real computed figures. (The fourth card, "Planetary chaos", already draws computed resonance separatrices.)
- [ ] **Extend the reference-frames run to about 400 years**, so readers can see Kamoʻoalewa leave the quasi-satellite state around 2306 (about 0.7 s of compute).

- [ ] **Talks: public slides.** Seven `_public.pdf` copies are in their MPC_Public folders (2026-10-15) and linked from the Talks records; Matthew to set each to *Anyone with the link*. Still to export by hand: the Google Slides decks and the 2023 IAWN Keynote deck. Then recover talks from before 2022.
- [ ] **CV:** Matthew to review `/cv/`, and to supply anything missing since 2024 (new grants, honours and awards, committee and service roles such as IAWN or SMPAG).

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
- **Kepleroids** (2026-10-15): an Asteroids-style game in which everything orbits the Sun (`src/scripts/kepleroids/game.js`). The homepage hero now shows a static diagram of an eccentric Keplerian orbit, in the style of the Research-at-a-glance cards (`src/components/HomeOrbit.astro`); clicking it opens the game in a large window, with its instructions (a not-very-hidden easter egg). There is also an unlinked, unindexed full page at `/kepleroids/`. The old Orbital Laboratory (`src/components/OrbitLab.astro`, `public/js/orbital-lab.js`) is no longer used but has been kept.
- **Cross-links:** link each research theme to its software, tutorials and interactive pages, and each collaborator to the themes you share.

## Done

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
