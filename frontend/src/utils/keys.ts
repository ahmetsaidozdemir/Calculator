import type { Action } from './calculatorReducer';

export type KeyKind = 'digit' | 'function' | 'operator' | 'clear' | 'equals';

export interface KeyDef {
  /** What is drawn on the key. */
  face: string;
  /** Accessible name and tooltip; omitted when the face already says it (digits). */
  label?: string;
  kind: KeyKind;
  action: Action;
  /** `KeyboardEvent.key` values that press this key. */
  shortcuts: readonly string[];
  /** Spans the keypad's remaining columns. */
  wide?: boolean;
}

const digit = (d: string): KeyDef => ({ face: d, kind: 'digit', action: { type: 'digit', digit: d }, shortcuts: [d] });

/** In keypad order, left to right, top to bottom, on a 4-column grid. */
export const KEYS: readonly KeyDef[] = [
  { face: 'C', label: 'Clear', kind: 'clear', action: { type: 'clear' }, shortcuts: ['Escape', 'Delete', 'c', 'C'] },
  { face: '⌫', label: 'Backspace', kind: 'function', action: { type: 'backspace' }, shortcuts: ['Backspace'] },
  { face: '√', label: 'Square root', kind: 'function', action: { type: 'sqrt' }, shortcuts: ['r', 'R'] },
  { face: '^', label: 'Power', kind: 'operator', action: { type: 'operator', operator: 'power' }, shortcuts: ['^'] },

  digit('7'),
  digit('8'),
  digit('9'),
  { face: '÷', label: 'Divide', kind: 'operator', action: { type: 'operator', operator: 'divide' }, shortcuts: ['/'] },

  digit('4'),
  digit('5'),
  digit('6'),
  { face: '×', label: 'Multiply', kind: 'operator', action: { type: 'operator', operator: 'multiply' }, shortcuts: ['*', 'x', 'X'] },

  digit('1'),
  digit('2'),
  digit('3'),
  { face: '−', label: 'Subtract', kind: 'operator', action: { type: 'operator', operator: 'subtract' }, shortcuts: ['-'] },

  { face: '±', label: 'Change sign', kind: 'function', action: { type: 'sign' }, shortcuts: ['n', 'N'] },
  digit('0'),
  // Comma too, because many keyboard layouts type it as the decimal separator.
  { face: '.', label: 'Decimal point', kind: 'digit', action: { type: 'decimal' }, shortcuts: ['.', ','] },
  { face: '+', label: 'Add', kind: 'operator', action: { type: 'operator', operator: 'add' }, shortcuts: ['+'] },

  { face: '%', label: 'Percent of', kind: 'function', action: { type: 'operator', operator: 'percent' }, shortcuts: ['%'] },
  { face: '=', label: 'Equals', kind: 'equals', action: { type: 'equals' }, shortcuts: ['=', 'Enter'], wide: true },
];

const SHORTCUT_ACTIONS = new Map<string, Action>(KEYS.flatMap((key) => key.shortcuts.map((s) => [s, key.action] as const)));

/** The action for a physical keyboard key, if it is mapped. */
export const actionForKey = (key: string): Action | undefined => SHORTCUT_ACTIONS.get(key);
