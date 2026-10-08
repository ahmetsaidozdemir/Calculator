import { useEffect, useReducer, type Dispatch } from 'react';
import { ApiError, calculate } from './api';
import { initialState, reducer, type Action, type CalculatorState } from './calculatorReducer';

/** Runs the reducer and performs the backend call whenever it asks for one. */
export function useCalculator(): { state: CalculatorState; dispatch: Dispatch<Action> } {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { request } = state;

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
  }, [request]);

  return { state, dispatch };
}
