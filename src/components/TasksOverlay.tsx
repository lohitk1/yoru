"use client";

import { useEffect, useState } from "react";

interface TaskList {
  id: string;
  title?: string;
}

interface Task {
  id: string;
  title?: string;
  notes?: string;
  due?: string;
  status?: "needsAction" | "completed";
}

interface Props {
  onClose: () => void;
}

export default function TasksOverlay({ onClose }: Props) {
  const [lists, setLists] = useState<TaskList[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeListId, setActiveListId] = useState<string>("@default");
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<Set<string>>(new Set());
  const [showCompleted, setShowCompleted] = useState(false);

  async function fetchTasks(listId: string) {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/tasks?tasklist_id=${encodeURIComponent(listId)}&include_completed=true`
      );
      const data = await res.json();
      setLists(data.lists ?? []);
      setTasks(data.items ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchTasks(activeListId);
  }, [activeListId]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  async function toggleTask(task: Task) {
    const newStatus = task.status === "completed" ? "needsAction" : "completed";
    setToggling((s) => new Set(s).add(task.id!));
    // Optimistic update
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t))
    );
    try {
      await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_id: task.id, tasklist_id: activeListId, status: newStatus }),
      });
    } catch {
      // Revert on failure
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, status: task.status } : t))
      );
    } finally {
      setToggling((s) => { const n = new Set(s); n.delete(task.id!); return n; });
    }
  }

  const pending = tasks.filter((t) => t.status !== "completed");
  const completed = tasks.filter((t) => t.status === "completed");

  const activeListTitle = lists.find((l) => l.id === activeListId)?.title ?? "My Tasks";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-zinc-900 rounded-2xl w-full max-w-xl flex flex-col overflow-hidden" style={{ height: "90vh" }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
          <div>
            <h2 className="text-white font-semibold text-sm">Tasks</h2>
            <p className="text-zinc-500 text-xs mt-0.5">{activeListTitle}</p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => fetchTasks(activeListId)}
              disabled={loading}
              className="text-zinc-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-zinc-800 disabled:opacity-30"
              title="Refresh"
            >
              <svg className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <button
              onClick={onClose}
              className="text-zinc-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-zinc-800"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Task list tabs */}
        {lists.length > 1 && (
          <div className="flex gap-1 px-5 py-2 border-b border-zinc-800 shrink-0 overflow-x-auto">
            {lists.map((list) => (
              <button
                key={list.id}
                onClick={() => setActiveListId(list.id)}
                className={`shrink-0 text-xs px-3 py-1.5 rounded-full transition-colors ${
                  activeListId === list.id
                    ? "bg-indigo-600 text-white"
                    : "text-zinc-400 hover:text-white hover:bg-zinc-800"
                }`}
              >
                {list.title ?? "Untitled"}
              </button>
            ))}
          </div>
        )}

        {/* Task list */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {loading ? (
            <div className="flex justify-center items-center h-full">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          ) : (
            <>
              {pending.length === 0 && !showCompleted && (
                <p className="text-zinc-500 text-sm text-center mt-8">No pending tasks.</p>
              )}

              {/* Pending tasks */}
              <ul className="space-y-1">
                {pending.map((task) => (
                  <TaskRow key={task.id} task={task} toggling={toggling.has(task.id!)} onToggle={toggleTask} />
                ))}
              </ul>

              {/* Completed section */}
              {completed.length > 0 && (
                <div className="mt-4">
                  <button
                    onClick={() => setShowCompleted((s) => !s)}
                    className="text-zinc-500 hover:text-zinc-300 text-xs flex items-center gap-1 mb-2 transition-colors"
                  >
                    <svg
                      className={`w-3 h-3 transition-transform ${showCompleted ? "rotate-90" : ""}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    {completed.length} completed
                  </button>
                  {showCompleted && (
                    <ul className="space-y-1">
                      {completed.map((task) => (
                        <TaskRow key={task.id} task={task} toggling={toggling.has(task.id!)} onToggle={toggleTask} />
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function TaskRow({
  task,
  toggling,
  onToggle,
}: {
  task: Task;
  toggling: boolean;
  onToggle: (task: Task) => void;
}) {
  const done = task.status === "completed";
  const dueDate = task.due
    ? new Date(task.due).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;
  const isOverdue = task.due && !done && new Date(task.due) < new Date();

  return (
    <li className="flex items-start gap-3 py-2 group">
      <button
        onClick={() => onToggle(task)}
        disabled={toggling}
        className={`mt-0.5 shrink-0 w-4 h-4 rounded-full border transition-colors ${
          done
            ? "bg-indigo-600 border-indigo-600"
            : "border-zinc-600 hover:border-indigo-500 group-hover:border-indigo-500"
        } ${toggling ? "opacity-50" : ""}`}
      >
        {done && (
          <svg className="w-full h-full p-0.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-snug ${done ? "text-zinc-500 line-through" : "text-zinc-200"}`}>
          {task.title || "Untitled"}
        </p>
        {task.notes && (
          <p className="text-xs text-zinc-600 mt-0.5 truncate">{task.notes}</p>
        )}
        {dueDate && (
          <p className={`text-xs mt-0.5 ${isOverdue ? "text-red-400" : "text-zinc-500"}`}>
            Due {dueDate}
          </p>
        )}
      </div>
    </li>
  );
}
