import "server-only";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { GoogleGenerativeAI } from "@google/generative-ai";
import DOMPurify from "isomorphic-dompurify";
import { safeFetch, UnsafeUrlError } from "./safe-fetch";
import { withRetry } from "./retry";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export type FailureReason = "pdf" | "empty_extract" | "fetch_error";

/** Extraction failed in a known way — callers save a status='failed' row
 *  instead of letting failure text masquerade as a summary. */
export class ExtractionError extends Error {
  reason: FailureReason;
  constructor(reason: FailureReason, message: string) {
    super(message);
    this.reason = reason;
  }
}

/** Human title fallback for failed captures: URL path, never a fake summary. */
export function titleFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const lastSegment = u.pathname.split("/").filter(Boolean).pop();
    return lastSegment ? `${u.hostname.replace(/^www\./, "")}/${lastSegment}` : u.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Extracted article content — everything except the Gemini-derived fields. */
export type ArticleContent = {
  title: string;
  articleHtml: string;
  articleText: string;
  author: string | null;
  siteName: string | null;
  heroImageUrl: string | null;
  wordCount: number;
  readingTimeMinutes: number;
};

export type Summary = ArticleContent & {
  summary: string;
  tags: string[];
};

/**
 * Sanitize extracted article HTML before it is stored and later injected via
 * innerHTML in the reader. Uses DOMPurify (allowlist-based) — a regex blacklist
 * cannot stop `onerror=`, `javascript:` URIs, or `<svg onload>`. This is the
 * XSS boundary for saved pages, not defense-in-depth: never weaken it to a
 * blacklist.
 */
function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["style", "form", "input", "button"],
    FORBID_ATTR: ["style"],
    ALLOW_DATA_ATTR: false,
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Extract a PDF's text layer into ArticleContent so a PDF URL becomes a normal
 * readable + chattable item. Scanned PDFs (no text layer, no OCR) fail cleanly.
 */
async function extractPdf(res: Response, url: string): Promise<ArticleContent> {
  const { getDocumentProxy, extractText, getMeta } = await import("unpdf");
  let text: string;
  let metaTitle = "";
  try {
    const bytes = new Uint8Array(await res.arrayBuffer());
    const pdf = await getDocumentProxy(bytes);
    const extracted = await extractText(pdf, { mergePages: true });
    text = (extracted.text ?? "").trim();
    try {
      const meta = await getMeta(pdf);
      metaTitle = (meta?.info?.Title as string | undefined)?.trim() ?? "";
    } catch { /* no metadata */ }
  } catch {
    throw new ExtractionError("pdf", "Couldn't read this PDF.");
  }

  if (text.replace(/\s+/g, " ").trim().length < 200) {
    throw new ExtractionError("pdf", "This PDF has no extractable text — it may be scanned.");
  }

  let title = metaTitle;
  if (!title) {
    try {
      const seg = decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).pop() ?? "");
      title = seg.replace(/\.pdf$/i, "").replace(/[-_]+/g, " ").trim();
    } catch { /* fall through */ }
  }
  if (!title) { try { title = new URL(url).hostname.replace(/^www\./, ""); } catch { title = url; } }

  const paragraphs = text.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean);
  const articleHtml = sanitizeHtml(paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("\n"));
  const articleText = text.replace(/\s+/g, " ").trim();
  const words = countWords(text);

  return {
    title,
    articleHtml,
    articleText,
    author: null,
    siteName: "PDF",
    heroImageUrl: null,
    wordCount: words,
    readingTimeMinutes: Math.max(1, Math.ceil(words / 200)),
  };
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

function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") return u.pathname.slice(1).split("?")[0];
    if (u.hostname.includes("youtube.com")) return u.searchParams.get("v");
  } catch { /* ignore */ }
  return null;
}

async function fetchAndSummarizeYouTube(url: string, videoId: string): Promise<Summary> {
  // Metadata via oEmbed — free, no API key
  let title = url;
  let author: string | null = null;
  try {
    const oembedRes = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
      { signal: AbortSignal.timeout(8_000) }
    );
    if (oembedRes.ok) {
      const oembed = await oembedRes.json();
      title = oembed.title ?? url;
      author = oembed.author_name ?? null;
    }
  } catch { /* fall back to url as title */ }

  // Thumbnail — always available at this URL, no API key needed
  const heroImageUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

  // Summarize via Gemini multimodal — processes audio + visuals natively
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const prompt = `You are summarizing a YouTube video for a personal reading list.

Output two parts, separated by exactly one line containing only "---TAGS---".

Part 1: A 3-4 sentence TL;DR of what this video covers. Crisp, factual — what does the speaker actually say or argue?
Part 2: 3-5 short topic tags (lowercase, one or two words each), comma-separated.

VIDEO TITLE: ${title}
CHANNEL: ${author ?? "unknown"}`;

  const geminiResult = await withRetry(() => model.generateContent([
    { fileData: { fileUri: url, mimeType: "video/mp4" } },
    { text: prompt },
  ]));
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
    articleHtml: "",
    articleText: summary, // used for embeddings
    author,
    siteName: "YouTube",
    heroImageUrl,
    wordCount: 0,
    readingTimeMinutes: 0,
  };
}

/**
 * Fetch + extract article content only — no Gemini. Used both as the first
 * stage of fetchAndSummarize and directly by the re-fetch endpoint, so
 * repairing an article's content never depends on the summarizer being up.
 */
export async function fetchArticle(url: string): Promise<ArticleContent> {
  // 1. Fetch the page — SSRF-guarded (rejects private/internal hosts, re-checks redirects)
  const res = await safeFetch(url, {
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
  }).catch((e) => {
    if (e instanceof UnsafeUrlError) throw new ExtractionError("fetch_error", e.message);
    throw new ExtractionError("fetch_error", "Couldn't reach this page.");
  });
  if (!res.ok) {
    if (res.status === 403 || res.status === 401) {
      throw new ExtractionError(
        "fetch_error",
        "This page is behind a paywall or is blocking automated access. Try a non-paywalled URL or a cached version (e.g. archive.ph)."
      );
    }
    if (res.status === 404) throw new ExtractionError("fetch_error", "Page not found (404).");
    if (res.status === 429) throw new ExtractionError("fetch_error", "The site is rate-limiting requests. Try again in a moment.");
    if (res.status >= 500) throw new ExtractionError("fetch_error", `The site returned a server error (${res.status}). Try again later.`);
    throw new ExtractionError("fetch_error", `Could not fetch the page (HTTP ${res.status}).`);
  }

  // PDFs get a dedicated text-extraction path (no Readability).
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/pdf") || url.toLowerCase().endsWith(".pdf")) {
    return extractPdf(res, url);
  }
  // Other binaries can't be read.
  if (contentType && !contentType.includes("html") && !contentType.includes("xml") && !contentType.includes("text/plain")) {
    throw new ExtractionError("empty_extract", `Can't read this content type (${contentType.split(";")[0]}).`);
  }

  const html = await res.text();

  // 2. Extract article body with Readability
  const dom = new JSDOM(html, { url });
  const article = new Readability(dom.window.document).parse();
  if (!article || !article.textContent || article.textContent.replace(/\s+/g, " ").trim().length < 200) {
    throw new ExtractionError("empty_extract", "Could not extract readable content from this page");
  }

  const title = article.title?.trim() || new URL(url).hostname;
  const articleText = article.textContent.replace(/\s+/g, " ").trim();
  const words = countWords(article.textContent);

  return {
    title,
    articleHtml: sanitizeHtml(article.content ?? ""),
    articleText,
    author: article.byline?.trim() || null,
    siteName: article.siteName?.trim() || null,
    heroImageUrl: extractHeroImage(dom, url),
    wordCount: words,
    readingTimeMinutes: Math.max(1, Math.ceil(words / 200)),
  };
}

export async function fetchAndSummarize(url: string): Promise<Summary> {
  const youtubeId = extractYouTubeId(url);
  if (youtubeId) return fetchAndSummarizeYouTube(url, youtubeId);

  // 1-2. Fetch + extract (no Gemini)
  const content = await fetchArticle(url);

  const textForGemini = content.articleText.slice(0, 12_000);

  // 3. Summarize with Gemini
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const prompt = `You are summarizing an article for a personal reading list.

Output two parts, separated by exactly one line containing only "---TAGS---".

Part 1: A 3-4 sentence TL;DR. Crisp, factual, no fluff. Skip "this article discusses" filler — just say what it says.
Part 2: 3-5 short topic tags (lowercase, one or two words each), comma-separated.

ARTICLE TITLE: ${content.title}

ARTICLE CONTENT:
${textForGemini}`;

  const geminiResult = await withRetry(() => model.generateContent(prompt));
  const raw = geminiResult.response.text().trim();

  const parts = raw.split(/---TAGS---/i).map(s => s.trim());
  const summary = parts[0] || raw;
  const tags = (parts[1] || "")
    .split(",")
    .map(t => t.trim().toLowerCase().replace(/^#/, ""))
    .filter(Boolean)
    .slice(0, 5);

  return { ...content, summary, tags };
}
