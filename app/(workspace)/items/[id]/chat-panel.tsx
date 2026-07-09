"use client";

import { useState, useEffect, useRef } from "react";
import type { ArticleHighlight, ChatMessage } from "@/lib/supabase";

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max).trim() + "…" : text;
}

export function ChatPanel({
  itemId,
  highlights,
  open,
  onOpenChange,
  activeHighlightId,
  onActiveHighlightChange,
  pendingInsight,
}: {
  itemId: string;
  highlights: ArticleHighlight[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeHighlightId: string | null;
  onActiveHighlightChange: (id: string | null) => void;
  pendingInsight: ChatMessage | null;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open || loaded) return;
    fetch(`/api/items/${itemId}/chat`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: ChatMessage[]) => setMessages(data))
      .finally(() => setLoaded(true));
  }, [open, loaded, itemId]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, streamingText, activeHighlightId]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!pendingInsight) return;
    setMessages((prev) => (prev.some((m) => m.id === pendingInsight.id) ? prev : [...prev, pendingInsight]));
  }, [pendingInsight]);

  const activeMessages = messages.filter((m) =>
    activeHighlightId ? m.highlight_id === activeHighlightId : m.highlight_id === null
  );

  const passageThreads = highlights.filter((h) =>
    messages.some((m) => m.highlight_id === h.id)
  );

  const activeHighlight = activeHighlightId
    ? highlights.find((h) => h.id === activeHighlightId) ?? null
    : null;

  async function send() {
    const question = input.trim();
    if (!question || streamingText !== null) return;

    setInput("");
    setMessages((prev) => [
      ...prev,
      {
        id: `temp-user-${Date.now()}`,
        user_id: "",
        item_id: itemId,
        highlight_id: activeHighlightId,
        role: "user",
        content: question,
        trigger: "manual",
        context_note: null,
        created_at: new Date().toISOString(),
      },
    ]);
    setStreamingText("");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`/api/items/${itemId}/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, highlightId: activeHighlightId }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        setStreamingText(
          res.status === 429 ? "Daily AI limit reached. Try again tomorrow." : "Something went wrong."
        );
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: !done });
        setStreamingText(acc);
      }
      setMessages((prev) => [
        ...prev,
        {
          id: `temp-assistant-${Date.now()}`,
          user_id: "",
          item_id: itemId,
          highlight_id: activeHighlightId,
          role: "assistant",
          content: acc,
          trigger: "manual",
          context_note: null,
          created_at: new Date().toISOString(),
        },
      ]);
    } catch {
      // aborted or network failure — leave the user message, drop the pending answer
    } finally {
      setStreamingText(null);
    }
  }

  return (
    <>
      <button
        onClick={() => onOpenChange(!open)}
        className="fixed bottom-6 right-6 z-40 border border-rule bg-paper px-4 py-2 font-mono text-[10px] tracking-[0.15em] uppercase text-ink hover:border-oxblood hover:text-oxblood transition-colors"
      >
        {open ? "Close" : "Ask"}
      </button>

      {open && (
        <div className="fixed bottom-20 right-6 z-40 w-[360px] max-h-[70vh] flex flex-col border border-rule bg-paper">
          {/* Thread switcher */}
          {passageThreads.length > 0 && (
            <div className="flex flex-wrap gap-x-3 gap-y-1 px-4 pt-4 font-mono text-[10px] tracking-[0.12em] uppercase">
              <button
                onClick={() => onActiveHighlightChange(null)}
                className={activeHighlightId === null ? "text-oxblood" : "text-muted hover:text-ink transition-colors"}
              >
                General
              </button>
              {passageThreads.map((h) => (
                <button
                  key={h.id}
                  onClick={() => onActiveHighlightChange(h.id)}
                  className={activeHighlightId === h.id ? "text-oxblood" : "text-muted hover:text-ink transition-colors"}
                  title={h.text}
                >
                  {truncate(h.text, 20)}
                </button>
              ))}
            </div>
          )}

          {/* Header */}
          <div className="px-4 pt-3 pb-3 border-b border-rule">
            <div className="font-mono text-[10px] tracking-[0.15em] uppercase text-muted mb-1">
              {activeHighlight ? "Discussing Passage" : "Ask About This Article"}
            </div>
            {activeHighlight && (
              <p className="font-serif italic text-[13px] text-ink/80 leading-snug">
                {truncate(activeHighlight.text, 120)}
              </p>
            )}
          </div>

          {/* Messages */}
          <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {loaded && activeMessages.length === 0 && streamingText === null && (
              <p className="font-serif italic text-[13px] text-muted">
                {activeHighlight ? "Ask something about this passage…" : "Ask anything about this article…"}
              </p>
            )}
            {activeMessages.map((m) =>
              m.trigger === "proactive" ? (
                <div key={m.id} className="flex gap-3">
                  <div className="w-px bg-oxblood/60 flex-shrink-0" />
                  <p className="font-serif italic text-[13px] leading-relaxed text-ink/70">{m.content}</p>
                </div>
              ) : (
                <div key={m.id} className={m.role === "user" ? "text-right" : "text-left"}>
                  <p
                    className={`inline-block font-serif text-[14px] leading-relaxed max-w-[85%] ${
                      m.role === "user" ? "text-ink" : "text-ink/85"
                    }`}
                  >
                    {m.content}
                  </p>
                </div>
              )
            )}
            {streamingText !== null && (
              <div className="text-left">
                <p className="inline-block font-serif text-[14px] leading-relaxed text-ink/85 max-w-[85%]">
                  {streamingText || "…"}
                </p>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-rule px-4 py-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") send();
              }}
              disabled={streamingText !== null}
              placeholder={activeHighlight ? "Ask about this passage…" : "Ask a question…"}
              className="w-full bg-transparent border-b border-rule focus:border-oxblood outline-none py-1 font-serif text-[14px] text-ink placeholder:text-muted/50 transition-colors disabled:opacity-40"
            />
          </div>
        </div>
      )}
    </>
  );
}
