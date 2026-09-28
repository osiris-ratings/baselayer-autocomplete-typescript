// The Components fold's row: a menu row drawn as its places, in the look
// being styled. A field is dragged by its place onto another place, or onto
// the tray of fields the row leaves out; each place's chevron is a dropdown of
// what it can show. Pointer events, so a mouse and a finger drag the same way.

import type { RowField, RowPlace } from "@baselayer-sdk/autocomplete";
import {
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";

import {
  CHOICE_LABELS,
  EMPTY_PLACE,
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
  pointerId: number;
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

function lift(handle: HTMLElement, x: number, y: number): Lifted {
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
  // Read in the handlers, which a render may not have caught up with.
  const current = useRef<Drag | null>(null);
  const update = (next: Drag | null) => {
    current.current = next;
    setDrag(next);
  };

  /**
   * What a handle needs: press, move and release, on one pointer. A press
   * that never moves is a tap, and opens the dropdown beside the handle.
   */
  const handle = (field: RowField) => ({
    onPointerDown(event: ReactPointerEvent<HTMLElement>) {
      if (event.button !== 0) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      update({
        field,
        lifted: lift(event.currentTarget, event.clientX, event.clientY),
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        x: event.clientX,
        y: event.clientY,
        moving: false,
        over: null,
      });
    },
    onPointerMove(event: ReactPointerEvent<HTMLElement>) {
      const now = current.current;
      if (now === null || now.pointerId !== event.pointerId) return;
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
        over: spot !== null && accepts(now.field, spot) ? spot : null,
      });
    },
    onPointerUp(event: ReactPointerEvent<HTMLElement>) {
      const now = current.current;
      if (now === null || now.pointerId !== event.pointerId) return;
      update(null);
      if (now.moving) {
        if (now.over !== null) onDrop(now.field, now.over);
        return;
      }
      const menu = event.currentTarget.parentElement?.querySelector("select");
      try {
        menu?.showPicker();
      } catch {
        // No picker without a user activation, or at all on an old browser:
        // the chevron is still there.
      }
    },
    onPointerCancel() {
      update(null);
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
    return (
      <span
        className="row-map-place"
        data-drop={spot}
        data-field={choice}
        data-badge={badge || undefined}
        data-trailing={trailing || undefined}
        data-accepts={accepts(spot)}
        data-over={over === spot || undefined}
        data-dragged={
          moving !== null && moving.field === field ? true : undefined
        }
        title={`${PLACE_LABELS[spot]} · layout.${spot}`}
      >
        {field !== null && (
          <span
            className="row-map-handle"
            // The dropdown does the same, from a keyboard too.
            aria-hidden="true"
            {...handle(field)}
          />
        )}
        <select
          aria-label={PLACE_LABELS[spot]}
          value={choice}
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
          {placeOptions(state.layout, spot).map(option => (
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
        <div className="row-map-line">
          {/* A row is the entity it names, so its title always shows. */}
          <button
            type="button"
            className="row-map-name"
            disabled
            title="The name, always shown"
          >
            <span className="row-map-name-long">Business name</span>
            <span className="row-map-name-short">Name</span>
          </button>
          {place("titleBadge", { badge: true })}
          {place("titleTrailingBadge", { badge: true, trailing: true })}
          {place("titleTrailing")}
        </div>
        <div className="row-map-line">
          {place("subtitle")}
          {place("subtitleBadge", { badge: true })}
          {place("subtitleTrailingBadge", { badge: true, trailing: true })}
          {place("subtitleTrailing")}
        </div>
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
              title={`Drag ${CHOICE_LABELS[field]} onto a place`}
              {...handle(field)}
              data-dragged={moving?.field === field || undefined}
            >
              {CHOICE_LABELS[field]}
            </span>
          ))
        )}
      </div>
      {moving !== null &&
        createPortal(<Ghost drag={moving} colors={colors} />, document.body)}
    </div>
  );
}
