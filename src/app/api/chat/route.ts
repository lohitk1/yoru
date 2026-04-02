import { auth } from "@/lib/auth";
import { runChatLoop } from "@/lib/claude";
import { buildSystemPrompt } from "@/lib/system-prompt";
import { createConversation, saveMessage } from "@/lib/supabase";
import type { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.googleId || !session?.supabaseUserId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { message, conversationHistory, timezone, conversationId: existingConversationId } = await req.json();
  if (!message) {
    return Response.json({ error: "Missing message" }, { status: 400 });
  }

  const userTimezone = timezone || "America/Los_Angeles";
  const now = new Date();
  const currentDateTime = now.toLocaleString("en-US", {
    timeZone: userTimezone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZoneName: "short",
  });
  const systemPrompt = buildSystemPrompt(
    userTimezone,
    currentDateTime,
    session.user?.name ?? "there",
    session.user?.email ?? ""
  );

  const isBriefing = message === "__briefing__";
  const actualMessage = isBriefing
    ? "Give me my daily briefing."
    : message;

  try {
    // Create a new conversation on the first message
    let conversationId = existingConversationId;
    if (!conversationId) {
      const title = isBriefing ? "Daily briefing" : (actualMessage.length > 50 ? actualMessage.slice(0, 50).trimEnd() + "…" : actualMessage);
      const conversation = await createConversation(session.supabaseUserId, title);
      conversationId = conversation.id;
    }

    // Don't save the briefing trigger as a user message
    if (!isBriefing) {
      await saveMessage(conversationId, "user", actualMessage);
    }

    const { response, updatedHistory } = await runChatLoop(
      { googleId: session.googleId, supabaseUserId: session.supabaseUserId, email: session.user?.email ?? "" },
      conversationHistory ?? [],
      actualMessage,
      systemPrompt
    );

    // Save assistant response
    await saveMessage(conversationId, "assistant", response);

    return Response.json({ response, conversationHistory: updatedHistory, conversationId });
  } catch (err: any) {
    console.error("Chat error:", err);
    return Response.json({ error: "Failed to process message" }, { status: 500 });
  }
}
