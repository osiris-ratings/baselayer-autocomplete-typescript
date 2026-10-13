import type { RelatedItem } from "@baselayer-sdk/autocomplete";

/**
 * The role a listed item stands in: the one a person holds on a business
 * (`role`), or how an address is listed on a business (`listed_as`). Null where the
 * relationship has none: a person at an address, an address of a person.
 */
export function roleOf(item: RelatedItem): string | null {
  const { role, listed_as } = item as {
    role?: string | null;
    listed_as?: string | null;
  };
  return role ?? listed_as ?? null;
}

/**
 * What a table of role labels says for `role`: its label, or the value as the
 * autocomplete service sent it when the table has none, a role this build does
 * not know.
 */
export function roleLabel(
  labels: Readonly<Record<string, string>>,
  role: string,
): string {
  return Object.prototype.hasOwnProperty.call(labels, role)
    ? (labels[role] ?? role)
    : role;
}
