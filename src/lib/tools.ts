import Anthropic from "@anthropic-ai/sdk";

export const tools: Anthropic.Tool[] = [
  {
    name: "get_events",
    description:
      "Fetch the user's Google Calendar events within a date range. Returns events enriched with priority, category, status, and other metadata. Use this to see what's on the user's schedule.",
    input_schema: {
      type: "object",
      properties: {
        start_datetime: {
          type: "string",
          description: "Start of range in ISO 8601 format (e.g., '2025-03-18T00:00:00-07:00')",
        },
        end_datetime: {
          type: "string",
          description: "End of range in ISO 8601 format (e.g., '2025-03-18T23:59:59-07:00')",
        },
        query: {
          type: "string",
          description: "Optional text search filter to match event titles/descriptions",
        },
      },
      required: ["start_datetime", "end_datetime"],
    },
  },
  {
    name: "find_free_slots",
    description:
      "Find available time slots on a given date. Can optionally check availability of other attendees using Google's FreeBusy API. Returns a list of free time windows.",
    input_schema: {
      type: "object",
      properties: {
        date: {
          type: "string",
          description: "The date to check in YYYY-MM-DD format",
        },
        duration_minutes: {
          type: "number",
          description: "Required duration of the free slot in minutes",
        },
        earliest_time: {
          type: "string",
          description:
            "Earliest acceptable start time in HH:MM format (24h). Defaults to working hours start.",
        },
        latest_time: {
          type: "string",
          description:
            "Latest acceptable end time in HH:MM format (24h). Defaults to working hours end.",
        },
        attendee_emails: {
          type: "array",
          items: { type: "string" },
          description: "Optional list of attendee email addresses to check mutual availability",
        },
      },
      required: ["date", "duration_minutes"],
    },
  },
  {
    name: "create_event",
    description:
      "Create a new event on the user's Google Calendar. IMPORTANT: Always confirm with the user before calling this tool.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Event title" },
        start_datetime: { type: "string", description: "Start time in ISO 8601 format" },
        end_datetime: { type: "string", description: "End time in ISO 8601 format" },
        description: { type: "string", description: "Event description/notes" },
        attendees: {
          type: "array",
          items: { type: "string" },
          description: "List of attendee email addresses to invite",
        },
        location: { type: "string", description: "Event location" },
        add_meet_link: {
          type: "boolean",
          description: "If true, automatically generates and attaches a Google Meet link to the event",
        },
      },
      required: ["title", "start_datetime", "end_datetime"],
    },
  },
  {
    name: "update_event",
    description:
      "Update an existing event on the user's Google Calendar. Can change time, title, description, attendees, etc. IMPORTANT: Always confirm with the user before calling this tool.",
    input_schema: {
      type: "object",
      properties: {
        event_id: { type: "string", description: "The Google Calendar event ID to update" },
        title: { type: "string", description: "New title (omit to keep current)" },
        start_datetime: {
          type: "string",
          description: "New start time in ISO 8601 (omit to keep current)",
        },
        end_datetime: {
          type: "string",
          description: "New end time in ISO 8601 (omit to keep current)",
        },
        description: { type: "string", description: "New description (omit to keep current)" },
        attendees: {
          type: "array",
          items: { type: "string" },
          description: "New attendee list (replaces existing)",
        },
        location: { type: "string", description: "New location (omit to keep current)" },
      },
      required: ["event_id"],
    },
  },
  {
    name: "delete_event",
    description:
      "Delete an event from the user's Google Calendar. IMPORTANT: Always confirm with the user before calling this tool.",
    input_schema: {
      type: "object",
      properties: {
        event_id: { type: "string", description: "The Google Calendar event ID to delete" },
      },
      required: ["event_id"],
    },
  },
  {
    name: "update_event_metadata",
    description:
      "Set or update custom metadata for a calendar event, such as priority, category, whether it's movable, or link a task to it.",
    input_schema: {
      type: "object",
      properties: {
        event_id: { type: "string", description: "The Google Calendar event ID" },
        recurring_event_id: {
          type: "string",
          description: "The recurring event series ID (if applying to all instances)",
        },
        priority: {
          type: "string",
          enum: ["low", "medium", "high", "critical"],
          description: "Event priority level",
        },
        is_movable: {
          type: "boolean",
          description: "Whether this event can be moved/rescheduled by the AI",
        },
        category: {
          type: "string",
          description: "Event category (e.g., 'focus', 'social', 'exercise', 'admin', '1:1')",
        },
        linked_task: {
          type: "string",
          description: "Task description to associate with this time block",
        },
        notes: { type: "string", description: "Additional context or notes for the AI" },
      },
      required: ["event_id"],
    },
  },
  {
    name: "mark_event_status",
    description:
      "Mark a calendar event's completion status. Use this when the user reports whether a meeting/event happened or not.",
    input_schema: {
      type: "object",
      properties: {
        event_id: { type: "string", description: "The Google Calendar event ID" },
        status: {
          type: "string",
          enum: ["completed", "skipped", "cancelled"],
          description: "The new status",
        },
      },
      required: ["event_id", "status"],
    },
  },
  {
    name: "get_user_preferences",
    description:
      "Get the user's scheduling preferences including working hours, meeting rules, priority settings, and reorganization heuristics. Use this when you need to make scheduling decisions that should respect the user's preferences.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "get_event_stats",
    description:
      "Get statistics about event completion patterns. Useful for identifying trends like frequently skipped meetings or categories with low completion rates.",
    input_schema: {
      type: "object",
      properties: {
        days_back: {
          type: "number",
          description: "Number of days to look back. Default 30.",
        },
        category: {
          type: "string",
          description: "Filter by category (optional)",
        },
        recurring_event_id: {
          type: "string",
          description: "Filter by recurring event series (optional)",
        },
      },
      required: [],
    },
  },
];
