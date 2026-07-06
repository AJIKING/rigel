"use client";

import { toAbsoluteSeat, type CameraSeat, type Kifu, type Seat, type Tile } from "@rigel/schema";
import {
  applyResultMode,
  applyTileEdit,
  deriveWinResult,
  mutateKifu,
  removeDoraTile,
  resultModeOf,
  setDoraTile,
  visibilityLabel,
  LIMIT_MESSAGES,
  type TileLocation,
} from "@rigel/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import {
  deleteGameAction,
  deleteKifuAction,
  getGameAction,
  setGameVisibilityAction,
  updateGameAction,
  updateGameRulesAction,
  updateKifuAction,
} from "../../app/actions";
import { type GameDetail, type GameLog } from "../../lib/api";
import { SEAT_ORDER, meldTiles, popAnchor, roundName, windOf, type Suit } from "../../lib/board";
import { useBoardScale } from "../../lib/use-board-scale";
import { AddKyokuModal } from "./AddKyokuModal";
import { AgariEditor, DrawEditor } from "./AgariEditor";
import { BoardTable } from "./BoardTable";
import { RulesDialog } from "./RulesDialog";
import { Stepper } from "./Stepper";
import { TimelineEditor } from "./TimelineEditor";
import { TilePickerPopup, type KanType, type MeldType } from "./TilePickerPopup";
import { fkey, type Selection } from "./shared";
import { DoraGlyph } from "./tiles";
import s from "./board-editor.module.css";

/** ゲート（認証確認中・未ログイン・エラー・データ取得中）用のダーク全画面シェル。
 *  盤面と同じ地色（themeBoard の .app）で、白画面フラッシュを出さない。 */
function GateShell({ children }: { children?: React.ReactNode }) {
  return (
    <div
      className={`${s.app} themeBoard`}
      style={{ display: "grid", placeItems: "center", padding: 24 }}
    >
      {children}
    </div>
  );
}

/** 局情報のドラ/裏ドラ1行（複数枚）。牌クリックで変更、✕で削除、＋で追加（最大5枚）。 */
function DoraNavRow({
  label,
  tiles,
  onOpen,
  onRemove,
}: {
  label: string;
  tiles: Tile[];
  /** index あり=その1枚の変更、無し=追加。 */
  onOpen: (e: React.MouseEvent, index?: number) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className={s.steprow}>
      <span className={s.stlabel}>{label}</span>
      <span style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
        {tiles.map((t, i) => (
          <span key={`${t}-${i}`} style={{ display: "inline-flex", alignItems: "center" }}>
            <button
              className={s.doraPick}
              aria-label={`${label}${i + 1}を変更`}
              onClick={(e) => onOpen(e, i)}
            >
              <DoraGlyph code={t} />
            </button>
            <button
              aria-label={`${label}${i + 1}を削除`}
              onClick={() => onRemove(i)}
              style={{
                background: "none",
                border: "none",
                color: "var(--vermilion)",
                cursor: "pointer",
                fontSize: 12,
                padding: "0 2px",
              }}
            >
              ✕
            </button>
          </span>
        ))}
        {tiles.length < 5 && (
          <button
            className={s.doraPick}
            aria-label={`${label}を追加`}
            onClick={(e) => onOpen(e, undefined)}
          >
            <DoraGlyph code={null} />
          </button>
        )}
      </span>
    </div>
  );
}

/** ヘッダのセグメント切替（盤面/手順・下書き/編集済 で共用）。 */
function Seg<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className={s.statusSeg} role="group" aria-label={label}>
      {options.map(([v, l]) => (
        <button
          key={v}
          className={value === v ? s.on : ""}
          aria-pressed={value === v}
          onClick={(e) => {
            e.stopPropagation();
            onChange(v);
          }}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

/**
 * 盤面エディタ（クライアント）。認証・初期データ取得は Server Component
 * （app/kifu/[gameId]/[logId]/page.tsx）が Cookie セッションで済ませ、正規化済みの
 * `initialDetail` を props で渡す。ここは対話・編集・保存だけを担う（トークンは持たない）。
 */
export function BoardEditor({
  initialDetail,
  gameId,
  logId,
}: {
  initialDetail: GameDetail;
  gameId: string;
  logId: string;
}) {
  const [detail, setDetail] = useState<GameDetail>(initialDetail);
  const startIdx = Math.max(
    0,
    initialDetail.logs.findIndex((l) => l.id === logId),
  );
  const [idx, setIdx] = useState(startIdx);
  const [kifu, setKifu] = useState<Kifu | null>(initialDetail.logs[startIdx]?.kifu ?? null);

  // 局の追加/削除後の再取得。Server Action が Cookie を読んで取り直す（正規化済み）。
  const reload = useCallback(
    async (focus?: string) => {
      const nd = await getGameAction(gameId).catch(() => null);
      if (!nd) return;
      setDetail(nd);
      const want = focus ?? logId;
      const i = Math.max(
        0,
        nd.logs.findIndex((l) => l.id === want),
      );
      setIdx(i);
      setKifu(nd.logs[i]?.kifu ?? null);
    },
    [gameId, logId],
  );

  const log = detail.logs[idx];
  if (!log || !kifu)
    return (
      <GateShell>
        <p style={{ color: "var(--w70)" }}>
          この半荘には局がありません。<Link href="/kifu">牌譜一覧へ</Link>
        </p>
      </GateShell>
    );

  return (
    <Editor
      key={log.id}
      detail={detail}
      idx={idx}
      log={log}
      kifu={kifu}
      setKifu={setKifu}
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
  gameId: string;
  onSwitch: (i: number) => void;
  reload: (focus?: string) => Promise<void>;
}

function Editor(p: EditorProps) {
  const { detail, idx, log, kifu, setKifu, gameId } = p;
  const router = useRouter();
  const bottomSeat: Seat = kifu.cameraBottomSeat ?? "east";
  const dealer: Seat = kifu.meta.dealer ?? bottomSeat;

  // 局メタ（本場/供託/ドラ/裏ドラ）は kifu.meta から読み、変更は mutate で書き戻して保存に乗せる。
  const honba = kifu.meta.honba;
  const kyotaku = kifu.meta.kyotaku;
  const dora = kifu.meta.dora;
  const uraDora = kifu.meta.uraDora;
  const setMeta =
    <K extends keyof Kifu["meta"]>(key: K) =>
    (v: Kifu["meta"][K]) =>
      mutate((d) => {
        d.meta[key] = v;
      });
  const setHonba = setMeta("honba");
  const setKyotaku = setMeta("kyotaku");

  const [sel, setSel] = useState<Selection>(null);
  const [pop, setPop] = useState<{ x: number; y: number } | null>(null);
  const [suit, setSuit] = useState<Suit>("m");
  const [flashKey, setFlashKey] = useState<string | null>(null);
  const [meldType, setMeldType] = useState<MeldType>("none");
  const [meldWho, setMeldWho] = useState<CameraSeat>("bottom");
  const [kanType, setKanType] = useState<KanType>("minkan");

  const [save, setSave] = useState<"idle" | "saving" | "done">("idle");
  const [saveErr, setSaveErr] = useState<string | null>(null);
  // 編集モード：盤面（席ごと直接編集）/ 手順（タイムライン）。
  const [tab, setTab] = useState<"board" | "timeline">("board");
  // 編集状態（下書き/編集済）。保存ボタン左のトグルで切り替え、保存時に送る。
  const [status, setStatus] = useState(log.status);
  const [vis, setVis] = useState(log.visibility);
  const [visBusy, setVisBusy] = useState(false);
  const [hanchanName, setHanchanName] = useState(detail.game.title || "");
  const [delGameArm, setDelGameArm] = useState(false);
  const [dateInput, setDateInput] = useState(
    new Date(detail.game.createdAt).toISOString().slice(0, 10),
  );
  const [roundMenu, setRoundMenu] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
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
  function openDoraPicker(e: React.MouseEvent, kind: "dora" | "uradora", index?: number) {
    e.stopPropagation();
    const tiles = kind === "dora" ? dora : uraDora;
    const cur = index !== undefined ? tiles[index] : tiles[tiles.length - 1];
    setSel({ kind, index });
    setSuit((cur?.[1] as Suit) ?? "z");
    setMeldType("none");
    setPop(popAnchor((e.currentTarget as HTMLElement).getBoundingClientRect()));
  }

  function flash(loc: TileLocation) {
    const k = fkey(loc);
    setFlashKey(k);
    setTimeout(() => setFlashKey((c) => (c === k ? null : c)), 480);
  }

  // Kifu を不変更新する共通ヘルパ（@rigel/ui の mutateKifu = 複製→変更→Zod 再検証）。
  function mutate(fn: (draft: Kifu) => void) {
    setKifu(mutateKifu(kifu, fn));
  }

  function applyTile(code: Tile) {
    if (!sel) return;
    if (sel.kind === "dora" || sel.kind === "uradora") {
      // index あり=その1枚を差し替え、無し=追加（複数ドラ＝カン対応。@rigel/ui の共有純関数）。
      setKifu(setDoraTile(kifu, sel.kind === "dora" ? "dora" : "uraDora", code, sel.index));
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
    setSaveErr(null);
    const res = await updateKifuAction(log.id, kifu, status).catch(() => ({
      ok: false,
      status: 0,
    }));
    setSave(res.ok ? "done" : "idle");
    if (res.ok) {
      setTimeout(() => setSave("idle"), 1500);
    } else if (res.status === 403) {
      setSaveErr(status === "complete" ? LIMIT_MESSAGES.privateGames : LIMIT_MESSAGES.draftGames);
    } else {
      setSaveErr("保存に失敗しました。");
    }
  }
  /** 半荘名を保存する（入力欄の blur で呼ぶ。未変更なら何もしない）。 */
  async function saveHanchanName() {
    const title = hanchanName.trim();
    if (title === (detail.game.title || "")) return;
    const res = await updateGameAction(gameId, { title }).catch(() => ({ ok: false, status: 0 }));
    if (!res.ok) setSaveErr("半荘名の保存に失敗しました。");
  }

  /** 半荘を配下の全局ごと削除する（2度押しで確定＝誤操作防止）。成功で一覧へ戻る。 */
  async function onDeleteGame() {
    if (!delGameArm) {
      setDelGameArm(true);
      setTimeout(() => setDelGameArm(false), 3000);
      return;
    }
    const res = await deleteGameAction(gameId).catch(() => ({ ok: false, status: 0 }));
    if (res.ok) router.push("/kifu");
    else setSaveErr("半荘の削除に失敗しました。");
  }

  /** 公開/非公開は半荘単位（配下の全局に一括反映）。局ごとには選ばない。 */
  async function toggleVis(next: "public" | "private") {
    if (next === vis || visBusy) return;
    setVisBusy(true);
    const res = await setGameVisibilityAction(gameId, next).catch(() => ({ ok: false, status: 0 }));
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

  // リーチ宣言牌（横向き）を切り替える。
  function setDiscardRiichi(riichi: boolean) {
    if (sel?.kind !== "edit" || sel.loc.area !== "river") return;
    const loc = sel.loc;
    mutate((d) => {
      const discard = d.seats[loc.seat].river[loc.index];
      if (discard) discard.riichi = riichi;
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
    const res = await deleteKifuAction(log.id).catch(() => ({ ok: false, status: 0 }));
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
        {/* 盤面 / 手順 タブ切替。 */}
        <Seg
          value={tab}
          options={[
            ["board", "盤面"],
            ["timeline", "手順"],
          ]}
          onChange={setTab}
          label="編集モード"
        />
        {saveErr && <span className={s.saveErr}>{saveErr}</span>}
        {/* 保存ボタンの左：下書き / 編集済み トグル。 */}
        <Seg
          value={status}
          options={[
            ["draft", "下書き"],
            ["complete", "編集済"],
          ]}
          onChange={setStatus}
          label="編集状態"
        />
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
        <BoardTable
          kifu={kifu}
          bottomSeat={bottomSeat}
          dealer={dealer}
          scale={scale}
          mainRef={mainRef}
          sel={sel}
          flashKey={flashKey}
          names={names}
          showPoints={showPoints}
          points={points}
          honba={honba}
          kyotaku={kyotaku}
          round={round}
          dora={dora}
          onOpenEdit={openEdit}
          onOpenAdd={openAdd}
        />

        {tab === "timeline" && (
          <TimelineEditor kifu={kifu} dealer={dealer} names={names} onChange={(k) => setKifu(k)} />
        )}

        {tab === "board" && (
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
                    <button className={s.addkyoku} onClick={() => setRulesOpen(true)}>
                      ⚙ ルール設定
                    </button>
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
                  {/* 最終巡目の入力は撤去（記録のみで不要。mobile と同一方針）。 */}
                  <Stepper label="本場" unit="本場" value={honba} min={0} max={19} set={setHonba} />
                  <Stepper
                    label="供託"
                    unit="本"
                    value={kyotaku}
                    min={0}
                    max={9}
                    set={setKyotaku}
                  />
                  <DoraNavRow
                    label="ドラ"
                    tiles={dora}
                    onOpen={(e, i) => openDoraPicker(e, "dora", i)}
                    onRemove={(i) => setKifu(removeDoraTile(kifu, "dora", i))}
                  />
                  <DoraNavRow
                    label="裏ドラ"
                    tiles={uraDora}
                    onOpen={(e, i) => openDoraPicker(e, "uradora", i)}
                    onRemove={(i) => setKifu(removeDoraTile(kifu, "uraDora", i))}
                  />
                </div>
              )}
            </section>

            {/* 結果（なし/和了/流局）。導出・切替は @rigel/ui の共有ロジック（mobile と同一挙動）。 */}
            <section className={s.navsec}>
              <button
                className={`${s.accHead} ${open.agari ? s.accHeadOpen : ""}`}
                aria-expanded={open.agari}
                onClick={() => acc("agari")}
              >
                <svg className={s.arr} viewBox="0 0 12 12">
                  <path d="M4 2l5 4-5 4" />
                </svg>
                結果
              </button>
              {open.agari && (
                <div className={s.accBody}>
                  <div className={s.field}>
                    <div className={s.seg} role="group" aria-label="結果">
                      {(
                        [
                          ["none", "なし"],
                          ["win", "和了"],
                          ["draw", "流局"],
                        ] as const
                      ).map(([mode, label]) => (
                        <button
                          key={mode}
                          aria-pressed={resultModeOf(kifu) === mode}
                          onClick={() => setKifu(applyResultMode(kifu, mode, dealer))}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {resultModeOf(kifu) === "win" && (
                    <AgariEditor
                      kifu={kifu}
                      dealer={dealer}
                      onChange={(agaris) =>
                        mutate((d) => {
                          d.agari = agaris;
                          // result(ロン/ツモ) は和了配列から導出して常に同期する。
                          d.result = deriveWinResult(agaris);
                        })
                      }
                    />
                  )}
                  {resultModeOf(kifu) === "draw" && (
                    <DrawEditor
                      tenpai={kifu.tenpai}
                      dealer={dealer}
                      onChange={(tenpai) =>
                        mutate((d) => {
                          d.tenpai = tenpai;
                        })
                      }
                    />
                  )}
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
                    <input
                      value={hanchanName}
                      aria-label="半荘名"
                      onChange={(e) => setHanchanName(e.target.value)}
                      onBlur={() => void saveHanchanName()}
                    />
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
                  <button
                    className={`${s.delkyoku} ${delGameArm ? s.arm : ""}`}
                    onClick={() => void onDeleteGame()}
                  >
                    {delGameArm ? "もう一度押して削除" : "この半荘を削除（全局）"}
                  </button>
                </div>
              )}
            </section>
          </aside>
        )}
      </div>

      {pop && (
        <TilePickerPopup
          pos={pop}
          suit={suit}
          setSuit={setSuit}
          sel={sel}
          kifu={kifu}
          meldType={meldType}
          setMeldType={setMeldType}
          meldWho={meldWho}
          setMeldWho={setMeldWho}
          kanType={kanType}
          setKanType={setKanType}
          bottomSeat={bottomSeat}
          dealer={dealer}
          names={names}
          onApplyTile={applyTile}
          onSetDiscardKind={setDiscardKind}
          onSetDiscardRiichi={setDiscardRiichi}
          onClose={closePop}
        />
      )}

      {addOpen && (
        <AddKyokuModal
          gameId={gameId}
          bottomSeat={bottomSeat}
          onClose={() => setAddOpen(false)}
          onDone={async (newLogId) => {
            setAddOpen(false);
            await p.reload(newLogId);
          }}
        />
      )}

      {rulesOpen && (
        <RulesDialog
          rules={kifu.rules}
          onClose={() => setRulesOpen(false)}
          onSave={(r) => {
            // ルールは半荘単位（配下の全局へ一括反映）。ローカル表示も同期する。
            void updateGameRulesAction(gameId, r)
              .then((res) => {
                if (!res.ok) setSaveErr("ルールの保存に失敗しました。");
              })
              .catch(() => setSaveErr("通信に失敗しました。"));
            mutate((d) => {
              d.rules = r;
            });
            setRulesOpen(false);
          }}
        />
      )}
    </div>
  );
}

export default BoardEditor;
