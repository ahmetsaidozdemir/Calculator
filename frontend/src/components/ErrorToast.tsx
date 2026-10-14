import type { CalculatorError } from '../utils/calculatorReducer';

const TITLES: Record<CalculatorError['kind'], string> = {
  calculation: 'Invalid calculation',
  system: 'Service problem',
};

interface ErrorToastProps {
  error: CalculatorError;
  onDismiss: () => void;
}

/**
 * Explains a failure outside the calculator, so long messages never have to fit on the display.
 * It is not a modal: it does not take focus or block the keypad, and the next key press clears it.
 */
export function ErrorToast({ error, onDismiss }: ErrorToastProps) {
  return (
    <div className={`toast toast-${error.kind}`} role="alert">
      <div className="toast-body">
        <strong className="toast-title">{TITLES[error.kind]}</strong>
        <span className="toast-message">{error.message}</span>
      </div>
      <button type="button" className="toast-close" aria-label="Dismiss error" onClick={onDismiss}>
        ×
      </button>
    </div>
  );
}
