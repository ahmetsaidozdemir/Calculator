
import type { CalculatorState } from './calculatorReducer';
import type { ExpressionState } from './expressionReducer';
import type { BinaryOperationId } from './operations';
import type { Token } from './expression';

/** What the component needs to draw, whichever engine produced it. */
export interface CalculatorView {
  entry: string;
  history: string;
  error: string | null;
  /** A backend call is in flight: keys and the mode switch are disabled. */
  busy: boolean;
  /** An operator was just pressed, so the square-root key is disabled. */
  awaiting: boolean;
  /** The operator waiting for its operand, drawn pressed-in on the keypad. */
  activeOperator: BinaryOperationId | undefined;
}

export const simpleView = (state: CalculatorState): CalculatorView => ({
  entry: state.entry,
  history: state.history,
  error: state.error?.kind === 'calculation' ? 'Error' : null,
  busy: state.request !== null,
  awaiting: state.awaiting,
  activeOperator: state.awaiting ? state.pending?.operator : undefined,
});

export function expressionView(state: ExpressionState): CalculatorView {
  const last: Token | undefined = state.tokens[state.tokens.length - 1];

  return {
    entry: state.entry,
    history: state.history,
    error: state.error,
    busy: state.request !== null,
    awaiting: state.awaiting,
    activeOperator:
      state.awaiting && last?.kind === 'operator'
        ? last.operator
        : undefined,
  };
}
