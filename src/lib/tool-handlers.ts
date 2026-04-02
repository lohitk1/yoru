import { getEvents, createEvent, updateEvent, deleteEvent, findFreeSlots, rsvpEvent } from "./google-calendar";
import { getTaskLists, getTasks, createTask, updateTask, deleteTask } from "./google-tasks";
import { getPreferences, upsertMetadata, markStatus, getStats } from "./supabase";

interface UserContext {
  googleId: string;
  supabaseUserId: string;
  email: string;
}

export async function handleToolCall(
  toolName: string,
  input: Record<string, any>,
  user: UserContext
): Promise<any> {
  switch (toolName) {
    case "get_events":
      return getEvents(user.googleId, input as any, user.supabaseUserId);

    case "find_free_slots":
      return findFreeSlots(user.googleId, input as any);

    case "create_event":
      return createEvent(user.googleId, user.email, input as any);

    case "update_event":
      return updateEvent(user.googleId, input as any);

    case "delete_event":
      return deleteEvent(user.googleId, input as { event_id: string });

    case "rsvp_event":
      return rsvpEvent(user.googleId, user.email, {
        event_id: input.event_id,
        status: input.status,
        send_notifications: input.send_notifications,
      });

    case "get_tasks":
      return getTasks(user.googleId, {
        tasklist_id: input.tasklist_id,
        include_completed: input.include_completed,
      });

    case "create_task":
      return createTask(user.googleId, {
        title: input.title,
        notes: input.notes,
        due: input.due,
        tasklist_id: input.tasklist_id,
      });

    case "update_task":
      return updateTask(user.googleId, {
        task_id: input.task_id,
        tasklist_id: input.tasklist_id,
        title: input.title,
        notes: input.notes,
        due: input.due,
        status: input.status,
      });

    case "delete_task":
      return deleteTask(user.googleId, {
        task_id: input.task_id,
        tasklist_id: input.tasklist_id,
      });

    case "update_event_metadata":
      return upsertMetadata(user.supabaseUserId, {
        event_id: input.event_id,
        recurring_event_id: input.recurring_event_id,
        priority: input.priority,
        is_movable: input.is_movable,
        category: input.category,
        linked_task: input.linked_task,
        notes: input.notes,
      });

    case "mark_event_status":
      return markStatus(user.supabaseUserId, {
        event_id: input.event_id,
        status: input.status,
      });

    case "get_user_preferences":
      return getPreferences(user.supabaseUserId);

    case "get_event_stats":
      return getStats(user.supabaseUserId, {
        days_back: input.days_back,
        category: input.category,
        recurring_event_id: input.recurring_event_id,
      });

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}
