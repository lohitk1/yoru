import { google } from "googleapis";
import { supabase } from "./supabase";

async function getTasksClient(userId: string) {
  const { data: user, error } = await supabase
    .from("users")
    .select("google_access_token, google_refresh_token")
    .eq("google_id", userId)
    .single();

  if (error || !user) throw new Error("User not found");
  if (!user.google_refresh_token) throw new Error("No refresh token stored for user");

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.NEXTAUTH_URL + "/api/auth/callback/google"
  );

  oauth2Client.setCredentials({
    access_token: user.google_access_token,
    refresh_token: user.google_refresh_token,
  });

  const tokenInfo = await oauth2Client.getTokenInfo(user.google_access_token).catch(() => null);
  const expiresIn = tokenInfo?.expiry_date ? tokenInfo.expiry_date - Date.now() : 0;

  if (!user.google_access_token || expiresIn < 5 * 60 * 1000) {
    const { credentials } = await oauth2Client.refreshAccessToken();
    oauth2Client.setCredentials(credentials);
    await supabase
      .from("users")
      .update({
        google_access_token: credentials.access_token ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("google_id", userId);
  }

  return google.tasks({ version: "v1", auth: oauth2Client });
}

export async function getTaskLists(userId: string) {
  const tasks = await getTasksClient(userId);
  const response = await tasks.tasklists.list({ maxResults: 20 });
  return response.data.items ?? [];
}

export async function getTasks(
  userId: string,
  input: { tasklist_id?: string; include_completed?: boolean }
) {
  const tasks = await getTasksClient(userId);
  const tasklistId = input.tasklist_id ?? "@default";
  const response = await tasks.tasks.list({
    tasklist: tasklistId,
    showCompleted: input.include_completed ?? false,
    showHidden: false,
    maxResults: 100,
  });
  return response.data.items ?? [];
}

export async function createTask(
  userId: string,
  input: {
    title: string;
    notes?: string;
    due?: string;
    tasklist_id?: string;
  }
) {
  const tasks = await getTasksClient(userId);
  const tasklistId = input.tasklist_id ?? "@default";
  const response = await tasks.tasks.insert({
    tasklist: tasklistId,
    requestBody: {
      title: input.title,
      notes: input.notes,
      due: input.due ? new Date(input.due).toISOString() : undefined,
    },
  });
  return response.data;
}

export async function updateTask(
  userId: string,
  input: {
    task_id: string;
    tasklist_id?: string;
    title?: string;
    notes?: string;
    due?: string;
    status?: "needsAction" | "completed";
  }
) {
  const tasks = await getTasksClient(userId);
  const tasklistId = input.tasklist_id ?? "@default";
  const existing = await tasks.tasks.get({ tasklist: tasklistId, task: input.task_id });
  const updated: any = { ...existing.data };
  if (input.title !== undefined) updated.title = input.title;
  if (input.notes !== undefined) updated.notes = input.notes;
  if (input.due !== undefined) updated.due = new Date(input.due).toISOString();
  if (input.status !== undefined) {
    updated.status = input.status;
    if (input.status === "completed") updated.completed = new Date().toISOString();
    else updated.completed = null;
  }
  const response = await tasks.tasks.update({
    tasklist: tasklistId,
    task: input.task_id,
    requestBody: updated,
  });
  return response.data;
}

export async function deleteTask(
  userId: string,
  input: { task_id: string; tasklist_id?: string }
) {
  const tasks = await getTasksClient(userId);
  await tasks.tasks.delete({
    tasklist: input.tasklist_id ?? "@default",
    task: input.task_id,
  });
  return { success: true, deleted_task_id: input.task_id };
}
