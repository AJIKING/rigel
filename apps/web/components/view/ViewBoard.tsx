"use client";

import { toAbsoluteSeat, type CameraSeat, type Kifu, type Seat, type Tile } from "@rigel/schema";
import { sortHandTiles } from "@rigel/ui";
import { chunk, windOf } from "../../lib/board";
import { OssTileFace } from "../OssTileFace";
import s from "./kifu-view.module.css";

const SLOTS: { cam: CameraSeat; cls: string }[] = [
  { cam: "bottom", cls: s.seatB },
  { cam: "right", cls: s.seatR },
  { cam: "top", cls: s.seatT },
  { cam: "left", cls: s.seatL },
];

/** 1牌（OSS 画像 / 裏向き）。 */
export function ViewTile({
  code,
  kind,
  lay,
  tsumogiri,
  back,
  highlight,
}: {
  code?: Tile | null;
  kind?: "river" | "meld";
  lay?: boolean;
  tsumogiri?: boolean;
  back?: boolean;
  /** 強調表示（鳴き判断の対象牌など）。 */
  highlight?: boolean;
}) {
  const cls = [
    s.tile,
    kind === "river" ? s.riverT : "",
    kind === "meld" ? s.meldT : "",
    lay ? s.lay : "",
    tsumogiri ? s.tsumogiri : "",
    back ? s.back : "",
    highlight ? s.target : "",
  ]
    .filter(Boolean)
    .join(" ");
  // data-tile はレイアウト検証（Playwright）用の安定セレクタ。CSS Module クラスは
  // ハッシュ化されるため、牌の矩形を測るためのフックとして付ける。
  if (back) return <span className={cls} data-tile={kind ?? "hand"} />;
  return (
    <span className={cls} data-tile={kind ?? "hand"}>
      <OssTileFace code={code ?? null} />
    </span>
  );
}

/**
 * 読み取り専用の卓（4席の河・ネームプレート・手牌・鳴き＋中央情報）。
 * 牌譜ビューア（KifuViewer）と何切る（回答・編集プレビュー）が同じ見た目を共有する。
 * 手牌は理牌して表示する。
 */
export function ViewBoard({
  kifu,
  bottomSeat,
  dealer,
  scale,
  revealed,
  hideOpp = false,
  bottomName = null,
  center,
  highlightRiver = null,
}: {
  kifu: Kifu;
  bottomSeat: Seat;
  dealer: Seat;
  scale: number;
  /** 席ごとの河の公開枚数（再生用）。省略時は全表示。 */
  revealed?: Record<Seat, number>;
  /** 手前以外の手牌を裏向きにする。 */
  hideOpp?: boolean;
  /** 手前席の表示名（無ければ「◯家」）。 */
  bottomName?: string | null;
  /** 卓中央の表示（局名・本場など。画面ごとに差し替える）。 */
  center: React.ReactNode;
  /** 強調する河の1枚（鳴き判断の対象牌）。 */
  highlightRiver?: { seat: Seat; index: number } | null;
}) {
  return (
    <div className={s.stage} style={{ height: 768 * scale }}>
      <div className={s.table} style={{ transform: `scale(${scale})` }}>
        <div className={s.center} data-center>
          {center}
        </div>
        {SLOTS.map(({ cam, cls }) => {
          const seat = toAbsoluteSeat(cam, bottomSeat);
          const board = kifu.seats[seat];
          const wind = windOf(seat, dealer);
          const back = hideOpp && seat !== bottomSeat;
          // 表示は理牌（保存順が乱れた既存データも萬→筒→索→字で見せる）。
          const handShown = sortHandTiles(board.hand);
          const riverShown = board.river.slice(0, revealed?.[seat] ?? board.river.length);
          const name = (seat === bottomSeat && bottomName) || `${wind}家`;
          return (
            <div key={cam} className={`${s.seat} ${cls}`} data-seat={cam}>
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
                        highlight={
                          highlightRiver?.seat === seat && highlightRiver.index === ri * 6 + ci
                        }
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
                {/* 手牌が無い席（何切るの他家）は透明スペーサで席の外形を牌譜と同じにする。
                    左右席の引き戻し（--seat-lr-pull）は手牌の張り出し前提のため、
                    無いと河が卓中央へ食い込む。 */}
                {handShown.length === 0 && board.melds.length === 0 && (
                  <span className={s.handGhost} />
                )}
                {back
                  ? handShown.map((_, hi) => <ViewTile key={hi} back />)
                  : handShown.map((h, hi) => <ViewTile key={hi} code={h.tile} />)}
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
  );
}
