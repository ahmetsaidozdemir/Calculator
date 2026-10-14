import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, calculate } from '../services/api';
import { Calculator } from './Calculator';

// Replace only the network call; keep the real ApiError so instanceof works.
vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return { ...actual, calculate: vi.fn() };
});

const calculateMock = vi.mocked(calculate);

beforeEach(() => {
  calculateMock.mockReset();
});

type User = ReturnType<typeof userEvent.setup>;

const display = () => screen.getByRole('status');
const key = (name: string) => screen.getByRole('button', { name });
const modeSwitch = () => screen.getByRole('switch', { name: 'Complex mode' });

/** Clicks keys by accessible name: digits by their face, others by label. */
async function tap(user: User, ...names: string[]) {
  for (const name of names) await user.click(key(name));
}

describe('the Complex mode switch', () => {
  it('is on by default', () => {
    render(<Calculator />);

    expect(modeSwitch()).toBeChecked();
  });

  it('can start in simple mode', () => {
    render(<Calculator initialMode="simple" />);

    expect(modeSwitch()).not.toBeChecked();
  });

  it('describes what each mode does to screen readers', async () => {
    const user = userEvent.setup();
    render(<Calculator />);

    expect(modeSwitch()).toHaveAccessibleDescription(/precedence is on.*gives 14/i);

    await user.click(modeSwitch());

    expect(modeSwitch()).toHaveAccessibleDescription(/precedence is off.*left to right.*gives 20/i);
  });

  it('is not mistaken for a keypad key', () => {
    render(<Calculator />);

    expect(screen.queryByRole('button', { name: 'Complex mode' })).not.toBeInTheDocument();
  });

  it('starts the other mode from a clean slate', async () => {
    const user = userEvent.setup();
    render(<Calculator />);

    await tap(user, '1', '2', 'Add', '3');
    expect(display()).toHaveTextContent('12 + 3');

    await user.click(modeSwitch());

    expect(display().textContent?.trim()).toBe('0');
    await user.click(modeSwitch());
    expect(display().textContent?.trim()).toBe('0');
  });

  it('is disabled while a calculation is in flight', async () => {
    const user = userEvent.setup();
    let resolve!: (value: number) => void;
    calculateMock.mockReturnValue(new Promise<number>((r) => (resolve = r)));
    render(<Calculator />);

    await tap(user, '1', 'Add', '2', 'Equals');
    expect(modeSwitch()).toBeDisabled();

    resolve(3);
    await waitFor(() => expect(modeSwitch()).toBeEnabled());
    expect(display()).toHaveTextContent('1 + 2 = 3');
  });

  it('toggles with Space, but Enter still means equals', async () => {
    const user = userEvent.setup();
    calculateMock.mockResolvedValue(5);
    render(<Calculator />);

    await user.click(modeSwitch()); // focus the switch (this turns complex mode off)
    expect(modeSwitch()).not.toBeChecked();

    await user.keyboard(' ');
    expect(modeSwitch()).toBeChecked();

    await user.keyboard('2+3{Enter}');
    expect(calculateMock).toHaveBeenCalledWith('add', [2, 3], expect.any(AbortSignal));
    expect(modeSwitch()).toBeChecked();
    await waitFor(() => expect(display()).toHaveTextContent('2 + 3 = 5'));
  });

  it('keeps keyboard typing working after it was clicked', async () => {
    const user = userEvent.setup();
    render(<Calculator />);

    await user.click(modeSwitch());
    await user.keyboard('42');

    expect(display()).toHaveTextContent('42');
  });
});

describe('Calculator, complex mode', () => {
  it('follows operator precedence: 2 + 3 × 4 is 14, in one backend call per operator', async () => {
    const user = userEvent.setup();
    calculateMock.mockResolvedValueOnce(12).mockResolvedValueOnce(14);
    render(<Calculator />);

    await tap(user, '2', 'Add', '3', 'Multiply', '4', 'Equals');

    await waitFor(() => expect(display()).toHaveTextContent('2 + 3 × 4 = 14'));
    expect(calculateMock).toHaveBeenCalledTimes(2);
    expect(calculateMock).toHaveBeenNthCalledWith(1, 'multiply', [3, 4], expect.any(AbortSignal));
    expect(calculateMock).toHaveBeenNthCalledWith(2, 'add', [2, 12], expect.any(AbortSignal));
  });

  it('does not call the backend until = is pressed, and shows the pending expression', async () => {
    const user = userEvent.setup();
    render(<Calculator />);

    await tap(user, '2', 'Add', '3', 'Multiply');

    expect(calculateMock).not.toHaveBeenCalled();
    expect(display()).toHaveTextContent('2 + 3 ×');
    expect(key('Multiply')).toHaveAttribute('aria-pressed', 'true');
    expect(key('Add')).toHaveAttribute('aria-pressed', 'false');
  });

  it('marks the display busy and ignores keys between the steps of one expression', async () => {
    const user = userEvent.setup();
    let resolveFirst!: (value: number) => void;
    calculateMock.mockReturnValueOnce(new Promise<number>((r) => (resolveFirst = r))).mockResolvedValueOnce(14);
    render(<Calculator />);

    await tap(user, '2', 'Add', '3', 'Multiply', '4', 'Equals');
    expect(display()).toHaveAttribute('aria-busy', 'true');
    await tap(user, '9');
    expect(display()).not.toHaveTextContent('9');

    resolveFirst(12);
    await waitFor(() => expect(display()).toHaveAttribute('aria-busy', 'false'));
    expect(display()).toHaveTextContent('2 + 3 × 4 = 14');
  });

  it('shows the error with its expression when a step fails, then recovers on the next digit', async () => {
    const user = userEvent.setup();
    calculateMock.mockRejectedValue(new ApiError('division_by_zero', 'cannot divide by zero', 422));
    render(<Calculator />);

    await tap(user, '2', 'Add', '1', 'Divide', '0', 'Equals');

    await waitFor(() => expect(display()).toHaveTextContent('2 + 1 ÷ 0 = Cannot divide by zero'));
    expect(calculateMock).toHaveBeenCalledTimes(1); // the rest of the expression is abandoned

    await tap(user, '5');
    expect(display()).toHaveTextContent('5');
    expect(display()).not.toHaveTextContent('Cannot');
  });

  it('hides unexpected errors from a later step behind a generic message', async () => {
    const user = userEvent.setup();
    calculateMock.mockResolvedValueOnce(6).mockRejectedValueOnce(new Error('boom: stack trace'));
    render(<Calculator />);

    await tap(user, '2', 'Multiply', '3', 'Add', '4', 'Equals');

    await waitFor(() => expect(display()).toHaveTextContent(/something went wrong/i));
    expect(display()).toHaveTextContent('2 × 3 + 4 =');
    expect(display()).not.toHaveTextContent('boom');
  });

  it('takes a square root inside an expression: 2 + √9', async () => {
    const user = userEvent.setup();
    calculateMock.mockResolvedValueOnce(3).mockResolvedValueOnce(5);
    render(<Calculator />);

    await tap(user, '2', 'Add', '9', 'Square root');
    await waitFor(() => expect(display()).toHaveTextContent('2 + √9'));
    expect(calculateMock).toHaveBeenCalledWith('sqrt', [9], expect.any(AbortSignal));

    await tap(user, 'Equals');
    await waitFor(() => expect(display()).toHaveTextContent('2 + 3 = 5'));
    expect(calculateMock).toHaveBeenLastCalledWith('add', [2, 3], expect.any(AbortSignal));
  });

  it('disables the square-root key while an operator waits for its operand', async () => {
    const user = userEvent.setup();
    render(<Calculator />);

    await tap(user, '2', 'Add');
    expect(key('Square root')).toBeDisabled();

    await tap(user, '3');
    expect(key('Square root')).toBeEnabled();
  });

  it('works from the physical keyboard', async () => {
    const user = userEvent.setup();
    calculateMock.mockResolvedValueOnce(12).mockResolvedValueOnce(14);
    render(<Calculator />);

    await user.keyboard('2+3*4{Enter}');

    await waitFor(() => expect(display()).toHaveTextContent('2 + 3 × 4 = 14'));
  });
});

describe('Calculator, after switching to simple mode', () => {
  it('runs each operator as it is pressed: 2 + 3 × evaluates 2 + 3 straight away', async () => {
    const user = userEvent.setup();
    calculateMock.mockResolvedValueOnce(5).mockResolvedValueOnce(20);
    render(<Calculator />);

    await user.click(modeSwitch());
    await tap(user, '2', 'Add', '3', 'Multiply');
    expect(calculateMock).toHaveBeenNthCalledWith(1, 'add', [2, 3], expect.any(AbortSignal));
    await waitFor(() => expect(display()).toHaveTextContent('5 × 5'));

    await tap(user, '4', 'Equals');
    await waitFor(() => expect(display()).toHaveTextContent('5 × 4 = 20'));
  });

  it('can switch back to complex mode and follow precedence again', async () => {
    const user = userEvent.setup();
    calculateMock.mockResolvedValueOnce(12).mockResolvedValueOnce(14);
    render(<Calculator />);

    await user.click(modeSwitch());
    await user.click(modeSwitch());
    await tap(user, '2', 'Add', '3', 'Multiply', '4', 'Equals');

    await waitFor(() => expect(display()).toHaveTextContent('2 + 3 × 4 = 14'));
  });
});
