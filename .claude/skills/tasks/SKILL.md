---
name: tasks
description: List the open maintenance tasks for the website (GitHub issues labelled claude-task or maintenance) with the command for each, and offer to run one.
argument-hint: "(none)"
disable-model-invocation: true
allowed-tools:
  - Bash(tools/tasks.sh)
  - Bash(gh issue list *)
  - Bash(gh issue view *)
---

# Open maintenance tasks

Run `tools/tasks.sh` from the repository root. It lists the open issues labelled `claude-task` (each with the command to run) and `maintenance` (needing a look, no command) in matthewjohnpayne/matthewjohnpayne.github.io.

Show Matthew the list, oldest first, grouped by label. For each `claude-task`, give the skill it maps to (`/new-paper`, `/object-of-month`, `/epoch-update`, `/review-ideas`, `/update-people`, `/add-talk`, `/fix-links`). Then ask which one to run; if he picks one, invoke that skill with the issue's arguments. Do not start any task without his choice.

If `gh` is not authenticated, say so and suggest `! gh auth login`.
