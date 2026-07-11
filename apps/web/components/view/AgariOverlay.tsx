import { totalHan, type Agari, type Kifu, type Seat } from "@rigel/schema";
import { agariDeltas, scoreAgari, sortHandTiles } from "@rigel/ui";
import { SEAT_ORDER, windOf } from "../../lib/board";
import { OssTileFace } from "../OssTileFace";
import s from "./agari-overlay.module.css";

/** 和了1件の表示（和了手牌・裏ドラめくり・役・打点）。 */
function WinBlock({ agari, kifu, dealer }: { agari: Agari; kifu: Kifu; dealer: Seat }) {
  const score = scoreAgari(agari, kifu.meta.dealer, kifu.rules);
  const han = totalHan(agari);
  const winnerRiichi = agari.riichi.includes(agari.winner);
  // 和了牌単体ではなく手牌すべてを見せる。viewKifu の手牌はツモ和了牌が除去済み・
  // ロン牌は元々含まれないので、理牌した手牌＋副露＋和了牌（白枠強調）で並べる。
  const board = kifu.seats[agari.winner];
  const handShown = sortHandTiles(board.hand);

  return (
    <div className={s.win}>
      <div className={s.winner}>
        {windOf(agari.winner, dealer)}家{" "}
        <span className={s.kind}>{agari.from === null ? "ツモ" : "ロン"}</span>
      </div>
      {(handShown.length > 0 || agari.winTile) && (
        <div className={s.handRow} data-agari-hand="">
          {handShown.map((t, i) => (
            <span className={s.htile} key={i}>
              <OssTileFace code={t.tile} />
            </span>
          ))}
          {board.melds.map((m, mi) => (
            <span className={s.meld} key={mi}>
              {m.tiles.map((t, ti) => (
                <span className={s.htile} key={ti}>
                  <OssTileFace code={t.tile} />
                </span>
              ))}
            </span>
          ))}
          {agari.winTile && (
            <span className={s.winTile} data-agari-win="">
              <OssTileFace code={agari.winTile} />
            </span>
          )}
        </div>
      )}
      <div className={s.tiles}>
        {kifu.meta.dora.length > 0 && (
          <div className={s.tileWrap} data-agari-dora="">
            <span className={s.tlabel}>ドラ表示</span>
            <div className={s.trow}>
              {kifu.meta.dora.map((t, i) => (
                <span className={s.doraT} key={`${t}-${i}`}>
                  <OssTileFace code={t} />
                </span>
              ))}
            </div>
          </div>
        )}
        {winnerRiichi && kifu.meta.uraDora.length > 0 && (
          <div className={s.tileWrap} data-agari-ura="">
            <span className={s.tlabel}>裏ドラ表示 ×{agari.ura}</span>
            <div className={s.trow}>
              {kifu.meta.uraDora.map((t, i) => (
                <span className={s.ura} key={`${t}-${i}`}>
                  <OssTileFace code={t} />
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {agari.yaku.length > 0 && (
        <div className={s.yaku}>
          {agari.yaku.map((y) => (
            <div className={s.yrow} key={y.name}>
              <span>{y.name}</span>
              <span className={s.h}>{y.han}飜</span>
            </div>
          ))}
          <div className={s.dorarow}>
            <span>ドラ / 赤 / 裏</span>
            <span>
              {agari.dora} / {agari.aka} / {agari.ura}
            </span>
          </div>
        </div>
      )}

      <div className={s.score}>
        <span className={s.total}>{score.total.toLocaleString()}点</span>
        {score.limit && <span className={s.lim}>{score.limit}</span>}
        <span className={s.hanfu}>
          {han}飜{agari.fu}符
        </span>
      </div>
    </div>
  );
}

/** 上がりオーバーレイ。再生が和了に達したとき、kifu.agari（ダブロン等は複数）と
 *  scoreAgari から和了牌ポップ・裏ドラめくり・役/打点・点数移動を表示する。 */
export function AgariOverlay({
  kifu,
  dealer,
  onClose,
}: {
  kifu: Kifu;
  dealer: Seat;
  onClose: () => void;
}) {
  const agaris = kifu.agari;
  if (agaris.length === 0) return null;
  const deltas = agariDeltas(kifu);

  return (
    <div className={s.ov} onClick={onClose}>
      <div className={s.card} onClick={(e) => e.stopPropagation()}>
        <div className={s.head}>
          <span className={s.who}>{agaris.length > 1 ? `${agaris.length}人和了` : "和了"}</span>
          <button className={s.x} aria-label="閉じる" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className={s.body}>
          {agaris.map((a, i) => (
            <WinBlock key={i} agari={a} kifu={kifu} dealer={dealer} />
          ))}

          <div className={s.deltas}>
            {SEAT_ORDER.map((seat) => (
              <div className={s.drow} key={seat}>
                <span>{windOf(seat, dealer)}家</span>
                <span className={deltas[seat] >= 0 ? s.plus : s.minus}>
                  {deltas[seat] >= 0 ? "+" : ""}
                  {deltas[seat].toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
