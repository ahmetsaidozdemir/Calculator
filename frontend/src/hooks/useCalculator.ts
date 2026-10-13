import { useEffect, useReducer, type Dispatch } from 'react';
import { ApiError, calculate } from '../services/api';
import { initialState, reducer, type Action, type CalculatorState } from '../utils/calculatorReducer';

/** Runs the reducer and performs the backend call whenever it asks for one. */
export function useCalculator(): { state: CalculatorState; dispatch: Dispatch<Action> } {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { request } = state;

  useEffect(() => {
    if (!request) return;
    // Aborted when the request is replaced or the component unmounts, which also
    // cancels the in-flight fetch instead of just ignoring its answer.
    const controller = new AbortController();
    const { signal } = controller;
    calculate(request.operation, request.operands, signal).then(
      (value) => {
        if (!signal.aborted) dispatch({ type: 'resolved', value });
      },
      (error: unknown) => {
        if (signal.aborted) return;
        const message = error instanceof ApiError ? error.message : 'something went wrong, please try again';
        dispatch({ type: 'failed', message });
      },
    );
    return () => controller.abort();
  }, [request]);

  return { state, dispatch };
}
