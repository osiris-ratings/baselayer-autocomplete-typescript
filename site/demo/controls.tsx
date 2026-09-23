// The demo's form controls. Every one is the same height and border as a text
// input, selects included, so the panels read as one form.

import { useId, useState, type ReactNode } from "react";

import { Icon, type IconName } from "../shared/icons";

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
}) {
  const id = useId();
  return (
    <section
      className={nested ? "fold fold-nested" : "fold demo-card"}
      data-open={open ? "true" : "false"}
      data-testid={testId}
    >
      <h2 className="fold-heading">
        <button
          type="button"
          className="fold-toggle"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => onToggle(!open)}
        >
          {num !== undefined && <span className="demo-num">{num}</span>}
          <span className="fold-title">
            {icon !== undefined && <Icon name={icon} />}
            {title}
          </span>
          {summary !== undefined && !open && (
            <span className="fold-summary">{summary}</span>
          )}
          <span className="fold-chevron" aria-hidden="true" />
        </button>
      </h2>
      <div id={id} className="fold-body" hidden={!open}>
        {children}
      </div>
    </section>
  );
}

/** A fold that keeps its own open state. */
export function Fold(props: {
  title: string;
  summary?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(props.defaultOpen ?? false);
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

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** `#abc` and `#aabbccdd` as the six digits `<input type="color">` takes. */
function sixDigits(hex: string): string {
  if (/^#[0-9a-f]{3}$/i.test(hex)) {
    return `#${[...hex.slice(1)].map(c => c + c).join("")}`;
  }
  return hex.slice(0, 7);
}

/**
 * A hex colour: a swatch that opens the platform's colour picker, and the
 * value as text for pasting. With `allowAuto`, an empty value means "the
 * default for this treatment" and the swatch shows as unset.
 */
export function ColorInput({
  value,
  onChange,
  allowAuto = false,
  label,
}: {
  value: string | null;
  onChange(value: string | null): void;
  allowAuto?: boolean;
  label: string;
}) {
  const [draft, setDraft] = useState(value ?? "");
  const [editing, setEditing] = useState(false);
  const shown = editing ? draft : (value ?? "");
  const valid = value !== null && HEX.test(value);
  return (
    <span className="color" data-auto={value === null ? "true" : undefined}>
      <input
        type="color"
        aria-label={`${label}: pick a colour`}
        value={valid ? sixDigits(value) : "#ffffff"}
        onChange={event => onChange(event.target.value)}
      />
      <input
        type="text"
        className="color-hex"
        aria-label={`${label}: hex value`}
        value={shown}
        placeholder={allowAuto ? "auto" : "#rrggbb"}
        spellCheck={false}
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
    </span>
  );
}

export function Toggle({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange(checked: boolean): void;
  children: ReactNode;
}) {
  return (
    <label className="toggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={event => onChange(event.target.checked)}
      />
      <span>{children}</span>
    </label>
  );
}
