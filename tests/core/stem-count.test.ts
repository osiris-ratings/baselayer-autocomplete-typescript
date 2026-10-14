import { describe, expect, it } from "vitest";

import {
  personNameCount,
  stemCount,
  stemText,
} from "@baselayer-sdk/autocomplete";

import vectors from "./fixtures/stem-vectors.json";

// The characters a query counts against the filters' stem, as the autocomplete
// service counts them: businesses and addresses read the text as `stem`, people
// read the name as `person_name`. The rows are shared with the service.

interface Row {
  q: string;
  stem?: string;
  stemLen?: number;
  person?: string;
  personLen?: number;
  utf16Len?: number;
}

const rows = vectors.rows as Row[];

describe("stemCount, the businesses and addresses count", () => {
  it.each(rows.filter(row => row.stemLen !== undefined))(
    "counts $q as $stemLen",
    row => {
      expect(stemCount(row.q)).toBe(row.stemLen);
    },
  );

  it.each(rows.filter(row => row.stem !== undefined))(
    "reads $q as $stem",
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
  it.each(rows.filter(row => row.personLen !== undefined))(
    "counts $q as $personLen",
    row => {
      expect(personNameCount(row.q)).toBe(row.personLen);
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
