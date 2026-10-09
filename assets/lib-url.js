// Where pages built from the playground load the library from: the bundled
// build this very site serves (GitHub Pages serves modules with open CORS).
// Locally, where dist/ may not be built, snippets still point at the live site.
export const CDN_URL = 'https://kucukkanat.github.io/bots/dist/bots.js';

export function libUrl() {
  const here = new URL('../dist/bots.js', import.meta.url);
  const local = /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(here.hostname) || here.protocol === 'file:';
  return local ? CDN_URL : here.href;
}
