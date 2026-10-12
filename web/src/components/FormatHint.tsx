import { getCsvFormat } from "@/lib/config";
import type { SubmissionType } from "@/lib/types";

export default function FormatHint({ type, round }: { type: SubmissionType; round?: string }) {
  const format = getCsvFormat(type, round);
  return (
    <div className="flex flex-col gap-3">
      <pre className="overflow-x-auto rounded-lg border border-line bg-bg p-3 font-mono text-xs leading-relaxed">
        <span className="text-accent">{format.header}</span>
        {"\n"}
        <span className="text-muted">{format.example.join("\n")}</span>
        {"\n"}
        <span className="text-faint">...</span>
      </pre>
      <ul className="flex flex-col gap-1 text-xs text-muted">
        {format.notes.map((note) => (
          <li key={note} className="flex gap-2">
            <span className="text-faint">-</span>
            {note}
          </li>
        ))}
      </ul>
    </div>
  );
}
