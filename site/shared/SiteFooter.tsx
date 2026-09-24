import { GitHubMark } from "./GitHubMark";
import { links } from "./links";
import { Logo } from "./Logo";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="wrap">
        <div className="footer-grid">
          <div>
            <a
              className="brand-logo"
              href={links.baselayer}
              aria-label="Baselayer"
            >
              <Logo height={22} />
            </a>
            <p>
              Entity autocomplete for your own product, from Baselayer&apos;s
              registry: businesses today, people, addresses and liens soon, each
              linked to the rest.
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
            </ul>
          </nav>
          <nav aria-labelledby="footer-baselayer">
            <h2 id="footer-baselayer">Baselayer</h2>
            <ul>
              <li>
                <a href={links.baselayer}>baselayer.com</a>
              </li>
              <li>
                <a className="footer-github" href={links.source}>
                  <GitHubMark size={16} /> Source on GitHub
                </a>
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
