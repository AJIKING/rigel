import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { CenterState } from "../components/CenterState";
import { KifuCard } from "../components/KifuCard";
import { getPublicProfile, type PublicProfile } from "../lib/api";
import { relativeTime } from "../lib/format";
import type { RootStackParamList } from "../lib/navigation";
import { colors } from "../lib/theme";
import { useFavorites } from "../lib/use-favorites";

type Nav = NativeStackNavigationProp<RootStackParamList, "PublicUser">;

/** 公開ユーザーページ（web /u/[handle] の UserPageShell と対。認証不要。Phase D）。 */
export function PublicUserScreen() {
  const nav = useNavigation<Nav>();
  const { idOrHandle } = useRoute<RouteProp<RootStackParamList, "PublicUser">>().params;
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "notfound">("loading");
  // ★はサーバー保存。カードの値に、この画面での操作を重ねる（他画面と同じ流儀）。
  const { apply, toggle: toggleFav, error: favError } = useFavorites();

  useEffect(() => {
    let active = true;
    getPublicProfile(idOrHandle)
      .then((p) => {
        if (!active) return;
        setProfile(p);
        setState(p ? "ok" : "notfound");
      })
      .catch(() => active && setState("notfound"));
    return () => {
      active = false;
    };
  }, [idOrHandle]);

  if (state === "loading") return <CenterState loading />;
  if (state === "notfound" || !profile) {
    return <CenterState message="このユーザーは見つからないか、非公開です。" />;
  }

  return (
    <View style={styles.root}>
      <View style={styles.head}>
        <Text style={styles.name}>{profile.displayName || profile.handle || "名無しユーザー"}</Text>
        <Text style={styles.handle}>@{profile.handle ?? profile.id.slice(0, 6)}</Text>
      </View>
      <Text style={styles.section}>公開牌譜</Text>
      {favError ? <Text style={styles.err}>{favError}</Text> : null}
      {profile.games.length === 0 ? (
        <CenterState message="公開されている牌譜がまだありません。" />
      ) : (
        <FlatList
          data={apply(profile.games)}
          keyExtractor={(g) => g.id}
          contentContainerStyle={styles.feed}
          renderItem={({ item }) => (
            <KifuCard
              title={item.title || "（無題の半荘）"}
              metaParts={[relativeTime(item.createdAt), `${item.kyokuCount}局`]}
              fav={item.viewerFaved}
              favCount={item.favoriteCount}
              onToggleFav={() => toggleFav("game", item)}
              onPress={() =>
                nav.navigate("PublicGame", { gameId: item.id, logId: item.firstLogId })
              }
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  head: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6, gap: 2 },
  name: { color: colors.white, fontSize: 18, fontWeight: "800" },
  handle: { color: colors.w45, fontSize: 12.5 },
  section: {
    color: colors.w70,
    fontSize: 12.5,
    fontWeight: "800",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
  },
  err: { color: colors.danger, fontSize: 12, paddingHorizontal: 16, paddingBottom: 4 },
  feed: { paddingHorizontal: 16, paddingTop: 2, paddingBottom: 20, gap: 10 },
});
