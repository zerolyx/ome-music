import type {
  QQMusicLoginFlow,
  QQMusicLoginStatus,
} from "./provider";

/**
 * Pure presentation helpers for QQ Music auth state.
 * Never invent "Signed In" — only backend `authenticated` + `loggedIn` counts.
 * Never map Direct QR HTTP 403 to "expired".
 */
export function describeQQMusicAuthState(
  status: QQMusicLoginStatus | null,
  enabled: boolean,
  mode: "compact" | "detail",
): string {
  if (status?.loggedIn && status.status === "authenticated") {
    if (mode === "compact") return "Signed in";
    return `已连接${status.nickname ? ` · ${status.nickname}` : ""} / Signed in`;
  }
  if (status?.status === "expired") {
    return mode === "compact" ? "Reconnect" : "登录已过期，请重新连接 / Session expired";
  }
  if (
    status?.credentialPresent &&
    ["credential_present", "verifying", "unknown"].includes(status.status)
  ) {
    return mode === "compact"
      ? "Session saved"
      : status.message ||
          "官方会话已保存，账号权限将在播放时确认 / Official session saved; account access will be confirmed during playback";
  }
  if (status?.status === "failed") {
    return mode === "compact" ? "Check sign-in" : status.message || "未通过验证 / Not verified yet";
  }
  if (!enabled) return mode === "compact" ? "Off" : "未启用 / Disabled";
  return mode === "compact" ? "Ready" : "公共内容可用 / Public content available";
}

export function describeQQMusicLoginFlow(flow: QQMusicLoginFlow | null): string {
  if (!flow) return "正在打开官方窗口… / Opening the official window…";
  const label =
    flow.status === "authenticated"
      ? "已连接 / Authenticated"
      : flow.status === "verifying"
        ? "正在确认 QQ 音乐账号… / Confirming the QQ Music account…"
        : flow.status === "bootstrapping"
          ? "正在引导 QQ 音乐会话… / Bootstrapping the QQ Music session…"
          : flow.status === "login_detected"
            ? "已检测到官方登录 / Official sign-in detected"
            : flow.status === "collecting_cookies"
              ? "正在收集会话 Cookie… / Collecting session cookies…"
              : flow.status === "waiting_for_user"
                ? "等待扫码确认… / Waiting for the scan to be confirmed…"
                : flow.status === "opening_login"
                  ? "正在打开官方窗口… / Opening the official window…"
                  : flow.status === "failed"
                    ? "未通过验证 / Not verified yet"
                    : flow.status === "canceled"
                      ? "登录窗口已关闭 / Sign-in window closed"
                      : "待命 / Idle";
  const metrics = `cookies=${flow.cookieCount} · uin=${flow.uinPresent} · musicKey=${flow.signingKeyPresent}`;
  return flow.message ? `${label} · ${metrics} · ${flow.message}` : `${label} · ${metrics}`;
}

/** Failure must never present as signed in. */
export function isQQMusicAuthenticated(status: QQMusicLoginStatus | null): boolean {
  return Boolean(status?.loggedIn && status.status === "authenticated");
}
