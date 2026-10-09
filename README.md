<p align="center"><img src="docs/hero.png" alt="bots — animated plush bot avatars for AI agents" width="100%" /></p>

# bots

Animated bot avatars for AI agents. Eighteen plush 3D shapes with living faces that look around, hop while they work and doze off between tasks — plus hats, glasses, headphones and bow ties. Drawn on a plain 2D canvas: no WebGL, no build step, no dependencies.

**[Live site](https://hackdonalds.github.io/bots/) · [Playground](https://hackdonalds.github.io/bots/playground/)**

<p align="center"><img src="docs/landing.png" alt="The bots landing page" width="100%" /></p>

A from-scratch, framework-agnostic homage to [bot-avatars](https://libraries.dev/bots) by Jakub Antalik (MIT; the type palette follows it).

## Shapes

All eighteen types, idle with eyes (left) and working with a mouth (right):

<p align="center">
  <img src="docs/gallery.png" alt="All eighteen bot types, idle, dark theme" width="49%" />
  <img src="docs/gallery-working.png" alt="All eighteen bot types, working with mouths, light theme" width="49%" />
</p>

## Use it

### Custom element

```html
<script type="module" src="https://hackdonalds.github.io/bots/src/index.js"></script>

<bot-avatar type="clover" state="working" size="96"></bot-avatar>
<bot-avatar type="cat" face="mouth" hat="party" bow-tie></bot-avatar>
```

Every option is an attribute in kebab-case. Change an attribute and the avatar eases into the new look.

### JavaScript

```js
import { createBot } from 'https://hackdonalds.github.io/bots/src/index.js';

const bot = createBot('#agent', { type: 'droid', size: 96, glasses: 'round' });
bot.setState('working');   // 'default' (idle) | 'working' | 'sleeping'
bot.set({ hat: 'crown' }); // change anything
bot.poke();                // hop and turn round
bot.toDataURL();           // PNG of the current frame
bot.destroy();
```

### React

```jsx
import { BotAvatar } from '@hackdonalds/bots/react';

<BotAvatar type="clover" state={busy ? 'working' : 'default'} size={64} />
```

## Options

| Option | Values | Default |
| --- | --- | --- |
| `type` | clover, flower, triangle, square, blob, ghost, circle, drop, star, droid, mech, alien, hexagon, cat, cloud, pill, pebble, puddle | `clover` |
| `state` | `default` (idle), `working`, `sleeping` | `default` |
| `face` | `eyes`, `mouth` | `eyes` |
| `size` | px | `64` |
| `path` | SVG path data in a 100×100 box centred on (50, 50) — your own outline | — |
| `color`, `ink` | body colour, face colour | type's own, auto |
| `brightness`, `saturation` | 0–2 | `1` |
| `shading` | `fabric` (plush fur), `plastic`, `smooth`, `crisp`, `flat` | `fabric` |
| `light` | degrees clockwise from the top | `295` |
| `shadow`, `highlight`, `rim` | 0–2 | per shading |
| `spread`, `depth` | how far the light wraps; thickness when turned | `1.4`, `0.65` |
| `furLength`, `furDensity`, `furFuzz`, `furCurl`, `furGravity` | fabric pile | `1`, `1.6`, `0.9`, `0.7`, `0.9` |
| `hat` | `none`, `beanie`, `party`, `crown`, `beret`, `tophat` | `none` |
| `glasses` | `none`, `round`, `square`, `shades` | `none` |
| `headphones`, `bowTie`, `blush` | boolean | `false` |
| `accessoryColor` | colour of hats, headphones, bow tie | soft black |
| `eyeSize`, `eyeGap`, `faceScale`, `eyeShine` | face tweaks | `1`, `1`, `1`, `true` |
| `speed`, `turn`, `jumpEvery` | animation speed, how far it looks round, seconds between idle jumps (0 = never) | `1`, `1`, `8` |
| `paused`, `pose` | freeze; hold a pose such as `{ yaw: 0.8 }` | `false` |
| `interactive` | eyes follow the pointer, click to hop | `true` |
| `seed` | 0–1, offsets blinks and glances | random |

`prefers-reduced-motion` shows each state's still pose. All avatars share one animation loop and pause when off screen.

## Playground

<p align="center"><img src="docs/playground.png" alt="The playground: a cat bot wearing a party hat, round glasses and a bow tie" width="100%" /></p>

`/playground/` lets you design a bot (shape, custom outline, colour, face, material, fur, things to wear, motion), turn it round by dragging, copy the code for HTML / JS / React, share a link, download a PNG, save a crew in your browser, and **publish to GitHub Pages**: it downloads a standalone `index.html` with your bot or crew, ready to upload to any repository with Pages turned on.

## How it renders

Every frame is plain 2D canvas, built to stay cheap with many avatars on a page:

- **Adaptive depth.** The body is its outline stacked through its depth, but only with as many slices as the turn needs: one when facing you, more (about 3 device pixels apart) as front and back pull apart.
- **Body layer, no clips.** Everything on the body (turn shading, fur, light, face) is painted into one shared offscreen layer with `source-atop`, then composited in a single draw of just the body's box.
- **Deferred, reused light.** Inner shadow, occlusion and rim are blurred in a small buffer (≈120 px) and stretched back over the crisp silhouette. Each avatar keeps its buffers between frames: a hop only shifts them, and they're re-lit only once the outline has changed by about a buffer pixel.
- **Baked plush.** The fur is baked once per look into a skin in the body's own coordinates and mapped onto the front of the body with the turn, so the pile stays on the surface. It's a combed flow field (hair grows from a crown and falls with gravity, twisted into clumps by noise), each strand a dark root and a pale tip lit with a Kajiya–Kay fibre term so the nap shows soft bands of sheen, plus mottling and grain. A fine fringe of strands, toned by the light, softens the silhouette.
- **Only draw what changed.** A frame is skipped when the pose has moved less than a quarter of a device pixel, so a resting avatar breathing in sub-pixel steps is mostly free. Off-screen and reduced-motion avatars don't animate.
- **Frame budget.** All avatars share one animation loop. When the page can't keep up, they take turns redrawing while their simulations keep real time, so the page keeps its frame rate.

`/bench/grid.html?n=30&size=96` (with `npm start` running) renders a grid of avatars and reports the frame rate.

## Develop

```bash
npm test          # unit tests (Node 18+)
npm start         # serves the site at http://localhost:8000
```

`node docs/screenshots.mjs` (with `npm start` running and Playwright installed) regenerates the images in `docs/`; the hero poster is `docs/poster.html`.

Pushing to `main` runs the tests and deploys the site with GitHub Actions (`.github/workflows/pages.yml`). In the repository settings, set **Pages → Source** to **GitHub Actions**.

## License

MIT
