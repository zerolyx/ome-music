import { describe, expect, it } from "vitest";
import {
  describeQQMusicAuthState,
  describeQQMusicLoginFlow,
  isQQMusicAuthenticated,
} from "./qqMusicAuthPresentation";
import type { QQMusicLoginFlow, QQMusicLoginStatus } from "./provider";

function status(overrides: Partial<QQMusicLoginStatus> = {}): QQMusicLoginStatus {
  return {
    loggedIn: false,
    credentialPresent: false,
    status: "signed_out",
    uin: "",
    nickname: "",
    avatarUrl: "",
    vipType: "none",
    message: "",
    ...overrides,
  };
}

function flow(overrides: Partial<QQMusicLoginFlow> = {}): QQMusicLoginFlow {
  return {
    status: "idle",
    message: null,
    cookieCount: 0,
    uinPresent: false,
    signingKeyPresent: false,
    cookieNames: [],
    verified: false,
    ...overrides,
  };
}

describe("describeQQMusicAuthState", () => {
  it("only shows Signed in when backend authenticated + loggedIn", () => {
    const signedIn = status({
      loggedIn: true,
      credentialPresent: true,
      status: "authenticated",
      nickname: "夜色",
    });
    expect(describeQQMusicAuthState(signedIn, true, "compact")).toBe("Signed in");
    expect(describeQQMusicAuthState(signedIn, true, "detail")).toContain("夜色");
    expect(isQQMusicAuthenticated(signedIn)).toBe(true);
  });

  it("never shows Signed in for credential_present / failed / expired", () => {
    const cases: QQMusicLoginStatus[] = [
      status({ credentialPresent: true, status: "credential_present" }),
      status({ credentialPresent: true, status: "verifying" }),
      status({ credentialPresent: true, status: "unknown" }),
      status({ credentialPresent: true, status: "failed", message: "未通过验证" }),
      status({ credentialPresent: true, status: "expired" }),
      status({ status: "signed_out" }),
    ];
    for (const item of cases) {
      expect(isQQMusicAuthenticated(item)).toBe(false);
      expect(describeQQMusicAuthState(item, true, "compact")).not.toBe("Signed in");
      expect(describeQQMusicAuthState(item, true, "detail")).not.toMatch(/Signed in|已连接/);
    }
  });

  it("maps failed to Check sign-in and expired to Reconnect", () => {
    expect(
      describeQQMusicAuthState(
        status({ status: "failed", message: "verify failed" }),
        true,
        "compact",
      ),
    ).toBe("Check sign-in");
    expect(
      describeQQMusicAuthState(status({ status: "expired" }), true, "compact"),
    ).toBe("Reconnect");
  });
});

describe("describeQQMusicLoginFlow", () => {
  it("covers opening / waiting / collecting / verifying / authenticated / failed", () => {
    expect(describeQQMusicLoginFlow(null)).toMatch(/Opening/i);
    expect(describeQQMusicLoginFlow(flow({ status: "opening_login" }))).toMatch(
      /Opening|打开/,
    );
    expect(describeQQMusicLoginFlow(flow({ status: "waiting_for_user" }))).toMatch(
      /Waiting|等待/,
    );
    expect(describeQQMusicLoginFlow(flow({ status: "collecting_cookies", cookieCount: 2 }))).toMatch(
      /Collecting|收集/,
    );
    expect(describeQQMusicLoginFlow(flow({ status: "login_detected", cookieCount: 5, uinPresent: true, signingKeyPresent: true }))).toMatch(
      /detected|检测到/,
    );
    expect(describeQQMusicLoginFlow(flow({ status: "bootstrapping", cookieCount: 4, uinPresent: true }))).toMatch(
      /Bootstrap|引导/,
    );
    expect(describeQQMusicLoginFlow(flow({ status: "verifying" }))).toMatch(
      /Confirming|确认/,
    );
    expect(describeQQMusicLoginFlow(flow({ status: "authenticated", verified: true }))).toMatch(
      /Authenticated|已连接/,
    );
    expect(describeQQMusicLoginFlow(flow({ status: "failed", message: "403" }))).toMatch(
      /Not verified|未通过/,
    );
  });

  it("reports only masked metrics, never cookie values", () => {
    const text = describeQQMusicLoginFlow(
      flow({
        status: "collecting_cookies",
        cookieCount: 3,
        cookieNames: ["uin", "qm_keyst", "p_skey"],
      }),
    );
    expect(text).toContain("cookies=3");
    expect(text).not.toMatch(/qm_keyst=/);
    expect(text).not.toMatch(/p_skey=/);
  });

  it("never reports authenticated without verified backend state", () => {
    // A failed flow that still has cookies is still failed — not authenticated.
    const text = describeQQMusicLoginFlow(
      flow({
        status: "failed",
        cookieCount: 6,
        uinPresent: true,
        signingKeyPresent: true,
        verified: false,
      }),
    );
    expect(text).not.toMatch(/Authenticated|已连接/);
  });
});
