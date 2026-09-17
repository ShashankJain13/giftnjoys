import { hasPrice, stripFormatting } from './extract';
import type { ChatMessage } from './types';

export interface MessageGroup {
  sender: string;
  startedAt: Date;
  lastAt: Date;
  attachments: string[];
  mediaOmitted: number;
  texts: string[];
  hasPrice: boolean;
  /** Group started with priced text; photos that follow belong to it. */
  textFirst: boolean;
}

function isMeaningful(text: string): boolean {
  const cleaned = stripFormatting(text);
  return (cleaned.match(/[\p{L}\p{N}]/gu) ?? []).length >= 3;
}

/**
 * Groups consecutive messages from one sender into product posts.
 *
 * Patterns handled:
 *  - photo with priced caption                    → one product per message
 *  - several photos, then one priced text         → one product
 *  - priced text, then several photos             → one product
 *  - plain text right after a product             → appended to its description
 * A new priced text, or new photos after a finished photo+price post, starts the next product.
 */
export function groupMessages(messages: ChatMessage[], windowMinutes: number): MessageGroup[] {
  const windowMs = windowMinutes * 60_000;
  const groups: MessageGroup[] = [];
  let current: MessageGroup | undefined;

  const flush = () => {
    if (current) groups.push(current);
    current = undefined;
  };

  for (const m of messages) {
    if (m.system) continue;
    const meaningful = isMeaningful(m.text);
    const priced = meaningful && hasPrice(m.text);
    const hasMedia = m.attachments.length > 0 || m.mediaOmitted;
    if (!hasMedia && !meaningful) continue;

    const continues =
      current !== undefined &&
      current.sender === m.sender &&
      m.timestamp.getTime() - current.lastAt.getTime() <= windowMs &&
      !startsNewProduct(current, priced, hasMedia);

    if (!continues) {
      flush();
      current = {
        sender: m.sender,
        startedAt: m.timestamp,
        lastAt: m.timestamp,
        attachments: [],
        mediaOmitted: 0,
        texts: [],
        hasPrice: false,
        textFirst: priced && !hasMedia,
      };
    }
    const g = current!;
    g.attachments.push(...m.attachments);
    if (m.mediaOmitted) g.mediaOmitted++;
    if (meaningful) g.texts.push(m.text);
    g.hasPrice ||= priced;
    g.lastAt = m.timestamp;
  }
  flush();

  // Keep product-like groups: anything with a price, or photos with some text.
  return groups.filter((g) => g.hasPrice || ((g.attachments.length > 0 || g.mediaOmitted > 0) && g.texts.length > 0));
}

function startsNewProduct(current: MessageGroup, priced: boolean, hasMedia: boolean): boolean {
  if (priced) return current.hasPrice;
  if (hasMedia) {
    const hasPhotos = current.attachments.length + current.mediaOmitted > 0;
    return current.hasPrice && hasPhotos && !current.textFirst;
  }
  return false;
}
