// The icon a segment draws before its text: a glyph for what it names, by
// its role where the row knows it. Drawn here, in the text's colour, so a
// host's look colours them as it does the text.

import type { ReactNode } from "react";

import type { EntityType, RelatedRole } from "@baselayer-sdk/autocomplete";

/** What a host keys an icon by: an entity, or an entity in a role. */
export type IconKey = EntityType | `${EntityType}:${RelatedRole}`;

/**
 * A host's own icons, by entity or by entity and role, the role's winning;
 * `false` hides that one. `false` for the whole set draws none at all.
 */
export type IconSet = Partial<Record<IconKey, ReactNode>> | false;

/** The SDK's own glyphs. */
type Glyph = "building" | "person" | "pin" | "envelope" | "briefcase" | "house";

function Svg({ children }: { children: ReactNode }) {
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

const GLYPHS: Readonly<Record<Glyph, ReactNode>> = Object.freeze({
  building: (
    <Svg>
      <path d="M3 14.5V2.75A.75.75 0 0 1 3.75 2h6.5a.75.75 0 0 1 .75.75V14.5" />
      <path d="M11 6.5h1.75a.75.75 0 0 1 .75.75v7.25" />
      <path d="M1.5 14.5h13" />
      <path d="M5.5 4.75h1M7.5 4.75h1M5.5 7.5h1M7.5 7.5h1M5.5 10.25h1M7.5 10.25h1" />
    </Svg>
  ),
  person: (
    <Svg>
      <circle cx="8" cy="5" r="2.75" />
      <path d="M2.75 14.25c0-2.9 2.35-4.75 5.25-4.75s5.25 1.85 5.25 4.75" />
    </Svg>
  ),
  pin: (
    <Svg>
      <path d="M8 14.5s-4.75-4.5-4.75-8.25a4.75 4.75 0 0 1 9.5 0C12.75 10 8 14.5 8 14.5Z" />
      <circle cx="8" cy="6.25" r="1.75" />
    </Svg>
  ),
  envelope: (
    <Svg>
      <rect x="1.75" y="3.25" width="12.5" height="9.5" rx="1.25" />
      <path d="m2.25 4.25 5.75 4.5 5.75-4.5" />
    </Svg>
  ),
  briefcase: (
    <Svg>
      <rect x="1.75" y="5" width="12.5" height="8.5" rx="1.25" />
      <path d="M5.75 5V3.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V5" />
      <path d="M1.75 9h12.5" />
    </Svg>
  ),
  house: (
    <Svg>
      <path d="M1.75 7.5 8 2.25l6.25 5.25" />
      <path d="M3.5 6.25v7.25h9V6.25" />
      <path d="M6.75 13.5V10.25h2.5v3.25" />
    </Svg>
  ),
});

/**
 * The SDK's glyph for an entity in a role: an address by how it is held, a
 * person by whether they are an officer or an agent, a business always a
 * building. With no role, the entity's own.
 */
export function glyphFor(entity: EntityType, role: RelatedRole | null): Glyph {
  switch (entity) {
    case "business":
      return "building";
    case "person":
      return role === "agent" ? "briefcase" : "person";
    case "address":
      switch (role) {
        case "mailing":
          return "envelope";
        case "agent":
          return "briefcase";
        case "officer":
          return "house";
        case "principal":
        case null:
          return "pin";
      }
  }
}

/**
 * The icon to draw: the host's for the role, else the host's for the entity,
 * else the SDK's glyph (named, for `data-glyph`); null for none.
 */
function iconFor(
  icons: IconSet | undefined,
  entity: EntityType,
  role: RelatedRole | null,
): { node: ReactNode; glyph: Glyph | null } | null {
  if (icons === false) {
    return null;
  }
  for (const key of [role === null ? null : `${entity}:${role}`, entity]) {
    const own = key === null ? undefined : icons?.[key as IconKey];
    if (own === false || own === null) {
      return null;
    }
    if (own !== undefined) {
      return { node: own, glyph: null };
    }
  }
  const glyph = glyphFor(entity, role);
  return { node: GLYPHS[glyph], glyph };
}

/** A segment's icon, hidden from screen readers; nothing where none is drawn. */
export function SegmentIcon({
  icons,
  entity,
  role,
  className,
}: {
  icons: IconSet | undefined;
  entity: EntityType;
  role: RelatedRole | null;
  className: string | undefined;
}) {
  const icon = iconFor(icons, entity, role);
  if (icon === null) {
    return null;
  }
  return (
    <span
      className={className}
      data-entity={entity}
      data-role={role ?? undefined}
      data-glyph={icon.glyph ?? undefined}
      aria-hidden="true"
    >
      {icon.node}
    </span>
  );
}
