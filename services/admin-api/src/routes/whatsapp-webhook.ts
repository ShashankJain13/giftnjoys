import { extractFields, guessCategory } from '@gnj/wa-import';
import { Hono } from 'hono';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { AppContext } from '../context';

/**
 * Receives WhatsApp Cloud API webhook events (official Meta API — never reads a group/community
 * directly; only sees messages someone explicitly forwards to this number) and turns each
 * photo/video/text message into a DRAFT product for review, reusing the same field-extraction
 * logic as the chat-export importer.
 */

const GRAPH_API = 'https://graph.facebook.com/v21.0';

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
};

interface WaMediaRef {
  id: string;
  mime_type: string;
  sha256: string;
  caption?: string;
}

interface WaMessage {
  id: string;
  type: string;
  timestamp: string;
  text?: { body: string };
  image?: WaMediaRef;
  video?: WaMediaRef;
}

interface WaWebhookBody {
  entry?: Array<{ changes?: Array<{ value?: { messages?: WaMessage[] } }> }>;
}

export function verifySignature(rawBody: string, signatureHeader: string | undefined, appSecret: string): boolean {
  if (!signatureHeader?.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const provided = signatureHeader.slice('sha256='.length);
  const expectedBuf = Buffer.from(expected, 'hex');
  const providedBuf = Buffer.from(provided, 'hex');
  return expectedBuf.length === providedBuf.length && timingSafeEqual(expectedBuf, providedBuf);
}

async function downloadMedia(mediaId: string, accessToken: string): Promise<Uint8Array> {
  const metaRes = await fetch(`${GRAPH_API}/${mediaId}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!metaRes.ok) throw new Error(`Media lookup failed: ${metaRes.status}`);
  const meta = (await metaRes.json()) as { url: string };
  const fileRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!fileRes.ok) throw new Error(`Media download failed: ${fileRes.status}`);
  return new Uint8Array(await fileRes.arrayBuffer());
}

/** Rough signal for the review-queue confidence badge — not the full grouping heuristic the zip importer uses. */
function roughConfidence(hasName: boolean, hasPrice: boolean, hasMedia: boolean): number {
  return Math.round(((hasName ? 1 : 0) + (hasPrice ? 1 : 0) + (hasMedia ? 1 : 0)) / 3 * 100) / 100;
}

async function handleMessage(ctx: AppContext, message: WaMessage): Promise<void> {
  const media = message.image ?? message.video;
  const isVideo = !!message.video;
  const caption = media?.caption ?? message.text?.body ?? '';
  if (!caption.trim() && !media) return; // e.g. location/contact/sticker — nothing to turn into a product

  // Meta's own content hash for the media (or a hash of the text) — dedupes a message forwarded twice.
  const sourceHash = media ? `wa-media:${media.sha256}` : `wa-text:${createHash('sha256').update(caption.trim()).digest('hex')}`;
  if (await ctx.repos.products.existsBySourceHash(sourceHash)) {
    ctx.log.info('whatsapp_webhook.duplicate', { id: message.id });
    return;
  }

  const [importSettings, allCategories] = await Promise.all([ctx.repos.settings.get('import'), ctx.repos.categories.list()]);
  const validCategoryIds = new Set(allCategories.map((c) => c.id));
  const categoryKeywords = Object.fromEntries(Object.entries(importSettings.categoryKeywords).filter(([id]) => validCategoryIds.has(id)));

  const fields = extractFields(caption);
  const categoryId = guessCategory(caption, categoryKeywords);

  const images: Array<{ key: string }> = [];
  const videos: Array<{ key: string }> = [];
  if (media) {
    if (!ctx.env.WHATSAPP_ACCESS_TOKEN) throw new Error('WHATSAPP_ACCESS_TOKEN is not configured');
    const bytes = await downloadMedia(media.id, ctx.env.WHATSAPP_ACCESS_TOKEN);
    const ext = EXT[media.mime_type] ?? (isVideo ? 'mp4' : 'jpg');
    const key = `products/whatsapp/${message.id}.${ext}`;
    await ctx.storage.putObject('media', key, bytes, media.mime_type);
    (isVideo ? videos : images).push({ key });
  }

  const price = fields.price ?? 0;
  const postedDate = new Date(Number(message.timestamp) * 1000).toISOString().slice(0, 10);
  await ctx.repos.products.create(
    {
      name: fields.name ?? `Untitled product (${postedDate})`,
      description: fields.description,
      price,
      ...(fields.mrp !== undefined && fields.mrp >= price ? { mrp: fields.mrp } : {}),
      ...(fields.moq !== undefined ? { moq: fields.moq } : {}),
      colors: fields.colors,
      sizes: fields.sizes,
      ...(categoryId ? { categoryId } : {}),
      tags: fields.tags.slice(0, 30),
      stockQty: importSettings.defaultStockQty,
      images,
      videos,
    },
    {
      source: 'WHATSAPP',
      sourceHash,
      parseConfidence: roughConfidence(!!fields.name, fields.price !== undefined, !!media),
      parseWarnings: fields.warnings.slice(0, 10),
      rawSourceText: caption.slice(0, 4000),
    },
  );
  ctx.log.info('whatsapp_webhook.created', { id: message.id, hasMedia: !!media });
}

export function whatsappWebhookRoutes(ctx: AppContext) {
  const app = new Hono();

  // Meta calls this once, synchronously, when you save the webhook URL in the app dashboard.
  app.get('/', (c) => {
    const mode = c.req.query('hub.mode');
    const token = c.req.query('hub.verify_token');
    const challenge = c.req.query('hub.challenge');
    if (mode === 'subscribe' && ctx.env.WHATSAPP_VERIFY_TOKEN && token === ctx.env.WHATSAPP_VERIFY_TOKEN) {
      return c.text(challenge ?? '');
    }
    return c.text('Forbidden', 403);
  });

  app.post('/', async (c) => {
    const raw = await c.req.text();
    if (!ctx.env.WHATSAPP_APP_SECRET || !verifySignature(raw, c.req.header('x-hub-signature-256'), ctx.env.WHATSAPP_APP_SECRET)) {
      ctx.log.warn('whatsapp_webhook.bad_signature');
      return c.text('Forbidden', 401);
    }

    let body: WaWebhookBody;
    try {
      body = JSON.parse(raw);
    } catch {
      return c.json({ ok: true }); // ack anyway — Meta retries on non-2xx
    }

    const messages = (body.entry ?? []).flatMap((e) => (e.changes ?? []).flatMap((ch) => ch.value?.messages ?? []));
    for (const message of messages) {
      try {
        await handleMessage(ctx, message);
      } catch (err) {
        ctx.log.error('whatsapp_webhook.message_failed', { id: message.id, error: String(err) });
      }
    }
    // Always 200 once signature-verified: a slow/failed item shouldn't make Meta hammer retries
    // for the whole batch — failures are logged per-message above instead.
    return c.json({ ok: true });
  });

  return app;
}
