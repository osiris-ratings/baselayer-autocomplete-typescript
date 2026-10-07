// The Components fold's row: a menu row drawn as its lines and their places,
// in the look being styled, and the row's whole configuration. Each kind of
// line has a switch: off, visible or enabled. A field is
// dragged by its place onto another place of its line, or onto the tray of
// fields the row leaves out; each place's chevron is a dropdown of what it can
// show. Pointer events, so a mouse and a finger drag the same way.

import type { LayoutOf, Relation, Route } from "@baselayer-sdk/autocomplete";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import {
  ADDRESS_EDITOR,
  BUSINESS_EDITOR,
  EMPTY_PLACE,
  PERSON_EDITOR,
  TRAY,
  editorOps,
  lineFields,
  lineKinds,
  lineState,
  withLineState,
  type LineKind,
  type LineState,
  type RowEditor,
  type StyleState,
} from "./style-state";

/** A place, or the tray: where a dragged field can land. */
type DropSpot = string;

/** How far a pointer travels before a press on a place is a drag. */
const DRAG_SLOP = 4;

/** "their addresses" as a hidden line's name starts it. */
function capitalized(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * The look's colors and corners, as the drawn row paints its places, and the
 * tint the menu gives the line under the pointer, which an enabled line takes.
 */
function rowMapColors(state: StyleState): CSSProperties {
  const { look, vars } = state;
  return {
    "--map-enabled-bg": vars["--bl-ac-highlight-bg"],
    "--map-bg": look.backgroundColor,
    "--map-border": vars["--bl-ac-border"],
    "--map-radius": vars["--bl-ac-radius"],
    "--map-pill-radius": vars["--bl-ac-pill-radius"],
    "--map-title": look.titleColor,
    "--map-subtitle": look.subtitleColor,
    "--map-pill-bg": look.pillBackgroundColor,
    "--map-pill-fg": look.pillForegroundColor,
    "--map-pill-border": look.primaryPillBorderColor,
    "--map-structure-bg": look.structurePillBackgroundColor,
    "--map-structure-fg": look.structurePillForegroundColor,
  } as CSSProperties;
}

/** What was picked up, as the ghost redraws it: its size, and where it was held. */
interface Lifted {
  /** A place in the row, or a chip on the tray. */
  chip: boolean;
  badge: boolean;
  width: number;
  height: number;
  grabX: number;
  grabY: number;
  /** The face's type and padding, which the panel's width may have changed. */
  face: CSSProperties;
}

interface Drag {
  field: string;
  lifted: Lifted;
  /** The pointer that carries it, or null when mouse events do (below). */
  pointerId: number | null;
  startX: number;
  startY: number;
  x: number;
  y: number;
  /** Past the slop: the ghost follows the pointer. */
  moving: boolean;
  /** The spot under the pointer, when it takes the field. */
  over: DropSpot | null;
}

/** The place or the tray under a point, read off the page. */
function spotAt(x: number, y: number): DropSpot | null {
  const target = document
    .elementFromPoint(x, y)
    ?.closest<HTMLElement>("[data-drop]");
  return (target?.dataset.drop as DropSpot | undefined) ?? null;
}

function measure(handle: HTMLElement, x: number, y: number): Lifted {
  const cell = handle.closest<HTMLElement>(".row-map-place, .row-map-chip");
  const box = (cell ?? handle).getBoundingClientRect();
  const face = getComputedStyle(
    cell?.querySelector(".row-map-face") ?? cell ?? handle,
  );
  return {
    chip: cell?.classList.contains("row-map-chip") ?? false,
    badge: cell?.dataset.badge !== undefined,
    width: box.width,
    height: box.height,
    grabX: x - box.left,
    grabY: y - box.top,
    face: {
      fontSize: face.fontSize,
      paddingLeft: face.paddingLeft,
      paddingRight: face.paddingRight,
    },
  };
}

function useFieldDrag(
  accepts: (field: string, to: DropSpot) => boolean,
  onDrop: (field: string, to: DropSpot) => void,
) {
  const [drag, setDrag] = useState<Drag | null>(null);
  // Read in the listeners, which a render may not have caught up with.
  const current = useRef<Drag | null>(null);
  const menu = useRef<HTMLSelectElement | null>(null);
  const latest = useRef({ accepts, onDrop });
  useLayoutEffect(() => {
    latest.current = { accepts, onDrop };
  });
  const update = (next: Drag | null) => {
    current.current = next;
    setDrag(next);
  };

  // A drag follows its pointer from the window, not from the handle: the
  // handle's capture can fail, as it does after a native menu closes. A drag
  // Safari began with a bare mousedown is followed by mouse events.
  const tracking = drag === null ? null : (drag.pointerId ?? "mouse");
  useEffect(() => {
    if (tracking === null) return;
    const byMouse = tracking === "mouse";
    const carries = (event: MouseEvent) =>
      byMouse || (event as PointerEvent).pointerId === tracking;
    const move = (event: MouseEvent) => {
      const now = current.current;
      if (now === null || !carries(event)) return;
      // The button is up: its release went where no listener heard it (a
      // context menu, another window), so the drag is over. Only a pointer
      // says so reliably; the mouse events Safari falls back to are left be.
      if (!byMouse && (event.buttons & 1) === 0) {
        update(null);
        return;
      }
      const moving =
        now.moving ||
        Math.hypot(event.clientX - now.startX, event.clientY - now.startY) >
          DRAG_SLOP;
      const spot = moving ? spotAt(event.clientX, event.clientY) : null;
      update({
        ...now,
        x: event.clientX,
        y: event.clientY,
        moving,
        over:
          spot !== null && latest.current.accepts(now.field, spot)
            ? spot
            : null,
      });
    };
    const up = (event: MouseEvent) => {
      const now = current.current;
      if (now === null || !carries(event)) return;
      update(null);
      if (now.moving) {
        // Where it is let go, which a scroll since the last move can change.
        const spot = spotAt(event.clientX, event.clientY);
        if (spot !== null && latest.current.accepts(now.field, spot)) {
          latest.current.onDrop(now.field, spot);
        }
        return;
      }
      // A press that never moved is a tap: it opens the place's menu.
      try {
        menu.current?.showPicker();
      } catch {
        // No picker without a user activation, or at all on an old browser:
        // the chevron is still there.
      }
    };
    const cancel = (event: MouseEvent) => {
      if (current.current !== null && carries(event)) update(null);
    };
    // Escape puts the field back; so does anything that takes the pointer
    // from the page before it is let go.
    const abandon = () => update(null);
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") abandon();
    };
    const [moveType, upType] = byMouse
      ? (["mousemove", "mouseup"] as const)
      : (["pointermove", "pointerup"] as const);
    window.addEventListener(moveType, move);
    window.addEventListener(upType, up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", escape);
    window.addEventListener("blur", abandon);
    window.addEventListener("contextmenu", abandon);
    return () => {
      window.removeEventListener(moveType, move);
      window.removeEventListener(upType, up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", escape);
      window.removeEventListener("blur", abandon);
      window.removeEventListener("contextmenu", abandon);
    };
  }, [tracking]);

  /** Lift a field from where a press landed, unless it landed on the chevron. */
  const lift = (
    event: ReactMouseEvent<HTMLElement>,
    field: string,
    pointerId: number | null,
  ): boolean => {
    if (event.button !== 0) return false;
    const grip = event.currentTarget.querySelector(".row-map-handle");
    if (grip !== null && event.clientX > grip.getBoundingClientRect().right) {
      return false; // The chevron: the menu opens as a menu does.
    }
    event.preventDefault();
    // A menu left focused would keep its ring through the drag.
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    menu.current = event.currentTarget.querySelector("select");
    update({
      field,
      lifted: measure(event.currentTarget, event.clientX, event.clientY),
      pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      moving: false,
      over: null,
    });
    return true;
  };

  /**
   * A place, or a chip on the tray, picks its field up on a press anywhere but
   * the chevron; the window follows the pointer from there. The place listens,
   * not its handle: after a native menu closes, a browser can route the next
   * press to the menu under the handle. Safari sends that press without a
   * pointerdown at all, so a mousedown no pointerdown began lifts it too.
   */
  const handle = (field: string) => ({
    onPointerDown(event: ReactPointerEvent<HTMLElement>) {
      if (!lift(event, field, event.pointerId)) return;
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // The window's listeners follow the pointer without it.
      }
    },
    onMouseDown(event: ReactMouseEvent<HTMLElement>) {
      if (current.current === null) lift(event, field, null);
    },
  });

  return { drag, handle };
}

/**
 * The field in flight: the cell it was lifted from, drawn again at its size
 * where the pointer holds it, and tilted.
 */
function Ghost({
  drag,
  colors,
  label,
}: {
  drag: Drag;
  colors: CSSProperties;
  label: string;
}) {
  const { lifted } = drag;
  const style: CSSProperties = {
    ...colors,
    left: drag.x - lifted.grabX,
    top: drag.y - lifted.grabY,
    width: lifted.width,
    height: lifted.height,
    transformOrigin: `${lifted.grabX}px ${lifted.grabY}px`,
  };
  return lifted.chip ? (
    <span
      className="row-map-chip row-map-ghost"
      data-field={drag.field}
      style={style}
    >
      {label}
    </span>
  ) : (
    <span
      className="row-map-place row-map-ghost"
      data-field={drag.field}
      data-badge={lifted.badge || undefined}
      style={style}
    >
      <span className="row-map-face" style={lifted.face}>
        {label}
      </span>
    </span>
  );
}

/**
 * The Components fold's row for one search: a business's, a person's or an
 * address's, each editing its own row in the style state. Its lines are
 * switched only through `withLineState`, so through `withListed` and
 * `withEnabled`, which keep a line the row does not draw from being enabled.
 */
export function RowMap({
  state,
  onChange,
  route = "businesses",
}: {
  state: StyleState;
  onChange(state: StyleState): void;
  route?: Route;
}) {
  const lines = {
    route,
    stateOf: (kind: LineKind) => lineState(state, route, kind),
    onLine: (kind: LineKind, to: LineState) =>
      onChange(withLineState(state, route, kind, to)),
    colors: rowMapColors(state),
  };
  switch (route) {
    case "people":
      return (
        <KindRowMap
          editor={PERSON_EDITOR}
          {...lines}
          layout={state.rows.people.layout}
          onLayout={layout =>
            onChange({
              ...state,
              rows: { ...state.rows, people: { ...state.rows.people, layout } },
            })
          }
        />
      );
    case "addresses":
      return (
        <KindRowMap
          editor={ADDRESS_EDITOR}
          {...lines}
          layout={state.rows.addresses.layout}
          onLayout={layout =>
            onChange({
              ...state,
              rows: {
                ...state.rows,
                addresses: { ...state.rows.addresses, layout },
              },
            })
          }
        />
      );
    case "businesses":
      return (
        <KindRowMap
          editor={BUSINESS_EDITOR}
          {...lines}
          layout={state.rows.businesses.layout}
          onLayout={layout =>
            onChange({
              ...state,
              rows: {
                ...state.rows,
                businesses: { ...state.rows.businesses, layout },
              },
            })
          }
        />
      );
  }
}

/** A switch's stops, in order, each with its glyph and what it says. */
const STOPS: readonly { value: LineState; label: string; title: string }[] = [
  { value: "off", label: "Off", title: "Off: not listed under each row" },
  {
    value: "visible",
    label: "Visible",
    title: "Visible: listed, and not a choice in the menu",
  },
  {
    value: "enabled",
    label: "Enabled",
    title: "Enabled: listed, and a choice in the menu",
  },
];

const GLYPHS: Record<LineState, ReactNode> = {
  off: (
    <>
      <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z" />
      <path d="M2.5 13.5 13.5 2.5" />
    </>
  ),
  visible: (
    <>
      <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z" />
      <circle cx="8" cy="8" r="2" />
    </>
  ),
  enabled: <path d="M4 2.5v10.25l2.6-2.4 1.7 3.9 1.8-.8-1.7-3.85H12L4 2.5Z" />,
};

/**
 * A line's switch: off, visible or enabled, as a group of radios the arrow
 * keys move through. A row always shows its head, so the head's Off is
 * disabled, and the keys pass it by.
 */
function LineSwitch({
  name,
  head,
  value,
  onSet,
}: {
  name: string;
  head: boolean;
  value: LineState;
  onSet(to: LineState): void;
}) {
  const stops = STOPS.map(stop => ({
    ...stop,
    disabled: head && stop.value === "off",
  }));
  const open = stops.filter(stop => !stop.disabled);
  const move = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (step === 0) return;
    event.preventDefault();
    const at = open.findIndex(stop => stop.value === value);
    const next = open[(at + step + open.length) % open.length]!.value;
    onSet(next);
    event.currentTarget.parentElement
      ?.querySelector<HTMLButtonElement>(`[data-stop="${next}"]`)
      ?.focus();
  };
  return (
    <span
      className="row-map-switch"
      role="radiogroup"
      aria-label={capitalized(name)}
    >
      {stops.map(stop => (
        <button
          key={stop.value}
          type="button"
          role="radio"
          className="row-map-stop"
          data-stop={stop.value}
          aria-label={stop.label}
          aria-checked={stop.value === value}
          disabled={stop.disabled}
          tabIndex={stop.value === value ? 0 : -1}
          title={stop.disabled ? "A row always shows its head" : stop.title}
          onClick={() => onSet(stop.value)}
          onKeyDown={move}
        >
          <svg
            viewBox="0 0 16 16"
            width="10"
            height="10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            focusable="false"
            aria-hidden="true"
          >
            {GLYPHS[stop.value]}
          </svg>
        </button>
      ))}
    </span>
  );
}

function KindRowMap<P extends string, F extends string>({
  editor,
  route,
  stateOf,
  onLine,
  layout,
  onLayout,
  colors,
}: {
  editor: RowEditor<P, F>;
  route: Route;
  /** How the row draws each of its line kinds. */
  stateOf(kind: LineKind): LineState;
  onLine(kind: LineKind, to: LineState): void;
  layout: LayoutOf<P, F>;
  onLayout(layout: LayoutOf<P, F>): void;
  colors: CSSProperties;
}) {
  const { canDrop, moveField, placeOptions, unplacedFields, withPlaced } =
    editorOps(editor);
  const kinds = lineKinds(route);
  /** The places of a line switched off: nothing moves into or out of them. */
  const frozen = new Set<string>(
    kinds
      .filter(kind => stateOf(kind) === "off")
      .flatMap(kind =>
        kind.lines.flatMap(({ lead, trailing }) => [
          lead.field,
          lead.badge,
          trailing.badge,
          trailing.field,
        ]),
      )
      .filter(spot => spot !== null && spot !== undefined),
  );
  /**
   * A field goes on a place of its own line that would draw it, or on the
   * tray: a gap of the row is no place, so it takes none. A line switched off
   * gives up no field to carry, and the tray holds none of its own.
   */
  const takes = (field: string, to: DropSpot) =>
    canDrop(layout, field as F, to as P);
  const { drag, handle } = useFieldDrag(takes, (field, to) =>
    onLayout(moveField(layout, field as F, to as P)),
  );
  const moving = drag?.moving === true ? drag : null;
  const over = moving?.over ?? null;
  /** While a field is dragged, every spot that takes it says so. */
  const accepts = (spot: DropSpot) =>
    moving !== null && takes(moving.field, spot) ? true : undefined;
  const kindName = (relation: Relation | null) =>
    editor.kindNames[relation ?? "head"] ?? "";

  /**
   * One place: its dropdown, and over all of it but the chevron, when it
   * holds a field, the handle that drags the field.
   */
  const place = (spot: P, { trailing = false, badge = false } = {}) => {
    const field = layout[spot];
    const choice: F | typeof EMPTY_PLACE = field ?? EMPTY_PLACE;
    const options = placeOptions(layout, spot);
    // Nothing the row would draw here: a badge beside an empty field, or the
    // second line's right with no lead.
    const closed = options.length === 1;
    const held = field !== null && !frozen.has(spot);
    return (
      <span
        className="row-map-place"
        data-drop={spot}
        data-field={choice}
        data-badge={badge || undefined}
        data-trailing={trailing || undefined}
        data-closed={closed || undefined}
        data-accepts={accepts(spot)}
        data-over={over === spot || undefined}
        data-dragged={
          moving !== null && moving.field === field ? true : undefined
        }
        {...(held ? handle(field) : {})}
        title={`${editor.placeLabels[spot]} · layout.${spot}${field === null ? "" : ` · reads ${editor.fieldWire[field].join(", ")}`}`}
      >
        {held && (
          <span
            className="row-map-handle"
            // The grab cursor and the finger's hold; the place takes the press.
            // The dropdown does the same, from a keyboard too.
            aria-hidden="true"
          />
        )}
        <span className="row-map-face" aria-hidden="true">
          {field === null ? "" : editor.fieldLabels[field]}
        </span>
        <select
          aria-label={editor.placeLabels[spot]}
          value={choice}
          disabled={closed || frozen.has(spot)}
          onChange={event =>
            onLayout(
              withPlaced(
                layout,
                spot,
                event.target.value as F | typeof EMPTY_PLACE,
              ),
            )
          }
        >
          {options.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </span>
    );
  };

  const shown = kinds.filter(kind => stateOf(kind) !== "off");
  /** The fields a drawn line can show: only those go on the tray and in the table. */
  const shownFields = new Set(
    shown.flatMap(kind => lineFields(route, kind.relation)),
  );
  const unplaced = unplacedFields(layout).filter(field =>
    shownFields.has(field),
  );
  return (
    <div className="row-map-wrap" style={colors}>
      <div
        className="row-map"
        role="group"
        aria-label="A row's places"
        data-dragging={moving !== null || undefined}
      >
        {kinds.map(kind => {
          const name = kindName(kind.relation);
          const relation = kind.relation;
          const value = stateOf(kind);
          return (
            <div
              key={relation ?? "head"}
              className="row-map-kind"
              data-relation={relation ?? "head"}
              data-state={value}
            >
              <span className="row-map-kind-controls">
                <LineSwitch
                  name={name}
                  head={relation === null}
                  value={value}
                  onSet={to => onLine(kind, to)}
                />
              </span>
              <div className="row-map-kind-lines">
                {kind.lines.map(({ line, lead, trailing }) => (
                  <div key={line} className="row-map-line">
                    {lead.field === null ? (
                      // A line is the entity it names, so its name always shows.
                      <span className="row-map-slot">
                        <button
                          type="button"
                          className="row-map-name"
                          disabled
                          title="The name, always shown"
                        >
                          <span className="row-map-name-long">
                            {editor.lineNames[line]?.long}
                          </span>
                          <span className="row-map-name-short">
                            {editor.lineNames[line]?.short}
                          </span>
                        </button>
                      </span>
                    ) : (
                      place(lead.field as P)
                    )}
                    {place(lead.badge as P, { badge: true })}
                    {place(trailing.badge as P, {
                      badge: true,
                      trailing: true,
                    })}
                    {place(trailing.field as P)}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div
        className="row-map-tray"
        data-drop={TRAY}
        data-accepts={accepts(TRAY)}
        data-over={over === TRAY || undefined}
      >
        <span className="row-map-tray-label">Not shown</span>
        {unplaced.length === 0 ? (
          <span className="row-map-tray-hint">
            Drag a field here to leave it out
          </span>
        ) : (
          unplaced.map(field => (
            <span
              key={field}
              className="row-map-chip"
              data-field={field}
              title={`Drag ${editor.fieldLabels[field]} onto a place · reads ${editor.fieldWire[field].join(", ")}`}
              {...handle(field)}
              data-dragged={moving?.field === field || undefined}
            >
              {editor.fieldLabels[field]}
            </span>
          ))
        )}
      </div>
      <details className="row-map-reads-fold">
        <summary>What each field reads</summary>
        <table className="row-map-reads">
          <thead>
            <tr>
              <th scope="col">Field</th>
              <th scope="col">From the autocomplete service&apos;s answer</th>
            </tr>
          </thead>
          <tbody>
            {editor.kind.fields
              .filter(field => shownFields.has(field))
              .map(field => (
                <tr key={field} data-field={field}>
                  <th scope="row">{editor.fieldLabels[field]}</th>
                  <td>
                    {editor.fieldWire[field].map(source => (
                      <code key={source}>{source}</code>
                    ))}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </details>
      {moving !== null &&
        createPortal(
          <Ghost
            drag={moving}
            colors={colors}
            label={editor.fieldLabels[moving.field as F]}
          />,
          document.body,
        )}
    </div>
  );
}
