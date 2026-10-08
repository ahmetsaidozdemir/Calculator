export type BinaryOperationId = 'add' | 'subtract' | 'multiply' | 'divide' | 'power' | 'percent';
export type OperationId = BinaryOperationId | 'sqrt';

export interface OperationDef {
  symbol: string;
  /**
   * Renders the expression for the display. With only `a` it renders the
   * pending form while waiting for the second operand, e.g. "3 +".
   */
  format: (a: number, b?: number) => string;
}

const infix =
  (symbol: string) =>
  (a: number, b?: number): string =>
    b === undefined ? `${a} ${symbol}` : `${a} ${symbol} ${b}`;

/** Keyed by the operation name the backend API expects. */
export const OPERATIONS: Record<OperationId, OperationDef> = {
  add: { symbol: '+', format: infix('+') },
  subtract: { symbol: '−', format: infix('−') },
  multiply: { symbol: '×', format: infix('×') },
  divide: { symbol: '÷', format: infix('÷') },
  power: { symbol: '^', format: infix('^') },
  percent: { symbol: '%', format: (a, b) => (b === undefined ? `${a}% of` : `${a}% of ${b}`) },
  sqrt: { symbol: '√', format: (a) => `√${a}` },
};
