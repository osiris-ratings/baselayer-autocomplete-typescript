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
  const [edges, setEdges] = useState({ before: false, after: false });
  const mark = () => {
    if (scroller.current !== null) setEdges(markEdges(scroller.current));
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

  // A page on, the first preset not wholly shown leads; a page back, the
  // first wholly shown one ends the page, as near as the snap allows.
  const turn = (direction: 1 | -1) => {
    const row = scroller.current!;
    const view = row.getBoundingClientRect();
    const pad = parseFloat(getComputedStyle(row).paddingLeft);
    const items = radios.current.flatMap(radio =>
      radio === null ? [] : [radio.getBoundingClientRect()],
    );
    const left =
      direction > 0
        ? (items.find(item => item.right > view.right - pad + 0.5)?.left ??
            view.right) -
          view.left -
          pad
        : (items.find(item => item.left >= view.left + pad - 0.5)?.right ??
            view.left) -
          view.right +
          pad;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    row.scrollBy({ left, behavior: reduced ? "auto" : "smooth" });
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
      <div className="presets-nav">
        <button
          type="button"
          aria-label="Earlier presets"
          disabled={!edges.before}
          onClick={() => turn(-1)}
        >
          ‹
        </button>
        <button
          type="button"
          aria-label="Later presets"
          disabled={!edges.after}
          onClick={() => turn(1)}
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
