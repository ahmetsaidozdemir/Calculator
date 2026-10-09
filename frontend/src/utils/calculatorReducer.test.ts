import { describe, expect, it } from 'vitest';
import { initialState, reducer, type Action, type CalculatorState } from './calculatorReducer';
import { formatNumber } from './calculatorReducer';
import type { BinaryOperationId } from './operations';

const run = (...actions: Action[]): CalculatorState => actions.reduce(reducer, initialState);

/** "12.5" -> digit/decimal actions. */
const type = (text: string): Action[] =>
  [...text].map((c) => (c === '.' ? { type: 'decimal' } : { type: 'digit', digit: c }));

const op = (operator: BinaryOperationId): Action => ({ type: 'operator', operator });
const equals: Action = { type: 'equals' };
const sqrt: Action = { type: 'sqrt' };
const clear: Action = { type: 'clear' };

describe('typing numbers', () => {
  it('starts at 0', () => {
    expect(initialState.entry).toBe('0');
  });

  it('builds a number digit by digit', () => {
    expect(run(...type('123')).entry).toBe('123');
  });

  it('drops leading zeros', () => {
    expect(run(...type('007')).entry).toBe('7');
    expect(run(...type('000')).entry).toBe('0');
  });

  it('starts a decimal from zero or from the current number, once only', () => {
    expect(run(...type('.5')).entry).toBe('0.5');
    expect(run(...type('1.5.2')).entry).toBe('1.52');
  });

  it('accepts at most 15 digits, not counting the sign or decimal point', () => {
    const fifteen = '123456789012345';
    expect(run(...type(fifteen)).entry).toBe(fifteen);
    expect(run(...type(fifteen), { type: 'digit', digit: '6' }).entry).toBe(fifteen);
    expect(run(...type('12345678901234.5')).entry).toBe('12345678901234.5');
  });
});

describe('sign and backspace', () => {
  it('toggles the sign of a non-zero number', () => {
    const negative = run(...type('5'), { type: 'sign' });
    expect(negative.entry).toBe('-5');
    expect(reducer(negative, { type: 'sign' }).entry).toBe('5');
  });

  it('does not negate zero', () => {
    expect(run({ type: 'sign' }).entry).toBe('0');
    expect(run(...type('0.'), { type: 'sign' }).entry).toBe('0.');
  });

  it('does not change the sign while waiting for a second operand', () => {
    const state = run(...type('5'), op('add'), { type: 'sign' });
    expect(state.entry).toBe('5');
  });

  it('removes the last character, falling back to 0', () => {
    expect(run(...type('123'), { type: 'backspace' }).entry).toBe('12');
    expect(run(...type('7'), { type: 'backspace' }).entry).toBe('0');
    expect(run(...type('5'), { type: 'sign' }, { type: 'backspace' }).entry).toBe('0');
  });

  it('lets typing continue after backspacing to 0', () => {
    expect(run(...type('7'), { type: 'backspace' }, ...type('4')).entry).toBe('4');
  });

  it('does not edit a result', () => {
    const result = reducer(run(...type('2'), op('add'), ...type('3'), equals), { type: 'resolved', value: 5 });
    expect(reducer(result, { type: 'backspace' })).toBe(result);
  });
});

describe('clear', () => {
  it('resets everything', () => {
    expect(run(...type('12'), op('divide'), ...type('4'), clear)).toEqual(initialState);
  });
});

describe('choosing an operator', () => {
  it('stores the first operand and shows the pending operation', () => {
    const state = run(...type('12.'), op('divide'));
    expect(state).toMatchObject({
      entry: '12',
      history: '12 ÷',
      awaiting: true,
      fresh: true,
      pending: { left: 12, operator: 'divide' },
      request: null,
    });
  });

  it('lets the user change their mind about the operator', () => {
    const state = run(...type('12'), op('divide'), op('multiply'));
    expect(state.pending).toEqual({ left: 12, operator: 'multiply' });
    expect(state.history).toBe('12 ×');
    expect(state.request).toBeNull();
  });

  it('evaluates the pending operation before continuing with a new operator', () => {
    const state = run(...type('2'), op('add'), ...type('3'), op('multiply'));
    expect(state.request).toEqual({
      operation: 'add',
      operands: [2, 3],
      then: { kind: 'chain', next: 'multiply' },
    });
  });

  it('shows percent as "% of"', () => {
    expect(run(...type('15'), op('percent')).history).toBe('15% of');
  });

  it('continues from a result', () => {
    const result = reducer(run(...type('2'), op('add'), ...type('3'), equals), { type: 'resolved', value: 5 });
    expect(reducer(result, op('multiply')).pending).toEqual({ left: 5, operator: 'multiply' });
  });
});

describe('equals', () => {
  it('requests "left op entry"', () => {
    expect(run(...type('7'), op('divide'), ...type('2'), equals).request).toEqual({
      operation: 'divide',
      operands: [7, 2],
      then: { kind: 'equals' },
    });
  });

  it('reuses the first operand when pressed straight after an operator', () => {
    expect(run(...type('5'), op('add'), equals).request?.operands).toEqual([5, 5]);
  });

  it('does nothing without an operation in progress', () => {
    const state = run(...type('5'));
    expect(reducer(state, equals)).toBe(state);
  });
});

describe('square root', () => {
  it('requests the root of the displayed number', () => {
    expect(run(...type('9'), sqrt).request).toEqual({ operation: 'sqrt', operands: [9], then: { kind: 'unary' } });
  });
});

describe('while a request is in flight', () => {
  const busy = run(...type('7'), op('divide'), ...type('2'), equals);

  it('ignores every key', () => {
    for (const action of [...type('9'), op('add'), equals, sqrt, clear, { type: 'sign' }, { type: 'backspace' }] as Action[]) {
      expect(reducer(busy, action)).toBe(busy);
    }
  });
});

describe('results arriving', () => {
  it('finishes an equals: shows the result and the full expression', () => {
    const state = reducer(run(...type('7'), op('divide'), ...type('2'), equals), { type: 'resolved', value: 3.5 });
    expect(state).toMatchObject({
      entry: '3.5',
      history: '7 ÷ 2 =',
      fresh: true,
      awaiting: false,
      pending: null,
      request: null,
    });
  });

  it('starts a new number when typing after a result', () => {
    const state = reducer(run(...type('7'), op('divide'), ...type('2'), equals), { type: 'resolved', value: 3.5 });
    expect(reducer(state, { type: 'digit', digit: '9' })).toMatchObject({ entry: '9', history: '' });
  });

  it('finishes a chain: result becomes the left operand of the next operator', () => {
    const state = reducer(run(...type('2'), op('add'), ...type('3'), op('multiply')), { type: 'resolved', value: 5 });
    expect(state).toMatchObject({
      entry: '5',
      history: '5 ×',
      awaiting: true,
      pending: { left: 5, operator: 'multiply' },
      request: null,
    });
  });

  it('finishes a square root on its own', () => {
    const state = reducer(run(...type('9'), sqrt), { type: 'resolved', value: 3 });
    expect(state).toMatchObject({ entry: '3', history: '√9 =', fresh: true });
  });

  it('uses a square root inside an operation as the second operand', () => {
    let state = reducer(run(...type('5'), op('add'), ...type('9'), sqrt), { type: 'resolved', value: 3 });
    expect(state).toMatchObject({ entry: '3', history: '5 + √9', awaiting: false, pending: { left: 5, operator: 'add' } });

    state = reducer(state, equals);
    expect(state.request?.operands).toEqual([5, 3]);
  });

  it('formats percent results with "of"', () => {
    const state = reducer(run(...type('15'), op('percent'), ...type('200'), equals), { type: 'resolved', value: 30 });
    expect(state.history).toBe('15% of 200 =');
  });

  it('ignores a result when nothing is in flight', () => {
    expect(reducer(initialState, { type: 'resolved', value: 1 })).toBe(initialState);
  });
});

describe('failures', () => {
  const failed = () =>
    reducer(run(...type('1'), op('divide'), ...type('0'), equals), { type: 'failed', message: 'cannot divide by zero' });

  it('shows the message in sentence case with the attempted expression, and resets the calculation', () => {
    expect(failed()).toMatchObject({
      error: 'Cannot divide by zero',
      history: '1 ÷ 0 =',
      pending: null,
      request: null,
      entry: '0',
    });
  });

  it('describes a failed square root', () => {
    const state = reducer(run(...type('4'), { type: 'sign' }, sqrt), { type: 'failed', message: 'x' });
    expect(state.history).toBe('√-4 =');
  });

  it('dismisses the error on the next non-digit key', () => {
    expect(reducer(failed(), op('add'))).toEqual(initialState);
    expect(reducer(failed(), equals)).toEqual(initialState);
  });

  it('starts a fresh number on the next digit or decimal point', () => {
    expect(reducer(failed(), { type: 'digit', digit: '5' })).toMatchObject({ entry: '5', error: null, history: '' });
    expect(reducer(failed(), { type: 'decimal' })).toMatchObject({ entry: '0.', error: null });
  });

  it('ignores a failure when nothing is in flight', () => {
    expect(reducer(initialState, { type: 'failed', message: 'x' })).toBe(initialState);
  });
});

describe('formatNumber', () => {
  it('formats ordinary numbers', () => {
    expect(formatNumber(42)).toBe('42');
    expect(formatNumber(0.5)).toBe('0.5');
  });

  it('normalizes negative zero', () => {
    expect(formatNumber(-0)).toBe('0');
  });

  it('supports scientific notation', () => {
    expect(formatNumber(1e21)).toBe('1e+21');
  });

  it('rejects non-finite values', () => {
    expect(() => formatNumber(Infinity)).toThrow(RangeError);
    expect(() => formatNumber(NaN)).toThrow(RangeError);
  });
});