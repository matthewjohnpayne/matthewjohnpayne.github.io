// Replaces the release baked in at build time with PyPI's latest, fetched by the visitor's browser.
// Results are kept for an hour in sessionStorage; on any failure the build-time release stays.
import { fetchRelease, longDate } from './pypi.js';

const TTL = 3600e3;
async function cached(pkg) {
  const key = `pypi:${pkg}`;
  try {
    const hit = JSON.parse(sessionStorage.getItem(key) || 'null');
    if (hit && Date.now() - hit.t < TTL) return hit.rel;
  } catch {}
  const rel = await fetchRelease(pkg, 8000);
  try { sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), rel })); } catch {}
  return rel;
}

export async function refreshReleases() {
  for (const el of document.querySelectorAll('[data-pypi]')) {
    let rel;
    try { rel = await cached(el.dataset.pypi); } catch { continue; }
    const link = el.querySelector('[data-rel-link]');
    link.textContent = `v${rel.version}`;
    link.href = rel.url;
    const time = el.querySelector('time');
    time.dateTime = rel.date;
    time.textContent = longDate(rel.date);
    el.querySelector('[data-rel-src]').textContent = 'PyPI, checked just now by your browser';
  }
}
