// jsdom ships no types, and the published-build test uses the little of it
// below: a window of its own to run the built page in.
declare module "jsdom" {
  export class JSDOM {
    constructor(
      html?: string,
      options?: {
        runScripts?: "outside-only" | "dangerously";
        pretendToBeVisual?: boolean;
        url?: string;
      },
    );
    readonly window: Window &
      typeof globalThis & { eval(code: string): unknown };
  }
}
