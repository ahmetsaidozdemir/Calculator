import { useId } from 'react';

interface ModeSwitchProps {
  /** Complex mode (operator precedence) is on. */
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}

/**
 * A real switch (role="switch") that toggles between the two evaluation modes.
 * Space toggles it when focused; Enter is always "equals", like everywhere else.
 */
export function ModeSwitch({ checked, disabled, onChange }: ModeSwitchProps) {
  const helpId = useId();
  const help = checked
    ? 'Operator precedence is on: 2 + 3 × 4 gives 14.'
    : 'Operator precedence is off: operations run left to right, so 2 + 3 × 4 gives 20.';

  return (
    <>
      <button
        type="button"
        role="switch"
        className="mode-switch"
        aria-checked={checked}
        aria-describedby={helpId}
        title={help}
        disabled={disabled}
        onClick={() => onChange(!checked)}
      >
        <span className="mode-track" aria-hidden="true">
          <span className="mode-thumb" />
        </span>
        Complex mode
      </button>
      <span id={helpId} className="visually-hidden">
        {help}
      </span>
    </>
  );
}
