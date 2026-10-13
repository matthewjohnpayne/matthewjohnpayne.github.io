import { defineConfig } from 'astro/config';

// Served from the user Pages repository matthewjohnpayne.github.io, so no
// `base` is needed. For a project repository, add e.g. base: '/RepoName/'.
export default defineConfig({
  site: 'https://matthewjohnpayne.github.io',
  output: 'static'
});
