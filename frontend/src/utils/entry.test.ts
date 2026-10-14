import { describe, expect, it } from 'vitest';
import { appendDecimal, appendDigit, dropLast, MAX_INPUT_DIGITS, toggleSign } from './entry';

describe('appendDigit', () => {
  it('extends a typed number', () => {
    expect(appendDigit('12', false, '3')).toBe('123');
  });

  it('replaces a fresh entry, such as a result or the initial 0', () => {
    expect(appendDigit('42', true, '7')).toBe('7');
    expect(appendDigit('0', true, '0')).toBe('0');
  });

  it('drops a leading zero', () => {
    expect(appendDigit('0', false, '7')).toBe('7');
  });

  it('refuses a digit past the limit, and does not count the sign or decimal point', () => {
    const full = '1'.repeat(MAX_INPUT_DIGITS);
    expect(appendDigit(full, false, '2')).toBeNull();
    expect(appendDigit(`-${'1'.repeat(MAX_INPUT_DIGITS - 1)}`, false, '2')).toBe(`-${'1'.repeat(MAX_INPUT_DIGITS - 1)}2`);
    expect(appendDigit('1234567890123.4', false, '5')).toBe('1234567890123.45');
  });
});

describe('appendDecimal', () => {
  it('starts from zero on a fresh entry', () => {
    expect(appendDecimal('9', true)).toBe('0.');
  });

  it('adds one point to a typed number', () => {
    expect(appendDecimal('12', false)).toBe('12.');
  });

  it('refuses a second point', () => {
    expect(appendDecimal('1.5', false)).toBeNull();
  });
});

describe('toggleSign', () => {
  it('flips the sign both ways', () => {
    expect(toggleSign('5')).toBe('-5');
    expect(toggleSign('-5')).toBe('5');
  });

  it('leaves zero alone, including a typed "0."', () => {
    expect(toggleSign('0')).toBeNull();
    expect(toggleSign('0.')).toBeNull();
  });
});

describe('dropLast', () => {
  it('removes the last character', () => {
    expect(dropLast('123')).toBe('12');
  });

  it('falls back to 0 instead of an empty or bare-minus entry', () => {
    expect(dropLast('7')).toBe('0');
    expect(dropLast('-5')).toBe('0');
  });
});
