import { useEffect, useRef, type ReactNode } from "react";

interface ConfirmDialogProps {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  tone?: "danger" | "default";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  title,
  children,
  confirmLabel,
  tone = "default",
  busy,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onCancel}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onClick={(event) => event.stopPropagation()}
        className="crash-in w-full max-w-md rounded-lg border border-line-strong bg-panel p-6"
      >
        <h2 id="confirm-title" className={`text-lg font-semibold ${tone === "danger" ? "text-down" : ""}`}>
          {title}
        </h2>
        <div className="mt-2 text-sm leading-relaxed text-muted">{children}</div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="h-10 rounded-lg border border-line-strong px-4 text-sm text-muted transition-colors hover:text-text"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`h-10 rounded-lg px-4 text-sm font-semibold transition-colors disabled:opacity-60 ${
              tone === "danger" ? "bg-down text-white hover:bg-down/90" : "bg-text text-bg hover:bg-text/90"
            }`}
          >
            {busy ? "Working..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
