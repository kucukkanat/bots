// Colour helpers. Everything works on #rrggbb strings and plain numbers so it
// can run in Node (tests) as well as the browser.

export const clamp = (v, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);

export function parseColor(input) {
  let s = String(input || '').trim().toLowerCase();
  if (s[0] === '#') s = s.slice(1);
  if (s.length === 3 || s.length === 4) s = s.slice(0, 3).split('').map((c) => c + c).join('');
  if (s.length === 8) s = s.slice(0, 6);
  if (!/^[0-9a-f]{6}$/.test(s)) return null;
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}

export function toHex([r, g, b]) {
  const h = (v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

export function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

export function hslToRgb([h, s, l]) {
  h = ((h % 360) + 360) % 360 / 360;
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

/** Scale brightness (lightness) and saturation of a colour. 1 = unchanged. */
export function adjust(hex, { brightness = 1, saturation = 1 } = {}) {
  const rgb = parseColor(hex);
  if (!rgb) return hex;
  const [h, s, l] = rgbToHsl(rgb);
  const nl = brightness >= 1 ? l + (1 - l) * clamp(brightness - 1, 0, 1) * 0.9 : l * clamp(brightness, 0, 1);
  return toHex(hslToRgb([h, clamp(s * saturation), clamp(nl)]));
}

// The renderer asks for the same few derived colours every frame: remember
// them rather than re-parse and convert each time.
const memo = new Map();
function remember(key, make) {
  let v = memo.get(key);
  if (v === undefined) {
    if (memo.size > 4096) memo.clear();
    memo.set(key, (v = make()));
  }
  return v;
}

/** Shift lightness by `amount` (-1..1) and hue by `hue` degrees. */
export function shade(hex, amount, hue = 0, sat = 1) {
  return remember(`s${hex}|${amount}|${hue}|${sat}`, () => shadeNow(hex, amount, hue, sat));
}
function shadeNow(hex, amount, hue, sat) {
  const rgb = parseColor(hex);
  if (!rgb) return hex;
  const [h, s, l] = rgbToHsl(rgb);
  // Deepen the colour as it darkens so shadows stay rich rather than grey.
  const ns = amount < 0 ? clamp(s * sat * (1 - amount * 0.35)) : clamp(s * sat * (1 - amount * 0.25));
  return toHex(hslToRgb([h + hue, ns, clamp(l + amount)]));
}

export function mix(a, b, t) {
  return remember(`m${a}|${b}|${t}`, () => mixNow(a, b, t));
}
function mixNow(a, b, t) {
  const A = parseColor(a), B = parseColor(b);
  if (!A || !B) return a;
  return toHex([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
}

export function rgba(hex, alpha) {
  return remember(`r${hex}|${alpha}`, () => {
    const c = parseColor(hex) || [0, 0, 0];
    return `rgba(${c[0]},${c[1]},${c[2]},${clamp(alpha)})`;
  });
}

/** Relative luminance (WCAG). */
export function luminance(hex) {
  const c = parseColor(hex);
  if (!c) return 0;
  const lin = (v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
}

/** Face ink for a body colour: dark on light bodies, light on dark ones. */
export function autoInk(body) {
  return luminance(body) < 0.18 ? '#f7f5ff' : '#17151f';
}
