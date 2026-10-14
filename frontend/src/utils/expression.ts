import { OPERATIONS, type BinaryOperationId } from './operations';

/**
 * Operator precedence for complex mode, as pure functions with no I/O.
 *
 * An expression is a list of tokens, alternating number and operator. It is
 * rewritten to postfix (reverse Polish) order, in which every operator comes
 * right after its two operands. The reducer then runs the operators one at a
 * time, each as a single backend call, so the backend stays a plain
 * "a op b" service and does not need to know about precedence.
 */

export type Token =
  | { kind: 'number'; value: number }
  | { kind: 'operator'; operator: BinaryOperationId };

/** Higher binds tighter. `%` ("a percent of b") sits with × and ÷. */
const PRECEDENCE: Record<BinaryOperationId, number> = {
  add: 1,
  subtract: 1,
  multiply: 2,
  divide: 2,
  percent: 2,
  power: 3,
};

/** 2 ^ 3 ^ 2 is 2 ^ (3 ^ 2); every other operator groups from the left. */
const RIGHT_ASSOCIATIVE: ReadonlySet<BinaryOperationId> = new Set<BinaryOperationId>(['power']);

/** Whether `onStack` has to run before `incoming` is pushed (the shunting-yard rule). */
function runsFirst(onStack: BinaryOperationId, incoming: BinaryOperationId): boolean {
  const difference = PRECEDENCE[onStack] - PRECEDENCE[incoming];
  return difference > 0 || (difference === 0 && !RIGHT_ASSOCIATIVE.has(incoming));
}

/**
 * Rewrites alternating `number, operator, number, …` tokens into postfix order
 * (shunting-yard): 2 + 3 × 4 becomes 2 3 4 × +.
 */
export function toPostfix(tokens: readonly Token[]): Token[] {
  const output: Token[] = [];
  const pending: BinaryOperationId[] = [];

  for (const token of tokens) {
    if (token.kind === 'number') {
      output.push(token);
      continue;
    }
    let top: BinaryOperationId | undefined = pending[pending.length - 1];
    while (top !== undefined && runsFirst(top, token.operator)) {
      output.push({ kind: 'operator', operator: top });
      pending.pop();
      top = pending[pending.length - 1];
    }
    pending.push(token.operator);
  }

  while (pending.length > 0) {
    output.push({ kind: 'operator', operator: pending.pop()! });
  }
  return output;
}

/** The expression as shown on the display, e.g. "2 + 3 ×" or "15% of 200". */
export function formatTokens(tokens: readonly Token[]): string {
  const parts: string[] = [];
  for (const token of tokens) {
    if (token.kind === 'number') {
      parts.push(String(token.value));
    } else if (token.operator === 'percent') {
      // Reads the way the single-operation display does: "15% of 200".
      parts.push(`${parts.pop() ?? ''}%`, 'of');
    } else {
      parts.push(OPERATIONS[token.operator].symbol);
    }
  }
  return parts.join(' ');
}
