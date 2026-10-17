// src/lib/interactive.ts: the interactive pages listed on /explore/ and on the homepage strip. Every entry in
// src/data/page-status.json is an interactive page; its optional `explore` field gives the title,
// teaser, area, homepage order (`featured`) and thumbnail (`visual`). Pages without it fall back to
// the tutorial or software record whose `interactive` field points to the page, so a new page shows
// up here as soon as it has a status entry.
import { getCollection } from 'astro:content';
import status from '../data/page-status.json';

export const AREAS: Record<string, { title: string; lead: string }> = {
  'solar-system': { title: 'Solar System dynamics', lead: 'Orbits, reference frames and distant planets.' },
  detection: { title: 'Finding and tracking small bodies', lead: 'From survey detections to orbits.' },
  exoplanets: { title: 'Exoplanet dynamics', lead: 'Resonances, chaos, transit timing and radial velocities.' },
  moons: { title: 'Moons', lead: 'How moons survive, or are lost.' },
  software: { title: 'Software tools', lead: 'Interactive views of MPC software.' },
  other: { title: 'More', lead: '' }
};

type Source = { label: string; href?: string; bibcode?: string };
type Explore = { title?: string; teaser?: string; area?: string; featured?: number; visual?: string };
type StatusEntry = { checked: string; basedOn: Source[]; explore?: Explore };

export type ExplorePage = {
  path: string;            // e.g. "teaching/heliolinc"
  title: string;
  teaser: string;
  area: string;
  featured?: number;
  visual?: string;
  checked: string;
  basedOn: Source[];
};

const firstSentence = (s: string) => (s.match(/^.*?[.?!](\s|$)/)?.[0] ?? s).trim();

export async function explorePages(): Promise<ExplorePage[]> {
  const tutorials = await getCollection('tutorials');
  const software = await getCollection('software');
  const record = (path: string) => {
    const t = tutorials.find((e) => e.data.interactive?.replace(/\/$/, '') === path);
    if (t) return { title: t.data.title, summary: t.data.summary, area: t.data.area };
    const s = software.find((e) => e.data.interactive?.replace(/\/$/, '') === path);
    if (s) return { title: s.data.name, summary: s.data.summary, area: 'software' };
    return undefined;
  };
  return Object.entries(status as unknown as Record<string, StatusEntry | string>)
    .filter(([k, v]) => !k.startsWith('_') && typeof v === 'object')
    .map(([path, v]) => {
      const e = v as StatusEntry, x = e.explore ?? {}, r = record(path);
      const area = x.area ?? r?.area ?? (path.startsWith('software/') ? 'software' : 'other');
      return {
        path,
        title: x.title ?? r?.title ?? path,
        teaser: x.teaser ?? (r?.summary ? firstSentence(r.summary) : ''),
        area: area in AREAS ? area : 'other',
        featured: x.featured,
        visual: x.visual,
        checked: e.checked,
        basedOn: e.basedOn
      };
    });
}

export async function featuredPages(n = 6) {
  return (await explorePages()).filter((p) => p.featured).sort((a, b) => a.featured! - b.featured!).slice(0, n);
}
