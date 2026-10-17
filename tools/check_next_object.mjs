#!/usr/bin/env node
// Is an Object of the Month ready for next month? Reads the front matter of every record in
// src/content/objects/ and reports whether one has `month` equal to next month (UTC) and
// `reviewed: true`. Used by .github/workflows/object-reminder.yml to open a reminder issue.
//
//   node tools/check_next_object.mjs            # prints a summary; exit 0 if ready, 1 if not
//   node tools/check_next_object.mjs 2026-12    # check a given month instead
import { readdirSync, readFileSync } from 'node:fs';

const dir = new URL('../src/content/objects/', import.meta.url);
const now = new Date();
const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
const month = process.argv[2] || next.toISOString().slice(0, 7);

const records = readdirSync(dir).filter((f) => f.endsWith('.md') && !f.startsWith('_')).map((f) => {
  const fm = readFileSync(new URL(f, dir), 'utf8').split(/^---\s*$/m)[1] || '';
  const field = (k) => (fm.match(new RegExp(`^${k}:\\s*"?([^"\\n#]*)"?`, 'm')) || [])[1]?.trim();
  return { file: f, name: field('name'), month: field('month'), reviewed: field('reviewed') === 'true' };
});
const forMonth = records.filter((r) => r.month === month);
const ready = forMonth.filter((r) => r.reviewed);

if (ready.length) {
  console.log(`Ready for ${month}: ${ready.map((r) => r.name).join(', ')}`);
  process.exit(0);
}
console.log(forMonth.length
  ? `Not yet reviewed for ${month}: ${forMonth.map((r) => `${r.name} (src/content/objects/${r.file})`).join(', ')}. Set reviewed: true once the text is approved.`
  : `No Object of the Month is queued for ${month}. Copy src/content/objects/_TEMPLATE.md, then run tools/export_object_orbits.py.`);
process.exit(1);
