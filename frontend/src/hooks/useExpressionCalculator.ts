import { useReducer, type Dispatch } from 'react';
import type { Action } from '../utils/calculatorReducer';
import { expressionReducer, initialExpressionState, type ExpressionState } from '../utils/expressionReducer';
import { useBackendRequest } from './useBackendRequest';

/**
 * Complex mode: the same loop as `useCalculator`. A multi-operator expression
 * simply produces a new request after each `resolved`, so one effect handles
 * every step in turn.
 */
export function useExpressionCalculator(): { state: ExpressionState; dispatch: Dispatch<Action> } {
  const [state, dispatch] = useReducer(expressionReducer, initialExpressionState);
  useBackendRequest(state.request, dispatch);
  return { state, dispatch };
}
