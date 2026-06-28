import { type ReadTile, type Tile as TileCode } from "@rigel/schema";
import { Tile } from "../../components/Tile";

function Cell({ read, riichi, caption }: { read: ReadTile; riichi?: boolean; caption: string }) {
  return (
    <div
      style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", width: 46 }}
    >
      <Tile read={read} riichi={riichi} />
      <small style={{ color: "#999", fontSize: 10 }}>{caption}</small>
    </div>
  );
}

function Section({ title, codes }: { title: string; codes: TileCode[] }) {
  return (
    <section style={{ marginBottom: 16 }}>
      <h2 style={{ fontSize: 14, color: "#555", margin: "0 0 6px" }}>{title}</h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {codes.map((tile) => (
          <Cell key={tile} read={{ tile, confidence: 1 }} caption={tile} />
        ))}
      </div>
    </section>
  );
}

const MAN = ["1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "0m"] as TileCode[];
const PIN = ["1p", "2p", "3p", "4p", "5p", "6p", "7p", "8p", "9p", "0p"] as TileCode[];
const SOU = ["1s", "2s", "3s", "4s", "5s", "6s", "7s", "8s", "9s", "0s"] as TileCode[];
const HONORS = ["1z", "2z", "3z", "4z", "5z", "6z", "7z"] as TileCode[];

export default function TilesPreviewPage() {
  return (
    <div>
      <h1>牌デザイン プレビュー（SVG 自前・簡易フェイス）</h1>
      <p style={{ color: "#777", fontSize: 13 }}>
        @rigel/ui の tileFace 仕様を web の Tile コンポーネント（&lt;svg&gt;）で描画。
      </p>

      <Section title="萬子（赤=0m）" codes={MAN} />
      <Section title="筒子（赤=0p）" codes={PIN} />
      <Section title="索子（赤=0s）" codes={SOU} />
      <Section title="字牌（東南西北白發中）" codes={HONORS} />

      <section>
        <h2 style={{ fontSize: 14, color: "#555", margin: "0 0 6px" }}>状態</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <Cell read={{ tile: "5m", confidence: 0.98 }} caption="通常" />
          <Cell read={{ tile: "3m", confidence: 0.4 }} caption="要確認(低)" />
          <Cell read={{ tile: null, confidence: 0 }} caption="不明" />
          <Cell read={{ tile: "1z", confidence: 0.95 }} riichi caption="リーチ" />
          <Cell read={{ tile: "0p", confidence: 0.9 }} caption="赤ドラ" />
        </div>
      </section>
    </div>
  );
}
