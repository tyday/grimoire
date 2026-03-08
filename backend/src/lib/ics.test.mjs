import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateICS } from './ics.mjs';

const mockSession = {
  sessionId: 'abc-123-def',
  title: 'Session 12: The Dragon\'s Lair',
  confirmedDate: '2026-03-15',
  createdAt: '2026-03-01T10:30:00.000Z',
};

describe('generateICS', () => {
  it('produces valid iCalendar output', () => {
    const ics = generateICS(mockSession);

    assert.ok(ics.startsWith('BEGIN:VCALENDAR'), 'should start with VCALENDAR');
    assert.ok(ics.includes('END:VCALENDAR'), 'should end with VCALENDAR');
    assert.ok(ics.includes('BEGIN:VEVENT'), 'should contain VEVENT');
    assert.ok(ics.includes('END:VEVENT'), 'should contain VEVENT end');
  });

  it('uses CRLF line endings per RFC 5545', () => {
    const ics = generateICS(mockSession);
    assert.ok(ics.includes('\r\n'), 'should use CRLF');
    // Every line break should be CRLF, not bare LF
    const withoutCRLF = ics.replace(/\r\n/g, '');
    assert.ok(!withoutCRLF.includes('\n'), 'should not have bare LF');
  });

  it('sets the correct UID', () => {
    const ics = generateICS(mockSession);
    assert.ok(ics.includes('UID:abc-123-def@grimoire'));
  });

  it('sets DTSTART as an all-day date', () => {
    const ics = generateICS(mockSession);
    assert.ok(ics.includes('DTSTART;VALUE=DATE:20260315'));
  });

  it('sets DTEND as the next day (exclusive)', () => {
    const ics = generateICS(mockSession);
    assert.ok(ics.includes('DTEND;VALUE=DATE:20260316'));
  });

  it('includes the session title as SUMMARY', () => {
    const ics = generateICS(mockSession);
    assert.ok(ics.includes("SUMMARY:Session 12: The Dragon's Lair"));
  });

  it('formats DTSTAMP from createdAt', () => {
    const ics = generateICS(mockSession);
    assert.ok(ics.includes('DTSTAMP:20260301T103000Z'));
  });

  it('handles year-end date rollover', () => {
    const ics = generateICS({
      ...mockSession,
      confirmedDate: '2026-12-31',
    });
    assert.ok(ics.includes('DTSTART;VALUE=DATE:20261231'));
    assert.ok(ics.includes('DTEND;VALUE=DATE:20270101'));
  });

  it('handles month-end date rollover', () => {
    const ics = generateICS({
      ...mockSession,
      confirmedDate: '2026-02-28',
    });
    assert.ok(ics.includes('DTSTART;VALUE=DATE:20260228'));
    assert.ok(ics.includes('DTEND;VALUE=DATE:20260301'));
  });
});
