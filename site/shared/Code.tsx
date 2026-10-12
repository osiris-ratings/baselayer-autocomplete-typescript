import { useEffect, useId, useState, type ReactNode } from "react";
import { highlight, type LanguageName } from "sugar-high";

export interface Snippet {
  label: string;
  lang: LanguageName;
  code: string;
}

/**
 * A tab after the snippets, set apart by a rule, whose panel is the caller's:
 * an editor, say, which hands back the code the copy button takes.
 */
export interface CodeTool {
  label: string;
  /**
   * The tool's panel. What it hands back, by snippet label, is what those
   * snippets show from then on, so the two never disagree: the samples
   * following an editor, say.
   */
  render(onCode: (codes: Readonly<Record<string, string>>) => void): ReactNode;
  /** The label of the code the tool's own tab copies. */
  copies: string;
}

/**
 * A code block, with tabs when there is more than one snippet or a tool. The
 * highlighter escapes the text it marks up, and every snippet is a literal in
 * this site's source. A tool's panel stays mounted when another tab is shown,
 * so what was typed in it is there to come back to.
 */
export function Code({
  snippets,
  title,
  tool,
  live,
}: {
  snippets: Snippet[];
  title?: string;
  tool?: CodeTool;
  /**
   * A snippet that arrives later, such as a sent request's answer: a tab of
   * its own after a rule, there only once it is, and shown as it arrives.
   */
  live?: (Snippet & { key: number }) | null;
}) {
  const [index, setIndex] = useState(0);
  const [copied, setCopied] = useState(false);
  const [toolCodes, setToolCodes] = useState<Readonly<Record<string, string>>>(
    {},
  );
  const id = useId();
  const toolIndex = tool === undefined ? -1 : snippets.length;
  const liveIndex =
    live === undefined || live === null
      ? -1
      : snippets.length + (tool === undefined ? 0 : 1);
  const onTool = index === toolIndex;
  const onLive = index === liveIndex;
  const shown = onLive && live ? live : (snippets[index] ?? snippets[0]!);
  const followed = onLive ? undefined : toolCodes[shown.label];
  const snippet = followed === undefined ? shown : { ...shown, code: followed };
  const tabbed =
    snippets.length > 1 || tool !== undefined || (live ?? null) !== null;
  const liveKey = live?.key;
  // Each new answer is shown as it arrives.
  useEffect(() => {
    if (liveKey !== undefined && liveIndex >= 0) setIndex(liveIndex);
  }, [liveKey, liveIndex]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        onTool && tool !== undefined
          ? (toolCodes[tool.copies] ?? "")
          : snippet.code,
      );
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
            {tool !== undefined && (
              <>
                <span className="code-sep" aria-hidden="true" />
                <button
                  type="button"
                  role="tab"
                  id={`${id}-tab-tool`}
                  aria-selected={onTool}
                  aria-controls={`${id}-tool`}
                  className="code-tab"
                  onClick={() => setIndex(snippets.length)}
                >
                  {tool.label}
                </button>
              </>
            )}
            {live !== undefined && live !== null && (
              <>
                <span className="code-sep" aria-hidden="true" />
                <button
                  type="button"
                  role="tab"
                  id={`${id}-tab-${liveIndex}`}
                  aria-selected={onLive}
                  aria-controls={`${id}-panel`}
                  className="code-tab code-tab-live"
                  onClick={() => setIndex(liveIndex)}
                >
                  {live.label}
                </button>
              </>
            )}
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
        hidden={onTool}
      >
        <code
          dangerouslySetInnerHTML={{
            __html: highlight(snippet.code, { lang: snippet.lang }),
          }}
        />
      </pre>
      {tool !== undefined && (
        <div
          id={`${id}-tool`}
          role="tabpanel"
          aria-labelledby={`${id}-tab-tool`}
          className="code-tool"
          hidden={!onTool}
        >
          {tool.render(setToolCodes)}
        </div>
      )}
    </div>
  );
}
