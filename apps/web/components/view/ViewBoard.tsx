"use client";

import { toAbsoluteSeat, type CameraSeat, type Kifu, type Seat, type Tile } from "@rigel/schema";
import { meldTileViews, seatLabel, signedPoints, splitDrawnTile, type DrawnTile } from "@rigel/ui";
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
  flyIn,
  called,
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
  /** フライイン演出（手牌右端のスロットへ入った1枚）。 */
  flyIn?: boolean;
  /** 鳴かれた捨て牌（他家の鳴きへ移った牌）。河で薄表示にする。 */
  called?: boolean;
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
    flyIn ? s.flyIn : "",
    called ? s.called : "",
  ]
    .filter(Boolean)
    .join(" ");
  // data-tile はレイアウト検証（Playwright）用の安定セレクタ。CSS Module クラスは
  // ハッシュ化されるため、牌の矩形を測るためのフックとして付ける。
  // data-drop / data-draw も同様に、演出対象の検証用フック。
  const dataDrop = drop ? "" : undefined;
  const dataDraw = flyIn ? "" : undefined;
  const dataCalled = called ? "" : undefined;
  if (back)
    return (
      <span className={cls} data-tile={kind ?? "hand"} data-drop={dataDrop} data-draw={dataDraw} />
    );
  return (
    <span
      className={cls}
      data-tile={kind ?? "hand"}
      data-drop={dataDrop}
      data-draw={dataDraw}
      data-called={dataCalled}
    >
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
  seatName = null,
  onSeatSelect,
  center,
  highlightRiver = null,
  points = null,
  showPlayerPoints = true,
  animateDiscard = null,
  drawnTile = null,
  absolutePlates = false,
}: {
  kifu: Kifu;
  bottomSeat: Seat;
  dealer: Seat;
  scale: number;
  /** 席ごとの河の公開枚数（再生用）。省略時は全表示。 */
  revealed?: Record<Seat, number>;
  /** 手前以外の手牌を裏向きにする。 */
  hideOpp?: boolean;
  /** 表示名を付ける席（撮影者など）。視点を回しても席に付いたまま動く。無ければ全席「◯家」。 */
  seatName?: { seat: Seat; name: string } | null;
  /** ネームプレート押下（視点切替）。指定時のみプレートがボタンになる。 */
  onSeatSelect?: (seat: Seat) => void;
  /** 卓中央の表示（局名・本場など。画面ごとに差し替える）。 */
  center: React.ReactNode;
  /** 強調する河の1枚（鳴き判断の対象牌）。 */
  highlightRiver?: { seat: Seat; index: number } | null;
  /** 再生中の点棒。指定時はネームプレートに表示する。 */
  points?: Record<Seat, number> | null;
  /** リーグ戦ポイント（players.points）をネームプレートに出すか。
   *  既定 true。全員 0.0 の半荘では呼び出し側が false にして隠す（トグルで戻せる）。 */
  showPlayerPoints?: boolean;
  /** drop-in 演出を付ける河の1枚（いま置かれた打牌）。演出の第2段でだけ渡す。 */
  animateDiscard?: { seat: Seat; index: number } | null;
  /** 手牌の右端に離して置く1枚（再生中の一時ツモ／末尾のツモ和了牌）。出現時に
   *  フライインする。出すタイミングは呼び出し側（演出フェーズ／frame.tsumoWin）が決める。 */
  drawnTile?: DrawnTile | null;
  /** ネームプレートを絶対席（東家…＋親マーク）で出す。編集プレビュー用:
   *  入力（自分の席・親）が絶対席なので、風表記（親基準）だとずれて見えるため。 */
  absolutePlates?: boolean;
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
          // 右端スロットの1枚は手牌本体から離して置く（分割は @rigel/ui。mobile と共通）。
          const { hand: handShown, drawnTile: slotTile } = splitDrawnTile(
            board.hand,
            drawnTile,
            seat,
          );
          const riverShown = board.river.slice(0, revealed?.[seat] ?? board.river.length);
          // 選手名（リーグ戦の記録）＞ 画面固有の表示名（撮影者名など）＞「◯家」。
          // absolutePlates は絶対席＋親マーク（編集プレビュー: 入力とずれない表記）。
          const player = kifu.players?.[seat];
          const fallbackName = absolutePlates
            ? `${seatLabel(seat)}家${seat === dealer ? "（親）" : ""}`
            : `${wind}家`;
          const name = player?.name || (seatName?.seat === seat && seatName.name) || fallbackName;
          const plate = (
            <>
              {/* 風の1文字は親基準の表記なので、絶対席モードでは出さない（混乱の元）。 */}
              {absolutePlates ? null : <span className={s.wd}>{wind}</span>}
              <span className={s.nm}>{name}</span>
              {points && <span className={s.pts}>{points[seat].toLocaleString()}点</span>}
              {/* リーグ戦等の積み上げポイント状況（players がある半荘のみ）。
                  全員 0.0 なら未記録とみなして隠す（呼び出し側のトグルで出せる）。 */}
              {showPlayerPoints && player && (
                <span className={s.lpts}>{signedPoints(player.points)}</span>
              )}
            </>
          );
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
                        called={!!d.calledBy}
                        highlight={
                          highlightRiver?.seat === seat && highlightRiver.index === ri * 6 + ci
                        }
                        drop={animateDiscard?.seat === seat && animateDiscard.index === ri * 6 + ci}
                      />
                    ))}
                  </div>
                ))}
              </div>
              {onSeatSelect ? (
                <button
                  type="button"
                  className={`${s.nameplate} ${s.plateBtn}`}
                  aria-label={`${wind}家の視点にする`}
                  onClick={() => onSeatSelect(seat)}
                >
                  {plate}
                </button>
              ) : (
                <div className={s.nameplate}>{plate}</div>
              )}
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
                {slotTile !== null ? (
                  <span className={s.tsumoWin} data-tsumo="">
                    {/* key=牌: 連続ステップで牌が変わったら差し替えてフライインを掛け直す。 */}
                    <ViewTile key={slotTile} code={back ? undefined : slotTile} back={back} flyIn />
                  </span>
                ) : (
                  // スロット分の空間は常に確保（出現時に手牌が動かないように）。
                  <span className={s.tsumoWinGhost} />
                )}
                {board.melds.length > 0 && (
                  <div className={s.melds}>
                    {/* 鳴きの向き・暗槓の背面は共有ルール（meldTileViews）。
                        横向きの位置が鳴き元を示す（上家=左端・対面=左から2枚目・下家=右端）。 */}
                    {board.melds.map((md, mi) => (
                      // data-meld はレイアウト検証（Playwright）用の安定セレクタ。
                      <div key={mi} className={s.meld} data-meld="">
                        {meldTileViews(md, seat).map((v, ti) => (
                          <ViewTile key={ti} code={v.tile} kind="meld" lay={v.lay} back={v.back} />
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
