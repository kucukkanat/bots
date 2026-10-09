// Registers the site's service worker (offline support) and offers a reload
// when a new version has downloaded in the background.
const sw = navigator.serviceWorker;
if (sw && location.protocol !== 'file:') {
  const root = new URL('../', import.meta.url);
  addEventListener('load', async () => {
    try {
      const reg = await sw.register(new URL('sw.js', root), { scope: root.pathname });
      const offer = (worker) => worker && sw.controller && toast(() => worker.postMessage('skip-waiting'));
      offer(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => { if (w.state === 'installed') offer(w); });
      });
      let reloading = false;
      sw.addEventListener('controllerchange', () => { if (reloading) location.reload(); });
      function toast(apply) {
        if (document.getElementById('sw-toast')) return;
        const t = document.createElement('div');
        t.id = 'sw-toast';
        t.setAttribute('role', 'status');
        t.style.cssText = 'position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:1000;display:flex;gap:12px;align-items:center;padding:10px 12px 10px 16px;border-radius:14px;background:#17151f;color:#fff;font:500 14px/1.3 Inter,system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.25);max-width:calc(100vw - 32px)';
        t.innerHTML = '<span style="white-space:nowrap">New version ready</span>';
        const b = document.createElement('button');
        b.textContent = 'Reload';
        b.style.cssText = 'border:0;border-radius:9px;padding:6px 12px;background:#fff;color:#17151f;font:inherit;font-weight:600;cursor:pointer';
        b.onclick = () => { reloading = true; apply(); t.remove(); };
        t.append(b);
        document.body.append(t);
      }
    } catch {}
  });
}
