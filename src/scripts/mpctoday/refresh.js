// Replaces the circulars and NEOCP count baked in at build time with the live MPC pages.
// If the MPC cannot be reached, the build-time figures stay and the status line says so.
import { fetchMpcToday, fmtDate, fmtTime } from './parse.js';

export async function refreshMpcToday() {
  const panels = document.querySelectorAll('[data-mpc-today]');
  if (!panels.length) return;
  let today;
  try { today = await fetchMpcToday(); } catch {
    for (const panel of panels) panel.querySelector('[data-today-status]').textContent = panel.dataset.offlineText;
    return;
  }
  for (const panel of panels) {
    const list = panel.querySelector('[data-mpec-list]');
    const items = today.mpecs.map((m) => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = m.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.textContent = `MPEC ${m.id}`;
      const subject = document.createElement('span');
      subject.className = 'mpc-today-subject'; subject.textContent = m.subject;
      const date = document.createElement('time');
      date.dateTime = m.date; date.textContent = fmtDate(m.date + 'T00:00:00Z');
      li.append(a, subject, date);
      return li;
    });
    list.replaceChildren(...items);
    panel.querySelector('[data-neocp-count]').textContent = today.neocp.count.toLocaleString('en-US');
    panel.querySelector('[data-neocp-updated]').textContent = fmtTime(today.neocp.updated);
    panel.querySelector('[data-today-status]').textContent = `Live from the MPC, fetched by your browser on ${fmtTime(today.fetched)}.`;
  }
}
