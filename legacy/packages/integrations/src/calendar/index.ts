// Google Calendar integration — creates loops from meetings and syncs events.
// Uses Google Calendar API with OAuth2 for secure access.

import { google, type calendar_v3 } from 'googleapis';

export interface CalendarConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  refreshToken: string;
  /** Calendar ID (default: 'primary') */
  calendarId?: string;
}

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: string;
  end: string;
  location?: string;
  attendees: string[];
  organizer: string;
  hangoutLink?: string;
}

/**
 * Create Google Calendar client.
 */
export function createCalendarClient(config: CalendarConfig): calendar_v3.Calendar {
  const oauth2Client = new google.auth.OAuth2(
    config.clientId,
    config.clientSecret,
    config.redirectUri
  );

  oauth2Client.setCredentials({
    refresh_token: config.refreshToken,
  });

  return google.calendar({ version: 'v3', auth: oauth2Client });
}

/**
 * Get upcoming events (next 7 days).
 */
export async function getUpcomingEvents(
  calendar: calendar_v3.Calendar,
  calendarId: string = 'primary',
  maxResults: number = 10
): Promise<CalendarEvent[]> {
  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const response = await calendar.events.list({
    calendarId,
    timeMin: now.toISOString(),
    timeMax: weekFromNow.toISOString(),
    maxResults,
    singleEvents: true,
    orderBy: 'startTime',
  });

  const events = (response.data.items ?? []) as calendar_v3.Schema$Event[];
  return events.map((event: calendar_v3.Schema$Event) => ({
    id: event.id || '',
    summary: event.summary || '',
    description: event.description || undefined,
    start: event.start?.dateTime || event.start?.date || '',
    end: event.end?.dateTime || event.end?.date || '',
    location: event.location || undefined,
    attendees: (event.attendees ?? []).map((a: calendar_v3.Schema$EventAttendee) => a.email || ''),
    organizer: event.organizer?.email || '',
    hangoutLink: event.hangoutLink || undefined,
  }));
}

/**
 * Create a new calendar event.
 */
export async function createEvent(
  calendar: calendar_v3.Calendar,
  calendarId: string,
  event: Omit<CalendarEvent, 'id' | 'organizer'>
): Promise<string> {
  const response = await calendar.events.insert({
    calendarId,
    requestBody: {
      summary: event.summary,
      description: event.description,
      start: { dateTime: event.start },
      end: { dateTime: event.end },
      location: event.location,
      attendees: event.attendees.map((email) => ({ email })),
    },
  });

  return response.data.id || '';
}

/**
 * Update an existing calendar event.
 */
export async function updateEvent(
  calendar: calendar_v3.Calendar,
  calendarId: string,
  eventId: string,
  updates: Partial<Omit<CalendarEvent, 'id' | 'organizer'>>
): Promise<void> {
  await calendar.events.patch({
    calendarId,
    eventId,
    requestBody: {
      summary: updates.summary,
      description: updates.description,
      start: updates.start ? { dateTime: updates.start } : undefined,
      end: updates.end ? { dateTime: updates.end } : undefined,
      location: updates.location,
      attendees: updates.attendees?.map((email) => ({ email })),
    },
  });
}

/**
 * Delete a calendar event.
 */
export async function deleteEvent(
  calendar: calendar_v3.Calendar,
  calendarId: string,
  eventId: string
): Promise<void> {
  await calendar.events.delete({
    calendarId,
    eventId,
  });
}

/**
 * Convert calendar event to loop-worthy message.
 */
export function toLoopMessage(event: CalendarEvent): string {
  const lines: string[] = [];
  lines.push(`Meeting: ${event.summary}`);
  lines.push(`Time: ${new Date(event.start).toLocaleString()} - ${new Date(event.end).toLocaleTimeString()}`);
  if (event.location) lines.push(`Location: ${event.location}`);
  if (event.attendees.length) lines.push(`Attendees: ${event.attendees.join(', ')}`);
  if (event.description) lines.push(`\n${event.description}`);
  return lines.join('\n');
}
