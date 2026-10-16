// Headline numbers for the Minor Planet Center, from the MPC Summary API
// (https://docs.minorplanetcenter.net/mpc-ops-docs/apis/summary). The latest summary is fetched
// when the site is built; if that fails, the snapshot in src/data/mpc-stats.json is used.
// Each viewer's browser then asks the API again (src/scripts/mpcstats/refresh.js).
import snapshot from '../data/mpc-stats.json';
import { fetchSummary, summarise } from '../scripts/mpcstats/summary.js';

export const SUMMARY_DOCS = 'https://docs.minorplanetcenter.net/mpc-ops-docs/apis/summary/';

let cached: Promise<ReturnType<typeof summarise>> | undefined;
async function latest() {
  try {
    return summarise(await fetchSummary());
  } catch (err) {
    console.warn(`[mpcStats] using the snapshot in src/data/mpc-stats.json (${(err as Error).message})`);
    return summarise(snapshot);
  }
}

export function mpcStats() {
  return (cached ??= latest());
}
