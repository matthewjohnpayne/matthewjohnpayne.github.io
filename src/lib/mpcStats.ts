// Headline numbers for the Minor Planet Center, from the MPC Summary API
// (https://docs.minorplanetcenter.net/mpc-ops-docs/apis/summary). The latest summary is fetched
// when the site is built; if that fails, the snapshot in src/data/mpc-stats.json is used.
import snapshot from '../data/mpc-stats.json';

type Summary = typeof snapshot;
export const SUMMARY_DOCS = 'https://docs.minorplanetcenter.net/mpc-ops-docs/apis/summary/';
const API = 'https://data.minorplanetcenter.net/api/summary/overall';

let cached: Promise<Summary> | undefined;
async function latest(): Promise<Summary> {
  try {
    const res = await fetch(API, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ limit: 1 }),
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const s = (await res.json()).summaries?.[0];
    if (!s || typeof s.obs_published !== 'number' || typeof s.orbit_type_counts?.Apollo?.numbered !== 'number') throw new Error('unexpected response');
    return s;
  } catch (err) {
    console.warn(`[mpcStats] using the snapshot in src/data/mpc-stats.json (${(err as Error).message})`);
    return snapshot;
  }
}

export async function mpcStats() {
  const s = await (cached ??= latest());
  const both = (c: { numbered: number; unnumbered: number }) => c.numbered + c.unnumbered;
  const o = s.orbit_type_counts, t = s.object_type_counts;
  const neos = ['Atira', 'Aten', 'Apollo', 'Amor'].reduce((n, k) => n + both(o[k as keyof typeof o]), 0);
  const comets = both(t['Comet']) + both(t['Comet Fragment']);
  const asOf = new Date(s.cutoff_time).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  return {
    asOf,
    items: [
      { value: s.obs_published, label: 'observations published', note: 'measured positions of asteroids, comets and satellites' },
      { value: both(t['Minor Planet']), label: 'minor planets with designations', note: `${t['Minor Planet'].numbered.toLocaleString('en-US')} of them numbered` },
      { value: neos, label: 'near-Earth objects', note: 'Atiras, Atens, Apollos and Amors' },
      { value: comets, label: 'comets', note: 'including fragments' },
      { value: s.obscodes, label: 'observatory codes', note: 'observing sites on the ground and in space' },
      { value: s.mpec_counts.total, label: 'Minor Planet Electronic Circulars', note: 'announcements of discoveries, orbits and identifications' }
    ]
  };
}
