#!/usr/bin/env node
// Saves the latest MPC Summary API response to src/data/mpc-stats.json, the snapshot that "MPC at
// a glance" falls back on when the API cannot be reached at build time (src/lib/mpcStats.ts).
// The data-refresh workflow runs this monthly.
//
//   node tools/export_mpc_stats.mjs
import { writeFileSync } from 'node:fs';
import { fetchSummary, summarise } from '../src/scripts/mpcstats/summary.js';

const out = new URL('../src/data/mpc-stats.json', import.meta.url);
const s = await fetchSummary(30000);
summarise(s);   // throws if the response no longer has the fields the site uses
writeFileSync(out, JSON.stringify(s, null, 2) + '\n');
console.log(`Wrote ${out.pathname}: summary to ${s.cutoff_time}`);
