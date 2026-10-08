import { OPERATIONS, type BinaryOperationId, type OperationId } from './operations';

/**
 * The calculator's behaviour as a pure state machine. Typing is synchronous;
 * anything that needs the backend sets `request`, and a thin hook performs the
 * call and feeds the outcome back as `resolved` / `failed`. Keeping I/O out of
 * here makes every key sequence unit-testable without a network.
 */

/** Longest operand in digits; matches the backend's 15 significant digits. */
const MAX_DIGITS = 15;

export interface PendingRequest {
  operation: OperationId;
  operands: number[];
  /** What to do with the result when it arrives. */
  then: { kind: 'equals' } | { kind: 'unary' } | { kind: 'chain'; next: BinaryOperationId };
}

export interface CalculatorState {
  /** Text on the main display: the operand being typed, or the last result. */
  entry: string;
  /** `entry` is not user-typed (a result, or the initial 0), so the next digit replaces it. */
  fresh: boolean;
  /** An operator was just pressed and the second operand has not been supplied yet. */
  awaiting: boolean;
  /** First operand and operator of the operation in progress. */
  pending: { left: number; operator: BinaryOperationId } | null;
  /** Small line above the entry, e.g. "12 ÷" or "12 ÷ 4 =". */
  history: string;
  /** Message from a failed calculation; shown instead of `entry` until the next key. */
  error: string | null;
  /** Backend call in flight. While set, input is ignored. */
  request: PendingRequest | null;
}

export type Action =
  | { type: 'digit'; digit: string }
  | { type: 'decimal' }
  | { type: 'sign' }
  | { type: 'backspace' }
  | { type: 'clear' }
  | { type: 'operator'; operator: BinaryOperationId }
  | { type: 'sqrt' }
  | { type: 'equals' }
  | { type: 'resolved'; value: number }
  | { type: 'failed'; message: string };

export const initialState: CalculatorState = {
  entry: '0',
  fresh: true,
  awaiting: false,
  pending: null,
  history: '',
  error: null,
  request: null,
};

export const formatNumber = (value: number): string => String(value);

const sentenceCase = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const countDigits = (entry: string) => entry.replace(/[^0-9]/g, '').length;

export function reducer(state: CalculatorState, action: Action): CalculatorState {
  if (action.type === 'resolved') return resolve(state, action.value);
  if (action.type === 'failed') return fail(state, action.message);
  if (state.request) return state; // a calculation is in flight

  if (action.type === 'clear') return initialState;
  if (state.error) {
    // The key that follows an error only dismisses it, except typing, which starts a new number.
    return action.type === 'digit' || action.type === 'decimal' ? reducer(initialState, action) : initialState;
  }

  switch (action.type) {
    case 'digit': {
      const entry = state.fresh || state.entry === '0' ? action.digit : state.entry + action.digit;
      return countDigits(entry) > MAX_DIGITS ? state : typed(state, entry);
    }
    case 'decimal':
      if (state.fresh) return typed(state, '0.');
      return state.entry.includes('.') ? state : typed(state, `${state.entry}.`);
    case 'sign': {
      if (state.awaiting || Number(state.entry) === 0) return state;
      const entry = state.entry.startsWith('-') ? state.entry.slice(1) : `-${state.entry}`;
      return { ...state, entry };
    }
    case 'backspace': {
      if (state.fresh) return state; // results are not editable
      const entry = state.entry.slice(0, -1);
      return { ...state, entry: entry === '' || entry === '-' ? '0' : entry };
    }
    case 'operator':
      return chooseOperator(state, action.operator);
    case 'sqrt':
      return { ...state, request: { operation: 'sqrt', operands: [Number(state.entry)], then: { kind: 'unary' } } };
    case 'equals':
      if (!state.pending) return state;
      return {
        ...state,
        request: {
          operation: state.pending.operator,
          operands: [state.pending.left, Number(state.entry)],
          then: { kind: 'equals' },
        },
      };
  }
}

/** Replaces the entry with typed input; typing after a finished calculation clears its history. */
function typed(state: CalculatorState, entry: string): CalculatorState {
  return { ...state, entry, fresh: false, awaiting: false, history: state.pending ? state.history : '' };
}

function chooseOperator(state: CalculatorState, operator: BinaryOperationId): CalculatorState {
  const { pending } = state;
  if (pending && !state.awaiting) {
    // A second operand exists: evaluate "left op entry" first, then continue with the new operator.
    return {
      ...state,
      request: {
        operation: pending.operator,
        operands: [pending.left, Number(state.entry)],
        then: { kind: 'chain', next: operator },
      },
    };
  }
  // Either starting an operation, or changing one's mind about the operator just pressed.
  const left = pending ? pending.left : Number(state.entry);
  return {
    ...state,
    entry: formatNumber(left),
    fresh: true,
    awaiting: true,
    pending: { left, operator },
    history: OPERATIONS[operator].format(left),
  };
}

function resolve(state: CalculatorState, value: number): CalculatorState {
  const request = state.request;
  if (!request) return state;
  const [a, b] = request.operands;
  const entry = formatNumber(value);

  switch (request.then.kind) {
    case 'equals':
      return {
        ...state,
        request: null,
        entry,
        fresh: true,
        awaiting: false,
        pending: null,
        history: `${OPERATIONS[request.operation].format(a, b)} =`,
      };
    case 'chain':
      return {
        ...state,
        request: null,
        entry,
        fresh: true,
        awaiting: true,
        pending: { left: value, operator: request.then.next },
        history: OPERATIONS[request.then.next].format(value),
      };
    case 'unary':
      // Inside an operation (5 + √9) the result becomes the second operand and
      // the history keeps showing the operation in progress.
      return {
        ...state,
        request: null,
        entry,
        fresh: true,
        awaiting: false,
        history: state.pending ? state.history : `${OPERATIONS.sqrt.format(a)} =`,
      };
  }
}

function fail(state: CalculatorState, message: string): CalculatorState {
  const request = state.request;
  if (!request) return state;
  const [a, b] = request.operands;
  return { ...initialState, error: sentenceCase(message), history: `${OPERATIONS[request.operation].format(a, b)} =` };
}
