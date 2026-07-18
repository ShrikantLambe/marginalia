"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Brief, BriefItemWithArticle, ReadingItem } from "@/lib/supabase";

type Candidate = ReadingItem & { similarity: number };

function hostname(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function trunc(s: string | null, n: number) {
  if (!s) return "";
  return s.length <= n ? s : s.slice(0, n) + "…";
}

export function BriefDetail({
  brief: initialBrief,
  initialItems,
}: {
  brief: Brief;
  initialItems: BriefItemWithArticle[];
}) {
  const router = useRouter();
  const [brief, setBrief] = useState(initialBrief);
  const [items, setItems] = useState<BriefItemWithArticle[]>(initialItems);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(true);

  // Edit state
  const [editingQuestion, setEditingQuestion] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [questionDraft, setQuestionDraft] = useState(brief.question);
  const [descDraft, setDescDraft] = useState(brief.description ?? "");

  // Close brief flow
  const [closing, setClosing] = useState(false);
  const [closeReason, setCloseReason] = useState("");
  const [savingClose, setSavingClose] = useState(false);

  const questionRef = useRef<HTMLTextAreaElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);

  // Load candidates
  useEffect(() => {
    fetch(`/api/briefs/${brief.id}/candidates`)
      .then(r => r.ok ? r.json() : [])
      .then(data => { setCandidates(Array.isArray(data) ? data : []); })
      .catch(() => {})
      .finally(() => setLoadingCandidates(false));
  }, [brief.id]);

  // Focus when entering edit mode
  useEffect(() => { if (editingQuestion) questionRef.current?.focus(); }, [editingQuestion]);
  useEffect(() => { if (editingDesc) descRef.current?.focus(); }, [editingDesc]);

  async function patchBrief(updates: Record<string, unknown>) {
    const res = await fetch(`/api/briefs/${brief.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (res.ok) setBrief(await res.json());
  }

  async function saveQuestion() {
    const q = questionDraft.trim();
    if (q && q !== brief.question) await patchBrief({ question: q });
    else setQuestionDraft(brief.question);
    setEditingQuestion(false);
  }

  async function saveDesc() {
    const d = descDraft.trim() || null;
    if (d !== brief.description) await patchBrief({ description: d });
    setEditingDesc(false);
  }

  async function attachItem(itemId: string) {
    const res = await fetch(`/api/briefs/${brief.id}/attach`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_id: itemId }),
    });
    if (!res.ok) return;
    // Move from candidates to items
    const candidate = candidates.find(c => c.id === itemId);
    if (candidate) {
      setCandidates(prev => prev.filter(c => c.id !== itemId));
      const newBriefItem: BriefItemWithArticle = {
        brief_id: brief.id,
        item_id: itemId,
        added_at: new Date().toISOString(),
        added_by: "user",
        similarity: candidate.similarity,
        user_dismissed: false,
        reading_list: candidate,
      };
      setItems(prev => [newBriefItem, ...prev]);
    }
  }

  async function dismissCandidate(itemId: string) {
    await fetch(`/api/briefs/${brief.id}/dismiss`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_id: itemId }),
    });
    setCandidates(prev => prev.filter(c => c.id !== itemId));
  }

  async function removeItem(itemId: string) {
    await fetch(`/api/briefs/${brief.id}/dismiss`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_id: itemId }),
    });
    setItems(prev => prev.filter(i => i.item_id !== itemId));
  }

  async function closeBrief() {
    setSavingClose(true);
    await patchBrief({ status: "closed", closed_reason: closeReason.trim() || null });
    setSavingClose(false);
    setClosing(false);
  }

  async function deleteBrief() {
    if (!confirm("Delete this brief? This cannot be undone.")) return;
    await fetch(`/api/briefs/${brief.id}`, { method: "DELETE" });
    router.push("/briefs");
  }

  const [drafting, setDrafting] = useState(false);
  async function draftAnswer() {
    setDrafting(true);
    try {
      const res = await fetch("/api/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_ids: items.map((bi) => bi.item_id), angle: brief.question }),
      });
      const data = await res.json();
      if (res.ok) router.push(`/synthesis/${data.id}`);
      else { setDrafting(false); alert(data.error ?? "Couldn't draft an answer."); }
    } catch {
      setDrafting(false);
    }
  }

  const isOpen = brief.status === "open" || brief.status === "drafting";

  return (
    <div className="flex min-h-screen">
      {/* ── Left column ─────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 px-8 md:px-14 py-10 max-w-3xl">
        {/* Back */}
        <Link
          href="/briefs"
          className="font-mono text-[10px] tracking-[0.15em] uppercase text-muted hover:text-ink transition-colors block mb-8"
        >
          ← Briefs
        </Link>

        {/* Question — editable */}
        {editingQuestion ? (
          <textarea
            ref={questionRef}
            value={questionDraft}
            onChange={e => setQuestionDraft(e.target.value)}
            onBlur={saveQuestion}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveQuestion(); } if (e.key === "Escape") { setQuestionDraft(brief.question); setEditingQuestion(false); } }}
            rows={3}
            className="w-full bg-transparent outline-none font-serif italic text-[28px] leading-tight resize-none border-b-2 border-oxblood"
          />
        ) : (
          <h1
            onClick={() => isOpen && setEditingQuestion(true)}
            className={`font-serif italic text-[28px] leading-tight mb-2 ${isOpen ? "cursor-text hover:text-oxblood transition-colors" : ""}`}
          >
            {brief.question}
          </h1>
        )}

        {/* Description — editable */}
        {editingDesc ? (
          <textarea
            ref={descRef}
            value={descDraft}
            onChange={e => setDescDraft(e.target.value)}
            onBlur={saveDesc}
            onKeyDown={e => { if (e.key === "Escape") { setDescDraft(brief.description ?? ""); setEditingDesc(false); } }}
            rows={3}
            placeholder="Add context or scope…"
            className="w-full bg-transparent outline-none font-serif text-[16px] leading-relaxed text-ink/70 resize-none border-b border-rule mt-2"
          />
        ) : (
          <p
            onClick={() => isOpen && setEditingDesc(true)}
            className={`font-serif text-[16px] leading-relaxed text-ink/70 mb-1 min-h-[1.5rem] ${
              isOpen ? "cursor-text hover:text-ink/90 transition-colors" : ""
            } ${!brief.description ? "italic text-muted/60" : ""}`}
          >
            {brief.description || (isOpen ? "Add context or scope…" : "")}
          </p>
        )}

        {/* Meta */}
        <div className="flex items-center gap-4 font-mono text-[10px] tracking-[0.12em] uppercase text-muted mt-3 mb-10">
          <span>{items.length} {items.length === 1 ? "article" : "articles"}</span>
          <span>·</span>
          <span className={brief.status !== "open" ? "text-muted" : "text-sage"}>
            {brief.status}
          </span>
          {brief.closed_reason && (
            <>
              <span>·</span>
              <span className="italic normal-case">{trunc(brief.closed_reason, 60)}</span>
            </>
          )}
        </div>

        {/* Draft the answer — synthesize the linked articles into a cited brief */}
        {items.length >= 2 && (
          <div className="mb-8">
            <button
              onClick={draftAnswer}
              disabled={drafting}
              className="font-mono text-[10px] tracking-[0.15em] uppercase border border-oxblood text-oxblood px-3 py-2 hover:bg-oxblood hover:text-paper transition-colors disabled:opacity-40"
            >
              {drafting ? "Drafting…" : "Draft the answer →"}
            </button>
            <span className="font-serif italic text-[13px] text-muted ml-3">
              a cited synthesis of these {items.length} articles
            </span>
          </div>
        )}

        {/* Articles */}
        {items.length === 0 ? (
          <p className="font-serif italic text-muted text-[16px]">
            No articles yet. Articles you save will auto-match here when relevant.
          </p>
        ) : (
          <ul className="space-y-px">
            {items.map(bi => {
              const article = bi.reading_list;
              return (
                <li key={bi.item_id} className="group/item border-b border-rule py-3">
                  <div className="flex items-start gap-3">
                    {/* Left: oxblood rule for user-added */}
                    {bi.added_by === "user" && (
                      <div className="w-[2px] bg-oxblood/50 flex-shrink-0 self-stretch mt-1" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 font-mono text-[9px] tracking-[0.12em] uppercase text-muted mb-1">
                        <span>{hostname(article.url)}</span>
                        <span>·</span>
                        <span>{formatDate(article.created_at)}</span>
                        {bi.similarity !== null && (
                          <>
                            <span>·</span>
                            <span className="text-sage">{Math.round(bi.similarity * 100)}%</span>
                          </>
                        )}
                        {bi.added_by === "auto" && <span className="text-muted/70">auto</span>}
                      </div>
                      <Link
                        href={`/items/${article.id}`}
                        className="font-serif text-[17px] font-semibold leading-tight hover:text-oxblood transition-colors line-clamp-2"
                      >
                        {article.title || article.url}
                      </Link>
                      {article.summary && (
                        <p className="font-serif italic text-[13px] text-muted mt-1 leading-snug">
                          {trunc(article.summary, 100)}
                        </p>
                      )}
                    </div>
                    {/* Remove */}
                    {isOpen && (
                      <button
                        onClick={() => removeItem(bi.item_id)}
                        className="opacity-0 group-hover/item:opacity-100 transition-opacity text-muted hover:text-oxblood font-mono text-[10px] flex-shrink-0 mt-1"
                      >
                        —
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ── Right column (marginalia) ─────────────────────────── */}
      <div className="hidden lg:flex flex-col w-[280px] flex-shrink-0 border-l border-rule sticky top-0 h-screen overflow-y-auto">
        <div className="p-6 space-y-8">
          {/* Candidates */}
          <div>
            <div className="font-mono text-[10px] tracking-[0.15em] uppercase text-muted mb-3">
              Candidates {candidates.length > 0 && `· ${candidates.length}`}
            </div>
            {loadingCandidates ? (
              <p className="font-serif italic text-[13px] text-muted">Loading…</p>
            ) : candidates.length === 0 ? (
              <p className="font-serif italic text-[13px] text-muted leading-snug">
                No matches found yet. Save more articles relevant to this question.
              </p>
            ) : (
              <ul className="space-y-3">
                {candidates.map(c => (
                  <li key={c.id} className="group/cand">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-serif text-[13px] font-semibold leading-snug line-clamp-2 group-hover/cand:text-oxblood transition-colors">
                          {c.title || hostname(c.url)}
                        </p>
                        <p className="font-mono text-[9px] tracking-[0.1em] uppercase text-muted mt-0.5">
                          {Math.round(c.similarity * 100)}% match
                        </p>
                      </div>
                      <div className="flex gap-1 flex-shrink-0 mt-0.5">
                        <button
                          onClick={() => attachItem(c.id)}
                          className="font-mono text-[11px] text-sage hover:text-ink transition-colors"
                          title="Add to brief"
                        >
                          +
                        </button>
                        <button
                          onClick={() => dismissCandidate(c.id)}
                          className="font-mono text-[11px] text-muted hover:text-oxblood transition-colors"
                          title="Dismiss"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <hr className="border-rule" />

          {/* Actions */}
          {isOpen && (
            <div className="space-y-4">
              <div className="font-mono text-[10px] tracking-[0.15em] uppercase text-muted">
                Actions
              </div>

              {!closing ? (
                <button
                  onClick={() => setClosing(true)}
                  className="font-mono text-[10px] tracking-[0.12em] uppercase text-muted hover:text-ink transition-colors block"
                >
                  Close brief
                </button>
              ) : (
                <div className="space-y-2">
                  <textarea
                    value={closeReason}
                    onChange={e => setCloseReason(e.target.value)}
                    placeholder="What did you conclude? (optional)"
                    rows={3}
                    className="w-full bg-transparent border border-rule focus:border-oxblood outline-none px-2 py-1.5 font-serif text-[13px] placeholder:text-muted/50 resize-none transition-colors"
                  />
                  <div className="flex gap-3 font-mono text-[10px] tracking-[0.12em] uppercase">
                    <button
                      onClick={closeBrief}
                      disabled={savingClose}
                      className="text-oxblood hover:text-ink transition-colors disabled:opacity-40"
                    >
                      {savingClose ? "…" : "Close"}
                    </button>
                    <button
                      onClick={() => setClosing(false)}
                      className="text-muted hover:text-ink transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <button
                onClick={deleteBrief}
                className="font-mono text-[10px] tracking-[0.12em] uppercase text-muted hover:text-oxblood transition-colors block"
              >
                Delete brief
              </button>
            </div>
          )}

          {!isOpen && (
            <div className="space-y-2">
              <div className="font-mono text-[10px] tracking-[0.15em] uppercase text-muted">
                Closed
              </div>
              {brief.closed_reason && (
                <p className="font-serif italic text-[13px] text-ink/70 leading-relaxed">
                  {brief.closed_reason}
                </p>
              )}
              <button
                onClick={() => patchBrief({ status: "open", closed_at: null })}
                className="font-mono text-[10px] tracking-[0.12em] uppercase text-muted hover:text-ink transition-colors"
              >
                Reopen
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
