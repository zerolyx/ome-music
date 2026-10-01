import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";
import { error as neteaseError } from "../state/netease";
import { activeView } from "../state/app";
import { requestedSettingsSection } from "../state/settings-nav";
import { SearchView } from "./Search";

afterEach(() => {
  cleanup();
  neteaseError.value = null;
  activeView.value = "home";
  requestedSettingsSection.value = null;
});

describe("SearchView browser preview", () => {
  it("hides stale native invoke errors and explains desktop-only search", () => {
    neteaseError.value = "Cannot read properties of undefined (reading 'invoke')";

    render(<SearchView />);

    expect(screen.getByText(/当前是浏览器预览/)).toBeInTheDocument();
    expect(screen.queryByText(/Cannot read properties of undefined/)).not.toBeInTheDocument();
  });

  it("offers SMB as an optional directory source without changing the radio entry point", () => {
    render(<SearchView />);

    fireEvent.click(screen.getByRole("radio", { name: "SMB" }));
    expect(screen.getByText("连接 SMB 曲库后即可按目录浏览与播放")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "前往音乐源设置" }));
    expect(activeView.value).toBe("settings");
    expect(requestedSettingsSection.value).toBe("source");
  });
});
