# Rules shared by every maintenance skill

Every skill in `.claude/skills/` follows these, in addition to its own steps. They restate the parts
of `AGENTS.md` (the authority) that maintenance work depends on.

## Content
1. **Never invent.** No publications, appointments, collaborators, mentees, results, quotations,
   biography or dates that you have not verified. If a fact cannot be checked, leave it out and ask
   Matthew.
2. **Verify sources.** Every factual claim comes from a primary source you fetched in this session
   (NASA ADS, arXiv, the MPC, JPL, the paper itself, an institution's own page). Check bibliographic
   details in ADS. Record where facts came from (`source` fields, `sources` lists).
3. **Private information.** Never publish phone numbers, home addresses, personal email, dates of
   birth or immigration status. Never print, echo, log or commit a secret: the ADS token is read from
   `~/.ads/dev_key` inside code only.
4. **Real physics.** Simulations and figures are computed, and validated against an independent
   reference (REBOUND, JPL Horizons, the notebook); quote the agreement on the page and keep the
   `tools/validate_*` checks passing. Never tune results to match expectations.
5. **Accessibility.** Keyboard and touch usable, text alternatives for canvases and SVGs, nothing
   autoplays, reduced motion respected, works at 390 px with no horizontal overflow.
6. **Drafts.** New wording that speaks for Matthew is a draft (`status: draft`, `reviewed: false`)
   until he approves it.

## Checks before committing
- `PATH=~/.local/node-v24/bin:$PATH npm run build` and `npm run check` (0 errors).
- For changed pages: headless Chrome (puppeteer-core driving /Applications/Google Chrome.app) at
  1440 and 390 px: no console errors, no horizontal overflow.
- Re-run any `tools/validate_*` affected, and update numbers quoted in the page copy.
- Update `docs/ROADMAP.md` when something is finished or started.

## The GitHub issue
- Find the issue this task came from:
  `gh issue list --repo matthewjohnpayne/matthewjohnpayne.github.io --state open --label claude-task --search "<key words> in:title"`
  (also try `--label maintenance`). There may be none if Matthew started the task himself.
- When the work is committed, close it with a one-line summary:
  `gh issue close <N> --repo matthewjohnpayne/matthewjohnpayne.github.io --comment "<what was done, commit hash>"`.
  Leave it open, with a comment, if the work is incomplete or waits on Matthew.

## Finishing
- Commit locally on `main` (or the branch you are on), ending the message with
  `Co-Authored-By: Claude <noreply@anthropic.com>` (or the attribution line your session supplies).
- **Never push** without Matthew's explicit go-ahead for this push; approval of an earlier push does
  not carry over. Every push to `main` publishes the live site. End by summarising what changed,
  what needs his review, and asking: "Shall I push?"
