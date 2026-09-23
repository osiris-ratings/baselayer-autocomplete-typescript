import { links } from "./links";
import { Logo } from "./Logo";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="wrap">
        <div className="footer-grid">
          <div>
            <a className="brand" href={links.home} aria-label="Baselayer">
              <Logo height={22} />
            </a>
            <p>
              Business-name autocomplete for your own product, backed by
              Baselayer&apos;s registry of US business registrations.
            </p>
          </div>
          <nav aria-labelledby="footer-sdk">
            <h2 id="footer-sdk">SDK</h2>
            <ul>
              <li>
                <a href={links.home}>Overview</a>
              </li>
              <li>
                <a href={links.howItWorks}>How it works</a>
              </li>
              <li>
                <a href={links.quickStart}>Quick start</a>
              </li>
              <li>
                <a href={links.demo}>Demo</a>
              </li>
            </ul>
          </nav>
          <nav aria-labelledby="footer-reference">
            <h2 id="footer-reference">Reference</h2>
            <ul>
              <li>
                <a href={links.apiSessions}>Create a session</a>
              </li>
              <li>
                <a href={links.apiBusinesses}>Search businesses</a>
              </li>
              <li>
                <a href={links.apiErrors}>Errors</a>
              </li>
              <li>
                <a href={links.platformDocs}>Platform API docs</a>
              </li>
            </ul>
          </nav>
          <nav aria-labelledby="footer-baselayer">
            <h2 id="footer-baselayer">Baselayer</h2>
            <ul>
              <li>
                <a href={links.baselayer}>baselayer.com</a>
              </li>
              <li>
                <a href={links.console}>Sign in to the console</a>
              </li>
              <li>
                <a href={links.source}>Source on GitHub</a>
              </li>
            </ul>
          </nav>
        </div>
        <div className="footer-base">
          <span>© {new Date().getFullYear()} Baselayer</span>
          <span>@baselayer/autocomplete · pre-release 0.x</span>
        </div>
      </div>
    </footer>
  );
}
