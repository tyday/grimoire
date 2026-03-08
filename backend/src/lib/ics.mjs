// =============================================================================
// ics.mjs — iCalendar (.ics) file generator
// =============================================================================
// Generates RFC 5545 compliant iCalendar files for session events.
//
// The .ics format is plain text with a specific structure:
//   BEGIN:VCALENDAR    <- Start of calendar
//   BEGIN:VEVENT       <- Start of event
//   DTSTART;VALUE=DATE:20260315  <- All-day event on March 15
//   ...
//   END:VEVENT
//   END:VCALENDAR
//
// We create all-day events since Pathfinder sessions don't have fixed
// start/end times — the group decides that separately.
//
// References:
//   - RFC 5545: https://tools.ietf.org/html/rfc5545
//   - iCalendar spec requires CRLF line endings (\r\n)
//   - Lines should be max 75 octets (we keep ours short)
// =============================================================================

// Format a date string "2026-03-15" as iCal date "20260315"
function formatICalDate(dateStr) {
  return dateStr.replace(/-/g, '');
}

// Add one day to a date string, returning iCal format.
// DTEND for all-day events is exclusive, so a 1-day event on March 15
// needs DTEND of March 16.
function nextDay(dateStr) {
  const date = new Date(dateStr + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + 1);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

// Generate a deterministic UID for the event based on sessionId.
// UIDs must be globally unique per the spec — using sessionId@grimoire
// ensures uniqueness within our app.
function generateUID(sessionId) {
  return `${sessionId}@grimoire`;
}

// Format a JS Date as iCal DTSTAMP (UTC timestamp when the .ics was generated)
function formatDTStamp(isoString) {
  return isoString.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

export function generateICS(session) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    // PRODID identifies the software that generated this file
    'PRODID:-//Grimoire//Campaign Companion//EN',
    // METHOD:PUBLISH means this is a published event (not a meeting request)
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${generateUID(session.sessionId)}`,
    `DTSTAMP:${formatDTStamp(session.createdAt)}`,
    // VALUE=DATE makes it an all-day event (no time component)
    `DTSTART;VALUE=DATE:${formatICalDate(session.confirmedDate)}`,
    `DTEND;VALUE=DATE:${nextDay(session.confirmedDate)}`,
    `SUMMARY:${session.title}`,
    'DESCRIPTION:Pathfinder session scheduled via Grimoire',
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  // iCalendar spec requires CRLF line endings
  return lines.join('\r\n') + '\r\n';
}
