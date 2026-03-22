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

async function enrichEventsWithMetadata(userId: string, events: any[]) {
  if (!events.length) return events;

  const eventIds = events.map((e) => e.id);
  const { data: metadataRows } = await supabase
    .from("event_metadata")
    .select("*")
    .eq("user_id", userId)
    .in("google_event_id", eventIds);

  const metaMap = new Map(metadataRows?.map((m: any) => [m.google_event_id, m]) ?? []);

  return events.map((event) => ({
    ...event,
    metadata: metaMap.get(event.id) ?? null,
  }));
}

export async function getEvents(
  userId: string,
  input: { start_datetime: string; end_datetime: string; query?: string }
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
  return enrichEventsWithMetadata(userId, events);
}

export async function createEvent(
  userId: string,
  input: {
    title: string;
    start_datetime: string;
    end_datetime: string;
    description?: string;
    location?: string;
    attendees?: string[];
    add_meet_link?: boolean;
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
      attendees: input.attendees?.map((email) => ({ email })),
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
  await calendar.events.delete({ calendarId: "primary", eventId: input.event_id });
  await supabase
    .from("event_metadata")
    .delete()
    .match({ user_id: userId, google_event_id: input.event_id });
  return { success: true, deleted_event_id: input.event_id };
}

