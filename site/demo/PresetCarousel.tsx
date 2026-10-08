import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import type { Route } from "@baselayer-sdk/autocomplete";

import { markEdges } from "./scroll-edges";
import {
  DEFAULT_STYLE,
  PRESETS,
  activePreset,
  applyPreset,
  lineKinds,
  nameSegment,
  type Preset,
  type StyleState,
} from "./style-state";

/** A page dot's room, and what the arrows and their gaps take from the row. */
const DOT = 22;
const ARROWS = 2 * 32 + 16;

/**
 * Where each page of the row starts: the first page at the start, each next
 * one at the first preset the page before shows only in part, the last one
 * where the row can scroll no further.
 */
function pageStarts(
  row: HTMLElement,
  radios: readonly (HTMLElement | null)[],
): number[] {
  const view = row.getBoundingClientRect();
  const pad = parseFloat(getComputedStyle(row).paddingLeft);
  const width = row.clientWidth - 2 * pad;
  const max = row.scrollWidth - row.clientWidth;
  // Each preset in the row's own coordinates: scrolling to `left` puts it first.
  const spans = radios.flatMap(radio => {
    if (radio === null) return [];
    const box = radio.getBoundingClientRect();
    const left = box.left - view.left + row.scrollLeft - pad;
    return [{ left, right: left + box.width }];
  });
  const starts = [0];
  for (;;) {
    const start = starts.at(-1)!;
    const next = spans.find(span => span.right > start + width + 0.5);
    if (next === undefined || start >= max - 0.5) break;
    const at = Math.min(next.left, max);
    if (at <= start + 0.5) break;
    starts.push(at);
  }
  return starts;
}

/** The arrow keys that move a radio group's choice, and which way. */
const STEPS: Readonly<Record<string, 1 | -1>> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
};

/**
 * The presets in one row that scrolls sideways, a page at a time from the
 * buttons below it, each edge shaded while there is more beyond it.
 */
export function PresetCarousel({
  state,
  onChange,
  route = "businesses",
}: {
  state: StyleState;
  onChange(state: StyleState): void;
  /** The search the form is on, whose row each swatch draws. */
  route?: Route;
}) {
  const active = activePreset(state);
  const scroller = useRef<HTMLDivElement | null>(null);
  const radios = useRef<(HTMLButtonElement | null)[]>([]);
  const nav = useRef<HTMLDivElement | null>(null);
  const [edges, setEdges] = useState({ before: false, after: false });
  const [pages, setPages] = useState({ starts: [0], current: 0, fit: true });
  // The edges, the pages and the one shown, whichever way the row moved.
  const mark = () => {
    const row = scroller.current;
    if (row === null) return;
    setEdges(markEdges(row));
    const starts = pageStarts(row, radios.current);
    const max = row.scrollWidth - row.clientWidth;
    const current =
      row.scrollLeft >= max - 1
        ? starts.length - 1
        : starts.reduce(
            (found, start, at) => (start <= row.scrollLeft + 1 ? at : found),
            0,
          );
    const room = (nav.current?.clientWidth ?? Infinity) - ARROWS;
    const fit = starts.length * DOT <= room;
    setPages(was =>
      was.current === current &&
      was.fit === fit &&
      was.starts.join() === starts.join()
        ? was
        : { starts, current, fit },
    );
  };
  useLayoutEffect(mark, []);
  useEffect(() => {
    if (scroller.current === null || typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(mark);
    observer.observe(scroller.current);
    return () => observer.disconnect();
  }, []);

  // To a page's start: the buttons a page either way, a dot its own page.
  const go = (page: number) => {
    const left =
      pages.starts[Math.max(0, Math.min(page, pages.starts.length - 1))]!;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    scroller.current!.scrollTo({ left, behavior: reduced ? "auto" : "smooth" });
  };
  // Arrow keys move the choice, as a radio group's do, and bring it into view.
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const step = STEPS[event.key];
    const from = radios.current.indexOf(event.target as HTMLButtonElement);
    if (step === undefined || from < 0) return;
    event.preventDefault();
    const to = (from + step + PRESETS.length) % PRESETS.length;
    onChange(applyPreset(state, PRESETS[to]!));
    const radio = radios.current[to]!;
    radio.focus();
    radio.scrollIntoView({ block: "nearest", inline: "nearest" });
  };
  // One tab stop: the chosen preset, or the first while none is.
  const stop = active === null ? 0 : PRESETS.indexOf(active);

  return (
    <>
      <div className="presets-frame">
        <div
          ref={scroller}
          className="presets"
          role="radiogroup"
          aria-label="Presets"
          onScroll={mark}
        >
          {PRESETS.map((preset, at) => (
            <button
              key={preset.name}
              ref={radio => {
                radios.current[at] = radio;
              }}
              type="button"
              role="radio"
              aria-checked={active?.name === preset.name}
              tabIndex={at === stop ? 0 : -1}
              className="preset"
              onClick={() => onChange(applyPreset(state, preset))}
              onKeyDown={onKeyDown}
            >
              <PresetSwatch preset={preset} route={route} />
              <span
                className="preset-name"
                style={{ fontFamily: preset.vars["--bl-ac-font"] }}
              >
                {preset.name}
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="presets-nav" ref={nav}>
        <button
          type="button"
          aria-label="Earlier presets"
          disabled={!edges.before}
          onClick={() => go(pages.current - 1)}
        >
          ‹
        </button>
        {pages.fit ? (
          <div className="presets-dots">
            {pages.starts.map((_, page) => (
              <button
                key={page}
                type="button"
                aria-label={`Page ${page + 1} of ${pages.starts.length}`}
                aria-current={page === pages.current || undefined}
                onClick={() => go(page)}
              />
            ))}
          </div>
        ) : (
          <p className="presets-page">
            {pages.current + 1} / {pages.starts.length}
          </p>
        )}
        <button
          type="button"
          aria-label="Later presets"
          disabled={!edges.after}
          onClick={() => go(pages.current + 1)}
        >
          ›
        </button>
      </div>
    </>
  );
}

/** The most lines a swatch draws, head included, so every swatch is one height. */
const SWATCH_LINES = 4;

/**
 * A preset drawn small, as its row draws on the search the form is on: each
 * line where the row puts it, a listed line indented, a square before any
 * name that carries an icon, and the title's first segment marked as matches
 * are.
 */
function PresetSwatch({ preset, route }: { preset: Preset; route: Route }) {
  const shown = applyPreset(DEFAULT_STYLE, preset);
  const { look, vars } = shown;
  const row = shown.rows[route];
  const layout: Readonly<Record<string, string | null>> = row.layout;
  const icons: readonly string[] = row.iconSegments;
  const kinds = lineKinds(route);
  // The head, then the lines in the order the row lists them.
  const ordered = [
    ...kinds.filter(kind => kind.relation === null),
    ...row.list.flatMap(relation =>
      kinds.filter(kind => kind.relation === relation),
    ),
  ];
  const lines = ordered
    .flatMap(kind =>
      kind.lines.map(line => ({ kind, line, head: kind.relation === null })),
    )
    // A line with no name and nothing in its places is not drawn.
    .filter(
      ({ line }) =>
        line.lead.field === null ||
        [
          line.lead.field,
          line.lead.badge,
          line.trailing.badge,
          line.trailing.field,
        ].some(place => layout[place] != null),
    )
    .slice(0, SWATCH_LINES);
  const step = 9 * (parseFloat(vars["--bl-ac-line-height"]) / 1.5 || 1);
  const glyph = (field: string | null, head: boolean, key: string) => {
    switch (field) {
      case null:
        return null;
      case "states":
        return (
          <span
            key={key}
            className="preset-pill"
            data-field="states"
            style={{
              background: look.pillBackgroundColor,
              color: look.pillForegroundColor,
              borderColor: look.primaryPillBorderColor,
              borderRadius: vars["--bl-ac-pill-radius"],
              fontFamily: vars["--bl-ac-font"] || undefined,
            }}
          >
            {head ? "PA" : ""}
          </span>
        );
      case "structure":
        return (
          <span
            key={key}
            className="preset-square"
            data-field="structure"
            style={{
              background: look.structurePillBackgroundColor,
              borderColor: look.structurePillForegroundColor,
              borderRadius: vars["--bl-ac-pill-radius"],
            }}
          />
        );
      default:
        return (
          <span
            key={key}
            className="preset-bar"
            data-field={field}
            data-long={
              field === "address" || field === "firstAddress" || undefined
            }
            style={{ background: look.subtitleColor }}
          />
        );
    }
  };
  return (
    <span
      className="preset-swatch"
      aria-hidden="true"
      style={{
        background: look.backgroundColor,
        borderRadius: vars["--bl-ac-radius"],
        gap: `${Math.max(4, step - 5)}px`,
      }}
    >
      {lines.map(({ kind, line, head }, at) => {
        const named = line.lead.field === null;
        const segment = named
          ? nameSegment(route, kind.relation, line.line)
          : null;
        const iconed = segment !== null && icons.includes(segment);
        return (
          <span
            key={at}
            className="preset-line"
            data-relation={kind.relation ?? "head"}
            data-indent={!head || undefined}
          >
            {iconed && (
              <span
                className="preset-icon"
                style={{ background: look.titleColor }}
              />
            )}
            {named ? (
              head && at === 0 ? (
                <Title look={look} vars={vars} />
              ) : (
                <span
                  className="preset-bar preset-name-bar"
                  style={{
                    background: head ? look.titleColor : look.subtitleColor,
                  }}
                />
              )
            ) : (
              glyph(layout[line.lead.field!] ?? null, head, "lead")
            )}
            {glyph(layout[line.lead.badge] ?? null, head, "badge")}
            <span className="preset-gap" />
            {glyph(layout[line.trailing.badge] ?? null, head, "trailing-badge")}
            {glyph(layout[line.trailing.field] ?? null, head, "trailing")}
          </span>
        );
      })}
    </span>
  );
}

/**
 * The row's name, its first segment marked as the preset marks a match: a bar
 * under it, a block behind it, or in the mark's ink, heavier for weight.
 */
function Title({
  look,
  vars,
}: {
  look: StyleState["look"];
  vars: StyleState["vars"];
}) {
  const emphasis = look.matchEmphasis;
  const color =
    look.matchEmphasisColor ??
    (emphasis === "underline"
      ? vars["--bl-ac-underline"]
      : emphasis === "background"
        ? vars["--bl-ac-marker"]
        : vars["--bl-ac-ink-mark"] || look.titleColor);
  const inked = emphasis === "ink" || emphasis === "weight";
  return (
    <span className="preset-title">
      <span
        className="preset-mark"
        data-emphasis={emphasis}
        style={{
          background: inked ? color : look.titleColor,
          ...(emphasis === "background"
            ? { boxShadow: `0 0 0 2px ${color}` }
            : {}),
          ...(emphasis === "underline"
            ? { boxShadow: `0 3px 0 -1px ${color}` }
            : {}),
        }}
      />
      <span
        className="preset-title-rest"
        style={{ background: look.titleColor }}
      />
    </span>
  );
}
