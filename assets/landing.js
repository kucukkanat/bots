import { createBot, presets } from '../src/index.js';
import { initTheme } from './theme.js';
import { enhanceCode, initTabs } from './code.js';
import { libUrl } from './lib-url.js';

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const has = (bot, m) => typeof bot?.[m] === 'function';

initTheme($('theme'));

// Snippets point at wherever this site serves the library from.
const LITERAL = 'https://kucukkanat.github.io/bots/dist/bots.js';
for (const pre of document.querySelectorAll('pre[data-lib]')) pre.textContent = pre.textContent.replace(LITERAL, libUrl());
enhanceCode();
initTabs();

// ---------------------------------------------------------------------------
// Hero: one bot driven by a pretend agent chat.

const stage = $('stage');
const heroSize = () => (matchMedia('(max-width: 760px)').matches ? 170 : 260);
const BASE_LOOK = { type: 'clover', face: 'mouth', mood: 'auto', status: 'none', toss: false, petting: true, sounds: false };
let look = { ...BASE_LOOK, label: 'Clover' };
const bot = createBot($('hero-bot'), { ...look, size: heroSize(), seed: 0.3 });
const WORDS = { default: 'idle', listening: 'listening', thinking: 'thinking', speaking: 'speaking', success: 'done', error: 'error', working: 'working', sleeping: 'sleeping' };

const ticker = $('ticker');
function log(call) {
  ticker.textContent = call;
  ticker.classList.add('flash');
  clearTimeout(log.t);
  log.t = setTimeout(() => ticker.classList.remove('flash'), 600);
}
function showState(s) {
  stage.dataset.state = s;
  $('state-word').textContent = WORDS[s] || s;
}
function setState(s) {
  bot.setState(s);
  showState(s);
  log(`bot.setState('${s}')`);
}
// The affect engine picks the states from what the agent is doing; the page just shows them.
bot.on('state', (e) => showState(e.state));
const canObserve = has(bot, 'observe');
function observe(event, data) {
  if (!canObserve) return Promise.resolve();
  if (event !== 'token') log(`bot.observe('${event}'${data ? ', ' + JSON.stringify(data) : ''})`);
  return bot.observe(event, data);
}
function setStatus(s) { bot.set({ status: s }); }
showState('default');

let mq = heroSize();
addEventListener('resize', () => { const s = heroSize(); if (s !== mq) { mq = s; bot.set({ size: s }); } });

const messages = $('messages');
const input = $('prompt');
const send = $('send');
const chips = [...$('suggest').querySelectorAll('button')];

function addMsg(who, text = '') {
  const m = document.createElement('div');
  m.className = `msg ${who}`;
  m.textContent = text;
  messages.append(m);
  messages.scrollTop = messages.scrollHeight;
  return m;
}

const REPLIES = [
  { re: /what are you|who are you|what is this|hello|^hi\b|hey/i,
    text: "I'm a plush little avatar for AI agents. I listen while you type, think while the model works and move my mouth as the answer streams in. Like right now." },
  { re: /hat|party|dress|wear/i, then: () => { bot.set({ hat: 'party', accessoryColor: '#5b5bf7' }); log("bot.set({ hat: 'party' })"); has(bot, 'react') && bot.react('joy'); },
    text: "Party mode! Hats, glasses, scarves, ears and badges all ease in live, and packs add more for Halloween, winter and parties." },
  { re: /lantern|glow|light up|glass|material/i, then: () => { const glass = /glass/i.test(lastQ); bot.set({ shading: glass ? 'glass' : 'lantern', hat: 'none' }); log(`bot.set({ shading: '${glass ? 'glass' : 'lantern'}' })`); },
    text: "Materials! Plush is the default, but I can be glass, with light pooling through me, or a lantern that glows from inside, brighter whenever I think or talk. There's plastic, clay, felt and paper too." },
  { re: /who are you really|personality|temperament|character/i, then: () => { bot.set({ type: 'cat', hat: 'none', shading: 'fabric' }); log("bot.set({ type: 'cat' })"); },
    text: "Every shape has a temperament. The cat is aloof and looks away when you watch it, the ghost is shy and ducks when poked, the droid blinks in a snap and powers down to sleep. Try moving the pointer over me now." },
  { re: /error|fail|wrong|break|bug/i, end: 'error', then: () => has(bot, 'react') && bot.react('worried'),
    text: "Uh-oh. When a tool call fails I show it with setState('error'). Call setState('success') once things recover." },
  { re: /install|npm|cdn|use you|get you|setup|set up/i,
    text: "One line: npm i github:kucukkanat/bots#release, or one script tag from a CDN. Then drop a <bot-avatar> anywhere. No build step, no dependencies." },
  { re: /sleep|tired|nap|bye/i, end: 'sleeping',
    text: "Between tasks I doze off. setState('sleeping') and I'll snore quietly until the next message." },
  { re: /react|vue|svelte|framework/i,
    text: "Use the <bot-avatar> element anywhere, or the wrappers for React, Vue and Svelte. They're all a few lines." },
];
const FALLBACK = [
  "Good question! In a real app this text would stream from your model: pass each chunk to bot.say(chunk, { append: true }) and I keep talking.",
  "I can't actually think, these are canned replies. But your agent can: set 'thinking' while it works and I'll look busy for it.",
  "Noted! Try asking me to put on a party hat, or to show you an error.",
];
let fallbackI = 0;
let lastQ = '';
const replyFor = (q) => { lastQ = q; return REPLIES.find((r) => r.re.test(q)) || { text: FALLBACK[fallbackI++ % FALLBACK.length] }; };

let busy = false;
function setBusy(b) {
  busy = b;
  send.disabled = b;
  chips.forEach((c) => (c.disabled = b));
}

/** Stream `text` into `el` word by word, each word a token the bot observes (and says). */
async function speakInto(el, text) {
  const words = text.split(/(?<=\s)/);
  const wpm = 230;
  const per = reduced ? 0 : 60000 / wpm;
  messages.setAttribute('aria-busy', 'true');
  if (!canObserve) { setState('speaking'); if (has(bot, 'say')) bot.say(text, { wpm }); }
  let first = true;
  for (const w of words) {
    el.textContent += w;
    messages.scrollTop = messages.scrollHeight;
    if (canObserve) {
      if (first) { log(`bot.observe('token', { text: '${w.trim()}' })`); first = false; }
      observe('token', { text: w, wpm });
    }
    if (w.trim() && per) await sleep(per * (/[.,!?]\s*$/.test(w) ? 1.8 : 1));
  }
  messages.removeAttribute('aria-busy');
}

let idleTimer = 0;
async function respond(q, reply) {
  setBusy(true);
  clearTimeout(idleTimer);
  if (canObserve) observe('sent'); else { bot.lookAt?.(null); setState('thinking'); }
  setStatus('typing');
  const dots = addMsg('bot');
  dots.classList.add('typing');
  dots.setAttribute('aria-label', `${look.label} is typing`);
  dots.innerHTML = '<i></i><i></i><i></i>';
  await sleep(reduced ? 300 : 1100 + Math.random() * 500);
  dots.remove();
  setStatus('none');
  const el = addMsg('bot');
  await speakInto(el, reply.text);
  reply.then?.();
  const end = reply.end || 'success';
  if (canObserve) {
    // The engine waits for the mouth to finish, then celebrates (or frets) on its own.
    await observe(end === 'error' ? 'error' : 'done');
    if (end === 'error') bot.react?.('worried');
  } else setState(end);
  setStatus(end === 'error' ? 'error' : 'done');
  await sleep(end === 'sleeping' ? 3400 : 2600);
  setStatus('none');
  if (end === 'sleeping') setState('sleeping');
  else if (!canObserve && stage.dataset.state === end) setState(document.activeElement === input && input.value ? 'listening' : 'default');
  setBusy(false);
}

function ask(q) {
  q = q.trim();
  if (!q || busy) return;
  addMsg('user', q);
  input.value = '';
  respond(q, replyFor(q));
}

$('composer').addEventListener('submit', (e) => { e.preventDefault(); ask(input.value); });
chips.forEach((c) => c.addEventListener('click', () => ask(c.textContent)));
input.addEventListener('focus', () => { if (!busy && has(bot, 'lookAt')) { bot.lookAt(input); log('bot.lookAt(input)'); } });
input.addEventListener('blur', () => { if (!busy) { bot.lookAt?.(null); if (stage.dataset.state === 'listening') (canObserve ? observe('idle') : setState('default')); } });
input.addEventListener('input', () => {
  if (busy) return;
  if (input.value && stage.dataset.state !== 'listening') (canObserve ? observe('typing', { target: input }) : setState('listening'));
  if (!input.value && stage.dataset.state === 'listening') (canObserve ? observe('idle') : setState('default'));
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { if (!busy && stage.dataset.state === 'listening') (canObserve ? observe('idle') : setState('default')); }, 6000);
});

// ---------------------------------------------------------------------------
// Bots below the fold are made only when they come near the viewport.

const lazy = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) { lazy.unobserve(e.target); e.target._mount(); }
}, { rootMargin: '250px 0px' });
function whenNear(el, mount) { el._mount = mount; lazy.observe(el); }

// Crew strip
const CREW = [
  { label: 'Clover', role: 'Assistant', look: { type: 'clover' } },
  { label: 'Ada', role: 'Research', look: { type: 'owl', glasses: 'round' } },
  { label: 'Bo', role: 'Voice', look: { type: 'droid', headphones: true, accessoryColor: '#f4efe6' } },
  { label: 'Dot', role: 'Support', look: { type: 'axolotl' } },
  { label: 'Echo', role: 'Orchestrator', look: { type: 'octo' } },
  { label: 'Fizz', role: 'Sales', look: { type: 'star', hat: 'crown' } },
  { label: 'Gus', role: 'Code review', look: { type: 'mech', hat: 'beanie', accessoryColor: '#e85d4a' } },
  { label: 'Hana', role: 'Writer', look: { type: 'flower', scarf: true, scarfColor: '#ffcf4a' } },
  { label: 'Iggy', role: 'Design', look: { type: 'blob', ears: 'bunny', preset: 'velvet' } },
  { label: 'Juno', role: 'Planner', look: { type: 'cloud', hat: 'beret' } },
  { label: 'Kit', role: 'Data', look: { type: 'drop', badge: 'AI' } },
  { label: 'Lux', role: 'Security', look: { type: 'pangolin', glasses: 'shades' } },
  { label: 'Mo', role: 'Finance', look: { type: 'hexagon', hat: 'tophat', bowTie: true } },
  { label: 'Pip', role: 'Tutor', look: { type: 'sprout', age: 0.55 } },
  { label: 'Rex', role: 'Sales', look: { type: 'fox' } },
  { label: 'Toast', role: 'Reminders', look: { type: 'toaster' } },
];
const WEAR_RESET = { hat: 'none', glasses: 'none', headphones: false, bowTie: false, blush: false, scarf: false, ears: 'none', antennae: 'auto', badge: undefined, preset: undefined, accessoryColor: undefined, scarfColor: undefined };
const crewEl = $('crew');
const crewCards = CREW.map((m, i) => {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'crew-card';
  card.setAttribute('aria-pressed', String(i === 0));
  card.setAttribute('aria-label', `Hire ${m.label}, ${m.role}`);
  const slot = document.createElement('div');
  slot.className = 'slot';
  card.append(slot);
  card.insertAdjacentHTML('beforeend', `<b>${m.label}</b><span>${m.role}</span><span class="hire">${i === 0 ? 'On duty' : 'Hire →'}</span>`);
  crewEl.append(card);
  whenNear(slot, () => createBot(slot, { ...m.look, face: 'mouth', size: 88, interactive: false, seed: (i * 0.37) % 1, label: m.label }));
  card.addEventListener('click', () => hire(i));
  return card;
});
async function hire(i) {
  const m = CREW[i];
  crewCards.forEach((c, j) => {
    c.setAttribute('aria-pressed', String(i === j));
    c.querySelector('.hire').textContent = i === j ? 'On duty' : 'Hire →';
  });
  look = { ...BASE_LOOK, label: m.label };
  bot.set({ ...WEAR_RESET, ...BASE_LOOK, ...m.look, label: m.label });
  log(`bot.set({ type: '${m.look.type}' })`);
  $('agent-name').textContent = m.label;
  input.placeholder = `Message ${m.label}…`;
  $('chat-avatar').style.setProperty('--c', presets[m.look.type]?.color || '#41c4ff');
  const demo = $('demo');
  if (demo.getBoundingClientRect().top < 0 || demo.getBoundingClientRect().bottom > innerHeight) demo.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
  if (!busy) respond('', { text: `Hi, I'm ${m.label}! I'll handle ${m.role.toLowerCase()}. What do you need?` });
}
$('chat-avatar').style.setProperty('--c', presets.clover.color);

// Feature cards
const featureBots = new Map();
for (const host of document.querySelectorAll('.vis-bot[data-bot]')) {
  whenNear(host, () => {
    const o = JSON.parse(host.dataset.bot);
    const b = createBot(host, { size: 88, face: 'mouth', seed: Math.random(), ...o });
    if (host.dataset.demo) featureBots.set(host.dataset.demo, b);
    DEMOS[host.dataset.demo]?.(b, host);
  });
}

// Cycles that run only while their card is on screen.
function whileVisible(el, every, step) {
  let t = 0;
  new IntersectionObserver(([e]) => {
    clearInterval(t);
    if (e.isIntersecting && !reduced) t = setInterval(step, every);
  }).observe(el);
}

const DEMOS = {
  states(b, host) {
    const seq = ['listening', 'thinking', 'speaking', 'success', 'working', 'error', 'sleeping', 'default'];
    let i = 0;
    whileVisible(host, 2000, () => { const s = seq[i++ % seq.length]; b.setState(s); $('states-label').textContent = WORDS[s] || s; });
  },
  say(b) {
    const btn = $('say-btn');
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const line = 'Hello! I can say anything you type.';
      if (has(b, 'say')) { try { await Promise.race([b.say(line), sleep(6000)]); } catch {} }
      else { b.setState('speaking'); b.setVoice?.(null); await sleep(2400); }
      b.setState('default');
      btn.disabled = false;
    });
  },
  moods(b, host) {
    const seq = ['happy', 'surprised', 'love', 'smug', 'confused', 'joy'];
    let i = 0;
    whileVisible(host, 2200, () => { const e = seq[i++ % seq.length]; b.react?.(e, 1.8); $('mood-label').textContent = e; });
  },
  toss(b) {
    // Before the toss feature lands, a click still makes it hop.
    b.canvas.title = 'Drag me';
  },
  export(b) {
    const btn = $('gif-btn');
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Rendering…';
      try {
        const blob = await b.export({ format: 'gif', duration: 2.4, fps: 20 });
        const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'bot.gif' });
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        btn.textContent = '✓ Saved';
      } catch { btn.textContent = 'Not supported'; }
      setTimeout(() => { btn.textContent = '⬇ GIF'; btn.disabled = false; }, 1800);
    });
  },
  async gpu(b) {
    await (b.ready || Promise.resolve());
    await sleep(400);
    $('p-gl').textContent = b.webgl ? 'WebGL2' : '2D canvas';
    $('p-thread').textContent = b.handle ? 'worker thread' : 'main thread';
    $('p-cores').textContent = String(navigator.hardwareConcurrency || '—');
  },
};

// Stress test: 40 bots, frame rate over three seconds.
const benchBtn = $('bench-run');
let benchBots = [];
benchBtn.addEventListener('click', async () => {
  if (benchBots.length) {
    benchBots.forEach((b) => b.destroy());
    benchBots = [];
    $('bench-grid').replaceChildren();
    $('bench-out').textContent = '';
    benchBtn.textContent = 'Run the test';
    return;
  }
  benchBtn.disabled = true;
  const grid = $('bench-grid');
  const shapes = Object.keys(presets);
  for (let i = 0; i < 40; i++) {
    const d = document.createElement('div');
    grid.append(d);
    benchBots.push(createBot(d, { type: shapes[i % shapes.length], size: 44, state: i % 3 ? 'default' : 'working', seed: i / 40, interactive: false }));
  }
  $('bench-out').textContent = 'Warming up…';
  await Promise.all(benchBots.map((b) => b.ready || 0));
  await sleep(800);
  $('bench-out').textContent = 'Measuring…';
  let frames = 0, worst = 0, last = performance.now();
  const t0 = last;
  await new Promise((done) => {
    const tick = (now) => {
      frames++;
      worst = Math.max(worst, now - last);
      last = now;
      if (now - t0 < 3000) requestAnimationFrame(tick); else done();
    };
    requestAnimationFrame(tick);
  });
  const fps = Math.round((frames * 1000) / (last - t0));
  const gl = benchBots[0].webgl ? 'WebGL' : '2D canvas';
  $('bench-out').textContent = `${fps} fps with 40 avatars (${gl}); longest frame ${Math.round(worst)} ms.`;
  benchBtn.textContent = 'Clear';
  benchBtn.disabled = false;
});
