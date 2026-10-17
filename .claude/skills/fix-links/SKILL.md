---
name: fix-links
description: Repair broken links reported by the weekly link-check issue. Use when a link-check issue appears.
argument-hint: "[issue number]"
disable-model-invocation: true
---

# Fix broken links (issue $ARGUMENTS)

First read `.claude/task-rules.md` (shared rules: never invent, verify sources, private data, real validated physics, accessibility, drafts, the GitHub issue, never push without Matthew's go-ahead) and `AGENTS.md`.

1. Read the issue: `gh issue view $ARGUMENTS --repo matthewjohnpayne/matthewjohnpayne.github.io` (or find the newest open link-check issue if no number was given).
2. For each broken link: confirm it is really broken (`curl -sIL`, retry; some sites block robots or rate-limit, which is not a broken link). Find where it comes from (`grep -rn` in `src/`, `public/`, the generated data and content files).
3. Fix at the source: the moved page's new address on the same site, an official replacement, or an Internet Archive copy (`https://web.archive.org/...`) if the page is gone and the link matters. Never substitute a different source for a cited claim without checking it says the same thing. Generated files (publications, collaborators) are fixed by their tool, not by hand.
4. If a link cannot be fixed safely, leave it and list it for Matthew.
5. Build, check, close the issue with a summary of each link's fix, commit, ask before pushing.
