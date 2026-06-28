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
      "**/next-env.d.ts",
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
  {
    // CommonJS の設定ファイル（babel/metro 等）は require を許可する
    files: ["**/*.cjs", "**/babel.config.js", "**/metro.config.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
);
