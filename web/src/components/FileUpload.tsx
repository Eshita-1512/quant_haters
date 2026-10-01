import { useRef, useState, type DragEvent } from "react";
import { api } from "@/lib/api";
import { config } from "@/lib/config";
import { formatBytes, formatScore } from "@/lib/format";
import type { UploadSuccess } from "@/lib/types";

interface FileUploadProps {
  disabledReason: string | null;
  onScored?: (result: UploadSuccess, filename: string) => void;
  onFileChange?: (file: File | null) => void;
  submitLabel?: string;
  variant?: "default" | "alpha";
}

type UploadState =
  | { kind: "idle" }
  | { kind: "uploading" }
  | { kind: "success"; result: UploadSuccess }
  | { kind: "error"; message: string };

function checkFile(file: File): string | null {
  if (!file.name.toLowerCase().endsWith(".csv")) return "Only .csv files are accepted.";
  if (file.size === 0) return "This file is empty.";
  if (file.size > config.maxUploadBytes) {
    return `File is ${formatBytes(file.size)}. The limit is ${formatBytes(config.maxUploadBytes)}.`;
  }
  return null;
}

export default function FileUpload({
  disabledReason,
  onScored,
  onFileChange,
  submitLabel = "Submit predictions",
  variant = "default",
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [state, setState] = useState<UploadState>({ kind: "idle" });

  const disabled = disabledReason !== null;
  const uploading = state.kind === "uploading";

  const choose = (next: File | undefined | null) => {
    if (!next) return;
    const problem = checkFile(next);
    if (problem) {
      setFile(null);
      onFileChange?.(null);
      setState({ kind: "error", message: problem });
      return;
    }
    setFile(next);
    onFileChange?.(next);
    setState({ kind: "idle" });
  };

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    if (disabled || uploading) return;
    choose(event.dataTransfer.files?.[0]);
  };

  const clear = () => {
    setFile(null);
    onFileChange?.(null);
    setState({ kind: "idle" });
    if (inputRef.current) inputRef.current.value = "";
  };

  const submit = async () => {
    if (!file || disabled) return;
    setState({ kind: "uploading" });
    try {
      const result = await api.upload(file);
      setState({ kind: "success", result });
      onScored?.(result, file.name);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
    } catch (error) {
      setState({ kind: "error", message: error instanceof Error ? error.message : "Upload failed." });
    }
  };

  const zoneTone = disabled
    ? "border-line bg-panel/40 opacity-60 cursor-not-allowed"
    : dragging
      ? "border-accent bg-accent/5"
      : "border-line-strong hover:border-muted cursor-pointer";

  return (
    <div className="flex flex-col gap-4">
      <label
        htmlFor="prediction-upload"
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled && !uploading) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex min-h-40 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors ${zoneTone}`}
      >
        <input
          ref={inputRef}
          id="prediction-upload"
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          disabled={disabled || uploading}
          onChange={(event) => choose(event.target.files?.[0])}
        />
        <svg aria-hidden viewBox="0 0 24 24" className="h-7 w-7 text-muted" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M12 16V4m0 0-4.5 4.5M12 4l4.5 4.5M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {disabled ? (
          <p className="text-sm text-muted">{disabledReason}</p>
        ) : file ? (
          <p className="text-sm">
            <span className="font-mono text-text">{file.name}</span>
            <span className="ml-2 text-muted">{formatBytes(file.size)}</span>
          </p>
        ) : (
          <>
            <p className="text-sm text-text">
              Drop your CSV here or <span className="text-accent underline underline-offset-4">browse</span>
            </p>
            <p className="text-xs text-muted">.csv only, up to {formatBytes(config.maxUploadBytes)}</p>
          </>
        )}
      </label>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={!file || disabled || uploading}
          className={`inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:bg-none disabled:bg-line-strong disabled:text-faint ${
            variant === "alpha"
              ? "bg-gradient-to-r from-alpha to-alpha-2 text-[#07061a] hover:brightness-110"
              : "bg-up text-bg hover:bg-up/90"
          }`}
        >
          {uploading ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Uploading and scoring...
            </>
          ) : (
            submitLabel
          )}
        </button>
        {file && !uploading && (
          <button
            type="button"
            onClick={clear}
            className="h-11 rounded-lg border border-line-strong px-4 text-sm text-muted transition-colors hover:text-text"
          >
            Clear
          </button>
        )}
      </div>

      <div aria-live="polite">
        {state.kind === "success" && (
          <div className="rounded-lg border border-up/40 bg-up-soft p-4">
            <div className="flex items-baseline justify-between gap-4">
              <p className="text-sm font-semibold text-up">{state.result.message || "Scored!"}</p>
              <p className="tabular font-mono text-2xl font-semibold text-up">{formatScore(state.result.score)}</p>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs text-muted sm:grid-cols-4">
              {state.result.balanced_accuracy !== undefined && (
                <div>
                  <dt>Bal. accuracy</dt>
                  <dd className="tabular text-text">{formatScore(state.result.balanced_accuracy)}</dd>
                </div>
              )}
              {state.result.mcc !== undefined && (
                <div>
                  <dt>MCC</dt>
                  <dd className="tabular text-text">{formatScore(state.result.mcc)}</dd>
                </div>
              )}
              {state.result.submission_number !== undefined && (
                <div>
                  <dt>Submission</dt>
                  <dd className="tabular text-text">#{state.result.submission_number}</dd>
                </div>
              )}
              {state.result.submissions_remaining !== undefined && (
                <div>
                  <dt>Remaining</dt>
                  <dd className="tabular text-text">{state.result.submissions_remaining}</dd>
                </div>
              )}
            </dl>
          </div>
        )}
        {state.kind === "error" && (
          <div role="alert" className="rounded-lg border border-down/50 bg-down-soft p-4">
            <p className="text-sm font-semibold text-down">Upload rejected</p>
            <p className="mt-1 font-mono text-sm text-text">{state.message}</p>
          </div>
        )}
      </div>
    </div>
  );
}
