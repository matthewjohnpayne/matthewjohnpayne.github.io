---
name: update-people
description: Refresh current positions and professional pages for Matthew's former students and postdocs, following docs/UPDATING_PEOPLE.md. Use yearly or when an update-people issue appears.
argument-hint: "[person file name, or blank for all]"
disable-model-invocation: true
---

# Update the students and postdocs: $ARGUMENTS

First read `.claude/task-rules.md` (shared rules: never invent, verify sources, private data, real validated physics, accessibility, drafts, the GitHub issue, never push without Matthew's go-ahead) and `AGENTS.md`.

Follow **`docs/UPDATING_PEOPLE.md`** exactly: its order of preference for links, identity-first rule, name and privacy rules, currency checks, recording sources, and its search methods (ADS affiliations sorted by date, ORCID public API, institution-specific web searches).

1. Records: `src/content/people/*.yaml` (skip `_TEMPLATE.yaml`); one person if a file name was given.
2. For each person, find their current position and best professional page; confirm identity with positive evidence (shared papers with Matthew, matching timeline). Common names need care: if in doubt, leave unlinked and list them for Matthew.
3. Update only the fields the schema allows, and record what was found and when in `source` ("current position from <page>, checked <date>").
4. Never publish an earlier name, private contact details, or a guess. Name changes need Matthew's confirmation.
5. Check `/people/` (build, check, 1440/390), issue (search "people"), commit, list what changed and what needs Matthew's confirmation. Ask before pushing.
