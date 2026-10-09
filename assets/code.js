// Code blocks on the site pages: a tiny highlighter (comments, strings, tags,
// keywords, numbers), a copy button, and tab groups that switch between blocks.
// Colours only, so highlighting never moves anything on the page.

const KEYWORDS = 'import|from|export|const|let|var|function|return|await|async|for|of|in|if|else|new|default|true|false|null|undefined|while|try|catch|class|extends|this|typeof|script|setup';
const RE = new RegExp([
  /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->|(?:^|(?<=\s))#\s[^\n]*)/.source, // 1 comment
  /('(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`)/.source,             // 2 string
  /(<\/?[A-Za-z][\w.:-]*|\/>|(?<![=\-])>)/.source,                                    // 3 tag
  `\\b(${KEYWORDS})\\b`,                                                              // 4 keyword
  /\b(\d+(?:\.\d+)?)\b/.source,                                                       // 5 number
].join('|'), 'g');
const CLASS = [null, 'c', 's', 't', 'k', 'n'];
const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

export function highlight(text) {
  let out = '', last = 0;
  for (const m of text.matchAll(RE)) {
    const g = m.findIndex((v, i) => i > 0 && v !== undefined);
    out += esc(text.slice(last, m.index)) + `<span class="${CLASS[g]}">${esc(m[0])}</span>`;
    last = m.index + m[0].length;
  }
  return out + esc(text.slice(last));
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {}
  const ta = Object.assign(document.createElement('textarea'), { value: text });
  ta.style.cssText = 'position:fixed;opacity:0';
  document.body.append(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch {}
  ta.remove();
  return ok;
}

/** A copy button that copies whatever `get()` returns. */
export function copyButton(get, label = 'Copy') {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'copy-btn';
  b.textContent = label;
  b.setAttribute('aria-label', 'Copy code');
  b.addEventListener('click', async () => {
    const ok = await copyText(get());
    b.textContent = ok ? 'Copied' : 'Press ⌘C';
    b.classList.toggle('done', ok);
    setTimeout(() => { b.textContent = label; b.classList.remove('done'); }, 1400);
  });
  return b;
}

/** Highlight every `pre.code` under root (unless data-raw) and give it a copy button. */
export function enhanceCode(root = document) {
  for (const pre of root.querySelectorAll('pre.code')) {
    if (pre.dataset.ready) continue;
    pre.dataset.ready = '1';
    const text = pre.textContent;
    if (!('raw' in pre.dataset) && !pre.querySelector('span')) pre.innerHTML = highlight(text);
    if ('nocopy' in pre.dataset) continue;
    let box = pre.parentElement;
    if (!box.classList.contains('codebox')) {
      box = document.createElement('div');
      box.className = 'codebox';
      pre.replaceWith(box);
      box.append(pre);
    }
    box.append(copyButton(() => pre.textContent.replace(/^\$ /gm, '')));
  }
}

/**
 * Tabs: a [role=tablist] whose buttons carry aria-controls; the panels are
 * siblings with matching ids. Arrow keys move between tabs.
 */
export function initTabs(root = document) {
  for (const list of root.querySelectorAll('[role="tablist"]')) {
    const tabs = [...list.querySelectorAll('[role="tab"]')];
    const select = (tab, focus) => {
      for (const t of tabs) {
        const on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        const panel = document.getElementById(t.getAttribute('aria-controls'));
        if (panel) panel.hidden = !on;
      }
      if (focus) tab.focus();
      list.dispatchEvent(new CustomEvent('tabchange', { detail: tab.dataset.v }));
    };
    list.addEventListener('click', (e) => { const t = e.target.closest('[role="tab"]'); if (t) select(t); });
    list.addEventListener('keydown', (e) => {
      const i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      select(tabs[(i + d + tabs.length) % tabs.length], true);
    });
    select(tabs.find((t) => t.getAttribute('aria-selected') === 'true') || tabs[0]);
  }
}
