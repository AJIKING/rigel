import { gamePhotoPath, type GamePhotoMeta } from "@rigel/client";
import { cameraLabel } from "@rigel/ui";
import { useEffect, useState } from "react";
import { Image, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { listGamePhotos, API_BASE_URL } from "../lib/api";
import { colors, radius } from "../lib/theme";
import { BottomSheet } from "./BottomSheet";

/** 写真ラベル（河=卓全景、手牌はカメラ相対位置。web GamePhotosModal と同一文言）。 */
function photoLabel(p: GamePhotoMeta): string {
  if (p.kind === "river") return "卓全景（河）";
  return `手牌：${cameraLabel(p.kind.replace("hand_", "") as "bottom" | "right" | "top" | "left")}`;
}

/**
 * 半荘の元写真シート（恒久保存・所有者のみ。photo-retention.md）。
 * バイトは API へ認証ヘッダ付きで直接取りに行く（RN Image は headers を渡せる）。
 */
export function GamePhotosSheet({
  gameId,
  token,
  onClose,
}: {
  gameId: string;
  token: string;
  onClose: () => void;
}) {
  const [photos, setPhotos] = useState<GamePhotoMeta[] | null>(null);
  const [failed, setFailed] = useState(false);
  const { width } = useWindowDimensions();
  // シート内いっぱい・4:3 で見せる（原寸比率は取得後不明なので固定比率のカバー表示）。
  const imgW = Math.min(width - 32, 560);

  useEffect(() => {
    let alive = true;
    listGamePhotos(token, gameId)
      .then((p) => {
        if (alive) setPhotos(p ?? []);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [token, gameId]);

  return (
    <BottomSheet onClose={onClose} maxHeight="90%">
      <Text style={styles.title}>元写真</Text>
      <ScrollView contentContainerStyle={styles.body}>
        {failed ? (
          <Text style={styles.note}>写真を読み込めませんでした。</Text>
        ) : photos === null ? (
          <Text style={styles.note}>読み込み中…</Text>
        ) : photos.length === 0 ? (
          <Text style={styles.note}>
            この半荘に元写真はありません（写真AI再現で作成した半荘に残ります）。
          </Text>
        ) : (
          photos.map((p) => (
            <View key={`${p.jobId}/${p.kind}`} style={styles.item}>
              <Image
                source={{
                  uri: `${API_BASE_URL}${gamePhotoPath(gameId, p)}`,
                  headers: { Authorization: `Bearer ${token}` },
                }}
                style={{ width: imgW, height: (imgW * 3) / 4, borderRadius: radius.base }}
                resizeMode="contain"
                accessibilityLabel={photoLabel(p)}
              />
              <Text style={styles.caption}>{photoLabel(p)}</Text>
            </View>
          ))
        )}
        <Text style={styles.note}>
          元写真はあなたにだけ表示されます（公開半荘でも公開されません）。
        </Text>
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.white, fontSize: 16, fontWeight: "800", marginBottom: 10 },
  body: { gap: 12, paddingBottom: 24 },
  item: { gap: 4 },
  caption: { color: colors.w45, fontSize: 11 },
  note: { color: colors.w45, fontSize: 12, lineHeight: 18 },
});
