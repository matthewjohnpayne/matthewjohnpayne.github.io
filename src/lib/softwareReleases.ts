// Latest PyPI release of each package on the Software pages. Fetched from PyPI when the site is
// built; if that fails, the snapshot in src/data/software-releases.json
// (tools/export_software_releases.mjs) is used. Each visitor's browser then checks PyPI again
// (src/scripts/releases/refresh.js).
import snapshot from '../data/software-releases.json';
import { fetchRelease } from '../scripts/releases/pypi.js';

export type Release = { pkg: string; version: string; date: string; url: string; fromSnapshot?: boolean };
const cache = new Map<string, Promise<Release | undefined>>();
const saved = snapshot.releases as Record<string, Release>;

export function latestRelease(pkg: string) {
  if (!cache.has(pkg)) {
    cache.set(pkg, fetchRelease(pkg).catch((err: Error) => {
      console.warn(`[releases] ${pkg}: using the snapshot in src/data/software-releases.json (${err.message})`);
      return saved[pkg] ? { ...saved[pkg], fromSnapshot: true } : undefined;
    }));
  }
  return cache.get(pkg)!;
}
