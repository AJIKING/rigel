// @ts-check
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/.next/**",
      "**/.expo/**",
      "**/.wrangler/**",
      "**/node_modules/**",
      "**/coverage/**",
    ],
  },
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
    },
    rules: {
      // `_` 始まりの引数・変数は未使用でも許可（ポート実装やフェイクで使う）
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
);
