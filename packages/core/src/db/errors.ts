function errorName(err: unknown): string | undefined {
  return err && typeof err === 'object' && 'name' in err ? String((err as { name: unknown }).name) : undefined;
}

export function isConditionalCheckFailed(err: unknown): boolean {
  return errorName(err) === 'ConditionalCheckFailedException';
}

export function isTransactionCanceled(err: unknown): boolean {
  return errorName(err) === 'TransactionCanceledException';
}

/**
 * Per-item cancellation codes of a TransactionCanceledException, e.g. ['None', 'ConditionalCheckFailed'].
 * Falls back to parsing the message, which DynamoDB Local formats as "... reasons [A, B]".
 */
export function cancellationCodes(err: unknown): string[] {
  if (!isTransactionCanceled(err)) return [];
  const reasons = (err as { CancellationReasons?: Array<{ Code?: string }> }).CancellationReasons;
  if (Array.isArray(reasons) && reasons.length > 0) return reasons.map((r) => r.Code ?? 'None');
  const match = /\[([^\]]*)\]/.exec((err as Error).message ?? '');
  return match?.[1] ? match[1].split(',').map((s) => s.trim()) : [];
}
