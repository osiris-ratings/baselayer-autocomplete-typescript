// The icon each line draws before its name: an office building for a
// business, a person for a person, a map pin for an address. Drawn here, in
// the text's colour, so a host's look colours them as it does the text.

import type { ReactNode } from "react";

import type { EntityType } from "@baselayer-sdk/autocomplete";

/** A host's own icon for any entity, or `false` for none at all. */
export type IconSet = Partial<Record<EntityType, ReactNode>> | false;

function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** The SDK's own icons. */
export const DEFAULT_ICONS: Readonly<Record<EntityType, ReactNode>> =
  Object.freeze({
    business: (
      <Glyph>
        <path d="M3 14.5V2.75A.75.75 0 0 1 3.75 2h6.5a.75.75 0 0 1 .75.75V14.5" />
        <path d="M11 6.5h1.75a.75.75 0 0 1 .75.75v7.25" />
        <path d="M1.5 14.5h13" />
        <path d="M5.5 4.75h1M7.5 4.75h1M5.5 7.5h1M7.5 7.5h1M5.5 10.25h1M7.5 10.25h1" />
      </Glyph>
    ),
    person: (
      <Glyph>
        <circle cx="8" cy="5" r="2.75" />
        <path d="M2.75 14.25c0-2.9 2.35-4.75 5.25-4.75s5.25 1.85 5.25 4.75" />
      </Glyph>
    ),
    address: (
      <Glyph>
        <path d="M8 14.5s-4.75-4.5-4.75-8.25a4.75 4.75 0 0 1 9.5 0C12.75 10 8 14.5 8 14.5Z" />
        <circle cx="8" cy="6.25" r="1.75" />
      </Glyph>
    ),
  });

/** The icon to draw for an entity: the host's, the SDK's, or none. */
export function iconFor(icons: IconSet | undefined, entity: EntityType) {
  if (icons === false) {
    return null;
  }
  return icons?.[entity] ?? DEFAULT_ICONS[entity];
}
