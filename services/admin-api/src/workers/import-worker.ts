import type { ImportJobStats } from '@gnj/core';
import { buildCandidates, ImportError, readChatExport } from '@gnj/wa-import';
import { createHash } from 'node:crypto';
import type { AppContext } from '../context';

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const STALE_PROCESSING_MS = 15 * 60 * 1000;

/**
 * Parses an uploaded WhatsApp export and creates DRAFT products for review.
 * Safe to re-run: skips jobs already finished and products whose sourceHash already exists.
 */
export async function processImportJob(ctx: AppContext, jobId: string): Promise<void> {
  const { importJobs, products, settings, categories } = ctx.repos;
  const job = await importJobs.get(jobId);
  if (!job) {
    ctx.log.warn('import.missing_job', { jobId });
    return;
  }
  const staleProcessing = job.status === 'PROCESSING' && Date.now() - Date.parse(job.updatedAt) > STALE_PROCESSING_MS;
  if (job.status !== 'QUEUED' && !staleProcessing) {
    ctx.log.info('import.skip', { jobId, status: job.status });
    return;
  }

  await importJobs.update(jobId, { status: 'PROCESSING' });
  const started = Date.now();
  const stats: ImportJobStats = {
    messages: 0,
    candidates: 0,
    created: 0,
    duplicates: 0,
    withoutImage: 0,
    withoutPrice: 0,
    imagesUploaded: 0,
  };

  try {
    const [bytes, importSettings, allCategories] = await Promise.all([
      ctx.storage.getObject('imports', job.s3Key),
      settings.get('import'),
      categories.list(),
    ]);
    const validCategoryIds = new Set(allCategories.map((c) => c.id));
    const categoryKeywords = Object.fromEntries(
      Object.entries(importSettings.categoryKeywords).filter(([id]) => validCategoryIds.has(id)),
    );

    const exported = readChatExport(bytes);
    const result = buildCandidates(exported, {
      dateOrder: importSettings.dateOrder,
      groupWindowMinutes: importSettings.groupWindowMinutes,
      categoryKeywords,
    });
    stats.messages = result.messages;
    stats.candidates = result.candidates.length;

    const seen = new Set<string>();
    for (const candidate of result.candidates) {
      if (seen.has(candidate.sourceHash) || (await products.existsBySourceHash(candidate.sourceHash))) {
        stats.duplicates++;
        continue;
      }
      seen.add(candidate.sourceHash);

      const images = await Promise.all(
        candidate.images.map(async (img, i) => {
          const digest = createHash('sha256').update(img.bytes).digest('hex').slice(0, 16);
          const key = `products/imports/${job.id}/${digest}-${i + 1}.${EXT[img.contentType]}`;
          await ctx.storage.putObject('media', key, img.bytes, img.contentType);
          return { key };
        }),
      );
      stats.imagesUploaded += images.length;
      if (images.length === 0) stats.withoutImage++;
      if (candidate.price === undefined) stats.withoutPrice++;

      const price = candidate.price ?? 0;
      const postedDate = candidate.postedAt.slice(0, 10);
      await products.create(
        {
          name: candidate.name ?? `Untitled product (${postedDate})`,
          description: candidate.description,
          price,
          ...(candidate.mrp !== undefined && candidate.mrp >= price ? { mrp: candidate.mrp } : {}),
          ...(candidate.moq !== undefined ? { moq: candidate.moq } : {}),
          ...(candidate.categoryId ? { categoryId: candidate.categoryId } : {}),
          tags: candidate.tags.slice(0, 30),
          stockQty: importSettings.defaultStockQty,
          images,
        },
        {
          source: 'WHATSAPP',
          importJobId: job.id,
          sourceHash: candidate.sourceHash,
          parseConfidence: candidate.confidence,
          parseWarnings: candidate.warnings.slice(0, 10),
          rawSourceText: candidate.rawText.slice(0, 4000),
        },
      );
      stats.created++;
    }

    await importJobs.update(jobId, {
      status: 'DONE',
      stats,
      warnings: result.warnings.slice(0, 20),
      finishedAt: new Date().toISOString(),
    });
    ctx.log.info('import.done', { jobId, ms: Date.now() - started, ...stats });
  } catch (err) {
    const message = err instanceof ImportError ? err.message : 'Import failed unexpectedly. Check the file and try again.';
    await importJobs.update(jobId, { status: 'FAILED', error: message, stats, finishedAt: new Date().toISOString() });
    ctx.log.error('import.failed', { jobId, error: String(err) });
    if (!(err instanceof ImportError)) throw err;
  }
}
