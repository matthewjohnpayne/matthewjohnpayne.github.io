# Validating the reference-frames integrator

The browser integrator (`src/scripts/frames/nbody.js`) is checked against REBOUND's IAS15
integrator, starting from the same initial conditions (`src/data/frames-ic.json`).

```bash
pip install rebound numpy
python reference.py ../../src/data/frames-ic.json 400 2 ref400.npz
python -c "import numpy as np; np.load('ref400.npz')['xyz'].astype('<f8').tofile('ref400.bin')"
node compare.mjs ../../src/data/frames-ic.json ref400.bin 0.5 400
node frames_test.mjs
```

Results on 2026-10-14 (epoch MJD 61200, 300 years, step 0.5 day): Earth–Kamoʻoalewa separation
agrees with IAS15 to 1.7e-7 AU (about 26 km); Earth–Sun to 1.7e-7 AU; Jupiter–Hektor to 8e-11 AU
and Jupiter–Hilda to 1.1e-10 AU (under 20 m).

Results on 2026-10-15 for the extended 400-year run (the page now integrates 400 years): Earth–Kamoʻoalewa
2.3e-7 AU (about 35 km); Jupiter–Hektor 1.6e-10 AU and Jupiter–Hilda 3.0e-10 AU (under 50 m). In both
integrations Kamoʻoalewa leaves the quasi-satellite state around 2330.

`frames_test.mjs` checks the frame transforms:
- Earth: pinned in the co-rotating frame; fitted mean motion equal to the sidereal year
  (365.2563 d); 2:1 epicycle in the synodic frame (0.0168 × 0.0336 AU); winding numbers of
  0 per year in non-rotating axes and −1 per year co-rotating.
- Jupiter: fitted period 11.862 yr; Hektor's longitude ahead of Jupiter librates between
  37° and 87° (mean 63°, in ecliptic projection); Hilda completes 1.502 orbits per Jupiter
  orbit; all 39 of Hilda's aphelia fall within 30° of L4, L3 or L5, 13 at each.

Re-run after changing the integrator, the step size, or the initial conditions.
