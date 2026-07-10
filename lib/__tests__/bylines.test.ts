import { describe, it, expect } from "vitest";
import { matchAuthor, extractBylineFromHtml } from "../bylines";

describe("matchAuthor", () => {
  const authors = ["Benn Stancil", "Zeynep Tüfekçi"];

  it("matches through byline decoration", () => {
    expect(matchAuthor("By Benn Stancil, Contributor", authors)).toBe("Benn Stancil");
    expect(matchAuthor("BENN STANCIL", authors)).toBe("Benn Stancil");
  });

  it("matches through diacritics", () => {
    expect(matchAuthor("by Zeynep Tufekci", authors)).toBe("Zeynep Tüfekçi");
  });

  it("rejects different people", () => {
    expect(matchAuthor("By Jane Doe", authors)).toBeNull();
    expect(matchAuthor("", authors)).toBeNull();
  });
});

describe("extractBylineFromHtml", () => {
  it("prefers JSON-LD author", () => {
    const html = `<html><head><script type="application/ld+json">
      {"@type":"NewsArticle","author":{"@type":"Person","name":"Benn Stancil"}}
    </script><meta name="author" content="Someone Else"></head></html>`;
    expect(extractBylineFromHtml(html)).toBe("Benn Stancil");
  });

  it("handles JSON-LD author arrays", () => {
    const html = `<script type="application/ld+json">{"@type":"Article","author":[{"name":"A One"},{"name":"B Two"}]}</script>`;
    expect(extractBylineFromHtml(html)).toBe("A One, B Two");
  });

  it("falls back to meta author", () => {
    expect(extractBylineFromHtml(`<meta name="author" content="Jane Doe">`)).toBe("Jane Doe");
  });

  it("returns null when nothing is present", () => {
    expect(extractBylineFromHtml("<html><body>no byline here</body></html>")).toBeNull();
  });
});
