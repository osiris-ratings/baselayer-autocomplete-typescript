// The Components fold's row: a menu row drawn as its places, in the look
// being styled. A field is dragged by its place onto another place, or onto
// the tray of fields the row leaves out; each place's chevron is a dropdown of
// what it can show. Pointer events, so a mouse and a finger drag the same way.

import {
  ROW_FIELDS,
  ROW_LINES,
  type RowField,
  type RowPlace,
} from "@baselayer-sdk/autocomplete";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";

import {
  CHOICE_LABELS,
  EMPTY_PLACE,
  FIELD_WIRE,
  PLACE_LABELS,
  TRAY,
  canDrop,
  moveField,
  placeOptions,
  unplacedFields,
  withPlaced,
  type DropSpot,
  type PlaceChoice,
  type StyleState,
} from "./style-state";

/** How far a pointer travels before a press on a place is a drag. */
const DRAG_SLOP = 4;

/** The look's colors and corners, as the drawn row paints its places. */
function rowMapColors(state: StyleState): CSSProperties {
  const { look, vars } = state;
  return {
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
  field: RowField;
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
    cell?.querySelector("select") ?? cell ?? handle,
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
  accepts: (field: RowField, to: DropSpot) => boolean,
  onDrop: (field: RowField, to: DropSpot) => void,
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
    field: RowField,
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
  const handle = (field: RowField) => ({
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
function Ghost({ drag, colors }: { drag: Drag; colors: CSSProperties }) {
  const { lifted } = drag;
  const label = CHOICE_LABELS[drag.field];
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

export function RowMap({
  state,
  onChange,
}: {
  state: StyleState;
  onChange(state: StyleState): void;
}) {
  const { drag, handle } = useFieldDrag(
    (field, to) => canDrop(state.layout, field, to),
    (field, to) =>
      onChange({ ...state, layout: moveField(state.layout, field, to) }),
  );
  const moving = drag?.moving === true ? drag : null;
  const over = moving?.over ?? null;
  /** While a field is dragged, every spot that takes it says so. */
  const accepts = (spot: DropSpot) =>
    moving !== null && canDrop(state.layout, moving.field, spot)
      ? true
      : undefined;
  const colors = rowMapColors(state);

  /**
   * One place: its dropdown, and over all of it but the chevron, when it
   * holds a field, the handle that drags the field.
   */
  const place = (spot: RowPlace, { trailing = false, badge = false } = {}) => {
    const field = state.layout[spot];
    const choice: PlaceChoice = field ?? EMPTY_PLACE;
    const options = placeOptions(state.layout, spot);
    // Nothing the row would draw here: a badge beside an empty field, or the
    // second line's right with no lead.
    const closed = options.length === 1;
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
        {...(field === null ? {} : handle(field))}
        title={`${PLACE_LABELS[spot]} · layout.${spot}${field === null ? "" : ` · reads ${FIELD_WIRE[field].join(", ")}`}`}
      >
        {field !== null && (
          <span
            className="row-map-handle"
            // The grab cursor and the finger's hold; the place takes the press.
            // The dropdown does the same, from a keyboard too.
            aria-hidden="true"
          />
        )}
        <select
          aria-label={PLACE_LABELS[spot]}
          value={choice}
          disabled={closed}
          onChange={event =>
            onChange({
              ...state,
              layout: withPlaced(
                state.layout,
                spot,
                event.target.value as PlaceChoice,
              ),
            })
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

  const unplaced = unplacedFields(state.layout);
  return (
    <div className="row-map-wrap" style={colors}>
      <div
        className="row-map"
        role="group"
        aria-label="A row's places"
        data-dragging={moving !== null || undefined}
      >
        {ROW_LINES.map(({ line, lead, trailing }) => (
          <div key={line} className="row-map-line">
            {lead.field === null ? (
              // A row is the entity it names, so its title always shows.
              <span className="row-map-slot">
                <button
                  type="button"
                  className="row-map-name"
                  disabled
                  title="The name, always shown"
                >
                  <span className="row-map-name-long">Business name</span>
                  <span className="row-map-name-short">Name</span>
                </button>
              </span>
            ) : (
              place(lead.field)
            )}
            {place(lead.badge, { badge: true })}
            {place(trailing.badge, { badge: true, trailing: true })}
            {place(trailing.field)}
          </div>
        ))}
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
              title={`Drag ${CHOICE_LABELS[field]} onto a place · reads ${FIELD_WIRE[field].join(", ")}`}
              {...handle(field)}
              data-dragged={moving?.field === field || undefined}
            >
              {CHOICE_LABELS[field]}
            </span>
          ))
        )}
      </div>
      <table className="row-map-reads">
        <caption>What each field reads</caption>
        <thead>
          <tr>
            <th scope="col">Field</th>
            <th scope="col">From the autocomplete service&apos;s answer</th>
          </tr>
        </thead>
        <tbody>
          {ROW_FIELDS.map(field => (
            <tr key={field} data-field={field}>
              <th scope="row">{CHOICE_LABELS[field]}</th>
              <td>
                {FIELD_WIRE[field].map(source => (
                  <code key={source}>{source}</code>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {moving !== null &&
        createPortal(<Ghost drag={moving} colors={colors} />, document.body)}
    </div>
  );
}
