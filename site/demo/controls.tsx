// The demo's form controls. Every one is the same height and border as a text
// input, selects included, so the panels read as one form.

import { useId, useRef, useState, type ReactNode, type Ref } from "react";

import { Icon, type IconName } from "../shared/icons";

/** How long a fold takes to open or close: `.fold-body`'s transition. */
export const FOLD_MS = 320;

export function Collapsible({
  title,
  num,
  summary,
  open,
  onToggle,
  children,
  nested = false,
  testId,
  icon,
  toggleRef,
  className,
  actions,
  keepSummary = false,
}: {
  title: string;
  /** Drawn before the title. */
  icon?: IconName;
  num?: string;
  summary?: ReactNode;
  open: boolean;
  onToggle(open: boolean): void;
  children: ReactNode;
  nested?: boolean;
  testId?: string;
  /** The heading's button, for the host to move focus to. */
  toggleRef?: Ref<HTMLButtonElement>;
  /** The section's own look, in place of the card or the nested fold. */
  className?: string;
  /** Controls beside the toggle (a toggle cannot hold buttons of its own). */
  actions?: ReactNode;
  /** Show the summary open as well as folded. */
  keepSummary?: boolean;
}) {
  const id = useId();
  const look = className ?? (nested ? "fold-nested" : "demo-card");
  return (
    <section
      className={`fold ${look}`}
      data-open={open ? "true" : "false"}
      data-testid={testId}
    >
      <h2 className="fold-heading">
        <button
          ref={toggleRef}
          type="button"
          className="fold-toggle"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => onToggle(!open)}
        >
          {num !== undefined && <span className="demo-num">{num}</span>}
          <span className="fold-title">
            {title}
            {icon !== undefined && <Icon name={icon} />}
          </span>
          {summary !== undefined && (keepSummary || !open) && (
            <span className="fold-summary">{summary}</span>
          )}
          <span className="fold-chevron" aria-hidden="true" />
        </button>
        {actions}
      </h2>
      {/* Folds by animating its height (a 1fr to 0fr grid row); inert while
          folded, so nothing out of sight can take focus. */}
      <div
        id={id}
        className="fold-body"
        data-open={open ? "true" : "false"}
        inert={!open}
      >
        <div className="fold-body-inner">{children}</div>
      </div>
    </section>
  );
}

/** A fold that keeps its own open state. */
export function Fold(props: {
  title: string;
  summary?: ReactNode;
  children: ReactNode;
}) {
  // Every fold starts folded: the panel opens as a list of what there is.
  const [open, setOpen] = useState(false);
  return (
    <Collapsible
      nested
      title={props.title}
      summary={props.summary}
      open={open}
      onToggle={setOpen}
    >
      {props.children}
    </Collapsible>
  );
}

export function Field({
  label,
  hint,
  optional = false,
  required = false,
  group = false,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  optional?: boolean;
  required?: boolean;
  /** Several inputs that label themselves: a group, not one `<label>`. */
  group?: boolean;
  children: ReactNode;
}) {
  const Row = group ? "div" : "label";
  return (
    <Row className="field-row" role={group ? "group" : undefined}>
      <span className="field-label">
        {label}
        {optional && <span className="field-optional">optional</span>}
        {required && (
          <span className="field-required" aria-hidden="true">
            *
          </span>
        )}
      </span>
      {children}
      {hint !== undefined && <span className="field-hint">{hint}</span>}
    </Row>
  );
}

export function Select<T extends string>({
  value,
  options,
  onChange,
  labels,
}: {
  value: T;
  options: readonly T[];
  onChange(value: T): void;
  labels?: Partial<Record<T, string>>;
}) {
  return (
    <span className="select">
      <select
        value={value}
        onChange={event => onChange(event.target.value as T)}
      >
        {options.map(option => (
          <option key={option} value={option}>
            {labels?.[option] ?? option}
          </option>
        ))}
      </select>
    </span>
  );
}

/** One choice of a `Segmented`. */
export interface Segment<T extends string> {
  value: T;
  label: string;
  /** Why it cannot be picked, as its tooltip; unset, it can. */
  disabledReason?: string | undefined;
}

const STEPS: Partial<Record<string, 1 | -1>> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
};

/**
 * Where an arrow key goes from `from`: the next segment that can be picked,
 * a `step` at a time, round the end; `from` itself when no other can.
 */
export function nextSegment(
  enabled: readonly boolean[],
  from: number,
  step: 1 | -1,
): number {
  const count = enabled.length;
  for (let offset = 1; offset < count; offset++) {
    const index = (((from + step * offset) % count) + count) % count;
    if (enabled[index] === true) return index;
  }
  return from;
}

/**
 * Choices of which exactly one is picked, drawn as the tabs are: a radio
 * group whose arrow keys pick the next choice that can be picked. A choice
 * that cannot is shown, disabled, with a tooltip saying why.
 */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly Segment<T>[];
  onChange(value: T): void;
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const enabled = options.map(option => option.disabledReason === undefined);
  const pick = (index: number) => {
    const option = options[index];
    if (option === undefined || enabled[index] !== true) return;
    onChange(option.value);
    buttons.current[index]?.focus();
  };
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((option, index) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            ref={element => {
              buttons.current[index] = element;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            // Not `disabled`: a disabled button shows no tooltip everywhere.
            aria-disabled={enabled[index] === true ? undefined : true}
            title={option.disabledReason}
            tabIndex={checked ? 0 : -1}
            onClick={() => pick(index)}
            onKeyDown={event => {
              const step = STEPS[event.key];
              if (step === undefined) return;
              event.preventDefault();
              pick(nextSegment(enabled, index, step));
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** `#abc` and `#aabbccdd` as the six digits `<input type="color">` takes. */
function sixDigits(hex: string): string {
  if (/^#[0-9a-f]{3}$/i.test(hex)) {
    return `#${[...hex.slice(1)].map(c => c + c).join("")}`;
  }
  return hex.slice(0, 7);
}

/**
 * A hex color: a swatch that opens the platform's color picker, and the
 * value as text for pasting. With `allowAuto`, an empty value means "the
 * default for this treatment" and the swatch shows as unset.
 */
export function ColorInput({
  value,
  onChange,
  allowAuto = false,
  label,
  reset,
}: {
  value: string | null;
  onChange(value: string | null): void;
  allowAuto?: boolean;
  label: string;
  /** What the button inside the field puts back, and whose value it is. */
  reset?: { value: string | null; to: string };
}) {
  const [draft, setDraft] = useState(value ?? "");
  const [editing, setEditing] = useState(false);
  const shown = editing ? draft : (value ?? "");
  const valid = value !== null && HEX.test(value);
  const resettable =
    reset !== undefined &&
    (value ?? "").toLowerCase() !== (reset.value ?? "").toLowerCase();
  return (
    <span className="color" data-auto={value === null ? "true" : undefined}>
      <input
        type="color"
        aria-label={`${label}: pick a color`}
        value={valid ? sixDigits(value) : "#ffffff"}
        onChange={event => onChange(event.target.value)}
      />
      <span className="color-field">
        <input
          type="text"
          className="color-hex"
          aria-label={`${label}: hex value`}
          value={shown}
          placeholder={allowAuto ? "auto" : "#rrggbb"}
          spellCheck={false}
          data-resettable={resettable || undefined}
          onFocus={() => {
            setDraft(value ?? "");
            setEditing(true);
          }}
          onBlur={() => setEditing(false)}
          onChange={event => {
            const next = event.target.value.trim();
            setDraft(next);
            if (next === "" && allowAuto) onChange(null);
            else if (HEX.test(next)) onChange(next);
          }}
        />
        {resettable && (
          <button
            type="button"
            className="color-reset"
            aria-label={`Reset ${label} to ${reset.to}`}
            title={`Reset to ${reset.to}`}
            onClick={() => {
              setDraft(reset.value ?? "");
              onChange(reset.value);
            }}
          >
            <Icon name="reset" size={16} />
          </button>
        )}
      </span>
    </span>
  );
}

export function Toggle({
  checked,
  onChange,
  children,
  disabled = false,
}: {
  checked: boolean;
  onChange(checked: boolean): void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className="toggle" data-disabled={disabled || undefined}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={event => onChange(event.target.checked)}
      />
      <span>{children}</span>
    </label>
  );
}
