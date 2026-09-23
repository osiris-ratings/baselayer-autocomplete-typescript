import { useEffect, useState } from "react";

import { GitHubMark } from "./GitHubMark";
import { links, type Page } from "./links";
import { Logo } from "./Logo";
import { useScrollSpy } from "./useScrollSpy";

interface NavItem {
  label: string;
  href: string;
  /** The page this item is, or the page its section is on. */
  page: Page;
  /** The section on the overview this item scrolls to. */
  section?: string;
}

const NAV: NavItem[] = [
  {
    label: "Overview",
    href: links.overview,
    page: "home",
    section: "overview",
  },
  {
    label: "How it works",
    href: links.howItWorks,
    page: "home",
    section: "how-it-works",
  },
  {
    label: "Quick start",
    href: links.quickStart,
    page: "home",
    section: "quick-start",
  },
  { label: "API reference", href: links.api, page: "api" },
  { label: "Demo", href: links.demo, page: "demo" },
];

const HOME_SECTIONS = NAV.flatMap(item =>
  item.section !== undefined ? [item.section] : [],
);

export function SiteHeader({ current }: { current: Page }) {
  const [open, setOpen] = useState(false);
  const section = useScrollSpy(current === "home" ? HOME_SECTIONS : []);

  useEffect(() => {
    if (!open) {
      return;
    }
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);

  const isCurrent = (item: NavItem): boolean =>
    item.page === current && (current !== "home" || item.section === section);

  return (
    <header className="site-header">
      <div className="wrap">
        <div className="brand">
          <a
            className="brand-logo"
            href={links.baselayer}
            aria-label="Baselayer"
          >
            <Logo />
          </a>
          <a className="brand-product" href={links.home}>
            <span>Autocomplete</span>
            <span>SDK</span>
          </a>
        </div>
        <nav
          className="site-nav"
          id="site-nav"
          aria-label="Site"
          data-open={open ? "true" : "false"}
        >
          {NAV.map(item => (
            <a
              key={item.label}
              href={item.href}
              aria-current={
                isCurrent(item)
                  ? item.section !== undefined
                    ? "location"
                    : "page"
                  : undefined
              }
              onClick={() => setOpen(false)}
            >
              {item.label}
            </a>
          ))}
          <a className="nav-github" href={links.source}>
            <GitHubMark size={16} /> GitHub
          </a>
        </nav>
        {/* Try the demo leads, so leaving it out on the demo itself moves
            nothing else. */}
        <div className="header-actions">
          {current !== "demo" && (
            <a className="btn btn-primary btn-sm" href={links.demo}>
              Try the demo
            </a>
          )}
          <a
            className="btn btn-outline btn-sm btn-github"
            href={links.source}
            aria-label="Source on GitHub"
          >
            <GitHubMark />
            <span className="btn-github-label">GitHub</span>
          </a>
          <a className="btn btn-outline btn-sm" href={links.console}>
            Sign in
          </a>
          <button
            type="button"
            className="btn btn-outline btn-sm menu-toggle"
            aria-controls="site-nav"
            aria-expanded={open}
            onClick={() => setOpen(value => !value)}
          >
            {open ? "Close" : "Menu"}
          </button>
        </div>
      </div>
    </header>
  );
}
