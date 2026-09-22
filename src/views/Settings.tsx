import { useEffect, useState } from "preact/hooks";
import { getAppVersion, isTauriRuntime } from "../lib/api";
import { setThemeChoice, themeChoice, type ThemeChoice } from "../state/theme";
import { djConfig, lastError, loadConfig, saveConfig } from "../state/dj";
import { radioEnabled, setRadioEnabled } from "../state/radio";
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

/** 私人 DJ：OpenAI 兼容语言模型配置；空 apiKey 表示保留旧密钥 */
function DjConfigCard() {
  const [providerName, setProviderName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedMaskedKey, setSavedMaskedKey] = useState<string | null>(null);

  useEffect(() => {
    void loadConfig();
  }, []);

  // 配置信号更新（首次载入 / 保存成功）时同步表单
  useEffect(() => {
    const config = djConfig.value;
    if (!config) return;
    setProviderName(config.providerName);
    setBaseUrl(config.baseUrl);
    setModel(config.model);
    setSavedMaskedKey(config.configured ? config.maskedKey : null);
  }, [djConfig.value]);

  const save = async () => {
    setSaving(true);
    const result = await saveConfig({
      providerName: providerName.trim(),
      baseUrl: baseUrl.trim(),
      model: model.trim(),
      apiKey,
    });
    setSaving(false);
    if (result) {
      setApiKey(""); // 密钥不回显，清空输入框
      setSavedMaskedKey(result.maskedKey);
    }
  };

  const canSave = providerName.trim() !== "" && baseUrl.trim() !== "" && model.trim() !== "" && !saving;
  const config = djConfig.value;
  const maskedKey = savedMaskedKey ?? (config?.configured ? config.maskedKey : "");

  return (
    <div class="settings-card">
      <h2 class="settings-label">私人 DJ</h2>
      <p class="dj-config-state">
        {config?.configured ? `已配置：${config.providerName} · ${config.model}` : "未配置"}
      </p>
      <div class="dj-config-grid">
        <label class="dj-field">
          服务商名称
          <input
            value={providerName}
            placeholder="DeepSeek"
            onInput={(event) => setProviderName((event.target as HTMLInputElement).value)}
          />
        </label>
        <label class="dj-field">
          接口地址
          <input
            value={baseUrl}
            placeholder="https://api.deepseek.com"
            onInput={(event) => setBaseUrl((event.target as HTMLInputElement).value)}
          />
        </label>
        <label class="dj-field">
          模型
          <input
            value={model}
            placeholder="deepseek-chat"
            onInput={(event) => setModel((event.target as HTMLInputElement).value)}
          />
        </label>
        <label class="dj-field">
          API 密钥
          <input
            type="password"
            value={apiKey}
            placeholder="留空保持不变"
            autoComplete="off"
            onInput={(event) => setApiKey((event.target as HTMLInputElement).value)}
          />
        </label>
      </div>
      <div class="dj-config-actions">
        <button class="btn-primary" disabled={!canSave} onClick={() => void save()}>
          {saving ? "保存中…" : "保存"}
        </button>
        {maskedKey && <span class="view-hint">密钥：{maskedKey}</span>}
        {lastError.value && <span class="dj-config-error">{lastError.value}</span>}
      </div>
      <div class="dj-radio-row">
        <span class="dj-radio-label">自动电台</span>
        <div class="segmented" role="radiogroup" aria-label="自动电台">
          <button
            role="radio"
            aria-checked={radioEnabled.value}
            class={`segment ${radioEnabled.value ? "is-active" : ""}`}
            onClick={() => setRadioEnabled(true)}
          >
            开
          </button>
          <button
            role="radio"
            aria-checked={!radioEnabled.value}
            class={`segment ${!radioEnabled.value ? "is-active" : ""}`}
            onClick={() => setRadioEnabled(false)}
          >
            关
          </button>
        </div>
      </div>
      <p class="view-hint">兼容 OpenAI 接口（如 DeepSeek）。开启后 DJ 会在开播问候并自动接播；关闭则播完即停、无介绍。</p>
    </div>
  );
}

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

      <DjConfigCard />

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
