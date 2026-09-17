import { createHash } from 'node:crypto';
import { extractFields, guessCategory } from './extract';
import { groupMessages } from './group';
import { parseChat } from './parse-chat';
import type { BuildOptions, BuildResult, CandidateImage, CandidateVideo, ChatExport, ImportCandidate } from './types';
import { sniffImageType, sniffVideoType } from './unzip';

const sha256 = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex');

function normaliseForHash(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function confidenceScore(
  c: Pick<ImportCandidate, 'name' | 'price' | 'mrp' | 'description' | 'images' | 'videos' | 'warnings'>,
): number {
  let score = 0;
  if (c.price !== undefined) score += 0.4;
  if (c.name && c.name.length >= 3) score += 0.2;
  if (c.images.length > 0 || c.videos.length > 0) score += 0.25;
  if (c.mrp !== undefined) score += 0.05;
  if (c.description) score += 0.1;
  score -= 0.05 * c.warnings.length;
  return Math.round(Math.min(1, Math.max(0, score)) * 100) / 100;
}

/** Turns a parsed WhatsApp export into reviewable product candidates. Pure: no I/O. */
export function buildCandidates(exp: ChatExport, opts: BuildOptions = {}): BuildResult {
  const messages = parseChat(exp.chatText, { dateOrder: opts.dateOrder ?? 'auto' });
  const groups = groupMessages(messages, opts.groupWindowMinutes ?? 3);
  const maxImages = opts.maxImagesPerProduct ?? 8;
  const warnings = [...exp.warnings];

  if (messages.length === 0) warnings.push('No messages recognised — is this a WhatsApp chat export?');

  const candidates: ImportCandidate[] = groups.map((g) => {
    const rawText = g.texts.join('\n');
    const fields = extractFields(rawText);
    const candidateWarnings = [...fields.warnings];

    const images: CandidateImage[] = [];
    const videos: CandidateVideo[] = [];
    let missingImages = g.mediaOmitted;
    for (const filename of g.attachments) {
      const bytes = exp.media.get(filename);
      const imageType = bytes ? sniffImageType(bytes) : undefined;
      if (bytes && imageType) {
        if (images.length < maxImages) images.push({ filename, contentType: imageType, bytes });
        continue;
      }
      const videoType = bytes ? sniffVideoType(bytes) : undefined;
      if (bytes && videoType) {
        if (videos.length < 3) videos.push({ filename, contentType: videoType, bytes });
        continue;
      }
      missingImages++;
    }
    if (missingImages > 0) {
      candidateWarnings.push(
        exp.media.size === 0
          ? 'Media was not included in the export (use "Include media")'
          : `${missingImages} attachment(s) missing or unsupported`,
      );
    }
    if (images.length === 0 && videos.length === 0 && missingImages === 0) candidateWarnings.push('No image');

    const sourceHash = sha256(`${normaliseForHash(rawText)}|${images[0] ? sha256(images[0].bytes) : ''}`);
    const categoryId = guessCategory(rawText, opts.categoryKeywords);

    const candidate: ImportCandidate = {
      postedAt: g.startedAt.toISOString(),
      ...(fields.name ? { name: fields.name } : {}),
      description: fields.description,
      ...(fields.price !== undefined ? { price: fields.price } : {}),
      ...(fields.mrp !== undefined ? { mrp: fields.mrp } : {}),
      ...(fields.moq !== undefined ? { moq: fields.moq } : {}),
      ...(fields.color ? { color: fields.color } : {}),
      ...(fields.size ? { size: fields.size } : {}),
      tags: fields.tags,
      ...(categoryId ? { categoryId } : {}),
      images,
      videos,
      missingImages,
      rawText,
      sourceHash,
      confidence: 0,
      warnings: candidateWarnings,
    };
    candidate.confidence = confidenceScore(candidate);
    return candidate;
  });

  return { messages: messages.length, candidates, warnings };
}
