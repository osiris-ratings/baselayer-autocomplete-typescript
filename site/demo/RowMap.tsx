// The Components fold's row: a menu row drawn as its lines and their places,
// in the look being styled, and the row's whole configuration. A line is
// dragged by its grip between the Shown and the Hidden drawers, and its
// checkbox at the far right disables it. A field is
// dragged by its place onto another place of its line, or onto the tray of
// fields the row leaves out; each place's chevron is a dropdown of what it can
// show. Pointer events, so a mouse and a finger drag the same way.

import type {
  EntityType,
  IconSegmentByRoute,
  IncludeOf,
  LayoutOf,
  Relation,
  Route,
} from "@baselayer-sdk/autocomplete";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent as ReactFocusEvent,
  type RefObject,
  type UIEvent as ReactUIEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";

import { SegmentIcon } from "../../src/react/icons";
import { mapInks } from "./map-ink";

import {
  ADDRESS_EDITOR,
  BUSINESS_EDITOR,
  EMPTY_PLACE,
  PERSON_EDITOR,
  TRAY,
  editorOps,
  lineFields,
  lineKinds,
  fieldSegment,
  nameSegment,
  segmentEntity,
  withIconSegment,
  withEnabled,
  withListOrder,
  withListed,
  type RowEditor,
  type StyleState,
} from "./style-state";

/** A place, or the tray: where a dragged field can land. */
type DropSpot = string;

/** How far a pointer travels before a press on a place is a drag. */
const DRAG_SLOP = 4;

/**
 * How long after a drop a click on what was dragged is the browser's own,
 * from the pointer's release, and not a press of its own.
 */
const CLICK_AFTER_DROP_MS = 400;

/** What a line is called while it is carried by its grip: its relation. */
const LINE = "line:";

const lineItem = (relation: Relation) => `${LINE}${relation}`;

/** The relation a carried item lists, when it is a line and not a field. */
function relationOf(item: string): Relation | null {
  return item.startsWith(LINE) ? (item.slice(LINE.length) as Relation) : null;
}

/** The drawers a line is dragged between. */
const SHOWN = "shown";
const HIDDEN = "hidden";

/**
 * Where a heading's ink ends, measured on its own font: its line's leading
 * and its face both move it. Null with no canvas to measure on.
 */
function inkBottom(label: HTMLElement): number | null {
  const context = document.createElement("canvas").getContext("2d");
  if (context === null) return null;
  const style = getComputedStyle(label);
  context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const text = label.textContent ?? "";
  const metrics = context.measureText(
    style.textTransform === "uppercase" ? text.toUpperCase() : text,
  );
  const glyphs = metrics.fontBoundingBoxAscent + metrics.fontBoundingBoxDescent;
  const line = parseFloat(style.lineHeight);
  const top =
    label.getBoundingClientRect().top +
    parseFloat(style.paddingTop) +
    ((Number.isNaN(line) ? glyphs : line) - glyphs) / 2;
  return top + metrics.fontBoundingBoxAscent + metrics.actualBoundingBoxDescent;
}

/** Marks a scroller's frame with the edges there is more beyond. */
function markEdges(scroller: HTMLElement) {
  const frame = scroller.parentElement!;
  frame.toggleAttribute("data-more-before", scroller.scrollLeft > 0.5);
  frame.toggleAttribute(
    "data-more-after",
    scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 0.5,
  );
}

/** "their addresses" as a line's tooltip starts it. */
function capitalized(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * The look's colors and corners, as the drawn row paints its places, its inks,
 * and how much it dims a disabled line and a hidden one.
 */
function rowMapColors(state: StyleState): CSSProperties {
  const { look, vars } = state;
  const inks = mapInks(state);
  return {
    "--map-ink": inks.ink,
    "--map-soft": inks.soft,
    "--map-guide": inks.guide,
    "--map-dim-disabled": String(inks.dim.disabled),
    "--map-dim-hidden": String(inks.dim.hidden),
    "--map-bg": look.backgroundColor,
    "--map-border": vars["--bl-ac-border"],
    "--map-radius": vars["--bl-ac-radius"],
    "--map-pill-radius": vars["--bl-ac-pill-radius"],
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
  /** A whole line, by its grip. */
  line: boolean;
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

/**
 * The spots under a point, innermost first: a place, and the drawer it is in.
 * What is carried lands on the first that takes it.
 */
function spotsAt(x: number, y: number): DropSpot[] {
  const spots: DropSpot[] = [];
  for (
    let at = document
      .elementFromPoint(x, y)
      ?.closest<HTMLElement>("[data-drop]");
    at !== null && at !== undefined;
    at = at.parentElement?.closest<HTMLElement>("[data-drop]")
  ) {
    spots.push(at.dataset.drop!);
  }
  return spots;
}

function measure(handle: HTMLElement, x: number, y: number): Lifted {
  const cell = handle.closest<HTMLElement>(".row-map-place, .row-map-chip");
  const box = (cell ?? handle).getBoundingClientRect();
  const face = getComputedStyle(
    cell?.querySelector(".row-map-face") ?? cell ?? handle,
  );
  return {
    chip: cell?.classList.contains("row-map-chip") ?? false,
    line: handle.classList.contains("row-map-grip"),
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
  const droppedAt = useRef(Number.NEGATIVE_INFINITY);
  const latest = useRef({ accepts, onDrop });
  useLayoutEffect(() => {
    latest.current = { accepts, onDrop };
  });
  const update = (next: Drag | null) => {
    current.current = next;
    setDrag(next);
  };

  /** The spot under a point that takes what is carried, if any does. */
  const landing = (field: string, x: number, y: number) =>
    spotsAt(x, y).find(spot => latest.current.accepts(field, spot)) ?? null;

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
      update({
        ...now,
        x: event.clientX,
        y: event.clientY,
        moving,
        over: moving ? landing(now.field, event.clientX, event.clientY) : null,
      });
    };
    const up = (event: MouseEvent) => {
      const now = current.current;
      if (now === null || !carries(event)) return;
      update(null);
      if (now.moving) {
        droppedAt.current = Date.now();
        // Where it is let go, which a scroll since the last move can change.
        const spot = landing(now.field, event.clientX, event.clientY);
        if (spot !== null) latest.current.onDrop(now.field, spot);
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

  /**
   * Whether a click on something that can be dragged is a press of its own,
   * and not the one the browser sends as a drag of it is let go.
   */
  const clicked = () => Date.now() - droppedAt.current > CLICK_AFTER_DROP_MS;

  return { drag, handle, clicked };
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
  if (lifted.line) {
    // A line flies as its name: the whole row would hide where it lands.
    return (
      <span
        className="row-map-line-ghost row-map-ghost"
        style={{ ...colors, left: drag.x - 12, top: drag.y - 12 }}
      >
        {label}
      </span>
    );
  }
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
 * address's, each editing its own row in the style state. What it lists and
 * which lines are enabled change only through `withListed` and `withEnabled`,
 * which keep a line the row does not draw from being enabled.
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
  const row = state.rows[route];
  const lines = {
    route,
    list: row.list as readonly Relation[],
    enabled: row.enabled,
    onList: (relation: Relation, listed: boolean, at?: number) =>
      onChange(
        withListed(state, route, relation as IncludeOf<Route>, listed, at),
      ),
    onOrder: (relation: Relation, at: number) =>
      onChange(withListOrder(state, route, relation as IncludeOf<Route>, at)),
    onEnable: (entity: EntityType, on: boolean) =>
      onChange(withEnabled(state, route, entity, on)),
    iconSegments: state.rows[route].iconSegments as readonly string[],
    onIcon: (segment: string, on: boolean) =>
      onChange(
        withIconSegment(state, route, segment as IconSegmentByRoute[Route], on),
      ),
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

/** The map has no row to read a role off, so a segment draws its entity's glyph. */
const NO_ROLE = null;

/**
 * A segment's icon, as a toggle at the start of its chip: the glyph the
 * segment draws, solid when it carries it and faint when not.
 */
function IconToggle({
  segment,
  label,
  entity,
  on,
  frozen,
  onToggle,
}: {
  segment: string;
  label: string;
  entity: EntityType;
  on: boolean;
  frozen: boolean;
  onToggle(on: boolean): void;
}) {
  return (
    <button
      type="button"
      className="row-map-icon"
      data-segment={segment}
      aria-pressed={on}
      aria-label={`Icon on ${label}`}
      title={`Icon: ${on ? "on" : "off"}${frozen ? ", on a hidden line" : ""}`}
      disabled={frozen}
      // A press here is the toggle's, not the start of the field's drag.
      onPointerDown={event => event.stopPropagation()}
      onMouseDown={event => event.stopPropagation()}
      onClick={() => onToggle(!on)}
    >
      <SegmentIcon
        icons={undefined}
        entity={entity}
        role={NO_ROLE}
        className="row-map-icon-glyph"
      />
    </button>
  );
}

function KindRowMap<P extends string, F extends string>({
  editor,
  route,
  list,
  enabled,
  onList,
  onOrder,
  onEnable,
  iconSegments,
  onIcon,
  layout,
  onLayout,
  colors,
}: {
  editor: RowEditor<P, F>;
  route: Route;
  /** The relations the row lists: their lines are shown, the others hidden. */
  list: readonly Relation[];
  /** The entities whose lines are enabled. */
  enabled: readonly EntityType[];
  /** Shows a line at `at` in the list (its end when left out), or hides it. */
  onList(relation: Relation, listed: boolean, at?: number): void;
  /** Moves a shown line to `at` in the list. */
  onOrder(relation: Relation, at: number): void;
  onEnable(entity: EntityType, on: boolean): void;
  /** The segments drawn with their icon. */
  iconSegments: readonly string[];
  onIcon(segment: string, on: boolean): void;
  layout: LayoutOf<P, F>;
  onLayout(layout: LayoutOf<P, F>): void;
  colors: CSSProperties;
}) {
  const { canDrop, moveField, placeOptions, unplacedFields, withPlaced } =
    editorOps(editor);
  const kinds = lineKinds(route);
  const listed = (kind: (typeof kinds)[number]) =>
    kind.relation === null || list.includes(kind.relation);
  /** The places of a hidden line: nothing moves into or out of them. */
  const frozen = new Set<string>(
    kinds
      .filter(kind => !listed(kind))
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
  // What the live region last said: a line shown, hidden or moved.
  const [said, say] = useState("");
  /** Where a line carried over Shown would land in the list. */
  const dropAt = useRef<number | null>(null);
  /**
   * A line goes to Shown, where it lands where it is let go, or, shown, to
   * Hidden. A field goes on a place of its own line that would draw it, or
   * anywhere in the Hidden drawer, to be left out: a gap of the row is no
   * place, so it takes none. A hidden line gives up no field to carry, and
   * the Hidden drawer holds none of its own.
   */
  const fieldSpot = (to: DropSpot) => (to === HIDDEN ? TRAY : to);
  const takes = (item: string, to: DropSpot) => {
    const relation = relationOf(item);
    if (relation !== null) {
      return to === SHOWN || (to === HIDDEN && list.includes(relation));
    }
    return to !== TRAY && canDrop(layout, item as F, fieldSpot(to) as P);
  };
  const { drag, handle, clicked } = useFieldDrag(takes, (item, to) => {
    const relation = relationOf(item);
    if (relation === null) {
      onLayout(moveField(layout, item as F, fieldSpot(to) as P));
      return;
    }
    const name = capitalized(kindName(relation));
    if (to === HIDDEN) {
      onList(relation, false);
      say(`${name} hidden`);
      return;
    }
    const at = dropAt.current ?? list.length;
    const from = list.indexOf(relation);
    if (from === -1) {
      onList(relation, true, at);
      say(`${name} shown`);
    } else if (at !== from) {
      onOrder(relation, at);
      say(`${name} moved to position ${at + 1} of ${list.length}`);
    }
  });
  // A line moved from the keyboard lands in the other drawer: its grip keeps
  // the focus there.
  const wrap = useRef<HTMLDivElement | null>(null);
  const refocus = useRef<Relation | null>(null);
  useLayoutEffect(() => {
    if (refocus.current === null) return;
    wrap.current
      ?.querySelector<HTMLElement>(
        `.row-map-grip[data-relation="${refocus.current}"]`,
      )
      ?.focus();
    refocus.current = null;
  });
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
    const segment = field === null ? null : fieldSegment(route, field);
    return (
      <span
        className="row-map-place"
        data-drop={spot}
        data-icon={segment !== null || undefined}
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
        {segment !== null && field !== null && (
          <IconToggle
            segment={segment}
            label={editor.fieldLabels[field]}
            entity={segmentEntity(route, segment)}
            on={iconSegments.includes(segment)}
            frozen={frozen.has(spot)}
            onToggle={on => onIcon(segment, on)}
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

  // Shown in the list's order, the head first; hidden in the row's own.
  const shown = [
    kinds[0]!,
    ...list.flatMap(relation =>
      kinds.filter(kind => kind.relation === relation),
    ),
  ];
  const hidden = kinds.filter(kind => !listed(kind));
  /** The fields a drawn line can show: only those go on the tray and in the table. */
  const shownFields = new Set(
    shown.flatMap(kind => lineFields(route, kind.relation)),
  );
  const unplaced = unplacedFields(layout).filter(field =>
    shownFields.has(field),
  );
  // A drawer out of room scrolls its lines sideways: its frame shadows each
  // edge there is more beyond, as it scrolls and as its lines change.
  const shownScroller = useRef<HTMLDivElement | null>(null);
  const hiddenScroller = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    for (const scroller of [shownScroller.current, hiddenScroller.current]) {
      if (scroller !== null) markEdges(scroller);
    }
  });
  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) markEdges(entry.target as HTMLElement);
    });
    for (const scroller of [shownScroller.current, hiddenScroller.current]) {
      if (scroller !== null) observer.observe(scroller);
    }
    return () => observer.disconnect();
  }, []);
  // A line carried over Shown makes its way: the lines it would land among
  // slide aside to open its gap there, and the row it was lifted from goes
  // to the gap, so the drawer shows the order a drop would make.
  const carried = moving === null ? null : relationOf(moving.field);
  const pointerY = moving?.y ?? null;
  useLayoutEffect(() => {
    const scroller = shownScroller.current;
    if (scroller === null) return;
    const rows = [
      ...scroller.querySelectorAll<HTMLElement>(
        '.row-map-kind:not([data-relation="head"])',
      ),
    ];
    for (const row of rows) row.style.transform = "";
    scroller.style.paddingBottom = "";
    dropAt.current = null;
    if (carried === null || over !== SHOWN || pointerY === null) return;
    // Measured untransformed: an offset ignores the slides above.
    const frame = scroller.parentElement!;
    const y = pointerY - frame.getBoundingClientRect().top + scroller.scrollTop;
    const others = rows.filter(row => row.dataset.relation !== carried);
    const at = others.filter(
      row => row.offsetTop + row.offsetHeight / 2 < y,
    ).length;
    dropAt.current = at;
    const lifted =
      rows.find(row => row.dataset.relation === carried) ??
      wrap.current?.querySelector<HTMLElement>(
        `[data-drawer="hidden"] .row-map-kind[data-relation="${carried}"]`,
      ) ??
      null;
    const step =
      (lifted?.offsetHeight ?? 0) +
      parseFloat(getComputedStyle(scroller).rowGap || "0");
    const from = others.length === rows.length ? null : rows.indexOf(lifted!);
    others.forEach((row, index) => {
      const was = from !== null && index >= from ? index + 1 : index;
      const now = index >= at ? index + 1 : index;
      if (now !== was)
        row.style.transform = `translateY(${(now - was) * step}px)`;
    });
    if (from === null) {
      // From Hidden: the drawer grows by the line it is to take.
      scroller.style.paddingBottom = `${step}px`;
    } else if (lifted !== null && at !== from) {
      lifted.style.transform = `translateY(${(at - from) * step}px)`;
    }
  }, [carried, over, pointerY]);
  // The Disabled column's guide starts one gap under its heading's ink,
  // wherever the heading's font puts that; it is measured again once the
  // page's fonts have come.
  const [, fontsCame] = useState(0);
  useEffect(() => {
    void document.fonts?.ready.then(() => fontsCame(count => count + 1));
  }, []);
  // Each segment ends one gap from its box's painted edges, which a box
  // drawn on whole pixels puts where its stylesheet's halves would not.
  useLayoutEffect(() => {
    const scroller = shownScroller.current;
    const label = scroller?.querySelector<HTMLElement>(".row-map-check-head");
    if (scroller == null || label == null) return;
    const parts = [...scroller.querySelectorAll<HTMLElement>(".row-map-guide")];
    for (const part of parts) {
      part.style.top = "";
      part.style.bottom = "";
    }
    const ink = inkBottom(label);
    if (ink === null || parts.length === 0) return;
    const gap = parseFloat(
      getComputedStyle(parts[0]!).getPropertyValue("--map-guide-gap"),
    );
    parts.forEach((part, at) => {
      const cell = part.parentElement!.getBoundingClientRect();
      const box = part
        .parentElement!.querySelector(".row-map-check")!
        .getBoundingClientRect();
      if (part.dataset.part === "above") {
        if (at === 0) part.style.top = `${ink + gap - cell.top}px`;
        part.style.bottom = `${cell.bottom - (Math.round(box.top) - gap)}px`;
      } else {
        part.style.top = `${Math.round(box.bottom) + gap - cell.top}px`;
      }
    });
  });
  const edges = (scroller: RefObject<HTMLDivElement | null>) => ({
    ref: scroller,
    onScroll: (event: ReactUIEvent<HTMLDivElement>) =>
      markEdges(event.currentTarget),
    // What is focused is brought clear of the sticky grips and the Disabled
    // column. A press that starts a drag focuses nothing.
    onFocus: (event: ReactFocusEvent<HTMLDivElement>) => {
      (event.target as HTMLElement).scrollIntoView({
        block: "nearest",
        inline: "nearest",
      });
    },
  });

  /**
   * A line kind: its grip at the left, its lines in their box, and the
   * checkbox that disables it at the right.
   */
  const kindRow = (kind: (typeof kinds)[number]) => {
    const name = kindName(kind.relation);
    const relation = kind.relation;
    const isListed = listed(kind);
    const on = enabled.includes(kind.entity);
    return (
      <div
        key={relation ?? "head"}
        className="row-map-kind"
        data-relation={relation ?? "head"}
        data-state={!isListed ? "hidden" : on ? "enabled" : "disabled"}
        data-dragged={
          relation !== null && moving?.field === lineItem(relation)
            ? true
            : undefined
        }
      >
        {!isListed && (
          // A hidden line's own ground, over the drawer's bands.
          <span className="row-map-kind-ground" aria-hidden="true" />
        )}
        <span className="row-map-grip-cell">
          {relation === null ? (
            // A row always shows its head: no grip, but its room.
            <span className="row-map-grip" data-spacer aria-hidden="true" />
          ) : (
            <button
              type="button"
              className="row-map-grip"
              data-relation={relation}
              aria-label={`${isListed ? "Hide" : "Show"} ${name}`}
              title={`${capitalized(name)}: drag to ${isListed ? "Hidden" : "Shown"}, or press, to ${isListed ? "hide" : "show"} them (list)`}
              {...handle(lineItem(relation))}
              onClick={() => {
                if (!clicked()) return;
                refocus.current = relation;
                onList(relation, !isListed);
                say(`${capitalized(name)} ${isListed ? "hidden" : "shown"}`);
              }}
              // Alt and an arrow move a shown line up or down the list.
              onKeyDown={event => {
                const step =
                  event.key === "ArrowUp"
                    ? -1
                    : event.key === "ArrowDown"
                      ? 1
                      : 0;
                if (!event.altKey || step === 0 || !isListed) return;
                event.preventDefault();
                const from = list.indexOf(relation);
                const to = from + step;
                if (to < 0 || to >= list.length) return;
                refocus.current = relation;
                onOrder(relation, to);
                say(
                  `${capitalized(name)} moved to position ${to + 1} of ${list.length}`,
                );
              }}
            >
              <span className="row-map-grip-dots" aria-hidden="true" />
            </button>
          )}
        </span>
        <div className="row-map-kind-lines">
          {kind.lines.map(({ line, lead, trailing }) => {
            const segment = nameSegment(route, relation, line);
            return (
              <div key={line} className="row-map-line">
                {lead.field === null ? (
                  // A line is the entity it names, so its name always shows.
                  <span
                    className="row-map-slot"
                    data-icon={segment !== null || undefined}
                  >
                    {segment !== null && (
                      <IconToggle
                        segment={segment}
                        label={editor.lineNames[line]?.long ?? ""}
                        entity={segmentEntity(route, segment)}
                        on={iconSegments.includes(segment)}
                        frozen={!isListed}
                        onToggle={next => onIcon(segment, next)}
                      />
                    )}
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
            );
          })}
        </div>
        {isListed ? (
          <span className="row-map-check-cell">
            <input
              type="checkbox"
              className="row-map-check"
              aria-label={`Disable ${name}`}
              title={`${capitalized(name)}: ${on ? "enabled, a choice in the menu" : "disabled, drawn greyed in the menu"} (enabledLines)`}
              checked={!on}
              onChange={event => onEnable(kind.entity, !event.target.checked)}
            />
            {/* The column's guide from its heading, broken around the box. */}
            <span
              className="row-map-guide"
              data-part="above"
              aria-hidden="true"
            />
            <span
              className="row-map-guide"
              data-part="below"
              aria-hidden="true"
            />
          </span>
        ) : (
          // A hidden line is not drawn, so is no choice either: no checkbox,
          // but the column's ground, where its places go under.
          <span className="row-map-check-cell" aria-hidden="true" />
        )}
      </div>
    );
  };

  return (
    <div className="row-map-wrap" style={colors} ref={wrap}>
      <p className="row-map-live" role="status" aria-live="polite">
        {said}
      </p>
      <div
        className="row-map-drawer"
        data-drawer={SHOWN}
        data-drop={SHOWN}
        data-accepts={accepts(SHOWN)}
        data-over={over === SHOWN || undefined}
      >
        <div
          className="row-map"
          role="group"
          aria-label="Shown lines"
          data-dragging={moving !== null || undefined}
        >
          {/* Out of room, the lines scroll here, the page not at all. */}
          <div className="row-map-scroll-frame">
            <div className="row-map-scroll" {...edges(shownScroller)}>
              <div className="row-map-head" aria-hidden="true">
                <span className="row-map-drawer-label">Shown</span>
                <span className="row-map-check-head">Disabled</span>
              </div>
              {shown.map(kindRow)}
            </div>
          </div>
        </div>
      </div>
      <div
        className="row-map-drawer"
        data-drawer={HIDDEN}
        data-drop={HIDDEN}
        data-accepts={accepts(HIDDEN)}
        data-over={over === HIDDEN || undefined}
      >
        <div
          className="row-map row-map-hidden"
          role="group"
          aria-label="Hidden lines"
        >
          <div className="row-map-scroll-frame">
            <div className="row-map-scroll" {...edges(hiddenScroller)}>
              <div className="row-map-head" aria-hidden="true">
                <span className="row-map-drawer-label">Hidden</span>
              </div>
              {hidden.length === 0 && unplaced.length === 0 && (
                <div className="row-map-hint-row">
                  <p className="row-map-drawer-hint">
                    Drag a line by its grip, or a field, here to hide it
                  </p>
                </div>
              )}
              {hidden.map(kindRow)}
            </div>
          </div>
          {/* The fields the row leaves out, under its hidden lines. */}
          <div
            className="row-map-tray"
            data-drop={TRAY}
            data-ruled={(hidden.length > 0 && unplaced.length > 0) || undefined}
          >
            {unplaced.map(field => (
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
            ))}
          </div>
        </div>
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
            label={
              relationOf(moving.field) === null
                ? editor.fieldLabels[moving.field as F]
                : capitalized(kindName(relationOf(moving.field)))
            }
          />,
          document.body,
        )}
    </div>
  );
}
