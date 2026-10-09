// Light / dark toggle shared by the site pages. The choice is remembered per
// browser. Pages also apply the saved choice with a one-line inline script in
// <head>, so there's no flash of the wrong theme before this module runs.
export function initTheme(button, onChange) {
  const root = document.documentElement;
  let saved = null;
  try { saved = localStorage.getItem('bots-theme'); } catch {}
  if (saved) root.dataset.theme = saved;
  const current = () => root.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const label = () => button?.setAttribute('aria-label', current() === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
  label();
  onChange?.(current());
  button?.addEventListener('click', () => {
    const next = current() === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    try { localStorage.setItem('bots-theme', next); } catch {}
    label();
    onChange?.(next);
  });
  return current;
}
