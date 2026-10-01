import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DesktopLyricsWindow } from "./DesktopLyricsWindow";

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("DesktopLyricsWindow color palette", () => {
  it("keeps a colorful default and persists an explicit palette selection", () => {
    const { container } = render(<DesktopLyricsWindow />);
    const window = container.querySelector(".dlx") as HTMLDivElement;

    expect(window.dataset.palette).toBe("aurora");
    expect(window.style.getPropertyValue("--dlx-lyric-gradient")).toContain("#78EECF");
    fireEvent.mouseEnter(window);
    fireEvent.click(screen.getByRole("button", { name: "歌词色彩：极光" }));

    expect(screen.getByRole("group", { name: "选择歌词色彩" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "晚霞" }));

    expect(window.dataset.palette).toBe("sunset");
    expect(window.style.getPropertyValue("--dlx-lyric-gradient")).toContain("#FFD36A");
    expect(localStorage.getItem("ome.desklyrics.color")).toBe("sunset");
    expect(screen.queryByRole("group", { name: "选择歌词色彩" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "歌词色彩：晚霞" })).toHaveFocus();
  });

  it("closes the palette picker with Escape and preserves the trigger focus", () => {
    const { container } = render(<DesktopLyricsWindow />);
    const window = container.querySelector(".dlx") as HTMLDivElement;
    fireEvent.mouseEnter(window);

    const trigger = screen.getByRole("button", { name: "歌词色彩：极光" });
    fireEvent.click(trigger);
    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByRole("group", { name: "选择歌词色彩" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("keeps the vertical palette menu beside the lyric column", () => {
    render(<DesktopLyricsWindow />);
    fireEvent.mouseEnter(screen.getByText("…").closest(".dlx") as HTMLDivElement);
    fireEvent.click(screen.getByRole("button", { name: "切换为竖排" }));
    fireEvent.click(screen.getByRole("button", { name: "歌词色彩：极光" }));

    const options = screen.getByRole("group", { name: "选择歌词色彩" });
    expect(options).toHaveClass("is-vertical");
    expect(options.parentElement).toHaveClass("dlx-glass");
  });
});
