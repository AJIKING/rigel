"use client";

import {
  KifuSchema,
  toAbsoluteSeat,
  type CameraSeat,
  type Kifu,
  type Seat,
  type Tile,
} from "@rigel/schema";
import { applyTileEdit, needsReview, visibilityLabel, type TileLocation } from "@rigel/ui";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  deleteKifu,
  getGame,
  setVisibility,
  updateKifu,
  type GameDetail,
  type GameLog,
} from "../../lib/api";
import {
  NUMS,
  SEAT_ORDER,
  SUITS,
  chunk,
  popAnchor,
  roundName,
  windOf,
  type Suit,
} from "../../lib/board";
import { useAuth } from "../../lib/auth-context";
import { useBoardScale } from "../../lib/use-board-scale";
import { OssTileFace } from "../OssTileFace";
import { AddKyokuModal } from "./AddKyokuModal";
import { Stepper } from "./Stepper";
import s from "./board-editor.module.css";

const SLOTS: { cam: CameraSeat; cls: string }[] = [
  { cam: "bottom", cls: s.seatB },
  { cam: "right", cls: s.seatR },
  { cam: "top", cls: s.seatT },
  { cam: "left", cls: s.seatL },
];
function fkey(loc: TileLocation): string {
  return `${loc.seat}:${loc.area}:${loc.meldIndex ?? "-"}:${loc.index}`;
}
function clone(k: Kifu): Kifu {
  return JSON.parse(JSON.stringify(k)) as Kifu;
}
function fmtPts(v: string): string {
  const n = parseFloat(v);
  if (isNaN(n)) return "0.0";
  return (n >= 0 ? "+" : "") + n.toFixed(1);
}

type Selection =
  | { kind: "edit"; loc: TileLocation }
  | { kind: "add"; seat: Seat; area: "hand" | "river" }
  | { kind: "dora" }
  | null;

function BoardTile({
  code,
  kind,
  lay,
  tsumogiri,
  review,
  selected,
  flash,
  label,
  onClick,
}: {
  code: Tile | null;
  kind?: "river" | "meld";
  lay?: boolean;
  tsumogiri?: boolean;
  review?: boolean;
  selected?: boolean;
  flash?: boolean;
  label: string;
  onClick: (e: React.MouseEvent) => void;
}) {
  const cls = [
    s.tile,
    kind === "river" ? s.riverT : "",
    kind === "meld" ? s.meldT : "",
    lay ? s.lay : "",
    tsumogiri ? s.tsumogiri : "",
    review ? s.review : "",
    selected ? s.sel : "",
    flash ? s.flash : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      type="button"
      className={cls}
      aria-label={`${label} を編集`}
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
    >
      <OssTileFace code={code} />
    </button>
  );
}

function DoraGlyph({ code }: { code: Tile | null }) {
  return <span className={s.doraT}>{code && <OssTileFace code={code} />}</span>;
}

const RESULTS = ["", "ツモ", "ロン", "放銃", "聴牌", "不聴", "流し満貫"];

export function BoardEditor({ gameId, logId }: { gameId: string; logId: string }) {
  const { user, token, loading: authLoading } = useAuth();
  const [detail, setDetail] = useState<GameDetail | null>(null);
  const [idx, setIdx] = useState(0);
  const [kifu, setKifu] = useState<Kifu | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const reload = useCallback(
    async (focus?: string) => {
      if (!token) return;
      const d = await getGame(token, gameId).catch(() => null);
      if (!d) {
        setErr("取得に失敗しました");
        return;
      }
      setDetail(d);
      const want = focus ?? logId;
      const i = Math.max(
        0,
        d.logs.findIndex((l) => l.id === want),
      );
      setIdx(i);
      setKifu(d.logs[i]?.kifu ?? null);
    },
    [token, gameId, logId],
  );

  useEffect(() => {
    if (!authLoading) void reload();
  }, [authLoading, reload]);

  if (authLoading) return <p style={{ color: "#aaa", padding: 24 }}>…</p>;
  if (!token)
    return (
      <p style={{ color: "#555", padding: 24 }}>
        編集には <Link href="/login">ログイン</Link> が必要です。
      </p>
    );
  if (err) return <p style={{ color: "crimson", padding: 24 }}>{err}</p>;
  const log = detail?.logs[idx];
  if (!detail || !log || !kifu) return <p style={{ color: "#aaa", padding: 24 }}>読み込み中…</p>;

  return (
    <Editor
      key={log.id}
      detail={detail}
      idx={idx}
      log={log}
      kifu={kifu}
      setKifu={setKifu}
      token={token}
      userPlan={user?.plan ?? "free"}
      gameId={gameId}
      onSwitch={(i) => {
        setIdx(i);
        setKifu(detail.logs[i]?.kifu ?? null);
      }}
      reload={reload}
    />
  );
}

interface EditorProps {
  detail: GameDetail;
  idx: number;
  log: GameLog;
  kifu: Kifu;
  setKifu: (k: Kifu) => void;
  token: string;
  userPlan: "free" | "next" | "pro";
  gameId: string;
  onSwitch: (i: number) => void;
  reload: (focus?: string) => Promise<void>;
}

function Editor(p: EditorProps) {
  const { detail, idx, log, kifu, setKifu, token, gameId } = p;
  const bottomSeat: Seat = kifu.cameraBottomSeat ?? "east";
  const dealer: Seat = kifu.meta.dealer ?? bottomSeat;

  // 局メタ（本場/供託/最終巡目/ドラ）は kifu.meta から読み、変更は mutate で書き戻して保存に乗せる。
  const honba = kifu.meta.honba;
  const kyotaku = kifu.meta.kyotaku;
  const junme = kifu.meta.junme;
  const dora = kifu.meta.dora;
  const setHonba = (v: number) =>
    mutate((d) => {
      d.meta.honba = v;
    });
  const setKyotaku = (v: number) =>
    mutate((d) => {
      d.meta.kyotaku = v;
    });
  const setJunme = (v: number) =>
    mutate((d) => {
      d.meta.junme = v;
    });
  const setDora = (code: Tile) =>
    mutate((d) => {
      d.meta.dora = code;
    });
  const [results, setResults] = useState<Record<Seat, string>>({
    east: "",
    south: "",
    west: "",
    north: "",
  });

  const [sel, setSel] = useState<Selection>(null);
  const [pop, setPop] = useState<{ x: number; y: number } | null>(null);
  const [suit, setSuit] = useState<Suit>("m");
  const [flashKey, setFlashKey] = useState<string | null>(null);
  const [meldType, setMeldType] = useState<"none" | "chi" | "pon" | "kan">("none");
  const [meldWho, setMeldWho] = useState<CameraSeat>("bottom");
  const [kanType, setKanType] = useState<"minkan" | "ankan" | "kakan">("minkan");

  const [save, setSave] = useState<"idle" | "saving" | "done">("idle");
  const [vis, setVis] = useState(log.visibility);
  const [visBusy, setVisBusy] = useState(false);
  const [hanchanName, setHanchanName] = useState(detail.game.title || "");
  const [dateInput, setDateInput] = useState(
    new Date(detail.game.createdAt).toISOString().slice(0, 10),
  );
  const [roundMenu, setRoundMenu] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [delArm, setDelArm] = useState(false);
  // 点数（UI のみ。スキーマ外）。
  const [showPoints, setShowPoints] = useState(false);
  const [names, setNames] = useState<Record<Seat, string>>({
    east: "",
    south: "",
    west: "",
    north: "",
  });
  const [points, setPoints] = useState<Record<Seat, string>>({
    east: "0",
    south: "0",
    west: "0",
    north: "0",
  });
  const [open, setOpen] = useState<Record<string, boolean>>({
    han: true,
    info: true,
    agari: true,
    basic: true,
  });

  const mainRef = useRef<HTMLDivElement>(null);
  const scale = useBoardScale(mainRef);

  const closePop = useCallback(() => {
    setSel(null);
    setPop(null);
    setMeldType("none");
  }, []);

  function openEdit(e: React.MouseEvent, loc: TileLocation, code: Tile | null) {
    setSel({ kind: "edit", loc });
    setSuit((code?.[1] as Suit) ?? "m");
    setMeldType("none");
    setPop(popAnchor((e.currentTarget as HTMLElement).getBoundingClientRect()));
  }
  function openAdd(e: React.MouseEvent, seat: Seat, area: "hand" | "river") {
    e.stopPropagation();
    setSel({ kind: "add", seat, area });
    setSuit("m");
    setMeldType("none");
    setPop(popAnchor((e.currentTarget as HTMLElement).getBoundingClientRect()));
  }
  function openDora(e: React.MouseEvent) {
    e.stopPropagation();
    setSel({ kind: "dora" });
    setSuit((dora?.[1] as Suit) ?? "z");
    setMeldType("none");
    setPop(popAnchor((e.currentTarget as HTMLElement).getBoundingClientRect()));
  }

  function flash(loc: TileLocation) {
    const k = fkey(loc);
    setFlashKey(k);
    setTimeout(() => setFlashKey((c) => (c === k ? null : c)), 480);
  }

  // Kifu を不変更新する共通ヘルパ（複製→変更→Zod 再検証→反映）。
  function mutate(fn: (draft: Kifu) => void) {
    const draft = clone(kifu);
    fn(draft);
    setKifu(KifuSchema.parse(draft));
  }

  function meldTiles(type: "chi" | "pon" | "kan", code: Tile): Tile[] {
    if (type === "pon") return [code, code, code];
    if (type === "kan") return [code, code, code, code];
    const su = code[1];
    if (su !== "m" && su !== "p" && su !== "s") return [code, code, code];
    const n = code[0] === "0" ? 5 : Number(code[0]);
    const st = Math.max(1, Math.min(n - 1, 7));
    return [`${st}${su}` as Tile, `${st + 1}${su}` as Tile, `${st + 2}${su}` as Tile];
  }

  function applyTile(code: Tile) {
    if (!sel) return;
    if (sel.kind === "dora") {
      setDora(code);
      closePop();
      return;
    }
    if (sel.kind === "add") {
      const { seat, area } = sel;
      mutate((d) => {
        if (area === "hand") d.seats[seat].hand.push({ tile: code, confidence: 1 });
        else {
          const river = d.seats[seat].river;
          river.push({
            order: river.length + 1,
            tile: code,
            riichi: false,
            tsumogiri: false,
            confidence: 1,
          });
        }
      });
      closePop();
      return;
    }
    if (meldType !== "none" && sel.loc.area !== "meld") {
      const owner = toAbsoluteSeat(meldWho, bottomSeat);
      const kanMap = { minkan: "kan_open", ankan: "kan_closed", kakan: "kan_added" } as const;
      const type = meldType === "chi" ? "chi" : meldType === "pon" ? "pon" : kanMap[kanType];
      mutate((d) =>
        d.seats[owner].melds.push({
          type,
          tiles: meldTiles(meldType, code).map((t) => ({ tile: t, confidence: 1 })),
          from: null,
        }),
      );
      closePop();
      return;
    }
    setKifu(applyTileEdit(kifu, sel.loc, code));
    flash(sel.loc);
    closePop();
  }

  async function onSave() {
    setSave("saving");
    const res = await updateKifu(token, log.id, kifu).catch(() => ({ ok: false, status: 0 }));
    setSave(res.ok ? "done" : "idle");
    if (res.ok) setTimeout(() => setSave("idle"), 1500);
  }
  async function toggleVis(next: "public" | "private") {
    if (next === vis || visBusy) return;
    setVisBusy(true);
    const res = await setVisibility(token, log.id, next).catch(() => ({ ok: false, status: 0 }));
    if (res.ok) setVis(next);
    setVisBusy(false);
  }

  function setDealerSeat(seat: Seat) {
    mutate((d) => {
      d.meta.dealer = seat;
    });
  }

  // 捨牌の手出し/自摸切りを切り替える（選択は保持＝ポップアップを開いたまま）。
  function setDiscardKind(tsumogiri: boolean) {
    if (sel?.kind !== "edit" || sel.loc.area !== "river") return;
    const loc = sel.loc;
    mutate((d) => {
      const discard = d.seats[loc.seat].river[loc.index];
      if (discard) discard.tsumogiri = tsumogiri;
    });
  }

  async function onDelete() {
    if (detail.logs.length <= 1) return;
    if (!delArm) {
      setDelArm(true);
      setTimeout(() => setDelArm(false), 2200);
      return;
    }
    setDelArm(false);
    const res = await deleteKifu(token, log.id).catch(() => ({ ok: false, status: 0 }));
    if (res.ok) {
      const focus = detail.logs[idx + 1]?.id ?? detail.logs[idx - 1]?.id;
      await p.reload(focus);
    }
  }

  const round = roundName(idx);
  // 共有先は公開ビューア（誰でも閲覧可）。エディタ(/kifu/...)は所有者専用なので使わない。
  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/k/${gameId}` : "";

  const acc = (id: string) => setOpen((o) => ({ ...o, [id]: !o[id] }));

  return (
    <div className={`${s.app} themeBoard`} onClick={() => pop && closePop()}>
      <header className={s.bar}>
        <Link href="/kifu" className={s.brand} aria-label="牌譜一覧へ">
          <svg className={s.star} viewBox="0 0 24 24">
            <path
              d="M12 1.5l1.7 7.1 7.1 1.7-7.1 1.7L12 19.1l-1.7-7.1L3.2 10.3l7.1-1.7L12 1.5z"
              fill="#fff"
            />
          </svg>
          <span className={s.wm}>RIGEL</span>
        </Link>
        <nav className={s.crumb}>
          <span>{hanchanName || "無題の半荘"}</span>
          <span>·</span>
          <span>{dateInput.replace(/-/g, "/")}</span>
          <span>·</span>
          <b>{round}</b>
        </nav>
        <div className={s.sp} />
        <button
          className={`${s.savebtn} ${save === "done" ? s.done : ""}`}
          disabled={save !== "idle"}
          onClick={(e) => {
            e.stopPropagation();
            void onSave();
          }}
        >
          {save === "saving" ? "保存中…" : save === "done" ? "保存しました" : "保存"}
        </button>
      </header>

      <div className={s.wrap}>
        <div className={s.main} ref={mainRef}>
          <div className={s.stage} style={{ height: 768 * scale }}>
            <div
              className={s.table}
              style={{ transform: `scale(${scale})` }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={s.center}>
                <div className={s.rd}>
                  {round} <span className={s.hb}>{honba}本場</span>
                </div>
                {kyotaku > 0 && (
                  <div className={s.kyotaku}>
                    供託 <b>{kyotaku}</b>本
                  </div>
                )}
                <div className={s.dora}>
                  <DoraGlyph code={dora} />
                </div>
              </div>

              {SLOTS.map(({ cam, cls }) => {
                const seat = toAbsoluteSeat(cam, bottomSeat);
                const board = kifu.seats[seat];
                const wind = windOf(seat, dealer);
                const win = results[seat] === "ツモ" || results[seat] === "ロン";
                const rows = chunk(board.river, 6);
                return (
                  <div key={cam} className={`${s.seat} ${cls}`}>
                    <div className={s.river}>
                      {rows.map((row, ri) => (
                        <div key={ri} className={s.rrow}>
                          {row.map((d, ci) => {
                            const index = ri * 6 + ci;
                            const loc: TileLocation = { seat, area: "river", index };
                            return (
                              <BoardTile
                                key={ci}
                                code={d.tile}
                                kind="river"
                                lay={d.riichi}
                                tsumogiri={d.tsumogiri}
                                review={needsReview(d)}
                                selected={sel?.kind === "edit" && fkey(sel.loc) === fkey(loc)}
                                flash={flashKey === fkey(loc)}
                                label={`${wind}家の河 ${index + 1}枚目`}
                                onClick={(e) => openEdit(e, loc, d.tile)}
                              />
                            );
                          })}
                          {ri === rows.length - 1 && (
                            <button
                              type="button"
                              className={`${s.tile} ${s.riverT} ${s.addslot}`}
                              aria-label={`${wind}家に捨て牌を追加`}
                              onClick={(e) => openAdd(e, seat, "river")}
                            >
                              +
                            </button>
                          )}
                        </div>
                      ))}
                      {rows.length === 0 && (
                        <div className={s.rrow}>
                          <button
                            type="button"
                            className={`${s.tile} ${s.riverT} ${s.addslot}`}
                            aria-label={`${wind}家に捨て牌を追加`}
                            onClick={(e) => openAdd(e, seat, "river")}
                          >
                            +
                          </button>
                        </div>
                      )}
                    </div>

                    <div className={`${s.nameplate} ${win ? s.win : ""}`}>
                      <span className={s.wd}>{wind}</span>
                      <span className={s.nm}>{names[seat] || `${wind}家`}</span>
                      {results[seat] && <span className={s.sc}>{results[seat]}</span>}
                      {showPoints && (
                        <span
                          style={{
                            color: "var(--orange)",
                            fontWeight: 700,
                            fontVariantNumeric: "tabular-nums",
                            fontSize: 12,
                          }}
                        >
                          {fmtPts(points[seat])}
                        </span>
                      )}
                    </div>

                    <div className={s.hand}>
                      {board.hand.map((h, hi) => {
                        const loc: TileLocation = { seat, area: "hand", index: hi };
                        return (
                          <BoardTile
                            key={hi}
                            code={h.tile}
                            review={needsReview(h)}
                            selected={sel?.kind === "edit" && fkey(sel.loc) === fkey(loc)}
                            flash={flashKey === fkey(loc)}
                            label={`${wind}家の手牌`}
                            onClick={(e) => openEdit(e, loc, h.tile)}
                          />
                        );
                      })}
                      {board.hand.length < 14 && (
                        <button
                          type="button"
                          className={`${s.tile} ${s.addslot}`}
                          aria-label={`${wind}家の手牌に追加`}
                          onClick={(e) => openAdd(e, seat, "hand")}
                        >
                          +
                        </button>
                      )}
                      {board.melds.length > 0 && (
                        <div className={s.melds}>
                          {board.melds.map((md, mi) => (
                            <div key={mi} className={s.meld}>
                              {md.tiles.map((t, ti) => {
                                const loc: TileLocation = {
                                  seat,
                                  area: "meld",
                                  meldIndex: mi,
                                  index: ti,
                                };
                                return (
                                  <BoardTile
                                    key={ti}
                                    code={t.tile}
                                    kind="meld"
                                    lay={ti === 0}
                                    review={needsReview(t)}
                                    selected={sel?.kind === "edit" && fkey(sel.loc) === fkey(loc)}
                                    label={`${wind}家の鳴き`}
                                    onClick={(e) => openEdit(e, loc, t.tile)}
                                  />
                                );
                              })}
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
        </div>

        <aside className={s.rail} onClick={(e) => e.stopPropagation()}>
          {/* 半荘 */}
          <section className={s.navsec}>
            <button
              className={`${s.accHead} ${open.han ? s.accHeadOpen : ""}`}
              aria-expanded={open.han}
              onClick={() => acc("han")}
            >
              <svg className={s.arr} viewBox="0 0 12 12">
                <path d="M4 2l5 4-5 4" />
              </svg>
              半荘
            </button>
            {open.han && (
              <div className={s.accBody}>
                <div className={s.roundwrap}>
                  <div className={s.roundnav}>
                    <button
                      className={s.arrow}
                      disabled={idx === 0}
                      aria-label="前の局"
                      onClick={() => p.onSwitch(idx - 1)}
                    >
                      <svg viewBox="0 0 16 16">
                        <path d="M10 3L6 8l4 5" />
                      </svg>
                    </button>
                    <button
                      className={s.roundlbl}
                      onClick={() => setRoundMenu((v) => !v)}
                      aria-expanded={roundMenu}
                    >
                      {round} <small>{honba}本場</small>
                      <svg className={s.caret} viewBox="0 0 12 12">
                        <path d="M3 5l3 3 3-3" />
                      </svg>
                    </button>
                    <button
                      className={s.arrow}
                      disabled={idx >= detail.logs.length - 1}
                      aria-label="次の局"
                      onClick={() => p.onSwitch(idx + 1)}
                    >
                      <svg viewBox="0 0 16 16">
                        <path d="M6 3l4 5-4 5" />
                      </svg>
                    </button>
                  </div>
                  {roundMenu && (
                    <div className={s.roundMenu}>
                      {detail.logs.map((l, i) => (
                        <button
                          key={l.id}
                          className={`${s.roundItem} ${i === idx ? s.on : ""}`}
                          onClick={() => {
                            p.onSwitch(i);
                            setRoundMenu(false);
                          }}
                        >
                          {roundName(i)}
                          <small>第{l.seq}局</small>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className={s.kyakuAct}>
                  <button className={s.addkyoku} onClick={() => setAddOpen(true)}>
                    ＋ 局の追加
                  </button>
                  <button
                    className={`${s.delkyoku} ${delArm ? s.arm : ""}`}
                    disabled={detail.logs.length <= 1}
                    onClick={() => void onDelete()}
                  >
                    {delArm ? "もう一度押して削除" : "この局を削除"}
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* 局情報 */}
          <section className={s.navsec}>
            <button
              className={`${s.accHead} ${open.info ? s.accHeadOpen : ""}`}
              aria-expanded={open.info}
              onClick={() => acc("info")}
            >
              <svg className={s.arr} viewBox="0 0 12 12">
                <path d="M4 2l5 4-5 4" />
              </svg>
              局情報
            </button>
            {open.info && (
              <div className={s.accBody}>
                <div className={s.steprow}>
                  <span className={s.stlabel}>親</span>
                  <div className={s.agsel}>
                    <select
                      className={s.sel2}
                      value={dealer}
                      onChange={(e) => setDealerSeat(e.target.value as Seat)}
                      aria-label="親"
                    >
                      {SEAT_ORDER.map((seat) => (
                        <option key={seat} value={seat}>
                          {windOf(seat, dealer)}家
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <Stepper label="巡目" unit="巡" value={junme} min={1} max={30} set={setJunme} />
                <Stepper label="本場" unit="本場" value={honba} min={0} max={19} set={setHonba} />
                <Stepper label="供託" unit="本" value={kyotaku} min={0} max={9} set={setKyotaku} />
                <div className={s.steprow}>
                  <span className={s.stlabel}>ドラ</span>
                  <button className={s.doraPick} aria-label="ドラを選ぶ" onClick={openDora}>
                    <DoraGlyph code={dora} />
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* 和了 */}
          <section className={s.navsec}>
            <button
              className={`${s.accHead} ${open.agari ? s.accHeadOpen : ""}`}
              aria-expanded={open.agari}
              onClick={() => acc("agari")}
            >
              <svg className={s.arr} viewBox="0 0 12 12">
                <path d="M4 2l5 4-5 4" />
              </svg>
              和了
            </button>
            {open.agari && (
              <div className={s.accBody}>
                {SEAT_ORDER.map((seat) => (
                  <div key={seat} className={s.agrow}>
                    <span className={s.agname}>{windOf(seat, dealer)}家</span>
                    <div className={s.agsel}>
                      <select
                        className={s.sel2}
                        value={results[seat]}
                        onChange={(e) => setResults((r) => ({ ...r, [seat]: e.target.value }))}
                        aria-label={`${windOf(seat, dealer)}家の結果`}
                      >
                        {RESULTS.map((r) => (
                          <option key={r} value={r}>
                            {r || "—"}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ポイント */}
          <section className={s.navsec}>
            <button
              className={`${s.accHead} ${showPoints ? s.accHeadOpen : ""}`}
              aria-expanded={showPoints}
              onClick={() => setShowPoints((v) => !v)}
            >
              <svg className={s.arr} viewBox="0 0 12 12">
                <path d="M4 2l5 4-5 4" />
              </svg>
              ポイント
            </button>
            {showPoints && (
              <div className={s.accBody}>
                {SEAT_ORDER.map((seat) => (
                  <div key={seat} className={s.agrow}>
                    <input
                      className={s.field}
                      style={{ flex: 1, minWidth: 0 }}
                      value={names[seat]}
                      placeholder={`${windOf(seat, dealer)}家`}
                      aria-label="選手名"
                      onChange={(e) => setNames((n) => ({ ...n, [seat]: e.target.value }))}
                    />
                    <input
                      type="number"
                      step="0.1"
                      value={points[seat]}
                      aria-label="ポイント"
                      style={{
                        width: 72,
                        background: "transparent",
                        border: 0,
                        borderBottom: "1px solid var(--line)",
                        color: "var(--orange)",
                        fontWeight: 700,
                        fontSize: 14,
                        textAlign: "right",
                        fontFamily: "var(--round)",
                      }}
                      onChange={(e) => setPoints((pt) => ({ ...pt, [seat]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 基本情報 */}
          <section className={s.navsec} style={{ borderBottom: 0 }}>
            <button
              className={`${s.accHead} ${open.basic ? s.accHeadOpen : ""}`}
              aria-expanded={open.basic}
              onClick={() => acc("basic")}
            >
              <svg className={s.arr} viewBox="0 0 12 12">
                <path d="M4 2l5 4-5 4" />
              </svg>
              基本情報
            </button>
            {open.basic && (
              <div className={s.accBody}>
                <div className={s.field}>
                  <label>半荘名</label>
                  <input value={hanchanName} onChange={(e) => setHanchanName(e.target.value)} />
                </div>
                <div className={s.field}>
                  <label>日付</label>
                  <input
                    type="date"
                    value={dateInput}
                    onChange={(e) => setDateInput(e.target.value)}
                  />
                </div>
                <div className={s.field}>
                  <label>公開範囲</label>
                  <div className={s.seg} role="group" aria-label="公開範囲">
                    <button
                      aria-pressed={vis === "private"}
                      disabled={visBusy}
                      onClick={() => toggleVis("private")}
                    >
                      非公開
                    </button>
                    <button
                      aria-pressed={vis === "public"}
                      disabled={visBusy}
                      onClick={() => toggleVis("public")}
                    >
                      公開
                    </button>
                  </div>
                </div>
                {vis === "public" && (
                  <>
                    <div className={s.shareUrl}>
                      <span className={s.url}>{shareUrl}</span>
                      <button
                        className={s.copyurl}
                        aria-label="URLをコピー"
                        onClick={() => navigator.clipboard?.writeText(shareUrl).catch(() => {})}
                      >
                        <svg viewBox="0 0 24 24">
                          <rect x="9" y="9" width="11" height="11" rx="2" />
                          <path d="M5 15V5a2 2 0 0 1 2-2h10" />
                        </svg>
                      </button>
                    </div>
                    <p className={s.visNote}>
                      <Link href={`/k/${gameId}`} style={{ color: "#fff" }}>
                        公開ページを見る →
                      </Link>
                    </p>
                  </>
                )}
                <p className={s.visNote}>
                  公開すると共有URLで誰でも閲覧できます（{visibilityLabel(vis)}）。
                </p>
              </div>
            )}
          </section>
        </aside>
      </div>

      {pop && (
        <div
          className={s.tilepop}
          style={{ left: pop.x, top: pop.y }}
          role="dialog"
          aria-label="牌を選ぶ"
          onClick={(e) => e.stopPropagation()}
        >
          <div className={s.tabs}>
            {SUITS.map((su) => (
              <button
                key={su.suit}
                className={suit === su.suit ? s.on : ""}
                onClick={() => setSuit(su.suit)}
              >
                {su.label}
              </button>
            ))}
          </div>
          <div className={s.pgrid}>
            {NUMS[suit].map((code) => (
              <button key={code} className={s.pk} onClick={() => applyTile(code)}>
                <span className={s.tile}>
                  <OssTileFace code={code} />
                </span>
              </button>
            ))}
          </div>
          {sel?.kind === "edit" && sel.loc.area !== "meld" && (
            <div className={s.meldEdit}>
              {sel.loc.area === "river" && (
                <div className={s.meRow}>
                  <span className={s.meLabel}>捨て方</span>
                  <div className={s.meSeg}>
                    {(
                      [
                        [false, "手出し"],
                        [true, "自摸切り"],
                      ] as const
                    ).map(([tg, lbl]) => (
                      <button
                        key={lbl}
                        className={
                          (kifu.seats[sel.loc.seat].river[sel.loc.index]?.tsumogiri ?? false) === tg
                            ? s.on
                            : ""
                        }
                        onClick={() => setDiscardKind(tg)}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className={s.meRow}>
                <span className={s.meLabel}>鳴き</span>
                <div className={s.meSeg}>
                  {(["none", "chi", "pon", "kan"] as const).map((mt) => (
                    <button
                      key={mt}
                      className={meldType === mt ? s.on : ""}
                      onClick={() => setMeldType(mt)}
                    >
                      {{ none: "なし", chi: "チー", pon: "ポン", kan: "カン" }[mt]}
                    </button>
                  ))}
                </div>
              </div>
              {meldType !== "none" && (
                <>
                  <div className={s.meRow}>
                    <span className={s.meLabel}>鳴いた人</span>
                    <div className={s.meSeg}>
                      {(
                        [
                          ["bottom", "あなた"],
                          ["right", "下家"],
                          ["top", "対面"],
                          ["left", "上家"],
                        ] as const
                      ).map(([w, lbl]) => (
                        <button
                          key={w}
                          className={meldWho === w ? s.on : ""}
                          onClick={() => setMeldWho(w)}
                        >
                          {lbl}
                        </button>
                      ))}
                    </div>
                  </div>
                  {meldType === "kan" && (
                    <div className={s.meRow}>
                      <span className={s.meLabel}>種類</span>
                      <div className={s.meSeg}>
                        {(
                          [
                            ["minkan", "大明槓"],
                            ["ankan", "暗槓"],
                            ["kakan", "加槓"],
                          ] as const
                        ).map(([k, lbl]) => (
                          <button
                            key={k}
                            className={kanType === k ? s.on : ""}
                            onClick={() => setKanType(k)}
                          >
                            {lbl}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <p className={s.meHint}>牌を選ぶと鳴きを作成します</p>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {addOpen && (
        <AddKyokuModal
          token={token}
          gameId={gameId}
          bottomSeat={bottomSeat}
          onClose={() => setAddOpen(false)}
          onDone={async (newLogId) => {
            setAddOpen(false);
            await p.reload(newLogId);
          }}
        />
      )}
    </div>
  );
}

export default BoardEditor;
