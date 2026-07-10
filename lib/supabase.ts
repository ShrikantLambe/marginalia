import "server-only";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error(
    "Missing required env vars: NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY"
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

/** Legacy type for the old jsonb highlights column — only used for migration reference */
export type Highlight = { text: string; created_at: string };

/** Structured highlight from the dedicated highlights table */
export type ArticleHighlight = {
  id: string;
  user_id: string;
  item_id: string;
  text: string;
  note: string | null;
  position_start: number | null;
  position_end: number | null;
  created_at: string;
};

export type ReadingItem = {
  id: string;
  user_id: string;
  url: string;
  title: string | null;
  summary: string | null;
  tags: string[] | null;
  created_at: string;
  // Phase 1
  status: "queued" | "reading" | "read" | "archived" | "failed";
  failure_reason: "pdf" | "empty_extract" | "fetch_error" | null;
  user_tags: string[];
  notes: string | null;
  rating: number | null;
  read_at: string | null;
  last_opened_at: string | null;
  // Phase 2
  embedding_model: string | null;
  embedded_at: string | null;
  // Phase 6
  editorial_note: string | null;
  editorial_references: string[];
  editorial_generated_at: string | null;
  // Phase 7
  article_html: string | null;
  article_text: string | null;
  author: string | null;
  site_name: string | null;
  hero_image_url: string | null;
  word_count: number | null;
  reading_time_minutes: number | null;
  // Welcome Back
  scroll_progress: number;
};

export type SearchResult = ReadingItem & { similarity: number };

export type ChatMessage = {
  id: string;
  user_id: string;
  item_id: string;
  highlight_id: string | null;
  role: "user" | "assistant";
  content: string;
  trigger: "manual" | "proactive";
  context_note: string | null;
  created_at: string;
};

export type Synthesis = {
  id: string;
  user_id: string;
  title: string | null;
  prompt: string | null;
  draft: string;
  source_item_ids: string[];
  project_id: string | null;
  created_at: string;
};

export type Project = {
  id: string;
  user_id: string;
  name: string;
  emoji: string;
  color: string | null;
  description: string | null;
  status: "active" | "paused" | "archived";
  sort_order: number;
  created_at: string;
  item_count?: number;
};

export type ProjectItem = {
  project_id: string;
  item_id: string;
  added_at: string;
};

export type ReadingTheme = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  centroid: string | null;
  item_ids: string[];
  item_count: number;
  generated_at: string;
  user_renamed: boolean;
};

export type BriefStatus = "open" | "drafting" | "closed" | "archived";

export type Brief = {
  id: string;
  user_id: string;
  question: string;
  description: string | null;
  embedding: string | null;
  status: BriefStatus;
  closed_reason: string | null;
  created_at: string;
  closed_at: string | null;
  // virtual — computed in API
  item_count?: number;
};

export type BriefItem = {
  brief_id: string;
  item_id: string;
  added_at: string;
  added_by: "user" | "auto";
  similarity: number | null;
  user_dismissed: boolean;
};

export type BriefItemWithArticle = BriefItem & { reading_list: ReadingItem };

export type Source = {
  id: string;
  user_id: string;
  type: "domain" | "author";
  value: string;
  home_domains: string[] | null;
  brief_id: string | null;
  notes: string | null;
  created_at: string;
};

export type DiscoverSearch = {
  id: string;
  user_id: string;
  query: string;
  scope: DiscoverScope;
  cache_key: string | null;
  result_count: number;
  dropped_count: number;
  created_at: string;
};

export type DiscoverSavedSearch = {
  id: string;
  user_id: string;
  name: string;
  query: string;
  scope: DiscoverScope;
  created_at: string;
};

export type DiscoverScope = {
  mode: "all" | "brief" | "custom";
  briefId?: string;
  sourceIds?: string[];
};

export type DiscoverResult = {
  url: string;
  title: string;
  snippet: string;
  publishedDate?: string;
  alreadyCaptured?: boolean;
  itemId?: string;
  authorVerification?: "verified" | "unverified" | "unknown";
  matchedAuthor?: string;
};
