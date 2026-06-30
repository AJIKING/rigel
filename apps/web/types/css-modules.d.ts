// CSS Modules の型宣言。
// next-env.d.ts は .gitignore のため CI のクリーンチェックアウトには存在せず、
// それ由来の `*.module.css` 宣言が無いと `tsc --noEmit` が TS2307 で落ちる。
// ここで明示的に宣言してローカル/CI どちらでも解決できるようにする。
declare module "*.module.css" {
  const classes: { readonly [key: string]: string };
  export default classes;
}
