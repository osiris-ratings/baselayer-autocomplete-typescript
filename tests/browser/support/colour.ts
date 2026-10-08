// Colour measures for the browser tests: WCAG contrast and CIEDE2000.

export type Rgb = [number, number, number];

/** A computed colour, drawn over `under` where it is see-through. */
export function rgb(color: string, under: Rgb = [255, 255, 255]): Rgb {
  const srgb =
    /^color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)$/.exec(color);
  const [r, g, b, a] = srgb
    ? [
        Number(srgb[1]) * 255,
        Number(srgb[2]) * 255,
        Number(srgb[3]) * 255,
        srgb[4] === undefined ? 1 : Number(srgb[4]),
      ]
    : [...color.matchAll(/[\d.]+/g)].map(found => Number(found[0]));
  const alpha = a ?? 1;
  return [r!, g!, b!].map(
    (channel, at) => under[at]! + (channel - under[at]!) * alpha,
  ) as Rgb;
}

function linear(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance([r, g, b]: Rgb): number {
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** WCAG's contrast ratio. */
export function contrast(a: Rgb, b: Rgb): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
}

/** CIELAB under D65. */
export function lab([r, g, b]: Rgb): Rgb {
  const [lr, lg, lb] = [linear(r), linear(g), linear(b)];
  const x = (0.4124 * lr + 0.3576 * lg + 0.1805 * lb) / 0.95047;
  const y = 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
  const z = (0.0193 * lr + 0.1192 * lg + 0.9505 * lb) / 1.08883;
  const f = (t: number) =>
    t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116;
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

const radians = (degrees: number) => (degrees * Math.PI) / 180;

/** CIEDE2000 between two CIELAB colours. */
export function deltaE00([l1, a1, b1]: Rgb, [l2, a2, b2]: Rgb): number {
  const chroma = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
  const g = 0.5 * (1 - Math.sqrt(chroma ** 7 / (chroma ** 7 + 25 ** 7)));
  const [p1, p2] = [(1 + g) * a1, (1 + g) * a2];
  const [c1, c2] = [Math.hypot(p1, b1), Math.hypot(p2, b2)];
  const hue = (b: number, a: number) =>
    ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  const [h1, h2] = [hue(b1, p1), hue(b2, p2)];
  const turn = h2 - h1;
  const dh =
    c1 * c2 === 0
      ? 0
      : Math.abs(turn) <= 180
        ? turn
        : turn > 180
          ? turn - 360
          : turn + 360;
  const dHue = 2 * Math.sqrt(c1 * c2) * Math.sin(radians(dh / 2));
  const lMean = (l1 + l2) / 2;
  const cMean = (c1 + c2) / 2;
  const hMean =
    c1 * c2 === 0
      ? h1 + h2
      : Math.abs(h1 - h2) <= 180
        ? (h1 + h2) / 2
        : h1 + h2 < 360
          ? (h1 + h2 + 360) / 2
          : (h1 + h2 - 360) / 2;
  const t =
    1 -
    0.17 * Math.cos(radians(hMean - 30)) +
    0.24 * Math.cos(radians(2 * hMean)) +
    0.32 * Math.cos(radians(3 * hMean + 6)) -
    0.2 * Math.cos(radians(4 * hMean - 63));
  const sl =
    1 + (0.015 * (lMean - 50) ** 2) / Math.sqrt(20 + (lMean - 50) ** 2);
  const sc = 1 + 0.045 * cMean;
  const sh = 1 + 0.015 * cMean * t;
  const rc = 2 * Math.sqrt(cMean ** 7 / (cMean ** 7 + 25 ** 7));
  const rt =
    -Math.sin(radians(60 * Math.exp(-(((hMean - 275) / 25) ** 2)))) * rc;
  const [dl, dc, dhs] = [(l2 - l1) / sl, (c2 - c1) / sc, dHue / sh];
  return Math.sqrt(dl ** 2 + dc ** 2 + dhs ** 2 + rt * dc * dhs);
}

export const distance = (a: Rgb, b: Rgb) => deltaE00(lab(a), lab(b));

/** The colour an element is drawn on: its own, or the nearest it sits on. */
export function ground(element: Element): Rgb {
  const layers: string[] = [];
  for (let at: Element | null = element; at; at = at.parentElement) {
    layers.unshift(getComputedStyle(at).backgroundColor);
  }
  return layers.reduce<Rgb>(
    (under, color) => rgb(color, under),
    [255, 255, 255],
  );
}
