# Keeping the site up to date

The aim is that the site keeps itself current. Machines update facts; anything involving wording
or judgement reaches Matthew as a task, with the command to do it already written.

## Tier 1: updated in the visitor's browser

Pages fetch live data when someone opens them, and fall back to a copy saved at build time.

| Element | Source | Code |
|---|---|---|
| MPC at a glance | MPC Summary API | `src/scripts/mpcstats/` |
| Today at the MPC | MPC RecentMPECs and NEO Confirmation Page | `src/scripts/mpctoday/` |
| Software: latest release of each package with `pypi:` in its record | PyPI JSON API (no rate limit) | `src/scripts/releases/`, snapshot `tools/export_software_releases.mjs` |
| Teaching: "Notebook updated" date on each science-notebook card | GitHub commits API (60 requests/hour per visitor; fetched when the cards scroll into view, cached an hour, stops when the quota runs low; the build uses `GITHUB_TOKEN` if set) | `src/scripts/notebooks/`, snapshot `tools/export_notebook_dates.mjs` |

Only sources that allow cross-origin requests and need no secret can be used here. ADS (token),
arXiv (no CORS), MPC get-orb (GET with a body) and JPL APIs (unreliable) cannot.

## Tier 2: scheduled GitHub workflows

Rule: purely factual, machine-generated data is committed automatically, and only if the build and
the validation tools pass. Anything that changes wording opens a pull request or an issue.

| When | Workflow | Result |
|---|---|---|
| Daily 06:17 UTC | `deploy.yml` | Rebuild: refreshes build-time copies, switches the Object of the Month on the 1st |
| Mondays | `publications.yml` | Re-runs the ADS query (needs the `ADS_API_TOKEN` repository secret; opens an issue if it is missing). Changed records are committed once the site builds; each new paper gets a claude-task issue `/new-paper <bibcode>`; then starts `cv-pdf.yml` and the deploy |
| Wednesdays | `links.yml` | Builds the site, checks every link with lychee (`lychee.toml`) and that every Google Drive link is public (`tools/check_drive_links.mjs`); problems go into one claude-task issue `/fix-links` |
| 3rd of the month | `data-refresh.yml` | Refreshes `mpc-today.json`, `mpc-stats.json` and `card-figures.json`, records the run in `data-refresh.json`, builds, commits, deploys. The record changes every month, so there is always a commit, which keeps GitHub from pausing scheduled workflows (it does so after 60 days without commits) |
| 5th of the month | `epoch-check.yml` | claude-task `/epoch-update` if the MPC standard epoch differs from `frames-ic.json` (`tools/check_mpc_epoch.py`) |
| 7th of the month | `staff-check.yml` | Maintenance issue listing differences between the MPC About page and `mpc-staff.json` (`tools/check_mpc_staff.py`); never edits the file |
| 20th of the month | `object-reminder.yml` | Issue if no reviewed object is queued for next month |
| 5 Jan, 5 Apr, 5 Jul | `calendar.yml` | claude-task `/update-people`; maintenance issue to review the CV; claude-task `/review-ideas` |
| On push (CV sources) | `cv-pdf.yml` | Rebuilds `public/cv/Matthew_Payne_CV.pdf` reproducibly and commits it if it changed |
| Monthly | `dependabot.yml` | One grouped pull request each for npm packages and GitHub Actions |
| Pull requests | `build-check.yml` | Build and type-check must pass |

Notes:
- Commits made by workflows (as `github-actions[bot]`) do not trigger other workflows, so the
  committing workflows start `deploy.yml` (and `cv-pdf.yml`) themselves with `gh workflow run`.
  They share the concurrency group `auto-commit` and rebase before pushing.
- The changelog leaves out commits by `github-actions[bot]`.
- Not refreshed automatically: anything tied to the MPC standard epoch (`frames-ic.json`, object
  orbits, the mpc_orb page samples), because figures, validation and page text depend on it.
- Every workflow can also be run by hand from the Actions tab (`workflow_dispatch`).

## Tier 3: tasks for a local Claude session

Scheduled workflows open GitHub issues for anything that needs judgement or a long local run, using
`tools/task_issue.mjs`. Each issue states what happened, why it matters and, for label
`claude-task`, the exact command:

```bash
cd ~/git_repos/ScientistWebsite && claude "/new-paper 2026AJ....172..123P"
```

GitHub emails each new issue. To see everything open, run `tools/tasks.sh`, or `/tasks` inside a
Claude session.

The commands are Claude Code project skills in `.claude/skills/<name>/SKILL.md`. All of them follow
the shared rules in `.claude/task-rules.md` (a summary of `AGENTS.md`: never invent, verify sources,
protect private data, real validated physics, accessibility, drafts), find and close their issue,
commit locally, and end by asking Matthew whether to push. They only run when invoked
(`disable-model-invocation: true`); arguments follow the command name.

| Command | When | What it does |
|---|---|---|
| `/new-paper <bibcode>` | Weekly ADS refresh finds a new paper | Makes sure the record exists; reads the paper; assigns its research theme; asks about `featured` and whether to build a science notebook and/or interactive page, then builds them following the existing pattern; adds cross-links |
| `/object-of-month <designation> <YYYY-MM>` | Reminder on the 20th, or any time | Drafts the essay with verified sources, saves the MPC orbit, computes the figures; `reviewed: false` for Matthew |
| `/epoch-update` | Monthly check finds a new MPC standard epoch | Refetches initial conditions, re-runs the affected exports and validations, updates numbers quoted on pages; featured objects keep their saved orbits |
| `/review-ideas [id]` | Yearly reminder | Re-checks ADS and arXiv for each open problem, updates its "since then" section, recommends removal of answered ones |
| `/update-people [file]` | Yearly reminder | Follows `docs/UPDATING_PEOPLE.md` for students' and postdocs' current positions |
| `/add-talk <link or path>` | A new talk | Follows `docs/TALKS.md`: public, redacted PDF and a talk record; Matthew sets sharing |
| `/fix-links [issue]` | Weekly link check | Confirms and repairs broken links at their source |
| `/tasks` | Any time | Lists open `claude-task` and `maintenance` issues with their commands, and offers to run one |

Issue labels: `claude-task` (run the command in the issue) and `maintenance` (needs a look, no
command). To add a task type: a skill in `.claude/skills/`, a workflow step that calls
`tools/task_issue.mjs` with `--command 'claude "/<skill> <args>"'`, and a row in this table.
