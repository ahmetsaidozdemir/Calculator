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

/** Clicks keys by accessible name: digits by their face, others by label. */
async function tap(user: User, ...names: string[]) {
  for (const name of names) await user.click(key(name));
}

describe('Calculator (mouse and touch)', () => {
  it('shows the display and a keypad of symbol keys from the start', () => {
    render(<Calculator />);

    expect(display()).toHaveTextContent('0');
    expect(key('Divide')).toHaveTextContent('÷');
    expect(key('Multiply')).toHaveTextContent('×');
    expect(key('Subtract')).toHaveTextContent('−');
    expect(key('Add')).toHaveTextContent('+');
    expect(key('Square root')).toHaveTextContent('√');
    expect(key('Power')).toHaveTextContent('^');
    expect(key('Percent of')).toHaveTextContent('%');
    expect(key('Equals')).toHaveTextContent('=');
  });

  it('types numbers on the display, including decimals, sign and backspace', async () => {
    const user = userEvent.setup();
    render(<Calculator />);

    await tap(user, '1', '2', 'Decimal point', '5');
    expect(display()).toHaveTextContent('12.5');

    await tap(user, 'Change sign');
    expect(display()).toHaveTextContent('-12.5');

    await tap(user, 'Backspace', 'Backspace');
    expect(display()).toHaveTextContent('-12');

    await tap(user, 'Clear');
    expect(display()).toHaveTextContent('0');
  });

  it('divides: calls the API and shows the expression with its result', async () => {
    const user = userEvent.setup();
    calculateMock.mockResolvedValue(3.5);
    render(<Calculator />);

    await tap(user, '7', 'Divide', '2', 'Equals');

    expect(calculateMock).toHaveBeenCalledWith('divide', [7, 2], expect.any(AbortSignal));
    await waitFor(() => expect(display()).toHaveTextContent('7 ÷ 2 = 3.5'));
  });

  it('chains operations, evaluating the first when the next operator is pressed', async () => {
    const user = userEvent.setup();
    calculateMock.mockResolvedValueOnce(5).mockResolvedValueOnce(20);
    render(<Calculator />);

    await tap(user, '2', 'Add', '3', 'Multiply');
    expect(calculateMock).toHaveBeenNthCalledWith(1, 'add', [2, 3], expect.any(AbortSignal));
    await waitFor(() => expect(display()).toHaveTextContent('5 × 5'));

    await tap(user, '4', 'Equals');
    expect(calculateMock).toHaveBeenNthCalledWith(2, 'multiply', [5, 4], expect.any(AbortSignal));
    await waitFor(() => expect(display()).toHaveTextContent('5 × 4 = 20'));
  });

  it('takes a square root of the displayed number', async () => {
    const user = userEvent.setup();
    calculateMock.mockResolvedValue(3);
    render(<Calculator />);

    await tap(user, '9', 'Square root');

    expect(calculateMock).toHaveBeenCalledWith('sqrt', [9], expect.any(AbortSignal));
    await waitFor(() => expect(display()).toHaveTextContent('√9 = 3'));
  });

  it('computes a percentage of a number', async () => {
    const user = userEvent.setup();
    calculateMock.mockResolvedValue(30);
    render(<Calculator />);

    await tap(user, '1', '5', 'Percent of', '2', '0', '0', 'Equals');

    expect(calculateMock).toHaveBeenCalledWith('percent', [15, 200], expect.any(AbortSignal));
    await waitFor(() => expect(display()).toHaveTextContent('15% of 200 = 30'));
  });

  it('shows the server error inside the display, then recovers on the next digit', async () => {
    const user = userEvent.setup();
    calculateMock.mockRejectedValue(new ApiError('division_by_zero', 'cannot divide by zero', 422));
    render(<Calculator />);

    await tap(user, '1', 'Divide', '0', 'Equals');

    await waitFor(() => expect(display()).toHaveTextContent('1 ÷ 0 = Cannot divide by zero'));
    expect(display().querySelector('.entry')).toHaveClass('error');

    await tap(user, '5');
    expect(display()).toHaveTextContent('5');
    expect(display()).not.toHaveTextContent('Cannot');
  });

  it('hides unexpected error details behind a generic message', async () => {
    const user = userEvent.setup();
    calculateMock.mockRejectedValue(new Error('boom: stack trace'));
    render(<Calculator />);

    await tap(user, '1', 'Add', '2', 'Equals');

    await waitFor(() => expect(display()).toHaveTextContent(/something went wrong/i));
    expect(display()).not.toHaveTextContent('boom');
  });

  it('marks the display busy and ignores keys while a calculation is in flight', async () => {
    const user = userEvent.setup();
    let resolve!: (value: number) => void;
    calculateMock.mockReturnValue(new Promise<number>((r) => (resolve = r)));
    render(<Calculator />);

    await tap(user, '1', 'Add', '2', 'Equals');
    expect(display()).toHaveAttribute('aria-busy', 'true');

    await tap(user, '9');
    expect(display()).not.toHaveTextContent('9');

    resolve(3);
    await waitFor(() => expect(display()).toHaveAttribute('aria-busy', 'false'));
    expect(display()).toHaveTextContent('1 + 2 = 3');
  });

  it('aborts the in-flight request when unmounted, without updating state afterwards', async () => {
    const user = userEvent.setup();
    let signal!: AbortSignal;
    calculateMock.mockImplementation((_op, _operands, s) => {
      signal = s!;
      return new Promise<number>(() => {});
    });
    const { unmount } = render(<Calculator />);

    await tap(user, '1', 'Add', '2', 'Equals');
    expect(signal.aborted).toBe(false);

    unmount();

    expect(signal.aborted).toBe(true);
  });

  it.each([
    ['result', (settle: { resolve: (v: number) => void; reject: (e: unknown) => void }) => settle.resolve(3)],
    ['failure', (settle: { resolve: (v: number) => void; reject: (e: unknown) => void }) =>
      settle.reject(new ApiError('aborted', 'the request was cancelled'))],
  ])('ignores a late %s from a request aborted by unmounting', async (_name, settleLate) => {
    const user = userEvent.setup();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const settle = {} as { resolve: (v: number) => void; reject: (e: unknown) => void };
    calculateMock.mockReturnValue(
      new Promise<number>((resolve, reject) => {
        settle.resolve = resolve;
        settle.reject = reject;
      }),
    );
    const { unmount } = render(<Calculator />);

    await tap(user, '1', 'Add', '2', 'Equals');
    unmount();
    settleLate(settle);
    await new Promise((r) => setTimeout(r, 0));

    expect(calculateMock).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('shows which operator is waiting for its second operand', async () => {
    const user = userEvent.setup();
    render(<Calculator />);

    expect(key('Add')).toHaveAttribute('aria-pressed', 'false');

    await tap(user, '1', 'Add');
    expect(key('Add')).toHaveAttribute('aria-pressed', 'true');
    expect(key('Subtract')).toHaveAttribute('aria-pressed', 'false');

    await tap(user, '2');
    expect(key('Add')).toHaveAttribute('aria-pressed', 'false');
  });

  it('shrinks the display font for long numbers', async () => {
    const user = userEvent.setup();
    render(<Calculator />);
    const entry = () => display().querySelector('.entry');

    expect(entry()).toHaveClass('large');
    await tap(user, ...'1234567890'.split(''));
    expect(entry()).toHaveClass('medium');
    await tap(user, '1', '2', '3', '4');
    expect(entry()).toHaveClass('small');
  });
});

describe('Calculator (physical keyboard)', () => {
  it('types and calculates with the keyboard', async () => {
    const user = userEvent.setup();
    calculateMock.mockResolvedValue(17);
    render(<Calculator />);

    await user.keyboard('12+5{Enter}');

    expect(calculateMock).toHaveBeenCalledWith('add', [12, 5], expect.any(AbortSignal));
    await waitFor(() => expect(display()).toHaveTextContent('12 + 5 = 17'));
  });

  it('maps *, /, - and = to the matching operations', async () => {
    const user = userEvent.setup();
    calculateMock.mockResolvedValue(0);
    render(<Calculator />);

    for (const [typed, operation] of [
      ['*', 'multiply'],
      ['/', 'divide'],
      ['-', 'subtract'],
    ] as const) {
      await user.keyboard(`6${typed}3=`);
      await waitFor(() => expect(calculateMock).toHaveBeenLastCalledWith(operation, [6, 3], expect.any(AbortSignal)));
    }
  });

  it('accepts a comma as the decimal separator', async () => {
    const user = userEvent.setup();
    render(<Calculator />);

    await user.keyboard('1,5');

    expect(display()).toHaveTextContent('1.5');
  });

  it('supports Backspace and Escape', async () => {
    const user = userEvent.setup();
    render(<Calculator />);

    await user.keyboard('123{Backspace}');
    expect(display()).toHaveTextContent('12');

    await user.keyboard('{Escape}');
    expect(display()).toHaveTextContent('0');
  });

  it('does not re-press the focused on-screen key when Enter is hit', async () => {
    const user = userEvent.setup();
    calculateMock.mockResolvedValue(7);
    render(<Calculator />);

    await tap(user, '3', 'Add', '4'); // focus is now on the "4" key
    await user.keyboard('{Enter}');

    expect(calculateMock).toHaveBeenCalledTimes(1);
    expect(calculateMock).toHaveBeenCalledWith('add', [3, 4], expect.any(AbortSignal));
    await waitFor(() => expect(display()).toHaveTextContent('3 + 4 = 7'));
  });

  it('leaves browser shortcuts and unmapped keys alone', async () => {
    const user = userEvent.setup();
    render(<Calculator />);

    await user.keyboard('5');
    await user.keyboard('{Control>}c{/Control}');
    await user.keyboard('q');

    expect(display()).toHaveTextContent('5');
  });

  it('stops listening to the keyboard when unmounted', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Calculator />);
    unmount();

    await user.keyboard('5');

    expect(calculateMock).not.toHaveBeenCalled();
  });
});