import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // BRIEF-40: exclude non-built reference artifacts and tracker exports
    // from src lint — they are not bundled or shipped to prod.
    "tracker/**",
    "docs/**",
    "e2e/**",
    "scripts/**",
    "supabase/.temp/**",
    // Vendored/minified assets (e.g. pdf.worker.min.mjs) are not our code.
    "public/**",
  ]),
  {
    // The React-Compiler-era hooks rules flag long-standing working patterns
    // across the app; keep them visible as warnings, not build-blocking errors.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/immutability": "warn",
    },
  },
]);

export default eslintConfig;
