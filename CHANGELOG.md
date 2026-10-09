# Changelog

All notable changes to `@kucukkanat/bots` are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.0] - 2026-10-09

The cast release: fourteen creatures beyond the first eighteen shapes, and the
three pieces of anatomy they needed.

### Added
- **Creatures** (`src/creatures/`, one module each): fox, pangolin, owl,
  axolotl, jelly, moth, sprout, octo, toaster, snail, comet, swarm, orb and
  glyph. Each is a preset plus parts, a temperament, option defaults, and for
  some a second outline or a lifecycle. `creatures` and `BASE_TYPES` are
  exported; `identity` keeps picking from the first eighteen.
- **Parts** (`src/parts.js`): tails, tendrils, wings, frills, arms, shells,
  plates, slots, popups, sprigs, knobs, spirals and streaks, drawn in a layer
  on, behind or in front of the body. Trailing parts lag with a spring the
  simulation runs (`pose.lagX/lagY`), wings and frills beat with `pose.flap`,
  arms light up with running tools (`pose.tools`, from the affect engine),
  a popup rises with `pose.pop` on success.
- **Bodies that change**: `morph` (another outline the body blends into in
  some states, `pose.morph`) and `stages` (a lifecycle blended by the `age`
  option). Blends are quantised and cached and keep the base fur skin.
- **Registers**: `shading: 'line'` (an outline only, flipping to light on
  dark pages) and `shading: 'swarm'` (dots that gather into the shape and
  scatter when it is low); `faceOn: 'talk'` hides the face until something
  is going on. Habit `swivel` (the owl's head turns right round while it
  thinks).
- `registerCreature(def)` and the `geometry` export (outline helpers moved to
  `src/geometry.js`), so creatures of your own use the same format.
- Studio: a Creatures section, an Age slider for lifecycle creatures, Line
  and Swarm materials, a see-through slider for glass, a face-only-while-busy
  toggle. Docs: "The cast".

## [1.2.0] - 2026-10-09

The character release: the bots stop being eighteen outlines with the same
face and become eighteen someones. Decided here, too: the avatars stay 2.5D.
The stacked-silhouette renderer already carries weight, light and fur better
than a first mesh pipeline would, so the money went on what makes a character
feel real (temperament, metamorphosis, materials, imperfection, and an avatar
that understands the agent) rather than on polygons. A true-3D surface
(spatial, AR) is a renderer behind the same DNA, when it comes.

### Added
- **The affect engine**: `bot.observe(event, data)` (`typing`, `sent`,
  `token`, `tool`, `tool-end`, `done`, `error`, `idle`, `reset`). It picks the
  states, the gaze, the reactions and the lip-sync from what the agent is
  doing: listens while the user types, thinks and frets when the first token
  is slow, says each token and reacts to the tone of every sentence, works
  through tool calls, celebrates once it has finished talking, gets sheepish at
  a run of errors, and with `affect: true` dozes off after two minutes of
  nothing. A lazily loaded module (`features/affect.js`); `<bot-avatar>` has
  `observe()` and an `affect` attribute. The landing page's chat now runs on it.
- **Temperaments**: every type is born with one (`src/temperament.js`): motion
  defaults, a lean on the resting face, and habits. Aloof cats look away from
  the pointer; shy ghosts duck and blush when poked; dreamy clouds and ghosts
  float with no landing squash; precise droids and steady mechs blink in a
  snap and power down to sleep; show-off stars spin twice. `temperament` picks
  another by name or `'none'`; anything you set wins over it.
- **Metamorphosis**: states change the body. Thinking stands tall, listening
  leans in, error slumps wider, sleeping flattens out (still poses too).
- **Materials**: `shading: 'glass'` (see-through, light pooling on the far
  side, a Fresnel rim, two window reflections; `opacity`) and
  `shading: 'lantern'` (lit from within, breathing, flaring when it thinks,
  talks or laughs, a halo behind the body; `glow`, `glowColor`). Presets
  `glass`, `lantern` and `ragdoll`.
- **Quirks**: `quirk` takes `patch` (sewn on, `patchColor`), `cowlick`,
  `scuff` and `stitches`, one or more.
- **Accessibility**: `announce: true` reads each change of state to screen
  readers from one shared polite live region (`features/announce.js`).
- Studio: Glass and Lantern materials with glow controls, a Quirks row, a
  Temperament picker under Motion, and an Observe group on the Agent tab that
  plays a reply, a tool call, a slow reply and an error through `observe()`.
- Docs: `observe()` leads the agent recipes; options for materials, quirks
  and temperaments.
- Tests for temperaments, habits, metamorphosis, the affect engine and the
  new options (`test/character.test.js`).

### Changed
- Size budgets rise with the character work (measured plus ~5%): the library
  entry is 19.9 KB gzipped (budget 21, was 18.5), the renderer 29.7 (budget
  31.2, was 28.5). `temperament.js` is loaded with the library, since the
  simulation needs it from the first frame; the affect engine is its own
  lazily loaded 1.8 KB module.

## [1.1.0]

### Added
- Things to wear, simplified: `wear` takes a list by name
  (`wear="party-hat round-glasses bow-tie"`, or an array). Each thing has a
  spot (head, eyes, ears, neck, chest) holding one thing; `wearColor` colours
  everything worn (the bandana and badge too, unless given their own).
  `wearables()`, `parseWear()`, `wornList()` and `spotOf()` are exported.
  Ears and antennae are body options. In the Studio, the Body tab holds body
  parts and the Wear tab is one collection with a "Wearing" row, outfits and
  seasonal hats; code snippets use the `wear` list.
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
  `scripts/size-budget.json` (the library entry: 19.3 KB gzipped).
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
