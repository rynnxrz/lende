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
  ]),
]);

export default eslintConfig;
