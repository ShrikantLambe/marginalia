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
};
