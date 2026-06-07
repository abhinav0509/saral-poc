import { describe, it, expect } from "vitest";
import { toE164India } from "./auth";

describe("toE164India", () => {
  it("normalises a bare 10-digit number", () => {
    expect(toE164India("9876543210")).toBe("+919876543210");
  });

  it("accepts already-prefixed forms", () => {
    expect(toE164India("+919876543210")).toBe("+919876543210");
    expect(toE164India("919876543210")).toBe("+919876543210");
    expect(toE164India("+91 98765 43210")).toBe("+919876543210");
  });

  it("strips a trunk 0 and separators", () => {
    expect(toE164India("09876543210")).toBe("+919876543210");
    expect(toE164India("98765-43210")).toBe("+919876543210");
    expect(toE164India("  98765 43210  ")).toBe("+919876543210");
  });

  it("does NOT mistake a 10-digit number starting with 91 for a country code", () => {
    // 91 is only stripped when exactly 10 digits follow (i.e. it's a CC prefix).
    expect(toE164India("9100000000")).toBe("+919100000000");
  });

  it("throws on input that can't yield 10 digits", () => {
    expect(() => toE164India("")).toThrow();
    expect(() => toE164India("   ")).toThrow();
    expect(() => toE164India("12345")).toThrow();
    expect(() => toE164India("abc")).toThrow();
  });
});
