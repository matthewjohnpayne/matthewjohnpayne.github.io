// Object of the Month records (src/content/objects/), newest month first, with their MPC orbit data.
import { getCollection } from 'astro:content';
import type { ObjectData } from './objectOrbit';

const orbitFiles = import.meta.glob<{ default: ObjectData }>('../data/objects/*.json', { eager: true });

export function orbitData(id: string): ObjectData {
  const file = orbitFiles[`../data/objects/${id}.json`];
  if (!file) throw new Error(`[objects] no src/data/objects/${id}.json; run tools/export_object_orbits.py`);
  return file.default;
}

export async function objectsByMonth() {
  return (await getCollection('objects')).sort((a, b) => b.data.month.localeCompare(a.data.month));
}

export function monthLabel(month: string) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
