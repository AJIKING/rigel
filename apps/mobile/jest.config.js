// Expo + React Native 用の jest 設定。RN コンポーネントを実際にレンダリングして検証する。
// pnpm は依存を node_modules/.pnpm/<pkg>@ver/ 以下に配置するため、標準の
// transformIgnorePatterns（node_modules 直下想定）では RN/Expo の Flow 構文が変換されない。
// .pnpm 配下で RN/Expo 系パッケージだけを babel 変換対象に含める。
// （@rigel/* はワークスペースの packages/ 実体＝node_modules 外なので常に変換される。）
module.exports = {
  preset: "jest-expo",
  setupFiles: ["./jest.setup.js"],
  transformIgnorePatterns: [
    "node_modules/.pnpm/(?!(react-native|@react-native|expo|@expo|@react-navigation))",
  ],
  // CI（遅いランナー）ではスイート先頭のテストが画面の初回レンダリング＋変換コストを
  // 背負い、既定の 5秒を超えることがある（ローカルは1秒未満）。実測の揺れに耐える値にする。
  testTimeout: 20000,
};
