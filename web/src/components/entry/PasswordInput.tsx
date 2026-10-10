import { useState, type ChangeEventHandler, type FocusEventHandler, type KeyboardEvent, type Ref } from "react";

interface PasswordInputProps {
  id: string;
  value: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
  onBlur?: FocusEventHandler<HTMLInputElement>;
  autoComplete: "current-password" | "new-password";
  inputRef?: Ref<HTMLInputElement>;
  invalid?: boolean;
  describedBy?: string;
  warnCapsLock?: boolean;
}

export default function PasswordInput({
  id,
  value,
  onChange,
  onBlur,
  autoComplete,
  inputRef,
  invalid,
  describedBy,
  warnCapsLock,
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);

  const trackCapsLock = (event: KeyboardEvent<HTMLInputElement>) => {
    if (warnCapsLock) setCapsLock(event.getModifierState("CapsLock"));
  };

  return (
    <>
      <div className="relative">
        <input
          id={id}
          ref={inputRef}
          type={visible ? "text" : "password"}
          value={value}
          onChange={onChange}
          onBlur={(event) => {
            setCapsLock(false);
            onBlur?.(event);
          }}
          onKeyUp={trackCapsLock}
          onKeyDown={trackCapsLock}
          autoComplete={autoComplete}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className="h-11 w-full rounded-lg border border-line-strong bg-bg pl-3 pr-16 font-mono text-sm outline-none transition-colors focus:border-accent aria-[invalid=true]:border-down"
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 inline-flex w-16 items-center justify-center font-mono text-[11px] uppercase tracking-[0.14em] text-muted transition-colors hover:text-text"
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
      {capsLock && <p className="text-xs text-warn">Caps Lock is on</p>}
    </>
  );
}
