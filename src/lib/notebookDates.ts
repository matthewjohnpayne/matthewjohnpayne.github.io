// When each science notebook last changed, for the Explore & learn page (/explore/). Fetched from GitHub when the
// site is built (with GITHUB_TOKEN if set, as in GitHub Actions, to avoid the anonymous rate
// limit); if that fails, the snapshot in src/data/notebook-dates.json
// (tools/export_notebook_dates.mjs) is used. The browser then checks GitHub again
// (src/scripts/notebooks/refresh.js).
import snapshot from '../data/notebook-dates.json';
import { lastCommit } from '../scripts/notebooks/commits.js';

export type NotebookDate = { date: string; url: string; fromSnapshot?: boolean };
const cache = new Map<string, Promise<NotebookDate | undefined>>();
const saved = snapshot.notebooks as Record<string, NotebookDate>;

export function notebookDate(folder: string) {
  if (!cache.has(folder)) {
    cache.set(folder, lastCommit(folder, { token: (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.GITHUB_TOKEN })
      .then(({ date, url }) => ({ date, url }))
      .catch((err: Error) => {
        console.warn(`[notebooks] ${folder}: using the snapshot in src/data/notebook-dates.json (${err.message})`);
        return saved[folder] ? { ...saved[folder], fromSnapshot: true } : undefined;
      }));
  }
  return cache.get(folder)!;
}
