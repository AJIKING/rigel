"use client";

import { playersFromInput, playersToInput } from "@rigel/ui";
import type { Kifu, Players, Seat } from "@rigel/schema";
import { useRef, useState } from "react";
import { updateGamePlayersAction } from "../../app/actions";

/**
 * 盤面エディタの選手情報フォーム（名前・持ちポイント）の状態と保存。
 *
 * 半荘単位の情報なので保存先も牌譜本体とは別 API（updateGamePlayersAction）で、
 * 保存の起点も「入力欄の blur」という暗黙のもの。BoardEditor 本体に置くと
 * 牌の編集や局の保存と状態が混ざるので、1つの関心として切り出している。
 *
 * blur のたびに投げないよう、直前に保存した内容を覚えて同一なら何もしない。
 */
export function usePlayersForm(opts: {
  gameId: string;
  initialPlayers: Players | null;
  /** ローカルの牌譜ドラフトへも反映する（後続の本体保存・表示との整合のため）。 */
  mutate: (fn: (draft: Kifu) => void) => void;
  /** 保存に失敗したときのエラー表示（本体保存と同じ場所に出す）。 */
  onError: (message: string) => void;
}) {
  const initial = playersToInput(opts.initialPlayers);
  const [showPoints, setShowPoints] = useState(false);
  const [names, setNames] = useState<Record<Seat, string>>({
    east: initial.east.name,
    south: initial.south.name,
    west: initial.west.name,
    north: initial.north.name,
  });
  const [points, setPoints] = useState<Record<Seat, string>>({
    east: initial.east.points,
    south: initial.south.points,
    west: initial.west.points,
    north: initial.north.points,
  });
  // 入力欄の blur ごとに保存するので、直前の保存内容と同じなら投げない。
  const lastSaved = useRef(JSON.stringify(opts.initialPlayers));
  const [message, setMessage] = useState<string | null>(null);

  function save() {
    // 入力→Players（全席が空なら null）は共有ヘルパ（mobile の PlayersSheet と同一）。
    const players = playersFromInput({
      east: { name: names.east, points: points.east },
      south: { name: names.south, points: points.south },
      west: { name: names.west, points: points.west },
      north: { name: names.north, points: points.north },
    });
    const key = JSON.stringify(players);
    if (key === lastSaved.current) return;
    lastSaved.current = key;
    setMessage(null);
    void updateGamePlayersAction(opts.gameId, players)
      .then((res) => {
        if (!res.ok) {
          opts.onError("選手情報の保存に失敗しました。");
          return;
        }
        // blur 保存は暗黙なので、成功を明示する（本体保存の「保存しました」と同じ流儀）。
        setMessage("選手情報を保存しました");
        setTimeout(() => setMessage(null), 2000);
      })
      .catch(() => opts.onError("通信に失敗しました。"));
    opts.mutate((d) => {
      d.players = players;
    });
  }

  return { showPoints, setShowPoints, names, setNames, points, setPoints, message, save };
}
