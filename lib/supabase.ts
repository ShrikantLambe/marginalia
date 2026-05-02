import "server-only";
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export type Highlight = { text: string; created_at: string };

export type ReadingItem = {
  id: string;
  user_id: string;
  url: string;
  title: string | null;
  summary: string | null;
  tags: string[] | null;
  created_at: string;
  // Phase 1
  status: "unread" | "reading" | "read" | "archived";
  notes: string | null;
  highlights: Highlight[];
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
};

export type SearchResult = ReadingItem & { similarity: number };

export type Synthesis = {
  id: string;
  user_id: string;
  title: string | null;
  prompt: string | null;
  draft: string;
  source_item_ids: string[];
  created_at: string;
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
