import { useEffect } from 'react';
import { actionForKey, KEYS } from '../utils/keys';
import { useCalculator } from '../hooks/useCalculator';
import { ErrorToast } from './ErrorToast';

export function Calculator() {
  const { state, dispatch } = useCalculator();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // Keys pressed on the error pop-up (e.g. Enter on its close button) belong to the pop-up.
      if (event.target instanceof Element && event.target.closest('.toast')) return;
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

  // Only a calculation error replaces the number; after a service failure the numbers stay readable.
  const showsError = state.error?.kind === 'calculation';
  const text = showsError ? 'Error' : state.entry;
  const size = showsError ? 'error' : text.length > 13 ? 'small' : text.length > 9 ? 'medium' : 'large';
  const activeOperator = state.awaiting ? state.pending?.operator : undefined;

  return (
    <>
      {state.error?.toastVisible && (
        <ErrorToast error={state.error} onDismiss={() => dispatch({ type: 'dismissToast' })} />
      )}
      <div className="calculator">
        <div
          className={`display${state.error ? ' display-error' : ''}`}
          role="status"
          aria-busy={state.request !== null}
        >
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
    </>
  );
}
