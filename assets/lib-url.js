// Where pages built from the playground load the library from: this very site
// once it is deployed (GitHub Pages serves modules with open CORS), or the
// jsDelivr mirror of the repository when running locally.
export const CDN_URL = 'https://cdn.jsdelivr.net/gh/kucukkanat/bots@main/src/index.js';

export function libUrl() {
  const here = new URL('../src/index.js', import.meta.url);
  const local = /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(here.hostname) || here.protocol === 'file:';
  return local ? CDN_URL : here.href;
}
