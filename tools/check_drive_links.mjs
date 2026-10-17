#!/usr/bin/env node
// Checks that every Google Drive link on the built site is public. A file or folder that is not
// shared with "Anyone with the link" redirects to a Google sign-in page, which ordinary link
// checkers count as success. Run after `npm run build`; the weekly links workflow uses it.
//
//   node tools/check_drive_links.mjs [dist]
// Exit 0: all public. Exit 1: problems (printed as a Markdown list).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2] || 'dist';
const files = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.html')) files.push(p);
  }
})(root);

const links = new Map();   // url -> first page it appears on
for (const f of files) {
  for (const m of readFileSync(f, 'utf8').matchAll(/https:\/\/drive\.google\.com\/(?:file\/d|drive\/folders)\/[\w-]+[^"'<\s]*/g)) {
    if (!links.has(m[0])) links.set(m[0], f.slice(root.length) || '/');
  }
}

const problems = [];
for (const [url, page] of links) {
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(30000), headers: { 'User-Agent': 'Mozilla/5.0 (link check)' } });
    const text = await res.text();
    const title = (text.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
    if (!res.ok) problems.push(`- ${url} (on ${page}): HTTP ${res.status}`);
    else if (/accounts\.google\.com/.test(res.url) || !/ - Google Drive$/.test(title.trim())) problems.push(`- ${url} (on ${page}): not public (opens a sign-in page)`);
  } catch (err) {
    problems.push(`- ${url} (on ${page}): ${err.message}`);
  }
}
if (problems.length) {
  console.log(`Google Drive links that are missing or not shared publicly (${problems.length} of ${links.size}):\n`);
  console.log(problems.join('\n'));
  process.exit(1);
}
console.log(`All ${links.size} Google Drive links are public.`);
