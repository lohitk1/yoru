import { auth } from "@/lib/auth";
import { listConversations } from "@/lib/supabase";
import { redirect } from "next/navigation";
import ChatInterface from "@/components/ChatInterface";

export default async function ChatPage() {
  const session = await auth();
  if (!session?.supabaseUserId) redirect("/");

  const conversations = await listConversations(session.supabaseUserId);

  return (
    <ChatInterface
      userName={session.user?.name ?? "there"}
      initialConversations={conversations}
    />
  );
}
