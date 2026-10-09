# Changelog

All notable changes to `@kucukkanat/bots` are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - 1.1.0

### Added
- The site is a PWA: installable (manifest, icons rendered from the plush bot),
  and offline after the first visit. Each deploy precaches the whole site as
  one versioned set (`scripts/precache.mjs` writes it into `sw.js`), so pages
  never mix files from two deploys; a new deploy offers a reload.
- **Agent features** (each a lazily loaded module): `bot.say(text, { wpm, append })`
  lip-syncs from text with no audio, and streams LLM tokens with `append`;
  `status` badges (`typing`, `loading`, `done`, `error`, `auto`); `mood`
  (`auto` drifts with play and idle time); `social` bots glance at each other.
  Bots with an eyes-only face show a mouth while talking.
- **Play**: `toss` (drag and throw), `petting` (strokes ruffle the fur and
  make it content), `sounds` (synthesized, opt-in); seasonal hat packs
  `packs/halloween`, `packs/winter`, `packs/party`.
- **Frameworks and stickers**: a Vue component (`/vue`), a Svelte action
  (`/svelte`); `bot.export({ format: 'sticker' })` and `exportStickers()` for
  a ZIP sticker pack with a `crew.json` of DNA codes.
- **Website**: a new landing page with a live agent-chat demo, docs pages
  (getting started, options, agent recipes, API, frameworks, plugins & packs,
  export, performance), shareable crew pages (`c/#t=…`), and a rebuilt Studio
  (three panes, settings in the URL, undo/redo, code for five frameworks).
- `npm run build` bundles the library into `dist/` with esbuild (the only dev
  dependency; the source stays dependency-free and runs unbundled from `src/`).
  Minified ES modules with source maps and shared chunks: `bots.js` (the
  library), `react.js` (plus `vue.js` and `svelte.js` where present), and
  separately loaded `render.js`, `gpu.js`, `export.js`, `worker.js`,
  `features/*.js` and `packs/*.js`. Type declarations are copied alongside.
- Package subpaths: `@kucukkanat/bots/react`, `/vue`, `/svelte`, `/export`,
  `/render` (the renderer, loaded synchronously) and `/packs/*`.
- `bot.toBlob({ full, scale, type, quality })`: the current frame as an image
  Blob, loading the renderer if it isn't loaded yet.
- `loadRenderer()`: loads the renderer on the main thread; `drawBot` needs it.
- `bot.ready` is now documented in the types, and resolves once the avatar has
  a renderer and has drawn its first frame.
- `npm run size` prints the gzipped size of every file in `dist/` and of each
  entry's eagerly loaded graph, and fails above the budgets in
  `scripts/size-budget.json` (the library entry: 18.5 KB gzipped).
- `npm run perf` (scripts/perf.mjs): draw time against v1.0.0, or between two
  option sets.
- CI runs tests, the build, the size budgets and the draw-time gate before
  deploying; the site now serves the bundle at
  `https://kucukkanat.github.io/bots/dist/bots.js`.
- Optional advanced features (from the 1.0.0 follow-ups): styles, agent states,
  expressions, voice, fur patterns, light rig, face styles, accessories,
  plugins (`registerShape`, `registerHat`, `registerState`), Bot DNA and export
  to GIF, APNG, WebM, sprite sheets and stills; a lazily loaded feature host.

### Changed
- The main thread no longer loads the renderer when avatars draw in worker
  threads. `render.js` and `gpu.js` load only when the main thread draws (no
  OffscreenCanvas or workers, a worker that failed to start, a canvas you pass
  in) or takes a snapshot, and otherwise once the page is first idle. What a
  page fetches before the first frame went from 60.9 KB to 30.3 KB gzipped
  unbundled (`src/`), or 17.7 KB gzipped from `dist/` (36.3 KB as one bundle
  before).
- The exporter (`exportBot`) loads on first use; it already returned a Promise.
- Geometry and style lists (`OVERSCAN`, `BODY`, `RISE`, `EYE_STYLES`,
  `MOUTH_STYLES`, `BROWS`, `EAR_STYLES`, `FUR_PATTERNS`, `HAT_STYLES`) live in
  `src/constants.js`; `render.js` still exports them.
- `package.json` points `main`, `module`, `types` and `exports` at `dist/`.
- The CDN snippet points at the bundle on GitHub Pages instead of jsDelivr.

### Notes on compatibility
- `bot.toDataURL()` stays synchronous. Called before the renderer has loaded on
  the main thread (within moments of the first avatar appearing), it returns
  `'data:,'` (an empty image, as an empty canvas gives), warns once, and starts
  the load. Use `await bot.toBlob()` to always get a picture.
- `drawBot` from the main entry throws until the renderer has loaded: call
  `await loadRenderer()` first, or import it from `@kucukkanat/bots/render`.

### Fixed
- Blank WebGL avatars after a larger one was drawn on the same thread.
- An infinite loop on load: the `style` option is now `preset`.

## [1.0.0] - 2026-10-09

### Added
- Animated plush bot avatars: eighteen 3D shapes with living faces, states,
  hats and glasses.
- WebGL2 rendering with a 2D canvas fallback, drawn in worker threads through
  OffscreenCanvas when the browser allows.
- `<bot-avatar>` custom element, JavaScript API (`createBot`, `BotAvatar`) and
  a React wrapper; no dependencies.

[Unreleased]: https://github.com/kucukkanat/bots/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/kucukkanat/bots/releases/tag/v1.0.0
