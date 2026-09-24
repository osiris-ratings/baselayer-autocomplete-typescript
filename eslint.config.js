import js from "@eslint/js";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "coverage", "node_modules", "site-dist"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: [
      "src/react/**/*.{ts,tsx}",
      "tests/react/**/*.{ts,tsx}",
      "site/**/*.{ts,tsx}",
    ],
    plugins: { "react-hooks": reactHooks, "jsx-a11y": jsxA11y },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,
    },
  },
  {
    files: ["src/core/**/*.ts", "src/index.ts", "src/server/**/*.ts"],
    rules: {
      // The core and the server helper must never reach for React or the DOM
      // tree; the React binding is the only place they belong.
      "no-restricted-imports": [
        "error",
        { patterns: ["react", "react-dom", "react/*", "downshift"] },
      ],
    },
  },
);
