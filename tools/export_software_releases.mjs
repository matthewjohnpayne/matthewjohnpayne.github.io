#!/usr/bin/env node
// Saves the latest PyPI release of every package named by `pypi:` in src/content/software/ to
// src/data/software-releases.json. The build uses it only if PyPI cannot be reached; each
// visitor's browser then checks PyPI itself.
//
//   node tools/export_software_releases.mjs
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fetchRelease } from '../src/scripts/releases/pypi.js';

const dir = new URL('../src/content/software/', import.meta.url);
const pkgs = readdirSync(dir).filter((f) => f.endsWith('.yaml') && !f.startsWith('_'))
  .map((f) => (readFileSync(new URL(f, dir), 'utf8').match(/^pypi:\s*"?([\w.-]+)"?/m) || [])[1]).filter(Boolean);
const releases = {};
for (const pkg of pkgs) releases[pkg] = await fetchRelease(pkg, 30000);
const out = new URL('../src/data/software-releases.json', import.meta.url);
writeFileSync(out, JSON.stringify({ fetched: new Date().toISOString().slice(0, 10), releases }, null, 1) + '\n');
console.log(`Wrote ${out.pathname}: ${Object.values(releases).map((r) => `${r.pkg} ${r.version} (${r.date})`).join(', ')}`);
