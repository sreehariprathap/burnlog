import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  // Extend Next.js defaults
  ...compat.extends("next/core-web-vitals", "next/typescript"),

  // Disable unused-vars checks
  {
    rules: {
      // disable core rule
      "no-unused-vars": "off",
      // disable TS-specific rule
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
];

export default eslintConfig;
