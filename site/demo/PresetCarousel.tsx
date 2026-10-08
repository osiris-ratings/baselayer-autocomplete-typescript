import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { markEdges } from "./scroll-edges";
import {
  DEFAULT_STYLE,
  PRESETS,
  activePreset,
  applyPreset,
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
}: {
  state: StyleState;
  onChange(state: StyleState): void;
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
              <PresetSwatch preset={preset} />
              <span className="preset-name">{preset.name}</span>
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

/** A preset drawn small: its card, title, mark, flag and subtitle. */
function PresetSwatch({ preset }: { preset: Preset }) {
  const shown = applyPreset(DEFAULT_STYLE, preset);
  return (
    <span
      className="preset-swatch"
      aria-hidden="true"
      style={{
        background: shown.look.backgroundColor,
        borderRadius: shown.vars["--bl-ac-radius"],
      }}
    >
      <span
        className="preset-title"
        style={{ background: shown.look.titleColor }}
      />
      <span
        className="preset-mark"
        style={{ background: shown.vars["--bl-ac-underline"] }}
      />
      <span
        className="preset-pill"
        style={{
          background: shown.look.pillBackgroundColor,
          color: shown.look.pillForegroundColor,
          borderColor: shown.look.primaryPillBorderColor,
          borderRadius: shown.vars["--bl-ac-pill-radius"],
        }}
      >
        PA
      </span>
      <span
        className="preset-sub"
        style={{ background: shown.look.subtitleColor }}
      />
    </span>
  );
}
