import type { ReactNode } from "react";

interface PanelProps {
  title?: string;
  aside?: ReactNode;
  className?: string;
  children: ReactNode;
}

export default function Panel({ title, aside, className = "", children }: PanelProps) {
  return (
    <section className={`rounded-xl border border-line bg-panel ${className}`}>
      {(title || aside) && (
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          {title && <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-muted">{title}</h2>}
          {aside}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}
