import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import ChatInterface from "@/components/ChatInterface";

export default async function ChatPage() {
  const session = await auth();
  if (!session) redirect("/");

  return <ChatInterface userName={session.user?.name ?? "there"} />;
}
