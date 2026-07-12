// Node-only (node:dns / node:net imports prevent client bundling); consumed by
// server code in summarize.ts and bylines.ts.
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * SSRF guard for fetching user-supplied URLs (article capture, byline
 * verification). Blocks non-http(s) schemes and any host that resolves to a
 * private, loopback, or link-local address — including cloud metadata
 * (169.254.169.254). Redirects are followed manually so every hop is
 * re-validated; the provider/page can't bounce us onto an internal host.
 */

export class UnsafeUrlError extends Error {}

function isPrivateIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 10 ||
      a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) || // link-local incl. cloud metadata
      a === 0 ||
      a >= 224 // multicast / reserved
    );
  }
  if (v === 6) {
    const lower = ip.toLowerCase();
    return (
      lower === "::1" ||
      lower === "::" ||
      lower.startsWith("fe80") || // link-local
      lower.startsWith("fc") || lower.startsWith("fd") || // unique-local
      lower.startsWith("::ffff:") // IPv4-mapped — validate the embedded v4 separately below
    );
  }
  return false;
}

async function assertPublicHost(hostname: string): Promise<void> {
  // Literal IP in the URL
  if (isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new UnsafeUrlError("Refusing to fetch a private address.");
    return;
  }
  // Resolve the hostname and reject if ANY resolved address is private
  const records = await lookup(hostname, { all: true }).catch(() => {
    throw new UnsafeUrlError("Could not resolve host.");
  });
  for (const { address } of records) {
    const v4 = address.startsWith("::ffff:") ? address.slice(7) : address;
    if (isPrivateIp(v4)) throw new UnsafeUrlError("Refusing to fetch a host that resolves to a private address.");
  }
}

function assertHttpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError("Invalid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError("Only http and https URLs can be fetched.");
  }
  return url;
}

/**
 * fetch() with SSRF validation and manual, re-validated redirect following.
 * Signature mirrors the subset of fetch used by summarize/bylines.
 */
export async function safeFetch(
  rawUrl: string,
  init: RequestInit & { signal?: AbortSignal } = {},
  maxRedirects = 5
): Promise<Response> {
  let url = assertHttpUrl(rawUrl);
  await assertPublicHost(url.hostname);

  for (let i = 0; i <= maxRedirects; i++) {
    const res = await fetch(url, { ...init, redirect: "manual" });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      const next = assertHttpUrl(new URL(res.headers.get("location")!, url).href);
      await assertPublicHost(next.hostname);
      url = next;
      continue;
    }
    return res;
  }
  throw new UnsafeUrlError("Too many redirects.");
}
