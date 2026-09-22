import { useEffect, useState } from "preact/hooks";
import { getAppVersion, isTauriRuntime } from "../lib/api";
import { setThemeChoice, themeChoice, type ThemeChoice } from "../state/theme";
import {
  cancelQrLogin,
  logout,
  qrState,
  refreshStatus,
  startQrLogin,
  status,
} from "../state/netease";

const CHOICES: Array<{ value: ThemeChoice; label: string }> = [
  { value: "system", label: "跟随系统" },
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
];

const QR_PHASE_TEXT: Record<string, string> = {
  idle: "正在获取二维码…",
  waiting: "请使用网易云音乐 App 扫码",
  scanned: "已扫描，请在手机上确认",
  success: "登录成功",
  expired: "二维码已过期",
};

export function SettingsView() {
  const [version, setVersion] = useState<string>("…");

  useEffect(() => {
    if (isTauriRuntime()) {
      void getAppVersion().then(setVersion).catch(() => setVersion("开发预览"));
      void refreshStatus();
    } else {
      setVersion("开发预览");
    }
    return () => cancelQrLogin();
  }, []);

  return (
    <section class="view view-settings">
      <h1 class="view-title">设置</h1>

      <div class="settings-card">
        <h2 class="settings-label">音乐源 · 网易云</h2>
        {status.value?.loggedIn ? (
          <div class="netease-row">
            <span>已登录：{status.value.nickname ?? "网易云用户"}</span>
            <button class="btn-secondary" onClick={() => void logout()}>
              登出
            </button>
          </div>
        ) : qrState.value ? (
          <div class="netease-qr">
            <div
              class="qr-box"
              // 后端生成的可信 SVG（仅含二维码路径）
              dangerouslySetInnerHTML={{ __html: qrState.value.qrSvg }}
            />
            <p class="view-hint">{QR_PHASE_TEXT[qrState.value.phase] ?? ""}</p>
            {qrState.value.phase === "expired" && (
              <button class="btn-primary" onClick={() => void startQrLogin()}>
                重新获取
              </button>
            )}
          </div>
        ) : (
          <div class="netease-row">
            <span class="view-hint">扫码登录后可搜索与播放网易云曲库</span>
            <button class="btn-primary" onClick={() => void startQrLogin()}>
              扫码登录
            </button>
          </div>
        )}
      </div>

      <div class="settings-group">
        <h2 class="settings-label">外观</h2>
        <div class="segmented" role="radiogroup" aria-label="主题">
          {CHOICES.map((choice) => (
            <button
              key={choice.value}
              role="radio"
              aria-checked={themeChoice.value === choice.value}
              class={`segment ${themeChoice.value === choice.value ? "is-active" : ""}`}
              onClick={() => setThemeChoice(choice.value)}
            >
              {choice.label}
            </button>
          ))}
        </div>
      </div>

      <div class="settings-group">
        <h2 class="settings-label">关于</h2>
        <p class="view-hint">Ome Music v{version} · 本地优先的私人音乐电台</p>
      </div>
    </section>
  );
}
