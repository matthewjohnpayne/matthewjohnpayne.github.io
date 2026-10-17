#!/usr/bin/env node
// Open a GitHub issue for a maintenance task, in the standard format that docs/MAINTENANCE.md
// describes. Scheduled workflows use it whenever something needs Matthew's judgement or a local
// Claude session (label `claude-task`), or just his attention (label `maintenance`).
//
//   node tools/task_issue.mjs --title "New paper: 2026AJ....172..123P" \
//        --what "ADS lists a new refereed paper ..." --why "Assign a research theme ..." \
//        [--command 'claude "/new-paper 2026AJ....172..123P"'] [--label maintenance] [--dry-run]
//
// Needs the GitHub CLI (`gh`) with GH_TOKEN set (in Actions: ${{ github.token }}, with
// `issues: write`). An open issue with the same title is never duplicated. The label is created
// if it does not exist. Exit code 0 whether or not an issue was opened.
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const title = opt('title');
const what = opt('what');
const why = opt('why', '');
const command = opt('command', '');
const label = opt('label', command ? 'claude-task' : 'maintenance');
const dryRun = args.includes('--dry-run');
const repo = opt('repo', process.env.GITHUB_REPOSITORY || 'matthewjohnpayne/matthewjohnpayne.github.io');
if (!title || !what) {
  console.error('task_issue.mjs: --title and --what are required');
  process.exit(2);
}

const LABELS = {
  'claude-task': ['5319e7', 'A task to run in a local Claude Code session; the issue gives the command'],
  maintenance: ['c5def5', 'Something on the site needs attention']
};

const body = [
  `<!-- ${label} -->`,
  `**What happened:** ${what}`,
  why && `\n**Why it matters:** ${why}`,
  command && [
    '\n**To do it locally:**',
    '```bash',
    `cd ~/git_repos/ScientistWebsite && ${command}`,
    '```',
    'The command commits locally, closes this issue, and asks before pushing.'
  ].join('\n'),
  '\n<sub>Opened automatically; see docs/MAINTENANCE.md.</sub>'
].filter(Boolean).join('\n');

if (dryRun) {
  console.log(`[dry run] ${repo}: "${title}" [${label}]\n\n${body}`);
  process.exit(0);
}

const gh = (...a) => execFileSync('gh', a, { encoding: 'utf8' }).trim();
const open = JSON.parse(gh('issue', 'list', '--repo', repo, '--state', 'open', '--search', `"${title}" in:title`, '--json', 'number,title'));
const existing = open.find((i) => i.title === title);
if (existing) {
  console.log(`Already open: #${existing.number} ${title}`);
  process.exit(0);
}
const [color, description] = LABELS[label] || ['ededed', ''];
gh('label', 'create', label, '--repo', repo, '--color', color, '--description', description, '--force');
console.log(gh('issue', 'create', '--repo', repo, '--title', title, '--label', label, '--body', body));
