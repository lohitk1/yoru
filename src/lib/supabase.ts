import { createClient } from "@supabase/supabase-js";

// Server-side client with service role key — never expose to the browser
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

export async function getPreferences(userId: string) {
  const { data, error } = await supabase
    .from("user_preferences")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error && error.code !== "PGRST116") throw error; // PGRST116 = no rows
  return data ?? null;
}

export async function upsertMetadata(
  userId: string,
  input: {
    event_id: string;
    recurring_event_id?: string;
    priority?: "low" | "medium" | "high" | "critical";
    is_movable?: boolean;
    category?: string;
    linked_task?: string;
    notes?: string;
  }
) {
  const { data, error } = await supabase
    .from("event_metadata")
    .upsert(
      {
        user_id: userId,
        google_event_id: input.event_id,
        google_recurring_event_id: input.recurring_event_id ?? null,
        ...(input.priority !== undefined && { priority: input.priority }),
        ...(input.is_movable !== undefined && { is_movable: input.is_movable }),
        ...(input.category !== undefined && { category: input.category }),
        ...(input.linked_task !== undefined && { linked_task: input.linked_task }),
        ...(input.notes !== undefined && { notes: input.notes }),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,google_event_id" }
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function markStatus(
  userId: string,
  input: {
    event_id: string;
    status: "completed" | "skipped" | "cancelled";
  }
) {
  const { data, error } = await supabase
    .from("event_metadata")
    .upsert(
      {
        user_id: userId,
        google_event_id: input.event_id,
        status: input.status,
        completed_at: input.status === "completed" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,google_event_id" }
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}

export interface ConversationSummary {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export async function createConversation(userId: string, title: string): Promise<ConversationSummary> {
  const { data, error } = await supabase
    .from("conversations")
    .insert({ user_id: userId, title })
    .select("id, title, created_at, updated_at")
    .single();
  if (error) throw error;
  return data;
}

export async function listConversations(userId: string): Promise<ConversationSummary[]> {
  const { data, error } = await supabase
    .from("conversations")
    .select("id, title, created_at, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getConversationMessages(conversationId: string, userId: string): Promise<ChatMessage[]> {
  // Verify ownership via join
  const { data: conv, error: convErr } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("user_id", userId)
    .single();
  if (convErr || !conv) return [];

  const { data, error } = await supabase
    .from("chat_messages")
    .select("id, conversation_id, role, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function saveMessage(conversationId: string, role: "user" | "assistant", content: string): Promise<void> {
  const { error } = await supabase
    .from("chat_messages")
    .insert({ conversation_id: conversationId, role, content });
  if (error) throw error;

  await supabase
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);
}

export async function getStats(
  userId: string,
  input: {
    days_back?: number;
    category?: string;
    recurring_event_id?: string;
  }
) {
  const daysBack = input.days_back ?? 30;
  const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();

  let query = supabase
    .from("event_metadata")
    .select("status, category, google_recurring_event_id")
    .eq("user_id", userId)
    .gte("updated_at", since);

  if (input.category) query = query.eq("category", input.category);
  if (input.recurring_event_id) query = query.eq("google_recurring_event_id", input.recurring_event_id);

  const { data, error } = await query;
  if (error) throw error;

  const counts: Record<string, number> = { completed: 0, skipped: 0, cancelled: 0, upcoming: 0 };
  for (const row of data ?? []) {
    counts[row.status] = (counts[row.status] ?? 0) + 1;
  }

  return { days_back: daysBack, counts, rows: data };
}
