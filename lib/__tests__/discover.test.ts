import { describe, it, expect } from "vitest";
import { enforceAllowlist, buildCacheKey } from "../discover";
import { search, MOCK_ROGUE_DOMAIN } from "../search-provider";

describe("enforceAllowlist", () => {
  it("drops the mock rogue-domain fixture", async () => {
    const allowlist = ["ft.com", "simonwillison.net"];
    const results = await search({ query: "test query", includeDomains: allowlist });
    const { kept, dropped } = enforceAllowlist(results, allowlist);
    expect(dropped.length).toBeGreaterThanOrEqual(1);
    expect(dropped.some((d) => d.url.includes(MOCK_ROGUE_DOMAIN))).toBe(true);
    expect(kept.every((r) => allowlist.some((d) => r.url.includes(d)))).toBe(true);
  });

  it("drops URLs whose registrable domain differs despite a matching substring", () => {
    const { kept, dropped } = enforceAllowlist(
      [{ url: "https://ft.com.evil.example/x", title: "t", snippet: "s" }],
      ["ft.com"]
    );
    expect(kept).toHaveLength(0);
    expect(dropped).toHaveLength(1);
  });
});

describe("buildCacheKey", () => {
  it("is stable across allowlist order and query whitespace/case", () => {
    const a = buildCacheKey("  Data  Contracts ", ["b.com", "a.com"]);
    const b = buildCacheKey("data contracts", ["a.com", "b.com"]);
    expect(a).toBe(b);
  });

  it("changes when the allowlist changes", () => {
    expect(buildCacheKey("q", ["a.com"])).not.toBe(buildCacheKey("q", ["a.com", "b.com"]));
  });
});
