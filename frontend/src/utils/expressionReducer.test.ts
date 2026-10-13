import { describe, expect, it } from 'vitest';
import type { Action } from './calculatorReducer';
import { expressionReducer, initialExpressionState, type ExpressionState } from './expressionReducer';
import type { BinaryOperationId, OperationId } from './operations';

const OPERATORS: Record<string, BinaryOperationId> = {
  '+': 'add',
  '-': 'subtract',
  '*': 'multiply',
  '/': 'divide',
  '^': 'power',
  '%': 'percent',
};

/** "2+3*4=" -> key actions. `n` is the ± key, `r` is √. */
const keys = (text: string): Action[] =>
  [...text].map((c): Action => {
    if (c === '.') return { type: 'decimal' };
    if (c === '=') return { type: 'equals' };
    if (c === 'n') return { type: 'sign' };
    if (c === 'r') return { type: 'sqrt' };
    if (c === '<') return { type: 'backspace' };
    const operator = OPERATORS[c];
    return operator ? { type: 'operator', operator } : { type: 'digit', digit: c };
  });

/** What the backend would answer, for comparing whole-expression results. */
const apply = (operation: OperationId, [a = 0, b = 0]: readonly number[]): number => {
  switch (operation) {
    case 'add':
      return a + b;
    case 'subtract':
      return a - b;
    case 'multiply':
      return a * b;
    case 'divide':
      return a / b;
    case 'power':
      return a ** b;
    case 'percent':
      return (a * b) / 100;
    case 'sqrt':
      return Math.sqrt(a);
  }
};

interface Call {
  operation: OperationId;
  operands: readonly number[];
}

/**
 * Feeds the keys to the reducer and answers every backend request locally
 * (recording it), so a whole key sequence settles like it would in the app.
 */
function solve(text: string, from: ExpressionState = initialExpressionState) {
  const calls: Call[] = [];
  let state = from;
  for (const action of keys(text)) {
    state = expressionReducer(state, action);
    while (state.request) {
      const { operation, operands } = state.request;
      calls.push({ operation, operands });
      state = expressionReducer(state, { type: 'resolved', value: apply(operation, operands) });
    }
  }
  return { state, calls };
}

/** Types the keys but stops at the first backend request, leaving it unanswered. */
function stopAtRequest(text: string): ExpressionState {
  let state = initialExpressionState;
  for (const action of keys(text)) state = expressionReducer(state, action);
  return state;
}

describe('typing numbers', () => {
  it('builds a number digit by digit, with decimals, sign and backspace', () => {
    expect(solve('123').state.entry).toBe('123');
    expect(solve('1.5.2').state.entry).toBe('1.52');
    expect(solve('5n').state.entry).toBe('-5');
    expect(solve('123<').state.entry).toBe('12');
  });

  it('accepts at most 15 digits', () => {
    expect(solve('1234567890123456').state.entry).toBe('123456789012345');
  });

  it('does not change the sign while waiting for the next operand', () => {
    expect(solve('5+n').state.entry).toBe('5');
  });

  it('does not edit a result with backspace', () => {
    expect(solve('2+3=<').state.entry).toBe('5');
  });
});

describe('collecting an expression', () => {
  it('records operators without running anything until =', () => {
    const state = stopAtRequest('2+3*');

    expect(state.request).toBeNull();
    expect(state.history).toBe('2 + 3 ×');
    expect(state.entry).toBe('3');
    expect(state.awaiting).toBe(true);
    expect(state.tokens).toHaveLength(4);
  });

  it('replaces the operator when another is pressed straight away', () => {
    const state = stopAtRequest('2+*');

    expect(state.history).toBe('2 ×');
    expect(state.tokens).toHaveLength(2);
    expect(solve('2+*3=').state.entry).toBe('6');
  });

  it('shows what is typed after an operator as the new operand', () => {
    const state = stopAtRequest('2+34');

    expect(state.entry).toBe('34');
    expect(state.history).toBe('2 +');
    expect(state.awaiting).toBe(false);
  });

  it('ignores = when there is nothing to calculate', () => {
    const state = stopAtRequest('7=');

    expect(state.request).toBeNull();
    expect(state.entry).toBe('7');
  });

  it('uses the displayed number as the missing operand: 5 + = is 5 + 5', () => {
    const { state, calls } = solve('5+=');

    expect(calls).toEqual([{ operation: 'add', operands: [5, 5] }]);
    expect(state.entry).toBe('10');
    expect(state.history).toBe('5 + 5 =');
  });

  it('clears everything on Clear', () => {
    expect(expressionReducer(stopAtRequest('2+3*'), { type: 'clear' })).toEqual(initialExpressionState);
  });
});

describe('operator precedence', () => {
  it.each([
    ['2+3*4=', 14, 'multiplication before addition'],
    ['2*3+4=', 10, 'multiplication before a later addition'],
    ['10-4/2=', 8, 'division before subtraction'],
    ['10-2-3=', 5, '− groups from the left'],
    ['100/5/2=', 10, '÷ groups from the left'],
    ['10-4/2*3=', 4, '÷ and × share a level, left to right'],
    ['2^3^2=', 512, '^ groups from the right'],
    ['2*3^2=', 18, '^ before ×'],
    ['2^3*2=', 16, '^ before a later ×'],
    ['2+3*4^2=', 50, 'all three levels together'],
    ['2+10%50=', 7, '% of binds like ×'],
    ['1.5+2.5*2=', 6.5, 'decimals'],
    ['2n^2=', 4, 'a negated operand is one number: (−2) ^ 2'],
  ])('%s = %d (%s)', (text, expected) => {
    expect(Number(solve(text).state.entry)).toBe(expected);
  });

  it('runs the tighter operator first, one backend call per operator: 2 + 3 × 4', () => {
    const { state, calls } = solve('2+3*4=');

    expect(calls).toEqual([
      { operation: 'multiply', operands: [3, 4] },
      { operation: 'add', operands: [2, 12] },
    ]);
    expect(state.entry).toBe('14');
    expect(state.history).toBe('2 + 3 × 4 =');
  });

  it('feeds each result into the next call: 2 ^ 3 ^ 2', () => {
    expect(solve('2^3^2=').calls).toEqual([
      { operation: 'power', operands: [3, 2] },
      { operation: 'power', operands: [2, 9] },
    ]);
  });

  it('makes a single call for a single operation', () => {
    expect(solve('7/2=').calls).toEqual([{ operation: 'divide', operands: [7, 2] }]);
  });

  it('writes a percentage the way the simple display does', () => {
    const { state } = solve('15%200=');

    expect(state.entry).toBe('30');
    expect(state.history).toBe('15% of 200 =');
  });
});

describe('after a result', () => {
  it('leaves the result fresh and the expression empty', () => {
    const { state } = solve('2+3*4=');

    expect(state.fresh).toBe(true);
    expect(state.tokens).toEqual([]);
    expect(state.awaiting).toBe(false);
    expect(state.request).toBeNull();
  });

  it('continues from the result when an operator is pressed', () => {
    const { state } = solve('2+3=*4=');

    expect(state.entry).toBe('20');
    expect(state.history).toBe('5 × 4 =');
  });

  it('starts a new number, and clears the old history, when a digit is typed', () => {
    const { state } = solve('2+3=7');

    expect(state.entry).toBe('7');
    expect(state.history).toBe('');
  });
});

describe('square root', () => {
  it('asks the backend for the root of the displayed number', () => {
    const state = stopAtRequest('9r');

    expect(state.request).toEqual({ kind: 'sqrt', operation: 'sqrt', operands: [9] });
  });

  it('shows the result as a finished calculation when used on its own', () => {
    const { state } = solve('9r');

    expect(state.entry).toBe('3');
    expect(state.history).toBe('√9 =');
    expect(state.fresh).toBe(true);
  });

  it('feeds the root into the expression being built: 2 + √9', () => {
    const afterRoot = solve('2+9r').state;

    expect(afterRoot.entry).toBe('3');
    expect(afterRoot.history).toBe('2 + √9');

    const { state, calls } = solve('=', afterRoot);
    expect(calls).toEqual([{ operation: 'add', operands: [2, 3] }]);
    expect(state.entry).toBe('5');
    expect(state.history).toBe('2 + 3 =');
  });

  it('is ignored while an operator is waiting for its operand', () => {
    expect(stopAtRequest('2+r').request).toBeNull();
  });

  it('reports a failed root with just the root as its history', () => {
    const asked = stopAtRequest('4nr');
    const state = expressionReducer(asked, { type: 'failed', message: 'negative square root' });

    expect(state.error).toBe('Negative square root');
    expect(state.history).toBe('√-4 =');
  });
});

describe('while a calculation is in flight', () => {
  const inFlight = stopAtRequest('1+2=');

  it('has the first request waiting', () => {
    expect(inFlight.request).toMatchObject({ kind: 'step', operation: 'add', operands: [1, 2] });
  });

  it.each(keys('9.n<+r=').map((action) => [action.type, action] as const))('ignores %s', (_name, action) => {
    expect(expressionReducer(inFlight, action)).toBe(inFlight);
  });

  it('ignores Clear, too: the answer is still coming', () => {
    expect(expressionReducer(inFlight, { type: 'clear' })).toBe(inFlight);
  });
});

describe('failures', () => {
  it('shows the error with the whole expression it belonged to, and drops the rest', () => {
    const asked = stopAtRequest('2+6/0=');
    expect(asked.request).toMatchObject({ operation: 'divide', operands: [6, 0] });

    const state = expressionReducer(asked, { type: 'failed', message: 'cannot divide by zero' });

    expect(state.error).toBe('Cannot divide by zero');
    expect(state.history).toBe('2 + 6 ÷ 0 =');
    expect(state.request).toBeNull();
    expect(state.tokens).toEqual([]);
  });

  it('can fail on a later step, after earlier ones succeeded', () => {
    const first = stopAtRequest('2*3+4=');
    expect(first.request).toMatchObject({ operation: 'multiply', operands: [2, 3] });

    const second = expressionReducer(first, { type: 'resolved', value: 6 });
    expect(second.request).toMatchObject({ operation: 'add', operands: [6, 4] });

    const state = expressionReducer(second, { type: 'failed', message: 'something went wrong' });
    expect(state.error).toBe('Something went wrong');
    expect(state.history).toBe('2 × 3 + 4 =');
  });

  it('starts a new number when typing resumes after an error', () => {
    const failed = expressionReducer(stopAtRequest('1/0='), { type: 'failed', message: 'cannot divide by zero' });
    const state = keys('5').reduce(expressionReducer, failed);

    expect(state.error).toBeNull();
    expect(state.entry).toBe('5');
  });

  it('lets any other key just dismiss the error', () => {
    const failed = expressionReducer(stopAtRequest('1/0='), { type: 'failed', message: 'cannot divide by zero' });
    const state = keys('+').reduce(expressionReducer, failed);

    expect(state).toEqual(initialExpressionState);
  });

  it('ignores outcomes that nothing is waiting for', () => {
    expect(expressionReducer(initialExpressionState, { type: 'resolved', value: 1 })).toBe(initialExpressionState);
    expect(expressionReducer(initialExpressionState, { type: 'failed', message: 'late' })).toBe(initialExpressionState);
  });
});
