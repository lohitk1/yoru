import { auth } from "@/lib/auth";
import { runChatLoop } from "@/lib/claude";
import { buildSystemPrompt } from "@/lib/system-prompt";
import type { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.googleId || !session?.supabaseUserId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { message, conversationHistory } = await req.json();
  if (!message) {
    return Response.json({ error: "Missing message" }, { status: 400 });
  }

  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Los_Angeles";
  const currentDateTime = new Date().toLocaleString("en-US", { timeZone: userTimezone });
  const systemPrompt = buildSystemPrompt(
    userTimezone,
    currentDateTime,
    session.user?.name ?? "there",
    session.user?.email ?? ""
  );

  try {
    const { response, updatedHistory } = await runChatLoop(
      { googleId: session.googleId, supabaseUserId: session.supabaseUserId },
      conversationHistory ?? [],
      message,
      systemPrompt
    );

    return Response.json({ response, conversationHistory: updatedHistory });
  } catch (err: any) {
    console.error("Chat error:", err);
    return Response.json({ error: "Failed to process message" }, { status: 500 });
  }
}
