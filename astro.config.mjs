import { defineConfig } from 'astro/config';

// GitHub project Pages defaults. For a user-site repository named
// matthewjohnpayne.github.io or a custom domain, remove `base`.
export default defineConfig({
  site: 'https://matthewjohnpayne.github.io',
  base: '/ScientistWebsite/',
  output: 'static'
});
