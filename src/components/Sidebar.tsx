"use client";

import type { ConversationSummary } from "@/lib/supabase";

interface SidebarProps {
  conversations: ConversationSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onClose?: () => void;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return date.toLocaleDateString("en-US", { weekday: "long" });
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function Sidebar({ conversations, activeId, onSelect, onNewChat, onClose }: SidebarProps) {
  return (
    <div className="flex flex-col h-full bg-zinc-950 border-r border-zinc-800 w-64 shrink-0">
      <div className="flex items-center justify-between px-4 py-4 border-b border-zinc-800">
        <span className="text-white font-semibold text-sm">Chats</span>
        <div className="flex items-center gap-2">
          <button
            onClick={onNewChat}
            className="text-zinc-400 hover:text-white transition-colors p-1 rounded-md hover:bg-zinc-800"
            title="New chat"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="text-zinc-400 hover:text-white transition-colors p-1 rounded-md hover:bg-zinc-800 md:hidden"
              title="Close"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {conversations.length === 0 ? (
          <p className="text-zinc-600 text-xs text-center mt-8 px-4">No conversations yet</p>
        ) : (
          conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => { onSelect(conv.id); onClose?.(); }}
              className={`w-full text-left px-4 py-3 transition-colors hover:bg-zinc-900 ${
                activeId === conv.id ? "bg-zinc-900" : ""
              }`}
            >
              <p className={`text-sm truncate leading-snug ${activeId === conv.id ? "text-white" : "text-zinc-300"}`}>
                {conv.title}
              </p>
              <p className="text-xs text-zinc-600 mt-0.5">{formatDate(conv.updated_at)}</p>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
