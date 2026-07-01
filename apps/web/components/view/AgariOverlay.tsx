import { totalHan, type Agari, type Kifu, type Seat } from "@rigel/schema";
import { agariDeltas, scoreAgari } from "@rigel/ui";
import { SEAT_ORDER, windOf } from "../../lib/board";
import { OssTileFace } from "../OssTileFace";
import s from "./agari-overlay.module.css";

/** 和了1件の表示（和了牌ポップ・裏ドラめくり・役・打点）。 */
function WinBlock({ agari, kifu, dealer }: { agari: Agari; kifu: Kifu; dealer: Seat }) {
  const score = scoreAgari(agari, kifu.meta.dealer, kifu.rules);
  const han = totalHan(agari);
  const winnerRiichi = agari.riichi.includes(agari.winner);

  return (
    <div className={s.win}>
      <div className={s.winner}>
        {windOf(agari.winner, dealer)}家{" "}
        <span className={s.kind}>{agari.from === null ? "ツモ" : "ロン"}</span>
      </div>
      <div className={s.tiles}>
        {agari.winTile && (
          <div className={s.tileWrap}>
            <span className={s.tlabel}>和了牌</span>
            <span className={s.winTile}>
              <OssTileFace code={agari.winTile} />
            </span>
          </div>
        )}
        {winnerRiichi && kifu.meta.uraDora && (
          <div className={s.tileWrap}>
            <span className={s.tlabel}>裏ドラ ×{agari.ura}</span>
            <span className={s.ura} key={kifu.meta.uraDora}>
              <OssTileFace code={kifu.meta.uraDora} />
            </span>
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
