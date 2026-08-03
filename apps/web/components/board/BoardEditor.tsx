"use client";

import {
  dealerForSeq,
  toAbsoluteSeat,
  type CameraSeat,
  type Kifu,
  type Seat,
  type Tile,
} from "@rigel/schema";
import {
  addHandTile,
  addRiverTile,
  applyResultMode,
  applyTileEdit,
  callDiscard,
  discardCallOf,
  deriveWinResult,
  mutateKifu,
  reconcileTimeline,
  removeDoraTile,
  removeHandTile,
  removeMeld,
  removeRiverTile,
  resultModeOf,
  setDoraTile,
  sortKifuHands,
  visibilityLabel,
  deleteConfirmText,
  DELETE_CONFIRM,
  LIMIT_MESSAGES,
  MAX_SEQ,
  type TileLocation,
} from "@rigel/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { BrandMark } from "../BrandMark";
import {
  deleteGameAction,
  deleteKifuAction,
  getGameAction,
  setGameStatusAction,
  setGameVisibilityAction,
  updateGameAction,
  updateGameRulesAction,
  updateKifuAction,
} from "../../app/actions";
import { type GameDetail, type GameLog } from "../../lib/api";
import { usePlayersForm } from "./use-players-form";
import {
  SEAT_ORDER,
  cameraSeatOf,
  handIndexAfterEdit,
  meldTiles,
  popAnchor,
  shimochaOf,
  roundHonbaLabel,
  roundNameForSeq,
  windOf,
  type Suit,
} from "../../lib/board";
import { useBoardScale } from "../../lib/use-board-scale";
import { AddKyokuModal } from "./AddKyokuModal";
import { AgariEditor, DrawEditor } from "./AgariEditor";
import { BoardTable } from "./BoardTable";
import { GamePhotosModal } from "./GamePhotosModal";
import { RulesDialog } from "./RulesDialog";
import { Stepper } from "./Stepper";
import { TimelineEditor } from "./TimelineEditor";
import { TilePickerPopup, type KanType, type MeldType } from "./TilePickerPopup";
import { fkey, type Selection } from "./shared";
import { DoraNavRow, GateShell, Seg } from "./BoardEditorParts";
import s from "./board-editor.module.css";

function normalizeKifu(k: Kifu | null | undefined): Kifu | null {
  return k ? sortKifuHands(k) : null;
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
  const [kifu, setKifu] = useState<Kifu | null>(() =>
    normalizeKifu(initialDetail.logs[startIdx]?.kifu),
  );

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
      setKifu(normalizeKifu(nd.logs[i]?.kifu));
    },
    [gameId, logId],
  );

  const log = detail.logs[idx];
  if (!log || !kifu)
    return (
      <GateShell>
        <p style={{ color: "var(--w70)" }}>
          この半荘には局がありません。<Link href="/mypage">マイページへ</Link>
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
        setKifu(normalizeKifu(detail.logs[i]?.kifu));
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
  const cameraSeat: Seat = kifu.cameraBottomSeat ?? "east";
  const dealer: Seat = kifu.meta.dealer ?? cameraSeat;
  // 視点席（手前に置く席）。既定 null=親が手前（局が進んで親が移っても親を手前に保つ）。
  // ネームプレート押下で任意の席へ切替（ビューアと同じ操作）。局を跨いでも保つ。
  const [povSeat, setPovSeat] = useState<Seat | null>(null);
  const bottomSeat: Seat = povSeat ?? dealer;

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
  // チーの並び（選んだ順子。null=自動）。ピッカーの「並び」行で選ぶ。
  const [chiRun, setChiRun] = useState<Tile[] | null>(null);
  // 河への追加時に「これから追加する牌」へ適用する捨て方/リーチ（追加ピッカーで選ぶ）。
  const [addTsumogiri, setAddTsumogiri] = useState(false);
  const [addRiichi, setAddRiichi] = useState(false);

  const [save, setSave] = useState<"idle" | "saving" | "done">("idle");
  const [saveErr, setSaveErr] = useState<string | null>(null);
  // 編集モード：盤面（席ごと直接編集）/ 手順（タイムライン）。
  const [tab, setTab] = useState<"board" | "timeline">("board");
  // 編集状態（下書き/編集済）。保存ボタン左のトグルで切り替え、保存時に送る。
  const [status, setStatus] = useState(log.status);
  const [vis, setVis] = useState(log.visibility);
  const [visBusy, setVisBusy] = useState(false);
  const [hanchanName, setHanchanName] = useState(detail.game.title || "");
  const [dateInput, setDateInput] = useState(
    new Date(detail.game.createdAt).toISOString().slice(0, 10),
  );
  const [roundMenu, setRoundMenu] = useState(false);
  // 局順（東一局=1〜北四局=16）。作成後も変更できる（保存時に kifu と一緒に送る）。
  // Editor は key={log.id} で局ごとに再マウントされるため、初期値は log.seq で足りる。
  // 旧自動採番の seq>16 は北四局へ丸める（API が seq>16 を拒否し保存不能になるため）。
  const [seqValue, setSeqValue] = useState(Math.min(Math.max(1, log.seq), MAX_SEQ));
  const [addOpen, setAddOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [photosOpen, setPhotosOpen] = useState(false);
  // 選手情報（選手名・リーグ戦ポイント）。kifu.players（半荘単位）から初期化し、
  // 入力の blur で半荘単位に保存する（rules と同じ全局一括反映）。
  // Players→入力文字列は共有ヘルパ playersToInput（mobile の PlayersSheet と同一）。
  // 選手情報（名前・持ちポイント）はフックへ切り出し（半荘単位・blur 保存で関心が別）。
  const players = usePlayersForm({
    gameId,
    initialPlayers: log.kifu.players,
    mutate,
    onError: setSaveErr,
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
    setChiRun(null);
  }, []);

  function openEdit(e: React.MouseEvent, loc: TileLocation, code: Tile | null) {
    setSel({ kind: "edit", loc });
    setSuit((code?.[1] as Suit) ?? "m");
    if (loc.area === "river") {
      // 既に鳴かれている捨て牌なら選択状態（種別・鳴いた人・チーの並び）を復元する。
      // 未鳴きの既定: 鳴き主=下家（捨てた本人が既定になるのを防ぐ）。
      const existing = discardCallOf(kifu, loc.seat, loc.index);
      setMeldType(existing?.type ?? "none");
      setChiRun(existing?.chiRun ?? null);
      setMeldWho(cameraSeatOf(existing?.caller ?? shimochaOf(loc.seat), bottomSeat));
    } else {
      setMeldType("none");
      setChiRun(null);
    }
    setPop(popAnchor((e.currentTarget as HTMLElement).getBoundingClientRect()));
  }
  function openAdd(e: React.MouseEvent, seat: Seat, area: "hand" | "river") {
    e.stopPropagation();
    setSel({ kind: "add", seat, area });
    setSuit("m");
    setMeldType("none");
    setChiRun(null);
    // 追加する牌のフラグは毎回リセット。鳴き（配牌側のみ）の既定の鳴き主は追加先の席。
    setAddTsumogiri(false);
    setAddRiichi(false);
    setMeldWho(cameraSeatOf(seat, bottomSeat));
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
    // 鳴き種別が選ばれていれば、追加/編集どちらのピッカーからでも鳴きを作成する。
    if (meldType !== "none" && (sel.kind === "add" || sel.loc.area !== "meld")) {
      const owner = toAbsoluteSeat(meldWho, bottomSeat);
      // 捨て牌を鳴く（河の牌の編集時）: 鳴き牌・from・calledBy は捨て牌から自動で
      // 結線し、選んだ牌は「鳴いた人がその後に切った牌」として鳴きの直後に入る
      //（共有純関数。既に鳴かれている捨て牌なら置き換え）。
      if (sel.kind === "edit" && sel.loc.area === "river") {
        setKifu(
          callDiscard(kifu, sel.loc.seat, sel.loc.index, {
            caller: owner,
            type: meldType,
            chiRun,
            discardTile: code,
          }),
        );
        closePop();
        return;
      }
      // 配牌側（手牌）からの鳴き: 鳴き元は不明（from=null）。カンは種類を選べる。
      const kanMap = { minkan: "kan_open", ankan: "kan_closed", kakan: "kan_added" } as const;
      const type = meldType === "chi" ? "chi" : meldType === "pon" ? "pon" : kanMap[kanType];
      // チーは「並び」で選んだ順子を優先（選んだ牌を含むときだけ。それ以外は従来の自動）。
      const tiles =
        meldType === "chi" && chiRun && chiRun.includes(code) ? chiRun : meldTiles(meldType, code);
      // 鳴きを seats に足したあと、timeline が非空なら同期（reconcileTimeline は空なら no-op）。
      setKifu(
        reconcileTimeline(
          mutateKifu(kifu, (d) => {
            d.seats[owner].melds.push({
              type,
              tiles: tiles.map((t) => ({ tile: t })),
              from: null,
            });
          }),
        ),
      );
      closePop();
      return;
    }
    if (sel.kind === "add") {
      const { seat, area } = sel;
      if (area === "hand") {
        // 配牌への追加は理牌込みの共有純関数（mobile と同一挙動）。
        setKifu(addHandTile(kifu, seat, code));
      } else {
        // 追加ピッカーで選んだ捨て方/リーチをそのまま乗せる（timeline も同期＝共有純関数）。
        setKifu(addRiverTile(kifu, seat, code, { riichi: addRiichi, tsumogiri: addTsumogiri }));
      }
      closePop();
      return;
    }
    const loc = sel.loc;
    setKifu(applyTileEdit(kifu, loc, code));
    // 手牌は理牌で位置が動くので、動いた先を追ってフラッシュする。
    flash(loc.area === "hand" ? { ...loc, index: handIndexAfterEdit(kifu, loc, code) } : loc);
    closePop();
  }

  /** ピッカーからの削除。手牌/河は1牌（河は order を振り直す共有純関数）、鳴きは丸ごと。
   *  mobile の TilePickerSheet「削除」・鳴き行「削除」と同等の操作。 */
  function deleteSelected() {
    if (sel?.kind !== "edit") return;
    const loc = sel.loc;
    if (loc.area === "hand") setKifu(removeHandTile(kifu, loc.seat, loc.index));
    else if (loc.area === "river") setKifu(removeRiverTile(kifu, loc.seat, loc.index));
    else setKifu(removeMeld(kifu, loc.seat, loc.meldIndex ?? 0));
    closePop();
  }

  /** 局順の変更。親は局順に連動して直す（導出は schema の dealerForSeq＝api の作成時と共通）。
   *  局順を直せば親マーク・風表記・手前席（親手前の既定）も追随する。確定は保存ボタン。 */
  function changeSeq(n: number) {
    setSeqValue(n);
    mutate((d) => {
      d.meta.dealer = dealerForSeq(n);
    });
  }

  async function onSave() {
    setSave("saving");
    setSaveErr(null);
    const res = await updateKifuAction(log.id, kifu, seqValue).catch(() => ({
      ok: false,
      status: 0,
    }));
    setSave(res.ok ? "done" : "idle");
    if (res.ok) {
      setTimeout(() => setSave("idle"), 1500);
      // 局順を変えた保存は detail（局メニュー・局切替の並び）にも効くので取り直す。
      // 取り直さないとリロードするまで古い局順のまま表示される。
      if (seqValue !== log.seq) await p.reload(log.id);
    } else {
      setSaveErr("保存に失敗しました。");
    }
  }

  /** 下書き/編集済は半荘単位（配下の全局に一括反映）。上限（半荘数）は API 側でも判定。 */
  async function changeStatus(next: "draft" | "complete") {
    if (next === status) return;
    setStatus(next);
    const res = await setGameStatusAction(gameId, next).catch(() => ({ ok: false, status: 0 }));
    if (!res.ok) {
      setStatus(status);
      setSaveErr(
        res.status === 403
          ? next === "draft"
            ? LIMIT_MESSAGES.draftGames
            : LIMIT_MESSAGES.privateGames
          : "編集状態の保存に失敗しました。",
      );
    }
  }
  /** 半荘名を保存する（入力欄の blur で呼ぶ。未変更なら何もしない）。 */
  async function saveHanchanName() {
    const title = hanchanName.trim();
    if (title === (detail.game.title || "")) return;
    const res = await updateGameAction(gameId, { title }).catch(() => ({ ok: false, status: 0 }));
    if (!res.ok) setSaveErr("半荘名の保存に失敗しました。");
  }

  /** 対局日の保存（blur 時。mobile GameDetail と同じ API=updateGame の createdAt）。
   *  以前は入力欄だけあって保存されない不具合だった（パリティ監査 2026-08-03）。 */
  async function saveGameDate() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
      setSaveErr("日付は YYYY-MM-DD 形式で入力してください。");
      return;
    }
    if (dateInput === new Date(detail.game.createdAt).toISOString().slice(0, 10)) return;
    const res = await updateGameAction(gameId, { createdAt: dateInput }).catch(() => ({
      ok: false,
      status: 0,
    }));
    if (!res.ok) setSaveErr("対局日の保存に失敗しました。");
  }

  /** 半荘を配下の全局ごと削除する（2度押しで確定＝誤操作防止）。成功で一覧へ戻る。 */
  async function onDeleteGame() {
    // 確認は説明つき confirm（DELETE_CONFIRM=web/mobile 共通文言。2度押しは説明ゼロで廃止）。
    if (!window.confirm(deleteConfirmText(DELETE_CONFIRM.game(detail.game.title)))) return;
    const res = await deleteGameAction(gameId).catch(() => ({ ok: false, status: 0 }));
    if (res.ok) router.push("/mypage");
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
  // 河への追加中は「これから追加する牌」へ適用するフラグを切り替える。
  function setDiscardKind(tsumogiri: boolean) {
    if (sel?.kind === "add" && sel.area === "river") {
      setAddTsumogiri(tsumogiri);
      return;
    }
    if (sel?.kind !== "edit" || sel.loc.area !== "river") return;
    const loc = sel.loc;
    mutate((d) => {
      const discard = d.seats[loc.seat].river[loc.index];
      if (discard) discard.tsumogiri = tsumogiri;
    });
  }

  // リーチ宣言牌（横向き）を切り替える。河への追加中は追加する牌へ適用する。
  function setDiscardRiichi(riichi: boolean) {
    if (sel?.kind === "add" && sel.area === "river") {
      setAddRiichi(riichi);
      return;
    }
    if (sel?.kind !== "edit" || sel.loc.area !== "river") return;
    const loc = sel.loc;
    mutate((d) => {
      const discard = d.seats[loc.seat].river[loc.index];
      if (discard) discard.riichi = riichi;
    });
  }

  async function onDelete() {
    // 最後の1局は消せない（半荘には最低1局）。無言 disabled にせず理由を出す（mobile と同じ）。
    if (detail.logs.length <= 1) {
      setSaveErr("最後の1局は削除できません。半荘ごと削除するには「半荘を削除」を使ってください。");
      return;
    }
    if (!window.confirm(deleteConfirmText(DELETE_CONFIRM.kyoku(roundNameForSeq(seqValue))))) return;
    const res = await deleteKifuAction(log.id).catch(() => ({ ok: false, status: 0 }));
    if (res.ok) {
      const focus = detail.logs[idx + 1]?.id ?? detail.logs[idx - 1]?.id;
      await p.reload(focus);
    }
  }

  // 局名は配列位置ではなく局順(seq)から出す（他画面と同じ規則）。変更中の値を即時反映する。
  const round = roundNameForSeq(seqValue);
  // 共有先は公開ビューア（誰でも閲覧可）。エディタ(/kifu/...)は所有者専用なので使わない。
  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/k/${gameId}` : "";

  const acc = (id: string) => setOpen((o) => ({ ...o, [id]: !o[id] }));

  return (
    <div className={`${s.app} themeBoard`} onClick={() => pop && closePop()}>
      <header className={s.bar}>
        <Link href="/mypage" className={s.brand} aria-label="マイページへ">
          {/* ロゴは共通ヘッダーと同じ BrandMark（オレンジ5角星）。画面ごとに意匠を変えない。 */}
          <BrandMark starClassName={s.star} wordmarkClassName={s.wm} />
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
        {/* 保存ボタンの左：下書き / 編集済み トグル（半荘単位＝配下の全局に反映）。 */}
        <Seg
          value={status}
          options={[
            ["draft", "下書き"],
            ["complete", "編集済"],
          ]}
          onChange={(next) => void changeStatus(next)}
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
          names={players.names}
          showPoints={players.showPoints}
          points={players.points}
          honba={honba}
          kyotaku={kyotaku}
          round={round}
          dora={dora}
          onOpenEdit={openEdit}
          onOpenAdd={openAdd}
          onSeatSelect={setPovSeat}
        />

        {tab === "timeline" && (
          <TimelineEditor
            kifu={kifu}
            dealer={dealer}
            names={players.names}
            onChange={(k) => setKifu(k)}
          />
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
                        {detail.logs.map((l, i) => {
                          return (
                            <button
                              key={l.id}
                              className={`${s.roundItem} ${i === idx ? s.on : ""}`}
                              onClick={() => {
                                p.onSwitch(i);
                                setRoundMenu(false);
                              }}
                            >
                              {/* 本場も出す：連荘（同じ局順の局）を区別できる唯一の手掛かり。
                                  ラベルと第n局の間は実スペース（JSX の改行は空白にならず、
                                  ビューアの局メニューとアクセシブルネームがずれるため）。 */}
                              {/* 「要確認」バッジは表示廃止（[決定] 2026-08-02 オーナー。null 牌は盤面で埋める）。 */}
                              {roundHonbaLabel(l.seq, l.kifu.meta.honba)} <small>第{l.seq}局</small>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  {/* 局順の変更（東三局で作ってしまった→東二局へ等）。保存ボタンで kifu と一緒に確定する。 */}
                  <div className={s.seqrow}>
                    <span className={s.stlabel}>この局の局順</span>
                    <div className={s.agsel}>
                      <select
                        className={s.sel2}
                        aria-label="この局の局順"
                        value={seqValue}
                        onChange={(e) => changeSeq(Number(e.target.value))}
                      >
                        {Array.from({ length: MAX_SEQ }, (_, i) => i + 1).map((n) => (
                          <option key={n} value={n}>
                            {roundNameForSeq(n)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className={s.kyakuAct}>
                    <button className={s.addkyoku} onClick={() => setRulesOpen(true)}>
                      ⚙ ルール設定
                    </button>
                    {/* 元写真（恒久保存・所有者のみ）。AI の読み取りを写真と突き合わせる。 */}
                    <button className={s.addkyoku} onClick={() => setPhotosOpen(true)}>
                      🖼 元写真
                    </button>
                    <button className={s.addkyoku} onClick={() => setAddOpen(true)}>
                      ＋ 局の追加
                    </button>
                    <button className={s.delkyoku} onClick={() => void onDelete()}>
                      この局を削除
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
                    label="ドラ表示牌"
                    tiles={dora}
                    onOpen={(e, i) => openDoraPicker(e, "dora", i)}
                    onRemove={(i) => setKifu(removeDoraTile(kifu, "dora", i))}
                  />
                  <DoraNavRow
                    label="裏ドラ表示牌"
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
                className={`${s.accHead} ${players.showPoints ? s.accHeadOpen : ""}`}
                aria-expanded={players.showPoints}
                onClick={() => players.setShowPoints((v) => !v)}
              >
                <svg className={s.arr} viewBox="0 0 12 12">
                  <path d="M4 2l5 4-5 4" />
                </svg>
                選手情報
              </button>
              {players.showPoints && (
                <div className={s.accBody}>
                  {SEAT_ORDER.map((seat) => (
                    <div key={seat} className={s.agrow}>
                      <input
                        className={s.field}
                        style={{ flex: 1, minWidth: 0 }}
                        value={players.names[seat]}
                        placeholder={`${windOf(seat, dealer)}家`}
                        aria-label="選手名"
                        maxLength={20}
                        onChange={(e) =>
                          players.setNames((n) => ({ ...n, [seat]: e.target.value }))
                        }
                        onBlur={players.save}
                      />
                      <input
                        type="number"
                        step="0.1"
                        value={players.points[seat]}
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
                        onChange={(e) =>
                          players.setPoints((pt) => ({ ...pt, [seat]: e.target.value }))
                        }
                        onBlur={players.save}
                      />
                    </div>
                  ))}
                  {players.message && (
                    <p style={{ color: "var(--emLite, #6fbf9a)", fontSize: 12, margin: "4px 0 0" }}>
                      {players.message}
                    </p>
                  )}
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
                      aria-label="対局日"
                      value={dateInput}
                      onChange={(e) => setDateInput(e.target.value)}
                      onBlur={() => void saveGameDate()}
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
                  )}
                  {/* 非公開でも所有者は再生ページで確認できる（mobile の「プレビュー」と同等）。 */}
                  <p className={s.visNote}>
                    <Link href={`/k/${gameId}`} style={{ color: "#fff" }}>
                      {vis === "public" ? "公開ページを見る →" : "再生ページを見る →"}
                    </Link>
                  </p>
                  <p className={s.visNote}>
                    公開すると共有URLで誰でも閲覧できます（{visibilityLabel(vis)}）。
                  </p>
                  <button className={s.delkyoku} onClick={() => void onDeleteGame()}>
                    この半荘を削除（全局）
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
          addTsumogiri={addTsumogiri}
          addRiichi={addRiichi}
          meldType={meldType}
          setMeldType={(m) => {
            setMeldType(m);
            setChiRun(null); // 種別を変えたら並び選択はリセット
          }}
          chiRun={chiRun}
          setChiRun={setChiRun}
          meldWho={meldWho}
          setMeldWho={setMeldWho}
          kanType={kanType}
          setKanType={setKanType}
          bottomSeat={bottomSeat}
          dealer={dealer}
          names={players.names}
          onApplyTile={applyTile}
          onSetDiscardKind={setDiscardKind}
          onSetDiscardRiichi={setDiscardRiichi}
          onDelete={deleteSelected}
          onClose={closePop}
        />
      )}

      {addOpen && (
        <AddKyokuModal
          gameId={gameId}
          bottomSeat={cameraSeat}
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

      {photosOpen && <GamePhotosModal gameId={gameId} onClose={() => setPhotosOpen(false)} />}
    </div>
  );
}

export default BoardEditor;
