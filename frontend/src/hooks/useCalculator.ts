
import { useReducer, type Dispatch } from 'react';
import {
  initialState,
  reducer,
  type Action,
  type CalculatorState,
} from '../utils/calculatorReducer';
import { useBackendRequest } from './useBackendRequest';

/** Simple mode: runs the reducer and performs backend requests when requested. */
export function useCalculator(): {
  state: CalculatorState;
  dispatch: Dispatch<Action>;
} {
  const [state, dispatch] = useReducer(reducer, initialState);

  useBackendRequest(state.request, dispatch);

  return { state, dispatch };
}
