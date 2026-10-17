// Latest release of a Python package, from the PyPI JSON API (https://docs.pypi.org/api/json/).
// PyPI answers cross-origin requests from any site and has no per-visitor rate limit, so the same
// code runs at build time (src/lib/softwareReleases.ts, tools/export_software_releases.mjs) and in
// the visitor's browser (refresh.js).
export const pypiProject = (pkg) => `https://pypi.org/project/${encodeURIComponent(pkg)}/`;

export async function fetchRelease(pkg, timeoutMs = 10000) {
  const r = await fetch(`https://pypi.org/pypi/${encodeURIComponent(pkg)}/json`, { signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) throw new Error(`PyPI ${pkg}: HTTP ${r.status}`);
  const d = await r.json();
  const version = d.info.version;
  // The release date is the earliest upload of the files for that version.
  const files = d.releases?.[version] ?? d.urls ?? [];
  const times = files.map((f) => f.upload_time_iso_8601).filter(Boolean).sort();
  if (!version || !times.length) throw new Error(`PyPI ${pkg}: no release files`);
  return { pkg, version, date: times[0].slice(0, 10), url: `${pypiProject(pkg)}${encodeURIComponent(version)}/` };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const longDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };
