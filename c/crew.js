// Crew pages: the bots encoded in the address.
//
//   c/#bot1.AAA~Ada,bot1.BBB~Bo            DNA codes, comma-separated, each with an optional ~name
//   c/#t=Support%20team,bot1.AAA~Ada       t= (or title=) names the crew
//   c/?dna=bot1.AAA,bot1.BBB&names=Ada,Bo&title=Support%20team
//   c/#type=cat&hat=party&label=Ada        a studio share link's options (one bot)
//
// Names are URI-encoded; a DNA code that carries a label uses it when no name is given.
import { createBot, decodeDNA, encodeDNA, presets, types } from '../src/index.js';
import { initTheme } from '../assets/theme.js';

const $ = (id) => document.getElementById(id);
initTheme($('theme'));

const dec = (s) => { try { return decodeURIComponent(s.replace(/\+/g, ' ')); } catch { return s; } };
const DNA_RE = /bot1\.[A-Za-z0-9_-]+/;

/** A studio share link's flat options, typed. */
function flatOptions(params) {
  const o = {};
  for (const [k, v] of params) {
    if (v === 'true' || v === '') o[k] = true;
    else if (v === 'false') o[k] = false;
    else if (/^-?\d*\.?\d+$/.test(v)) o[k] = parseFloat(v);
    else o[k] = v;
  }
  return o;
}

export function parseCrew(href) {
  const url = new URL(href);
  const hash = url.hash.replace(/^#/, '');
  const q = url.searchParams;
  let title = q.get('title') || q.get('t') || '';
  const members = [];
  const add = (dna, name) => {
    const opts = decodeDNA(dna);
    if (!Object.keys(opts).length) return;
    members.push({ dna, opts, name: name || opts.label || presets[opts.type]?.label || 'Bot' });
  };

  // ?dna=…&names=…
  if (q.get('dna')) {
    const names = (q.get('names') || '').split(',');
    q.get('dna').split(',').forEach((d, i) => { const [code, nm] = d.split('~'); add(code.trim(), dec(nm || names[i] || '')); });
  }

  if (hash) {
    if (DNA_RE.test(hash)) {
      // Items separated by commas (or &); bot1.… with an optional ~name; t=/title= for the title.
      for (const item of hash.split(/[,&]/)) {
        const m = /^(?:(?:crew|c|dna)=)?(bot1\.[A-Za-z0-9_-]+)(?:~(.*))?$/.exec(item);
        if (m) add(m[1], dec(m[2] || ''));
        else {
          const t = /^(?:t|title)=(.*)$/.exec(item);
          if (t) title = dec(t[1]);
        }
      }
    } else {
      const params = new URLSearchParams(hash);
      const keys = [...params.keys()].filter((k) => k !== 't' && k !== 'title');
      if (params.has('t') || params.has('title')) title = params.get('title') || params.get('t');
      if (keys.length) {
        const opts = flatOptions(params);
        if (opts.dna) Object.assign(opts, decodeDNA(opts.dna), { ...opts, dna: undefined });
        delete opts.title;
        delete opts.t;
        delete opts.dna;
        if (!types.includes(opts.type)) opts.type = 'clover';
        members.push({ dna: encodeDNA(opts), opts, name: opts.label || presets[opts.type]?.label || 'Bot' });
      }
    }
  }
  return { title, members };
}

/** The link for a crew, in the canonical #t=…,bot1.…~name form. */
export function crewLink(base, { title, members }) {
  const items = members.map((m) => m.dna + (m.name ? '~' + encodeURIComponent(m.name) : ''));
  if (title) items.unshift('t=' + encodeURIComponent(title));
  return `${base}#${items.join(',')}`;
}

const STUDIO_KEYS = new Set(['state', 'size', 'seed', 'dna']);
function studioLink(m) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(m.opts)) {
    if (STUDIO_KEYS.has(k) || v == null || typeof v === 'object') continue;
    p.set(k, String(v));
  }
  if (m.name) p.set('label', m.name);
  return `../playground/#${p}`;
}

function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), 1600);
}
async function copy(text, done) {
  try { await navigator.clipboard.writeText(text); toast(done); } catch { prompt('Copy this:', text); }
}

let bots = [];
function render() {
  bots.forEach((b) => b.destroy());
  bots = [];
  const crew = parseCrew(location.href);
  const n = crew.members.length;
  const list = $('members');
  list.replaceChildren();
  list.classList.toggle('solo', n === 1);
  $('empty').hidden = n > 0;
  $('toolbar').hidden = n === 0;
  const title = crew.title || (n === 1 ? crew.members[0].name : n ? 'A crew of bots' : 'Crew pages');
  $('title').textContent = title;
  $('kicker').textContent = n ? `${n} bot${n === 1 ? '' : 's'}` : 'Crew';
  document.title = n ? `${title} · bots` : 'Crew pages · bots';
  if (!n) { showExample(); return; }

  const size = n === 1 ? 200 : n <= 4 ? 128 : 104;
  crew.members.forEach((m, i) => {
    const fig = document.createElement('figure');
    fig.className = 'member';
    const slot = document.createElement('div');
    slot.className = 'slot';
    slot.style.width = slot.style.height = `${size + 8}px`;
    const cap = document.createElement('figcaption');
    cap.textContent = m.name;
    const kind = document.createElement('span');
    kind.className = 'kind';
    kind.textContent = presets[m.opts.type]?.label || m.opts.type || '';
    const acts = document.createElement('div');
    acts.className = 'acts';
    const open = Object.assign(document.createElement('a'), { href: studioLink(m), textContent: 'Open in studio' });
    const dna = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Copy DNA' });
    dna.addEventListener('click', () => copy(m.dna, `${m.name}'s DNA copied`));
    acts.append(open, dna);
    fig.append(slot, cap, kind, acts);
    list.append(fig);
    bots.push(createBot(slot, { ...m.opts, size, label: m.name, seed: (i * 0.37 + 0.1) % 1, social: n > 1 }));
  });
}

function showExample() {
  const sample = [
    ['Ada', { type: 'cat', glasses: 'round', bowTie: true, face: 'mouth' }],
    ['Bo', { type: 'droid', headphones: true }],
    ['Fizz', { type: 'star', hat: 'crown', face: 'mouth' }],
    ['Dot', { type: 'ghost', blush: true }],
  ].map(([name, o]) => ({ name, dna: encodeDNA(o) }));
  const link = crewLink(new URL('./', location.href).href, { title: 'Sample crew', members: sample });
  $('sample').href = link;
  $('example').textContent = `${location.origin}${location.pathname}#bot1.…~Ada,bot1.…~Bo`;
}

// Everyone's state.
const seg = $('state-seg');
seg.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  bots.forEach((bot, i) => setTimeout(() => bot.setState(b.dataset.v), i * 90));
});
$('copy-link').addEventListener('click', () => {
  const crew = parseCrew(location.href);
  copy(crewLink(location.origin + location.pathname, crew), 'Link copied');
});

addEventListener('hashchange', render);
render();
