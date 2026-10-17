// "Today at the MPC": the newest Minor Planet Electronic Circulars and the number of objects on
// the NEO Confirmation Page. Fetched from the MPC when the site is built; if that fails, the
// snapshot in src/data/mpc-today.json (tools/export_mpc_today.mjs) is used. Each viewer's browser
// then fetches the live pages (src/scripts/mpctoday/refresh.js).
import snapshot from '../data/mpc-today.json';
import { fetchMpcToday } from '../scripts/mpctoday/parse.js';

export type MpcToday = typeof snapshot & { fromSnapshot?: boolean };

let cached: Promise<MpcToday> | undefined;
async function latest(): Promise<MpcToday> {
  try {
    return await fetchMpcToday();
  } catch (err) {
    console.warn(`[mpcToday] using the snapshot in src/data/mpc-today.json (${(err as Error).message})`);
    return { ...snapshot, fromSnapshot: true };
  }
}

export function mpcToday() {
  return (cached ??= latest());
}
