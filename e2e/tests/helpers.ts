import { deflateSync } from 'node:zlib';

export const URLS = {
  web: process.env.PUBLIC_SITE_URL ?? 'http://localhost:3000',
  admin: process.env.ADMIN_SITE_URL ?? 'http://localhost:5173',
  mailpit: process.env.MAILPIT_URL ?? 'http://localhost:8025',
};

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([len, typed, crc]);
}

/** Generates a real PNG (diagonal two-colour gradient) so imported images render in the browser. */
export function gradientPng(size = 240, from: [number, number, number] = [255, 214, 224], to: [number, number, number] = [225, 29, 72]): Buffer {
  const rows: Buffer[] = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3);
    for (let x = 0; x < size; x++) {
      const t = (x + y) / (2 * size);
      row[1 + x * 3] = Math.round(from[0] + (to[0] - from[0]) * t);
      row[2 + x * 3] = Math.round(from[1] + (to[1] - from[1]) * t);
      row[3 + x * 3] = Math.round(from[2] + (to[2] - from[2]) * t);
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export async function mailSubjectsFor(orderNumber: string): Promise<string[]> {
  const res = await fetch(`${URLS.mailpit}/api/v1/messages?limit=200`);
  const body = (await res.json()) as { messages: Array<{ Subject: string }> };
  return body.messages.map((m) => m.Subject).filter((s) => s.includes(orderNumber));
}
