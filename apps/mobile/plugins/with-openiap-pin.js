/* eslint-disable @typescript-eslint/no-require-imports */
// 生成される ios/Podfile で openiap Pod を固定する config plugin。
//
// なぜ要るか: expo-iap 2.9.4（Expo SDK 52 互換の最終系）の podspec は
// `openiap ~> 1.1.9` を指定しており、EAS の pod install が 1.1.10〜1.1.12 を
// 解決すると上流の破壊的変更（OpenIapError の定数 E_PURCHASE_ERROR 削除）で
// Swift コンパイルが失敗する。expo-iap 2.9.4 は openiap 1.1.9 と同日リリースの
// ペアなので 1.1.9 に固定する。expo-iap を上げるときはこの固定も見直すこと。
const { withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const OPENIAP_VERSION = "1.1.9";

/** Podfile のターゲット直下に openiap の固定行を差し込む（冪等）。 */
function pinOpeniap(src) {
  if (src.includes("pod 'openiap'")) return src;
  return src.replace(
    /target ['"][^'"]+['"] do/,
    (m) => `${m}\n  pod 'openiap', '${OPENIAP_VERSION}' # expo-iap 2.9.x 互換の固定`,
  );
}

function withOpeniapPin(config) {
  return withDangerousMod(config, [
    "ios",
    (c) => {
      const podfile = path.join(c.modRequest.platformProjectRoot, "Podfile");
      fs.writeFileSync(podfile, pinOpeniap(fs.readFileSync(podfile, "utf8")));
      return c;
    },
  ]);
}

module.exports = withOpeniapPin;
module.exports.pinOpeniap = pinOpeniap;
