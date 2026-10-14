import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  personNameCount,
  personNameText,
  stemCount,
  stemText,
} from "@baselayer-sdk/autocomplete";

// The characters a query counts against the filters' stem, as the autocomplete
// service counts them: businesses and addresses read the text as `stem`, people
// read the name as `person_name`. The rows are the service's own
// (`contracts/filter-counts.json`, vendored); a few more are this SDK's.

interface Row {
  q: string;
  /** The query is `q` repeated this many times. */
  times?: number;
  stem?: string;
  stem_len?: number;
  person?: string;
  person_len?: number;
}

const service = JSON.parse(
  readFileSync(
    resolve(__dirname, "../../contracts/filter-counts.json"),
    "utf8",
  ),
) as { version: number; rows: Row[] };

/** Cases of the SDK's own, on top of the service's. */
const own: Row[] = [
  { q: "AT&T Corp.", stem: "at and t corp", stem_len: 13 },
  { q: "Tri-City  o'brien", stem: "tri city o brien", stem_len: 16 },
  { q: "José", person: "jose", person_len: 4 },
];

const rows = [...service.rows, ...own].map(row => ({
  ...row,
  q: row.times !== undefined ? row.q.repeat(row.times) : row.q,
  /** What a failing case is called: a repeated query is not printed in full. */
  label: row.times !== undefined ? `${row.q} × ${row.times}` : row.q,
}));

describe("the service's count rows", () => {
  it("are version 1", () => {
    expect(service.version).toBe(1);
  });
});

describe("stemCount, the businesses and addresses count", () => {
  it.each(rows.filter(row => row.stem_len !== undefined))(
    "counts $label as $stem_len",
    row => {
      expect(stemCount(row.q)).toBe(row.stem_len);
    },
  );

  it.each(rows.filter(row => row.stem !== undefined))(
    "reads $label as $stem",
    row => {
      expect(stemText(row.q)).toBe(row.stem);
    },
  );

  it("counts code points, not UTF-16 units", () => {
    expect(stemCount("\u{20bb7}")).toBe(1);
    expect("\u{20bb7}".length).toBe(2);
  });
});

describe("personNameCount, the people count", () => {
  it.each(rows.filter(row => row.person_len !== undefined))(
    "counts $label as $person_len",
    row => {
      expect(personNameCount(row.q)).toBe(row.person_len);
    },
  );

  it.each(rows.filter(row => row.person !== undefined))(
    "reads $label as $person",
    row => {
      expect(personNameText(row.q)).toBe(row.person);
    },
  );

  it("counts code points, not UTF-16 units, and drops what has no ASCII spelling", () => {
    expect(personNameCount("\u{20bb7}")).toBe(0);
    expect(personNameCount("Straße")).toBe(5);
    expect(personNameCount("Ørsted")).toBe(5);
    expect(personNameCount("Газпром")).toBe(0);
  });

  it("keeps an apostrophe, where the businesses count turns it into a space", () => {
    expect(personNameCount("o'brien")).toBe(7);
    expect(stemCount("o'brien")).toBe(7);
    expect(personNameCount("o’brien")).toBe(6);
    expect(stemCount("o’brien")).toBe(7);
  });

  it("does not trim where the service does not: a no-break space is a space, a byte order mark is not", () => {
    expect(personNameCount("ab cd")).toBe(5);
    expect(personNameCount("\u0085ab\u0085")).toBe(2);
    expect(personNameCount("﻿ab")).toBe(2);
  });

  it("cuts the name at 255 characters", () => {
    expect(personNameCount("a".repeat(300))).toBe(255);
  });
});
