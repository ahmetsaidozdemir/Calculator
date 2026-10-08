import { describe, expect, it } from 'vitest';
import { OPERATIONS, type OperationId } from './operations';

describe('OPERATIONS', () => {
  it.each<[OperationId, number, number | undefined, string]>([
    ['add', 3, 4, '3 + 4'],
    ['subtract', 3, 4, '3 − 4'],
    ['multiply', 3, 4, '3 × 4'],
    ['divide', 3, 4, '3 ÷ 4'],
    ['power', 2, 10, '2 ^ 10'],
    ['percent', 15, 200, '15% of 200'],
    ['sqrt', 9, undefined, '√9'],
  ])('formats %s(%s, %s) as %j', (id, a, b, expected) => {
    expect(OPERATIONS[id].format(a, b)).toBe(expected);
  });

  it.each<[OperationId, string]>([
    ['add', '3 +'],
    ['divide', '3 ÷'],
    ['percent', '3% of'],
  ])('formats %s while waiting for the second operand', (id, expected) => {
    expect(OPERATIONS[id].format(3)).toBe(expected);
  });
});
