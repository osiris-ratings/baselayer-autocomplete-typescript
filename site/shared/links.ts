// Every page link goes through the base path, so the site works at a domain's
// root or under a sub-path (`SITE_BASE=/autocomplete/ pnpm site:build`).
const base = import.meta.env.BASE_URL;

export const links = {
  home: base,
  overview: `${base}#overview`,
  howItWorks: `${base}#how-it-works`,
  quickStart: `${base}#quick-start`,
  security: `${base}#security`,
  api: `${base}api/`,
  apiSessions: `${base}api/#create-a-session`,
  apiBusinesses: `${base}api/#search-businesses`,
  apiErrors: `${base}api/#errors`,
  demo: `${base}demo/`,
  baselayer: "https://baselayer.com/",
  source: "https://github.com/osiris-ratings/baselayer-autocomplete-typescript",
} as const;

export type Page = "home" | "api" | "demo";
