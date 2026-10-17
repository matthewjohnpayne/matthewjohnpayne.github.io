# Keeping the site up to date

The aim is that the site keeps itself current. Machines update facts; anything involving wording
or judgement reaches Matthew as a task, with the command to do it already written.

## Tier 1: updated in the visitor's browser

Pages fetch live data when someone opens them, and fall back to a copy saved at build time.

| Element | Source | Code |
|---|---|---|
| MPC at a glance | MPC Summary API | `src/scripts/mpcstats/` |
| Today at the MPC | MPC RecentMPECs and NEO Confirmation Page | `src/scripts/mpctoday/` |

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
