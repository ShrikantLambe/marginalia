import "server-only";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export type Summary = {
  title: string;
  summary: string;
  tags: string[];
  articleHtml: string;
  articleText: string;
  author: string | null;
  siteName: string | null;
  heroImageUrl: string | null;
  wordCount: number;
  readingTimeMinutes: number;
};

/** Strip dangerous tags as defense-in-depth (Readability already sanitizes, but belt-and-suspenders) */
function sanitizeHtml(html: string): string {
  return html.replace(
    /<(script|iframe|style|object|embed)(\s[^>]*)?>[\s\S]*?<\/\1>/gi, ""
  ).replace(
    /<(script|iframe|style|object|embed)(\s[^>]*)?\/?>/, ""
  );
}

function extractHeroImage(dom: JSDOM, baseUrl: string): string | null {
  const doc = dom.window.document;
  // og:image first
  const ogImage = doc.querySelector('meta[property="og:image"]')?.getAttribute("content");
  if (ogImage) {
    try { return new URL(ogImage, baseUrl).href; } catch { /* fall through */ }
  }
  // First <img> in article body
  const img = doc.querySelector("article img, [class*='article'] img, .post img, img");
  const src = img?.getAttribute("src");
  if (src) {
    try {
      const abs = new URL(src, baseUrl).href;
      if (abs.startsWith("https://")) return abs;
    } catch { /* ignore */ }
  }
  return null;
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export async function fetchAndSummarize(url: string): Promise<Summary> {
  // 1. Fetch the page
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      "Cache-Control": "no-cache",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
    },
    signal: AbortSignal.timeout(15_000),
    redirect: "follow",
  });
  if (!res.ok) {
    if (res.status === 403 || res.status === 401) {
      throw new Error(
        "This page is behind a paywall or is blocking automated access. Try a non-paywalled URL or a cached version (e.g. archive.ph)."
      );
    }
    if (res.status === 404) throw new Error("Page not found (404).");
    if (res.status === 429) throw new Error("The site is rate-limiting requests. Try again in a moment.");
    if (res.status >= 500) throw new Error(`The site returned a server error (${res.status}). Try again later.`);
    throw new Error(`Could not fetch the page (HTTP ${res.status}).`);
  }

  const html = await res.text();

  // 2. Extract article body with Readability
  const dom = new JSDOM(html, { url });
  const article = new Readability(dom.window.document).parse();
  if (!article || !article.textContent) {
    throw new Error("Could not extract readable content from this page");
  }

  const title = article.title?.trim() || new URL(url).hostname;
  const articleHtml = sanitizeHtml(article.content ?? "");
  const articleText = article.textContent.replace(/\s+/g, " ").trim();
  const words = countWords(articleText);
  const heroImageUrl = extractHeroImage(dom, url);

  const textForGemini = articleText.slice(0, 12_000);

  // 3. Summarize with Gemini
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const prompt = `You are summarizing an article for a personal reading list.

Output two parts, separated by exactly one line containing only "---TAGS---".

Part 1: A 3-4 sentence TL;DR. Crisp, factual, no fluff. Skip "this article discusses" filler — just say what it says.
Part 2: 3-5 short topic tags (lowercase, one or two words each), comma-separated.

ARTICLE TITLE: ${title}

ARTICLE CONTENT:
${textForGemini}`;

  const geminiResult = await model.generateContent(prompt);
  const raw = geminiResult.response.text().trim();

  const parts = raw.split(/---TAGS---/i).map(s => s.trim());
  const summary = parts[0] || raw;
  const tags = (parts[1] || "")
    .split(",")
    .map(t => t.trim().toLowerCase().replace(/^#/, ""))
    .filter(Boolean)
    .slice(0, 5);

  return {
    title,
    summary,
    tags,
    articleHtml,
    articleText,
    author: article.byline?.trim() || null,
    siteName: article.siteName?.trim() || null,
    heroImageUrl,
    wordCount: words,
    readingTimeMinutes: Math.max(1, Math.ceil(words / 200)),
  };
}
