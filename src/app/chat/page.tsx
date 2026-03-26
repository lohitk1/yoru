import { auth, signOut } from "@/lib/auth";
import { listConversations } from "@/lib/supabase";
import { redirect } from "next/navigation";
import ChatInterface from "@/components/ChatInterface";

export default async function ChatPage() {
  const session = await auth();
  if (!session) redirect("/");

  const conversations = session.supabaseUserId ? await listConversations(session.supabaseUserId) : [];

  const handleSignOut = async () => {
    "use server";
    await signOut({ redirectTo: "/" });
  };

  return (
    <ChatInterface
      userName={session.user?.name ?? "there"}
      initialConversations={conversations}
      onSignOut={handleSignOut}
    />
  );
}
