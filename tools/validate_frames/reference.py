import json, sys, time
import numpy as np, rebound
ic = json.load(open(sys.argv[1])); years = float(sys.argv[2]); dt_out = float(sys.argv[3])
sim = rebound.Simulation(); sim.G = 1.0   # GM values given directly in AU^3/day^2
for b in ic['bodies']:
    x,y,z,vx,vy,vz = b['state']; sim.add(m=b['gm'], x=x,y=y,z=z,vx=vx,vy=vy,vz=vz)
for p in ic['particles']:
    x,y,z,vx,vy,vz = p['state']; sim.add(m=0, x=x,y=y,z=z,vx=vx,vy=vy,vz=vz)
sim.N_active = len(ic['bodies']); sim.integrator = 'ias15'
times = np.arange(0, years*365.25 + 1e-9, dt_out)
keys = [b['key'] for b in ic['bodies']] + [p['key'] for p in ic['particles']]
out = np.zeros((len(times), len(keys), 3)); t0 = time.time()
for k, t in enumerate(times):
    sim.integrate(t, exact_finish_time=1)
    for i in range(len(keys)):
        p = sim.particles[i]; out[k, i] = (p.x, p.y, p.z)
np.savez(sys.argv[4], t=times, xyz=out, keys=np.array(keys))
print(f'{len(times)} outputs, {time.time()-t0:.1f}s')
