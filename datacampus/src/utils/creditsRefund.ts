import { supabaseServer } from './supabaseServerClient';

/** True when the thrown error came from an aborted request/model call. */
export function isAbortError(err: unknown): boolean {
  return Boolean(
    (err instanceof DOMException && err.name === 'AbortError') ||
      (err instanceof Error && err.name === 'AbortError') ||
      (typeof err === 'object' && err !== null && 'name' in err && (err as { name?: string }).name === 'AbortError')
  );
}

/**
 * Refund credits previously consumed for a generation/edit step that was
 * cancelled or failed after deduction. Best-effort: refund failures should
 * never mask the original application error.
 */
export async function refundCredits(
  userId: string,
  amount: number,
  description: string,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  if (!supabaseServer || !userId || !Number.isFinite(amount) || amount <= 0) return;

  try {
    await supabaseServer.rpc('add_credits', {
      p_user_id: userId,
      p_amount: amount,
      p_kind: 'refund',
      p_description: description,
      p_metadata: metadata,
    });
  } catch (err) {
    console.error('Credit refund failed', err instanceof Error ? err.message : err);
  }
}
