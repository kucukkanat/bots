// Small helpers for writing hat layers: SVG path strings in the 100×100 hat
// box (bottom centre (50, 100) sits on the top of the head; light from the
// upper left, as on the body).

const r = (v) => Math.round(v * 100) / 100;

/** An ellipse as path data. */
export const ellipse = (cx, cy, rx, ry = rx) =>
  `M${r(cx - rx)} ${r(cy)}A${r(rx)} ${r(ry)} 0 1 1 ${r(cx + rx)} ${r(cy)}A${r(rx)} ${r(ry)} 0 1 1 ${r(cx - rx)} ${r(cy)}Z`;

/** Several circles in one path: [[x, y, r], …]. */
export const dots = (list) => list.map(([x, y, rr]) => ellipse(x, y, rr)).join('');

/** A rounded rectangle. */
export function roundRect(x, y, w, h, rad) {
  const q = Math.min(rad, w / 2, h / 2);
  return `M${r(x + q)} ${r(y)}H${r(x + w - q)}A${r(q)} ${r(q)} 0 0 1 ${r(x + w)} ${r(y + q)}V${r(y + h - q)}`
    + `A${r(q)} ${r(q)} 0 0 1 ${r(x + w - q)} ${r(y + h)}H${r(x + q)}A${r(q)} ${r(q)} 0 0 1 ${r(x)} ${r(y + h - q)}`
    + `V${r(y + q)}A${r(q)} ${r(q)} 0 0 1 ${r(x + q)} ${r(y)}Z`;
}

/**
 * Mirror path data left↔right about x = 50. Absolute M, L, C, Q, S, T, H, V
 * and Z only (write arcs with ellipse()).
 */
export function mirror(d) {
  return d.replace(/([MLCQSTHV])([^MLCQSTHVZ]*)/g, (_, cmd, args) => {
    const n = args.trim().split(/[\s,]+/).filter(Boolean).map(Number);
    if (cmd === 'V') return cmd + n.join(' ');
    if (cmd === 'H') return cmd + n.map((x) => r(100 - x)).join(' ');
    return cmd + n.map((v, i) => (i % 2 ? v : r(100 - v))).join(' ');
  });
}

/** A path and its mirror image, as one path. */
export const both = (d) => d + mirror(d);
