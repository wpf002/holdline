// ESLint 10 is flat-config only, so this replaces .eslintrc
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/.next/**", "**/generated/**", "**/node_modules/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);
