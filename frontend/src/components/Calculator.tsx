
import { useEffect, useState } from 'react';
import { actionForKey, KEYS } from '../utils/keys';
import { expressionView, simpleView } from '../utils/calculatorView';
import { useCalculator } from '../hooks/useCalculator';
import { useExpressionCalculator } from '../hooks/useExpressionCalculator';
import { ErrorToast } from './ErrorToast';
import { ModeSwitch } from './ModeSwitch';

/**
 * Simple mode evaluates operators as they are pressed:
 * 2 + 3 × 4 = 20.
 *
 * Complex mode follows operator precedence:
 * 2 + 3 × 4 = 14.
 */
export type CalculatorMode = 'simple' | 'complex';

export const DEFAULT_MODE: CalculatorMode = 'complex';

export function Calculator({
  initialMode = DEFAULT_MODE,
}: {
  initialMode?: CalculatorMode;
}) {
  const [mode, setMode] = useState<CalculatorMode>(initialMode);

  // Keep both engines mounted so changing modes does not replace the
  // calculator's DOM unnecessarily.
  const simple = useCalculator();
  const complex = useExpressionCalculator();

  const isComplex = mode === 'complex';
  const view = isComplex
    ? expressionView(complex.state)
    : simpleView(simple.state);

  const { dispatch } = isComplex ? complex : simple;

  function changeMode(nextIsComplex: boolean) {
    // Each engine has independent state. Start both with a clean slate.
    simple.dispatch({ type: 'clear' });
    complex.dispatch({ type: 'clear' });
    setMode(nextIsComplex ? 'complex' : 'simple');
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // Do not let calculator shortcuts interfere with the error toast.
      if (
        event.target instanceof Element &&
        event.target.closest('.toast')
      ) {
        return;
      }

      // Leave browser and operating-system shortcuts alone.
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      const action = actionForKey(event.key);
      if (!action) return;

      // Prevent Enter from activating the previously focused keypad button.
      event.preventDefault();
      dispatch(action);
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dispatch]);

  const simpleError = !isComplex ? simple.state.error : null;
  const text = view.error ?? view.entry;
  const size = view.error
    ? 'error'
    : text.length > 13
      ? 'small'
      : text.length > 9
        ? 'medium'
        : 'large';

  return (
    <>
      {simpleError?.toastVisible && (
        <ErrorToast
          error={simpleError}
          onDismiss={() => simple.dispatch({ type: 'dismissToast' })}
        />
      )}

      <div className="calculator">
        <div className="screen">
          <ModeSwitch
            checked={isComplex}
            disabled={view.busy}
            onChange={changeMode}
          />

          <div
            className={`display${simpleError ? ' display-error' : view.error ? ' display-error' : ''}`}
            role="status"
            aria-busy={view.busy}
          >
            <span className="history">{view.history}</span>{' '}
            <span className={`entry ${size}`}>{text}</span>
          </div>
        </div>

        <div className="keypad">
          {KEYS.map((key) => (
            <button
              key={key.face}
              type="button"
              className={`key key-${key.kind}${key.wide ? ' key-wide' : ''}`}
              aria-label={key.label}
              title={key.label}
              aria-pressed={
                key.action.type === 'operator'
                  ? key.action.operator === view.activeOperator
                  : undefined
              }
              disabled={
                view.busy ||
                (key.action.type === 'sqrt' && view.awaiting)
              }
              onClick={() => dispatch(key.action)}
            >
              {key.face}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
