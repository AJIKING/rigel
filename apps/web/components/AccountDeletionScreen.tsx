import { LegalDoc, type LegalSection } from "./LegalDoc";

// アカウント削除の案内ページ（Google Play の「アカウント削除リクエスト用リンク」要件）。
// アプリを削除済みの利用者でもウェブから退会できること・削除される範囲・
// 有料プラン契約中の扱い（先に解約が必要）を明記する。描画は LegalDoc（/terms /privacy と共通）。

const INTRO =
  "麻雀牌譜サービス「RAISHA」のアカウントと関連データは、以下の手順でいつでも削除できます。" +
  "アプリをアンインストール済みの場合でも、ウェブサイトから同じアカウントでサインインして削除できます。";

const SECTIONS: LegalSection[] = [
  {
    no: "1.",
    title: "削除の手順",
    items: [
      "アプリから: 設定タブ → アカウント → 「アカウントを削除」をタップし、確認のうえもう一度タップします。",
      "ウェブから: https://raisha.jp/login からサインインし、設定（https://raisha.jp/settings）→ 「アカウントを削除」を選択します。",
      "上記の操作ができない場合は、info@plaria.co.jp までご連絡ください（登録に使用した Google / Apple アカウントの確認をお願いする場合があります）。",
    ],
  },
  {
    no: "2.",
    title: "削除されるデータ",
    items: [
      "アカウント情報（識別子・表示名・公開ID・メールアドレス）",
      "作成した牌譜（半荘・局）・何切る問題・回答・お気に入り・特訓の記録",
      "解析のために送信・保存された撮影画像",
      "Apple アカウントでログインしていた場合は、Sign in with Apple の連携（トークン）も失効させます。",
      "削除されたデータの復元はできません。",
    ],
  },
  {
    no: "3.",
    title: "有料プラン契約中の場合",
    items: [
      "有料プラン（Next / Pro）契約中は、誤操作防止のため先にプランの解約が必要です。",
      "アプリ内購入（App Store / Google Play）の場合: 各ストアのサブスクリプション設定から解約したうえで、アカウントを削除してください。アカウントを削除してもストアのサブスクリプションは自動では停止しません。",
      "ウェブ決済（クレジットカード）の場合: 設定画面の「プランを管理」から解約できます。",
    ],
  },
  {
    no: "4.",
    title: "お問い合わせ",
    paras: ["アカウント削除に関するお問い合わせは info@plaria.co.jp までご連絡ください。"],
  },
];

export function AccountDeletionScreen() {
  return (
    <LegalDoc
      title="アカウントの削除"
      en="Account Deletion"
      intro={INTRO}
      sections={SECTIONS}
      enacted="2026年8月5日 制定"
      related={{ href: "/privacy", label: "プライバシーポリシー" }}
    />
  );
}
