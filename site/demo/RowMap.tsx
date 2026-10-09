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
  useCallback,
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
import { markEdges } from "./scroll-edges";

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
 * How far past a line's middle a carried row's leading edge goes before its
 * slot moves past that line, so a hand resting at the swap does not flip it.
 */
const DEAD_BAND = 4;

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

/** A face's metrics, in ems, where none can be measured: a typical face's. */
const TYPICAL_FACE = { ascent: 0.92, descent: 0.24 };

/**
 * A heading's face at its size: measured on an offscreen canvas, or a typical
 * face's, its ink ending on the baseline, on a page with no canvas to measure
 * on.
 */
function faceOf(style: CSSStyleDeclaration, text: string) {
  const size = parseFloat(style.fontSize);
  const typical = {
    ascent: TYPICAL_FACE.ascent * size,
    descent: TYPICAL_FACE.descent * size,
    ink: 0,
  };
  if (typeof OffscreenCanvas !== "function") return typical;
  try {
    const context = new OffscreenCanvas(1, 1).getContext("2d");
    if (context === null) return typical;
    context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const metrics = context.measureText(text);
    return {
      ascent: metrics.fontBoundingBoxAscent,
      descent: metrics.fontBoundingBoxDescent,
      ink: metrics.actualBoundingBoxDescent,
    };
  } catch {
    return typical;
  }
}

/**
 * Where a heading's ink ends, on its own font: its line's leading and its
 * face both move it.
 */
function inkBottom(label: HTMLElement): number {
  const style = getComputedStyle(label);
  const text = label.textContent ?? "";
  const face = faceOf(
    style,
    style.textTransform === "uppercase" ? text.toUpperCase() : text,
  );
  const glyphs = face.ascent + face.descent;
  const line = parseFloat(style.lineHeight);
  const top =
    label.getBoundingClientRect().top +
    parseFloat(style.paddingTop) +
    ((Number.isNaN(line) ? glyphs : line) - glyphs) / 2;
  return top + face.ascent + face.ink;
}

/** "their addresses" as a line's tooltip starts it. */
function capitalized(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * The look's colors and corners, as the drawn row paints its places, its inks,
 * and how much it dims a disabled line and a hidden one.
 */
/** A checked box's mark, white on every look. */
const CHECK_MARK = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12"><path d="M2.6 6.2 5 8.6 9.4 3.6" fill="none" stroke="#ffffff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
)}")`;

function rowMapColors(state: StyleState): CSSProperties {
  const { look, vars } = state;
  const inks = mapInks(state);
  return {
    "--map-ink": inks.ink,
    "--map-soft": inks.soft,
    "--map-guide": inks.guide,
    "--map-dim-disabled": String(inks.dim.disabled),
    "--map-dim-hidden": String(inks.dim.hidden),
    "--map-check-edge": inks.check.edge,
    "--map-check-hover": inks.check.hover,
    "--map-check-fill": inks.check.fill,
    "--map-check-mark": CHECK_MARK,
    "--map-ring": inks.ring,
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
  /** What was lifted, as it is drawn: a line's ghost is a copy of it. */
  source: HTMLElement;
  /** The map's width, which its container queries read. */
  scope: number;
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
  // A grip lifts its whole row.
  const cell = handle.closest<HTMLElement>(
    handle.classList.contains("row-map-grip")
      ? ".row-map-kind"
      : ".row-map-place, .row-map-chip",
  );
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
    source: cell ?? handle,
    scope: handle.closest(".row-map-wrap")?.getBoundingClientRect().width ?? 0,
  };
}

function useFieldDrag(
  accepts: (field: string, to: DropSpot) => boolean,
  onDrop: (field: string, to: DropSpot) => void,
  /** A carried field let go, dropped or not, after any drop is applied. */
  onLetGo: (drag: Drag) => void,
) {
  const [drag, setDrag] = useState<Drag | null>(null);
  // Read in the listeners, which a render may not have caught up with.
  const current = useRef<Drag | null>(null);
  const menu = useRef<HTMLSelectElement | null>(null);
  const droppedAt = useRef(Number.NEGATIVE_INFINITY);
  const latest = useRef({ accepts, onDrop, onLetGo });
  useLayoutEffect(() => {
    latest.current = { accepts, onDrop, onLetGo };
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
    // The grabbing hand for the whole gesture, wherever the pointer goes.
    document.documentElement.dataset.dragging = "";
    const byMouse = tracking === "mouse";
    /** Ends the drag; one that was carried is let go where it was last held. */
    const end = () => {
      const now = current.current;
      update(null);
      if (now?.moving) latest.current.onLetGo(now);
    };
    const carries = (event: MouseEvent) =>
      byMouse || (event as PointerEvent).pointerId === tracking;
    const move = (event: MouseEvent) => {
      const now = current.current;
      if (now === null || !carries(event)) return;
      // The button is up: its release went where no listener heard it (a
      // context menu, another window), so the drag is over. Only a pointer
      // says so reliably; the mouse events Safari falls back to are left be.
      if (!byMouse && (event.buttons & 1) === 0) {
        end();
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
        // A line lands in the slot it was shown; a field where it is let go,
        // which a scroll since the last move can change.
        const spot = now.lifted.line
          ? now.over
          : landing(now.field, event.clientX, event.clientY);
        if (spot !== null) latest.current.onDrop(now.field, spot);
        latest.current.onLetGo(now);
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
      if (current.current !== null && carries(event)) end();
    };
    // Escape puts the field back; so does anything that takes the pointer
    // from the page before it is let go.
    const abandon = () => end();
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
      delete document.documentElement.dataset.dragging;
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

type Drawer = typeof SHOWN | typeof HIDDEN;
const DRAWERS: readonly Drawer[] = [SHOWN, HIDDEN];

/** The drawers as a line was lifted from them: where its slot can go. */
interface Slots {
  relation: Relation;
  /** The drawer it came from, and its place among that drawer's lines. */
  origin: Drawer;
  from: number;
  /** A line and the gap after it. */
  step: number;
  /** The carried row's height. */
  height: number;
  /** Where Shown's first line starts, from the top of its frame. */
  first: number;
  /** How many other lines Shown holds: its slots are 0 to this. */
  count: number;
  /** Its place in Hidden, which keeps the row's own order. */
  hiddenAt: number;
}

/**
 * Shown's and Hidden's lines, untransformed, as `carried` is lifted. `order`
 * is the row's own order of its lines, which Hidden keeps.
 */
function snapshot(
  carried: Relation,
  shown: HTMLElement[],
  hidden: HTMLElement[],
  order: readonly string[],
  head: HTMLElement,
): Slots | null {
  const origin = shown.some(row => row.dataset.relation === carried)
    ? SHOWN
    : HIDDEN;
  const lines = origin === SHOWN ? shown : hidden;
  const lifted = lines.find(row => row.dataset.relation === carried);
  if (lifted === undefined) return null;
  const gap = parseFloat(getComputedStyle(lifted.parentElement!).rowGap || "0");
  const rank = (relation: string | undefined) => order.indexOf(relation ?? "");
  return {
    relation: carried,
    origin,
    from: lines.indexOf(lifted),
    step: lifted.offsetHeight + gap,
    height: lifted.offsetHeight,
    first:
      head.offsetTop +
      head.offsetHeight +
      parseFloat(getComputedStyle(head.parentElement!).rowGap || "0"),
    count: shown.filter(row => row !== lifted).length,
    hiddenAt: hidden.filter(
      row => row !== lifted && rank(row.dataset.relation) < rank(carried),
    ).length,
  };
}

/** How long a let-go row takes to settle flat into its place. */
const SETTLE_MS = 180;

/** A carried line let go: where it was held, and where it settles. */
interface Landing {
  relation: Relation;
  x: number;
  y: number;
  lifted: Lifted;
  /** The row's place once the drop is drawn; null until it is measured. */
  to: { left: number; top: number } | null;
}

const reducedMotion = () =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/**
 * A line in hand: a copy of its whole row as drawn, held where it was grabbed
 * and tilted, on a card of the map's own. Let go, it settles flat over the
 * row's place. The copy is drawn only: hidden from assistive tech and inert,
 * so the live row keeps the focus and the name.
 */
function RowGhost({
  x,
  y,
  lifted,
  to,
  colors,
  onSettled,
}: {
  x: number;
  y: number;
  lifted: Lifted;
  to: Landing["to"];
  colors: CSSProperties;
  onSettled: () => void;
}) {
  // Copied as the drag starts: a drop can move the live row to the other
  // drawer before the copy has settled.
  const row = lifted.source;
  const [drawer] = useState(
    () => row.closest(".row-map")?.className ?? "row-map",
  );
  const card = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const copy = row.cloneNode(true) as HTMLElement;
    // Drawn as it rests, not as the carried line is marked in its drawer.
    copy.removeAttribute("data-dragged");
    copy.style.transform = "";
    for (const named of copy.querySelectorAll("[id]")) {
      named.removeAttribute("id");
    }
    // The Enabled column's guide runs down the drawer, not with a row.
    for (const guide of copy.querySelectorAll(".row-map-guide")) {
      guide.remove();
    }
    card.current?.replaceChildren(copy);
  }, [row]);
  useEffect(() => {
    if (to === null) return;
    const timer = setTimeout(onSettled, SETTLE_MS + 100);
    return () => clearTimeout(timer);
  }, [to, onSettled]);
  return (
    <div
      className="row-map-wrap row-map-row-ghost"
      aria-hidden="true"
      inert
      data-settling={to !== null || undefined}
      style={{
        ...colors,
        left: to?.left ?? x - lifted.grabX,
        top: to?.top ?? y - lifted.grabY,
        width: lifted.scope,
      }}
    >
      <div
        ref={card}
        className={drawer}
        style={{
          width: lifted.width,
          transformOrigin: `${lifted.grabX}px ${lifted.grabY}px`,
        }}
      />
    </div>
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
  // A carried line let go settles into its place, unless motion is reduced.
  const [landing, setLanding] = useState<Landing | null>(null);
  const landed = useCallback(() => setLanding(null), []);
  const letGo = (carried: Drag) => {
    const relation = relationOf(carried.field);
    if (relation === null || reducedMotion()) return;
    const { x, y, lifted } = carried;
    setLanding({ relation, x, y, lifted, to: null });
  };
  const { drag, handle, clicked } = useFieldDrag(
    takes,
    (item, to) => {
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
    },
    letGo,
  );
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
  // A line lifted while another still settles: the one let go is shown at
  // once, rather than kept out of sight until a copy no longer drawn settles.
  const liftsLine = moving?.lifted.line === true;
  useLayoutEffect(() => {
    if (liftsLine) setLanding(null);
  }, [liftsLine]);
  const inHand: Landing | null =
    moving?.lifted.line === true
      ? {
          relation: relationOf(moving.field)!,
          x: moving.x,
          y: moving.y,
          lifted: moving.lifted,
          to: null,
        }
      : landing;
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
  // Hidden titles each of its two parts only while it holds something, as it
  // draws them; empty, it keeps the first title over its note. A line carried
  // over it opens its slot under that title.
  const linesTitled =
    hidden.length > 0 ||
    unplaced.length === 0 ||
    (moving?.lifted.line === true && over === HIDDEN);
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
  // A carried line leaves a blank line where a drop would put it: in the
  // drawer under the pointer, or where it came from over neither. The lines
  // around the slot slide aside, the drawer it would join grows by a line and
  // the one it left closes up. Where the slot falls is read off the drawers as
  // they were when the line was lifted, which no slide moves, and it passes a
  // line only once the pointer is clearly past that line's middle.
  const carried = moving === null ? null : relationOf(moving.field);
  const pointerY = moving?.y ?? null;
  const grabY = moving?.lifted.grabY ?? 0;
  const slots = useRef<Slots | null>(null);
  // The row's own order of its lines, as each one is named in the DOM.
  const lineOrder = kinds.map(kind => kind.relation ?? "head").join(" ");
  /** The slot in Shown while the pointer is over it, for the dead band. */
  const held = useRef<number | null>(null);
  useLayoutEffect(() => {
    const scrollers = {
      [SHOWN]: shownScroller.current,
      [HIDDEN]: hiddenScroller.current,
    };
    const lines = (drawer: Drawer) => [
      ...(scrollers[drawer]?.querySelectorAll<HTMLElement>(
        '.row-map-kind:not([data-relation="head"])',
      ) ?? []),
    ];
    if (carried === null) {
      for (const drawer of DRAWERS) {
        const scroller = scrollers[drawer];
        if (scroller === null) continue;
        for (const row of lines(drawer)) row.style.transform = "";
        scroller.style.paddingBottom = "";
        scroller.style.marginBottom = "";
        delete scroller.closest<HTMLElement>(".row-map-drawer")?.dataset.slot;
      }
      slots.current = null;
      held.current = null;
      dropAt.current = null;
      return;
    }
    if (slots.current?.relation !== carried) {
      const head = scrollers[SHOWN]?.querySelector<HTMLElement>(
        '.row-map-kind[data-relation="head"]',
      );
      slots.current =
        head == null
          ? null
          : snapshot(
              carried,
              lines(SHOWN),
              lines(HIDDEN),
              lineOrder.split(" "),
              head,
            );
      held.current = null;
    }
    const at = slots.current;
    const shown = scrollers[SHOWN];
    if (at === null || shown === null) return;
    let target = at.origin;
    let slot = at.from;
    if (over === SHOWN && pointerY !== null) {
      // The carried row's top, in the frame's terms: where it is held, less
      // how far down the row it was grabbed.
      const frame = shown.parentElement!;
      const top =
        pointerY - frame.getBoundingClientRect().top + shown.scrollTop - grabY;
      // The middle of the line drawn at a slot, the lines laid out evenly.
      const middle = (place: number) =>
        at.first + place * at.step + at.height / 2;
      if (held.current === null) {
        // Come into Shown: the row goes where its middle is, among the lines
        // as they are drawn without it.
        const centre = top + at.height / 2;
        slot = 0;
        while (slot < at.count && middle(slot) < centre) slot += 1;
      } else {
        // Past the line below once the row's bottom edge is clearly past its
        // middle, and back past the line above once its top edge is: the two
        // marks lie a gap and two bands apart, so a tremble flips neither.
        slot = held.current;
        while (
          slot < at.count &&
          top + at.height > middle(slot + 1) + DEAD_BAND
        ) {
          slot += 1;
        }
        while (slot > 0 && top < middle(slot - 1) - DEAD_BAND) slot -= 1;
      }
      held.current = slot;
      target = SHOWN;
    } else {
      held.current = null;
      if (over === HIDDEN) {
        target = HIDDEN;
        slot = at.hiddenAt;
      }
    }
    dropAt.current = over === SHOWN ? slot : null;
    for (const drawer of DRAWERS) {
      const scroller = scrollers[drawer];
      if (scroller === null) continue;
      const origin = drawer === at.origin;
      const opens = drawer === target;
      lines(drawer)
        .filter(row => row.dataset.relation !== carried)
        .forEach((row, index) => {
          const was = origin && index >= at.from ? index + 1 : index;
          const now = opens && index >= slot ? index + 1 : index;
          const slide =
            now === was ? "" : `translateY(${(now - was) * at.step}px)`;
          // Only a change: a slide set again would start over.
          if (row.style.transform !== slide) row.style.transform = slide;
        });
      const grow = opens && !origin ? `${at.step}px` : "";
      const close = origin && !opens ? `${-at.step}px` : "";
      if (scroller.style.paddingBottom !== grow) {
        scroller.style.paddingBottom = grow;
      }
      if (scroller.style.marginBottom !== close) {
        scroller.style.marginBottom = close;
      }
      const holder = scroller.closest<HTMLElement>(".row-map-drawer");
      if (holder === null) continue;
      if (opens) holder.dataset.slot = String(slot);
      else delete holder.dataset.slot;
    }
  }, [carried, over, pointerY, grabY, lineOrder]);
  // A line let go settles where its row now rests, which the drop has drawn.
  useLayoutEffect(() => {
    if (landing === null || landing.to !== null) return;
    const row = wrap.current?.querySelector<HTMLElement>(
      `.row-map-kind[data-relation="${landing.relation}"]`,
    );
    if (row == null) {
      setLanding(null);
      return;
    }
    // Where it will rest, not where a slide back still has it.
    row.style.transition = "none";
    const { left, top } = row.getBoundingClientRect();
    row.style.transition = "";
    setLanding({ ...landing, to: { left, top } });
  }, [landing]);
  // The Enabled column's guide starts one gap under its heading's ink,
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
    if (parts.length === 0) return;
    const ink = inkBottom(label);
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
    // What is focused is brought clear of the sticky grips and the Enabled
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
   * checkbox that enables it at the right.
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
        data-landing={
          (relation !== null && landing?.relation === relation) || undefined
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
              aria-keyshortcuts={
                isListed ? "Alt+ArrowUp Alt+ArrowDown" : undefined
              }
              title={`${capitalized(name)}: drag to ${isListed ? "Hidden" : "Shown"}, or press, to ${isListed ? "hide" : "show"} them (list)${isListed ? " · Alt+↑/↓ to move" : ""}`}
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
              aria-label={`Enable ${name}`}
              title={`${capitalized(name)}: ${on ? "enabled, a choice in the menu · untick to draw it greyed" : "disabled, drawn greyed in the menu · tick to make it a choice"} (enabledLines)`}
              checked={on}
              onChange={event => onEnable(kind.entity, event.target.checked)}
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
                <span className="row-map-check-head">Enabled</span>
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
          aria-label="Hidden lines and fields"
        >
          <div className="row-map-scroll-frame">
            <div className="row-map-scroll" {...edges(hiddenScroller)}>
              {linesTitled && (
                <div className="row-map-head" aria-hidden="true">
                  <span className="row-map-drawer-label">Hidden lines</span>
                </div>
              )}
              {hidden.length === 0 && unplaced.length === 0 && (
                <div className="row-map-hint-row">
                  <p className="row-map-drawer-note">
                    <span className="row-map-drawer-hint">
                      Drag a line by its grip, or a field, here to hide it
                    </span>
                  </p>
                </div>
              )}
              {hidden.map(kindRow)}
            </div>
          </div>
          {/* The fields the row leaves out, under its hidden lines. */}
          {unplaced.length > 0 && (
            <div
              className="row-map-tray"
              data-drop={TRAY}
              data-ruled={linesTitled || undefined}
            >
              <div className="row-map-head" aria-hidden="true">
                <span className="row-map-drawer-label">Hidden fields</span>
              </div>
              <div className="row-map-tray-chips">
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
          )}
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
      {inHand !== null &&
        createPortal(
          <RowGhost
            key={inHand.relation}
            x={inHand.x}
            y={inHand.y}
            lifted={inHand.lifted}
            to={inHand.to}
            colors={colors}
            onSettled={landed}
          />,
          document.body,
        )}
      {moving !== null &&
        !moving.lifted.line &&
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
