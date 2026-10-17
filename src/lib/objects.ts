// Object of the Month records (src/content/objects/), newest month first, with their MPC orbit data.
import { getCollection } from 'astro:content';
import type { ObjectData } from './objectOrbit';

const orbitFiles = import.meta.glob<{ default: ObjectData }>('../data/objects/*.json', { eager: true });

export function orbitData(id: string): ObjectData {
  const file = orbitFiles[`../data/objects/${id}.json`];
  if (!file) throw new Error(`[objects] no src/data/objects/${id}.json; run tools/export_object_orbits.py`);
  return file.default;
}

// The month (UTC) in which the site is built. The scheduled daily build in deploy.yml moves the
// site on to a queued object on the first day of its month.
export const buildMonth = new Date().toISOString().slice(0, 7);

type Entry = Awaited<ReturnType<typeof getCollection<'objects'>>>[number];

// 'draft': Matthew has not yet reviewed the text; 'queued': reviewed, but its month has not come.
export function objectStatus(e: Entry): 'live' | 'queued' | 'draft' {
  if (!e.data.reviewed) return 'draft';
  return e.data.month > buildMonth ? 'queued' : 'live';
}

// Production builds include only live objects. `npm run dev` includes drafts and queued months
// too, labelled on their pages, so they can be reviewed.
// The figure data cached by tools/export_object_figures.py, for the views it computes.
const figureFiles = import.meta.glob<{ default: any }>('../data/objects/*-figure.json', { eager: true });
export function figureData(id: string) {
  const file = figureFiles[`../data/objects/${id}-figure.json`];
  if (!file) throw new Error(`[objects] no src/data/objects/${id}-figure.json; run tools/export_object_figures.py ${id}`);
  return file.default;
}

export async function objectsByMonth() {
  const all = (await getCollection('objects')).sort((a, b) => b.data.month.localeCompare(a.data.month));
  return import.meta.env.DEV ? all : all.filter((e) => objectStatus(e) === 'live');
}

// The object for the teasers: the newest one whose month has arrived.
export async function currentObject() {
  return (await objectsByMonth()).find((e) => e.data.month <= buildMonth);
}

export function monthLabel(month: string) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
