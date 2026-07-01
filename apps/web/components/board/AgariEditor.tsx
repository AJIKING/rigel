import { AgariSchema, totalHan, type Agari, type Kifu, type Seat, type Tile } from "@rigel/schema";
import { agariDeltas, kifuScore, scoreAgari, yakuByGroup, yakuHan, YAKU_CATALOG } from "@rigel/ui";
import { useState } from "react";
import { SEAT_ORDER, windOf } from "../../lib/board";
import { DoraPicker } from "./DoraPicker";
import { Stepper } from "./Stepper";
import s from "./agari-editor.module.css";

const FU_OPTIONS = [20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 110];
const YAKU_GROUPS = yakuByGroup();
const CATALOG_BY_NAME = new Map(YAKU_CATALOG.map((y) => [y.name, y]));

/** 席を選ぶセグメント（和了者/放銃者/リーチで共用）。 */
function SeatSeg({
  label,
  seats,
  isOn,
  onPick,
  dealer,
}: {
  label: string;
  seats: Seat[];
  isOn: (seat: Seat) => boolean;
  onPick: (seat: Seat) => void;
  dealer: Seat;
}) {
  return (
    <div className={s.field}>
      <span className={s.label}>{label}</span>
      <div className={s.seg}>
        {seats.map((seat) => (
          <button key={seat} className={isOn(seat) ? s.on : ""} onClick={() => onPick(seat)}>
            {windOf(seat, dealer)}家
          </button>
        ))}
      </div>
    </div>
  );
}

/** payment を人が読める文字列に。 */
function payText(score: NonNullable<ReturnType<typeof kifuScore>>): string {
  const p = score.payment;
  if ("ron" in p) return `${p.ron}点`;
  if ("each" in p) return `${p.each}点オール`;
  return `子${p.fromNonDealer} / 親${p.fromDealer}`;
}

/** 和了1件の入力。和了者・種別・放銃者・リーチ・和了牌・役・符・ドラ枚数を入力し打点を表示。 */
function AgariEntry({
  kifu,
  dealer,
  agari,
  index,
  onChange,
  onRemove,
}: {
  kifu: Kifu;
  dealer: Seat;
  agari: Agari;
  index: number;
  onChange: (a: Agari) => void;
  onRemove: () => void;
}) {
  const winnerOpen = kifu.seats[agari.winner].melds.length > 0;
  const selectedYaku = new Set(agari.yaku.map((y) => y.name));
  const riichiSet = new Set(agari.riichi);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ 役満: true });
  const toggleGroup = (g: string) => setCollapsed((c) => ({ ...c, [g]: !c[g] }));

  const patch = (p: Partial<Agari>) => onChange(AgariSchema.parse({ ...agari, ...p }));
  const toggleYaku = (name: string) => {
    const names = selectedYaku.has(name)
      ? [...selectedYaku].filter((n) => n !== name)
      : [...selectedYaku, name];
    patch({
      yaku: names.map((n) => ({ name: n, han: yakuHan(CATALOG_BY_NAME.get(n)!, winnerOpen) })),
    });
  };
  const toggleRiichi = (seat: Seat) =>
    patch({
      riichi: riichiSet.has(seat) ? [...riichiSet].filter((x) => x !== seat) : [...riichiSet, seat],
    });

  const score = scoreAgari(agari, kifu.meta.dealer, kifu.rules);
  const han = totalHan(agari);

  return (
    <div className={s.entry}>
      <div className={s.entryHead}>
        <span className={s.entryTitle}>和了 {index + 1}</span>
        <button className={s.removeBtn} onClick={onRemove}>
          削除
        </button>
      </div>

      <SeatSeg
        label="和了者"
        seats={SEAT_ORDER}
        isOn={(seat) => agari.winner === seat}
        onPick={(seat) => patch({ winner: seat })}
        dealer={dealer}
      />

      <div className={s.field}>
        <span className={s.label}>和了種別</span>
        <div className={s.seg}>
          <button className={agari.from === null ? s.on : ""} onClick={() => patch({ from: null })}>
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

      {agari.from !== null && (
        <SeatSeg
          label="放銃者"
          seats={SEAT_ORDER.filter((seat) => seat !== agari.winner)}
          isOn={(seat) => agari.from === seat}
          onPick={(seat) => patch({ from: seat })}
          dealer={dealer}
        />
      )}

      <SeatSeg
        label="リーチ"
        seats={SEAT_ORDER}
        isOn={(seat) => riichiSet.has(seat)}
        onPick={toggleRiichi}
        dealer={dealer}
      />

      <div className={s.field}>
        <span className={s.label}>和了牌</span>
        <DoraPicker value={agari.winTile} onPick={(t: Tile) => patch({ winTile: t })} />
      </div>

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

      {(["門前", "鳴き可", "役満"] as const).map((group) => {
        const picked = YAKU_GROUPS[group].filter((y) => selectedYaku.has(y.name)).length;
        const isOpen = !collapsed[group];
        return (
          <div className={s.yakuGrp} key={group}>
            <button
              type="button"
              className={s.yakuHead}
              aria-expanded={isOpen}
              onClick={() => toggleGroup(group)}
            >
              {isOpen ? "▾" : "▸"} {group}
              {picked > 0 && <span className={s.pickedCount}>{picked}</span>}
            </button>
            {isOpen && (
              <div className={s.yakuGrid}>
                {YAKU_GROUPS[group].map((y) => {
                  const h = yakuHan(y, winnerOpen);
                  const disabled = h === 0;
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
            )}
          </div>
        );
      })}

      <div className={s.result}>
        <div className={s.big}>
          <span>{score.total}点</span>
          {score.limit && <span className={s.lim}>{score.limit}</span>}
          <span className={s.pay} style={{ marginLeft: "auto" }}>
            {han}飜{agari.fu}符
          </span>
        </div>
        <div className={s.pay}>{payText(score)}</div>
        {han === 0 && <div className={s.warn}>役がありません（ドラのみでは和了できません）。</div>}
      </div>
    </div>
  );
}

/**
 * 和了入力UI。ダブロン/トリプルロンは「和了を追加」で複数件を入力できる。
 * すべて kifu.agari（配列）に保存し、各家増減はまとめて表示する。
 */
export function AgariEditor({
  kifu,
  dealer,
  onChange,
}: {
  kifu: Kifu;
  dealer: Seat;
  onChange: (agaris: Agari[]) => void;
}) {
  const agaris = kifu.agari;
  const deltas = agariDeltas(kifu);

  const addAgari = () => {
    const used = new Set(agaris.map((a) => a.winner));
    const winner = SEAT_ORDER.find((seat) => !used.has(seat)) ?? "east";
    // ダブロン以降は放銃者を先頭に合わせる。
    const from = agaris[0]?.from ?? SEAT_ORDER.find((seat) => seat !== winner)!;
    onChange([...agaris, AgariSchema.parse({ winner, from })]);
  };

  // 2件目以降はダブロン/トリプルロン許可が要る。ツモの後には足せない。
  const first = agaris[0];
  const isRon = !first || first.from !== null;
  const max = kifu.rules.tripleRon ? 3 : kifu.rules.doubleRon ? 2 : 1;
  const canAdd = isRon && agaris.length < max;

  return (
    <div>
      {agaris.map((a, i) => (
        <AgariEntry
          key={i}
          kifu={kifu}
          dealer={dealer}
          agari={a}
          index={i}
          onChange={(na) => onChange(agaris.map((x, j) => (j === i ? na : x)))}
          onRemove={() => onChange(agaris.filter((_, j) => j !== i))}
        />
      ))}

      {canAdd && (
        <button className={s.addAgari} onClick={addAgari}>
          ＋ {agaris.length === 0 ? "和了を追加" : "和了を追加（ダブロン）"}
        </button>
      )}

      {agaris.length > 0 && (
        <div className={s.result}>
          <div className={s.pay}>点数移動</div>
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
        </div>
      )}
    </div>
  );
}
