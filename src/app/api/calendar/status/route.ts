import { auth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import type { NextRequest } from "next/server";

// PATCH /api/calendar/status
// Body: { event_id: string, status: "completed" | null }
// null clears the status (marks as not done)
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.supabaseUserId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { event_id, status } = await req.json();
  if (!event_id) {
    return Response.json({ error: "Missing event_id" }, { status: 400 });
  }

  if (status === null) {
    // Clear status — update existing row if present
    await supabase
      .from("event_metadata")
      .update({ status: null, completed_at: null, updated_at: new Date().toISOString() })
      .match({ user_id: session.supabaseUserId, google_event_id: event_id });
    return Response.json({ success: true });
  }

  const { error } = await supabase
    .from("event_metadata")
    .upsert(
      {
        user_id: session.supabaseUserId,
        google_event_id: event_id,
        status,
        completed_at: status === "completed" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,google_event_id" }
    );

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}
