import { describe, expect, it } from "vitest";

import { testKey } from "../../site/demo/connect";

// What Apply says when the API refuses the key's mint.

function refusing(status: number, code: number) {
  return async () =>
    new Response(JSON.stringify({ code, message: "No.", metadata: null }), {
      status,
      headers: { "content-type": "application/json" },
    });
}

describe("testKey", () => {
  it("says a deployment that refuses a sandbox key's mint does not serve sandbox sessions yet", async () => {
    // Only a deployment from before sandbox support answers 483; a newer one
    // mints the session, so the message must hold either way.
    const result = await testKey("https://api.test", "key", refusing(422, 483));

    expect(result).toEqual({
      ok: false,
      message: "This deployment does not serve sandbox sessions yet.",
    });
  });
});
