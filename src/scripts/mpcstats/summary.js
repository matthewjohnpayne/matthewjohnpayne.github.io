// Turns one summary from the MPC Summary API
// (https://docs.minorplanetcenter.net/mpc-ops-docs/apis/summary) into the six headline numbers.
// Shared by the build (src/lib/mpcStats.ts) and the browser (refresh.js).
export const API = 'https://data.minorplanetcenter.net/api/summary/overall';

export async function fetchSummary(timeoutMs = 10000) {
  const res = await fetch(API, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ limit: 1 }),
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const s = (await res.json()).summaries?.[0];
  if (!s || typeof s.obs_published !== 'number' || typeof s.orbit_type_counts?.Apollo?.numbered !== 'number') throw new Error('unexpected response');
  return s;
}

const fmt = (n) => n.toLocaleString('en-US');

export function summarise(s) {
  const both = (c) => c.numbered + c.unnumbered;
  const o = s.orbit_type_counts, t = s.object_type_counts;
  const neos = ['Atira', 'Aten', 'Apollo', 'Amor'].reduce((n, k) => n + both(o[k]), 0);
  const comets = both(t['Comet']) + both(t['Comet Fragment']);
  const asOf = new Date(s.cutoff_time).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  return {
    asOf,
    cutoff: s.cutoff_time,
    items: [
      { key: 'obs', value: s.obs_published, label: 'observations published', note: 'measured positions of asteroids, comets and satellites' },
      { key: 'mp', value: both(t['Minor Planet']), label: 'minor planets with designations', note: `${fmt(t['Minor Planet'].numbered)} of them numbered` },
      { key: 'neo', value: neos, label: 'near-Earth objects', note: 'Atiras, Atens, Apollos and Amors' },
      { key: 'comet', value: comets, label: 'comets', note: 'including fragments' },
      { key: 'obscode', value: s.obscodes, label: 'observatory codes', note: 'observing sites on the ground and in space' },
      { key: 'mpec', value: s.mpec_counts.total, label: 'Minor Planet Electronic Circulars', note: 'announcements of discoveries, orbits and identifications' }
    ]
  };
}
export { fmt };
