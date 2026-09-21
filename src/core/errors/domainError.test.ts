import { describe, expect, it } from "vitest";

import {
  createDomainError,
  isActionableCategory,
  isDomainError,
  toDomainError,
  type DomainError,
} from "./domainError";

describe("createDomainError", () => {
  it("defaults retryability from the category", () => {
    expect(createDomainError("net.timeout", "network", "timed out").retryable).toBe(true);
    expect(createDomainError("src.no_copyright", "source", "blocked").retryable).toBe(false);
  });

  it("lets the caller override retryability", () => {
    expect(
      createDomainError("src.rate_limited", "source", "slow down", { retryable: true }).retryable,
    ).toBe(true);
  });

  it("keeps the cause without leaking it into the message", () => {
    const cause = new Error("connection reset by peer");
    const error = createDomainError("net.reset", "network", "The source dropped the connection.", {
      cause,
    });
    expect(error.cause).toBe(cause);
    expect(error.message).not.toContain("reset by peer");
  });
});

describe("toDomainError", () => {
  it("passes a DomainError through untouched", () => {
    const original = createDomainError("a.b", "auth", "nope");
    expect(toDomainError(original)).toBe(original);
  });

  it("normalises a plain Error", () => {
    const error = toDomainError(new Error("boom"), { code: "x.y", category: "storage" });
    expect(isDomainError(error)).toBe(true);
    expect(error.message).toBe("boom");
    expect(error.code).toBe("x.y");
  });

  it("never assumes an unknown failure is retryable", () => {
    // An unknown error that silently retries is how a queue ends up spinning
    // on a permanently dead track.
    const error = toDomainError("something weird");
    expect(error.retryable).toBe(false);
    expect(error.category).toBe("unknown");
  });

  it("uses the caller message override so raw internals never reach the UI", () => {
    const error = toDomainError(new Error("SQLITE_BUSY: disk I/O error"), {
      message: "The library is busy. Please try again.",
      category: "storage",
    });
    expect(error.message).toBe("The library is busy. Please try again.");
  });
});

describe("isDomainError", () => {
  it("recognises the shape and rejects lookalikes", () => {
    const valid: DomainError = createDomainError("a.b", "auth", "x");
    expect(isDomainError(valid)).toBe(true);
    expect(isDomainError({ code: "a.b" })).toBe(false);
    expect(isDomainError(new Error("nope"))).toBe(false);
    expect(isDomainError(null)).toBe(false);
  });
});

describe("isActionableCategory", () => {
  it("marks categories the user can fix in Settings", () => {
    expect(isActionableCategory("auth")).toBe(true);
    expect(isActionableCategory("source")).toBe(true);
    expect(isActionableCategory("network")).toBe(false);
  });
});
