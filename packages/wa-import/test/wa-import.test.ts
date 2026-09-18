import { readFileSync } from 'node:fs';
import { zipSync, strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { buildCandidates, extractFields, hasPrice, parseChat, readChatExport } from '../src/index';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

/** Minimal byte arrays with valid magic numbers; the contents don't need to be real images. */
const fakeJpeg = (seed: number) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, seed, 1, 2, 3, 4, 5]);

describe('extractFields', () => {
  it.each([
    ['Rs.499/-', 499],
    ['₹1,299', 1299],
    ['Price: 250', 250],
    ['price-250/-', 250],
    ['Only ₹799', 799],
    ['Rate - 450', 450],
    ['@ 199', 199],
    ['350 rs', 350],
    ['Offer price INR 12.50', 12.5],
  ])('parses %s', (text, expected) => {
    expect(extractFields(`Brass Diya Set\n${text}`).price).toBe(expected);
  });

  it('separates MRP from selling price', () => {
    const f = extractFields('*Ceramic Mug* ☕\nMRP ₹599\nOffer price ₹349/-');
    expect(f).toMatchObject({ name: 'Ceramic Mug', price: 349, mrp: 599 });
  });

  it('does not treat quantities as prices', () => {
    expect(hasPrice('Only 5 pieces left')).toBe(false);
    expect(hasPrice('price for 10 pcs?')).toBe(false);
  });

  it('extracts moq, hashtags and strips labels/emojis from the name', () => {
    const f = extractFields('🔥 New Arrival 🔥\nProduct name: Scented Candle Jar 🕯️\nPrice: 250\nMOQ: 6\n#candles #Diwali');
    expect(f.name).toBe('Scented Candle Jar');
    expect(f.moq).toBe(6);
    expect(f.tags).toEqual(['candles', 'diwali']);
  });

  it('splits multi-value colour/size labels into separate options', () => {
    const f = extractFields('Cotton Kurti\nPrice: 599\nColours: Red, Blue & Multicolor\nSize - S/M/L');
    expect(f.colors).toEqual(['Red', 'Blue', 'Multicolor']);
    expect(f.sizes).toEqual(['S', 'M', 'L']);
  });

  it('defaults colours/sizes to an empty list when no label is present', () => {
    const f = extractFields('Plain Ceramic Mug\nPrice: 199');
    expect(f.colors).toEqual([]);
    expect(f.sizes).toEqual([]);
  });

  it('uses MRP as price when only MRP is present and warns', () => {
    const f = extractFields('Soft Teddy Bear\nMRP 899');
    expect(f.price).toBe(899);
    expect(f.warnings[0]).toMatch(/only mrp/i);
  });

  it('removes inline price from the name', () => {
    expect(extractFields('Wooden Name Plate Keychain ₹1,299').name).toBe('Wooden Name Plate Keychain');
  });
});

describe('parseChat', () => {
  it('parses Android exports with multi-line messages and attachments', () => {
    const messages = parseChat(fixture('android-chat.txt'));
    const first = messages.find((m) => m.attachments.includes('IMG-20260917-WA0001.jpg'));
    expect(first?.sender).toBe('Priya Gifts');
    expect(first?.text).toContain('Offer price ₹349/-');
    expect(first?.timestamp.toISOString()).toBe('2026-09-17T09:05:00.000Z');
    expect(messages.filter((m) => m.system).length).toBe(3);
    expect(messages.some((m) => m.mediaOmitted)).toBe(true);
  });

  it('parses iOS exports with narrow spaces, ~ senders and edited markers', () => {
    const messages = parseChat(fixture('ios-chat.txt'));
    expect(messages[1]?.sender).toBe('Meena Crafts');
    expect(messages[1]?.attachments).toEqual(['00000011-PHOTO-2026-09-17-11-02-10.jpg']);
    expect(messages[3]?.mediaOmitted).toBe(1);
    expect(messages.at(-1)?.text).toBe('Available in 3 colours');
    expect(messages[0]?.system).toBe(true);
  });

  it('auto-detects month-first dates', () => {
    const [m] = parseChat('09/17/26, 9:15 PM - Asha: hello there');
    expect(m?.timestamp.toISOString()).toBe('2026-09-17T21:15:00.000Z');
  });
});

describe('buildCandidates', () => {
  it('groups the Android fixture into product posts', () => {
    const exp = {
      chatFileName: 'chat.txt',
      chatText: fixture('android-chat.txt'),
      media: new Map([1, 2, 3, 4, 5].map((n) => [`IMG-20260917-WA000${n}.jpg`, fakeJpeg(n)])),
      warnings: [],
    };
    const { candidates } = buildCandidates(exp, { categoryKeywords: { 'cat-mugs': ['mug', 'mugs'] } });

    expect(candidates.map((c) => [c.name, c.price, c.images.length])).toEqual([
      ['Ceramic Couple Mug Set', 349, 1],
      ['LED Photo Frame with 12 clips', 499, 2],
      ['Scented candle jar - lavender', 250, 2],
      ['Wooden Name Plate Keychain', 1299, 0],
    ]);
    const [mug, , candle, keychain] = candidates;
    expect(mug).toMatchObject({ mrp: 599, tags: ['mugs', 'couplegifts'], categoryId: 'cat-mugs' });
    expect(mug!.description).toContain('Microwave safe');
    expect(candle!.moq).toBe(6);
    expect(keychain!.missingImages).toBe(1);
    expect(mug!.confidence).toBeGreaterThan(keychain!.confidence);
  });

  it('groups the iOS fixture (photo then text, omitted image then text + follow-up)', () => {
    const exp = { chatFileName: '_chat.txt', chatText: fixture('ios-chat.txt'), media: new Map(), warnings: [] };
    const { candidates } = buildCandidates(exp);
    expect(candidates.map((c) => [c.name, c.price])).toEqual([
      ['Personalised Wooden Photo Frame', 450],
      ['Jute Gift Hamper Basket', 799],
    ]);
    expect(candidates[1]!.description).toContain('Available in 3 colours');
  });

  it('produces stable source hashes for de-duplication', () => {
    const exp = { chatFileName: 'c', chatText: fixture('ios-chat.txt'), media: new Map(), warnings: [] };
    const a = buildCandidates(exp).candidates.map((c) => c.sourceHash);
    const b = buildCandidates(exp).candidates.map((c) => c.sourceHash);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(a.length);
  });
});

describe('readChatExport', () => {
  it('reads chat + images from a zip and ignores unsafe or unsupported entries', () => {
    const zip = zipSync({
      'WhatsApp Chat with Wholesale Gift Deals.txt': strToU8(fixture('android-chat.txt')),
      'IMG-20260917-WA0001.jpg': fakeJpeg(1),
      'IMG-20260917-WA0002.jpg': fakeJpeg(2),
      'notes.docx': new Uint8Array([0, 0, 0]), // unsupported extension, must be ignored
      '../escape.jpg': fakeJpeg(9),
    });
    const exp = readChatExport(zip);
    expect(exp.chatFileName).toBe('WhatsApp Chat with Wholesale Gift Deals.txt');
    expect([...exp.media.keys()].sort()).toEqual(['IMG-20260917-WA0001.jpg', 'IMG-20260917-WA0002.jpg']);
    expect(exp.warnings.join(' ')).toMatch(/unsafe/);
  });

  it('accepts a bare .txt export', () => {
    const exp = readChatExport(strToU8(fixture('ios-chat.txt')));
    expect(exp.media.size).toBe(0);
    expect(exp.chatText).toContain('Jute Gift Hamper Basket');
  });

  it('rejects zips without a chat file', () => {
    expect(() => readChatExport(zipSync({ 'a.jpg': fakeJpeg(1) }))).toThrow(/No chat/);
  });
});
