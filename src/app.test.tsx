import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "./app";
import { activeView } from "./state/app";

afterEach(cleanup);

describe("App shell", () => {
  it("渲染四个导航项", () => {
    render(<App />);
    expect(screen.getByRole("button", { name: "首页" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "搜索" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "曲库" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "设置" })).toBeInTheDocument();
  });

  it("点击导航切换视图信号", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "曲库" }));
    expect(activeView.value).toBe("library");
    fireEvent.click(screen.getByRole("button", { name: "首页" }));
    expect(activeView.value).toBe("home");
  });
});
