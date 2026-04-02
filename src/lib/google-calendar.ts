import { google } from "googleapis";
import { supabase } from "./supabase";

async function getCalendarClient(userId: string) {
  const { data: user, error } = await supabase
    .from("users")
    .select("google_access_token, google_refresh_token, updated_at")
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

  // Refresh if access token is missing or about to expire (within 5 min)
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

  return google.calendar({ version: "v3", auth: oauth2Client });
}

async function enrichEventsWithMetadata(supabaseUserId: string, events: any[]) {
  if (!events.length) return events;

  const eventIds = events.map((e) => e.id);
  const { data: metadataRows } = await supabase
    .from("event_metadata")
    .select("*")
    .eq("user_id", supabaseUserId)
    .in("google_event_id", eventIds);

  const metaMap = new Map(metadataRows?.map((m: any) => [m.google_event_id, m]) ?? []);

  return events.map((event) => ({
    ...event,
    metadata: metaMap.get(event.id) ?? null,
  }));
}

export async function getEvents(
  userId: string,
  input: { start_datetime: string; end_datetime: string; query?: string },
  supabaseUserId?: string
) {
  const calendar = await getCalendarClient(userId);
  const response = await calendar.events.list({
    calendarId: "primary",
    timeMin: input.start_datetime,
    timeMax: input.end_datetime,
    singleEvents: true,
    orderBy: "startTime",
    q: input.query,
  });

  const events = response.data.items || [];
  return enrichEventsWithMetadata(supabaseUserId ?? userId, events);
}

type RecurrenceInput = {
  frequency: "daily" | "weekly" | "monthly" | "yearly";
  interval?: number;
  days_of_week?: string[];
  end_date?: string;
  count?: number;
};

type ReminderInput = {
  method: "popup" | "email";
  minutes: number;
};

function buildRRule(r: RecurrenceInput): string {
  const parts: string[] = [`FREQ=${r.frequency.toUpperCase()}`];
  if (r.interval && r.interval > 1) parts.push(`INTERVAL=${r.interval}`);
  if (r.days_of_week?.length) parts.push(`BYDAY=${r.days_of_week.join(",")}`);
  if (r.end_date) parts.push(`UNTIL=${r.end_date.replace(/-/g, "")}T000000Z`);
  else if (r.count) parts.push(`COUNT=${r.count}`);
  return `RRULE:${parts.join(";")}`;
}

export async function createEvent(
  userId: string,
  userEmail: string,
  input: {
    title: string;
    start_datetime: string;
    end_datetime: string;
    description?: string;
    location?: string;
    attendees?: string[];
    add_meet_link?: boolean;
    recurrence?: RecurrenceInput;
    reminders?: ReminderInput[];
  }
) {
  const calendar = await getCalendarClient(userId);
  const response = await calendar.events.insert({
    calendarId: "primary",
    conferenceDataVersion: input.add_meet_link ? 1 : 0,
    requestBody: {
      summary: input.title,
      start: { dateTime: input.start_datetime },
      end: { dateTime: input.end_datetime },
      description: input.description,
      location: input.location,
      attendees: input.attendees?.map((email) => ({
        email,
        responseStatus: email === userEmail ? "accepted" : undefined,
      })),
      recurrence: input.recurrence ? [buildRRule(input.recurrence)] : undefined,
      reminders: input.reminders
        ? { useDefault: false, overrides: input.reminders }
        : undefined,
      ...(input.add_meet_link && {
        conferenceData: {
          createRequest: {
            requestId: `yoru-${Date.now()}`,
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        },
      }),
    },
  });
  return response.data;
}

export async function rsvpEvent(
  userId: string,
  userEmail: string,
  input: {
    event_id: string;
    status: "accepted" | "declined" | "tentative";
    send_notifications?: boolean;
  }
) {
  const calendar = await getCalendarClient(userId);
  const existing = await calendar.events.get({
    calendarId: "primary",
    eventId: input.event_id,
  });

  const attendees = existing.data.attendees ?? [];
  const userAttendee = attendees.find((a) => a.email === userEmail);
  if (userAttendee) {
    userAttendee.responseStatus = input.status;
  } else {
    attendees.push({ email: userEmail, responseStatus: input.status });
  }

  const response = await calendar.events.patch({
    calendarId: "primary",
    eventId: input.event_id,
    sendUpdates: input.send_notifications ? "all" : "none",
    requestBody: { attendees },
  });
  return response.data;
}

export async function updateEvent(
  userId: string,
  input: {
    event_id: string;
    title?: string;
    start_datetime?: string;
    end_datetime?: string;
    description?: string;
    location?: string;
    attendees?: string[];
    recurrence?: RecurrenceInput | null;
    reminders?: ReminderInput[] | null;
  }
) {
  const calendar = await getCalendarClient(userId);
  const existing = await calendar.events.get({
    calendarId: "primary",
    eventId: input.event_id,
  });

  const updated: any = { ...existing.data };
  if (input.title) updated.summary = input.title;
  if (input.start_datetime) updated.start = { dateTime: input.start_datetime };
  if (input.end_datetime) updated.end = { dateTime: input.end_datetime };
  if (input.description !== undefined) updated.description = input.description;
  if (input.location !== undefined) updated.location = input.location;
  if (input.attendees) updated.attendees = input.attendees.map((email) => ({ email }));
  if (input.recurrence !== undefined)
    updated.recurrence = input.recurrence ? [buildRRule(input.recurrence)] : [];
  if (input.reminders !== undefined)
    updated.reminders = input.reminders
      ? { useDefault: false, overrides: input.reminders }
      : { useDefault: true };

  const response = await calendar.events.update({
    calendarId: "primary",
    eventId: input.event_id,
    requestBody: updated,
  });
  return response.data;
}

export async function findFreeSlots(
  userId: string,
  input: {
    date: string;
    duration_minutes: number;
    earliest_time?: string;
    latest_time?: string;
    attendee_emails?: string[];
  }
) {
  const calendar = await getCalendarClient(userId);

  const startOfDay = `${input.date}T${input.earliest_time ?? "09:00"}:00Z`;
  const endOfDay = `${input.date}T${input.latest_time ?? "17:00"}:00Z`;

  const items: { id: string }[] = [{ id: "primary" }];
  if (input.attendee_emails?.length) {
    for (const email of input.attendee_emails) {
      items.push({ id: email });
    }
  }

  const response = await calendar.freebusy.query({
    requestBody: {
      timeMin: startOfDay,
      timeMax: endOfDay,
      items,
    },
  });

  return computeFreeSlots(response.data, startOfDay, endOfDay, input.duration_minutes);
}

function computeFreeSlots(
  freebusyData: any,
  startOfDay: string,
  endOfDay: string,
  durationMinutes: number
) {
  const busyIntervals: { start: number; end: number }[] = [];
  const calendars = freebusyData.calendars ?? {};
  for (const cal of Object.values(calendars) as any[]) {
    for (const busy of cal.busy ?? []) {
      busyIntervals.push({
        start: new Date(busy.start).getTime(),
        end: new Date(busy.end).getTime(),
      });
    }
  }

  busyIntervals.sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  for (const interval of busyIntervals) {
    if (merged.length && interval.start <= merged[merged.length - 1].end) {
      merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, interval.end);
    } else {
      merged.push({ ...interval });
    }
  }

  const dayStart = new Date(startOfDay).getTime();
  const dayEnd = new Date(endOfDay).getTime();
  const durationMs = durationMinutes * 60 * 1000;
  const freeSlots: { start: string; end: string }[] = [];

  let cursor = dayStart;
  for (const busy of merged) {
    if (busy.start > cursor && busy.start - cursor >= durationMs) {
      freeSlots.push({
        start: new Date(cursor).toISOString(),
        end: new Date(busy.start).toISOString(),
      });
    }
    cursor = Math.max(cursor, busy.end);
  }

  if (dayEnd - cursor >= durationMs) {
    freeSlots.push({
      start: new Date(cursor).toISOString(),
      end: new Date(dayEnd).toISOString(),
    });
  }

  return freeSlots;
}

export async function deleteEvent(userId: string, input: { event_id: string }) {
  const calendar = await getCalendarClient(userId);

  // Recurring instances have an ID like "baseId_20260402T090000Z".
  // Calling delete on an instance ID deletes the entire series.
  // The correct way to cancel just one occurrence is to patch its status to "cancelled".
  const isRecurringInstance = input.event_id.includes("_");

  if (isRecurringInstance) {
    await calendar.events.patch({
      calendarId: "primary",
      eventId: input.event_id,
      requestBody: { status: "cancelled" },
    });
  } else {
    await calendar.events.delete({ calendarId: "primary", eventId: input.event_id });
  }

  await supabase
    .from("event_metadata")
    .delete()
    .match({ user_id: userId, google_event_id: input.event_id });
  return { success: true, deleted_event_id: input.event_id };
}

