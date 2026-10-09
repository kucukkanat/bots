import { initTheme } from '../assets/theme.js';
import { enhanceCode, initTabs } from '../assets/code.js';
import { libUrl } from '../assets/lib-url.js';

initTheme(document.getElementById('theme'));

// Snippets point at wherever this site serves the library from.
const LITERAL = 'https://kucukkanat.github.io/bots/dist/bots.js';
const lib = libUrl();
for (const pre of document.querySelectorAll('pre.code')) if (pre.textContent.includes(LITERAL)) pre.textContent = pre.textContent.replaceAll(LITERAL, lib);
enhanceCode();
initTabs();

// Sidebar: open beside the page on wide screens, a menu on narrow ones.
const menu = document.getElementById('side-menu');
const wide = matchMedia('(min-width: 961px)');
wide.addEventListener('change', () => { menu.open = wide.matches; });
menu.addEventListener('click', (e) => { if (!wide.matches && e.target.closest('a')) menu.open = false; });

// On this page.
const toc = document.querySelector('.toc');
const heads = [...document.querySelectorAll('.prose h2[id]')];
if (toc && heads.length > 1) {
  const links = new Map();
  const ul = document.createElement('ul');
  for (const h of heads) {
    const a = document.createElement('a');
    a.href = `#${h.id}`;
    a.textContent = h.firstChild.textContent;
    const li = document.createElement('li');
    li.append(a);
    ul.append(li);
    links.set(h, a);
  }
  const p = document.createElement('p');
  p.textContent = 'On this page';
  toc.append(p, ul);
  const spy = () => {
    let cur = heads[0];
    for (const h of heads) if (h.getBoundingClientRect().top < 120) cur = h;
    for (const [h, a] of links) a.classList.toggle('on', h === cur);
  };
  addEventListener('scroll', spy, { passive: true });
  spy();
}

// Live examples load the library only when one comes near the viewport.
const live = document.querySelectorAll('bot-avatar, [data-live]');
if (live.length) {
  const io = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    io.disconnect();
    import('../src/index.js').then((m) => document.dispatchEvent(new CustomEvent('bots-loaded', { detail: m })));
  }, { rootMargin: '300px 0px' });
  live.forEach((el) => io.observe(el));
}
