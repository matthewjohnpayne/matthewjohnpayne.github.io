# Updating the students and postdocs list

The People page links each former student or postdoc to a page about them, and may note where they are now. People move, so this is worth repeating every year or so. This note records how to do it well. The records are in `src/content/people/`, one YAML file per person; see `AGENTS.md` for the field rules.

## What to link, in order of preference

1. A page at their **current** institution: a department, lab or institutional profile.
2. Their own professional website.
3. An older institutional page.
4. LinkedIn, ORCID or a professional directory (such as Doximity for physicians), as a last resort.

Some people have left astronomy (for example, for medicine); the same order applies in their new field. Prefer a page about the person to a paper by them.

## Rules

- **Identity first.** Only use a page if it is clearly the same person: matching field, institutions, timeline, or co-authorship with Matthew. Common names (two or three people with the same name in the same field) need positive evidence, not a plausible guess. If in doubt, leave the person unlinked and ask Matthew.
- **Names.** People may now publish under a different name. Use the name they use now, and do not publish an earlier name. Confirm such changes with Matthew before publishing.
- **Privacy.** No phone numbers, home addresses, personal email addresses or other private details. Positions and professional pages only.
- **Currency.** Check that a page is current, not just that it loads: compare its stated title with their newest ADS affiliation, and look for dates. Old pages often rank highest in search results.
- **Record sources.** Add what you found, and when, to the record's `source` field, e.g. "current position from their CfA profile, checked 2026-10-14".

## Search methods that work

These were the most productive in the October 2026 search:

1. **NASA ADS first.** Query `author:"Last, First"` sorted by date (newest first), and print each paper's affiliation for that author. Add `author:"Payne, M"` to confirm a shared paper. The `orcid_pub` field ties old and new papers to one person. An anonymous ADS token comes from `curl -s https://api.adsabs.harvard.edu/v1/accounts/bootstrap`.
2. **ORCID's public API.** Search `https://pub.orcid.org/v3.0/expanded-search/?q=family-name:X AND given-names:Y`, then read the record's employment, education and personal website.
3. **An ORCID's full publication list in ADS** (`orcid:XXXX-XXXX-XXXX-XXXX`, oldest first) shows a person's whole career, including any name change.
4. **Search for the institution, not just the name.** Web searches on a name alone often return nothing useful. Add the institution or topic found in ADS (for example "Excellence Fellow Université Côte d'Azur").
5. **DuckDuckGo's HTML endpoint** (`https://html.duckduckgo.com/html/?q=...`) is good for name-only searches, including LinkedIn and directory pages. It rate-limits after about ten queries, so space them out.
6. **Lab and department listing pages** (graduate students, postdocs, faculty) often lead to individual profiles that search engines miss.
7. **Expect bot blocking.** Some real pages return 403 or a Cloudflare check to scripts (several universities, and some CfA pages). Record these as "exists but blocked to scripts", and check them in a browser. On cfa.harvard.edu, 403 rather than 404 can mean an unpublished page; do not link those.

## Last full check

2026-10-14. Two people could not be identified with confidence, and one name change needed Matthew's confirmation; see the git history of `src/content/people/` for what was changed.
