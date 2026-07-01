"use client";

import { toAbsoluteSeat, type CameraSeat, type Kifu, type Seat, type Tile } from "@rigel/schema";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { getPublicGameDetail, type PublicGameDetail } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { SEAT_ORDER, chunk, roundName, windOf } from "../../lib/board";
import { useBoardScale } from "../../lib/use-board-scale";
import { fmtDate } from "../../lib/format";
import { useFavorites } from "../../lib/use-favorites";
import { BrandMark } from "../BrandMark";
import { OssTileFace } from "../OssTileFace";
import s from "./kifu-view.module.css";

const SLOTS: { cam: CameraSeat; cls: string }[] = [
  { cam: "bottom", cls: s.seatB },
  { cam: "right", cls: s.seatR },
  { cam: "top", cls: s.seatT },
  { cam: "left", cls: s.seatL },
];

/** 1牌（OSS 画像 / 裏向き）。 */
function ViewTile({
  code,
  kind,
  lay,
  tsumogiri,
  back,
}: {
  code?: Tile | null;
  kind?: "river" | "meld";
  lay?: boolean;
  tsumogiri?: boolean;
  back?: boolean;
}) {
  const cls = [
    s.tile,
    kind === "river" ? s.riverT : "",
    kind === "meld" ? s.meldT : "",
    lay ? s.lay : "",
    tsumogiri ? s.tsumogiri : "",
    back ? s.back : "",
  ]
    .filter(Boolean)
    .join(" ");
  if (back) return <span className={cls} />;
  return (
    <span className={cls}>
      <OssTileFace code={code ?? null} />
    </span>
  );
}

/** 局情報のドラ/裏ドラ1行（牌があれば小牌グリフ、無ければ —）。 */
function DoraRow({ label, code }: { label: string; code: Tile | null }) {
  return (
    <div className={s.irow}>
      <span>{label}</span>
      <b>
        {code ? (
          <span className={s.metaTile}>
            <OssTileFace code={code} />
          </span>
        ) : (
          "—"
        )}
      </b>
    </div>
  );
}

export function KifuViewer({ gameId }: { gameId: string }) {
  const { user } = useAuth();
  const [detail, setDetail] = useState<PublicGameDetail | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "notfound">("loading");
  const { favs, toggle: toggleFav } = useFavorites();

  const [gi, setGi] = useState(0);
  const [reveal, setReveal] = useState(-1); // -1 = 全表示
  const [hideOpp, setHideOpp] = useState(false);
  const [sideOpen, setSideOpen] = useState(true);
  const [fs, setFs] = useState(false);
  const [roundMenu, setRoundMenu] = useState(false);
  const [shareLabel, setShareLabel] = useState("共有");

  useEffect(() => {
    getPublicGameDetail(gameId)
      .then((d) => {
        setDetail(d);
        setState(d ? "ok" : "notfound");
      })
      .catch(() => setState("notfound"));
  }, [gameId]);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFs(false);
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, []);

  const log = detail?.logs[gi];
  const kifu: Kifu | undefined = log?.kifu;
  const bottomSeat: Seat = kifu?.cameraBottomSeat ?? "east";
  const dealer: Seat = kifu?.meta.dealer ?? bottomSeat;

  // 打牌の擬似ターン順（東→南→西→北を河の枚数ぶん回す）。
  const { order, dstops, maxLen } = useMemo(() => {
    if (!kifu) return { order: [] as Seat[], dstops: [] as number[], maxLen: 0 };
    const windSeq = Array.from(
      { length: 4 },
      (_, i) => SEAT_ORDER[(SEAT_ORDER.indexOf(dealer) + i) % 4],
    );
    const m = Math.max(0, ...SEAT_ORDER.map((p) => kifu.seats[p].river.length));
    const ord: Seat[] = [];
    for (let t = 0; t < m; t++)
      for (const p of windSeq) if (t < kifu.seats[p].river.length) ord.push(p);
    const ds = ord.map((p, i) => (p === dealer ? i + 1 : -1)).filter((x) => x >= 0);
    return { order: ord, dstops: ds, maxLen: m };
  }, [kifu, dealer]);

  const shown = reveal < 0 || reveal > order.length ? order.length : reveal;
  const revealed = useMemo(() => {
    const c: Record<Seat, number> = { east: 0, south: 0, west: 0, north: 0 };
    for (let i = 0; i < shown; i++) c[order[i]!]++;
    return c;
  }, [order, shown]);

  // board fit
  const mainRef = useRef<HTMLDivElement>(null);
  const scale = useBoardScale(mainRef, fs ? 32 : 48, [sideOpen]);

  function switchLog(i: number) {
    setGi(i);
    setReveal(-1);
    setRoundMenu(false);
  }

  if (state === "loading") return <Shell>{<p className={s.notice}>読み込み中…</p>}</Shell>;
  if (state === "notfound" || !detail || !log || !kifu)
    return (
      <Shell>
        <p className={s.notice}>
          この牌譜は見つからないか、非公開です。<Link href="/kifu">牌譜一覧へ</Link>
        </p>
      </Shell>
    );

  const round = roundName(gi);
  const authorName = detail.owner.handle ?? detail.owner.id.slice(0, 6);
  const curJunme = revealed[dealer];
  const resultLabel =
    kifu.result === "ron"
      ? "ロン"
      : kifu.result === "tsumo"
        ? "ツモ"
        : kifu.result === "draw"
          ? "流局"
          : "—";
  // 和了（ロン/ツモ）のときだけ裏ドラを出す（リーチ和了で意味を持つため）。
  const isWin = kifu.result === "ron" || kifu.result === "tsumo";

  function onShare() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    navigator.clipboard?.writeText(url).catch(() => {});
    setShareLabel("コピーしました");
    setTimeout(() => setShareLabel("共有"), 1500);
  }

  return (
    <div className={`${s.app} themeBoard`}>
      {!fs && (
        <div className={s.bar}>
          <Link href="/kifu" className={s.brand}>
            <BrandMark starClassName={s.star} wordmarkClassName={s.wm} />
          </Link>
          <div className={s.crumb}>
            <Link href="/kifu">公開牌譜</Link>
            <span>›</span>
            <span>牌譜を見る</span>
          </div>
        </div>
      )}

      {!fs && (
        <div className={s.khead}>
          <div className={s.khMain}>
            <h1 className={s.ktitle}>
              {detail.game.title || "（無題の半荘）"}
              <span className={`${s.badge} ${s.pub}`}>公開</span>
            </h1>
            <div className={s.kmeta}>
              <Link href={`/u/${detail.owner.handle ?? detail.owner.id}`}>@{authorName}</Link>
              <span className={s.sep}>·</span>
              {fmtDate(detail.game.createdAt)}
              <span className={s.sep}>·</span>
              半荘 {detail.logs.length}局
            </div>
          </div>
          <div className={s.khAct}>
            {user?.id === detail.owner.id && (
              <Link className={s.iconbtn} href={`/kifu/${detail.game.id}`}>
                <svg viewBox="0 0 24 24">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
                </svg>
                編集
              </Link>
            )}
            <button
              className={s.iconbtn}
              aria-pressed={sideOpen}
              onClick={() => setSideOpen((v) => !v)}
            >
              <svg viewBox="0 0 24 24">
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <path d="M15 4v16" />
              </svg>
              情報
            </button>
            <button
              className={`${s.iconbtn} ${s.fav} ${favs.has(gameId) ? s.on : ""}`}
              aria-pressed={favs.has(gameId)}
              aria-label="お気に入り"
              onClick={() => toggleFav(gameId)}
            >
              <svg viewBox="0 0 24 24">
                <path d="M12 2.6l2.85 6.02 6.6.62-4.97 4.4 1.46 6.46L12 17.7 6.06 20.7l1.46-6.46-4.97-4.4 6.6-.62z" />
              </svg>
              お気に入り
            </button>
            <button className={s.iconbtn} onClick={onShare}>
              <svg viewBox="0 0 24 24">
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
              </svg>
              {shareLabel}
            </button>
          </div>
        </div>
      )}

      <div className={`${s.wrap} ${!sideOpen || fs ? s.noSide : ""}`}>
        <div className={s.main} ref={mainRef}>
          <div className={s.boardcol}>
            <div className={s.stage} style={{ height: 768 * scale }}>
              <div className={s.table} style={{ transform: `scale(${scale})` }}>
                <div className={s.center}>
                  <div className={s.rd}>
                    {round} <span className={s.hb}>0本場</span>
                  </div>
                </div>
                {SLOTS.map(({ cam, cls }) => {
                  const seat = toAbsoluteSeat(cam, bottomSeat);
                  const board = kifu.seats[seat];
                  const wind = windOf(seat, dealer);
                  const back = hideOpp && seat !== bottomSeat;
                  const riverShown = board.river.slice(0, revealed[seat]);
                  const name =
                    seat === bottomSeat
                      ? detail.owner.displayName || detail.owner.handle || `${wind}家`
                      : `${wind}家`;
                  return (
                    <div key={cam} className={`${s.seat} ${cls}`}>
                      <div className={s.river}>
                        {chunk(riverShown, 6).map((row, ri) => (
                          <div key={ri} className={s.rrow}>
                            {row.map((d, ci) => (
                              <ViewTile
                                key={ci}
                                code={d.tile}
                                kind="river"
                                lay={d.riichi}
                                tsumogiri={d.tsumogiri}
                              />
                            ))}
                          </div>
                        ))}
                      </div>
                      <div className={s.nameplate}>
                        <span className={s.wd}>{wind}</span>
                        <span className={s.nm}>{name}</span>
                      </div>
                      <div className={s.hand}>
                        {back
                          ? board.hand.map((_, hi) => <ViewTile key={hi} back />)
                          : board.hand.map((h, hi) => <ViewTile key={hi} code={h.tile} />)}
                        {board.melds.length > 0 && (
                          <div className={s.melds}>
                            {board.melds.map((md, mi) => (
                              <div key={mi} className={s.meld}>
                                {md.tiles.map((t, ti) => (
                                  <ViewTile key={ti} code={t.tile} kind="meld" lay={ti === 0} />
                                ))}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className={s.controlbar}>
              <div className={s.cgrp}>
                <button
                  className={s.cbtn}
                  disabled={gi === 0}
                  aria-label="前の局"
                  onClick={() => switchLog(gi - 1)}
                >
                  <svg viewBox="0 0 24 24">
                    <rect x="5" y="5" width="2.4" height="14" rx="1" />
                    <path d="M20 5l-10 7 10 7z" />
                  </svg>
                </button>
                <select
                  className={`${s.clabel} ${s.csel}`}
                  aria-label="局を選択"
                  value={gi}
                  onChange={(e) => switchLog(Number(e.target.value))}
                >
                  {detail.logs.map((l, i) => (
                    <option key={l.id} value={i}>
                      {roundName(i)}
                    </option>
                  ))}
                </select>
                <button
                  className={s.cbtn}
                  disabled={gi >= detail.logs.length - 1}
                  aria-label="次の局"
                  onClick={() => switchLog(gi + 1)}
                >
                  <svg viewBox="0 0 24 24">
                    <rect x="16.6" y="5" width="2.4" height="14" rx="1" />
                    <path d="M4 5l10 7-10 7z" />
                  </svg>
                </button>
              </div>

              <div className={s.cgrp}>
                <button
                  className={s.cbtn}
                  disabled={shown <= 0}
                  aria-label="前の巡目"
                  onClick={() => {
                    const pv = [...dstops].reverse().find((x) => x < shown);
                    setReveal(pv ?? 0);
                  }}
                >
                  <svg viewBox="0 0 24 24">
                    <path d="M12 5l-8 7 8 7zM21 5l-8 7 8 7z" />
                  </svg>
                </button>
                <span className={s.clabel}>{curJunme}巡目</span>
                <button
                  className={s.cbtn}
                  disabled={!dstops.some((x) => x > shown)}
                  aria-label="次の巡目"
                  onClick={() => {
                    const nx = dstops.find((x) => x > shown);
                    setReveal(nx ?? order.length);
                  }}
                >
                  <svg viewBox="0 0 24 24">
                    <path d="M12 5l8 7-8 7zM3 5l8 7-8 7z" />
                  </svg>
                </button>
              </div>

              <div className={s.cgrp}>
                <button
                  className={`${s.cbtn} ${s.step}`}
                  disabled={shown <= 0}
                  aria-label="1手戻る"
                  onClick={() => setReveal(Math.max(0, shown - 1))}
                >
                  <svg viewBox="0 0 24 24">
                    <path d="M16 5l-9 7 9 7z" />
                  </svg>
                </button>
                <button
                  className={`${s.cbtn} ${s.step}`}
                  disabled={shown >= order.length}
                  aria-label="1手進む"
                  onClick={() => setReveal(Math.min(order.length, shown + 1))}
                >
                  <svg viewBox="0 0 24 24">
                    <path d="M8 5l9 7-9 7z" />
                  </svg>
                </button>
              </div>

              <div className={s.cgrp}>
                <button
                  className={`${s.ctog} ${!hideOpp ? s.on : ""}`}
                  aria-pressed={!hideOpp}
                  onClick={() => setHideOpp((v) => !v)}
                >
                  手牌表示
                </button>
              </div>

              <div className={s.cgrp}>
                <button
                  className={`${s.cbtn} ${s.step} ${s.fs}`}
                  aria-label={fs ? "全画面を終了" : "全画面"}
                  onClick={() => setFs((v) => !v)}
                >
                  <svg viewBox="0 0 24 24">
                    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        {sideOpen && !fs && (
          <aside className={s.side}>
            <div className={s.ssec}>
              <div className={s.snav}>
                <button
                  className={s.navg}
                  disabled={gi === 0}
                  aria-label="前の局"
                  onClick={() => switchLog(gi - 1)}
                >
                  ‹
                </button>
                <div className={s.roundwrap}>
                  <button className={s.rlabel} onClick={() => setRoundMenu((v) => !v)}>
                    {round}
                  </button>
                  {roundMenu && (
                    <div className={s.rmenu}>
                      {detail.logs.map((l, i) => (
                        <button
                          key={l.id}
                          className={`${s.ritem} ${i === gi ? s.on : ""}`}
                          onClick={() => switchLog(i)}
                        >
                          {roundName(i)} <small>第{l.seq}局</small>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  className={s.navg}
                  disabled={gi >= detail.logs.length - 1}
                  aria-label="次の局"
                  onClick={() => switchLog(gi + 1)}
                >
                  ›
                </button>
              </div>
            </div>

            <div className={s.ssec}>
              <h4>局情報</h4>
              <div className={s.irow}>
                <span>親</span>
                <b>{windOf(dealer, dealer)}家</b>
              </div>
              <div className={s.irow}>
                <span>最終巡目</span>
                <b>{maxLen}巡</b>
              </div>
              <div className={s.irow}>
                <span>本場</span>
                <b>{kifu.meta.honba}本場</b>
              </div>
              <div className={s.irow}>
                <span>供託</span>
                <b>{kifu.meta.kyotaku}本</b>
              </div>
              <DoraRow label="ドラ" code={kifu.meta.dora} />
              <div className={s.irow}>
                <span>結果</span>
                <b>{resultLabel}</b>
              </div>
              {isWin && <DoraRow label="裏ドラ" code={kifu.meta.uraDora} />}
              <p className={s.muted}>点数は記録しません。</p>
            </div>

            <div className={s.ssec}>
              <h4>各家</h4>
              {SEAT_ORDER.map((seat) => (
                <div key={seat} className={s.arow}>
                  <span className={s.an}>{windOf(seat, dealer)}家</span>
                  <span className={s.ar}>
                    {kifu.seats[seat].hand.length}枚 / 河{kifu.seats[seat].river.length}
                  </span>
                </div>
              ))}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className={`${s.app} themeBoard`}>{children}</div>;
}
