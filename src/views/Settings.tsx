import { useEffect, useState } from "preact/hooks";
import { getAppVersion, isTauriRuntime } from "../lib/api";
import { setThemeChoice, themeChoice, type ThemeChoice } from "../state/theme";

const CHOICES: Array<{ value: ThemeChoice; label: string }> = [
  { value: "system", label: "跟随系统" },
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
];

export function SettingsView() {
  const [version, setVersion] = useState<string>("…");

  useEffect(() => {
    if (isTauriRuntime()) {
      void getAppVersion().then(setVersion).catch(() => setVersion("开发预览"));
    } else {
      setVersion("开发预览");
    }
  }, []);

  return (
    <section class="view view-settings">
      <h1 class="view-title">设置</h1>

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
