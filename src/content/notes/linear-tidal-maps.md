---
title: "Six integrations for an all-sky map"
date: "2026-10-16"
tags: [planet-nine, numerical-methods]
summary: "The tidal pull of a distant planet is linear in a symmetric tensor, so six basis integrations give the signal for every direction and mass."
status: draft
source: "Holman & Payne (2016) Eq. 7; science-notebooks notebooks/cassini_planet9/cassini.py (BASIS, tensor_coeffs, responses, signature)."
---

A distant planet of mass M at distance r_X, in direction **n**, pulls on Saturn with a tidal acceleration

**F** = (G M / r_X³) [**ρ** − 3 (**ρ**·**n**) **n**] = (G M / r_X³) T **ρ**, with T = I − 3 **n** **n**ᵀ.

T is a symmetric 3 × 3 matrix, so it is a combination of six fixed basis matrices. The linearised Encke equation for Saturn's displacement is linear in **F**, and so is everything computed from it: the change in the Earth–Saturn range, and what is left after removing the part a change of Saturn's starting orbit could absorb.

So integrate the displacement six times, once for each basis matrix, and the range signature for any direction and any strength M/r_X³ is a weighted sum of those six, with weights read off T. An all-sky map needs no further integrations. The [Cassini page](/teaching/cassini-planet-nine/) uses exactly these six precomputed responses in the browser.
