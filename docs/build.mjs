// Builds the docs pages: docs/src/<page>.html (content) → docs/<page>.html.
//   node docs/build.mjs
// Content files are HTML with three shorthands:
//   ```js … ```                fenced code, escaped and wrapped in <pre class="code">
//   `code`                     inline code
//   ::table A | B | C          a table; one row per line, cells split on " | ",
//   …rows…                     ended by ::end (cells get data-label for the
//   ::end                      stacked phone layout)
// The first line of a content file is `<!-- title | description -->`.
import { readFileSync, writeFileSync } from 'node:fs';

const dir = new URL('./', import.meta.url);
export const PAGES = [
  ['Start', [['index', 'Getting started'], ['options', 'Options'], ['agents', 'Agent recipes']]],
  ['Reference', [['api', 'API'], ['frameworks', 'Frameworks']]],
  ['Guides', [['plugins', 'Plugins & packs'], ['export', 'Export & stickers'], ['performance', 'Performance']]],
];
const flat = PAGES.flatMap(([, items]) => items);
const href = (slug) => (slug === 'index' ? './' : `${slug}.html`);
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const slugify = (s) => s.toLowerCase().replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function inline(s) {
  return s.replace(/`([^`\n]+)`/g, (_, c) => `<code>${esc(c)}</code>`);
}

function render(src) {
  const parts = [];
  // Pull out fenced code first so nothing else touches it.
  src = src.replace(/```(\w*)\n([\s\S]*?)\n```/g, (_, lang, code) => {
    parts.push(`<pre class="code" data-lang="${lang || 'txt'}">${esc(code)}</pre>`);
    return `\u0000${parts.length - 1}\u0000`;
  });
  src = src.replace(/^::table (.+)\n([\s\S]*?)\n::end$/gm, (_, head, body) => {
    const cols = head.split(' | ');
    const rows = body.split('\n').filter(Boolean).map((r) => `<tr>${r.split(' | ').map((c, i) => `<td data-label="${cols[i] || ''}">${inline(c)}</td>`).join('')}</tr>`);
    return `<div class="table-wrap"><table class="props"><thead><tr>${cols.map((c) => `<th scope="col">${c}</th>`).join('')}</tr></thead><tbody>\n${rows.join('\n')}\n</tbody></table></div>`;
  });
  src = inline(src);
  // Anchors on headings.
  src = src.replace(/<(h[23])>(.*?)<\/\1>/g, (_, h, text) => {
    const id = slugify(text);
    return `<${h} id="${id}">${text}<a class="anchor" href="#${id}" aria-label="Link to this section">#</a></${h}>`;
  });
  return src.replace(/\u0000(\d+)\u0000/g, (_, i) => parts[+i]);
}

// The GitHub mark, taken from the landing page so there's one copy of it.
const GITHUB = /<svg viewBox="0 0 16 16"[\s\S]*?<\/svg>/.exec(readFileSync(new URL('../index.html', import.meta.url), 'utf8'))[0];
const THEME = '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.25" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10 2.75a7.25 7.25 0 0 1 0 14.5z" fill="currentColor"/></svg>';

/** The site header; `root` is the path back to the site root. */
export function header(root, current) {
  const cur = (k) => (k === current ? ' aria-current="page"' : '');
  return `<a class="skip" href="#main">Skip to content</a>
  <header class="top">
    <div class="wrap${current === 'docs' ? ' docs-top' : ''}">
      <a class="brand" href="${root}"><img src="${root}assets/favicon.svg" alt="" width="28" height="28" /> bots</a>
      <nav class="nav" aria-label="Main">
        <a class="hide-sm" href="${root}"${cur('home')}>Home</a>
        <a href="${root}docs/"${cur('docs')}>Docs</a>
        <a href="${root}playground/"${cur('studio')}>Studio</a>
        <a class="icon" href="https://github.com/kucukkanat/bots" aria-label="GitHub">${GITHUB}</a>
        <button id="theme" class="icon" type="button" aria-label="Toggle theme">${THEME}</button>
      </nav>
    </div>
  </header>`;
}

export function head(root, title, description, extraCss = '') {
  return `<meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <meta name="description" content="${description}" />
  <meta name="theme-color" content="#f5f4f0" media="(prefers-color-scheme: light)" />
  <meta name="theme-color" content="#111016" media="(prefers-color-scheme: dark)" />
  <script>try{var t=localStorage.getItem('bots-theme');if(t)document.documentElement.dataset.theme=t}catch(e){}</script>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="${root}assets/site.css" />${extraCss}
  <link rel="icon" href="${root}assets/favicon.svg" type="image/svg+xml" />
  <link rel="manifest" href="${root}manifest.webmanifest" />
  <link rel="apple-touch-icon" href="${root}assets/icons/apple-touch-icon.png" />
  <script type="module" src="${root}assets/pwa.js"></script>`;
}

export function footer(root) {
  return `<footer class="foot">
    <div class="wrap">
      <div class="about">
        <a class="brand" href="${root}"><img src="${root}assets/favicon.svg" alt="" width="28" height="28" /> bots</a>
        <p>MIT licensed. A from-scratch homage to <a href="https://libraries.dev/bots">bot-avatars</a> by Jakub Antalik.</p>
      </div>
      <div><h2>Product</h2><ul><li><a href="${root}playground/">Studio</a></li><li><a href="${root}docs/">Getting started</a></li><li><a href="${root}docs/agents.html">Agent recipes</a></li></ul></div>
      <div><h2>Reference</h2><ul><li><a href="${root}docs/options.html">Options</a></li><li><a href="${root}docs/api.html">API</a></li><li><a href="${root}docs/performance.html">Performance</a></li></ul></div>
      <div><h2>Project</h2><ul><li><a href="https://github.com/kucukkanat/bots">GitHub</a></li><li><a href="https://www.npmjs.com/package/@kucukkanat/bots">npm</a></li><li><a href="https://github.com/kucukkanat/bots/blob/main/LICENSE">License</a></li></ul></div>
    </div>
  </footer>`;
}

function sidebar(slug, label) {
  const groups = PAGES.map(([group, items]) => `<p class="side-h">${group}</p>
          <ul>${items.map(([s, l]) => `<li><a href="${href(s)}"${s === slug ? ' aria-current="page"' : ''}>${esc(l)}</a></li>`).join('')}</ul>`).join('\n          ');
  return `<nav class="side" aria-label="Documentation">
        <details id="side-menu">
          <summary><span class="side-sum">Docs</span><span class="side-cur">${esc(label)}</span></summary>
          ${groups}
        </details>
        <script>if(matchMedia('(min-width: 961px)').matches)document.getElementById('side-menu').open=true</script>
      </nav>`;
}

function pager(slug) {
  const i = flat.findIndex(([s]) => s === slug);
  const prev = flat[i - 1], next = flat[i + 1];
  return `<nav class="pager" aria-label="Previous and next page">
          ${prev ? `<a class="prev" href="${href(prev[0])}"><span>Previous</span>${esc(prev[1])}</a>` : '<span></span>'}
          ${next ? `<a class="next" href="${href(next[0])}"><span>Next</span>${esc(next[1])}</a>` : '<span></span>'}
        </nav>`;
}

for (const [slug, label] of flat) {
  const raw = readFileSync(new URL(`src/${slug}.html`, dir), 'utf8');
  const [, title, description] = /^<!--\s*(.*?)\s*\|\s*(.*?)\s*-->/.exec(raw);
  const body = render(raw.replace(/^<!--.*?-->\n?/, ''));
  const page = `<!doctype html>
<!-- Generated by docs/build.mjs from docs/src/${slug}.html: edit that, then run \`node docs/build.mjs\`. -->
<html lang="en">
<head>
  ${head('../', `${esc(title)} · bots docs`, esc(description), '\n  <link rel="stylesheet" href="docs.css" />')}
</head>
<body>
  ${header('../', 'docs')}

  <div class="wrap docs">
    ${sidebar(slug, label)}
    <main id="main" class="doc-main">
      <article class="prose">
${body.trim()}
      </article>
      ${pager(slug)}
    </main>
    <aside class="toc" aria-label="On this page"></aside>
  </div>

  ${footer('../')}

  <script type="module" src="docs.js"></script>
</body>
</html>
`;
  writeFileSync(new URL(`${slug}.html`, dir), page);
  console.log('wrote', `docs/${slug}.html`);
}
