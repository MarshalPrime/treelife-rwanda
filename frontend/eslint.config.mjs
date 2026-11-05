import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  ...nextCoreWebVitals,
  {
    rules: {
      // Existing data loaders intentionally set pending state when their inputs change.
      "react-hooks/set-state-in-effect": "off",
      // Request IDs are initialized once and only read from submit handlers.
      "react-hooks/refs": "off",
    },
  },
  globalIgnores([".next/**", "node_modules/**", "coverage/**", "next-env.d.ts"]),
]);
