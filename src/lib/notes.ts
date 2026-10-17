// Notes ("today I learned") from src/content/notes/. Drafts are included only under `npm run dev`.
import { getCollection } from 'astro:content';

export async function getNotes() {
  const dev = import.meta.env.DEV;
  return (await getCollection('notes'))
    .filter((n) => dev || n.data.status === 'published')
    .sort((a, b) => b.data.date.localeCompare(a.data.date) || a.data.title.localeCompare(b.data.title));
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const longDate = (d: string) => { const [y, m, day] = d.split('-').map(Number); return `${day} ${MONTHS[m - 1]} ${y}`; };
