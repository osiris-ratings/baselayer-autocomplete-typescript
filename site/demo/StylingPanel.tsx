// Every knob the styled component has, grouped the way a designer would reach
// for them, and at the end the code that reproduces the result.

import type { Include } from "@baselayer/autocomplete";

import { Code } from "../shared/Code";
import { ColorInput, Field, Fold, Select, Toggle } from "./controls";
import {
  CSS_VARIABLES,
  DEFAULT_STYLE,
  EMPHASES,
  INCLUDES,
  LOOK_COLORS,
  REGIONS,
  TEXT_MESSAGES,
  changedLook,
  changedMessages,
  changedVars,
  exportCode,
  type CssVariable,
  type StyleState,
  type TextMessage,
} from "./style-state";

const MESSAGE_LABELS: Record<TextMessage, string> = {
  searching: "While searching",
  truncatedNoRows: "Cut short, no rows",
  truncatedRows: "Cut short, some rows",
  match: "One match",
  matches: "Several matches",
  noAddress: "No address on file",
  agentSuffix: "After an agent's name",
  dayLimit: "Daily limit reached",
  unavailable: "Unavailable",
  authUnavailable: "Session refused",
};

function count(n: number): string | undefined {
  return n === 0 ? undefined : `${n} changed`;
}

export function StylingPanel({
  state,
  onChange,
}: {
  state: StyleState;
  onChange(state: StyleState): void;
}) {
  const set = <K extends keyof StyleState>(key: K, value: StyleState[K]) =>
    onChange({ ...state, [key]: value });
  const setLook = <K extends keyof StyleState["look"]>(
    key: K,
    value: StyleState["look"][K],
  ) => onChange({ ...state, look: { ...state.look, [key]: value } });
  const setVar = (name: CssVariable, value: string) =>
    onChange({ ...state, vars: { ...state.vars, [name]: value } });
  const look = changedLook(state);
  const vars = changedVars(state);
  const code = exportCode(state);
  const colorVars = (Object.keys(CSS_VARIABLES) as CssVariable[]).filter(
    name => CSS_VARIABLES[name].kind === "color",
  );
  const shapeVars = (Object.keys(CSS_VARIABLES) as CssVariable[]).filter(
    name => CSS_VARIABLES[name].kind !== "color",
  );
  const lookChanged = (keys: string[]) =>
    keys.filter(key => key in look).length;

  return (
    <div className="styling-panel">
      <Fold
        title="Matches"
        defaultOpen
        summary={count(
          lookChanged([
            "matchEmphasis",
            "matchEmphasisRegion",
            "matchEmphasisColor",
            "showDebugInfo",
          ]),
        )}
      >
        <div className="field-grid">
          <Field label="Emphasis">
            <Select
              value={state.look.matchEmphasis}
              options={EMPHASES}
              onChange={value => setLook("matchEmphasis", value)}
            />
          </Field>
          <Field label="Region">
            <Select
              value={state.look.matchEmphasisRegion}
              options={REGIONS}
              labels={{ token: "whole word", substring: "typed characters" }}
              onChange={value => setLook("matchEmphasisRegion", value)}
            />
          </Field>
          <Field
            label="Mark colour"
            group
            hint="Empty: each emphasis's own colour."
          >
            <ColorInput
              label="Mark colour"
              allowAuto
              value={state.look.matchEmphasisColor}
              onChange={value => setLook("matchEmphasisColor", value)}
            />
          </Field>
          <Field label="Footer" group>
            <Toggle
              checked={state.look.showDebugInfo}
              onChange={value => setLook("showDebugInfo", value)}
            >
              Round trip and index
            </Toggle>
          </Field>
        </div>
      </Fold>

      <Fold
        title="Colours"
        summary={count(
          lookChanged(LOOK_COLORS.map(c => c.key)) +
            vars.filter(([name]) => CSS_VARIABLES[name].kind === "color")
              .length,
        )}
      >
        <div className="field-grid">
          {LOOK_COLORS.map(({ key, label }) => (
            <Field key={key} label={label} group hint={<code>look.{key}</code>}>
              <ColorInput
                label={label}
                value={state.look[key]}
                onChange={value =>
                  setLook(key, value ?? DEFAULT_STYLE.look[key])
                }
              />
            </Field>
          ))}
          {colorVars.map(name => (
            <Field
              key={name}
              label={CSS_VARIABLES[name].label}
              group
              hint={<code>{name}</code>}
            >
              <ColorInput
                label={CSS_VARIABLES[name].label}
                value={state.vars[name]}
                onChange={value =>
                  setVar(name, value ?? CSS_VARIABLES[name].value)
                }
              />
            </Field>
          ))}
        </div>
      </Fold>

      <Fold
        title="Shape and size"
        summary={count(
          vars.filter(([name]) => CSS_VARIABLES[name].kind !== "color").length,
        )}
      >
        <div className="field-grid">
          {shapeVars.map(name => (
            <Field
              key={name}
              label={CSS_VARIABLES[name].label}
              hint={<code>{name}</code>}
            >
              <input
                type="text"
                value={state.vars[name]}
                placeholder={CSS_VARIABLES[name].value}
                spellCheck={false}
                onChange={event => setVar(name, event.target.value)}
              />
            </Field>
          ))}
        </div>
      </Fold>

      <Fold title="Behaviour">
        <div className="field-grid">
          <Field label="Rows" hint="1 to 20">
            <input
              type="number"
              min={1}
              max={20}
              value={state.limit}
              onChange={event =>
                set(
                  "limit",
                  Math.min(20, Math.max(1, Number(event.target.value) || 1)),
                )
              }
            />
          </Field>
          <Field label="Characters before asking">
            <input
              type="number"
              min={2}
              max={10}
              value={state.minChars}
              onChange={event =>
                set(
                  "minChars",
                  Math.min(10, Math.max(2, Number(event.target.value) || 2)),
                )
              }
            />
          </Field>
          <Field label="Pause before asking" hint="milliseconds">
            <input
              type="number"
              min={0}
              max={2000}
              step={50}
              value={state.debounceMs}
              onChange={event =>
                set(
                  "debounceMs",
                  Math.min(2000, Math.max(0, Number(event.target.value) || 0)),
                )
              }
            />
          </Field>
          <Field label="Related entities" group hint={<code>include</code>}>
            <span className="toggle-row">
              {INCLUDES.map(entity => (
                <Toggle
                  key={entity}
                  checked={state.include.includes(entity)}
                  onChange={on =>
                    set(
                      "include",
                      INCLUDES.filter(e =>
                        e === entity ? on : state.include.includes(e),
                      ) as Include[],
                    )
                  }
                >
                  {entity}
                </Toggle>
              ))}
            </span>
          </Field>
          <Field label="Session" group>
            <Toggle
              checked={state.prewarmOnFocus}
              onChange={value => set("prewarmOnFocus", value)}
            >
              Mint on focus (prewarm)
            </Toggle>
          </Field>
        </div>
      </Fold>

      <Fold
        title="Text"
        summary={count(
          changedMessages(state).length +
            (state.label !== DEFAULT_STYLE.label ? 1 : 0),
        )}
      >
        <div className="field-grid">
          <Field label="Label">
            <input
              type="text"
              value={state.label}
              onChange={event => set("label", event.target.value)}
            />
          </Field>
          {TEXT_MESSAGES.map(key => (
            <Field
              key={key}
              label={MESSAGE_LABELS[key]}
              hint={<code>messages.{key}</code>}
            >
              <input
                type="text"
                value={state.messages[key]}
                onChange={event =>
                  set("messages", {
                    ...state.messages,
                    [key]: event.target.value,
                  })
                }
              />
            </Field>
          ))}
        </div>
      </Fold>

      <Fold
        title="Structure"
        summary={count((state.pageInput ? 1 : 0) + (state.unstyled ? 1 : 0))}
      >
        <div className="field-grid">
          <Field label="Input" group hint={<code>classNames.input</code>}>
            <Toggle
              checked={state.pageInput}
              onChange={value => set("pageInput", value)}
            >
              Draw it with this page&apos;s input style
            </Toggle>
          </Field>
          <Field label="Stylesheet" group hint={<code>unstyled</code>}>
            <Toggle
              checked={state.unstyled}
              onChange={value => set("unstyled", value)}
            >
              Unstyled: class names only
            </Toggle>
          </Field>
        </div>
      </Fold>

      <div className="styling-export">
        <div className="styling-export-head">
          <p className="mono-label">Your configuration</p>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => onChange(DEFAULT_STYLE)}
          >
            Reset
          </button>
        </div>
        <Code
          title="Your configuration"
          snippets={[
            { label: "React", lang: "typescript", code: code.tsx },
            { label: "CSS", lang: "css", code: code.css },
          ]}
        />
      </div>
    </div>
  );
}
