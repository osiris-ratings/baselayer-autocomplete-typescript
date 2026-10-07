// The test form's title, which says what the field searches for: "Autocomplete
// a business · a person · an address". Each search, its article with it, is a
// tab over the field, the selected one's noun underlined, and only the
// searches the session may make are offered; with one, the title just names
// it.

import { Fragment, useRef, type KeyboardEvent } from "react";

import type { Route } from "@baselayer-sdk/autocomplete";

/** Each search's word in the title. */
export const SEARCH_WORDS: Record<Route, string> = {
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
        Autocomplete{" "}
        {routes.length > 1 ? (
          <span role="tablist" aria-label="Search by" className="search-by">
            {routes.map((each, index) => (
              <Fragment key={each}>
                {index > 0 && (
                  <span className="search-by-sep" aria-hidden="true">
                    {" · "}
                  </span>
                )}
                <button
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
                  {ARTICLES[each]}{" "}
                  <span className="search-by-noun">{SEARCH_WORDS[each]}</span>
                </button>
              </Fragment>
            ))}
          </span>
        ) : (
          `${ARTICLES[route]} ${SEARCH_WORDS[route]}`
        )}
      </span>
    </h2>
  );
}
