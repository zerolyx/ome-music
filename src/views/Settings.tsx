import { useEffect, useMemo, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { TtsSettings } from "../components/TtsSettings";
import { EqCurve } from "../components/EqCurve";
import { Icon } from "../components/Icon";
import { getAppVersion, isTauriRuntime } from "../lib/api";
import { setThemeChoice, THEME_PRESETS, THEME_SWATCHES, themeChoice, type ThemeChoice } from "../state/theme";
import {
  SETTINGS_GROUPS,
  SETTINGS_SECTIONS,
  searchSections,
  type SectionId,
} from "../state/settings-nav";
import { SHORTCUTS } from "../state/hotkeys";
import { djConfig, lastError, loadConfig, saveConfig } from "../state/dj";
import { radioEnabled, setRadioEnabled } from "../state/radio";
import { danmakuEnabled, setDanmakuEnabled } from "../state/danmaku";
import { accentMode, setAccentMode } from "../state/tint";
import { closeDeskLyrics, deskLyricsLocked, deskLyricsOpen, openDeskLyrics, setDeskLyricsLocked } from "../state/desklyrics";
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

/* ---- 统一设置行：左标题+描述，右控件（ECHO SettingRow 式节奏） ---- */
function Row({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children?: ComponentChildren;
}) {
  return (
    <div class="setting-row">
      <div class="setting-row-text">
        <span class="setting-row-title">{title}</span>
        {hint && <span class="setting-row-hint">{hint}</span>}
      </div>
      {children !== undefined && children !== null && (
        <div class="setting-row-control">{children}</div>
      )}
    </div>
  );
}

/** 二值偏好开关 */
function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      class={`switch ${checked ? "is-on" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span class="switch-knob" />
    </button>
  );
}

/** 多选 segmented（强调色等非二值选项） */
function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (next: T) => void;
  label: string;
}) {
  return (
    <div class="segmented" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          role="radio"
          aria-checked={value === option.value}
          class={`segment ${value === option.value ? "is-active" : ""}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

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
      <p class="view-hint">
        兼容 OpenAI 接口（如 DeepSeek）。是否自动接播在「播放 → 自动电台」；语音音色在下方语音设置。
      </p>
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

/** 播放行为：电台接播 + 切歌淡变（从声音区与 DJ 表单收拢而来） */
function PlaybackBody() {
  return (
    <>
      <Row
        title="自动电台"
        hint="开启后 DJ 按口味自动挑下一首并附歌前介绍；关闭则按队列顺序播完即停"
      >
        <Switch checked={radioEnabled.value} onChange={(next) => setRadioEnabled(next)} label="自动电台" />
      </Row>
      <Row title="切歌自动淡变" hint="旧曲 1.2 秒淡出、新曲从淡入开始，避免生硬打断">
        <Switch checked={fadeEnabled.value} onChange={(next) => setFadeEnabled(next)} label="切歌自动淡变" />
      </Row>
    </>
  );
}

/** 外观：主题 / 强调色 / 弹幕氛围 */
function AppearanceBody() {
  return (
    <>
      <div class="theme-grid" role="radiogroup" aria-label="主题">
        {CHOICES.map((choice) => {
          const swatch = THEME_SWATCHES[choice.value];
          const active = themeChoice.value === choice.value;
          return (
            <button
              key={choice.value}
              role="radio"
              aria-checked={active}
              class={`theme-card ${active ? "is-active" : ""}`}
              onClick={() => setThemeChoice(choice.value)}
            >
              <span
                class="theme-swatch"
                aria-hidden="true"
                style={{
                  background: `linear-gradient(135deg, ${swatch.bg} 0 42%, ${swatch.elev} 42% 72%, ${swatch.accent} 72% 100%)`,
                }}
              />
              <span class="theme-card-name">{choice.label}</span>
              <span class="theme-card-check" aria-hidden="true">
                <Icon name="check" size={13} />
              </span>
            </button>
          );
        })}
      </div>
      <p class="view-hint">主题即取即用；「唱片取色」开启时按钮与辉光仍会跟随封面主色。</p>
      <Row title="强调色" hint="按钮、歌词辉光等强调色：跟随当前封面主色，或用主题固定色">
        <Segmented
          value={accentMode.value}
          onChange={(next) => setAccentMode(next)}
          label="强调色"
          options={[
            { value: "cover", label: "唱片取色" },
            { value: "fixed", label: "固定主题" },
          ]}
        />
      </Row>
      <Row title="弹幕氛围" hint="播放 B站视频时在首页漂浮同屏弹幕，纯氛围装饰">
        <Switch checked={danmakuEnabled.value} onChange={(next) => setDanmakuEnabled(next)} label="弹幕氛围" />
      </Row>
    </>
  );
}

/** 声音（DSP）：均衡器 + 输出设备（淡变在「播放」） */
function SoundBody() {
  useEffect(() => {
    void refreshOutputDevices();
  }, []);

  return (
    <>
      <Row title="均衡器" hint="10 段参数均衡（31Hz – 16kHz，±12dB）；关闭时链路完全透明">
        <Switch checked={eqEnabled.value} onChange={(next) => setEqEnabled(next)} label="均衡器" />
      </Row>
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
      <EqCurve />
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
      <Row title="输出设备" hint="选择声音输出到哪台设备；设备拔出时自动回退到系统默认">
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
      </Row>
    </>
  );
}

/** 歌词：桌面歌词开关与锁定（从外观区收拢而来） */
function LyricsBody() {
  return (
    <>
      <Row
        title="桌面歌词"
        hint="独立悬浮歌词条：常驻桌面最上层、可拖动、不抢焦点，重开应用自动恢复"
      >
        <Switch
          checked={deskLyricsOpen.value}
          onChange={(next) => (next ? void openDeskLyrics() : void closeDeskLyrics())}
          label="桌面歌词"
        />
      </Row>
      {deskLyricsOpen.value && (
        <Row
          title="锁定歌词条"
          hint="鼠标全穿透、不挡桌面操作；解锁只能回这里或用命令面板（Ctrl+K）"
        >
          <Switch
            checked={deskLyricsLocked.value}
            onChange={(next) => setDeskLyricsLocked(next)}
            label="锁定歌词条"
          />
        </Row>
      )}
      <p class="view-hint">
        悬浮在歌词条上可调字号、横竖排与锁定；单曲歌词偏移在电台页「±0.5s」微调，按曲目记忆。
      </p>
    </>
  );
}

/** 快捷键参考：与实际按键处理共用 SHORTCUTS 数据源 */
function ShortcutsBody() {
  return (
    <div class="shortcut-list">
      {SHORTCUTS.map((item) => (
        <div class="shortcut-row" key={item.label}>
          <span class="shortcut-keys">
            {item.keys.map((key) => (
              <kbd class="kbd" key={key}>
                {key}
              </kbd>
            ))}
          </span>
          <span class="shortcut-label">{item.label}</span>
        </div>
      ))}
      <p class="view-hint">在输入框打字或中文组字时快捷键自动失效，不会误触。</p>
    </div>
  );
}

/** 关于：版本 / 仓库 / 重置偏好（两步确认，只清 ome.* 本地偏好） */
function AboutBody({ version }: { version: string }) {
  const [confirming, setConfirming] = useState(false);

  const resetPrefs = () => {
    if (!confirming) {
      setConfirming(true);
      window.setTimeout(() => setConfirming(false), 4000);
      return;
    }
    try {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key?.startsWith("ome.")) keys.push(key);
      }
      keys.forEach((key) => localStorage.removeItem(key));
    } catch {
      /* 存储不可用忽略 */
    }
    window.location.reload();
  };

  return (
    <>
      <Row title="应用版本" hint="本地优先的私人音乐电台 · AI 时代的私人电台">
        <span class="about-version">v{version}</span>
      </Row>
      <Row title="开源仓库" hint="github.com/zerolyx/ome-music · MIT License · Preact + Tauri + SQLite" />
      <Row
        title="重置应用偏好"
        hint="清空主题、均衡器、歌词偏移、桌面歌词等本地偏好；音乐库与 DJ 配置存于数据库，不受影响"
      >
        <button
          class={`btn-secondary ${confirming ? "is-danger" : ""}`}
          onClick={resetPrefs}
        >
          {confirming ? "再点一次确认重置" : "重置偏好…"}
        </button>
      </Row>
    </>
  );
}

export function SettingsView() {
  const [version, setVersion] = useState<string>("…");
  const [query, setQuery] = useState("");
  // 受控折叠：默认播放与外观展开（使用频率最高）
  const [openMap, setOpenMap] = useState<Record<SectionId, boolean>>({
    playback: true,
    appearance: true,
    sound: false,
    source: false,
    lyrics: false,
    dj: false,
    shortcuts: false,
    about: false,
  });
  const [activeSection, setActiveSection] = useState<SectionId>("playback");

  useEffect(() => {
    if (isTauriRuntime()) {
      void getAppVersion().then(setVersion).catch(() => setVersion("开发预览"));
      void refreshStatus();
    } else {
      setVersion("开发预览");
    }
    return () => cancelQrLogin();
  }, []);

  const searching = query.trim() !== "";
  const matches = useMemo(() => searchSections(query), [query]);
  const visibleSections = useMemo(
    () => (searching ? SETTINGS_SECTIONS.filter((section) => matches.includes(section.id)) : SETTINGS_SECTIONS),
    [searching, matches],
  );

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

  const isOpen = (id: SectionId) => (searching ? matches.includes(id) : openMap[id]);

  return (
    <section class="view view-settings">
      <h1 class="view-title">设置</h1>
      <div class="settings-layout">
        <nav class="settings-nav" aria-label="设置分组">
          <div class="settings-search">
            <Icon name="search" size={14} />
            <input
              type="text"
              placeholder="搜索设置…"
              aria-label="搜索设置"
              value={query}
              onInput={(event) => setQuery((event.target as HTMLInputElement).value)}
            />
            {searching && (
              <button class="settings-search-clear" aria-label="清除搜索" onClick={() => setQuery("")}>
                <Icon name="close" size={12} />
              </button>
            )}
          </div>
          {searching && visibleSections.length === 0 && (
            <p class="settings-nav-empty">没有匹配的设置</p>
          )}
          {SETTINGS_GROUPS.map((group) => {
            const items = visibleSections.filter((section) => section.group === group);
            if (items.length === 0) return null;
            return (
              <div class="settings-nav-group" key={group}>
                <span class="settings-nav-group-label">{group}</span>
                {items.map((section) => (
                  <button
                    key={section.id}
                    class="settings-nav-item"
                    data-active={activeSection === section.id}
                    onClick={() => navigateTo(section.id)}
                  >
                    {section.label}
                  </button>
                ))}
              </div>
            );
          })}
        </nav>

        <div class="settings-cards">
          <Card title="播放" id="playback" open={isOpen("playback")} onToggle={() => toggleSection("playback")}>
            <PlaybackBody />
          </Card>

          <Card title="外观" id="appearance" open={isOpen("appearance")} onToggle={() => toggleSection("appearance")}>
            <AppearanceBody />
          </Card>

          <Card title="声音（DSP）" id="sound" open={isOpen("sound")} onToggle={() => toggleSection("sound")}>
            <SoundBody />
          </Card>

          <Card title="音乐源" id="source" open={isOpen("source")} onToggle={() => toggleSection("source")}>
            <NetEaseBody />
            <p class="view-hint">本地音乐在曲库页「导入音乐文件夹」添加；本地歌词支持同目录 lrc / ttml / qrc / krc。</p>
          </Card>

          <Card title="歌词" id="lyrics" open={isOpen("lyrics")} onToggle={() => toggleSection("lyrics")}>
            <LyricsBody />
          </Card>

          <Card title="DJ 电台与语音" id="dj" open={isOpen("dj")} onToggle={() => toggleSection("dj")}>
            <DjConfigBody />
          </Card>

          <Card title="快捷键" id="shortcuts" open={isOpen("shortcuts")} onToggle={() => toggleSection("shortcuts")}>
            <ShortcutsBody />
          </Card>

          <Card title="关于" id="about" open={isOpen("about")} onToggle={() => toggleSection("about")}>
            <AboutBody version={version} />
          </Card>
        </div>
      </div>
    </section>
  );
}
