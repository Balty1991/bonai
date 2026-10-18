import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "client/public/ocr/**",
      "dist/**",
      "android/**",
      "node_modules/**",
      "functions/lib/**",
      "client/dev/**",
      "coverage/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "off",
      "@typescript-eslint/no-unused-vars": ["error", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      }],
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "no-useless-assignment": "off",
    },
  },
  {
    // Hook-urile noastre țin logica de sync și persistență: acolo o dependență uitată
    // înseamnă date netrimise (D1, D9, D12 din auditul din 26.09).
    files: ["client/src/hooks/**/*.{ts,tsx}"],
    rules: { "react-hooks/exhaustive-deps": "warn" },
  },
  {
    files: ["client/public/sw.js"],
    languageOptions: { globals: { ...globals.serviceworker } },
  },
  {
    files: ["scripts/**/*.mjs", "e2e/**/*.mjs"],
    languageOptions: { globals: { ...globals.node } },
  },
);
