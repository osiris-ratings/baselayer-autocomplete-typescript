// Every knob the styled component has, grouped the way a designer would reach
// for them, and at the end the code that reproduces the result.

import { useState } from "react";

import {
  BUSINESS_STRUCTURES,
  ROUTE_NAMES,
  type Route,
} from "@baselayer-sdk/autocomplete";
import {
  MINT_TIMINGS,
  type MintTiming,
} from "@baselayer-sdk/autocomplete/react";

import { Code } from "../shared/Code";
import { ColorInput, Field, Fold, Select, Toggle } from "./controls";
import { RowMap } from "./RowMap";
import {
  CSS_VARIABLES,
  CUSTOM_FONT,
  FONT_CHOICES,
  FONT_WEIGHTS,
  SHAPE_KINDS,
  WEIGHT_LABELS,
  WEIGHT_VARIABLES,
  fontChoice,
  fontSnippets,
  DEFAULT_STYLE,
  INITIAL_STYLE,
  PRESETS,
  STRUCTURE_FLAGS,
  activePreset,
  applyPreset,
  presetChanges,
  presetColor,
  presetVar,
  EMPHASES,
  LOOK_COLORS,
  REGIONS,
  TEXT_MESSAGES,
  changedLook,
  changedMessages,
  changedStructures,
  componentChanges,
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

/** An unset variable, as a color field shows it: auto. */
function orAuto(value: string): string | null {
  return value === "" ? null : value;
}

function count(n: number): string | undefined {
  return n === 0 ? undefined : `${n} changed`;
}

const MINT_TIMING_LABELS: Record<MintTiming, string> = {
  focus: "On focus (eager prewarm)",
  keystroke: "On first keystroke (prewarm, the default)",
  request: "On first request (lazy)",
};

const ROW_TAB_LABELS: Record<Route, string> = {
  businesses: "Business",
  people: "Person",
  addresses: "Address",
};

export function StylingPanel({
  state,
  onChange,
  route = "businesses",
  routes = ROUTE_NAMES,
  onRoute = () => {},
}: {
  state: StyleState;
  onChange(state: StyleState): void;
  /** The search the form is on, whose row the Components fold edits. */
  route?: Route;
  /** The searches the form offers. */
  routes?: readonly Route[];
  onRoute?(route: Route): void;
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
  // Counted against the preset, as the resets inside the fields put back.
  const changes = presetChanges(state);
  const code = exportCode(state, route);
  const colorVars = (Object.keys(CSS_VARIABLES) as CssVariable[]).filter(
    name => CSS_VARIABLES[name].kind === "color",
  );
  const shapeVars = (Object.keys(CSS_VARIABLES) as CssVariable[]).filter(name =>
    SHAPE_KINDS.has(CSS_VARIABLES[name].kind),
  );
  const font = state.vars["--bl-ac-font"];
  // The stack last typed, so "Your own…" stays picked while it is edited,
  // even empty or spelled like a choice; a font set anywhere else, by a
  // preset or a reset, picks afresh.
  const [typedFont, setTypedFont] = useState<string | null>(() =>
    fontChoice(font) === CUSTOM_FONT ? font : null,
  );
  const fontPick = typedFont === font ? CUSTOM_FONT : fontChoice(font);
  const setFont = (stack: string, typed: boolean) => {
    setTypedFont(typed ? stack : null);
    setVar("--bl-ac-font", stack);
  };
  const lookChanged = (keys: string[]) =>
    keys.filter(key => key in look).length;

  const active = activePreset(state);

  return (
    <div className="styling-panel">
      <div className="presets-head">
        <p className="mono-label">Presets</p>
        {active === null && <p className="hint">Custom colors</p>}
      </div>
      <div className="presets" role="radiogroup" aria-label="Presets">
        {PRESETS.map(preset => {
          const shown = applyPreset(DEFAULT_STYLE, preset);
          const on = active?.name === preset.name;
          return (
            <button
              key={preset.name}
              type="button"
              role="radio"
              aria-checked={on}
              className="preset"
              onClick={() => onChange(applyPreset(state, preset))}
            >
              <span
                className="preset-swatch"
                aria-hidden="true"
                style={{
                  background: shown.look.backgroundColor,
                  borderRadius: shown.vars["--bl-ac-radius"],
                }}
              >
                <span
                  className="preset-title"
                  style={{ background: shown.look.titleColor }}
                />
                <span
                  className="preset-mark"
                  style={{ background: shown.vars["--bl-ac-underline"] }}
                />
                <span
                  className="preset-pill"
                  style={{
                    background: shown.look.pillBackgroundColor,
                    color: shown.look.pillForegroundColor,
                    borderColor: shown.look.primaryPillBorderColor,
                    borderRadius: shown.vars["--bl-ac-pill-radius"],
                  }}
                >
                  PA
                </span>
                <span
                  className="preset-sub"
                  style={{ background: shown.look.subtitleColor }}
                />
              </span>
              <span className="preset-name">{preset.name}</span>
            </button>
          );
        })}
      </div>

      <Fold title="Components" summary={count(componentChanges(state))}>
        <p className="hint fold-note">
          Drag lines and fields into place or onto Not shown, and enable or
          disable each line.
        </p>
        {routes.length > 1 && (
          <div
            className="tabs components-tabs"
            role="tablist"
            aria-label="Row of"
          >
            {routes.map(tab => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={route === tab}
                onClick={() => onRoute(tab)}
              >
                {ROW_TAB_LABELS[tab]}
              </button>
            ))}
          </div>
        )}
        <RowMap state={state} onChange={onChange} route={route} />
      </Fold>

      <Fold
        title="Highlights"
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
          <Field
            label="Emphasis"
            hint="Marks the typed words of the name. An officer, an address or a state a filter matched is marked whole."
          >
            <Select
              value={state.look.matchEmphasis}
              options={EMPHASES}
              onChange={value => setLook("matchEmphasis", value)}
            />
          </Field>
          <Field
            label="Region"
            hint="How much of a name's matched word is marked; a matched officer, address or state is always whole."
          >
            <Select
              value={state.look.matchEmphasisRegion}
              options={REGIONS}
              labels={{ token: "whole word", substring: "typed characters" }}
              onChange={value => setLook("matchEmphasisRegion", value)}
            />
          </Field>
          <Field
            label="Color override"
            group
            hint="One color for every emphasis, in place of each one's own (the underline, the background, the text). Empty: each keeps its own."
          >
            <ColorInput
              label="Color override"
              allowAuto
              reset={{ value: null, to: "auto" }}
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

      <Fold title="Colors" summary={count(changes.colors)}>
        <div className="field-grid">
          {LOOK_COLORS.map(({ key, label }) => (
            <Field key={key} label={label} group hint={<code>look.{key}</code>}>
              <ColorInput
                label={label}
                reset={{ value: presetColor(state, key), to: state.preset }}
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
                allowAuto={CSS_VARIABLES[name].value === ""}
                reset={{
                  value: orAuto(presetVar(state, name)),
                  to: state.preset,
                }}
                value={orAuto(state.vars[name])}
                onChange={value =>
                  setVar(name, value ?? CSS_VARIABLES[name].value)
                }
              />
            </Field>
          ))}
        </div>
      </Fold>

      <Fold title="Font" summary={count(changes.font)}>
        <p className="hint fold-note">
          The component takes the page&rsquo;s font unless{" "}
          <code>--bl-ac-font</code> names one. Unmatched and matched words take
          their weights under the weight emphasis (Highlights). A weight the
          font does not have is drawn in the nearest one it does: this page has
          Uncut Sans in 300 to 700, Newsreader in 200 to 800 and Geist Mono in
          400 and 500; a system font usually has all nine.
        </p>
        <div className="field-grid">
          <Field label="Font" hint={<code>--bl-ac-font</code>}>
            <Select
              value={fontPick}
              options={[
                ...FONT_CHOICES.map(choice => choice.value),
                CUSTOM_FONT,
              ]}
              labels={{
                ...Object.fromEntries(
                  FONT_CHOICES.map(choice => [choice.value, choice.label]),
                ),
                [CUSTOM_FONT]: "Your own…",
              }}
              onChange={value =>
                value === CUSTOM_FONT
                  ? setFont('"Your Font", system-ui, sans-serif', true)
                  : setFont(value, false)
              }
            />
          </Field>
          {fontPick === CUSTOM_FONT && (
            <Field
              label="Font stack"
              hint="Any CSS font-family; the preview draws it if this browser has it."
            >
              <input
                type="text"
                value={font}
                spellCheck={false}
                onChange={event =>
                  // A stack is names and commas: nothing that could end the rule.
                  setFont(event.target.value.replace(/[{};<>]/g, ""), true)
                }
              />
            </Field>
          )}
        </div>
        <div className="field-grid">
          {WEIGHT_VARIABLES.map(name => (
            <Field
              key={name}
              label={CSS_VARIABLES[name].label}
              hint={<code>{name}</code>}
            >
              <Select
                value={
                  (state.vars[name] ||
                    CSS_VARIABLES[name].value) as (typeof FONT_WEIGHTS)[number]
                }
                options={FONT_WEIGHTS}
                labels={WEIGHT_LABELS}
                onChange={value => setVar(name, value)}
              />
            </Field>
          ))}
        </div>
        <p className="mono-label">Using your own font</p>
        <Code snippets={fontSnippets(state)} />
      </Fold>

      <Fold title="Shape and size" summary={count(changes.shape)}>
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

      <Fold title="Behavior">
        <p className="hint fold-note">
          Rows shows on the sample rows too; the characters, the pause and the
          session act as you type.
        </p>
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
          <Field label="Mint the session" hint={<code>mintOn</code>}>
            <Select
              value={state.mintOn}
              options={MINT_TIMINGS}
              labels={MINT_TIMING_LABELS}
              onChange={value => set("mintOn", value)}
            />
          </Field>
          <Field label="Menu" group>
            <Toggle
              checked={state.menuFollowsInputWidth}
              onChange={value => set("menuFollowsInputWidth", value)}
            >
              As wide as the input
            </Toggle>
          </Field>
        </div>
      </Fold>

      <Fold
        title="Text"
        summary={count(
          changedMessages(state).length +
            changedStructures(state).length +
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
        <p className="mono-label fold-subhead">Structure flags</p>
        <p className="hint fold-note">
          Each structure&apos;s flag (<code>messages.structures</code>). Empty,
          it draws none.
        </p>
        <div className="field-grid">
          {BUSINESS_STRUCTURES.map(structure => (
            <Field
              key={structure}
              label={<code className="field-code">{structure}</code>}
            >
              <input
                type="text"
                value={state.structures[structure]}
                placeholder={
                  STRUCTURE_FLAGS[structure] === "" ? "no flag" : undefined
                }
                onChange={event =>
                  set("structures", {
                    ...state.structures,
                    [structure]: event.target.value,
                  })
                }
              />
            </Field>
          ))}
        </div>
      </Fold>

      <Fold
        title="Markup"
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
            onClick={() => onChange(INITIAL_STYLE)}
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
