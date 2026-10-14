# Validating the reference-frames integrator

The browser integrator (`src/scripts/frames/nbody.js`) is checked against REBOUND's IAS15
integrator, starting from the same initial conditions (`src/data/frames-ic.json`).

```bash
pip install rebound numpy
python reference.py ../../src/data/frames-ic.json 300 2 ref300.npz
python -c "import numpy as np; np.load('ref300.npz')['xyz'].astype('<f8').tofile('ref300.bin')"
node compare.mjs ../../src/data/frames-ic.json ref300.bin 0.5
node frames_test.mjs
```

Results on 2026-10-13 (epoch MJD 61200, 300 years, step 0.5 day): Earth–Kamoʻoalewa separation
agrees with IAS15 to 1.7e-7 AU (about 26 km); Earth–Sun to 1.7e-7 AU. `frames_test.mjs` checks
the frame transforms: Earth pinned in the co-rotating frame, the fitted mean motion equal to the
sidereal year, Earth's 2:1 epicycle in the synodic frame, and the winding numbers (0 per year in
non-rotating axes, −1 per year co-rotating).

Re-run after changing the integrator, the step size, or the initial conditions.
