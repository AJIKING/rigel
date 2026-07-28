import {
  APPLE_REDIRECT_URL,
  appleWebLoginConfig,
  buildAppleAuthorizeUrl,
  parseAppleCallbackUrl,
} from "./apple-login";

describe("appleWebLoginConfig", () => {
  it("servicesId と apiUrl が揃わなければ null（= Android の Apple ログイン無効）", () => {
    expect(appleWebLoginConfig({})).toBeNull();
    expect(appleWebLoginConfig({ servicesId: "jp.co.plaria.rigel.web" })).toBeNull();
    expect(appleWebLoginConfig({ apiUrl: "https://api.example.com" })).toBeNull();
  });

  it("空文字は未設定扱い（env の空定義で誤って有効化しない）", () => {
    expect(appleWebLoginConfig({ servicesId: "", apiUrl: "https://api.example.com" })).toBeNull();
    expect(appleWebLoginConfig({ servicesId: "sid", apiUrl: "" })).toBeNull();
  });

  it("両方あれば設定を返す（apiUrl 末尾スラッシュは落とす）", () => {
    expect(
      appleWebLoginConfig({
        servicesId: "jp.co.plaria.rigel.web",
        apiUrl: "https://api.example.com/",
      }),
    ).toEqual({ servicesId: "jp.co.plaria.rigel.web", apiUrl: "https://api.example.com" });
  });
});

describe("buildAppleAuthorizeUrl", () => {
  it("Services ID・api の callback・form_post・state を組んだ authorize URL を返す", () => {
    const url = buildAppleAuthorizeUrl(
      { servicesId: "jp.co.plaria.rigel.web", apiUrl: "https://api.example.com" },
      "state-1",
    );
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe("https://appleid.apple.com/auth/authorize");
    expect(u.searchParams.get("client_id")).toBe("jp.co.plaria.rigel.web");
    expect(u.searchParams.get("redirect_uri")).toBe("https://api.example.com/auth/apple/callback");
    expect(u.searchParams.get("response_type")).toBe("code id_token");
    expect(u.searchParams.get("response_mode")).toBe("form_post");
    expect(u.searchParams.get("scope")).toBe("email");
    expect(u.searchParams.get("state")).toBe("state-1");
  });
});

describe("parseAppleCallbackUrl", () => {
  const cb = (query: string) => `${APPLE_REDIRECT_URL}?${query}`;

  it("id_token と code を取り出す", () => {
    expect(parseAppleCallbackUrl(cb("id_token=t-1&code=c-1&state=s-1"), "s-1")).toEqual({
      idToken: "t-1",
      authorizationCode: "c-1",
    });
  });

  it("code は無くてもよい（idToken だけでログインできる）", () => {
    expect(parseAppleCallbackUrl(cb("id_token=t-1&state=s-1"), "s-1")).toEqual({
      idToken: "t-1",
      authorizationCode: undefined,
    });
  });

  it("state 不一致は null（CSRF・セッション取り違えを弾く）", () => {
    expect(parseAppleCallbackUrl(cb("id_token=t-1&state=other"), "s-1")).toBeNull();
    expect(parseAppleCallbackUrl(cb("id_token=t-1"), "s-1")).toBeNull();
  });

  it("error や id_token 欠落は null（キャンセル・中継エラー）", () => {
    expect(parseAppleCallbackUrl(cb("error=user_cancelled_authorize&state=s-1"), "s-1")).toBeNull();
    expect(parseAppleCallbackUrl(cb("state=s-1"), "s-1")).toBeNull();
  });

  it("URL エンコードを復元する", () => {
    expect(parseAppleCallbackUrl(cb("id_token=a%2Fb%3D&state=s%201"), "s 1")).toEqual({
      idToken: "a/b=",
      authorizationCode: undefined,
    });
  });
});
