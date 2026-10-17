// Updates the "Notebook updated" dates on the Teaching page from GitHub once the science-notebook
// cards scroll into view. Answers are cached for an hour; requests stop if GitHub's quota for this
// visitor runs low, and the build-time dates stay wherever a request fails.
import { lastCommit, shortDate } from './commits.js';

const TTL = 3600e3;
const MIN_QUOTA = 10;

async function cached(folder) {
  const key = `nbcommit:${folder}`;
  try {
    const hit = JSON.parse(sessionStorage.getItem(key) || 'null');
    if (hit && Date.now() - hit.t < TTL) return hit.v;
  } catch {}
  const v = await lastCommit(folder, { timeoutMs: 8000 });
  try { sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), v })); } catch {}
  return v;
}

export function refreshNotebookDates() {
  const group = document.querySelector('[data-nb-dates]');
  if (!group) return;
  const status = group.querySelector('[data-nb-status]');
  const run = async () => {
    let updated = 0, failed = 0;
    for (const el of group.querySelectorAll('[data-nb-folder]')) {
      try {
        const v = await cached(el.dataset.nbFolder);
        const t = el.querySelector('time');
        t.dateTime = v.date;
        t.textContent = shortDate(v.date);
        el.querySelector('a').href = v.url;
        updated++;
        if (v.remaining < MIN_QUOTA) break;
      } catch { failed++; break; }
    }
    if (updated && !failed) status.textContent = 'Dates of the last change to each notebook, checked just now by your browser on GitHub.';
    else if (updated) status.textContent = 'Some dates were checked just now on GitHub; the others are from when the site was built.';
  };
  if (!('IntersectionObserver' in window)) { run(); return; }
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) { io.disconnect(); run(); }
  });
  io.observe(group);
}
