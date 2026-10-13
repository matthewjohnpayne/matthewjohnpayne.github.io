# ScientistWebsite · Version 0.1

Personal scientific website for **Matthew Payne**, astrophysicist and Director of the Minor Planet Center.

This initial milestone implements the approved dark-to-light homepage, basic section pages, a responsive mobile layout, and a real browser-side educational gravitational integration. It intentionally **does not** claim to have a complete biography, definitive publication list, student/collaborator profiles, or a real portrait image.

## Requirements

- Node.js 24 (recommended)
- npm

## Run the Astro project

```bash
npm install
npm run dev
```

Open the URL printed by Astro (usually `http://localhost:4321/`). For a production build:

```bash
npm run build
npm run preview
```

**Note:** Package installation was unavailable in the original authoring environment, so the Astro compiler could not be run there. The separately included dependency-free preview **was** tested in Chromium for responsive behavior and simulator controls. On a machine with npm registry access, run `npm install` and `npm run build`, then commit the generated `package-lock.json`.

## Review the standalone preview without npm

A browser-reviewable demonstration is included under `preview/`:

```bash
python -m http.server 8000 --directory preview
```

Visit `http://localhost:8000/`. It contains working navigation and the interactive orbital experiment. This standalone copy is **not** the production Astro build and can be regenerated using `python tools/make_demo.py`.

## Structure

```
src/
  components/          Orbital laboratory and SVG scientific figures
  data/
    site.json          Name, introduction, links, optional portrait
    pages.json         Content for the six top-level sections
    features.json      The three homepage research previews
  layouts/             Shared header, footer, SEO and navigation
  pages/               Homepage and individual section routes
  styles/              Global palette, layout and responsive rules
public/
  js/orbital-lab.js    Dependency-free Newtonian simulation
  assets/              Favicon and portrait placeholder
.github/workflows/     GitHub Pages publication
preview/               Dependency-free locally tested demonstration
AGENTS.md              Instructions for LLM editors
DESIGN.md              Approved design system
```

## Add a photograph

Put an image you have permission to publish at `public/assets/matthew.jpg`, then set `"portrait": "assets/matthew.jpg"` in `src/data/site.json`. The site will show the portrait in the homepage hero. Until then it uses a visible **MP initials placeholder**, not an invented likeness. `portraitCredit` is reserved for recording attribution/rights where appropriate.

## Update content

- Change the name, short introduction, external links or portrait in `src/data/site.json`.
- Update sections, descriptions and curated resource links in `src/data/pages.json`.
- Change the featured research themes in `src/data/features.json`.
- Keep descriptions of publications and people factual and user-approved; do not infer relationships from coauthorship alone.

Long-term content collections (Markdown and structured metadata) can replace or augment these starter JSON files once the publication and people records are curated.

## GitHub Pages deployment

The site lives in the user Pages repository `matthewjohnpayne/matthewjohnpayne.github.io` and is served at `https://matthewjohnpayne.github.io/`, so `astro.config.mjs` sets `site` and no `base`.

1. Under **Settings → Pages**, set the build/deployment source to **GitHub Actions**.
2. Push to `main` (do not commit `node_modules/`, `dist/` or `.astro/`).
3. GitHub Actions runs `.github/workflows/deploy.yml` and publishes the Astro build.

For a custom domain, update `site` in `astro.config.mjs` and configure the domain under **Settings → Pages**.

## License

- **Code** (source, styles, scripts, configuration and tooling) is released under the MIT License in `LICENSE`.
- **Content** (biographical and descriptive text, photographs and other images, and the site's written material) is © Matthew Payne, all rights reserved. It is not covered by the MIT License.

## Physics implementation

`public/js/orbital-lab.js` implements planar Newtonian gravity using velocity Verlet integration in AU, years and solar masses with `G=4π²`. The Sun, Earth and Jupiter have masses; the fourth body is a massless test particle. Integration uses a fixed `0.002 year` timestep and a small softening scale. There are three reproducible initial-condition presets, plus play, pause and reset.

This is **an educational gravitational model, not real-orbit propagation**. The visual scene is heliocentric; Jupiter's force contributes while its orbit lies outside the displayed inner-system view. Orbit traces on the homepage are real results of the numerical model, not hand-drawn decorations. Scientific figures on the three informational cards are illustrative and should later be replaced with verified output from your notebooks.

## Next milestones

- Replace portrait placeholder with an approved photo.
- Review/approve homepage wording and refine spacing after seeing the site on your own browser.
- Add verified publication records, research projects, collaborators and mentees.
- Embed curated MPC notebooks and create the first reference-frame demonstration.
- Add the hidden Blastroids game at a later stage.
