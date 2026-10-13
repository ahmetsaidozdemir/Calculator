import type { OperationId } from '../utils/operations';

const BASE_URI = `${import.meta.env.VITE_BACKEND_EXTERNAL_URI ?? ''}`;
const ENDPOINT = '/api/v1/calculate';
const REQUEST_URL = BASE_URI + ENDPOINT;

/** How long to wait for the backend before giving up, so a dead service cannot freeze the keypad. */
export const REQUEST_TIMEOUT_MS = 5_000;

/** A failure reported by the API, or a transport/protocol failure talking to it. */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Asks the backend to evaluate an operation. Rejects with ApiError on failure:
 * `timeout` when no complete response arrives within REQUEST_TIMEOUT_MS, and
 * `aborted` when the caller's `signal` fires first (e.g. the component unmounted).
 */
export async function calculate(
  operation: OperationId,
  operands: readonly number[],
  signal?: AbortSignal,
): Promise<number> {
  // One controller drives the request. It is aborted either by the timeout timer
  // or by the caller's signal, and `timedOut` tells the two apart.
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  const forwardAbort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', forwardAbort, { once: true });

  // Why the request was cut short, if it was.
  const abortReason = () => (timedOut ? timeoutError() : abortedError());

  try {
    let response: Response;
    try {
      response = await fetch(REQUEST_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // b is undefined for unary operations, which JSON.stringify omits.
        body: JSON.stringify({ operation, a: operands[0], b: operands[1] }),
        signal: controller.signal,
      });
    } catch {
      throw controller.signal.aborted ? abortReason() : networkError();
    }

    // The timer keeps running while the body is read:
    // A server that sends headers and stalls must time out too.
    const payload: unknown = await response.json().catch(() => null);
    if (controller.signal.aborted) throw abortReason();

    if (response.ok && hasNumericResult(payload)) {
      return payload.result;
    }
    throw toApiError(response.status, payload);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', forwardAbort);
  }
}

const networkError = () => new ApiError('network_error', 'could not reach the calculator service, please try again');
const abortedError = () => new ApiError('aborted', 'the request was cancelled');
const timeoutError = () => new ApiError('timeout', 'the calculator service did not respond in time, please try again');

function hasNumericResult(payload: unknown): payload is { result: number } {
  return typeof payload === 'object' && payload !== null && typeof (payload as { result?: unknown }).result === 'number';
}

function toApiError(status: number, payload: unknown): ApiError {
  const error = (payload as { error?: { code?: unknown; message?: unknown } } | null)?.error;
  if (typeof error?.code === 'string' && typeof error.message === 'string') {
    return new ApiError(error.code, error.message, status);
  }
  return new ApiError('unexpected_response', `unexpected response from the server (HTTP ${status})`, status);
}
