// The test form's title, which says what the field searches for:
// "Autocomplete" and a segmented button of the searches, business, person and
// address, each with the glyph the component draws for it, in the look of the
// side pane's Debug and Styling switch. Each search is a tab over the field;
// its article is there for a screen reader ("a person") and not drawn, so the
// title never says "a address". Only the searches the session may make are
// offered; with one, the title just names it.

import { useRef, type KeyboardEvent } from "react";

import type { EntityType, Route } from "@baselayer-sdk/autocomplete";

import { SegmentIcon } from "../../src/react/icons";

/** Each search's word in the title. */
export const SEARCH_WORDS: Record<Route, string> = {
  businesses: "business",
  people: "person",
  addresses: "address",
};

/** A search has no row to read a role off, so a segment draws its entity's glyph. */
const NO_ROLE = null;

/** What each search finds, which the component's own glyphs are drawn for. */
const ENTITIES: Record<Route, EntityType> = {
  businesses: "business",
  people: "person",
  addresses: "address",
};

const ARTICLES: Record<Route, string> = {
  businesses: "a",
  people: "a",
  addresses: "an",
};

export function SearchTitle({
  id,
  panelId,
  routes,
  route,
  onRoute,
}: {
  id: string;
  /** The field's panel, which the words switch. */
  panelId: string;
  /** The searches the session may make, in their order. */
  routes: readonly Route[];
  route: Route;
  onRoute(route: Route): void;
}) {
  const tabs = useRef(new Map<Route, HTMLButtonElement>());
  const go = (to: Route) => {
    onRoute(to);
    tabs.current.get(to)?.focus();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const at = routes.indexOf(route);
    const last = routes.length - 1;
    const to =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? routes[at === last ? 0 : at + 1]
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? routes[at === 0 ? last : at - 1]
          : event.key === "Home"
            ? routes[0]
            : event.key === "End"
              ? routes[last]
              : undefined;
    if (to === undefined) return;
    event.preventDefault();
    go(to);
  };
  return (
    <h2
      className="demo-card-title"
      id={id}
      // The sentence as it reads, whatever words the tabs offer besides.
      aria-label={`Autocomplete ${ARTICLES[route]} ${SEARCH_WORDS[route]}`}
    >
      <span className="demo-num">02</span>
      <span className="search-title">
        {routes.length > 1 ? (
          <>
            <span className="search-lead">Autocomplete</span>{" "}
            <span role="tablist" aria-label="Search by" className="search-by">
              {routes.map(each => (
                <button
                  key={each}
                  type="button"
                  role="tab"
                  id={`${id}-tab-${each}`}
                  ref={element => {
                    if (element === null) tabs.current.delete(each);
                    else tabs.current.set(each, element);
                  }}
                  className="search-by-word"
                  aria-selected={each === route}
                  aria-controls={panelId}
                  tabIndex={each === route ? 0 : -1}
                  onClick={() => onRoute(each)}
                  onKeyDown={onKeyDown}
                >
                  <span className="visually-hidden">{ARTICLES[each]} </span>
                  <SegmentIcon
                    icons={undefined}
                    entity={ENTITIES[each]}
                    role={NO_ROLE}
                    className="search-by-icon"
                  />
                  <span className="search-by-noun">{SEARCH_WORDS[each]}</span>
                </button>
              ))}
            </span>
          </>
        ) : (
          `Autocomplete ${ARTICLES[route]} ${SEARCH_WORDS[route]}`
        )}
      </span>
    </h2>
  );
}
