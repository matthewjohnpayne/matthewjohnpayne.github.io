#!/usr/bin/env bash
# Build the CV PDF: generate the LaTeX with the site build, compile it, and copy
# the PDF to public/cv/ so the next build (and the deploy) serves it.
#   tools/build_cv_pdf.sh
# Needs Node (see docs/CONTEXT.md) and a TeX installation with latexmk.
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build >/dev/null
work=$(mktemp -d)
cp dist/cv/matthew-payne-cv.tex "$work/"
(cd "$work" && latexmk -pdf -interaction=nonstopmode -halt-on-error matthew-payne-cv.tex >/dev/null)
mkdir -p public/cv
cp "$work/matthew-payne-cv.pdf" public/cv/Matthew_Payne_CV.pdf
npm run build >/dev/null
echo "Wrote public/cv/Matthew_Payne_CV.pdf ($(du -h public/cv/Matthew_Payne_CV.pdf | cut -f1))"
rm -rf "$work"
