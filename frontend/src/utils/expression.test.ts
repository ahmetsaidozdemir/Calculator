import { describe, expect, it } from 'vitest';
import { formatTokens, toPostfix, type Token } from './expression';
import { OPERATIONS, type BinaryOperationId } from './operations';

/** t(2, 'add', 3) -> number, operator, number tokens. */
const t = (...parts: (number | BinaryOperationId)[]): Token[] =>
  parts.map((part) => (typeof part === 'number' ? { kind: 'number', value: part } : { kind: 'operator', operator: part }));

/** Postfix as readable text, e.g. "2 3 4 × +". */
const show = (tokens: readonly Token[]) =>
  tokens.map((x) => (x.kind === 'number' ? String(x.value) : OPERATIONS[x.operator].symbol)).join(' ');

describe('toPostfix', () => {
  it('leaves a single number alone', () => {
    expect(show(toPostfix(t(7)))).toBe('7');
  });

  it('keeps left-to-right order when precedence does not matter', () => {
    expect(show(toPostfix(t(1, 'add', 2)))).toBe('1 2 +');
    expect(show(toPostfix(t(2, 'multiply', 3, 'add', 4)))).toBe('2 3 × 4 +');
  });

  it('runs × before a + that precedes it: 2 + 3 × 4', () => {
    expect(show(toPostfix(t(2, 'add', 3, 'multiply', 4)))).toBe('2 3 4 × +');
  });

  it('runs ÷ before −: 10 − 4 ÷ 2', () => {
    expect(show(toPostfix(t(10, 'subtract', 4, 'divide', 2)))).toBe('10 4 2 ÷ −');
  });

  it('groups operators of equal precedence from the left', () => {
    expect(show(toPostfix(t(10, 'subtract', 2, 'subtract', 3)))).toBe('10 2 − 3 −');
    expect(show(toPostfix(t(8, 'divide', 2, 'divide', 2)))).toBe('8 2 ÷ 2 ÷');
    expect(show(toPostfix(t(8, 'divide', 2, 'multiply', 3)))).toBe('8 2 ÷ 3 ×');
  });

  it('groups ^ from the right: 2 ^ 3 ^ 2 is 2 ^ (3 ^ 2)', () => {
    expect(show(toPostfix(t(2, 'power', 3, 'power', 2)))).toBe('2 3 2 ^ ^');
  });

  it('binds ^ tighter than × and ÷, on either side', () => {
    expect(show(toPostfix(t(2, 'multiply', 3, 'power', 2)))).toBe('2 3 2 ^ ×');
    expect(show(toPostfix(t(2, 'power', 3, 'multiply', 2)))).toBe('2 3 ^ 2 ×');
  });

  it('treats % like × and ÷', () => {
    expect(show(toPostfix(t(2, 'add', 10, 'percent', 50)))).toBe('2 10 50 % +');
    expect(show(toPostfix(t(2, 'multiply', 10, 'percent', 50)))).toBe('2 10 × 50 %');
  });

  it('handles a longer mixed expression: 1 + 2 × 3 ^ 2 − 4', () => {
    expect(show(toPostfix(t(1, 'add', 2, 'multiply', 3, 'power', 2, 'subtract', 4)))).toBe('1 2 3 2 ^ × + 4 −');
  });

  it('does not modify its input', () => {
    const tokens = t(2, 'add', 3, 'multiply', 4);
    const copy = structuredClone(tokens);
    toPostfix(tokens);
    expect(tokens).toEqual(copy);
  });
});

describe('formatTokens', () => {
  it('writes numbers and operator symbols separated by spaces', () => {
    expect(formatTokens(t(2, 'add', 3, 'multiply', 4))).toBe('2 + 3 × 4');
  });

  it('shows a trailing operator while waiting for its operand', () => {
    expect(formatTokens(t(2, 'add', 3, 'multiply'))).toBe('2 + 3 ×');
  });

  it('reads % as "% of", like the single-operation display', () => {
    expect(formatTokens(t(15, 'percent'))).toBe('15% of');
    expect(formatTokens(t(15, 'percent', 200))).toBe('15% of 200');
    expect(formatTokens(t(1, 'add', 15, 'percent', 200))).toBe('1 + 15% of 200');
  });

  it('is empty for no tokens', () => {
    expect(formatTokens([])).toBe('');
  });
});
