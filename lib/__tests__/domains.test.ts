import { describe, it, expect } from "vitest";
import { normalizeDomain } from "../domains";

describe("normalizeDomain", () => {
  it("normalizes full URLs to eTLD+1", () => {
    expect(normalizeDomain("https://www.bbc.co.uk/news/x")).toBe("bbc.co.uk");
    expect(normalizeDomain("https://www.simonwillison.net/2024/foo")).toBe("simonwillison.net");
  });

  it("accepts bare domains", () => {
    expect(normalizeDomain("ft.com")).toBe("ft.com");
    expect(normalizeDomain("WWW.FT.COM")).toBe("ft.com");
  });

  it("keeps registrable subdomain-based domains at eTLD+1", () => {
    expect(normalizeDomain("benn.substack.com")).toBe("substack.com");
  });

  it("rejects public suffixes and garbage", () => {
    expect(normalizeDomain("co.uk")).toBeNull();
    expect(normalizeDomain("")).toBeNull();
    expect(normalizeDomain("   ")).toBeNull();
    expect(normalizeDomain("not a domain at all !!!")).toBeNull();
  });
});
