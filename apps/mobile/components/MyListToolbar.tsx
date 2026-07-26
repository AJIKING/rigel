import { MY_LIST_SORTS, type MyListSortKey } from "@rigel/ui";
import { Pressable, StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { colors, radius } from "../lib/theme";
import { Segment } from "./Segment";

/** 並べ替えセグメントの選択肢（[値, 表示ラベル]）。選択肢は @rigel/ui で web と共通定義。 */
const SORT_OPTIONS = MY_LIST_SORTS.map((s) => [s.key, s.label] as const);

/**
 * マイページ（牌譜 / 何切る / お気に入り）で共通のツールバー。
 * 並べ替え（新しい順・古い順・お気に入りが多い順）＋「お気に入りのみ」トグルを
 * どのセグメントでも同じ形・同じ順序で出す（[決定] 2026-07-26。web の MyListToolbar と対）。
 * お気に入りは状態の絞り込みと混ぜず独立トグルにして、掛け合わせられるようにする。
 */
export function MyListToolbar({
  sort,
  onSort,
  favOnly,
  onFavOnly,
}: {
  sort: MyListSortKey;
  onSort: (value: MyListSortKey) => void;
  favOnly: boolean;
  onFavOnly: (value: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <Segment options={SORT_OPTIONS} value={sort} onChange={onSort} compact />
      <Pressable
        style={[styles.fav, favOnly && styles.favOn]}
        onPress={() => onFavOnly(!favOnly)}
        accessibilityRole="button"
        accessibilityLabel="お気に入りのみ表示"
        accessibilityState={{ selected: favOnly }}
        hitSlop={6}
      >
        <Svg width={13} height={13} viewBox="0 0 24 24" fill={favOnly ? colors.accent : "none"}>
          <Path
            d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.6 9.7l5.8-.8z"
            stroke={favOnly ? colors.accent : colors.w70}
            strokeWidth={1.8}
            strokeLinejoin="round"
          />
        </Svg>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  fav: {
    width: 38,
    paddingVertical: 9,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.base,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.chrome2,
  },
  favOn: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
});
