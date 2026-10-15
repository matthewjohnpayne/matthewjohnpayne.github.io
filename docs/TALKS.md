# Adding talks to the Talks page

The Talks page (`/talks/`) lists talks newest first, grouped by year. Each talk is one YAML file in `src/content/talks/`, named `YYYY-MM-DD-short-name.yaml`; copy `_TEMPLATE.yaml`. The fields are checked by `src/content.config.ts`, and the build fails if a file does not match.

## 1. Keep the talk in Drive

Talk decks live in the MPC shared drive, in **Presentations, templates and MUG related content → MPC_Public**, one folder per talk named `YYYY_MM_DD_Event` (for example `2026_09_24_IAWN`). Use the full date. A folder named with only the year and month leaves the exact date unknown. Keep the abstract, if there is one, in the same folder.

Despite its name, MPC_Public is visible only to MPC staff. Talks by colleagues and internal decks (program reviews, NASA division-office updates, team meetings, board briefings) are also kept there, so nothing in it is public by default.

## 2. Decide whether it belongs on the site

Include talks Matthew gave at conferences and workshops, colloquia and seminars, agency and network meetings (IAWN, SMPAG, PDS, NASA program meetings), teaching and outreach, and testimony. Also include talks colleagues gave on work Matthew co-authored, with `presenter:` set.

Leave out internal briefings and anything with budgets, award amounts, staffing or personnel details, or committee membership.

## 3. Make a public copy of the slides (optional)

Do not link the working deck itself:

- Google Slides shows speaker notes to anyone who can view the deck.
- PowerPoint and Keynote files carry their notes with them.

Instead:

1. Open the deck and check it: no budgets, staff names with roles, or personal information, and no film or TV clips or other copyrighted media. Delete those slides from a copy if needed.
2. **File → Download → PDF document**. A PDF exported this way does not include speaker notes.
3. Upload the PDF to the public talks folder (**Website_Talks_Public** in Matthew's own Google Drive, shared as *Anyone with the link: Viewer*). Name it like the Drive folder: `2026_09_24_IAWN.pdf`.
4. Copy its link: **Share → Copy link**. It looks like `https://drive.google.com/file/d/<id>/view`.

A recording can go in the same folder and be linked in the same way.

## 4. Add the record

```yaml
title: "Minor Planet Center report"
date: "2026-09-24"
event: "International Asteroid Warning Network (IAWN) meeting"
kind: agency            # conference | colloquium | agency | teaching | outreach | testimony
materials:
  - label: "Slides (PDF)"
    url: "https://drive.google.com/file/d/<id>/view"
source: "Google Drive, MPC_Public/2026_09_24_IAWN"
```

- Use the title on the title slide, in sentence case.
- Name the event in full the first time it appears, e.g. "International Asteroid Warning Network (IAWN) meeting".
- `location` is optional. Add `note:` for things like "Recorded talk." or "With Federica Spoto."
- Link only material that is public: an official record (for testimony, the committee's hearing page) or a public PDF from step 3.
- Before linking a Drive file, check that it opens in a private browser window.

## 5. Publish

`npm run build`, check `/talks/` locally, commit, and push with Matthew's go-ahead.

## Older talks

The page currently covers 2022 onwards, from MPC_Public. To add older talks, look in:

- older Drive folders (Matthew's own "MPC Presentations" and "Internal Presentations" folders, and MUG_Related);
- conference programmes and abstract books, including ADS-indexed abstracts (`author:"Payne, M" property:notrefereed`, where talk abstracts appear as AAS, DPS and ACM entries);
- colloquium listings at institutions where Matthew has spoken.

Record where each detail came from in `source`.
