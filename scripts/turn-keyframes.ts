// Writes the demo's tab-turning keyframes into site/demo/demo.css: a tab
// turning a quarter about the square at its top as it moves to the start of
// its pane's head. Sampled along one ease, so every step can hold two edges
// in place: the square is lowered by as much as its corners would rise, and
// the pivot moves along by as much as the label swings out.
//
//   pnpm demo:turns

import { readFileSync, writeFileSync } from "node:fs";

import * as prettier from "prettier";

/** CSS's cubic-bezier(x1, y1, x2, y2), as progress for a time. */
function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const at = (t: number, a: number, b: number) =>
    3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
  return (x: number) => {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (at(mid, x1, x2) < x) lo = mid;
      else hi = mid;
    }
    return at((lo + hi) / 2, y1, y2);
  };
}

const ease = cubicBezier(0.2, 0, 0, 1);
const STEPS = 12;
const W = "var(--demo-tab-width)";

function num(x: number, places: number): string {
  const s = x.toFixed(places).replace(/\.?0+$/, "");
  return s === "-0" || s === "" ? "0" : s;
}

/** The tab at progress `q`: 0 upright where it stands, 1 turned onto the head. */
function pose(q: number): string {
  const theta = 90 * q;
  const r = (theta * Math.PI) / 180;
  const sin = Math.sin(r);
  const cos = Math.cos(r);
  // A square turned by theta about its middle stands half its width times
  // (cos + sin - 1) above where it stood; lowered by that, its top holds.
  const lower = (cos + sin - 1) / 2;
  // The label swings out (height - width/2) * sin + (width/2) * (cos - 1)
  // past the tab's start. The pivot moves the other way by as much, written
  // as a translate in the frame turned a quarter, so the far end holds.
  return [
    `translate(0, calc(${W} * ${num(lower, 4)}))`,
    "rotate(90deg)",
    `translate(0, calc((${W} / 2 - 100%) * ${num(sin, 4)} + ${W} / 2 * ${num(1 - cos, 4)}))`,
    "rotate(-90deg)",
    `rotate(${num(theta, 2)}deg)`,
  ].join(" ");
}

function step(offsets: number[], opacity: number, q: number): string {
  const at = offsets.map(o => `${num(o * 100, 2)}%`).join(", ");
  return `${at} { opacity: ${opacity}; transform: ${pose(q)}; }`;
}

/** Opening: turn and move over the first 58%, then give way to the head. */
function turnsIn(): string {
  const steps = [];
  for (let i = 0; i <= STEPS; i++) {
    steps.push(step([0.58 * (i / STEPS)], 1, ease(i / STEPS)));
  }
  steps.push(step([0.76, 1], 0, 1));
  return `@keyframes morph-tab-turns-in {\n${steps.join("\n\n")}\n}`;
}

/** Closing: out of the drawn-in head at 40-52%, then back to upright. */
function turnsOut(): string {
  const steps = [step([0, 0.4], 0, 1)];
  for (let i = 0; i <= STEPS; i++) {
    steps.push(step([0.52 + 0.48 * (i / STEPS)], 1, 1 - ease(i / STEPS)));
  }
  return `@keyframes morph-tab-turns-out {\n${steps.join("\n\n")}\n}`;
}

/** `css` with the whole `@keyframes name { … }` block replaced. */
function replaceKeyframes(css: string, name: string, block: string): string {
  const start = css.indexOf(`@keyframes ${name} {`);
  if (start < 0) throw new Error(`no @keyframes ${name} in demo.css`);
  let depth = 0;
  for (let i = css.indexOf("{", start); i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}" && --depth === 0) {
      return css.slice(0, start) + block + css.slice(i + 1);
    }
  }
  throw new Error(`@keyframes ${name} is not closed`);
}

const target = new URL("../site/demo/demo.css", import.meta.url);
let css = readFileSync(target, "utf8");
css = replaceKeyframes(css, "morph-tab-turns-in", turnsIn());
css = replaceKeyframes(css, "morph-tab-turns-out", turnsOut());
const options = await prettier.resolveConfig(target.pathname);
writeFileSync(
  target,
  await prettier.format(css, { ...options, filepath: target.pathname }),
);
console.log(`wrote ${target.pathname}`);
