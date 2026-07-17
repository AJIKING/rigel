"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import s from "./terms.module.css";

// 法的文書（利用規約 / プライバシーポリシー）の共通レイアウト。
// 見出し・前書き・目次（アンカー）・セクション・制定メタ・関連文書ナビを一手に描画する。
// 本文中の URL は自動でリンク化する（外部送信の開示など）。

/** 各セクション。lead=前書き / items=列挙 / paras=段落。 */
export interface LegalSection {
  /** 表示番号（例: "第1条" / "1."）。 */
  no: string;
  title: string;
  lead?: string;
  paras?: string[];
  items?: string[];
}

/** テキスト中の URL をリンク化して描画する（別タブで開く）。 */
function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s（）]+)/g);
  return (
    <>
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer" className={s.a}>
            {part}
          </a>
        ) : (
          part
        ),
      )}
    </>
  );
}

export function LegalDoc({
  title,
  en,
  intro,
  sections,
  enacted,
  related,
}: {
  title: string;
  /** 英語サブタイトル（例 "Privacy Policy"）。 */
  en: string;
  intro: string;
  sections: LegalSection[];
  /** 制定・改定のメタ行（例 "2026年5月6日 制定"）。 */
  enacted: string;
  /** 関連文書への導線（利用規約 ⇄ プライバシーポリシー）。 */
  related?: { href: string; label: string };
}) {
  const router = useRouter();

  function onBack() {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/");
  }

  return (
    <div className={`${s.shell} themeApp`}>
      <header className={s.bar}>
        <button type="button" className={s.back} onClick={onBack} aria-label="戻る">
          ‹
        </button>
        <span className={s.barTitle}>{title}</span>
      </header>

      <main className={s.doc}>
        <div className={s.titles}>
          <h1 className={s.h1}>{title}</h1>
          <span className={s.en}>{en}</span>
        </div>
        <p className={s.intro}>{intro}</p>

        {/* 目次（長文をスクロールせずに目的の項へ飛べる）。 */}
        <nav className={s.toc} aria-label="目次">
          {sections.map((sec, i) => (
            <a key={sec.no} className={s.tocLink} href={`#sec-${i + 1}`}>
              {sec.no} {sec.title}
            </a>
          ))}
        </nav>

        {sections.map((sec, i) => (
          <section key={sec.no} id={`sec-${i + 1}`} className={s.art}>
            <h2 className={s.artHead}>
              <span className={s.artNo}>{sec.no}</span>
              {sec.title}
            </h2>
            {sec.lead && (
              <p className={s.para}>
                <Linkified text={sec.lead} />
              </p>
            )}
            {sec.paras?.map((p, k) => (
              <p key={k} className={s.para}>
                <Linkified text={p} />
              </p>
            ))}
            {sec.items && (
              <ol className={s.list}>
                {sec.items.map((it, k) => (
                  <li key={k}>
                    <Linkified text={it} />
                  </li>
                ))}
              </ol>
            )}
          </section>
        ))}

        {related && (
          <p className={s.related}>
            あわせて読む: <Link href={related.href}>{related.label}</Link>
          </p>
        )}

        <div className={s.meta}>
          <p>{enacted}</p>
          <p>株式会社PLARIA</p>
          <p className={s.copy}>© 2026 RIGEL</p>
        </div>
      </main>
    </div>
  );
}
