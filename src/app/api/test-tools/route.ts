import { auth } from "@/lib/auth";
import { getEvents, createEvent, updateEvent, deleteEvent, findFreeSlots } from "@/lib/google-calendar";
import { getPreferences, upsertMetadata, markStatus, getStats } from "@/lib/supabase";
import type { NextRequest } from "next/server";

// DEV ONLY — remove before shipping

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.googleId || !session?.supabaseUserId) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const googleId = session.googleId;
  const supabaseUserId = session.supabaseUserId;
  const body = await request.json();
  const { tool, input } = body;

  try {
    let result;
    switch (tool) {
      case "getEvents":
        result = await getEvents(googleId, input);
        break;
      case "createEvent":
        result = await createEvent(googleId, input);
        break;
      case "updateEvent":
        result = await updateEvent(googleId, input);
        break;
      case "deleteEvent":
        result = await deleteEvent(googleId, input);
        break;
      case "findFreeSlots":
        result = await findFreeSlots(googleId, input);
        break;
      case "getPreferences":
        result = await getPreferences(supabaseUserId);
        break;
      case "upsertMetadata":
        result = await upsertMetadata(supabaseUserId, input);
        break;
      case "markStatus":
        result = await markStatus(supabaseUserId, input);
        break;
      case "getStats":
        result = await getStats(supabaseUserId, input);
        break;
      default:
        return Response.json({ error: `Unknown tool: ${tool}` }, { status: 400 });
    }
    return Response.json({ result });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
