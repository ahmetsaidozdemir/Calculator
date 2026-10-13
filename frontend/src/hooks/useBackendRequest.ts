import { useEffect, type Dispatch } from 'react';
import { ApiError, calculate } from '../services/api';
import type { Action, ErrorKind } from '../utils/calculatorReducer';
import type { OperationId } from '../utils/operations';

type RequestOutcome =
  | Extract<Action, { type: 'resolved' }>
  | { type: 'failed'; message: string; kind: ErrorKind };

/**
 * Performs backend requests for both calculator engines.
 * Cancels in-flight requests when the request changes or the component unmounts.
 */
export function useBackendRequest(
  request: { operation: OperationId; operands: readonly number[] } | null,
  dispatch: Dispatch<RequestOutcome>,
): void {
  useEffect(() => {
    if (!request) return;

    const controller = new AbortController();
    const { signal } = controller;

    calculate(request.operation, request.operands, signal).then(
      (value) => {
        if (!signal.aborted) {
          dispatch({ type: 'resolved', value });
        }
      },
      (error: unknown) => {
        if (signal.aborted) return;

        const isApiError = error instanceof ApiError;
        const message = isApiError
          ? error.message
          : 'something went wrong, please try again';
        const kind: ErrorKind = isApiError ? error.kind : 'system';

        dispatch({ type: 'failed', message, kind });
      },
    );

    return () => controller.abort();
  }, [request, dispatch]);
}
