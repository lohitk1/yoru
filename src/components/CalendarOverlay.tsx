"use client";

import { useEffect, useRef, useState } from "react";

const HOUR_HEIGHT = 64; // px per hour

interface RawEvent {
  id: string;
  summary?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  metadata?: { status?: string | null } | null;
}

interface TimedEvent extends RawEvent {
  startMin: number;
  endMin: number;
  col: number;
  cols: number;
}

function getMinutesInTz(iso: string, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const h = parseInt(parts.find((p) => p.type === "hour")!.value) % 24;
  const m = parseInt(parts.find((p) => p.type === "minute")!.value);
  return h * 60 + m;
}

function formatTime(iso: string, tz: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

// Greedy column assignment for overlapping events
function assignLayout(events: (RawEvent & { startMin: number; endMin: number })[]): TimedEvent[] {
  const sorted = [...events].sort((a, b) => a.startMin - b.startMin);
  const colEnds: number[] = []; // end time of last event per column slot

  const result: TimedEvent[] = sorted.map((ev) => {
    let col = colEnds.findIndex((end) => end <= ev.startMin);
    if (col === -1) {
      col = colEnds.length;
      colEnds.push(ev.endMin);
    } else {
      colEnds[col] = ev.endMin;
    }
    return { ...ev, col, cols: 0 };
  });

  // Compute max concurrent column for each event (determines width fraction)
  for (const ev of result) {
    let maxCol = ev.col;
    for (const other of result) {
      if (other !== ev && other.startMin < ev.endMin && other.endMin > ev.startMin) {
        maxCol = Math.max(maxCol, other.col);
      }
    }
    ev.cols = maxCol + 1;
  }

  return result;
}

interface Props {
  onClose: () => void;
}

export default function CalendarOverlay({ onClose }: Props) {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [events, setEvents] = useState<RawEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateLabel, setDateLabel] = useState("");
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [toggling, setToggling] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  async function fetchEvents() {
    setLoading(true);
    try {
      const res = await fetch(`/api/calendar/today?timezone=${encodeURIComponent(timezone)}`);
      const data = await res.json();
      const fetched: RawEvent[] = data.events ?? [];
      setEvents(fetched);
      setCompletedIds(
        new Set(fetched.filter((e) => e.metadata?.status === "completed").map((e) => e.id))
      );
      if (data.date) {
        setDateLabel(
          new Date(data.date + "T12:00:00").toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
          })
        );
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchEvents();
  }, []);

  async function toggleEventDone(eventId: string) {
    const isDone = completedIds.has(eventId);
    const newStatus = isDone ? null : "completed";
    setToggling((s) => new Set(s).add(eventId));
    // Optimistic
    setCompletedIds((prev) => {
      const next = new Set(prev);
      isDone ? next.delete(eventId) : next.add(eventId);
      return next;
    });
    try {
      await fetch("/api/calendar/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: eventId, status: newStatus }),
      });
    } catch {
      // Revert on failure
      setCompletedIds((prev) => {
        const next = new Set(prev);
        isDone ? next.add(eventId) : next.delete(eventId);
        return next;
      });
    } finally {
      setToggling((s) => { const n = new Set(s); n.delete(eventId); return n; });
    }
  }

  // Scroll to 1 hour before current time (min 7 AM) after events load
  useEffect(() => {
    if (!loading && scrollRef.current) {
      const now = new Date();
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).formatToParts(now);
      const h = parseInt(parts.find((p) => p.type === "hour")!.value) % 24;
      const m = parseInt(parts.find((p) => p.type === "minute")!.value);
      const currentMin = h * 60 + m;
      const scrollToMin = Math.max(currentMin - 60, 7 * 60);
      scrollRef.current.scrollTop = (scrollToMin / 60) * HOUR_HEIGHT;
    }
  }, [loading]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const allDayEvents = events.filter((e) => e.start.date && !e.start.dateTime);
  const timedEvents = assignLayout(
    events
      .filter((e) => e.start.dateTime)
      .map((e) => {
        const startMin = getMinutesInTz(e.start.dateTime!, timezone);
        const rawEnd = e.end.dateTime ? getMinutesInTz(e.end.dateTime, timezone) : startMin + 30;
        // If end is at or before start (e.g. crosses midnight), cap at end of day
        const endMin = rawEnd <= startMin ? 24 * 60 : Math.min(rawEnd, 24 * 60);
        return { ...e, startMin, endMin };
      })
  );

  // Current time
  const nowParts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const nowH = parseInt(nowParts.find((p) => p.type === "hour")!.value) % 24;
  const nowM = parseInt(nowParts.find((p) => p.type === "minute")!.value);
  const nowMin = nowH * 60 + nowM;

  const hours = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-zinc-900 rounded-2xl w-full max-w-xl flex flex-col overflow-hidden" style={{ height: "90vh" }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
          <div>
            <h2 className="text-white font-semibold text-sm">Today</h2>
            <p className="text-zinc-500 text-xs mt-0.5">{dateLabel}</p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={fetchEvents}
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

        {/* All-day events */}
        {allDayEvents.length > 0 && (
          <div className="px-5 py-2 border-b border-zinc-800 shrink-0 flex flex-wrap gap-1.5">
            {allDayEvents.map((ev) => (
              <span key={ev.id} className="bg-indigo-950 text-indigo-300 text-xs px-2.5 py-1 rounded-full border border-indigo-800">
                {ev.summary || "Untitled"}
              </span>
            ))}
          </div>
        )}

        {/* Time grid */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center items-center h-full">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          ) : (
            <div className="relative flex" style={{ height: 24 * HOUR_HEIGHT }}>

              {/* Hour labels */}
              <div className="shrink-0 w-14 select-none">
                {hours.map((h) => (
                  <div key={h} style={{ height: HOUR_HEIGHT }} className="flex items-start justify-end pr-3 pt-1.5">
                    {h !== 0 && (
                      <span className="text-zinc-600 text-xs tabular-nums">
                        {h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`}
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {/* Grid + events */}
              <div className="flex-1 relative border-l border-zinc-800 pr-3">
                {/* Hour lines */}
                {hours.map((h) => (
                  <div key={h} className="absolute w-full border-t border-zinc-800" style={{ top: h * HOUR_HEIGHT }} />
                ))}
                {/* Half-hour lines */}
                {hours.map((h) => (
                  <div key={`${h}h`} className="absolute w-full border-t border-zinc-800/30" style={{ top: h * HOUR_HEIGHT + HOUR_HEIGHT / 2 }} />
                ))}

                {/* Current time indicator */}
                <div
                  className="absolute left-0 right-0 z-10 flex items-center pointer-events-none"
                  style={{ top: (nowMin / 60) * HOUR_HEIGHT }}
                >
                  <div className="w-2 h-2 rounded-full bg-red-500 -ml-1 shrink-0" />
                  <div className="flex-1 border-t border-red-500" />
                </div>

                {/* Events */}
                {timedEvents.map((ev) => {
                  const top = (ev.startMin / 60) * HOUR_HEIGHT;
                  const height = Math.max(((ev.endMin - ev.startMin) / 60) * HOUR_HEIGHT, 24);
                  const widthPct = 100 / ev.cols;
                  const leftPct = (ev.col / ev.cols) * 100;
                  const isShort = height < 38;
                  const done = completedIds.has(ev.id);
                  const isToggling = toggling.has(ev.id);

                  return (
                    <div
                      key={ev.id}
                      className={`absolute rounded-md border-l-2 px-2 py-1 overflow-hidden flex gap-1.5 items-start transition-colors ${
                        done
                          ? "bg-zinc-800/60 border-zinc-600"
                          : "bg-indigo-950 border-indigo-500"
                      }`}
                      style={{
                        top,
                        height,
                        left: `calc(${leftPct}% + 2px)`,
                        width: `calc(${widthPct}% - 4px)`,
                      }}
                    >
                      <button
                        onClick={() => toggleEventDone(ev.id)}
                        disabled={isToggling}
                        className={`shrink-0 mt-0.5 w-3.5 h-3.5 rounded-full border transition-colors ${
                          done
                            ? "bg-zinc-500 border-zinc-500"
                            : "border-indigo-500 hover:border-indigo-300"
                        } ${isToggling ? "opacity-50" : ""}`}
                      >
                        {done && (
                          <svg className="w-full h-full p-[1px] text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-medium leading-tight truncate ${done ? "text-zinc-500 line-through" : "text-indigo-200"}`}>
                          {ev.summary || "Untitled"}
                        </p>
                        {!isShort && ev.start.dateTime && ev.end.dateTime && (
                          <p className={`text-xs mt-0.5 truncate ${done ? "text-zinc-600" : "text-indigo-400"}`}>
                            {formatTime(ev.start.dateTime, timezone)} – {formatTime(ev.end.dateTime, timezone)}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
