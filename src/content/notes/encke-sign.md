---
title: "A sign to watch in Encke's method"
date: "2026-10-16"
tags: [orbits, numerical-methods, planet-nine]
summary: "Linearising the Encke equation gives −h Δr, not +h Δr; Holman & Payne (2016) print the plus sign."
status: draft
source: "arXiv 1604.03180 source, Eq. 4; science-notebooks notebooks/cassini_planet9/cassini.py docstring; derivation below."
---

Encke's method follows a small departure Δ**r** from a reference orbit **ρ** (here, Saturn's ephemeris), so that the true position is **r** = **ρ** + Δ**r**. Subtracting the two equations of motion gives

d²Δ**r**/dt² = μ (**ρ**/ρ³ − **r**/r³) + **F**.

Writing h = μ/ρ³ and <i>f</i><sub>q</sub> = 1 − ρ³/r³, the first term is exactly

μ (**ρ**/ρ³ − **r**/r³) = h (**ρ** − **r**) + h <i>f</i><sub>q</sub> **r** = h <i>f</i><sub>q</sub> **r** − h Δ**r**,

and to first order <i>f</i><sub>q</sub> ≈ 3 **ρ̂**·Δ**r**/ρ. So the linearised equation is

d²Δ**r**/dt² = −h [Δ**r** − 3 (**ρ̂**·Δ**r**) **ρ̂**] + **F**.

Equation 4 of [Holman & Payne (2016)](https://ui.adsabs.harvard.edu/abs/2016AJ....152...94H/abstract) prints the Δ**r** term with a plus sign. The [Cassini notebook](https://github.com/matthewjohnpayne/science-notebooks/blob/main/notebooks/cassini_planet9/cassini_planet9.ipynb) uses the minus sign, as above.
