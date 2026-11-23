import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  CLIENT_HEADER,
  CLIENT_PRODUCT,
  SDK_VERSION,
  runtimeToken,
  userAgent,
} from "../../src/version";

const { version } = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
) as { version: string };

describe("the SDK's version", () => {
  it("is package.json's, so a release cannot ship another one", () => {
    // The release script bumps package.json and nothing else; a version
    // written down a second time would be the old one in the new release.
    expect(SDK_VERSION).toBe(version);
  });

  it("is a version, not a placeholder", () => {
    expect(SDK_VERSION).toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
  });

  it("names the SDK as the product token the services read", () => {
    expect(CLIENT_PRODUCT).toBe(`baselayer-autocomplete-typescript/${version}`);
    expect(CLIENT_HEADER).toBe("X-Baselayer-Client");
  });
});

describe("runtimeToken", () => {
  it("is what the runtime calls itself, where it says", () => {
    expect(runtimeToken({ navigator: { userAgent: "Node.js/22" } })).toBe(
      "Node.js/22",
    );
    expect(runtimeToken({ navigator: { userAgent: "Deno/2.1.4" } })).toBe(
      "Deno/2.1.4",
    );
    expect(
      runtimeToken({ navigator: { userAgent: " Cloudflare-Workers " } }),
    ).toBe("Cloudflare-Workers");
  });

  it("falls back to the Node version on a Node that says nothing", () => {
    // Node 20 has no `navigator`.
    expect(runtimeToken({ process: { versions: { node: "20.18.1" } } })).toBe(
      "Node.js/20.18.1",
    );
    expect(
      runtimeToken({
        navigator: {},
        process: { versions: { node: "20.18.1" } },
      }),
    ).toBe("Node.js/20.18.1");
  });

  it("is nothing where the runtime says nothing", () => {
    expect(runtimeToken({})).toBeNull();
    expect(runtimeToken({ process: { versions: {} } })).toBeNull();
    expect(runtimeToken({ navigator: { userAgent: "" } })).toBeNull();
  });

  it("never lets a value into a header that `fetch` would refuse", () => {
    // A line break in a header value throws; a runtime's own words do not get
    // to make the mint throw.
    expect(
      runtimeToken({ navigator: { userAgent: "x\r\nX-Injected: 1" } }),
    ).toBeNull();
    expect(runtimeToken({ navigator: { userAgent: "é" } })).toBeNull();
    expect(
      runtimeToken({ navigator: { userAgent: "a".repeat(101) } }),
    ).toBeNull();
    expect(runtimeToken({ navigator: { userAgent: 22 } })).toBeNull();
    expect(
      runtimeToken({
        navigator: { userAgent: "x\r\ny" },
        process: { versions: { node: "22.1.0" } },
      }),
    ).toBe("Node.js/22.1.0");
  });

  it("reads this runtime when it is given nothing", () => {
    // Whatever runs the tests says what it is, and it is a legal header value.
    const token = runtimeToken();
    expect(token).not.toBeNull();
    expect(token).toMatch(/^[\x20-\x7e]+$/);
  });
});

describe("userAgent", () => {
  it("is the SDK's product token, then the runtime's", () => {
    expect(userAgent({ navigator: { userAgent: "Node.js/22" } })).toBe(
      `${CLIENT_PRODUCT} Node.js/22`,
    );
  });

  it("is the SDK's product token alone where the runtime says nothing", () => {
    expect(userAgent({})).toBe(CLIENT_PRODUCT);
  });

  it("starts with the product token on the runtime running the tests", () => {
    expect(userAgent().startsWith(`${CLIENT_PRODUCT}`)).toBe(true);
  });
});
