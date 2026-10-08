import { describe, expect, it } from 'vitest';
import { actionForKey, KEYS } from './keys';

describe('KEYS', () => {
  it('has the ten digits', () => {
    const digits = KEYS.filter((k) => k.action.type === 'digit').map((k) => k.face);
    expect(digits.sort()).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
  });

  it('gives every non-digit key an accessible label, since faces are symbols', () => {
    for (const key of KEYS.filter((k) => k.action.type !== 'digit')) {
      expect(key.label, key.face).toBeTruthy();
    }
  });

  it('has unique faces and unique keyboard shortcuts', () => {
    const faces = KEYS.map((k) => k.face);
    const shortcuts = KEYS.flatMap((k) => k.shortcuts);
    expect(new Set(faces).size).toBe(faces.length);
    expect(new Set(shortcuts).size).toBe(shortcuts.length);
  });

  it('fills a 4-column grid exactly (the wide key spans 3)', () => {
    const cells = KEYS.reduce((sum, k) => sum + (k.wide ? 3 : 1), 0);
    expect(cells % 4).toBe(0);
  });
});

describe('actionForKey', () => {
  it.each([
    ['7', { type: 'digit', digit: '7' }],
    ['+', { type: 'operator', operator: 'add' }],
    ['-', { type: 'operator', operator: 'subtract' }],
    ['*', { type: 'operator', operator: 'multiply' }],
    ['/', { type: 'operator', operator: 'divide' }],
    ['^', { type: 'operator', operator: 'power' }],
    ['%', { type: 'operator', operator: 'percent' }],
    ['Enter', { type: 'equals' }],
    ['=', { type: 'equals' }],
    ['Backspace', { type: 'backspace' }],
    ['Escape', { type: 'clear' }],
    ['.', { type: 'decimal' }],
    [',', { type: 'decimal' }],
    ['r', { type: 'sqrt' }],
  ])('maps %j', (key, action) => {
    expect(actionForKey(key)).toEqual(action);
  });

  it('returns undefined for unmapped keys', () => {
    expect(actionForKey('q')).toBeUndefined();
    expect(actionForKey('Tab')).toBeUndefined();
  });
});
