import { A11Y_LABELS, MY_LIST_SORTS, type MyListSortKey, type MyListStatusOption } from "@rigel/ui";
import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { colors, radius } from "../lib/theme";
import { BottomSheet, SheetCloseButton } from "./BottomSheet";

/**
 * マイページ（牌譜 / 何切る / お気に入り）で共通のツールバー（web の MyListToolbar と対）。
 * [決定] 2026-07-29 オーナー（2026-07-26 の形を再設計）:
 * - 並び順は3択セグメントではなく「現在値ボタン＋ボトムシート」で選ぶ（幅を取らない）
 * - お気に入り絞り込みはラベル付きチップ（アイコン単体では役割が伝わらなかった）。
 *   カードの★（付け外し）とは役割が別なので、読み上げ名は「お気に入りのみ表示」
 * - お気に入りタブは onFavOnly を渡さない＝チップを出さない（全部お気に入りなので無意味）
 * - 右端の action スロットに各タブの主要アクション（＋新規）を置き、タブ間で並びを統一する
 */
export function MyListToolbar({
  sort,
  onSort,
  statusLabel,
  statusOptions,
  status,
  onStatus,
  favOnly,
  onFavOnly,
  action,
}: {
  sort: MyListSortKey;
  onSort: (value: MyListSortKey) => void;
  /** 状態フィルタ（web MyListToolbar の statusOptions と対）。省略時は非表示。 */
  statusLabel?: string;
  statusOptions?: readonly MyListStatusOption[];
  status?: string;
  onStatus?: (value: string) => void;
  favOnly?: boolean;
  onFavOnly?: (value: boolean) => void;
  /** 右端に置く主要アクション（＋新規など）。省略可。 */
  action?: ReactNode;
}) {
  const [sortOpen, setSortOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const current = MY_LIST_SORTS.find((s) => s.key === sort)?.label ?? "";
  const currentStatus = statusOptions?.find((o) => o.value === status)?.label ?? "";
  const showStatus = !!statusOptions && statusOptions.length > 0 && !!onStatus;

  return (
    // シートは行の「外」に置く（BottomSheet の overlay は absoluteFill = 親基準。
    // 行内に置くと行のサイズに閉じ込められて崩れる。親は各画面のルート View 想定）。
    <>
      <View style={styles.row} testID="mylist-toolbar-row">
        <Pressable
          style={styles.sortBtn}
          onPress={() => setSortOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={A11Y_LABELS.sort}
        >
          <Text style={styles.sortText} numberOfLines={1}>
            {current} ▾
          </Text>
        </Pressable>

        {showStatus ? (
          <Pressable
            style={styles.sortBtn}
            onPress={() => setStatusOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={statusLabel ?? "状態で絞り込み"}
          >
            <Text style={styles.sortText} numberOfLines={1}>
              {currentStatus} ▾
            </Text>
          </Pressable>
        ) : null}

        {onFavOnly ? (
          <Pressable
            style={[styles.fav, favOnly && styles.favOn]}
            onPress={() => onFavOnly(!favOnly)}
            accessibilityRole="button"
            accessibilityLabel={A11Y_LABELS.favoriteOnly}
            accessibilityState={{ selected: !!favOnly }}
            hitSlop={6}
          >
            <Svg width={12} height={12} viewBox="0 0 24 24" fill={favOnly ? colors.accent : "none"}>
              <Path
                d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.6 9.7l5.8-.8z"
                stroke={favOnly ? colors.accent : colors.w70}
                strokeWidth={1.8}
                strokeLinejoin="round"
              />
            </Svg>
            <Text style={[styles.favText, favOnly && styles.favTextOn]}>お気に入り</Text>
          </Pressable>
        ) : null}

        {action ? <View style={styles.action}>{action}</View> : null}
      </View>

      {statusOpen && statusOptions ? (
        <BottomSheet onClose={() => setStatusOpen(false)} maxHeight="60%">
          <Text style={styles.sheetTitle}>{statusLabel ?? "状態で絞り込み"}</Text>
          {statusOptions.map((o) => (
            <Pressable
              key={o.value}
              style={[styles.opt, o.value === status && styles.optOn]}
              onPress={() => {
                onStatus?.(o.value);
                setStatusOpen(false);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: o.value === status }}
            >
              <Text style={[styles.optText, o.value === status && styles.optTextOn]}>
                {o.label}
              </Text>
              {o.value === status ? <Text style={styles.optCheck}>✓</Text> : null}
            </Pressable>
          ))}
          <SheetCloseButton onPress={() => setStatusOpen(false)} />
        </BottomSheet>
      ) : null}

      {sortOpen ? (
        <BottomSheet onClose={() => setSortOpen(false)} maxHeight="60%">
          <Text style={styles.sheetTitle}>並び替え</Text>
          {MY_LIST_SORTS.map((s) => (
            <Pressable
              key={s.key}
              style={[styles.opt, s.key === sort && styles.optOn]}
              onPress={() => {
                onSort(s.key);
                setSortOpen(false);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: s.key === sort }}
            >
              <Text style={[styles.optText, s.key === sort && styles.optTextOn]}>{s.label}</Text>
              {s.key === sort ? <Text style={styles.optCheck}>✓</Text> : null}
            </Pressable>
          ))}
          <SheetCloseButton onPress={() => setSortOpen(false)} />
        </BottomSheet>
      ) : null}
    </>
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
  sortBtn: {
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: radius.base,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.chrome2,
  },
  sortText: { color: colors.w70, fontWeight: "800", fontSize: 12 },
  fav: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 9,
    paddingHorizontal: 11,
    borderRadius: radius.base,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.chrome2,
  },
  favOn: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  favText: { color: colors.w70, fontWeight: "800", fontSize: 12 },
  favTextOn: { color: colors.accent },
  // 主要アクションは右端（タブ間で位置を統一）。
  action: { marginLeft: "auto" },
  sheetTitle: { color: colors.white, fontSize: 15, fontWeight: "800", marginBottom: 10 },
  opt: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 13,
    paddingHorizontal: 12,
    borderRadius: radius.base,
  },
  optOn: { backgroundColor: colors.accentSoft },
  optText: { color: colors.w70, fontSize: 13.5, fontWeight: "700" },
  optTextOn: { color: colors.accent },
  optCheck: { color: colors.accent, fontSize: 13.5, fontWeight: "800" },
});
