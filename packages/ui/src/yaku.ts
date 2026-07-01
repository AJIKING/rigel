// 役カタログ（点数計算の入力補助。役の自動判定はせず、人がこの一覧から選ぶ）。
// han = 門前時の飜、openHan = 鳴き時の飜（食い下がり。0 = 門前限定で鳴くと不成立）。
// 役満は han=13（ダブル役満は倍加ルールで別途扱う想定）。

export type YakuGroup = "門前" | "鳴き可" | "役満";

export interface YakuDef {
  name: string;
  /** 門前時の飜（役満は13）。 */
  han: number;
  /** 鳴き時の飜（食い下がり）。0 = 門前限定（鳴くと不成立）。 */
  openHan: number;
  group: YakuGroup;
}

const YAKUMAN = 13;

/** 役の一覧（一般的な採用役）。 */
export const YAKU_CATALOG: readonly YakuDef[] = [
  // 門前限定
  { name: "立直", han: 1, openHan: 0, group: "門前" },
  { name: "ダブル立直", han: 2, openHan: 0, group: "門前" },
  { name: "一発", han: 1, openHan: 0, group: "門前" },
  { name: "門前清自摸和", han: 1, openHan: 0, group: "門前" },
  { name: "平和", han: 1, openHan: 0, group: "門前" },
  { name: "一盃口", han: 1, openHan: 0, group: "門前" },
  { name: "七対子", han: 2, openHan: 0, group: "門前" },
  { name: "二盃口", han: 3, openHan: 0, group: "門前" },
  // 鳴き可（食い下がりあり／なし）
  { name: "断幺九", han: 1, openHan: 1, group: "鳴き可" },
  { name: "自風", han: 1, openHan: 1, group: "鳴き可" },
  { name: "場風", han: 1, openHan: 1, group: "鳴き可" },
  { name: "役牌 白", han: 1, openHan: 1, group: "鳴き可" },
  { name: "役牌 發", han: 1, openHan: 1, group: "鳴き可" },
  { name: "役牌 中", han: 1, openHan: 1, group: "鳴き可" },
  { name: "海底摸月", han: 1, openHan: 1, group: "鳴き可" },
  { name: "河底撈魚", han: 1, openHan: 1, group: "鳴き可" },
  { name: "嶺上開花", han: 1, openHan: 1, group: "鳴き可" },
  { name: "槍槓", han: 1, openHan: 1, group: "鳴き可" },
  { name: "三色同順", han: 2, openHan: 1, group: "鳴き可" },
  { name: "一気通貫", han: 2, openHan: 1, group: "鳴き可" },
  { name: "混全帯幺九", han: 2, openHan: 1, group: "鳴き可" },
  { name: "対々和", han: 2, openHan: 2, group: "鳴き可" },
  { name: "三暗刻", han: 2, openHan: 2, group: "鳴き可" },
  { name: "三色同刻", han: 2, openHan: 2, group: "鳴き可" },
  { name: "三槓子", han: 2, openHan: 2, group: "鳴き可" },
  { name: "混老頭", han: 2, openHan: 2, group: "鳴き可" },
  { name: "小三元", han: 2, openHan: 2, group: "鳴き可" },
  { name: "純全帯幺九", han: 3, openHan: 2, group: "鳴き可" },
  { name: "混一色", han: 3, openHan: 2, group: "鳴き可" },
  { name: "清一色", han: 6, openHan: 5, group: "鳴き可" },
  // 役満
  { name: "天和", han: YAKUMAN, openHan: 0, group: "役満" },
  { name: "地和", han: YAKUMAN, openHan: 0, group: "役満" },
  { name: "国士無双", han: YAKUMAN, openHan: 0, group: "役満" },
  { name: "四暗刻", han: YAKUMAN, openHan: 0, group: "役満" },
  { name: "大三元", han: YAKUMAN, openHan: YAKUMAN, group: "役満" },
  { name: "字一色", han: YAKUMAN, openHan: YAKUMAN, group: "役満" },
  { name: "緑一色", han: YAKUMAN, openHan: YAKUMAN, group: "役満" },
  { name: "清老頭", han: YAKUMAN, openHan: YAKUMAN, group: "役満" },
  { name: "小四喜", han: YAKUMAN, openHan: YAKUMAN, group: "役満" },
  { name: "大四喜", han: YAKUMAN, openHan: YAKUMAN, group: "役満" },
  { name: "九蓮宝燈", han: YAKUMAN, openHan: 0, group: "役満" },
  { name: "四槓子", han: YAKUMAN, openHan: YAKUMAN, group: "役満" },
];

/** 役の飜を返す（open=鳴きあり）。門前限定役を鳴きで選ぶと 0（不成立）。 */
export function yakuHan(def: YakuDef, open: boolean): number {
  return open ? def.openHan : def.han;
}

/** グループ別に役を分類する（ダイアログのグループ表示用）。 */
export function yakuByGroup(): Record<YakuGroup, YakuDef[]> {
  const groups: Record<YakuGroup, YakuDef[]> = { 門前: [], 鳴き可: [], 役満: [] };
  for (const y of YAKU_CATALOG) groups[y.group].push(y);
  return groups;
}
