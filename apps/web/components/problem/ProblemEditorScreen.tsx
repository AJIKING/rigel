"use client";

import {
  RulesSchema,
  SeatSchema,
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
  draftToKifu,
  problemHandMax,
  problemRiverTiles,
  seatLabel,
  tileLabel,
  LIMIT_MESSAGES,
  NUMS,
  PROBLEM_KIND_LABELS,
  SEAT_ORDER,
  SUITS,
  type PickerSuit,
} from "@rigel/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { createProblemAction, updateProblemAction } from "../../app/actions";
import { type ProblemPost } from "../../lib/api";
import { useBoardScale } from "../../lib/use-board-scale";
import { AppHeader } from "../AppHeader";
import { RulesDialog } from "../board/RulesDialog";
import { Stepper } from "../board/Stepper";
import { OssTileFace } from "../OssTileFace";
import { ViewBoard } from "../view/ViewBoard";
import { ProblemBoardCenter } from "./ProblemBoardCenter";
import s from "./problem.module.css";

/** 牌グリッドの入力先。 */
type Target = "hand" | "drawn" | "dora" | `river:${Seat}` | `meld:${"pon" | "chi" | "kan"}`;

/**
 * 何切る問題の作成/編集画面。牌グリッドで「手牌・ツモ・ドラ・各席の河・副露」へ入力し、
 * 答え（何切る=牌+リーチ / 鳴き判断=スルー・ポン・チー・カン+切る牌）と解説を付けて保存する。
 * 保存前にクライアントでも ProblemSchema で検証し、エラーは日本語で表示する。
 */
export function ProblemEditorScreen({ initial }: { initial?: ProblemPost }) {
  const router = useRouter();
  const p0 = initial?.problem;

  const [kind, setKind] = useState<ProblemKind>(p0?.kind ?? "discard");
  const [pov, setPov] = useState<Seat>(p0?.pov ?? "east");
  const [hand, setHand] = useState<Tile[]>(
    p0 ? p0.seats[p0.pov].hand.flatMap((t) => (t.tile ? [t.tile] : [])) : [],
  );
  const [melds, setMelds] = useState<Meld[]>(p0 ? p0.seats[p0.pov].melds : []);
  const [drawn, setDrawn] = useState<Tile | null>(p0?.drawn ?? null);
  const [rivers, setRivers] = useState<Record<Seat, Tile[]>>(() => problemRiverTiles(p0));
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
      if (hand.length >= handMax) return;
      setHand((cur) => [...cur, code]);
    } else if (target === "drawn") {
      setDrawn(code);
    } else if (target === "dora") {
      if (dora.length >= 5) return;
      setDora((cur) => [...cur, code]);
    } else if (target.startsWith("river:")) {
      const seat = target.slice("river:".length) as Seat;
      setRivers((cur) => ({ ...cur, [seat]: [...cur[seat], code] }));
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
      : await createProblemAction({ title, problem, status }).catch(() => ({
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

  const targets: { key: Target; label: string }[] = [
    { key: "hand", label: `手牌（${hand.length}/${handMax}）` },
    ...(kind === "discard" ? [{ key: "drawn" as Target, label: "ツモ牌" }] : []),
    { key: "dora", label: "ドラ" },
    ...SEAT_ORDER.map((seat) => ({
      key: `river:${seat}` as Target,
      label: `${seatLabel(seat)}家の河`,
    })),
    { key: "meld:pon", label: "副露:ポン" },
    { key: "meld:chi", label: "副露:チー" },
    { key: "meld:kan", label: "副露:カン" },
  ];

  return (
    <div className={`${s.app} themeBoard`}>
      {/* ヘッダは一覧・マイページと同じ共通ヘッダー（画面遷移で変わらない）。 */}
      <AppHeader active="mypage" />

      <main className={s.main} ref={mainRef}>
        <p className={s.crumbRow}>
          <Link href="/mypage/problems">マイ何切る</Link>
          <span> › </span>
          <span>{initial ? "問題を編集" : "問題を作成"}</span>
        </p>
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
                onClick={() => setKind(k)}
              >
                {PROBLEM_KIND_LABELS[k]}
              </button>
            ))}
          </div>
        </div>

        {/* 視点・鳴き判断の対象席 */}
        <div className={s.row}>
          <span className={s.rowLabel}>自分の席</span>
          <select value={pov} onChange={(e) => setPov(SeatSchema.parse(e.target.value))}>
            {SEAT_ORDER.map((seat) => (
              <option key={seat} value={seat}>
                {seatLabel(seat)}
              </option>
            ))}
          </select>
          {kind === "call" && (
            <>
              <span className={s.rowLabel}>誰の捨て牌</span>
              <select
                aria-label="対象席"
                value={targetSeat}
                onChange={(e) => setTargetSeat(SeatSchema.parse(e.target.value))}
              >
                {SEAT_ORDER.filter((seat) => seat !== pov).map((seat) => (
                  <option key={seat} value={seat}>
                    {seatLabel(seat)}家
                  </option>
                ))}
              </select>
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
          <select
            aria-label="場風"
            value={roundWind ?? "east"}
            onChange={(e) => setRoundWind(SeatSchema.parse(e.target.value))}
          >
            {SEAT_ORDER.map((seat) => (
              <option key={seat} value={seat}>
                {seatLabel(seat)}場
              </option>
            ))}
          </select>
          <select
            aria-label="親"
            value={dealer ?? "east"}
            onChange={(e) => setDealer(SeatSchema.parse(e.target.value))}
          >
            {SEAT_ORDER.map((seat) => (
              <option key={seat} value={seat}>
                親 {seatLabel(seat)}
              </option>
            ))}
          </select>
          <button type="button" className={s.rulesBtn} onClick={() => setRulesOpen(true)}>
            ⚙ ルール設定
          </button>
        </div>
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
        <ViewBoard
          kifu={previewKifu}
          bottomSeat={pov}
          dealer={dealer ?? pov}
          scale={scale}
          bottomName="あなた"
          highlightRiver={previewHighlight}
          center={<ProblemBoardCenter meta={{ roundWind, junme, dora }} />}
        />

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
            {kind === "discard" && drawn && (
              <button
                type="button"
                className={`${s.handTile} ${s.drawn}`}
                aria-label={`ツモ牌 ${tileLabel(drawn)} を外す`}
                onClick={() => setDrawn(null)}
              >
                <OssTileFace code={drawn} />
              </button>
            )}
          </span>
        </div>
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
        {dora.length > 0 && (
          <div className={s.row}>
            <span className={s.rowLabel}>ドラ</span>
            <span className={s.tiles}>
              {dora.map((t, i) => (
                <button
                  key={`${t}-${i}`}
                  type="button"
                  className={s.handTileSmall}
                  aria-label={`ドラ ${tileLabel(t)} を外す`}
                  onClick={() => setDora((cur) => cur.filter((_, j) => j !== i))}
                >
                  <OssTileFace code={t} />
                </button>
              ))}
            </span>
          </div>
        )}
        {SEAT_ORDER.filter((seat) => rivers[seat].length > 0).map((seat) => (
          <div key={seat} className={s.row}>
            <span className={s.rowLabel}>{seatLabel(seat)}家の河</span>
            <span className={s.tiles}>
              {rivers[seat].map((t, i) => (
                <button
                  key={`${t}-${i}`}
                  type="button"
                  className={s.handTileSmall}
                  aria-label={`${seatLabel(seat)}家の河の ${tileLabel(t)} を外す`}
                  onClick={() =>
                    setRivers((cur) => ({ ...cur, [seat]: cur[seat].filter((_, j) => j !== i) }))
                  }
                >
                  <OssTileFace code={t} />
                </button>
              ))}
            </span>
          </div>
        ))}

        {/* 入力先セレクタ＋牌グリッド */}
        <div className={s.answerBox}>
          <div className={s.callSeg} role="group" aria-label="入力先">
            {targets.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                className={target === key ? s.on : ""}
                aria-pressed={target === key}
                onClick={() => setTarget(key)}
              >
                {label}
              </button>
            ))}
          </div>
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
    </div>
  );
}
