// Replaces the numbers baked in at build time with the latest summary, when the API answers.
// If it doesn't, or it has nothing newer, the page keeps the build-time numbers.
import { fetchSummary, summarise, fmt } from './summary.js';

export async function refreshMpcStats() {
  const panels = document.querySelectorAll('[data-mpc-stats]');
  if (!panels.length) return;
  let stats;
  try { stats = summarise(await fetchSummary()); } catch { return; }
  for (const panel of panels) {
    if (new Date(stats.cutoff) <= new Date(panel.dataset.cutoff)) continue;
    for (const it of stats.items) {
      const stat = panel.querySelector(`[data-stat="${it.key}"]`);
      if (!stat) continue;
      stat.querySelector('.mpc-stat-value').textContent = fmt(it.value);
      stat.querySelector('.mpc-stat-note').textContent = it.note;
    }
    panel.querySelector('[data-as-of]').textContent = stats.asOf;
    panel.dataset.cutoff = stats.cutoff;
  }
}
