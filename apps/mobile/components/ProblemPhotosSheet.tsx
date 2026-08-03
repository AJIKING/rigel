import { problemPhotoPath, type ProblemPhotoMeta, type ProblemPhotoRef } from "@rigel/client";
import { useEffect, useState } from "react";
import { Image, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { listProblemPhotos, API_BASE_URL } from "../lib/api";
import { colors, radius } from "../lib/theme";
import { BottomSheet } from "./BottomSheet";

/** 写真ラベル（web ProblemPhotosModal と同一文言）。 */
function photoLabel(p: ProblemPhotoMeta): string {
  return p.kind === "hand" ? "自分の手牌" : "河（卓全景）";
}

/**
 * 何切るの元写真シート（恒久保存・所有者のみ。photo-retention.md）。
 * バイトは API へ認証ヘッダ付きで直接取りに行く（GamePhotosSheet と同じ流儀）。
 */
export function ProblemPhotosSheet({
  refValue,
  token,
  onClose,
}: {
  refValue: ProblemPhotoRef;
  token: string;
  onClose: () => void;
}) {
  const [photos, setPhotos] = useState<ProblemPhotoMeta[] | null>(null);
  const [failed, setFailed] = useState(false);
  const { width } = useWindowDimensions();
  const imgW = Math.min(width - 32, 560);
  const refKey = "problemId" in refValue ? refValue.problemId : refValue.draftId;
  const refType = "problemId" in refValue ? "problem" : "draft";

  useEffect(() => {
    let alive = true;
    const ref: ProblemPhotoRef =
      refType === "problem" ? { problemId: refKey } : { draftId: refKey };
    listProblemPhotos(token, ref)
      .then((p) => {
        if (alive) setPhotos(p ?? []);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [token, refKey, refType]);

  return (
    <BottomSheet onClose={onClose} maxHeight="90%">
      <Text style={styles.title}>元写真</Text>
      <ScrollView contentContainerStyle={styles.body}>
        {failed ? (
          <Text style={styles.note}>写真を読み込めませんでした。</Text>
        ) : photos === null ? (
          <Text style={styles.note}>読み込み中…</Text>
        ) : photos.length === 0 ? (
          <Text style={styles.note}>この問題に元写真はありません。</Text>
        ) : (
          photos.map((p) => (
            <View key={`${p.jobId}/${p.kind}`} style={styles.item}>
              <Image
                source={{
                  uri: `${API_BASE_URL}${problemPhotoPath(refValue, p)}`,
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
          元写真はあなたにだけ表示されます（公開しても公開されません）。
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
