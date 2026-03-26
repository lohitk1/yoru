"use client";

import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Sidebar from "./Sidebar";
import CalendarOverlay from "./CalendarOverlay";
import type { ConversationSummary } from "@/lib/supabase";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ApiMessage {
  role: "user" | "assistant";
  content: any;
}

interface Props {
  userName: string;
  initialConversations: ConversationSummary[];
  onSignOut: () => Promise<void>;
}

export default function ChatInterface({ userName, initialConversations, onSignOut }: Props) {
  const [conversations, setConversations] = useState<ConversationSummary[]>(initialConversations);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationHistory, setConversationHistory] = useState<ApiMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function loadConversation(id: string) {
    setLoadingConversation(true);
    setActiveConversationId(id);
    setMessages([]);
    setConversationHistory([]);

    try {
      const res = await fetch(`/api/conversations/${id}/messages`);
      const data = await res.json();
      setMessages(data.messages ?? []);
    } finally {
      setLoadingConversation(false);
    }
  }

  function startNewChat() {
    setActiveConversationId(null);
    setMessages([]);
    setConversationHistory([]);
    inputRef.current?.focus();
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          conversationHistory,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          conversationId: activeConversationId,
        }),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setConversationHistory(data.conversationHistory);
      setMessages((prev) => [...prev, { role: "assistant", content: data.response }]);

      // If this was a new conversation, add it to the list and set it as active
      if (!activeConversationId && data.conversationId) {
        setActiveConversationId(data.conversationId);
        const title = text.length > 50 ? text.slice(0, 50).trimEnd() + "…" : text;
        const newConv: ConversationSummary = {
          id: data.conversationId,
          title,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        setConversations((prev) => [newConv, ...prev]);
      } else if (activeConversationId) {
        // Bump updated_at on the active conversation so it sorts to top
        setConversations((prev) => {
          const updated = prev.map((c) =>
            c.id === activeConversationId ? { ...c, updated_at: new Date().toISOString() } : c
          );
          return [
            ...updated.filter((c) => c.id === activeConversationId),
            ...updated.filter((c) => c.id !== activeConversationId),
          ];
        });
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, something went wrong. Please try again." },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <div className="flex h-screen bg-black overflow-hidden">
      {/* Sidebar — collapsible on desktop, overlay on mobile */}
      {sidebarOpen && (
        <>
          {/* Backdrop (mobile only) */}
          <div
            className="fixed inset-0 z-20 bg-black/60 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 z-30 md:static md:z-auto">
            <Sidebar
              conversations={conversations}
              activeId={activeConversationId}
              onSelect={loadConversation}
              onNewChat={startNewChat}
              onClose={() => setSidebarOpen(false)}
            />
          </div>
        </>
      )}

      {/* Main chat area */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-center px-4 py-3 border-b border-zinc-800 gap-3">
          <button
            onClick={() => setSidebarOpen((o) => !o)}
            className="text-zinc-400 hover:text-white transition-colors p-1 rounded-md hover:bg-zinc-800"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <h1 className="text-white font-semibold">Yoru</h1>
          <span className="text-zinc-500 text-sm">· {userName}</span>
          <div className="ml-auto flex items-center gap-3">
            <button
              onClick={() => setCalendarOpen(true)}
              className="text-zinc-400 hover:text-white transition-colors p-1 rounded-md hover:bg-zinc-800"
              title="View today's calendar"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </button>
            <form action={onSignOut}>
              <button type="submit" className="text-zinc-500 hover:text-zinc-300 text-xs transition-colors">
                Sign out
              </button>
            </form>
          </div>
        </div>

        {/* Message list */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {loadingConversation ? (
            <div className="flex justify-center mt-8">
              <div className="flex gap-1 items-center">
                <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center gap-2">
              <p className="text-zinc-400 text-lg">What's on your mind?</p>
              <p className="text-zinc-600 text-sm">Try "What's on my calendar today?"</p>
            </div>
          ) : (
            messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                    msg.role === "user"
                      ? "bg-white text-black rounded-br-sm"
                      : "bg-zinc-900 text-zinc-100 rounded-bl-sm"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        table: ({ children }) => (
                          <div className="overflow-x-auto my-2">
                            <table className="text-xs border-collapse w-full">{children}</table>
                          </div>
                        ),
                        th: ({ children }) => (
                          <th className="border border-zinc-700 px-3 py-1.5 text-left text-zinc-300 font-semibold bg-zinc-800">
                            {children}
                          </th>
                        ),
                        td: ({ children }) => (
                          <td className="border border-zinc-700 px-3 py-1.5 text-zinc-300">{children}</td>
                        ),
                        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                        ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>,
                        strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
                        code: ({ children }) => (
                          <code className="bg-zinc-800 px-1 py-0.5 rounded text-xs">{children}</code>
                        ),
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            ))
          )}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-zinc-900 rounded-2xl rounded-bl-sm px-4 py-3">
                <div className="flex gap-1 items-center h-4">
                  <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input bar */}
        <div className="border-t border-zinc-800 px-4 py-3 pb-[env(safe-area-inset-bottom,12px)]">
          <div className="flex items-end gap-2 bg-zinc-900 rounded-2xl px-4 py-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message Yoru..."
              rows={1}
              className="flex-1 bg-transparent text-white text-sm placeholder-zinc-500 resize-none outline-none max-h-32 py-1"
              style={{ height: "auto" }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = el.scrollHeight + "px";
              }}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || loading}
              className="text-white bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed rounded-full p-1.5 transition-colors mb-0.5"
            >
              <svg className="w-4 h-4 rotate-90" fill="currentColor" viewBox="0 0 24 24">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            </button>
          </div>
          <p className="text-center text-zinc-700 text-xs mt-2">Enter to send · Shift+Enter for new line</p>
        </div>
      </div>
      {calendarOpen && <CalendarOverlay onClose={() => setCalendarOpen(false)} />}
    </div>
  );
}
