import "server-only";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export type Summary = {
  title: string;
  summary: string;
  tags: string[];
};

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
  if (!res.ok) throw new Error(`Failed to fetch URL (${res.status})`);

  const html = await res.text();

  // 2. Extract the article body with Readability
  const dom = new JSDOM(html, { url });
  const article = new Readability(dom.window.document).parse();
  if (!article || !article.textContent) {
    throw new Error("Could not extract readable content from this page");
  }

  const title = article.title?.trim() || new URL(url).hostname;
  const text = article.textContent.replace(/\s+/g, " ").trim().slice(0, 12_000);

  // 3. Send to Gemini
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const prompt = `You are summarizing an article for a personal reading list.

Output two parts, separated by exactly one line containing only "---TAGS---".

Part 1: A 3-4 sentence TL;DR. Crisp, factual, no fluff. Skip "this article discusses" filler — just say what it says.
Part 2: 3-5 short topic tags (lowercase, one or two words each), comma-separated.

ARTICLE TITLE: ${title}

ARTICLE CONTENT:
${text}`;

  const result = await model.generateContent(prompt);
  const raw = result.response.text().trim();

  const [summaryPart, tagsPart] = raw.split(/---TAGS---/i).map((s) => s.trim());
  const summary = summaryPart || raw;
  const tags = (tagsPart || "")
    .split(",")
    .map((t) => t.trim().toLowerCase().replace(/^#/, ""))
    .filter(Boolean)
    .slice(0, 5);

  return { title, summary, tags };
}
