/**
 * Rules for editing the number being typed. Both calculator engines use these,
 * so digit entry behaves identically in either mode. Each helper returns the
 * new entry text, or null when the key press changes nothing.
 */

/** Longest operand in digits; matches the backend's 15 significant digits. */
export const MAX_INPUT_DIGITS = 15;

const countDigits = (entry: string) => entry.replace(/[^0-9]/g, '').length;

/** Types a digit; a fresh entry (a result, or the initial 0) is replaced instead of extended. */
export function appendDigit(entry: string, fresh: boolean, digit: string): string | null {
  const next = fresh || entry === '0' ? digit : entry + digit;
  return countDigits(next) > MAX_INPUT_DIGITS ? null : next;
}

/** Types a decimal point, once per number. */
export function appendDecimal(entry: string, fresh: boolean): string | null {
  if (fresh) return '0.';
  return entry.includes('.') ? null : `${entry}.`;
}

/** Flips the sign; zero has no sign to flip. */
export function toggleSign(entry: string): string | null {
  if (Number(entry) === 0) return null;
  return entry.startsWith('-') ? entry.slice(1) : `-${entry}`;
}

/** Removes the last character, falling back to 0. */
export function dropLast(entry: string): string {
  const next = entry.slice(0, -1);
  return next === '' || next === '-' ? '0' : next;
}
