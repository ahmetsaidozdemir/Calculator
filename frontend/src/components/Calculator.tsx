import { useEffect } from 'react';
import { actionForKey, KEYS } from '../utils/keys';
import { useCalculator } from '../hooks/useCalculator';

export function Calculator() {
  const { state, dispatch } = useCalculator();

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

  const text = state.error ?? state.entry;
  const size = state.error ? 'error' : text.length > 13 ? 'small' : text.length > 9 ? 'medium' : 'large';
  const activeOperator = state.awaiting ? state.pending?.operator : undefined;

  return (
    <div className="calculator">
      <div className="display" role="status" aria-busy={state.request !== null}>
        <span className="history">{state.history}</span>{' '}
        <span className={`entry ${size}`}>{text}</span>
      </div>

      <div className="keypad">
        {KEYS.map((key) => (
          <button
            key={key.face}
            type="button"
            className={`key key-${key.kind}${key.wide ? ' key-wide' : ''}`}
            aria-label={key.label}
            title={key.label}
            aria-pressed={key.action.type === 'operator' ? key.action.operator === activeOperator : undefined}
            disabled={state.request !== null || (key.action.type === 'sqrt' && state.awaiting)}
            onClick={() => dispatch(key.action)}
          >
            {key.face}
          </button>
        ))}
      </div>
    </div>
  );
}
