import { activeView, type View } from "../state/app";
import { setChromeHover } from "../state/chrome";
import { Icon } from "./Icon";

const ITEMS: Array<{ view: View; label: string; icon: "home" | "search" | "library" }> = [
  { view: "home", label: "电台", icon: "home" },
  { view: "search", label: "搜索", icon: "search" },
  { view: "library", label: "曲库", icon: "library" },
];

export function Rail() {
  return (
    <nav
      class="rail"
      aria-label="主导航"
      onMouseEnter={() => setChromeHover(true)}
      onMouseLeave={() => setChromeHover(false)}
    >
      <div class="rail-brand">
        <span class="rail-brand-mark">Ome</span>
        <span class="rail-brand-sub">私人电台</span>
      </div>

      <div class="rail-group">
        {ITEMS.map((item) => (
          <button
            key={item.view}
            class={`rail-item ${activeView.value === item.view ? "is-active" : ""}`}
            aria-label={item.label}
            aria-current={activeView.value === item.view ? "page" : undefined}
            onClick={() => (activeView.value = item.view)}
          >
            <Icon name={item.icon} size={19} />
            <span class="rail-label">{item.label}</span>
          </button>
        ))}
      </div>

      <button
        class={`rail-item rail-settings ${activeView.value === "settings" ? "is-active" : ""}`}
        aria-label="设置"
        aria-current={activeView.value === "settings" ? "page" : undefined}
        onClick={() => (activeView.value = "settings")}
      >
        <Icon name="settings" size={19} />
        <span class="rail-label">设置</span>
      </button>
    </nav>
  );
}
