import { useEffect, type Dispatch } from 'react';
import { ApiError, calculate } from '../services/api';
import type { OperationId } from '../utils/operations';

type Outcome = { type: 'resolved'; value: number } | { type: 'failed'; message: string };

/**
 * Performs the backend call a reducer asked for and reports the outcome back
 * to it. Shared by both calculator engines, so cancellation and error
 * handling live in one place.
 */
export function useBackendRequest(
  request: { operation: OperationId; operands: readonly number[] } | null,
  dispatch: Dispatch<Outcome>,
): void {
  useEffect(() => {
    if (!request) return;
    let cancelled = false;
    calculate(request.operation, request.operands).then(
      (value) => {
        if (!cancelled) dispatch({ type: 'resolved', value });
      },
      (error: unknown) => {
        const message = error instanceof ApiError ? error.message : 'something went wrong, please try again';
        if (!cancelled) dispatch({ type: 'failed', message });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [request, dispatch]);
}
