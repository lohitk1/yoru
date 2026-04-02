import { auth } from "@/lib/auth";
import { getEvents } from "@/lib/google-calendar";
import type { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.googleId || !session?.supabaseUserId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const timezone = req.nextUrl.searchParams.get("timezone") || "America/Los_Angeles";
  const now = new Date();

  const today = now.toLocaleDateString("en-CA", { timeZone: timezone }); // YYYY-MM-DD

  const offsetStr =
    new Intl.DateTimeFormat("en-US", { timeZone: timezone, timeZoneName: "longOffset" })
      .formatToParts(now)
      .find((p) => p.type === "timeZoneName")
      ?.value.replace("GMT", "") || "+00:00";

  const start = `${today}T00:00:00${offsetStr}`;
  const end = `${today}T23:59:59${offsetStr}`;

  try {
    const events = await getEvents(session.googleId, { start_datetime: start, end_datetime: end }, session.supabaseUserId);
    return Response.json({ events, date: today });
  } catch (err: any) {
    console.error("Calendar fetch error:", err);
    return Response.json({ error: "Failed to fetch events" }, { status: 500 });
  }
}
