---
# Copy to <name>.md (lower case, no spaces); files starting with "_" are ignored.
# Then run: python3 tools/export_object_orbits.py <name>   (writes src/data/objects/<name>.json)
name: "(NNNNNN) Name"            # as the MPC writes it
designation: "NNNNNN"            # passed to the MPC Orbits API
month: "YYYY-MM"                 # the month it is featured
summary: "One or two sentences for the teasers."
view: heliocentric               # or earth-corotating, for Earth co-orbitals; or, with figures computed once by
                                 # tools/export_object_figures.py <name>: outer-resonance (add resonance: [p, q]),
                                 # hyperbolic (interstellar objects) or earth-capture (minimoons)
related:                         # pages, notebooks and tutorials on this site or elsewhere
  - label: ""
    href: ""
papers: []                       # bibcodes of Matthew's papers about the object
sources:                         # every factual claim in the text must come from one of these
  - label: ""
    url: ""
reviewed: false                  # true once Matthew has approved the text
---

The essay, in Markdown, citing a source inline for each claim.
