---
name: review-ideas
description: Re-check the literature for the open problems on /ideas/ (ADS citations and arXiv), update each entry's "since then" section, and recommend removing ideas that have been fully answered. Use yearly or when a review-ideas issue appears.
argument-hint: "[idea id, or blank for all]"
disable-model-invocation: true
---

# Review the open problems: $ARGUMENTS

First read `.claude/task-rules.md` (shared rules: never invent, verify sources, private data, real validated physics, accessibility, drafts, the GitHub issue, never push without Matthew's go-ahead) and `AGENTS.md`.

Entries are `src/content/ideas/*.yaml` (skip `_TEMPLATE.yaml`). If an id was given, review only that one; otherwise review all (one subagent per entry works well).

For each entry:
1. Read the quote and the source paper's bibcode.
2. **ADS** (token from `~/.ads/dev_key`, read in code, never printed): `citations(bibcode:<paper>)` with title, authors, year, abstract; then targeted abstract and full-text queries on the topic. **arXiv** API for recent preprints. For software ideas (digest2, ASSIST), also check the repositories and release notes. Note which later papers include Matthew as an author.
3. Verify every reference you will cite in ADS (bibcode, title, authors, journal, volume, page) or by arXiv id.
4. **Verdict:**
   - **Still open or partly answered:** update (or add) the `since:` block before `status:`, as in `p9-inclined.yaml`: `checked` (today), 2-3 neutral `paragraphs` with numbers from the papers, `open` (what appears still open, our reading), `sources` (label plus `bibcode`, or `url` for preprints). Every statement must come from a listed source.
   - **Fully answered:** do not delete. Report the evidence to Matthew and recommend removal; delete only when he agrees.
5. Check the page in `npm run dev` (`/ideas/`), `npm run check`, issue (search "ideas"), commit, and give Matthew a table of verdicts. Ask before pushing.
