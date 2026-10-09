// Code snippets and the publishable page. Loaded the first time the Code tab
// opens or something is published, so the studio's first paint doesn't wait.

const PKG = '@kucukkanat/bots';
const kebab = (s) => s.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** HTML attributes for the options in `ch` (only what differs from the defaults). */
export function attrs(ch, size) {
  const parts = [];
  for (const [k, v] of Object.entries(ch)) {
    if (v === true) parts.push(kebab(k));
    else parts.push(`${kebab(k)}="${esc(v)}"`);
  }
  if (size) parts.push(`size="${size}"`);
  return parts;
}

// The things worn, as one `wear` list where they can be ('party-hat round-glasses bow-tie').
const HAT_ITEM = { party: 'party-hat', tophat: 'top-hat', witch: 'witch-hat' };
const GLASSES_ITEM = { round: 'round-glasses', square: 'square-glasses', shades: 'shades' };
export function foldWear(ch) {
  const out = { ...ch }, items = [];
  const take = (k, item) => { if (item) { items.push(item); delete out[k]; } };
  if (ch.hat && ch.hat !== 'none') take('hat', HAT_ITEM[ch.hat] || ch.hat);
  if (ch.glasses && ch.glasses !== 'none') take('glasses', GLASSES_ITEM[ch.glasses]);
  if (ch.bowTie === true) take('bowTie', 'bow-tie');
  if (ch.scarf === true) take('scarf', 'bandana');
  if (ch.headphones === true) take('headphones', 'headphones');
  if (ch.ears && ch.ears !== 'none') take('ears', `${ch.ears}-ears`);
  if (ch.antennae === 'one' || ch.antennae === 'two') take('antennae', ch.antennae === 'one' ? 'antenna' : 'antennae');
  if (typeof ch.badge === 'string' && /^[^\s,]+$/.test(ch.badge)) take('badge', `badge:${ch.badge}`);
  if (items.length) out.wear = items.join(' ');
  return out;
}

const packUrl = (lib, id) => lib.replace(/index\.js$/, `packs/${id}.js`);
/** Lay attributes out on one line, or one per line once they get long. */
const tag = (name, parts, indent = '') => {
  const one = `<${name} ${parts.join(' ')}></${name}>`;
  if (one.length + indent.length <= 88) return indent + one;
  return `${indent}<${name}\n${parts.map((p) => `${indent}  ${p}`).join('\n')}\n${indent}></${name}>`;
};
const jsValue = (v) => (typeof v === 'string' ? `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'` : JSON.stringify(v));

/**
 * A snippet that makes this bot: 'html', 'js', 'react', 'vue' or 'svelte'.
 * `packs` are hat packs to import alongside the library.
 */
export function snippet(kind, ch, { lib, packs = [], size = 96 }) {
  ch = foldWear(ch);
  const all = { ...ch, size };
  if (kind === 'html') {
    const extra = packs.map((p) => `<script type="module" src="${packUrl(lib, p)}"></script>\n`).join('');
    return `<script type="module" src="${lib}"></script>\n${extra}\n${tag('bot-avatar', attrs(ch, size))}`;
  }
  if (kind === 'js') {
    const body = Object.entries(all).map(([k, v]) => `  ${k}: ${jsValue(v)},`).join('\n');
    const extra = packs.map((p) => `import '${packUrl(lib, p)}';\n`).join('');
    return `import { createBot } from '${lib}';\n${extra}\nconst bot = createBot('#my-bot', {\n${body}\n});\n\nbot.setState('working');   // when your agent is busy\nbot.react('happy');        // a moment's expression`;
  }
  const pkgPacks = packs.map((p) => `import '${PKG}/packs/${p}.js';\n`).join('');
  if (kind === 'react') {
    const props = Object.entries(all).filter(([k]) => k !== 'state').map(([k, v]) => (v === true ? k : typeof v === 'string' ? `${k}=${JSON.stringify(v)}` : `${k}={${JSON.stringify(v)}}`));
    return `import { BotAvatar } from '${PKG}/react';\n${pkgPacks}\nexport function Agent({ busy }) {\n  return (\n    <BotAvatar\n      ${props.join('\n      ')}\n      state={busy ? 'working' : ${JSON.stringify(ch.state || 'default')}}\n    />\n  );\n}`;
  }
  const parts = attrs(Object.fromEntries(Object.entries(ch).filter(([k]) => k !== 'state')), size);
  if (kind === 'vue') {
    return `<script setup>\nimport '${PKG}';\n${pkgPacks}defineProps({ busy: Boolean });\n</script>\n\n<template>\n${tag('bot-avatar', [...parts, `:state="busy ? 'working' : '${ch.state || 'default'}'"`], '  ')}\n</template>\n\n<!-- vite.config.js: vue({ template: { compilerOptions: { isCustomElement: (t) => t === 'bot-avatar' } } }) -->`;
  }
  if (kind === 'svelte') {
    return `<script>\n  import '${PKG}';\n${pkgPacks.split('\n').filter(Boolean).map((l) => `  ${l}\n`).join('')}  export let busy = false;\n</script>\n\n${tag('bot-avatar', [...parts, `state={busy ? 'working' : '${ch.state || 'default'}'}`])}`;
  }
  return '';
}

/** A standalone index.html with one bot or a crew, ready for GitHub Pages. */
export function pageHtml({ members, title, lib, home, packs = [] }) {
  title = title || (members.length > 1 ? 'My bots' : members[0].name);
  const size = members.length > 1 ? 128 : 220;
  const figures = members.map((m) => `      <figure>\n        <bot-avatar ${attrs(foldWear(m.opts), size).join(' ')}></bot-avatar>\n        <figcaption>${esc(m.name)}</figcaption>\n      </figure>`).join('\n');
  const extra = packs.map((p) => `\n  <script type="module" src="${packUrl(lib, p)}"></script>`).join('');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)}</title>
  <style>
    :root { --bg: #f5f4f0; --text: #17151f; --muted: #6c6978; color-scheme: light dark; }
    @media (prefers-color-scheme: dark) { :root { --bg: #111016; --text: #f1eff8; --muted: #9b98aa; } }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: var(--bg); color: var(--text);
      font: 16px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
    main { padding: 48px 16px; text-align: center; }
    h1 { font-size: clamp(32px, 6vw, 56px); letter-spacing: -0.04em; margin: 0 0 32px; }
    .crew { display: flex; flex-wrap: wrap; gap: 40px 32px; justify-content: center; }
    figure { margin: 0; display: flex; flex-direction: column; align-items: center; gap: 14px; }
    figcaption { font-weight: 600; }
    .made { margin-top: 48px; color: var(--muted); font-size: 13px; }
    .made a { color: inherit; }
  </style>
  <script type="module" src="${lib}"></script>${extra}
</head>
<body>
  <main>
    <h1>${esc(title)}</h1>
    <div class="crew">
${figures}
    </div>
    <p class="made">Made with <a href="${esc(home)}">the bots studio</a>.</p>
  </main>
</body>
</html>
`;
}
