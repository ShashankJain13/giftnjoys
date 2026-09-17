import type { ChatMessage, DateOrder } from './types';

const INVISIBLE = /[‎‏‪-‮⁦-⁩﻿]/g;
const WIDE_SPACES = /[   ]/g;

// [17/09/26, 9:15:23 PM] Sender: text
const IOS_LINE =
  /^\[(\d{1,4})[./-](\d{1,2})[./-](\d{1,4}),?\s+(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?\s*([ap]\.?\s?m\.?)?\]\s?([\s\S]*)$/i;
// 17/09/26, 9:15 pm - Sender: text
const ANDROID_LINE =
  /^(\d{1,4})[./-](\d{1,2})[./-](\d{1,4}),?\s+(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?\s*([ap]\.?\s?m\.?)?\s+[-–]\s([\s\S]*)$/i;

const SENDER_BODY = /^([^:\n]{1,80}?):\s([\s\S]*)$/;

const ANDROID_ATTACHMENT = /^(.+?\.[a-z0-9]{2,5})\s*\(file attached\)\s*$/i;
const IOS_ATTACHMENT = /<attached:\s*([^>]+?)\s*>/gi;
// Unanchored + global: on iOS, a caption message that has exactly one attached photo often ends
// with "...caption text ‎image omitted" on the SAME line rather than as its own message, so the
// marker must be found and stripped wherever it appears, not just when it is the whole line.
const MEDIA_OMITTED = /<media omitted>|\b(?:image|video|audio|sticker|gif|document|contact card)\s+omitted\b/gi;
const EDITED_MARKER = /\s*<this message was edited>\s*$/i;

const SYSTEM_PATTERNS = [
  /messages and calls are end-to-end encrypted/i,
  /\bcreated (?:this )?group\b/i,
  /joined using (?:this group's invite link|an? group\s*(?:invite\s*)?link|an invite link)/i,
  /^this message was deleted\.?$/i,
  /^you deleted this message\.?$/i,
  /\bchanged (?:the|this group's) (?:subject|icon|description|settings)\b/i,
  /\bchanged the group (?:name|description|icon)\b/i,
  /security code (?:with .+ )?changed/i,
  /^waiting for this message/i,
  /^null$/i,
  /\bpinned a message\b/i,
  /\bturned (?:on|off) disappearing messages\b/i,
];

interface HeaderMatch {
  parts: [string, string, string, string, string, string | undefined, string | undefined];
  body: string;
}

function matchHeader(line: string): HeaderMatch | undefined {
  const m = IOS_LINE.exec(line) ?? ANDROID_LINE.exec(line);
  if (!m) return undefined;
  return {
    parts: [m[1]!, m[2]!, m[3]!, m[4]!, m[5]!, m[6], m[7]],
    body: m[8] ?? '',
  };
}

/** Looks at date tokens to decide between day-first and month-first; falls back when ambiguous. */
export function detectDateOrder(lines: string[], fallback: DateOrder): DateOrder {
  for (const line of lines.slice(0, 2000)) {
    const h = matchHeader(line);
    if (!h || h.parts[0].length === 4) continue;
    const a = Number(h.parts[0]);
    const b = Number(h.parts[1]);
    if (a > 12 && b <= 12) return 'DMY';
    if (b > 12 && a <= 12) return 'MDY';
  }
  return fallback;
}

function buildDate(parts: HeaderMatch['parts'], order: DateOrder): Date | undefined {
  const [a, b, c, hh, mm, ss, ampm] = parts;
  let year: number;
  let month: number;
  let day: number;
  if (a.length === 4) {
    year = Number(a);
    month = Number(b);
    day = Number(c);
  } else if (order === 'DMY') {
    day = Number(a);
    month = Number(b);
    year = Number(c);
  } else {
    month = Number(a);
    day = Number(b);
    year = Number(c);
  }
  if (year < 100) year += 2000;
  let hour = Number(hh);
  if (ampm) {
    const pm = /^p/i.test(ampm);
    if (pm && hour < 12) hour += 12;
    if (!pm && hour === 12) hour = 0;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23) return undefined;
  // Wall-clock time of the exporting phone, stored as UTC fields (timezone is not in the export).
  return new Date(Date.UTC(year, month - 1, day, hour, Number(mm), Number(ss ?? 0)));
}

function cleanLine(line: string): string {
  return line.replace(INVISIBLE, '').replace(WIDE_SPACES, ' ').replace(/\s+$/, '');
}

function normaliseSender(sender: string): string {
  return sender.replace(/^~\s*/, '').trim();
}

export function parseChat(rawText: string, opts: { dateOrder?: DateOrder | 'auto' } = {}): ChatMessage[] {
  const lines = rawText.replace(/\r\n?/g, '\n').split('\n').map(cleanLine);
  const order =
    !opts.dateOrder || opts.dateOrder === 'auto' ? detectDateOrder(lines, 'DMY') : opts.dateOrder;

  const messages: ChatMessage[] = [];
  let current: { timestamp: Date; body: string[] } | undefined;

  const flush = () => {
    if (!current) return;
    messages.push(toMessage(messages.length, current.timestamp, current.body.join('\n')));
    current = undefined;
  };

  for (const line of lines) {
    const header = matchHeader(line);
    const date = header ? buildDate(header.parts, order) : undefined;
    if (header && date) {
      flush();
      current = { timestamp: date, body: [header.body] };
    } else if (current) {
      current.body.push(line);
    }
  }
  flush();
  return messages;
}

function toMessage(index: number, timestamp: Date, body: string): ChatMessage {
  const senderMatch = SENDER_BODY.exec(body);
  if (!senderMatch) {
    return { index, timestamp, sender: '', text: body.trim(), attachments: [], mediaOmitted: 0, system: true };
  }
  const sender = normaliseSender(senderMatch[1]!);
  const content = senderMatch[2]!.replace(EDITED_MARKER, '');

  const attachments: string[] = [];
  let mediaOmitted = 0;
  const textLines: string[] = [];

  for (const rawLine of content.split('\n')) {
    let line = rawLine;
    for (const m of line.matchAll(IOS_ATTACHMENT)) attachments.push(basename(m[1]!));
    line = line.replace(IOS_ATTACHMENT, '').trim();
    const android = ANDROID_ATTACHMENT.exec(line);
    if (android) {
      attachments.push(basename(android[1]!));
      continue;
    }
    // The omitted-media marker can be the whole line (a standalone dropped attachment) or trail
    // the end of a caption line (one photo sent together with its caption) — strip it either way
    // and keep any real caption text that remains.
    const omittedHere = line.match(MEDIA_OMITTED);
    if (omittedHere) {
      mediaOmitted += omittedHere.length;
      line = line.replace(MEDIA_OMITTED, '').trim();
    }
    if (line) textLines.push(line.replace(EDITED_MARKER, ''));
  }

  const text = textLines.join('\n').trim();
  const system = attachments.length === 0 && mediaOmitted === 0 && SYSTEM_PATTERNS.some((p) => p.test(text));
  return { index, timestamp, sender, text, attachments, mediaOmitted, system };
}

function basename(path: string): string {
  return path.split(/[\\/]/).pop()!.trim();
}
