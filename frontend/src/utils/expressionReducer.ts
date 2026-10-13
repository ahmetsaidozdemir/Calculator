import { formatNumber, sentenceCase, type Action } from './calculatorReducer';
import { appendDecimal, appendDigit, dropLast, toggleSign } from './entry';
import { formatTokens, toPostfix, type Token } from './expression';
import { OPERATIONS, type BinaryOperationId } from './operations';

/**
 * Complex mode: the same keypad and the same `Action`s as the simple
 * reducer, but operators are collected instead of run as they are pressed.
 * Pressing = rewrites the expression to postfix order and runs it one
 * operator at a time, each as one backend call, so 2 + 3 × 4 is 14.
 *
 * Like the simple reducer it does no I/O. It sets `request`, a thin hook
 * performs the call, and the outcome comes back as `resolved` / `failed`.
 */

export type ExpressionRequest =
  | {
      kind: 'step';
      operation: BinaryOperationId;
      operands: readonly [number, number];
      /** Postfix items still to run once this call returns. */
      rest: readonly Token[];
      /** Values waiting for their operator, oldest first. */
      stack: readonly number[];
    }
  | { kind: 'sqrt'; operation: 'sqrt'; operands: readonly [number] };

export interface ExpressionState {
  /** Text on the main display: the operand being typed, or the last result. */
  entry: string;
  /** `entry` is not user-typed (a result, or the initial 0), so the next digit replaces it. */
  fresh: boolean;
  /** An operator was just pressed and the next operand has not been supplied yet. */
  awaiting: boolean;
  /** Numbers and operators already committed, left to right. Empty or ends with an operator. */
  tokens: readonly Token[];
  /** Small line above the entry, e.g. "2 + 3 ×" or "2 + 3 × 4 =". */
  history: string;
  /** Message from a failed calculation; shown instead of `entry` until the next key. */
  error: string | null;
  /** Backend call in flight. While set, input is ignored. */
  request: ExpressionRequest | null;
}

export const initialExpressionState: ExpressionState = {
  entry: '0',
  fresh: true,
  awaiting: false,
  tokens: [],
  history: '',
  error: null,
  request: null,
};

export function expressionReducer(state: ExpressionState, action: Action): ExpressionState {
  if (action.type === 'resolved') return resolve(state, action.value);
  if (action.type === 'failed') return fail(state, action.message);
  if (state.request) return state; // a calculation is in flight

  if (action.type === 'clear') return initialExpressionState;
  if (state.error) {
    // The key that follows an error only dismisses it, except typing, which starts a new number.
    return action.type === 'digit' || action.type === 'decimal'
      ? expressionReducer(initialExpressionState, action)
      : initialExpressionState;
  }

  switch (action.type) {
    case 'digit': {
      const entry = appendDigit(state.entry, state.fresh, action.digit);
      return entry === null ? state : typed(state, entry);
    }
    case 'decimal': {
      const entry = appendDecimal(state.entry, state.fresh);
      return entry === null ? state : typed(state, entry);
    }
    case 'sign': {
      if (state.awaiting) return state;
      const entry = toggleSign(state.entry);
      return entry === null ? state : { ...state, entry };
    }
    case 'backspace':
      return state.fresh ? state : { ...state, entry: dropLast(state.entry) }; // results are not editable
    case 'operator':
      return chooseOperator(state, action.operator);
    case 'sqrt':
      if (state.awaiting) return state;
      return { ...state, request: { kind: 'sqrt', operation: 'sqrt', operands: [Number(state.entry)] } };
    case 'equals':
      return state.tokens.length === 0 ? state : evaluate(state);
  }
  return state;
}

/** Replaces the entry with typed input; typing after a finished calculation clears its history. */
function typed(state: ExpressionState, entry: string): ExpressionState {
  return { ...state, entry, fresh: false, awaiting: false, history: state.tokens.length > 0 ? state.history : '' };
}

function chooseOperator(state: ExpressionState, operator: BinaryOperationId): ExpressionState {
  if (state.awaiting) {
    // Changing one's mind about the operator just pressed.
    const tokens: Token[] = [...state.tokens.slice(0, -1), { kind: 'operator', operator }];
    return { ...state, tokens, history: formatTokens(tokens) };
  }
  // Nothing runs yet: the number and operator are only recorded.
  const value = Number(state.entry);
  const tokens: Token[] = [...state.tokens, { kind: 'number', value }, { kind: 'operator', operator }];
  return {
    ...state,
    entry: formatNumber(value),
    fresh: true,
    awaiting: true,
    tokens,
    history: formatTokens(tokens),
  };
}

/** Closes the expression with the displayed entry as its last operand, then starts running it. */
function evaluate(state: ExpressionState): ExpressionState {
  const tokens: Token[] = [...state.tokens, { kind: 'number', value: Number(state.entry) }];
  return advance({ ...state, history: `${formatTokens(tokens)} =` }, toPostfix(tokens), []);
}

/**
 * Walks postfix items until an operator needs the backend (returned as a
 * request), or the items run out and the single remaining value is the result.
 */
function advance(state: ExpressionState, program: readonly Token[], stack: readonly number[]): ExpressionState {
  const values = [...stack];
  for (const [index, item] of program.entries()) {
    if (item.kind === 'number') {
      values.push(item.value);
      continue;
    }
    // Postfix built from alternating tokens always has both operands ready.
    const right = values.pop()!;
    const left = values.pop()!;
    return {
      ...state,
      request: { kind: 'step', operation: item.operator, operands: [left, right], rest: program.slice(index + 1), stack: values },
    };
  }
  return {
    ...state,
    request: null,
    entry: formatNumber(values[0]!),
    fresh: true,
    awaiting: false,
    tokens: [],
  };
}

function resolve(state: ExpressionState, value: number): ExpressionState {
  const request = state.request;
  if (!request) return state;

  if (request.kind === 'sqrt') {
    const [a] = request.operands;
    return {
      ...state,
      request: null,
      entry: formatNumber(value),
      fresh: true,
      awaiting: false,
      history: state.tokens.length > 0 ? `${state.history} ${OPERATIONS.sqrt.format(a)}` : `${OPERATIONS.sqrt.format(a)} =`,
    };
  }
  return advance({ ...state, request: null }, request.rest, [...request.stack, value]);
}

function fail(state: ExpressionState, message: string): ExpressionState {
  const request = state.request;
  if (!request) return state;
  // A failed step shows the whole expression it belonged to; a failed √ shows just the root.
  const history = request.kind === 'sqrt' ? `${OPERATIONS.sqrt.format(request.operands[0])} =` : state.history;
  return { ...initialExpressionState, error: sentenceCase(message), history };
}
