"use client";

import { toAbsoluteSeat, type CameraSeat, type Kifu, type Seat, type Tile } from "@rigel/schema";
import { sortHandTiles, type TsumoWinDisplay } from "@rigel/ui";
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
  drop,
  dropDelayed,
  flyIn,
}: {
  code?: Tile | null;
  kind?: "river" | "meld";
  lay?: boolean;
  tsumogiri?: boolean;
  back?: boolean;
  /** 強調表示（鳴き判断の対象牌など）。 */
  highlight?: boolean;
  /** 打牌の drop-in 演出（いま河に置かれた1枚）。 */
  drop?: boolean;
  /** drop をツモ演出の後に遅らせる（ツモ→打牌の順に見せる）。 */
  dropDelayed?: boolean;
  /** ツモ牌のフライイン演出（中央方向から手牌へ入った1枚）。 */
  flyIn?: boolean;
}) {
  const cls = [
    s.tile,
    kind === "river" ? s.riverT : "",
    kind === "meld" ? s.meldT : "",
    lay ? s.lay : "",
    tsumogiri ? s.tsumogiri : "",
    back ? s.back : "",
    highlight ? s.target : "",
    drop ? s.drop : "",
    drop && dropDelayed ? s.dropDelay : "",
    flyIn ? s.flyIn : "",
  ]
    .filter(Boolean)
    .join(" ");
  // data-tile はレイアウト検証（Playwright）用の安定セレクタ。CSS Module クラスは
  // ハッシュ化されるため、牌の矩形を測るためのフックとして付ける。
  // data-drop / data-draw も同様に、演出対象の検証用フック。
  const dataDrop = drop ? "" : undefined;
  const dataDraw = flyIn ? "" : undefined;
  if (back)
    return (
      <span className={cls} data-tile={kind ?? "hand"} data-drop={dataDrop} data-draw={dataDraw} />
    );
  return (
    <span className={cls} data-tile={kind ?? "hand"} data-drop={dataDrop} data-draw={dataDraw}>
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
  points = null,
  animateDiscard = null,
  animateDraw = null,
  tsumoWin = null,
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
  /** 再生中の点棒。指定時はネームプレートに表示する。 */
  points?: Record<Seat, number> | null;
  /** drop-in 演出を付ける河の1枚（いま置かれた打牌）。1手進めたときだけ渡す。 */
  animateDiscard?: { seat: Seat; index: number } | null;
  /** フライイン演出を付ける手牌の1枚（理牌後の位置）。ツモ→打牌の順に見せるため
   *  指定時は同席の drop を遅延させる。 */
  animateDraw?: { seat: Seat; index: number } | null;
  /** ツモ和了牌（最終局面で手牌の横に離して置く）。導出は @rigel/ui の tsumoWinDisplay。 */
  tsumoWin?: TsumoWinDisplay | null;
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
          const sorted = sortHandTiles(board.hand);
          // ツモ和了牌は手牌本体から離して置く（スナップショット手牌なら該当1枚を抜く）。
          const tsumoHere = tsumoWin?.seat === seat ? tsumoWin : null;
          const handShown =
            tsumoHere && tsumoHere.handIndex !== null
              ? sorted.filter((_, i) => i !== tsumoHere.handIndex)
              : sorted;
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
                        drop={animateDiscard?.seat === seat && animateDiscard.index === ri * 6 + ci}
                        dropDelayed={animateDraw?.seat === seat}
                      />
                    ))}
                  </div>
                ))}
              </div>
              <div className={s.nameplate}>
                <span className={s.wd}>{wind}</span>
                <span className={s.nm}>{name}</span>
                {points && <span className={s.pts}>{points[seat].toLocaleString()}点</span>}
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
                  : handShown.map((h, hi) => (
                      <ViewTile
                        key={hi}
                        code={h.tile}
                        flyIn={animateDraw?.seat === seat && animateDraw.index === hi}
                      />
                    ))}
                {tsumoHere && (
                  <span className={s.tsumoWin} data-tsumo="">
                    <ViewTile code={back ? undefined : tsumoHere.tile} back={back} />
                  </span>
                )}
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
