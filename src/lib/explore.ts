// Links between papers, notebooks, interactive pages and software, built from the tutorials and
// software collections so that each relationship is recorded in one place.
import { getCollection } from 'astro:content';

const root = import.meta.env.BASE_URL;
export const sitePath = (p: string) => `${root}${p.replace(/^\//, '')}`;

export type Explore = { interactive?: string; notebook?: string; code: { name: string; href: string }[] };

/** For each bibcode: the interactive page and notebook that reproduce it, and software built on it. */
export async function exploreByPaper() {
  const map = new Map<string, Explore>();
  const get = (b: string) => map.get(b) ?? map.set(b, { code: [] }).get(b)!;
  for (const { data } of await getCollection('tutorials')) for (const b of data.papers) Object.assign(get(b), { interactive: data.interactive && sitePath(data.interactive), notebook: data.url });
  for (const { data } of await getCollection('software')) for (const b of data.papers) get(b).code.push({ name: data.name, href: `${sitePath('software/')}#${data.name}` });
  return map;
}

/** Software entries by every name they go by (lower case), for linking tutorials' tool tags. */
export async function softwareByTool() {
  const map = new Map<string, string>();
  for (const { data } of await getCollection('software')) for (const n of [data.name, ...data.aliases]) map.set(n.toLowerCase(), data.name);
  return map;
}
