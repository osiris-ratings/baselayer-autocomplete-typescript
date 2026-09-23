import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Testing Library unmounts after each test only when `afterEach` is a global,
// and this config leaves vitest's globals off, so it is registered here.
afterEach(() => {
  cleanup();
});
