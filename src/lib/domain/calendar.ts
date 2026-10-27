import { toTime } from './dates';
import type { Trial } from './types';

export const ICS_DESCRIPTION = 'Take your check-in photo in the same spot as day 0';
const EVENT_MINUTES = 15;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Floating local time (no Z): calendars show it at that clock time wherever the user is. */
function localStamp(d: Date): string {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
}

function utcStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** RFC 5545 folding: lines longer than 75 octets continue on the next line after a space. */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  let size = 0;
  for (const ch of line) {
    const len = new TextEncoder().encode(ch).length;
    const limit = parts.length === 0 ? 75 : 74;
    if (size + len > limit) {
      parts.push(current);
      current = '';
      size = 0;
    }
    current += ch;
    size += len;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

/**
 * A calendar file with one 15-minute event per check-in date, at 9:00 local time on that day.
 * Deterministic: DTSTAMP comes from the trial start, UIDs from the trial id and index.
 */
export function toIcs(trial: Pick<Trial, 'id' | 'product' | 'startedAt'>, dates: readonly (string | Date)[]): string {
  const stamp = utcStamp(new Date(toTime(trial.startedAt)));
  const summary = escapeText(`Kept check-in: ${trial.product.name}`);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Kept//Skincare trial//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  dates.forEach((date, i) => {
    const day = new Date(toTime(date));
    const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9, 0, 0);
    const end = new Date(start.getTime() + EVENT_MINUTES * 60_000);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${trial.id}-${i}@kept`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${localStamp(start)}`,
      `DTEND:${localStamp(end)}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${escapeText(ICS_DESCRIPTION)}`,
      'END:VEVENT',
    );
  });
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
