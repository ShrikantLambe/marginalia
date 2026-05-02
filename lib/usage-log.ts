import "server-only";
import { supabase } from "./supabase";

const DAILY_LIMIT = 150;

export type Operation = "summarize" | "embed" | "cluster-name" | "synthesize" | "editorial-note";

/**
 * Atomically checks the daily limit and logs the operation in one round-trip.
 * Returns true if the operation is allowed, false if the user is over limit.
 * Replaces the old checkDailyLimit() + logUsage() two-step pattern.
 */
export async function checkAndLog(
  userId: string,
  operation: Operation
): Promise<boolean> {
  const { data, error } = await supabase.rpc("check_and_log_usage", {
    p_user_id: userId,
    p_operation: operation,
    p_limit: DAILY_LIMIT,
  });
  if (error) {
    // If the RPC fails (e.g. migration not yet applied), fall back to allowing
    // the operation and log the failure — never block users on a monitoring error.
    console.error("[usage-log] check_and_log_usage RPC failed:", error.message);
    return true;
  }
  return data === true;
}

/**
 * Legacy: log without checking. Use checkAndLog() for new call sites.
 * Kept for the clustering lib which logs after-the-fact.
 */
export async function logUsage(
  userId: string,
  operation: Operation
): Promise<void> {
  await supabase.from("usage_log").insert({ user_id: userId, operation });
}

/** Read-only check — does not log. Use only for UI display. */
export async function getDailyCount(userId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("usage_log")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", since);
  return count ?? 0;
}
