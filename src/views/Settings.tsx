import { useEffect, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { TtsSettings } from "../components/TtsSettings";
import { Icon } from "../components/Icon";
import { getAppVersion, isTauriRuntime } from "../lib/api";
import { setThemeChoice, THEME_PRESETS, themeChoice, type ThemeChoice } from "../state/theme";
import { djConfig, lastError, loadConfig, saveConfig } from "../state/dj";
import { radioEnabled, setRadioEnabled } from "../state/radio";
import { danmakuEnabled, setDanmakuEnabled } from "../state/danmaku";
import { accentMode, setAccentMode } from "../state/tint";
import {
  applyEqPreset,
  bandLabel,
  EQ_BANDS,
  EQ_MAX,
  EQ_MIN,
  EQ_PRESETS,
  eqEnabled,
  eqGains,
  eqPreset,
  setEqBand,
  setEqEnabled,
} from "../state/equalizer";
import { fadeEnabled, setFadeEnabled } from "../state/fade";
import {
  outputDevices,
  outputDeviceId,
  refreshOutputDevices,
  setOutputDevice,
} from "../state/audioout";
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
  ...THEME_PRESETS.map((preset) => ({ value: preset.id as ThemeChoice, label: preset.label })),
];

const QR_PHASE_TEXT: Record<string, string> = {
  idle: "正在获取二维码…",
  waiting: "请打开网易云音乐 App → 右上角 ＋ → 扫一扫（微信/相机扫码会提示“暂不支持该类型”）",
  scanned: "已扫描，请在手机上确认",
  success: "登录成功",
  expired: "二维码已过期",
};

/** 可折叠分区：标题行点击收起/展开（受控：侧栏导航也能展开并定位） */
function Card({
  title,
  id,
  open,
  onToggle,
  children,
}: {
  title: string;
  id: string;
  open: boolean;
  onToggle: () => void;
  children: ComponentChildren;
}) {
  return (
    <div class="settings-card" id={`settings-${id}`}>
      <button
        class="settings-head"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={`${open ? "收起" : "展开"}${title}`}
      >
        <span class="settings-label">{title}</span>
        <span class={`settings-chevron ${open ? "is-open" : ""}`}>
          <Icon name="chevron-down" size={14} />
        </span>
      </button>
      {open && <div class="settings-inner">{children}</div>}
    </div>
  );
}

/** 私人 DJ：OpenAI 兼容语言模型配置；空 apiKey 表示保留旧密钥 */
function DjConfigBody() {
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
    <>
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
      <TtsSettings />
    </>
  );
}

function NetEaseBody() {
  return status.value?.loggedIn ? (
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
  );
}

/** 声音（DSP）：10 段均衡器 + 输出设备 + 自动淡变 */
function SoundBody() {
  useEffect(() => {
    void refreshOutputDevices();
  }, []);

  return (
    <>
      <div class="dj-radio-row settings-danmaku-row">
        <span class="dj-radio-label">均衡器</span>
        <div class="segmented" role="radiogroup" aria-label="均衡器">
          <button
            role="radio"
            aria-checked={eqEnabled.value}
            class={`segment ${eqEnabled.value ? "is-active" : ""}`}
            onClick={() => setEqEnabled(true)}
          >
            开
          </button>
          <button
            role="radio"
            aria-checked={!eqEnabled.value}
            class={`segment ${!eqEnabled.value ? "is-active" : ""}`}
            onClick={() => setEqEnabled(false)}
          >
            关
          </button>
        </div>
      </div>
      <div class="eq-presets">
        {EQ_PRESETS.map((preset) => (
          <button
            key={preset.id}
            class={`chip-toggle ${eqPreset.value === preset.id && eqEnabled.value ? "is-active" : ""}`}
            onClick={() => {
              setEqEnabled(true);
              applyEqPreset(preset.id);
            }}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <div class="eq-bands" aria-label="均衡器频段">
        {EQ_BANDS.map((frequency, index) => {
          const gain = eqGains.value[index] ?? 0;
          return (
            <div class="eq-band" key={frequency}>
              <span class="eq-band-value">{gain === 0 ? "0" : gain.toFixed(1)}</span>
              <input
                type="range"
                min={EQ_MIN}
                max={EQ_MAX}
                step={0.5}
                value={gain}
                disabled={!eqEnabled.value}
                aria-label={`${bandLabel(frequency)} 赫兹`}
                onInput={(event) => setEqBand(index, Number((event.target as HTMLInputElement).value))}
              />
              <span class="eq-band-label">{bandLabel(frequency)}</span>
            </div>
          );
        })}
      </div>
      <p class="view-hint">10 段参数均衡（31Hz – 16kHz，±12dB）；关闭时链路完全透明。</p>

      <div class="dj-radio-row settings-danmaku-row">
        <span class="dj-radio-label">输出设备</span>
        <select
          class="eq-device-select"
          value={outputDeviceId.value}
          onChange={(event) => setOutputDevice((event.target as HTMLSelectElement).value)}
        >
          <option value="">系统默认</option>
          {outputDevices.value.map((device) => (
            <option key={device.id} value={device.id}>
              {device.label}
            </option>
          ))}
        </select>
      </div>
      <p class="view-hint">选择声音输出到哪台设备；设备拔出时自动回退到系统默认。</p>

      <div class="dj-radio-row settings-danmaku-row">
        <span class="dj-radio-label">自动淡变</span>
        <div class="segmented" role="radiogroup" aria-label="自动淡变">
          <button
            role="radio"
            aria-checked={fadeEnabled.value}
            class={`segment ${fadeEnabled.value ? "is-active" : ""}`}
            onClick={() => setFadeEnabled(true)}
          >
            开
          </button>
          <button
            role="radio"
            aria-checked={!fadeEnabled.value}
            class={`segment ${!fadeEnabled.value ? "is-active" : ""}`}
            onClick={() => setFadeEnabled(false)}
          >
            关
          </button>
        </div>
      </div>
      <p class="view-hint">切歌时旧曲 1.2 秒淡出、新曲从淡入开始，避免生硬打断。</p>
    </>
  );
}

const SECTIONS = [
  { id: "source", label: "音乐源" },
  { id: "dj", label: "DJ 电台与语音" },
  { id: "appearance", label: "外观" },
  { id: "sound", label: "声音" },
  { id: "about", label: "关于" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

export function SettingsView() {
  const [version, setVersion] = useState<string>("…");
  // 受控折叠：默认音乐源与外观展开（使用频率最高）
  const [openMap, setOpenMap] = useState<Record<SectionId, boolean>>({
    source: true,
    dj: false,
    appearance: true,
    sound: false,
    about: false,
  });
  const [activeSection, setActiveSection] = useState<SectionId>("source");

  useEffect(() => {
    if (isTauriRuntime()) {
      void getAppVersion().then(setVersion).catch(() => setVersion("开发预览"));
      void refreshStatus();
    } else {
      setVersion("开发预览");
    }
    return () => cancelQrLogin();
  }, []);

  const toggleSection = (id: SectionId) => {
    setOpenMap((map) => ({ ...map, [id]: !map[id] }));
  };

  /** 侧栏导航：展开对应分组并平滑定位（Kimi 设置页信息架构） */
  const navigateTo = (id: SectionId) => {
    setActiveSection(id);
    setOpenMap((map) => ({ ...map, [id]: true }));
    requestAnimationFrame(() => {
      document
        .getElementById(`settings-${id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  return (
    <section class="view view-settings">
      <h1 class="view-title">设置</h1>
      <div class="settings-layout">
        <nav class="settings-nav" aria-label="设置分组">
          {SECTIONS.map((section) => (
            <button
              key={section.id}
              class="settings-nav-item"
              data-active={activeSection === section.id}
              onClick={() => navigateTo(section.id)}
            >
              {section.label}
            </button>
          ))}
        </nav>

        <div class="settings-cards">
          <Card title="音乐源 · 网易云" id="source" open={openMap.source} onToggle={() => toggleSection("source")}>
            <NetEaseBody />
          </Card>

          <Card title="DJ 电台与语音" id="dj" open={openMap.dj} onToggle={() => toggleSection("dj")}>
            <DjConfigBody />
          </Card>

          <Card title="外观" id="appearance" open={openMap.appearance} onToggle={() => toggleSection("appearance")}>
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
            <div class="dj-radio-row settings-danmaku-row">
              <span class="dj-radio-label">强调色</span>
              <div class="segmented" role="radiogroup" aria-label="强调色">
                <button
                  role="radio"
                  aria-checked={accentMode.value === "cover"}
                  class={`segment ${accentMode.value === "cover" ? "is-active" : ""}`}
                  onClick={() => setAccentMode("cover")}
                >
                  唱片取色
                </button>
                <button
                  role="radio"
                  aria-checked={accentMode.value === "fixed"}
                  class={`segment ${accentMode.value === "fixed" ? "is-active" : ""}`}
                  onClick={() => setAccentMode("fixed")}
                >
                  固定主题
                </button>
              </div>
            </div>
            <p class="view-hint">唱片取色：按钮、歌词辉光等强调色随当前封面主色变化（Folia 式 AI 主题的轻量替代）。</p>
            <div class="dj-radio-row settings-danmaku-row">
              <span class="dj-radio-label">弹幕氛围</span>
              <div class="segmented" role="radiogroup" aria-label="弹幕氛围">
                <button
                  role="radio"
                  aria-checked={danmakuEnabled.value}
                  class={`segment ${danmakuEnabled.value ? "is-active" : ""}`}
                  onClick={() => setDanmakuEnabled(true)}
                >
                  开
                </button>
                <button
                  role="radio"
                  aria-checked={!danmakuEnabled.value}
                  class={`segment ${!danmakuEnabled.value ? "is-active" : ""}`}
                  onClick={() => setDanmakuEnabled(false)}
                >
                  关
                </button>
              </div>
            </div>
            <p class="view-hint">播放 B站视频时在首页漂浮同屏弹幕，纯氛围装饰。</p>
          </Card>

          <Card title="声音（DSP）" id="sound" open={openMap.sound} onToggle={() => toggleSection("sound")}>
            <SoundBody />
          </Card>

          <Card title="关于" id="about" open={openMap.about} onToggle={() => toggleSection("about")}>
            <p class="view-hint">Ome Music v{version} · 本地优先的私人音乐电台</p>
          </Card>
        </div>
      </div>
    </section>
  );
}
