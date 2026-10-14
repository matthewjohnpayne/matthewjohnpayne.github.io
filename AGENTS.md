# Instructions for coding and content-editing agents

This repository is a **personal scientific website** for Matthew Payne. Preserve the approved dark-to-light homepage design and the lightweight, scientific aesthetic in `DESIGN.md`.

## Principles

1. Accuracy before embellishment. Do not invent publications, institutional appointments, collaborators, mentees, scientific results, quotations, degrees or biography details.
2. Prefer first-party data and the user's original work. Source links must be verifiable; the MPC public tutorials are at `https://docs.minorplanetcenter.net/tutorials/`.
3. Do not use AI-generated human portraits as though they represent Matthew Payne. `public/assets/portrait-placeholder.svg` is deliberately an initials placeholder.
4. Existing physics animations are educational, not MPC ephemerides. Do not replace actual integration with decorative preset orbit shapes without clearly labeling them.
5. Avoid stock astrophotography as filler; scientific plots should be sourced from the work or directly computed.
6. Maintain keyboard accessibility, semantic heading hierarchy, alt text, contrast and small-screen layouts.
7. No server-side runtime is required. Keep all interactive experiments client-side so GitHub Pages works.
8. Protect private information and never include secrets in `public/` or client code.

## Editing guide

- Intro and identity: `src/data/site.json`.
- Six sections: `src/data/pages.json`.
- Featured research themes: `src/data/features.json`.
- Structured records (one YAML file each, validated by `src/content.config.ts`):
  - `src/content/tutorials/`: notebooks, linking to the authoritative MPC tutorial pages.
  - `src/content/courses/`: courses written or taught.
  - `src/content/software/`: public repositories, described in their own words.
  - `src/content/publications/`: verified bibliographic records only. Refereed papers are generated from NASA ADS by `tools/fetch_publications.py` (needs `ADS_API_TOKEN`); do not hand-edit generated files except to set `featured: true`, which regeneration keeps. The ADS query is one Matthew Payne confirmed; change it only with his approval. For anything ADS misses, copy `_TEMPLATE.yaml`.
  - `src/content/people/`: mentees and collaborators, each requiring `approvedByPerson: true`. Copy `_TEMPLATE.yaml`.
  The build fails if a record does not match its schema. Files starting with `_` are ignored.
- Homepage: `src/pages/index.astro`.
- Shared site elements: `src/layouts/BaseLayout.astro`.
- Simulation: `public/js/orbital-lab.js`.
- Reference-frames tutorial: `src/pages/teaching/reference-frames.astro` and `src/scripts/frames/`. Initial conditions come from `tools/fetch_frames_ic.py`; re-run `tools/validate_frames/` after changing the integrator, step or initial conditions, and update any numbers quoted in the page copy.
- Styles: `src/styles/global.css`.

If you update the homepage presentation, regenerate the standalone review package using `python tools/make_demo.py` *and* manually check whether the preview generator needs to mirror those layout changes. The Astro source is authoritative, not the preview HTML.

## Before proposing or merging changes

1. `npm install` (generates/updates a lockfile when internet access is available).
2. `npm run build` and, if dependencies are installed, `npm run check`.
3. Test the homepage and all navigation links at approximately 1440px and 390px viewport widths.
4. Verify the orbit lab runs, pauses, resets, and changes scenarios without errors.
5. Confirm site works beneath GitHub Pages `/ScientistWebsite/` base path (or revised custom-domain configuration).
6. Ensure no scientific or biographical placeholder content has been presented as a verified fact.

## Future architecture

As content grows, migrate research projects, people, publications and tutorials into validated Astro content collections with stable IDs and explicit, reviewed cross-references. Keep tutorial code and original notebooks authoritative in their existing GitHub repositories where possible; create browser-readable exports and interactive adaptations without silently duplicating divergent science.
