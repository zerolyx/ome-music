import { activeView, type View } from "../state/app";
import { setChromeHover } from "../state/chrome";
import { Icon } from "./Icon";

const ITEMS: Array<{ view: View; label: string; icon: "home" | "search" | "library" | "settings" }> = [
  { view: "home", label: "首页", icon: "home" },
  { view: "search", label: "搜索", icon: "search" },
  { view: "library", label: "曲库", icon: "library" },
  { view: "settings", label: "设置", icon: "settings" },
];

export function Rail() {
  return (
    <nav
      class="rail"
      aria-label="主导航"
      onMouseEnter={() => setChromeHover(true)}
      onMouseLeave={() => setChromeHover(false)}
    >
      {ITEMS.map((item) => (
        <button
          key={item.view}
          class={`rail-item ${activeView.value === item.view ? "is-active" : ""}`}
          aria-label={item.label}
          title={item.label}
          onClick={() => (activeView.value = item.view)}
        >
          <Icon name={item.icon} />
        </button>
      ))}
    </nav>
  );
}
