// The line under a person's or an address's field once a business is picked
// from under it. The field keeps what was typed, and the component's own line
// would name the business alone: with no business name field of the demo's
// own to put the pick in, this one says it is the business that was picked, and
// what it was found through.

import type { PickToSearch } from "./search-view";

/**
 * Always mounted, so what it says is announced when a pick is made, as a live
 * region mounted before its text is; the line is there only while the pick is.
 */
export function PickedBusiness({ pick }: { pick: PickToSearch | null }) {
  return (
    <p className="demo-picked" role="status">
      {pick !== null && (
        <span className="demo-picked-line" data-testid="demo-picked-business">
          <span className="demo-picked-tag">Business</span>{" "}
          <span className="demo-picked-name">{pick.name}</span>{" "}
          <span className="demo-picked-about">{pick.about}</span>
        </span>
      )}
    </p>
  );
}
