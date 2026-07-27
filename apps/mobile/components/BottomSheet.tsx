import { useRef } from "react";
import {
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type DimensionValue,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius } from "../lib/theme";

/**
 * 下からのシート共通枠（PlanSheet / AgariSheet / KifuPlayer の情報シート）。
 * backdrop=true なら背景を暗くしてタップで閉じる。false のときは overlay が
 * 下の UI へのタップを塞がないよう box-none にする。
 * grabber=つまみ（タップ、または下スワイプで閉じる）。
 */
export function BottomSheet({
  onClose,
  children,
  maxHeight = "88%",
  backdrop = true,
  grabber = true,
}: {
  onClose: () => void;
  children: React.ReactNode;
  maxHeight?: DimensionValue;
  backdrop?: boolean;
  grabber?: boolean;
}) {
  // つまみを下にスワイプしたら閉じる（PanResponder は RN 標準。新規依存なし）。
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 8 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5,
      onPanResponderRelease: (_, g) => {
        if (g.dy > 50) onCloseRef.current();
      },
    }),
  ).current;

  // 画面下端に張り付くシートなので、ホームインジケータ（iPhone で 34pt）ぶん下パディングを
  // 広げて保存ボタン等が重ならないようにする（TabBar と同じ insets 対応。最低 24 は従来値）。
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.overlay} pointerEvents={backdrop ? "auto" : "box-none"}>
      {backdrop ? (
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="閉じる（背景）" />
      ) : null}
      {/* キーボードが出たらシートごと持ち上げ、入力欄や保存ボタンが隠れないようにする
          （PlayersSheet 等の全シートをここ1箇所で救う）。maxHeight は KAV 側に置き、
          card は 100% で従わせる（KAV は高さ auto のため % 指定が効かない）。 */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ maxHeight }}
      >
        <View
          style={[styles.card, { paddingBottom: Math.max(24, insets.bottom + 12) }]}
          testID="bottom-sheet-card"
        >
          {grabber ? (
            <Pressable
              style={styles.handle}
              onPress={onClose}
              accessibilityLabel="シートを閉じる"
              {...pan.panHandlers}
            >
              <View style={styles.grabber} />
            </Pressable>
          ) : null}
          {children}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

/** シート下部の「閉じる」ボタン（各シートで共通の見た目）。 */
export function SheetCloseButton({
  onPress,
  label = "閉じる",
}: {
  onPress: () => void;
  label?: string;
}) {
  return (
    <Pressable style={styles.close} onPress={onPress} accessibilityRole="button">
      <Text style={styles.closeText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, zIndex: 40, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(8,10,13,0.66)" },
  card: {
    maxHeight: "100%",
    backgroundColor: colors.chrome,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    paddingHorizontal: 16,
    paddingTop: 10,
    // paddingBottom はセーフエリア対応のため描画時に動的指定（max(24, insets.bottom+12)）。
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -10 },
  },
  handle: { paddingVertical: 6, alignItems: "center" },
  grabber: { width: 38, height: 4, borderRadius: 99, backgroundColor: colors.w45 },
  close: {
    marginTop: 14,
    alignSelf: "center",
    paddingVertical: 10,
    paddingHorizontal: 28,
    borderRadius: radius.base,
    borderWidth: 1,
    borderColor: colors.line,
  },
  closeText: { color: colors.w70, fontWeight: "700" },
});
