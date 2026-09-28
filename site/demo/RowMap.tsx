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

interface Drag {
  field: RowField;
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  /** Past the slop: the ghost follows the pointer. */
  moving: boolean;
  over: DropSpot | null;
}

/** The place or the tray under a point, read off the page. */
function spotAt(x: number, y: number): DropSpot | null {
  const target = document
    .elementFromPoint(x, y)
    ?.closest<HTMLElement>("[data-drop]");
  return (target?.dataset.drop as DropSpot | undefined) ?? null;
}

function useFieldDrag(onDrop: (field: RowField, to: DropSpot) => void) {
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
      update({
        ...now,
        x: event.clientX,
        y: event.clientY,
        moving,
        over: moving ? spotAt(event.clientX, event.clientY) : null,
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

export function RowMap({
  state,
  onChange,
}: {
  state: StyleState;
  onChange(state: StyleState): void;
}) {
  const { drag, handle } = useFieldDrag((field, to) =>
    onChange({ ...state, layout: moveField(state.layout, field, to) }),
  );
  const over = drag?.moving === true ? drag.over : null;
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
        data-over={over === spot || undefined}
        data-dragged={
          drag?.moving === true && drag.field === field ? true : undefined
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
      <div className="row-map" role="group" aria-label="A row's places">
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
              data-dragged={
                drag?.moving === true && drag.field === field ? true : undefined
              }
            >
              {CHOICE_LABELS[field]}
            </span>
          ))
        )}
      </div>
      {drag?.moving === true &&
        createPortal(
          <span
            className="row-map-ghost"
            data-field={drag.field}
            style={{ ...colors, left: drag.x, top: drag.y }}
          >
            {CHOICE_LABELS[drag.field]}
          </span>,
          document.body,
        )}
    </div>
  );
}
