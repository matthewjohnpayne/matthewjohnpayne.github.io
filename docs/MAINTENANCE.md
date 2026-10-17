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
| 20th of the month | `object-reminder.yml` | Issue if no reviewed object is queued for next month |

## Tier 3: tasks for a local Claude session

Scheduled workflows open GitHub issues for anything that needs judgement or a long local run, using
`tools/task_issue.mjs`. Each issue states what happened, why it matters and, for label
`claude-task`, the exact command:

```bash
cd ~/git_repos/ScientistWebsite && claude "/new-paper 2026AJ....172..123P"
```

GitHub emails each new issue. The commands are Claude Code skills kept in this repository (under
`.claude/`), so they behave the same way every time and follow `AGENTS.md`. Each one finishes by
committing locally, closing its issue, and asking before pushing.

Issue labels: `claude-task` (run the command in the issue) and `maintenance` (needs a look, no
command).
