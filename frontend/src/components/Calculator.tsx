import { useEffect, useState } from 'react';
import { actionForKey, KEYS } from '../utils/keys';
import { expressionView, simpleView } from '../utils/calculatorView';
import { useCalculator } from '../hooks/useCalculator';
import { useExpressionCalculator } from '../hooks/useExpressionCalculator';
import { ModeSwitch } from './ModeSwitch';

/**
 * Simple mode runs each operator as it is pressed (2 + 3 × 4 is 20).
 * Complex mode follows operator precedence (2 + 3 × 4 is 14).
 */
export type CalculatorMode = 'simple' | 'complex';

export const DEFAULT_MODE: CalculatorMode = 'simple';

export function Calculator({ initialMode = DEFAULT_MODE }: { initialMode?: CalculatorMode }) {
  const [mode, setMode] = useState<CalculatorMode>(initialMode);
  // Both engines stay mounted so the keypad, display and switch keep their DOM
  // (and keyboard focus) when the mode changes; only the active one is drawn.
  const simple = useCalculator();
  const complex = useExpressionCalculator();

  const isComplex = mode === 'complex';
  const view = isComplex ? expressionView(complex.state) : simpleView(simple.state);
  const { dispatch } = isComplex ? complex : simple;

  function changeMode(nextIsComplex: boolean) {
    // Each engine has its own state; start both from a clean slate.
    simple.dispatch({ type: 'clear' });
    complex.dispatch({ type: 'clear' });
    setMode(nextIsComplex ? 'complex' : 'simple');
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return; // leave browser shortcuts alone
      const action = actionForKey(event.key);
      if (!action) return;
      // Also stops Enter from "clicking" whichever on-screen key was last focused.
      event.preventDefault();
      dispatch(action);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dispatch]);

  const text = view.error ?? view.entry;
  const size = view.error ? 'error' : text.length > 13 ? 'small' : text.length > 9 ? 'medium' : 'large';

  return (
    <div className="calculator">
      <div className="screen">
        <ModeSwitch checked={isComplex} disabled={view.busy} onChange={changeMode} />
        <div className="display" role="status" aria-busy={view.busy}>
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
            aria-pressed={key.action.type === 'operator' ? key.action.operator === view.activeOperator : undefined}
            disabled={view.busy || (key.action.type === 'sqrt' && view.awaiting)}
            onClick={() => dispatch(key.action)}
          >
            {key.face}
          </button>
        ))}
      </div>
    </div>
  );
}
