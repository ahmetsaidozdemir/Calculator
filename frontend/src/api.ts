import type { OperationId } from './operations';

// Same-origin by default (Vite proxy in development, the Go server in
// production). Set VITE_API_BASE_URL at build time to point elsewhere.
const ENDPOINT = `${import.meta.env.VITE_API_BASE_URL ?? ''}/api/v1/calculate`;

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

/** Asks the backend to evaluate an operation. Rejects with ApiError on failure. */
export async function calculate(operation: OperationId, operands: readonly number[]): Promise<number> {
  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // b is undefined for unary operations, which JSON.stringify omits.
      body: JSON.stringify({ operation, a: operands[0], b: operands[1] }),
    });
  } catch {
    throw new ApiError('network_error', 'could not reach the calculator service, please try again');
  }

  const payload: unknown = await response.json().catch(() => null);
  if (response.ok && hasNumericResult(payload)) {
    return payload.result;
  }
  throw toApiError(response.status, payload);
}

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
