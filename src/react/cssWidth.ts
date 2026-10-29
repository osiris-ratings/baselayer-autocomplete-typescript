// Whether a string is a CSS `width`, decided here and not by the browser, so a
// page rendered on a server and the page it becomes say the same. It follows
// how CSS puts a width together, and no further: a unit's name is not checked,
// and `var()` and `env()` are taken as they are, their values being unknown.

/** What a term is: a length or a percentage, a bare number, or not known. */
type Kind = "length" | "number" | "any";

const KEYWORDS = new Set(["max-content", "min-content", "fit-content"]);
const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i;
const UNIT = /^(?:%|[a-z]+)/i;
const NAME = /^[a-z][\w-]*/i;
const CUSTOM_NAME = /^--[\w-]+/;

class Reader {
  at = 0;
  constructor(readonly text: string) {}

  peek(): string {
    return this.text[this.at] ?? "";
  }

  /** Steps over spaces; whether there were any. */
  space(): boolean {
    const from = this.at;
    while (/\s/.test(this.peek())) this.at++;
    return this.at > from;
  }

  take(pattern: RegExp): string | null {
    const found = pattern.exec(this.text.slice(this.at));
    if (found === null) return null;
    this.at += found[0].length;
    return found[0];
  }

  done(): boolean {
    return this.at === this.text.length;
  }
}

/** Two terms added: alike, or one of them not known. */
function sum(a: Kind, b: Kind): Kind | null {
  if (a === b) return a;
  if (a === "any") return b;
  if (b === "any") return a;
  return null;
}

/** A term, or terms multiplied or divided. */
function product(reader: Reader): Kind | null {
  let kind = term(reader);
  while (kind !== null) {
    const before = reader.at;
    reader.space();
    const operator = reader.peek();
    if (operator !== "*" && operator !== "/") {
      reader.at = before;
      break;
    }
    reader.at++;
    reader.space();
    const next = term(reader);
    if (next === null) return null;
    if (operator === "/") {
      // Only a number divides.
      if (next === "length") return null;
      if (kind === "number" && next === "any") kind = "any";
    } else if (kind === "length" || next === "length") {
      // Only one factor is a length.
      if (kind === "length" && next === "length") return null;
      kind = "length";
    } else if (kind === "number") {
      kind = next;
    }
  }
  return kind;
}

/** Terms added or subtracted, each operator with a space on both sides. */
function sumOf(reader: Reader): Kind | null {
  let kind = product(reader);
  while (kind !== null) {
    const before = reader.at;
    if (!reader.space() || !/[+-]/.test(reader.peek())) {
      reader.at = before;
      break;
    }
    reader.at++;
    if (!reader.space()) return null;
    const next = product(reader);
    if (next === null) return null;
    kind = sum(kind, next);
  }
  return kind;
}

/** Between the brackets of a function: `count` sums, or any number if null. */
function argumentsOf(reader: Reader, count: number | null): Kind | null {
  let kind: Kind | null = "any";
  let seen = 0;
  for (;;) {
    reader.space();
    const argument = sumOf(reader);
    if (argument === null || kind === null) return null;
    kind = sum(kind, argument);
    seen++;
    reader.space();
    if (reader.peek() === ",") {
      reader.at++;
      continue;
    }
    break;
  }
  if (reader.peek() !== ")") return null;
  reader.at++;
  return count !== null && seen !== count ? null : kind;
}

/**
 * `var(--name)`, `var(--name, anything balanced)`, and `env(name)` alike: the
 * name is a custom property's, which may start with a digit after its two
 * dashes, or an environment variable's.
 */
function lookup(reader: Reader, name: RegExp): Kind | null {
  reader.space();
  if (reader.take(name) === null) return null;
  reader.space();
  if (reader.peek() === ",") {
    let depth = 0;
    for (; !reader.done(); reader.at++) {
      const char = reader.peek();
      if (char === "(") depth++;
      else if (char === ")" && depth-- === 0) break;
    }
  }
  if (reader.peek() !== ")") return null;
  reader.at++;
  return "any";
}

/** A number, a length, a percentage, a group or a function. */
function term(reader: Reader): Kind | null {
  if (reader.peek() === "(") {
    reader.at++;
    reader.space();
    const kind = sumOf(reader);
    reader.space();
    if (kind === null || reader.peek() !== ")") return null;
    reader.at++;
    return kind;
  }
  if (NUMBER.test(reader.text.slice(reader.at))) {
    reader.take(NUMBER);
    return reader.take(UNIT) === null ? "number" : "length";
  }
  const name = reader.take(NAME)?.toLowerCase();
  if (name === undefined || reader.peek() !== "(") return null;
  reader.at++;
  switch (name) {
    case "calc":
      return argumentsOf(reader, 1);
    case "min":
    case "max":
      return argumentsOf(reader, null);
    case "clamp":
      return argumentsOf(reader, 3);
    case "var":
      return lookup(reader, CUSTOM_NAME);
    case "env":
      return lookup(reader, NAME);
    default:
      return null;
  }
}

/** Whether `text`, trimmed, is a CSS length, percentage, keyword or function. */
export function isCssWidth(text: string): boolean {
  const width = text.trim().toLowerCase();
  if (KEYWORDS.has(width)) return true;
  // A width is not negative, and is not a sum or a group of its own.
  if (width === "" || width.startsWith("-") || width.startsWith("(")) {
    return false;
  }
  const reader = new Reader(width);
  if (reader.take(/^fit-content\(/) !== null) {
    reader.space();
    const kind = sumOf(reader);
    reader.space();
    if (kind === null || kind === "number" || reader.peek() !== ")") {
      return false;
    }
    reader.at++;
    return reader.done();
  }
  const kind = term(reader);
  return reader.done() && (kind === "length" || kind === "any");
}
