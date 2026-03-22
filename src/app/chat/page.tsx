import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function ChatPage() {
  const session = await auth();
  if (!session) redirect("/");

  return (
    <div className="flex min-h-screen items-center justify-center bg-black">
      <p className="text-zinc-400">Chat coming soon — signed in as {session.user?.email}</p>
    </div>
  );
}
