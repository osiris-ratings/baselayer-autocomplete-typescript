// Line icons in the weight baselayer.com uses: 1.5 px strokes on a 24 px grid,
// painted with `currentColor`.

export type IconName =
  | "caret"
  | "name"
  | "states"
  | "address"
  | "people"
  | "marks"
  | "token"
  | "lock"
  | "clock"
  | "nocookie"
  | "lien"
  | "bug"
  | "palette";

const PATHS: Record<IconName, string> = {
  caret: "M9 6h6M9 18h6M12 6v12",
  name: "M4 20V9l8-5 8 5v11M4 20h16M9 20v-6h6v6",
  states: "M3 5h7v7H3zM14 5h7v7h-7zM3 16h7v3H3zM14 16h7v3h-7z",
  address:
    "M12 21s-6.5-6.2-6.5-11A6.5 6.5 0 0 1 18.5 10c0 4.8-6.5 11-6.5 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  people:
    "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 6.5M18.5 14.8c1.7.8 2.8 2.6 3 5.2",
  marks: "M4 17h16M6 13l4-9 4 9M7.4 10h5.2M16 7h4M16 11h4",
  token:
    "M8 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM11.5 12H21M18 12v3.5M21 12v4",
  lock: "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3M12 14.5v2.5",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3.5 2",
  lien: "M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5",
  bug: "M9 9V7a3 3 0 0 1 6 0v2M7 9h10v6a5 5 0 0 1-10 0zM12 11v8M3 13h4M17 13h4M4 8l3 2M20 8l-3 2M4 19l3-2M20 19l-3-2",
  palette:
    "M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.8 1.6-1.6 0-.5-.2-.9-.5-1.2-.3-.4-.5-.8-.5-1.2 0-.9.7-1.6 1.6-1.6H16a5 5 0 0 0 5-5c0-4-4-7.4-9-7.4zM7.5 11.5h.01M9.5 7.5h.01M14.5 7.5h.01M17 11h.01",
  nocookie:
    "M12 21a9 9 0 1 1 8.5-12 2.5 2.5 0 0 1-3-3A9 9 0 0 0 12 3M9 10h.01M14 15h.01M9 15.5h.01M4 4l16 16",
};

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="icon"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
