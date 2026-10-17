// Atom feed of published notes (hand-written; the site has no RSS dependency).
import type { APIContext } from 'astro';
import { getNotes } from '../../lib/notes';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function GET({ site }: APIContext) {
  const base = new URL(import.meta.env.BASE_URL, site).href;
  const notes = (await getNotes()).filter((n) => n.data.status === 'published');
  const updated = notes.length ? `${notes[0].data.date}T00:00:00Z` : '2026-10-17T00:00:00Z';
  const entries = notes.map((n) => {
    const url = `${base}notes/${n.id}/`;
    return `  <entry>
    <title>${esc(n.data.title)}</title>
    <link href="${url}"/>
    <id>${url}</id>
    <updated>${n.data.date}T00:00:00Z</updated>
    <summary>${esc(n.data.summary)}</summary>
${n.data.tags.map((t) => `    <category term="${esc(t)}"/>`).join('\n')}
  </entry>`;
  }).join('\n');
  const body = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Notes — Matthew Payne</title>
  <link href="${base}notes/feed.xml" rel="self"/>
  <link href="${base}notes/"/>
  <id>${base}notes/</id>
  <updated>${updated}</updated>
  <author><name>Matthew Payne</name></author>
${entries}
</feed>
`;
  return new Response(body, { headers: { 'Content-Type': 'application/atom+xml; charset=utf-8' } });
}
