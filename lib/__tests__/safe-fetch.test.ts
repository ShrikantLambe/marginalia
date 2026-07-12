import { describe, it, expect } from "vitest";
import { safeFetch, UnsafeUrlError } from "../safe-fetch";

describe("safeFetch guards", () => {
  it("rejects non-http(s) schemes", async () => {
    await expect(safeFetch("file:///etc/passwd")).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(safeFetch("ftp://example.com")).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(safeFetch("javascript:alert(1)")).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it("rejects literal private / loopback / metadata IPs", async () => {
    await expect(safeFetch("http://127.0.0.1/")).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(safeFetch("http://10.0.0.5/")).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(safeFetch("http://192.168.1.1/")).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(safeFetch("http://169.254.169.254/latest/meta-data/")).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(safeFetch("http://[::1]/")).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it("rejects malformed URLs", async () => {
    await expect(safeFetch("not a url")).rejects.toBeInstanceOf(UnsafeUrlError);
  });
});
