"use client";

import {
  RulesSchema,
  SeatSchema,
  type Kifu,
  type Meld,
  type ProblemKind,
  type Rules,
  type Seat,
  type Tile,
} from "@rigel/schema";
import {
  addDraftMeld,
  assembleProblem,
  compareTiles,
  deleteConfirmText,
  draftToKifu,
  kifuToProblemDraft,
  parseRiverEditTarget,
  planCanAnalyze,
  problemHandMax,
  removeDraftRiverTile,
  replaceDraftRiverTile,
  problemRiverTiles,
  seatLabel,
  tileLabel,
  toggleDraftRiverTsumogiri,
  DELETE_CONFIRM,
  LIMIT_MESSAGES,
  NUMS,
  PROBLEM_KIND_LABELS,
  SEAT_ORDER,
  SUITS,
  type DraftRiverTile,
  type PickerSuit,
} from "@rigel/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createProblemAction,
  deleteProblemAction,
  getProblemDraftAction,
  updateProblemAction,
} from "../../app/actions";
import { type ProblemPost } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { useBoardScale } from "../../lib/use-board-scale";
import { AppHeader } from "../AppHeader";
import { RulesDialog } from "../board/RulesDialog";
import { Stepper } from "../board/Stepper";
import { OssTileFace } from "../OssTileFace";
import { ViewBoard } from "../view/ViewBoard";
import { ProblemBoardCenter } from "./ProblemBoardCenter";
import { ProblemPhotoModal } from "./ProblemPhotoModal";
import { ProblemPhotosModal } from "./ProblemPhotosModal";
import s from "./problem.module.css";

/** 牌グリッドの入力先。 */
/** 牌グリッドの入力先。riveredit の分解は @rigel/ui（parseRiverEditTarget）。 */
type Target =
  | "hand"
  | "drawn"
  | "dora"
  | `river:${Seat}`
  | `riveredit:${Seat}:${number}`
  | `meld:${"pon" | "chi" | "kan"}`;

/** 席セレクト（selwrap＝自前シェブロン付き）。自分の席・対象席・場風・親で共用。 */
function SeatSelect({
  ariaLabel,
  value,
  seats,
  format,
  onChange,
}: {
  ariaLabel: string;
  value: Seat;
  seats: Seat[];
  format: (seat: Seat) => string;
  onChange: (seat: Seat) => void;
}) {
  return (
    <span className={s.selwrap}>
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(SeatSchema.parse(e.target.value))}
      >
        {seats.map((seat) => (
          <option key={seat} value={seat}>
            {format(seat)}
          </option>
        ))}
      </select>
    </span>
  );
}

/** 河のチップ行。牌タップで編集モード（変更・削除・ツモ切り切替）へ。✕ボタンは廃止。
 *  空なら描かない。 */
function RiverChipRow({
  seat,
  tiles,
  editingIndex,
  onEdit,
}: {
  seat: Seat;
  tiles: DraftRiverTile[];
  /** 編集モード中の河 index（この席でなければ null）。チップを強調する。 */
  editingIndex: number | null;
  onEdit: (index: number) => void;
}) {
  if (tiles.length === 0) return null;
  return (
    <div className={s.row}>
      <span className={s.rowLabel}>{seatLabel(seat)}家の河</span>
      <span className={s.tiles}>
        {tiles.map((d, i) => (
          <button
            key={`${d.tile}-${i}`}
            type="button"
            className={`${s.handTileSmall} ${d.tsumogiri ? s.tsumogiriChip : ""} ${
              editingIndex === i ? s.sel : ""
            }`}
            aria-pressed={editingIndex === i}
            aria-label={`${seatLabel(seat)}家の河${i + 1}（${tileLabel(d.tile)}）を変更`}
            onClick={() => onEdit(i)}
          >
            <OssTileFace code={d.tile} />
          </button>
        ))}
      </span>
    </div>
  );
}

/** 入力済み牌のチップ行（タップで外す）。ドラ・ツモ牌で共用。空なら描かない。 */
function TileChipRow({
  label,
  tiles,
  removeLabel,
  onRemove,
}: {
  label: string;
  tiles: Tile[];
  removeLabel: (tile: Tile) => string;
  onRemove: (index: number) => void;
}) {
  if (tiles.length === 0) return null;
  return (
    <div className={s.row}>
      <span className={s.rowLabel}>{label}</span>
      <span className={s.tiles}>
        {tiles.map((t, i) => (
          <button
            key={`${t}-${i}`}
            type="button"
            className={s.handTileSmall}
            aria-label={removeLabel(t)}
            onClick={() => onRemove(i)}
          >
            <OssTileFace code={t} />
          </button>
        ))}
      </span>
    </div>
  );
}

/**
 * 何切る問題の作成/編集画面。牌グリッドで「手牌・ツモ・ドラ・各席の河・副露」へ入力し、
 * 出題者のコメント（任意）を付けて保存する。正解は設けない（多様な正解を前提）。
 * 保存前にクライアントでも ProblemSchema で検証し、エラーは日本語で表示する。
 */
export function ProblemEditorScreen({
  initial,
  draftId,
}: {
  initial?: ProblemPost;
  /** 解析下書き（photo-retention.md）から開く場合の ID。結果を流し込み、保存で写真を引き継ぐ。 */
  draftId?: string;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const p0 = initial?.problem;
  // 写真からのAI再現は有料プランのみ（free は解析枠0。kifu の AddKyokuModal と同一方針）。
  const canAnalyze = planCanAnalyze(user?.plan ?? "free");

  const [kind, setKind] = useState<ProblemKind>(p0?.kind ?? "discard");
  const [pov, setPov] = useState<Seat>(p0?.pov ?? "east");
  const [hand, setHand] = useState<Tile[]>(
    p0 ? p0.seats[p0.pov].hand.flatMap((t) => (t.tile ? [t.tile] : [])) : [],
  );
  const [melds, setMelds] = useState<Meld[]>(p0 ? p0.seats[p0.pov].melds : []);
  const [drawn, setDrawn] = useState<Tile | null>(p0?.drawn ?? null);
  const [rivers, setRivers] = useState<Record<Seat, DraftRiverTile[]>>(() => problemRiverTiles(p0));
  const [dora, setDora] = useState<Tile[]>(p0?.meta.dora ?? []);
  const [targetSeat, setTargetSeat] = useState<Seat>(p0?.targetSeat ?? "south");
  const [roundWind, setRoundWind] = useState<Seat | null>(p0?.meta.roundWind ?? "east");
  const [dealer, setDealer] = useState<Seat | null>(p0?.meta.dealer ?? "east");
  const [junme, setJunme] = useState(p0?.meta.junme ?? 6);
  const [honba, setHonba] = useState(p0?.meta.honba ?? 0);
  const [kyotaku, setKyotaku] = useState(p0?.meta.kyotaku ?? 0);
  const [scoresOn, setScoresOn] = useState(p0?.scores != null);
  const [scores, setScores] = useState<Record<Seat, string>>({
    east: String(p0?.scores?.east ?? 25000),
    south: String(p0?.scores?.south ?? 25000),
    west: String(p0?.scores?.west ?? 25000),
    north: String(p0?.scores?.north ?? 25000),
  });
  const [rules, setRules] = useState<Rules>(p0?.rules ?? RulesSchema.parse({}));
  const [rulesOpen, setRulesOpen] = useState(false);

  const [title, setTitle] = useState(initial?.title ?? "");
  const [explanation, setExplanation] = useState(p0?.explanation ?? "");

  const [target, setTarget] = useState<Target>("hand");
  const [suit, setSuit] = useState<PickerSuit>("m");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // 写真からのAI再現。流し込み後は readingNotes を出し、全体の目検確認を促す。
  const [photoOpen, setPhotoOpen] = useState(false);
  const [readingNotes, setReadingNotes] = useState("");
  const [aiReview, setAiReview] = useState("");
  // 保存時に写真を引き継ぐ解析下書き（route の ?draft= か、画面内の写真AI再現で紐づく）。
  const [linkedDraftId, setLinkedDraftId] = useState<string | null>(draftId ?? null);
  const [photosOpen, setPhotosOpen] = useState(false);
  // 解析下書きから開いたときの流し込み（一度だけ。ready 以外は案内を出す）。
  const draftLoaded = useRef(false);
  useEffect(() => {
    if (!draftId || draftLoaded.current) return;
    draftLoaded.current = true;
    getProblemDraftAction(draftId)
      .then((d) => {
        if (!d) {
          setErr("解析下書きが見つかりませんでした。");
          return;
        }
        if (d.draft) applyAiDraft(d.draft);
        else if (d.status === "processing") setErr("この下書きはまだ解析中です。");
        else setErr("この下書きは解析に失敗しています。写真からやり直してください。");
      })
      .catch(() => setErr("解析下書きを読み込めませんでした。"));
  }, [draftId]);

  /** AIドラフト（Kifu 形）をエディタの各状態へ流し込む（変換は @rigel/ui の共有純関数）。 */
  function applyAiDraft(kifu: Kifu) {
    const { draft, readingNotes: notes } = kifuToProblemDraft(kifu, pov);
    setHand(draft.hand);
    setMelds(draft.melds);
    setDrawn(draft.drawn);
    setRivers(draft.rivers);
    setDora(draft.meta.dora);
    setJunme(draft.meta.junme);
    setHonba(draft.meta.honba);
    setKyotaku(draft.meta.kyotaku);
    if (draft.meta.dealer) setDealer(draft.meta.dealer);
    if (draft.meta.roundWind) setRoundWind(draft.meta.roundWind);
    setReadingNotes(notes);
    // AI ドラフトは全牌目検が前提（[決定] 2026-07-24: confidence 廃止）。
    setAiReview("AIの読み取り結果です。牌を目で確認してから保存してください。");
    setPhotoOpen(false);
    setErr(null);
  }

  const handMax = problemHandMax(melds.length);
  const sortedHand = [...hand].sort(compareTiles);

  // 盤面プレビュー（牌譜と同じ卓）。編集途中でも検証なしで描ける draftToKifu を使う。
  const previewKifu = useMemo(
    () =>
      draftToKifu({
        pov,
        hand,
        melds,
        rivers,
        meta: { dealer, roundWind, honba, kyotaku, junme, dora },
        rules,
      }),
    [pov, hand, melds, rivers, dealer, roundWind, honba, kyotaku, junme, dora, rules],
  );
  const previewHighlight =
    kind === "call" && rivers[targetSeat].length > 0
      ? { seat: targetSeat, index: rivers[targetSeat].length - 1 }
      : null;
  const mainRef = useRef<HTMLDivElement>(null);
  const scale = useBoardScale(mainRef);

  function pickTile(code: Tile) {
    setErr(null);
    if (target === "hand") {
      // 黙って捨てない: 置けない理由と解決手段を必ず知らせる（袋小路防止）。
      if (hand.length >= handMax) {
        setErr(`手牌は${handMax}枚までです（置いた牌はタップで外せます）。`);
        return;
      }
      const next = [...hand, code];
      setHand(next);
      // 13枚に達したら入力先を自動でツモ牌へ（切替忘れで「ツモ牌が必須」に悩ませない）。
      if (kind === "discard" && next.length >= handMax && drawn === null) setTarget("drawn");
    } else if (target === "drawn") {
      setDrawn(code);
    } else if (target === "dora") {
      if (dora.length >= 5) {
        setErr("ドラ表示牌は5枚までです（置いた牌はタップで外せます）。");
        return;
      }
      setDora((cur) => [...cur, code]);
    } else if (target.startsWith("river:")) {
      const seat = target.slice("river:".length) as Seat;
      // 置くときは手出し。ツモ切りは牌タップ→編集モードで後から切り替える。
      setRivers((cur) => ({ ...cur, [seat]: [...cur[seat], { tile: code, tsumogiri: false }] }));
    } else if (target.startsWith("riveredit:")) {
      const re = parseRiverEditTarget(target)!;
      // 既存の河の牌を置き換える（ツモ切りフラグは保持）。置き換えたら通常入力へ戻る。
      setRivers((cur) => replaceDraftRiverTile(cur, re.seat, re.index, code));
      setTarget("hand");
    } else if (target.startsWith("meld:")) {
      const type = target.slice("meld:".length) as "pon" | "chi" | "kan";
      // 副露の生成と手牌の3枚換算圧迫は共有純関数（mobile と同一挙動）。
      const next = addDraftMeld(hand, melds, type, code);
      setHand(next.hand);
      setMelds(next.melds);
      setTarget("hand");
    }
  }

  function removeHandAt(i: number) {
    const tile = sortedHand[i];
    setHand((cur) => {
      const j = cur.indexOf(tile!);
      return j < 0 ? cur : [...cur.slice(0, j), ...cur.slice(j + 1)];
    });
    // 外した＝手牌を直したいはず。入力先を手牌に戻す（ツモ牌の誤上書き防止）。
    setTarget("hand");
  }

  async function save(status: "draft" | "published") {
    // 編集状態→Problem の組み立て・検証は共有純関数（mobile と同一挙動）。
    const { problem, error } = assembleProblem({
      kind,
      pov,
      hand,
      melds,
      drawn,
      targetSeat,
      rivers,
      meta: { dealer, roundWind, honba, kyotaku, junme, dora },
      scores: scoresOn ? scores : null,
      rules,
      explanation,
    });
    if (!problem) {
      setErr(error ?? null);
      return;
    }
    setBusy(true);
    setErr(null);
    const res = initial
      ? await updateProblemAction(initial.id, { title, problem, status }).catch(() => ({
          ok: false,
          status: 0,
        }))
      : await createProblemAction({
          title,
          problem,
          status,
          // 解析下書き由来なら写真を引き継ぐ（photo-retention.md）。
          ...(linkedDraftId ? { draftId: linkedDraftId } : {}),
        }).catch(() => ({
          ok: false as const,
          status: 0,
        }));
    setBusy(false);
    if (res.ok) {
      router.push("/mypage/problems");
      return;
    }
    setErr(
      "status" in res && res.status === 403 ? LIMIT_MESSAGES.problems : "保存に失敗しました。",
    );
  }

  /** 問題の削除（既存のみ。確認は web/mobile 共通の DELETE_CONFIRM 文言）。 */
  async function onDelete() {
    if (!initial) return;
    if (!window.confirm(deleteConfirmText(DELETE_CONFIRM.problem(title)))) return;
    setBusy(true);
    const res = await deleteProblemAction(initial.id).catch(() => ({ ok: false, status: 0 }));
    setBusy(false);
    if (res.ok) router.push("/mypage/problems");
    else setErr("削除に失敗しました。");
  }

  // 入力先は「自分の手」と「ドラ表示牌・河」の2グループに分けて見せる（1本のセグメントに
  // 詰め込むと潰れて読めない）。
  const handTargets: { key: Target; label: string }[] = [
    { key: "hand", label: `手牌（${hand.length}/${handMax}）` },
    ...(kind === "discard" ? [{ key: "drawn" as Target, label: "ツモ牌" }] : []),
    { key: "meld:pon", label: "副露:ポン" },
    { key: "meld:chi", label: "副露:チー" },
    { key: "meld:kan", label: "副露:カン" },
  ];
  const tableTargets: { key: Target; label: string }[] = [
    { key: "dora", label: "ドラ表示牌" },
    ...SEAT_ORDER.map((seat) => ({
      key: `river:${seat}` as Target,
      label: `${seatLabel(seat)}家の河`,
    })),
  ];
  // 河の牌の編集モード（チップタップで入る）。牌グリッドは置き換え先の選択になる。
  const riverEdit = parseRiverEditTarget(target);
  const riverEditTile = riverEdit ? rivers[riverEdit.seat][riverEdit.index] : null;

  return (
    <div className={`${s.app} themeBoard`}>
      {/* ヘッダは一覧・マイページと同じ共通ヘッダー（画面遷移で変わらない）。 */}
      <AppHeader active="mypage" />

      <main className={s.main} ref={mainRef}>
        <div className={s.field}>
          <label htmlFor="pb-title">タイトル</label>
          <input
            id="pb-title"
            value={title}
            maxLength={80}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        {/* 出題形式 */}
        <div className={s.row}>
          <span className={s.rowLabel}>出題形式</span>
          <div className={s.callSeg} role="group" aria-label="出題形式">
            {(["discard", "call"] as const).map((k) => (
              <button
                key={k}
                type="button"
                className={kind === k ? s.on : ""}
                aria-pressed={kind === k}
                onClick={() => {
                  setKind(k);
                  // 鳴き判断にツモ牌は無い。見えない入力先に置かせない。
                  if (k === "call" && target === "drawn") setTarget("hand");
                }}
              >
                {PROBLEM_KIND_LABELS[k]}
              </button>
            ))}
          </div>
        </div>

        {/* 視点・鳴き判断の対象席 */}
        <div className={s.row}>
          <span className={s.rowLabel}>自分の席</span>
          <SeatSelect
            ariaLabel="自分の席"
            value={pov}
            seats={SEAT_ORDER}
            format={seatLabel}
            onChange={(seat) => {
              setPov(seat);
              // 対象席（鳴き判断）は自分と同席にできない。選べない値のまま残さない。
              setTargetSeat((cur) =>
                cur === seat ? (SEAT_ORDER.find((x) => x !== seat) ?? cur) : cur,
              );
            }}
          />
          {kind === "call" && (
            <>
              <span className={s.rowLabel}>誰の捨て牌</span>
              <SeatSelect
                ariaLabel="対象席"
                value={targetSeat}
                seats={SEAT_ORDER.filter((seat) => seat !== pov)}
                format={(seat) => `${seatLabel(seat)}家`}
                onChange={setTargetSeat}
              />
            </>
          )}
        </div>
        {kind === "call" && (
          <p className={s.hint}>
            対象席の河の<b>最後の1枚</b>
            が「鳴くかどうか」の対象牌になります。河に対象牌まで並べてください。
          </p>
        )}

        {/* 局情報 */}
        <div className={s.row}>
          <span className={s.rowLabel}>場・親</span>
          <SeatSelect
            ariaLabel="場風"
            value={roundWind ?? "east"}
            seats={SEAT_ORDER}
            format={(seat) => `${seatLabel(seat)}場`}
            onChange={setRoundWind}
          />
          <SeatSelect
            ariaLabel="親"
            value={dealer ?? "east"}
            seats={SEAT_ORDER}
            format={(seat) => `親 ${seatLabel(seat)}`}
            onChange={setDealer}
          />
          <button type="button" className={s.rulesBtn} onClick={() => setRulesOpen(true)}>
            ⚙ ルール設定
          </button>
          {/* 写真からのAI再現（有料のみ）。手牌・河のベースを流し込み、作者が修正する。 */}
          {canAnalyze && (
            <button type="button" className={s.rulesBtn} onClick={() => setPhotoOpen(true)}>
              📷 写真から作成
            </button>
          )}
          {/* 元写真（恒久保存・所有者のみ）。解析下書き由来のときだけ出す。 */}
          {(linkedDraftId || initial?.photoDraftId) && (
            <button type="button" className={s.rulesBtn} onClick={() => setPhotosOpen(true)}>
              🖼 元写真
            </button>
          )}
        </div>
        {/* AIの読み取りメモ（グレア・見切れ等）と目検確認の促し。 */}
        {readingNotes && <p className={s.hint}>読み取りメモ: {readingNotes}</p>}
        {aiReview && <p className={s.hint}>{aiReview}</p>}
        <Stepper label="巡目" unit="巡目" value={junme} min={1} max={30} set={setJunme} />
        <Stepper label="本場" unit="本場" value={honba} min={0} max={19} set={setHonba} />
        <Stepper label="供託" unit="本" value={kyotaku} min={0} max={9} set={setKyotaku} />

        {/* 点数状況 */}
        <div className={s.row}>
          <span className={s.rowLabel}>点数状況</span>
          <button
            type="button"
            className={s.rulesBtn}
            aria-pressed={scoresOn}
            onClick={() => setScoresOn((v) => !v)}
          >
            {scoresOn ? "入力する（表示中）" : "入力しない"}
          </button>
          {scoresOn &&
            SEAT_ORDER.map((seat) => (
              <label key={seat} className={s.scoreInput}>
                {seatLabel(seat)}
                <input
                  type="number"
                  step={100}
                  value={scores[seat]}
                  aria-label={`${seatLabel(seat)}家の持ち点`}
                  onChange={(e) => setScores((cur) => ({ ...cur, [seat]: e.target.value }))}
                />
              </label>
            ))}
        </div>

        {/* 盤面プレビュー（牌譜と同じ卓。編集途中でも即時反映）。 */}
        <div className={s.boardPanel}>
          <ViewBoard
            kifu={previewKifu}
            bottomSeat={pov}
            dealer={dealer ?? pov}
            scale={scale}
            seatName={{ seat: pov, name: "あなた" }}
            highlightRiver={previewHighlight}
            center={<ProblemBoardCenter meta={{ roundWind, junme, dora, honba, kyotaku }} />}
            // 入力（自分の席・親）が絶対席なので、プレートも絶対席で出す（ずれ防止）。
            absolutePlates
          />
        </div>

        {/* 入力済みの一覧（タップで削除） */}
        <div className={s.handRow}>
          <span className={s.rowLabel}>手牌</span>
          <span className={s.hand}>
            {sortedHand.map((t, i) => (
              <button
                key={`${t}-${i}`}
                type="button"
                className={s.handTile}
                aria-label={`${tileLabel(t)} を外す`}
                onClick={() => removeHandAt(i)}
              >
                <OssTileFace code={t} />
              </button>
            ))}
          </span>
        </div>
        {kind === "discard" && (
          <TileChipRow
            label="ツモ牌"
            tiles={drawn ? [drawn] : []}
            removeLabel={(t) => `ツモ牌の ${tileLabel(t)} を外す`}
            onRemove={() => setDrawn(null)}
          />
        )}
        {melds.length > 0 && (
          <div className={s.row}>
            <span className={s.rowLabel}>副露</span>
            <span className={s.tiles}>
              {melds.map((m, mi) => (
                <button
                  key={mi}
                  type="button"
                  className={s.meldChip}
                  aria-label={`副露${mi + 1}を外す`}
                  onClick={() => setMelds((cur) => cur.filter((_, i) => i !== mi))}
                >
                  {m.tiles.map((t, ti) => (
                    <span key={ti} className={s.tile}>
                      <OssTileFace code={t.tile} />
                    </span>
                  ))}
                </button>
              ))}
            </span>
          </div>
        )}
        <TileChipRow
          label="ドラ表示牌"
          tiles={dora}
          removeLabel={(t) => `ドラ表示牌 ${tileLabel(t)} を外す`}
          onRemove={(i) => setDora((cur) => cur.filter((_, j) => j !== i))}
        />
        {SEAT_ORDER.map((seat) => (
          <RiverChipRow
            key={seat}
            seat={seat}
            tiles={rivers[seat]}
            editingIndex={riverEdit?.seat === seat ? riverEdit.index : null}
            onEdit={(i) => setTarget(`riveredit:${seat}:${i}`)}
          />
        ))}
        {SEAT_ORDER.some((seat) => rivers[seat].length > 0) && (
          <p className={s.hint}>河の牌はタップで変更・削除・ツモ切り切替ができます。</p>
        )}

        {/* 入力先セレクタ＋牌グリッド */}
        <div className={s.answerBox} role="group" aria-label="入力先">
          {(
            [
              { group: "自分の手", items: handTargets },
              { group: "ドラ表示牌・河", items: tableTargets },
            ] as const
          ).map(({ group, items }) => (
            <div key={group} className={s.targetRow}>
              <span className={s.rowLabel}>{group}</span>
              <div className={s.targetChips}>
                {items.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    className={`${s.targetChip} ${target === key ? s.on : ""}`}
                    aria-pressed={target === key}
                    onClick={() => setTarget(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {/* 河の牌の編集モード: 牌グリッド=置き換え、ここでツモ切り切替・削除・キャンセル。 */}
          {riverEdit && riverEditTile && (
            <div className={s.targetRow}>
              <span className={s.rowLabel}>
                {seatLabel(riverEdit.seat)}家の河{riverEdit.index + 1}（
                {tileLabel(riverEditTile.tile)}）を編集中
              </span>
              <div className={s.targetChips}>
                <button
                  type="button"
                  className={`${s.targetChip} ${riverEditTile.tsumogiri ? s.on : ""}`}
                  aria-pressed={riverEditTile.tsumogiri}
                  onClick={() =>
                    setRivers((cur) =>
                      toggleDraftRiverTsumogiri(cur, riverEdit.seat, riverEdit.index),
                    )
                  }
                >
                  {riverEditTile.tsumogiri ? "手出しにする" : "ツモ切りにする"}
                </button>
                <button
                  type="button"
                  className={s.targetChip}
                  aria-label="河の牌を削除"
                  onClick={() => {
                    setRivers((cur) => removeDraftRiverTile(cur, riverEdit.seat, riverEdit.index));
                    setTarget("hand");
                  }}
                >
                  削除
                </button>
                <button type="button" className={s.targetChip} onClick={() => setTarget("hand")}>
                  キャンセル
                </button>
              </div>
            </div>
          )}
          <div className={s.callSeg}>
            {SUITS.map((su) => (
              <button
                key={su.suit}
                type="button"
                className={suit === su.suit ? s.on : ""}
                onClick={() => setSuit(su.suit)}
              >
                {su.label}
              </button>
            ))}
          </div>
          <div className={s.pickerGrid} role="group" aria-label="牌を選ぶ">
            {NUMS[suit].map((code) => (
              <button
                key={code}
                type="button"
                className={s.handTile}
                aria-label={tileLabel(code)}
                onClick={() => pickTile(code)}
              >
                <OssTileFace code={code} />
              </button>
            ))}
          </div>
        </div>

        {/* 正解は設けない（多様な正解を前提に、回答の分布を見る）。コメントだけ書ける。 */}
        <div className={s.answerBox}>
          <div className={s.field}>
            <label htmlFor="pb-exp">出題者のコメント（任意。回答後に表示されます）</label>
            <textarea
              id="pb-exp"
              rows={4}
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
            />
          </div>
        </div>

        {err && <p className={s.err}>{err}</p>}
        <div className={s.saveRow}>
          <button
            type="button"
            className={s.saveGhost}
            disabled={busy}
            onClick={() => void save("draft")}
          >
            下書き保存
          </button>
          <button
            type="button"
            className={s.submit}
            disabled={busy}
            onClick={() => void save("published")}
          >
            公開して保存
          </button>
        </div>

        {/* 既存の問題だけ: 回答画面の確認と削除（一覧のボタンを廃止してここに集約。
            [決定] 2026-08-08 オーナー）。 */}
        {initial && (
          <div className={s.manageRow}>
            <span>
              <Link href={`/p/${initial.id}`} className={s.viewLink}>
                回答画面を見る →
              </Link>
              <span className={s.manageNote}>（保存済みの内容が表示されます）</span>
            </span>
            <button
              type="button"
              className={s.deleteBtn}
              disabled={busy}
              onClick={() => void onDelete()}
            >
              この問題を削除
            </button>
          </div>
        )}
      </main>

      {rulesOpen && (
        <RulesDialog
          rules={rules}
          onClose={() => setRulesOpen(false)}
          onSave={(r) => {
            setRules(r);
            setRulesOpen(false);
          }}
        />
      )}

      {photoOpen && (
        <ProblemPhotoModal
          pov={pov}
          onClose={() => setPhotoOpen(false)}
          onDone={(kifu, doneDraftId) => {
            applyAiDraft(kifu);
            // 保存時に写真を引き継ぐ（この場で保存しなくても下書きはマイページに残る）。
            if (doneDraftId) setLinkedDraftId(doneDraftId);
          }}
        />
      )}

      {photosOpen && (
        <ProblemPhotosModal
          refValue={
            linkedDraftId ? { draftId: linkedDraftId } : { problemId: initial!.id } // ボタンは linkedDraftId か initial.photoDraftId があるときだけ出る
          }
          onClose={() => setPhotosOpen(false)}
        />
      )}
    </div>
  );
}
