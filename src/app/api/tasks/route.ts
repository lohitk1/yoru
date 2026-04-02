import { auth } from "@/lib/auth";
import { getTaskLists, getTasks, updateTask } from "@/lib/google-tasks";
import type { NextRequest } from "next/server";

// GET /api/tasks?tasklist_id=...&include_completed=true
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.googleId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tasklistId = req.nextUrl.searchParams.get("tasklist_id") ?? undefined;
  const includeCompleted = req.nextUrl.searchParams.get("include_completed") === "true";

  try {
    const [lists, items] = await Promise.all([
      getTaskLists(session.googleId),
      getTasks(session.googleId, { tasklist_id: tasklistId, include_completed: includeCompleted }),
    ]);
    return Response.json({ lists, items });
  } catch (err: any) {
    console.error("Tasks fetch error:", err);
    return Response.json({ error: "Failed to fetch tasks" }, { status: 500 });
  }
}

// PATCH /api/tasks — complete or uncomplete a task
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.googleId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { task_id, tasklist_id, status } = body;
  if (!task_id || !status) {
    return Response.json({ error: "Missing task_id or status" }, { status: 400 });
  }

  try {
    const result = await updateTask(session.googleId, { task_id, tasklist_id, status });
    return Response.json({ task: result });
  } catch (err: any) {
    console.error("Task update error:", err);
    return Response.json({ error: "Failed to update task" }, { status: 500 });
  }
}
