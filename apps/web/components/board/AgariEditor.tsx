import { AgariSchema, totalHan, type Agari, type Kifu, type Seat, type Tile } from "@rigel/schema";
import { agariDeltas, kifuScore, yakuByGroup, yakuHan, YAKU_CATALOG } from "@rigel/ui";
import { SEAT_ORDER, windOf } from "../../lib/board";
import { DoraPicker } from "./DoraPicker";
import { Stepper } from "./Stepper";
import s from "./agari-editor.module.css";

const FU_OPTIONS = [20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 110];
const YAKU_GROUPS = yakuByGroup();
const CATALOG_BY_NAME = new Map(YAKU_CATALOG.map((y) => [y.name, y]));

/** payment を人が読める文字列に。 */
function payText(score: NonNullable<ReturnType<typeof kifuScore>>): string {
  const p = score.payment;
  if ("ron" in p) return `${p.ron}点`;
  if ("each" in p) return `${p.each}点オール`;
  return `子${p.fromNonDealer} / 親${p.fromDealer}`;
}

/**
 * 和了入力UI。和了者・ロン/ツモ・放銃者・リーチ・和了牌・役・符・ドラ枚数を入力し、
 * その場で打点/支払い/各家増減を表示する。すべて kifu.agari に保存する（単一の真実源）。
 */
export function AgariEditor({
  kifu,
  dealer,
  onAgari,
}: {
  kifu: Kifu;
  dealer: Seat;
  onAgari: (agari: Agari | null) => void;
}) {
  const agari = kifu.agari;
  const winnerOpen = agari ? kifu.seats[agari.winner].melds.length > 0 : false;
  const selectedYaku = new Set(agari?.yaku.map((y) => y.name));

  // agari を部分更新（存在しなければ winner 必須なので何もしない）。
  const patch = (p: Partial<Agari>) => {
    if (!agari) return;
    onAgari(AgariSchema.parse({ ...agari, ...p }));
  };

  const setWinner = (seat: Seat) => {
    if (agari?.winner === seat) return onAgari(null); // もう一度押すと解除。
    onAgari(AgariSchema.parse({ ...(agari ?? {}), winner: seat }));
  };

  const toggleYaku = (name: string) => {
    if (!agari) return;
    const names = selectedYaku.has(name)
      ? [...selectedYaku].filter((n) => n !== name)
      : [...selectedYaku, name];
    const yaku = names.map((n) => ({ name: n, han: yakuHan(CATALOG_BY_NAME.get(n)!, winnerOpen) }));
    patch({ yaku });
  };

  const riichiSet = new Set(agari?.riichi);
  const toggleRiichi = (seat: Seat) => {
    if (!agari) return;
    const riichi = riichiSet.has(seat)
      ? [...riichiSet].filter((x) => x !== seat)
      : [...riichiSet, seat];
    patch({ riichi });
  };

  const score = kifuScore(kifu);
  const deltas = agariDeltas(kifu);
  const han = agari ? totalHan(agari) : 0;

  return (
    <div>
      {/* 和了者 */}
      <div className={s.field}>
        <span className={s.label}>和了者</span>
        <div className={s.seg}>
          {SEAT_ORDER.map((seat) => (
            <button
              key={seat}
              className={agari?.winner === seat ? s.on : ""}
              onClick={() => setWinner(seat)}
            >
              {windOf(seat, dealer)}家
            </button>
          ))}
        </div>
      </div>

      {agari && (
        <>
          {/* ロン/ツモ */}
          <div className={s.field}>
            <span className={s.label}>和了種別</span>
            <div className={s.seg}>
              <button
                className={agari.from === null ? s.on : ""}
                onClick={() => patch({ from: null })}
              >
                ツモ
              </button>
              <button
                className={agari.from !== null ? s.on : ""}
                onClick={() =>
                  patch({ from: agari.from ?? SEAT_ORDER.find((x) => x !== agari.winner)! })
                }
              >
                ロン
              </button>
            </div>
          </div>

          {/* 放銃者（ロンのみ） */}
          {agari.from !== null && (
            <div className={s.field}>
              <span className={s.label}>放銃者</span>
              <div className={s.seg}>
                {SEAT_ORDER.filter((seat) => seat !== agari.winner).map((seat) => (
                  <button
                    key={seat}
                    className={agari.from === seat ? s.on : ""}
                    onClick={() => patch({ from: seat })}
                  >
                    {windOf(seat, dealer)}家
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* リーチ */}
          <div className={s.field}>
            <span className={s.label}>リーチ</span>
            <div className={s.seg}>
              {SEAT_ORDER.map((seat) => (
                <button
                  key={seat}
                  className={riichiSet.has(seat) ? s.on : ""}
                  onClick={() => toggleRiichi(seat)}
                >
                  {windOf(seat, dealer)}家
                </button>
              ))}
            </div>
          </div>

          {/* 和了牌 */}
          <div className={s.field}>
            <span className={s.label}>和了牌</span>
            <DoraPicker value={agari.winTile} onPick={(t: Tile) => patch({ winTile: t })} />
          </div>

          {/* 符 */}
          <div className={s.field}>
            <span className={s.label}>符</span>
            <select
              className={s.sel}
              value={agari.fu}
              onChange={(e) => patch({ fu: Number(e.target.value) })}
              aria-label="符"
            >
              {FU_OPTIONS.map((fu) => (
                <option key={fu} value={fu}>
                  {fu}符
                </option>
              ))}
            </select>
          </div>

          {/* ドラ枚数 */}
          <Stepper
            label="表ドラ"
            unit="枚"
            value={agari.dora}
            min={0}
            max={20}
            set={(v) => patch({ dora: v })}
          />
          <Stepper
            label="赤ドラ"
            unit="枚"
            value={agari.aka}
            min={0}
            max={8}
            set={(v) => patch({ aka: v })}
          />
          <Stepper
            label="裏ドラ"
            unit="枚"
            value={agari.ura}
            min={0}
            max={20}
            set={(v) => riichiSet.has(agari.winner) && patch({ ura: v })}
          />

          {/* 役マルチセレクト */}
          {(["門前", "鳴き可", "役満"] as const).map((group) => (
            <div className={s.yakuGrp} key={group}>
              <div className={s.yakuHead}>{group}</div>
              <div className={s.yakuGrid}>
                {YAKU_GROUPS[group].map((y) => {
                  const h = yakuHan(y, winnerOpen);
                  const disabled = h === 0; // 門前限定を鳴きで選べない。
                  return (
                    <button
                      key={y.name}
                      className={`${s.chip} ${selectedYaku.has(y.name) ? s.on : ""}`}
                      disabled={disabled}
                      onClick={() => toggleYaku(y.name)}
                    >
                      {y.name}
                      <span className={s.han}>{disabled ? "—" : `${h}飜`}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* 打点・支払い・各家増減 */}
          <div className={s.result}>
            {score ? (
              <>
                <div className={s.big}>
                  <span>{score.total}点</span>
                  {score.limit && <span className={s.lim}>{score.limit}</span>}
                  <span className={s.pay} style={{ marginLeft: "auto" }}>
                    {han}飜{agari.fu}符
                  </span>
                </div>
                <div className={s.pay}>{payText(score)}</div>
                <div className={s.deltas}>
                  {SEAT_ORDER.map((seat) => (
                    <div className={s.drow} key={seat}>
                      <span>{windOf(seat, dealer)}家</span>
                      <span className={deltas[seat] >= 0 ? s.plus : s.minus}>
                        {deltas[seat] >= 0 ? "+" : ""}
                        {deltas[seat]}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
            {han === 0 && (
              <div className={s.warn}>役がありません（ドラのみでは和了できません）。</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
