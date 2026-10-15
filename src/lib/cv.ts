// Sections of the CV that come from the rest of the site, shared by the CV web
// page (src/pages/cv.astro) and its LaTeX version (src/pages/cv/matthew-payne-cv.tex.ts).
import { getCollection } from 'astro:content';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const talkDate = (d: string) => {
  const [y, m, day] = d.split('-').map(Number);
  return day ? `${day} ${MONTHS[m - 1]} ${y}` : `${MONTHS[m - 1]} ${y}`;
};

/** "Payne, Matthew J." -> "Payne, M. J." */
const initials = (name: string) => {
  const [last, first = ''] = name.split(/,\s*/);
  return first ? `${last}, ${first.split(/[\s-]+/).filter(Boolean).map((p) => `${p[0]}.`).join(' ')}` : last;
};
export const authorList = (authors: string[], total: number, max = 4) =>
  authors.length > max || total > authors.length
    ? `${authors.slice(0, Math.min(max - 1, authors.length)).map(initials).join(', ')}, et al.`
    : authors.map(initials).join(', ');

export async function cvSections({ nPapers = 10, nTalks = 10 } = {}) {
  const pubs = (await getCollection('publications')).map((p) => p.data).sort((a, b) => b.year - a.year || a.title.localeCompare(b.title));
  const firstAuthor = pubs.filter((p) => p.authorPosition === 1);
  const talks = (await getCollection('talks')).map((t) => t.data).filter((t) => !t.presenter).sort((a, b) => b.date.localeCompare(a.date));
  const today = new Date().toISOString().slice(0, 10);
  const people = (await getCollection('people')).map((p) => p.data).filter((p) => p.relationship === 'mentee').sort((a, b) => b.order - a.order || a.name.localeCompare(b.name));
  return {
    papers: { total: pubs.length, firstAuthor: firstAuthor.length, selected: firstAuthor.slice(0, nPapers) },
    talks: { total: talks.length, recent: talks.filter((t) => t.date <= today).slice(0, nTalks) },
    people
  };
}
