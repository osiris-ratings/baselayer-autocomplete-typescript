declare const __SDK_VERSION__: string;
/** What `pnpm demo` forwards the page's calls to: an API host, or `sample`. */
declare const __DEMO_API__: string;
/**
 * Whether the dev server holds an API key for the demo to prefill (DEV ONLY,
 * site/demo-key.ts). A literal `false` in every build, so the code behind it is
 * not shipped.
 */
declare const __DEMO_PREFILL__: boolean;
