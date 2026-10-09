// Social bots: avatars with `social` on notice each other. Now and then one
// glances at a neighbour (who may glance back), and when one is poked the
// others nearby look over, surprised or amused. One shared timer, a few times
// a second, reads where they are on screen; nothing runs per frame.

const members = new Set();
let timer = 0;
const STEP = 0.25;
/** Neighbours further apart than this (CSS pixels) ignore each other. */
export const REACH = 640;

/** The nearest few members to `m`, closest first, within REACH. */
export function neighbours(m, list, reach = REACH) {
  const out = [];
  for (const n of list) {
    if (n === m || !n.at) continue;
    const d = Math.hypot(n.at.x - m.at.x, n.at.y - m.at.y);
    if (d < reach) out.push({ n, d });
  }
  return out.sort((a, b) => a.d - b.d).map((o) => o.n);
}

function where(m) {
  const r = m.bot.canvas.getBoundingClientRect();
  if (!r.width) return null;
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** Look at `other` for `secs`, unless the bot is already watching something of its own. */
function glance(m, other, secs) {
  const own = m.bot._lookAt;
  if (own && own !== m.target) return;
  m.target = { x: other.at.x, y: other.at.y };
  m.watching = other;
  m.glance = secs;
  m.bot._lookAt = m.target;
}

function stopGlance(m) {
  if (m.bot._lookAt === m.target) m.bot._lookAt = null;
  m.target = m.watching = null;
  m.glance = 0;
}

function pulse() {
  const list = [];
  for (const m of members) {
    m.at = m.bot.visible ? where(m) : null;
    if (m.at) list.push(m);
  }
  for (const m of list) {
    if (m.glance > 0) {
      if ((m.glance -= STEP) <= 0 || !m.watching?.at) stopGlance(m);
      else { m.target.x = m.watching.at.x; m.target.y = m.watching.at.y; }
      continue;
    }
    if ((m.wait -= STEP) > 0 || m.bot.sim.state === 'sleeping') continue;
    m.wait = 4 + Math.random() * 9;
    const near = neighbours(m, list);
    // A neighbour that just looked over gets a look back; otherwise mostly the nearest.
    let other = m.prefer && near.includes(m.prefer) ? m.prefer : null;
    m.prefer = null;
    if (!other) {
      if (!near.length) continue;
      other = near[Math.random() < 0.7 ? 0 : Math.floor(Math.random() * Math.min(3, near.length))];
    }
    glance(m, other, 1.2 + Math.random() * 1.6);
    if (Math.random() < 0.45 && other.glance <= 0) { other.wait = Math.min(other.wait, 0.25 + Math.random() * 0.5); other.prefer = m; }
  }
  if (!members.size) { clearInterval(timer); timer = 0; }
}

function poked(m) {
  if (!m.at) return;
  for (const n of neighbours(m, [...members], REACH * 0.8)) {
    if (n.bot.sim.state === 'sleeping') continue;
    setTimeout(() => {
      if (!members.has(n) || !members.has(m)) return;
      n.bot.react(Math.random() < 0.55 ? 'surprised' : 'happy', 1.1);
      glance(n, m, 1.6);
      n.wait = Math.max(n.wait, 3);
    }, 120 + Math.random() * 260);
  }
}

export function install(bot) {
  const m = { bot, at: null, wait: 1 + Math.random() * 5, glance: 0, target: null, watching: null, prefer: null };
  let off = null;
  const join = () => {
    if (members.has(m)) return;
    members.add(m);
    m.at = where(m);
    off = bot.on('poke', () => poked(m));
    if (!timer) timer = setInterval(pulse, STEP * 1000);
  };
  const leave = () => {
    if (!members.delete(m)) return;
    off?.();
    stopGlance(m);
    for (const n of members) if (n.watching === m || n.prefer === m) { if (n.watching === m) stopGlance(n); n.prefer = null; }
  };
  if (bot.options.social) join();
  return {
    set(o) { if (o.social) join(); else leave(); },
    destroy: leave,
  };
}

/** For tests: the current members. */
export const _members = members;
