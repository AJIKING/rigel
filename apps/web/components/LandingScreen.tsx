import Link from "next/link";
import { BrandMark } from "./BrandMark";
import s from "./landing.module.css";

/** トップ（ランディング）— docs/rigel-lp4.html の再現。
 *  「写真 → AI再現 → 盤面」の一筋を一目で伝える静的ページ。 */
export function LandingScreen() {
  return (
    <div className={`${s.shell} themeApp`}>
      <nav className={s.nav}>
        <Link className={s.brand} href="/">
          <BrandMark starClassName={s.star} wordmarkClassName={s.wm} />
        </Link>
        <div className={s.spacer} />
        <Link className={s.navLogin} href="/login">
          ログイン
        </Link>
      </nav>

      <main className={s.main}>
        <div>
          <h1 className={`${s.h1} ${s.enter} ${s.d1}`}>
            牌譜を<span className={s.em}>AI</span>で再現
          </h1>
          <p className={`${s.lead} ${s.enter} ${s.d2}`}>いつでもふりかえる</p>
          <div className={`${s.cta} ${s.enter} ${s.d3}`}>
            <Link className={s.gbtn} href="/login">
              <svg className={s.g} viewBox="0 0 48 48" aria-hidden="true">
                <path
                  fill="#EA4335"
                  d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                />
                <path
                  fill="#4285F4"
                  d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                />
                <path
                  fill="#FBBC05"
                  d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                />
                <path
                  fill="#34A853"
                  d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                />
              </svg>
              Google ではじめる
            </Link>
            <Link className={s.ghost} href="/explore">
              公開牌譜を見る
            </Link>
          </div>
        </div>

        <div className={`${s.scene} ${s.enter} ${s.mk}`}>
          <div className={s.diptych} aria-hidden="true">
            <div className={s.photo}>
              <span className={s.pl}>
                <svg viewBox="0 0 24 24">
                  <path d="M3 8a2 2 0 0 1 2-2h2l1.5-2h7L19 6h0a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  <circle cx="12" cy="13" r="3.2" />
                </svg>
                写真
              </span>
              <div className={s.blobs}>
                <i
                  style={{
                    top: 16,
                    left: "50%",
                    transform: "translateX(-50%)",
                    width: 48,
                    height: 11,
                  }}
                />
                <i
                  style={{
                    bottom: 16,
                    left: "50%",
                    transform: "translateX(-50%)",
                    width: 48,
                    height: 11,
                  }}
                />
                <i
                  style={{
                    left: 14,
                    top: "50%",
                    transform: "translateY(-50%)",
                    width: 11,
                    height: 44,
                  }}
                />
                <i
                  style={{
                    right: 14,
                    top: "50%",
                    transform: "translateY(-50%)",
                    width: 11,
                    height: 44,
                  }}
                />
                <i
                  style={{
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%,-50%)",
                    width: 13,
                    height: 17,
                  }}
                />
              </div>
            </div>

            <div className={s.flow}>
              <span className={s.ai}>AI再現</span>
              <svg className={s.arr} viewBox="0 0 34 12">
                <path d="M1 6h30M26 2l5 4-5 4" />
              </svg>
            </div>

            <div className={s.board}>
              <div className={s.scanline} />
              <div className={`${s.row} ${s.h} ${s.top}`}>
                {Array.from({ length: 8 }).map((_, i) => (
                  <span key={i} className={s.t} />
                ))}
              </div>
              <div className={`${s.row} ${s.h} ${s.bottom}`}>
                {Array.from({ length: 8 }).map((_, i) => (
                  <span key={i} className={s.t} />
                ))}
              </div>
              <div className={`${s.row} ${s.v} ${s.left}`}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <span key={i} className={s.t} />
                ))}
              </div>
              <div className={`${s.row} ${s.v} ${s.right}`}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <span key={i} className={s.t} />
                ))}
              </div>
              <div className={s.riv}>
                <span className={`${s.t} ${s.man}`}>
                  <b>三</b>
                </span>
                <span className={`${s.t} ${s.red}`}>
                  <b>中</b>
                </span>
                <span className={`${s.t} ${s.sou}`}>
                  <b>發</b>
                </span>
                <span className={`${s.t} ${s.man}`}>
                  <b>七</b>
                </span>
                <span className={`${s.t} ${s.man}`}>
                  <b>二</b>
                </span>
              </div>
              <div className={s.fc}>
                <span className={s.rd}>東一局</span>
                <span className={s.dt}>
                  <b>東</b>
                </span>
              </div>
            </div>
          </div>
          <p className={s.cap}>1枚の写真から、盤面をそのまま再現。</p>
        </div>
      </main>
    </div>
  );
}
