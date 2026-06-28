// 画像アセットの静的 import 用（Metro はアセットを number(asset id) として解決する）。
declare module "*.png" {
  const value: number;
  export default value;
}
