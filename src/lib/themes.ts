// The research themes of src/data/research.json and what belongs to each: interactive pages and
// science notebooks (from the tutorials collection, through the papers they reproduce, plus any
// interactive page a theme links to directly), and the theme's other links. Used by /research/
// for each theme's summary line and by /explore/ for its theme filter (#theme=<id>).
import { getCollection } from 'astro:content';
import research from '../data/research.json';
import { explorePages } from './interactive';

export type ThemeLink = { label: string; href: string; group?: string };
export type Theme = { id: string; title: string; area?: string; summary: string; bibcodes: string[]; links: ThemeLink[] };
export const themes = research.themes as Theme[];

const pathOf = (href: string) => href.replace(/[#?].*$/, '').replace(/^\/|\/$/g, '');

export async function themeContents() {
  const tutorials = (await getCollection('tutorials')).map((t) => t.data);
  const pages = await explorePages();
  return new Map(themes.map((t) => {
    const bib = new Set(t.bibcodes);
    const ownTutorials = tutorials.filter((tu) => tu.papers.some((b) => bib.has(b)));
    const linked = new Set(t.links.filter((l) => l.href.startsWith('/')).map((l) => pathOf(l.href)));
    const interactive = pages
      .filter((p) => linked.has(p.path) || ownTutorials.some((tu) => tu.interactive && pathOf(tu.interactive) === p.path))
      .map((p) => p.path);
    const notebooks = ownTutorials.filter((tu) => tu.topic === 'science').map((tu) => tu.url);
    // Links that are neither one of these interactive pages nor one of these notebooks.
    const covered = new Set([...interactive, ...notebooks]);
    const related = t.links.filter((l) => !covered.has(l.href.startsWith('/') ? pathOf(l.href) : l.href));
    return [t.id, { interactive, notebooks, related }];
  }));
}
