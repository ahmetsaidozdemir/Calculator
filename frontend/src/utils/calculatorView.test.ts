import { describe, expect, it } from 'vitest';
import { expressionView, simpleView } from './calculatorView';
import { initialState, reducer, type Action } from './calculatorReducer';
import { expressionReducer, initialExpressionState } from './expressionReducer';

const add: Action = { type: 'operator', operator: 'add' };
const digit = (d: string): Action => ({ type: 'digit', digit: d });

describe('simpleView', () => {
  it('describes the starting state', () => {
    expect(simpleView(initialState)).toEqual({
      entry: '0',
      history: '',
      error: null,
      busy: false,
      awaiting: false,
      activeOperator: undefined,
    });
  });

  it('marks the operator that is waiting for its operand', () => {
    const state = [digit('1'), add].reduce(reducer, initialState);

    expect(simpleView(state)).toMatchObject({ awaiting: true, activeOperator: 'add', history: '1 +' });
  });

  it('is busy while a calculation is in flight', () => {
    const state = [digit('1'), add, digit('2'), { type: 'equals' } as const].reduce(reducer, initialState);

    expect(simpleView(state).busy).toBe(true);
  });
});

describe('expressionView', () => {
  it('describes the starting state', () => {
    expect(expressionView(initialExpressionState)).toEqual({
      entry: '0',
      history: '',
      error: null,
      busy: false,
      awaiting: false,
      activeOperator: undefined,
    });
  });

  it('marks the last operator as the one waiting for its operand', () => {
    const state = [digit('1'), add, digit('2'), { type: 'operator', operator: 'multiply' } as const].reduce(
      expressionReducer,
      initialExpressionState,
    );

    expect(expressionView(state)).toMatchObject({ awaiting: true, activeOperator: 'multiply', history: '1 + 2 ×' });
  });

  it('has no active operator once the next operand is typed', () => {
    const state = [digit('1'), add, digit('2')].reduce(expressionReducer, initialExpressionState);

    expect(expressionView(state)).toMatchObject({ awaiting: false, activeOperator: undefined });
  });

  it('is busy while a calculation is in flight', () => {
    const state = [digit('1'), add, digit('2'), { type: 'equals' } as const].reduce(expressionReducer, initialExpressionState);

    expect(expressionView(state).busy).toBe(true);
  });
});
