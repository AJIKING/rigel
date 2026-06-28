// infrastructure/gemini — Gemini API クライアント（Cloudflare AI Gateway 経由）。
// モデル名は呼び出し側から渡す（ハードコードしない）。fetch は注入可能でテストできる。

import type { ImageRef } from "../../domain/kifu/analyzer";

export interface GenerateParams {
  model: string;
  prompt: string;
  images: ImageRef[];
}

/** Gemini クライアントのポート。read-river / analyzer はこの契約に依存する。 */
export interface GeminiClient {
  generateText(params: GenerateParams): Promise<string>;
}

export interface HttpGeminiClientConfig {
  apiKey: string;
  /** AI Gateway の google-ai-studio ベースURL（`/v1beta/...` の手前まで）。 */
  baseUrl: string;
  /** テスト用に差し替え可能。未指定ならグローバル fetch。 */
  fetchImpl?: typeof fetch;
}

interface GeminiPart {
  text?: string;
}
interface GeminiResponseShape {
  candidates?: { content?: { parts?: GeminiPart[] } }[];
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** 応答パーツを「種類で」仕分け、テキストパートだけを連結する（コード実行パートは捨てる）。 */
function joinTextParts(json: GeminiResponseShape): string {
  const parts = json.candidates?.[0]?.content?.parts ?? [];
  return parts.map((p) => p.text ?? "").join("");
}

export class HttpGeminiClient implements GeminiClient {
  constructor(private readonly cfg: HttpGeminiClientConfig) {}

  async generateText({ model, prompt, images }: GenerateParams): Promise<string> {
    const doFetch = this.cfg.fetchImpl ?? fetch;
    const url = `${this.cfg.baseUrl}/v1beta/models/${model}:generateContent`;
    const body = {
      contents: [
        {
          parts: [
            { text: prompt },
            ...images.map((img) => ({
              inline_data: { mime_type: img.mimeType, data: toBase64(img.data) },
            })),
          ],
        },
      ],
    };

    const res = await doFetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": this.cfg.apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`Gemini API error: ${res.status}`);
    }
    const json = (await res.json()) as GeminiResponseShape;
    return joinTextParts(json);
  }
}
