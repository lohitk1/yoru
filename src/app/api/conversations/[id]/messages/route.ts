import { auth } from "@/lib/auth";
import { getConversationMessages } from "@/lib/supabase";
import type { NextRequest } from "next/server";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.supabaseUserId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const messages = await getConversationMessages(id, session.supabaseUserId);
  return Response.json({ messages });
}
