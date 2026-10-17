#!/usr/bin/env node
// Saves a snapshot of "Today at the MPC" (the newest Minor Planet Electronic Circulars and the
// number of objects on the NEO Confirmation Page) to src/data/mpc-today.json. The build uses it
// only if the MPC pages cannot be reached; each visitor's browser then fetches the live pages.
//
//   node tools/export_mpc_today.mjs
import { writeFileSync } from 'node:fs';
import { fetchMpcToday } from '../src/scripts/mpctoday/parse.js';

const out = new URL('../src/data/mpc-today.json', import.meta.url);
const today = await fetchMpcToday(30000);
writeFileSync(out, JSON.stringify(today, null, 1) + '\n');
console.log(`Wrote ${out.pathname}: ${today.mpecs.length} circulars (newest MPEC ${today.mpecs[0].id}), ${today.neocp.count} objects on the NEOCP`);
