import Link from "next/link";
import s from "../../../components/view/kifu-view.module.css";

// notFound() の表示。白画面を避けるためダークな盤面シェルで案内する。
export default function PublicGameNotFound() {
  return (
    <div className={`${s.app} themeBoard`}>
      <p className={s.notice}>
        この牌譜は見つからないか、非公開です。<Link href="/kifu">牌譜一覧へ</Link>
      </p>
    </div>
  );
}
