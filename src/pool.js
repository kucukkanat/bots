// Where avatars get drawn. Each avatar's canvas is handed to a worker thread
// when the browser can (OffscreenCanvas), so drawing runs off the main thread
// and avatars spread over several cores; each worker paints with WebGL2 when
// it has it and with the 2D canvas otherwise. Without workers, the same
// renderer runs on the main thread.
//
// A worker is only trusted once it has started and said so; until then, and
// if it never does, avatars stay on the main thread. Each worker has at most
// one batch of frames in flight: while it's busy, newer poses replace queued
// ones, so a slow thread draws less often instead of falling behind.

import { GpuBody } from './gpu.js';

/** Global switches. Change them before the first avatar is created. */
export const settings = {
  /** Draw in worker threads when the browser supports it. */
  workers: true,
  /** At most this many worker threads. */
  maxWorkers: 4,
  /**
   * Use WebGL even when it's emulated in software (no GPU, or a blocked
   * one). Far slower than the 2D canvas; for tests on such machines only.
   */
  softwareWebGL: false,
};

/** Frames drawn so far, on every thread (for benchmarks). */
export const stats = { drawn: 0 };

let mainGpu;
/** The main thread's WebGL2 renderer, or null. */
export function mainThreadGpu() {
  if (mainGpu === undefined) {
    mainGpu = GpuBody.create({ allowSoftware: settings.softwareWebGL });
    if (mainGpu) mainGpu.keep = settings.softwareWebGL;
  }
  return mainGpu && mainGpu.ok ? mainGpu : null;
}

const canTransfer = () => typeof HTMLCanvasElement !== 'undefined'
  && typeof Worker !== 'undefined'
  && 'transferControlToOffscreen' in HTMLCanvasElement.prototype;

function workerUrl() {
  const url = new URL('./worker.js', import.meta.url);
  if (typeof location === 'undefined' || url.origin === location.origin) return url;
  // A worker script must be same-origin: load the library through a stub.
  const stub = new Blob([`import ${JSON.stringify(url.href)};`], { type: 'text/javascript' });
  return URL.createObjectURL(stub);
}

class WorkerPool {
  constructor(n) {
    this.workers = [];
    this.next = 0;
    this.ids = 0;
    this.gpu = true;
    let url;
    try { url = workerUrl(); } catch { url = null; }
    const starts = [];
    for (let i = 0; url && i < n; i++) starts.push(this._start(url));
    this.ready = Promise.all(starts).then((ok) => {
      this.workers = this.workers.filter((w, i) => ok[i]);
      this.gpu = this.workers.length > 0 && this.workers.every((w) => w.gpu);
      this.failed = this.workers.length === 0;
      return !this.failed;
    });
  }

  _start(url) {
    return new Promise((resolve) => {
      let w;
      try { w = new Worker(url, { type: 'module' }); } catch { resolve(false); return; }
      const rec = { w, queue: [], pending: new Map(), busy: false, gpu: false, bots: 0 };
      this.workers.push(rec);
      const timer = setTimeout(() => { w.terminate(); resolve(false); }, 4000);
      w.postMessage({ init: { softwareWebGL: settings.softwareWebGL } });
      w.onerror = () => { clearTimeout(timer); rec.busy = false; resolve(false); };
      w.onmessage = ({ data }) => {
        if (data.type === 'ready') { clearTimeout(timer); rec.gpu = data.gpu; resolve(true); }
        else if (data.type === 'done') {
          stats.drawn += data.drawn;
          rec.busy = false;
          if (rec.pending.size) this._schedule();
        }
      };
    });
  }

  /** Hand a transferred canvas to the least busy worker. */
  attach(canvas, init) {
    const rec = this.workers.reduce((a, b) => (b.bots < a.bots ? b : a));
    rec.bots++;
    const id = ++this.ids;
    rec.queue.push({ op: 'add', id, canvas, ...init });
    rec.transfer = [...(rec.transfer || []), canvas];
    this._schedule();
    return { id, rec };
  }

  post(h, msg) { h.rec.queue.push({ ...msg, id: h.id }); this._schedule(); }

  frame(h, f) { h.rec.pending.set(h.id, f); this._schedule(); }

  remove(h) {
    h.rec.pending.delete(h.id);
    h.rec.bots--;
    this.post(h, { op: 'remove' });
  }

  _schedule() {
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => this._flush());
  }

  _flush() {
    this.scheduled = false;
    for (const rec of this.workers) {
      const draws = rec.busy ? [] : [...rec.pending];
      if (!rec.queue.length && !draws.length) continue;
      if (draws.length) { rec.busy = true; rec.pending.clear(); }
      rec.w.postMessage({ msgs: rec.queue, draws }, rec.transfer || []);
      rec.queue = [];
      rec.transfer = null;
    }
  }
}

let pool;
/** The worker pool, or null where workers can't draw. */
export function workerPool() {
  if (!settings.workers || !canTransfer()) return null;
  if (pool === undefined) {
    const cores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 2;
    pool = new WorkerPool(Math.max(1, Math.min(settings.maxWorkers, cores - 1)));
  }
  return pool.failed ? null : pool;
}
