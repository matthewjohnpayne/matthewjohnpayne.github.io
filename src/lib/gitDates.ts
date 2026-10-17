// Date of the latest commit touching any of the given paths, from git at build time.
// The deploy workflow checks out the full history (fetch-depth: 0) so this is correct on
// GitHub Actions; with no git, or a path never committed, it returns undefined.
// @ts-expect-error -- @types/node is not a dependency; this runs only in Node at build time.
import { execFileSync } from 'node:child_process';

const cache = new Map<string, string | undefined>();

export function lastCommitDate(paths: string[]): string | undefined {
  const key = paths.join('\0');
  if (!cache.has(key)) {
    let date: string | undefined;
    try {
      date = execFileSync('git', ['log', '-1', '--format=%cs', '--', ...paths], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || undefined;
    } catch { date = undefined; }
    cache.set(key, date);
  }
  return cache.get(key);
}
