import { useState } from "react";
import { downloadTeamDataset } from "@/lib/download";

interface DownloadButtonProps {
  label: string;
  disabled?: boolean;
  onDownloaded?: (filename: string) => void;
  onAttempted?: () => void;
}

type State = { kind: "idle" } | { kind: "loading" } | { kind: "done"; filename: string } | { kind: "error"; message: string };

export default function DownloadButton({ label, disabled, onDownloaded, onAttempted }: DownloadButtonProps) {
  const [state, setState] = useState<State>({ kind: "idle" });

  const handleClick = async () => {
    setState({ kind: "loading" });
    try {
      const filename = await downloadTeamDataset();
      setState({ kind: "done", filename });
      onDownloaded?.(filename);
    } catch (error) {
      setState({ kind: "error", message: error instanceof Error ? error.message : "Download failed." });
    } finally {
      onAttempted?.();
    }
  };

  const base = "bg-text text-bg hover:bg-text/90 disabled:bg-line-strong disabled:text-faint";

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || state.kind === "loading"}
        className={`inline-flex h-11 items-center justify-center gap-2 px-5 text-sm font-semibold transition-colors disabled:cursor-not-allowed ${base}`}
      >
        {state.kind === "loading" ? (
          <>
            <span className="h-4 w-4 animate-spin round border-2 border-current border-t-transparent" />
            Preparing download...
          </>
        ) : (
          <>
            <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M10 3v10m0 0 4-4m-4 4-4-4M4 16h12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {label}
          </>
        )}
      </button>
      <p aria-live="polite" className="min-h-4 text-xs">
        {state.kind === "done" && <span className="text-up">Downloaded {state.filename}</span>}
        {state.kind === "error" && <span className="text-down">{state.message}</span>}
      </p>
    </div>
  );
}
