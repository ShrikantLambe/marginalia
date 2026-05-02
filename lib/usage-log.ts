import "server-only";
import { supabase } from "./supabase";

const DAILY_LIMIT = 100;

export type Operation = "summarize" | "embed" | "cluster-name" | "synthesize";

export async function checkDailyLimit(userId: string): Promise<boolean> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("usage_log")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", since);
  return (count ?? 0) < DAILY_LIMIT;
}

export async function logUsage(
  userId: string,
  operation: Operation,
  tokensIn?: number,
  tokensOut?: number
): Promise<void> {
  await supabase.from("usage_log").insert({
    user_id: userId,
    operation,
    tokens_in: tokensIn ?? null,
    tokens_out: tokensOut ?? null,
  });
}
