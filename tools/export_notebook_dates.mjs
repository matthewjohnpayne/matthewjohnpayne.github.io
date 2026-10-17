#!/usr/bin/env node
// Saves the date of the last commit to each science notebook (the folders named in the
// science-notebooks URLs of src/content/tutorials/) to src/data/notebook-dates.json. The build
// uses it only if GitHub cannot be reached. Set GITHUB_TOKEN to avoid the anonymous rate limit.
//
//   node tools/export_notebook_dates.mjs
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { lastCommit, notebookFolder } from '../src/scripts/notebooks/commits.js';

const dir = new URL('../src/content/tutorials/', import.meta.url);
const folders = [...new Set(readdirSync(dir).filter((f) => f.endsWith('.yaml') && !f.startsWith('_'))
  .map((f) => notebookFolder((readFileSync(new URL(f, dir), 'utf8').match(/^url:\s*"?(\S+?)"?\s*$/m) || [])[1] || ''))
  .filter(Boolean))].sort();
const notebooks = {};
for (const folder of folders) {
  const { date, url } = await lastCommit(folder, { token: process.env.GITHUB_TOKEN, timeoutMs: 30000 });
  notebooks[folder] = { date, url };
}
const out = new URL('../src/data/notebook-dates.json', import.meta.url);
writeFileSync(out, JSON.stringify({ fetched: new Date().toISOString().slice(0, 10), notebooks }, null, 1) + '\n');
console.log(`Wrote ${out.pathname}: ${folders.length} notebooks`);
