import { useId, useState } from "react";
import { highlight, type LanguageName } from "sugar-high";

export interface Snippet {
  label: string;
  lang: LanguageName;
  code: string;
}

/**
 * A code block, with tabs when there is more than one snippet. The
 * highlighter escapes the text it marks up, and every snippet is a literal in
 * this site's source.
 */
export function Code({
  snippets,
  title,
}: {
  snippets: Snippet[];
  title?: string;
}) {
  const [index, setIndex] = useState(0);
  const [copied, setCopied] = useState(false);
  const id = useId();
  const snippet = snippets[index] ?? snippets[0]!;
  const tabbed = snippets.length > 1;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="code">
      <div className="code-head">
        {tabbed ? (
          <div className="code-tabs" role="tablist" aria-label={title}>
            {snippets.map((s, i) => (
              <button
                key={s.label}
                type="button"
                role="tab"
                id={`${id}-tab-${i}`}
                aria-selected={i === index}
                aria-controls={`${id}-panel`}
                className="code-tab"
                onClick={() => setIndex(i)}
              >
                {s.label}
              </button>
            ))}
          </div>
        ) : (
          <span className="code-title">{title ?? snippet.label}</span>
        )}
        <button type="button" className="copy" onClick={() => void copy()}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre
        id={`${id}-panel`}
        role={tabbed ? "tabpanel" : undefined}
        aria-labelledby={tabbed ? `${id}-tab-${index}` : undefined}
        tabIndex={0}
      >
        <code
          dangerouslySetInnerHTML={{
            __html: highlight(snippet.code, { lang: snippet.lang }),
          }}
        />
      </pre>
    </div>
  );
}
