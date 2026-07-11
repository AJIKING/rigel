import { KifuSchema, type Kifu } from "@rigel/schema";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { type PublicGameDetail } from "../../lib/api";
import { AuthProvider } from "../../lib/auth-context";
import { KifuViewer } from "./KifuViewer";

/** 親=東・手前=東の局を最小の指定で組む。seats は指定した席だけ上書き、その他は空。 */
function makeKifu(seats: Record<string, unknown> = {}, extra: Record<string, unknown> = {}): Kifu {
  return KifuSchema.parse({
    schemaVersion: "1.0.0",
    capturedAt: "2026-06-28T00:00:00.000Z",
    cameraBottomSeat: "east",
    meta: { dealer: "east" },
    seats: { east: {}, south: {}, west: {}, north: {}, ...seats },
    ...extra,
  });
}

const kifu = (): Kifu => makeKifu();

/** 東家(親)の河に1枚 + 立直ロン和了を持つ局。再生末尾で和了演出が出る検証用。 */
const kifuWithAgari = (): Kifu =>
  makeKifu(
    { east: { river: [{ order: 1, tile: "1m", riichi: false, confidence: 1 }] } },
    {
      result: "ron",
      agari: [
        { winner: "east", from: "south", winTile: "3m", yaku: [{ name: "立直", han: 1 }], fu: 40 },
      ],
    },
  );

function detail(logs: Kifu[], visibility: "public" | "private" = "public"): PublicGameDetail {
  return {
    game: { id: "g1", title: "公開テスト卓", createdAt: "2026-06-28T00:00:00.000Z" },
    owner: { id: "u1", handle: "taro", displayName: "太郎" },
    logs: logs.map((k, i) => ({
      id: `l${i + 1}`,
      userId: "u1",
      gameId: "g1",
      seq: i + 1,
      kifu: k,
      visibility,
      status: "complete" as const,
      createdAt: "2026-06-28T00:00:00.000Z",
    })),
  };
}

function renderViewer(d: PublicGameDetail) {
  return render(
    <AuthProvider>
      <KifuViewer detail={d} gameId="g1" />
    </AuthProvider>,
  );
}

describe("KifuViewer", () => {
  it("props で受け取った公開半荘を『読み込み中』なしで描画する", () => {
    renderViewer(detail([kifu()]));
    expect(screen.getByText("公開テスト卓")).toBeTruthy();
    expect(screen.queryByText(/読み込み中/)).toBeNull();
  });

  it("局が無い半荘は空である旨を案内する", () => {
    renderViewer(detail([]));
    expect(screen.getByText(/局がありません/)).toBeTruthy();
  });

  it("局送りで表示局が切り替わる（東一局 → 東二局）", () => {
    renderViewer(detail([kifu(), kifu()]));
    const select = screen.getByLabelText("局を選択") as HTMLSelectElement;
    expect(select.value).toBe("0");
    fireEvent.click(screen.getAllByLabelText("次の局")[0]!);
    expect(select.value).toBe("1");
    fireEvent.click(screen.getAllByLabelText("前の局")[0]!);
    expect(select.value).toBe("0");
  });

  it("手牌表示トグルで相手手牌の表示状態が切り替わる", () => {
    renderViewer(detail([kifu()]));
    const toggle = screen.getByText("手牌表示");
    // 既定は表示（!hideOpp = true）。押すと非表示に切り替わる。
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
  });

  it("ロン: 最後の打牌まで進めても和了はまだ出ず、次ボタンで和了演出（役）が現れる", () => {
    renderViewer(detail([kifuWithAgari()]));
    // 初期の全表示では和了は出さない（リロード時のポップ防止）。
    expect(screen.queryByText("立直")).toBeNull();
    // 1手戻ってから末尾へ進める。到達しただけではまだ出さない（drop を見せる番）。
    fireEvent.click(screen.getByLabelText("1手戻る"));
    fireEvent.click(screen.getByLabelText("1手進む"));
    expect(screen.queryByText("立直")).toBeNull();
    // 次ボタンで和了演出が開く。
    fireEvent.click(screen.getByLabelText("1手進む"));
    expect(screen.getByText("立直")).toBeTruthy();
    // 前ボタンで閉じて盤面へ戻れる。
    fireEvent.click(screen.getByLabelText("1手戻る"));
    expect(screen.queryByText("立直")).toBeNull();
  });

  it("局名は配列位置ではなく局順(seq)から出す（公開サブセット）", () => {
    // seq 1 と 3 だけ公開された半荘。配列位置(gi)基準だと2局目が「東二局」に化ける。
    const d = detail([kifu(), kifu()]);
    d.logs[1]!.seq = 3;
    renderViewer(d);
    fireEvent.click(screen.getAllByLabelText("次の局")[0]!);
    expect(screen.getAllByText("東三局").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("東二局").length).toBe(0);
  });

  it("配牌は理牌して表示する（保存順が乱れていても萬→筒→索→字の順）", () => {
    const d = detail([
      makeKifu({
        east: {
          hand: [
            { tile: "1z", confidence: 1 },
            { tile: "9s", confidence: 1 },
            { tile: "1m", confidence: 1 },
          ],
        },
      }),
    ]);
    const { container } = renderViewer(d);
    const alts = Array.from(container.querySelectorAll('[data-tile="hand"] img'))
      .map((img) => img.getAttribute("alt"))
      .filter((alt) => alt); // Front.svg（alt=""）を除く
    expect(alts).toEqual(["1萬", "9索", "東"]);
  });

  it("再生中の手牌は配牌とtimelineから導出する（手出しで手牌から捨て牌が消える）", () => {
    const d = detail([
      makeKifu(
        {
          east: {
            hand: [
              { tile: "1m", confidence: 1 },
              { tile: "2m", confidence: 1 },
            ],
          },
        },
        {
          timeline: [
            {
              kind: "discard",
              seat: "east",
              draw: "3m",
              tile: "1m",
              tsumogiri: false,
              riichi: false,
              confidence: 1,
            },
          ],
        },
      ),
    ]);
    const { container } = renderViewer(d);
    const alts = Array.from(container.querySelectorAll('[data-tile="hand"] img'))
      .map((img) => img.getAttribute("alt"))
      .filter((alt) => alt);
    expect(alts).toEqual(["2萬", "3萬"]);
  });

  it("リーチ宣言牌まで再生すると供託が増える", () => {
    renderViewer(
      detail([
        makeKifu(
          { east: { hand: [{ tile: "1m", confidence: 1 }] } },
          {
            meta: { dealer: "east", kyotaku: 0 },
            timeline: [
              {
                kind: "discard",
                seat: "east",
                draw: null,
                tile: "1m",
                tsumogiri: false,
                riichi: true,
                confidence: 1,
              },
            ],
          },
        ),
      ]),
    );
    expect(screen.getByText("1本")).toBeTruthy();
  });

  it("公開の半荘は「公開」バッジと共有ボタンを出す", () => {
    renderViewer(detail([kifu()]));
    expect(screen.getByText("公開")).toBeTruthy();
    expect(screen.getByText("共有")).toBeTruthy();
  });

  it("非公開の半荘（所有者の再生）は「非公開」バッジを出し、共有ボタンは出さない", () => {
    renderViewer(detail([kifu()], "private"));
    expect(screen.getByText("非公開")).toBeTruthy();
    expect(screen.queryByText("公開")).toBeNull();
    expect(screen.queryByText("共有")).toBeNull();
  });

  it("1手進めたときだけ直近の打牌に drop-in 演出が付く（初期全表示・巡目ジャンプでは付かない）", () => {
    // 東2打・南1打（親=東）。打牌順は 東→南→東、巡目区切りは [1, 3]。
    const riverTile = (order: number, tile: string) => ({ order, tile, confidence: 1 });
    const d = detail([
      makeKifu({
        east: { river: [riverTile(1, "1m"), riverTile(2, "2m")] },
        south: { river: [riverTile(1, "5p")] },
      }),
    ]);
    const { container } = renderViewer(d);

    // 初期の全表示（reveal=-1）では演出しない（リロード時に毎回動くのを防ぐ）。
    expect(container.querySelector("[data-drop]")).toBeNull();

    // 先頭へ戻す（3→2→1→0手）。戻る操作では演出しない。
    fireEvent.click(screen.getByLabelText("1手戻る"));
    fireEvent.click(screen.getByLabelText("1手戻る"));
    fireEvent.click(screen.getByLabelText("1手戻る"));
    expect(container.querySelector("[data-drop]")).toBeNull();

    // 1手進む（0→1）: 置かれた打牌1枚だけに演出が付く。
    fireEvent.click(screen.getByLabelText("1手進む"));
    expect(container.querySelectorAll("[data-drop]")).toHaveLength(1);

    // 次の巡目（1→3 の2手ジャンプ）: 演出しない。
    fireEvent.click(screen.getByLabelText("次の巡目"));
    expect(container.querySelector("[data-drop]")).toBeNull();
  });

  it("次ボタンで半歩ずつ刻む（1押し目=ツモ牌が右端へ、2押し目=打牌が河へ）。前ボタンは逆", () => {
    const d = detail([
      makeKifu(
        {
          east: {
            hand: [
              { tile: "1m", confidence: 1 },
              { tile: "9p", confidence: 1 },
            ],
          },
        },
        {
          timeline: [
            // 1手目: 3m をツモって 1m を手出し → 手牌 [3m, 9p]（理牌）。
            {
              kind: "discard",
              seat: "east",
              draw: "3m",
              tile: "1m",
              tsumogiri: false,
              riichi: false,
              confidence: 1,
            },
            // 2手目: 4m をツモ切り → 手牌は変わらない。
            {
              kind: "discard",
              seat: "east",
              draw: "4m",
              tile: "4m",
              tsumogiri: true,
              riichi: false,
              confidence: 1,
            },
          ],
        },
      ),
    ]);
    const { container } = renderViewer(d);
    const handAlts = () =>
      Array.from(container.querySelectorAll('[data-tile="hand"]:not([data-tsumo] *) img'))
        .map((img) => img.getAttribute("alt"))
        .filter((alt) => alt);
    const slotAlts = () =>
      Array.from(container.querySelectorAll("[data-tsumo] img"))
        .map((img) => img.getAttribute("alt"))
        .filter((alt) => alt);

    // 初期の全表示では演出しない。
    expect(container.querySelector("[data-draw]")).toBeNull();

    // 先頭へ戻す（半歩も巻き戻る: done(2)→draw(2)→done(1)→draw(1)→done(0)）。
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByLabelText("1手戻る"));

    // 1押し目: 盤面は0手のまま、ツモ牌 3萬 が手牌右端のスロットへフライイン。河にはまだ落ちない。
    fireEvent.click(screen.getByLabelText("1手進む"));
    expect(slotAlts()).toEqual(["3萬"]);
    expect(handAlts()).toEqual(["1萬", "9筒"]);
    expect(container.querySelector("[data-drop]")).toBeNull();

    // 2押し目: 打牌 1萬 が河へ drop し、手牌が理牌される（スロットは消える）。
    fireEvent.click(screen.getByLabelText("1手進む"));
    expect(container.querySelector("[data-tsumo]")).toBeNull();
    expect(handAlts()).toEqual(["3萬", "9筒"]);
    expect(container.querySelectorAll("[data-drop]")).toHaveLength(1);

    // ツモ切りの手も同じ半歩刻み（右端に入ってからそのまま河へ）。
    fireEvent.click(screen.getByLabelText("1手進む"));
    expect(slotAlts()).toEqual(["4萬"]);
    fireEvent.click(screen.getByLabelText("1手進む"));
    expect(container.querySelector("[data-tsumo]")).toBeNull();
    expect(handAlts()).toEqual(["3萬", "9筒"]); // ツモ切りは手牌が変わらない。
    expect(container.querySelectorAll("[data-drop]")).toHaveLength(1);

    // 前ボタンは逆再生: まず打牌を引っ込めてツモ表示に戻る。
    fireEvent.click(screen.getByLabelText("1手戻る"));
    expect(slotAlts()).toEqual(["4萬"]);
    // さらに戻すと前の手の完了状態（スロットなし・河は1枚）。
    fireEvent.click(screen.getByLabelText("1手戻る"));
    expect(container.querySelector("[data-tsumo]")).toBeNull();
    expect(handAlts()).toEqual(["3萬", "9筒"]);
  });

  it("ツモ不明の手（未編集）は半歩なしで1押し=1打牌（従来どおり）", () => {
    const riverTile = (order: number, tile: string) => ({ order, tile, confidence: 1 });
    const d = detail([makeKifu({ east: { river: [riverTile(1, "1m"), riverTile(2, "2m")] } })]);
    const { container } = renderViewer(d);

    fireEvent.click(screen.getByLabelText("1手戻る"));
    fireEvent.click(screen.getByLabelText("1手戻る"));
    // 1押しで打牌が直接河へ（スロットは出ない）。
    fireEvent.click(screen.getByLabelText("1手進む"));
    expect(container.querySelector("[data-tsumo]")).toBeNull();
    expect(container.querySelectorAll("[data-drop]")).toHaveLength(1);
  });

  it("ツモ和了: 次ボタンで和了牌をツモり（右端へ）、もう一度押すと和了演出が開く", () => {
    const d = detail([
      makeKifu(
        {
          east: {
            // 撮影スナップショット手牌（和了牌 5p を含む）。理牌後 [1m,2m,5p]。
            hand: [
              { tile: "1m", confidence: 1 },
              { tile: "5p", confidence: 1 },
              { tile: "2m", confidence: 1 },
            ],
            river: [{ order: 1, tile: "9m", confidence: 1 }],
          },
        },
        {
          result: "tsumo",
          agari: [{ winner: "east", winTile: "5p", yaku: [{ name: "門前清自摸和", han: 1 }] }],
        },
      ),
    ]);
    const { container } = renderViewer(d);
    const alts = (selector: string) =>
      Array.from(container.querySelectorAll(`${selector} img`))
        .map((img) => img.getAttribute("alt"))
        .filter((alt) => alt);
    const handAlts = () => alts('[data-tile="hand"]:not([data-tsumo] *)');

    // 初期の全表示では出さない（最初から和了牌が離れて見える誤表示をしない）。
    // スナップショット手牌（14枚型）でも和了牌は手牌本体に混ぜない（ツモる前は13枚型で見せる）。
    expect(container.querySelector("[data-tsumo]")).toBeNull();
    expect(handAlts()).toEqual(["1萬", "2萬"]);

    // 末尾で次ボタン → 和了牌 5筒 をツモる（手牌本体と別枠 data-tsumo に出る）。
    fireEvent.click(screen.getByLabelText("1手進む"));
    expect(container.querySelectorAll("[data-tsumo]")).toHaveLength(1);
    // 中央からのフライイン演出が掛かる（flyIn の検証フック data-draw）。
    expect(container.querySelector("[data-tsumo] [data-draw]")).toBeTruthy();
    expect(alts("[data-tsumo]")).toEqual(["5筒"]);
    // 手牌本体は13枚型のまま（河には捨てられない）。
    expect(handAlts()).toEqual(["1萬", "2萬"]);
    // ツモった時点では和了演出はまだ。
    expect(screen.queryByText("門前清自摸和")).toBeNull();

    // もう一度次ボタン → 和了演出が開く（和了牌は出たまま）。
    fireEvent.click(screen.getByLabelText("1手進む"));
    expect(screen.getByText("門前清自摸和")).toBeTruthy();
    // 和了演出には和了牌単体ではなく、和了牌を含めた手牌すべてを理牌して出す
    //（末尾が白枠強調の和了牌 5筒。data-agari-hand / data-agari-win は検証フック）。
    expect(alts("[data-agari-hand]")).toEqual(["1萬", "2萬", "5筒"]);
    expect(alts("[data-agari-win]")).toEqual(["5筒"]);

    // 前ボタンで逆再生: 演出を閉じる → 和了牌を引っ込める。
    fireEvent.click(screen.getByLabelText("1手戻る"));
    expect(screen.queryByText("門前清自摸和")).toBeNull();
    expect(container.querySelector("[data-tsumo]")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("1手戻る"));
    expect(container.querySelector("[data-tsumo]")).toBeNull();
  });

  it("卓中央にはドラを表示し、ツモ表示は出さない（ツモはフライイン演出で分かる）", () => {
    const d = detail([
      makeKifu(
        { east: { hand: [{ tile: "1m", confidence: 1 }] } },
        {
          meta: { dealer: "east", dora: ["5z"] },
          timeline: [
            {
              kind: "discard",
              seat: "east",
              draw: "3m",
              tile: "1m",
              tsumogiri: false,
              riichi: false,
              confidence: 1,
            },
          ],
        },
      ),
    ]);
    const { container } = renderViewer(d);
    const center = container.querySelector("[data-center]")!;

    // ドラ（白=5z）が中央に出る。
    const alts = Array.from(center.querySelectorAll("img"))
      .map((img) => img.getAttribute("alt"))
      .filter((alt) => alt);
    expect(alts).toContain("白");

    // 1手進めて activeDraw がある状態でも、中央に「ツモ」表示は出さない。
    fireEvent.click(screen.getByLabelText("1手戻る"));
    fireEvent.click(screen.getByLabelText("1手進む"));
    expect(container.querySelector("[data-center]")!.textContent).not.toContain("ツモ");
  });

  it("和了ダイアログにドラ表示牌と裏ドラ表示牌（リーチ和了時）を出す", () => {
    const d = detail([
      makeKifu(
        { east: { river: [{ order: 1, tile: "1m", riichi: true, confidence: 1 }] } },
        {
          meta: { dealer: "east", dora: ["5z"], uraDora: ["6z"] },
          result: "ron",
          agari: [
            {
              winner: "east",
              from: "south",
              winTile: "3m",
              riichi: ["east"],
              yaku: [{ name: "立直", han: 1 }],
              ura: 1,
              fu: 40,
            },
          ],
        },
      ),
    ]);
    const { container } = renderViewer(d);
    const alts = (sel: string) =>
      Array.from(container.querySelectorAll(`${sel} img`))
        .map((img) => img.getAttribute("alt"))
        .filter((alt) => alt);

    // 末尾まで進めて和了ダイアログを開く。
    fireEvent.click(screen.getByLabelText("1手戻る"));
    fireEvent.click(screen.getByLabelText("1手進む"));
    fireEvent.click(screen.getByLabelText("1手進む"));
    expect(screen.getByText("立直")).toBeTruthy();

    // ドラ表示牌（白）と裏ドラ表示牌（發）が牌グリフで出る。
    expect(alts("[data-agari-dora]")).toEqual(["白"]);
    expect(alts("[data-agari-ura]")).toEqual(["發"]);
  });

  it("ネームプレートで視点を切り替えられる（選んだ席が手前へ回り、撮影者名は元の席に付いたまま）", () => {
    const { container } = renderViewer(detail([kifu()]));
    const bottomPlate = () =>
      container.querySelector('[data-seat="bottom"]')!.textContent as string;

    // 既定は撮影者席（東）が手前で、撮影者名が付く。
    expect(bottomPlate()).toContain("太郎");
    expect(bottomPlate()).toContain("東");

    // 南家の視点へ切り替えると南が手前に回る。撮影者名は手前から外れ、東家に付いたまま。
    fireEvent.click(screen.getByLabelText("南家の視点にする"));
    expect(bottomPlate()).toContain("南");
    expect(bottomPlate()).not.toContain("太郎");
    expect(container.textContent).toContain("太郎");

    // 東家の視点に戻せる。
    fireEvent.click(screen.getByLabelText("東家の視点にする"));
    expect(bottomPlate()).toContain("太郎");
  });

  it("サイドパネルで半荘ルールを確認できる（プリセット名＋各項目の値）", () => {
    renderViewer(detail([kifu()]));
    // 見出しに一致プリセット名（既定ルール＝Mリーグ相当）。
    expect(screen.getByText("ルール（Mリーグ）")).toBeTruthy();
    // 項目名と値のペアが出る（値ラベルは共有の ruleSummaryRows 由来）。
    expect(screen.getByText("切り上げ満貫")).toBeTruthy();
    expect(screen.getByText("ウマ")).toBeTruthy();
    expect(screen.getByText("10-30")).toBeTruthy();
    expect(screen.getByText("喰いタン")).toBeTruthy();
  });

  it("本場は牌譜の実データを表示する（ハードコードしない）", () => {
    renderViewer(detail([makeKifu({}, { meta: { dealer: "east", honba: 2 } })]));
    // 卓中央・サイドパネルとも実データ（2本場）。ハードコードの「0本場」が残っていないこと。
    expect(screen.getAllByText("2本場").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("0本場")).toBeNull();
  });
});
