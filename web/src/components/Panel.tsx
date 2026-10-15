import type { ReactNode } from "react";

interface PanelProps {
  title?: string;
  aside?: ReactNode;
  className?: string;
  telemetryTag?: string;
  children: ReactNode;
}

export default function Panel({
  title,
  aside,
  className = "",
  telemetryTag,
  children,
}: PanelProps) {
  return (
    <section className={`bf-hud-panel rounded-md border border-line bg-panel ${className}`}>
      {(title || aside || telemetryTag) && (
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <div className="flex items-center gap-2">
            {title && (
              <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
                {title}
              </h2>
            )}
            {telemetryTag && (
              <span className="font-mono text-[10px] text-faint">
                {telemetryTag}
              </span>
            )}
          </div>
          {aside}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}
