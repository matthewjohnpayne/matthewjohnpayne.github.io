// Reads two public MPC pages that allow cross-origin requests: the list of recent Minor Planet
// Electronic Circulars and the NEO Confirmation Page. Shared by the build (src/lib/mpcToday.ts),
// the snapshot script (tools/export_mpc_today.mjs) and the browser (refresh.js).
export const MPC = 'https://www.minorplanetcenter.net';
export const RECENT_MPECS = `${MPC}/mpec/RecentMPECs.html`;
export const NEOCP = `${MPC}/iau/NEO/toconfirm_tabular.html`;
export const N_MPECS = 6;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

async function get(url, timeoutMs) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.text();
}

const clean = (s) => s.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

/** The newest circulars: [{id: '2026-U25', date: '2026-10-17', subject, url}]. */
export function parseRecentMpecs(html, n = N_MPECS) {
  const re = /<li><a href="(\/mpec\/[^"]+)"><i>MPEC<\/i>\s*([0-9]{4}-[A-Z][0-9A-Z]+)<\/a>\s*\(([0-9]{4}) ([A-Za-z]+) ([0-9]{1,2})\)\s*<ul>\s*<li>([^<]*)/g;
  const out = [];
  for (const m of html.matchAll(re)) {
    const month = MONTHS.indexOf(m[4]) + 1;
    if (!month) continue;
    out.push({ id: m[2], date: `${m[3]}-${String(month).padStart(2, '0')}-${m[5].padStart(2, '0')}`, subject: clean(m[6]), url: MPC + m[1] });
    if (out.length === n) break;
  }
  if (!out.length) throw new Error('no circulars found in RecentMPECs.html');
  return out;
}

/** Objects on the NEO Confirmation Page, and when the MPC last updated it (ISO, UTC). */
export function parseNeocp(html, now = new Date()) {
  const count = (html.match(/name="obj"/gi) || []).length;
  // "Page last updated on Oct. 17.488 UTC." gives a month and a fractional day, but no year:
  // take the current year, or the previous one if that would put the update in the future.
  const m = html.match(/Page last updated on ([A-Z][a-z]{2})[a-z]*\.? ([0-9]{1,2}(?:\.[0-9]+)?) UTC/);
  if (!m) throw new Error('no update time found on the NEO Confirmation Page');
  const month = MONTHS.findIndex((name) => name.startsWith(m[1]));
  const day = parseFloat(m[2]);
  const at = (year) => new Date(Date.UTC(year, month, 1) + (day - 1) * 86400000);
  let updated = at(now.getUTCFullYear());
  if (updated - now > 86400000) updated = at(now.getUTCFullYear() - 1);
  return { count, updated: updated.toISOString() };
}

export async function fetchMpcToday(timeoutMs = 10000) {
  const [recent, neocp] = await Promise.all([get(RECENT_MPECS, timeoutMs), get(NEOCP, timeoutMs)]);
  return { fetched: new Date().toISOString(), mpecs: parseRecentMpecs(recent), neocp: parseNeocp(neocp) };
}

export function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export function fmtTime(iso) {
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short' });
}
