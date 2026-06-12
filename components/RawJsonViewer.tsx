"use client";

import { useMemo, useState } from "react";
import { Braces, Check, ChevronDown, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Collapsible raw-JSON viewer. The report page passes the actual model-server
 * response so reviewers can see exactly what the GPU server returned.
 */
export function RawJsonViewer({ title = "Raw model server response", data }: { title?: string; data: unknown }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const serialized = useMemo(() => JSON.stringify(data, null, 2), [data]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(serialized);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <section className="xt-glass rounded-2xl p-5">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex flex-1 items-center justify-between gap-3 text-left"
          aria-expanded={open}
        >
          <span className="flex items-center gap-2 text-lg font-semibold text-text-primary">
            <Braces className="h-5 w-5 text-cyan-signal" aria-hidden="true" />
            {title}
          </span>
          <ChevronDown
            className={cn("h-5 w-5 text-text-secondary transition", open && "rotate-180")}
            aria-hidden="true"
          />
        </button>
        <button
          type="button"
          onClick={copy}
          className="flex items-center gap-1.5 rounded-md border border-border bg-panel-soft px-2.5 py-1.5 text-xs text-text-secondary transition hover:text-text-primary"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-green-verified" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {open ? (
        <pre className="mt-4 max-h-[32rem] overflow-auto rounded-md border border-border bg-background p-4 text-xs leading-6 text-text-secondary">
          {serialized}
        </pre>
      ) : (
        <p className="mt-3 text-xs text-text-secondary">
          Expand to inspect the raw GPU model-server response, sponsor trace, and reasoning payload.
        </p>
      )}
    </section>
  );
}
