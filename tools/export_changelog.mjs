#!/usr/bin/env node
// Writes src/data/changelog.json, the site's change log, from the git history: one entry per
// commit (date, subject, short hash), newest first, grouped by month. Commit subjects are already
// public on GitHub; bodies are not used. The deploy workflow runs this before each build, with the
// full history checked out, so the published log is always current.
//
//     node tools/export_changelog.mjs
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../src/data/changelog.json', import.meta.url));
const SKIP = [/^Initial commit$/];   // the empty placeholder repository from 2025
// Routine commits by the scheduled workflows (data refreshes, publication updates, the CV PDF)
// are left out; the changelog records changes made by people.
const BOT = 'github-actions[bot]';

const log = execFileSync('git', ['log', '--no-merges', '--format=%cs%x09%h%x09%an%x09%s'], { encoding: 'utf8' });
const months = [];
for (const line of log.trim().split('\n')) {
  const [date, hash, author, subject] = line.split('\t');
  if (!subject || author === BOT || SKIP.some((re) => re.test(subject))) continue;
  const month = date.slice(0, 7);
  if (months.at(-1)?.month !== month) months.push({ month, entries: [] });
  months.at(-1).entries.push({ date, hash, subject });
}
writeFileSync(OUT, JSON.stringify({ generated: new Date().toISOString().slice(0, 10), months }, null, 1) + '\n');
console.log(`Wrote ${OUT}: ${months.reduce((n, m) => n + m.entries.length, 0)} entries in ${months.length} months`);
