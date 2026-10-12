interface SwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
}

export default function Switch({ checked, onChange, disabled, label }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-10 w-[76px] shrink-0 items-center border transition-colors duration-300 disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? "border-down bg-down" : "border-line-strong bg-panel-2"
      }`}
    >
      <span
        className={`absolute top-1/2 h-8 w-8 -translate-y-1/2 bg-white transition-[left] duration-300 ease-[cubic-bezier(0.3,1.4,0.5,1)] ${
          checked ? "left-[39px]" : "left-[3px]"
        }`}
      />
    </button>
  );
}
