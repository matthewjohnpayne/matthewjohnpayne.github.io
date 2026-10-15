# Updating the CV

The CV has one master copy, `src/data/cv.json`. Both the web page (`/cv/`) and the PDF (`/cv/Matthew_Payne_CV.pdf`) are generated from it, together with three sections drawn from the rest of the site:

- **Publications:** counts and the ten most recent first-author papers, from `src/content/publications/` (NASA ADS; refresh with `tools/fetch_publications.py`).
- **Recent talks:** the ten most recent talks Matthew gave, from `src/content/talks/` (see `docs/TALKS.md`).
- **Students and postdocs:** from `src/content/people/` (see `docs/UPDATING_PEOPLE.md`).

Updating those records updates the CV automatically. The shared logic is in `src/lib/cv.ts`.

## To update the CV

1. Edit `src/data/cv.json`: appointments, education, grants, service and skills. Set `updated` to today's date.
2. Rebuild the PDF: `tools/build_cv_pdf.sh`. This builds the site, which writes `dist/cv/matthew-payne-cv.tex` from the same sources. It then compiles that file with `latexmk` and copies the result to `public/cv/Matthew_Payne_CV.pdf`. It needs Node and a TeX installation; on Matthew's Mac, TeX is in `/Library/TeX/texbin`.
3. Check `/cv/` and the PDF locally.
4. Commit `src/data/cv.json` and `public/cv/Matthew_Payne_CV.pdf` together, and push with Matthew's go-ahead.

Rebuild the PDF whenever the publications, talks or people change too, so the PDF matches the page.

## Overleaf

`dist/cv/matthew-payne-cv.tex` is self-contained, using only standard packages, so it can be uploaded to an Overleaf project. It is also published at `/cv/matthew-payne-cv.tex`. Treat it as generated output: if you edit it on Overleaf, carry the change back into `src/data/cv.json`, or it will be overwritten the next time the CV is rebuilt. Other versions of the CV (for proposals, with phone numbers or a different selection of grants) can live on Overleaf as separate documents.

## What never goes on the public CV

Phone numbers, home addresses, personal email, date of birth and immigration status. Grant amounts are allowed (Matthew, 2026-10-15).

## Sources

Built on 2026-10-15 from Matthew's CVs of 2021 and 2024; appointment dates confirmed by Matthew on 2026-10-15. Where the two CVs differ on grant dates, the 2024 CV's dates are used. The 2021 CV's additional grants are included. Amounts are rounded to whole dollars.
