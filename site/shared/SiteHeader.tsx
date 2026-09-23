import { useEffect, useState } from "react";

import { links, type Page } from "./links";
import { Logo } from "./Logo";

const NAV: { label: string; href: string; page?: Page }[] = [
  { label: "Overview", href: links.home, page: "home" },
  { label: "How it works", href: links.howItWorks },
  { label: "Quick start", href: links.quickStart },
  { label: "API reference", href: links.api, page: "api" },
  { label: "Demo", href: links.demo, page: "demo" },
];

export function SiteHeader({ current }: { current: Page }) {
  const [open, setOpen] = useState(false);

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

  return (
    <header className="site-header">
      <div className="wrap">
        <a
          className="brand"
          href={links.home}
          aria-label="Baselayer Autocomplete SDK, home"
        >
          <Logo />
          <span className="brand-product">Autocomplete SDK</span>
        </a>
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
              aria-current={item.page === current ? "page" : undefined}
              onClick={() => setOpen(false)}
            >
              {item.label}
            </a>
          ))}
        </nav>
        <div className="header-actions">
          <a className="btn btn-outline btn-sm" href={links.console}>
            Sign in
          </a>
          {current !== "demo" && (
            <a className="btn btn-primary btn-sm" href={links.demo}>
              Try the demo
            </a>
          )}
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
