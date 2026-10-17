---
name: add-talk
description: Add a talk to the Talks page - make a public, redacted PDF of the slides and a talk record - following docs/TALKS.md. Use when Matthew shares a new talk or a talks issue appears.
argument-hint: "<Google Drive link or local path to the slides>"
disable-model-invocation: true
---

# Add a talk: $ARGUMENTS

First read `.claude/task-rules.md` (shared rules: never invent, verify sources, private data, real validated physics, accessibility, drafts, the GitHub issue, never push without Matthew's go-ahead) and `AGENTS.md`.

Follow **`docs/TALKS.md`** (records in `src/content/talks/`, one YAML per talk; allowed material labels are in `src/content.config.ts`).

1. **Get the slides** from $ARGUMENTS: the Google Drive connector can read, search and export PDFs (large decks may need Matthew to use File -> Download -> PDF); a Drive for Desktop copy is under `~/Library/CloudStorage/`. Never use speaker notes.
2. **Review every slide** (contact sheets with pymupdf help). Remove pages showing: budget, award amounts, staffing or personnel material; film or TV clips or stills; private repositories, hostnames or internal systems; anything private. When unsure, list the slide for Matthew rather than deciding. Redact by dropping pages with pypdf; name the file `<name>_public.pdf`.
3. **Public copy:** put the PDF where Matthew asks (usually the talk's MPC_Public folder or his Presentations folder). **Matthew sets sharing himself**; do not change sharing unless he explicitly asks. Then check it is public: `curl -sL https://drive.google.com/file/d/<id>/view` must give a `<title>` of "<name> - Google Drive".
4. **Record:** title, date, event, location, kind, note, materials (`https://drive.google.com/file/d/<id>/view`), and `source` saying where the facts came from. Never guess a venue or date: ask Matthew.
5. Check `/talks/` (build, check, 1440/390), issue (search "talk"), commit, ask before pushing.
