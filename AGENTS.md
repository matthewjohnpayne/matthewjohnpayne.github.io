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
- Homepage: `src/pages/index.astro`.
- Shared site elements: `src/layouts/BaseLayout.astro`.
- Simulation: `public/js/orbital-lab.js`.
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
