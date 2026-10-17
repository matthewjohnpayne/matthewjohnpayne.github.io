// When each science notebook last changed: the newest commit touching notebooks/<name>/ in
// matthewjohnpayne/science-notebooks, from the GitHub REST API (cross-origin requests allowed).
// Unauthenticated requests are limited to 60 an hour per IP address, so the browser asks only
// when the cards come into view, caches answers for an hour and stops when the quota runs low.
export const REPO = 'matthewjohnpayne/science-notebooks';
export const notebookFolder = (url) => (url.match(/science-notebooks\/blob\/[^/]+\/notebooks\/([^/]+)\//) || [])[1];

// Returns { date: 'YYYY-MM-DD', url, remaining } (remaining: the API quota left, if reported).
/** @param {string} folder @param {{ token?: string, timeoutMs?: number }} [opts] */
export async function lastCommit(folder, { token, timeoutMs = 10000 } = {}) {
  const headers = { Accept: 'application/vnd.github+json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(`https://api.github.com/repos/${REPO}/commits?path=notebooks/${encodeURIComponent(folder)}&per_page=1`,
    { headers, signal: AbortSignal.timeout(timeoutMs) });
  const remaining = Number(r.headers.get('x-ratelimit-remaining') ?? NaN);
  if (!r.ok) throw Object.assign(new Error(`GitHub ${folder}: HTTP ${r.status}`), { remaining });
  const [c] = await r.json();
  if (!c) throw Object.assign(new Error(`GitHub ${folder}: no commits`), { remaining });
  return { date: c.commit.committer.date.slice(0, 10), url: c.html_url, remaining };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const shortDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };
